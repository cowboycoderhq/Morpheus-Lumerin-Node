// ============================================================================
// Setup Wizard — replaces the developer-grade "Starting services…" screen.
//
// Same data in (the `services` slice), same actions out (`startServices` /
// `restartService` via the existing client), radically different experience:
// plain-language phases, silent self-healing (useSelfHeal.ts), and exactly
// ONE remediation card if — and only if — auto-retry can't fix it.
// ============================================================================

import { FC, ReactNode, useEffect } from 'react';
import styled from 'styled-components';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  IconBrain,
  IconCheck,
  IconDownload,
  IconLoader2,
  IconWorldWww,
} from '@tabler/icons-react';
import { AltLayout, Flex } from '@renderer/components/common';
import type { Client } from '@renderer/client';
import type { LoadingState } from 'src/main/orchestrator/orchestrator.types';
import {
  PHASE_FOR_HEAL_KEY,
  PHASES,
  currentPhaseIndex,
  overallProgress,
  type PhaseId,
} from './phases';
import { useSelfHeal } from './useSelfHeal';
import RemediationCard from './RemediationCard';

const PHASE_ICON: Record<PhaseId, typeof IconDownload> = {
  downloads: IconDownload,
  ai: IconBrain,
  network: IconWorldWww,
};

const STORAGE_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.storage';

type SetupWizardProps = {
  services: LoadingState;
  client: Client;
  onSkip: () => void;
};

// ---- styling ---------------------------------------------------------------

const Subtitle = styled.div`
  font-size: ${(p) => p.theme.type.sm};
  color: ${(p) => p.theme.colors.textSecondary};
  text-align: center;
  margin-bottom: 2.8rem;
`;

const Body = styled(Flex.Column)`
  width: 100%;
  max-width: 46rem;
  align-items: center;
  gap: 2.8rem;
`;

const ProgressTrack = styled.div`
  width: 100%;
  height: 0.8rem;
  border-radius: ${(p) => p.theme.radii.pill};
  background: ${(p) => p.theme.colors.glassSurface};
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
  overflow: hidden;
`;

const ProgressFill = styled(motion.div)`
  height: 100%;
  border-radius: ${(p) => p.theme.radii.pill};
  background: ${(p) => p.theme.colors.brand};
  box-shadow: 0 0 12px ${(p) => p.theme.colors.brandTint(0.45)};
`;

const Stepper = styled(Flex.Row)`
  width: 100%;
  justify-content: space-between;
  gap: 0.8rem;
`;

const Step = styled(Flex.Column)`
  align-items: center;
  gap: 0.8rem;
  flex: 1;
`;

const StepBadge = styled.div<{ state: 'done' | 'active' | 'pending' }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  border-radius: ${(p) => p.theme.radii.pill};
  color: ${(p) =>
    p.state === 'done'
      ? p.theme.colors.success
      : p.state === 'active'
        ? p.theme.colors.brand
        : p.theme.colors.textMuted};
  background: ${(p) =>
    p.state === 'done'
      ? 'rgba(89, 227, 167, 0.12)'
      : p.state === 'active'
        ? 'rgba(94, 208, 255, 0.12)'
        : p.theme.colors.glassSurface};
  border: 1px solid
    ${(p) =>
      p.state === 'pending' ? p.theme.colors.glassBorder : 'transparent'};
`;

const SpinIcon = styled(IconLoader2)`
  animation: spin 1.1s linear infinite;
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const StepLabel = styled.div<{ state: 'done' | 'active' | 'pending' }>`
  font-size: ${(p) => p.theme.type.xs};
  text-align: center;
  color: ${(p) =>
    p.state === 'pending' ? p.theme.colors.textMuted : p.theme.colors.textSecondary};
`;

const CurrentPhaseBlurb = styled.p`
  margin: 0;
  text-align: center;
  font-size: ${(p) => p.theme.type.base};
  color: ${(p) => p.theme.colors.textPrimary};
  min-height: 4.8rem;
`;

const HealingPill = styled(Flex.Row)`
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 1.2rem;
  border-radius: ${(p) => p.theme.radii.pill};
  background: ${(p) => p.theme.colors.warningTint(0.1)};
  color: ${(p) => p.theme.colors.warning};
  font-size: ${(p) => p.theme.type.xs};
`;

const SuccessBadge = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 6.4rem;
  height: 6.4rem;
  border-radius: ${(p) => p.theme.radii.pill};
  color: ${(p) => p.theme.colors.success};
  background: ${(p) => p.theme.colors.successTint(0.12)};
`;

const SuccessText = styled.div`
  font-size: ${(p) => p.theme.type.md};
  font-weight: 600;
  color: ${(p) => p.theme.colors.textPrimary};
`;

// ---- component --------------------------------------------------------------

const SetupWizard: FC<SetupWizardProps> = ({ services, client, onSkip }) => {
  const reduceMotion = useReducedMotion();
  const { healingKeys, escalation, retryNow } = useSelfHeal(services, client);

  useEffect(() => {
    client.startServices({}).catch(() => {
      // Swallowed intentionally: a failed kick-off shows up as a failing
      // service in `services-state`, which useSelfHeal already retries and
      // (if truly stuck) escalates — a toast here would just be a second,
      // more confusing report of the same thing.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const isReady = services.orchestratorStatus === 'ready';
  const activeIndex = currentPhaseIndex(services);
  const progress = overallProgress(services);
  const activePhase = PHASES[activeIndex];

  const isPhaseHealing = (phase: PhaseId): boolean =>
    Array.from(healingKeys).some((key) => PHASE_FOR_HEAL_KEY[key] === phase);

  const onOpenStorageSettings = () => client.onLinkClick(STORAGE_SETTINGS_URL);

  let view: ReactNode;

  if (escalation) {
    view = (
      <RemediationCard
        key="remediation"
        escalation={escalation}
        onOpenStorageSettings={onOpenStorageSettings}
        onRetry={retryNow}
        onContinueAnyway={onSkip}
      />
    );
  } else if (isReady) {
    view = (
      <motion.div
        key="success"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.32, ease: [0, 0, 0.2, 1] }}
      >
        <Flex.Column align="center" gap="1.6rem">
          <SuccessBadge>
            <IconCheck size={36} stroke={2} />
          </SuccessBadge>
          <SuccessText>You&apos;re all set</SuccessText>
        </Flex.Column>
      </motion.div>
    );
  } else {
    view = (
      <motion.div
        key="phases"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.22 }}
      >
        <Body>
          <ProgressTrack>
            <ProgressFill
              animate={{ width: `${Math.min(progress, 1) * 100}%` }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }
              }
            />
          </ProgressTrack>

          <Stepper>
            {PHASES.map((phase, i) => {
              const state: 'done' | 'active' | 'pending' =
                i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending';
              const Icon = PHASE_ICON[phase.id];
              return (
                <Step key={phase.id}>
                  <StepBadge state={state}>
                    {state === 'done' ? (
                      <IconCheck size={20} stroke={2} />
                    ) : state === 'active' ? (
                      <SpinIcon size={20} stroke={1.75} />
                    ) : (
                      <Icon size={20} stroke={1.5} />
                    )}
                  </StepBadge>
                  <StepLabel state={state}>{phase.title}</StepLabel>
                </Step>
              );
            })}
          </Stepper>

          <Flex.Column align="center" gap="1.2rem">
            <CurrentPhaseBlurb>{activePhase.blurb}</CurrentPhaseBlurb>
            <AnimatePresence>
              {isPhaseHealing(activePhase.id) && (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                >
                  <HealingPill>
                    <SpinIcon size={14} stroke={1.75} />
                    Just a moment — sorting something out…
                  </HealingPill>
                </motion.div>
              )}
            </AnimatePresence>
          </Flex.Column>
        </Body>
      </motion.div>
    );
  }

  return (
    <AltLayout title="Setting up your AI assistant">
      <Subtitle>This only takes a minute.</Subtitle>
      <Flex.Column align="center">
        <AnimatePresence mode="wait">{view}</AnimatePresence>
      </Flex.Column>
    </AltLayout>
  );
};

export default SetupWizard;
