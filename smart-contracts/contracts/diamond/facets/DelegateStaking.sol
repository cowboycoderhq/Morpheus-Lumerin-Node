// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {DelegateStakingStorage} from "../storages/DelegateStakingStorage.sol";
import {OwnableDiamondStorage} from "../presets/OwnableDiamondStorage.sol";

import {IDelegateStaking} from "../../interfaces/facets/IDelegateStaking.sol";

/**
 * Delegated consumer staking facet (RFP §3.5.1).
 *
 * Lets one or more cold wallets pre-authorize a hot consumer-node wallet to stake a capped,
 * expiring, revocable, purpose-bound MOR budget without exposing the cold keys or moving
 * custody to the hot wallet. Sessions are opened against the pooled budget through
 * SessionRouter.openSessionFromPool; the pool only ever pays funds back to their funder.
 *
 * All funder/hot-wallet operations are permissionless and there is no initializer.
 * The only owner-gated function is setDelegateStakingParams, which lets the diamond
 * owner (the protocol multisig on mainnet) tune operational limits without a redeploy.
 */
contract DelegateStaking is IDelegateStaking, OwnableDiamondStorage, DelegateStakingStorage {
    using Math for uint256;
    using SafeERC20 for IERC20;

    /** PUBLIC, GETTERS */
    function getStakingAllowance(address funder_, address hot_) external view returns (StakingGrant memory) {
        return _getDelegateStakingStorage().pools[hot_].grants[funder_];
    }

    function getAvailableToStake(address hot_) external view returns (uint256) {
        DelegateStakingPool storage pool = _getDelegateStakingStorage().pools[hot_];

        uint256 capacity_ = 0;
        address funder_ = pool.firstFunder;
        while (funder_ != address(0)) {
            capacity_ += _grantAvailableWithMatured(pool, funder_);
            funder_ = pool.nextFunder[funder_];
        }
        capacity_ += _grantAvailableWithMatured(pool, hot_);

        // Matured day-locks are liquid: the next draw auto-releases them before debiting.
        uint256 liquid_ = pool.freeBalance + _maturedHoldsTotal(pool);
        liquid_ = liquid_ > pool.pendingTotal ? liquid_ - pool.pendingTotal : 0;

        return capacity_.min(liquid_);
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

        return (
            pool.freeBalance,
            pool.lockedBalance,
            pool.pendingTotal,
            pool.funderCount,
            pool.holdDays.length - pool.holdDaysHead
        );
    }

    function getPoolStakesOnHold(address hot_) external view returns (uint256 releasable_, uint256 held_) {
        DelegateStakingPool storage pool = _getDelegateStakingStorage().pools[hot_];

        for (uint256 i = pool.holdDaysHead; i < pool.holdDays.length; i++) {
            uint128 releaseAt_ = pool.holdDays[i];
            if (block.timestamp < releaseAt_) {
                held_ += pool.dayHolds[releaseAt_].total;
            } else {
                releasable_ += pool.dayHolds[releaseAt_].total;
            }
        }
    }

    function getSessionFunding(bytes32 sessionId_) external view returns (PoolDebit[] memory) {
        return _getDelegateStakingStorage().sessionDebits[sessionId_];
    }

    function getDelegateStakingParams() external view returns (DelegateStakingParams memory) {
        return
            DelegateStakingParams({
                minPrincipal: _minPrincipal(),
                maxActiveFunders: _maxActiveFunders(),
                maxAutoService: _maxAutoService(),
                maxAutoReleaseDays: _maxAutoReleaseDays(),
                settlementGrace: _settlementGrace()
            });
    }

    /** PUBLIC, OWNER */
    function setDelegateStakingParams(DelegateStakingParams calldata params_) external onlyOwner {
        _getDelegateStakingStorage().params = params_;

        emit DelegateStakingParamsUpdated(
            _minPrincipal(),
            _maxActiveFunders(),
            _maxAutoService(),
            _maxAutoReleaseDays(),
            _settlementGrace()
        );
    }

    /** PUBLIC, MUTATORS */
    function grantStakingAllowance(address hot_, uint256 maxAmount_, uint128 expiry_) external {
        if (hot_ == address(0)) {
            revert DelegateStakingZeroAddressProvided();
        }
        if (expiry_ != 0 && expiry_ <= block.timestamp) {
            revert DelegateStakingInvalidExpiry();
        }

        DelegateStakingPool storage pool = _getDelegateStakingStorage().pools[hot_];
        StakingGrant storage grant = pool.grants[_msgSender()];
        if (maxAmount_ == 0 || maxAmount_ < grant.funded) {
            revert DelegateStakingMaxAmountTooLow();
        }

        grant.maxAmount = maxAmount_;
        grant.expiry = expiry_;
        grant.isRevoked = false;

        // A re-grant after revoke/expiry re-activates remaining principal for draws.
        // The funder re-enters the FIFO list at the end (its original position is not
        // restored) and only if the pool has room under the active-funder cap.
        if (grant.principal > 0) {
            _listFunder(pool, hot_, _msgSender());
        }

        emit StakingAllowanceGranted(_msgSender(), hot_, maxAmount_, expiry_);
    }

    function fundStakingAllowance(address hot_, uint256 amount_) external {
        if (amount_ == 0) {
            revert DelegateStakingZeroAmountProvided();
        }

        DelegateStakingPool storage pool = _getDelegateStakingStorage().pools[hot_];
        StakingGrant storage grant = pool.grants[_msgSender()];

        if (grant.maxAmount == 0) {
            revert DelegateStakingGrantNotFound();
        }
        if (grant.isRevoked) {
            revert DelegateStakingGrantRevoked();
        }
        if (grant.expiry != 0 && block.timestamp > grant.expiry) {
            revert DelegateStakingGrantExpired();
        }
        if (grant.funded + amount_ > grant.maxAmount) {
            revert DelegateStakingFundingExceedsMaxAmount();
        }

        grant.funded += amount_;
        grant.principal += amount_;
        if (grant.principal < _minPrincipal()) {
            revert DelegateStakingFundingBelowMinimum();
        }

        pool.freeBalance += amount_;
        _listFunder(pool, hot_, _msgSender());

        IERC20(_getBidsStorage().token).safeTransferFrom(_msgSender(), address(this), amount_);

        emit StakingAllowanceFunded(_msgSender(), hot_, amount_);
    }

    function revokeStakingAllowance(address hot_) external {
        DelegateStakingPool storage pool = _getDelegateStakingStorage().pools[hot_];
        StakingGrant storage grant = pool.grants[_msgSender()];

        if (grant.maxAmount == 0) {
            revert DelegateStakingGrantNotFound();
        }

        grant.isRevoked = true;

        // Drop the dead grant from the draw-traversal list immediately so it cannot
        // squat there and inflate draw gas (F-04). Withdrawal rights are unaffected.
        _delistFunder(pool, _msgSender());

        emit StakingAllowanceRevoked(_msgSender(), hot_);
    }

    function withdrawStakingAllowance(address hot_, uint256 amount_) external {
        DelegateStakingPool storage pool = _getDelegateStakingStorage().pools[hot_];
        StakingGrant storage grant = pool.grants[_msgSender()];

        // Recycle matured day-locks first so the funder is paid from them immediately
        // instead of being queued behind liquidity that is already releasable.
        _releaseMaturedHolds(pool, hot_, _maxAutoReleaseDays());

        uint256 withdraw_ = amount_.min(grant.principal);
        if (withdraw_ == 0) {
            revert DelegateStakingNothingToWithdraw();
        }

        grant.principal -= withdraw_;
        if (grant.principal != 0 && grant.principal < _minPrincipal()) {
            revert DelegateStakingWithdrawalLeavesDust();
        }

        uint256 immediate_ = withdraw_.min(_unencumberedBalance(pool));
        uint256 queued_ = withdraw_ - immediate_;

        if (immediate_ > 0) {
            pool.freeBalance -= immediate_;

            IERC20(_getBidsStorage().token).safeTransfer(_msgSender(), immediate_);

            emit AllowanceWithdrawn(_msgSender(), hot_, immediate_);
        }
        if (queued_ > 0) {
            pool.pendingQueue.push(PendingWithdrawal(_msgSender(), queued_));
            grant.pendingOwed += queued_;
            pool.pendingTotal += queued_;

            emit AllowanceWithdrawQueued(_msgSender(), hot_, queued_);
        }

        _pruneFunder(pool, hot_, _msgSender());
    }

    function claimPendingWithdrawals(address hot_, uint8 iterations_) external {
        DelegateStakingPool storage pool = _getDelegateStakingStorage().pools[hot_];

        uint256 pendingBefore_ = pool.pendingTotal;

        // Matured day-locks service the pending queue as they recycle.
        _releaseMaturedHolds(pool, hot_, _maxAutoReleaseDays());

        uint256 paid_ = _servicePendingWithdrawals(pool, hot_, pool.freeBalance, iterations_);
        pool.freeBalance -= paid_;

        if (pool.pendingTotal == pendingBefore_) {
            revert DelegateStakingNothingToClaim();
        }
    }

    function releasePoolHolds(address hot_, uint8 iterations_) external {
        DelegateStakingPool storage pool = _getDelegateStakingStorage().pools[hot_];

        uint256 released_ = _releaseMaturedHolds(pool, hot_, iterations_);
        if (released_ == 0) {
            revert DelegateStakingNothingToRelease();
        }
    }

    /** PRIVATE, VIEW HELPERS */

    /**
     * Grant capacity as it will be after matured day-locks auto-release on the next draw.
     */
    function _grantAvailableWithMatured(
        DelegateStakingPool storage pool,
        address funder_
    ) private view returns (uint256) {
        StakingGrant storage grant = pool.grants[funder_];
        if (grant.isRevoked || (grant.expiry != 0 && block.timestamp > grant.expiry)) {
            return 0;
        }

        uint256 locked_ = grant.locked;
        for (uint256 i = pool.holdDaysHead; i < pool.holdDays.length; i++) {
            uint128 releaseAt_ = pool.holdDays[i];
            if (block.timestamp < releaseAt_) {
                break;
            }
            locked_ -= pool.dayHolds[releaseAt_].amounts[funder_];
        }

        return grant.principal > locked_ ? grant.principal - locked_ : 0;
    }

    function _maturedHoldsTotal(DelegateStakingPool storage pool) private view returns (uint256 total_) {
        for (uint256 i = pool.holdDaysHead; i < pool.holdDays.length; i++) {
            uint128 releaseAt_ = pool.holdDays[i];
            if (block.timestamp < releaseAt_) {
                break;
            }
            total_ += pool.dayHolds[releaseAt_].total;
        }
    }
}
