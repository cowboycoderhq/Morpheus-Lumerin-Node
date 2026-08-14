import React from 'react';
import styled from 'styled-components';

import withOfflineWarningState from '../store/hocs/withOfflineWarningState';

import { BaseBtn } from './common';
import CloseIcon from './icons/CloseIcon';

const Container = styled.div`
  border-radius: ${(p) => p.theme.radii.lg};
  position: fixed;
  top: 0;
  z-index: 3;
  right: 0;
  left: 0;
  padding: 0.4rem;
  background: ${(p) => p.theme.colors.danger};
  text-align: center;
  font-size: 1.2rem;
  text-shadow: 0 1px 0 ${(p) => p.theme.colors.darkShade};
`;

const DismissBtn = styled(BaseBtn)`
  position: relative;
  top: 1px;
  left: 6px;
`;

function OfflineWarning({ handleDismissClick, isVisible }) {
  return (
    isVisible && (
      <Container>
        Your wallet is not connected to the network. Check your internet
        connection.{' '}
        <DismissBtn onClick={handleDismissClick}>
          <CloseIcon size="1.2rem" />
        </DismissBtn>
      </Container>
    )
  );
}

export default withOfflineWarningState(OfflineWarning);
