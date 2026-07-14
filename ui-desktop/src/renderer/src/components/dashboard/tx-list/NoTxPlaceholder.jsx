import styled from 'styled-components';
import React from 'react';
import { IconReceipt, IconArrowDownLeft } from '@tabler/icons-react';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3.2rem;
  text-align: center;

  svg {
    color: ${(p) => p.theme.colors.textMuted};
    margin-bottom: 1.2rem;
  }
`;

const Label = styled.div`
  line-height: 2.4rem;
  font-size: 1.7rem;
  font-weight: 600;
  color: ${(p) => p.theme.colors.textSecondary};
`;

const Sub = styled.div`
  margin-top: 0.4rem;
  font-size: 1.25rem;
  color: ${(p) => p.theme.colors.textMuted};
`;

// Not a dead end (playbook rule): a fresh/empty wallet gives a next action
// straight into the existing Receive modal, rather than a silent blank list.
const ReceiveLink = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 1.6rem;
  min-height: 40px;
  padding: 0.8rem 1.6rem;
  border-radius: ${(p) => p.theme.radii.pill};
  border: 1px solid ${(p) => p.theme.colors.glassBorder};
  background: ${(p) => p.theme.colors.glassSurface};
  color: ${(p) => p.theme.colors.brand};
  font: inherit;
  font-size: 1.3rem;
  font-weight: 600;
  cursor: pointer;
  transition: background ${(p) => p.theme.motion.duration.fast} ${(p) =>
    p.theme.motion.easing.standard},
    border-color ${(p) => p.theme.motion.duration.fast} ${(p) =>
      p.theme.motion.easing.standard};

  &:hover,
  &:focus-visible {
    background: ${(p) => p.theme.colors.glassSurfaceHover};
    border-color: ${(p) => p.theme.colors.brand};
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export default function NoTxPlaceholder({ onReceiveClick }) {
  return (
    <Container data-testid="no-tx-placeholder">
      <IconReceipt size={48} stroke={1.5} />
      <Label>No transactions yet</Label>
      <Sub>Your on-chain activity will appear here.</Sub>
      {onReceiveClick && (
        <ReceiveLink type="button" onClick={onReceiveClick}>
          <IconArrowDownLeft size={16} stroke={2} />
          Add funds
        </ReceiveLink>
      )}
    </Container>
  );
}
