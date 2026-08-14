import { QueryClientProvider } from '@tanstack/react-query';

import { ThemeVariantProvider } from './ui/ThemeVariantContext';
import Root from './components/common/Root';
import { Provider as ClientProvider } from './store/hocs/clientContext';
import { Provider, createStore } from './store/store';
import { queryClient } from './store/queryClient';

import createClient from './client';
import { subscribeToMainProcessMessages } from './subscriptions';

import Web3ConnectionNotifier from './components/Web3ConnectionNotifier';
import { ToastsProvider } from './components/toasts';
import { GlobalTooltips } from './components/common';
// Preferences screen that runs once in front of the wizard, then renders the
// untouched Onboarding. Swap this back to './components/onboarding/Onboarding'
// to remove the feature entirely.
import PreSetupGate from './components/onboarding/PreSetupGate';
import Loading from './components/Loading';
import Router from './components/Router';
import Login from './components/Login';
import Startup from '@renderer/components/Startup';

const client = createClient(createStore);

// Initialize all the Main Process subscriptions
subscribeToMainProcessMessages(client.store);

function App(): JSX.Element {
  return (
    <>
      <ClientProvider value={client}>
        <Provider store={client.store}>
          <QueryClientProvider client={queryClient}>
            <ThemeVariantProvider>
              <ToastsProvider>
                <Root
                  StartupComponent={Startup}
                  OnboardingComponent={PreSetupGate}
                  LoadingComponent={Loading}
                  RouterComponent={Router}
                  LoginComponent={Login}
                />
                <GlobalTooltips />
                <Web3ConnectionNotifier />
              </ToastsProvider>
            </ThemeVariantProvider>
          </QueryClientProvider>
        </Provider>
      </ClientProvider>
    </>
  );
}

export default App;
