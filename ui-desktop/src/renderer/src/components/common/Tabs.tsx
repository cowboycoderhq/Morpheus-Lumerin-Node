import styled from 'styled-components';

// A segmented control, not a folder tab.
//
// The tabs used to be fused to the panel below them: the active one grew a
// bottom border that ran into the content card, so the two read as a single
// welded object with an odd notch where they met. They are now discrete
// controls that sit ABOVE the panel with air between them — you pick a mode
// here, and the window below shows it.
const Container = styled.div`
  display: flex;
  flex-shrink: 0;
  gap: 0.8rem;
  margin-bottom: 1.6rem;
`;

const Tab = styled.button<{ isDisabled: boolean; isActive: boolean }>`
  font: inherit;
  cursor: ${(p) => (p.isDisabled ? 'not-allowed' : 'pointer')};
  flex-grow: 1;
  padding: 1.4rem 2rem;
  border-radius: ${(p) => p.theme.radii.md};
  border: 1px solid
    ${(p) => (p.isActive ? p.theme.colors.brand : p.theme.colors.glassBorder)};
  background: ${(p) =>
    p.isActive ? 'rgba(94, 208, 255, 0.14)' : 'transparent'};
  color: ${(p) =>
    p.isActive
      ? p.theme.colors.brandBright
      : p.isDisabled
        ? p.theme.colors.textMuted
        : p.theme.colors.textSecondary};
  box-shadow: ${(p) =>
    p.isActive ? '0 0 16px rgba(94, 208, 255, 0.18)' : 'none'};
  font-size: ${(p) => p.theme.type.sm};
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-align: center;
  line-height: 2rem;
  outline: none;
  transition:
    color ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard},
    background ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard},
    border-color ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard};

  &:hover:not(:disabled) {
    color: ${(p) => p.theme.colors.brandBright};
    border-color: ${(p) => p.theme.colors.glassBorderBright};
    background: rgba(94, 208, 255, 0.08);
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.brand};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

type Props = {
  onClick: (tab: string | undefined) => void;
  active: string;
  items: { label: string; id: string; disabled?: boolean }[];
};

export default function Tabs({ onClick, active, items }: Props) {
  return (
    <Container>
      {items.map(({ label, id, disabled, ...other }) => (
        <Tab
          data-testid={`${id}-tab`}
          isDisabled={!!disabled}
          isActive={active === id}
          data-tab={id}
          onClick={
            disabled
              ? undefined
              : ({ currentTarget }) => onClick(currentTarget.dataset.tab)
          }
          key={id}
          {...other}
        >
          {label}
        </Tab>
      ))}
    </Container>
  );
}
