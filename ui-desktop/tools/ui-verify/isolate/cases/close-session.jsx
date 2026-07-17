import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'styled-components';
import theme from '../../../../src/renderer/src/ui/theme';
import { ChatHistory } from '../../../../src/renderer/src/components/chat/ChatHistory';

// The Close button, on the real ChatHistory.
//
// Closing a session EARLY does not spend the stake — it time-locks part of it
// for a day (SessionRouter._rewardUserAfterClose). Close used to be ONE click
// with no warning, and a real user closed a 6-minute session at 3 minutes and
// watched ~2.7 MOR go unreachable for 24h (session 0xc78d14…, 2026-07-16).
//
// The fixture IS that session, to the wei: stake 5.360550 MOR, opened 1784262329,
// ends 1784262688 (359s). `?at=` sets the clock, so the case can stand at a
// chosen moment inside or past the session:
//   at=1784262509  -> 180s in, the operator's real close  -> locks 2.6877 MOR
//   at=1784262688  -> exactly endsAt                      -> locks nothing
const REAL_SESSION = {
  Id: '0xc78d14e43e9802cd063f32b0513a3e5049c5f0c8d5ab190636e18b661bf63796',
  ModelName: 'arcee trinity',
  Stake: '5360549929977675947',
  OpenedAt: 1784262329,
  EndsAt: 1784262688,
  ClosedAt: 0,
  Provider: '0xB399E0009784bf0eb871e946643c92dC1055E362',
};

const at = Number(new URLSearchParams(location.search).get('at') || 1784262509);

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
        sessions={[REAL_SESSION]}
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
