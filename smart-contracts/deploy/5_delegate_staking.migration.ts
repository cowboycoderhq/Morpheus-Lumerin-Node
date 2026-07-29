import { Deployer, Reporter } from '@solarity/hardhat-migrate';
import { Fragment } from 'ethers';
import { ethers } from 'hardhat';

import { parseConfig } from './helpers/config-parser';

import {
  DelegateStaking__factory,
  IDelegateStaking__factory,
  ISessionRouter__factory,
  IStatsStorage__factory,
  LinearDistributionIntervalDecrease__factory,
  LumerinDiamond__factory,
  SessionRouter__factory,
} from '@/generated-types/ethers';
import { FacetAction } from '@/test/helpers/deployers';

// LOCAL DEVELOPMENT ONLY (review F-15): deploys the delegated staking facets AND
// executes the diamondCut in one shot, which requires the migration signer to BE
// the diamond owner. That is only ever true on a local fork. Live networks use
// the two-step ceremony instead: migration 6 (deploy-only) + the owner-signed
// calldata from scripts/delegate-staking-cut-calldata.ts. This migration refuses
// to run anywhere but localhost so it can never touch a live diamond by accident.
//
// 1. Deploys the new DelegateStaking facet (grants, funding, withdrawal, views).
// 2. Redeploys the SessionRouter facet with `openSessionFromPool` and
//    pool-aware stake recycling on close. All existing selectors keep their ABI.
module.exports = async function (deployer: Deployer) {
  const { chainId } = await ethers.provider.getNetwork();
  if (chainId !== 31337n && chainId !== 1337n) {
    throw new Error(
      `Migration 5 executes a diamondCut directly and is for local forks only (got chainId ${chainId}). ` +
        'On live networks run migration 6 and scripts/delegate-staking-cut-calldata.ts instead.',
    );
  }

  const config = parseConfig();

  const ldid = await deployer.deploy(LinearDistributionIntervalDecrease__factory);
  const newSessionRouterFacet = await deployer.deploy(SessionRouter__factory, {
    libraries: {
      LinearDistributionIntervalDecrease: ldid,
    },
  });
  const delegateStakingFacet = await deployer.deploy(DelegateStaking__factory);

  const lumerinDiamond = await deployer.deployed(LumerinDiamond__factory, config.lumerinProtocol);

  // ONLY FOR TESTS
  // const testSigner = await ethers.getImpersonatedSigner(await lumerinDiamond.owner());
  // END

  // Resolve the currently registered SessionRouter facet through the diamond loupe
  const closeSessionSelector = ISessionRouter__factory.createInterface().getFunction('closeSession').selector;
  const oldSessionRouterFacet = await lumerinDiamond.facetAddress(closeSessionSelector);
  const oldSelectors = await lumerinDiamond.facetFunctionSelectors(oldSessionRouterFacet);

  // ONLY FOR TESTS - remove or add `.connect(testSigner)`
  await lumerinDiamond['diamondCut((address,uint8,bytes4[])[])']([
    {
      facetAddress: oldSessionRouterFacet,
      action: FacetAction.Remove,
      functionSelectors: [...oldSelectors],
    },
    {
      facetAddress: newSessionRouterFacet,
      action: FacetAction.Add,
      functionSelectors: ISessionRouter__factory.createInterface()
        .fragments.filter(Fragment.isFunction)
        .map((f) => f.selector),
    },
    {
      facetAddress: newSessionRouterFacet,
      action: FacetAction.Add,
      functionSelectors: IStatsStorage__factory.createInterface()
        .fragments.filter(Fragment.isFunction)
        .map((f) => f.selector),
    },
    {
      facetAddress: delegateStakingFacet,
      action: FacetAction.Add,
      functionSelectors: IDelegateStaking__factory.createInterface()
        .fragments.filter(Fragment.isFunction)
        .map((f) => f.selector),
    },
  ]);

  Reporter.reportContracts(
    ['SessionRouter Facet (new)', await newSessionRouterFacet.getAddress()],
    ['DelegateStaking Facet', await delegateStakingFacet.getAddress()],
  );
};

// npx hardhat migrate --only 5   (localhost / local fork ONLY)
//
// Live networks (two-step, owner-signed):
//   npx hardhat migrate --network base_sepolia --only 6 --verify
//   NEW_SESSION_ROUTER_FACET=0x... DELEGATE_STAKING_FACET=0x... \
//     npx hardhat run scripts/delegate-staking-cut-calldata.ts --network base_sepolia
