import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSelector } from 'react-redux';
import selectors from '../../store/selectors';
import { withClient } from '../../store/hocs/clientContext';
import { ToastsContext } from '../toasts';

// Runs a session of a chosen length against one model.
//
// The length the user asks for sets the STAKE: the router derives the stake from
// the duration we send, so a 1-day session is simply a 1-day open. When the ask
// fits inside the chain's per-session cap (getMaxSessionDuration — 7 days at
// present) that is the whole story: ONE block, opened once, no restaking.
//
// Only a span LONGER than the cap has to be chained, because the chain will not
// sell a longer session at any stake — `SessionRouter.getSessionEnd` clamps the
// duration and the surplus stake just sits there. Those spans chain cap-sized
// blocks, and everything below about overlap, refunds and never closing early is
// what makes that chaining safe. This lives ABOVE the tab router (mounted in Router.tsx) so the
// restaking keeps going even when the user leaves the Chat tab — the whole point
// of "keep-alive". Chat consumes this context for its badge and to route
// inference to the current block.
//
// Fund-safety (measured against the DEPLOYED Diamond on Base, 2026-08-06/07 —
// NOT against the vendored smart-contracts/ copy, which is from 2024-12-10 and
// describes a contract that is no longer what runs):
//
// The lock covers the part of the session that falls inside the UTC day the
// close lands in:
//     locked ≈ stake × (min(endsAt, closedAt) − max(openedAt, startOfDay(closedAt)))
//                      ────────────────────────────────────────────────────────
//                                     endsAt − openedAt
// released at startOfDay(closedAt) + 1 day, then swept home by the router's
// StakeClaimer. Consequences, each measured:
// - A block closed on the SAME UTC day it ran returns almost nothing now: a
//   28.1569 MOR block run to its end and closed 3–31s late returned 0.0156 MOR
//   and held 28.1413. There is no "close it late and it is free" path; that was
//   the vendored contract's `if (!isClosingLate_)` guard, which is not deployed.
// - A block closed on a LATER UTC day than it ended returns the stake IN FULL,
//   because none of the session lies inside the closing day (three closes of
//   50000.0000 MOR, hold delta exactly 0). It does not revert.
// - So nothing recycles between chained blocks: block N's stake is held while
//   block N+1 opens, and comes back by the end of the day N closed.
// - Open block N+1 shortly BEFORE N expires (OVERLAP_SEC) so inference never
//   drops. Peak commitment is 2x a block's stake for any renewing run, in BOTH
//   restake modes — see requiredFreeStake, which also handles the case where the
//   chain's cap is short enough that several blocks' holds overlap.

export const MIN_REQUEST_SECONDS = 5 * 60 + 5; // block unit: 305s = 300s contract floor + 5s cushion for stake→duration truncation
export const OVERLAP_SEC = 25; // seamless mode: open the next block this early; covers open-tx latency
// Sequential mode waits until the old block has EXPIRED, then closes it itself
// and waits for the chain to confirm the close before opening the next.
//
// The buffer no longer buys a "free" close — nothing does; a same-day close
// locks the used portion whether it lands early or late. What it still buys is
// the REMAINDER: closing at `endsAt + buffer` bills the whole block and refunds
// nothing, while closing a second EARLY bills only the elapsed part and refunds
// the rest immediately. That is a wash for the user. The buffer's real job is
// ordering: closedAt is block.timestamp at MINING time, not our clock, and a
// close that mines before endsAt leaves the session live, so the reopen races a
// still-active block. Keep it positive.
export const CLOSE_BUFFER_SEC = 8;
// Cap on waiting for the chain to confirm a close. The router's own autoclose
// ticker is 1 minute, so this must exceed it comfortably or we would give up on
// a settlement that was always going to arrive.
export const STAKE_RETURN_TIMEOUT_SEC = 150;
export const REOPEN_DELAY_SEC = CLOSE_BUFFER_SEC; // kept: strideSeconds still prices the gap

// How far the run advances in wall-clock per block. Blocks do NOT tile
// end-to-end: seamless OVERLAPS by OVERLAP_SEC, economy leaves a REOPEN_DELAY_SEC
// gap. Pricing a run as ceil(target / MIN_REQUEST_SECONDS) therefore under-counts
// seamless (measured: 2 priced, 3 opened) and over-counts economy (94 priced, 91
// opened). Every consumer that needs a block COUNT must go through
// blocksForDuration so the affordability gate prices what the loop actually opens.
//
// `blockSeconds` is the length of ONE staked block and defaults to the 305s
// floor. It is a parameter rather than a constant because the chain caps a
// single session (getMaxSessionDuration, 7 days at present): a session SHORTER
// than the cap is bought outright as a one-block run of exactly that length,
// and only a span LONGER than the cap has to be chained — out of cap-sized
// blocks, not 305s ones. Same loop, same fund-safety rules, different unit.
export const strideSeconds = (
  overlap: boolean,
  blockSeconds: number = MIN_REQUEST_SECONDS,
): number =>
  overlap ? blockSeconds - OVERLAP_SEC : blockSeconds + REOPEN_DELAY_SEC;

// Ceiling on a single setTimeout. Node/Chromium store the delay in a signed
// 32-bit int; anything above 2^31-1 ms silently becomes 1ms — which here would
// turn a long wait into a tight loop that opens a full-size stake per iteration.
// Long waits are armed in chunks below this instead.
export const MAX_TIMER_MS = 2_000_000_000;

// ---- the two money predicates, as pure functions ---------------------------
// Exported so the checks can bind to the SHIPPING code. They used to be inlined
// here and in Chat.startRolling, and logic-checks re-implemented both locally —
// so the suite pinned the intent while the real gate was free to disagree with
// it, which is exactly how the mode-dependent version survived. A test that
// re-types the code it is testing proves only that the author can type twice.

type ReserveRun = {
  running: boolean;
  perBlockStakeWei?: number | string | bigint;
  /** blocks this run will ever open (see planBlocks) */
  total?: number;
  /** blocks it has opened so far */
  openedSessionIds?: unknown[];
};

/**
 * The stake OTHER live runs still need, and which this wallet therefore cannot
 * count as free.
 *
 * Two rules, both load-bearing:
 * - Mode does not matter, but not for the reason once written here. What a close
 *   returns IMMEDIATELY is only the portion of the block outside the closing UTC
 *   day, so a renewing run cannot count on recycling — reserve the full per-block
 *   stake in both modes. (SessionRouter.sol:296-298 anchors the lock to
 *   startOfTheDay(min(closedAt, endsAt)); :305 fires it only while
 *   block.timestamp < releaseAt_. A multi-day block therefore returns most of its
 *   stake at close — see the day-slice formula at :35-39 above.)
 *   Skipping sequential runs here let the
 *   gate approve runs the wallet could not fund.
 * - A run with no blocks LEFT reserves nothing. Its current stake is already out
 *   of the wallet, so free balance excludes it, and it will never open another.
 *   Counting it charged a phantom block against every new session — and since a
 *   session inside the chain cap is a ONE-block run, that was every ordinary
 *   session. It also produced a refusal claiming a running session "still needs"
 *   MOR it will never ask for.
 */
export const reserveWei = (
  runs: Iterable<[string, ReserveRun]>,
  exceptChatId?: string,
): number => {
  let total = 0;
  for (const [key, run] of runs) {
    if (!run.running || key === exceptChatId) {
      continue;
    }
    // `total` is absent on older/stubbed run shapes; treat that as "may renew"
    // so an unknown shape errs toward reserving rather than under-reserving.
    const planned = typeof run.total === 'number' ? run.total : Infinity;
    const opened = run.openedSessionIds?.length ?? 0;
    if (opened >= planned) {
      continue;
    }
    const per = Number(run.perBlockStakeWei);
    if (Number.isFinite(per) && per > 0) {
      total += per;
    }
  }
  return total;
};

const HOLD_WINDOW_SEC = 24 * 60 * 60; // startOfDay(closedAt) + 1 day, worst case

/**
 * Peak number of block-stakes a run has committed at once.
 *
 * A closed block's stake is held until the end of the UTC day it closed in, so
 * the peak is the live block plus every block whose hold has not yet released —
 * i.e. however many blocks fit inside one hold window.
 *
 * At the current 7-day cap that is 1 + 1 = 2, which is why a flat 2 looked
 * right. But the cap is OWNER-SETTABLE and read live (see getMaxSessionSeconds,
 * which accepts anything from 300s to 30d). Shorten it and the peak climbs: at a
 * 1-hour cap a 7-day ask opens ~170 blocks and holds ~26 stakes at once. A flat
 * 2 would then under-reserve by 13x — the gate approves, block 1 is paid for,
 * and a later block reverts. Deriving it from blockSeconds means a governance
 * change cannot silently invalidate the gate.
 *
 * `+ 2` not `+ 1`: one for the live block, one for the partial day at the edge.
 * Rounding up is the safe direction for an affordability gate.
 */
export const peakBlockStakes = (
  blockCount: number,
  blockSeconds: number,
): number => {
  if (!(blockCount > 1)) {
    return 1;
  }
  if (!Number.isFinite(blockSeconds) || blockSeconds <= 0) {
    return blockCount; // unpriceable block size: reserve for all of it
  }
  return Math.min(blockCount, Math.floor(HOLD_WINDOW_SEC / blockSeconds) + 2);
};

/**
 * Free stake a new run needs before it may open. A one-block run locks its
 * stake once; a renewing run needs every stake that can be committed at the
 * same time, because nothing is released between blocks — in both restake
 * modes.
 */
export const requiredFreeStake = (
  blockCount: number,
  perBlockStake: number,
  otherRunsNeed: number,
  blockSeconds: number,
): number =>
  peakBlockStakes(blockCount, blockSeconds) * perBlockStake + otherRunsNeed;

/**
 * The blocks a run will actually open, in order, with their lengths.
 *
 * Two rules make this different from a naive ceil(target / blockSeconds), and
 * both exist because the alternative costs real money:
 *
 *  - The LAST block is cut to the remainder. A full-size final block is the
 *    difference between "8 days" costing eight days of lockup and costing
 *    fourteen — the surplus buys time the user did not ask for and cannot get
 *    back without an early close (which time-locks stake for ~24h).
 *  - A remainder shorter than the contract minimum is DROPPED, not rounded up
 *    to a whole block. Covering the last 25 seconds of a 14-day ask would
 *    otherwise stake for another entire week.
 *
 * The scheduler mirrors this exactly (see scheduleNext). They are twins: pricing
 * that disagrees with the loop is the wallet paying a number the user was never
 * shown.
 */
export const planBlocks = (
  targetSec: number,
  overlap: boolean,
  blockSeconds: number = MIN_REQUEST_SECONDS,
): number[] => {
  const unit = Math.max(
    MIN_REQUEST_SECONDS,
    Math.min(blockSeconds, Math.max(targetSec, MIN_REQUEST_SECONDS)),
  );
  const lengths = [unit];
  let endsAt = unit;
  // Bounded so a pathological input cannot spin here. 10 years of 5-minute
  // blocks is the worst case the typed-length ceiling permits.
  for (let guard = 0; guard < 200000; guard++) {
    if (targetSec - endsAt < MIN_REQUEST_SECONDS) {
      break;
    }
    const fireAt = overlap ? endsAt - OVERLAP_SEC : endsAt + CLOSE_BUFFER_SEC;
    const next = Math.max(
      MIN_REQUEST_SECONDS,
      Math.min(unit, targetSec - fireAt),
    );
    lengths.push(next);
    endsAt = fireAt + next;
  }
  return lengths;
};

// How many blocks a run costs. This is what the affordability gate prices and
// what the UI promises, so it must equal what the loop opens.
export const blocksForDuration = (
  targetSec: number,
  overlap: boolean,
  blockSeconds: number = MIN_REQUEST_SECONDS,
): number => planBlocks(targetSec, overlap, blockSeconds).length;

export interface KeepAliveStatus {
  running: boolean;
  index: number;
  total: number;
  targetEndTime: number; // unix seconds
  modelId: string;
  chatId: string;
}

interface KeepAliveRun extends KeepAliveStatus {
  isDirectPay: boolean;
  bidId: string | null; // fixed provider for every block, or null = router picks
  overlap: boolean; // true = seamless (open N+1 before N ends, 2x stake); false = economy (sequential, 1x, small gap)
  // Length of ONE block of this run. A run whose target fits inside the chain's
  // per-session cap has blockSeconds === its whole target and opens exactly one
  // block; only a longer span chains cap-sized blocks.
  blockSeconds: number;
  // Length of the NEXT block, which is the remainder rather than a full unit
  // once the run is nearly done. Set by scheduleNext, read by tick.
  nextBlockSeconds: number;
  id: number; // monotonic run token; guards against a stale tick acting on a new run
  // Per-run timer. This used to be one module-level ref, which is precisely what
  // made runs mutually exclusive: a second run's schedule overwrote the first's
  // handle and the first stopped restaking silently. Each run owns its own.
  timer: ReturnType<typeof setTimeout> | null;
  // EVERY block this run has opened, not just the current one. During a seamless
  // overlap two of a run's blocks are open at once and both are listed with a
  // Close button; matching only the current block meant closing the older one
  // paid the early-close penalty AND left the run happily restaking.
  openedSessionIds: string[];
  // What one block of this run costs. Needed to reserve the pending overlap of
  // OTHER live runs when gating a new one — without it the gate approves each
  // run in isolation and the wallet is oversubscribed N-fold.
  perBlockStakeWei: number;
}

export interface StartKeepAliveOpts {
  modelId: string;
  chatId: string;
  // SECONDS, not minutes. A minutes round-trip (sec/60 here, *60 there)
  // reintroduces float error: (16165/60)*60 = 16165.000000000002, which shifted
  // the block count by one at one length out of 94 when this was a slider.
  // Seconds are exact, and a typed "2 years" makes the range far wider still.
  totalSeconds: number;
  // Length of one staked block. Defaults to the 305s floor (the old rolling
  // behaviour). Pass the whole target to buy a single session outright, or the
  // chain's per-session cap to chain the longest blocks the chain will sell.
  blockSeconds?: number;
  isDirectPay: boolean;
  // MOR one block of this run stakes. Recorded so the provider can tell a new
  // run's affordability gate what the existing runs still need.
  perBlockStakeWei?: number;
  // A specific provider's bid to stake every block against; null = let the
  // router choose a provider each block ("Auto").
  bidId?: string | null;
  // Seamless (default): overlap blocks for gapless inference. Sequential
  // (false): open the next block only after the current one expires, leaving a
  // small inference gap. Costs the SAME — the expiring block's stake is held to
  // the end of the UTC day, so neither mode gets to reuse it.
  overlap?: boolean;
}

export interface KeepAliveContextValue {
  // Keyed by chatId. Several rolling sessions run at once — including several
  // against the SAME provider, which the contract allows (each openSession takes
  // a fresh nonce) and the router routes by session id.
  statuses: Record<string, KeepAliveStatus>;
  sessionsByChat: Record<string, any>;
  // Every session id each LIVE run has opened (current block last). A run's
  // older block stays open through the seamless overlap, so "is this session
  // mine?" cannot be answered by the current block alone.
  //
  // Live-only on purpose: closeSession maps a session id back to the run that
  // owns it, and folding ended runs in here would let an OLD id stop a healthy
  // NEW run on the same chat.
  sessionIdsByChat: Record<string, string[]>;
  // Ids from runs that have ENDED, whose final block may still be open. Kept
  // apart from the live map (see above) — this one is for answering "is anyone
  // still entitled to this session?", never "which run should I stop?".
  retainedSessionIds: Record<string, string[]>;
  runningCount: number;
  // WEI that live runs other than `exceptChatId` still need to fund their next
  // block — ALL such runs, in either restake mode, but only those with a block
  // still to open. A new run's gate must add this to its own requirement: each
  // run asking only "can I peak at 2x?" oversubscribes the wallet once several
  // are live, and every run that loses the race reverts having already paid for
  // its first block.
  committedOverlapWei: (exceptChatId?: string) => number;
  start: (opts: StartKeepAliveOpts) => Promise<void>;
  // Stop one run, or every run when called with no argument.
  stop: (chatId?: string) => void;
}

export const KeepAliveContext = createContext<KeepAliveContextValue>({
  statuses: {},
  sessionsByChat: {},
  sessionIdsByChat: {},
  retainedSessionIds: {},
  runningCount: 0,
  committedOverlapWei: () => 0,
  start: async () => {},
  stop: () => {},
});

export const useKeepAlive = () => useContext(KeepAliveContext);

// Exported for the isolate suite: the concurrency this file exists to provide is
// stateful (per-run timers, per-run identity tokens) and cannot be checked by
// testing pure helpers. The case mounts THIS, unwrapped, with a fake client.
export const KeepAliveProviderInner = ({ client, children }: any) => {
  const address = useSelector((s: any) => selectors.getWalletAddress(s));
  const url = useSelector((s: any) => selectors.getLocalProxyRouterUrl(s));
  const toasts = useContext(ToastsContext);

  const [statuses, setStatuses] = useState<Record<string, KeepAliveStatus>>({});
  const [sessionsByChat, setSessionsByChat] = useState<Record<string, any>>({});
  const [sessionIdsByChat, setSessionIdsByChat] = useState<
    Record<string, string[]>
  >({});
  const [retainedSessionIds, setRetainedSessionIds] = useState<
    Record<string, string[]>
  >({});

  // Mutable state the (long-lived) timer callbacks must read fresh, so they never
  // fire on a stale closure. runsRef is the source of truth: chatId -> run.
  // Lazily initialised: `useRef(new Map())` allocates a Map on every render and
  // throws it away.
  const runsRef = useRef<Map<string, KeepAliveRun> | null>(null);
  if (runsRef.current === null) {
    runsRef.current = new Map();
  }
  const runCounterRef = useRef(0);
  // Session ids of runs that have ended, kept so their still-open final block
  // remains claimed. See publish().
  const retainedIdsRef = useRef<Map<string, string[]>>(new Map());
  const urlRef = useRef(url);
  urlRef.current = url;
  const addressRef = useRef(address);
  addressRef.current = address;

  const clearRunTimer = (run: KeepAliveRun | undefined | null) => {
    if (run?.timer) {
      clearTimeout(run.timer);
      run.timer = null;
    }
  };

  const publish = () => {
    const nextStatuses: Record<string, KeepAliveStatus> = {};
    // Seed with the ids of runs that have STOPPED. Their final block stays open
    // for up to a full block after the run ends (we never close early — that
    // would time-lock the stake), and dropping the claim the moment the run left
    // the map left that paid block unowned and adoptable by any unbound chat on
    // the same model. Retaining costs nothing: an id that has since expired is
    // no longer in openSessions, so claiming it can never block anything real.
    // Published as SEPARATE maps, not one overlaid on the other. Seeding retained
    // and then assigning live over it meant a restarted run wiped its own chat's
    // retained ids (the new run begins with openedSessionIds: []), so the
    // previous run's final block — open for up to a full block — lost its claim
    // for the entire life of the new run. That is the exact hole retention
    // exists to close.
    const nextIds: Record<string, string[]> = {};
    const nextRetained: Record<string, string[]> = {};
    retainedIdsRef.current.forEach((ids, key) => {
      nextRetained[key] = [...ids];
    });
    runsRef.current!.forEach((run, key) => {
      nextStatuses[key] = {
        running: run.running,
        index: run.index,
        total: run.total,
        targetEndTime: run.targetEndTime,
        modelId: run.modelId,
        chatId: run.chatId,
      };
      nextIds[key] = [...run.openedSessionIds];
    });
    setStatuses(nextStatuses);
    setSessionIdsByChat(nextIds);
    setRetainedSessionIds(nextRetained);
  };

  // Sum of one block's stake for every live run except the one asking. Seamless
  // runs hold a second block's worth briefly at each rotation; economy runs need
  // their next block's stake before the previous one's has returned. Either way
  // the money is spoken for and a new run must not count it as free.
  // Thin wrapper over the exported predicate, so the tested function and the
  // shipped one are the same function.
  //
  // This used to skip sequential ("economy") runs on the premise that they
  // recycle: close the expired block, get the stake back, open the next with
  // it. Measured on Base mainnet 2026-08-06, that premise is false — closing a
  // block (late, at or after endsAt, which is exactly when this loop closes)
  // returns only the UNUSED remainder and locks the used portion until the end
  // of the UTC day. A block that ran its full length returns ~0.06% of its
  // stake. Skipping those runs let the gate approve runs the wallet cannot
  // fund. See utils/marketplace.ts for the measurements.
  const committedOverlapWei = useCallback(
    (exceptChatId?: string) =>
      reserveWei(runsRef.current!.entries(), exceptChatId),
    [],
  );

  // stop(chatId) ends ONE run; stop() ends all of them. Callers that mean "this
  // thread is going away" must pass the id — an argument-less stop from a chat
  // switch would kill every other chat's auto-renewal, which is the whole point
  // of running them in parallel.
  // Hand a dying run's opened ids to the retained map BEFORE dropping it, so its
  // still-open final block keeps its claim (see publish()).
  const retire = (run: KeepAliveRun, key: string) => {
    const prior = retainedIdsRef.current.get(key) || [];
    retainedIdsRef.current.set(
      key,
      Array.from(new Set([...prior, ...run.openedSessionIds])),
    );
  };

  const stop = useCallback((chatId?: string) => {
    if (chatId === undefined) {
      runsRef.current!.forEach((run, key) => {
        clearRunTimer(run);
        retire(run, key);
      });
      runsRef.current!.clear();
    } else {
      const run = runsRef.current!.get(chatId);
      if (!run) {
        return;
      }
      clearRunTimer(run);
      retire(run, chatId);
      runsRef.current!.delete(chatId);
    }
    publish();
    // Leave the last block in sessionsByChat; it lapses on its own and Chat can
    // keep showing/using it until it expires. Never close it here.
  }, []);

  // Persist the chat -> session binding the moment a block opens, from HERE
  // rather than from Chat's mirror effect. The mirror only runs for the chat the
  // user is LOOKING AT, but runs rotate in the background every ~305s for chats
  // that are not on screen — those rotations would never have reached disk, so
  // the durable record would name a block that expired hours ago.
  //
  // Fire-and-forget: the stake is already spent, and a failed write must not
  // stop the run. Worst case the binding is stale until the next rotation.
  const persistBinding = (
    chatId: string,
    sessionId?: string,
    modelId?: string,
  ) => {
    if (!chatId || !sessionId) {
      return;
    }
    client
      ?.updateChatSession?.({ id: chatId, sessionId, modelId })
      .catch((e: any) => console.warn('keep-alive: bind not persisted', e));
  };

  // Open ONE block of `blockSeconds` (replicates withChatState.onOpenSession's
  // router call, reusable outside the Chat component). With a bidId, stakes
  // against that specific provider; without, the router picks one. The router
  // derives the STAKE from this duration, which is what makes the typed session
  // length the thing that sets the stake. Returns the session id.
  const openBlock = async (
    modelId: string,
    isDirectPay: boolean,
    bidId: string | null,
    blockSeconds: number = MIN_REQUEST_SECONDS,
  ) => {
    const failover = await client.getFailoverSetting();
    const authHeaders = await client.getAuthHeaders();
    const path = bidId
      ? `${urlRef.current}/blockchain/bids/${bidId}/session`
      : `${urlRef.current}/blockchain/models/${modelId}/session`;
    const resp = await fetch(path, {
      method: 'POST',
      body: JSON.stringify({
        failover: failover?.isEnabled || false,
        sessionDuration: blockSeconds,
        directPayment: isDirectPay,
      }),
      headers: authHeaders,
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data?.error || 'open failed');
    }
    return data.sessionID as string;
  };

  // The router can return a session id before the session is queryable (tx still
  // mining / indexing lag). Poll a few times before giving up. Fetch ONLY the
  // newest page — a just-opened session is the newest under order=desc, so this
  // avoids paginating the user's entire (potentially huge) session history, which
  // otherwise made confirming each block take tens of seconds.
  const fetchSession = async (sessionId: string) => {
    for (let i = 0; i < 5; i++) {
      let sessions: any[] = [];
      try {
        const authHeaders = await client.getAuthHeaders();
        const resp = await fetch(
          `${urlRef.current}/blockchain/sessions/user?user=${addressRef.current}&offset=0&limit=50&order=desc`,
          { headers: authHeaders },
        );
        const data = await resp.json();
        sessions = data?.sessions || [];
      } catch {
        sessions = [];
      }
      const s = sessions.find((x: any) => x.Id == sessionId);
      if (s) {
        return s;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
  };

  // Close an EXPIRED block ourselves instead of waiting for the router's
  // once-a-minute autoclose sweep.
  //
  // What this does NOT do is free the stake. The comment here used to claim a
  // close at or after endsAt takes an `isClosingLate_` branch that skips the
  // userStakesOnHold push and returns the full stake — true of the vendored
  // 2024-12-10 contract, false of the deployed Diamond (measured on Base
  // mainnet 2026-08-06: a block run to its end returns ~0.06% and locks the
  // rest to end of day). Closing early is still worth doing — it hands back the
  // unused remainder immediately and lets the router settle the session — but
  // it buys no stake to reopen with, which is why sequential mode is no longer
  // priced as 1x.
  const closeBlock = async (sessionId: string) => {
    const authHeaders = await client.getAuthHeaders();
    const resp = await fetch(
      `${urlRef.current}/blockchain/sessions/${sessionId}/close`,
      { method: 'POST', headers: authHeaders },
    );
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.error) {
      throw new Error(data?.error || 'close failed');
    }
    return data;
  };

  // Wait until the chain agrees the block is CLOSED. Deliberately not named
  // "wait for the stake to come back" any more: it never measured that, and on
  // the deployed contract the stake does not come back at close at all — the
  // used portion is held to end of day and swept later by the proxy-router's
  // StakeClaimer. Closure is still worth waiting for, because reopening against
  // a session the chain still thinks is active is what reverted before.
  const waitForClose = async (sessionId: string) => {
    const deadline = Date.now() + STAKE_RETURN_TIMEOUT_SEC * 1000;
    while (Date.now() < deadline) {
      const s = await fetchSession(sessionId);
      // No record, or a non-zero ClosedAt, both mean it is no longer holding.
      if (!s || Number(s.ClosedAt) > 0) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    return false;
  };

  // Arm a timer that may be days away.
  //
  // setTimeout stores its delay in a signed 32-bit int: anything past ~24.9 days
  // silently becomes 1ms. At the 305s block unit that could never happen, but the
  // block unit is the chain's per-session cap now — an owner raising it (or a
  // wrong-contract read returning a uint128 max) would turn a long wait into a
  // tight loop opening a FULL-SIZE stake per iteration until the wallet empties.
  // Wait in chunks instead, re-checking run identity at every hop so a stopped or
  // superseded run never wakes up.
  const armTimer = (
    run: KeepAliveRun,
    key: string,
    delayMs: number,
    fire: () => void,
  ) => {
    const myId = run.id;
    const hop = (remaining: number) => {
      const live = runsRef.current!.get(key);
      if (!live || live.id !== myId) {
        return;
      }
      const slice = Math.min(Math.max(0, remaining), MAX_TIMER_MS);
      live.timer = setTimeout(() => {
        const still = runsRef.current!.get(key);
        if (!still || still.id !== myId) {
          return;
        }
        const left = remaining - slice;
        if (left > 0) {
          hop(left);
          return;
        }
        fire();
      }, slice);
    };
    hop(delayMs);
  };

  // Forward-declared so tick and scheduleNext can reference each other.
  const scheduleNextRef = useRef<(key: string, session: any) => void>(() => {});

  const tick = async (key: string) => {
    const run = runsRef.current!.get(key);
    if (!run?.running) {
      return;
    }
    // Never stake past the target. scheduleNext decides when to stop scheduling,
    // but a timer can fire arbitrarily LATE — the laptop sleeps, or Chromium
    // throttles a background renderer — and tick would then open and PAY for a
    // block the user never asked for. With several runs that is one wasted stake
    // each, silently, on wake. Re-check at spend time, not only at plan time.
    if (Math.floor(Date.now() / 1000) >= run.targetEndTime) {
      stop(key);
      return;
    }
    // The same count cap scheduleNext applies, re-checked at SPEND time. A timer
    // armed before the last block landed can still be in flight, and the whole
    // point of the cap is that no amount of clock skew or latency can make a run
    // open more stakes than were priced and disclosed.
    if (run.openedSessionIds.length >= run.total) {
      stop(key);
      return;
    }
    const myId = run.id;
    let newSession: any = null;
    try {
      // SEQUENTIAL: settle the old block before opening the next one. It has
      // expired by now (scheduleNext fires this at endsAt + CLOSE_BUFFER_SEC),
      // so this is a late close: it returns the unused remainder and holds the
      // used portion to end of day. It does NOT fund the next block — that was
      // the old "recycle the same stake" premise, and the deployed contract
      // does not implement it. Waiting for the close is still required: the
      // previous code slept 12s and hoped, below the floor of the router's
      // 1-minute autoclose sweep, so the reopen reverted with block 1 paid for.
      //
      // Best-effort on purpose: if the close fails (provider unreachable, so no
      // signed receipt) we fall through and try the open anyway. The router's
      // sweep will close it eventually; the worst case is the old behaviour, not
      // a stuck run.
      if (!run.overlap) {
        const prev = run.openedSessionIds[run.openedSessionIds.length - 1];
        if (prev) {
          try {
            await closeBlock(prev);
            await waitForClose(prev);
          } catch (e) {
            console.warn('keep-alive: sequential close/settle wait failed', e);
          }
        }
        // Re-check identity: the close + wait can take a minute, and Stop or a
        // new run on this chat may have happened meanwhile.
        if (runsRef.current!.get(key)?.id !== myId) {
          return;
        }
      }
      const newId = await openBlock(
        run.modelId,
        run.isDirectPay,
        run.bidId,
        // The remainder, not a full unit — scheduleNext sized it. Opening the
        // full unit here is what made an 8-day ask lock MOR for fourteen.
        run.nextBlockSeconds || run.blockSeconds,
      );
      if (!newId) {
        throw new Error('no session id returned');
      }
      newSession = await fetchSession(newId);
      if (!newSession) {
        throw new Error('opened session not yet queryable');
      }
    } catch (e) {
      console.error('keep-alive: could not open next block', e);
      // Only tear down if this is still OUR run (a newer run on the same chat
      // manages itself). Scoped to this key so one chat's failure to restake
      // cannot end another chat's healthy run.
      if (runsRef.current!.get(key)?.id === myId) {
        toasts.toast(
          'info',
          'Session ended — could not open the next block.',
        );
        stop(key);
      }
      return;
    }
    // Re-check AFTER the await by run IDENTITY, not just `running`: if Stop (or a
    // new run on this chat) happened mid-open, don't revive/rotate. The one extra
    // block that opened lapses on its own (never closed).
    const cur = runsRef.current!.get(key);
    if (!cur?.running || cur.id !== myId) {
      return;
    }
    cur.index = Math.min(cur.index + 1, cur.total);
    cur.openedSessionIds.push(newSession.Id);
    persistBinding(key, newSession.Id, cur.modelId);
    publish();
    setSessionsByChat((prev) => ({ ...prev, [key]: newSession }));
    scheduleNextRef.current(key, newSession);
  };

  const scheduleNext = (key: string, session: any) => {
    const run = runsRef.current!.get(key);
    if (!run?.running) {
      return;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const endsAt = Number(session?.EndsAt);
    if (!Number.isFinite(endsAt)) {
      // No usable expiry — stop rather than fire immediately in a loop.
      console.error('keep-alive: block has no EndsAt; stopping', session);
      stop(key);
      return;
    }
    // Three independent reasons to stop opening. Each is a spend the user did
    // not agree to, so they are all checked before any restake.
    //
    //  (a) COUNT. Never open more blocks than the affordability gate priced.
    //      This is the hard one, and it is what makes a single-block session
    //      truly single: (b) below compares a CHAIN timestamp against a LOCAL
    //      deadline, so a local clock running slightly fast — or a block that
    //      the contract truncated a second short — made a 1-day session open a
    //      SECOND full-length stake. The gate had approved 1x, the disclosure
    //      promised one stake, and the wallet paid twice. A count that cannot
    //      be reached by any amount of skew is the fix; the clock comparison
    //      alone never could be.
    //  (b) COVERED. This block already reaches the target.
    //  (c) REMAINDER TOO SMALL. What is left is shorter than the shortest
    //      session the chain sells, so covering it would mean staking a whole
    //      further block for a few seconds of time. Stopping a hair early is
    //      strictly cheaper than that, and honest: the plan priced it this way.
    //
    // This predicate is the twin of planBlocks; changing either alone puts the
    // quote and the wallet back out of step.
    //
    // DON'T drop the session here — the current block keeps serving until it
    // lapses, and for a single-block run this IS the only block. Keep the status
    // live until it actually ends, then clear. (Clearing immediately bounced a
    // 5-minute min-duration session back to the picker.)
    const openedSoFar = run.openedSessionIds.length;
    const remainingSec = run.targetEndTime - endsAt;
    if (
      openedSoFar >= run.total ||
      remainingSec < MIN_REQUEST_SECONDS ||
      endsAt >= run.targetEndTime
    ) {
      const clearDelayMs = Math.max(0, (endsAt - nowSec) * 1000);
      const myId = run.id;
      clearRunTimer(run);
      armTimer(run, key, clearDelayMs, () => {
        // Identity-checked: a NEW run may have been started on this same chat
        // during the wait, and clearing by key alone would delete that live run.
        const dying = runsRef.current!.get(key);
        if (dying?.id === myId) {
          // Same retention as an explicit stop: this fires when the block ENDS,
          // but the id must stay claimed for the same reason (and a run that
          // reached its target is the commonest way a run ends).
          retire(dying, key);
          runsRef.current!.delete(key);
          publish();
        }
      });
      return;
    }
    // Seamless: open N+1 just BEFORE N ends (overlap → gapless inference).
    // Sequential: open N+1 just AFTER N ends, leaving a small gap.
    // Both commit the same amount. Only the closing-day slice of N's stake is
    // held (SessionRouter.sol:296-298, :305) — the rest returns at close — but a
    // renewing run cannot count on that timing, so there is still no saving to be
    // had by waiting.
    // Sequential still fires AFTER expiry, never at it: a close that mines
    // before endsAt leaves the session live and the reopen races it.
    const fireAt = run.overlap
      ? endsAt - OVERLAP_SEC
      : endsAt + CLOSE_BUFFER_SEC;
    // Cut the NEXT block to what is actually still needed. A run whose last
    // block is full-size stakes for time nobody asked for — at the 7-day unit
    // that is up to a week of a large stake locked past the end of the session.
    run.nextBlockSeconds = Math.max(
      MIN_REQUEST_SECONDS,
      Math.min(run.blockSeconds, run.targetEndTime - fireAt),
    );
    const delayMs = Math.max(0, (fireAt - nowSec) * 1000);
    clearRunTimer(run);
    armTimer(run, key, delayMs, () => {
      void tick(key);
    });
  };
  scheduleNextRef.current = scheduleNext;

  const start = useCallback(
    async ({
      modelId,
      chatId,
      totalSeconds,
      blockSeconds = MIN_REQUEST_SECONDS,
      isDirectPay,
      bidId = null,
      overlap = true,
      perBlockStakeWei = 0,
    }: StartKeepAliveOpts) => {
      // Replace only THIS chat's run. It used to be a bare stop() that killed
      // every run, which is what made concurrent auto-renewal impossible.
      stop(chatId);
      // Drop this chat's previous block so the consumer's mirror effect can't
      // route inference to a stale/expired session while the first block opens.
      // Scoped to this chat — other chats' live sessions must survive.
      setSessionsByChat((prev) => {
        if (!(chatId in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
      const myId = ++runCounterRef.current;
      // A block never runs longer than the target: buying a 5-minute session
      // must not open a 7-day one because the caller passed the cap as the unit.
      const unit = Math.max(
        MIN_REQUEST_SECONDS,
        Math.min(blockSeconds, totalSeconds),
      );
      const total = blocksForDuration(totalSeconds, overlap, unit);
      const targetEndTime = Math.floor(Date.now() / 1000) + totalSeconds;
      runsRef.current!.set(chatId, {
        running: true,
        index: 1,
        total,
        targetEndTime,
        modelId,
        chatId,
        isDirectPay,
        bidId,
        overlap,
        blockSeconds: unit,
        nextBlockSeconds: unit,
        id: myId,
        timer: null,
        openedSessionIds: [],
        perBlockStakeWei: Number(perBlockStakeWei) || 0,
      });
      publish();

      let firstSession: any = null;
      try {
        const firstId = await openBlock(modelId, isDirectPay, bidId, unit);
        if (!firstId) {
          throw new Error('no session id returned');
        }
        firstSession = await fetchSession(firstId);
        if (!firstSession) {
          throw new Error('opened session not yet queryable');
        }
      } catch (e) {
        console.error('keep-alive: first block failed', e);
        if (runsRef.current!.get(chatId)?.id === myId) {
          toasts.toast('error', 'Could not start the session.');
          stop(chatId);
        }
        return;
      }
      if (
        runsRef.current!.get(chatId)?.id !== myId ||
        !runsRef.current!.get(chatId)?.running
      ) {
        return; // stopped or superseded during the await
      }
      runsRef.current!.get(chatId)?.openedSessionIds.push(firstSession.Id);
      persistBinding(chatId, firstSession.Id, modelId);
      setSessionsByChat((prev) => ({ ...prev, [chatId]: firstSession }));
      publish();
      scheduleNextRef.current(chatId, firstSession);
    },
    // client/toasts are stable; url/address are read via refs inside the calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stop],
  );

  // Clear every pending timer if the whole app shell unmounts (app close).
  useEffect(
    () => () => {
      runsRef.current!.forEach((run) => clearRunTimer(run));
    },
    [],
  );

  const runningCount = useMemo(
    () => Object.values(statuses).filter((s) => s.running).length,
    [statuses],
  );

  const value = useMemo(
    () => ({
      statuses,
      sessionsByChat,
      sessionIdsByChat,
      retainedSessionIds,
      runningCount,
      committedOverlapWei,
      start,
      stop,
    }),
    [
      statuses,
      sessionsByChat,
      sessionIdsByChat,
      retainedSessionIds,
      runningCount,
      committedOverlapWei,
      start,
      stop,
    ],
  );

  return (
    <KeepAliveContext.Provider value={value}>
      {children}
    </KeepAliveContext.Provider>
  );
};

export const KeepAliveProvider = withClient(KeepAliveProviderInner);
