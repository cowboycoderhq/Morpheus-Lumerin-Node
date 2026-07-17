# verify: theme labelled "Jarvis" (aurora key unchanged) — 2026-07-17

Branch `staking-affordability-pr3`. The theme picker (pre-setup wizard + Settings
→ Appearance) now offers **Jarvis** and **Classic**; "Jarvis" is the aurora style.

## Scope — label only, key untouched

The internal variant key stays `aurora` everywhere: `theme.tsx` (`themes`,
`THEME_VARIANTS`, `DEFAULT_VARIANT`), the stored preference
(`localStorage['trinity.themeVariant'] === 'aurora'`), every `data-testid`
(`theme-aurora`, `presetup-theme-aurora`, `set-aurora`), and the theme machinery.
Only the user-facing STRING changed, so **existing installs keep their saved
choice** — a stored `'aurora'` still resolves.

Changed labels (all the user-facing "Aurora" in the renderer):
- `Settings.tsx` `THEME_LABELS.aurora`: 'Aurora' → 'Jarvis', and the section
  description ("Jarvis is the futuristic cyan/glass theme").
- `PreSetup.tsx` `THEME_COPY.aurora.label`: 'Aurora' → 'Jarvis'.

Left alone: `CreateContractModal.styles.jsx` has a code comment "pre-Aurora
palette" — not user-facing. A final `grep` for "Aurora" in `.tsx/.jsx` returns
only comments/keys, no visible label.

## Evidence

Both theme isolate cases now pin the rename AND the label/key split:
- **`presetup-prefs`**: asserts the visible text shows "Jarvis" and **not**
  "Aurora"; still asserts the stored key is `'aurora'` after selecting it
  (label ≠ key).
- **`settings-appearance`**: asserts the Appearance panel labels the theme
  "Jarvis" and not "Aurora"; still drives via the `theme-aurora` testid and
  asserts stored `'aurora'`.

Together these prove: users see "Jarvis", the machine still stores/keys `aurora`.

Mutation: reverting the PreSetup label to 'Aurora' fails `presetup-prefs`
("missing a theme choice (Jarvis/Classic)") — the assertion has teeth.

## Gates

| gate | result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `node frozen-values.mjs` | exit 0 |
| `vite-node logic-checks.mjs` | 118 passed, 0 failed |
| `node run.mjs` (isolate) | **16 passed, 0 failed** (theme-swap, presetup-prefs, settings-appearance all green) |
| lint (touched) | Settings.tsx 4 → 4; PreSetup.tsx 17 → 17 (no delta) |

## Still not proven / notes

- **Not run live** with this build — the label is proven in the isolate render,
  not driven in the running app by hand.
- The rename is **UI-only**; docs/CLAUDE.md/memory still call the theme "Aurora"
  (the tag is `aurora-v1`). That is deliberate — those are internal artifacts —
  but a future reader should know the user-facing name diverged on 2026-07-17.
- Not touched: the `crypto-version` design-direction doc or any marketing copy;
  only the two in-app pickers.
