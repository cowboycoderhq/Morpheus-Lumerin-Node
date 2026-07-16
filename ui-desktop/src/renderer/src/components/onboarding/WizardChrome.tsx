// ============================================================================
// New-wallet onboarding — shared wizard chrome.
//
// Purely presentational: wraps the existing `AltLayout` (shared with
// Login/Loading — never edited here) with a "Step X of N" indicator so the
// four new-wallet screens (Terms -> Password -> Recovery Phrase -> Verify)
// read as ONE guided flow instead of disconnected screens. The only stateful
// wiring this owns is rendering the `onBack` callback a step passes in as a
// real, accessible Back button — every step gets it just by forwarding the
// prop, so it can't be left off screen-by-screen. Everything else (state,
// handlers, validation) stays owned by the step component exactly as before.
// ============================================================================

import { FC, ReactNode } from 'react';
import styled from 'styled-components';
import { motion, useReducedMotion } from 'framer-motion';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconInfoCircle,
} from '@tabler/icons-react';
import { AltLayout, AltLayoutNarrow, Flex } from '../common';

type WizardChromeProps = {
  title: string;
  // Omit both on a side-branch screen (e.g. importing an existing wallet),
  // which sits outside the numbered new-wallet flow and would be lying if it
  // claimed to be "Step 3 of 4". Such a screen still gets the Back control —
  // that is the point of routing it through this chrome.
  step?: number;
  totalSteps?: number;
  children: ReactNode;
  // Structural Back control — omit (or pass undefined) on the first step of
  // a flow, where there is nothing to go back to. Every other step that
  // renders through WizardChrome gets Back automatically, so it can't be
  // forgotten screen-by-screen.
  onBack?: () => void;
  'data-testid'?: string;
};

const BackButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 40px;
  padding: 0.8rem 1.2rem 0.8rem 0.8rem;
  margin-bottom: 1.6rem;
  border: none;
  border-radius: ${(p) => p.theme.radii.md};
  background: transparent;
  color: ${(p) => p.theme.colors.textSecondary};
  font: inherit;
  font-size: ${(p) => p.theme.type.sm};
  font-weight: 600;
  cursor: pointer;
  transition: color ${(p) => p.theme.motion.duration.fast} ${(p) =>
    p.theme.motion.easing.standard},
    background ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard};

  &:hover,
  &:focus-visible {
    color: ${(p) => p.theme.colors.textPrimary};
    background: ${(p) => p.theme.colors.glassSurface};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const StepText = styled.div`
  text-align: center;
  font-size: ${(p) => p.theme.type.xs};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${(p) => p.theme.colors.textSecondary};
  margin-bottom: 1rem;
`;

const Dots = styled(Flex.Row)`
  justify-content: center;
  align-items: center;
  gap: 0.8rem;
  margin-bottom: 2rem;
`;

const Dot = styled.div<{ $active: boolean; $done: boolean }>`
  width: ${(p) => (p.$active ? '2rem' : '0.8rem')};
  height: 0.8rem;
  border-radius: ${(p) => p.theme.radii.pill};
  background: ${(p) =>
    p.$done
      ? p.theme.colors.success
      : p.$active
        ? p.theme.colors.brand
        : p.theme.colors.glassSurface};
  border: 1px solid
    ${(p) => (p.$active || p.$done ? 'transparent' : p.theme.colors.glassBorder)};
  transition: all ${(p) => p.theme.motion.duration.base} ${(p) =>
    p.theme.motion.easing.standard};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const WizardChrome: FC<WizardChromeProps> = ({
  title,
  step,
  totalSteps,
  children,
  onBack,
  ...rest
}) => {
  const reduceMotion = useReducedMotion();

  return (
    <AltLayout title={title} {...rest}>
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {onBack && (
          <BackButton
            type="button"
            onClick={onBack}
            aria-label="Go back to the previous step"
          >
            <IconArrowLeft size={18} stroke={2} />
            Back
          </BackButton>
        )}
        {step !== undefined && totalSteps !== undefined && (
          <>
            <StepText>
              Step {step} of {totalSteps}
            </StepText>
            <Dots>
              {Array.from({ length: totalSteps }).map((_, i) => (
                <Dot key={i} $active={i === step - 1} $done={i < step - 1} />
              ))}
            </Dots>
          </>
        )}
        {children}
      </motion.div>
    </AltLayout>
  );
};

// ---- reusable inline explainer / stakes callouts ---------------------------
// Used to (a) define plain-language terms the first time they appear (e.g.
// "a wallet is...") and (b) carry high-stakes warnings (the recovery phrase)
// without resorting to a scary red banner — calm, high-contrast, clear.

type CalloutTone = 'info' | 'warning';

const CalloutBox = styled(Flex.Row)<{ $tone: CalloutTone }>`
  align-items: flex-start;
  gap: 1.2rem;
  width: 100%;
  padding: 1.6rem 1.8rem;
  border-radius: ${(p) => p.theme.radii.md};
  background: ${(p) =>
    p.$tone === 'warning'
      ? p.theme.colors.warningTint(0.1)
      : p.theme.colors.glassSurface};
  border: 1px solid
    ${(p) =>
      p.$tone === 'warning'
        ? p.theme.colors.warningTint(0.3)
        : p.theme.colors.glassBorder};
  text-align: left;
`;

const CalloutIcon = styled.div<{ $tone: CalloutTone }>`
  display: flex;
  flex-shrink: 0;
  color: ${(p) =>
    p.$tone === 'warning' ? p.theme.colors.warning : p.theme.colors.secondaryLight};
  margin-top: 0.2rem;
`;

const CalloutText = styled.p`
  margin: 0;
  font-size: ${(p) => p.theme.type.sm};
  line-height: 1.55;
  color: ${(p) => p.theme.colors.textPrimary};
`;

type CalloutProps = {
  tone?: CalloutTone;
  children: ReactNode;
};

const TONE_ICON: Record<
  CalloutTone,
  typeof IconInfoCircle | typeof IconAlertTriangle
> = {
  info: IconInfoCircle,
  warning: IconAlertTriangle,
};

export const Callout: FC<CalloutProps> = ({ tone = 'info', children }) => {
  const ToneIcon = TONE_ICON[tone];
  return (
    <AltLayoutNarrow>
      <CalloutBox $tone={tone}>
        <CalloutIcon $tone={tone}>
          <ToneIcon size={20} stroke={1.75} />
        </CalloutIcon>
        <CalloutText>{children}</CalloutText>
      </CalloutBox>
    </AltLayoutNarrow>
  );
};

export default WizardChrome;
