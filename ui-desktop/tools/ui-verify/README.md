# ui-verify — desktop UI verification kit

Reproducible checks for the functional changes in this PR, independent of the
(removed) legacy jest setup. The kit brings its own harness deps (vite +
playwright); because the isolation cases mount **real** app components and the
logic checks import the app's utils, it also needs the app's own dependencies
installed.

## Run

```bash
# prerequisite — install the app's deps (the cases mount real components):
(cd ui-desktop && yarn install)

cd ui-desktop/tools/ui-verify
npm install
npx playwright install chromium   # one-time browser download, if not already present
npm run logic      # node-runnable assertions over the exported utils
npm run frozen     # colour literals that would survive a theme swap
npm run isolate    # isolation-render + Playwright drive of key components
npm run verify     # all three
```

## What it proves

### `logic-checks.mjs` (`npm run logic`)
Assertions over the PR's exported substrate utils (run through `vite-node` so the
`.ts/.tsx/.js` sources execute directly):
- **`marketplace.morToWei` / `weiToMor`** — precision-safe wei conversion: rejects
  bad input and >18 decimals, keeps integer precision above 2^53, round-trips.
- **`coinValue.formatMor`** — returns `null` on non-finite, `< 0.000001` below the
  shown precision, magnitude-scaled formatting (so tiny real stakes don't read `0.00`).
- **`chat/utils`** — `isSecureModel`/`SECURE_TAG` TEE detection, `formatModelName`
  (keeps size tokens like `8B` shouting), `modelMatchesQuery` (multi-word, matches
  across hyphens and tags).
- **`store/queries.buildModelsWithBids`** — merges the model registry with active
  bids from an injected provider-walking fetcher: skips local models, drops bids
  whose provider isn't in the map, attaches `ProviderData`/`Model`.

### `frozen-values.mjs` (`npm run frozen`)

The theme system's blind spot. A swap works only if every colour-valued
declaration derives from `props.theme`; a literal is perfectly valid CSS and
simply frozen, so typecheck, build, and a render of the component's own look all
pass while the surface refuses to swap.

Two things make it an audit rather than a checklist:

- **It queries the invariant** — *a colour-valued declaration that never mentions
  `theme`* — not a list of literals someone remembered. A hand-listed query
  (`#hex`, `rgba(`, plus the colour names you can recall) can only rediscover what
  its author already knew; that is how `border: 1px solid grey` and `color: white`
  survived a sweep in `ImportFlow.jsx`. The named-colour set here is the full CSS
  spec list, so it can surface a spelling nobody thought of.
- **It splits findings by reachability from `main.tsx`** (`frozen-values.mjs:38`), resolving every import
  specifier to a file (basename matching conflates `dashboard/tx-list/Filter.jsx`
  with `contracts-list/Filter.jsx` — different files, one dead). That walk is not
  the whole reachable set: nothing imports `index.html`, so once the walk is done
  it is added to the set directly (`frozen-values.mjs:80-83`), because Electron
  loads it as the real entry. A frozen value in `index.html` is therefore treated
  as live and fails, instead of being reported as dead code. This repo carries
  a dead legacy marketplace holding ~40 of the 41 raw hits. A frozen value in code
  that never renders is not a defect, and a gate that is permanently red is a gate
  nobody runs. Live findings fail; dead ones are reported. `--all` fails on both,
  for when the dead code is being removed.

### `isolate/` (`npm run isolate`)
Each case mounts ONE real product component in the app's real `ThemeProvider`
(dev's palette) with mock props forcing a target state, then drives it with
Playwright and asserts behaviour — including that destructive handlers fire **0×**.
Screenshots land in `shots/` (gitignored). There are **24** cases in
`isolate/cases/`; three of the highest-risk ones are described below — read the
directory for the full set.
- **sendform-confirm** — the two-step send: first press reveals the confirm panel
  (amount + full `toAddress` + irreversible warning) and switches the button to
  "Confirm & send"; asserts `onSubmit` fired **0×** before the confirm.
- **models-secure-badge** — a TEE model gets the "Secure" pill, the raw `tee` tag is
  filtered from the chips, and names are run through `formatModelName`.
- **login-reset-gate** — "Or setup new wallet" reveals an "Erase / Keep my wallet"
  confirm and fires `logout` **0×** on the first press; cancel returns to initial.

## Notes
- `src/renderer/src/components/Login.tsx` has an additive `export { Login }` so the
  inner component can be mounted here without the redux HOC. It changes no runtime
  behaviour.
