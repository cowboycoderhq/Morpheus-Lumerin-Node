# Verify — stake-driven session length, Chat load time, OpenAI endpoint, opencode

Branch `stake-duration` (off `parallel-sessions`) · staged diff `8294c28e` · 2026-08-06

## What changed

Four things, in one branch:

1. **Session length is typed and set by the stake.** The slider (305s–8h, driving
   chained 305-second sessions) is gone. The user types "1 day" / "2 years" and that
   length sets the stake. `MIN_REQUEST_SECONDS` stopped being the block unit and
   became a per-run `blockSeconds`, so a session inside the chain's cap is a
   **one-block run**; only a longer span chains cap-sized blocks.
2. **Chat load time**, which was 20–30 seconds.
3. **An OpenAI-compatible local endpoint**, off by default.
4. **opencode integration** — detection, install, config, and a session handoff.

## Chain facts this is built on (read live from Base)

Diamond `0x6aBE1d282f72B474E54527D93b979A4f64d3030a`:

- `getMaxSessionDuration()` = **604800 s = 7 days**; `getSessionEnd` *clamps* to it,
  so stake buying more buys nothing. Owner-settable → read at runtime, not hardcoded.
- `MIN_SESSION_DURATION` = 300 s; the app opens at 305 s (truncation cushion).
- `order=desc` on `/blockchain/sessions/user` reverses the on-chain append order →
  pages arrive newest-**opened** first. The live-window bound depends on this.
- `limit` binds as a Go `uint8`: 255 is the ceiling, and it **wraps** above it.
- Stake ≈ 337.6× the window's raw compute cost, drifting daily.

## Verification

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run build` | ✓ built |
| `npm run logic` | **316 passed, 0 failed** |
| `npm run openai` | **35 passed, 0 failed** (new suite, real sockets) |
| `npm run isolate` | **43 passed, 0 failed** |
| `npm run frozen` | 0 live findings |

## Adversarial review — two rounds, both FAIL, both repaired

Round 1 found two HIGH money defects the then-green suite **structurally could not
see**: the session-length isolate cases stubbed the keep-alive context, so the loop
that actually spends MOR was never exercised.

1. **Chained runs overshot by up to a full cap-block** — an 8-day ask committed MOR
   for ~14 days. Fixed with `planBlocks`, which cuts the last block to the remainder
   and drops a remainder below the contract minimum. Worst-case overshoot now **0 s**
   at the 7-day unit, **8 s** at the 305 s unit.
2. **A "one stake" session could open a second full-length stake** — `scheduleNext`
   compared a *chain* `EndsAt` against a *local* `targetEndTime`. Fixed with a hard
   block-**count** cap, re-checked at spend time.

Round 2 confirmed those (84 simulated scenarios, 0 over-opens) and found a
**304-second window** past the cap where the UI asked "longer than one session?"
instead of "does it renew?", plus a length echo silently truncating up to 24 h.

## Chat load: measured, not inferred

Three fixes shipped before measuring; two were real but **not** the cause. The
instrument that settled it was a temporary renderer probe (since removed):

```
[perf] modelsData:     +1353ms   ← registry snapshot working
[perf] liveSessions:  +19763ms   ← THE BLOCKER
[perf] initialized:   +19844ms
```

The time bound on the session walk was sound but **useless on real data**: it skips
sessions older than `cap×2`, and all ~1450 of the operator's sessions were opened
within two weeks by rolling-session testing. Fixed by making the walk **concurrent**
(8 pages/round) at **200 per page** (under the uint8 ceiling): 29 serial round trips
→ 1. The time bound stays — it protects a history spanning years.

Router timings that informed this (operator-run, no credentials handled):
`/blockchain/models` 5.52s · `/blockchain/providers` 1.04s · everything else
sub-second · 33 concurrent provider reads = 3.47s (≈6.8× one, not 33×), which is
what justifies concurrent paging.

## OpenAI endpoint — the security posture

Off by default. Admission: 127.0.0.1 bind, constant-time bearer compare, `Host` must
be loopback (the DNS-rebinding defence — binding to loopback alone does **not** stop
it), and any request carrying `Origin` is refused so a leaked key cannot be used from
a web page.

**Honest scope of that:** the proxy-router already exposes session opening to any
local process that can read its `.cookie`. These controls defend against a runaway
**agent**, which is the realistic threat, not against local malware, which has a
shorter path already. An earlier draft of this file overstated it.

`allowAutoOpen` is stored and defaults off; the spend caps in `sessions-api.ts`
(per-session and per-day ceilings, local-midnight ledger, fail-closed on unpriceable
stakes) are built and tested, but the `/start` routes are **not yet wired**.

## opencode integration

The app publishes its **own** opencode config and points `OPENCODE_CONFIG` at it.
opencode merges configs rather than replacing, so the user's
`~/.config/opencode/opencode.jsonc` is never read, parsed or rewritten — which
matters because it is JSONC and any round-trip would delete their comments, and
because that file carries their own provider lanes.

Model names are chain data (anyone can register `evil$(whoami)`) and end up in a
shell command: metacharacters are quoted, control characters are **refused** — a
newline is safe inside single quotes but produces a `.command` file spanning lines
that cannot be reviewed.

## Mutation-tested, not merely green

Every load-bearing claim was verified by reverting the fix and confirming failure:

| Reverted fix | Observed failure |
|---|---|
| block-count cap | `a 1-day session opened 2 stakes` |
| remainder sizing | `the LAST block was a full 604800s cap-block` |
| reserved echo / note height | page moved **9.8px** per keystroke |
| reserved affordability notice | page moved **32.1px** |
| top-anchored card | field moved **53.2px** crossing the cap |
| live-window safety factor | still-open straggler missed |
| registry snapshot | registry awaited instead of served from disk |
| model-list cache | `reads=3` for three `/v1/models` calls |
| upstream abort on client cancel | **107 chunks** generated after the client left |
| hex→advertised id resolution | four handoff assertions fail |
| the launching state | progress never shown |
| daily spend cap | two cap assertions fail |
| note as a flex container | sentence renders as stacked single words |

**Five checks were vacuous when first written** and only the mutation step exposed
them — a single-provider fixture where the notice can never fire; a straggler placed
where both bounds fetch; a rebinding check using `fetch` (which silently overwrites
`Host`); a cancel check asserting on a close event that fires anyway; and a
width-vs-height check at a viewport too wide to squeeze. Each was rebuilt against a
fixture that discriminates, and several now carry an explicit assertion that the
condition under test was actually reached.

## End-of-day MOR lock

Operator report: MOR is locked until the end of the day, not returned when the
session ends. All user-facing copy corrected, and the isolate assertion that pinned
the old promise (`returned in full`) was replaced — plus a second assertion that the
on-expiry-refund wording can never come back.

## NOT verified here — deliberately

**No live on-chain run.** Nothing in this branch has opened a real session. The
isolate suite mounts the real components and the real keep-alive loop; the endpoint
suite drives a real socket against a fake router. What remains unproven is the
round-trip against a live provider, and the opencode handoff actually completing a
prompt.

**Known live defect, not fixed here:** economy mode's code still assumes stake
returns between blocks. `committedOverlapWei` returns 0 for economy runs, so the
affordability gate can approve runs the wallet cannot fund, and `waitForStakeReturn`
will spin its full 150 s timeout at every renewal. Left deliberately — it needs a
product decision (delete the mode, or keep it as "sequential, same cost" and reprice).

The Close-session warning and the dashboard On Hold tile may also understate the lock
if the whole stake is now held to end of day.

`/blockchain/models` at 5–10 s is worked around by the snapshot, not fixed; that is a
proxy-router concern in a different tree.
