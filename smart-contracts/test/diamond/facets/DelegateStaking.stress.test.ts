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
import { HDNodeWallet, Wallet } from 'ethers';
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

/**
 * Gas-bound and solvency-invariant hardening for the delegated staking engine
 * (PR #832 review, F-02/F-03 verification + settlement corner cases).
 *
 * These tests exercise the engine AT the active-funder cap to prove that every
 * funder loop (draw, close-recycle, day-bucket release, views) stays affordable
 * in a single block, and assert the pool solvency invariant after every step of
 * a mixed lifecycle.
 */
describe('DelegateStaking stress and invariants', () => {
  const reverter = new Reverter();

  // Deliberately at the default active-funder cap.
  const FUNDER_COUNT = 64;
  // A worst-case pool operation must fit comfortably in a block (30M on BASE).
  const GAS_BUDGET = 15_000_000n;

  let OWNER: SignerWithAddress;
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

  let funders: HDNodeWallet[] = [];

  let bidId = '';
  const baseModelId = getHex(Buffer.from('1'));
  let modelId = getHex(Buffer.from(''));
  const bidPricePerSecond = wei(0.0001);

  before(async () => {
    [OWNER, HOT, FUNDING, PROVIDER] = await ethers.getSigners();

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

    await token.transfer(HOT, wei(1000));
    await token.transfer(PROVIDER, wei(10000));
    await token.transfer(FUNDING, wei(10000));
    await token.connect(PROVIDER).approve(providerRegistry, wei(10000));
    await token.connect(PROVIDER).approve(modelRegistry, wei(10000));
    await token.connect(PROVIDER).approve(marketplace, wei(10000));
    await token.connect(HOT).approve(delegateStaking, wei(1000));
    await token.connect(FUNDING).approve(sessionRouter, wei(10000));

    const ipfsCID = getHex(Buffer.from('ipfs://ipfsaddress'));
    await providerRegistry.connect(PROVIDER).providerRegister(PROVIDER, wei(0.2), 'test');
    await modelRegistry.connect(PROVIDER).modelRegister(PROVIDER, baseModelId, ipfsCID, 0, wei(100), 'name', ['tag_1']);
    modelId = await modelRegistry.getModelId(PROVIDER, baseModelId);
    await marketplace.connect(PROVIDER).postModelBid(PROVIDER, modelId, bidPricePerSecond);
    bidId = await marketplace.getBidId(PROVIDER, modelId, 0);

    // Mint FUNDER_COUNT independent cold wallets, each granting and funding the pool
    funders = [];
    const root = Wallet.createRandom();
    for (let i = 0; i < FUNDER_COUNT; i++) {
      const funder = root.deriveChild(i).connect(ethers.provider);
      funders.push(funder);

      await OWNER.sendTransaction({ to: funder.address, value: ethers.parseEther('1') });
      await token.transfer(funder.address, wei(10));
      await token.connect(funder).approve(delegateStaking, wei(10));
      await delegateStaking.connect(funder).grantStakingAllowance(HOT, wei(10), 0);
      await delegateStaking.connect(funder).fundStakingAllowance(HOT, wei(10));
    }

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  const _openPoolSession = async (amount: bigint, nonce = 0) => {
    const { msg, signature } = await getProviderApproval(PROVIDER, HOT, bidId);
    const tx = await sessionRouter.connect(HOT).openSessionFromPool(HOT, amount, msg, signature);
    const receipt = await tx.wait();

    return { sessionId: await sessionRouter.getSessionId(HOT, PROVIDER, bidId, nonce), gasUsed: receipt!.gasUsed };
  };

  const _closeSession = async (sessionId: string) => {
    const { msg, signature } = await getReceipt(PROVIDER, sessionId, 0, 0);
    const tx = await sessionRouter.connect(HOT).closeSession(msg, signature);
    const receipt = await tx.wait();

    return receipt!.gasUsed;
  };

  /**
   * The pool solvency invariant: what funders own plus what they are owed equals
   * what the pool tracks as liquid plus locked. Funder principals are read from
   * the grants directly (delisted funders still count — delisting never touches
   * accounting).
   */
  const _assertSolvent = async () => {
    let principals = 0n;
    for (const funder of funders) {
      principals += (await delegateStaking.getStakingAllowance(funder.address, HOT)).currentPrincipal;
    }
    principals += (await delegateStaking.getStakingAllowance(HOT, HOT)).currentPrincipal;

    const [freeBalance, lockedBalance, pendingTotal] = await delegateStaking.getStakingPool(HOT);
    expect(principals + pendingTotal).to.eq(freeBalance + lockedBalance);
  };

  describe('gas bounds at the active-funder cap (F-02/F-03)', () => {
    it('should keep draw, close-recycle and day-bucket release affordable with 64 debited funders', async () => {
      expect((await delegateStaking.getStakingPool(HOT)).funderCount_).to.eq(FUNDER_COUNT);

      // Draw across ALL 64 funders in one session (the worst-case debit list)
      await setTime(payoutStart + 10 * DAY);
      const { sessionId, gasUsed: openGas } = await _openPoolSession(wei(FUNDER_COUNT * 10));
      expect(openGas).to.be.lessThan(GAS_BUDGET);
      expect((await delegateStaking.getSessionFunding(sessionId)).length).to.eq(FUNDER_COUNT);

      // Early close: recycle iterates all 64 debits and day-locks the used stipend
      // across all 64 bucket entries
      const session = await sessionRouter.getSession(sessionId);
      await setTime(Number(session.openedAt) + 900);
      const closeGas = await _closeSession(sessionId);
      expect(closeGas).to.be.lessThan(GAS_BUDGET);

      // Next-day draw auto-releases the matured 64-funder bucket AND debits again
      await setTime(Number(session.endsAt) + DAY);
      const { gasUsed: recycleOpenGas } = await _openPoolSession(wei(FUNDER_COUNT * 10), 1);
      expect(recycleOpenGas).to.be.lessThan(GAS_BUDGET);
      expect((await delegateStaking.getStakingPool(HOT)).holdCount_).to.eq(0);

      await _assertSolvent();
    });
    it('should keep the capacity views callable at the cap', async () => {
      // Views walk the full funder list / day buckets; they must not run away either
      expect(await delegateStaking.getAvailableToStake(HOT)).to.eq(wei(FUNDER_COUNT * 10));
      const [funderPage, total] = await delegateStaking.listFundersOf(HOT, 0, FUNDER_COUNT);
      expect(funderPage.length).to.eq(FUNDER_COUNT);
      expect(total).to.eq(FUNDER_COUNT);
    });
    it('should reject the funder that would exceed the cap while all 64 slots are taken', async () => {
      const extra = Wallet.createRandom().connect(ethers.provider);
      await OWNER.sendTransaction({ to: extra.address, value: ethers.parseEther('1') });
      await token.transfer(extra.address, wei(10));
      await token.connect(extra).approve(delegateStaking, wei(10));
      await delegateStaking.connect(extra).grantStakingAllowance(HOT, wei(10), 0);

      await expect(delegateStaking.connect(extra).fundStakingAllowance(HOT, wei(10)))
        .to.be.revertedWithCustomError(delegateStaking, 'DelegateStakingTooManyFunders')
        .withArgs(FUNDER_COUNT);
    });
  });

  describe('solvency invariant over a mixed lifecycle (AC-COLDC-9)', () => {
    it('should hold the invariant through fund, draw, early close, withdraw, settle and claim', async () => {
      await _assertSolvent();

      // Draw a slice of the pool
      await setTime(payoutStart + 10 * DAY);
      const { sessionId } = await _openPoolSession(wei(300));
      await _assertSolvent();

      // Early close -> partial day-lock
      const session = await sessionRouter.getSession(sessionId);
      await setTime(Number(session.openedAt) + 900);
      await _closeSession(sessionId);
      await _assertSolvent();

      // A funder withdraws more than the free balance can pay -> queue
      await _openPoolSession(wei(500), 1);
      await delegateStaking.connect(funders[0]).withdrawStakingAllowance(HOT, wei(10));
      await _assertSolvent();

      // Another funder revokes (delisted, accounting intact)
      await delegateStaking.connect(funders[1]).revokeStakingAllowance(HOT);
      await _assertSolvent();

      // The second session expires unclosed and is settled permissionlessly
      const session2 = await sessionRouter.getSession(await sessionRouter.getSessionId(HOT, PROVIDER, bidId, 1));
      await setTime(Number(session2.endsAt) + DAY);
      await sessionRouter.connect(PROVIDER).settleExpiredSession(await sessionRouter.getSessionId(HOT, PROVIDER, bidId, 1));
      await _assertSolvent();

      // Queue is fully serviced by the recycled liquidity
      expect((await delegateStaking.getStakingPool(HOT)).pendingTotal_).to.eq(0);

      // The revoked funder exits completely
      await delegateStaking.connect(funders[1]).withdrawStakingAllowance(HOT, wei(10));
      await _assertSolvent();

      // The diamond always holds at least the pool's tracked liabilities
      const [freeBalance, lockedBalance] = await delegateStaking.getStakingPool(HOT);
      expect(await token.balanceOf(diamond)).to.be.greaterThanOrEqual(freeBalance + lockedBalance);
    });
  });

  describe('settlement corner cases (F-01)', () => {
    it('should day-lock the used stipend when the owner shortens the grace below one day', async () => {
      await delegateStaking.setDelegateStakingParams({
        minPrincipal: 0,
        maxActiveFunders: 0,
        maxAutoService: 0,
        maxAutoReleaseDays: 0,
        settlementGrace: 3600,
      });

      await setTime(payoutStart + 10 * DAY);
      const { sessionId } = await _openPoolSession(wei(300));
      const session = await sessionRouter.getSession(sessionId);

      // Settle one hour past endsAt, still inside the stipend epoch (same day)
      await setTime(Number(session.endsAt) + 3700);
      await sessionRouter.connect(PROVIDER).settleExpiredSession(sessionId);

      // The used stipend is day-locked exactly as a same-day close would lock it
      const [, held] = await delegateStaking.getPoolStakesOnHold(HOT);
      expect(held).to.be.greaterThan(0);
      expect((await delegateStaking.getStakingPool(HOT)).holdCount_).to.eq(1);

      await _assertSolvent();
    });
    it('should settle a session whose funder revoked while it was open', async () => {
      await setTime(payoutStart + 10 * DAY);
      const { sessionId } = await _openPoolSession(wei(10));
      const session = await sessionRouter.getSession(sessionId);

      // funders[0] backed the whole 10-MOR session; it revokes mid-session
      await delegateStaking.connect(funders[0]).revokeStakingAllowance(HOT);

      await setTime(Number(session.endsAt) + DAY);
      await sessionRouter.connect(OWNER).settleExpiredSession(sessionId);

      // The recycled stake is withdrawable by the revoked funder immediately
      const balBefore = await token.balanceOf(funders[0].address);
      await delegateStaking.connect(funders[0]).withdrawStakingAllowance(HOT, wei(10));
      expect((await token.balanceOf(funders[0].address)) - balBefore).to.eq(wei(10));

      await _assertSolvent();
    });
  });
});

// npm run generate-types && npx hardhat test "test/diamond/facets/DelegateStaking.stress.test.ts"
