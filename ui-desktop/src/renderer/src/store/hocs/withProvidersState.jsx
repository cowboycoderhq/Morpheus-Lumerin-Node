import * as validators from '../validators';
import { withClient } from './clientContext';
import * as utils from '../utils';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import React from 'react';
import { ToastsContext } from '../../components/toasts';
import { getMarketplaceParams } from '../../utils/marketplace';
import selectors from '../selectors';

const withProvidersState = WrappedComponent => {
  class Container extends React.Component {
   
    static contextType = ToastsContext;

    static displayName = `withProvidersState(${WrappedComponent.displayName ||
      WrappedComponent.name})`;

    getAllModels = async () => {
        const result = await this.props.client.getAllModels();
        return result;
    }

    getAllProviders = async () => {
      try {
        const authHeaders = await this.props.client.getAuthHeaders();
        const path = `${this.props.config.chain.localProxyRouterUrl}/blockchain/providers`
        const response = await fetch(path, {
          headers: authHeaders
        });
        const data = await response.json();
        return data.providers;
      }
      catch(e) {
        console.log("Error", e)
        return [];
      }
    }

    getSessionsByProvider = async (provider) => {
      try {
        const authHeaders = await this.props.client.getAuthHeaders();
        const path = `${this.props.config.chain.localProxyRouterUrl}/blockchain/sessions/provider?provider=${provider}`;
        const response = await fetch(path, {
          headers: authHeaders
        });
        const data = await response.json();
        return data.sessions;
      }
      catch(e) {
        console.log("Error", e)
        return [];
      }
    }

    getBalanceBySession = async (sessionId) => {
      try {
        const authHeaders = await this.props.client.getAuthHeaders();
        const path = `${this.props.config.chain.localProxyRouterUrl}/proxy/sessions/${sessionId}/providerClaimableBalance`
        const response = await fetch(path, {
          headers: authHeaders
        });
        const data = await response.json();
        return data.balance;
      }
      catch(e) {
        console.log("Error", e)
        return [];
      }
    }

    claimFunds = async (sessionId) => {
      try {
        const authHeaders = await this.props.client.getAuthHeaders();
        // `props` (not `this.props`) — a ReferenceError that made every Claim
        // throw, swallowed by the catch below, so the button silently did
        // nothing.
        const path = `${this.props.config.chain.localProxyRouterUrl}/proxy/sessions/${sessionId}/providerClaim`;
        const response = await fetch(path, {
            method: "POST",
            headers: authHeaders
        });
        const dataResponse = await response.json();
      }
      catch(e) {
        console.log("Error", e)
      }
    }

    // ---- becoming a provider ------------------------------------------------
    // proxy-router owns the keys and signs, and it raises the MOR allowance
    // itself before each call (blockchainapi/service.go), so there is no
    // separate approve step to expose here.

    /** The live stake / fee / price-band constraints from the Diamond. */
    getMarketplaceParams = async () => {
      const authHeaders = await this.props.client.getAuthHeaders();
      const proxyUrl = this.props.config.chain.localProxyRouterUrl;

      const cfgResponse = await fetch(`${proxyUrl}/config`, { headers: authHeaders });
      const cfg = await cfgResponse.json();
      const rpcUrl = cfg?.DerivedConfig?.EthNodeURLs?.[0];
      if (!rpcUrl) {
        throw new Error('No ETH node is configured — cannot read marketplace rules.');
      }

      return getMarketplaceParams(rpcUrl, this.props.config.chain.diamondAddress);
    }

    /** The wallet's MOR balance, in wei. */
    getMorBalanceWei = async () => {
      const authHeaders = await this.props.client.getAuthHeaders();
      const path = `${this.props.config.chain.localProxyRouterUrl}/blockchain/balance`;
      const response = await fetch(path, { headers: authHeaders });
      const data = await response.json();
      return BigInt(data.mor ?? data.MOR ?? 0);
    }

    /** Is this wallet already a registered, active provider? */
    getMyProvider = async (address) => {
      const providers = await this.getAllProviders();
      const mine = (providers || []).find(
        (p) => (p.Address || p.address || '').toLowerCase() === (address || '').toLowerCase(),
      );
      return mine || null;
    }

    createProvider = async ({ stakeWei, endpoint }) => {
      const authHeaders = await this.props.client.getAuthHeaders();
      const path = `${this.props.config.chain.localProxyRouterUrl}/blockchain/providers`;
      const response = await fetch(path, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        // Wei as a decimal STRING: lib.BigInt parses base-10 from a quoted
        // string, and a JS number would lose precision above 2^53.
        body: JSON.stringify({ stake: stakeWei.toString(), endpoint }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || data?.message || 'Failed to register as a provider');
      }
      return data;
    }

    createBid = async ({ modelID, pricePerSecondWei }) => {
      const authHeaders = await this.props.client.getAuthHeaders();
      const path = `${this.props.config.chain.localProxyRouterUrl}/blockchain/bids`;
      const response = await fetch(path, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelID, pricePerSecond: pricePerSecondWei.toString() }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || data?.message || 'Failed to create bid');
      }
      return data;
    }

    fetchData = async (providerId) => {
      const models = await this.getAllModels();
      // const providers = await getAllProviders();
      const providerSession = await this.getSessionsByProvider(providerId);
      const modelsNames = models.reduce((a,b) => ({ ...a, [b.Id]: b.Name}), {});
      
      let results = [];
      for (const session of providerSession) {
        const id = session.Id;
        let balance = 0;
        try {
          if(!session.ClosedAt) {
            balance = (await this.getBalanceBySession(id));
          }
        }
        catch(e) {
          console.log(e);
        }
        results.push({ ...session, Balance: balance })
      }

      return { results, modelsNames };
    }
 
    render() {

      return (
        <WrappedComponent
            getAllModels={this.getAllModels}
            getAllProviders={this.getAllProviders}
            getBalanceBySession={this.getBalanceBySession}
            claimFunds={this.claimFunds}
            getSessionsByProvider={this.getSessionsByProvider}
            fetchData={this.fetchData}
            getMarketplaceParams={this.getMarketplaceParams}
            getMorBalanceWei={this.getMorBalanceWei}
            getMyProvider={this.getMyProvider}
            createProvider={this.createProvider}
            createBid={this.createBid}
            {...this.state}
            {...this.props}
        />
      );
    }
  }

  const mapStateToProps = (state, props) => ({
    // selectedCurrency: selectors.getSellerSelectedCurrency(state),
    providerId: selectors.getWalletAddress(state),
    config: state.config
  });

  const mapDispatchToProps = dispatch => ({
    setSelectedModel: model => dispatch({ type: 'set-model', payload: model })
  });

  return withClient(connect(mapStateToProps, mapDispatchToProps)(Container));
};

export default withProvidersState;
