import styled, { css, keyframes } from 'styled-components';

// Same override pattern as ModelSelectionModal: the shared `Body` (in
// CreateContractModal.styles) bakes in `padding: 5rem` and never sets
// `overflow: hidden`, so it lets children spill past its own bottom edge.
// Beating that with inline `style` gives the box a definite height so child
// `height: 100%` resolves, clips overflow so the inner scroll region is the
// real scroll boundary, and zeroes the padding so this file controls spacing.
export const bodyProps = {
  width: '560px',
  maxWidth: '92%',
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
  style: {
    height: 'min(74vh, 680px)',
    maxHeight: '74vh',
    padding: 0,
    overflow: 'hidden',
  },
};

export const Layout = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
`;

// Right padding leaves room for the absolute-positioned close X that Modal
// renders (32px button at top:12px / right:12px -> clears ~52px).
export const Header = styled.div`
  padding: 1.8rem 5.5rem 1.4rem 2.4rem;
  border-bottom: 1px solid ${(p) => p.theme.colors.glassBorder};
`;

export const StepMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.8rem;
`;

export const StepDots = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
`;

export const StepDot = styled.span<{ $state: 'done' | 'active' | 'pending' }>`
  width: 7px;
  height: 7px;
  border-radius: ${(p) => p.theme.radii.pill};
  background: ${(p) =>
    p.$state === 'pending'
      ? p.theme.colors.glassBorder
      : p.theme.colors.morMain};
  opacity: ${(p) =>
    p.$state === 'active' ? 1 : p.$state === 'done' ? 0.7 : 1};
  box-shadow: ${(p) =>
    p.$state === 'active'
      ? `0 0 6px ${p.theme.colors.brandTint(0.7)}`
      : 'none'};
`;

export const StepLabel = styled.span`
  font-size: 1.1rem;
  letter-spacing: 0.3px;
  color: ${(p) => p.theme.colors.textSecondary};
`;

export const Title = styled.h2`
  margin: 0 0 0.4rem;
  font-size: 1.9rem;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: ${(p) => p.theme.colors.morMain};
`;

export const Subtitle = styled.p`
  margin: 0;
  font-size: 1.25rem;
  line-height: 1.5;
  color: ${(p) => p.theme.colors.textSecondary};
`;

export const RecapLine = styled.div`
  margin-top: 1rem;
  font-size: 1.15rem;
  color: ${(p) => p.theme.colors.textSecondary};

  strong {
    color: ${(p) => p.theme.colors.textPrimary};
    font-weight: 600;
  }
`;

export const SearchWrapper = styled.div`
  margin-top: 1.2rem;

  .input-group {
    background: ${(p) => p.theme.colors.glassSurface};
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid ${(p) => p.theme.colors.glassBorder};
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
  }

  .input-group:focus-within {
    border-color: ${(p) => p.theme.colors.morMain};
    background: ${(p) => p.theme.colors.glassSurfaceHover};
  }

  .input-group-text {
    background: transparent;
    border: none;
    color: ${(p) => p.theme.colors.textPrimary};
    padding-right: 0;
  }

  /* THE TYPED TEXT ITSELF. Only the placeholder and the icon were styled here,
     so what the user typed fell through to Bootstrap's default — near-black, on
     a near-black field. The search worked; it was simply invisible while you
     used it. Focus needs its own rule because .form-control:focus re-asserts
     both colour and background. */
  .form-control,
  input {
    background: transparent;
    color: ${(p) => p.theme.colors.textPrimary};
    caret-color: ${(p) => p.theme.colors.morMain};
    border: none;
    box-shadow: none;
  }

  .form-control:focus,
  input:focus {
    background: transparent;
    color: ${(p) => p.theme.colors.textPrimary};
    border: none;
    box-shadow: none;
  }

  .form-control::placeholder,
  input::placeholder {
    color: ${(p) => p.theme.colors.textSecondary} !important;
    opacity: 1;
  }
`;

export const ResultCount = styled.div`
  margin-top: 0.8rem;
  font-size: 1.05rem;
  color: ${(p) => p.theme.colors.textSecondary};
  font-variant-numeric: tabular-nums;
`;

export const Body = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 1.4rem 2.4rem 2rem;

  scrollbar-width: thin;
  scrollbar-color: ${(p) => p.theme.colors.glassBorder} transparent;
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: ${(p) => p.theme.colors.glassBorder};
    border-radius: 3px;
  }
`;

export const OptionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const OptionRow = styled.button`
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 1rem;
  padding: 1.2rem 1.4rem;
  margin: 0;
  background: ${(p) => p.theme.colors.glassSurface};
  border: 1px solid ${(p) => p.theme.colors.brandTint(0.22)};
  border-radius: 10px;
  color: ${(p) => p.theme.colors.textPrimary};
  cursor: pointer;
  text-align: left;
  font: inherit;
  min-height: 44px;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    transform 0.06s ease;

  &:hover {
    background: ${(p) => p.theme.colors.brandTint(0.06)};
    border-color: ${(p) => p.theme.colors.brandTint(0.28)};
  }

  &:active {
    transform: scale(0.997);
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.brandTint(0.6)};
    outline-offset: 2px;
  }
`;

export const OptionMain = styled.div`
  min-width: 0;
`;

export const OptionName = styled.div`
  display: flex;
  align-items: center;
  gap: 0.7rem;
  font-size: 1.35rem;
  font-weight: 600;
  color: ${(p) => p.theme.colors.morMain};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const OptionMeta = styled.div`
  margin-top: 3px;
  font-size: 1.1rem;
  color: ${(p) => p.theme.colors.textSecondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const CheapestBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: ${(p) => p.theme.radii.sm};
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  background: ${(p) => p.theme.colors.successTint(0.18)};
  color: ${(p) => p.theme.colors.success};
`;

export const PriceBlock = styled.div`
  text-align: right;
  white-space: nowrap;
`;

export const PriceValue = styled.div`
  font-variant-numeric: tabular-nums;
  font-size: 1.3rem;
  font-weight: 500;
  color: ${(p) => p.theme.colors.textPrimary};
`;

export const PriceUnit = styled.div`
  font-size: 0.95rem;
  color: ${(p) => p.theme.colors.textSecondary};
  margin-top: 1px;
`;

export const EmptyState = styled.div`
  padding: 3.6rem 2rem;
  text-align: center;
  color: ${(p) => p.theme.colors.textSecondary};
  font-size: 1.3rem;
  line-height: 1.5;

  svg {
    opacity: 0.4;
    margin-bottom: 1rem;
  }
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

export const SpinIcon = styled.span`
  display: inline-flex;
  animation: ${spin} 0.9s linear infinite;
  color: ${(p) => p.theme.colors.morMain};

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export const LoadingState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.2rem;
  padding: 4.4rem 2rem;
  text-align: center;
  color: ${(p) => p.theme.colors.textSecondary};
  font-size: 1.25rem;
  line-height: 1.5;
`;

// Money surfaces (repo invariant B1): solid, opaque, max-contrast — never
// glass or glow — because this is the panel that states what will be staked.
export const SummaryCard = styled.div`
  background: ${(p) => p.theme.colors.moneySurfaceBg};
  border: 1px solid ${(p) => p.theme.colors.moneySurfaceBorder};
  border-radius: ${(p) => p.theme.radii.md};
  padding: 1.4rem 1.6rem;
`;

export const SummaryRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1.2rem;
  padding: 0.6rem 0;

  & + & {
    border-top: 1px solid ${(p) => p.theme.colors.moneySurfaceBorder};
  }
`;

export const SummaryLabel = styled.span`
  font-size: 1.15rem;
  color: ${(p) => p.theme.colors.textSecondary};
`;

export const SummaryValue = styled.span`
  font-size: 1.3rem;
  font-weight: 600;
  text-align: right;
  color: ${(p) => p.theme.colors.moneySurfaceText};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
`;

export const StakeValue = styled(SummaryValue)`
  font-size: 1.6rem;
  color: ${(p) => p.theme.colors.morMain};
`;

// The collateral-not-a-fee disclosure. Carried by the TEXT; colour is not the
// only signal on a money surface.
export const StakeNote = styled.p`
  margin: 1.2rem 0 0;
  font-size: 1.15rem;
  line-height: 1.55;
  color: ${(p) => p.theme.colors.textSecondary};
`;

// `css` (not a plain string) — a plain template literal can only hold static
// text, so the `theme.radii.md` accessor below would be stringified as the
// literal text of the arrow function instead of being called with props.
const calloutBase = css`
  display: flex;
  gap: 0.9rem;
  align-items: flex-start;
  padding: 1.2rem 1.4rem;
  border-radius: ${(p) => p.theme.radii.md};
  font-size: 1.2rem;
  line-height: 1.5;
`;

export const WarningCallout = styled.div`
  ${calloutBase}
  background: ${(p) => p.theme.colors.warningTint(0.1)};
  border: 1px solid ${(p) => p.theme.colors.warningTint(0.4)};
  color: ${(p) => p.theme.colors.textPrimary};

  svg {
    flex-shrink: 0;
    margin-top: 0.1rem;
    color: ${(p) => p.theme.colors.warning};
  }
`;

export const ErrorCallout = styled.div`
  ${calloutBase}
  background: ${(p) => p.theme.colors.dangerTint(0.1)};
  border: 1px solid ${(p) => p.theme.colors.dangerTint(0.4)};
  color: ${(p) => p.theme.colors.textPrimary};

  svg {
    flex-shrink: 0;
    margin-top: 0.1rem;
    color: ${(p) => p.theme.colors.danger};
  }
`;

export const SuccessCallout = styled.div`
  ${calloutBase}
  background: ${(p) => p.theme.colors.successTint(0.1)};
  border: 1px solid ${(p) => p.theme.colors.successTint(0.4)};
  color: ${(p) => p.theme.colors.textPrimary};

  svg {
    flex-shrink: 0;
    margin-top: 0.1rem;
    color: ${(p) => p.theme.colors.success};
  }
`;

export const CalloutText = styled.div`
  min-width: 0;
`;

/* The plain-language failure block. The headline carries the weight; the raw
   text is deliberately quieter and folded away, because it is for whoever is
   diagnosing rather than for whoever is stuck. */
export const FailureHeadline = styled.div`
  font-weight: 600;
  margin-bottom: 0.4rem;
`;

export const FailureAdvice = styled.div`
  opacity: 0.9;
  margin-bottom: 0.4rem;
`;

export const FailureDetails = styled.details`
  margin-top: 0.6rem;

  summary {
    cursor: pointer;
    opacity: 0.65;
    font-size: 1.2rem;
    user-select: none;
  }
`;

export const FailureRaw = styled.pre`
  margin: 0.6rem 0 0;
  padding: 0.8rem;
  border-radius: 0.6rem;
  background: ${(p) => p.theme.colors.dangerTint(0.14)};
  font-size: 1.1rem;
  line-height: 1.4;
  /* Long router errors are one unbroken line; without this the dialog grows a
     horizontal scrollbar and the message becomes unreadable. */
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 14rem;
  overflow-y: auto;
`;

/* The two launch buttons on the success panel. Wraps rather than squashing:
   the labels are words, not icons, and a cramped one reads as disabled. */
export const LaunchRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-top: 1.2rem;
`;

/* The mark-up / mark-down controls on a provider row. Rendered as spans with a
   button role: a <button> inside the row's own <button> is invalid HTML and
   Safari swallows the inner click entirely. */
export const MarkGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: 0.8rem;
`;

export const MarkBtn = styled.span<{ $on?: boolean; $bad?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: ${(p) => p.theme.radii.sm};
  cursor: pointer;
  color: ${(p) =>
    p.$on
      ? p.$bad
        ? p.theme.colors.danger
        : p.theme.colors.morMain
      : p.theme.colors.textSecondary};
  opacity: ${(p) => (p.$on ? 1 : 0.55)};
  transition:
    opacity 0.12s ease,
    background 0.12s ease;

  &:hover {
    opacity: 1;
    background: ${(p) => p.theme.colors.brandTint(0.1)};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.brandTint(0.6)};
    outline-offset: 2px;
  }
`;

export const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.4rem 2.4rem;
  border-top: 1px solid ${(p) => p.theme.colors.glassBorder};
`;

export const FooterLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
`;

export const FooterRight = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
`;

// Utility action (Back / Try again) — quiet, not a call to action.
export const GhostBtn = styled.button.attrs({ type: 'button' })`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 40px;
  padding: 0.7rem 1.4rem;
  border-radius: ${(p) => p.theme.radii.pill};
  font-family: inherit;
  font-size: ${(p) => p.theme.type.sm};
  font-weight: 600;
  cursor: pointer;
  color: ${(p) => p.theme.colors.textSecondary};
  background: transparent;
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
  transition:
    color 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease;

  &:hover:not([disabled]) {
    color: ${(p) => p.theme.colors.textPrimary};
    background: ${(p) => p.theme.colors.glassSurfaceHover};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.brandTint(0.5)};
    outline-offset: 2px;
  }

  &[disabled] {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

// The primary CTA: the ring-of-light object shared by ChatIntroButton / Btn
// elsewhere in the app, in pill form — not a solid slab.
export const PrimaryBtn = styled.button.attrs({ type: 'button' })`
  min-width: 160px;
  min-height: 40px;
  padding: 0.7rem 1.8rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  border-radius: ${(p) => p.theme.radii.pill};
  font-family: inherit;
  font-size: ${(p) => p.theme.type.sm};
  font-weight: 600;
  letter-spacing: 0.2px;
  cursor: pointer;
  color: ${(p) => p.theme.colors.morMain};
  background: ${(p) => p.theme.colors.brandTint(0.06)};
  border: 1.5px solid ${(p) => p.theme.colors.brandTint(0.85)};
  box-shadow:
    0 0 12px ${(p) => p.theme.colors.brandTint(0.45)},
    inset 0 0 8px ${(p) => p.theme.colors.brandTint(0.18)};
  transition:
    box-shadow 0.15s ease,
    background 0.15s ease;

  &:hover:not([disabled]) {
    background: ${(p) => p.theme.colors.brandTint(0.14)};
    box-shadow:
      0 0 18px ${(p) => p.theme.colors.brandTint(0.65)},
      inset 0 0 10px ${(p) => p.theme.colors.brandTint(0.28)};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.morMain};
    outline-offset: 2px;
  }

  &[disabled] {
    opacity: 0.35;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const StepContent = styled.div`
  min-height: 0;
`;
