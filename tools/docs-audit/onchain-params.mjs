// onchain-params — the single place a documentation gate learns what the
// deployed contracts return.
//
// WHY THIS FILE EXISTS
//
// Two gates used to derive "the deployed bid bounds" from
// smart-contracts/deploy/data/config_base_*.json. A deploy config is an INPUT to
// a future deployment, not a record of what any live contract returns, and
// reading it as an oracle was wrong in three independent ways:
//
//   1. config_base_mainnet.json:7 carries marketplaceMinBidPricePerSecond 1e13.
//      The Base mainnet floor was never 1e13. Exactly one event ever set that
//      parameter — initialization, 2025-12-17 — and it wrote 1e10. Forty archive
//      state samples spanning the contract's full 10.9M-block life all return
//      10000000000, re-read on two RPCs on 2026-08-27 (commit c1fc046e). That is
//      wrong-from-birth, not staleness: there is no block at which 1e13 held.
//
//   2. Nothing reads config_base_mainnet.json at all.
//      smart-contracts/deploy/helpers/config-parser.ts:20 hardcodes
//      `deploy/data/config_base_sepolia.json` with no network argument, so every
//      migration reads the Sepolia file whatever network it targets.
//
//   3. config_base_sepolia.json IS read by every migration, and it disagrees
//      with the live Sepolia contract on both the fee and the floor, because
//      both were changed by owner calls after that deployment.
//
// A gate cannot ask the chain: CI has no RPC, and a network call turns a gate
// flaky. So an observed value has to be committed somewhere, and the only real
// question is whether it lives in one honest place or several dishonest ones.
// This is the one place. Both gates read it — verify-fixes.mjs takes the current
// values as its allow-list, recurrence.mjs takes `retired` as its deny-list — so
// the two lookups cannot drift apart, because they are the same record.
//
// STALENESS IS MADE VISIBLE, NOT ASSUMED AWAY. A committed constant goes stale
// exactly as the config did. What this file can do that a bare number cannot is
// say when it was read, how, and what kind of value it is:
//
//   static       — changing it needs an owner call, and the event log shows it
//                  has not moved. Safe to quote as a constant.
//   owner-set    — a live chain reading that an owner call put there AFTER
//                  deployment, so it is not reproducible from this repo. No
//                  migration computes such a value: 1_full_protocol.migration.ts
//                  :105-109 passes the config figure straight into
//                  __Marketplace_init and Marketplace.sol:29-38 stores it
//                  unchanged. A redeploy therefore does NOT recompute it — the
//                  contract comes up at the deploy config's value and the owner
//                  call has to be made again. Docs should cite the getter and
//                  date-stamp the reading rather than present it as a constant,
//                  which is what they now do.
//   deploy-input — NOT read from the chain. Carried from the deploy config
//                  because no chain reading was taken. Believe it exactly as far
//                  as you would believe the config file it came from.
//
// UPDATING: re-read the chain, then change the value, its `observed` date and its
// `method` in one edit. Never copy a number out of a config file into a `value`
// field — a figure with no chain reading behind it is `deploy-input`, labelled
// as such, or it is not in this file.

// Network order is fixed here rather than taken from object key order, because
// two callers index these arrays positionally ([mainnet, sepolia]) and a silent
// reordering would swap two networks' figures without changing any value.
export const NETWORKS = ['base-mainnet', 'base-sepolia'];

export const PARAMS = {
  bidMinPricePerSecond: {
    label: 'Marketplace bid price floor',
    getter: 'getMinMaxBidPricePerSecond()',
    unit: 'wei/sec',
    networks: {
      'base-mainnet': {
        value: '10000000000',
        stability: 'static',
        observed: '2026-08-27',
        method: 'full event scan of the setter across the contract lifetime: one '
              + 'event ever, at initialization on 2025-12-17, writing 1e10. Plus '
              + '40 archive state samples across 10.9M blocks, all returning '
              + '10000000000, re-read on two RPCs (c1fc046e).',
      },
      'base-sepolia': {
        value: '121052630917',
        stability: 'owner-set',
        observed: '2026-08-27',
        method: 'getMinMaxBidPricePerSecond() on the live Sepolia contract, '
              + 're-read 2026-08-27. WHAT IS KNOWN: the value is what the getter '
              + 'returns; its origin is not recorded anywhere in this repo; an '
              + 'owner call set it after the deployment (c1fc046e). CORRECTED '
              + 'TWICE. (1) An earlier revision called it a deploy-time '
              + 'computation that would be recomputed at the next redeploy. The '
              + 'migration computes nothing '
              + '— 1_full_protocol.migration.ts:105-109 passes the config value '
              + 'straight through — so a redeploy would come up at the figure in '
              + 'config_base_sepolia.json:7, not at a freshly derived one. (2) A '
              + 'later revision claimed the post-init values were integer '
              + 'divisions by 19, i.e. that a price conversion produced the '
              + 'number. The arithmetic refutes it: 121052630917 x 19 = '
              + '2299999987423, which is 12577 short of 2300000000000, and '
              + '2300000000000 / 19 = 121052631578, which is not this floor. Do '
              + 'not re-derive a provenance story for this number; none is '
              + 'evidenced. Cite the getter and the date instead.',
      },
    },
    // Values this parameter has been documented or configured as, which the chain
    // has since falsified. recurrence.mjs guards against these creeping back.
    retired: [
      {
        value: '10000000000000',
        network: 'base-mainnet',
        why: 'the 1e13 the documentation asserted until c1fc046e. Never on chain '
           + 'at any block. Still sitting in config_base_mainnet.json:7 — which no '
           + 'deploy path reads — so that file remains the seed of the error and '
           + 'the most likely route back in.',
      },
      {
        value: '5000000000000000',
        network: 'base-sepolia',
        why: 'the 5e15 deploy input in config_base_sepolia.json:7. The live Sepolia '
           + 'contract does not return it: an owner call replaced it with a '
           + 'computed value after that deployment.',
      },
    ],
  },

  bidMaxPricePerSecond: {
    label: 'Marketplace bid price ceiling',
    getter: 'getMinMaxBidPricePerSecond()',
    unit: 'wei/sec',
    // NOT chain-verified. The 2026-08-27 scan measured the floor on both networks
    // and the fee on both networks; it did not record a ceiling reading. These are
    // the deploy-config numbers. As of this commit NO documentation page quotes
    // either ceiling literal: docs/providers/full/pricing.mdx:20 used to, and was
    // rewritten to cite getMinMaxBidPricePerSecond() and say the ceilings are
    // unverified. These entries are therefore no longer propping up a doc line;
    // they are kept as the record of what the configs hold, so a future reader
    // meets `deploy-input` / `observed: null` here instead of re-importing the
    // numbers from the configs as if they were readings. Corroboration, not
    // proof: smart-contracts/deploy/2_change_bid_price.migration.ts:14 carries a
    // commented setMinMaxBidPricePerSecond('10000000000', '10000000000000000') —
    // the same call that set the verified 1e10 floor pairs it with this 1e16
    // ceiling. Read the chain and promote these to `static` when someone does.
    networks: {
      'base-mainnet': {
        value: '10000000000000000',
        stability: 'deploy-input',
        observed: null,
        method: 'UNVERIFIED — config_base_mainnet.json:8, a file no deploy path '
              + 'reads. Corroborated only by the commented-out migration call at '
              + '2_change_bid_price.migration.ts:14.',
      },
      'base-sepolia': {
        value: '20000000000000000000',
        stability: 'deploy-input',
        observed: null,
        method: 'UNVERIFIED — config_base_sepolia.json:8. That file IS read by '
              + 'every migration, but its floor and fee are both known to be stale '
              + 'against the chain, so its ceiling carries no more weight. '
              + 'Stronger: setMinMaxBidPricePerSecond (Marketplace.sol:47-61) is '
              + 'the only writer of either bound and writes BOTH in one call, so '
              + 'the owner call that replaced the Sepolia floor after deployment '
              + 'necessarily wrote a ceiling at the same moment. This figure is '
              + 'live only if that caller happened to re-pass it.',
      },
    },
  },

  marketplaceBidFee: {
    label: 'Marketplace bid fee, charged on every postModelBid',
    getter: 'getBidFee()',
    unit: 'wei',
    networks: {
      'base-mainnet': {
        value: '300000000000000000',
        stability: 'static',
        observed: '2026-08-26',
        method: 'read from the live Base mainnet Diamond (cef943ef), which also '
              + 'reconciled config_base_mainnet.json:6 to it. 0.3 MOR.',
      },
      'base-sepolia': {
        value: '0',
        stability: 'static',
        observed: '2026-08-27',
        method: 'deliberate, not an uninitialised facet: the fee was explicitly '
              + 'set to 3e17 at 21:35 UTC on 2026-07-30 and explicitly set to 0 at '
              + '22:56 UTC the same day, in blocks adjacent to the floor change — '
              + 'one coordinated reconfiguration that made testnet bids free '
              + '(c1fc046e). Base Sepolia bids are free.',
      },
    },
    // Recorded, but NO GATE READS THIS YET. It is the same class of drift as the
    // floor and the same likely route back in, so it belongs in the record; wiring
    // a recurrence rule for it is a separate change with its own proof obligation,
    // and inventing one here would be a detection rule nobody asked for.
    retired: [
      {
        value: '300000000000000000',
        network: 'base-sepolia',
        why: 'still listed at config_base_sepolia.json:6, which every migration '
           + 'reads. The live Sepolia contract has charged 0 since 2026-07-30.',
      },
    ],
  },

  providerMinStake: {
    label: 'Provider minimum stake, bonded at providerRegister',
    getter: 'getProviderMinimumStake()',
    unit: 'wei',
    networks: {
      'base-mainnet': {
        value: '200000000000000000',
        stability: 'static',
        observed: '2026-08-26',
        method: 'read from the live Base mainnet Diamond via '
              + 'getProviderMinimumStake() (93c85651), which also reconciled '
              + 'config_base_mainnet.json:4 to it (cef943ef). 0.2 MOR.',
      },
      'base-sepolia': {
        value: '200000000000000000',
        stability: 'deploy-input',
        observed: null,
        method: 'UNVERIFIED — no Base Sepolia Diamond address exists in this '
              + 'repo, so its live value could not be read (5c953939). Carried '
              + 'from config_base_sepolia.json:4, corroborated only by '
              + 'config_arbitrum_sepolia.json:4 independently carrying the same '
              + 'figure.',
      },
    },
    // Only mainnet has a retired figure. Every falsified line paired a wrong
    // 0.1-mainnet with an already-correct 0.2-Sepolia — Sepolia was never
    // documented or deployed as anything else — so there is nothing to retire
    // on that network.
    retired: [
      {
        value: '100000000000000000',
        network: 'base-mainnet',
        why: 'the deploy-time initial value, asserted as the mainnet figure '
           + 'until 93c85651/cef943ef (2026-08-26). getProviderMinimumStake() '
           + 'on the live Base mainnet Diamond returns 0.2: '
           + 'providerSetMinStake (ProviderRegistry.sol:22) was called after '
           + 'deployment and neither the docs nor config_base_mainnet.json '
           + 'were reconciled to it until then. Still sitting in '
           + 'config_arbitrum_mainnet.json:4, a file cef943ef deliberately '
           + 'left alone because no Arbitrum Diamond was read.',
      },
    ],
  },
};

// ---------------------------------------------------------------- accessors
// Positional, in NETWORKS order, because that is how both callers consume them.
export const weiFor = (param) => NETWORKS.map((n) => PARAMS[param].networks[n].value);
export const retiredWeiFor = (param) => (PARAMS[param].retired || []).map((r) => r.value);

// One line per network, naming the value's kind and when it was read. Gates print
// this so the age of an oracle is visible in the run that depended on it, rather
// than only to whoever opens this file.
export function provenance(param) {
  const p = PARAMS[param];
  return NETWORKS.map((n) => {
    const v = p.networks[n];
    const when = v.observed ? `observed ${v.observed}` : 'never chain-verified';
    return `${param} ${n} = ${v.value} ${p.unit} (${v.stability}, ${when})`;
  });
}
