import * as validators from '../validators';
import { withClient } from './clientContext';
import selectors from '../selectors';
import { connect } from 'react-redux';
import * as utils from '../utils';
import PropTypes from 'prop-types';
import debounce from 'lodash/debounce';
import React from 'react';
import { lmrDecimals, ethDecimals } from '../../utils/coinValue';

const withTransactionModalState = WrappedComponent => {
  class Container extends React.Component {
    // static propTypes = {
    //   chainGasPrice: PropTypes.string.isRequired,
    //   availableCoin: PropTypes.string.isRequired,
    //   coinSymbol: PropTypes.string.isRequired,
    //   coinPrice: PropTypes.number.isRequired,
    //   walletId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
    //     .isRequired,
    //   client: PropTypes.shape({
    //     copyToClipboard: PropTypes.func.isRequired,
    //     isAddress: PropTypes.func.isRequired,
    //     sendCoin: PropTypes.func.isRequired,
    //     fromWei: PropTypes.func.isRequired,
    //     toWei: PropTypes.func.isRequired
    //   }).isRequired,
    //   // sendLmrFeatureStatus: PropTypes.oneOf(['no-funds', 'offline', 'ok'])
    //   // .isRequired,
    //   from: PropTypes.string.isRequired
    // }

    static displayName = `withTransactionModalState(${WrappedComponent.displayName ||
      WrappedComponent.name})`;

    rangeSelectOptions = [
      {
        label: this.props.symbol,
        value: 'LMR'
      },
      {
        label: this.props.symbolEth,
        value: 'ETH'
      }
    ];

    // No gas fields. The proxy-router signs the transfer and pays gas
    // (POST /blockchain/send/{eth,mor}); the renderer never touches web3 here.
    // The old gasPrice/gasLimit/estimatedFee state was Lumerin-era leftovers —
    // and since initialState never actually defined gasPrice/gasLimit while
    // validate() still ran gas validators on them, EVERY send failed with
    // "Invalid value" for a field the UI does not even show.
    initialState = {
      copyBtnLabel: 'Copy to clipboard',
      coinAmount: 0,
      usdAmount: 0,
      toAddress: '',
      selectedCurrency: this.rangeSelectOptions[0],
      errors: {
        coinAmount: '',
        toAddress: ''
      }
    };

    state = this.initialState;

    resetForm = () => this.setState(this.initialState);

    setSelectedCurrency = e => {
      this.setState({ ...this.state, selectedCurrency: e });
      this.onInputChange({
        id: 'coinAmount',
        value: this.state.coinAmount,
        selectedCurrency: e
      });
    };

    onInputChange = ({ id, value, selectedCurrency }) => {
      const { client, lmrCoinPrice, ethCoinPrice } = this.props;

      // `lmrCoinPrice` is selectors.getRate() — the redux `rate`, which is fed
      // by the rates plugin. That plugin still prices **lumerin** (the legacy
      // LMR token: rate-coingecko.js `ids: 'ethereum,lumerin,bitcoin'`), NOT
      // MOR. Using it to convert a MOR amount priced 0.1 MOR at the LMR rate,
      // which is why the form read "≈ < $0.01" for an amount actually worth
      // ~$0.22.
      //
      // The correct MOR rate is client.getRates(), which the Dashboard already
      // fetches and hands down as `mor.rate` (Dashboard.jsx:449) — the same
      // number the balance row below the input renders correctly. Use that, so
      // the amount and the balance can no longer disagree. Fall back to the
      // legacy value only if it is absent.
      const morRate = Number(this.props.mor?.rate);
      const morCoinPrice = Number.isFinite(morRate) && morRate > 0 ? morRate : lmrCoinPrice;

      const coinPrice =
        (selectedCurrency || this.state.selectedCurrency)?.value === 'LMR'
          ? morCoinPrice
          : ethCoinPrice;
      this.setState(state => {
        return {
          ...state,
          ...utils.syncAmounts({ state, coinPrice, id, value, client }),
          errors: { ...state.errors, [id]: null },
          [id]: utils.sanitizeInput(value)
        };
      });

      // (Removed: this called this.getGasEstimate(), which is defined nowhere in
      // the codebase — a guaranteed TypeError on every keystroke in the amount
      // and address fields. Gas is the router's job.)
    };

    onSubmit = type => {
      // proxy-router structs.SendRequest: { to, amount } — amount in WEI.
      // The previous payload sent `value` (plus gas/chain/walletId the router
      // ignores), while the handler reads `amount`, so `amount` arrived
      // undefined and the router rejected a required field.
      const payload = {
        to: this.state.toAddress,
        amount: this.props.client.toWei(utils.sanitize(this.state.coinAmount))
      };

      return type === 'ETH'
        ? this.props.client.sendEth(payload)
        : this.props.client.sendMor(payload);
    };

    validate = () => {
      const { coinAmount, toAddress } = this.state;
      const { client } = this.props;
      const isMor = this.state.selectedCurrency.value === 'LMR';

      // The balance to validate against comes from the SAME source the form
      // renders (balanceData -> props.mor/props.eth, client.getRates+getBalances),
      // NOT the redux wallet selectors. Those read `token.lmrBalance`, which is
      // never populated any more (balances moved to react-query) and defaults to
      // 0 — and validators.validateAmount guards its ceiling check with
      // `max && ...`, so a 0 balance made the check FALSY and skipped it
      // entirely. Result: any amount, however large, passed validation.
      const balance = Number(isMor ? this.props.mor?.value : this.props.eth?.value);

      const errors = {
        ...validators.validateToAddress(client, toAddress),
        ...validators.validateCoinAmount(client, coinAmount, balance)
      };

      // Explicit ceiling check, because validateAmount's `max &&` guard cannot
      // express "the balance is zero, so nothing is affordable".
      const amount = parseFloat(coinAmount);
      if (Number.isFinite(amount) && amount > 0) {
        if (!Number.isFinite(balance)) {
          errors.coinAmount = 'Balance unavailable — cannot verify you have enough funds';
        } else if (amount > balance) {
          errors.coinAmount = 'Insufficient funds';
        }
      }

      // The zero address passes an eth_addr check but burns the funds
      // irrecoverably. Nothing downstream stops it — the router's
      // `validate:"eth_addr"` accepts it too.
      if (/^0x0{40}$/i.test(String(toAddress).trim())) {
        errors.toAddress = 'Refusing to send to the zero address (funds would be burned)';
      }
      const hasErrors = Object.keys(errors).length > 0;
      if (hasErrors) this.setState({ errors });
      return hasErrors ? errors : false;
    };

    onMaxClick = () => {
      const coinAmount = this.props.client.fromWei(this.props.availableCoin);
      this.onInputChange({ id: 'coinAmount', value: coinAmount });
    };

    copyToClipboard = () => {
      this.props.client
        .copyToClipboard(this.props.address)
        .then(() => this.setState({ copyBtnLabel: 'Copied to clipboard!' }))
        .catch(err => this.setState({ copyBtnLabel: err.message }));
    };

    render() {
      const amountFieldsProps = utils.getAmountFieldsProps({
        coinAmount: this.state.coinAmount,
        usdAmount: this.state.usdAmount
      });
      const { sendLmrFeatureStatus, symbol } = this.props;

      const sendLmrDisabledReason =
        sendLmrFeatureStatus === 'no-funds'
          ? `You need some ${symbol} to send`
          : sendLmrFeatureStatus === 'offline'
          ? "Can't send while offline"
          : null;

      return (
        <WrappedComponent
          copyToClipboard={this.copyToClipboard}
          sendLmrDisabledReason={sendLmrDisabledReason}
          sendLmrDisabled={sendLmrFeatureStatus !== 'ok'}
          onInputChange={this.onInputChange}
          onMaxClick={this.onMaxClick}
          resetForm={this.resetForm}
          onSubmit={this.onSubmit}
          setSelectedCurrency={this.setSelectedCurrency}
          {...this.props}
          {...this.state}
          coinPlaceholder={amountFieldsProps.coinPlaceholder}
          usdPlaceholder={amountFieldsProps.usdPlaceholder}
          coinAmount={amountFieldsProps.coinAmount}
          usdAmount={amountFieldsProps.usdAmount}
          validate={this.validate}
        />
      );
    }
  }

  const mapStateToProps = state => ({
    address: selectors.getWalletAddress(state),
    explorerUrl: selectors.getContractExplorerUrl(state, {
      hash: selectors.getWalletAddress(state)
    }),
    // availableCoin: selectors.getCoinBalanceWei(state),
    coinSymbol: selectors.getCoinSymbol(state),
    lmrBalanceUSD: selectors.getWalletLmrBalanceUSD(state),
    lmrBalanceWei: selectors.getWalletLmrBalance(state),
    ethBalanceUSD: selectors.getWalletEthBalanceUSD(state),
    ethBalanceWei: selectors.getWalletEthBalance(state),
    lmrCoinPrice: selectors.getRate(state),
    ethCoinPrice: selectors.getRateEth(state),
    from: selectors.getWalletAddress(state),
    symbol: selectors.getCoinSymbol(state),
    symbolEth: selectors.getSymbolEth(state)
  });

  return connect(mapStateToProps)(withClient(Container));
};

export default withTransactionModalState;
