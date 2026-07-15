import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';

import { ReceiveForm } from './ReceiveForm';
import { SendForm } from './SendForm';
import { SuccessForm } from './SuccessForm';
import withTransactionModalState from '../../../store/hocs/withTransactionModalState';

const Modal = styled.div`
  display: flex;
  flex-direction: column;
  position: fixed;
  z-index: 10;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
  background-color: rgb(0, 0, 0);
  background-color: rgba(0, 0, 0, 0.4);
  align-items: center;
  justify-content: center;
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: fixed;
  z-index: 20;
  background-color: ${p => p.theme.colors.morLight};
  width: 400px;
  min-height: 500px;
  max-height: 88vh;
  overflow-y: auto;
  border-radius: 5px;
  padding: 2rem 3rem 2rem 3rem;
`;

function TransactionModal(props) {
  const [amount, setAmount] = useState(null);
  const [destinationAddress, setDestinationAddress] = useState('');

  const handlePropagation = e => e.stopPropagation();

  const onSetDestinationAddress = value => setDestinationAddress(value);

  if (!props.activeTab) {
    return <></>;
  }

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
