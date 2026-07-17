# verify: model-picker price toggle — rate vs 6-minute stake — 2026-07-17

Branch `staking-affordability-pr3`. New-chat model picker can now show each
model's price EITHER as the per-second rate (MOR/s, unchanged default) OR as the
stake it takes to OPEN the minimum 6-minute session (MOR to open).

## What changed

- **`marketplace.ts`** (pure, tested): `sixMinuteStakeMor(priceWei, meta)` =
  `price * 360 * supply / budget / 1e18` — the same floor the affordability gate
  uses (MIN_REQUEST_SECONDS). Returns `null` when meta (supply/budget) is not
  loaded, so the stake is never faked as 0. `modelPriceDisplay(bids, mode, meta)`
  reduces a model's bids to a `single`/`range`/`offline` label in the chosen mode.
- **`ModelRow.tsx`**: takes `priceMode` + `meta`, prices via `modelPriceDisplay`,
  and labels the unit `MOR/s` or `MOR to open`. The dead in-file `computePrice`
  is gone (ModelRow lint actually dropped, 46 → 42).
- **`ModelSelectionModal.tsx`**: a segmented "Show price as [ Per second | 6-min
  stake ]" toggle. Defaults to per-second (no behaviour change on open). The
  stake option is **disabled until meta loads** — the stake is unknowable without
  supply/budget, so it is greyed rather than shown wrong. The mode passed to rows
  is `metaReady ? priceMode : 'perSec'`, so a row can never render stake mode
  without meta.
- **`Chat.tsx`**: passes `meta` to the modal (it had supply/budget already).

## Evidence

15 new logic checks (**100 total**), anchored to the affordability numbers
(supply/budget = 1 → 1e15 wei/s = 0.001 MOR/s = **0.36 MOR to open**; 2e15 →
0.72; 1e16 → 3.6). Also: the supply/budget ratio scales the stake; missing/zero
meta → `null` (never a fake 0); stake mode without meta → `offline`; and the two
modes produce **different numbers** for the same bid (proves the toggle recomputes,
not relabels).

**A real isolate case now drives the toggle** (`model-picker-price-toggle`): mounts
the REAL `ModelSelectionModal` with two bids, asserts the default shows
`0.001 – 0.002 MOR/s`, clicking "6-min stake" switches the SAME bids to
`0.36 – 0.72 MOR to open` (and the per-second range disappears), toggling back
restores the rate, and the toggle selects no model. 15 isolate cases pass.

### Mutation — 6 caught (math 4/4, render 2/2)

| mutation | caught |
|---|---|
| wrong session length (600s not 360) | ✗ 4 stake checks |
| drop the supply/budget ratio | ✗ ratio check |
| return a fake 0 when meta missing | ✗ 3 null checks |
| stake mode silently uses the per-sec value | ✗ stake range + differ checks |
| the stake toggle button is a no-op | ✗ `model-picker-price-toggle` |
| rows hardwired to per-sec (toggle ignored) | ✗ `model-picker-price-toggle` |

Note: the "hardwired to per-sec" mutation only bites when applied to the
MARKETPLACE row — mutating the Local row alone is inert (local models ignore
priceMode). Confirmed by re-running against all three row usages.

## Gates

| gate | result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `node frozen-values.mjs` | exit 0 |
| `vite-node logic-checks.mjs` | **100 passed, 0 failed** |
| `node run.mjs` (isolate) | 15 passed, 0 failed |
| lint (touched) | `marketplace.ts` 0 → 0; `ModelRow.tsx` 46 → **42** (removed computePrice); `ModelSelectionModal.tsx` +8 house-style; `Chat.tsx` +1 |

## Still not proven

- **Not run live** against the real marketplace: the stake numbers are exact at
  supply/budget = 1 in tests and mutation-proven, but the real meta ratio has not
  been observed rendering in the running app with this build (not yet relaunched).
- **`ModelRow`'s own render is covered only through the modal case**, not in
  isolation — the unit-label branch (`MOR/s` vs `MOR to open`) is asserted via the
  modal's rendered text, which is sufficient but couples the two.
- The `meta`-not-ready path (stake toggle disabled) is reasoned and typechecked
  but **not pinned by a case** — the fixture always supplies meta. A model list
  loaded before meta would grey the toggle; that state is untested.
- Display uses Number math (matches the rest of the picker); at extreme
  supply/budget scales this could lose low-order precision in the *label*, never
  in a transaction.
