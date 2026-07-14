import React, { useContext } from 'react';
import styled from 'styled-components';
import QRCode from 'qrcode.react';

import { ToastsContext } from '../../toasts';
import BackIcon from '../../icons/BackIcon';
import CopyIcon from '../../icons/CopyIcon';
import { BaseBtn, Btn } from '../../common';
import theme from '../../../ui/theme';
import {
  HeaderWrapper,
  Header,
  BackBtn,
  Footer,
  FooterRow,
  FooterLabel,
  FooterBlock,
  FooterSublabel,
} from './common.styles';
import { abbreviateAddress } from '../../../utils';
import { useState } from 'react';
const QRContainer = styled.div`
  display: flex;
  align-self: center;
  padding: 3rem 1.6rem 1.6rem 1.6rem;

  & canvas {
    display: block;
  }
`;

export const Divider = styled.div`
  margin-top: 5px;
  width: 100%;
  height: 0px;
  border: 0.5px solid ${p => p.theme.colors.moneySurfaceBorder};
`;

const CopyBtn = styled(BaseBtn)`
  background-color: transparent;
  border-radius: ${p => p.theme.radii.sm};
  padding: 0 !important;
  margin: 0 !important;
  min-width: 40px;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  :hover {
    padding: 0 !important;
    margin: 0 !important;
  }
`;

export function ReceiveForm({
  activeTab,
  address,
  onRequestClose,
  copyToClipboard,
  explorerUrl,
  eth,
  mor,
}) {
  const context = useContext(ToastsContext);

  const handleCopyToClipboard = () => {
    copyToClipboard(address);
    context.toast('info', 'Address copied to clipboard', {
      autoClose: 1500,
    });
  };

  if (!activeTab) {
    return <></>;
  }

  return (
    <>
      <HeaderWrapper>
        <BackBtn data-modal="send" onClick={onRequestClose} aria-label="Go back">
          <BackIcon size="2.4rem" fill={theme.colors.textPrimary} />
        </BackBtn>
        <Header>You are receiving</Header>
      </HeaderWrapper>
      <QRContainer>
        <QRCode value={address} bgColor="transparent" fgColor={theme.colors.brand} />
      </QRContainer>
      <Footer>
        <FooterRow>
          <FooterBlock>
            <FooterLabel>{mor.symbol} Address</FooterLabel>
            <FooterSublabel>{abbreviateAddress(address, 6)}</FooterSublabel>
          </FooterBlock>
          <CopyBtn onClick={handleCopyToClipboard} aria-label="Copy address to clipboard">
            <CopyIcon fill={theme.colors.brand} size="3.8rem" />
          </CopyBtn>
        </FooterRow>
        <FooterLabel>{mor.symbol} Balance</FooterLabel>
        <FooterSublabel>
          {mor.value.toFixed(6)} {mor.symbol} ≈ {mor.usd || 0}
        </FooterSublabel>
        <FooterLabel>{eth.symbol} Balance</FooterLabel>
        <FooterSublabel>
          {eth.value.toFixed(6)} {eth.symbol} ≈ {eth.usd || 0}
        </FooterSublabel>
        <Divider style={{ margin: '2rem 0' }} />
        <Btn
          block
          style={{ marginBottom: '5px' }}
          onClick={() => {
            window.openLink(explorerUrl);
          }}
        >
          View account at {explorerUrl ? new URL(explorerUrl).hostname : ''}
        </Btn>
      </Footer>
    </>
  );
}
