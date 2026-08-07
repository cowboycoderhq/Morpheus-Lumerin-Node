import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'styled-components';
import theme from '../../../../src/renderer/src/ui/theme';
import { ToastsContext } from '../../../../src/renderer/src/components/toasts';
import { Chat } from '../../../../src/renderer/src/components/chat/Chat';
import { KeepAliveContext } from '../../../../src/renderer/src/components/keepalive/KeepAliveProvider';

// A TYPED session length, on the REAL Chat.
//
// The length is what sets the stake now, so the number on screen and the number
// that gets staked have to be the same number. That is what this pins — plus the
// one structural claim the design rests on: a session inside the chain's
// per-session cap is ONE stake, and only a longer span is a chain of them.
//
// ONE provider on purpose. The affordability case already covers picking among
// several; here a second price would only make the arithmetic ambiguous.
// supply/budget = 1, price = 1e15 wei/s, so stake(T) = T * 1e15 wei exactly:
//   5 minutes (opened at the 305s cushioned floor) -> 0.305 MOR
//   1 day     (86,400s, inside the 7-day cap)      -> 86.40 MOR
//   one 7-day block (604,800s)                     -> 604.80 MOR
const MODEL_ID = '0xmodel0000000000000000000000000000000000000000000000000001';
const P1 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

// 2,000 MOR — clears even a seamless 7-day rotation (2 x 604.80) so nothing
// fails for lack of funds when the claim under test is about LENGTH.
const bal = new URLSearchParams(location.search).get('bal') || '2000000000000000000000';

const providers = [{ Address: P1, Endpoint: 'p1:3333', Name: 'Provider One' }];
const models = [
  { Id: MODEL_ID, Name: 'Test Model', isLocal: false, Tags: [], IpfsCID: '' },
];
const bids = [
  {
    Id: '0xbid1',
    Provider: P1,
    ModelAgentId: MODEL_ID,
    PricePerSecond: '1000000000000000',
  },
];

window.__opened = [];
window.__toasts = [];
// Every keep-alive start, with the two fields the design turns on: how long the
// whole session runs, and how long ONE staked block of it is.
window.__started = [];

const props = {
  address: '0xuser000000000000000000000000000000000001',
  symbol: 'MOR',
  config: {
    chain: {
      localProxyRouterUrl: 'http://127.0.0.1:9',
      diamondAddress: '0xdiamond00000000000000000000000000000001',
    },
  },
  client: {
    getChatHistoryTitles: async () => [],
    getChatHistory: async () => null,
    getAuthHeaders: async () => ({}),
    updateChatHistoryTitle: async () => {},
    // No ETH node URL -> getMaxSessionSeconds takes its documented fallback (the
    // 7-day deployment value) without a network call. The offline path is the
    // one a test can pin, and it is the one that must stay correct.
    getProxyRouterDerivedConfig: async () => ({ DerivedConfig: { EthNodeURLs: [] } }),
    // opencode handoff. The launch is deliberately SLOW so the intermediate
    // "Starting opencode…" state is observable — that state exists precisely
    // because the real call is not instant.
    getOpencodeStatus: async () => ({
      installed: true,
      version: '1.18.10',
      endpointRunning: true,
    }),
    openInOpencode: async () => {
      window.__opencodeCalls = (window.__opencodeCalls || 0) + 1;
      await new Promise((r) => setTimeout(r, 600));
      return { ok: true, modelId: 'test-model' };
    },
  },
  toasts: { toast: (t, m) => window.__toasts.push([t, m]) },
  getModelsData: async () => ({
    models,
    providers,
    meta: { supply: 1, budget: 1 },
    userBalances: { eth: '1000000000000000000', mor: bal },
  }),
  getSessionsByUser: async () => [],
  getProvidersAvailability: async () => [],
  getAllActiveBidsByModel: async () => new Map([[MODEL_ID, bids]]),
  getBidInfo: async () => ({}),
  getBidsByModelId: async () => bids,
  onOpenSession: async (args) => {
    window.__opened.push({ route: 'model', ...args });
    return null;
  },
  closeSession: async () => {},
};

// Record what Chat hands the engine instead of opening anything. The claim is
// about the ARGUMENTS — totalSeconds and blockSeconds — so a double that
// captures them is a sharper instrument here than a fake chain would be.
const keepAlive = {
  statuses: {},
  sessionsByChat: {},
  sessionIdsByChat: {},
  retainedSessionIds: {},
  runningCount: 0,
  committedOverlapWei: () => 0,
  start: async (opts) => {
    window.__started.push(opts);
  },
  stop: () => {},
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
});

createRoot(document.getElementById('root')).render(
  <MemoryRouter>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <ToastsContext.Provider value={props.toasts}>
          <KeepAliveContext.Provider value={keepAlive}>
            <div style={{ height: '100vh', display: 'flex' }}>
              <Chat {...props} />
            </div>
          </KeepAliveContext.Provider>
        </ToastsContext.Provider>
      </ThemeProvider>
    </QueryClientProvider>
  </MemoryRouter>,
);
