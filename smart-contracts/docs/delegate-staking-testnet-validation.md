# Delegated consumer staking — BASE Sepolia validation run-through

Execute this checklist end-to-end on BASE Sepolia **after** the diamond cut
(see `delegate-staking-upgrade-runbook.md`) and **before** proposing the mainnet cut.
Every case must pass; record the tx hash next to each checkbox.

**Deployment policy reminder: forward-only.** Anything found here is fixed by cutting in a
*new* facet on Sepolia and re-running the affected sections — never by reverting to the old
router. Mainnet is a one-way street; this document is the gate in front of it.

## Cast of wallets

| Wallet | Role | Needs |
|---|---|---|
| `HOT` | consumer-node wallet | gas ETH only (no MOR — that's the point) |
| `COLD-A`, `COLD-B`, `COLD-C` | funders | gas ETH + test MOR |
| `EXTRA` | third party / settler | gas ETH |
| `OWNER` | diamond owner (Sepolia EOA) | gas ETH, only for section G |

A provider must be live on the target model so sessions can actually open. Diamond and
MOR addresses come from `docs/get-started/networks-and-tokens.mdx` only.

## A. Grants and funding

- [ ] A1 `grantStakingAllowance(HOT, cap, 0)` then `fundStakingAllowance(HOT, amount)` from
      COLD-A succeeds after `MOR.approve(diamond, amount)`; `getStakingAllowance(COLD-A, HOT)`
      shows `lifetimeFunded == currentPrincipal == amount`.
- [ ] A2 Funding without a prior grant reverts `DelegateStakingGrantNotFound`.
- [ ] A3 Funding beyond `cumulativeFundingCap` reverts `DelegateStakingFundingExceedsMaxAmount`;
      **withdrawing does not restore cap headroom** (fund to cap, withdraw, try to fund again —
      must still revert).
- [ ] A4 Funding that leaves `currentPrincipal` below the min principal reverts
      `DelegateStakingFundingBelowMinimum`.
- [ ] A5 Granting with `expiry` in the past reverts `DelegateStakingInvalidExpiry`.
- [ ] A6 `getDelegateStakingParams()` returns the defaults (1 MOR / 64 / 5 / 8 / 86400)
      before the owner ever touches them.

## B. Draw semantics

- [ ] B1 Fund COLD-A then COLD-B; open a session larger than COLD-A's grant:
      `getSessionFunding(sessionId)` shows FIFO debits — COLD-A fully, COLD-B the remainder.
- [ ] B2 With HOT self-escrow funded *first* and a cold grant added later, the cold grant is
      still debited before the self-escrow.
- [ ] B3 Open with amount > pool free balance reverts `DelegateStakingInsufficientLiquidBalance`.
- [ ] B4 Revoke all grants (funds still in pool), open again: reverts
      `DelegateStakingInsufficientAuthorizedCapacity` — the *other* error, on purpose.
- [ ] B5 A wallet that is not HOT (nor its delegatee) cannot draw on HOT's pool.
- [ ] B6 `HOT` holds **zero MOR** throughout this section.

## C. Close semantics (absorbed #830)

- [ ] C1 **Early close** (well before `endsAt`): unused stake back in `freeBalance`
      immediately, used stipend in a day bucket (`getPoolStakesOnHold` held > 0,
      `holdCount == 1`).
- [ ] C2 **Late close** (after the `endsAt` day's midnight UTC): everything recycles
      immediately, `holdCount == 0`.
- [ ] C3 **Same-day late close** (after `endsAt`, before midnight): used stipend still
      day-locks — closing "a bit late" must not skip the lock.
- [ ] C4 **Wallet-mode control**: the same three cases via plain `openSession` from a
      MOR-holding wallet land in `getUserStakesOnHold` instead of the pool, and
      `withdrawUserStakes` pays out after midnight.

## D. Day-lock auto-release

- [ ] D1 After C1, wait for midnight UTC, then open any pool session: the matured bucket
      folds back in the same tx (`holdCount` back to 0) — **no housekeeping call**.
- [ ] D2 `getAvailableToStake` already counts the matured bucket *before* that draw.
- [ ] D3 A funder withdrawal after midnight is paid from the matured bucket in the same tx.
- [ ] D4 `releasePoolHolds` on a pool with nothing matured reverts
      `DelegateStakingNothingToRelease` (it is only a fallback).

## E. Withdrawals, queue, revocation

- [ ] E1 Withdrawal with everything unstaked pays instantly.
- [ ] E2 Withdrawal while most of the pool is in an open session: free-balance part paid
      instantly, shortfall visible in `getPendingWithdrawal`.
- [ ] E3 A second shortfall withdrawal from the same funder **coalesces** (queue length via
      `getStakingPool` pendingTotal grows, but one `claimPendingWithdrawals(HOT, 1)` after
      liquidity returns pays the whole owed amount).
- [ ] E4 `claimPendingWithdrawals` called by EXTRA (permissionless) pays the queue.
- [ ] E5 Revoke from COLD-A: `listFundersOf` no longer contains it (immediate delisting),
      new draws skip it, but its `withdrawStakingAllowance` still pays.
- [ ] E6 Withdrawal leaving 0 < remainder < min principal reverts
      `DelegateStakingWithdrawalLeavesDust`.

## F. Permissionless expiry settlement

- [ ] F1 Settle before `endsAt + grace` reverts `SessionNotYetSettleable`.
- [ ] F2 After the grace, **EXTRA** (unrelated wallet) settles: pool session recycles fully,
      funder can exit; the HOT key is never used.
- [ ] F3 Second settle and a subsequent `closeSession` both revert `SessionAlreadyClosed`.
- [ ] F4 Provider still receives its full earned amount via `claimForProvider` after a
      settlement (next day at the latest).
- [ ] F5 Settle a **wallet-mode** session: stake returns to the session user's wallet.

## G. Owner parameter governance

- [ ] G1 `setDelegateStakingParams` from a non-owner reverts `OwnableUnauthorizedAccount`.
- [ ] G2 Owner lowers `maxActiveFunders` below the current funder count: existing funders
      keep working, the next NEW funder reverts `DelegateStakingTooManyFunders`.
- [ ] G3 Owner sets a field to 0 and `getDelegateStakingParams` reports the default again.
- [ ] G4 Owner shortens `settlementGrace` to 1 hour; F1/F2 rerun accordingly (settling
      inside the stipend epoch day-locks the used part instead of releasing it).

## H. Proxy-router integration

Router build from this branch, pointed at Sepolia.

- [ ] H1 `STAKING_FUND_SOURCE=pool`, zero MOR in HOT: open → prompt → close works
      end-to-end via `openSessionFromPool`.
- [ ] H2 `STAKING_FUND_SOURCE=auto` with some MOR in HOT: wallet is used first, pool after
      the wallet balance is exhausted.
- [ ] H3 `STAKING_FUND_SOURCE=wallet` (default): behavior identical to the pre-upgrade
      router.
- [ ] H4 `GET /blockchain/pool` numbers reconcile with the on-chain
      `getStakingPool`/`getAvailableToStake` at every step above.
- [ ] H5 `GET /blockchain/stakes/onhold` and `POST /blockchain/stakes/withdraw` reconcile
      with C4 (wallet mode); `STAKE_AUTO_CLAIM=true` claims matured holds without manual
      calls.

## I. Legacy regression

- [ ] I1 A session opened **before** the cut closes cleanly **after** the cut (it closes
      under the new day-lock rules — expected, announce to testnet users).
- [ ] I2 Provider registration/deregistration, model and bid flows, `getSession`/stats
      views: spot-check unchanged.
- [ ] I3 Marketplace/provider/model stakes held by the diamond are untouched by pool
      operations (diamond MOR balance ≥ pool free + locked + those stakes at all times).

## Sign-off

| Check | Name | Date | Commit hash validated |
|---|---|---|---|
| All sections pass on Sepolia | | | |
| Reviewer walked the evidence | | | |

Only after both rows are signed does the mainnet cut ceremony start.
