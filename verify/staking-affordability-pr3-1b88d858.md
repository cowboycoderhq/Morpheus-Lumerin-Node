# verify: isolate case for partial-provider affordability — 2026-07-16

Branch `staking-affordability-pr3`. Closes the gap the previous evidence file
(`staking-affordability-pr3-78b5aa20.md`) filed against itself: *"No isolate case
pins the 'N of M' copy — the math is proven by a simulation that MIRRORS the source,
not by mounting the component."* It is now mounted and driven.

## What it mounts

The **real** `Chat`, unwrapped. `withChatState` only maps redux/context into props,
so the case supplies mock props instead of standing up a redux double whose shape
would drift from the store. Every input the affordability math reads (bids, meta,
balance) arrives via `getModelsData`, so the whole state is drivable from the case.
`Chat` is now exported unwrapped for this; the default export is unchanged.

The model is selected through the **real** `ModelSelectionModal` ("New chat" →
"Test Model"), because `onCreateNewChat` is what commits `selectedModel` — a case
that reached in and set state directly would pin a state the app cannot reach.

Fixture arithmetic (deliberately legible): `supply/budget = 1`, so
`minStake(price) = price × 360` (the 6-minute floor). Prices `1e15 / 2e15 / 1e16`
wei/s → floors **0.36 / 0.72 / 3.6 MOR**. `?bal=` selects the regime.

| case | balance | expected |
|---|---|---|
| `chat-affordability` | 1 MOR | stakeable, "covers **2 of 3** providers", min 0.36 / **max 172.80** |
| `chat-affordability-no-cry-wolf` | 10 MOR | **no** count warning, max **864.00** |
| `chat-affordability-none` | 0.0001 MOR | "You'll need some MOR", no count |

The `max` assertion is the load-bearing one: 172.80 = `2e15 × 1440min × 60` — the
priciest **affordable** provider. If a refactor ever sizes off the dearest again it
reads 864.00 and the case fails. That is the design's central invariant, pinned
against the actual rendered surface rather than argued.

## Evidence: the cases FAIL when the behaviour breaks

7 mutations, 7 caught — each by the right case, and only by the right case.
Mutations applied to `Chat.tsx` and reverted **from a scratchpad backup, never
`git checkout --`** (the fix was uncommitted; a git revert would have destroyed it —
that failure had already happened twice this session).

| # | mutation | caught by | result |
|---|---|---|---|
| 1 | report `totalProviders` instead of `affordableCount` ("3 of 3") | `chat-affordability` | ✗ expected "covers 2 of 3" |
| 2 | **size off the dearest provider** (the pre-feature behaviour) | `chat-affordability` | ✗ ceiling not sized off priciest affordable |
| 3 | cry wolf: `affordableCount <= totalProviders` | `no-cry-wolf` **only** | ✗ warned when all affordable |
| 4 | off-by-one in the affordability filter | `chat-affordability` | ✗ expected "covers 2 of 3" |
| 5 | revert to pre-feature gate (require dearest affordable) | `chat-affordability` | ✗ expected "covers 2 of 3" |
| 6 | delete the warning block (demolition control) | `chat-affordability` | ✗ expected "covers 2 of 3" |
| 7 | `isEnoughFunds: affordableCount >= 0` | `none` **only** | ✗ no add-MOR screen |

Mutations 3 and 7 exist because the first six left two of the three cases never
discriminating — every one of them was caught by `chat-affordability` alone, which
would have made the other two decoration. A case that cannot fail is not evidence
([[mutate-to-the-near-miss-not-the-demolition]]). Each case now has a mutation that
only it catches.

Note mutation 2 is the one that matters most: it is not a hypothetical, it is the
exact behaviour that shipped before this feature, and it is now mechanically
prevented from returning.

## Live confirmation of the design claim

Driving the real component also **confirmed the invariant the previous evidence
could only argue from formulas**: at 1 MOR the ceiling renders **172.80 MOR**
(priciest affordable = 2e15), and at 10 MOR it moves to **864.00 MOR** (the dearest,
1e16, once affordable). The session really is sized off the priciest provider the
wallet can cover — observed, not derived.

## Gates

| gate | result |
|---|---|
| `node run.mjs` (isolate) | **12 passed, 0 failed** (9 pre-existing + 3 new) |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `node frozen-values.mjs` | exit 0, 0 reachable |
| `vite-node logic-checks.mjs` | 30 passed, 0 failed |

Console errors are failures in this kit (`drive()` throws on any) — the cases mount
`Chat` with **zero** console errors.

## Still not proven

- **Never run live.** These cases prove the arithmetic and the copy against mock
  bids. They do not prove the app behaves on a real chain with real MOR, real
  provider bids, and a real proxy-router — the router-side affordability filter
  (`service.go`) is **not exercised by any of this**; it has only `go build`/`go vet`
  and the pre-existing `TestComputeSessionTokenAmount`.
- The fixture uses `supply/budget = 1` for legibility. Real marketplace meta is far
  from 1; the ratio cancels in the comparison, but no case pins a realistic ratio.
- Direct Pay is rendered but not asserted — the fixed direct-pay gate
  (`minPrice × directPayDuration`) is proven only by simulation, not by a case.
