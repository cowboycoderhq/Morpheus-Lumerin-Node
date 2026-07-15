import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'styled-components';
import theme from '../../../../src/renderer/src/ui/theme';
import { ToastsContext } from '../../../../src/renderer/src/components/toasts';

// Mount ONE real product component inside the app's real ThemeProvider (dev's
// palette) + the contexts it reads, with mock props forcing a target state.
export function mount(node, { toasts } = {}) {
  const toastCtx = toasts || { toast: (t, m) => console.log('[toast]', t, m) };
  createRoot(document.getElementById('root')).render(
    <ThemeProvider theme={theme}>
      <ToastsContext.Provider value={toastCtx}>{node}</ToastsContext.Provider>
    </ThemeProvider>,
  );
}
export { theme };
