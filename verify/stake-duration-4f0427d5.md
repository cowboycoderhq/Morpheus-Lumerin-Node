# Verify — session length set by stake, typed as scalar + unit (+ Chat load time)

Branch `stake-duration` (off `parallel-sessions`) · staged diff `4f0427d5` · 2026-08-06

## What changed

Two things, in one branch:

1. **Session length is typed and set by the stake.** The slider (305s–8h, driving a
   chain of 305-second sessions) is gone. The user types "1 day" / "2 years" and
   that length sets the stake — the router derives the stake from the duration we
   open with. `MIN_REQUEST_SECONDS` stopped being the block unit and became a
   per-run `blockSeconds`, so a session inside the chain's cap is a **one-block
   run**; only a longer span chains cap-sized blocks.
2. **The Chat screen's load time**, which was 20–30 seconds.

## Chain facts this is built on (read live from Base)

Diamond `0x6aBE1d282f72B474E54527D93b979A4f64d3030a`:

- `getMaxSessionDuration()` = **604800 s = 7 days**, and `getSessionEnd` *clamps*
  to it — stake buying more buys nothing and stays locked. Owner-settable, so it
  is read at runtime, never hardcoded.
- `MIN_SESSION_DURATION` = 300 s; the app opens at 305 s (truncation cushion).
- Stake is refundable collateral: natural expiry returns it in full; early close
  holds only the *elapsed* portion ~24h.
- `order=desc` on `/blockchain/sessions/user` reverses the on-chain append order
  → pages arrive newest-**opened** first. The live-window bound depends on this.
- `limit` binds as a Go `uint8`: 255 is the ceiling, and it **wraps** rather than
  erroring above it.

## Verification

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run build` | ✓ built |
| `npm run logic` | **255 passed, 0 failed** |
| `npm run isolate` | **42 passed, 0 failed** |
| `npm run frozen` | 0 live findings (exit 0) |

## Adversarial review — two rounds, both FAIL, both repaired

Round 1 found two HIGH money defects the then-green suite **structurally could not
see**: the session-length isolate cases stubbed the keep-alive context, so the loop
that actually spends MOR was never exercised.

1. **Chained runs overshot by up to a full cap-block** — an 8-day ask kept MOR
   committed ~14 days. Fixed with `planBlocks`, which cuts the last block to the
   remainder and drops a remainder below the contract minimum. Worst-case overshoot
   now **0 s** at the 7-day unit, **8 s** at the 305 s unit.
2. **A "one stake" session could open a second full-length stake** — `scheduleNext`
   compared a *chain* `EndsAt` against a *local* `targetEndTime`. Fixed with a hard
   block-**count** cap, re-checked at spend time.

Round 2 confirmed those hold (84 simulated scenarios, 0 over-opens) and found a
**304-second window** just past the cap where the UI asked "longer than one
session?" instead of "does it renew?", plus a length echo that silently truncated
up to 24 h. Both fixed.

Round 2's blocker was a staging hazard: the index held the pre-fix snapshot and the
new test was untracked, so a plain commit would have shipped the failed review
without the tests that catch it.

## Operator-reported defects, fixed after live testing

- **The completion menu could not be themed** — a native `<datalist>` is browser
  chrome. Replaced with a themed menu; **Tab finishes the unit**, Escape restores
  Tab's normal meaning.
- **Accent colour on input text** — the brand cyan sat on glyphs being typed.
  Input, echo and menu selection now use plain text colours.
- **The page moved while typing** — four causes, all space-reserved.
- **The card was vertically centred**, so crossing into a chained plan dragged the
  field out from under the cursor. Top-anchored now.

## The Chat load: measured, not inferred

Three fixes were shipped against "slow Chat tab" before it was measured. Two were
real but **not** the dominant cost. Recording that, because the sequence is the
lesson:

| Fix | Real? | Was it the 20–30s? |
|---|---|---|
| Bounded the unbounded session-history walk | yes | no |
| Boot prefetch never ran (fired before the router was up) | yes | no |
| Registry snapshot (`/blockchain/models`, 10.5s → 1.3s) | yes | partly |
| **Batched/concurrent session paging** | yes | **yes** |

The instrument that settled it was a temporary renderer-timing probe (since
removed), which produced:

```
[perf] maxSession:      +694ms
[perf] modelsData:     +1353ms   ← registry snapshot working
[perf] modelsWithBids: +7940ms   (background)
[perf] liveSessions:  +19763ms   ← THE BLOCKER
[perf] initialized:   +19844ms   ← spinner clears here
[perf] availability:  +22016ms   (background)
```

**The time bound was sound but useless on real data.** It stops when a page predates
`now − cap×2` — and all ~1450 of the operator's sessions were opened within two
weeks by rolling-session testing, so it walked every one, serially, 50 at a time.
Fixed by making the walk **concurrent** (8 pages per round) with **200-per-page**
(under the uint8 ceiling): 29 serial round trips → 1. The time bound stays; it is
what protects a history spanning years, and a straggler past one cap is still
caught by the safety factor.

Router-side timings that informed this (operator-run, no credentials handled):

```
/v1/models                     0.00s      one provider's active bids   0.51s
/blockchain/models             5.52s      3 providers in SERIES        2.24s
/blockchain/providers          1.04s      all 33 in PARALLEL           3.47s
/blockchain/sessions/budget    0.13s      sessions page (limit 50)     0.68s
/blockchain/token/supply       0.16s
```

The 33-in-parallel figure is what justifies concurrent paging: the router costs
~6.8× one request for 33, not 33×.

## Mutation-tested, not merely green

Every load-bearing claim was verified by reverting the fix and confirming failure:

| Reverted fix | Observed failure |
|---|---|
| block-count cap | `a 1-day session opened 2 stakes` (2 × 86400 s) |
| remainder sizing | `the LAST block was a full 604800s cap-block` |
| reserved echo / note height | page moved **9.8px** per keystroke |
| reserved affordability notice | page moved **32.1px** |
| top-anchored card | field moved **53.2px** crossing the cap |
| live-window safety factor | still-open straggler missed |
| registry snapshot | registry awaited instead of served from disk |

**Two checks were vacuous when first written** and only the mutation step exposed
them: the affordability-notice layout check used a single-provider fixture where the
notice can never fire, and the safety-factor check put the straggler on a page both
bounds fetch. Both were rebuilt against fixtures that discriminate, and each now
carries an explicit assertion that the condition under test was actually reached.

## Caching policy — deliberately narrow

Only the **model registry** is snapshot to disk (static; ids and names), with a
10-minute ceiling. Balances, budget and supply are live on every call, with a check
pinning that the balance is never served from the snapshot — a stale balance on the
screen that decides what you can afford to stake is exactly the caching that costs
someone money.

## Visual scope

`Chat.styles.tsx`: slider → themed input + completion menu, reserved notice slots,
fixed-width chip stake figures, top-anchored intro container. All colour derives
from `props.theme`; `npm run frozen` reports 0 live findings.

**One visual change beyond the feature:** `ChatIntroContainer` is no longer
vertically centred — a short intro card now sits at the top with padding. This is
the fix for the typing-jerk and is visible on every intro state.

## NOT verified here — deliberately

**No live on-chain run.** Exercising this against the real router opens real sessions
and stakes real MOR. The isolate suite mounts the real components and the real
keep-alive loop; what remains unproven is the round-trip against a live provider.

**No temporary diagnostics remain** — the renderer perf probe and the main-process
console forwarder were both removed and verified absent by grep before this build.

Known and accepted: `"5M"` parses as five *minutes*, not ISO-8601 months (errs
toward under-buying; `"1M"` fails closed). `cannotPayAtAll` now asks about the
shortest session rather than the typed length — **defensive, not a repair**; the
panel swap it guards against is not reachable by typing.

**`/blockchain/models` at 5–10s is worked around, not fixed.** The snapshot hides it
after first launch. The underlying router-side cost is a proxy-router concern in a
different tree.
