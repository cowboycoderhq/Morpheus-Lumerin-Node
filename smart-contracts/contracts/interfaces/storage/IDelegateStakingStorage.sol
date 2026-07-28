// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Storage interface for the delegated consumer staking pool (RFP §3.5.1).
 *
 * One or more cold "funder" wallets grant a capped, expiring, revocable and
 * purpose-bound staking allowance to a hot wallet (the consumer-node EOA).
 * Funded MOR forms a single "available to stake" bucket per hot wallet.
 * The hot wallet opens sessions against the bucket (FIFO debit, oldest funder
 * first, hot self-escrow last) and can never move a funder's tokens anywhere
 * except into session stake and back to that funder.
 */
interface IDelegateStakingStorage {
    /**
     * The structure that stores a staking allowance from one funder to one hot wallet.
     * The hot wallet's own self-escrow is a grant where the funder is the hot wallet itself.
     * @param maxAmount Cap on the cumulative funded amount.
     * @param funded Cumulative amount the funder has transferred into the pool.
     * @param principal Funds currently owned by the funder inside the pool (funded minus withdrawn).
     * @param locked Funds notionally locked in open sessions or day-locked holds (FIFO bookkeeping;
     *               the pooled funds themselves are fungible, so locked may temporarily exceed principal
     *               after a free-balance withdrawal).
     * @param pendingOwed Withdrawal amount queued because free liquidity was insufficient.
     * @param expiry Timestamp after which new draws from this grant are disabled (0 = no expiry).
     * @param isRevoked If true, new draws from this grant are disabled.
     * @param isListed If true, the funder is present in the pool's FIFO funder list.
     */
    struct StakingGrant {
        uint256 maxAmount;
        uint256 funded;
        uint256 principal;
        uint256 locked;
        uint256 pendingOwed;
        uint128 expiry;
        bool isRevoked;
        bool isListed;
    }

    /**
     * The structure that stores a day-locked slice of pool stake returning from a closed session.
     * @param funder The funder whose grant carries the lock (FIFO bookkeeping).
     * @param amount The locked amount.
     * @param releaseAt The timestamp when the funds recycle back into the pool.
     */
    struct PoolHold {
        address funder;
        uint256 amount;
        uint128 releaseAt;
    }

    /**
     * The structure that records which funder backed a pool-funded session (FIFO debit attribution).
     * @param funder The funder debited.
     * @param amount The amount debited from that funder's grant.
     */
    struct PoolDebit {
        address funder;
        uint256 amount;
    }

    /**
     * The structure that stores a queued withdrawal awaiting freed liquidity.
     * @param funder The funder owed.
     * @param amount The remaining owed amount.
     */
    struct PendingWithdrawal {
        address funder;
        uint256 amount;
    }

    event StakingAllowanceGranted(address indexed funder, address indexed hot, uint256 maxAmount, uint128 expiry);
    event StakingAllowanceFunded(address indexed funder, address indexed hot, uint256 amount);
    event StakingAllowanceRevoked(address indexed funder, address indexed hot);
    event AllowanceDebited(address indexed hot, address indexed funder, uint256 amount, bytes32 indexed sessionId);
    event AllowanceReleased(address indexed hot, address indexed funder, uint256 amount);
    event AllowanceHoldCreated(address indexed hot, address indexed funder, uint256 amount, uint128 releaseAt);
    event AllowanceWithdrawn(address indexed funder, address indexed hot, uint256 amount);
    event AllowanceWithdrawQueued(address indexed funder, address indexed hot, uint256 amount);
    event PendingWithdrawalPaid(address indexed funder, address indexed hot, uint256 amount);

    error DelegateStakingZeroAddressProvided();
    error DelegateStakingZeroAmountProvided();
    error DelegateStakingInvalidExpiry();
    error DelegateStakingMaxAmountTooLow();
    error DelegateStakingGrantNotFound();
    error DelegateStakingGrantRevoked();
    error DelegateStakingGrantExpired();
    error DelegateStakingFundingExceedsMaxAmount();
    error DelegateStakingFundingBelowMinimum();
    error DelegateStakingWithdrawalLeavesDust();
    error DelegateStakingNothingToWithdraw();
    error DelegateStakingNothingToClaim();
    error DelegateStakingNothingToRelease();
    error DelegateStakingInsufficientPoolBalance(uint256 available, uint256 requested);

    /**
     * The function returns the staking allowance from a funder to a hot wallet.
     * Use funder == hot to read the hot wallet's own self-escrow.
     * @param funder_ The funder (cold wallet) address.
     * @param hot_ The hot wallet address.
     */
    function getStakingAllowance(address funder_, address hot_) external view returns (StakingGrant memory);

    /**
     * The function returns the amount the hot wallet can stake right now:
     * the smaller of the pool's unencumbered free balance and the total live grant capacity.
     * @param hot_ The hot wallet address.
     */
    function getAvailableToStake(address hot_) external view returns (uint256);

    /**
     * The function returns the pool's external funders in FIFO (first-funded) order.
     * The hot wallet's self-escrow is not listed; read it with getStakingAllowance(hot, hot).
     * @param hot_ The hot wallet address.
     * @param offset_ Offset for the pagination.
     * @param limit_ Number of entities to return.
     * @return funders_ The page of funder addresses.
     * @return total_ Total number of listed funders.
     */
    function listFundersOf(
        address hot_,
        uint256 offset_,
        uint256 limit_
    ) external view returns (address[] memory funders_, uint256 total_);

    /**
     * The function returns the queued-but-unpaid withdrawal amount owed to a funder.
     * @param funder_ The funder (cold wallet) address.
     * @param hot_ The hot wallet address.
     */
    function getPendingWithdrawal(address funder_, address hot_) external view returns (uint256);

    /**
     * The function returns the aggregate pool state for a hot wallet.
     * @param hot_ The hot wallet address.
     * @return freeBalance_ Liquid, un-staked funds in the pool.
     * @return lockedBalance_ Funds staked in open sessions plus day-locked holds.
     * @return pendingTotal_ Total queued withdrawals owed to funders.
     * @return funderCount_ Number of listed external funders.
     * @return holdCount_ Number of outstanding day-locked hold entries.
     */
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
        );

    /**
     * The function returns the matured (releasable) and still-locked amounts of the pool's day-locked holds.
     * @param hot_ The hot wallet address.
     * @return releasable_ Amount that releasePoolHolds can recycle now.
     * @return held_ Amount still locked until its release timestamp.
     */
    function getPoolStakesOnHold(address hot_) external view returns (uint256 releasable_, uint256 held_);

    /**
     * The function returns the FIFO debit attribution of a pool-funded session.
     * Empty for sessions opened with the regular openSession path.
     * @param sessionId_ The session ID.
     */
    function getSessionFunding(bytes32 sessionId_) external view returns (PoolDebit[] memory);
}
