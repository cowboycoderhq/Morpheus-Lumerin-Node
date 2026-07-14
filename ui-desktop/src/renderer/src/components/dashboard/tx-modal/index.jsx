import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';

import { ReceiveForm } from './ReceiveForm';
import { SendForm } from './SendForm';
import { SuccessForm } from './SuccessForm';
import withTransactionModalState from '../../../store/hocs/withTransactionModalState';

const Modal = styled.div`
  border-radius: ${(p) => p.theme.radii.lg};
  display: flex;
  flex-direction: column;
  position: fixed;
  z-index: 10;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
  /* Backdrop was rgba(2, 18, 11, …) — another pre-Aurora green. Void, not green. */
  background-color: rgba(2, 6, 12, 0.72);
  align-items: center;
  justify-content: center;
`;

// Money surface (B1): Send/Receive/Success all show balances/addresses —
// solid/opaque, no glass/glow.
const Body = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: fixed;
  z-index: 20;
  background-color: ${p => p.theme.colors.moneySurfaceBg};
  border: 1px solid ${p => p.theme.colors.moneySurfaceBorder};
  box-shadow: ${p => p.theme.shadows.elevated};
  width: 400px;
  /* Was a hard height: 500px, so the confirmation panel pushed the send button
     out of the window. Grow with the content, cap at the viewport, scroll. */
  min-height: 500px;
  max-height: 88vh;
  overflow-y: auto;
  border-radius: ${p => p.theme.radii.lg};
  padding: 2rem 3rem 2rem 3rem;
`;

function TransactionModal(props) {
  const [amount, setAmount] = useState(null);
  const [destinationAddress, setDestinationAddress] = useState('');

  const handlePropagation = e => e.stopPropagation();

  // Was `e.targetValue` — not a property of anything. SendForm passes the raw
  // string (e.target.value), so this wrote `undefined` and flipped the address
  // input from controlled to uncontrolled.
  const onSetDestinationAddress = value => setDestinationAddress(value);

  if (!props.activeTab) {
    return <></>;
  }

  // Same stacking trap as the shared Modal — see components/contracts/modals/Modal.jsx.
  return createPortal(
    <Modal onClick={props.onRequestClose}>
      <Body onClick={handlePropagation}>
        {props.activeTab === 'receive' && <ReceiveForm {...props} />}
        {props.activeTab === 'send' && (
          <SendForm
            {...props}
            destinationAddress={destinationAddress}
            onDestinationAddressInput={onSetDestinationAddress}
            onAmountInput={setAmount}
            amountInput={amount}
            onSubmit={props.onSubmit}
            symbol={props.symbol}
            symbolEth={props.symbolEth}
          />
        )}
        {props.activeTab === 'success' && (
          <SuccessForm
            amountInput={amount}
            {...props}
            symbol={props.selectedCurrency.label}
          />
        )}
      </Body>
    </Modal>,
    document.body,
  );
}

export default withTransactionModalState(TransactionModal);
