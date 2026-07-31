import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'styled-components';
import theme from '@renderer/ui/theme';
import { ToastsContext } from '@renderer/components/toasts';
import { Chat } from '@renderer/components/chat/Chat';
import { KeepAliveContext } from '@renderer/components/keepalive/KeepAliveProvider';
import { queryKeys } from '@renderer/store/queries';

// REPRO: Chat remounts (Wallet tab -> back) while TWO rolling runs are live.
// The mount-restore effect bails (running.length !== 1), but the boot
// useLayoutEffect still adopts openSessions[0] into a BRAND NEW chat id.
const MODEL_ID = '0xmodelA';
const P1 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const now = Math.floor(Date.now() / 1000);

const SESS_A = { Id: '0xsessA', ModelAgentId: MODEL_ID, BidID: '0xbid1',
  EndsAt: now + 300, OpenedAt: now - 5, Stake: '305000000000000000', ClosedAt: 0 };
const SESS_B = { Id: '0xsessB', ModelAgentId: MODEL_ID, BidID: '0xbid1',
  EndsAt: now + 300, OpenedAt: now - 5, Stake: '305000000000000000', ClosedAt: 0 };

const SESS_FREE = { Id: '0xfree', ModelAgentId: MODEL_ID, BidID: '0xbid1',
  EndsAt: now + 900, OpenedAt: now - 5, Stake: '305000000000000000', ClosedAt: 0 };
const models = [{ Id: MODEL_ID, Name: 'Test Model', isLocal: false, Tags: [], IpfsCID: '' }];
const providers = [{ Address: P1, Endpoint: 'p1:3333', Name: 'Provider One' }];
const bids = [{ Id: '0xbid1', Provider: P1, ModelAgentId: MODEL_ID, PricePerSecond: '1000000000000000' }];

window.__sent = [];
const realFetch = window.fetch.bind(window);
window.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('/v1/chat/completions')) {
    window.__sent.push({ session_id: opts?.headers?.session_id, chat_id: opts?.headers?.chat_id });
    return { ok: true, body: { getReader: () => ({ read: async () => ({ done: true }) }) },
      json: async () => ({}) };
  }
  return realFetch(url, opts);
};

// Two live rolling runs, on chats the user actually owns.
const keepAliveValue = {
  statuses: {
    chatA: { running: true, index: 1, total: 10, targetEndTime: now + 3000, modelId: MODEL_ID, chatId: 'chatA' },
    chatB: { running: true, index: 1, total: 10, targetEndTime: now + 3000, modelId: MODEL_ID, chatId: 'chatB' },
  },
  sessionsByChat: { chatA: SESS_A, chatB: SESS_B },
  sessionIdsByChat: { chatA: ['0xsessA'], chatB: ['0xsessB'] },
  runningCount: 2,
  committedOverlapMor: () => 0,
  start: async () => {},
  stop: () => {},
};

const props = {
  address: '0xuser000000000000000000000000000000000001',
  symbol: 'MOR',
  config: { chain: { localProxyRouterUrl: 'http://127.0.0.1:9' } },
  client: {
    // Both rolling chats HAVE been prompted already, so they are in the drawer
    // with their bindings persisted — the strongest form of "owned".
    getChatHistoryTitles: async () => [
      { chatId: 'chatA', title: 'Rolling A', modelId: MODEL_ID, createdAt: now - 100, isLocal: false, sessionId: '0xsessA' },
      { chatId: 'chatB', title: 'Rolling B', modelId: MODEL_ID, createdAt: now - 100, isLocal: false, sessionId: '0xsessB' },
    ],
    getChatHistory: async () => null,
    getAuthHeaders: async () => ({}),
    updateChatHistoryTitle: async () => {},
  },
  toasts: { toast: (t, m) => console.log('[toast]', t, m) },
  getModelsData: async () => ({ models, providers, meta: { supply: 1, budget: 1 },
    userBalances: { eth: '1000000000000000000', mor: '10000000000000000000' } }),
  getSessionsByUser: async () => [SESS_A, SESS_B, SESS_FREE],
  getProvidersAvailability: async () => [],
  getAllActiveBidsByModel: async () => new Map([[MODEL_ID, bids]]),
  getBidInfo: async () => bids[0],
  getBidsByModelId: async () => bids,
  onOpenSession: async () => null,
  onOpenSessionByBid: async () => null,
  closeSession: async () => {},
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30000 } } });
// WARM CACHE: exactly what a Wallet-tab-and-back remount within staleTime sees —
// modelsData/sessions/titles are already in the app-level QueryClient, so they
// are present on the FIRST render (this is the normal remount path).
queryClient.setQueryData(queryKeys.modelsData, { models, providers, meta: { supply: 1, budget: 1 }, userBalances: { eth: '1000000000000000000', mor: '10000000000000000000' } });
queryClient.setQueryData(queryKeys.sessions(props.address), [SESS_A, SESS_B, SESS_FREE]);
queryClient.setQueryData(queryKeys.chatTitles, [
  { chatId: 'chatA', title: 'Rolling A', modelId: MODEL_ID, createdAt: now - 100, isLocal: false, sessionId: '0xsessA' },
  { chatId: 'chatB', title: 'Rolling B', modelId: MODEL_ID, createdAt: now - 100, isLocal: false, sessionId: '0xsessB' },
]);

createRoot(document.getElementById('root')).render(
  <MemoryRouter>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <ToastsContext.Provider value={props.toasts}>
          <KeepAliveContext.Provider value={keepAliveValue}>
            <div style={{ height: '100vh', display: 'flex' }}>
              <Chat {...props} />
            </div>
          </KeepAliveContext.Provider>
        </ToastsContext.Provider>
      </ThemeProvider>
    </QueryClientProvider>
  </MemoryRouter>,
);
