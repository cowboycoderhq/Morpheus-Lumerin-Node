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
window.__apiWrites = [];
window.__opencodeOpens = [];
// Endpoint ON and auto-open ON, so the spend-cap fields actually render — they
// are hidden otherwise, and a fixture that cannot reach them would make any
// assertion about them vacuous.
const apiCfg = {
  enabled: true,
  running: true,
  port: 8137,
  token: 'mor-sk-test',
  allowAutoOpen: true,
  maxStakeMor: 1,
  maxDailyStakeMor: 5,
  maxDailySessions: 10,
};
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

  // ---- the OpenAI endpoint + spend caps ----
  // Records every config write so a case can assert what the UI actually
  // committed, not merely that it rendered.
  getOpenAiApiConfig: async () => ({ ...apiCfg }),
  setOpenAiApiConfig: async (next) => {
    window.__apiWrites.push({ ...next });
    Object.assign(apiCfg, next);
    return { ...apiCfg };
  },
  regenerateOpenAiApiToken: async () => ({ ...apiCfg }),
  copyToClipboard: () => {},
  getOpencodeStatus: async () => ({
    installed: true,
    version: '1.18.10',
    installCommand: 'brew install sst/tap/opencode',
    endpointEnabled: true,
    endpointRunning: true,
    configPath: '/tmp/morpheus.json',
  }),
  installOpencode: async () => ({ output: '' }),
  openInOpencode: async (arg) => {
    window.__opencodeOpens.push(arg);
    return { ok: true };
  },
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
