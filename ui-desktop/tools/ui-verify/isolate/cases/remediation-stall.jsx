import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeVariantProvider } from '../../../../src/renderer/src/ui/ThemeVariantContext';
import RemediationCard from '../../../../src/renderer/src/components/setup/RemediationCard';

// The escalation card has never been mounted by a gate — 46 isolate cases and
// none render it. It is also the ONE screen that only ever appears when
// something is already wrong, so a throw inside it lands exactly when the user
// most needs a working UI, and the app has no error boundary to contain it.
//
// This mounts it with the payload the stall watchdog actually constructs
// (useSelfHeal.ts ~line 321): kind 'generic', a synthesised message, and
// stderr taken from `stuck.stderrOutput` — which is OPTIONAL on StartupItem
// and therefore undefined for a service that produced no stderr, which is the
// normal case for "it just never finished starting".
window.__threw = null;
window.addEventListener('error', (e) => {
  window.__threw = String(e.message);
});

class Boundary extends React.Component {
  constructor(p) {
    super(p);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  render() {
    if (this.state.err) {
      window.__threw = String(this.state.err && this.state.err.message);
      return <div data-testid="threw">{String(this.state.err)}</div>;
    }
    return this.props.children;
  }
}

const escalation = {
  key: 'proxyRouter',
  kind: 'generic',
  message:
    'Setup stopped making progress 3 minutes ago, waiting on proxyRouter (starting).' +
    ' Nothing reported an error — it simply stopped moving.',
  stderr: undefined,
};

createRoot(document.getElementById('root')).render(
  <ThemeVariantProvider>
    <Boundary>
      <RemediationCard
        escalation={escalation}
        onOpenStorageSettings={() => {}}
        onRetry={() => {}}
        onContinueAnyway={() => {}}
      />
    </Boundary>
  </ThemeVariantProvider>,
);
