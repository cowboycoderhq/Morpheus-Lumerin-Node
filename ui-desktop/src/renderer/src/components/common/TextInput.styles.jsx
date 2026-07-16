import styled from 'styled-components';

export const Label = styled.label`
  display: block;
  line-height: 1.6rem;
  font-size: ${p => p.theme.type.sm};
  font-weight: 600;
  font-family: ${p => p.theme.fontUI};
  letter-spacing: 0.5px;
  color: ${p => (p.hasErrors ? p.theme.colors.danger : p.theme.colors.textSecondary)};
`;

// Money-adjacent (used for send/stake amount fields via AmountFields) — solid,
// effect-free, high-contrast per B1. No glass background, no glow.
export const Input = styled.input`
  border: none;
  border-bottom: 1px solid ${p => p.theme.colors.glassBorder};
  display: block;
  border-radius: ${(p) => p.theme.radii.sm};
  padding: 0.8rem 0;
  background-color: transparent;
  margin-top: 0.8rem;
  width: 100%;
  line-height: 2.5rem;
  color: ${p => (p.disabled ? p.theme.colors.textMuted : p.theme.colors.textPrimary)};
  font-family: ${p => p.theme.fontUI};
  font-size: ${p => p.theme.type.sm};
  font-weight: 600;
  letter-spacing: 0.5px;
  transition: border-color ${p => p.theme.motion.duration.base} ${p =>
    p.theme.motion.easing.standard};
  resize: vertical;
  border-bottom-color: ${p =>
    p.hasErrors ? p.theme.colors.danger : p.theme.colors.glassBorder};

  &::placeholder {
    color: ${p => p.theme.colors.textMuted};
  }

  &:focus {
    outline: none;
    border-bottom-color: ${p => {
      if (p.hasErrors) return p.theme.colors.danger;
      // noFocus: suppress the active focus color once the field already
      // holds a value (e.g. autofocused fields pre-filled by the caller) —
      // preserved from the original intent (the prior implementation had a
      // typo that silently broke the focus ring in all cases).
      if (p.noFocus && p.value && p.value.length > 0) {
        return p.theme.colors.glassBorder;
      }
      return p.theme.colors.brand;
    }};
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const TextArea = Input.withComponent('textarea');

export const ErrorMsg = styled.div`
  color: ${p => p.theme.colors.danger};
  font-family: ${p => p.theme.fontUI};
  line-height: 1.6rem;
  font-size: ${p => p.theme.type.sm};
  font-weight: 600;
  text-align: right;
  margin-top: 0.4rem;
  width: 100%;
  margin-bottom: -2rem;
  display: inline-block;
`;
