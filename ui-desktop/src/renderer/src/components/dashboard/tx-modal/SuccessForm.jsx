import React from 'react';
import styled from 'styled-components';

import { Btn } from '../../common';
import { abbreviateAddress } from '../../../utils';
import { SuccessLayer } from './SuccessLayer';
import { toUSD } from '../../../store/utils/syncAmounts';

const SuccessImage = styled.div`
  margin: 0 auto;
`;

const HeaderWrapper = styled.div`
  display: flex;
  position: relative;
  height: 10%;
  align-content: center;
  margin-bottom: 40px;
`;

const Header = styled.div`
  font-size: 1.6rem;
  font-weight: bold;
  color: ${(p) => p.theme.colors.textPrimary};
  text-align: center;
  width: 100%;
`;

const AmountContainer = styled.label`
  display: block;
  position: relative;
  font-weight: bold;
`;

// Money surface (B1): the amount just sent — mono/tabular.
const AmountInput = styled.input`
  border-radius: ${(p) => p.theme.radii.md};
  display: flex;
  font-family: ${(p) => p.theme.fontMono};
  font-weight: bold;
  font-size: 4rem;
  width: 100%;
  text-align: center;
  outline: none;
  border: none;
  background: transparent;
  color: ${(p) => p.theme.colors.moneySurfaceText};

  ::placeholder {
    color: ${(p) => p.theme.colors.moneySurfaceText};
  }
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
`;

const Footer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: left;
  text-align: center;
`;

const FooterLabel = styled.label`
  color: ${(p) => p.theme.colors.textPrimary};
  font-size: 1.2rem;
  font-weight: 600;
  margin-bottom: 5px;
`;

// Money surface (B1): the destination address inline in the confirmation
// sentence — mono/tabular.
const Address = styled.span`
  font-family: ${(p) => p.theme.fontMono};
  color: ${(p) => p.theme.colors.moneySurfaceText};
`;

const SubAmount = styled.div`
  font-family: ${(p) => p.theme.fontMono};
  color: ${(p) => p.theme.colors.textSecondary};
  font-size: 13px;
  text-align: center;
`;

export function SuccessForm(props) {
  const LMRtoUSD = (val) => {
    return toUSD(val, props.coinPrice);
  };

  if (!props.activeTab) {
    return <></>;
  }

  const onDone = () => {
    props.onRequestClose();
    props.resetForm();
  };

  return (
    <>
      <Column>
        <HeaderWrapper>
          <Header>Success</Header>
        </HeaderWrapper>
        <SuccessImage>
          <SuccessLayer />
        </SuccessImage>
      </Column>

      <Column>
        <AmountContainer>
          <AmountInput
            placeholder={0}
            value={props.coinAmount}
            readOnly
          />
        </AmountContainer>
      </Column>

      <Footer>
        <FooterLabel>
          You have successfully transferred {props.symbol} to{' '}
          <Address>{abbreviateAddress(props.toAddress)}</Address>
        </FooterLabel>
        <Btn block data-modal={null} onClick={onDone}>
          Done
        </Btn>
      </Footer>
    </>
  );
}
