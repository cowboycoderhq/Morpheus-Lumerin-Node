// ============================================================================
// Pre-setup preferences — the screen.
//
// Deliberately NOT a step in the onboarding wizard. Wallet setup is a custody
// flow — terms, recovery phrase, password — and a question of taste does not
// belong inside it. Keeping it out also leaves the onboarding state machine
// untouched: no renumbering every step from "of 4" to "of 5", and no edits to
// the contract that step gating depends on. It runs in FRONT of the wizard
// instead; PreSetupGate.tsx owns that composition.
//
// Purely presentational, like WizardChrome: it takes a callback and renders.
// It must never import Onboarding — that would drag withOnboardingState and the
// whole store stack in behind a screen that shows two buttons, and it is what
// lets the isolate mount this for real.
// ============================================================================

import { FC } from 'react';
import styled from 'styled-components';

import { AltLayoutNarrow, Btn, Sp } from '../common';
import WizardChrome, { Callout } from './WizardChrome';
import { THEME_VARIANTS, ThemeVariant, themes } from '../../ui/theme';
import { useThemeVariant } from '../../ui/ThemeVariantContext';

const THEME_COPY: Record<ThemeVariant, { label: string; blurb: string }> = {
  aurora: {
    label: 'Aurora',
    blurb: 'A futuristic HUD — cyan accents, glass panels, quiet motion.',
  },
  classic: {
    label: 'Classic',
    blurb: 'The familiar Morpheus look — green accents, flat solid surfaces.',
  },
};

const ChoiceGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.6rem;
  width: 100%;
`;

// Selection is carried by border, tint AND an explicit mark — never by colour
// alone, since the thing being chosen here IS the colour.
const ChoiceCard = styled.button<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1.6rem;
  text-align: left;
  cursor: pointer;
  border-radius: ${(p) => p.theme.radii.md};
  background: ${(p) =>
    p.$active ? p.theme.colors.brandTint(0.12) : p.theme.colors.glassSurface};
  border: 1px solid
    ${(p) => (p.$active ? p.theme.colors.brand : p.theme.colors.glassBorder)};
  transition:
    background ${(p) => p.theme.motion.duration.fast}
      ${(p) => p.theme.motion.easing.standard},
    border-color ${(p) => p.theme.motion.duration.fast}
      ${(p) => p.theme.motion.easing.standard};

  &:hover {
    background: ${(p) =>
      p.$active
        ? p.theme.colors.brandTint(0.12)
        : p.theme.colors.glassSurfaceHover};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const ChoiceName = styled.span`
  font-family: ${(p) => p.theme.fontUI};
  font-size: ${(p) => p.theme.type.md};
  font-weight: 600;
  color: ${(p) => p.theme.colors.textPrimary};
`;

const ChoiceBlurb = styled.span`
  font-size: ${(p) => p.theme.type.sm};
  line-height: 1.45;
  color: ${(p) => p.theme.colors.textSecondary};
`;

// A sample of the accent THIS card applies — read from that variant's own token
// set, never from `theme.colors.brand`, which is whatever is active right now
// and would paint the Classic card cyan while Aurora is selected.
//
// The rest of the preview needs no such trick: the screen already sits inside
// ThemeVariantProvider, so picking a card re-themes the page you are standing
// on. The preview is the app itself, not a mockup of it.
const Swatch = styled.span<{ $accent: string }>`
  width: 100%;
  height: 6px;
  margin-top: 0.4rem;
  border-radius: ${(p) => p.theme.radii.pill};
  background: ${(p) => p.$accent};
`;

type PreSetupProps = { onDone: () => void };

export const PreSetup: FC<PreSetupProps> = ({ onDone }) => {
  const { variant, setVariant } = useThemeVariant();

  return (
    <WizardChrome title="Choose Your Look" data-testid="presetup-container">
      <AltLayoutNarrow>
        <Callout>
          Pick how the app looks. This is only a preference — it changes nothing
          about your wallet, and you can switch anytime in Settings.
        </Callout>

        <Sp mt={3}>
          <ChoiceGrid>
            {THEME_VARIANTS.map((v) => {
              const active = v === variant;
              return (
                <ChoiceCard
                  key={v}
                  type="button"
                  $active={active}
                  aria-pressed={active}
                  data-testid={`presetup-theme-${v}`}
                  onClick={() => setVariant(v)}
                >
                  <ChoiceName>
                    {active ? `✓ ${THEME_COPY[v].label}` : THEME_COPY[v].label}
                  </ChoiceName>
                  <ChoiceBlurb>{THEME_COPY[v].blurb}</ChoiceBlurb>
                  <Swatch $accent={themes[v].colors.brand} aria-hidden />
                </ChoiceCard>
              );
            })}
          </ChoiceGrid>
        </Sp>

        <Sp mt={4}>
          <Btn block autoFocus data-testid="presetup-continue-btn" onClick={onDone}>
            Continue
          </Btn>
        </Sp>
      </AltLayoutNarrow>
    </WizardChrome>
  );
};

export default PreSetup;
