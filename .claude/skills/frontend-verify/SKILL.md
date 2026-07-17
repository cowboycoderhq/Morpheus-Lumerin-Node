---
name: frontend-verify
description: Run the Phase-D visual verification stack on the desktop client before committing any visual change — real-app launch, sentinel check, computed-style audit, state matrix on changed controls, motion-frozen screenshots, evidence file. Use after ANY change to *.tsx/*.css/theme files, and whenever the visual gate blocks a commit.
---

# frontend-verify — the Phase-D closed loop

Compiling is not rendering: green typecheck/build was the sole verification for 11 of the 12 defects shipped in the 2026-07 re-skin session (the 12th shipped on visible red). This skill exercises the *rendered artifact* in the states the change touches. Full process rationale: `~/brain/outputs/claude-code-frontend-process-2026-07-11.md`.

## Scope the run (blast radius, not the whole app)

Full stack on every state the change touches — the Phase-A state list ∩ changed controls/surfaces. Theme/token change → all routes, all themes. One component → its routes and states only.

## Steps

1. **Build current code** if the renderer changed since last build: `cd ui-desktop && npm run build` (the runner launches `out/`, not source).
2. **Run the instrument** (from repo root):
   ```
   cd tools/ui-verify && node run.js --routes '#/chat,#/models' \
     --expect '#/chat=textarea;#/models=[data-testid=models-container]' \
     --hue green --label '<what changed>'
   ```
   - `--routes`: the routes the diff affects (comma-separated hashes).
   - `--expect`: a route-identity marker PER ROUTE (a sentinel proves *a* live surface, not *the* one — the runner once green-stamped four shots of the setup wizard). New screens get a `data-testid`.
   - `--click 'sel => expectSel'` (repeatable; `hover ` prefix for hover-reveals): declare an assertion for anything the diff makes clickable/hoverable. Danger-named targets (send/pay/delete…) auto-downgrade to trial clicks; never bypass. `--allow-net` needs a written reason in the evidence file.
   - `--hue`: palette-leftover band for the current sweep invariant (`green` = pre-Aurora leftovers; change per migration).
   - It launches the REAL Electron app (real IPC), fails loudly on empty shells (sentinel) and wrong screens (identity), runs the computed-style audit (contrast pairs, hard corners, hue-band leftovers, dead scroll) AND the behavioral probes (clickability hit-tests, scroll write-back), takes motion-frozen screenshots, and writes `verify/<branch>-<stagedDiffHash>.md`.
   2b. **Claiming a dev-running app picked up a change?** `tools/ui-verify/liveness.sh ui-desktop` first — electron-vite rebuilds main/preload but does NOT restart Electron; cite the `LIVENESS: FRESH` line. The Stop-hook claim gate blocks behavior-change claims that cite no observation and carry no "unverified" label.
3. **Read the screenshots** (Read tool on the PNG paths it prints) and compare against the design reference / previous accepted screens. List differences; fix; re-run.
4. **State matrix on changed controls** — the audit and static shots cannot see hover/checked/focus. For every control the diff touched, use the Playwright MCP browser tools (or add a `--remote-debugging-port` attach) to drive: hover, click/checked, checked+hover, focus, disabled. Confirm each state visually or via computed styles. The lost-checkbox-fill and stale-spinner defects are only catchable here.
5. **Resolve findings**: fix each audit finding, or waive it in the evidence file with a one-line reason (e.g. "hard-corner on native scrollbar — out of scope"). Open findings with no waiver = not verified.
6. **Re-stage and re-run if you edited anything** — evidence is keyed to the staged-diff hash, so any edit after verification correctly invalidates it.
7. Commit. The visual gate checks the evidence file exists for the exact staged state; the git pre-commit hook runs typecheck+build.

## Failure handling

- Sentinel failure ("empty shell") → the app surface isn't live: check the build (`out/main/index.mjs` fresh?), or the screen needs main-process services this environment can't start — say so explicitly in the evidence file and verify that screen via the dev app manually. Never screenshot the bare Vite port for IPC screens.
- Runner crashes twice at this tier → escalate per the delegation ladder with the failure context; do not retry a third time.
- Before spawning any dev server, kill orphans: `lsof -ti:5173 | xargs kill` (stale servers polluted verification in the defect session).
