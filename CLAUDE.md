# CLAUDE.md — Morpheus Lumerin desktop client (Aurora branch)

You are on **`pr3-reskin`**, the current best version. It is pr2's function +
Aurora's look + the good parts of `crypto-version`. It lives on the PRIVATE
staging remote (`cowboycoder` → `morpheus-lumerin-node-staging`). Read
"Invariants" before changing anything visual — several of those lines were paid
for with real defects.

## Commands (ui-desktop/)
- dev: `npm run dev` (Vite + Electron; kill orphans first: `lsof -ti:5173 | xargs kill`)
- check: `npm run typecheck` · build: `npm run build` (build includes typecheck)
- **lint is real but the codebase is not clean**: `npm run lint` runs (its config was
  ESM-in-a-.cjs and died before linting a line until it was fixed) and reports ~7374
  pre-existing problems — 3471 prettier, 2308 missing return types, 909 prop-types.
  It carries `--fix`, so DO NOT run it casually: it will rewrite thousands of lines.
  Lint your own files: `npx eslint <paths>`.

## The two verification kits — both are load-bearing
- `ui-desktop/tools/ui-verify` (`npm run verify`) — logic checks, the **frozen-value
  gate**, and 9 isolation cases that mount REAL components in Playwright.
  - `npm run frozen` — every colour-valued declaration must derive from `props.theme`.
    Queries the INVARIANT, not a list of literals; scans `.jsx/.tsx/.html/.css`;
    splits findings by reachability from the entry. Live findings FAIL, dead code is
    reported. Both rules exist because both failure modes shipped.
  - `npm run isolate` — the cases pin things reasoning got wrong: the two-consent
    gate, terms legibility (contrast ≥ 4.5:1), each theme card previewing its OWN
    accent, the password meter's label not colliding with the hint.
- `tools/ui-verify` (repo root, from crypto-version) — computed-style audit across
  routes, behavioural probes, and `liveness.sh`.
  - **`bash tools/ui-verify/liveness.sh ui-desktop [--proc-regex RE]` before claiming a
    running app shows your change.** electron-vite rebuilds main but does NOT restart
    Electron. This caught an hour of stale window on 2026-07-16.

## Gates (mechanical — do not route around)
- git pre-commit: typecheck+build must exit 0 when ui-desktop is staged.
- Claude PreToolUse **visual gate**: `git commit` with staged visual files blocks
  unless `verify/<branch>-<stagedDiffHash>.md` exists. Skipping is allowed only by
  writing the justification INTO the evidence file — visible, never silent.
- Claude Stop **claim gate**: a message claiming a behaviour changed must cite an
  observation (evidence line, `VERIFY: PASS`, `LIVENESS: FRESH`, driver log,
  screenshot) or say "unverified".
- Verification is keyed to the staged diff: edit after verifying → verify again.

## Invariants — each one is a defect someone already paid for
- **Default theme is `classic`, and that is the whole argument.** `ui/theme.tsx`
  `DEFAULT_VARIANT`. The picker only runs for a NEW wallet (Root sends an existing
  one to Login), so defaulting to aurora silently restyles every current user.
  Aurora is offered, never imposed. The module's default export follows
  DEFAULT_VARIANT for the same reason.
- **TermsStep keeps TWO independent consents and the scrollable terms text.**
  crypto-version collapses them to one toggle and hides the terms behind a link.
  That is less consent and less disclosure on a legal surface. Do not "modernise" it.
- **Destructive-action copy says what is LOST**, not merely what restores it:
  "its funds are lost forever" on both the Login reset gate and Settings → Reset
  Wallet. A reskin already deleted this once. The app shows the Recovery Phrase
  exactly once (onboarding) and never again, so the user who needs the warning most
  cannot go and check.
- **No colour literal outside `ui/theme.tsx`** — including `.html`. Named colours
  (`grey`, `white`) and `import theme from './ui/theme'` (frozen at module load) both
  count. `npm run frozen` enforces it.
- **No backticks inside CSS comments in styled/createGlobalStyle blocks** — it
  terminates the template literal. Shipped three times now.
- Money surfaces (balance, stake, send, confirm, payment errors): solid,
  effect-free, max contrast; never state by colour alone. Glass/glow on ambient
  chrome only.

## Plumbing boundary
Visual work edits `src/renderer/src/{components,ui}` only. Do not touch the redux
store, `src/main`, `src/preload`, IPC, or wallet/client logic as part of a visual
change. `Chat.tsx` carries a paid API call — lift JSX around it, leave the fetch.

## Testing the app WITHOUT touching the real wallet
The app derives `userData` from the package name, so launching from this repo shares
the operator's REAL profile — and this branch touches onboarding, Login, and the
wallet-reset flow. Never drive those on the only real profile. Use a name-shim:
a temp dir holding `{"name":"morpheus-app-<something>","main":"out/main/index.mjs"}`
plus a **symlink** `out -> <repo>/ui-desktop/out` (a copy breaks native requires),
then `./node_modules/.bin/electron <shimdir>`. Pre-seed `services/` by rsync from the
real profile so the boot wizard health-checks instead of re-downloading ~2GB.

## Open items (next session starts here)
1. **`VerifyMnemonicStep` has no isolate case.** It is the highest-risk flow in the
   app (the ledger's words) and is now materially new code (tap-a-word). Do this first.
2. **MOR on hold is invisible and unclaimable.** The Diamond has
   `getUserStakesOnHold` + `withdrawUserStakes`; they exist ONLY in the generated Go
   bindings — no proxy-router endpoint, no UI. Closing a session early locks the
   used-compute portion until `startOfTheDay(closedAt) + 1 day`, and the app neither
   shows it nor returns it. Every user who closes early sees MOR vanish.
   Diamond `0x6aBE1d282f72B474E54527D93b979A4f64d3030a` (Base, chainId 8453).
3. **Settings tabs unmount on switch** → a typed-but-unsaved ETH node URL is
   discarded and `getConfig()` re-fires. react-bootstrap defaulted to keeping both
   panes mounted; the reskin's conditional mounting changed that.
4. `ModelRow.tsx` carries a comment asserting `successTint` does not exist, directly
   above code using it.
5. The dead legacy marketplace (`contracts/contracts-list/**`, unused icons,
   `tools/`, orphaned `__tests__`) holds 40 frozen values and most of the lint debt.
   `components/tools/**` is NOT safe to delete — see item 2's sibling: it holds the
   only reveal-phrase / export-key UI, which is unreachable but is the blueprint for
   a feature the app is missing.

## Context
Build plan, graft ledger and the reasoning behind the grafts:
`~/brain/outputs/morpheus-pr3-*.md`. Reusable rules extracted from this work:
`~/brain/learnings/2026-07-16-*.md`. Subagent/builder output goes through an
adversarial review pass before commit; diffs ≥100 lines or touching money surfaces
likewise — that pass is what caught the frozen `grey`/`white` a hand-written sweep
missed.
