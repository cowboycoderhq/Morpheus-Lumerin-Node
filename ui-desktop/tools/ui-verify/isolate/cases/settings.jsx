import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider as ReduxProvider } from 'react-redux';
import { Provider as ClientProvider } from '../../../../src/renderer/src/store/hocs/clientContext';
import { ThemeVariantProvider } from '../../../../src/renderer/src/ui/ThemeVariantContext';
import { ToastsContext } from '../../../../src/renderer/src/components/toasts';
import Settings from '../../../../src/renderer/src/components/settings/Settings';

// Settings reads exactly two branches of state (config for withSettingsState,
// services for withServicesState), so a hand-rolled store beats booting the
// app's real one just to render the page.
//
// STATE IS HOISTED DELIBERATELY: react-redux reads it through
// useSyncExternalStore, which requires getState to return a STABLE reference.
// Building the object inside getState hands back a new identity on every call,
// so mapStateToProps yields new props forever -> "Maximum update depth
// exceeded" and nothing renders.
const state = {
  config: { chain: { localProxyRouterUrl: 'http://localhost:8082' } },
  services: { startup: [] },
};
const store = {
  getState: () => state,
  subscribe: () => () => {},
  dispatch: () => {},
};

// logout wipes the wallet — count it and never let it fire from a render.
window.__logout = 0;
const client = {
  logout: async () => {
    window.__logout++;
  },
  getProxyRouterDerivedConfig: async () => ({ DerivedConfig: { EthNodeURLs: [] } }),
  getFailoverSetting: async () => ({ isEnabled: false }),
  setFailoverSetting: async () => {},
  getAuthHeaders: async () => ({}),
  restartService: async () => {},
  pingService: async () => true,
};

createRoot(document.getElementById('root')).render(
  <ThemeVariantProvider>
    <ClientProvider value={client}>
      <ReduxProvider store={store}>
        <ToastsContext.Provider value={{ toast: () => {} }}>
          <Settings />
        </ToastsContext.Provider>
      </ReduxProvider>
    </ClientProvider>
  </ThemeVariantProvider>,
);
