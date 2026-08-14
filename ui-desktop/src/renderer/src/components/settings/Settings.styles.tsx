// ============================================================================
// Settings screen — Aurora chrome, scoped to components/settings/**.
//
// Purely presentational: section cards, plain-language callouts, a danger
// (destructive-action) styling variant, and a native-checkbox toggle row.
// No data/state logic lives here — everything below is styled-components
// wrappers around the shared Aurora primitives (`Btn`, `TextInput`, `Modal`,
// `Flex`) so Settings reads with the same hierarchy as the onboarding wizard.
// ============================================================================

import { FC, ReactNode } from 'react';
import styled from 'styled-components';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import { Btn, Flex, Checkbox } from '../common';

export const SectionCard = styled.section`
  background: ${(p) => p.theme.colors.glassSurface};
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
  border-radius: ${(p) => p.theme.radii.lg};
  padding: 2.4rem 2.8rem;

  & + & {
    margin-top: 2rem;
  }
`;

export const SectionHeader = styled.h2`
  margin: 0 0 0.6rem;
  font-family: ${(p) => p.theme.fontUI};
  font-size: ${(p) => p.theme.type.md};
  font-weight: 600;
  letter-spacing: 0.2px;
  color: ${(p) => p.theme.colors.textPrimary};
`;

export const SectionDescription = styled.p`
  margin: 0 0 1.8rem;
  max-width: 62rem;
  font-size: ${(p) => p.theme.type.sm};
  line-height: 1.6;
  color: ${(p) => p.theme.colors.textSecondary};
`;

export const FieldRow = styled.div`
  max-width: 50rem;
  margin-bottom: 1.8rem;
`;

// ---- inline callouts — "advanced" info and "this is destructive" warning ---
// Mirrors the tone/shape of the onboarding wizard's Callout so the plain-
// language framing feels consistent across the app, without importing across
// the onboarding/settings domain boundary.

type CalloutTone = 'info' | 'warning';

const CalloutBox = styled(Flex.Row)<{ $tone: CalloutTone }>`
  align-items: flex-start;
  gap: 1.2rem;
  width: 100%;
  max-width: 62rem;
  padding: 1.4rem 1.6rem;
  margin-bottom: 1.8rem;
  border-radius: ${(p) => p.theme.radii.md};
  /* The 'warning' tone here is a RED one — the only thing it fronts is wallet
     reset, where the message is "this can't be undone". It derives from the
     danger colour, not the amber warning: WizardChrome's Callout owns the amber
     'warning' used for advisories. Same prop name, deliberately different
     meaning per surface. */
  background: ${(p) =>
    p.$tone === 'warning'
      ? p.theme.colors.dangerTint(0.08)
      : p.theme.colors.glassSurface};
  border: 1px solid
    ${(p) =>
      p.$tone === 'warning'
        ? p.theme.colors.dangerTint(0.3)
        : p.theme.colors.glassBorder};
`;

const CalloutIcon = styled.div<{ $tone: CalloutTone }>`
  display: flex;
  flex-shrink: 0;
  color: ${(p) =>
    p.$tone === 'warning' ? p.theme.colors.danger : p.theme.colors.secondaryLight};
  margin-top: 0.2rem;
`;

const CalloutText = styled.p`
  margin: 0;
  font-size: ${(p) => p.theme.type.sm};
  line-height: 1.55;
  color: ${(p) => p.theme.colors.textPrimary};
`;

const TONE_ICON = {
  info: IconInfoCircle,
  warning: IconAlertTriangle,
};

export const SettingsCallout: FC<{ tone?: CalloutTone; children: ReactNode }> = ({
  tone = 'info',
  children,
}) => {
  const ToneIcon = TONE_ICON[tone];
  return (
    <CalloutBox $tone={tone}>
      <CalloutIcon $tone={tone}>
        <ToneIcon size={20} stroke={1.75} />
      </CalloutIcon>
      <CalloutText>{children}</CalloutText>
    </CalloutBox>
  );
};

// ---- destructive-action button (Reset) — visually distinct from the brand
// action color so it never reads as a routine "Save"/"Apply" button.
// A solid hot-red slab shouts before the user has done anything wrong. Same
// grammar as every other button in the HUD — a tinted panel with a hairline —
// just wearing danger's colour, so it reads as serious without reading as an
// alarm going off.
export const DangerBtn = styled(Btn)`
  color: ${(p) => p.theme.colors.danger};
  background-color: ${(p) => p.theme.colors.dangerTint(0.1)};
  border: 1px solid ${(p) => p.theme.colors.dangerTint(0.5)};

  &:not([disabled], [data-disabled]):hover,
  &:not([disabled], [data-disabled]):focus {
    color: ${(p) => p.theme.colors.danger};
    background-color: ${(p) => p.theme.colors.dangerTint(0.2)};
    box-shadow: 0 0 16px ${(p) => p.theme.colors.dangerTint(0.25)};
  }
`;

export const GhostBtn = styled(Btn)`
  background: transparent;
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
  box-shadow: none;

  &:not([disabled], [data-disabled]):hover,
  &:not([disabled], [data-disabled]):focus {
    background: ${(p) => p.theme.colors.glassSurface};
    box-shadow: none;
    filter: none;
  }
`;

// ---- accessible toggle row (Failover) — a real, native <input type=checkbox>
// (keyboard + screen-reader operable by default) skinned to sit on the
// Aurora dark surface, not a custom div "switch" widget.
export const ToggleRow = styled.label`
  display: flex;
  align-items: center;
  gap: 1.2rem;
  min-height: 40px;
  cursor: pointer;
  width: fit-content;
`;

// The app's single checkbox lives in common/Checkbox — see the note there on
// why a raw <input> can't just be tinted.
export const ToggleInput = Checkbox;

export const ToggleLabel = styled.span`
  font-size: ${(p) => p.theme.type.sm};
  font-weight: 600;
  color: ${(p) => p.theme.colors.textPrimary};
`;

// ---- Reset-wallet confirmation modal content --------------------------------
export const ConfirmBody = styled.div`
  padding: 2rem 2.4rem 2.4rem;
`;

export const ConfirmMessage = styled.p`
  margin: 0 0 2rem;
  font-size: ${(p) => p.theme.type.sm};
  line-height: 1.6;
  color: ${(p) => p.theme.colors.textPrimary};
`;

export const ConfirmActions = styled(Flex.Row)`
  gap: 1.2rem;
  justify-content: flex-end;
`;
