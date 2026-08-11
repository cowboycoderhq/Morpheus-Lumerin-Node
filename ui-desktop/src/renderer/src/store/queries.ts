// Centralized react-query keys so that data shared across tabs (models,
// providers, sessions, balances, transactions) dedupes against a single cache
// entry instead of every tab refetching on mount.
//
// Keys are intentionally stable and parameterized only by values that change
// the result (e.g. the wallet address). The query *functions* live next to the
// components/HOCs that own the proxy-router fetch logic and are passed inline to
// `useQuery`, since they close over the IPC client + chain config.
export const queryKeys = {
  // { models, providers, meta, userBalances } from withChatState.getModelsData
  modelsData: ['modelsData'] as const,
  // local (proxy-router /v1/models) models only — milliseconds, no chain reads;
  // lets Chat become usable before the heavy modelsData composite resolves
  localModels: ['localModels'] as const,
  // models merged with their bids (withChatState.getBidsByModelId fan-out)
  modelsWithBids: ['modelsWithBids'] as const,
  // raw on-chain user sessions (paginated) — shared by Chat + Wallet
  sessions: (address?: string) => ['sessions', address ?? ''] as const,
  // saved chat-history titles (local proxy-router index)
  chatTitles: ['chatTitles'] as const,
  // provider connectivity ping results
  providersAvailability: ['providersAvailability'] as const,
  // wallet ETH/MOR balances (+ MOR rate)
  balances: (address?: string) => ['balances', address ?? ''] as const,
  // Blockscout transaction history
  transactions: (address?: string) => ['transactions', address ?? ''] as const,
  // raw on-chain model list (Models tab registry)
  allModels: ['allModels'] as const,
  // local IPFS node version / connectivity
  ipfsVersion: ['ipfsVersion'] as const,
  // IPFS-pinned model files
  pinnedFiles: ['pinnedFiles'] as const,
  // provider sessions + claimable balances (Providers tab)
  providerData: (providerId?: string) =>
    ['providerData', providerId ?? ''] as const,
};

const isClosedSession = (item: any) =>
  item.ClosedAt || new Date().getTime() > item.EndsAt * 1000;

// Sum of stake locked in currently-open sessions, in whole MOR (2 decimals).
// Mirrors the previous withDashboardState.getStakedFunds computation but works
// off the shared sessions cache instead of issuing its own paginated fetch.
export const computeStakedFunds = (sessions: any[] | undefined): string => {
  if (!sessions) {
    return '0';
  }
  try {
    const openSessions = sessions.filter((s) => !isClosedSession(s));
    const sum = openSessions.reduce((curr, next) => curr + next.Stake, 0);
    return (sum / 10 ** 18).toFixed(2);
  } catch (e) {
    console.log('Error', e);
    return '0';
  }
};


// Merge the model registry with every active bid on the network.
//
// Lives here, not inline in Chat, because the DataPrefetcher warms this exact
// query at app start — and the Router's own comment is explicit that the prefetch
// must use the SAME query fn and key as the consumer ("no drift, perfect cache
// hits"). Two copies of this merge would be two chances to diverge.
//
// `getAllActiveBidsByModel` walks PROVIDERS (21) rather than MODELS (391); see
// store/utils/apiCallsHelper.getActiveBidsByProvider.
export const buildModelsWithBids = async (
  md: any,
  getAllActiveBidsByModel: (providers: any[]) => Promise<Map<string, any[]>>,
): Promise<any[]> => {
  if (!md) {
    return [];
  }

  const providersMap = (md.providers ?? []).reduce(
    (a: any, b: any) => ({ ...a, [b.Address.toLowerCase()]: b }),
    {},
  );

  const bidsByModel = await getAllActiveBidsByModel(md.providers);

  const merged: any[] = [];
  for (const m of md.models ?? []) {
    if (m.isLocal) continue;

    const bids = (bidsByModel.get(m.Id) ?? [])
      .map((b: any) => ({
        ...b,
        ProviderData: providersMap[b.Provider.toLowerCase()],
        Model: m,
      }))
      .filter((b: any) => b.ProviderData);

    if (!bids.length) continue;

    merged.push({ ...m, bids });
  }
  return merged;
};
