// ============================================================================
// Setup Wizard — service → plain-language phase mapping.
//
// This is the ONLY place raw service ids/statuses get translated into human
// copy. Nothing downstream (SetupWizard, useSelfHeal) should read a raw
// enum token or an id the user would recognize as a "service".
//
// `containerRuntime` (Docker) is intentionally absent from every phase below
// — the design spec treats it as optional/non-blocking chrome, so the wizard
// never surfaces it, never shows it as an error, and never self-heals it.
// NOTE (boundary): the main-process orchestrator's `orchestratorStatus` still
// factors containerRuntime into its 'ready' calculation (see
// src/main/orchestrator/orchestrator.ts `calculateOrchestratorStatus`) — that
// is out of scope for this renderer-only pass (main/ is a no-edit boundary).
// If Docker is genuinely stuck, the wizard will look "almost done" longer
// than the spec's happy path promises; fixing that requires the phase-2
// "Orchestrator auto-heal" work called out in the design doc.
// ============================================================================

import type {
  LoadingState,
  StartupItem,
} from 'src/main/orchestrator/orchestrator.types';

export type PhaseId = 'downloads' | 'ai' | 'network';

export type Phase = {
  id: PhaseId;
  title: string;
  blurb: string;
};

export const PHASES: Phase[] = [
  {
    id: 'downloads',
    title: 'Getting things ready',
    blurb:
      'Downloading a few components. This only happens the first time — about a minute.',
  },
  {
    id: 'ai',
    title: 'Starting your private AI',
    blurb: 'Waking up the AI engine that runs securely on this machine.',
  },
  {
    id: 'network',
    title: 'Connecting to the Morpheus network',
    blurb: 'Linking up the services that connect your assistant to Morpheus.',
  },
];

// IPFS is intentionally NOT here (like containerRuntime above): it is optional —
// used only by the provider "host your own model" feature, never by consumer
// chat/staking — and it defaults to a commonly-taken port. Gating the wizard on
// it froze the whole app on a port conflict. The network phase now completes on
// the proxy-router alone; IPFS starts best-effort in the background.
const NETWORK_STARTUP_IDS = ['proxyRouter'] as const;

const findStartup = (
  services: LoadingState,
  id: string,
): StartupItem | undefined => services.startup.find((s) => s.id === id);

const startupFraction = (item?: StartupItem): number => {
  if (!item) return 0;
  if (item.status === 'running') return 1;
  if (item.status === 'starting') return 0.5;
  return 0;
};

const downloadFraction = (services: LoadingState): number => {
  if (services.download.length === 0) return 1;
  const sum = services.download.reduce(
    (acc, d) => acc + (d.status === 'success' ? 1 : d.progress || 0),
    0,
  );
  return sum / services.download.length;
};

const aiFraction = (services: LoadingState): number =>
  startupFraction(findStartup(services, 'aiRuntime'));

const networkFraction = (services: LoadingState): number => {
  const items = NETWORK_STARTUP_IDS.map((id) => findStartup(services, id));
  const sum = items.reduce((acc, item) => acc + startupFraction(item), 0);
  return sum / NETWORK_STARTUP_IDS.length;
};

/** 0..1 completion for a single phase. */
export const phaseFraction = (services: LoadingState, phase: PhaseId): number => {
  switch (phase) {
    case 'downloads':
      return downloadFraction(services);
    case 'ai':
      return aiFraction(services);
    case 'network':
      return networkFraction(services);
  }
};

export const isPhaseComplete = (services: LoadingState, phase: PhaseId): boolean =>
  phaseFraction(services, phase) >= 1;

/** Index of the first phase that isn't complete yet (clamped to last phase). */
export const currentPhaseIndex = (services: LoadingState): number => {
  const idx = PHASES.findIndex((p) => !isPhaseComplete(services, p.id));
  return idx === -1 ? PHASES.length - 1 : idx;
};

/** One overall 0..1 progress number — equal-weighted across the 3 phases. */
export const overallProgress = (services: LoadingState): number => {
  const sum = PHASES.reduce((acc, p) => acc + phaseFraction(services, p.id), 0);
  return sum / PHASES.length;
};

// Which phase a given self-heal key belongs to, for surfacing the "sorting
// something out" indicator against the right phase (see useSelfHeal.ts).
export const PHASE_FOR_HEAL_KEY: Record<
  'downloads' | 'aiRuntime' | 'proxyRouter',
  PhaseId
> = {
  downloads: 'downloads',
  aiRuntime: 'ai',
  proxyRouter: 'network',
};
