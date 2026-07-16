import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeVariantProvider } from '../../../../src/renderer/src/ui/ThemeVariantContext';
import TermsStep from '../../../../src/renderer/src/components/onboarding/TermsStep';

// Mount the REAL terms step with the state machine's two independent consent
// flags wired the way Onboarding wires them, so the drive can prove the gate
// still needs BOTH — crypto-version collapses them into one toggle, which would
// pass any test that only clicks "the checkbox".
window.__accepted = 0;
window.__licenseLinkClicks = 0;

function Harness() {
  const [flags, setFlags] = useState({
    termsCheckbox: false,
    licenseCheckbox: false,
  });

  return (
    <TermsStep
      termsCheckbox={flags.termsCheckbox}
      licenseCheckbox={flags.licenseCheckbox}
      onInputChange={({ id, value }) =>
        setFlags((f) => ({ ...f, [id]: value }))
      }
      onTermsAccepted={() => {
        window.__accepted++;
      }}
      onTermsLinkClick={() => {
        window.__licenseLinkClicks++;
      }}
    />
  );
}

createRoot(document.getElementById('root')).render(
  <ThemeVariantProvider>
    <Harness />
  </ThemeVariantProvider>,
);
