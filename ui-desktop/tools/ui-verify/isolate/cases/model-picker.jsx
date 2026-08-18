import React from 'react';
import { mount } from './_mount.jsx';
import ModelSelectionModal from '../../../../src/renderer/src/components/chat/modals/ModelSelectionModal';

// The price-mode toggle on the new-chat model picker. A model with two bids at
// known rates lets the case assert the ACTUAL numbers switch, not just a label:
//   supply/budget = 1  ->  6-min stake = price * 360 / 1e18
//   1e15 wei/s -> 0.001 MOR/s -> 0.36 MOR to open
//   2e15 wei/s -> 0.002 MOR/s -> 0.72 MOR to open
const models = [
  {
    Id: '0xmodelpickertest0000000000000000000000000000000000000000000000',
    Name: 'Test Model',
    Tags: [],
    IpfsCID: '',
    bids: [
      { Id: '0xbidA', Provider: '0xprovA', PricePerSecond: '1000000000000000' },
      { Id: '0xbidB', Provider: '0xprovB', PricePerSecond: '2000000000000000' },
    ],
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
