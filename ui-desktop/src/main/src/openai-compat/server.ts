// ============================================================================
// OpenAI-compatible facade — the server.
//
// A loopback HTTP server that lets `opencode`, an OpenAI SDK, or any similar
// tool talk to this app. It is a TRANSLATOR, not a gateway: it resolves the
// model from the request body, attaches the router's Basic credential and the
// routing headers the router actually reads, and streams the response straight
// back. The wire format on both sides is already OpenAI's, so the body is never
// parsed on the response path — bytes in, bytes out.
//
// Admission rules and model resolution live in ./protocol.ts, where they can be
// tested without a socket. This file is the shell: sockets, streaming, and the
// one genuinely dangerous decision — whether a request may open a paid session.
//
// DEFAULT POSTURE: disabled, and spend-inert when enabled. `allowAutoOpen` is
// off unless the operator turns it on, so by default no request arriving here
// can cause a blockchain transaction. That is the real defence: authentication
// cannot stop same-user local malware (it can read whatever holds the token),
// so the port must not have spending authority in the first place.
// ============================================================================

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { randomBytes } from 'crypto';
import {
  admitRequest,
  advertisedId,
  errorBody,
  resolveModel,
  routingHeaders,
  toModelList,
  type UsableModel,
} from './protocol';

export type OpenAiApiConfig = {
  enabled: boolean;
  port: number;
  token: string;
  /** When false the server never opens a session — the safe default. */
  allowAutoOpen: boolean;
  /** Ceiling on MOR staked by any ONE auto-opened session. */
  maxStakeMor: number;
};

export type ExternalActivity = {
  at: number;
  modelId: string;
  modelName: string;
  /** set when this request caused a session to be opened */
  openedSessionId?: string;
  stakedMor?: number;
};

export type ServerDeps = {
  routerUrl: () => string;
  authHeaders: () => Promise<Record<string, string>>;
  walletAddress: () => string | undefined;
  config: () => OpenAiApiConfig;
  /** Surfaced in the UI so a user can see an external tool using their session. */
  onActivity?: (activity: ExternalActivity) => void;
  log?: (message: string) => void;
};

export const DEFAULT_PORT = 8137;
/** Tokens are shown in Settings and pasted into tool configs; keep them short enough to handle. */
export const generateToken = (): string =>
  `mor-sk-${randomBytes(24).toString('hex')}`;

export const defaultConfig = (): OpenAiApiConfig => ({
  enabled: false,
  port: DEFAULT_PORT,
  token: generateToken(),
  allowAutoOpen: false,
  maxStakeMor: 1,
});

// A prompt body is small; anything large is either a mistake or an attempt to
// exhaust memory on a process that also holds a wallet.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    // No CORS headers, deliberately: a browser must not be able to use this
    // endpoint even if the token leaks into a page.
    'cache-control': 'no-store',
  });
  res.end(payload);
};

export class OpenAiCompatServer {
  private server: Server | null = null;
  private deps: ServerDeps;

  constructor(deps: ServerDeps) {
    this.deps = deps;
  }

  isRunning(): boolean {
    return !!this.server?.listening;
  }

  /** Applies the current config: starts, stops, or rebinds as needed. */
  async sync(): Promise<void> {
    const cfg = this.deps.config();
    if (!cfg.enabled) {
      await this.stop();
      return;
    }
    const addr = this.server?.address();
    const boundPort =
      addr && typeof addr === 'object' ? addr.port : undefined;
    if (this.isRunning() && boundPort === cfg.port) {
      return;
    }
    await this.stop();
    await this.start();
  }

  async start(): Promise<void> {
    const cfg = this.deps.config();
    const server = createServer((req, res) => {
      this.handle(req, res).catch((e) => {
        this.deps.log?.(`openai-compat: unhandled ${String(e)}`);
        if (!res.headersSent) {
          sendJson(res, 500, errorBody('Internal error', 'internal_error', 'api_error'));
        } else {
          res.end();
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      // 127.0.0.1 explicitly — never 0.0.0.0. Combined with the Host check in
      // admitRequest, this keeps the port off the network and out of reach of
      // DNS rebinding.
      server.listen(cfg.port, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });

    this.server = server;
    this.deps.log?.(
      `openai-compat: listening on http://127.0.0.1:${cfg.port}/v1`,
    );
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) {
      return;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    this.deps.log?.('openai-compat: stopped');
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const cfg = this.deps.config();
    const admission = admitRequest(
      {
        authorization: req.headers['authorization'] ?? null,
        host: req.headers['host'] ?? null,
        origin: (req.headers['origin'] as string) ?? null,
      },
      cfg.token,
      cfg.port,
    );
    if (!admission.ok) {
      sendJson(
        res,
        admission.status,
        errorBody(admission.message, admission.code, 'invalid_request_error'),
      );
      return;
    }

    const url = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && url === '/v1/models') {
      await this.serveModels(res);
      return;
    }
    if (req.method === 'POST' && url === '/v1/chat/completions') {
      await this.serveChat(req, res);
      return;
    }

    sendJson(
      res,
      404,
      errorBody(
        `Unsupported path ${req.method} ${url}. This endpoint serves /v1/models and /v1/chat/completions.`,
        'not_found',
      ),
    );
  }

  /**
   * Short-lived cache for the usable-model list.
   *
   * Building it costs a `/blockchain/models` read, measured at 5–10 SECONDS
   * against the local router. Without this, every `/v1/models` call from
   * opencode paid that, and the in-app handoff paid it twice (once to resolve
   * the id, once to list models for the config) — which blew the 10s IPC
   * timeout and made the button look broken while the terminal opened anyway.
   *
   * 30 seconds: long enough to collapse the burst of calls a client makes at
   * startup, short enough that a session opened a moment ago shows up. Callers
   * that MUST see a just-opened session pass force.
   */
  private modelsCache: { at: number; models: UsableModel[] } | null = null;
  private static readonly MODELS_TTL_MS = 30_000;

  /**
   * Resolve an identifier and return the advertised list in ONE pass.
   *
   * Exists so the handoff cannot re-fetch: it needs both the resolved id and
   * the model list, and asking for them separately doubled the slowest call in
   * the app.
   */
  async resolveForHandoff(requested: string): Promise<{
    advertised: string | null;
    models: { id: string; label: string }[];
  }> {
    // Forced: this runs immediately after a session opens, so a cached list
    // from before that would not contain it.
    const models = await this.usableModels(true);
    const resolution = resolveModel(requested, models);
    return {
      advertised: resolution.ok
        ? advertisedId(resolution.model, models)
        : null,
      models: this.labelled(models),
    };
  }

  private labelled(models: UsableModel[]): { id: string; label: string }[] {
    return toModelList(models, Math.floor(Date.now() / 1000)).data.map(
      (entry) => ({
        id: entry.id,
        label:
          entry.owned_by === 'morpheus-local'
            ? `${entry.id} (local)`
            : `${entry.id} (session)`,
      }),
    );
  }

  /** Every model a request could actually succeed against, right now. */
  private async usableModels(force = false): Promise<UsableModel[]> {
    if (
      !force &&
      this.modelsCache &&
      Date.now() - this.modelsCache.at < OpenAiCompatServer.MODELS_TTL_MS
    ) {
      return this.modelsCache.models;
    }
    return this.buildUsableModels();
  }

  private async buildUsableModels(): Promise<UsableModel[]> {
    const url = this.deps.routerUrl();
    const headers = await this.deps.authHeaders();
    const address = this.deps.walletAddress();

    const getJson = async (path: string, fallback: any): Promise<any> => {
      try {
        const r = await fetch(`${url}${path}`, { headers });
        if (!r.ok) return fallback;
        return await r.json();
      } catch {
        return fallback;
      }
    };

    const [local, chainModels] = await Promise.all([
      getJson('/v1/models', []),
      getJson('/blockchain/models', { models: [] }),
    ]);

    const models: UsableModel[] = (local ?? []).map((m: any) => ({
      id: m.Id,
      name: m.Name || m.Model || m.Id,
      isLocal: true,
    }));

    if (!address) {
      this.modelsCache = { at: Date.now(), models };
      return models;
    }

    // Open sessions are the newest, so a couple of pages is plenty to decide
    // what to ADVERTISE. Missing one here costs a listing, never money — the
    // request simply reports that no session is open.
    const nowSec = Math.floor(Date.now() / 1000);
    const nameById = new Map<string, string>(
      ((chainModels?.models ?? []) as any[]).map((m) => [m.Id, m.Name]),
    );
    const seen = new Set<string>();
    for (let page = 0; page < 2; page++) {
      const data = await getJson(
        `/blockchain/sessions/user?user=${address}&offset=${page * 200}&limit=200&order=desc`,
        { sessions: [] },
      );
      const sessions = data?.sessions ?? [];
      for (const s of sessions) {
        const open = !Number(s.ClosedAt) && Number(s.EndsAt) > nowSec;
        if (!open || seen.has(s.ModelAgentId)) continue;
        seen.add(s.ModelAgentId);
        models.push({
          id: s.ModelAgentId,
          name: nameById.get(s.ModelAgentId) || s.ModelAgentId,
          isLocal: false,
          sessionId: s.Id,
        });
      }
      if (sessions.length < 200) break;
    }

    this.modelsCache = { at: Date.now(), models };
    return models;
  }

  /**
   * Map any accepted identifier onto the id clients must actually send.
   *
   * Callers inside the app hold the hex32 chain id; `/v1/models` advertises
   * NAMES. Comparing one against the other silently fails — which is exactly
   * what the opencode handoff did, reporting "not currently serving 0x…" for a
   * model that was open and serving fine. Route every such lookup through the
   * endpoint's own resolver so there is one definition of "which model is this".
   */
  async resolveAdvertisedId(requested: string): Promise<string | null> {
    const models = await this.usableModels();
    const resolution = resolveModel(requested, models);
    if (!resolution.ok) {
      return null;
    }
    return advertisedId(resolution.model, models);
  }

  /**
   * What `/v1/models` currently advertises, for callers that need to configure
   * a client. Deliberately derived from the SAME list the endpoint serves — a
   * config naming models the endpoint would reject is worse than no config,
   * because the failure surfaces inside the other tool.
   */
  async advertisedModels(): Promise<{ id: string; label: string }[]> {
    return this.labelled(await this.usableModels());
  }

  private async serveModels(res: ServerResponse): Promise<void> {
    const models = await this.usableModels();
    sendJson(res, 200, toModelList(models, Math.floor(Date.now() / 1000)));
  }

  private async serveChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: any;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, errorBody('Request body is not valid JSON.', 'invalid_body'));
      return;
    }

    const models = await this.usableModels();
    const resolution = resolveModel(body?.model, models);
    if (!resolution.ok) {
      // A marketplace model the user owns but has no session for is the single
      // most likely miss, so say what to do about it rather than "not found".
      sendJson(res, 404, errorBody(resolution.message, resolution.code));
      return;
    }

    const model = resolution.model;
    this.deps.onActivity?.({
      at: Date.now(),
      modelId: model.id,
      modelName: model.name,
    });

    const headers = await this.deps.authHeaders();

    // Abort the UPSTREAM when the client hangs up. Cancelling the read side
    // alone is not enough: the router keeps generating, and for a marketplace
    // model that means a paid session burning compute for tokens nobody will
    // read. Registered before the request so a disconnect during connect is
    // caught too.
    const controller = new AbortController();
    let aborted = false;
    res.on('close', () => {
      aborted = true;
      controller.abort();
    });

    let upstream: Response;
    try {
      upstream = await fetch(`${this.deps.routerUrl()}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/json',
          ...routingHeaders(model),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      if (aborted) {
        return; // client left; nothing to answer
      }
      throw e;
    }

    // Pass the router's response through untouched. It already emits OpenAI's
    // SSE framing including the `data: [DONE]` sentinel, so re-encoding here
    // would only create a second thing that can be wrong.
    res.writeHead(upstream.status, {
      'content-type':
        upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    });

    if (!upstream.body) {
      res.end();
      return;
    }
    const reader = upstream.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || aborted) break;
        res.write(Buffer.from(value));
      }
    } catch {
      // An abort surfaces here as a read error; the client is already gone.
    }
    res.end();
  }
}
