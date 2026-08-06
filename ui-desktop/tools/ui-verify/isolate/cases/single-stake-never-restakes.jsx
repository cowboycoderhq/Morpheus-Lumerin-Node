import React from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { mount } from './_mount.jsx';
import {
  KeepAliveProviderInner,
  useKeepAlive,
} from '../../../../src/renderer/src/components/keepalive/KeepAliveProvider';

// A session that fits inside the chain's per-session cap must be ONE stake.
//
// This is the case adversarial review said could not exist. The other
// session-length cases stub the keep-alive context and assert on the ARGUMENTS
// Chat hands it — so the loop that actually spends MOR was never exercised for a
// typed length, and the defect below lived entirely downstream of that boundary:
//
//   scheduleNext compared a CHAIN-reported `EndsAt` against a LOCALLY computed
//   `targetEndTime`. Any reason for the chain's end to land a hair short of the
//   local deadline — a fast local clock, the seconds spent mining the open, the
//   contract truncating stake→duration — made the run open a SECOND full-length
//   block. The user had been quoted one stake, the affordability gate had
//   approved 1x, and the wallet paid twice.
//
// So this mounts the REAL provider and rigs the chain to report an end 30s SHORT
// of the target — the exact condition — then asserts one open. The fix under
// test is the block-COUNT cap (`openedSessionIds.length >= run.total`), which no
// amount of skew can defeat; the clock comparison alone never could.
const CAP = 7 * 24 * 60 * 60;
const ONE_DAY = 24 * 60 * 60;
// How far short of the ask the chain reports the session ending.
const SHORTFALL_SEC = 30;

// Virtual time: a one-day block would otherwise take a day to observe. Every
// setTimeout fires ~immediately and advances a fake clock by the delay it asked
// for, so every endsAt/fireAt computation inside the component stays honest.
let virtualNowMs = 1_700_000_000_000;
const realSetTimeout = window.setTimeout.bind(window);
Date.now = () => virtualNowMs;
window.setTimeout = (fn, ms) =>
  realSetTimeout(() => {
    virtualNowMs += Number(ms) || 0;
    fn();
  }, 5);

const opens = [];
let nextSessionNum = 0;

const fakeClient = {
  getFailoverSetting: async () => ({ isEnabled: false }),
  getAuthHeaders: async () => ({}),
};

window.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('/session') && opts?.method === 'POST') {
    nextSessionNum += 1;
    const id = `0xsess${nextSessionNum}`;
    const body = JSON.parse(opts.body || '{}');
    opens.push({
      id,
      atSec: Math.floor(virtualNowMs / 1000),
      // The duration Chat/the provider asked to stake for. A second entry here
      // IS the defect.
      sessionDuration: body.sessionDuration,
    });
    return { ok: true, json: async () => ({ sessionID: id }) };
  }
  if (u.includes('/blockchain/sessions/user')) {
    return {
      ok: true,
      json: async () => ({
        sessions: opens.map((o) => ({
          Id: o.id,
          // SHORT of what was asked for — the adversarial condition.
          EndsAt: o.atSec + o.sessionDuration - SHORTFALL_SEC,
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

const Probe = () => {
  const ka = useKeepAlive();
  return (
    <div style={{ fontFamily: 'monospace', padding: 12 }}>
      {/* A 1-day ask: inside the cap, so blockSeconds === the whole ask and the
          plan is exactly one block. */}
      <button
        data-testid="start-one-day"
        onClick={() =>
          ka.start({
            modelId: '0xmodelA',
            chatId: 'chatOne',
            totalSeconds: ONE_DAY,
            blockSeconds: ONE_DAY,
            isDirectPay: false,
          })
        }
      >
        start 1 day
      </button>
      {/* An 8-day ask: past the cap, so it chains — and the SECOND block must be
          the remainder (~1 day), not another full week. */}
      <button
        data-testid="start-eight-days"
        onClick={() =>
          ka.start({
            modelId: '0xmodelA',
            chatId: 'chatEight',
            totalSeconds: 8 * ONE_DAY,
            blockSeconds: CAP,
            isDirectPay: false,
            overlap: true,
          })
        }
      >
        start 8 days
      </button>
      <div data-testid="opens">{JSON.stringify(opens)}</div>
      <div data-testid="open-count">{opens.length}</div>
      <div data-testid="running-count">{ka.runningCount}</div>
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
