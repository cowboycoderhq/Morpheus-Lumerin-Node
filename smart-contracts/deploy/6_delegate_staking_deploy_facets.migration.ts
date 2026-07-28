import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import {
  DelegateStaking__factory,
  LinearDistributionIntervalDecrease__factory,
  SessionRouter__factory,
} from '@/generated-types/ethers';

// Step 1 of the two-step, owner-signed upgrade for delegated consumer staking
// (RFP §3.5.1). Deploys and verifies the new facet bytecode from ANY funded
// EOA — facet deployment is permissionless; only the diamondCut in step 2
// must be signed by the diamond owner (EOA on BASE Sepolia, Safe on mainnet).
//
// This migration performs NO diamondCut and touches NO live state.
// After it completes, generate the owner's cut payload with:
//   NEW_SESSION_ROUTER_FACET=0x... DELEGATE_STAKING_FACET=0x... \
//     npx hardhat run scripts/delegate-staking-cut-calldata.ts --network <network>
//
// See smart-contracts/docs/delegate-staking-upgrade-runbook.md for the full ceremony.
module.exports = async function (deployer: Deployer) {
  const ldid = await deployer.deploy(LinearDistributionIntervalDecrease__factory);
  const newSessionRouterFacet = await deployer.deploy(SessionRouter__factory, {
    libraries: {
      LinearDistributionIntervalDecrease: ldid,
    },
  });
  const delegateStakingFacet = await deployer.deploy(DelegateStaking__factory);

  Reporter.reportContracts(
    ['LinearDistributionIntervalDecrease (library)', await ldid.getAddress()],
    ['SessionRouter Facet (new)', await newSessionRouterFacet.getAddress()],
    ['DelegateStaking Facet', await delegateStakingFacet.getAddress()],
  );
};

// npx hardhat migrate --network base_sepolia --only 6 --verify
// npx hardhat migrate --network base --only 6 --verify
