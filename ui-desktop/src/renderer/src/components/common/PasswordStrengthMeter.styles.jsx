import styled from 'styled-components';

// Password strength feedback — a calm HUD card, not a bar crammed into the
// input. Ramp runs neutral -> amber -> green (never red-at-zero): weak reads
// as "not finished yet," not "error." See setup-wizard-playbook, Password
// phase. Motion is a plain CSS transition (event-driven fill/color change),
// disabled under prefers-reduced-motion.

export const Container = styled.div`
  margin-top: 1.2rem;
  padding: 1.4rem 1.6rem;
  border-radius: ${p => p.theme.radii.md};
  background: ${p => p.theme.colors.glassSurface};
  border: 1px solid ${p => p.theme.colors.glassBorder};
`;

export const BarRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1.2rem;
`;

export const Track = styled.div`
  position: relative;
  flex: 1;
  height: 0.6rem;
  border-radius: ${p => p.theme.radii.pill};
  background: ${p => p.theme.colors.voidElevated};
  overflow: hidden;
`;

export const Fill = styled.div`
  height: 100%;
  width: ${p => p.$width};
  border-radius: ${p => p.theme.radii.pill};
  background: ${p => p.theme.colors[p.$tone]};
  transition:
    width ${p => p.theme.motion.duration.slow} ${p => p.theme.motion.easing.standard},
    background-color ${p => p.theme.motion.duration.base} ${p => p.theme.motion.easing.standard};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const ScoreLabel = styled.span`
  flex-shrink: 0;
  min-width: 8.4rem;
  text-align: right;
  font-size: ${p => p.theme.type.xs};
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${p => p.theme.colors[p.$tone]};
  transition: color ${p => p.theme.motion.duration.base} ${p => p.theme.motion.easing.standard};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const ChecklistHeading = styled.div`
  margin: 1.4rem 0 0.7rem;
  font-size: ${p => p.theme.type.xs};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${p => p.theme.colors.textMuted};
`;

export const Checklist = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
`;

export const ChecklistItem = styled.li`
  display: flex;
  align-items: center;
  gap: 0.9rem;
  font-size: ${p => p.theme.type.sm};
  color: ${p => (p.$met ? p.theme.colors.textPrimary : p.theme.colors.textMuted)};
`;

export const CheckDot = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 50%;
  color: ${(p) => p.theme.colors.textPrimary};
  background: ${p => (p.$met ? p.theme.colors.success : 'transparent')};
  border: 1px solid ${p => (p.$met ? p.theme.colors.success : p.theme.colors.glassBorder)};
  transition:
    background-color ${p => p.theme.motion.duration.base} ${p => p.theme.motion.easing.standard},
    border-color ${p => p.theme.motion.duration.base} ${p => p.theme.motion.easing.standard};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const SuggestionLine = styled.p`
  margin: 1.4rem 0 0;
  font-size: ${p => p.theme.type.sm};
  line-height: 1.5;
  color: ${p => p.theme.colors.textSecondary};
`;
