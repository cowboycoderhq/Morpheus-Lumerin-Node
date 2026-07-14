import styled from 'styled-components';
import { BaseBtn } from '../common';

// Money surface (B1): shows live balances — solid/opaque, max-contrast, no
// glass/glow.
export const Container = styled.div`
  margin: 1.6rem 0 1.6rem;
  padding: 6px 1.6rem 6px 1.6rem;
  border-radius: ${p => p.theme.radii.md};
  max-width: 720px;

  background: ${p => p.theme.colors.moneySurfaceBg};
  border: 1px solid ${p => p.theme.colors.moneySurfaceBorder};
  color: ${p => p.theme.colors.moneySurfaceText};
`;

export const SecondaryContainer = styled.div`
  display: flex;
  min-height: 90px;
  justify-content: space-between;
  align-items: center;
`;

export const WalletBalanceHeader = styled.div`
  font-size: 1.4rem;
  text-align: center;
  color: ${p => p.theme.colors.textSecondary};
  margin: 0 0 0.3em;
`;

// The balance figure itself — money surface, always mono/tabular.
export const Primary = styled.div`
  display: flex;
  align-items: center;
  line-height: 1.5;
  font-weight: 500;
  letter-spacing: -1px;
  font-family: ${p => p.theme.fontMono};
  font-variant-numeric: tabular-nums;
  color: ${p => p.theme.colors.moneySurfaceText};
  margin: 0 2rem 0 0;
  flex-grow: 1;
  font-size: min(max(20px, 4vw), 24px);
  min-width: 20px;
  overflow: scroll;
  font-size: 2.8rem;
  -ms-overflow-style: none;
  scrollbar-width: none;
  ::-webkit-scrollbar {
    display: none;
  }
`;

export const Btn = styled(BaseBtn)`
  font-size: 1.5rem;
  margin-left: 1rem;
  padding: 1.5rem 0;
  border-radius: ${p => p.theme.radii.md} !important;
  border: 1px solid ${p => p.theme.colors.moneySurfaceBorder};
  background-color: ${p => p.theme.colors.textPrimary};
  color: ${(p) => p.theme.colors.textPrimary};

  &[data-disabled='true'],
  &[disabled] {
    border: 0.0625rem solid ${p => p.theme.colors.glassBorder} !important;
    color: ${p => p.theme.colors.textMuted} !important;
    background: transparent !important;
  }
`;

export const BtnAccent = styled(Btn)`
  border-radius: ${(p) => p.theme.radii.md};
  background-color: ${p => p.theme.colors.brand};
  color: ${(p) => p.theme.colors.textPrimary};
  font-weight: 600;
`;

export const BtnRow = styled.div`
  display: flex;
  flex-direction: row;
  width: 180px;
  height: 100%;
  align-items: center;
  justify-content: space-between;
`;

export const BalanceContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
`;

export const CoinsRow = styled.div`
  display: flex;
`;

export const GlobalContainer = styled.div`
  display: flex;
  align-items: center;
`;
