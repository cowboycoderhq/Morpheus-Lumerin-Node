// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {DelegateStakingStorage} from "../storages/DelegateStakingStorage.sol";

import {IDelegateStaking} from "../../interfaces/facets/IDelegateStaking.sol";

/**
 * Delegated consumer staking facet (RFP §3.5.1).
 *
 * Lets one or more cold wallets pre-authorize a hot consumer-node wallet to stake a capped,
 * expiring, revocable, purpose-bound MOR budget without exposing the cold keys or moving
 * custody to the hot wallet. Sessions are opened against the pooled budget through
 * SessionRouter.openSessionFromPool; the pool only ever pays funds back to their funder.
 *
 * This facet is fully permissionless: it has no owner functions and no initializer.
 */
contract DelegateStaking is IDelegateStaking, Context, DelegateStakingStorage {
    using Math for uint256;
    using SafeERC20 for IERC20;

    function grantStakingAllowance(address hot_, uint256 maxAmount_, uint128 expiry_) external {
        if (hot_ == address(0)) {
            revert DelegateStakingZeroAddressProvided();
        }
        if (expiry_ != 0 && expiry_ <= block.timestamp) {
            revert DelegateStakingInvalidExpiry();
        }

        StakingGrant storage grant = _getDelegateStakingStorage().pools[hot_].grants[_msgSender()];
        if (maxAmount_ == 0 || maxAmount_ < grant.funded) {
            revert DelegateStakingMaxAmountTooLow();
        }

        grant.maxAmount = maxAmount_;
        grant.expiry = expiry_;
        grant.isRevoked = false;

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
        if (grant.principal < DELEGATE_STAKING_MIN_PRINCIPAL) {
            revert DelegateStakingFundingBelowMinimum();
        }

        pool.freeBalance += amount_;
        _listFunder(pool, hot_, _msgSender());

        IERC20(_getBidsStorage().token).safeTransferFrom(_msgSender(), address(this), amount_);

        emit StakingAllowanceFunded(_msgSender(), hot_, amount_);
    }

    function revokeStakingAllowance(address hot_) external {
        StakingGrant storage grant = _getDelegateStakingStorage().pools[hot_].grants[_msgSender()];

        if (grant.maxAmount == 0) {
            revert DelegateStakingGrantNotFound();
        }

        grant.isRevoked = true;

        emit StakingAllowanceRevoked(_msgSender(), hot_);
    }

    function withdrawStakingAllowance(address hot_, uint256 amount_) external {
        DelegateStakingPool storage pool = _getDelegateStakingStorage().pools[hot_];
        StakingGrant storage grant = pool.grants[_msgSender()];

        uint256 withdraw_ = amount_.min(grant.principal);
        if (withdraw_ == 0) {
            revert DelegateStakingNothingToWithdraw();
        }

        grant.principal -= withdraw_;
        if (grant.principal != 0 && grant.principal < DELEGATE_STAKING_MIN_PRINCIPAL) {
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

        uint256 paid_ = _servicePendingWithdrawals(pool, hot_, pool.freeBalance, iterations_);
        if (paid_ == 0) {
            revert DelegateStakingNothingToClaim();
        }

        pool.freeBalance -= paid_;
    }

    function releasePoolHolds(address hot_, uint8 iterations_) external {
        DelegateStakingPool storage pool = _getDelegateStakingStorage().pools[hot_];
        PoolHold[] storage holds = pool.holds;

        uint256 released_ = 0;
        uint256 length_ = holds.length;
        uint256 processed_ = 0;

        for (uint256 i = length_; i > 0 && processed_ < iterations_; i--) {
            processed_++;

            PoolHold memory hold_ = holds[i - 1];
            if (block.timestamp < hold_.releaseAt) {
                continue;
            }

            pool.grants[hold_.funder].locked -= hold_.amount;
            released_ += hold_.amount;

            emit AllowanceReleased(hot_, hold_.funder, hold_.amount);

            _pruneFunder(pool, hot_, hold_.funder);

            holds[i - 1] = holds[length_ - 1];
            holds.pop();
            length_--;
        }

        if (released_ == 0) {
            revert DelegateStakingNothingToRelease();
        }

        pool.lockedBalance -= released_;
        _creditPool(pool, hot_, released_);
    }
}
