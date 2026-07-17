# verify: early-close warning, stake auto-claim, Help menu, staking URL — 2026-07-17

Branch `staking-affordability-pr3`. Four operator-requested changes, all
downstream of one real incident: on 2026-07-16 the operator closed a 6-minute
session at 3 minutes and ~2.7 MOR became unreachable, silently.

Crosses the plumbing boundary (`store/hocs`, `proxy-router`) — retired for this
line per the operator (2026-07-16); this is money work by request, not a reskin.

## The incident, established from the chain (not inferred)

`getSession(0xc78d14…)` on Base 8453 via the repo's own SessionRouter bindings:

```
stake                  : 5.360550 MOR   openedAt/endsAt: 359s intended
closedAt               : 180s in  -> CLOSED EARLY: true
providerWithdrawnAmount: 0.008333 MOR   (the compute cost under a cent)
getUserStakesOnHold    : available 0.000000 | hold 3.566002 MOR
```

Router log: `POST /blockchain/sessions/0xc78d14…/close [200]` — an explicit close
from the app, not the background auto-closer. **Nothing was spent or slashed.**
`SessionRouter._rewardUserAfterClose` locks the used-duration share for a day
when `closedAt < endsAt`, and returns the rest; closing late locks nothing.
`withdrawUserStakes` **skips** unmatured entries, so no early exit exists at any
layer — the lock is the contract's, and only the *reaching* of it was fixable.

**Not caused by the affordability work**: that changes provider matching, the
gate, and duration sizing. Close/payout is untouched by it, and the session used
the 360s contract floor the old code would also have produced.

## 1 — Close now states what it locks (`ChatHistory`, `utils/marketplace.ts`)

Close was **one click, no confirm**. It is now two-step and names the figure:
*"Closing now locks 2.6877 MOR until Fri 7:00 PM. You get 2.6728 MOR back right
away — nothing is lost… Wait until Fri 4:31 PM and the session closes itself with
nothing locked."*

The math is an exported util (`earlyCloseLock`) so `logic-checks` can test it
directly rather than only through a render. **Why proportional and when exact:**
the lock is `stipendToStake(userDuration × price)` and the stake was the same
conversion over the full duration — `stipendToStake` is linear, so the ratio
cancels and `lock/stake == userDuration/fullDuration` **exactly**, provided the
ratio is unchanged between open and close. It is fixed per UTC day, so same-day
sessions are exact; one straddling UTC midnight is an estimate, and both that and
the `max(openedAt, startOfDay)` clamp push the real lock DOWN — the figure is a
conservative ceiling, never an under-promise. Deliberately not an `eth_call`: a
warning that must await the chain is a warning that is sometimes absent when the
button is pressed.

Anchored to the real session: predicted **2.6877 locked / 2.6728 returned** vs the
operator's reported ~2.7 back.

## 2 — Stake auto-claim (`stake_claimer.go`, registry, service, endpoint, tile)

The Diamond always had `getUserStakesOnHold`/`withdrawUserStakes`; nothing called
them, so the money was invisible AND unreachable (CLAUDE.md open item 2). Now:

- `StakeClaimer` — a ticker job (10 min, plus once at start) modelled on the
  existing `SessionExpiryHandler`; claims as soon as `available > 0`.
- `GET /blockchain/stakes/on-hold` → `{available, hold}`.
- Dashboard tile "On Hold (returns automatically)", rendered **only when
  non-zero**, next to Staked Balance — the tile a user stares at when MOR seems
  gone. Returns `null` (no tile) when the read FAILS: "could not ask" and "you
  have nothing" are different answers, and a fake 0 would repeat the original bug.

**Safety:** `withdrawUserStakes(user_, …)` transfers to `user_` only, and we pass
our own address — the job cannot send funds anywhere but home; its blast radius
is gas. It refuses to send when nothing has matured (an on-chain no-op would burn
a fee and report success while returning nothing).

## 3 — Help offers a choice (`SecondaryNav`, `client/index.ts`)

Help went straight to the docs. It now opens a two-item menu (Discord /
Documentation), dismissable on outside-click and Escape.

**The Discord URL was previously shipped as UNVERIFIED** ("mor.org blocks
automated fetches (429)… Confirm before shipping"). Now confirmed without
mor.org, by a chain that ends at a guild ID:

1. this repo's own docs cite the Morpheus Discord as guild **1151741790408429580**;
2. three first-party MorpheusAIs repos (MySuperAgent, morpheus-stats-frontend,
   pwa) all use `discord.gg/Dc26EFb6JK`;
3. Discord's public invite API resolves `Dc26EFb6JK` → guild
   **1151741790408429580**, `expires_at: null`.

A web search proposed a *different* invite code; several unrelated projects are
called "Morpheus", which is why this is pinned to the guild ID and not a search
result. The dead `onHelpLinkClick` is removed rather than left dangling.

## 4 — Staking Dashboard URL (`Dashboard.jsx`, `client/index.ts`)

Pointed at the legacy Lumerin host `staking.mor.lumerin.io`; now
`dashboard.mor.org` (`STAKING_DASHBOARD_URL`). The tile's visible subtitle
hardcoded the stale hostname as a separate literal from the href — which is how
it went stale unnoticed — so both moved together.

## Evidence: 9 mutations, 9 caught

Mutations reverted **from a scratchpad backup, never `git checkout --`** (this
code was uncommitted; a git revert destroys it).

| # | mutation | caught by |
|---|---|---|
| 1 | `earlyCloseLock` never reports a lock | logic ×4 |
| 2 | treat closing AT `endsAt` as early (off-by-one) | logic ×2 |
| 3 | lock the entire stake (over-warn) | logic ×4 |
| 4 | unlock time off by a day | logic ×1 |
| 5 | invent a figure for an unpriceable session | logic ×1 |
| 6 | **Close closes on the first click (THE original bug)** | `close-session-warns` |
| 7 | Cancel still closes the session | `close-session-warns` |
| 8 | Discord choice opens the docs instead | `shell-sidebar` |
| 9 | Help fires a link when merely opening the menu | `shell-sidebar` |

`shell-sidebar` **failed first, correctly**: it pinned PR3's deliberate choice
*not* to adopt crypto-version's Help menu ("if the rename ever leaks in, this goes
to 0"). That decision was reversed by the operator, so the case was updated to the
new contract rather than deleted — and it now asserts more than it did (opening
the menu opens nothing; each choice opens only its own target; Escape dismisses).

## Gates

| gate | result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `node frozen-values.mjs` | exit 0, 0 reachable |
| `vite-node logic-checks.mjs` | **46 passed, 0 failed** (30 → 46) |
| `node run.mjs` (isolate) | **14 passed, 0 failed** (12 → 14) |
| `go build ./...` | exit 0 |
| `go vet` (touched pkgs) | exit 0 — no finding in any file I touched |
| `go test -run TestComputeSessionTokenAmount` | PASS |
| lint (touched files) | +29, **all house-style** (`explicit-function-return-type`, `prop-types`, `no-explicit-any`, prettier — each already fires heavily in these files). `no-unused-vars` identical to base (5=5). `marketplace.ts`: 0 → 0. |

`go vet ./internal/...` exits 1 on **base and branch identically** (pre-existing:
`ipfs_manager.go`, `auth.go`, `keychain_test.go`, aiengine).

## Still not proven — read before trusting this

- **The auto-claimer has never run against a chain.** It compiles, vets, and its
  logic is a copy of a shipped job's shape, but **no test executes `claimOnce`** —
  there is no fake for the blockchain service, and I did not build one. Its first
  real exercise will be the operator's own wallet at ~19:00 CDT 2026-07-17, when
  3.566002 MOR matures. **Watch the router log for `STAKE_CLAIMER`.** If it is
  wrong, the failure mode is a wasted gas fee or a claim that does not happen —
  not lost funds (the contract only ever pays `user_`).
- **No test pins the `/blockchain/stakes/on-hold` endpoint or the Dashboard tile.**
  Both are unexercised code paths; the tile is not in any isolate case.
- **No test pins the Staking Dashboard tile.** The URL constant changed and the
  subtitle with it, but nothing asserts the tile's visible host equals the host it
  opens — the exact drift that caused this bug. A Dashboard isolate case is the
  fix and is not built.
- The `earlyCloseLock` figure is exact only within a UTC day (see above). No test
  covers a session straddling UTC midnight.
- The Help menu is not keyboard-navigable between items (arrow keys); it opens on
  click and closes on Escape/outside-click, but `HelpLink` remains a `<span>`.
