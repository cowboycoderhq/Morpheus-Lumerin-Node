import debounce from 'lodash/debounce';
import get from 'lodash/get';
import pickBy from 'lodash/pickBy';

import * as utils from './utils';
import keys from './keys';
import './sentry';

// This repo's OWN documentation. It is authored in `docs/` at the repo root
// (Mintlify — see docs/docs.json) and published to nodedocs.mor.org; the
// top-level README names it as the docs home ("The canonical documentation lives
// at nodedocs.mor.org").
//
// The menu item is labelled "Documentation", so it lands on the ROOT rather than
// a deep link: the site self-routes a new user into the consumer quickstart while
// staying correct for a returning user hunting Troubleshooting or Reference.
// Deep-linking the quickstart would drop an already-installed user onto install
// instructions.
//
// NOT tech.mor.org (a separate ecosystem site, listed in these docs as one entry
// under Ecosystem) and NOT apidocs.mor.org (developer/API reference only).
export const DOCS_URL = 'https://nodedocs.mor.org';

// The MOR staking dashboard. NOT staking.mor.lumerin.io — that is the legacy
// Lumerin-era host this tile pointed at until 2026-07-16. Keep the tile's
// visible subtitle equal to this host: the stale one sat on screen naming a
// destination it no longer opened, and nobody noticed because the text and the
// href were separate literals.
export const STAKING_DASHBOARD_URL = 'https://dashboard.mor.org';

// The Morpheus community Discord.
//
// This was previously left UNVERIFIED (mor.org answers automated fetches with
// 429, so it could not be confirmed first-party) and Help silently fell back to
// the docs. Confirmed 2026-07-16 by a chain that does not depend on mor.org:
//   1. this repo's own docs cite the Morpheus Discord as guild 1151741790408429580
//      (docs/concepts/what-is-morpheus.mdx — a channel deep-link into that guild);
//   2. three first-party MorpheusAIs repos (MySuperAgent, morpheus-stats-frontend,
//      pwa) all use discord.gg/Dc26EFb6JK as their Discord link;
//   3. Discord's public invite API resolves Dc26EFb6JK to guild
//      1151741790408429580 — the same guild — with expires_at: null.
// A web search proposed a DIFFERENT invite code for "Morpheus"; several unrelated
// projects share the name, which is exactly why this is pinned to the guild ID
// rather than to a search result.
export const DISCORD_URL = 'https://discord.gg/Dc26EFb6JK';

const createClient = function (createStore) {
  const reduxDevtoolsOptions = {
    // actionsBlacklist: ['price-updated$'],
    features: { dispatch: true },
    // maxAge: 100 // default: 50
  };

  const store = createStore(reduxDevtoolsOptions);

  const onUIReady = (_ev, payload) => {
    const debounceTime = get(
      payload,
      'data.config.statePersistanceDebounce',
      0,
    );

    // keysToPersist keys that are passed from global redux state to main process.
    // For now only chain data is used.
    // TODO: subscribe for changes only within listed branch of redux state
    const keysToPersist = ['chain'];

    store.subscribe(
      debounce(
        function () {
          const passedState = pickBy(store.getState(), function (_value, key) {
            return keysToPersist.includes(key);
          });

          utils
            .forwardToMainProcess('persist-state')(passedState)
            .catch((err) =>
              // eslint-disable-next-line no-console
              console.warn(`Error persisting state: ${err.message}`),
            );
        },
        debounceTime,
        { maxWait: 2 * debounceTime },
      ),
    );
  };

  window.ipcRenderer.on('ui-ready', onUIReady);

  const onTransactionLinkClick = (txHash) =>
    window.openLink('https://etherscan.io/tx/' + txHash);

  const onTermsLinkClick = () =>
    window.openLink(
      'https://github.com/Lumerin-protocol/WalletDesktop/blob/main/LICENSE',
    );

  // Help used to open mor.org/fair-launch — a tokenomics page with nothing to
  // say to a user who needs help — and then the docs, unconditionally. The two
  // places a question can actually be answered are the docs and the Discord, and
  // which one you want depends on whether you need a reference or a person, so
  // Help now asks instead of guessing (operator, 2026-07-17). The single
  // onHelpLinkClick it used to expose is gone rather than left dangling: nothing
  // called it once the menu landed.
  const onDocsLinkClick = () => window.openLink(DOCS_URL);
  const onDiscordLinkClick = () => window.openLink(DISCORD_URL);

  const onLinkClick = (url) => window.openLink(url);

  const copyToClipboard = (text) =>
    Promise.resolve(window.copyToClipboard(text));

  const lockSendTransaction = () => {
    store.dispatch({
      type: 'allow-send-transaction',
      payload: { allowSendTransaction: false },
    });
  };

  const unlockSendTransaction = () => {
    store.dispatch({
      type: 'allow-send-transaction',
      payload: { allowSendTransaction: true },
    });
  };

  const onInit = () => {
    window.addEventListener('beforeunload', function () {
      utils.sendToMainProcess('ui-unload');
    });
    window.addEventListener('online', () => {
      store.dispatch({
        type: 'connectivity-state-changed',
        payload: { ok: true },
      });
    });
    window.addEventListener('offline', () => {
      store.dispatch({
        type: 'connectivity-state-changed',
        payload: { ok: false },
      });
    });
    return utils.sendToMainProcess('ui-ready');
  };

  const forwardedMethods = {
    refreshAllTransactions: utils.forwardToMainProcess(
      'refresh-all-transactions',
      120000,
    ),
    refreshAllContracts: utils.forwardToMainProcess(
      'refresh-all-contracts',
      120000,
    ),
    // Onboarding imports the wallet into the router and reads it back — a chain-
    // touching first-run operation that easily exceeds 10s on a cold machine.
    // It was the ONLY such call left on the default 10s timeout, so the IPC gave
    // up mid-import and surfaced "Failed to finish onboarding, please wait a few
    // minutes and try again" — a timeout, not a real failure (the import was
    // still completing in the background). Match the sibling chain reads (120s).
    onOnboardingCompleted: utils.forwardToMainProcess(
      'onboarding-completed',
      120000,
    ),
    suggestAddresses: utils.forwardToMainProcess('suggest-addresses'),
    getTokenGasLimit: utils.forwardToMainProcess('get-token-gas-limit'),
    validatePassword: utils.forwardToMainProcess('validate-password'),
    changePassword: utils.forwardToMainProcess('change-password'),
    onLoginSubmit: utils.forwardToMainProcess('login-submit'),
    createContract: utils.forwardToMainProcess('create-contract', 750000),
    purchaseContract: utils.forwardToMainProcess('purchase-contract', 750000),
    editContract: utils.forwardToMainProcess('edit-contract', 750000),
    cancelContract: utils.forwardToMainProcess('cancel-contract', 750000),
    setDeleteContractStatus: utils.forwardToMainProcess(
      'set-delete-contract-status',
      750000,
    ),
    getPastTransactions: utils.forwardToMainProcess(
      'get-past-transactions',
      750000,
    ),
    sendMor: utils.forwardToMainProcess('send-mor', 750000),
    sendEth: utils.forwardToMainProcess('send-eth', 750000),
    clearCache: utils.forwardToMainProcess('clear-cache'),
    handleClientSideError: utils.forwardToMainProcess('handle-client-error'),
    startDiscovery: utils.forwardToMainProcess('start-discovery'),
    stopDiscovery: utils.forwardToMainProcess('stop-discovery'),
    setMinerPool: utils.forwardToMainProcess('set-miner-pool'),
    getLmrTransferGasLimit: utils.forwardToMainProcess(
      'get-lmr-transfer-gas-limit',
    ),
    logout: utils.forwardToMainProcess('logout'),
    getLocalIp: utils.forwardToMainProcess('get-local-ip'),
    getPoolAddress: utils.forwardToMainProcess('get-pool-address'),
    getPrivateKey: utils.forwardToMainProcess('get-private-key'),
    getProxyRouterSettings: utils.forwardToMainProcess(
      'get-proxy-router-settings',
    ),
    getProxyRouterDerivedConfig: utils.forwardToMainProcess(
      'get-proxy-router-derived-config',
    ),
    getDefaultCurrencySetting: utils.forwardToMainProcess(
      'get-default-currency-settings',
    ),
    setDefaultCurrencySetting: utils.forwardToMainProcess(
      'set-default-currency-settings',
    ),
    saveProxyRouterSettings: utils.forwardToMainProcess(
      'save-proxy-router-settings',
    ),
    getMarketplaceFee: utils.forwardToMainProcess('get-marketplace-fee'),
    claimFaucet: utils.forwardToMainProcess('claim-faucet', 750000),
    getCustomEnvValues: utils.forwardToMainProcess('get-custom-env-values'),
    setCustomEnvValues: utils.forwardToMainProcess('set-custom-env-values'),
    getProfitSettings: utils.forwardToMainProcess('get-profit-settings'),
    setProfitSettings: utils.forwardToMainProcess('set-profit-settings'),
    getAutoAdjustPriceData: utils.forwardToMainProcess('get-auto-adjust-price'),
    setAutoAdjustPriceData: utils.forwardToMainProcess('set-auto-adjust-price'),
    getContractHashrate: utils.forwardToMainProcess('get-contract-hashrate'),
    // API Gateway
    getAuthHeaders: utils.forwardToMainProcess('get-auth-headers'),
    getAllModels: utils.forwardToMainProcess('get-all-models'),

    getTransactions: utils.forwardToMainProcess('get-transactions'),
    getBalances: utils.forwardToMainProcess('get-balances'),
    getRates: utils.forwardToMainProcess('get-rates'),
    getTodaysBudget: utils.forwardToMainProcess('get-todays-budget'),
    getTokenSupply: utils.forwardToMainProcess('get-supply'),
    // Chat History
    getChatHistoryTitles: utils.forwardToMainProcess('get-chat-history-titles'),
    getChatHistory: utils.forwardToMainProcess('get-chat-history', 750000),
    deleteChatHistory: utils.forwardToMainProcess(
      'delete-chat-history',
      750000,
    ),
    updateChatHistoryTitle: utils.forwardToMainProcess(
      'update-chat-history-title',
      750000,
    ),
    updateChatSession: utils.forwardToMainProcess('update-chat-session', 750000),
    // Failover
    getFailoverSetting: utils.forwardToMainProcess(
      'get-failover-setting',
      750000,
    ),
    setFailoverSetting: utils.forwardToMainProcess(
      'set-failover-setting',
      750000,
    ),
    // OpenAI-compatible local endpoint
    getOpenAiApiConfig: utils.forwardToMainProcess('get-openai-api-config'),
    setOpenAiApiConfig: utils.forwardToMainProcess('set-openai-api-config'),
    regenerateOpenAiApiToken: utils.forwardToMainProcess(
      'regenerate-openai-api-token',
    ),
    // opencode handoff
    // The installer can legitimately take minutes (brew tap + download).
    installOpencode: utils.forwardToMainProcess('install-opencode', 750000),
    // Generous on purpose: the handoff reads the on-chain model registry, which
    // is measured in seconds, not milliseconds. On the default 10s this timed
    // out in the renderer while main went on to open the terminal — the worst
    // kind of failure, one that reports an error for work that succeeded.
    openInOpencode: utils.forwardToMainProcess('open-in-opencode', 120000),
    getOpencodeStatus: utils.forwardToMainProcess('get-opencode-status', 60000),
    getGrokStatus: utils.forwardToMainProcess('get-grok-status', 30000),
    // The installer downloads a release; give it the same room as opencode's.
    installGrok: utils.forwardToMainProcess('install-grok', 600000),
    getMainLogTail: utils.forwardToMainProcess('get-main-log-tail'),
    getWhatsNewState: utils.forwardToMainProcess('get-whats-new-state'),
    markWhatsNewSeen: utils.forwardToMainProcess('mark-whats-new-seen'),
    openInGrok: utils.forwardToMainProcess('open-in-grok', 120000),
    refreshGrokModels: utils.forwardToMainProcess('refresh-grok-models', 30000),
    grokPickerDone: utils.forwardToMainProcess('grok-picker-done', 15000),
    // Asked on mount, so an offer raised while the app was locked is not lost.
    getPendingSessionOffer: utils.forwardToMainProcess('get-pending-session-offer'),
    // The picker's own calls, relayed by main — the renderer is a browser and
    // the endpoint refuses browsers. Long timeout: opening a session waits on a
    // chain transaction.
    morpheusApiRequest: utils.forwardToMainProcess('morpheus-api-request', 180000),
    // Which providers the user marked up or down, so a dead one sinks next time.
    // A DELTA, not a whole-list write: see handlers.toggleStarredModel.
    toggleStarredModel: utils.forwardToMainProcess('toggle-starred-model', 30000),
    getProviderPrefs: utils.forwardToMainProcess('get-provider-prefs'),
    setProviderPref: utils.forwardToMainProcess('set-provider-pref'),
    setOpencodeCwd: utils.forwardToMainProcess('set-opencode-cwd'),
    checkProviderConnectivity: utils.forwardToMainProcess(
      'check-provider-connectivity',
      750000,
    ),

    // IPFS
    getIpfsVersion: utils.forwardToMainProcess('get-ipfs-version', 750000),
    getIpfsFile: utils.forwardToMainProcess('get-ipfs-file', null),
    pinIpfsFile: utils.forwardToMainProcess('pin-ipfs-file', 750000),
    unpinIpfsFile: utils.forwardToMainProcess('unpin-ipfs-file', 750000),
    addFileToIpfs: utils.forwardToMainProcess('add-file-to-ipfs', 750000),
    getIpfsPinnedFiles: utils.forwardToMainProcess(
      'get-ipfs-pinned-files',
      750000,
    ),

    openSelectFolderDialog: utils.forwardToMainProcess(
      'open-select-folder-dialog',
      750000,
    ),

    // Agents
    getAgentUsers: utils.forwardToMainProcess('get-agent-users', 750000),
    confirmDeclineAgentUser: utils.forwardToMainProcess(
      'confirm-decline-agent-user',
      750000,
    ),
    removeAgentUser: utils.forwardToMainProcess('remove-agent-user', 750000),
    getAgentTxs: utils.forwardToMainProcess('get-agent-txs', 750000),
    revokeAgentAllowance: utils.forwardToMainProcess(
      'revoke-agent-allowance',
      750000,
    ),
    getAgentAllowanceRequests: utils.forwardToMainProcess(
      'get-agent-allowance-requests',
      750000,
    ),
    confirmDeclineAgentAllowanceRequest: utils.forwardToMainProcess(
      'confirm-decline-agent-allowance-request',
      750000,
    ),

    // Startup services
    startServices: utils.forwardToMainProcess('start-services', 750000),
    restartService: utils.forwardToMainProcess('restart-service', 750000),
    pingService: utils.forwardToMainProcess('ping-service', 750000),
    quitApp: utils.forwardToMainProcess('quit-app', 750000),
  };

  const api = {
    ...utils,
    ...forwardedMethods,
    isValidMnemonic: keys.isValidMnemonic,
    createMnemonic: keys.createMnemonic,
    onTermsLinkClick,
    onTransactionLinkClick,
    copyToClipboard,
    onDocsLinkClick,
    onDiscordLinkClick,
    getAppVersion: window.getAppVersion,
    onLinkClick,
    onInit,
    store,
    lockSendTransaction,
    unlockSendTransaction,
  };

  return api;
};

export default createClient;
export type Client = ReturnType<typeof createClient>;
