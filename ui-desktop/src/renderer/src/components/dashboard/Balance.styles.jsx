import styled from 'styled-components';

export const BalanceOuterWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

export const BalanceWrap = styled.div`
  display: flex;
  flex-direction: column;
  color: ${p => p.theme.colors.moneySurfaceText};
  padding: 0.2em 0 0 0;
`;

// Money surface (B1): the coin balance figure — mono/tabular, solid text.
export const BalanceRow = styled.div`
  font-family: ${p => p.theme.fontMono};
  font-variant-numeric: tabular-nums;
  font-size: 2.5rem;
  line-height: 1;
  min-width: 8rem;
  text-align: center;
`;

export const CurrencySpan = styled.span`
  font-family: ${p => p.theme.fontMono};
  font-size: 1.7rem;
  line-height: 1.75rem;
`;

export const EquivalentUSDRow = styled.div`
  font-family: ${p => p.theme.fontMono};
  font-variant-numeric: tabular-nums;
  color: ${p => p.theme.colors.textSecondary};
  font-size: 1.3rem;
  text-align: center;
`;
