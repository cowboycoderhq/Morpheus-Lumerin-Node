# verify: model-picker sort — cheapest / standard / most providers — 2026-07-17

Branch `staking-affordability-pr3`. The new-chat picker can now be ordered by
**Standard**, **Cheapest**, or **Most providers**, alongside the price toggle.

## What changed

- **`marketplace.ts`** (pure, tested): `sortModelsForPicker(models, mode)` plus
  `modelMinPriceWei` / `modelProviderCount`. Online always sorts before offline
  (an offline model is useless however cheap), then by the chosen key, with an
  A–Z tiebreak for stability. Non-mutating (copies before sort).
- **`ModelSelectionModal.tsx`**: a segmented "Standard | Cheapest | Most
  providers" control, defaulting to **Standard** (the historical order — local
  first, then A–Z — so nothing changes on open). Replaced the inline comparator
  with the tested function.

The sort runs over the flat `visible` list before it is split into the Local /
TEE / Marketplace sections, so ordering applies within each section and the
section headers are unchanged.

## Console errors the operator saw — diagnosed, not ours

- `TypeError: …reading 'filter' at chrome-extension://lmhkpmbe…/content.bundle.js`
  — that extension id is **Redux DevTools**, which the app loads in dev
  (`main/index.ts` `installExtension([REDUX_DEVTOOLS])`). The stack is entirely
  inside the extension; a known content-script bug, not our code.
- `LOCK: File currently in use` — a LevelDB lock from **three** app instances
  left running (my relaunch `pkill` missed them: the Electron binary lives in the
  sibling clone's node_modules, which the worktree symlinks, so my path pattern
  did not match). Cleared to a single instance; the lock is the symptom of the
  duplicates, not a code fault.

## Evidence

15 new logic checks (**115 total**). Fixture: Cheap (0.001/s, 1 provider), Mid
(0.003/s, 2), Broad (0.005/s, 3), Zed (0.009/s, 1), plus an OfflineCheap.
- **cheapest**: Cheap < Mid < Broad < Zed, and the OFFLINE model sorts **last**
  despite the lowest price;
- **mostProviders**: Broad(3) > Mid(2) > 1-provider models A–Z;
- **standard**: local first, then A–Z;
- the three modes are proven to produce three DIFFERENT orders;
- pure (input not mutated), `undefined -> []`, and two no-price models tie to the
  name with no NaN scramble.

**Real modal driven** (`model-picker-sort` isolate case): mounts the actual
`ModelSelectionModal` with three models and reads the on-screen name order —
Standard `[Aardvark, Broadcast, Test Model]`, Cheapest `[Test Model, Broadcast,
Aardvark]`, Most providers `[Broadcast, Test Model, Aardvark]`. 16 isolate cases.

### Mutation — 5 caught, 1 provably equivalent

| mutation | result |
|---|---|
| cheapest sorted descending | ✗ 2 checks |
| mostProviders sorted ascending | ✗ 2 checks |
| drop the online-first primary key | ✗ 3 checks |
| sort buttons no-op (render) | ✗ `model-picker-sort` |
| sortMode ignored, always standard (render) | ✗ `model-picker-sort` |
| replace NaN-safe compare with `x - y` | **not caught — equivalent** |

The last is not a gap: under the `if (d) return d` guard, the only bad output
(`Infinity - Infinity = NaN`) is falsy and falls through to the name tiebreak —
exactly what the sign-compare's 0 does. Proven by exhaustive pairing over
{Infinity, 0, 1e14, 1e15, 5e15, 9e15}: **0/36** pairs order differently. The
sign-compare is kept for clarity.

## Gates

| gate | result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `node frozen-values.mjs` | exit 0 |
| `vite-node logic-checks.mjs` | **115 passed, 0 failed** |
| `node run.mjs` (isolate) | 16 passed, 0 failed |
| lint (touched) | `marketplace.ts` 0 → 0; `ModelSelectionModal.tsx` +6 house-style |

## Still not proven

- **Not run live** against a real, populated marketplace — order is proven on a
  synthetic fixture and mutation-checked, but the running app with this build has
  not been driven through the sort by hand.
- The isolate fixture is all-online marketplace models; the **offline-sinks-last**
  and **local-first** interactions with the section split are covered in
  logic-checks but not in the rendered modal case.
- Sort keys use `Number(PricePerSecond)`; at extreme wei magnitudes two very close
  prices could compare equal in the *ordering* and fall to the name tiebreak.
  Harmless for a picker, never touches a transaction.
