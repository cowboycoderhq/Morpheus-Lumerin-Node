import styled, { css } from 'styled-components';

type BaseBtnProps = {
  submit?: boolean;
  block?: boolean;
};

type FieldBtnProps = BaseBtnProps & {
  float?: boolean;
};

type BtnProps = BaseBtnProps & {
  // B1 (money-safe default): Btn is solid/effect-free by default because it
  // doubles as the money action (Stake / Send / Confirm). `glow` is an
  // explicit opt-in for non-money CTAs only — never enabled by default.
  glow?: boolean;
};

export const BaseBtn = styled.button.attrs<BaseBtnProps>(({ submit }) => ({
  type: submit ? 'submit' : 'button',
}))<BaseBtnProps>`
  display: ${({ block }) => (block ? 'block' : 'inline-block')};
  width: ${({ block }) => (block ? '100%' : 'auto')};
  font: inherit;
  font-family: ${p => p.theme.fontUI};
  text-align: center;
  border: none;
  cursor: pointer;
  transition:
    background-color ${p => p.theme.motion.duration.base} ${p =>
      p.theme.motion.easing.standard},
    box-shadow ${p => p.theme.motion.duration.base} ${p =>
      p.theme.motion.easing.standard},
    filter ${p => p.theme.motion.duration.fast} ${p =>
      p.theme.motion.easing.standard};
  background-color: transparent;
  padding: 0;
  color: ${p => p.theme.colors.textPrimary};
  outline: none;

  &[data-disabled='true'],
  &[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${p => p.theme.colors.secondaryLight};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

// Default/primary Btn — used for money actions (Stake, Send, Confirm) as well
// as everyday form submits. Solid, opaque, max-contrast; no glass, no glow.
// JARVIS buttons are not solid fills — they are cyan-tinted panels with a
// hairline and a glow on hover, in uppercase monospace. The label is a command,
// so it reads like one.
export const Btn = styled(BaseBtn)<BtnProps>`
  line-height: 2.2rem;
  font-family: ${p => p.theme.fontUI};
  font-size: ${p => p.theme.type.sm};
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${p => p.theme.colors.brand};
  border-radius: ${p => p.theme.radii.md};
  background-color: ${p => p.theme.colors.brandTint(0.09)};
  border: 1px solid ${p => p.theme.colors.glassBorderBright};
  box-shadow: none;
  padding: 1.3rem 2rem;

  &:not([disabled], [data-disabled]):hover,
  &:not([disabled], [data-disabled]):focus {
    color: ${p => p.theme.colors.brandBright};
    background-color: ${p => p.theme.colors.brandTint(0.17)};
    box-shadow: 0 0 16px ${p => p.theme.colors.brandTint(0.22)};
  }

  &:not([disabled], [data-disabled]):active {
    filter: brightness(0.94);
  }

  /* Opt-in ambient glow (B6 dial via effects.glowStrength) — non-money CTAs
     only. Never applied unless a screen explicitly passes the glow prop. */
  ${p =>
    p.glow &&
    css`
      box-shadow: 0 0 ${20 * p.theme.effects.glowStrength}px
        ${p.theme.colors.brandTint(0.3 * p.theme.effects.glowStrength)};

      &:not([disabled], [data-disabled]):hover,
      &:not([disabled], [data-disabled]):focus {
        box-shadow: 0 0 ${32 * p.theme.effects.glowStrength}px
          ${p.theme.colors.brandTint(0.45 * p.theme.effects.glowStrength)};
      }
    `}
`;

export const FieldBtn = styled(BaseBtn)<FieldBtnProps>`
  float: ${p => (p.float ? 'right' : 'none')};
  line-height: 1.8rem;
  opacity: 0.6;
  font-size: ${p => p.theme.type.xs};
  font-weight: 600;
  letter-spacing: 1.4px;
  color: ${p => p.theme.colors.textSecondary};
  margin-top: ${p => (p.float ? '0.4rem' : 0)};
  white-space: nowrap;

  &:hover,
  &:focus-visible {
    opacity: 1;
    color: ${p => p.theme.colors.textPrimary};
  }
`;
