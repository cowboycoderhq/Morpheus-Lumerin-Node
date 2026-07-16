// ============================================================================
// Pre-setup gate — the composition.
//
// Shows the preferences screen once, then hands off to the UNTOUCHED wizard,
// forwarding props verbatim so Onboarding's contract with Root is unchanged.
// Root already receives the onboarding screen as a prop, so this slots in at
// App level: nothing in Onboarding, Root, or any step knows it exists.
//
// To remove the feature: point App's OnboardingComponent back at Onboarding and
// delete this file plus PreSetup.tsx. Nothing else references them.
//
// Only reachable while onboarding is incomplete, so an existing wallet never
// sees this — those users change the look in Settings.
// ============================================================================

import { FC, useState } from 'react';

import PreSetup from './PreSetup';
import Onboarding from './Onboarding';

const PREFS_KEY = 'trinity.prefsComplete';

// Mirrors ThemeVariantContext's guard: localStorage can throw in locked-down
// contexts, and a preferences screen must never be what stops a wallet booting.
const readPrefsComplete = (): boolean => {
  try {
    return window.localStorage.getItem(PREFS_KEY) === '1';
  } catch {
    // Unreadable storage — show the screen; a redundant ask beats a crash.
    return false;
  }
};

const writePrefsComplete = (): void => {
  try {
    window.localStorage.setItem(PREFS_KEY, '1');
  } catch {
    // Non-fatal: the theme still applies, the screen just asks again next run.
  }
};

type PreSetupGateProps = {
  onOnboardingCompleted: (data: unknown) => Promise<void>;
};

export const PreSetupGate: FC<PreSetupGateProps> = (props) => {
  const [prefsDone, setPrefsDone] = useState(readPrefsComplete);

  if (!prefsDone) {
    return (
      <PreSetup
        onDone={() => {
          writePrefsComplete();
          setPrefsDone(true);
        }}
      />
    );
  }

  return <Onboarding {...props} />;
};

export default PreSetupGate;
