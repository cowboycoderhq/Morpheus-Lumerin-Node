import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeVariantProvider } from '../../../../src/renderer/src/ui/ThemeVariantContext';
import { PreSetup } from '../../../../src/renderer/src/components/onboarding/PreSetup';

// Mount the REAL pre-setup screen inside the real ThemeVariantProvider, so a
// card click drives an actual token re-render (the live preview it claims to
// be) rather than just component state. onDone is counted so the drive can
// prove the hand-off to the wizard fires exactly once.
window.__onDone = 0;

createRoot(document.getElementById('root')).render(
  <ThemeVariantProvider>
    <PreSetup
      onDone={() => {
        window.__onDone++;
      }}
    />
  </ThemeVariantProvider>,
);
