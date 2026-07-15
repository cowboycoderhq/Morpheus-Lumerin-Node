# PR2 verification

How the functional changes in this PR were verified. Four layers: an automated
kit you can run (`tools/ui-verify/`), adversarial code review, an on-chain
money-logic trace, and live manual testing of each user-facing flow. Every
commit also passes `typecheck` + `electron-vite build`.

## Run the automated kit

**Prerequisites.** Install the app's own dependencies first — `npm install` in
`ui-desktop/` — because the isolation cases mount *real* app components, which
resolve `styled-components` / `react` / etc. from `ui-desktop/node_modules`.
Anyone building or running the app already has this.

```
cd ui-desktop/tools/ui-verify
npm install
npx playwright install chromium   # one-time browser download, if not already present
npm run verify        # logic-checks + isolation cases
# or individually:
npm run logic         # pure-function assertions over the exported utils
npm run isolate       # Playwright renders each changed component and drives it
```

`npm run verify` exits non-zero if anything fails. Isolation screenshots land in
`shots/` (gitignored).

### `logic-checks.mjs` — 30 assertions over the exported substrate utils

Runs the real exported functions and asserts their behaviour:

- **`morToWei` / `weiToMor`** (`utils/marketplace.ts`) — precision-safe: rejects
  `> 18` fraction digits, survives integers `> 2^53` (no float rounding),
  round-trips MOR↔wei exactly.
- **`formatMor`** (`utils/coinValue.tsx`) — returns `null` on non-finite input,
  `'< 0.000001'` below threshold, magnitude-scaled precision otherwise (so a
  tiny real stake never prints as `0.00`).
- **`isSecureModel` / `SECURE_TAG`, `formatModelName`, `modelMatchesQuery`**
  (`chat/utils.js`) — TEE detection, display-name formatting, token-order-
  independent search.
- **`buildModelsWithBids`** (`store/queries.ts`) — skips local models, drops
  bids with no matching provider, attaches `ProviderData` (with a stub fetcher).

### `isolate/` — 3 component render-and-drive cases

Each mounts ONE real component in the app's own `ThemeProvider` with mock props
that force the target state (no backend/wallet needed), drives it with
Playwright, and asserts behaviour **and** that destructive handlers never fired
prematurely:

- **`sendform-confirm`** — the two-step send. First "Review send" shows the
  confirm panel (amount + full `toAddress` + irreversible-transfer warning) and
  the button becomes "Confirm & send"; asserts `onSubmit` fired **0×** before
  the explicit confirm.
- **`models-secure-badge`** — a TEE model renders the "Secure" pill, the raw
  `tee` tag is filtered out of the chip list, and names are formatted.
- **`login-reset-gate`** — the first "Or setup new wallet" press fires `logout`
  **0×** and reveals the Erase / Keep confirmation; cancel returns to initial.
  (Uses the additive `export { Login }` to mount the inner component without the
  redux HOC — no runtime behaviour change.)

## Money-logic trace (independently reviewed)

The chat session-pricing and affordability math was reviewed and unit-traced —
every quantity is **wei** — against the proxy-router structs and the Solidity
contracts, so the client-side guards mirror the chain:

- `balances.mor` (ERC20 `balanceOf`, serialized as a decimal wei string),
  `calculateStake(price, minutes)` (`price · minutes · 60 · supply/budget`), and
  `dearestBid · MIN_REQUEST_SECONDS` are all wei — the affordability comparison
  is meaningful (verified numerically + at the edges; no always-true/false).
- `activeSession.Stake` is the on-chain stake in wei (`session.go`), so
  `formatMor(Stake, 18)` is correct — replacing the old
  `(EndsAt-OpenedAt)·PricePerSecond` cost formula (the session cost, far smaller
  than the stake).
- `MIN_REQUEST_SECONDS = 360` clears `MIN_SESSION_DURATION = 300s`
  (`SessionStorage.sol`) after the contract's integer-truncating division, so a
  request no longer reverts with `SessionTooShort()` (`SessionRouter.sol`).
- The pre-send affordability check refuses an on-chain open the wallet can't
  cover (which would revert `ERC20: transfer amount exceeds balance`), and
  skips itself when the stake can't be priced yet (meta unloaded) so it can
  never false-block.

## Adversarial code review

Each slice, and the whole diff twice, was reviewed adversarially (pre-registered
falsifiers, attack the change). Findings were fixed before merge; final verdicts:

- Money surface (send): confirm flow safe, guard correct, no reskin leak.
- Chat money logic: **sound** — the wei trace above, no dev breakage.
- Session reopen + affordability guard: **sound** — happy path byte-identical,
  guards don't mis-gate (0 false-blocks over a 200k-point sweep).
- Whole diff (final): opsec-clean, no reskin bleed, cross-slice coherent, no
  stray files, typecheck green.

## Live manual testing (in the running app)

Each user-facing flow was exercised end-to-end:

- **Chat memory** — sent two turns; the second request carried the prior
  `[user, assistant]` exchange and the model recalled it.
- **Session reopen** — reopening a saved session no longer crashes; an
  unaffordable stake shows a clear message instead of an on-chain revert; when
  neither path is affordable, the "You'll need some MOR" screen with a Receive
  action appears.
- **Onboarding** — created and imported a wallet; back navigation works on every
  step (two-level in import); the finishing step shows a loading screen, not a
  blank page.
- **Wallet reset** — erasing the wallet returns to onboarding (in a packaged
  build via relaunch; in dev via window reload).
- **Models** — search filters the registry; TEE models show the Secure badge.

## Not covered here

The repo's legacy `src/**/__tests__/*.test.jsx` reference a removed test runner
(no jest config/deps/script remain), so they don't run; reviving that harness is
out of scope for this PR. This kit is self-contained and does not depend on it.
