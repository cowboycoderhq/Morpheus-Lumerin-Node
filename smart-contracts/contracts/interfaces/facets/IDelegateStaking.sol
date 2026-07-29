// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IDelegateStakingStorage} from "../storage/IDelegateStakingStorage.sol";

/**
 * Facet interface for the delegated consumer staking pool (RFP §3.5.1).
 *
 * Roles:
 * - Cold wallet (funder): grantStakingAllowance, fundStakingAllowance,
 *   revokeStakingAllowance, withdrawStakingAllowance.
 * - Hot wallet (consumer node): opens sessions against the pool via
 *   SessionRouter.openSessionFromPool; never custodies funders' MOR.
 * - Anyone (permissionless, F2): claimPendingWithdrawals, releasePoolHolds.
 */
interface IDelegateStaking is IDelegateStakingStorage {
    /**
     * The function to update the engine's operational limits. Owner-only (the protocol
     * multisig on mainnet): the caps that bound loop gas must be tunable without a redeploy.
     * Zero fields fall back to the built-in defaults.
     * @param params_ The new limits (see IDelegateStakingCore.DelegateStakingParams).
     */
    function setDelegateStakingParams(DelegateStakingParams calldata params_) external;

    /**
     * The function returns the effective operational limits (defaults applied).
     */
    function getDelegateStakingParams() external view returns (DelegateStakingParams memory);

    /**
     * The function to grant (or update) a staking allowance to a hot wallet. Cold-signed (COLDC-R1).
     * The grant is purpose-bound to session staking only; it is not an ERC-20 approval.
     * Granting again updates the cap/expiry and clears a previous revocation; if the grant
     * still has principal it re-enters the FIFO draw list at the end, subject to the
     * active-funder cap.
     * The hot wallet's own self-escrow is created by calling this with hot_ == msg.sender.
     * @param hot_ The hot wallet allowed to stake against the allowance.
     * @param maxAmount_ Cap on the cumulative funded amount. Must be >= the amount already funded.
     * @param expiry_ Timestamp after which new draws are disabled (0 = no expiry).
     */
    function grantStakingAllowance(address hot_, uint256 maxAmount_, uint128 expiry_) external;

    /**
     * The function to fund the purpose escrow behind a previously created grant. Cold-signed (COLDC-R2).
     * Transfers MOR from the funder into the pool's free balance. The funder's unspent
     * contribution remains withdrawable by that funder at any time.
     * @param hot_ The hot wallet whose pool is funded.
     * @param amount_ The amount to fund. The resulting principal must be at least
     *                DELEGATE_STAKING_MIN_PRINCIPAL (anti-dust, F5).
     */
    function fundStakingAllowance(address hot_, uint256 amount_) external;

    /**
     * The function to revoke a staking allowance. Cold-signed (COLDC-R8).
     * Disables new draws immediately and removes the grant from the FIFO draw list
     * (so dead grants never consume draw gas); already-staked funds return via session
     * close and hold release. Funds remain withdrawable by the funder.
     * @param hot_ The hot wallet whose grant is revoked.
     */
    function revokeStakingAllowance(address hot_) external;

    /**
     * The function to withdraw a funder's contribution. Cold-signed (COLDC-R8).
     * Pays immediately from the pool's unencumbered free balance (fungible: independent of
     * which funder's tokens are notionally locked in sessions). Any shortfall is queued and
     * paid FIFO as sessions close and holds release ("last-out waits", no pro-rata locking).
     * @param hot_ The hot wallet whose pool is debited.
     * @param amount_ The requested amount (capped at the funder's principal). The remaining
     *                principal must be zero or at least DELEGATE_STAKING_MIN_PRINCIPAL.
     */
    function withdrawStakingAllowance(address hot_, uint256 amount_) external;

    /**
     * The function to pay queued withdrawals from available free balance. Permissionless (COLDC-R8).
     * @param hot_ The hot wallet whose pending queue is serviced.
     * @param iterations_ Max queue entries to process.
     */
    function claimPendingWithdrawals(address hot_, uint8 iterations_) external;

    /**
     * The function to recycle matured day-locked holds back into the pool. Permissionless (COLDC-R7).
     * Optional: every pool draw, withdrawal and close auto-releases matured holds already,
     * so this is only a fallback for pools that have been idle for a long time.
     * @param hot_ The hot wallet whose holds are released.
     * @param iterations_ Max day buckets to process (one bucket per calendar day with closes).
     */
    function releasePoolHolds(address hot_, uint8 iterations_) external;
}
