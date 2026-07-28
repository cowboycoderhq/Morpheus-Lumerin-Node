// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {BidStorage} from "./BidStorage.sol";

import {IDelegateStakingStorage} from "../../interfaces/storage/IDelegateStakingStorage.sol";

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
 */
contract DelegateStakingStorage is IDelegateStakingStorage, BidStorage {
    using Math for uint256;
    using SafeERC20 for IERC20;

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
        PoolHold[] holds;
        PendingWithdrawal[] pendingQueue;
        uint256 pendingHead;
    }

    struct DLGSStorage {
        mapping(address hot => DelegateStakingPool) pools;
        mapping(bytes32 sessionId => PoolDebit[]) sessionDebits;
    }

    bytes32 public constant DELEGATE_STAKING_STORAGE_SLOT = keccak256("diamond.standard.delegate.staking.storage");

    // Anti-dust guard: a funder's remaining principal must be zero or at least this amount,
    // which keeps the FIFO funder list from being bloated with worthless entries (F5).
    uint256 public constant DELEGATE_STAKING_MIN_PRINCIPAL = 1 ether;

    // Max pending-withdrawal queue entries auto-serviced per pool credit (session close /
    // hold release), keeping closeSession gas bounded. The rest is served by the
    // permissionless claimPendingWithdrawals.
    uint256 public constant DELEGATE_STAKING_MAX_AUTO_SERVICE = 5;

    /** PUBLIC, GETTERS */
    function getStakingAllowance(address funder_, address hot_) external view returns (StakingGrant memory) {
        return _getDelegateStakingStorage().pools[hot_].grants[funder_];
    }

    function getAvailableToStake(address hot_) external view returns (uint256) {
        DelegateStakingPool storage pool = _getDelegateStakingStorage().pools[hot_];

        uint256 capacity_ = 0;
        address funder_ = pool.firstFunder;
        while (funder_ != address(0)) {
            capacity_ += _grantAvailable(pool.grants[funder_]);
            funder_ = pool.nextFunder[funder_];
        }
        capacity_ += _grantAvailable(pool.grants[hot_]);

        return capacity_.min(_unencumberedBalance(pool));
    }

    function listFundersOf(
        address hot_,
        uint256 offset_,
        uint256 limit_
    ) external view returns (address[] memory funders_, uint256 total_) {
        DelegateStakingPool storage pool = _getDelegateStakingStorage().pools[hot_];

        total_ = pool.funderCount;
        if (offset_ >= total_) {
            return (new address[](0), total_);
        }

        uint256 count_ = (total_ - offset_).min(limit_);
        funders_ = new address[](count_);

        address funder_ = pool.firstFunder;
        for (uint256 i = 0; i < offset_; i++) {
            funder_ = pool.nextFunder[funder_];
        }
        for (uint256 i = 0; i < count_; i++) {
            funders_[i] = funder_;
            funder_ = pool.nextFunder[funder_];
        }
    }

    function getPendingWithdrawal(address funder_, address hot_) external view returns (uint256) {
        return _getDelegateStakingStorage().pools[hot_].grants[funder_].pendingOwed;
    }

    function getStakingPool(
        address hot_
    )
        external
        view
        returns (
            uint256 freeBalance_,
            uint256 lockedBalance_,
            uint256 pendingTotal_,
            uint256 funderCount_,
            uint256 holdCount_
        )
    {
        DelegateStakingPool storage pool = _getDelegateStakingStorage().pools[hot_];

        return (pool.freeBalance, pool.lockedBalance, pool.pendingTotal, pool.funderCount, pool.holds.length);
    }

    function getPoolStakesOnHold(address hot_) external view returns (uint256 releasable_, uint256 held_) {
        PoolHold[] storage holds = _getDelegateStakingStorage().pools[hot_].holds;

        for (uint256 i = 0; i < holds.length; i++) {
            if (block.timestamp < holds[i].releaseAt) {
                held_ += holds[i].amount;
            } else {
                releasable_ += holds[i].amount;
            }
        }
    }

    function getSessionFunding(bytes32 sessionId_) external view returns (PoolDebit[] memory) {
        return _getDelegateStakingStorage().sessionDebits[sessionId_];
    }

    /** INTERNAL */

    /**
     * Debits the pool FIFO to stake `amount_` for the session: external funders in
     * first-funded order, the hot wallet's self-escrow last (COLDC-R5).
     */
    function _drawFromPool(address hot_, uint256 amount_, bytes32 sessionId_) internal {
        DelegateStakingPool storage pool = _getDelegateStakingStorage().pools[hot_];

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
     * portion stays with the newest debits as PoolHold entries until `releaseAt_`.
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
                pool.holds.push(PoolHold(debit_.funder, held_, releaseAt_));

                emit AllowanceHoldCreated(hot_, debit_.funder, held_, releaseAt_);
            }
        }

        pool.lockedBalance -= immediate_;
        _creditPool(pool, hot_, immediate_);
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
