import { useEffect, useRef, useState } from 'react';
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
import StartPickerModal from './grok/StartPickerModal';
import WhatsNew from './WhatsNew';
import 'bootstrap/dist/css/bootstrap.min.css';
import Providers from './providers/Providers';
import { withClient } from '../store/hocs/clientContext';
import selectors from '../store/selectors';
import { queryKeys, buildModelsData } from '../store/queries';
import { getLiveSessionsByUser } from '../store/utils/apiCallsHelper';
import { FALLBACK_MAX_SESSION_SECONDS } from '../utils/marketplace';
import { KeepAliveProvider } from './keepalive/KeepAliveProvider';

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

// Warms what the Chat screen blocks on, as soon as the app shell mounts, so the
// first visit finds it already loaded. Subsequent visits hit the cache via the
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
    // Warm exactly what Chat's first paint blocks on, and nothing else.
    //
    // This used to prefetch the FULL session history — an unbounded serial walk
    // (one chain read per 50 sessions) that nothing gates on any more. It did
    // not merely waste work: it saturated the router at boot, so the requests
    // Chat actually needs queued behind it and the first click felt slow even
    // once Chat's own fetching was fixed.
    //
    // Now: the models composite (the real gate) and the bounded live-session
    // window. The historical tail loads lazily, in Chat, behind the paint.
    //
    // WAIT for the router first. This effect runs as soon as the wallet address
    // exists, which is well before the bundled proxy-router finishes starting —
    // so the prefetch used to fail with `fetch failed` on every launch, get
    // swallowed by the catch, and never retry. It looked like a warm cache and
    // was an empty one, and the user paid the full cost on their first click.
    let cancelled = false;
    const routerReady = async () => {
      for (let i = 0; i < 60 && !cancelled; i++) {
        try {
          const r = await fetch(`${url}/healthcheck`);
          if (r.ok) return true;
        } catch {
          /* not up yet */
        }
        await new Promise((res) => setTimeout(res, 1000));
      }
      return false;
    };

    routerReady().then((ready) => {
      if (!ready || cancelled) {
        return;
      }
      queryClient
        .prefetchQuery({
          queryKey: queryKeys.modelsData,
          queryFn: () => buildModelsData(url, client),
        })
        .catch((e) => console.warn('Models prefetch failed', e));

      queryClient
        .prefetchQuery({
          queryKey: queryKeys.liveSessions(address),
          queryFn: async () => {
            const authHeaders = await client.getAuthHeaders();
          // The deployment cap, not a chain read: this only decides how many
          // pages to walk, and Chat re-reads the live value for anything that
          // prices a stake. Over-walking by a page is free; a chain read here
          // would put another round trip in front of the thing we are warming.
            return await getLiveSessionsByUser(
              url,
              address,
              authHeaders,
              FALLBACK_MAX_SESSION_SECONDS,
            );
          },
        })
        .catch((e) => console.warn('Live session prefetch failed', e));
    });

    return () => {
      cancelled = true;
    };
  }, [address, url, queryClient, client]);

  return null;
});

/**
 * `/start`, typed in a grok terminal, has to surface SOMEWHERE in this window —
 * so the host sits above the routes rather than inside a tab. Putting it in Chat
 * would make the picker depend on which tab the user happened to be looking at.
 */
const GrokStartHost = withClient(({ client }: any) => {
  const [request, setRequest] = useState<any>(null);
  // Read by the unmount cleanup, which must not re-run every time `request`
  // changes — a cleanup that fires on every state change would cancel the very
  // offer it is showing.
  const requestRef = useRef<any>(null);
  requestRef.current = request;

  useEffect(() => {
    // No endpoint config is read here any more. It used to be fetched purely to
    // pass the picker a base URL and a bearer token; the picker's calls go
    // through main now, which reads the live values itself — so this window
    // never holds the credential and can never hold a stale one.
    const onRequest = async (_e: any, payload: any) => {
      setRequest(payload);
    };
    (window as any).ipcRenderer?.on?.('grok-picker-request', onRequest);

    // Claim anything raised before this host existed.
    //
    // This component lives inside the signed-in layout, so while the app is
    // LOCKED it is not mounted and the event above lands nowhere: the window
    // came forward showing the wallet screen, and the request that asked for it
    // was already lost. Mounting is exactly the moment that stops being true.
    let cancelled = false;
    void (async () => {
      try {
        const pending = await client.getPendingSessionOffer();
        if (pending && !cancelled) {
          await onRequest(null, pending);
        }
      } catch {
        // Nothing to claim, or the bridge is not ready — the next offer still
        // arrives on the channel above.
      }
    })();

    return () => {
      cancelled = true;
      (window as any).ipcRenderer?.removeListener?.('grok-picker-request', onRequest);
    };
  }, [client]);

  // An offer that is never answered holds the model's single in-flight slot,
  // so the next attempt is silently refused. The modal reports on Done and on
  // Cancel — but not if this host unmounts underneath it (a reload, a window
  // close, anything that tears the tree down). Report on the way out.
  useEffect(() => {
    return () => {
      if (requestRef.current) {
        void client.grokPickerDone({
          requestId: requestRef.current.requestId,
          opened: false,
          note: 'the window closed before it was answered',
        });
      }
    };
  }, [client]);

  if (!request) return null;
  return (
    <StartPickerModal
      open
      args={request.args ?? ''}
      // Reported the moment the session opens, so the offer is released and the
      // model list republished while the dialog is still up — a terminal that
      // was refused can succeed on its next send instead of after a dismissal.
      onOpened={(outcome) => {
        void client.grokPickerDone({
          requestId: request.requestId,
          opened: true,
          ...outcome,
        });
      }}
      onDone={(outcome) => {
        requestRef.current = null;
        // ALWAYS report back — the terminal is holding a turn open until we do.
        // Harmless if onOpened already did: main forgets the request after the
        // first report, so the second settles nothing twice.
        void client.grokPickerDone({ requestId: request.requestId, ...outcome });
        setRequest(null);
      }}
    />
  );
});

export const Layout = () => (
  <Container data-testid="router-container">
    <GrokStartHost />
    {/* Sits beside the picker host for the same reason: it must not depend on
        which tab happens to be open. */}
    <WhatsNew />
    <Sidebar />
    <Main
      data-scrollelement // Required by react-virtualized implementation in Dashboard/TxList
    >
      {/* KeepAliveProvider sits ABOVE <Routes> so a chained session keeps
          restaking across tab switches (Chat unmounts, this does not). */}
      <KeepAliveProvider>
        <Routes>
          <Route path="/wallet" element={<Dashboard />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/models" element={<Models />} />
          <Route path="/providers" element={<Providers />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate replace to="/wallet" />} />
        </Routes>
      </KeepAliveProvider>
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
