import React from 'react';
import { withClient } from './clientContext';
import selectors from '../selectors';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { ToastsContext } from '../../components/toasts';
import { getSessionsByUser } from '../utils/apiCallsHelper';

const withDashboardState = (WrappedComponent) => {
  class Container extends React.Component {
    static propTypes = {
      sendLmrFeatureStatus: PropTypes.oneOf(['offline', 'no-funds', 'ok'])
        .isRequired,
      syncStatus: PropTypes.oneOf(['up-to-date', 'syncing', 'failed'])
        .isRequired,
      address: PropTypes.string.isRequired,
      client: PropTypes.shape({
        refreshAllTransactions: PropTypes.func.isRequired,
        copyToClipboard: PropTypes.func.isRequired,
      }).isRequired,
    };

    static contextType = ToastsContext;

    static displayName = `withDashboardState(${
      WrappedComponent.displayName || WrappedComponent.name
    })`;

    state = {
      refreshStatus: 'init',
      refreshError: null,
    };

    onWalletRefresh = () => {
      this.setState({ refreshStatus: 'pending', refreshError: null });
      this.loadTransactions();
    };

    loadTransactions = async (page = 1, pageSize = 15) => {
      this.setState({ refreshStatus: 'pending', refreshError: null });
      const transactions = await this.props.client.getTransactions({
        page,
        pageSize,
      });
      this.setState({ refreshStatus: 'success' });

      // if (page && pageSize) {
      //   const hasNextPage = transactions.length;
      //   this.props.nextPage({
      //     hasNextPage: Boolean(hasNextPage),
      //     page: page + 1,
      //   })
      // }
      return transactions;
    };

    // Raw user sessions — shares the same shape (and react-query cache key) as
    // the Chat tab so the two tabs dedupe instead of each paginating on mount.
    getSessionsByUser = async (user) => {
      if (!user) {
        return [];
      }
      const authHeaders = await this.props.client.getAuthHeaders();
      return (
        (await getSessionsByUser(
          this.props.config.chain.localProxyRouterUrl,
          user,
          authHeaders,
        )) || []
      );
    };

    getBalances = async () => {
      const balances = await this.props.client.getBalances();
      const rate = await this.props.client.getRates();
      return { balances, rate };
    };

    // Stake time-locked by closing a session before `releaseAt` - the start of
    // the UTC day after it ended - which covers early, natural and late
    // same-day closes alike, not early close alone (SessionRouter.sol:296-298,
    // gated at :305 on `block.timestamp < releaseAt_`). This is the money that
    // used to simply vanish: the Diamond has always tracked it, but nothing in
    // the app ever asked, so the user saw their balance drop and had no way to
    // learn where it went or when it returns.
    //
    // Fetched straight from the local proxy-router (same pattern as
    // withChatState.getProviders) rather than through the main process — the
    // route is a plain authenticated GET and needs no IPC channel of its own.
    //
    // Returns null on failure rather than zeroes: "we could not ask" and "you
    // have nothing on hold" are different answers, and showing 0 MOR for the
    // first would repeat the original bug in a new place.
    getStakesOnHold = async () => {
      try {
        const authHeaders = await this.props.client.getAuthHeaders();
        const path = `${this.props.config.chain.localProxyRouterUrl}/blockchain/stakes/on-hold`;
        const response = await fetch(path, { headers: authHeaders });
        const data = await response.json();
        if (data.error) {
          console.error(data.error);
          return null;
        }
        return { available: data.available, hold: data.hold };
      } catch (e) {
        console.error('Could not read stakes on hold', e);
        return null;
      }
    };

    render() {
      const { sendLmrFeatureStatus } = this.props;

      const sendDisabledReason =
        sendLmrFeatureStatus === 'offline'
          ? "Can't send while offline"
          : sendLmrFeatureStatus === 'no-funds'
            ? 'You need some funds to send'
            : null;

      return (
        <WrappedComponent
          sendDisabledReason={sendDisabledReason}
          copyToClipboard={this.props.client.copyToClipboard}
          onWalletRefresh={this.onWalletRefresh}
          getBalances={this.getBalances}
          getStakesOnHold={this.getStakesOnHold}
          sendDisabled={sendLmrFeatureStatus !== 'ok'}
          loadTransactions={this.loadTransactions}
          getSessionsByUser={this.getSessionsByUser}
          {...this.props}
          {...this.state}
        />
      );
    }
  }

  const mapStateToProps = (state) => ({
    config: state.config,
    syncStatus: selectors.getTxSyncStatus(state),
    sendLmrFeatureStatus: selectors.sendLmrFeatureStatus(state),
    hasTransactions: selectors.hasTransactions(state),
    address: selectors.getWalletAddress(state),
    ethCoinPrice: selectors.getRateEth(state),
    symbol: selectors.getCoinSymbol(state),
    symbolEth: selectors.getSymbolEth(state),
    page: selectors.getTransactionPage(state),
    pageSize: selectors.getTransactionPageSize(state),
    hasNextPage: selectors.getHasNextPage(state),
    explorerUrl: selectors.getContractExplorerUrl(state, {
      hash: selectors.getWalletAddress(state),
    }),
  });

  const mapDispatchToProps = (dispatch) => ({
    nextPage: (data) =>
      dispatch({ type: 'transactions-next-page', payload: data }),
  });

  return withClient(connect(mapStateToProps, mapDispatchToProps)(Container));
};

export default withDashboardState;
