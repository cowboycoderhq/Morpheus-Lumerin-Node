// Aurora-skinned building blocks shared by ModelsTable (registry grid) and
// PinnedFilesTable (pinned grid). Replaces the old react-bootstrap `Card` +
// hardcoded hex/`!important` overrides with theme tokens so both grids read
// as one consistent system with the rest of the app (see chat/modals/ModelRow
// for the sibling list-row treatment of the same data).
import styled, { css, keyframes } from 'styled-components';

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(34rem, 1fr));
  align-items: start;
  gap: 1.6rem;
  padding: 0.4rem 0.2rem 2rem;
`;

export const Card = styled.div`
  position: relative;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  background: rgba(13, 24, 39, 0.35);
  border: 1px solid rgba(94, 208, 255, 0.22);
  border-radius: ${(p) => p.theme.radii.lg};

  /* Corner bracket — a HUD reticule mark rather than a decorative flourish:
     it marks the panel's origin the way the JARVIS console frames its data. */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 1.2rem;
    height: 1.2rem;
    border-top: 2px solid ${(p) => p.theme.colors.secondaryLight};
    border-left: 2px solid ${(p) => p.theme.colors.secondaryLight};
    opacity: 0.55;
    pointer-events: none;
  }
  transition:
    border-color ${(p) => p.theme.motion.duration.base} ${(p) => p.theme.motion.easing.standard},
    background ${(p) => p.theme.motion.duration.base} ${(p) => p.theme.motion.easing.standard},
    transform ${(p) => p.theme.motion.duration.base} ${(p) => p.theme.motion.easing.standard},
    box-shadow ${(p) => p.theme.motion.duration.base} ${(p) => p.theme.motion.easing.standard};

  &:hover {
    background: rgba(13, 24, 39, 0.55);
    border-color: rgba(94, 208, 255, 0.55);
    transform: translateY(-2px);
    box-shadow: 0 0 20px rgba(94, 208, 255, 0.14);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: border-color ${(p) => p.theme.motion.duration.fast} linear,
      background ${(p) => p.theme.motion.duration.fast} linear;
    &:hover {
      transform: none;
    }
  }
`;

export const CardBody = styled.div`
  padding: 1.8rem;
`;

export const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.4rem;
`;

export const CardTitle = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 90%;
  font-family: ${(p) => p.theme.fontMono};
  font-size: ${(p) => p.theme.type.sm};
  font-weight: 600;
  letter-spacing: 0.06em;
  color: ${(p) => p.theme.colors.secondaryLight};
  text-shadow: 0 0 12px rgba(94, 208, 255, 0.35);
`;

export const IconButton = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 3.6rem;
  height: 3.6rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(94, 208, 255, 0.05);
  color: ${(p) => p.theme.colors.textSecondary};
  cursor: pointer;
  transition: background ${(p) => p.theme.motion.duration.fast} ${(p) => p.theme.motion.easing.standard},
    color ${(p) => p.theme.motion.duration.fast} ${(p) => p.theme.motion.easing.standard};

  &:hover,
  &:focus-visible {
    background: ${(p) =>
      p.$danger ? 'rgba(255, 92, 106, 0.16)' : 'rgba(94, 208, 255, 0.15)'};
    color: ${(p) => (p.$danger ? p.theme.colors.danger : p.theme.colors.brand)};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => (p.$danger ? p.theme.colors.danger : p.theme.colors.brand)};
    outline-offset: 2px;
  }
`;

export const InfoSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-top: 1rem;
  margin-top: 0.6rem;
  border-top: 1px solid ${(p) => p.theme.colors.glassBorder};
`;

export const InfoRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  font-size: ${(p) => p.theme.type.xs};
  padding: 0.3rem 0;
`;

export const InfoLabel = styled.span`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 9rem;
  flex-shrink: 0;
  font-family: ${(p) => p.theme.fontMono};
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${(p) => p.theme.colors.textSecondary};

  svg {
    color: ${(p) => p.theme.colors.textMuted};
    flex-shrink: 0;
  }
`;

export const InfoValue = styled.span`
  display: inline-flex;
  align-items: center;
  min-width: 0;
  font-family: ${(p) => p.theme.fontMono};
  color: ${(p) => p.theme.colors.textPrimary};
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

// Any price/monetary figure reads in the mono type family per the design
// system spec, distinguishing data values from prose.
export const PriceValue = styled.span`
  font-family: ${(p) => p.theme.fontMono};
  color: ${(p) => p.theme.colors.textPrimary};
`;

export const HashChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: ${(p) => p.theme.radii.sm};
  padding: 0.4rem 0.8rem;
  font-family: ${(p) => p.theme.fontMono};
  font-size: ${(p) => p.theme.type.xs};
  color: ${(p) => p.theme.colors.textPrimary};
`;

export const CopyIcon = styled.span`
  display: inline-flex;
  cursor: pointer;
  opacity: 0.75;
  color: ${(p) => p.theme.colors.textSecondary};
  transition: color ${(p) => p.theme.motion.duration.fast} ${(p) => p.theme.motion.easing.standard},
    opacity ${(p) => p.theme.motion.duration.fast} ${(p) => p.theme.motion.easing.standard};

  &:hover {
    opacity: 1;
    color: ${(p) => p.theme.colors.brand};
  }
`;

export const TagRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  align-items: center;
`;

export const Tag = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.9rem;
  border-radius: ${(p) => p.theme.radii.sm};
  background: rgba(94, 208, 255, 0.09);
  border: 1px solid rgba(94, 208, 255, 0.22);
  font-family: ${(p) => p.theme.fontMono};
  font-size: ${(p) => p.theme.type.xs};
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${(p) => p.theme.colors.textSecondary};
  transition: background ${(p) => p.theme.motion.duration.fast} ${(p) => p.theme.motion.easing.standard};

  &:hover {
    background: rgba(94, 208, 255, 0.18);
    color: ${(p) => p.theme.colors.secondaryLight};
  }
`;

// Distinct accent so the security attribute reads at a glance — mirrors the
// TEE chip in chat/modals/ModelRow so the same guarantee looks the same
// everywhere it appears.
export const SecureTag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.9rem 0.3rem 0.7rem;
  border-radius: ${(p) => p.theme.radii.sm};
  background: rgba(125, 188, 255, 0.14);
  color: rgba(173, 211, 255, 0.95);
  font-size: ${(p) => p.theme.type.xs};
  font-weight: 600;
  letter-spacing: 0.2px;
`;

export const EmptyState = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  padding: 5rem 2rem;
  color: ${(p) => p.theme.colors.textMuted};
  font-size: ${(p) => p.theme.type.sm};
  text-align: center;

  svg {
    opacity: 0.5;
  }
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

export const DownloadOverlay = styled.div`
  border-radius: ${(p) => p.theme.radii.md};
  position: absolute;
  inset: 0;
  background: rgba(2, 18, 11, 0.94);
  padding: 1.8rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1.2rem;
  z-index: 1;
`;

export const DownloadHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const DownloadTitle = styled.h4`
  margin: 0;
  font-size: ${(p) => p.theme.type.sm};
  font-weight: 600;
  color: ${(p) => p.theme.colors.brand};
  display: flex;
  align-items: center;
  gap: 0.8rem;
`;

export const Spinner = styled.span`
  display: inline-block;
  width: 1.4rem;
  height: 1.4rem;
  border: 2px solid rgba(94, 208, 255, 0.25);
  border-top-color: ${(p) => p.theme.colors.brand};
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export const ProgressTrack = styled.div`
  width: 100%;
  height: 8px;
  border-radius: ${(p) => p.theme.radii.pill};
  background: rgba(94, 208, 255, 0.08);
  overflow: hidden;
`;

export const ProgressFill = styled.div<{ $percent: number }>`
  height: 100%;
  border-radius: ${(p) => p.theme.radii.pill};
  background: ${(p) => p.theme.colors.brand};
  width: ${(p) => Math.min(100, Math.max(0, p.$percent))}%;
  transition: width ${(p) => p.theme.motion.duration.base} ${(p) => p.theme.motion.easing.standard};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const ProgressInfo = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: ${(p) => p.theme.type.xs};
  color: ${(p) => p.theme.colors.textSecondary};
`;

export const cardHoverAffordance = css`
  cursor: pointer;
`;
