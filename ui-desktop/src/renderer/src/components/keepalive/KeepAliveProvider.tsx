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
  // A specific provider's bid to stake every block against; null = let the
  // router choose a provider each block ("Auto").
  bidId?: string | null;
  // Seamless (default): overlap blocks for gapless inference, needs ~2x a
  // block's stake free. Economy (false): open the next block only after the
  // current one expires and its stake returns — 1x stake, small inference gap.
  overlap?: boolean;
}

export interface KeepAliveContextValue {
  status: KeepAliveStatus | null;
  currentSession: any | null;
  start: (opts: StartKeepAliveOpts) => Promise<void>;
  stop: () => void;
}

export const KeepAliveContext = createContext<KeepAliveContextValue>({
  status: null,
  currentSession: null,
  start: async () => {},
  stop: () => {},
});

export const useKeepAlive = () => useContext(KeepAliveContext);

const KeepAliveProviderInner = ({ client, children }: any) => {
  const address = useSelector((s: any) => selectors.getWalletAddress(s));
  const url = useSelector((s: any) => selectors.getLocalProxyRouterUrl(s));
  const toasts = useContext(ToastsContext);

  const [status, setStatus] = useState<KeepAliveStatus | null>(null);
  const [currentSession, setCurrentSession] = useState<any | null>(null);

  // Mutable values the (long-lived) timer callback must read fresh, so it never
  // fires on a stale closure. runRef is the single source of truth for the run.
  const runRef = useRef<KeepAliveRun | null>(null);
  const runCounterRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;
  const addressRef = useRef(address);
  addressRef.current = address;

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const stop = useCallback(() => {
    clearTimer();
    runRef.current = null;
    setStatus(null);
    // Leave currentSession as the last block; it lapses on its own and Chat can
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
  const scheduleNextRef = useRef<(session: any) => void>(() => {});

  const tick = async () => {
    const run = runRef.current;
    if (!run?.running) {
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
      // Only tear down if this is still OUR run (a newer run manages itself).
      if (runRef.current?.id === myId) {
        toasts.toast(
          'info',
          'Rolling session ended — could not open the next block.',
        );
        stop();
      }
      return;
    }
    // Re-check AFTER the await by run IDENTITY, not just `running`: if Stop (or a
    // new run) happened mid-open, don't revive/rotate. The one extra block that
    // opened lapses on its own (never closed).
    const cur = runRef.current;
    if (!cur?.running || cur.id !== myId) {
      return;
    }
    const nextIndex = Math.min(cur.index + 1, cur.total);
    runRef.current = { ...cur, index: nextIndex };
    setStatus({
      running: true,
      index: nextIndex,
      total: cur.total,
      targetEndTime: cur.targetEndTime,
      modelId: cur.modelId,
      chatId: cur.chatId,
    });
    setCurrentSession(newSession);
    scheduleNextRef.current(newSession);
  };

  const scheduleNext = (session: any) => {
    const run = runRef.current;
    if (!run?.running) {
      return;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const endsAt = Number(session?.EndsAt);
    if (!Number.isFinite(endsAt)) {
      // No usable expiry — stop rather than fire immediately in a loop.
      console.error('keep-alive: block has no EndsAt; stopping', session);
      stop();
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
      clearTimer();
      timerRef.current = setTimeout(() => {
        runRef.current = null;
        setStatus(null);
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
    clearTimer();
    timerRef.current = setTimeout(() => {
      void tick();
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
    }: StartKeepAliveOpts) => {
      stop(); // replace any existing run
      // Drop the previous run's block so the consumer's mirror effect can't route
      // inference to a stale/expired session while this one's first block opens.
      setCurrentSession(null);
      const myId = ++runCounterRef.current;
      const total = blocksForDuration(totalSeconds, overlap);
      const targetEndTime = Math.floor(Date.now() / 1000) + totalSeconds;
      runRef.current = {
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
      };
      setStatus({ running: true, index: 1, total, targetEndTime, modelId, chatId });

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
        if (runRef.current?.id === myId) {
          toasts.toast('error', 'Could not start the rolling session.');
          stop();
        }
        return;
      }
      if (runRef.current?.id !== myId || !runRef.current?.running) {
        return; // stopped or superseded during the await
      }
      setCurrentSession(firstSession);
      scheduleNextRef.current(firstSession);
    },
    // client/toasts are stable; url/address are read via refs inside the calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stop],
  );

  // Clear the pending timer if the whole app shell unmounts (app close).
  useEffect(() => () => clearTimer(), []);

  const value = useMemo(
    () => ({ status, currentSession, start, stop }),
    [status, currentSession, start, stop],
  );

  return (
    <KeepAliveContext.Provider value={value}>
      {children}
    </KeepAliveContext.Provider>
  );
};

export const KeepAliveProvider = withClient(KeepAliveProviderInner);
