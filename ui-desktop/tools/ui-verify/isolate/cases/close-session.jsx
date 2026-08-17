import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'styled-components';
import theme from '../../../../src/renderer/src/ui/theme';
import { ChatHistory } from '../../../../src/renderer/src/components/chat/ChatHistory';

// The Close button, on the real ChatHistory.
//
// Closing a session EARLY does not spend the stake — it time-locks part of it
// for a day (SessionRouter._rewardUserAfterClose). Close used to be ONE click
// with no warning, and a real user closed a session well before it ended and
// watched part of the stake go unreachable for 24h.
//
// The fixture is not a real session: it is chain-derived and resolves to
// none, keeping only the used-share formula the contract applies:
// stake 229.508381 MOR, opened 1787872655,
// ends 1787873854 (1199s). `?at=` sets the clock, so the case can stand at a
// chosen moment inside or past the session:
//   at=1787872961  -> 306s in, the close point this case pins  -> locks 58.5734 MOR
//   at=1787873854  -> exactly endsAt                      -> locks nothing
// PROVENANCE: two of the fields below are DRAWN from published Base mainnet
// data and two are SHAPED from it; none of them is any session's record.
// ModelName is product data, ClosedAt is a sentinel, and Provider is
// generated. DRAWN: the Id is a real BLOCK HASH -- a well-formed bytes32
// that was never a session id, so getSession() resolves it to nothing --
// and OpenedAt is that same block's timestamp. SHAPED: EndsAt sits a plausible
// early-close span after OpenedAt and, being off Base's two-second block
// lattice, is no block's timestamp; and the Stake keeps a plausible
// magnitude with its low-order wei taken from the Id, so it matches no
// session's amount. The Provider is a generated EIP-55 address
// with no on-chain history. The aim throughout is the chain's own
// magnitudes and timing, memorialising nobody: every value is either
// derived from public chain data or generated, and none belongs to any
// real counterparty.
//
// TO RE-CHECK, with any public Base RPC:
//   1. eth_getBlockByNumber(50541654) -- its `hash` is Id below, and its
//      `timestamp` is OpenedAt.
//   2. eth_call getSession(<that hash>) must return EXACTLY what
//      getSession(<any random bytes32>) returns. Compare the two return
//      values; do NOT test for a non-zero byte, because the struct has a
//      dynamic member whose ABI offset word is non-zero even when the
//      session does not exist -- that test calls every id a hit.
//   3. Provider: eth_getCode / eth_getTransactionCount / eth_getBalance
//      are 0x, 0 and 0.
//   4. Stake == 229 * 10**18 + (int(Id[2:34], 16) % 10**18) -- the first 32
//      hex digits of the Id, taken as an integer mod 1e18, are its
//      low-order wei. That is the whole derivation. It is published here
//      in full because a shorter statement cannot be checked: the
//      relation needs all 32 hex digits.
const FIXTURE_SESSION = {
  Id: '0x039235b5abdc97bc4d2fdf5fb9c4ba23d1cd7d93445ca20ca13690e33ef57f0a',
  ModelName: 'arcee trinity',
  Stake: '229508381291933645347',
  OpenedAt: 1787872655,
  EndsAt: 1787873854,
  ClosedAt: 0,
  Provider: '0x8b4d29f1aE07C536Bb92D0A41cF7E3852AD6194c',
};

const at = Number(new URLSearchParams(location.search).get('at') || 1787872961);

// isClosed() and the confirm both read the wall clock. Freeze it rather than
// racing a real one: a money assertion that depends on how fast CI ran is not
// an assertion.
const RealDate = Date;
// eslint-disable-next-line no-global-assign
Date = class extends RealDate {
  constructor(...args) {
    if (args.length) return new RealDate(...args);
    return new RealDate(at * 1000);
  }
  static now() {
    return at * 1000;
  }
};

window.__closed = [];

createRoot(document.getElementById('root')).render(
  <ThemeProvider theme={theme}>
    <div style={{ height: '100vh', width: '420px' }}>
      <ChatHistory
        open
        sessions={[FIXTURE_SESSION]}
        models={[{ Id: '0xmodel', Name: 'arcee trinity' }]}
        chatData={[]}
        activeChat={null}
        onCloseSession={(id) => window.__closed.push(id)}
        onSelectChat={() => {}}
        refreshSessions={async () => {}}
        deleteHistory={() => {}}
        onChangeTitle={async () => {}}
      />
    </div>
  </ThemeProvider>,
);
