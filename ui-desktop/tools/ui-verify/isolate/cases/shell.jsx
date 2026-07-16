import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider as ReduxProvider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { Provider as ClientProvider } from '../../../../src/renderer/src/store/hocs/clientContext';
import {
  ThemeVariantProvider,
  useThemeVariant,
} from '../../../../src/renderer/src/ui/ThemeVariantContext';
import { THEME_VARIANTS } from '../../../../src/renderer/src/ui/theme';
import Sidebar from '../../../../src/renderer/src/components/sidebar/Sidebar';

// The real Sidebar reads exactly one thing from redux (getWalletAddress ->
// state.chain.wallet.address), so a hand-rolled store beats pulling in the app's
// whole store just to render the rail.
const store = {
  getState: () => ({
    chain: { wallet: { address: '0x2f4E8a1B9c3D5e6F7a8B9c0d1E2f3A4b5C6d7E8f' } },
  }),
  subscribe: () => () => {},
  dispatch: () => {},
};

// Counters, not spies: the case asserts the Help link still calls pr2's
// onHelpLinkClick contract (PR3 keeps it; crypto's menu renamed it).
window.__help = 0;
window.__copy = 0;
const client = {
  onHelpLinkClick: () => {
    window.__help++;
  },
  copyToClipboard: () => {
    window.__copy++;
  },
};

function VariantControls() {
  const { variant, setVariant } = useThemeVariant();
  return (
    <div style={{ position: 'fixed', top: 8, right: 8, zIndex: 99 }}>
      <span data-testid="active-variant" style={{ color: '#fff' }}>
        {variant}
      </span>
      {THEME_VARIANTS.map((v) => (
        <button
          key={v}
          data-testid={`set-${v}`}
          onClick={() => setVariant(v)}
          style={{ marginLeft: 4 }}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <ThemeVariantProvider>
    <ClientProvider value={client}>
      <ReduxProvider store={store}>
        <MemoryRouter initialEntries={['/chat']}>
          <div style={{ display: 'flex', height: '100vh' }}>
            <Sidebar />
          </div>
          <VariantControls />
        </MemoryRouter>
      </ReduxProvider>
    </ClientProvider>
  </ThemeVariantProvider>,
);
