import {
  DelegateRegistry,
  DelegateStaking,
  LumerinDiamond,
  Marketplace,
  ModelRegistry,
  MorpheusToken,
  ProviderRegistry,
  SessionRouter,
} from '@ethers-v6';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { getHex, wei } from '@/scripts/utils/utils';
import {
  deployDelegateRegistry,
  deployFacetDelegateStaking,
  deployFacetDelegation,
  deployFacetMarketplace,
  deployFacetModelRegistry,
  deployFacetProviderRegistry,
  deployFacetSessionRouter,
  deployLumerinDiamond,
  deployMORToken,
} from '@/test/helpers/deployers';
import { payoutStart } from '@/test/helpers/pool-helper';
import { Reverter } from '@/test/helpers/reverter';
import { setTime } from '@/utils/block-helper';
import { getProviderApproval, getReceipt } from '@/utils/provider-helper';
import { DAY } from '@/utils/time';

describe('DelegateStaking', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let COLD_A: SignerWithAddress;
  let COLD_B: SignerWithAddress;
  let HOT: SignerWithAddress;
  let FUNDING: SignerWithAddress;
  let PROVIDER: SignerWithAddress;

  let diamond: LumerinDiamond;
  let marketplace: Marketplace;
  let modelRegistry: ModelRegistry;
  let providerRegistry: ProviderRegistry;
  let sessionRouter: SessionRouter;
  let delegateStaking: DelegateStaking;

  let token: MorpheusToken;
  let delegateRegistry: DelegateRegistry;

  let bidId = '';
  const baseModelId = getHex(Buffer.from('1'));
  let modelId = getHex(Buffer.from(''));
  const bidPricePerSecond = wei(0.0001);

  before(async () => {
    [OWNER, COLD_A, COLD_B, HOT, FUNDING, PROVIDER] = await ethers.getSigners();

    [diamond, token, delegateRegistry] = await Promise.all([
      deployLumerinDiamond(),
      deployMORToken(),
      deployDelegateRegistry(),
    ]);

    [providerRegistry, modelRegistry, sessionRouter, marketplace, , delegateStaking] = await Promise.all([
      deployFacetProviderRegistry(diamond),
      deployFacetModelRegistry(diamond),
      deployFacetSessionRouter(diamond, FUNDING),
      deployFacetMarketplace(diamond, token, wei(0.0001), wei(900)),
      deployFacetDelegation(diamond, delegateRegistry),
      deployFacetDelegateStaking(diamond),
    ]);

    await token.transfer(COLD_A, wei(10000));
    await token.transfer(COLD_B, wei(10000));
    await token.transfer(HOT, wei(10000));
    await token.transfer(PROVIDER, wei(10000));
    await token.transfer(FUNDING, wei(10000));
    await token.connect(PROVIDER).approve(providerRegistry, wei(10000));
    await token.connect(PROVIDER).approve(modelRegistry, wei(10000));
    await token.connect(PROVIDER).approve(marketplace, wei(10000));
    await token.connect(COLD_A).approve(delegateStaking, wei(10000));
    await token.connect(COLD_B).approve(delegateStaking, wei(10000));
    await token.connect(HOT).approve(delegateStaking, wei(10000));
    await token.connect(FUNDING).approve(sessionRouter, wei(10000));

    const ipfsCID = getHex(Buffer.from('ipfs://ipfsaddress'));
    await providerRegistry.connect(PROVIDER).providerRegister(PROVIDER, wei(0.2), 'test');
    await modelRegistry.connect(PROVIDER).modelRegister(PROVIDER, baseModelId, ipfsCID, 0, wei(100), 'name', ['tag_1']);

    modelId = await modelRegistry.getModelId(PROVIDER, baseModelId);

    await marketplace.connect(PROVIDER).postModelBid(PROVIDER, modelId, bidPricePerSecond);
    bidId = await marketplace.getBidId(PROVIDER, modelId, 0);

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  const _openPoolSession = async (amount: bigint, nonce = 0) => {
    const { msg, signature } = await getProviderApproval(PROVIDER, HOT, bidId);
    await sessionRouter.connect(HOT).openSessionFromPool(HOT, amount, msg, signature);

    return sessionRouter.getSessionId(HOT, PROVIDER, bidId, nonce);
  };

  const _closeSession = async (sessionId: string) => {
    const { msg, signature } = await getReceipt(PROVIDER, sessionId, 0, 0);
    await sessionRouter.connect(HOT).closeSession(msg, signature);
  };

  describe('#grantStakingAllowance', () => {
    it('should create a grant and emit the event', async () => {
      await expect(delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0))
        .to.emit(delegateStaking, 'StakingAllowanceGranted')
        .withArgs(COLD_A, HOT, wei(1000), 0);

      const grant = await delegateStaking.getStakingAllowance(COLD_A, HOT);
      expect(grant.cumulativeFundingCap).to.eq(wei(1000));
      expect(grant.lifetimeFunded).to.eq(0);
      expect(grant.currentPrincipal).to.eq(0);
      expect(grant.locked).to.eq(0);
      expect(grant.expiry).to.eq(0);
      expect(grant.isRevoked).to.eq(false);
      expect(grant.isListed).to.eq(false);
    });
    it('should update the grant and clear a revocation on re-grant', async () => {
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_A).revokeStakingAllowance(HOT);
      expect((await delegateStaking.getStakingAllowance(COLD_A, HOT)).isRevoked).to.eq(true);

      await setTime(payoutStart + 10 * DAY);
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(2000), payoutStart + 20 * DAY);

      const grant = await delegateStaking.getStakingAllowance(COLD_A, HOT);
      expect(grant.cumulativeFundingCap).to.eq(wei(2000));
      expect(grant.expiry).to.eq(payoutStart + 20 * DAY);
      expect(grant.isRevoked).to.eq(false);
    });
    it('should throw error when the hot wallet address is zero', async () => {
      await expect(
        delegateStaking.connect(COLD_A).grantStakingAllowance(ethers.ZeroAddress, wei(1000), 0),
      ).to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingZeroAddressProvided');
    });
    it('should throw error when the max amount is zero or below the funded amount', async () => {
      await expect(
        delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, 0, 0),
      ).to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingMaxAmountTooLow');

      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(100));
      await expect(
        delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(50), 0),
      ).to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingMaxAmountTooLow');
    });
    it('should throw error when the expiry is in the past', async () => {
      await setTime(payoutStart + 10 * DAY);
      await expect(
        delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), payoutStart),
      ).to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingInvalidExpiry');
    });
  });

  describe('#fundStakingAllowance', () => {
    it('should fund the pool, list the funder and emit the event', async () => {
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);

      const coldBalBefore = await token.balanceOf(COLD_A);
      const diamondBalBefore = await token.balanceOf(diamond);
      await expect(delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(100)))
        .to.emit(delegateStaking, 'StakingAllowanceFunded')
        .withArgs(COLD_A, HOT, wei(100));

      expect(coldBalBefore - (await token.balanceOf(COLD_A))).to.eq(wei(100));
      expect((await token.balanceOf(diamond)) - diamondBalBefore).to.eq(wei(100));

      const grant = await delegateStaking.getStakingAllowance(COLD_A, HOT);
      expect(grant.lifetimeFunded).to.eq(wei(100));
      expect(grant.currentPrincipal).to.eq(wei(100));
      expect(grant.isListed).to.eq(true);

      expect(await delegateStaking.getAvailableToStake(HOT)).to.eq(wei(100));
      expect(await delegateStaking.listFundersOf(HOT, 0, 10)).to.deep.eq([[COLD_A.address], 1n]);

      const [freeBalance, lockedBalance, pendingTotal, funderCount, holdCount] =
        await delegateStaking.getStakingPool(HOT);
      expect([freeBalance, lockedBalance, pendingTotal, funderCount, holdCount]).to.deep.eq([wei(100), 0n, 0n, 1n, 0n]);
    });
    it('should list funders in FIFO order and keep the self-escrow out of the list', async () => {
      await delegateStaking.connect(HOT).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(HOT).fundStakingAllowance(HOT, wei(10));
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(10));
      await delegateStaking.connect(COLD_B).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_B).fundStakingAllowance(HOT, wei(10));

      expect(await delegateStaking.listFundersOf(HOT, 0, 10)).to.deep.eq([[COLD_A.address, COLD_B.address], 2n]);
      expect(await delegateStaking.listFundersOf(HOT, 1, 10)).to.deep.eq([[COLD_B.address], 2n]);
      expect(await delegateStaking.getAvailableToStake(HOT)).to.eq(wei(30));
    });
    it('should throw error when the grant does not exist', async () => {
      await expect(
        delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(100)),
      ).to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingGrantNotFound');
    });
    it('should throw error when the grant is revoked or expired', async () => {
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_A).revokeStakingAllowance(HOT);
      await expect(
        delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(100)),
      ).to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingGrantRevoked');

      await setTime(payoutStart + 10 * DAY);
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), payoutStart + 10 * DAY + 100);
      await setTime(payoutStart + 10 * DAY + 200);
      await expect(
        delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(100)),
      ).to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingGrantExpired');
    });
    it('should throw error when funding exceeds the max amount or is below the minimum', async () => {
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(100), 0);
      await expect(
        delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(101)),
      ).to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingFundingExceedsMaxAmount');
      await expect(
        delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(0.5)),
      ).to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingFundingBelowMinimum');
      await expect(delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, 0)).to.be.revertedWithCustomError(
        delegateStaking,
        'DelegateStakingZeroAmountProvided',
      );
    });
  });

  describe('#openSessionFromPool', () => {
    it('should revert when the hot wallet has no grant and no self-escrow (AC-COLDC-1)', async () => {
      await setTime(payoutStart + 10 * DAY);
      const { msg, signature } = await getProviderApproval(PROVIDER, HOT, bidId);
      await expect(
        sessionRouter.connect(HOT).openSessionFromPool(HOT, wei(50), msg, signature),
      ).to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingInsufficientLiquidBalance');
    });
    it('should open a session from a single cold grant without a per-session cold signature (AC-COLDC-2)', async () => {
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(100));

      const hotBalBefore = await token.balanceOf(HOT);
      const diamondBalBefore = await token.balanceOf(diamond);

      await setTime(payoutStart + 10 * DAY);
      const { msg, signature } = await getProviderApproval(PROVIDER, HOT, bidId);
      const sessionId = await sessionRouter.getSessionId(HOT, PROVIDER, bidId, 0);
      await expect(sessionRouter.connect(HOT).openSessionFromPool(HOT, wei(50), msg, signature))
        .to.emit(sessionRouter, 'AllowanceDebited')
        .withArgs(HOT, COLD_A, wei(50), sessionId);

      const session = await sessionRouter.getSession(sessionId);
      expect(session.user).to.eq(HOT);
      expect(session.stake).to.eq(wei(50));
      expect(session.isActive).to.eq(true);
      expect(session.isDirectPaymentFromUser).to.eq(false);

      // no tokens moved: the stake was already escrowed in the diamond
      expect(await token.balanceOf(HOT)).to.eq(hotBalBefore);
      expect(await token.balanceOf(diamond)).to.eq(diamondBalBefore);

      const [freeBalance, lockedBalance] = await delegateStaking.getStakingPool(HOT);
      expect([freeBalance, lockedBalance]).to.deep.eq([wei(50), wei(50)]);
      expect((await delegateStaking.getStakingAllowance(COLD_A, HOT)).locked).to.eq(wei(50));
      expect(await delegateStaking.getAvailableToStake(HOT)).to.eq(wei(50));

      const debits = await delegateStaking.getSessionFunding(sessionId);
      expect(debits.length).to.eq(1);
      expect(debits[0].funder).to.eq(COLD_A);
      expect(debits[0].amount).to.eq(wei(50));
    });
    it('should debit multiple funders FIFO, oldest grant first (AC-COLDC-3)', async () => {
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(10));
      await delegateStaking.connect(COLD_B).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_B).fundStakingAllowance(HOT, wei(10));

      await setTime(payoutStart + 10 * DAY);
      const sessionId = await _openPoolSession(wei(15));

      const debits = await delegateStaking.getSessionFunding(sessionId);
      expect(debits.length).to.eq(2);
      expect(debits[0].funder).to.eq(COLD_A);
      expect(debits[0].amount).to.eq(wei(10));
      expect(debits[1].funder).to.eq(COLD_B);
      expect(debits[1].amount).to.eq(wei(5));

      expect((await delegateStaking.getStakingAllowance(COLD_A, HOT)).locked).to.eq(wei(10));
      expect((await delegateStaking.getStakingAllowance(COLD_B, HOT)).locked).to.eq(wei(5));
      expect(await delegateStaking.getAvailableToStake(HOT)).to.eq(wei(5));
    });
    it('should spend own and delegated funds as one pool with the self-escrow last (AC-COLDC-4)', async () => {
      // the self-escrow is funded first, but FIFO still places it after the cold grants
      await delegateStaking.connect(HOT).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(HOT).fundStakingAllowance(HOT, wei(10));
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(10));

      await setTime(payoutStart + 10 * DAY);
      const sessionId = await _openPoolSession(wei(15));

      const debits = await delegateStaking.getSessionFunding(sessionId);
      expect(debits.length).to.eq(2);
      expect(debits[0].funder).to.eq(COLD_A);
      expect(debits[0].amount).to.eq(wei(10));
      expect(debits[1].funder).to.eq(HOT);
      expect(debits[1].amount).to.eq(wei(5));
    });
    it('should revert when the draw exceeds the live capacity or the grant expired (AC-COLDC-5)', async () => {
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(100), 0);
      await delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(100));

      await setTime(payoutStart + 10 * DAY);
      const { msg, signature } = await getProviderApproval(PROVIDER, HOT, bidId);
      await expect(
        sessionRouter.connect(HOT).openSessionFromPool(HOT, wei(101), msg, signature),
      ).to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingInsufficientLiquidBalance');

      // expiry disables further draws even though the funds are still escrowed
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(100), payoutStart + 11 * DAY);
      await setTime(payoutStart + 12 * DAY);
      const { msg: msg2, signature: signature2 } = await getProviderApproval(PROVIDER, HOT, bidId);
      await expect(
        sessionRouter.connect(HOT).openSessionFromPool(HOT, wei(50), msg2, signature2),
      ).to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingInsufficientAuthorizedCapacity');
      expect(await delegateStaking.getAvailableToStake(HOT)).to.eq(0);
    });
    it('should revert when the pool is drawn by a wallet that is not the hot wallet or its delegatee (AC-COLDC-5)', async () => {
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(100));

      await setTime(payoutStart + 10 * DAY);
      const { msg, signature } = await getProviderApproval(PROVIDER, COLD_B, bidId);
      // another wallet cannot draw on HOT's pool
      await expect(
        sessionRouter.connect(COLD_B).openSessionFromPool(HOT, wei(50), msg, signature),
      ).to.be.revertedWithCustomError(providerRegistry, 'InsufficientRightsForOperation');
      // another wallet has no pool of its own
      await expect(
        sessionRouter.connect(COLD_B).openSessionFromPool(COLD_B, wei(50), msg, signature),
      ).to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingInsufficientLiquidBalance');
    });
    it('should open a session from the hot wallet delegatee address', async () => {
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(100));

      await delegateRegistry
        .connect(HOT)
        .delegateContract(OWNER, providerRegistry, await providerRegistry.DELEGATION_RULES_SESSION(), true);

      await setTime(payoutStart + 10 * DAY);
      const { msg, signature } = await getProviderApproval(PROVIDER, OWNER, bidId);
      await sessionRouter.connect(OWNER).openSessionFromPool(HOT, wei(50), msg, signature);

      const sessionId = await sessionRouter.getSessionId(HOT, PROVIDER, bidId, 0);
      expect((await sessionRouter.getSession(sessionId)).user).to.eq(HOT);
    });
  });

  describe('#closeSession, recycle', () => {
    beforeEach(async () => {
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(100));
    });

    it('should recycle the whole stake into the pool on late closure (AC-COLDC-6)', async () => {
      await setTime(payoutStart + 10 * DAY);
      const sessionId = await _openPoolSession(wei(50));
      const session = await sessionRouter.getSession(sessionId);

      const hotBalBefore = await token.balanceOf(HOT);

      // close after the end-day boundary: the stipend epoch is over, nothing to day-lock (#830)
      await setTime(Number(session.endsAt) + DAY);
      await _closeSession(sessionId);

      const [freeBalance, lockedBalance, , , holdCount] = await delegateStaking.getStakingPool(HOT);
      expect([freeBalance, lockedBalance, holdCount]).to.deep.eq([wei(100), 0n, 0n]);
      expect((await delegateStaking.getStakingAllowance(COLD_A, HOT)).locked).to.eq(0);
      expect(await delegateStaking.getAvailableToStake(HOT)).to.eq(wei(100));

      // the hot wallet never receives the stake (AC-COLDC-8)
      expect(await token.balanceOf(HOT)).to.eq(hotBalBefore);
      // and has nothing in the legacy on-hold queue
      await expect(sessionRouter.connect(HOT).withdrawUserStakes(HOT, 10)).to.be.revertedWithCustomError(
        sessionRouter,
        'SessionUserAmountToWithdrawIsZero',
      );
    });
    it('should recycle the stake and allow re-staking without a new cold signature (AC-COLDC-6)', async () => {
      await setTime(payoutStart + 10 * DAY);
      const sessionId = await _openPoolSession(wei(50));
      const session = await sessionRouter.getSession(sessionId);

      await setTime(Number(session.endsAt) + DAY);
      await _closeSession(sessionId);

      const sessionId2 = await _openPoolSession(wei(100), 1);
      expect((await sessionRouter.getSession(sessionId2)).stake).to.eq(wei(100));

      const [freeBalance, lockedBalance] = await delegateStaking.getStakingPool(HOT);
      expect([freeBalance, lockedBalance]).to.deep.eq([0n, wei(100)]);
    });
    it('should day-lock the used stipend part on early closure and recycle it via releasePoolHolds', async () => {
      const secondsToDayEnd = 600;
      const openedAt = payoutStart + (payoutStart % DAY) + 10 * DAY - secondsToDayEnd - 1;
      await setTime(openedAt);
      const sessionId = await _openPoolSession(wei(50));

      await setTime(openedAt + 300);
      const expectedLock = await sessionRouter.stipendToStake(
        300n * bidPricePerSecond,
        await sessionRouter.startOfTheDay(openedAt),
      );
      await _closeSession(sessionId);

      const lock = expectedLock > wei(50) ? wei(50) : expectedLock;
      const [freeBalance, lockedBalance, , , holdCount] = await delegateStaking.getStakingPool(HOT);
      expect([freeBalance, lockedBalance, holdCount]).to.deep.eq([wei(100) - lock, lock, 1n]);

      const [releasable, held] = await delegateStaking.getPoolStakesOnHold(HOT);
      expect([releasable, held]).to.deep.eq([0n, lock]);

      // holds are not releasable before the next day
      await expect(delegateStaking.releasePoolHolds(HOT, 10)).to.be.revertedWithCustomError(
        delegateStaking,
        'DelegateStakingNothingToRelease',
      );

      await setTime(openedAt + secondsToDayEnd + 100);
      await expect(delegateStaking.releasePoolHolds(HOT, 10))
        .to.emit(delegateStaking, 'AllowanceReleased')
        .withArgs(HOT, COLD_A, lock);

      const [freeAfter, lockedAfter, , , holdsAfter] = await delegateStaking.getStakingPool(HOT);
      expect([freeAfter, lockedAfter, holdsAfter]).to.deep.eq([wei(100), 0n, 0n]);
      expect((await delegateStaking.getStakingAllowance(COLD_A, HOT)).locked).to.eq(0);
    });
    it('should day-lock the used stipend when closing late on the same day the session ended (#830)', async () => {
      await setTime(payoutStart + 10 * DAY);
      const sessionId = await _openPoolSession(wei(50));
      const session = await sessionRouter.getSession(sessionId);

      // late close, but still inside the stipend epoch (same calendar day as endsAt)
      await setTime(Number(session.endsAt) + 1);
      await _closeSession(sessionId);

      const [releasable, held] = await delegateStaking.getPoolStakesOnHold(HOT);
      expect(releasable).to.eq(0n);
      expect(held).to.be.greaterThan(0n);

      const [, lockedBalance, , , holdCount] = await delegateStaking.getStakingPool(HOT);
      expect(lockedBalance).to.eq(held);
      expect(holdCount).to.eq(1n);
    });
    it('should auto-recycle matured day-locks on the next pool draw, no housekeeping needed (AC-COLDC-6)', async () => {
      const secondsToDayEnd = 600;
      const openedAt = payoutStart + (payoutStart % DAY) + 10 * DAY - secondsToDayEnd - 1;
      await setTime(openedAt);
      const sessionId = await _openPoolSession(wei(50));

      await setTime(openedAt + 300);
      await _closeSession(sessionId);

      const [, held] = await delegateStaking.getPoolStakesOnHold(HOT);
      expect(held).to.be.greaterThan(0n);
      expect(await delegateStaking.getAvailableToStake(HOT)).to.eq(wei(100) - held);

      // after midnight the full capacity is reported without any transaction
      await setTime(openedAt + secondsToDayEnd + 100);
      expect(await delegateStaking.getAvailableToStake(HOT)).to.eq(wei(100));
      const [releasableAfter, heldAfter] = await delegateStaking.getPoolStakesOnHold(HOT);
      expect([releasableAfter, heldAfter]).to.deep.eq([held, 0n]);

      // and the next draw recycles the hold inside the same transaction
      const sessionId2 = await _openPoolSession(wei(100), 1);
      expect((await sessionRouter.getSession(sessionId2)).stake).to.eq(wei(100));

      const [freeBalance, lockedBalance, , , holdCount] = await delegateStaking.getStakingPool(HOT);
      expect([freeBalance, lockedBalance, holdCount]).to.deep.eq([0n, wei(100), 0n]);
    });
    it('should only allow the opening hot wallet or its delegatee to close the session (AC-COLDC-6)', async () => {
      await setTime(payoutStart + 10 * DAY);
      const sessionId = await _openPoolSession(wei(50));

      const { msg, signature } = await getReceipt(PROVIDER, sessionId, 0, 0);
      await expect(sessionRouter.connect(COLD_B).closeSession(msg, signature)).to.be.revertedWithCustomError(
        providerRegistry,
        'InsufficientRightsForOperation',
      );
    });
  });

  describe('#settleExpiredSession, pool sessions (F-01)', () => {
    beforeEach(async () => {
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(100));
    });

    it('should let anyone recycle an expired session and free the funder without the hot key', async () => {
      await setTime(payoutStart + 10 * DAY);
      const sessionId = await _openPoolSession(wei(50));
      const session = await sessionRouter.getSession(sessionId);

      // The hot key is gone: settlement is called by the cold funder after the grace period
      await setTime(Number(session.endsAt) + DAY);
      await expect(sessionRouter.connect(COLD_A).settleExpiredSession(sessionId))
        .to.emit(sessionRouter, 'SessionSettledByExpiry')
        .withArgs(HOT, sessionId, PROVIDER, COLD_A);

      // Full recycle: settlement lands after the stipend epoch, so nothing is day-locked
      const [freeBalance, lockedBalance, , , holdCount] = await delegateStaking.getStakingPool(HOT);
      expect([freeBalance, lockedBalance, holdCount]).to.deep.eq([wei(100), 0n, 0n]);
      expect((await delegateStaking.getStakingAllowance(COLD_A, HOT)).locked).to.eq(0);

      // The funder can exit immediately, cold-signed only
      const coldBalBefore = await token.balanceOf(COLD_A);
      await delegateStaking.connect(COLD_A).withdrawStakingAllowance(HOT, wei(100));
      expect((await token.balanceOf(COLD_A)) - coldBalBefore).to.eq(wei(100));
    });
    it('should throw error when the session is not yet past the grace period', async () => {
      await setTime(payoutStart + 10 * DAY);
      const sessionId = await _openPoolSession(wei(50));
      const session = await sessionRouter.getSession(sessionId);

      await setTime(Number(session.endsAt) + 100);
      await expect(sessionRouter.connect(COLD_A).settleExpiredSession(sessionId))
        .to.be.revertedWithCustomError(sessionRouter, 'SessionNotYetSettleable')
        .withArgs(BigInt(session.endsAt) + 86400n);
    });
    it('should throw error when the session is already closed or settled', async () => {
      await setTime(payoutStart + 10 * DAY);
      const sessionId = await _openPoolSession(wei(50));
      const session = await sessionRouter.getSession(sessionId);

      await setTime(Number(session.endsAt) + DAY);
      await sessionRouter.connect(COLD_B).settleExpiredSession(sessionId);

      await expect(sessionRouter.connect(COLD_B).settleExpiredSession(sessionId)).to.be.revertedWithCustomError(
        sessionRouter,
        'SessionAlreadyClosed',
      );
      await expect(_closeSession(sessionId)).to.be.revertedWithCustomError(sessionRouter, 'SessionAlreadyClosed');
    });
  });

  describe('#withdrawStakingAllowance', () => {
    beforeEach(async () => {
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(100));
    });

    it('should withdraw the full amount immediately when nothing is staked', async () => {
      const coldBalBefore = await token.balanceOf(COLD_A);

      await expect(delegateStaking.connect(COLD_A).withdrawStakingAllowance(HOT, wei(100)))
        .to.emit(delegateStaking, 'AllowanceWithdrawn')
        .withArgs(COLD_A, HOT, wei(100));

      expect((await token.balanceOf(COLD_A)) - coldBalBefore).to.eq(wei(100));

      const grant = await delegateStaking.getStakingAllowance(COLD_A, HOT);
      expect(grant.currentPrincipal).to.eq(0);
      expect(grant.isListed).to.eq(false);
      expect(await delegateStaking.listFundersOf(HOT, 0, 10)).to.deep.eq([[], 0n]);
    });
    it('should pay from the free balance immediately and queue the shortfall while funds are staked (AC-COLDC-7)', async () => {
      await setTime(payoutStart + 10 * DAY);
      const sessionId = await _openPoolSession(wei(80));

      const coldBalBefore = await token.balanceOf(COLD_A);
      const tx = delegateStaking.connect(COLD_A).withdrawStakingAllowance(HOT, wei(60));
      await expect(tx).to.emit(delegateStaking, 'AllowanceWithdrawn').withArgs(COLD_A, HOT, wei(20));
      await expect(tx).to.emit(delegateStaking, 'AllowanceWithdrawQueued').withArgs(COLD_A, HOT, wei(40));

      expect((await token.balanceOf(COLD_A)) - coldBalBefore).to.eq(wei(20));
      expect(await delegateStaking.getPendingWithdrawal(COLD_A, HOT)).to.eq(wei(40));

      const grant = await delegateStaking.getStakingAllowance(COLD_A, HOT);
      expect(grant.currentPrincipal).to.eq(wei(40));
      expect(grant.locked).to.eq(wei(80));

      // pending withdrawals are paid automatically when the session closes
      const session = await sessionRouter.getSession(sessionId);
      await setTime(Number(session.endsAt) + DAY);
      const { msg, signature } = await getReceipt(PROVIDER, sessionId, 0, 0);
      await expect(sessionRouter.connect(HOT).closeSession(msg, signature))
        .to.emit(sessionRouter, 'PendingWithdrawalPaid')
        .withArgs(COLD_A, HOT, wei(40));

      expect((await token.balanceOf(COLD_A)) - coldBalBefore).to.eq(wei(60));
      expect(await delegateStaking.getPendingWithdrawal(COLD_A, HOT)).to.eq(0);

      const [freeBalance, lockedBalance, pendingTotal] = await delegateStaking.getStakingPool(HOT);
      expect([freeBalance, lockedBalance, pendingTotal]).to.deep.eq([wei(40), 0n, 0n]);
    });
    it('should pay a withdrawal from matured day-locks in the same transaction (AC-COLDC-7)', async () => {
      const secondsToDayEnd = 600;
      const openedAt = payoutStart + (payoutStart % DAY) + 10 * DAY - secondsToDayEnd - 1;
      await setTime(openedAt);
      const sessionId = await _openPoolSession(wei(80));

      await setTime(openedAt + 300);
      await _closeSession(sessionId);

      const [, held] = await delegateStaking.getPoolStakesOnHold(HOT);
      expect(held).to.be.greaterThan(0n);

      // after midnight the funder withdraws everything at once: matured locks release inline
      await setTime(openedAt + secondsToDayEnd + 100);
      const coldBalBefore = await token.balanceOf(COLD_A);
      await expect(delegateStaking.connect(COLD_A).withdrawStakingAllowance(HOT, wei(100)))
        .to.emit(delegateStaking, 'AllowanceWithdrawn')
        .withArgs(COLD_A, HOT, wei(100));
      expect((await token.balanceOf(COLD_A)) - coldBalBefore).to.eq(wei(100));
    });
    it('should not let pending withdrawals be re-staked and pay them via claimPendingWithdrawals (AC-COLDC-7)', async () => {
      await setTime(payoutStart + 10 * DAY);
      await _openPoolSession(wei(100));

      await delegateStaking.connect(COLD_A).withdrawStakingAllowance(HOT, wei(50));
      expect(await delegateStaking.getPendingWithdrawal(COLD_A, HOT)).to.eq(wei(50));

      // new liquidity from another funder is reserved for the pending queue first
      await delegateStaking.connect(COLD_B).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_B).fundStakingAllowance(HOT, wei(80));
      expect(await delegateStaking.getAvailableToStake(HOT)).to.eq(wei(30));

      await setTime(payoutStart + 10 * DAY + 100);
      const { msg, signature } = await getProviderApproval(PROVIDER, HOT, bidId);
      await expect(
        sessionRouter.connect(HOT).openSessionFromPool(HOT, wei(40), msg, signature),
      ).to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingInsufficientLiquidBalance');

      const coldBalBefore = await token.balanceOf(COLD_A);
      await expect(delegateStaking.connect(OWNER).claimPendingWithdrawals(HOT, 10))
        .to.emit(delegateStaking, 'PendingWithdrawalPaid')
        .withArgs(COLD_A, HOT, wei(50));
      expect((await token.balanceOf(COLD_A)) - coldBalBefore).to.eq(wei(50));

      const [freeBalance, , pendingTotal] = await delegateStaking.getStakingPool(HOT);
      expect([freeBalance, pendingTotal]).to.deep.eq([wei(30), 0n]);
      expect(await delegateStaking.getAvailableToStake(HOT)).to.eq(wei(30));
    });
    it('should coalesce repeat shortfall withdrawals into one queue entry (F-08)', async () => {
      await setTime(payoutStart + 10 * DAY);
      await _openPoolSession(wei(100));

      // Two separate shortfall withdrawals while everything is staked
      await delegateStaking.connect(COLD_A).withdrawStakingAllowance(HOT, wei(30));
      await delegateStaking.connect(COLD_A).withdrawStakingAllowance(HOT, wei(30));
      expect(await delegateStaking.getPendingWithdrawal(COLD_A, HOT)).to.eq(wei(60));

      // Fresh liquidity + a SINGLE-entry claim pays the whole coalesced amount:
      // with two separate nodes, one iteration could only have paid the first 30
      await delegateStaking.connect(COLD_B).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_B).fundStakingAllowance(HOT, wei(80));

      const coldBalBefore = await token.balanceOf(COLD_A);
      await delegateStaking.connect(OWNER).claimPendingWithdrawals(HOT, 1);

      expect((await token.balanceOf(COLD_A)) - coldBalBefore).to.eq(wei(60));
      expect(await delegateStaking.getPendingWithdrawal(COLD_A, HOT)).to.eq(0);
      expect((await delegateStaking.getStakingPool(HOT)).pendingTotal_).to.eq(0);
    });
    it('should keep other funders unaffected by a withdrawal (AC-COLDC-7)', async () => {
      await delegateStaking.connect(COLD_B).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_B).fundStakingAllowance(HOT, wei(100));

      await delegateStaking.connect(COLD_A).withdrawStakingAllowance(HOT, wei(100));

      const grantB = await delegateStaking.getStakingAllowance(COLD_B, HOT);
      expect(grantB.currentPrincipal).to.eq(wei(100));
      expect(await delegateStaking.getAvailableToStake(HOT)).to.eq(wei(100));
      expect(await delegateStaking.listFundersOf(HOT, 0, 10)).to.deep.eq([[COLD_B.address], 1n]);
    });
    it('should re-list a returning funder at the tail of the FIFO order', async () => {
      await delegateStaking.connect(COLD_B).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_B).fundStakingAllowance(HOT, wei(100));

      await delegateStaking.connect(COLD_A).withdrawStakingAllowance(HOT, wei(100));
      await delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(100));

      expect(await delegateStaking.listFundersOf(HOT, 0, 10)).to.deep.eq([[COLD_B.address, COLD_A.address], 2n]);
    });
    it('should throw error when there is nothing to withdraw', async () => {
      await expect(delegateStaking.connect(COLD_B).withdrawStakingAllowance(HOT, wei(10))).to.be.revertedWithCustomError(
        delegateStaking,
        'DelegateStakingNothingToWithdraw',
      );
    });
    it('should throw error when the withdrawal leaves a dust principal', async () => {
      await expect(
        delegateStaking.connect(COLD_A).withdrawStakingAllowance(HOT, wei(99.5)),
      ).to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingWithdrawalLeavesDust');
    });
  });

  describe('#revokeStakingAllowance', () => {
    beforeEach(async () => {
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(100));
    });

    it('should disable new draws and keep the funds withdrawable (AC-COLDC-8)', async () => {
      await expect(delegateStaking.connect(COLD_A).revokeStakingAllowance(HOT))
        .to.emit(delegateStaking, 'StakingAllowanceRevoked')
        .withArgs(COLD_A, HOT);

      expect(await delegateStaking.getAvailableToStake(HOT)).to.eq(0);

      await setTime(payoutStart + 10 * DAY);
      const { msg, signature } = await getProviderApproval(PROVIDER, HOT, bidId);
      await expect(
        sessionRouter.connect(HOT).openSessionFromPool(HOT, wei(50), msg, signature),
      ).to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingInsufficientAuthorizedCapacity');

      const coldBalBefore = await token.balanceOf(COLD_A);
      await delegateStaking.connect(COLD_A).withdrawStakingAllowance(HOT, wei(100));
      expect((await token.balanceOf(COLD_A)) - coldBalBefore).to.eq(wei(100));
    });
    it('should throw error when the grant does not exist', async () => {
      await expect(delegateStaking.connect(COLD_B).revokeStakingAllowance(HOT)).to.be.revertedWithCustomError(
        delegateStaking,
        'DelegateStakingGrantNotFound',
      );
    });
  });

  describe('#claimPendingWithdrawals', () => {
    it('should throw error when there is nothing to claim', async () => {
      await expect(delegateStaking.claimPendingWithdrawals(HOT, 10)).to.be.revertedWithCustomError(
        delegateStaking,
        'DelegateStakingNothingToClaim',
      );
    });
  });

  describe('#releasePoolHolds', () => {
    it('should throw error when there is nothing to release', async () => {
      await expect(delegateStaking.releasePoolHolds(HOT, 10)).to.be.revertedWithCustomError(
        delegateStaking,
        'DelegateStakingNothingToRelease',
      );
    });
  });

  describe('#setDelegateStakingParams, funder cap and delisting (F-02/F-03/F-04)', () => {
    it('should return the built-in defaults when no params are set', async () => {
      expect(await delegateStaking.getDelegateStakingParams()).to.deep.eq([wei(1), 64n, 5n, 8n, 86400n]);
    });
    it('should let the owner tune params, zero fields falling back to defaults', async () => {
      await expect(delegateStaking.setDelegateStakingParams({ minPrincipal: wei(2), maxActiveFunders: 2, maxAutoService: 0, maxAutoReleaseDays: 0, settlementGrace: 0 }))
        .to.emit(delegateStaking, 'DelegateStakingParamsUpdated')
        .withArgs(wei(2), 2n, 5n, 8n, 86400n);

      expect(await delegateStaking.getDelegateStakingParams()).to.deep.eq([wei(2), 2n, 5n, 8n, 86400n]);
    });
    it('should throw error when params are set by a non-owner', async () => {
      await expect(
        delegateStaking
          .connect(COLD_A)
          .setDelegateStakingParams({ minPrincipal: 0, maxActiveFunders: 0, maxAutoService: 0, maxAutoReleaseDays: 0, settlementGrace: 0 }),
      ).to.be.revertedWithCustomError(delegateStaking, 'OwnableUnauthorizedAccount');
    });
    it('should enforce the active-funder cap on funding (F-04)', async () => {
      await delegateStaking.setDelegateStakingParams({ minPrincipal: 0, maxActiveFunders: 2, maxAutoService: 0, maxAutoReleaseDays: 0, settlementGrace: 0 });

      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(100));
      await delegateStaking.connect(COLD_B).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_B).fundStakingAllowance(HOT, wei(100));

      await token.approve(delegateStaking, wei(100));
      await delegateStaking.grantStakingAllowance(HOT, wei(1000), 0);
      await expect(delegateStaking.fundStakingAllowance(HOT, wei(100)))
        .to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingTooManyFunders')
        .withArgs(2);

      // The hot wallet's own self-escrow is never listed, so it is exempt from the cap
      await delegateStaking.connect(HOT).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(HOT).fundStakingAllowance(HOT, wei(100));
    });
    it('should delist a revoked funder immediately and skip it on draws (F-04)', async () => {
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(100));
      await delegateStaking.connect(COLD_B).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_B).fundStakingAllowance(HOT, wei(100));

      await delegateStaking.connect(COLD_A).revokeStakingAllowance(HOT);

      expect(await delegateStaking.listFundersOf(HOT, 0, 10)).to.deep.eq([[COLD_B.address], 1n]);

      await setTime(payoutStart + 10 * DAY);
      const sessionId = await _openPoolSession(wei(50));

      // The draw is attributed to B only; A's revoked principal is untouched
      expect(await delegateStaking.getSessionFunding(sessionId)).to.deep.eq([[COLD_B.address, wei(50)]]);

      const coldBalBefore = await token.balanceOf(COLD_A);
      await delegateStaking.connect(COLD_A).withdrawStakingAllowance(HOT, wei(100));
      expect((await token.balanceOf(COLD_A)) - coldBalBefore).to.eq(wei(100));
    });
    it('should lazily delist an expired funder on the next draw (F-04)', async () => {
      await setTime(payoutStart + 10 * DAY);

      await delegateStaking
        .connect(COLD_A)
        .grantStakingAllowance(HOT, wei(1000), payoutStart + 10 * DAY + 3600);
      await delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(100));
      await delegateStaking.connect(COLD_B).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_B).fundStakingAllowance(HOT, wei(100));

      await setTime(payoutStart + 10 * DAY + 2 * 3600);

      expect((await delegateStaking.getStakingPool(HOT)).funderCount_).to.eq(2);

      const sessionId = await _openPoolSession(wei(50));

      expect(await delegateStaking.getSessionFunding(sessionId)).to.deep.eq([[COLD_B.address, wei(50)]]);
      expect((await delegateStaking.getStakingPool(HOT)).funderCount_).to.eq(1);
      expect(await delegateStaking.listFundersOf(HOT, 0, 10)).to.deep.eq([[COLD_B.address], 1n]);
    });
    it('should re-list a re-granted funder at the FIFO tail, subject to the cap', async () => {
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(100));
      await delegateStaking.connect(COLD_B).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_B).fundStakingAllowance(HOT, wei(100));

      await delegateStaking.connect(COLD_A).revokeStakingAllowance(HOT);
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);

      expect(await delegateStaking.listFundersOf(HOT, 0, 10)).to.deep.eq([[COLD_B.address, COLD_A.address], 2n]);

      // With a full pool, a re-grant with remaining principal cannot re-enter
      await delegateStaking.setDelegateStakingParams({ minPrincipal: 0, maxActiveFunders: 2, maxAutoService: 0, maxAutoReleaseDays: 0, settlementGrace: 0 });
      await token.approve(delegateStaking, wei(100));

      await delegateStaking.connect(COLD_B).revokeStakingAllowance(HOT);
      await delegateStaking.grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.fundStakingAllowance(HOT, wei(100));

      await expect(
        delegateStaking.connect(COLD_B).grantStakingAllowance(HOT, wei(1000), 0),
      ).to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingTooManyFunders');
    });
  });

  describe('events and views reconciliation (AC-COLDC-9)', () => {
    it('should keep the pool, grants and events consistent over a full lifecycle', async () => {
      await delegateStaking.connect(COLD_A).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_A).fundStakingAllowance(HOT, wei(60));
      await delegateStaking.connect(COLD_B).grantStakingAllowance(HOT, wei(1000), 0);
      await delegateStaking.connect(COLD_B).fundStakingAllowance(HOT, wei(40));

      await setTime(payoutStart + 10 * DAY);
      const sessionId = await _openPoolSession(wei(80));

      // pool = 100 funded, 80 staked FIFO (A 60, B 20)
      expect((await delegateStaking.getStakingAllowance(COLD_A, HOT)).locked).to.eq(wei(60));
      expect((await delegateStaking.getStakingAllowance(COLD_B, HOT)).locked).to.eq(wei(20));

      const session = await sessionRouter.getSession(sessionId);
      await setTime(Number(session.endsAt) + DAY);
      const { msg, signature } = await getReceipt(PROVIDER, sessionId, 0, 0);
      const tx = sessionRouter.connect(HOT).closeSession(msg, signature);
      await expect(tx).to.emit(sessionRouter, 'AllowanceReleased').withArgs(HOT, COLD_A, wei(60));
      await expect(tx).to.emit(sessionRouter, 'AllowanceReleased').withArgs(HOT, COLD_B, wei(20));

      const [freeBalance, lockedBalance, pendingTotal] = await delegateStaking.getStakingPool(HOT);
      expect([freeBalance, lockedBalance, pendingTotal]).to.deep.eq([wei(100), 0n, 0n]);

      const grantA = await delegateStaking.getStakingAllowance(COLD_A, HOT);
      const grantB = await delegateStaking.getStakingAllowance(COLD_B, HOT);
      expect([grantA.currentPrincipal, grantA.locked]).to.deep.eq([wei(60), 0n]);
      expect([grantB.currentPrincipal, grantB.locked]).to.deep.eq([wei(40), 0n]);

      // invariant: sum(principal) + pendingTotal == freeBalance + lockedBalance
      expect(grantA.currentPrincipal + grantB.currentPrincipal + pendingTotal).to.eq(freeBalance + lockedBalance);
    });
  });
});

// npm run generate-types && npx hardhat test "test/diamond/facets/DelegateStaking.test.ts"
