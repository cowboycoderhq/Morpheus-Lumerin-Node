import React from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { mount } from './_mount.jsx';
import {
  KeepAliveProviderInner,
  useKeepAlive,
  MIN_REQUEST_SECONDS,
} from '../../../../src/renderer/src/components/keepalive/KeepAliveProvider';

// Concurrent auto-renewal. The provider used to hold ONE run, ONE timer ref and
// ONE currentSession, and start() opened with a blanket stop() — so a second
// rolling session silently killed the first, and the first's pending restake
// timer was overwritten. Pure-function checks cannot see any of that: the bug
// lives in per-run timer ownership and run identity. So this mounts the REAL
// provider and drives two runs against the SAME provider bid.
//
// Time is virtual. Blocks are 305s, so a real-clock test would take hours: every
// setTimeout fires immediately and ADVANCES a fake Date.now by the delay it
// asked for, which keeps every endsAt/fireAt computation in the component
// honest while collapsing wall-clock to nothing.
let virtualNowMs = 1_700_000_000_000;
const realSetTimeout = window.setTimeout.bind(window);
Date.now = () => virtualNowMs;
// A small REAL delay rather than 0: firing instantly would run all 20 blocks
// inside one microtask storm, so the case could never observe two runs alive at
// the same moment — which is the property under test.
window.setTimeout = (fn, ms) =>
  realSetTimeout(() => {
    virtualNowMs += Number(ms) || 0;
    fn();
  }, 10);

// Every open is recorded so the case can assert BOTH runs kept restaking, and
// that each chat's sessions stayed its own.
const opens = [];
let nextSessionNum = 0;

const SAME_BID = '0xbid-same-provider';

const fakeClient = {
  getFailoverSetting: async () => ({ isEnabled: false }),
  getAuthHeaders: async () => ({}),
};

window.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('/session') && opts?.method === 'POST') {
    nextSessionNum += 1;
    const id = `0xsess${nextSessionNum}`;
    // The bid id in the path is the pinned provider; record it so the case can
    // prove both runs really staked against the SAME provider.
    const bid = u.match(/\/bids\/([^/]+)\/session/)?.[1] ?? null;
    opens.push({ id, bid, atSec: Math.floor(virtualNowMs / 1000) });
    return { ok: true, json: async () => ({ sessionID: id }) };
  }
  if (u.includes('/blockchain/sessions/user')) {
    // Every opened session is queryable immediately, ending at now + one block.
    return {
      ok: true,
      json: async () => ({
        sessions: opens.map((o) => ({
          Id: o.id,
          EndsAt: o.atSec + MIN_REQUEST_SECONDS,
          BidID: o.bid,
          ModelAgentId: '0xmodelA',
        })),
      }),
    };
  }
  return { ok: true, json: async () => ({}) };
};

const store = createStore((s) => s, {
  chain: { wallet: { address: '0xuser' } },
  config: { chain: { localProxyRouterUrl: 'http://router.test' } },
});

// Drives the provider and reports what happened. Buttons rather than an
// auto-run so the driver controls ordering deterministically.
const Probe = () => {
  const ka = useKeepAlive();
  const running = Object.values(ka.statuses).filter((s) => s.running);
  const sessionOf = (id) => ka.sessionsByChat[id]?.Id ?? '-';
  return (
    <div style={{ fontFamily: 'monospace', padding: 12 }}>
      <button
        data-testid="start-a"
        onClick={() =>
          ka.start({
            modelId: '0xmodelA',
            chatId: 'chatA',
            totalSeconds: 20 * MIN_REQUEST_SECONDS,
            isDirectPay: false,
            bidId: SAME_BID,
          })
        }
      >
        start A
      </button>
      <button
        data-testid="start-b"
        onClick={() =>
          ka.start({
            modelId: '0xmodelA',
            chatId: 'chatB',
            totalSeconds: 20 * MIN_REQUEST_SECONDS,
            isDirectPay: false,
            bidId: SAME_BID,
          })
        }
      >
        start B
      </button>
      <button data-testid="stop-a" onClick={() => ka.stop('chatA')}>
        stop A
      </button>
      <div data-testid="running-count">{ka.runningCount}</div>
      <div data-testid="running-chats">
        {running
          .map((s) => s.chatId)
          .sort()
          .join(',')}
      </div>
      <div data-testid="session-a">{sessionOf('chatA')}</div>
      <div data-testid="session-b">{sessionOf('chatB')}</div>
      <div data-testid="opens">{JSON.stringify(opens)}</div>
    </div>
  );
};

mount(
  <Provider store={store}>
    <KeepAliveProviderInner client={fakeClient}>
      <Probe />
    </KeepAliveProviderInner>
  </Provider>,
);
