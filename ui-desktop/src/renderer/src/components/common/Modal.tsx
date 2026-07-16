import ReactModal from 'react-modal';
import styled, { useTheme } from 'styled-components';
import { Theme } from '../../ui/theme';
import CloseIcon from '../icons/CloseIcon';

type Variant = 'primary' | 'secondary';

// Modal houses money/security-sensitive surfaces (reveal secret phrase,
// transaction/allowance views) — solid, opaque, max-contrast per B1. No
// glass, no glow; only the entrance/exit transition (state-bound to
// isOpen/closing, not ambient) and it honors prefers-reduced-motion.
const Container = styled(ReactModal)`
  &.ReactModal__Content {
    opacity: 0;
    transition:
      transform ${(p) => p.theme.motion.duration.base} ${(p) =>
        p.theme.motion.easing.enter},
      opacity ${(p) => p.theme.motion.duration.base} ${(p) =>
        p.theme.motion.easing.enter};
    will-change: transform, opacity;
    transform: translate3d(-50%, 10%, 0);
  }
  &.ReactModal__Content--after-open {
    opacity: 1;
    transform: translate3d(-50%, 0, 0);
  }

  &.ReactModal__Content--before-close {
    opacity: 0;
    transform: translate3d(-50%, -10%, 0);
  }

  @media (prefers-reduced-motion: reduce) {
    &.ReactModal__Content,
    &.ReactModal__Content--after-open,
    &.ReactModal__Content--before-close {
      transition: none;
      transform: translate3d(-50%, 0, 0);
    }
  }
`;

const Header = styled.header<{
  variant: Variant;
  hasTitle: boolean;
}>`
  border-radius: ${(p) => p.theme.radii.md};
  padding: 1.6rem;
  display: flex;
  background-color: ${(p) =>
    p.variant === 'primary' ? p.theme.colors.voidElevated : 'transparent'};
  border-bottom: ${(p) =>
    p.variant === 'primary' ? `1px solid ${p.theme.colors.moneySurfaceBorder}` : 'none'};
  justify-content: ${(p) => (p.hasTitle ? 'space-between' : 'flex-end')};
  flex-shrink: 0;
`;

const Title = styled.h1<{ variant: Variant }>`
  font-family: ${(p) => p.theme.fontUI};
  font-size: ${(p) => p.theme.type.md};
  line-height: 2.4rem;
  font-weight: 600;
  color: ${(p) =>
    p.variant === 'primary' ? p.theme.colors.textPrimary : p.theme.colors.textSecondary};
  margin: 0;
  flex-grow: 1;
  cursor: default;
`;

const HeaderButton = styled.button<{ variant: Variant }>`
  border-radius: ${(p) => p.theme.radii.sm};
  margin-left: 2rem;
  background: transparent;
  border: none;
  padding: 0.4rem;
  min-width: 40px;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
  cursor: pointer;
  color: ${(p) =>
    p.variant === 'primary' ? p.theme.colors.textPrimary : p.theme.colors.textSecondary};
  transition: opacity ${(p) => p.theme.motion.duration.fast} ${(p) =>
    p.theme.motion.easing.standard};

  &[disabled] {
    color: ${(p) => p.theme.colors.textMuted};
    cursor: not-allowed;
  }

  &:not([disabled]):hover,
  &:not([disabled]):focus-visible {
    opacity: 0.6;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

type ModalProps = {
  onRequestClose: () => void;
  headerChildren?: React.ReactNode;
  children: React.ReactNode;
  variant: Variant;
  isOpen: boolean;
  title?: string;
  styleOverrides?: React.CSSProperties;
};

export default function Modal({
  onRequestClose,
  headerChildren,
  children,
  variant,
  isOpen,
  title,
  styleOverrides,
  ...other
}: ModalProps) {
  const theme = useTheme() as Theme;
  return (
    <Container
      onRequestClose={onRequestClose}
      closeTimeoutMS={600}
      contentLabel="Modal"
      isOpen={isOpen}
      style={{
        overlay: {
          backgroundColor: theme.colors.scrim,
          zIndex: '3',
        },
        content: {
          background: theme.colors.moneySurfaceBg,
          flexDirection: 'column',
          marginBottom: '1.6rem',
          borderRadius: theme.radii.lg,
          border: `1px solid ${theme.colors.moneySurfaceBorder}`,
          boxShadow: theme.shadows.elevated,
          overflowY: 'auto',
          position: 'absolute',
          outline: 'none',
          display: 'flex',
          padding: '0',
          width: '420px',
          right: 'auto',
          left: '50%',
          top: '10rem',
          ...styleOverrides,
        },
      }}
      {...other}
    >
      <Header hasTitle={!!title} variant={variant}>
        {title && <Title variant={variant}>{title}</Title>}
        {headerChildren}
        <HeaderButton onClick={onRequestClose} variant={variant}>
          <CloseIcon
            color={
              variant === 'primary'
                ? theme.colors.textPrimary
                : theme.colors.textSecondary
            }
          />
        </HeaderButton>
      </Header>
      {children}
    </Container>
  );
}
