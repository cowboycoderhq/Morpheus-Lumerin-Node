import React, { useState, useContext } from 'react';
import styled from 'styled-components';
import { ToastsContext } from '../../toasts';
import Select from 'react-select';

import BackIcon from '../../icons/BackIcon';
import SwapIcon from '../../icons/SwapIcon';
import { BaseBtn } from '../../common';
import Spinner from '../../common/Spinner';
import theme from '../../../ui/theme';
import {
  HeaderWrapper,
  BackBtn,
  Header,
  Footer,
  FooterRow,
  FooterLabel,
} from './common.styles';

const AmountContainer = styled.label`
  display: block;
  position: relative;
  font-weight: bold;
`;

const AmountInput = styled.input`
  display: flex;
  font-weight: bold;
  font-size: 4rem;
  width: 100%;
  text-align: center;
  background: #03160e !important;
  outline: none;
  border: none;
  color: ${({ isActive, theme }) =>
    isActive ? theme.colors.morMain : theme.colors.morMain};

  ::placeholder {
    color: ${(p) => p.theme.colors.morMain};
  }

  &[type='number']::-webkit-inner-spin-button,
  &[type='number']::-webkit-outer-spin-button {
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    margin: 0;
  }
`;
const AmountSublabel = styled.label`
  color: ${(p) => p.theme.colors.dark};
  font-size: 1.4rem;
  text-align: center;
`;

const SubAmount = styled.div`
  color: ${(p) => p.theme.colors.helpertextGray};
  font-size: 13px;
  text-align: center;
`;

const FeeContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding-top: 5px;
`;

const FeeRow = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
`;

const FeeLabel = styled.div`
  font-size: 1.2rem;
  color: ${(p) => p.theme.colors.dark};
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
`;
const WalletContainer = styled.label`
  display: block;
  position: relative;
`;
const WalletInputLabel = styled.span`
  position: absolute;
  z-index: 1;
  top: 50%;
  font-weight: bold;
  cursor: text;
  pointer-events: none;
  margin-left: 20px;
  -ms-transform: translateY(-50%);
  transform: translateY(-50%);
  color: ${(p) => p.theme.colors.placeholderGray};
`;

const WalletInput = styled.input`
  width: 100%;
  height: 40px;
  color: ${(p) => p.theme.colors.dark};
  font-weight: 300;
  font-size: 16px;
  background: #03160e !important;
  outline: none;
  border-radius: 5px;
  border-style: solid;
  padding: 8px 20px 6px 60px;
  border: none !important;
`;

const SendBtn = styled(BaseBtn)`
  width: 100%;
  height: 50px;
  border-radius: 5px;
  color: black;
  font-weight: 600;
  background-color: ${({ isActive, theme }) =>
    isActive ? theme.colors.helpertextGray : theme.colors.morMain};
`;

const IconContainer = styled.div`
  margin: 0 auto;
  padding: 5px;
  cursor: pointer;
`;

const SendContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-around;
  width: 100%;
  height: 50px;
  margin: 16px 0 0;
`;

const ConfirmPanel = styled.div`
  margin: 12px 0 4px;
  padding: 12px 14px;
  border-radius: 5px;
  background: #03160e;
  border: 1px solid ${(p) => p.theme.colors.morMain};
`;
const ConfirmLine = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 1.3rem;
`;
const ConfirmLabel = styled.span`
  color: ${(p) => p.theme.colors.dark};
`;
const ConfirmValue = styled.span`
  color: ${(p) => p.theme.colors.morMain};
  font-weight: 600;
`;
const ConfirmAddress = styled.div`
  margin-top: 4px;
  font-size: 1.25rem;
  line-height: 1.45;
  color: white;
  word-break: break-all;
`;
const ConfirmWarning = styled.div`
  margin-top: 8px;
  font-size: 1.1rem;
  color: ${(p) => p.theme.colors.helpertextGray};
`;

const LMR_MODE = 'coinAmount';
const USD_MODE = 'usdAmount';

const selectorStyles = {
  singleValue: (provided) => ({
    ...provided,
    color: 'white',
  }),
  control: (base, state) => ({
    ...base,
    borderColor: '#20dc8e',
    color: '#FFFFFF',
    backgroundColor: '#03160e',
    width: '100%',
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected ? '#03160e' : undefined,
    color: state.isSelected ? '#FFFFFF' : undefined,
    ':active': {
      ...base[':active'],
      backgroundColor: '#0e435380',
      color: '#FFFFFF',
    },
  }),
};

export function SendForm(props) {
  const rangeSelectOptions = [
    {
      label: props.symbol,
      value: 'LMR',
    },
    {
      label: props.symbolEth,
      value: 'ETH',
    },
  ];

  const [mode, setMode] = useState(LMR_MODE);
  const [isPending, setIsPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const context = useContext(ToastsContext);
  const selectedCurrency = props.selectedCurrency;

  const handleSendLmr = async (e) => {
    e.preventDefault();
    if (isPending) return;

    const errorObj = props.validate();
    if (errorObj) {
      const message = errorObj.coinAmount || errorObj.toAddress;
      context.toast('error', message);
      setConfirming(false);
      return;
    }

    // First press: show the confirmation, send nothing.
    if (!confirming) {
      setConfirming(true);
      return;
    }

    try {
      setIsPending(true);
      // sendMor/sendEth reject on failure and resolve with a tx hash; a missing
      // hash means the transfer did not go through, so never show success for it.
      const tx = await props.onSubmit(selectedCurrency.value);
      if (!tx) {
        throw new Error(
          'No transaction hash returned — the transfer did not go through',
        );
      }
      setConfirming(false);
      props.onTabSwitch('success');
    } catch (err) {
      context.toast('error', err.message || 'Transfer failed');
      // The transfer may have reached the chain before the promise rejected
      // (timeout / lost node after POST). Force a fresh review before any retry
      // so an ambiguous failure can't be one-click re-broadcast.
      setConfirming(false);
    }

    setIsPending(false);
  };

  const handleDestinationAddressInput = (e) => {
    e.preventDefault();
    setConfirming(false);

    props.onInputChange(e.target);
    props.onDestinationAddressInput(e.target.value);
  };

  const handleAmountInput = (e) => {
    e.preventDefault();
    setConfirming(false);

    const { value } = e.target;
    props.onInputChange({ id: mode, value });
    props.onAmountInput(value);
  };

  if (!props.activeTab) {
    return <></>;
  }

  const sanitize = (amount) => (amount === '< 0.01' ? '0.01' : amount);

  const onModeChange = () => {
    const newMode = mode === LMR_MODE ? USD_MODE : LMR_MODE;
    const newAmount = props[newMode];
    setMode(newMode);
    props.onAmountInput(sanitize(newAmount));
  };

  return (
    <>
      <HeaderWrapper>
        <BackBtn data-modal="send" onClick={props.onRequestClose}>
          <BackIcon size="2.4rem" fill="white" />
        </BackBtn>
        <Header>You are sending</Header>
      </HeaderWrapper>

      <div style={{ color: 'black' }}>
        <Select
          className="basic-single"
          classNamePrefix="select"
          name="color"
          styles={selectorStyles}
          onChange={props.setSelectedCurrency}
          value={selectedCurrency}
          options={rangeSelectOptions}
        />
      </div>

      <Column>
        <AmountContainer>
          <AmountInput
            type="number"
            placeholder={0}
            isActive={true}
            onChange={handleAmountInput}
            value={props.amountInput}
          />
        </AmountContainer>
        <AmountSublabel>
          {mode === LMR_MODE ? selectedCurrency.label : 'USD'}
        </AmountSublabel>
        <IconContainer>
          <SwapIcon
            onClick={onModeChange}
            fill={theme.colors.helpertextGray}
          ></SwapIcon>
        </IconContainer>
        {mode === LMR_MODE ? (
          <SubAmount>≈ {props.usdAmount}</SubAmount>
        ) : (
          <SubAmount>
            ≈ {props.coinAmount} {selectedCurrency.label}
          </SubAmount>
        )}

        <FeeContainer>
          {props.estimatedFee && (
            <FeeRow>
              <FeeLabel>Estimated fee:</FeeLabel>
              <FeeLabel>
                {props.estimatedFee} {props.symbolEth}
              </FeeLabel>
            </FeeRow>
          )}
        </FeeContainer>
      </Column>

      <WalletContainer>
        <WalletInputLabel>To: </WalletInputLabel>
        <WalletInput
          id="toAddress"
          onChange={handleDestinationAddressInput}
          value={props.destinationAddress}
        />
      </WalletContainer>

      <Footer>
        <FooterRow>
          <FooterLabel>{selectedCurrency.label} Balance</FooterLabel>
          <FooterLabel>
            {selectedCurrency.value === 'ETH'
              ? `${props.eth.value.toFixed(6)} ≈ ${props.eth.usd}`
              : `${props.mor.value.toFixed(6)} ≈ ${props.mor.usd}`}
          </FooterLabel>
        </FooterRow>
        {confirming && (
          <ConfirmPanel data-testid="send-confirm">
            <ConfirmLine>
              <ConfirmLabel>Sending</ConfirmLabel>
              <ConfirmValue>
                {props.coinAmount} {selectedCurrency.label}
              </ConfirmValue>
            </ConfirmLine>
            <ConfirmLine>
              <ConfirmLabel>To</ConfirmLabel>
            </ConfirmLine>
            <ConfirmAddress>{props.toAddress}</ConfirmAddress>
            <ConfirmWarning>
              Check the address character by character. Transfers cannot be
              undone or refunded.
            </ConfirmWarning>
          </ConfirmPanel>
        )}
        <FooterRow>
          <SendContainer>
            {isPending && <Spinner size="16px" />}
            {!isPending && (
              <SendBtn
                data-modal="success"
                data-testid={confirming ? 'send-confirm-btn' : 'send-review-btn'}
                onClick={handleSendLmr}
              >
                {confirming ? 'Confirm & send' : 'Review send'}
              </SendBtn>
            )}
          </SendContainer>
        </FooterRow>
      </Footer>
    </>
  );
}
