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

// A rolling ("keep-alive") session chains 6-minute stakes to the same model so a
// user stays in inference for a chosen window while only ~one 6-minute stake is
// ever locked. This lives ABOVE the tab router (mounted in Router.tsx) so the
// restaking keeps going even when the user leaves the Chat tab — the whole point
// of "keep-alive". Chat consumes this context for its badge and to route
// inference to the current block.
//
// Fund-safety (verified against SessionRouter.sol):
// - Never programmatically CLOSE a block. Closing before EndsAt time-locks most
//   of the stake for ~24h. Each block expires naturally (the router's
//   SessionExpiryHandler closes it after EndsAt) → full stake returned, no hold.
//   Stop only stops scheduling; the current block lapses on its own.
// - Open block N+1 shortly BEFORE N expires (OVERLAP_SEC) so inference never
//   drops. Peak lockup ~2x a 6-min stake during the overlap, then back to 1x.

export const MIN_REQUEST_SECONDS = 5 * 60 + 5; // block unit: 305s = 300s contract floor + 5s cushion for stake→duration truncation
export const OVERLAP_SEC = 25; // seamless mode: open the next block this early; covers open-tx latency
export const REOPEN_DELAY_SEC = 12; // economy mode: open the next block this long AFTER the old one ends

// How far the run advances in wall-clock per block. Blocks do NOT tile
// end-to-end: seamless OVERLAPS by OVERLAP_SEC, economy leaves a REOPEN_DELAY_SEC
// gap. Pricing a run as ceil(target / MIN_REQUEST_SECONDS) therefore under-counts
// seamless (measured: 2 priced, 3 opened) and over-counts economy (94 priced, 91
// opened). Every consumer that needs a block COUNT must go through
// blocksForDuration so the affordability gate prices what the loop actually opens.
export const strideSeconds = (overlap: boolean): number =>
  overlap
    ? MIN_REQUEST_SECONDS - OVERLAP_SEC
    : MIN_REQUEST_SECONDS + REOPEN_DELAY_SEC;

// Blocks needed to cover targetSec. Block 1 covers MIN_REQUEST_SECONDS; each
// further block advances one stride. Mirrors scheduleNext's stop condition
// (`endsAt >= targetEndTime`) exactly — if one changes, the other must.
export const blocksForDuration = (
  targetSec: number,
  overlap: boolean,
): number =>
  Math.max(
    1,
    Math.ceil((targetSec - MIN_REQUEST_SECONDS) / strideSeconds(overlap)) + 1,
  );

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
  perBlockStakeMor: number;
}

export interface StartKeepAliveOpts {
  modelId: string;
  chatId: string;
  // SECONDS, not minutes. The slider steps in whole 305s blocks, so a minutes
  // round-trip (sec/60 here, *60 there) reintroduced float error: (16165/60)*60
  // = 16165.000000000002, which shifted the block count by one at one slider
  // position out of 94. Seconds are exact.
  totalSeconds: number;
  isDirectPay: boolean;
  // MOR one block of this run stakes. Recorded so the provider can tell a new
  // run's affordability gate what the existing runs still need.
  perBlockStakeMor?: number;
  // A specific provider's bid to stake every block against; null = let the
  // router choose a provider each block ("Auto").
  bidId?: string | null;
  // Seamless (default): overlap blocks for gapless inference, needs ~2x a
  // block's stake free. Economy (false): open the next block only after the
  // current one expires and its stake returns — 1x stake, small inference gap.
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
  // MOR that live runs OTHER than `exceptChatId` still need to fund their next
  // overlap. A new run's gate must add this to its own requirement: each run
  // asking only "can I peak at 2x?" oversubscribes the wallet once several are
  // live, and every run that loses the race reverts having already paid for its
  // first block.
  committedOverlapMor: (exceptChatId?: string) => number;
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
  committedOverlapMor: () => 0,
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
  const committedOverlapMor = useCallback((exceptChatId?: string) => {
    let total = 0;
    runsRef.current!.forEach((run, key) => {
      if (!run.running || key === exceptChatId) {
        return;
      }
      const per = Number(run.perBlockStakeMor);
      if (Number.isFinite(per) && per > 0) {
        total += per;
      }
    });
    return total;
  }, []);

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

  // Open ONE 6-minute block (replicates withChatState.onOpenSession's router call,
  // reusable outside the Chat component). With a bidId, stakes against that
  // specific provider; without, the router picks one. Returns the session id.
  const openBlock = async (
    modelId: string,
    isDirectPay: boolean,
    bidId: string | null,
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
        sessionDuration: MIN_REQUEST_SECONDS,
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
    const myId = run.id;
    let newSession: any = null;
    try {
      const newId = await openBlock(run.modelId, run.isDirectPay, run.bidId);
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
          'Rolling session ended — could not open the next block.',
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
    // This block already covers the target: no more restakes. Test the block's
    // OWN expiry, not `nowSec + MIN_REQUEST_SECONDS` — the next block would start
    // at `fireAt` (one stride away), not one full block away, so the old form
    // under-counted seamless by OVERLAP_SEC per block and kept opening: a 2-block
    // purchase ran 3 blocks, a 94-block one ran 103. This predicate is the twin of
    // blocksForDuration; changing either alone re-opens that gap.
    //
    // DON'T drop the session here — the current block keeps serving until it
    // lapses, and for a single-block (minimum-duration) run this IS the only
    // block. Keep the status live until it actually ends, then clear. (Clearing
    // immediately bounced a 5-minute min-duration session back to the picker.)
    if (endsAt >= run.targetEndTime) {
      const clearDelayMs = Math.max(0, (endsAt - nowSec) * 1000);
      const myId = run.id;
      clearRunTimer(run);
      run.timer = setTimeout(() => {
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
      }, clearDelayMs);
      return;
    }
    // Seamless: open N+1 just BEFORE N ends (overlap → gapless, 2x stake).
    // Economy: open N+1 just AFTER N ends, once its stake has returned (1x
    // stake, small gap while the stake recycles).
    const fireAt = run.overlap
      ? endsAt - OVERLAP_SEC
      : endsAt + REOPEN_DELAY_SEC;
    const delayMs = Math.max(0, (fireAt - nowSec) * 1000);
    clearRunTimer(run);
    run.timer = setTimeout(() => {
      void tick(key);
    }, delayMs);
  };
  scheduleNextRef.current = scheduleNext;

  const start = useCallback(
    async ({
      modelId,
      chatId,
      totalSeconds,
      isDirectPay,
      bidId = null,
      overlap = true,
      perBlockStakeMor = 0,
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
      const total = blocksForDuration(totalSeconds, overlap);
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
        id: myId,
        timer: null,
        openedSessionIds: [],
        perBlockStakeMor: Number(perBlockStakeMor) || 0,
      });
      publish();

      let firstSession: any = null;
      try {
        const firstId = await openBlock(modelId, isDirectPay, bidId);
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
          toasts.toast('error', 'Could not start the rolling session.');
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
      committedOverlapMor,
      start,
      stop,
    }),
    [
      statuses,
      sessionsByChat,
      sessionIdsByChat,
      retainedSessionIds,
      runningCount,
      committedOverlapMor,
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
