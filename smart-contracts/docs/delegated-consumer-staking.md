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
| COLDC-R7 recycle on close, no new cold signature | `_recyclePoolStake` (immediate part) + `_releaseMaturedHolds` (day-locked part, auto on every pool draw/withdraw/close) |
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

## Close semantics (shared with the legacy path)

`_rewardUserAfterClose` computes one split for both wallet- and pool-funded sessions, so
early and normal closes differ only in proportion, not in kind:

- `sessionEnd = min(closedAt, endsAt)` — anchor to when compute stopped, not when the close
  tx landed (the PR #830 fix).
- **Unused** stake (`stake − usedStipendStake`) is released immediately: transferred to the
  user on the legacy path, or recycled into the pool free balance via `_recyclePoolStake` on
  the pool path.
- **Used** stipend stake is day-locked with `releaseAt = startOfTheDay(sessionEnd) + 1 day`,
  but only while `block.timestamp < releaseAt`. A close after that midnight (or a multi-day
  session whose earlier days' epochs already elapsed while it was open) locks nothing — the
  epoch is over, so instant release is correct, not a leak.
- The provider is paid `(sessionEnd − openedAt) × pricePerSecond` from the funding account,
  independent of the user split; the close is never a path to more than elapsed-time pay.

### Pool draw / recycle FIFO and attribution

- `_drawFromPool` debits live grants **oldest-funder-first**; the hot wallet's self-escrow
  (funder == hot) is always debited last (COLDC-R5). Each debit is stored in
  `sessionDebits[sessionId]` for exact per-funder return.
- `_recyclePoolStake` applies the **unused** portion to that session's debits oldest-first
  (so the earliest-drawn funders unlock first), which means the **used** day-lock sticks to
  the session's most-recently-drawn funders. Each day's locks aggregate into one
  `DayHoldBucket` keyed by `releaseAt`, with a per-funder amount map.
- `_releaseMaturedHolds` runs first on every draw, withdrawal, close and pending-claim,
  recycling matured buckets (bounded by `DELEGATE_STAKING_MAX_AUTO_RELEASE_DAYS`) back into
  the free balance and clearing each funder's `locked` — this is what makes capacity
  self-restoring at midnight with no housekeeping tx.

## Design decisions

- **Staking-only.** `openSessionFromPool` never sets `isDirectPaymentFromUser`. Direct pay
  would transfer a funder's MOR to a provider, which violates the COLDC-R9 invariant, and
  the c-node only uses staking sessions. Direct-pay users keep the regular `openSession`.
- **Day-lock parity.** The same stipend-derived lock the legacy path puts in
  `userStakesOnHold` becomes a pool day-lock that recycles into the bucket at release.
  Pool sessions never touch `userStakesOnHold`, so the hot wallet cannot extract the
  locked slice via `withdrawUserStakes`.
- **Self-recycling day-locks (no housekeeping).** Every lock created on a given day matures
  at the same next-midnight timestamp, so holds are aggregated into **one bucket per release
  day** (one entry per funder inside the bucket). Every pool draw, funder withdrawal, close
  and pending-claim first auto-releases matured buckets (up to
  `DELEGATE_STAKING_MAX_AUTO_RELEASE_DAYS = 8` per call), and `getAvailableToStake` already
  counts matured buckets as available. The hot wallet therefore regains its staking capacity
  at midnight with **zero housekeeping transactions** — unlike the legacy
  `userStakesOnHold` / `withdrawUserStakes` path, which needs a nightly reclaim loop and
  whose gas grows with the number of on-hold slots. `releasePoolHolds` remains as a
  permissionless fallback for pools idle for more than 8 days.
- **Anti-dust / anti-griefing (F5, review F-04).** Funding must leave a principal of ≥ 1 MOR
  (min principal, owner-adjustable), withdrawals must leave 0 or ≥ 1 MOR, and funders are
  auto-pruned from the FIFO list once principal, locked and pending are all zero. In
  addition, **revoked grants are delisted from the draw-traversal list immediately and
  expired grants lazily on the next draw** — withdrawal accounting is fully retained, but a
  dead grant can never squat in the list and inflate draw gas.
- **Hard funder cap (review F-02/F-03).** The draw-traversal list is capped at
  `maxActiveFunders` (default 64, owner-adjustable); funding or re-granting into a full pool
  reverts with `DelegateStakingTooManyFunders`. Because session debits are created only for
  listed funders (plus the hot self-escrow) and day-bucket entries derive from those debits,
  the cap bounds **every** funder loop in the engine: draw, close-time recycle, day-bucket
  release and the capacity views. Bucket cardinality beyond the cap would additionally
  require the hot wallet to draw from churned funders across the same day — i.e. a hot
  wallet can only inflate the gas of its **own** pool's operations.
- **Bounded auto-service.** `closeSession` tops up at most `maxAutoService` (default 5,
  owner-adjustable) pending-withdrawal entries per close so close gas stays bounded; the
  permissionless `claimPendingWithdrawals` clears any backlog (F2: no key needed to release
  funds).
- **Owner-adjustable limits.** All operational limits above (min principal, funder cap,
  auto-service batch, auto-release day batch) live in `DelegateStakingParams`, settable via
  the owner-only `setDelegateStakingParams` (the 5-of-9 protocol Safe on mainnet). A stored
  zero means "use the built-in default", so no initializer is needed at cut time and future
  tuning needs no redeploy.
- **Grant expiry/revocation** only disable *new draws*; escrowed funds always remain
  withdrawable by their funder (F2: frozen funds are not acceptable).

## Compatibility class

`Additive` (new facet + new storage slot + new `openSessionFromPool` selector), plus one
`In-place compatible` change: `closeSession` keeps its ABI and legacy behavior for all
existing sessions, and routes refunds to the bucket only for sessions opened via
`openSessionFromPool` (which cannot exist before this upgrade).

**PR #830 is folded into this changeset** (the original PR is closed in favor of this
unified branch): `_rewardUserAfterClose` now anchors the day-lock to
`min(closedAt, endsAt)` — the moment the session stopped consuming compute — locks only
while that day's stipend epoch is still open (`block.timestamp < releaseAt`), and skips
zero-amount hold entries. The formula is shared by the legacy and pool paths, so a
late close on the same calendar day the session ended now day-locks the used stipend on
both paths (this closes the intra-day recycle loophole that motivated the RFP).

SessionRouter deployed bytecode is at ~22.2 KB of the 24.576 KB limit (the
DelegateStaking view functions live only in the DelegateStaking facet; SessionRouter
embeds just the internal engine via `DelegateStakingStorage` / `IDelegateStakingCore`).

## Verification

`test/diamond/facets/DelegateStaking.test.ts` covers AC-COLDC-1 through AC-COLDC-9 plus
the #830 lock semantics and the auto-recycle behavior (36 tests);
`SessionRouter.test.ts` gains a #830 regression test for the legacy path. The full suite
passes (210 total).

Deployment: `deploy/5_delegate_staking.migration.ts` (upgrade of an existing diamond:
removes the old SessionRouter facet selectors via the loupe, adds the new SessionRouter and
DelegateStaking facets). Fresh deploys get the facet via `deploy/1_full_protocol.migration.ts`.

## Consumer-node integration sketch

1. Each treasury cold wallet: `grantStakingAllowance(cnode, cap, expiry)` +
   `fundStakingAllowance(cnode, amount)` (one-time ERC-20 approve to the diamond first).
2. The c-node calls `openSessionFromPool` instead of `openSession` (no ERC-20 approval and
   no MOR balance needed on the hot wallet), and closes sessions exactly as today.
3. Nothing else. Day-locked stake recycles automatically: after the daily rollover the
   next `openSessionFromPool` absorbs matured locks in the same transaction, and
   `getAvailableToStake` reports them as available immediately after midnight. No nightly
   reclaim job is needed (contrast with the legacy `withdrawUserStakes` housekeeping).
4. Treasury monitoring: `getAvailableToStake`, `getStakingPool`, `getPoolStakesOnHold`,
   and the event stream (`StakingAllowanceGranted/Funded/Revoked`, `AllowanceDebited/
   Released/HoldCreated/Withdrawn/WithdrawQueued`, `PendingWithdrawalPaid`).
