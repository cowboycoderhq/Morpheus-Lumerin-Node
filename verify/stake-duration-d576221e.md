# Verify — the stake lock is on every close, not just early ones

Branch `stake-duration` · staged diff `d576221e` · 2026-08-07

## What this changes and why

The operator reported that staked MOR is "locked until the end of the day". The
codebase said the opposite, in a comment that showed its work: a transcription of
`SessionRouter._rewardUserAfterClose` proving that a close at or after `endsAt`
takes the `isClosingLate_` branch, skips the `userStakesOnHold` push, and returns
the stake in full. The vendored contract in `smart-contracts/` confirmed it.

**The vendored contract is from 2024-12-10 and the Diamond is upgradeable.** It
does not describe what is deployed. The operator was right, and the false premise
had spread into a restake mode's pricing, an affordability gate, a Close-session
warning, the On Hold release schedule, and five comment blocks.

## Measured on Base mainnet — public session data only, no operator credentials

Diamond `0x6aBE1d282f72B474E54527D93b979A4f64d3030a`, via `mainnet.base.org`.
Method: for each recent `SessionClosed`, read the session, keep non-direct-pay
closes, then compare the `Transfer(Diamond → user)` in that same transaction
against `session.stake`, and read `getUserStakesOnHold` at the block before and
the block of the close.

**Same-UTC-day close, session run to its end** (2026-08-06):

| | |
|---|---|
| stake | 28.1569 MOR |
| closed | 3s and 31s **after** `endsAt` |
| returned in the closing tx | 0.0156 MOR (0.06%) |
| withheld | 28.1413 MOR |
| on-hold delta at that block | **+28.1413 MOR — exact, to the wei, on both** |

Four further late closes across three other wallets: 0.05–0.08% returned.

**Next-UTC-day close** (2026-08-07) — three sessions that ended
`2026-08-06T04:14Z` and were closed `2026-08-07T00:08Z`:

| | |
|---|---|
| stake | 50000.0000 MOR |
| returned | **50000.0000 MOR — in full** |
| on-hold delta | 0 |

They did **not** revert, which also rules out the arithmetic underflow the
vendored expression would suffer without its guard.

## The rule that explains both

The lock covers the part of the session lying inside **the UTC day the close
lands in**, released at `startOfDay(closedAt) + 1 day`:

```
locked ≈ stake × (min(endsAt, closedAt) − max(openedAt, startOfDay(closedAt)))
                 ────────────────────────────────────────────────────────────
                                  endsAt − openedAt
```

Run it to the end and close the same day → the whole session is in that day →
~everything locked. Close it half way → half. Close it the next day → none of the
session is in the closing day → full refund. There is no `isClosingLate_`
exemption. `earlyCloseLock`'s existing arithmetic already implemented this; the
bug was a short-circuit above it asserting that a late close locks nothing.

The proxy-router's `StakeClaimer` (`stake_claimer.go`, wired at
`proxyctl.go:238`) sweeps matured holds on a 10-minute ticker, so "returns
automatically" is accurate.

## What was wrong, and is now fixed

| Defect | Consequence |
|---|---|
| `committedOverlapWei` skipped sequential runs ("they recycle") | gate approved runs the wallet cannot fund |
| `needsTwo = blockCount > 1 && overlap` | sequential renewals priced at half their cost |
| flat 2× peak | under-reserves 13× if the owner sets the chain cap to 1 hour |
| reserve charged runs with **no blocks left** | every ordinary (one-block) session made the next one demand double, and the refusal named MOR that run would never ask for |
| close panel: *"Wait until X and the session closes itself with nothing locked"* | advised a strategy that locks **more** |
| disclosure: stakes *"ACCUMULATE across renewals"* | read as 105× a block's stake for a 2-year plan; the gate 30 lines away charged 2× |
| chips *"Seamless · 2× stake" / "Economy · 1× stake"* | priced a saving that does not exist, contradicting the sentence beneath them |
| `stakeReleaseSchedule` gated on `isEarly` | On Hold tile had no clock for naturally-expired blocks |
| `waitForStakeReturn` | never measured a stake return; renamed `waitForClose`, behaviour byte-identical |
| five comment blocks | still asserted the falsified premise in the files the fix touched |

Sequential mode was **kept and repriced**, not deleted: repricing is reversible,
and avoiding an overlap is still a real reason to choose it. The chips now name
the only difference that exists — `Seamless · no pause` / `Sequential · brief gap`.

## Verification

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run build` | ✓ built |
| `npm run logic` | **332 passed, 0 failed** (was 316) |
| `npm run isolate` | **43 passed, 0 failed** |
| `npm run openai` | **35 passed, 0 failed** |
| `npm run frozen` | 0 live findings |

### Mutation-tested — 8 of 8 caught

Every fix reverted individually, each mutation asserting its own occurrence count
first (a `replace` that matches nothing runs the suite against unmodified code
and reports a false green about a false green).

| Reverted fix | Observed failure |
|---|---|
| reserve skips sequential runs again | 3 logic checks fail |
| `requiredFreeStake` back to 1× | 2 fail |
| `earlyCloseLock`'s "late close locks nothing" shortcut | 6 fail |
| close panel promises a lock-free wait | `confirm did not say that waiting fails to avoid the lock` |
| `peakBlockStakes` back to a flat 2× | 5 fail |
| reserve charges terminal runs again | 1 fail |
| `earlyCloseLock` loses the `startOfDay` clamp | 3 fail |
| disclosure drops the peak multiplier | `the plan did not quote the peak the gate enforces (2 x 604.80)` |

### Two checks were mirrors, and are not any more

The old `renewal stake reservation` and `overlap reserve` blocks re-implemented
`required` and `reserve` locally. They pinned the *intent* while the shipping gate
was free to disagree — which is how the mode-dependent version survived a green
suite. `reserveWei`, `requiredFreeStake` and `peakBlockStakes` are now exported
from `KeepAliveProvider` and imported by the checks, and the Chat disclosure
computes its figure from the same `peakBlockStakes` the gate enforces, so the
screen cannot quote a different price from the refusal it is about to show.

## Adversarial review

One reviewer pass, verdict FAIL, six findings. Five were real and are fixed above
(the disclosure/gate contradiction, the short-cap regime, the phantom terminal
block, the surviving stale comments, and the untested UTC boundary).

**One was wrong, and measurement settled it.** The review argued that
`earlyCloseLock` returning "0 locked, full stake back" for a next-day close was a
defect, and that such a close might underflow and revert on-chain — leaving the
stake permanently stuck. The three 50000 MOR closes above show the close
succeeding and refunding in full: the code's prediction was already correct, and
the schedule is right to exclude those sessions because there is genuinely
nothing on hold. The boundary is now pinned by a check anchored to that
measurement.

## NOT verified here

- **No live on-chain run.** Nothing in this branch has opened a real session. The
  measurements above are reads of *other* wallets' completed sessions.
- **The deployed facet's source.** Sourcify has no record for
  `0x3a3952f0e57b343f00b31f7da039ef16389b7260` (the facet serving `closeSession`)
  and BaseScan's keyless endpoints are retired, so the mechanism is inferred from
  behaviour, not read. The behaviour is what the app depends on, and that is
  measured.
- **The hold's release timestamp.** That it goes on hold is measured; that it
  releases at `startOfDay + 1 day` comes from the vendored struct and the
  operator's report, which agree. The `StakeClaimer` sweeps whatever has matured
  regardless, so no code depends on the exact boundary.
- **Sub-day chain caps.** `peakBlockStakes` is derived, and its peaks were
  cross-checked against a simulation, but no such cap has ever been deployed.

## Known, not fixed here

Nothing in the app ever closes a run's **final** block, and `ChatHistory` removes
the Close button once `now > EndsAt` — so every terminal block, and every block of
a seamless run, depends on the bundled router's expiry sweep. That sweep exists
and works (`session_expiry_handler.go`, 1-minute ticker plus rehydrate on start),
so this is mitigated rather than broken. It is called out because its old
justification — "it lapses on its own → full stake returned" — was the premise
this diff retracts, and nothing has replaced it.
