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
import {
  buildCatalog,
  checkCaps,
  checkDuration,
  spentToday,
  stakeForDuration,
  startOfDay,
  CHAIN_CAP_FALLBACK_SEC,
  MIN_SESSION_SECONDS,
  type Quote,
  type SessionCaps,
  type SpendRecord,
} from './sessions-api';

export type OpenAiApiConfig = {
  enabled: boolean;
  port: number;
  token: string;
  /** When false the server never opens a session — the safe default. */
  allowAutoOpen: boolean;
  /** Ceiling on MOR staked by any ONE auto-opened session. */
  maxStakeMor: number;
  /** Ceiling on MOR staked across every session opened today. */
  maxDailyStakeMor: number;
  /** Ceiling on how MANY sessions may be opened today. */
  maxDailySessions: number;
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
  /**
   * The chain's per-session cap in seconds. The renderer reads it live because
   * it is owner-settable; main mirrors it. Omitted → the documented fallback.
   */
  maxSessionSeconds?: () => number;
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
  // Deliberately small. These are the ceiling on what a tool holding this
  // token can spend without the operator watching, so the default is "enough
  // to try it", not "enough to matter".
  maxStakeMor: 1,
  maxDailyStakeMor: 5,
  maxDailySessions: 10,
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
        morpheusKey: (req.headers['x-morpheus-key'] as string) ?? null,
      },
      cfg.token,
      cfg.port,
    );
    if (!admission.ok) {
      // A 401 with no explanation is undiagnosable from the other side: the
      // client just says "authentication required" and the user has no way to
      // learn WHICH credential arrived. Describe the shape of what was sent —
      // never the value.
      const auth = String(req.headers['authorization'] ?? '');
      const scheme = auth.split(' ')[0] || '(none)';
      this.deps.log?.(
        `openai-compat: refused ${req.method} ${(req.url ?? '').split('?')[0]} — ` +
          `${admission.code}; authorization=${scheme}, token length ${
            auth.split(' ')[1]?.length ?? 0
          }, host=${String(req.headers['host'] ?? '(none)')}`,
      );
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

    // The /morpheus/v1/* surface backs the `/start` command in opencode. It is
    // NOT OpenAI-shaped and deliberately namespaced away from /v1, so a generic
    // OpenAI client can never reach the one route that spends.
    if (req.method === 'GET' && url === '/morpheus/v1/status') {
      await this.serveMorpheusStatus(res);
      return;
    }
    if (req.method === 'GET' && url === '/morpheus/v1/catalog') {
      await this.serveCatalog(res);
      return;
    }
    if (req.method === 'GET' && url === '/morpheus/v1/providers') {
      await this.serveProviders(req, res);
      return;
    }
    if (req.method === 'POST' && url === '/morpheus/v1/quote') {
      await this.serveQuote(req, res);
      return;
    }
    if (req.method === 'POST' && url === '/morpheus/v1/sessions') {
      await this.serveOpenSession(req, res);
      return;
    }

    sendJson(
      res,
      404,
      errorBody(
        `Unsupported path ${req.method} ${url}. This endpoint serves /v1/models, /v1/chat/completions, and /morpheus/v1/{status,catalog,quote,sessions}.`,
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
    models: { id: string; label: string; isLocal: boolean }[];
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

  private labelled(
    models: UsableModel[],
  ): { id: string; label: string; isLocal: boolean }[] {
    return toModelList(models, Math.floor(Date.now() / 1000)).data.map(
      (entry) => {
        const isLocal = entry.owned_by === 'morpheus-local';
        return {
          id: entry.id,
          label: isLocal ? `${entry.id} (local)` : `${entry.id} (session)`,
          // Callers that publish to a CODING agent need this: a local model
          // cannot serve tools and streaming together, which such an agent
          // always asks for, so listing it is offering a guaranteed failure.
          isLocal,
        };
      },
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
  async advertisedModels(
    force = false,
  ): Promise<{ id: string; label: string; isLocal: boolean }[]> {
    // `force` exists for the caller that runs immediately after a session
    // opens: the 30s cache would otherwise hand back a list that predates it,
    // and the new model would not appear until the next poll.
    return this.labelled(await this.usableModels(force));
  }

  private async serveModels(res: ServerResponse): Promise<void> {
    const models = await this.usableModels();
    sendJson(res, 200, toModelList(models, Math.floor(Date.now() / 1000)));
  }

  // ==========================================================================
  // /morpheus/v1/* — the surface `/start` drives. Only ONE route here spends.
  //
  // The security model, stated plainly because it decides the code:
  //
  // The TUI confirmation is a real boundary against an AGENT — a model cannot
  // press a key — but it is CLIENT-SIDE. Anything holding the bearer token can
  // POST /morpheus/v1/sessions directly and skip it. So the dialog is UX plus
  // agent-resistance, and these are the enforcement:
  //   - `allowAutoOpen` off by default; without it this route cannot spend at all
  //   - caps that live in the app and cannot be raised over the wire
  //   - a per-day MOR ledger AND a per-day session count
  //   - the open RE-PRICES rather than trusting a figure sent back to it, and
  //     a caller may pass `confirmedStakeMor` as a CEILING: if the re-price
  //     comes out above what the user actually confirmed, the open is refused.
  //     (It used to say "the quote and the open price through the SAME
  //     function, so the figure confirmed is the figure staked". Same function,
  //     different call, freshly re-read supply/budget — nothing bound them, and
  //     doubling the supply between quote and open staked twice the confirmed
  //     figure. A ceiling can only ever refuse, so trusting it is safe.)
  //   - every open reported to the UI via onActivity
  // ==========================================================================

  /** Sessions opened through this API today. In memory: see the caps note. */
  private ledger: SpendRecord[] = [];

  private caps(): SessionCaps {
    const cfg = this.deps.config();
    return {
      maxStakeMor: cfg.maxStakeMor,
      maxDailyStakeMor: cfg.maxDailyStakeMor,
      maxDailySessions: cfg.maxDailySessions,
    };
  }

  private capSeconds(): number {
    return this.deps.maxSessionSeconds?.() ?? CHAIN_CAP_FALLBACK_SEC;
  }

  /** supply/budget drive every stake figure; both are read fresh per quote. */
  private async pricingInputs(): Promise<{ supply: number; budget: number } | null> {
    const url = this.deps.routerUrl();
    const headers = await this.deps.authHeaders();
    const get = async (path: string, key: string): Promise<number | null> => {
      try {
        const r = await fetch(`${url}${path}`, { headers });
        if (!r.ok) return null;
        const body = await r.json();
        const value = Number(body?.[key]);
        return Number.isFinite(value) && value > 0 ? value : null;
      } catch {
        return null;
      }
    };
    const [supply, budget] = await Promise.all([
      get('/blockchain/token/supply', 'supply'),
      get('/blockchain/sessions/budget', 'budget'),
    ]);
    // Fail CLOSED. A missing figure means we cannot price, and an unpriced
    // session must never be opened — that is the one case where guessing costs
    // real money.
    if (supply === null || budget === null) return null;
    return { supply, budget };
  }

  private async serveMorpheusStatus(res: ServerResponse): Promise<void> {
    const cfg = this.deps.config();
    const caps = this.caps();
    const now = Date.now();
    sendJson(res, 200, {
      canOpen: cfg.allowAutoOpen,
      reason: cfg.allowAutoOpen
        ? undefined
        : 'Opening sessions from outside the app is turned off. Enable it in the app under Settings → OpenAI-compatible API.',
      caps,
      spentTodayMor: spentToday(this.ledger, now),
      sessionsToday: this.ledger.filter((r) => r.at >= startOfDay(now)).length,
      maxSessionSeconds: this.capSeconds(),
      minSessionSeconds: MIN_SESSION_SECONDS,
    });
  }

  /**
   * The model list, WITHOUT per-model bids.
   *
   * It used to fetch every model's bids so the list could show a price and
   * hide models nobody serves. Measured against the live router that cost
   * **108 seconds** for 380 models — the picker sat frozen and the user
   * cancelled. The bids for ONE model are cheap; the bids for all of them are
   * not, and the flow only ever needs the one you pick. See
   * /morpheus/v1/providers.
   */
  private catalogCache: { at: number; body: any } | null = null;
  private static readonly CATALOG_TTL_MS = 60_000;

  private async serveCatalog(res: ServerResponse): Promise<void> {
    if (
      this.catalogCache &&
      Date.now() - this.catalogCache.at < OpenAiCompatServer.CATALOG_TTL_MS
    ) {
      sendJson(res, 200, this.catalogCache.body);
      return;
    }

    const url = this.deps.routerUrl();
    const headers = await this.deps.authHeaders();
    let chainModels: any = { models: [] };
    try {
      const r = await fetch(`${url}/blockchain/models`, { headers });
      if (r.ok) chainModels = await r.json();
    } catch {
      /* fall through to the empty list, which the caller reports plainly */
    }

    const models = ((chainModels?.models ?? []) as any[])
      .filter((m) => !m.IsDeleted)
      .map((m) => ({ id: m.Id, name: m.Name || m.Id }));

    const body = {
      models,
      maxSessionSeconds: this.capSeconds(),
      minSessionSeconds: MIN_SESSION_SECONDS,
    };
    this.catalogCache = { at: Date.now(), body };
    sendJson(res, 200, body);
  }

  /**
   * The providers bidding on ONE model, priced per hour.
   *
   * Per-hour rather than per-second because a wei-scale per-second figure in a
   * picker tells a human nothing about what a session costs.
   */
  private async serveProviders(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const modelId = new URL(req.url ?? '', 'http://127.0.0.1').searchParams.get('modelId');
    if (!modelId) {
      sendJson(res, 400, errorBody('modelId is required.', 'missing_fields'));
      return;
    }

    const pricing = await this.pricingInputs();
    if (!pricing) {
      sendJson(
        res,
        503,
        errorBody(
          'Cannot price sessions right now — the local router did not return the token supply and daily budget.',
          'pricing_unavailable',
        ),
      );
      return;
    }

    const url = this.deps.routerUrl();
    const headers = await this.deps.authHeaders();
    let bids: any[] = [];
    try {
      const r = await fetch(`${url}/blockchain/models/${modelId}/bids/active`, { headers });
      if (r.ok) bids = (await r.json())?.bids ?? [];
    } catch {
      bids = [];
    }

    const catalog = buildCatalog(
      [{ Id: modelId, Name: modelId }],
      new Map([[modelId, bids]]),
      pricing.supply,
      pricing.budget,
    );
    sendJson(res, 200, {
      modelId,
      providers: catalog[0]?.providers ?? [],
      maxSessionSeconds: this.capSeconds(),
      minSessionSeconds: MIN_SESSION_SECONDS,
    });
  }

  /**
   * Price a session WITHOUT opening it, and say whether it would be allowed.
   *
   * Read-only by construction — there is no code path from here to a chain
   * transaction — so `/start` can show a real figure before asking for a
   * confirmation, and a refused plan costs nothing to discover.
   */
  private async serveQuote(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsed = await this.readJson(req, res);
    if (!parsed.ok) return;
    const quote = await this.priceRequest(parsed.body, res);
    if (!quote) return;
    sendJson(res, 200, quote);
  }

  private async readJson(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<{ ok: true; body: any } | { ok: false }> {
    try {
      return { ok: true, body: JSON.parse(await readBody(req)) };
    } catch {
      sendJson(res, 400, errorBody('Request body is not valid JSON.', 'invalid_body'));
      return { ok: false };
    }
  }

  /**
   * The single pricing path, shared by /quote and /sessions.
   *
   * Shared on purpose: a confirmation screen showing one number while the chain
   * takes another is the worst bug this feature could have, and two call sites
   * computing "the same" figure is how that happens.
   */
  private async priceRequest(
    body: any,
    res: ServerResponse,
  ): Promise<Quote | null> {
    const modelId = typeof body?.modelId === 'string' ? body.modelId : '';
    const bidId = typeof body?.bidId === 'string' ? body.bidId : '';
    if (!modelId || !bidId) {
      sendJson(
        res,
        400,
        errorBody(
          'Both modelId and bidId are required. Read them from GET /morpheus/v1/catalog — a session is opened against ONE provider\'s bid, so the provider must be chosen explicitly.',
          'missing_fields',
        ),
      );
      return null;
    }

    const duration = checkDuration(body?.durationSec, this.capSeconds());
    if (!duration.ok) {
      sendJson(res, 400, errorBody(duration.reason, 'invalid_duration'));
      return null;
    }

    const pricing = await this.pricingInputs();
    if (!pricing) {
      sendJson(
        res,
        503,
        errorBody(
          'Cannot price sessions right now — the local router did not return the token supply and daily budget.',
          'pricing_unavailable',
        ),
      );
      return null;
    }

    const url = this.deps.routerUrl();
    const headers = await this.deps.authHeaders();
    let bid: any = null;
    try {
      const r = await fetch(`${url}/blockchain/bids/${bidId}`, { headers });
      if (r.ok) bid = (await r.json())?.bid ?? null;
    } catch {
      bid = null;
    }
    // The bid must NAME its model, and that name must match. The `?? modelId`
    // this used to end with made the comparison vacuously true for any bid
    // carrying neither field — so a bid belonging to model Y would open a paid
    // session against Y while the confirmation said X. Every other control here
    // fails closed; this one failed open.
    const bidModelId = bid
      ? (bid.ModelAgentId ?? bid.modelId ?? null)
      : null;
    if (!bid || !bidModelId || String(bidModelId) !== modelId) {
      sendJson(
        res,
        404,
        errorBody(
          `Bid ${bidId} was not found for model ${modelId}. Re-read GET /morpheus/v1/catalog — bids are withdrawn and replaced continuously.`,
          'bid_not_found',
        ),
      );
      return null;
    }

    const stakeMor = stakeForDuration(
      bid.PricePerSecond,
      duration.durationSec,
      pricing.supply,
      pricing.budget,
    );
    const verdict = checkCaps(stakeMor, this.caps(), this.ledger, Date.now());
    const cfg = this.deps.config();
    return {
      modelId,
      bidId,
      durationSec: duration.durationSec,
      stakeMor,
      allowed: verdict.allowed && cfg.allowAutoOpen,
      reason: !cfg.allowAutoOpen
        ? 'Opening sessions from outside the app is turned off. Enable it in the app under Settings → OpenAI-compatible API.'
        : verdict.reason,
    };
  }

  /**
   * Open a paid session. The ONLY route on this server that can spend.
   *
   * Re-prices at spend time rather than trusting a figure the caller sends
   * back: a quote is a moment's snapshot, supply/budget drift daily, and a
   * caller that could name its own price could name zero.
   */
  private async serveOpenSession(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const cfg = this.deps.config();
    if (!cfg.allowAutoOpen) {
      sendJson(
        res,
        403,
        errorBody(
          'Opening sessions from outside the app is turned off. Enable it in the app under Settings → OpenAI-compatible API. This is off by default so that a tool holding this token cannot spend without you having said it may.',
          'auto_open_disabled',
          'permission_error',
        ),
      );
      return;
    }

    const parsed = await this.readJson(req, res);
    if (!parsed.ok) return;

    // An explicit confirm flag, so a caller cannot open a session by accident
    // while exploring the API. Not a security control — anything that can POST
    // can set it — but it makes the spending call impossible to make by typo.
    if (parsed.body?.confirm !== true) {
      sendJson(
        res,
        400,
        errorBody(
          'Refusing to open a session without "confirm": true. Quote it first with POST /morpheus/v1/quote and show the user what it costs.',
          'confirmation_required',
        ),
      );
      return;
    }

    const quote = await this.priceRequest(parsed.body, res);
    if (!quote) return;
    if (!quote.allowed) {
      sendJson(
        res,
        403,
        errorBody(quote.reason ?? 'This session is not allowed.', 'cap_exceeded', 'permission_error'),
      );
      return;
    }

    // Honour the figure the user actually confirmed, as a CEILING.
    //
    // supply/budget are re-read here, and they move — fixed per UTC day, so a
    // confirmation that straddles midnight can be priced against different
    // inputs than the dialog showed. Without this, the user confirms one number
    // and the chain takes another, bounded only by maxStakeMor. Trusting a
    // caller-supplied number is safe in this ONE direction: it can only cause a
    // refusal, never a larger spend.
    const confirmed = Number(parsed.body?.confirmedStakeMor);
    if (Number.isFinite(confirmed) && confirmed > 0) {
      // Epsilon for float noise only — the two calls agree bit-for-bit when the
      // inputs have not moved.
      if (quote.stakeMor > confirmed + 1e-9) {
        sendJson(
          res,
          409,
          errorBody(
            `The price moved: this session now stakes ${quote.stakeMor.toFixed(
              4,
            )} MOR, more than the ${confirmed.toFixed(
              4,
            )} MOR you confirmed. Nothing was opened. Quote it again to see the current figure.`,
            'price_moved',
          ),
        );
        return;
      }
    }

    // Re-check the caps and reserve in ONE synchronous step.
    //
    // priceRequest forms its verdict on the far side of an await, so in
    // principle two requests arriving together could both be told "allowed"
    // against the same empty ledger and both then open. Checking and reserving
    // here, with no await between, closes that window.
    //
    // HONEST STATUS: theoretical. I could not make it happen. Five concurrent
    // opens against a cap of one were tried, including with the fake router
    // holding all five bid lookups and releasing them in a single tick to force
    // same-tick resumption — one session opened either way, with or without
    // this block. Every path to checkCaps goes through I/O while the span from
    // checkCaps to the push is pure microtask, which appears to serialise them.
    // The endpoint suite's concurrency check therefore does NOT discriminate
    // this guard; treat it as cheap insurance against an interleaving I could
    // not construct, not as a fix for a demonstrated bug.
    const verdict = checkCaps(quote.stakeMor, this.caps(), this.ledger, Date.now());
    if (!verdict.allowed) {
      sendJson(
        res,
        403,
        errorBody(verdict.reason ?? 'This session is not allowed.', 'cap_exceeded', 'permission_error'),
      );
      return;
    }
    // Record BEFORE the call. A crash mid-open must not leave a stake
    // unaccounted for: over-counting costs the user a refusal they could
    // undo in Settings, under-counting costs them MOR.
    const provisional: SpendRecord = {
      at: Date.now(),
      stakeMor: quote.stakeMor,
      sessionId: 'pending',
    };
    this.ledger.push(provisional);

    let sessionId: string;
    try {
      const url = this.deps.routerUrl();
      const headers = await this.deps.authHeaders();
      const r = await fetch(`${url}/blockchain/bids/${quote.bidId}/session`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          failover: false,
          sessionDuration: quote.durationSec,
          directPayment: false,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        // The router REJECTED it. Nothing was submitted, so the reservation is
        // genuinely free again.
        throw Object.assign(
          new Error(data?.error || `router returned ${r.status}`),
          { certainlyNotOpened: true },
        );
      }
      if (!data?.sessionID) {
        // Accepted, but we cannot name the session. It may well have landed.
        throw new Error(
          'the router accepted the request but returned no session id',
        );
      }
      sessionId = String(data.sessionID);
    } catch (e: any) {
      // Roll back ONLY when we know the chain saw nothing.
      //
      // A router 5xx before submission means no stake — release it. A 200
      // without an id, or a socket error after the request was sent, means the
      // transaction may already have landed; releasing the reservation there
      // would under-count the day's spend, and this file's own rule is that
      // under-counting costs the user MOR while over-counting costs them a
      // refusal they can lift in Settings.
      const safeToRelease = e?.certainlyNotOpened === true;
      if (safeToRelease) {
        this.ledger = this.ledger.filter((r) => r !== provisional);
      } else {
        provisional.sessionId = 'unknown';
        this.deps.log?.(
          `openai-compat: an open failed ambiguously (${e?.message ?? e}); keeping ${quote.stakeMor.toFixed(4)} MOR reserved against today's cap in case it landed`,
        );
      }
      sendJson(
        res,
        502,
        errorBody(
          `The session could not be opened: ${e?.message ?? 'unknown error'}` +
            (safeToRelease
              ? ''
              : ' — it may still have been created. Check your sessions in the app before retrying.'),
          'open_failed',
          'api_error',
        ),
      );
      return;
    }

    provisional.sessionId = sessionId;

    // ======================================================================
    // PAST THIS POINT THE MONEY IS SPENT. Nothing below may throw out of this
    // method, because `handle` turns a throw into HTTP 500 and the caller then
    // reports "could not open the session" for a session that IS open and
    // staked — the user loses the MOR *and* the session id needed to use it,
    // and an agent reading the failure retries and spends again.
    //
    // Everything remaining is bookkeeping and presentation: refreshing the
    // model cache, resolving the advertised name, notifying the UI. All of it
    // is best-effort. resolveForHandoff in particular re-reads the router and
    // has several unguarded throw sites of its own (a `/v1/models` body that
    // is not an array is enough).
    // ======================================================================
    let advertised: string | null = null;
    try {
      // A just-opened session must be visible to /v1/models immediately, or the
      // very next request from the same tool reports "no session for that model".
      this.modelsCache = null;
      const resolved = await this.resolveForHandoff(quote.modelId);
      advertised = resolved.advertised;
    } catch (e: any) {
      this.deps.log?.(
        `openai-compat: session ${sessionId} opened, but resolving its advertised name failed: ${e?.message ?? e}`,
      );
    }

    try {
      this.deps.onActivity?.({
        at: Date.now(),
        modelId: quote.modelId,
        modelName: advertised ?? quote.modelId,
        openedSessionId: sessionId,
        stakedMor: quote.stakeMor,
      });
      this.deps.log?.(
        `openai-compat: opened session ${sessionId} for ${quote.modelId} (${quote.stakeMor.toFixed(4)} MOR)`,
      );
    } catch {
      /* a listener must never cost the caller its receipt */
    }

    sendJson(res, 200, {
      sessionId,
      // The id the caller must now send as `model` — NOT the chain id. Handing
      // back the hex id is what made the in-app handoff report "not currently
      // serving 0x…" for a model that was open and serving fine. If resolution
      // failed above, the chain id is still a better answer than an error: the
      // session is real, and `resolveModel` accepts the chain id too.
      model: advertised ?? quote.modelId,
      // Tell the caller when the name could not be confirmed, rather than
      // letting it assume `model` is the advertised one.
      modelResolved: advertised !== null,
      stakeMor: quote.stakeMor,
      durationSec: quote.durationSec,
    });
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

    // A non-2xx from the router is passed through verbatim, which leaves the
    // caller holding a bare "HTTP 400" and no way to learn why. Say what the
    // router objected to — this is our own upstream's error text, not user
    // content, and without it the failure is undiagnosable from a terminal.
    if (upstream.ok) {
      // Log successes too, not only refusals. "Did this actually route through
      // Morpheus?" was unanswerable from the log — it had to be inferred from a
      // Settings field — which is a poor way to learn where your money went.
      // The model and status only; never the prompt or the completion.
      this.deps.log?.(
        `openai-compat: served ${resolution.model.id} (${
          resolution.model.sessionId ? 'session' : 'local'
        }) -> ${upstream.status}`,
      );
    }
    if (!upstream.ok) {
      const peek = await upstream
        .clone()
        .text()
        .catch(() => '');
      this.deps.log?.(
        `openai-compat: the router refused ${upstream.status} for model ` +
          `${resolution.model.id} — ${peek.slice(0, 300)}`,
      );
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
