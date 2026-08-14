import styled from 'styled-components';
import { AgentRow } from '@renderer/components/agents/AgentRow.styles';

export const AllowanceRow = styled(AgentRow)`
  grid-template-columns: 4.8rem 1.2fr 1.2fr 1.2fr auto;
`;

export const AgentAllowanceToken = styled.div`
  font-size: ${(p) => p.theme.type.xs};
  display: flex;
  flex-direction: column;
`;

export const AgentAllowanceValue = styled.div`
  font-size: ${(p) => p.theme.type.xs};
  display: flex;
  flex-direction: column;
`;

// Addresses/amounts get the mono treatment; the Field label above stays UI
// sans (Field.tsx owns that), so the mono font is scoped to just the value.
export const MonoText = styled.span`
  font-family: ${(p) => p.theme.fontMono};
  color: ${(p) => p.theme.colors.textPrimary};
`;
