import React from 'react';
import { mount, theme } from './_mount.jsx';
import { SendForm } from '../../../../src/renderer/src/components/dashboard/tx-modal/SendForm.jsx';

// Force the affordable, valid state so the two-step confirm is reachable.
window.__onSubmit = 0;
const addr = '0x2f4E8a1B9c3D5e6F7a8B9c0d1E2f3A4b5C6d7E8f';
const props = {
  activeTab: 'send', symbol: 'MOR', symbolEth: 'ETH',
  selectedCurrency: { label: 'MOR', value: 'LMR' }, setSelectedCurrency: () => {},
  amountInput: '1.5', coinAmount: '1.5', usdAmount: '0.33',
  destinationAddress: addr, toAddress: addr, estimatedFee: undefined,
  eth: { value: 1.234, usd: '$2,468.00' }, mor: { value: 5.0, usd: '$1.10' },
  validate: () => null,
  onSubmit: async () => { window.__onSubmit++; return '0xabc123'; },
  onInputChange: () => {}, onAmountInput: () => {}, onDestinationAddressInput: () => {},
  onTabSwitch: () => {}, onRequestClose: () => {},
};
mount(
  <div style={{ width: 400, margin: '40px auto', background: theme.colors.morLight, borderRadius: 5, padding: '2rem 3rem', display: 'flex', flexDirection: 'column' }}>
    <SendForm {...props} />
  </div>,
);
