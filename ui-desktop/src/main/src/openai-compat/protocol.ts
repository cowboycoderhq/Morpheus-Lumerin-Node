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

export type OpenAiModelEntry = {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
};

export type AdmissionInput = {
  authorization?: string | null;
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

  const header = input.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return {
      ok: false,
      status: 401,
      code: 'missing_api_key',
      message:
        'Missing Authorization header. Set your API key to the token shown in the app under Settings → OpenAI-compatible API.',
    };
  }
  if (!bearerMatches(match[1].trim(), expectedToken)) {
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
  const headers: Record<string, string> = { model_id: model.id };
  if (model.sessionId) {
    headers.session_id = model.sessionId;
  }
  return headers;
}

/** OpenAI's error envelope, so clients surface the message instead of "500". */
export function errorBody(
  message: string,
  code: string,
  type = 'invalid_request_error',
): string {
  return JSON.stringify({ error: { message, type, code, param: null } });
}
