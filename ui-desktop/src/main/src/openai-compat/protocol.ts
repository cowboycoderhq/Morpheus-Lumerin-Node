// ============================================================================
// OpenAI-compatible facade — protocol and admission logic.
//
// The bundled proxy-router already speaks most of OpenAI: `/v1/chat/completions`
// uses go-openai's request/response structs and streams correct SSE. What it
// does NOT do is the three things every OpenAI client assumes:
//
//   1. authenticate with `Authorization: Bearer <key>` (it wants HTTP Basic),
//   2. select the model from the request BODY (it reads a `model_id` header),
//   3. return `/v1/models` as `{object:"list", data:[...]}` (it returns a raw array).
//
// This module is the translation, kept pure so it can be tested without a
// socket. The server that uses it is a thin shell around these decisions.
//
// SECURITY POSTURE (why this is safe to bind at all):
// The endpoint is *spend-inert* by default. It never opens a blockchain session
// unless the operator explicitly turns that on in Settings, so by default a
// stolen token or a rebinding bypass can only consume capacity that was already
// staked deliberately in the app — it can never cause a chain transaction.
// Auth cannot defend against same-user local malware (which can read whatever
// file holds the key), so the real control is that the port has no spending
// authority, not that the token is secret.
// ============================================================================

import { timingSafeEqual } from 'crypto';

/** A model the facade is willing to advertise and serve. */
export type UsableModel = {
  /** hex32 chain/router id */
  id: string;
  name: string;
  /** true when served by the bundled local runtime (no session, no cost) */
  isLocal: boolean;
  /** id of an already-open session, when one exists for this model */
  sessionId?: string;
};

/**
 * A marketplace model that is advertised but cannot serve yet.
 *
 * The endpoint deliberately advertises models the user has starred even with no
 * open session, so the list a terminal agent reads at startup stops changing
 * every time a session opens or closes — that churn is what forced agents to be
 * restarted. Such a model must be REFUSED at use and never forwarded: see
 * `routingHeaders`, which treats "no session id" as "route to the local
 * runtime", so forwarding one would silently answer from a different model.
 */
export function needsSession(model: UsableModel): boolean {
  return !model.isLocal && !model.sessionId;
}

/**
 * Add the user's starred marketplace models to what is already servable.
 *
 * This is the change that stops the advertised list from moving. Previously it
 * held exactly what could answer right now, so it grew and shrank as sessions
 * opened and expired — and since every terminal agent reads its model list once
 * at startup, each change stranded the user with a stale picker and no way to
 * refresh but a restart. Starred models are a set the USER controls, so the list
 * changes only when they say so.
 *
 * A starred model that already has an open session keeps its session entry:
 * `already` wins, so nothing here can downgrade a usable model into one that
 * gets refused.
 */
export function mergeStarredModels(
  already: UsableModel[],
  starredIds: readonly string[],
  nameById?: Map<string, string>,
): UsableModel[] {
  const have = new Set(already.map((m) => m.id.toLowerCase()));
  const merged = [...already];
  for (const id of starredIds) {
    if (!id || have.has(id.toLowerCase())) continue;
    have.add(id.toLowerCase());
    merged.push({ id, name: nameById?.get(id) || id, isLocal: false });
  }
  return merged;
}

export type OpenAiModelEntry = {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
};

export type AdmissionInput = {
  authorization?: string | null;
  /**
   * Fallback credential header.
   *
   * grok replaces the Authorization header on any endpoint it considers
   * first-party xAI, and it decides that by literal host match on
   * "localhost"/"127.0.0.1"/"::1" — which is us. Its own kill switch then swaps
   * our key for its IdP session token, so a correctly configured client arrives
   * with an 838-character JWT and gets a 401 it cannot explain. Reading the
   * credential from a header grok does not rewrite is the fix that does not
   * involve weakening anything.
   */
  morpheusKey?: string | null;
  host?: string | null;
  origin?: string | null;
};

export type AdmissionResult =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

/**
 * Constant-time bearer comparison.
 *
 * `===` on secrets leaks length and prefix through timing. Lengths are compared
 * first because timingSafeEqual throws on a length mismatch — that comparison is
 * not itself secret (the token length is fixed and public).
 */
export function bearerMatches(presented: string, expected: string): boolean {
  if (!presented || !expected) {
    return false;
  }
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Decide whether a request may be served at all.
 *
 * Three checks, each closing a specific hole:
 *
 *  - **Bearer token.** Keeps out anything that has not been told the key.
 *  - **Host header must be loopback.** This is the DNS-rebinding defence: an
 *    attacker's page resolves their domain to 127.0.0.1 and the browser happily
 *    connects to this port, but it sends `Host: evil.example`. Binding to
 *    127.0.0.1 alone does NOT stop that; checking Host does.
 *  - **No `Origin` header.** Browsers always attach one on cross-origin fetches;
 *    CLI tools and SDKs never do. Refusing any request that carries one keeps
 *    the endpoint unreachable from a web page even if the token leaks into one.
 */
export function admitRequest(
  input: AdmissionInput,
  expectedToken: string,
  port: number,
): AdmissionResult {
  // Origin first: its presence means a browser, and no browser should be here,
  // token or not. Checked before auth so a leaked token cannot be exercised
  // from a page.
  if (input.origin) {
    return {
      ok: false,
      status: 403,
      code: 'origin_not_allowed',
      message:
        'This endpoint does not serve browser requests. Use a CLI tool or SDK.',
    };
  }

  const host = (input.host ?? '').trim().toLowerCase();
  const allowed = new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`,
  ]);
  if (!allowed.has(host)) {
    return {
      ok: false,
      status: 403,
      code: 'host_not_allowed',
      message:
        'Requests must address this server as 127.0.0.1 — a mismatched Host header is how DNS-rebinding attacks reach a local port.',
    };
  }

  // Either channel may carry it. Both are compared the same way, so this adds
  // a header, not an exemption: with neither present the request still fails.
  const header = input.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const direct = (input.morpheusKey ?? '').trim();
  const presented = direct || (match ? match[1].trim() : '');
  if (!presented) {
    return {
      ok: false,
      status: 401,
      code: 'missing_api_key',
      message:
        'Missing Authorization header. Set your API key to the token shown in the app under Settings → OpenAI-compatible API.',
    };
  }
  if (!bearerMatches(presented, expectedToken)) {
    return {
      ok: false,
      status: 401,
      code: 'invalid_api_key',
      message: 'Incorrect API key provided.',
    };
  }

  return { ok: true };
}

/**
 * The name a client sees for a model.
 *
 * Morpheus model names are NOT unique — several providers can register the same
 * name — while OpenAI clients treat `model` as a unique key and show it in a
 * picker. So a name is used bare only when it is unambiguous among the models
 * actually being advertised; otherwise it is suffixed with a short id prefix.
 * The raw hex32 id always resolves too, so a script that hardcodes one keeps
 * working when a name later collides.
 */
export function advertisedId(model: UsableModel, all: UsableModel[]): string {
  const sameName = all.filter((m) => m.name === model.name);
  if (sameName.length <= 1) {
    return model.name;
  }
  return `${model.name}:${model.id.replace(/^0x/, '').slice(0, 8)}`;
}

/**
 * `/v1/models`, in the shape clients expect.
 *
 * Advertises ONLY models that will actually complete a request right now: local
 * ones, and marketplace ones with an open session. A picker full of models that
 * error on use is worse than a short honest list.
 */
export function toModelList(
  models: UsableModel[],
  nowSec: number,
): { object: 'list'; data: OpenAiModelEntry[] } {
  return {
    object: 'list',
    data: models.map((m) => ({
      id: advertisedId(m, models),
      object: 'model' as const,
      created: nowSec,
      owned_by: m.isLocal ? 'morpheus-local' : 'morpheus-marketplace',
    })),
  };
}

export type Resolution =
  | { ok: true; model: UsableModel }
  | { ok: false; code: string; message: string };

/**
 * Map a client's `model` string onto a model we can serve.
 *
 * Accepts the advertised name, the `name:prefix` disambiguated form, or a raw
 * hex32 id. A miss returns the usable names rather than a bare "not found", so
 * the error tells the user what to type instead.
 */
export function resolveModel(
  requested: string | undefined,
  models: UsableModel[],
): Resolution {
  const want = (requested ?? '').trim();
  if (!want) {
    return {
      ok: false,
      code: 'model_required',
      message: 'No model specified. Set `model` to one listed by GET /v1/models.',
    };
  }

  const byExactId = models.find(
    (m) => m.id.toLowerCase() === want.toLowerCase(),
  );
  if (byExactId) {
    return { ok: true, model: byExactId };
  }

  const byAdvertised = models.filter((m) => advertisedId(m, models) === want);
  if (byAdvertised.length === 1) {
    return { ok: true, model: byAdvertised[0] };
  }

  // A bare name that is ambiguous: name it, and list the disambiguated forms
  // rather than silently picking one — picking would route the user's prompt
  // (and, for a marketplace model, their staked capacity) at a provider they
  // did not choose.
  const sameName = models.filter((m) => m.name === want);
  if (sameName.length > 1) {
    return {
      ok: false,
      code: 'model_ambiguous',
      message: `"${want}" matches ${sameName.length} models. Use one of: ${sameName
        .map((m) => advertisedId(m, models))
        .join(', ')}`,
    };
  }

  const available = models.map((m) => advertisedId(m, models));
  return {
    ok: false,
    code: 'model_not_found',
    message: available.length
      ? `Unknown model "${want}". Available: ${available.join(', ')}`
      : `Unknown model "${want}". No models are currently usable — start the local runtime, or open a session in the app for a marketplace model.`,
  };
}

/**
 * The router's routing headers for a resolved model.
 *
 * The router routes EXCLUSIVELY from headers: `session_id` present → remote
 * model over that session; absent → local model chosen by `model_id`. The body's
 * `model` field is ignored by it entirely, which is the whole reason this
 * translation exists.
 */
export function routingHeaders(model: UsableModel): Record<string, string> {
  // Refuse rather than mis-route. Absent `session_id` means "local model" to the
  // router, so a starred marketplace model with no session would be answered by
  // the local runtime under the remote model's name — a wrong answer that looks
  // like a right one. The caller is expected to have refused it already; this is
  // the backstop that makes forgetting impossible rather than merely unlikely.
  if (needsSession(model)) {
    throw new Error(
      `refusing to route ${model.name}: it has no open session, and routing it ` +
        `without one would answer from the local model instead`,
    );
  }
  const headers: Record<string, string> = { model_id: model.id };
  if (model.sessionId) {
    headers.session_id = model.sessionId;
  }
  return headers;
}

/**
 * What a client is told when it names a starred model with no session.
 *
 * This sentence, not the status code, is the whole user interface for the
 * situation — measured against the real grok TUI and a real opencode run, both
 * print it verbatim and send exactly one request. Which status carries it is a
 * transport detail chosen by the same measurement; see SESSION_REQUIRED_STATUS
 * in server.ts for why the semantically correct code is the wrong one.
 */
export function sessionRequiredMessage(advertised: string): string {
  return (
    `No open session for "${advertised}". The Morpheus app can open one for ` +
    `this model — approve it there, then send your request again.`
  );
}

/** OpenAI's error envelope, so clients surface the message instead of "500". */
export function errorBody(
  message: string,
  code: string,
  type = 'invalid_request_error',
): string {
  return JSON.stringify({ error: { message, type, code, param: null } });
}
