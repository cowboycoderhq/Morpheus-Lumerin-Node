import styled from 'styled-components';
import { motion } from 'framer-motion';

export const AgentActionsCell = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 1em;
  align-items: center;
`;

// Card surface for one agent — Aurora glass surface (B1: this is an
// access/permissions list, not a money surface, so glass/glow is allowed).
// Renamed from a plain grid row to a bordered card so the list reads as
// distinct, scannable items rather than a dense table.
export const AgentRow = styled(motion.div)`
  display: grid;
  grid-template-columns: 4.8rem 1.2fr 1.6fr 1.4fr auto;
  align-items: center;
  gap: 1.6rem;
  width: 100%;
  min-height: 6.4rem;
  padding: 1.4rem 1.8rem;
  border-radius: ${(p) => p.theme.radii.md};
  background: ${(p) => p.theme.colors.glassSurface};
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
  transition:
    background ${(p) => p.theme.motion.duration.base} ${(p) =>
      p.theme.motion.easing.standard},
    border-color ${(p) => p.theme.motion.duration.base} ${(p) =>
      p.theme.motion.easing.standard},
    box-shadow ${(p) => p.theme.motion.duration.base} ${(p) =>
      p.theme.motion.easing.standard};

  &:hover {
    background: ${(p) => p.theme.colors.glassSurfaceHover};
    border-color: ${(p) => p.theme.colors.brand};
    box-shadow: ${(p) => p.theme.shadows.glow};
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const AgentLogo = styled.div`
  width: 4.4rem;
  height: 4.4rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${(p) => p.theme.radii.pill};
  /* Brand tint (20dc8e @ 12%) — matches the low-alpha badge convention used
     for semantic icon badges (RemediationCard IconBadge) elsewhere. */
  background: ${(p) => p.theme.colors.brandTint(0.12)};
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
  color: ${(p) => p.theme.colors.brand};
  font-family: ${(p) => p.theme.fontUI};
  font-size: ${(p) => p.theme.type.sm};
  font-weight: 700;
`;

export const AgentName = styled.div`
  font-size: ${(p) => p.theme.type.base};
  font-weight: 600;
  color: ${(p) => p.theme.colors.textPrimary};
  overflow-wrap: anywhere;
`;

export const AgentAllowance = styled.div`
  font-size: ${(p) => p.theme.type.xs};
  display: flex;
  flex-direction: column;
`;

export const AgentPermissions = styled.div`
  font-size: ${(p) => p.theme.type.xs};
  display: flex;
  flex-wrap: wrap;
  column-gap: 1em;
`;
