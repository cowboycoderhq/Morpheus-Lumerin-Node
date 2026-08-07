# Verify — session length set by stake amount, typed as scalar + unit

Branch `stake-duration` (off `parallel-sessions`) · staged diff `112587d8` · 2026-08-05

## What changed

Session length used to be a slider (305s–8h) driving a chain of 305-second on-chain
sessions ("rolling"). It is now **typed** — "1 day", "2 years" — and the length sets
the stake: the router derives the stake from the duration we open with.

The mechanism is one generalisation: `MIN_REQUEST_SECONDS` stopped being the block
unit and became a per-run `blockSeconds`. A session inside the chain's per-session
cap is therefore a **one-block run** — same bookkeeping, same Stop, no restaking.
Only a span longer than the cap chains cap-sized blocks.

## The constraint this design is built around (read live from Base)

Diamond `0x6aBE1d282f72B474E54527D93b979A4f64d3030a`:

- `getMaxSessionDuration()` = **604800 s = 7 days**. `SessionRouter.getSessionEnd`
  *clamps* to it, so stake buying more than 7 days buys nothing and stays locked.
  Owner-settable, hence read at runtime (`getMaxSessionSeconds`), never hardcoded.
- `MIN_SESSION_DURATION` = 300 s; the app opens at 305 s (truncation cushion).
- Stake is refundable collateral, not a fee: natural expiry returns it in full;
  early close holds only the *elapsed* portion ~24h.
- Required stake ≈ 337.6× the window's raw compute cost at today's numbers.

"2 years" therefore cannot be one session. Operator decision: ≤ cap = one
stake-direct session; > cap = chain cap-sized blocks, with the renewal mode shown
only when the plan actually renews.

## Verification

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run build` | ✓ built |
| `npm run logic` | **232 passed, 0 failed** |
| `npm run isolate` | **42 passed, 0 failed** |
| `npm run frozen` | 0 live findings (exit 0) |
| `npx eslint` (new files) | 0 errors; changed files at parity with base |

## Adversarial review — two rounds, both FAIL, both repaired

Round 1 found two HIGH money defects the then-green suite **structurally could not
see**: the session-length isolate cases stubbed the keep-alive context, so the loop
that actually spends MOR was never exercised for a typed length.

1. **Chained runs overshot by up to a full cap-block.** An 8-day ask kept MOR
   committed ~14 days; a 14-day ask bought *three* week-long stakes because a 25 s
   overlap remainder pulled in another whole block. Fix: `planBlocks` cuts the last
   block to the remainder and **drops** a remainder shorter than the contract
   minimum. Measured worst-case overshoot: **0 s** at the 7-day unit across every
   whole day from the cap to two years; **8 s** at the 305 s unit (the close-buffer
   floor). Bound asserted: under one contract minimum.
2. **A "one stake" session could silently open a second full-length stake.**
   `scheduleNext` compared a *chain* `EndsAt` against a *locally* computed
   `targetEndTime`; skew, mining latency or truncation made a 1-day session open a
   second 86.40 MOR stake. Fix: a hard block-**count** cap, re-checked at spend time.

Also from round 1: false "Stakes about 0 MOR" quote before pricing loaded;
self-contradicting copy about how much is staked at once; a stale `max: … for a day`
line; `getMaxSessionSeconds` accepting a uint128-max read (which would have become
both an unbounded stake and a 1 ms `setTimeout` loop — now band-checked to
[300 s, 30 days], with `armTimer` chunking below the 32-bit ceiling);
`parseDuration` returning `ok` with 0 seconds; toast grammar.

Round 2 confirmed the money-critical repairs hold (84 simulated scenarios, 0
over-opens with the cap, unbounded runaway without it) and found:

3. **A 304-second window just past the cap** where the UI asked "longer than one
   session?" instead of "does it renew?" — offering a renewal mode for a plan with
   no renewals and demanding twice the stake, turning away solvent users. Every
   renewal decision now reads `sessionBlockCount > 1`.
4. **The length echo silently truncated** up to 24 h. `formatDurationLong` is now
   exact, pinned by a read-back check.

Round 2's blocker was a staging hazard: the index held the pre-fix snapshot and the
new test was untracked, so a plain commit would have shipped the failed review
without the tests that catch it. Everything is staged now and the index was verified
to hold the fixed code.

## Operator-reported UI defects, fixed after live testing

5. **The completion menu could not be themed.** A native `<datalist>` is drawn by
   browser chrome — it dropped a stock OS list into a themed money surface and gave
   no hook for keyboard completion. Replaced with a themed menu; **Tab finishes the
   unit**, arrows navigate, Escape restores Tab's normal meaning.
6. **Accent colour on input text.** The brand cyan sat on glyphs the user is
   actively typing and re-reading. Input, echo and menu selection now use plain
   text colours, with selection carried by a background wash.
7. **The page moved while typing.** Four causes, all measured: the parsed-length
   echo mounted/unmounted; the note swapped between one and three lines; the
   per-provider stake figures changed width and re-wrapped the chip row *above* the
   field; and the affordability notice popped in and out. All space-reserved.
8. **The card was vertically centred**, so crossing into a chained plan (which
   legitimately needs more text) dragged the field out from under the cursor.
   Top-anchored now: growth only pushes downward.

## Mutation-tested, not merely green

Every layout and money claim above was verified by reverting the fix and confirming
the test fails:

| Reverted fix | Observed failure |
|---|---|
| block-count cap | `a 1-day session opened 2 stakes` (2 × 86400 s) |
| remainder sizing | `the LAST block was a full 604800s cap-block` |
| reserved echo / note height | page moved **9.8px** per keystroke |
| reserved affordability notice | page moved **32.1px** |
| top-anchored card | field moved **53.2px** crossing the cap |

One earlier version of the affordability-notice check was **vacuous** — written
against a single-provider fixture where "covers N of M" can never fire. The mutation
test is what exposed it: the fix was reverted and the test still passed. It was
rebuilt against the three-provider fixture and now carries an explicit assertion
that the boundary was actually crossed.

## Visual scope

`Chat.styles.tsx`: slider replaced by a themed input, completion menu, reserved
notice slots, fixed-width chip stake figures, and a top-anchored intro container.
All colour derives from `props.theme`; `npm run frozen` reports 0 live findings.
Money-surface invariant respected: solid fill, no glass or glow, warnings carried by
text with colour only reinforcing.

**One deliberate visual change beyond the feature:** `ChatIntroContainer` is no
longer vertically centred. A short intro card (single-session, or "You'll need some
MOR") now sits at the top with padding rather than floating centred. This is the fix
for defect 8 and is visible on every intro state, not only the session-length one.

## NOT verified here — deliberately

**No live on-chain run.** Exercising this against the real router opens real sessions
and stakes real MOR on Base. The isolate suite mounts the real components and the
real keep-alive loop, so the logic is exercised; what remains unproven is the
round-trip against a live provider and live marketplace meta. The app was driven
interactively on the operator's real profile for UI review only — no session opened.

Known and accepted: `"5M"` parses as five *minutes*, not the ISO-8601 reading of
months. It errs toward under-buying, the field echoes "5 minutes" back, and "1M"
fails closed against the 5-minute floor. Documented in `duration.ts`.

`cannotPayAtAll` was changed to ask about the shortest session rather than the typed
length. This is **defensive, not a repair** — the panel swap it guards against is not
reachable by typing, because Direct Pay's cost does not vary with the typed length.
