// ============================================================================
// The Morpheus session API — the only part of this endpoint that can SPEND.
//
// `/start` in opencode drives these three calls: browse the catalog, quote a
// price, open a session. Everything else the endpoint does is read-only.
//
// THREAT MODEL, stated honestly, because it decides the design:
//
//  - Against LOCAL MALWARE this API changes nothing. The proxy-router already
//    exposes session opening to anything that can read its `.cookie` file, which
//    is any process running as the user. Locking this API down does not close
//    that door, and pretending otherwise would be security theatre.
//
//  - Against THE AGENT it matters enormously. opencode is an LLM agent that can
//    call any HTTP endpoint it is told about, in a loop, without a human in the
//    room. The keyboard confirmation in the TUI is a real boundary here — a
//    model cannot press a key — and the CAPS below are the backstop for when
//    that boundary is bypassed by a bug rather than by an attacker.
//
// So the controls are: caps that live in the APP and cannot be raised over the
// wire, a per-day ledger, and a record of every open for the UI. The dialog in
// the TUI is UX plus agent-resistance; these are the enforcement.
// ============================================================================

export type SessionCaps = {
  /** Hard ceiling on MOR staked by any ONE session opened through this API. */
  maxStakeMor: number;
  /** Hard ceiling on MOR staked across all sessions opened today. */
  maxDailyStakeMor: number;
  /**
   * Hard ceiling on the NUMBER of sessions opened today.
   *
   * The MOR caps alone do not bound this: against a cheap model a loop can open
   * hundreds of sessions well inside the daily MOR ceiling, and each one is a
   * chain transaction costing gas and locking its stake to end of day. An agent
   * that misreads a failure and retries is the realistic way that happens, not
   * an attacker. Optional so existing callers keep working; unset means
   * unbounded, which is why the app always sets it.
   */
  maxDailySessions?: number;
};

/** Contract floor (300s) plus the cushion the app uses everywhere else. */
export const MIN_SESSION_SECONDS = 305;

/**
 * The chain's per-session cap, as a main-process fallback.
 *
 * The renderer reads `getMaxSessionDuration()` live because it is
 * owner-settable (utils/marketplace.ts). Main has no RPC of its own, so it
 * mirrors the value and lets it be injected. A stale value here only ever
 * produces a REFUSAL to quote something the chain would clamp anyway — it can
 * never authorise a longer stake than the chain sells.
 */
export const CHAIN_CAP_FALLBACK_SEC = 604800;

export type DurationCheck =
  | { ok: true; durationSec: number }
  | { ok: false; reason: string };

/**
 * Validate a requested duration against the contract's own bounds.
 *
 * Deliberately REFUSES rather than silently clamping. A caller that asked for
 * two years and was quietly given seven days would sign a confirmation for a
 * session it did not ask for, and the difference is money.
 */
export function checkDuration(
  requestedSec: unknown,
  capSec: number = CHAIN_CAP_FALLBACK_SEC,
): DurationCheck {
  // A JSON number, and nothing else. `Number()` coercion made the refusal
  // message a lie: it promises "a positive whole number of seconds" but
  // accepted "0x1000" as 4096, [3600] as 3600, and " 3600 " as 3600 — so a
  // caller could stake for a duration it never believed it asked for.
  if (typeof requestedSec !== 'number') {
    return {
      ok: false,
      reason:
        'durationSec must be a JSON number of seconds, not a string or an array.',
    };
  }
  const sec = requestedSec;
  if (!Number.isFinite(sec) || Math.floor(sec) !== sec || sec <= 0) {
    return {
      ok: false,
      reason: 'durationSec must be a positive whole number of seconds.',
    };
  }
  if (sec < MIN_SESSION_SECONDS) {
    return {
      ok: false,
      reason: `The chain will not open a session shorter than ${MIN_SESSION_SECONDS}s.`,
    };
  }
  if (sec > capSec) {
    return {
      ok: false,
      reason: `The chain caps one session at ${capSec}s; staking for longer buys nothing. Ask for ${capSec}s or less.`,
    };
  }
  return { ok: true, durationSec: sec };
}

export type SpendRecord = { at: number; stakeMor: number; sessionId: string };

export type CatalogProvider = {
  bidId: string;
  provider: string;
  pricePerSecond: string;
  stakeMorPerHour: number;
};

export type CatalogModel = {
  id: string;
  name: string;
  providers: CatalogProvider[];
};

export type Quote = {
  modelId: string;
  bidId: string;
  durationSec: number;
  stakeMor: number;
  allowed: boolean;
  reason?: string;
};

const MOR = 1e18;

/** Local-midnight boundary: the ledger is a *daily* cap, in the user's day. */
export function startOfDay(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function spentToday(ledger: SpendRecord[], nowMs: number): number {
  const from = startOfDay(nowMs);
  return ledger
    .filter((r) => r.at >= from)
    .reduce((sum, r) => sum + r.stakeMor, 0);
}

/**
 * The stake a session of `durationSec` costs, in MOR.
 *
 * Mirrors proxy-router's computeSessionTokenAmount exactly:
 *   stake = pricePerSecond * duration * supply / budget
 * Any divergence here shows up as a quote that does not match what the chain
 * takes, which on a confirmation screen is the worst possible bug.
 */
export function stakeForDuration(
  pricePerSecondWei: string | number,
  durationSec: number,
  supply: number,
  budget: number,
): number {
  const price = Number(pricePerSecondWei);
  if (!Number.isFinite(price) || !budget) {
    return Number.NaN;
  }
  return (price * durationSec * supply) / budget / MOR;
}

/**
 * Decide whether a stake may proceed.
 *
 * Both limits are checked, and the message names WHICH one bound — a refusal
 * that does not say why leaves the user guessing at a number they cannot see.
 */
export function checkCaps(
  stakeMor: number,
  caps: SessionCaps,
  ledger: SpendRecord[],
  nowMs: number,
): { allowed: boolean; reason?: string } {
  if (!Number.isFinite(stakeMor) || stakeMor <= 0) {
    return { allowed: false, reason: 'Could not price this session.' };
  }
  // A cap that is not a usable number must REFUSE, not wave things through.
  // Every comparison below is `x > cap`, and that is false for NaN — so a
  // corrupted or half-written setting would silently mean "no limit" on the
  // three lines standing between an agent loop and the wallet. The config
  // reader coerces these already; this is the function refusing to depend on
  // its caller having done so.
  for (const [name, value] of [
    ['maxStakeMor', caps.maxStakeMor],
    ['maxDailyStakeMor', caps.maxDailyStakeMor],
  ] as const) {
    if (!Number.isFinite(value) || (value as number) < 0) {
      return {
        allowed: false,
        reason: `The ${name} limit is not set to a usable number, so no session can be opened. Set it in the app under Settings.`,
      };
    }
  }
  if (
    caps.maxDailySessions !== undefined &&
    !Number.isFinite(caps.maxDailySessions)
  ) {
    return {
      allowed: false,
      reason:
        'The daily session limit is not set to a usable number, so no session can be opened. Set it in the app under Settings.',
    };
  }
  if (stakeMor > caps.maxStakeMor) {
    return {
      allowed: false,
      reason: `This session would stake ${stakeMor.toFixed(
        2,
      )} MOR, over the per-session limit of ${caps.maxStakeMor} MOR. Raise it in the app under Settings, or choose a shorter duration.`,
    };
  }
  const already = spentToday(ledger, nowMs);
  if (already + stakeMor > caps.maxDailyStakeMor) {
    return {
      allowed: false,
      reason: `This would bring today's staking to ${(
        already + stakeMor
      ).toFixed(2)} MOR, over the daily limit of ${
        caps.maxDailyStakeMor
      } MOR (${already.toFixed(2)} already staked today).`,
    };
  }
  if (typeof caps.maxDailySessions === 'number') {
    const from = startOfDay(nowMs);
    const count = ledger.filter((r) => r.at >= from).length;
    if (count + 1 > caps.maxDailySessions) {
      return {
        allowed: false,
        reason: `That would be session ${count + 1} today, over the daily limit of ${
          caps.maxDailySessions
        }. Raise it in the app under Settings if this is deliberate.`,
      };
    }
  }
  return { allowed: true };
}

/**
 * Build the picker catalog: models, each with the providers that can serve it.
 *
 * Prices are quoted per HOUR rather than per second — a per-second figure in a
 * picker is unreadable (1e15 wei) and gives no sense of what a session costs.
 */
export function buildCatalog(
  models: { Id: string; Name: string }[],
  bidsByModel: Map<string, any[]>,
  supply: number,
  budget: number,
): CatalogModel[] {
  const out: CatalogModel[] = [];
  for (const model of models) {
    const bids = bidsByModel.get(model.Id) ?? [];
    if (!bids.length) {
      continue;
    }
    out.push({
      id: model.Id,
      name: model.Name || model.Id,
      providers: bids.map((b: any) => ({
        bidId: b.Id,
        provider: b.Provider,
        pricePerSecond: String(b.PricePerSecond),
        stakeMorPerHour: stakeForDuration(
          b.PricePerSecond,
          3600,
          supply,
          budget,
        ),
      })),
    });
  }
  return out;
}
