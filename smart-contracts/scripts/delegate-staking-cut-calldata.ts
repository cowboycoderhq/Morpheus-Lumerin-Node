import { Fragment, Interface } from 'ethers';
import { ethers } from 'hardhat';

import { parseConfig } from '../deploy/helpers/config-parser';

import {
  IDelegateStaking__factory,
  ISessionRouter__factory,
  IStatsStorage__factory,
  LumerinDiamond__factory,
} from '@/generated-types/ethers';
import { FacetAction } from '@/test/helpers/deployers';

/**
 * Step 2 of the two-step, owner-signed upgrade for delegated consumer staking
 * (RFP §3.5.1): builds the exact `diamondCut` transaction the diamond owner
 * must sign, from a FRESH read of the live diamond loupe. Read-only; sends
 * nothing.
 *
 * Usage (after deploying facets with migration 6):
 *   NEW_SESSION_ROUTER_FACET=0x... DELEGATE_STAKING_FACET=0x... \
 *     npx hardhat run scripts/delegate-staking-cut-calldata.ts --network base_sepolia
 *
 * Env:
 *   NEW_SESSION_ROUTER_FACET  (required) SessionRouter facet from migration 6
 *   DELEGATE_STAKING_FACET    (required) DelegateStaking facet from migration 6
 *   DIAMOND                   (optional) diamond address; defaults to
 *                             lumerinProtocol from deploy/data/config_base_sepolia.json,
 *                             so it MUST be set explicitly for mainnet.
 *
 * See smart-contracts/docs/delegate-staking-upgrade-runbook.md for the full ceremony.
 */

function requireAddress(name: string): string {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`Set ${name} to a valid address (got: ${value ?? 'unset'})`);
  }
  return ethers.getAddress(value);
}

function interfaceSelectors(iface: Interface): string[] {
  return iface.fragments.filter(Fragment.isFunction).map((f) => f.selector);
}

function selectorNames(): Map<string, string> {
  const names = new Map<string, string>();
  for (const [label, iface] of [
    ['ISessionRouter', ISessionRouter__factory.createInterface()],
    ['IStatsStorage', IStatsStorage__factory.createInterface()],
    ['IDelegateStaking', IDelegateStaking__factory.createInterface()],
  ] as const) {
    for (const fragment of iface.fragments.filter(Fragment.isFunction)) {
      names.set(fragment.selector, `${label}.${fragment.format('sighash')}`);
    }
  }
  return names;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const diamondAddr = process.env.DIAMOND
    ? ethers.getAddress(process.env.DIAMOND)
    : ethers.getAddress(parseConfig().lumerinProtocol);
  const newSessionRouterFacet = requireAddress('NEW_SESSION_ROUTER_FACET');
  const delegateStakingFacet = requireAddress('DELEGATE_STAKING_FACET');

  // Sanity: both facets must be deployed contracts on this network.
  for (const [label, addr] of [
    ['NEW_SESSION_ROUTER_FACET', newSessionRouterFacet],
    ['DELEGATE_STAKING_FACET', delegateStakingFacet],
  ] as const) {
    if ((await ethers.provider.getCode(addr)) === '0x') {
      throw new Error(`${label} ${addr} has no code on chain ${network.chainId} — run migration 6 first`);
    }
  }

  const diamond = LumerinDiamond__factory.connect(diamondAddr, ethers.provider);
  const owner = await diamond.owner();
  const ownerCode = await ethers.provider.getCode(owner);

  // Fresh loupe read: resolve the currently registered SessionRouter facet and
  // ALL selectors it serves (ISessionRouter + IStatsStorage live on one facet).
  const closeSessionSelector = ISessionRouter__factory.createInterface().getFunction('closeSession').selector;
  const oldSessionRouterFacet = await diamond.facetAddress(closeSessionSelector);
  if (oldSessionRouterFacet === ethers.ZeroAddress) {
    throw new Error('closeSession selector not registered — is DIAMOND pointing at the right contract?');
  }
  const oldSelectors = [...(await diamond.facetFunctionSelectors(oldSessionRouterFacet))];

  const sessionRouterSelectors = interfaceSelectors(ISessionRouter__factory.createInterface());
  const statsSelectors = interfaceSelectors(IStatsStorage__factory.createInterface());
  const delegateStakingSelectors = interfaceSelectors(IDelegateStaking__factory.createInterface());

  // Guard: none of the selectors we are about to Add may already be served by a
  // facet we are not removing (diamondCut would revert, but fail early and clearly).
  for (const selector of [...sessionRouterSelectors, ...statsSelectors, ...delegateStakingSelectors]) {
    const current = await diamond.facetAddress(selector);
    if (current !== ethers.ZeroAddress && current !== oldSessionRouterFacet) {
      throw new Error(`Selector ${selector} is already served by unrelated facet ${current} — aborting`);
    }
  }

  const cuts = [
    {
      facetAddress: oldSessionRouterFacet,
      action: FacetAction.Remove,
      functionSelectors: oldSelectors,
    },
    {
      facetAddress: newSessionRouterFacet,
      action: FacetAction.Add,
      functionSelectors: sessionRouterSelectors,
    },
    {
      facetAddress: newSessionRouterFacet,
      action: FacetAction.Add,
      functionSelectors: statsSelectors,
    },
    {
      facetAddress: delegateStakingFacet,
      action: FacetAction.Add,
      functionSelectors: delegateStakingSelectors,
    },
  ];

  const calldata = LumerinDiamond__factory.createInterface().encodeFunctionData(
    'diamondCut((address,uint8,bytes4[])[])',
    [cuts],
  );

  const names = selectorNames();
  const describe = (selector: string) => names.get(selector) ?? '(not in current ABI — removed function)';
  const actionLabel = ['Add', 'Replace', 'Remove'];

  console.log('=== diamondCut payload: delegated consumer staking (RFP 3.5.1) ===');
  console.log(`network:            ${network.name} (chainId ${network.chainId})`);
  console.log(`diamond:            ${diamondAddr}`);
  console.log(`diamond owner:      ${owner} (${ownerCode === '0x' ? 'EOA — signs directly' : 'contract — likely a Safe, propose there'})`);
  console.log(`old SessionRouter:  ${oldSessionRouterFacet} (${oldSelectors.length} selectors removed)`);
  console.log(`new SessionRouter:  ${newSessionRouterFacet}`);
  console.log(`DelegateStaking:    ${delegateStakingFacet}`);
  console.log('');

  for (const cut of cuts) {
    console.log(`--- ${actionLabel[cut.action]} @ ${cut.facetAddress} (${cut.functionSelectors.length} selectors) ---`);
    for (const selector of cut.functionSelectors) {
      console.log(`  ${selector}  ${describe(selector)}`);
    }
  }

  const brandNew = [...sessionRouterSelectors, ...statsSelectors].filter((s) => !oldSelectors.includes(s));
  console.log('');
  console.log(`selectors carried over unchanged: ${sessionRouterSelectors.length + statsSelectors.length - brandNew.length}`);
  console.log(`brand-new SessionRouter selectors: ${brandNew.map((s) => `${s} ${describe(s)}`).join(', ') || '(none)'}`);
  console.log(`brand-new DelegateStaking selectors: ${delegateStakingSelectors.length}`);

  console.log('');
  console.log('=== transaction for the diamond owner (single atomic tx) ===');
  console.log(`to:       ${diamondAddr}`);
  console.log(`value:    0`);
  console.log(`function: diamondCut((address,uint8,bytes4[])[])`);
  console.log(`data:     ${calldata}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
