import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'styled-components';
import theme from '../../../../src/renderer/src/ui/theme';
import { ToastsContext } from '../../../../src/renderer/src/components/toasts';
import { Chat } from '../../../../src/renderer/src/components/chat/Chat';

// Partial-provider affordability, on the REAL Chat.
//
// A model is served by several providers at DIFFERENT prices and opening a
// session matches ONE of them. The money question this pins: with a balance that
// covers only some of them, does the app (a) still let you stake, and (b) tell
// you the truth about how many you can afford?
//
// withChatState only maps redux/context into props, so we mount the unwrapped
// Chat with mock props — every input the affordability math reads (bids, meta,
// balance) arrives through getModelsData, so the whole state is drivable from
// here without a redux double.
//
// Numbers are chosen so the count is arithmetic, not a coincidence:
//   supply/budget = 1  =>  minStake(price) = price * 360   (the 6-min floor)
//   prices 1e15, 2e15, 1e16  =>  floors 0.36, 0.72, 3.6 MOR
// so ?bal= picks the regime:
//   1e18  (1 MOR)   -> 2 of 3 affordable  -> the warning
//   1e19  (10 MOR)  -> 3 of 3 affordable  -> NO warning (it must not cry wolf)
//   1e14            -> 0 of 3 affordable  -> "You'll need some MOR"
const MODEL_ID = '0xmodel0000000000000000000000000000000000000000000000000001';
const P1 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const P2 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const P3 = '0xcccccccccccccccccccccccccccccccccccccccc';

const bal = new URLSearchParams(location.search).get('bal') || '1000000000000000000';

const providers = [
  { Address: P1, Endpoint: 'p1:3333', Name: 'Provider One' },
  { Address: P2, Endpoint: 'p2:3333', Name: 'Provider Two' },
  { Address: P3, Endpoint: 'p3:3333', Name: 'Provider Three' },
];

const models = [
  { Id: MODEL_ID, Name: 'Test Model', isLocal: false, Tags: [], IpfsCID: '' },
];

const bids = [
  { Id: '0xbid1', Provider: P1, ModelAgentId: MODEL_ID, PricePerSecond: '1000000000000000' },
  { Id: '0xbid2', Provider: P2, ModelAgentId: MODEL_ID, PricePerSecond: '2000000000000000' },
  { Id: '0xbid3', Provider: P3, ModelAgentId: MODEL_ID, PricePerSecond: '10000000000000000' },
];

window.__opened = [];
window.__toasts = [];

const props = {
  address: '0xuser000000000000000000000000000000000001',
  symbol: 'MOR',
  config: { chain: { localProxyRouterUrl: 'http://127.0.0.1:9' } },
  client: {
    getChatHistoryTitles: async () => [],
    getChatHistory: async () => null,
    getAuthHeaders: async () => ({}),
    updateChatHistoryTitle: async () => {},
  },
  toasts: { toast: (t, m) => window.__toasts.push([t, m]) },
  // supply/budget = 1 keeps the stake formula (price*durMin*60*supply/budget)
  // readable: the floors are exactly price*360.
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
  onOpenSessionByBid: async (args) => {
    window.__opened.push({ route: 'bid', ...args });
    return null;
  },
  closeSession: async () => {},
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
});

createRoot(document.getElementById('root')).render(
  <MemoryRouter>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <ToastsContext.Provider value={props.toasts}>
          <div style={{ height: '100vh', display: 'flex' }}>
            <Chat {...props} />
          </div>
        </ToastsContext.Provider>
      </ThemeProvider>
    </QueryClientProvider>
  </MemoryRouter>,
);
