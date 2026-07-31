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

// REPRO (economy gap): chat A's run is still RUNNING, but its block has
// already expired and the next has not opened yet. The chat
// file's persisted sessionId is b3 — the block that was current at the user's
// last prompt (the router only writes SessionID on a PROMPT, not on a rotation).
// The user visits chat B, then clicks back to chat A.
const MODEL_ID = '0xmodelA';
const P1 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const now = Math.floor(Date.now() / 1000);
const mk = (id, endsIn, closed) => ({ Id: id, ModelAgentId: MODEL_ID, BidID: '0xbid1',
  EndsAt: now + endsIn, OpenedAt: now - 600, ClosedAt: closed ? now - 10 : 0, Stake: '305000000000000000' });

const B3 = mk('0xb3', -320, true);   // lapsed, auto-closed
const B5 = mk('0xb5', -20, false);   // ECONOMY GAP: run still running, block LAPSED
const SESS_B = mk('0xsessB', 900, false); // chat B's own session

const models = [{ Id: MODEL_ID, Name: 'Test Model', isLocal: false, Tags: [], IpfsCID: '' }];
const providers = [{ Address: P1, Endpoint: 'p1:3333', Name: 'Provider One' }];
const bids = [{ Id: '0xbid1', Provider: P1, ModelAgentId: MODEL_ID, PricePerSecond: '1000000000000000' }];

window.__sent = [];
const realFetch = window.fetch.bind(window);
window.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('/v1/chat/completions')) {
    window.__sent.push({ session_id: opts?.headers?.session_id, chat_id: opts?.headers?.chat_id });
    return { ok: true, body: { getReader: () => ({ read: async () => ({ done: true }) }) }, json: async () => ({}) };
  }
  return realFetch(url, opts);
};

const C5 = mk('0xc5', 260, false); // a SECOND live run's current block
const keepAliveValue = {
  statuses: {
    chatA: { running: true, index: 5, total: 20, targetEndTime: now + 4000, modelId: MODEL_ID, chatId: 'chatA' },
    chatC: { running: true, index: 5, total: 20, targetEndTime: now + 4000, modelId: MODEL_ID, chatId: 'chatC' },
  },
  sessionsByChat: { chatA: B5, chatC: C5 },
  sessionIdsByChat: { chatA: ['0xb3', '0xb4', '0xb5'], chatC: ['0xc5'] },
  runningCount: 2,
  committedOverlapMor: () => 0, start: async () => {}, stop: () => {},
};

const titles = [
  { chatId: 'chatA', title: 'Rolling A', modelId: MODEL_ID, createdAt: now - 900, isLocal: false, sessionId: '0xb3' },
  { chatId: 'chatB', title: 'Plain B',   modelId: MODEL_ID, createdAt: now - 800, isLocal: false, sessionId: '0xsessB' },
];

const props = {
  address: '0xuser000000000000000000000000000000000001',
  symbol: 'MOR',
  config: { chain: { localProxyRouterUrl: 'http://127.0.0.1:9' } },
  client: {
    getChatHistoryTitles: async () => titles,
    getChatHistory: async () => ({ title: 'x', modelId: MODEL_ID, messages: [] }),
    getAuthHeaders: async () => ({}),
    updateChatHistoryTitle: async () => {},
  },
  toasts: { toast: (t, m) => console.log('[toast]', t, m) },
  getModelsData: async () => ({ models, providers, meta: { supply: 1, budget: 1 },
    userBalances: { eth: '1000000000000000000', mor: '10000000000000000000' } }),
  getSessionsByUser: async () => [B5, C5, SESS_B, B3],
  getProvidersAvailability: async () => [],
  getAllActiveBidsByModel: async () => new Map([[MODEL_ID, bids]]),
  getBidInfo: async () => bids[0],
  getBidsByModelId: async () => bids,
  onOpenSession: async () => null,
  onOpenSessionByBid: async () => null,
  closeSession: async () => {},
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30000 } } });
queryClient.setQueryData(queryKeys.modelsData, { models, providers, meta: { supply: 1, budget: 1 }, userBalances: { eth: '1000000000000000000', mor: '10000000000000000000' } });
queryClient.setQueryData(queryKeys.sessions(props.address), [B5, C5, SESS_B, B3]);
queryClient.setQueryData(queryKeys.chatTitles, titles);

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
