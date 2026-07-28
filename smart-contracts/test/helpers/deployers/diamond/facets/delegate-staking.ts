import { Fragment } from 'ethers';
import { ethers } from 'hardhat';

import { DelegateStaking, IDelegateStaking__factory, LumerinDiamond } from '@/generated-types/ethers';
import { FacetAction } from '@/test/helpers/deployers/diamond/lumerin-diamond';

export const deployFacetDelegateStaking = async (diamond: LumerinDiamond): Promise<DelegateStaking> => {
  let facet: DelegateStaking;

  const factory = await ethers.getContractFactory('DelegateStaking');
  facet = await factory.deploy();

  await diamond['diamondCut((address,uint8,bytes4[])[])']([
    {
      facetAddress: facet,
      action: FacetAction.Add,
      functionSelectors: IDelegateStaking__factory.createInterface()
        .fragments.filter(Fragment.isFunction)
        .map((f) => f.selector),
    },
  ]);

  facet = facet.attach(diamond.target) as DelegateStaking;

  return facet;
};
