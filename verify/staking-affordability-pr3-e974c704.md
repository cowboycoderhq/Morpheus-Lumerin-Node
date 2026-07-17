# verify: On Hold tile handles MULTIPLE release times — 2026-07-17

Branch `staking-affordability-pr3`. Fixes a real defect the previous version
shipped: when on-hold MOR came from several early closes on different UTC days, it
freed on different days, but the tile showed the TOTAL amount at only the EARLIEST
time — over-promising what returns first. Flagged as an open gap in the prior
evidence (`…-cfb14585.md`), now closed.

## The fix

`stakeReleaseSchedule(sessions, nowSec)` (new): the per-day release schedule —
`[{releaseAt, lockedWei}]`, future only, earliest first. Built on `earlyCloseLock`,
which already prices a single close: a session's historical lock and unlock time
are exactly `earlyCloseLock(session, session.ClosedAt)`, so sessions closed on
different UTC days group into different tranches. `nextStakeReleaseAt` is now a thin
read over `schedule[0]` — one source of truth for the release math.

**Why the amount source is split** (the subtle correctness point): matured stake
comes from the endpoint's `available` (authoritative — the contract POPS an entry
when the auto-claimer sweeps it, so a swept entry still looks locked in the session
list and sessions would overcount). Future tranches come from sessions (never
popped yet, so their derived amounts still match the chain). Composing endpoint-
available + session-future is what makes the lines sum to the on-hold total without
double-counting.

The tile:
- **one release** → "Returns Sat, Jul 18 7:00 PM, automatically" (unchanged);
- **matured, being swept** → "Returning to your wallet now";
- **several** → "Returns in parts, automatically:" then a line per chunk —
  `1.5000 MOR — Sat, Jul 18 7:00 PM` / `2.0660 MOR — Sun, Jul 19 7:00 PM`, with a
  matured chunk shown as `— now`.

## Evidence: 73 logic checks (was 57), all anchored or arithmetic

New `stakeReleaseSchedule` checks: same-day closes **collapse to one tranche and
sum** (500+400=900); different-day closes make **two tranches, earliest-first**;
each tranche carries **its own amount**; matured tranches drop out; the real
session yields one tranche whose amount equals `earlyCloseLock` (2.6877 MOR);
`nextStakeReleaseAt == schedule[0]`; junk never throws. Every prior release-time
and lock check still passes on the refactored code.

### Mutation: 5 of 5 caught

| mutation | caught by |
|---|---|
| each session its own tranche (no grouping by day) | same-day-collapse + real-session ✗ |
| same-day overwrites instead of summing | "sums the locks (500+400=900)" ✗ |
| sort latest-first instead of earliest | 4 ordering checks ✗ |
| include matured tranches | 4 matured-exclusion checks ✗ |
| include late/zero-lock closes | 2 late-close checks ✗ |

## Gates

| gate | result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `node frozen-values.mjs` | exit 0 |
| `vite-node logic-checks.mjs` | **73 passed, 0 failed** |
| `node run.mjs` (isolate) | 14 passed, 0 failed |
| lint (touched) | `marketplace.ts` **0 → 0**; `Dashboard.jsx` +2 house-style |

## Still not proven

- **No isolate case pins the rendered tile** — single OR multi-line. The schedule
  math is exhaustively covered by logic-checks + mutation, but nothing mounts the
  Dashboard and asserts that two tranches render as two lines. Same standing gap as
  the on-hold tile has had since it landed; the multi-line branch in particular has
  never been seen rendered.
- **Never observed live with multiple tranches.** The operator's real wallet
  currently has a single-day hold (3.566 MOR, one release), so the multi-line path
  has no live witness. It would need two early closes on two UTC days to exercise.
- `nextStakeReleaseAt` is now app-unused (only the tests call it); kept as a tested
  public helper over the schedule, not dead-removed.
- Straddle-midnight tranche amounts remain conservative ceilings (per
  `earlyCloseLock`), and endpoint-`available` vs session-future reconciliation is
  argued, not asserted against a live split.
