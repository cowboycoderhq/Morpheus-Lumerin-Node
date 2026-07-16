import React, { useState, useContext } from 'react';
import styled, { useTheme } from 'styled-components';
import { ToastsContext } from '../../toasts';
import Select from 'react-select';

import BackIcon from '../../icons/BackIcon';
import SwapIcon from '../../icons/SwapIcon';
import { Btn } from '../../common';
import Spinner from '../../common/Spinner';
import {
  HeaderWrapper,
  BackBtn,
  Header,
  Footer,
  FooterRow,
  FooterLabel,
  FooterValue,
} from './common.styles';

const AmountContainer = styled.label`
  display: block;
  position: relative;
  font-weight: bold;
`;

// Money surface (B1): the amount being sent — mono/tabular, solid background.
const AmountInput = styled.input`
  border-radius: ${(p) => p.theme.radii.md};
  display: flex;
  font-family: ${(p) => p.theme.fontMono};
  font-weight: bold;
  font-size: 4rem;
  width: 100%;
  text-align: center;
  background: ${(p) => p.theme.colors.voidAnchor} !important;
  outline: none;
  border: none;
  color: ${(p) => p.theme.colors.brand};

  ::placeholder {
    color: ${(p) => p.theme.colors.brand};
  }

  &[type='number']::-webkit-inner-spin-button,
  &[type='number']::-webkit-outer-spin-button {
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    margin: 0;
  }

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: 2px;
  }
`;
const AmountSublabel = styled.label`
  color: ${(p) => p.theme.colors.textPrimary};
  font-size: 1.4rem;
  text-align: center;
`;

const SubAmount = styled.div`
  font-family: ${(p) => p.theme.fontMono};
  color: ${(p) => p.theme.colors.textSecondary};
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
  color: ${(p) => p.theme.colors.textPrimary};
`;

// Money surface (B1): the estimated fee amount — mono/tabular.
const FeeValue = styled(FeeLabel)`
  font-family: ${(p) => p.theme.fontMono};
  color: ${(p) => p.theme.colors.moneySurfaceText};
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
  color: ${(p) => p.theme.colors.textMuted};
`;

// Money surface (B1): the destination address — mono/tabular, solid bg.
const WalletInput = styled.input`
  width: 100%;
  height: 40px;
  font-family: ${(p) => p.theme.fontMono};
  color: ${(p) => p.theme.colors.moneySurfaceText};
  font-weight: 300;
  font-size: 16px;
  background: ${(p) => p.theme.colors.voidAnchor} !important;
  outline: none;
  border-radius: ${(p) => p.theme.radii.sm};
  border-style: solid;
  padding: 8px 20px 6px 60px;
  border: none !important;

  &:focus-visible {
    outline: 2px solid ${(p) => p.theme.colors.secondaryLight};
    outline-offset: 2px;
  }
`;

const IconContainer = styled.div`
  margin: 0 auto;
  padding: 5px;
  cursor: pointer;
  min-width: 40px;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const SendContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-around;
  width: 100%;
  height: 50px;
  margin: 16px 0 0;
`;

// Money surface (B1): the confirmation is the last thing between the user and an
// irreversible transfer — solid, opaque, max contrast, no glass/glow, and the
// address in mono at full length so it can actually be checked.
const ConfirmPanel = styled.div`
  margin: 12px 0 4px;
  padding: 12px 14px;
  border-radius: ${(p) => p.theme.radii.md};
  background: ${(p) => p.theme.colors.moneySurfaceBg};
  border: 1px solid ${(p) => p.theme.colors.moneySurfaceBorder};
`;

const ConfirmLine = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
`;

const ConfirmLabel = styled.span`
  font-size: 1.1rem;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: ${(p) => p.theme.colors.textSecondary};
`;

const ConfirmValue = styled.span`
  font-family: ${(p) => p.theme.fontMono};
  font-size: 1.5rem;
  font-weight: 600;
  color: ${(p) => p.theme.colors.moneySurfaceText};
  font-variant-numeric: tabular-nums;
`;

const ConfirmAddress = styled.div`
  margin-top: 4px;
  font-family: ${(p) => p.theme.fontMono};
  font-size: 1.25rem;
  line-height: 1.45;
  color: ${(p) => p.theme.colors.moneySurfaceText};
  word-break: break-all;
`;

const ConfirmWarning = styled.div`
  margin-top: 8px;
  font-size: 1.1rem;
  line-height: 1.45;
  color: ${(p) => p.theme.colors.warning};
`;

const LMR_MODE = 'coinAmount';
const USD_MODE = 'usdAmount';

// react-select renders its own inline styles, not styled-components, so the
// theme's actual token values are read directly rather than templated.
// Built from the LIVE theme, not a static import: react-select takes a plain
// style object, so a module-scope one would freeze whichever theme was imported
// at load and the whole currency dropdown would stay aurora under classic.
const makeSelectorStyles = (theme) => ({
  control: (base, state) => ({
    ...base,
    backgroundColor: theme.colors.moneySurfaceBg,
    borderColor: state.isFocused ? theme.colors.brand : theme.colors.moneySurfaceBorder,
    boxShadow: 'none',
    color: theme.colors.textPrimary,
    width: '100%',
    minHeight: '44px',
    ':hover': { borderColor: theme.colors.brand },
  }),
  singleValue: (base) => ({ ...base, color: theme.colors.textPrimary }),
  input: (base) => ({ ...base, color: theme.colors.textPrimary }),
  placeholder: (base) => ({ ...base, color: theme.colors.textMuted }),
  indicatorSeparator: (base) => ({ ...base, backgroundColor: theme.colors.moneySurfaceBorder }),
  dropdownIndicator: (base) => ({ ...base, color: theme.colors.textSecondary }),

  // react-select injects its OWN inline styles for the menu, so the theme never
  // reached it: the popup rendered on react-select's default WHITE background
  // with pale text, leaving the unselected option (ETH) effectively invisible.
  // Every menu surface has to be styled explicitly.
  menu: (base) => ({
    ...base,
    backgroundColor: theme.colors.moneySurfaceBg,
    border: `1px solid ${theme.colors.moneySurfaceBorder}`,
    borderRadius: '8px',
    overflow: 'hidden',
    zIndex: 30,
  }),
  menuList: (base) => ({ ...base, backgroundColor: theme.colors.moneySurfaceBg, padding: 0 }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? theme.colors.brandTint(0.18)
      : state.isFocused
        ? theme.colors.brandTint(0.1)
        : 'transparent',
    // Never dim an option to unreadable — the selectable choice is the whole
    // point of the menu.
    color: theme.colors.textPrimary,
    cursor: 'pointer',
    ':active': { backgroundColor: theme.colors.brandTint(0.24) },
  }),
});

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
  // A transfer is irreversible and there is no undo. One click must not move
  // funds: the first press validates and shows exactly what is about to happen
  // (full destination address, amount, token); only the second press sends.
  const [confirming, setConfirming] = useState(false);
  const context = useContext(ToastsContext);
  const selectedCurrency = props.selectedCurrency;
  const theme = useTheme();
  const selectorStyles = makeSelectorStyles(theme);

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
      // client.sendMor/sendEth now REJECT on failure and resolve with a tx hash.
      // (They used to swallow errors and resolve `undefined`, so a failed
      // transfer landed on the success screen.) Treat a missing hash as failure.
      const tx = await props.onSubmit(selectedCurrency.value);
      if (!tx) {
        throw new Error('No transaction hash returned — the transfer did not go through');
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
        <BackBtn data-modal="send" onClick={props.onRequestClose} aria-label="Go back">
          <BackIcon size="2.4rem" fill={theme.colors.textPrimary} />
        </BackBtn>
        <Header>You are sending</Header>
      </HeaderWrapper>

      <div>
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
            fill={theme.colors.textSecondary}
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
              <FeeValue>
                {props.estimatedFee} {props.symbolEth}
              </FeeValue>
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
          <FooterValue>
            {selectedCurrency.value === 'ETH'
              ? `${props.eth.value.toFixed(6)} ≈ ${props.eth.usd}`
              : `${props.mor.value.toFixed(6)} ≈ ${props.mor.usd}`}
          </FooterValue>
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
            {/* The confirm panel reads toAddress — the HOC state that onSubmit
                actually sends (`to: this.state.toAddress`) — not the input's
                local echo. A confirmation must show the value being sent. */}
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
              <Btn
                block
                data-modal="success"
                data-testid={confirming ? 'send-confirm-btn' : 'send-review-btn'}
                onClick={handleSendLmr}
              >
                {confirming ? 'Confirm & send' : 'Review send'}
              </Btn>
            )}
          </SendContainer>
        </FooterRow>
      </Footer>
    </>
  );
}
