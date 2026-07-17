# verify: the On Hold tile now says WHEN it returns — 2026-07-17

Branch `staking-affordability-pr3`. Follow-up to the auto-claim work: the tile
said "returns automatically" but never *when*. It now names the release time.

## The constraint that shaped this

`getUserStakesOnHold` returns aggregate amounts (`available`/`hold`) and throws
the per-entry `releaseAt` away — and there is **no contract getter for the raw
`OnHold` array** (confirmed: `SessionRouter.sol` only reads it internally). So the
release time cannot come from the on-hold endpoint.

It is derivable, though: an early close pushes `OnHold(amount,
startOfDay(closedAt) + 1 day)`, and the session list carries `ClosedAt`. So the
release time is the **same formula** as an early close's `unlockAt`, applied to
sessions already closed. The Dashboard already fetches the user's sessions (it
computes staked balance from them), and that fetch pages **to exhaustion**
(`apiCallsHelper`), so it sees every session — held stake only comes from closes
within the last ~day, well inside the list.

## What changed

`nextStakeReleaseAt(sessions, nowSec)` (new, in `marketplace.ts`): the earliest
release still in the **future** across all sessions, or `null`. Excludes:
- open sessions (`ClosedAt == 0`) — nothing on hold;
- late closes (`ClosedAt >= EndsAt`) — the contract locks nothing;
- already-matured entries (`releaseAt <= now`) — the auto-claimer sweeps those
  within minutes, so they are "returning now", not a future date.

The tile reads it and shows a sub-line:
- future release → **"Returns Sat, Jul 18 7:00 PM, automatically"**
- on hold but nothing pending (all matured, being swept) → **"Returning to your
  wallet now"**
- `onHoldMor` null (endpoint unreachable) → no tile at all, unchanged.

Also: `earlyCloseLock` and `nextStakeReleaseAt` now take a narrow `SessionLike`
type instead of `any`, taking `marketplace.ts` back to **0 lint problems**. (The
earlier evidence file reported marketplace.ts as lint-clean; that was a
measurement slip — `earlyCloseLock(session: any)` had carried one
`no-explicit-any` since it landed. Both are gone now.)

## Evidence: 11 new logic checks, anchored to the real session

The same session throughout: closed `1784262509`, so its lock releases at
`startOfDay(1784262509) + 1 day = 1784332800` (2026-07-18 00:00 UTC = 7:00 PM
CDT). Checks cover: the real release time; that standing *after* it yields `null`
(matured, not a stale past date); at-the-second boundary; late closes and open
sessions producing no date; earliest-wins across multiple sessions; matured
entries not becoming "next"; and junk inputs never throwing. **57 passed, 0
failed** (was 46).

### Mutation: 4 caught, 1 provably equivalent

| mutation | result |
|---|---|
| count already-matured releases as "next" | ✗ caught (×3) |
| release without the +1 day | ✗ caught (×2) |
| count late closes as held | ✗ caught (×2) |
| pick the latest release instead of the earliest | ✗ caught |
| remove the open-session (`ClosedAt<=0`) guard | **not caught — equivalent mutant** |

The last is not a test gap. A `ClosedAt == 0` session yields `releaseAt =
startOfDay(0) + 1 day = 86400` (1970-01-02), which is `<= now` for every real
clock, so the matured-guard downstream already filters it. Proven by exhaustive
scan over `now ∈ [86400, 2e9)`: **0 inputs** where removing the guard changes the
output. The guard is kept for intent, but nothing behavioural can distinguish it.

## Gates

| gate | result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `node frozen-values.mjs` | exit 0 |
| `vite-node logic-checks.mjs` | **57 passed, 0 failed** |
| `node run.mjs` (isolate) | 14 passed, 0 failed |
| lint (touched) | `marketplace.ts` **0 → 0** (the `any`s are gone); `Dashboard.jsx` +2, house-style |

## Still not proven

- **The tile's rendered output is pinned by no test.** The math is covered
  exhaustively by logic-checks + mutation, but no isolate case mounts the
  Dashboard and asserts the sub-line — the Dashboard is heavy to mount, and this
  carries forward the same gap the prior evidence flagged for the on-hold tile.
  The copy strings ("Returns …, automatically" / "Returning to your wallet now")
  are unverified against a render.
- **Verified live on the running app: not yet.** The endpoint + auto-claimer are
  confirmed running (`STAKE_CLAIMER` reads 3.566 MOR held), but this build with
  the release-time sub-line has not been relaunched. The real release is ~19:00
  CDT today; the tile should read that until then, and flip to "Returning … now"
  as the auto-claimer sweeps.
- Split holds (some matured, some future) show one amount and the *next* time;
  the matured slice actually returns sooner. Honest simplification, not pinned.
