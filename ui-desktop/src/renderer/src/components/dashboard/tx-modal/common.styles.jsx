import styled from 'styled-components';
import { BaseBtn } from '../../common';

export const HeaderWrapper = styled.div`
  display: flex;
  position: relative;
  height: 10%;
  align-content: center;
  align-items: center;
`;

export const Header = styled.div`
  font-size: 1.6rem;
  font-weight: bold;
  color: ${p => p.theme.colors.textPrimary};
  text-align: center;
  width: 100%;
`;

export const BackBtn = styled(BaseBtn)`
  position: absolute;
  color: ${p => p.theme.colors.textPrimary};
  font-weight: bold;
  margin: 8px 0 0 5px;
  min-width: 40px;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const Footer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: left;
`;

export const FooterRow = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
`;

export const FooterBlock = styled.div`
  display: flex;
  flex-direction: column;
`;

// Caption label ("MOR Address", "MOR Balance") — copy, not data. Brand accent
// per the rest of the app's field-label convention.
export const FooterLabel = styled.label`
  color: ${p => p.theme.colors.brand};
  margin-top: 5px;
  font-size: 1.6rem;
  font-weight: bold;
`;

// Money surface (B1): the actual address/amount text shown below FooterLabel.
// Solid/high-contrast, always mono for tabular alignment.
export const FooterSublabel = styled.label`
  font-family: ${p => p.theme.fontMono};
  color: ${p => p.theme.colors.moneySurfaceText};
  font-size: 1.4rem;
  font-variant-numeric: tabular-nums;
`;

// Same money-surface/mono treatment as FooterSublabel, exported separately so
// forms that reuse FooterLabel for plain captions can pair it with this for
// the adjacent data value (e.g. SendForm's balance row).
export const FooterValue = styled.span`
  font-family: ${p => p.theme.fontMono};
  color: ${p => p.theme.colors.moneySurfaceText};
  font-size: 1.4rem;
  font-variant-numeric: tabular-nums;
`;
