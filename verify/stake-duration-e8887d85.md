# Verify — `/start` in opencode: a session opened from the terminal

Branch `stake-duration` · staged diff `e8887d85` · 2026-08-08

## What this adds

`/start` inside `opencode`: pick a model (searchable) → pick a provider
(searchable, priced) → pick a duration → see the real stake → confirm → the app
opens the session on-chain.

Two parts:

1. **`/morpheus/v1/{status,catalog,quote,sessions}`** on the existing loopback
   OpenAI-compatible server. Namespaced away from `/v1` so a generic OpenAI
   client cannot reach the one route that spends.
2. **An opencode TUI plugin**, shipped as a string constant, written beside the
   app's own opencode config and declared as a `["<path>", {baseUrl, apiKey}]`
   tuple. The token reaches it as **data**, so the plugin file is byte-identical
   for every user and carries no secret.

## Where the security actually is

The confirmation dialog is a real boundary against an **agent** — a model cannot
press a key — but it is client-side, and anything holding the bearer token can
POST directly. It is UX plus agent-resistance, not enforcement. Enforcement:

- `allowAutoOpen` **off by default**; without it the route cannot spend at all
- per-session MOR cap, per-day MOR cap, and a **per-day session count** (the MOR
  caps alone do not bound a loop against a cheap model, and every open is a
  chain tx costing gas and locking its stake to end of day)
- the stake is **re-priced server-side** at spend time; a caller cannot name it
- `confirmedStakeMor` is honoured as a **ceiling** — see D2 below
- fail-closed when unpriceable, when a cap is not a usable number, and when a
  bid does not name its own model
- caps live in the app and no route on this server mutates config

## Verification

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run build` | ✓ built |
| `npm run logic` | **339 passed, 0 failed** |
| `npm run openai` | **141 passed, 0 failed** (was 35 before this branch) |
| `npm run isolate` | **43 passed, 0 failed** |
| `npm run frozen` | 0 live findings |

### The plugin is executed, not inspected

It ships as a string, so no compiler checks it. The suite writes it out,
`import()`s it for real, and drives the whole flow against the real server with
a fake TUI api — model → provider → duration → confirm → open, plus the refusal
and cancel paths. A check that asserted the source *contains* `/start` would
have proven nothing.

That test immediately earned its keep: the "cheapest" badge was tied to list
**position**, so a broken sort would have relabelled the dearest provider
"cheapest" and the check still passed. Now compared by price, and the fixture
carries a **tied-price** provider — the case where position-based and
price-based labelling genuinely differ.

## Adversarial review — verdict FAIL, six findings, all fixed

The reviewer executed real attacks rather than reading. Everything below was
demonstrated before it was fixed.

| | Defect | Now |
|---|---|---|
| **D1** | **A paid open reported as a failure.** After the chain tx landed, `resolveForHandoff` ran outside any `try`; a `/v1/models` body that is not an array is enough to throw → HTTP 500. The user was told the session did not open while the MOR was staked, and the session id was lost. An agent reading that retries and spends again. | Everything after the spend is best-effort in `try`. Always 200 with the id; `modelResolved: false` flags an unconfirmed name. |
| **D2** | **The confirmed figure was not the staked figure.** The comment claimed quote and open "price through the SAME function"; same function, different call, freshly re-read supply/budget. Doubling supply between quote and open staked **2×** what the dialog showed. | The plugin sends `confirmedStakeMor`; the app refuses with `409 price_moved` if its re-price exceeds it. A ceiling can only refuse, so trusting it is safe. |
| **D3** | **The bid↔model check failed open.** `String(bid.ModelAgentId ?? bid.modelId ?? modelId) !== modelId` is vacuously false for a bid carrying neither field — a session against model Y while the confirmation said X. | Requires the bid to name its model; fails closed. |
| **D4** | **Ambiguous failures released their reservation.** A router 200 with no session id may still have landed; releasing under-counts the day's spend, which this code's own rule calls the expensive direction. | Only a clean router refusal releases. Ambiguity keeps the reservation and warns the session may exist. |
| **D5** | `Number()` coercion accepted `"0x1000"` as **4096 seconds**, against a refusal message promising "a positive whole number". | JSON number only. |
| **D6** | `checkCaps` failed **open** on non-finite caps — every comparison is `x > cap`, false for `NaN`. | Refuses. (Not reachable in production; the config reader coerces. Hardening on the three lines between an agent loop and the wallet.) |

Also from the review: `writeFileSync`'s `mode` does not chmod a **pre-existing**
file, so the token-bearing config could keep 0644 forever — now `chmodSync` on
every write.

**Falsifiers the reviewer could not establish:** sixteen raw-socket routing
variants (case, `%2f`, `//`, `/./`, `;a=b`, trailing slash, five other methods)
all 404 with zero opens; `admitRequest` covers the new surface; the ledger
survives `sync()` and a port rebind and the rollback drops the right record by
identity; no token in any log line, error body or status response; the plugin
parses, imports, and matches the installed type surface.

### Mutation-tested — 9 of 9 caught

| Reverted fix | Observed failure |
|---|---|
| post-spend work unguarded (D1) | 5 checks fail |
| confirmed figure stops being a ceiling (D2) | 3 fail |
| bid/model check falls open (D3) | 2 fail |
| ambiguous failures release (D4) | 2 fail |
| `durationSec` coerced again (D5) | 4 fail |
| non-finite cap guard removed (D6) | 3 fail |
| `maxDailySessions` NaN guard removed | 2 fail |
| plugin skips the confirm dialog | 10 fail |
| plugin's cheapest badge back to index-based | 1 fail |

Two mutations were **discarded as invalid** rather than counted: one produced a
syntax error and one did not restore the old behaviour, so both "passed" for
reasons unrelated to the test. Re-run correctly, both were caught.

## Deliberately NOT verified

- **No live on-chain run.** No code on this branch has opened a real session.
- **The plugin has never been loaded by a real opencode.** The suite imports it
  directly with a fake TUI api. Two things that needs a live TUI to settle:
  whether calling Solid components as plain functions renders correctly inside
  `dialog.replace`, and whether `api.command.register` behaves as its (deprecated)
  types say in the installed build.
- **Version skew.** The plugin API was read from `@opencode-ai/plugin@1.18.10`
  on npm, matching the installed `opencode --version` of 1.18.10; the copy under
  `~/.config/opencode/node_modules` is **1.15.4**. The shapes used agree across
  both, but nothing here proves 1.18.10's runtime matches its published types.
- **The concurrency guard.** `serveOpenSession` re-checks caps synchronously
  before reserving. The check does **not** discriminate it: removing the guard
  leaves the suite green, because every path to the cap check goes through I/O
  while check-to-reserve is pure microtask. Five concurrent opens against a cap
  of one behave identically either way, including with the fake router releasing
  all five bid lookups in a single tick to force same-tick resumption. Cheap
  insurance against an interleaving I could not construct — not a fix for a
  demonstrated bug. Both the code and the test say so.
- **The in-memory ledger.** Daily caps reset if the app is relaunched. That is a
  one-restart workaround for a human and no workaround at all for an agent,
  which is the stated threat model.

## Known gap

**`/start` cannot set the active model.** opencode 1.18.10 exposes
`client.tui.openModels()` (open the picker) but nothing that selects a model.
After a successful open the plugin toasts the exact name and opens the picker —
one keystroke, not zero. Nothing in the plugin or SDK type surface closes this.

`/continue` (session listing and swapping) is not built.
