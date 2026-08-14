import React from 'react';
import { mount, theme } from './_mount.jsx';
import { SendForm } from '../../../../src/renderer/src/components/dashboard/tx-modal/SendForm.jsx';

// Force the affordable, valid state so the two-step confirm is reachable.
window.__onSubmit = 0;
// These are deliberately DIFFERENT. In the app both hold the same typed value
// (one handler writes both), so passing the same string here made the case
// blind to WHICH prop the confirm panel reads — it stayed green across a
// rename to destinationAddress. `toAddress` is the HOC state onSubmit actually
// sends (`to: this.state.toAddress`); destinationAddress is the input's local
// echo. A confirmation must show the value being sent, so the panel must render
// SENT_ADDR and never TYPED_ECHO.
// Generated EIP-55 addresses, verified to have no code, zero nonce and
// zero balance on Base mainnet. Distinguishable by construction: the form
// must render what was SENT, not what was typed.
const SENT_ADDR = '0x189971F43CD98F6c837ca1b74020ed370e2104D4';
const TYPED_ECHO = '0x462198870c58a805643de4d1EbF305135F3dF071';
const props = {
  activeTab: 'send', symbol: 'MOR', symbolEth: 'ETH',
  selectedCurrency: { label: 'MOR', value: 'LMR' }, setSelectedCurrency: () => {},
  amountInput: '1.5', coinAmount: '1.5', usdAmount: '0.33',
  destinationAddress: TYPED_ECHO, toAddress: SENT_ADDR, estimatedFee: undefined,
  eth: { value: 1.234, usd: '$2,468.00' }, mor: { value: 5.0, usd: '$1.10' },
  validate: () => null,
  // Deliberately slow: an instant resolve leaves no in-flight window, so the
  // case could never observe what stops a double-send while a transfer is
  // actually pending.
  onSubmit: async () => {
    window.__onSubmit++;
    await new Promise((r) => setTimeout(r, 350));
    return '0xabc123';
  },
  onInputChange: () => {}, onAmountInput: () => {}, onDestinationAddressInput: () => {},
  onTabSwitch: () => {}, onRequestClose: () => {},
};
mount(
  <div style={{ width: 400, margin: '40px auto', background: theme.colors.morLight, borderRadius: 5, padding: '2rem 3rem', display: 'flex', flexDirection: 'column' }}>
    <SendForm {...props} />
  </div>,
);
