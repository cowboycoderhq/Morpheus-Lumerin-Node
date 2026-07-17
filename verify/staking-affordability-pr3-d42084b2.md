# verify: picker sort is GLOBAL, not within-section — 2026-07-17

Branch `staking-affordability-pr3`. Fixes the flaw the operator caught: the sort
ordered models *within* each section (Local / Secure / Marketplace) but the
sections themselves stayed fixed, so "Cheapest" could put the cheapest model below
every local and secure one. It now ranks the whole list.

## The fix

- **Standard** keeps the sectioned browse view (Local → Secure → Marketplace).
- **Cheapest / Most providers** now **flatten** the sections into ONE globally
  ordered list, under a single "All models · cheapest first" / "· most providers
  first" header. Each row still shows its own Local/Secure badge, so dropping the
  section headers loses no information. The row markup was hoisted into one
  `renderRow` helper so the sectioned and flat views cannot drift.
- **Local models now price as free (0)** in `modelMinPriceWei`, so in the global
  Cheapest ranking a local model leads (it runs free) instead of sinking to the
  bottom on the old `Infinity`. A local model has no providers, so it correctly
  trails under Most providers.

## Evidence

Logic (**118 total**): `modelMinPriceWei(local) === 0`; in Cheapest a free local
model leads the paid ones while the paid ones keep their price order.

The **real-modal isolate case** now proves the flatten end-to-end, with a local
model in the fixture (Zulu Local, free) plus three marketplace models:
- **Standard** → section headers "Local" and "Marketplace" present; marketplace
  models alphabetical within their section.
- **Cheapest** → exactly ONE `flat-model-list`, header reads "cheapest first",
  **no "Marketplace" header**, marketplace order Test Model < Broadcast <
  Aardvark, and **Zulu Local leads the whole list** despite its late name.
- **Most providers** → Broadcast(3) leads, and the 0-provider local model trails
  the paid ones.
- Toggling back to **Standard** restores the section headers.

16 isolate cases pass.

### Mutation — both flatten regressions caught

| mutation | result |
|---|---|
| never flatten (always sectioned — the reported bug) | ✗ "cheapest did not flatten into a single list" |
| local not priced as free (revert local → 0) | ✗ "free local model did not lead the cheapest global sort" |

(The sort-key and control mutations from the prior commit — reversed order,
online-first dropped, no-op buttons — remain covered by the same case and the
logic checks.)

## Gates

| gate | result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `node frozen-values.mjs` | exit 0 |
| `vite-node logic-checks.mjs` | **118 passed, 0 failed** |
| `node run.mjs` (isolate) | 16 passed, 0 failed |
| lint (touched) | `marketplace.ts` 0 → 0; `ModelSelectionModal.tsx` +5 house-style |

## Still not proven

- **Not run live** against a real populated marketplace — the flatten and the
  local-leads-cheapest behaviour are proven on the synthetic fixture and
  mutation-checked, but not driven by hand in the running app.
- The flat view shows a single header; whether users miss the per-section
  grouping when sorting is a judgment call, not tested. The badges on each row
  carry local/secure identity, which is the argument for it being acceptable.
- Search + a non-standard sort compose (search filters `visible`, which is then
  flattened) but no case exercises both at once.
