import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router';
import { useSelector } from 'react-redux';
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
import { withClient } from '../store/hocs/clientContext';
import selectors from '../store/selectors';
import { queryKeys } from '../store/queries';
import { getSessionsByUser } from '../store/utils/apiCallsHelper';

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
  /* Contain child z-indexes so a screen's overlay (e.g. a loading cover) can't
     stack above the sidebar rail in the narrow (<800px) overlay layout. */
  isolation: isolate;

  /* Scanlines — the HUD's atmosphere, applied once at the shell so every screen
     gets it instead of each one re-implementing it. Faint and
     pointer-events:none, so it never competes with content or eats a click.
     The colour token carries its own off-switch: classic sets it transparent.
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
      ${p => p.theme.colors.scanline} 0 1px,
      transparent 1px 3px
    );
  }

  @media (prefers-reduced-motion: reduce) {
    &::after {
      display: none;
    }
  }
`;

// Warms the shared session cache as soon as the main app shell mounts, so the
// first visit to the Chat or Wallet tab finds sessions already loaded (the
// heaviest, paginated, cross-tab call). Subsequent visits hit the cache via the
// stale-while-revalidate config. Failures are non-fatal — the tabs refetch.
const SessionPrefetcher = withClient(({ client }: any) => {
  const queryClient = useQueryClient();
  const address = useSelector((state: any) => selectors.getWalletAddress(state));
  const url = useSelector((state: any) =>
    selectors.getLocalProxyRouterUrl(state),
  );

  useEffect(() => {
    if (!address || !url) {
      return;
    }
    queryClient
      .prefetchQuery({
        queryKey: queryKeys.sessions(address),
        queryFn: async () => {
          const authHeaders = await client.getAuthHeaders();
          return (await getSessionsByUser(url, address, authHeaders)) || [];
        },
      })
      .catch((e) => console.warn('Session prefetch failed', e));
  }, [address, url, queryClient, client]);

  return null;
});

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
    <SessionPrefetcher />
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
