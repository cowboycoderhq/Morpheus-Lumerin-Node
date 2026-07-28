# Delegated consumer staking (RFP §3.5.1)

Implementation notes for the consumer cold/hot staking allowance capability described in
[`inference-contract-enhancements-rfp.md`](inference-contract-enhancements-rfp.md) §3.5 / §3.5.1.

## Problem

The intended session economics time-lock a consumer's staked MOR until the day after the
session ends (see PR #830). Once that lock is enforced, a consumer node can no longer
recycle the same stake intra-day and needs its full daily staking volume up front —
for the API-gateway c-node, several hundred thousand MOR. Nobody wants that in a hot
wallet. Today the only alternative (the delegate.xyz rights registry) still requires the
cold wallet to be the on-chain session actor and to hand the diamond an ERC-20 allowance.

## What this adds

A purpose escrow bucket per hot wallet, funded by any number of cold wallets:

- **New facet `DelegateStaking`** (permissionless, no owner functions, no initializer):
  `grantStakingAllowance`, `fundStakingAllowance`, `revokeStakingAllowance`,
  `withdrawStakingAllowance`, `claimPendingWithdrawals`, `releasePoolHolds`,
  plus the read views (`getStakingAllowance`, `getAvailableToStake`, `listFundersOf`,
  `getPendingWithdrawal`, `getStakingPool`, `getPoolStakesOnHold`, `getSessionFunding`).
- **New storage contract `DelegateStakingStorage`** at a brand-new diamond slot
  (`diamond.standard.delegate.staking.storage`). No existing slot is touched or repurposed.
- **SessionRouter**: new `openSessionFromPool(hot, amount, approval, signature)` — the hot
  wallet (or its delegate.xyz session delegatee) is the session actor and the stake is drawn
  from the bucket instead of an ERC-20 `transferFrom`. `closeSession` keeps its exact ABI;
  internally, refunds of pool-funded sessions recycle into the bucket instead of being
  transferred to the session user.

## Requirement mapping

| RFP req | Where |
|---------|-------|
| COLDC-R1 grant (cold-signed, purpose-bound, Many:1) | `DelegateStaking.grantStakingAllowance` |
| COLDC-R2 fund (cold-signed, per-funder withdrawable) | `DelegateStaking.fundStakingAllowance` |
| COLDC-R3 one bucket (Many:1 + self) | `DelegateStakingStorage.DelegateStakingPool` |
| COLDC-R4 hot self-escrow via self-grant | grant with `funder == hot`; always debited last |
| COLDC-R5 FIFO debit + `AllowanceDebited` per funder | `_drawFromPool` / `_debitGrant` |
| COLDC-R6 hot-signed open/close/manage only | `openSessionFromPool` + existing `_validateDelegatee` checks |
| COLDC-R7 recycle on close, no new cold signature | `_recyclePoolStake` (immediate part) + `releasePoolHolds` (day-locked part) |
| COLDC-R8 withdrawal: free-balance now, queue the rest, no pro-rata | `withdrawStakingAllowance`, `_servicePendingWithdrawals` (auto on close, bounded), `claimPendingWithdrawals` (permissionless) |
| COLDC-R9 funds only move to session stake or back to the funder | no code path transfers pool funds to the hot wallet; pool sessions cannot use direct pay; per-session funder attribution stored in `sessionDebits` for the future §3.4.4 REWARD-R6 exclusion |
| COLDC-R10 read views | `IDelegateStakingStorage` getters |

## Accounting model

All pooled funds are fungible; bookkeeping tracks per grant:

- `principal` — funds the funder currently owns inside the pool (funded − withdrawn),
- `locked` — FIFO-attributed to open sessions and day-locked holds,
- `pendingOwed` — queued withdrawal awaiting freed liquidity.

Pool-level invariant (tested): `Σ principal + pendingTotal == freeBalance + lockedBalance`.

Because funds are fungible, a funder withdrawing while "its" tokens sit in an open session
is paid from the free balance immediately; `locked` may then temporarily exceed
`principal` for that grant, which simply floors its draw capacity at zero. Only the last
funder out waits, and only until the open sessions close (RFP: "fungible, last-out waits").

Draw capacity is `min(freeBalance − pendingTotal, Σ live-grant (principal − locked))`, so
queued withdrawals always have priority over new sessions, and expired/revoked grants stop
backing draws while remaining fully withdrawable.

## Design decisions

- **Staking-only.** `openSessionFromPool` never sets `isDirectPaymentFromUser`. Direct pay
  would transfer a funder's MOR to a provider, which violates the COLDC-R9 invariant, and
  the c-node only uses staking sessions. Direct-pay users keep the regular `openSession`.
- **Day-lock parity.** On early close, the same stipend-derived lock the legacy path puts
  in `userStakesOnHold` becomes a `PoolHold` that recycles into the bucket at release
  (permissionless `releasePoolHolds`). Pool sessions never touch `userStakesOnHold`, so
  the hot wallet cannot extract the locked slice via `withdrawUserStakes`.
- **Anti-dust / anti-griefing (F5).** Funding must leave a principal of ≥ 1 MOR
  (`DELEGATE_STAKING_MIN_PRINCIPAL`), withdrawals must leave 0 or ≥ 1 MOR, and funders are
  auto-pruned from the FIFO list once principal, locked and pending are all zero. This keeps
  the draw loop bounded against dust-grant bloat.
- **Bounded auto-service.** `closeSession` tops up at most `DELEGATE_STAKING_MAX_AUTO_SERVICE`
  pending-withdrawal entries per close so close gas stays bounded; the permissionless
  `claimPendingWithdrawals` clears any backlog (F2: no key needed to release funds).
- **Grant expiry/revocation** only disable *new draws*; escrowed funds always remain
  withdrawable by their funder (F2: frozen funds are not acceptable).

## Compatibility class

`Additive` (new facet + new storage slot + new `openSessionFromPool` selector), plus one
`In-place compatible` change: `closeSession` keeps its ABI and legacy behavior for all
existing sessions, and routes refunds to the bucket only for sessions opened via
`openSessionFromPool` (which cannot exist before this upgrade).

Known interaction: this change and PR #830 both edit `_rewardUserAfterClose`. The lock
computation is shared by the legacy and pool paths, so rebasing #830 onto this branch
means applying its new lock formula (anchor to session end, skip zero-amount holds) in one
place. SessionRouter deployed bytecode is at ~23.2 KB of the 24.576 KB limit — check size
again after merging #830.

## Verification

`test/diamond/facets/DelegateStaking.test.ts` covers AC-COLDC-1 through AC-COLDC-9
(33 tests), and the full existing suite passes unchanged (206 total).

Deployment: `deploy/5_delegate_staking.migration.ts` (upgrade of an existing diamond:
removes the old SessionRouter facet selectors via the loupe, adds the new SessionRouter and
DelegateStaking facets). Fresh deploys get the facet via `deploy/1_full_protocol.migration.ts`.

## Consumer-node integration sketch

1. Each treasury cold wallet: `grantStakingAllowance(cnode, cap, expiry)` +
   `fundStakingAllowance(cnode, amount)` (one-time ERC-20 approve to the diamond first).
2. The c-node calls `openSessionFromPool` instead of `openSession` (no ERC-20 approval and
   no MOR balance needed on the hot wallet), and closes sessions exactly as today.
3. After the daily rollover the node (or anyone / a keeper) calls `releasePoolHolds` to
   recycle matured day-locks, then keeps staking from the bucket.
4. Treasury monitoring: `getAvailableToStake`, `getStakingPool`, `getPoolStakesOnHold`,
   and the event stream (`StakingAllowanceGranted/Funded/Revoked`, `AllowanceDebited/
   Released/HoldCreated/Withdrawn/WithdrawQueued`, `PendingWithdrawalPaid`).
