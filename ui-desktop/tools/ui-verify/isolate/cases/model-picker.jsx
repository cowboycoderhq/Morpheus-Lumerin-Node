import React from 'react';
import { mount } from './_mount.jsx';
import ModelSelectionModal from '../../../../src/renderer/src/components/chat/modals/ModelSelectionModal';

// The price-mode toggle on the new-chat model picker. A model with two bids at
// known rates lets the case assert the ACTUAL numbers switch, not just a label:
//   supply/budget = 1  ->  min-block stake = price * 305 / 1e18
//   1e15 wei/s -> 0.001 MOR/s -> 0.305 MOR to open
//   2e15 wei/s -> 0.002 MOR/s -> 0.61 MOR to open
const bid = (p) => ({ Id: '0xbid' + p, Provider: '0xprov' + p, PricePerSecond: String(p) });

const models = [
  // "Test Model": the price-toggle fixture (two bids 1e15/2e15).
  {
    Id: '0xmodelpickertest0000000000000000000000000000000000000000000000',
    Name: 'Test Model',
    Tags: [],
    IpfsCID: '',
    bids: [bid('1000000000000000'), bid('2000000000000000')],
  },
  // "Aardvark": alphabetically first, dearest single provider — proves the sort
  // is by price/providers, not just the name order.
  {
    Id: '0xaardvark000000000000000000000000000000000000000000000000000000',
    Name: 'Aardvark',
    Tags: [],
    IpfsCID: '',
    bids: [bid('9000000000000000')],
  },
  // "Broadcast": three providers, mid price — should lead "Most providers".
  {
    Id: '0xbroadcast00000000000000000000000000000000000000000000000000000',
    Name: 'Broadcast',
    Tags: [],
    IpfsCID: '',
    bids: [bid('4000000000000000'), bid('5000000000000000'), bid('6000000000000000')],
  },
  // "Zulu Local": a local model — free. In Standard it lives in its own Local
  // section; in Cheapest (flattened) it leads everything (0 cost) even though its
  // name sorts last. Proves the sort is global AND that local prices as free.
  {
    Id: '0xzululocal000000000000000000000000000000000000000000000000000000',
    Name: 'Zulu Local',
    Tags: [],
    IpfsCID: '',
    isLocal: true,
  },
];

window.__picked = [];

mount(
  <ModelSelectionModal
    isActive
    models={models}
    symbol="MOR"
    meta={{ supply: 1, budget: 1 }}
    providersAvailability={null}
    bidsLoading={false}
    onChangeModel={(d) => window.__picked.push(d)}
    handleClose={() => {}}
  />,
);
