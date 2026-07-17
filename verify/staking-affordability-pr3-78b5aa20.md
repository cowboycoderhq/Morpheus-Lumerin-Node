# verify: partial-provider affordability — 2026-07-16

Branch `staking-affordability-pr3` off `pr3-reskin` @ `0c19bee4` (= tag `aurora-v1`).
Commit 1 (`109d6894`) is the parked feature cherry-picked forward; this staged diff
is the review pass on top of it.

**Crosses the plumbing boundary** (`Chat.tsx` session/fetch logic + `proxy-router`
Go). The CLAUDE.md boundary says "lift JSX, leave the fetch" — that is retired for
this line per the operator (2026-07-16, PRs no longer constrain it), and this change
is a money-path change by request, not a visual one.

## Provenance — this was not written today

The feature was already written and parked twice: `outputs/morpheus-affordability-
cheapest-provider-feature-2026-07-16.patch` and stash@{0} ("for future router-revamp
PR"). It was committed on branch `staking-partial-affordability` @ `5cf612fd` —
but that branch's merge-base is `521a9db1`, the **pre-reskin** base, so it had never
met the reskinned `Chat.tsx` (~490 lines apart). Cherry-picked onto `pr3-reskin`; the
3-way merge applied clean (`git apply` does not — context drift only).

Committed diff at `5cf612fd` is **byte-identical** to the parked patch (verified by
comparing `+`/`-` lines only — `@@` offsets differ).

## What it does

A model has several providers (bids) at different prices; opening a session matches
ONE. Staking used to require enough MOR for the **most expensive** provider, so a
wallet that could comfortably afford the cheap ones was blocked outright. Now: gate
on the **cheapest** (stake if ≥1 provider is affordable), size the session off the
priciest **affordable** provider, warn "covers N of M providers", and have the router
skip providers the wallet cannot cover.

## The load-bearing claim — verified, not assumed

> "Duration is sized off the priciest AFFORDABLE provider, so whichever affordable
> provider the router matches, the stake still fits within balance."

It holds, but **the guarantee lives in the caller**, not in `calculateAcceptableDuration`
— that function can return a duration whose stake exceeds balance via either exit
(the `balance > requiredStake.max` → 24h branch, `Chat.tsx:414`; the
`MIN_REQUEST_SECONDS` floor, `Chat.tsx:426`). It is safe only because
`priceForDuration ∈ affordablePrices`, which is defined at exactly that 6-min floor.

- **Monotonicity** (what the whole design rests on): `calculateStake` =
  `price·durMin·60·supply/budget` (`Chat.tsx:1180`) — linear, positive in price.
- **Client/router formulas agree exactly**: Go `computeSessionTokenAmount`
  (`service.go:1400`) = `supply·(price·duration)/budget`; direct pay = `price·duration`.
  Go floors, favouring the user. So the "N of M" count is **exact**, not approximate.
- **The filter is the same function the money moves on**: `tryOpenSession:1472`
  computes `amountTransferred` with `computeSessionTokenAmount` and transfers exactly
  that — filter and transfer cannot disagree.
- 145,429 randomized fresh-state trials: **0** dead ends (router skipping every
  provider), **0** cases where the UI overstates or understates the count.

## Three defects found in the parked patch, and fixed here

**1. Frozen-value gate FAILED (mechanically proven, reachable).**
`style={{ color: '#F5A623' }}` — a raw literal on a live surface, violating "No
colour literal outside `ui/theme.tsx`". It was also a third amber matching neither
theme (`auroraWarning #f0c060`, classic `rgba(255,200,87,1)`), so it would not swap.
→ `ChatIntroWarningText` deriving `p.theme.colors.warning`.
`node frozen-values.mjs`: **1 REACHABLE finding, exit 1 → 0 findings, exit 0.**

**2. The diff deleted the only duration-aware safety check and left a comment
claiming it still existed.** `stakeNeeded = aff.minStake` is the cheapest provider's
6-min floor — *exactly* what the button gate already tests, so it was dead code:
measured **0 fires in 218,271 button-enabled cases**. Meanwhile its comment still
said "Don't attempt an on-chain open the wallet can't cover".
→ Restored as a duration-scaled check.

**3. Direct-pay gate understated the true cost by orders of magnitude (reachable
today; pre-existing, but this diff widened it ~20x).** Direct pay is billed
`price × duration` outright, and its duration
(`calculateAcceptableDurationForDirectPay`, `Chat.tsx:436`) is a fixed
stake-equivalent window that can run to days — not price-derived. Gating on
`minPrice × 360` lit up a Direct Pay button whose session the router then refused,
provider by provider. Measured worst understatement: **158,846x**.
→ Priced off the real direct-pay duration, gated on `stakeKnown` (without it,
`supply=0` collapses the duration to 1s and everything reads as free).

Plus a Go nit: the `amtErr` path fell through silently while its `balErr` sibling
logged; it now warns before attempting the bid.

## The reviewer's suggested fix was WRONG — and testing it is what caught that

The review proposed pricing the restored guard off `priceForDuration` (the priciest
affordable). Measured over 200,000 trials in the stale-`requiredStake` scenario:

| guard predicate | fires | catches real dead-ends | **false blocks** |
|---|---|---|---|
| shipped (`aff.minStake`) | 0 | 0 / 91,414 | 0 — dead code |
| **A: `priceForDuration`** (review's suggestion) | 151,244 | 91,414 / 91,414 | **59,830** ← over-blocks |
| **B: `minPrice`** (shipped here) | 91,414 | **91,414 / 91,414** | **0** |

Candidate A false-blocks ~40% of the sessions it stops — cases where a *cheaper*
provider was still openable — i.e. it would re-block exactly the wallets this feature
exists to admit. Candidate B is an **exact** predicate for "the router refuses every
bid", by monotonicity. Both arms of `stakeNeeded` therefore price the **cheapest**
provider. Script: `scratchpad/fixcheck.mjs`.

## Evidence

| gate | result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `node frozen-values.mjs` | **exit 0**, 0 reachable (was exit 1, 1 reachable) |
| `vite-node logic-checks.mjs` | 30 passed, 0 failed |
| `node run.mjs` (isolate) | 9 passed, 0 failed |
| `go build ./...` | exit 0 |
| `go vet ./internal/blockchainapi/` | exit 0 |
| `go test -run TestComputeSessionTokenAmount` | PASS (direct payment, staked, nil bid, zero/nil budget) |
| lint (touched files) | 260 → 262 problems: **+3** `explicit-function-return-type` (fires 189x in these same files already — house style), prettier 29 → 28 |

`go test ./internal/blockchainapi/` FAILS on `TestRating` (index out of range) —
**identical on `pr3-reskin`, pre-existing, not this diff.**

## Honest gaps — what is NOT proven

- **No isolate case pins the "N of M" copy.** The math is proven by simulation that
  *mirrors* the source formulas; the component was never mounted and rendered. A
  transcription error between `Chat.tsx` and `fixcheck.mjs` would not be caught.
  `getStakeAffordability` lives inside the component (not exported), so
  `logic-checks.mjs` cannot reach it without a refactor. This is the highest-value
  next step.
- **Never run live.** Needs real MOR + live bids on the operator's real wallet
  profile; not driven (CLAUDE.md: never drive money/wallet flows on the only real
  profile). The warning has not been seen on screen by anyone.
- **Defect 2's exploit path is UNVERIFIED, not proven unreachable.** The stale
  `requiredStake = {min:0, max:0}` state that reaches the 24h branch could not be
  constructed — `store/queries.ts:95` drops bidless models, so `selectedModel` always
  has bids and the effect always runs before a click. But `Chat.tsx:463`'s
  `selectedModel ?? ...` fallback exists because the authors believed that state is
  reachable. If it is, the restored guard is load-bearing rather than a backstop.
- Float precision: `Number(balances.mor)` at 1e18 scale loses ~1e-16 relative
  precision vs Go's exact `big.Int` — could misjudge affordability by a few wei
  exactly at the boundary. Latent, negligible.
- `EstimateOpenSessionStake` (`service.go:1418`) still estimates off `rated[0]` with
  no affordability filter — inconsistent with the new behaviour. No UI/handler caller
  found, so not live.
