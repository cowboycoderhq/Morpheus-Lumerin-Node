# Verify evidence — session-keepalive @ d6be874e

**Change:** keep-alive session length moves from fixed chips (Auto/30m/1h/2h/4h)
to a continuous slider stepped in whole blocks, plus a Seamless/Economy restake
mode. Block unit drops 360s → 305s. Includes fixes for two money defects an
adversarial review found in that work before it was committed.

## Gates (all from this staged state)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` (node + web) | **exit 0** |
| Build | `npm run build` | **exit 0**, `✓ built in 5.91s` |
| Frozen-value gate | `npm run frozen` | **exit 0** — `REACHABLE from the entry (0)`; 49 unreachable (pre-existing dead code) |
| Logic checks | `npm run logic` | **126 passed, 0 failed** (was 113 before this work) |
| Isolation cases | `npm run isolate` | **16 passed, 0 failed** |
| Full suite | `npm run verify` | **exit 0** |
| Prettier | `npx prettier --check` on changed renderer files | the one new offending line (`strideSeconds` ternary) fixed; the rest of the file's findings are pre-existing and were **not** rewritten — `--write` on these files would touch thousands of lines |

## Visual surface

`Chat.styles.tsx` adds `SessionLengthSlider` (`input[type=range]`, themed track +
`::-webkit-slider-thumb`, `:focus-visible` ring) and `SessionLengthValue`. Both
read every colour from `props.theme` (`brandTint`, `morMain`), which is why the
frozen gate stays at zero reachable findings. `Chat.tsx` swaps the five
`KeepAliveChip`s for slider + readout and adds a "Restaking" row.

## Defects found by review and fixed here

### 1. Economy under-reserved stake — funds loss

Economy reserved **1×** a block's stake, on the premise that
`REOPEN_DELAY_SEC = 12` is long enough for the previous block's stake to return.
It is not. Stake returns only on session close, and the closer is the router's
autoclose poll — `proxy-router/internal/blockchainapi/session_expiry_handler.go:139`,
`ticker := time.NewTicker(1 * time.Minute)` — so real latency is ~0–60s plus a
close-tx confirm. Reviewer's Monte-Carlo over ticker phase:
`P(stake returned before the last open retry) = 28.2%`; simulated survival was
**0–1 of 94 blocks**.

Failure it caused: user picks 2 blocks in Economy holding exactly 1× stake, the
gate passes, block 1 opens and drains the wallet, block 2 reverts, run ends ~5
minutes into an 8-hour session with MOR already spent — while the UI promised
*"just 1× a 5-minute stake, with a brief (~20-30s) gap."*

**Fix (interim):** `needsTwo = blockCount > 1` — Economy reserves 2× like
Seamless. Copy and chip label corrected (`Economy · 1× stake` →
`Economy · no overlap`); the helper text no longer claims a smaller balance
suffices. Economy still buys something real (two stakes are never locked at
once) but not a cheaper start. **The real fix — close each expired block from the
app and poll until the funds actually return — is deliberately deferred**, per
the operator's sequencing (multiple-sessions work comes first).

### 2. Block count mispriced the run — overspend

`blockCount = ceil(targetSec / MIN_REQUEST_SECONDS)` assumed blocks tile
end-to-end. They do not: seamless **overlaps** by `OVERLAP_SEC`, economy leaves a
`REOPEN_DELAY_SEC` gap. Reviewer measured against the real provider under a
virtual clock: slider at 2 blocks → **3 opens**; slider at max (94) → **103
opens**; economy at max → **91**. Since `blockCount` is what the affordability
gate prices, the preview understated true cost by **50% at 2 blocks** and ~10% at
max.

**Fix:** `strideSeconds()` + `blocksForDuration()` exported from
`KeepAliveProvider.tsx`, and the scheduler's stop condition changed from
`nowSec + MIN_REQUEST_SECONDS >= targetEndTime` to `endsAt >= targetEndTime`.
Neither alone is sufficient — the predicate fix without the count fix still
mis-prices. Verified the pair agrees at **every** slider position in both modes
(new logic checks below).

### 3. Float round-trip shifted the block count

`totalMinutes` was passed as `sec/60` and multiplied back by 60:
`(16165/60)*60 = 16165.000000000002`, shifting the count by one at one slider
position out of 94 (provider said 54, Chat said 53). **Fix:** the interface takes
`totalSeconds`; no round-trip.

### 4. Direct Pay safety was incidental, now structural

Review confirmed Direct Pay **cannot** currently collide with a rolling run — but
only because a render expression (`isCreateSessionMode`) happens to exclude it.
Nothing enforced it, and a refactor would silently retire the protection, letting
a direct-pay session be stomped by the next rotation's mirror effect (orphaning
spent MOR). Added `if (keepAlive.status?.running) return;` to `onOpenSession`,
matching the guard `startRolling` already had. Currently unreachable by design —
that is the point.

### 5. Comment typo in money math

`marketplace.ts:145` said `price * 315` where the constant below is `305`.

## Test expectations updated — and why that is not rubber-stamping

Seven checks failed on first run. They were correct about the **old** 360s
constant and wrong about the new 305s one, so expectations were re-derived from
the formula rather than pasted from failure output:

    minStake = price * MIN_SESSION_SECONDS * supply / budget / 1e18
    supply/budget = 1, MIN_SESSION_SECONDS = 305
    1e15 -> 0.305   2e15 -> 0.61   1e16 -> 3.05   ratio 1000x -> 305

The affordability **count** assertion (`covers 2 of 3 providers`) was re-checked,
not assumed: 1 MOR still clears 0.305 and 0.61 and still fails 3.05.

One assertion was first written as `min: 0.31 MOR` on a guess about rounding.
That guess was wrong — the component renders `0.305`. The value was read off the
DOM before setting the assertion, and the `model-picker` failure slice was
widened 300→1200 chars because the truncated message cut off the row under test.

## New mechanical guard

`blocksForDuration` and the scheduler's stop condition are twins; when they
disagree the gate quotes one number and the wallet pays another. That invariant
was previously held by nothing. Added logic checks that re-derive the count by
walking the scheduler's **actual** rule and assert agreement at every slider
position in both modes, plus regression pins for the three measured numbers
(3 / 103 / 91). 8 new checks, 113 → 126 total.

## Not verified / out of scope

- **No running-app observation.** Static + isolation-mounted only; `liveness.sh`
  was not run and there is no screenshot of the real Electron window. Slider feel
  under a live rolling session, and whether Economy's restake pause reads as a
  stall, are **unverified** and want a manual pass.
- **The revert that motivates fix #1 was not executed on-chain** — no chain
  available here. The *cadence* (1-minute autoclose ticker) is code-verified; the
  resulting revert is inferred from it.
- **Drift margin narrowed.** The 305s unit tolerates ~1.5% drift in the
  supply/budget figures the router caches for 55s before the on-chain duration
  lands under the 300s minimum and reverts; the old 360s unit tolerated ~16%.
  Truncation itself is fine (worst case 1s, and `floor(C/100)` rounds the safe
  way), but the 5s cushion is spent on drift too, which the comment does not say.
  Whether >1.5% of unclaimed compute balance is claimed inside a 55s window on
  live Arbitrum is **not determinable offline**.
- **`REOPEN_DELAY_SEC = 12` remains unjustified as a number.** It is now merely
  not load-bearing for funds, because Economy reserves 2×.
- The two `proxy-router` Go changes in the working tree are deliberately **not**
  in this commit.
