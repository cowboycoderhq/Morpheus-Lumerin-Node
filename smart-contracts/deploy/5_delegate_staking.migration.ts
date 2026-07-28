import { Deployer, Reporter } from '@solarity/hardhat-migrate';
import { Fragment } from 'ethers';

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

// Adds the delegated consumer staking capability (RFP §3.5.1):
// 1. Deploys the new DelegateStaking facet (grants, funding, withdrawal, views).
// 2. Redeploys the SessionRouter facet with `openSessionFromPool` and
//    pool-aware stake recycling on close. All existing selectors keep their ABI.
module.exports = async function (deployer: Deployer) {
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

// npx hardhat migrate --only 5

// npx hardhat migrate --network base_sepolia --only 5 --verify
// npx hardhat migrate --network base_sepolia --only 5 --verify --continue

// npx hardhat migrate --network base --only 5 --verify
// npx hardhat migrate --network base --only 5 --verify --continue
