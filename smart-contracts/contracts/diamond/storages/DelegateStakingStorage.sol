// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {BidStorage} from "./BidStorage.sol";

import {IDelegateStakingCore} from "../../interfaces/storage/IDelegateStakingStorage.sol";

/**
 * Storage and shared accounting engine for the delegated consumer staking pool (RFP §3.5.1).
 *
 * Accounting model (per hot wallet):
 * - Every funder's contribution lives in one fungible bucket. Bookkeeping tracks, per grant,
 *   the principal (owned funds) and the locked amount (FIFO-attributed to open sessions and
 *   day-locked holds), but the tokens themselves are not segregated.
 * - Invariant: sum(principal) + pendingTotal == freeBalance + lockedBalance.
 * - Draws debit live grants FIFO (first-funded first), hot self-escrow last.
 * - Withdrawals pay immediately from the unencumbered free balance ("fungible, last-out waits");
 *   any shortfall queues and is serviced as sessions close and holds release.
 * - Day-locks are aggregated into one bucket per release day (every lock created on a given
 *   day releases at the same next-midnight timestamp) and recycle back into the pool lazily:
 *   every pool draw / withdrawal / close auto-releases matured buckets first, so no
 *   housekeeping call is needed for the hot wallet to regain its staking capacity.
 */
contract DelegateStakingStorage is IDelegateStakingCore, BidStorage {
    using Math for uint256;
    using SafeERC20 for IERC20;

    /**
     * Day-locked stake returning to the pool, aggregated per release day and funder.
     */
    struct DayHoldBucket {
        uint256 total;
        address[] funders;
        mapping(address funder => uint256) amounts;
    }

    struct DelegateStakingPool {
        // Doubly-linked FIFO list of external funders (self-escrow is kept out of the list)
        mapping(address funder => address) nextFunder;
        mapping(address funder => address) prevFunder;
        address firstFunder;
        address lastFunder;
        uint256 funderCount;
        mapping(address funder => StakingGrant) grants;
        uint256 freeBalance;
        uint256 lockedBalance;
        uint256 pendingTotal;
        // Outstanding day-lock release timestamps, FIFO (strictly increasing)
        uint128[] holdDays;
        uint256 holdDaysHead;
        mapping(uint128 releaseAt => DayHoldBucket) dayHolds;
        PendingWithdrawal[] pendingQueue;
        uint256 pendingHead;
    }

    struct DLGSStorage {
        mapping(address hot => DelegateStakingPool) pools;
        mapping(bytes32 sessionId => PoolDebit[]) sessionDebits;
    }

    bytes32 internal constant DELEGATE_STAKING_STORAGE_SLOT = keccak256("diamond.standard.delegate.staking.storage");

    // Anti-dust guard: a funder's remaining principal must be zero or at least this amount,
    // which keeps the FIFO funder list from being bloated with worthless entries (F5).
    uint256 internal constant DELEGATE_STAKING_MIN_PRINCIPAL = 1 ether;

    // Max pending-withdrawal queue entries auto-serviced per pool credit (session close /
    // hold release), keeping closeSession gas bounded. The rest is served by the
    // permissionless claimPendingWithdrawals.
    uint256 internal constant DELEGATE_STAKING_MAX_AUTO_SERVICE = 5;

    // Max matured day-lock buckets recycled automatically per pool operation. One bucket
    // accrues per calendar day with closes, so a pool that stakes at least once every
    // 8 days never needs an explicit releasePoolHolds call.
    uint256 internal constant DELEGATE_STAKING_MAX_AUTO_RELEASE_DAYS = 8;

    /** INTERNAL */

    /**
     * Debits the pool FIFO to stake `amount_` for the session: external funders in
     * first-funded order, the hot wallet's self-escrow last (COLDC-R5).
     * Matured day-locks are recycled first, so yesterday's stake is spendable
     * today without any housekeeping transaction.
     */
    function _drawFromPool(address hot_, uint256 amount_, bytes32 sessionId_) internal {
        DelegateStakingPool storage pool = _getDelegateStakingStorage().pools[hot_];

        _releaseMaturedHolds(pool, hot_, DELEGATE_STAKING_MAX_AUTO_RELEASE_DAYS);

        uint256 unencumbered_ = _unencumberedBalance(pool);
        if (amount_ == 0 || amount_ > unencumbered_) {
            revert DelegateStakingInsufficientPoolBalance(unencumbered_, amount_);
        }

        PoolDebit[] storage debits = _getDelegateStakingStorage().sessionDebits[sessionId_];

        uint256 remaining_ = amount_;
        address funder_ = pool.firstFunder;
        while (funder_ != address(0) && remaining_ > 0) {
            remaining_ = _debitGrant(pool, debits, hot_, funder_, remaining_, sessionId_);
            funder_ = pool.nextFunder[funder_];
        }
        if (remaining_ > 0) {
            remaining_ = _debitGrant(pool, debits, hot_, hot_, remaining_, sessionId_);
        }
        if (remaining_ > 0) {
            revert DelegateStakingInsufficientPoolBalance(amount_ - remaining_, amount_);
        }

        pool.freeBalance -= amount_;
        pool.lockedBalance += amount_;
    }

    /**
     * Recycles a closed pool-funded session's stake back into the bucket (COLDC-R7).
     * The immediate portion is released to the oldest debits first; the day-locked
     * portion stays with the newest debits in the release day's hold bucket.
     */
    function _recyclePoolStake(
        address hot_,
        bytes32 sessionId_,
        uint256 stake_,
        uint256 lockAmount_,
        uint128 releaseAt_
    ) internal {
        DelegateStakingPool storage pool = _getDelegateStakingStorage().pools[hot_];
        PoolDebit[] storage debits = _getDelegateStakingStorage().sessionDebits[sessionId_];

        _releaseMaturedHolds(pool, hot_, DELEGATE_STAKING_MAX_AUTO_RELEASE_DAYS);

        if (lockAmount_ > 0) {
            // Every lock created "today" matures at the same next-midnight timestamp,
            // so the FIFO day list only ever grows by at most one entry per day.
            uint256 len_ = pool.holdDays.length;
            if (len_ == 0 || pool.holdDays[len_ - 1] != releaseAt_) {
                pool.holdDays.push(releaseAt_);
            }
        }

        DayHoldBucket storage bucket = pool.dayHolds[releaseAt_];

        uint256 immediate_ = stake_ - lockAmount_;

        uint256 remaining_ = immediate_;
        for (uint256 i = 0; i < debits.length; i++) {
            PoolDebit memory debit_ = debits[i];

            uint256 released_ = debit_.amount.min(remaining_);
            if (released_ > 0) {
                pool.grants[debit_.funder].locked -= released_;
                remaining_ -= released_;

                emit AllowanceReleased(hot_, debit_.funder, released_);

                _pruneFunder(pool, hot_, debit_.funder);
            }

            uint256 held_ = debit_.amount - released_;
            if (held_ > 0) {
                if (bucket.amounts[debit_.funder] == 0) {
                    bucket.funders.push(debit_.funder);
                }
                bucket.amounts[debit_.funder] += held_;
                bucket.total += held_;

                emit AllowanceHoldCreated(hot_, debit_.funder, held_, releaseAt_);
            }
        }

        pool.lockedBalance -= immediate_;
        _creditPool(pool, hot_, immediate_);
    }

    /**
     * Recycles matured day-lock buckets back into the pool (COLDC-R7): grant locks are
     * reduced and the liquidity re-enters the free balance (after servicing queued
     * withdrawals). Called lazily from every pool draw, withdrawal and close, which
     * makes the capacity self-recovering — releasePoolHolds is only a fallback.
     */
    function _releaseMaturedHolds(
        DelegateStakingPool storage pool,
        address hot_,
        uint256 maxBuckets_
    ) internal returns (uint256 released_) {
        uint256 processed_ = 0;
        while (processed_ < maxBuckets_ && pool.holdDaysHead < pool.holdDays.length) {
            uint128 releaseAt_ = pool.holdDays[pool.holdDaysHead];
            if (block.timestamp < releaseAt_) {
                break;
            }

            DayHoldBucket storage bucket = pool.dayHolds[releaseAt_];
            for (uint256 i = 0; i < bucket.funders.length; i++) {
                address funder_ = bucket.funders[i];
                uint256 amount_ = bucket.amounts[funder_];

                pool.grants[funder_].locked -= amount_;
                delete bucket.amounts[funder_];

                emit AllowanceReleased(hot_, funder_, amount_);

                _pruneFunder(pool, hot_, funder_);
            }

            released_ += bucket.total;
            delete bucket.total;
            delete bucket.funders;
            pool.holdDaysHead++;
            processed_++;
        }

        if (released_ > 0) {
            pool.lockedBalance -= released_;
            _creditPool(pool, hot_, released_);
        }
    }

    /**
     * Routes freed liquidity into the pool: queued withdrawals are topped up first
     * (bounded per call, COLDC-R8), the remainder becomes free balance.
     */
    function _creditPool(DelegateStakingPool storage pool, address hot_, uint256 amount_) internal {
        if (amount_ == 0) {
            return;
        }

        uint256 paid_ = _servicePendingWithdrawals(pool, hot_, amount_, DELEGATE_STAKING_MAX_AUTO_SERVICE);
        pool.freeBalance += amount_ - paid_;
    }

    /**
     * Pays queued withdrawals FIFO from `budget_`, at most `maxEntries_` queue entries.
     * Returns the amount actually paid out (tokens leave the contract).
     */
    function _servicePendingWithdrawals(
        DelegateStakingPool storage pool,
        address hot_,
        uint256 budget_,
        uint256 maxEntries_
    ) internal returns (uint256 paid_) {
        uint256 served_ = 0;
        while (budget_ > 0 && served_ < maxEntries_ && pool.pendingHead < pool.pendingQueue.length) {
            PendingWithdrawal storage pending = pool.pendingQueue[pool.pendingHead];

            uint256 pay_ = pending.amount.min(budget_);

            pending.amount -= pay_;
            pool.grants[pending.funder].pendingOwed -= pay_;
            pool.pendingTotal -= pay_;
            budget_ -= pay_;
            paid_ += pay_;

            IERC20(_getBidsStorage().token).safeTransfer(pending.funder, pay_);

            emit PendingWithdrawalPaid(pending.funder, hot_, pay_);

            _pruneFunder(pool, hot_, pending.funder);

            if (pending.amount == 0) {
                pool.pendingHead++;
            }
            served_++;
        }
    }

    /**
     * Appends a funder to the FIFO list on first funding. The hot wallet's
     * self-escrow is intentionally never listed (it is always debited last).
     */
    function _listFunder(DelegateStakingPool storage pool, address hot_, address funder_) internal {
        if (funder_ == hot_ || pool.grants[funder_].isListed) {
            return;
        }

        if (pool.lastFunder == address(0)) {
            pool.firstFunder = funder_;
        } else {
            pool.nextFunder[pool.lastFunder] = funder_;
            pool.prevFunder[funder_] = pool.lastFunder;
        }
        pool.lastFunder = funder_;
        pool.grants[funder_].isListed = true;
        pool.funderCount++;
    }

    /**
     * Removes a funder from the FIFO list once it has no principal, no locked
     * attribution and no pending withdrawal, keeping draw iteration bounded (F5).
     */
    function _pruneFunder(DelegateStakingPool storage pool, address hot_, address funder_) internal {
        StakingGrant storage grant = pool.grants[funder_];
        if (
            funder_ == hot_ ||
            !grant.isListed ||
            grant.principal != 0 ||
            grant.locked != 0 ||
            grant.pendingOwed != 0
        ) {
            return;
        }

        address prev_ = pool.prevFunder[funder_];
        address next_ = pool.nextFunder[funder_];

        if (prev_ == address(0)) {
            pool.firstFunder = next_;
        } else {
            pool.nextFunder[prev_] = next_;
        }
        if (next_ == address(0)) {
            pool.lastFunder = prev_;
        } else {
            pool.prevFunder[next_] = prev_;
        }

        delete pool.nextFunder[funder_];
        delete pool.prevFunder[funder_];
        grant.isListed = false;
        pool.funderCount--;
    }

    function _isPoolFundedSession(bytes32 sessionId_) internal view returns (bool) {
        return _getDelegateStakingStorage().sessionDebits[sessionId_].length > 0;
    }

    function _unencumberedBalance(DelegateStakingPool storage pool) internal view returns (uint256) {
        return pool.freeBalance > pool.pendingTotal ? pool.freeBalance - pool.pendingTotal : 0;
    }

    function _grantAvailable(StakingGrant storage grant) internal view returns (uint256) {
        if (grant.isRevoked || (grant.expiry != 0 && block.timestamp > grant.expiry)) {
            return 0;
        }

        return grant.principal > grant.locked ? grant.principal - grant.locked : 0;
    }

    function _getDelegateStakingStorage() internal pure returns (DLGSStorage storage ds) {
        bytes32 slot_ = DELEGATE_STAKING_STORAGE_SLOT;

        assembly {
            ds.slot := slot_
        }
    }

    /** PRIVATE */
    function _debitGrant(
        DelegateStakingPool storage pool,
        PoolDebit[] storage debits,
        address hot_,
        address funder_,
        uint256 remaining_,
        bytes32 sessionId_
    ) private returns (uint256) {
        StakingGrant storage grant = pool.grants[funder_];

        uint256 take_ = _grantAvailable(grant).min(remaining_);
        if (take_ == 0) {
            return remaining_;
        }

        grant.locked += take_;
        debits.push(PoolDebit(funder_, take_));

        emit AllowanceDebited(hot_, funder_, take_, sessionId_);

        return remaining_ - take_;
    }
}
