import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import styled, { keyframes } from 'styled-components';
import OfflineWarning from './OfflineWarning';
// import ChangePassword from './ChangePassword'
import Dashboard from './dashboard/Dashboard';
import Sidebar from './sidebar/Sidebar';
import Chat from './chat/Chat';
import Models from './models/Models';
import Agents from './agents/Agents';
import Settings from './settings/Settings';
import 'bootstrap/dist/css/bootstrap.min.css';
import Providers from './providers/Providers';
import withChatState from '../store/hocs/withChatState';
import { queryKeys, buildModelsWithBids } from '../store/queries';

const fadeIn = keyframes`
  from {
    transform: scale(1.025);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
`;

const Container = styled.div`
  display: flex;
  height: 100vh;
  padding-left: 64px;
  background: ${p => p.theme.colors.void};
  color: ${p => p.theme.colors.textPrimary};
  animation: ${fadeIn} ${p => p.theme.motion.duration.slow} ${p =>
    p.theme.motion.easing.enter};

  @media (min-width: 800px) {
    left: 200px;
    padding-left: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Main = styled.div`
  flex-grow: 1;
  overflow-x: hidden;
  overflow-y: hidden;
  min-height: 100vh;
  position: relative;
  background: ${p => p.theme.colors.void};
  /* Contain every content z-index inside Main: without this, any screen's
     overlay (Chat's LoadingCover at z-index 5) stacks ABOVE the sidebar rail
     (z-index 3) in the <800px overlay layout and eats its hover — the rail
     "doesn't extend properly" while a page is loading. In-page portals
     (modals, toasts) mount on document.body and are unaffected. */
  isolation: isolate;

  /* Scanlines — the HUD's atmosphere, applied once at the shell so every screen
     gets it instead of each one re-implementing it. 2% contrast and
     pointer-events:none, so it never competes with content or eats a click.
     Suppressed under prefers-reduced-motion, where overlays like this are
     exactly what people are asking not to see. */
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 5;
    background: repeating-linear-gradient(
      0deg,
      rgba(170, 225, 255, 0.02) 0 1px,
      transparent 1px 3px
    );
  }

  @media (prefers-reduced-motion: reduce) {
    &::after {
      display: none;
    }
  }
`;

// Warms the Chat tab's two gating caches as soon as the main app shell mounts:
// sessions (the heaviest, paginated call) AND the models/providers composite.
// Chat's full-screen spinner waits on exactly these — prefetching them during
// the seconds the user spends on the landing tab makes the first Chat visit
// land warm instead of behind a spinner. Uses withChatState so the query fns
// and keys are the SAME ones Chat uses (no drift, perfect cache hits).
// Failures are non-fatal — the tabs refetch.
const DataPrefetcher = withChatState(
  ({
    getModelsData,
    getSessionsByUser: getSessions,
    getAllActiveBidsByModel,
    address,
  }: any) => {
    const queryClient = useQueryClient();

    useEffect(() => {
      queryClient
        .prefetchQuery({
          queryKey: queryKeys.modelsData,
          queryFn: () => getModelsData(),
        })
        // The marketplace bids are the expensive part (21 provider fetches, ~9s)
        // and they were only started when the user OPENED the model picker — so
        // they always paid for it, staring at "Loading marketplace options…".
        // Warm them here instead, chained after modelsData because the merge needs
        // its provider list. By the time the picker is opened the list is there.
        .then(() =>
          queryClient.prefetchQuery({
            queryKey: queryKeys.modelsWithBids,
            queryFn: () =>
              buildModelsWithBids(
                queryClient.getQueryData(queryKeys.modelsData),
                getAllActiveBidsByModel,
              ),
          }),
        )
        .catch((e) => console.warn('Models prefetch failed', e));
      if (!address) {
        return;
      }
      queryClient
        .prefetchQuery({
          queryKey: queryKeys.sessions(address),
          queryFn: () => getSessions(address),
        })
        .catch((e) => console.warn('Session prefetch failed', e));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address, queryClient]);

    return null;
  },
);

export const Layout = () => (
  <Container data-testid="router-container">
    <Sidebar />
    <Main
      data-scrollelement // Required by react-virtualized implementation in Dashboard/TxList
    >
      <Routes>
        <Route path="/wallet" element={<Dashboard />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/models" element={<Models />} />
        <Route path="/providers" element={<Providers />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate replace to="/wallet" />} />
      </Routes>
    </Main>
    {/* <AutoPriceAdjuster /> */}
    <DataPrefetcher />
    <OfflineWarning />
  </Container>
);

export default function Router() {
  return (
    <HashRouter>
      <Layout />
    </HashRouter>
  );
}
