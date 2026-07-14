import { FC } from 'react';
import { withClient } from '../store/hocs/clientContext';
import type { Client } from '@renderer/client';
import withServicesState from '../store/hocs/withServicesState';
import { LoadingState } from 'src/main/orchestrator/orchestrator.types';
import SetupWizard from '@renderer/components/setup/SetupWizard';

// This screen is the first thing a non-technical user sees. It used to be a
// developer-grade "Starting services…" list (raw enum tokens, stderr dumps,
// Ping/Restart, a Skip that proceeded into a broken stack). The presentation
// + self-heal logic now lives in components/setup/ — see SetupWizard.tsx and
// useSelfHeal.ts. This wrapper only preserves the prop contract Root.tsx
// relies on (`services`/`client` from the HOCs below, `onSkip` from Root).
type LoadingProps = {
  services: LoadingState;
  client: Client;
  onSkip: () => void;
};

const Loading: FC<LoadingProps> = ({ services, client, onSkip }) => (
  <SetupWizard services={services} client={client} onSkip={onSkip} />
);

export default withServicesState(withClient(Loading));
