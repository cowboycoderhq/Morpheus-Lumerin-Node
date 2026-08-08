# Verify — Settings can reach the spend caps, and the opencode plugin is withdrawn

Branch `stake-duration` · staged diff `ec900f7f` · 2026-08-08

## What this changes

Three things found by actually running the app, plus the withdrawal of the
`/start` plugin because the API it was written against does not exist at
runtime.

### 1. The spend caps could not be edited at all

`Settings.tsx` read `e.target.value` in the cap handlers. This app's
`TextInput` calls `onChange({ id, value })` — **not** a DOM event — so every
keystroke threw `Cannot read properties of undefined (reading 'value')` and the
fields were inert. The switch that bounds what an outside tool may stake was
unreachable.

Found immediately on the first real run. The whole card had **no test**, which
is why it shipped.

Second defect in the same handler: it committed `Number(text)` per keystroke, so
clearing a field to retype wrote `maxStakeMor: 0` — a cap of zero refuses
everything. Now the fields hold draft text and commit only a usable number.

### 2. `/start` was unreachable by construction

The plugin and config were written **only** by the Chat tab's "Open in opencode"
handoff, which requires a model. So a user had to open a session in the app
before `/start` existed — and `/start` is the thing that exists so you do not
have to. Now:

- provisioning runs whenever the endpoint is up (opening Settings is enough)
- `openInOpencode` takes an optional model; without one, opencode launches with
  the provider configured and nothing preselected
- Settings gained an **Open opencode** button and the **allowAutoOpen** toggle,
  which had no UI at all — the feature could not be switched on

### 3. The `/start` plugin is withdrawn

`@opencode-ai/plugin` declares a `TuiPluginApi` — `api.ui.dialog`,
`api.command.register`, `DialogSelect`, `DialogConfirm`. **The opencode 1.18.10
runtime does not provide it.** Probed directly against the installed binary: a
directory-loaded plugin's `tui` export is called with `PluginInput` and nothing
more —

```
keys: client, project, worktree, directory, experimental_workspace, serverUrl, $
typeof api.ui: undefined   typeof api.command: undefined   typeof api.keymap: undefined
```

so the plugin threw on its first line and opencode logged
`failed to load plugin … "undefined is not an object (evaluating 'api.ui.dialog')"`
and skipped it. `/start` never appeared. The plugin is no longer installed, and
any copy an earlier build left behind is removed, so opencode stops erroring on
every launch.

**This is the same failure as the stake lock two days ago: published types
believed over the running system.** The evidence file for `/start` listed this
exact risk as UNVERIFIED. The flag was right; the risk was the one that fired.

### What IS verified to work in 1.18.10

Probed against the real binary, not documentation:

| Mechanism | Result |
|---|---|
| Plugin injects a slash command via `Hooks.config` | **works** — an injected `morphtest` appeared in opencode's own command list beside `init`/`review` |
| `Hooks.config` registers a provider | **works** — `morpheus-provider.js` loads clean and is installed |
| `~/.config/opencode/plugins/` auto-load | **works** — opencode found and attempted our file there |
| `permission.ask` hook (`ask`/`deny`/`allow`) | exists in the type surface |
| `command.executed` event + `event` hook | event type exists, hook fires; **NOT verified** that it fires for injected commands |
| `TuiPluginApi` dialogs / `command.register` | **absent at runtime** |

Injected commands are prompt **templates** by schema, so they reach the model.
There is therefore no verified keystroke-to-our-code path in opencode, which is
the requirement for opening a paid session. Hence the withdrawal rather than a
rewrite.

## A build-breaking trap, worth its own note

Adding the plugin's `import { readFileSync } from 'node:fs';` inside a
`String.raw` template made **vite's scanner read it as a real import of the main
bundle**. The main process output flipped from 2 `require(` calls to 29 and the
app stopped booting entirely:

```
App threw an error during load
ReferenceError: require is not defined in ES module scope
```

The generated plugin still needs a real import, so the source assembles that
line at runtime instead. Two checks now pin both halves: the generated files
must contain a real `import … from 'node:fs'`, and the source must not contain
one inside a template literal.

## Verification

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run build` | ✓ built |
| `npm run logic` | **350 passed, 0 failed** |
| `npm run isolate` | **45 passed, 0 failed** |
| `npm run openai` | **149 passed, 0 failed** |
| `npm run frozen` | 0 live findings |

New coverage where there was none: two isolate cases that **type into** the cap
fields and click **Open opencode**, and endpoint checks that build and import the
provider plugin for real and drive its `config` hook.

### Mutation-tested

| Reverted fix | Observed failure |
|---|---|
| caps handler reads `e.target.value` again | reproduces the exact shipped error |
| clearing a cap commits `0` again | `[0,2,2,2.5]` committed |
| Open opencode demands a model again | `it demanded a model` |
| provider plugin's descriptor guard removed | adds a provider pointed at nothing |

## Deliberately NOT verified

- **No live on-chain run.** Still true of everything on this branch.
- **`command.executed` as a native trigger.** It would be the only remaining
  route to a model-free `/start` in opencode. Unproven, and it is a side channel
  on a system that submits the prompt anyway — not a foundation for spending.
- **Grok Build as a replacement.** Being evaluated separately against three
  criteria: extension code on a user action with no model in the loop; support
  for an arbitrary OpenAI-compatible endpoint; and a controllable selection UI.

`/morpheus/v1` — catalog, quote, caps, ledger, re-price-at-spend-time — is
agent-agnostic and unaffected by any of this. Only the plugin was
opencode-specific.
