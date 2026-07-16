import styled from 'styled-components';
import { Btn, BaseBtn } from '../common';

export const PageIntro = styled.p`
  margin: 0 0 1.6rem;
  max-width: 64rem;
  font-size: ${(p) => p.theme.type.sm};
  line-height: 1.5;
  color: ${(p) => p.theme.colors.textSecondary};
`;

export const SectionHeading = styled.div`
  margin: 2.4rem 0 1.2rem;

  &:first-child {
    margin-top: 0;
  }
`;

export const SubHeader = styled.h2`
  font-size: ${(p) => p.theme.type.md};
  font-family: ${(p) => p.theme.fontUI};
  white-space: nowrap;
  font-weight: 600;
  color: ${(p) => p.theme.colors.textPrimary};
  margin: 0 0 0.4rem;
`;

export const SectionHint = styled.p`
  margin: 0;
  font-size: ${(p) => p.theme.type.xs};
  color: ${(p) => p.theme.colors.textSecondary};
`;

export const AgentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  padding-bottom: 2rem;
`;

export const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  padding: 2.4rem 1.8rem;
  border-radius: ${(p) => p.theme.radii.md};
  border: 1px dashed ${(p) => p.theme.colors.glassBorder};
  color: ${(p) => p.theme.colors.textMuted};
  font-size: ${(p) => p.theme.type.sm};
  text-align: center;
`;

// Row action — solid/effect-free per B1 (approving access/allowance is a
// permission-and-money-adjacent action, so it gets the same calm, high-
// contrast confirm styling as the rest of the app's money surfaces, not an
// ambient glow CTA).
export const Button = styled(Btn)`
  height: 4rem;
  padding: 0 1.6rem;
  font-size: ${(p) => p.theme.type.sm};
  line-height: 1;
  white-space: nowrap;
`;

export const AgentDelete = styled(BaseBtn)`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 4rem;
  min-height: 4rem;
  width: 4rem;
  height: 4rem;
  border-radius: ${(p) => p.theme.radii.md};
  background-color: ${(p) => p.theme.colors.danger};
  color: ${(p) => p.theme.colors.textPrimary};

  &:not([disabled], [data-disabled]):hover,
  &:not([disabled], [data-disabled]):focus-visible {
    filter: brightness(1.08);
  }
`;

export const TransactionList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  margin: 0;
  padding: 1.6rem;
  list-style: none;
`;

export const TransactionRow = styled.li`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1em;
  padding: 1rem 1.2rem;
  border-radius: ${(p) => p.theme.radii.md};
  background: ${(p) => p.theme.colors.glassSurface};
  border: 1px solid ${(p) => p.theme.colors.glassBorder};

  a {
    font-family: ${(p) => p.theme.fontMono};
    font-size: ${(p) => p.theme.type.xs};
    color: ${(p) => p.theme.colors.secondaryLight};
    text-decoration: underline;
    overflow-wrap: anywhere;

    &:focus-visible {
      outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
      outline-offset: 2px;
    }
  }
`;

// Loading / error / empty states for the transactions modal — so a fetch
// in flight or a failure never renders as a blank panel.
export const TxStateBlock = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2rem;
  padding: 3.2rem 1.6rem;
  text-align: center;
`;

export const TxStateText = styled.p`
  margin: 0;
  font-size: ${(p) => p.theme.type.sm};
  color: ${(p) => p.theme.colors.textSecondary};
`;

export const ScrollContainer = styled.div`
  height: 100%;
  overflow-y: auto;
`;
