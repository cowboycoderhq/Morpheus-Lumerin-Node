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
  // Just the sessions that could still be OPEN — a bounded walk of the newest
  // pages. This is what Chat's first paint waits for; the tail below fills in
  // behind it. Split because the full history is unbounded and grows with every
  // rolling-session block, while the live set never can.
  liveSessions: (address?: string) => ['liveSessions', address ?? ''] as const,
  // Everything older than the live window. Never blocks anything.
  sessionsTail: (address?: string, from?: number) =>
    ['sessionsTail', address ?? '', from ?? 0] as const,
  // saved chat-history titles (local proxy-router index)
  chatTitles: ['chatTitles'] as const,
  // provider connectivity ping results
  providersAvailability: ['providersAvailability'] as const,
  // the chain's ceiling on ONE session (getMaxSessionDuration), read from the
  // Diamond — owner-settable, so it is fetched rather than assumed
  maxSessionSeconds: ['maxSessionSeconds'] as const,
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

// The composite Chat's first paint waits on: models + providers + marketplace
// meta + balances, fetched in parallel.
//
// Lifted out of withChatState so the BOOT prefetcher can warm the exact same
// cache entry. It previously could not — it only knew how to fetch sessions —
// so the one query that actually gates the Chat screen was always cold on the
// first click, and the user paid for it while looking at a spinner.
// The on-chain model registry is the single slowest thing the Chat screen waits
// on — measured at **10.5 seconds** against the local router, while every other
// call in the same composite is sub-second or instant (/v1/models 0.5ms,
// providers 0.8s, budget and supply 0.5ms). `Promise.all` costs the slowest, so
// this one endpoint WAS the load time.
//
// It is also the most static thing in it: a list of model ids and names that
// changes when someone registers a model, not between clicks. So it is snapshot
// to disk and served from there while a refresh runs behind it.
//
// Deliberately narrow: ONLY the model registry is cached. Balances, budget and
// supply stay live on every call — a stale balance on a screen that decides what
// you can afford to stake is exactly the kind of "helpful" caching that costs
// someone money.
const MODELS_SNAPSHOT_KEY = 'morpheus.marketplaceModels.v1';
// Past this age the snapshot is not worth its staleness and we wait for real
// data. Inside it, a newly-registered model shows up on the next launch.
const MODELS_SNAPSHOT_MAX_AGE_MS = 10 * 60 * 1000;

const readModelsSnapshot = (): any[] | null => {
  try {
    const raw = localStorage.getItem(MODELS_SNAPSHOT_KEY);
    if (!raw) return null;
    const { ts, models } = JSON.parse(raw);
    if (!Array.isArray(models) || !models.length) return null;
    if (Date.now() - Number(ts) > MODELS_SNAPSHOT_MAX_AGE_MS) return null;
    return models;
  } catch {
    return null;
  }
};

const writeModelsSnapshot = (models: any[]) => {
  try {
    if (Array.isArray(models) && models.length) {
      localStorage.setItem(
        MODELS_SNAPSHOT_KEY,
        JSON.stringify({ ts: Date.now(), models }),
      );
    }
  } catch {
    /* quota or private mode — the snapshot is an optimisation, never required */
  }
};

export const buildModelsData = async (url: string, client: any) => {
  const authHeaders = await client.getAuthHeaders();

  const getJson = async (
    path: string,
    pick: (d: any) => any,
    fallback: any,
  ) => {
    try {
      const response = await fetch(`${url}${path}`, { headers: authHeaders });
      if (!response.ok) {
        return fallback;
      }
      const data = await response.json();
      if (data?.error) {
        console.error(data.error);
        return fallback;
      }
      return pick(data);
    } catch (e) {
      console.log('Error', e);
      return fallback;
    }
  };

  // Kicked off regardless, so the snapshot is refreshed even when we serve from
  // it. Awaited only when there is nothing usable on disk.
  const registryFetch = getJson('/blockchain/models', (d) => d.models, []).then(
    (models: any[]) => {
      writeModelsSnapshot(models);
      return models;
    },
  );
  const snapshot = readModelsSnapshot();
  if (!snapshot) {
    // Nothing to serve — this is the first launch, or the snapshot aged out.
    // Swallow nothing: a failure here must still surface as an empty list, not
    // an unhandled rejection.
    registryFetch.catch(() => []);
  }

  const [localModels, modelsResp, providersResp, budget, supply, userBalances] =
    await Promise.all([
      getJson('/v1/models', (d) => d, []),
      snapshot ?? registryFetch,
      getJson('/blockchain/providers', (d) => d.providers, []),
      client.getTodaysBudget(),
      client.getTokenSupply(),
      client.getBalances(),
    ]);

  const models = (modelsResp ?? []).filter((m: any) => !m.IsDeleted);
  const providers = (providersResp ?? []).filter((m: any) => !m.IsDeleted);

  return {
    models: [
      ...(localModels ?? []).map((m: any) => ({ ...m, isLocal: true })),
      ...models,
    ],
    providers,
    meta: { budget, supply },
    userBalances,
  };
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
