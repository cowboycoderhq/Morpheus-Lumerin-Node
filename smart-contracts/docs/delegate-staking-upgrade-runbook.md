# Delegated consumer staking — diamond upgrade runbook

Upgrade ceremony for shipping the delegated consumer staking feature (RFP §3.5.1,
PR #832) to a live diamond. The same two-step flow is used on **BASE Sepolia**
(rehearsal) and **BASE mainnet** (the real thing): facet bytecode is deployed and
verified by a disposable EOA, and the diamond owner signs **exactly one
transaction** — a single atomic `diamondCut`. The owner never runs repo tooling
and their key never leaves their custody.

| | BASE Sepolia | BASE mainnet |
|---|---|---|
| Diamond | `0x6e4d0B775E3C3b02683A6F277Ac80240C4aFF930` | `0x6aBE1d282f72B474E54527D93b979A4f64d3030a` |
| Owner (verified on-chain 2026-07-28) | `0x19ec1E4b714990620edf41fE28e9a1552953a7F4` — EOA | `0x1FE04BC15Cf2c5A2d41a0b3a96725596676eBa1E` — Gnosis Safe **5-of-9** |
| Who signs the cut | The key-holder, directly | Safe proposal → 5 signatures → execute |

Always re-read the owner from the chain (`owner()` on the diamond) before starting;
the calldata script does this and prints it.

## What the cut does

One `diamondCut` with four entries, executed atomically (no half-upgraded window):

1. **Remove** every selector currently served by the old `SessionRouter` facet
   (read fresh from the loupe at payload-generation time — never from a stale list).
2. **Add** all `ISessionRouter` selectors → new `SessionRouter` facet
   (same ABI as before **plus** `openSessionFromPool` and `settleExpiredSession`).
3. **Add** all `IStatsStorage` selectors → new `SessionRouter` facet (carried over).
4. **Add** all `IDelegateStaking` selectors → new `DelegateStaking` facet
   (includes the owner-only `setDelegateStakingParams`).

Existing selectors keep their ABI and behavior except session close, which now
day-locks the used stipend (the absorbed #830 fix — intended behavior change).

## Roles

- **Deployer** — anyone on the team with a throwaway EOA holding a little gas ETH.
  Needs the repo, an Alchemy key (Sepolia RPC), and a Basescan API key (verification).
- **Owner / signers** — the Sepolia key-holder, or the 9 Safe owners on mainnet.
  Need only a wallet and a browser.
- **Reviewer(s)** — at least one person who is neither deployer nor signer walks the
  verification checklist below before the owner signs. On mainnet each Safe signer
  does this independently.

## Step 0 — preflight (deployer)

From `smart-contracts/` on the release commit (record the commit hash — reviewers
verify against it):

1. `npm ci && npx hardhat compile`
2. `npx hardhat test` — full suite green.
3. Confirm facet sizes are under the 24,576-byte limit (`npx hardhat size-contracts`
   or the compile warnings; SessionRouter ships at ~22.2 KB).
4. `.env`: `PRIVATE_KEY` (throwaway deployer EOA), `ALCHEMY_KEY`, `BASESCAN_API_KEY`.
   No Alchemy account? Set `BASE_SEPOLIA_RPC=https://sepolia.base.org` instead of
   `ALCHEMY_KEY` (public endpoint; fine for this ceremony).
5. Fund the deployer EOA (Sepolia faucet / small mainnet ETH).

## Step 1 — deploy facet bytecode (deployer, permissionless)

```bash
npx hardhat migrate --network base_sepolia --only 6 --verify
# mainnet later: npx hardhat migrate --network base --only 6 --verify
```

Migration 6 (`deploy/6_delegate_staking_deploy_facets.migration.ts`) deploys and
Basescan-verifies three contracts and performs **no** diamondCut:

- `LinearDistributionIntervalDecrease` (library, linked into SessionRouter)
- `SessionRouter` (new)
- `DelegateStaking`

Record the two facet addresses from the report. Nothing about the live diamond
has changed yet; if anything looks wrong, stop here at zero cost.

## Step 2 — generate the owner's transaction (deployer, read-only)

```bash
NEW_SESSION_ROUTER_FACET=0x... DELEGATE_STAKING_FACET=0x... \
  npx hardhat run scripts/delegate-staking-cut-calldata.ts --network base_sepolia
# mainnet: add DIAMOND=0x6aBE1d282f72B474E54527D93b979A4f64d3030a and --network base
```

The script reads the live loupe, rebuilds the four-entry cut, and prints:

- the diamond owner (and whether it's an EOA or a contract/Safe),
- every selector per entry with its human-readable signature,
- the diff: which selectors are carried over vs. brand new,
- the final transaction: `to` (the diamond), `value: 0`, and the `data` hex.

It refuses to run if a facet address has no code, if a selector it wants to add is
already served by an unrelated facet, or if the old facet serves any selector that
the new ABI would silently drop (review F-15). Intentionally dropping a selector
requires listing it explicitly in `REMOVED_SELECTORS_ALLOWLIST` so it shows up in
the owner's review, not in a diff nobody read.

> Mainnet note: `deploy/helpers/config-parser.ts` is hard-coded to the Sepolia
> config, so `DIAMOND=` **must** be passed explicitly on mainnet.

## Step 3 — review before signing (reviewer / each Safe signer)

- [ ] Both facet addresses show **verified source** on Basescan and the source
      matches the recorded release commit (Basescan shows the compiler input;
      spot-check `openSessionFromPool` and `_recyclePoolStake`).
- [ ] The `Remove` entry's facet address equals the SessionRouter facet currently
      shown by the loupe (louper.dev against the diamond, or `facetAddress()` of
      `closeSession`'s selector).
- [ ] The selector lists in the script output match expectations: everything
      removed is re-added except nothing; new additions are `openSessionFromPool`,
      `settleExpiredSession` and the `IDelegateStaking` set.
- [ ] Simulate the transaction (Tenderly, or the Safe UI's built-in simulation on
      mainnet) — the cut succeeds and emits `DiamondCut`.
- [ ] `value` is 0 and `to` is the diamond, nothing else.

## Step 4 — the owner signs

**BASE Sepolia (EOA owner):** the key-holder sends the printed transaction from
their own wallet — either paste the raw `data` hex into a wallet's custom-data
transaction to the diamond address, or `cast send <diamond> <data> --private-key ...`
if they prefer a terminal. One transaction, done.

**BASE mainnet (5-of-9 Safe):** any Safe owner (or registered proposer) creates
the transaction at app.safe.global → *New transaction* → *Transaction Builder*:
target = diamond, ABI method = `diamondCut((address,uint8,bytes4[])[])` (or paste
the raw `data` hex as custom data), value = 0. Signers work the Step-3 checklist
independently, sign until the 5-signature threshold is met, then execute.

## Step 5 — verify the cut landed (anyone, read-only)

- Loupe the diamond (louper.dev): old SessionRouter facet gone, new facet serving
  the full `ISessionRouter` + `IStatsStorage` selector sets, `DelegateStaking`
  facet registered.
- `getAvailableToStake(<any address>)` returns `0` (not a revert) — proves the
  new facet is wired.
- Existing reads still work: `getSession`, provider/model getters, etc.

## Step 6 — smoke test (Sepolia; scaled-down repeat on mainnet)

1. Cold test wallet: `MOR.approve(diamond, X)` → `grantStakingAllowance(hot, X, 0)`
   → `fundStakingAllowance(hot, X)`.
2. Proxy-router with `STAKING_FUND_SOURCE=pool` and **zero MOR** in the hot wallet:
   open a session (should succeed via `openSessionFromPool`), prompt through it,
   close it.
3. `GET /blockchain/pool`: unused stake back in `freeBalance`, used stipend in a
   day-lock (`holdCount` = 1).
4. After the next 00:00 UTC, open one more session and confirm the matured bucket
   folded back into `availableToStake` with no manual claim.
5. Cold wallet exit: `withdrawStakingAllowance` returns the remainder.

On Sepolia, the smoke test is only the beginning: the full corner/edge-case gate is
`docs/delegate-staking-testnet-validation.md`, and mainnet waits for its sign-off.

## Deployment policy: forward-only. There is no rollback.

**This upgrade is a one-way street, on both networks, by policy (review F-05).**

Re-adding the pre-pool SessionRouter facet after pool state exists would be
actively dangerous: the old `_rewardUserAfterClose` transfers a closing session's
stake to the hot wallet's own balance, so pool-funded sessions closed under a
reverted router would hand pooled funder capital to the hot key. The "obvious"
inverse cut is therefore not a safety net — it is the exploit. It is never
prepared, never rehearsed, and the cut tooling refuses to target a facet that is
already registered on the diamond.

What we do instead:

- **On Sepolia:** iterate forward. A bug found during validation
  (`delegate-staking-testnet-validation.md`) is fixed in source, deployed as a
  *new* facet via the same migration-6 + calldata ceremony, and cut in over the
  broken one. The validation run restarts on the affected sections.
- **On mainnet:** ship only after the full Sepolia validation doc is signed off.
  If an incident happens post-cut anyway, the response is a **forward hotfix**:
  a new, pool-aware facet (e.g. one that pauses `openSessionFromPool` while
  keeping every withdrawal, close, settle and claim path alive) prepared with
  the same two-step ceremony. Funder exit paths must remain live in any hotfix —
  that is the non-negotiable review criterion for emergency facets.

## Emergency levers that do NOT need a cut

- `setDelegateStakingParams` (owner-signed) can throttle the system immediately:
  a prohibitively high `minPrincipal` stops new funding volume in practice, and
  `maxActiveFunders` at the current count stops new funders entirely.
- `settleExpiredSession` is permissionless: anyone can drain stranded sessions
  back to the pool/users once they expire past the grace period.

## Heads-up for existing testnet users

Sessions opened before the cut close under the **new** rules: the used stipend
day-locks until the next 00:00 UTC instead of returning instantly. Announce the
cut time to anyone running a C-node against Sepolia so their automation isn't
surprised (wallet-mode nodes should enable `STAKE_AUTO_CLAIM`).
