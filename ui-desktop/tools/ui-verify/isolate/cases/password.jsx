import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeVariantProvider } from '../../../../src/renderer/src/ui/ThemeVariantContext';
import PasswordStep from '../../../../src/renderer/src/components/onboarding/PasswordStep';

// Mounts the REAL password step so the strength meter renders against real
// input. The meter is the thing under test: it must show the bar and its score
// label side by side (they used to collide), plus the "Stronger if:" checklist
// and an inline suggestion — no floating tooltip over the callout.
window.__submits = [];

function Harness() {
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');

  return (
    <PasswordStep
      password={password}
      passwordAgain={passwordAgain}
      errors={{}}
      onBack={() => {}}
      onInputChange={({ id, value }) =>
        id === 'password' ? setPassword(value) : setPasswordAgain(value)
      }
      onPasswordSubmit={(args) => {
        window.__submits.push(args);
      }}
    />
  );
}

createRoot(document.getElementById('root')).render(
  <ThemeVariantProvider>
    <Harness />
  </ThemeVariantProvider>,
);
