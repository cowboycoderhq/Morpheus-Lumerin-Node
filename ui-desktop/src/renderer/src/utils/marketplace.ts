// ============================================================================
// Marketplace parameters — read live from the Diamond contract.
//
// Becoming a provider is gated by three governance-owned numbers: the minimum
// stake, the fee charged per bid, and the allowed price-per-second band. The
// contracts revert if you violate any of them, so the UI must know them BEFORE
// it lets someone submit a transaction — otherwise the user pays gas to be told
// "no".
//
// They are NOT hardcoded on purpose. Each has an onlyOwner setter, so a
// hardcoded copy would silently go stale the day governance changes it and we'd
// be validating against a number that no longer exists. They are also not
// exposed by proxy-router's HTTP API (GetMinStake/GetBidFee exist in Go but no
// route publishes them), so we read them straight from the chain over the same
// ETH node the node itself is configured with — a plain eth_call via fetch, no
// new dependency.
// ============================================================================

// 4-byte selectors, i.e. keccak256(signature)[0:4]. Hardcoding a *selector* is
// safe in a way that hardcoding a *value* is not: it is part of the ABI, and it
// changes only if the function signature itself changes.
const SELECTOR = {
  // getProviderMinimumStake() -> uint256
  providerMinimumStake: '0x53c029f6',
  // getBidFee() -> uint256
  bidFee: '0x8dbb4647',
  // getMinMaxBidPricePerSecond() -> (uint256, uint256)
  minMaxBidPricePerSecond: '0x38c8ac62',
} as const;

export type MarketplaceParams = {
  providerMinimumStake: bigint;
  bidFee: bigint;
  minPricePerSecond: bigint;
  maxPricePerSecond: bigint;
};

async function ethCall(
  rpcUrl: string,
  to: string,
  data: string,
): Promise<string> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
  });

  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message || 'eth_call failed');
  }
  if (typeof json.result !== 'string') {
    throw new Error('eth_call returned no result');
  }
  return json.result;
}

// ABI-decode a return value that is a sequence of uint256 words.
const decodeWords = (hex: string): bigint[] => {
  const body = hex.startsWith('0x') ? hex.slice(2) : hex;
  const words: bigint[] = [];
  for (let i = 0; i + 64 <= body.length; i += 64) {
    words.push(BigInt(`0x${body.slice(i, i + 64)}`));
  }
  return words;
};

const firstWord = (hex: string): bigint => {
  const [word] = decodeWords(hex);
  if (word === undefined) throw new Error('eth_call returned an empty result');
  return word;
};

/**
 * Read the current provider/bid constraints from the Diamond.
 *
 * @param rpcUrl    an ETH node URL (the one proxy-router is configured with)
 * @param diamond   the Diamond (Morpheus marketplace) contract address
 */
export async function getMarketplaceParams(
  rpcUrl: string,
  diamond: string,
): Promise<MarketplaceParams> {
  const [stakeHex, feeHex, bandHex] = await Promise.all([
    ethCall(rpcUrl, diamond, SELECTOR.providerMinimumStake),
    ethCall(rpcUrl, diamond, SELECTOR.bidFee),
    ethCall(rpcUrl, diamond, SELECTOR.minMaxBidPricePerSecond),
  ]);

  const band = decodeWords(bandHex);
  if (band.length < 2) {
    throw new Error('getMinMaxBidPricePerSecond returned an unexpected result');
  }

  return {
    providerMinimumStake: firstWord(stakeHex),
    bidFee: firstWord(feeHex),
    minPricePerSecond: band[0],
    maxPricePerSecond: band[1],
  };
}

// ---- MOR <-> wei ----------------------------------------------------------
// MOR is an 18-decimal ERC-20. Everything on the wire is an integer number of
// wei as a decimal STRING — never a JS number, which loses precision above
// 2^53 and would silently corrupt a stake.

const DECIMALS = 18n;
const ONE = 10n ** DECIMALS;

export function morToWei(amount: string): bigint {
  const trimmed = (amount ?? '').trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === '' || trimmed === '.') {
    throw new Error('Enter a valid amount');
  }
  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > Number(DECIMALS)) {
    throw new Error(`At most ${DECIMALS} decimal places`);
  }
  const padded = fraction.padEnd(Number(DECIMALS), '0');
  return BigInt(whole || '0') * ONE + BigInt(padded || '0');
}

export function weiToMor(wei: bigint, maxFractionDigits = 8): string {
  const negative = wei < 0n;
  const value = negative ? -wei : wei;
  const whole = value / ONE;
  const fraction = (value % ONE).toString().padStart(Number(DECIMALS), '0');
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${trimmed ? `.${trimmed}` : ''}`;
}

// ---- Model-picker pricing -------------------------------------------------
// A bid's price is a per-second rate. Two ways to show it, both from the same
// number: the RATE itself (MOR/s), or what it costs to START — the stake for the
// minimum 6-minute session, which is what actually leaves the wallet on open.
//
// The min-block stake mirrors the marketplace floor used everywhere else
// (calculateStake at MIN_REQUEST_SECONDS): price * 305 * supply / budget. That
// needs marketplace meta; without it the stake is unknowable, so this returns
// null and the caller shows the rate instead. Display-only Number math (the ratio
// dominates, exact wei precision is not needed to render a price label).

// Keep in sync with MIN_REQUEST_SECONDS in Chat.tsx / KeepAliveProvider.tsx.
const MIN_SESSION_SECONDS = 305; // 300s contract floor + 5s cushion for stake→duration truncation

export function sixMinuteStakeMor(
  pricePerSecondWei: string | number,
  meta: { supply?: string | number; budget?: string | number } | undefined,
): number | null {
  const price = Number(pricePerSecondWei);
  const supply = Number(meta?.supply);
  const budget = Number(meta?.budget);
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(supply) || !Number.isFinite(budget) || budget <= 0) {
    return null;
  }
  return (price * MIN_SESSION_SECONDS * supply) / budget / 1e18;
}

export type ModelPrice =
  | { kind: 'offline' }
  | { kind: 'single'; value: number }
  | { kind: 'range'; min: number; max: number };

// The price label for a model's bids, in the requested mode.
//   'perSec'  -> MOR per second (Number(price)/1e18)
//   'stake6m' -> MOR to open the 6-minute minimum session (sixMinuteStakeMor)
// 'offline' when there are no priceable bids — or, in stake mode, when meta is
// not loaded so no bid can be priced. Callers gate the stake toggle on meta being
// ready, so 'stake6m' + missing meta should not reach the user, but it degrades
// to 'offline' rather than inventing a number.
type PricedBid = { Id?: string; PricePerSecond?: string | number };

export function modelPriceDisplay(
  bids: PricedBid[] | undefined,
  mode: 'perSec' | 'stake6m',
  meta: { supply?: string | number; budget?: string | number } | undefined,
): ModelPrice {
  const list = (bids || []).filter((b) => b?.Id);
  if (list.length === 0) return { kind: 'offline' };
  const toValue = (b: PricedBid): number | null =>
    mode === 'stake6m'
      ? sixMinuteStakeMor(b?.PricePerSecond ?? 0, meta)
      : Number(b?.PricePerSecond) / 1e18;
  const values = list
    .map(toValue)
    .filter((n): n is number => n !== null && Number.isFinite(n));
  if (values.length === 0) return { kind: 'offline' };
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max
    ? { kind: 'single', value: min }
    : { kind: 'range', min, max };
}

// ---- Model-picker ordering ------------------------------------------------
// The cheapest a model can be opened at (min per-second bid, wei). A LOCAL model
// runs on the user's machine for free, so it is the cheapest of all (0). A remote
// model with no priceable bid is unopenable, so it sorts LAST (Infinity).
export function modelMinPriceWei(model: {
  isLocal?: boolean;
  bids?: PricedBid[];
}): number {
  if (model?.isLocal) return 0;
  const prices = (model?.bids || [])
    .filter((b) => b?.Id)
    .map((b) => Number(b?.PricePerSecond))
    .filter((n) => Number.isFinite(n) && n > 0);
  return prices.length ? Math.min(...prices) : Infinity;
}

export function modelProviderCount(model: { bids?: PricedBid[] }): number {
  return (model?.bids || []).filter((b) => b?.Id).length;
}

export type ModelSortMode = 'standard' | 'cheapest' | 'mostProviders';

// Order models for the picker. Online always sorts before offline (an offline
// model is useless however cheap), THEN by the chosen key, with an alphabetical
// tiebreak so the order is stable:
//   'standard'      -> local first, then A–Z (the historical default)
//   'cheapest'      -> lowest min price first
//   'mostProviders' -> most providers first (more redundancy / availability)
// Pure and non-mutating (copies before sorting). Uses a NaN-safe numeric compare
// so two no-price models (both Infinity) tie to the name rather than scrambling.
type SortableModel = {
  Name?: string;
  isOnline?: boolean;
  isLocal?: boolean;
  bids?: PricedBid[];
};

export function sortModelsForPicker<T extends SortableModel>(
  models: T[] | undefined,
  mode: ModelSortMode,
): T[] {
  const num = (x: number, y: number): number => (x < y ? -1 : x > y ? 1 : 0);
  return [...(models || [])].sort((a, b): number => {
    if (!!b?.isOnline !== !!a?.isOnline) return b?.isOnline ? 1 : -1;
    if (mode === 'cheapest') {
      const d = num(modelMinPriceWei(a), modelMinPriceWei(b));
      if (d) return d;
    } else if (mode === 'mostProviders') {
      const d = num(modelProviderCount(b), modelProviderCount(a));
      if (d) return d;
    } else if (!!b?.isLocal !== !!a?.isLocal) {
      return b?.isLocal ? 1 : -1;
    }
    return String(a?.Name || '').localeCompare(String(b?.Name || ''));
  });
}

// ---- Early-close lock -----------------------------------------------------
// Closing a session BEFORE it ends does not spend your stake — it TIME-LOCKS
// part of it. SessionRouter._rewardUserAfterClose:
//
//   isClosingLate_ = closedAt >= endsAt
//   if (!isClosingLate_) {
//       userDuration_    = min(endsAt, closedAt) - max(openedAt, startOfDay(closedAt))
//       userInitialLock_ = userDuration_ * pricePerSecond
//       userStakeToLock_ = userStake.min(stipendToStake(userInitialLock_, startOfDay(closedAt)))
//       userStakesOnHold[user].push(OnHold(userStakeToLock_, startOfDay(closedAt) + 1 days))
//   }
//   userAmountToWithdraw_ = userStake - userStakeToLock_    // returned NOW
//
// Let it run to endsAt instead and isClosingLate_ is true: NOTHING is locked.
// That asymmetry is the whole reason this warning exists — a real user closed a
// 6-minute session at 3 minutes and watched ~2.7 MOR disappear for a day with
// no warning at all (2026-07-16).
//
// WHY PROPORTIONAL, AND WHEN IT IS EXACT: the lock is
// stipendToStake(userDuration * price), and the stake itself was
// stipendToStake-equivalent over the FULL duration at open. stipendToStake is
// linear in its stipend argument, so the conversion ratio cancels and
//     lock / stake  ==  userDuration / fullDuration
// EXACTLY — provided the ratio is the same at open and at close. It is fixed per
// UTC day (totalMORSupply/computeBalance are read at startOfDay), so any session
// that opens and closes on the same UTC day is exact. One that straddles UTC
// midnight is an estimate, which is also when the max(openedAt, startOfDay)
// clamp shortens userDuration — both push the real lock DOWN, so this figure is
// a conservative ceiling, never an under-promise. Checked against the real
// on-chain session 0xc78d14…: predicted 2.6877 MOR locked, actual ~2.69.
//
// Deliberately NOT an eth_call: this renders on a hover/click path in the
// session list, and a warning that has to await the chain is a warning that
// sometimes is not there when the button is pressed.

const DAY = 86400;

// Sessions arrive untyped from the proxy-router (the codebase treats them as
// `any` everywhere — see computeStakedFunds). These functions read only these
// four fields, all decimal strings or numbers on the wire, so this narrow shape
// documents the dependency without pretending to type the whole blob.
type SessionLike = {
  Stake?: string | number;
  OpenedAt?: string | number;
  EndsAt?: string | number;
  ClosedAt?: string | number;
};

export type EarlyCloseLock = {
  /** false when the session lacks the fields to price a close — show no number */
  known: boolean;
  /** true when closing NOW would lock part of the stake */
  isEarly: boolean;
  lockedWei: bigint;
  returnedWei: bigint;
  /** unix seconds; the lock releases at startOfDay(now) + 1 day */
  unlockAt: number;
  /** unix seconds; wait until this and nothing is locked */
  endsAt: number;
  secondsUntilEnd: number;
};

const toBig = (v: unknown): bigint | null => {
  if (v === null || v === undefined || v === '') return null;
  try {
    // Values arrive as decimal strings or numbers; never trust a float here.
    return BigInt(typeof v === 'number' ? Math.trunc(v) : String(v));
  } catch {
    return null;
  }
};

/**
 * What closing `session` at `nowSec` costs the user, per the contract above.
 *
 * @param session a session as returned by /blockchain/sessions/user
 *                (Stake / OpenedAt / EndsAt, all seconds & wei)
 * @param nowSec  unix seconds
 */
export function earlyCloseLock(
  session: SessionLike | null | undefined,
  nowSec: number,
): EarlyCloseLock {
  const none: EarlyCloseLock = {
    known: false,
    isEarly: false,
    lockedWei: 0n,
    returnedWei: 0n,
    unlockAt: 0,
    endsAt: 0,
    secondsUntilEnd: 0,
  };

  const stake = toBig(session?.Stake);
  const openedAt = toBig(session?.OpenedAt);
  const endsAt = toBig(session?.EndsAt);
  if (stake === null || openedAt === null || endsAt === null) return none;
  if (stake <= 0n || endsAt <= openedAt) return none;

  const now = BigInt(Math.trunc(nowSec));
  const startOfDay = now - (now % BigInt(DAY));
  const unlockAt = Number(startOfDay) + DAY;

  // Closing at or after endsAt locks nothing — the good path.
  if (now >= endsAt) {
    return {
      known: true,
      isEarly: false,
      lockedWei: 0n,
      returnedWei: stake,
      unlockAt,
      endsAt: Number(endsAt),
      secondsUntilEnd: 0,
    };
  }

  const fullDuration = endsAt - openedAt;
  // Mirrors userDuration_: clamped to this UTC day, and never negative.
  const from = openedAt > startOfDay ? openedAt : startOfDay;
  const to = endsAt < now ? endsAt : now;
  const userDuration = to > from ? to - from : 0n;

  let locked = (stake * userDuration) / fullDuration;
  if (locked > stake) locked = stake; // mirrors userStake.min(...)
  if (locked < 0n) locked = 0n;

  return {
    known: true,
    isEarly: true,
    lockedWei: locked,
    returnedWei: stake - locked,
    unlockAt,
    endsAt: Number(endsAt),
    secondsUntilEnd: Number(endsAt - now),
  };
}

export type StakeReleaseTranche = {
  /** unix seconds when this chunk unlocks (a UTC-midnight boundary) */
  releaseAt: number;
  /** MOR (wei) unlocking at that time, summed across sessions sharing the day */
  lockedWei: bigint;
};

// The schedule on which on-hold stake frees — the answer to "when do I get it
// back" when the money came from MORE THAN ONE early close.
//
// getUserStakesOnHold returns aggregate amounts (available/hold) and throws the
// per-entry releaseAt away, so neither the times NOR their split can come from
// that endpoint. But each early close pushes OnHold(amount,
// startOfDay(closedAt)+1day), and the session list carries ClosedAt and Stake —
// so a session's locked amount and release time are exactly what earlyCloseLock
// computes for a close AT its ClosedAt. Two sessions closed on different UTC days
// therefore free on different days, and this groups them by release day.
//
// FUTURE entries only. A matured entry (releaseAt <= now) is excluded because the
// router's auto-claimer sweeps it within minutes AND — unlike a future entry —
// the contract may already have POPPED it, so the session would overcount stake
// that is no longer held. Future entries are never popped, so their session-
// derived amounts still match the chain. The session fetch pages to exhaustion
// and held stake only comes from closes within the last ~day, so every still-
// locked entry is visible.
//
// Amount precision: each tranche's lock is exact within its UTC day (the
// stipendToStake ratio cancels — see earlyCloseLock); a session straddling UTC
// midnight is a conservative ceiling. Sorted earliest-first.
export function stakeReleaseSchedule(
  sessions: SessionLike[] | undefined,
  nowSec: number,
): StakeReleaseTranche[] {
  const now = Math.trunc(nowSec);
  const byDay = new Map<number, bigint>();
  for (const s of sessions ?? []) {
    const closedAt = toBig(s?.ClosedAt);
    if (closedAt === null || closedAt <= 0n) continue; // still open
    // earlyCloseLock priced at the moment of close gives this session's real
    // historical lock and its unlockAt (startOfDay(closedAt)+1day).
    const at = earlyCloseLock(s, Number(closedAt));
    if (!at.known || !at.isEarly || at.lockedWei <= 0n) continue; // late / nothing
    if (at.unlockAt <= now) continue; // matured — auto-claimer's, and maybe popped
    byDay.set(at.unlockAt, (byDay.get(at.unlockAt) ?? 0n) + at.lockedWei);
  }
  return [...byDay.entries()]
    .map(([releaseAt, lockedWei]) => ({ releaseAt, lockedWei }))
    .sort((a, b) => a.releaseAt - b.releaseAt);
}

// The earliest future release, or null. Kept as a thin read over the schedule so
// there is one source of truth for the release math.
export function nextStakeReleaseAt(
  sessions: SessionLike[] | undefined,
  nowSec: number,
): number | null {
  const schedule = stakeReleaseSchedule(sessions, nowSec);
  return schedule.length ? schedule[0].releaseAt : null;
}
