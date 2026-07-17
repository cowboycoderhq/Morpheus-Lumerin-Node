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
//
// Hoisted for the same reason as the settings case: react-redux needs getState
// to return a STABLE reference. This one happens to survive an unstable state
// because its mapStateToProps yields primitives, but that is luck, not design.
const state = {
  chain: { wallet: { address: '0x2f4E8a1B9c3D5e6F7a8B9c0d1E2f3A4b5C6d7E8f' } },
};
const store = {
  getState: () => state,
  subscribe: () => () => {},
  dispatch: () => {},
};

// Counters, not spies.
//
// This case used to assert Help called pr2's single onHelpLinkClick (straight to
// the docs), deliberately pinning PR3's choice NOT to adopt crypto-version's
// menu. That decision was reversed by the operator on 2026-07-17: a user who
// clicks Help wants either a reference or a person, and only they know which, so
// Help now offers Discord and Documentation instead of choosing for them. The
// contract asserted below is the NEW one — Help opens a menu and opens nothing
// by itself.
window.__docs = 0;
window.__discord = 0;
window.__copy = 0;
const client = {
  onDocsLinkClick: () => {
    window.__docs++;
  },
  onDiscordLinkClick: () => {
    window.__discord++;
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
