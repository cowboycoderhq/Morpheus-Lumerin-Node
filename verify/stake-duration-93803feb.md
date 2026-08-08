# Verify — the grok-build leader relay

Branch `stake-duration` · staged diff `93803feb` · 2026-08-08

## Why this exists

`/start` must open a paid blockchain session **on a keystroke, with no model in
the loop**. opencode structurally cannot do that: its plugin API declares a
`TuiPluginApi` the runtime does not provide, and its config-injected slash
commands are prompt *templates*, so the text goes to the model.

grok-build can, on one seam — its **leader Unix socket**. Its TUI is an ACP
client and its agent is an ACP server, talking over a socket whose path is
settable with `--leader-socket`. Sitting between them, we take `/start` off the
wire before the agent ever sees it.

## Proven at runtime before any of this was written

A throwaway relay was run against the real `grok 0.2.106`:

```
C->A register    {"client_type":"grok-shell","mode":"stdio",...}
A->C registered  {"leader_binary_version":"0.2.106",...}
C->A acp id=0    method=initialize
C->A acp id=8    method=session/prompt  PROMPT_TEXT="/start"   <<<< intercepted
C->A acp id=9    method=_x.ai/commands/list
```

Also established by that spike: `-p` headless does **not** use the leader (the
agent is built in-process), so this is TUI-only; and an unknown slash command
really does reach the model otherwise — grok replied *"Checking what `/start`
does in this environment."*

**Evidence standard:** this seam was verified by running it, not by reading
types. The two previous attempts on opencode were built on published types the
runtime did not honour, and both failed in the user's hands.

## The confidentiality rule, which the spike broke

That spike logged one session and captured a **live API key** out of the
`session/new` frame's MCP server env. Everything the user types crosses this
socket, and so does grok's own config. The logs were destroyed; the production
relay is built so it cannot repeat it:

- frames forward as their **original bytes**, never re-serialised
- `summariseFrame` is the only thing that may describe a frame, and it emits
  **type / method / id and nothing else** — no params, no results, no prompt text
- neither file writes frame content to disk
- **the relay makes no network calls at all** — it imports only `node:net` and
  `node:fs`, so "it cannot phone anywhere" is checkable by reading the imports.
  Whatever a command *does* lives in the app, on the other side of a callback.

## The version gate

The leader protocol is an internal seam with no stability promise. Two halves:

- **pin what we install** — grok's installer takes a version
  (`… | bash -s 0.1.42`)
- **verify what we connect to** — the handshake carries
  `leader_binary_version`; an unblessed build is **refused**, loudly, with the
  version named. An *absent* version is refused too: "we could not tell" must
  never read as "it is fine".

## Verification

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run build` | ✓ built |
| `npm run logic` | 350 passed, 0 failed |
| `npm run isolate` | 45 passed, 0 failed |
| `npm run openai` | **151 passed, 0 failed** |
| `npm run grok` | **83 passed, 0 failed** (new suite) |
| `npm run frozen` | 0 live findings |

The grok suite runs the **real relay over real Unix sockets** against a fake
agent: handshake, pass-through, interception, picker round-trip, and refusal.

### Two defects the end-to-end test caught

Neither was visible from the unit level:

1. **The picker answer never arrived.** Replies to a request *we* originate come
   back from the **client**, not the agent — the agent never saw the question.
   The reply check was on the wrong side.
2. **`stop()` did not stop.** Closing the listener leaves established
   connections running, so a stopped relay kept carrying traffic and held the
   agent's socket open. Now it tears down live sockets and resolves any pending
   dialog as cancelled.

### Mutation-tested — 9 of 9 caught

| Reverted property | Observed failure |
|---|---|
| `summariseFrame` echoes params (the spike bug) | 4 redaction checks fail |
| `summariseFrame` echoes a whole non-acp frame | register-frame secret leaks |
| command matched as a prefix, not a whole word | `/startle` is intercepted |
| an absent leader version counts as blessed | absent-version check fails |
| a malformed picker answer counts as consent | consent check fails |
| `/start` forwarded to the agent as well | `/start NEVER reaches the agent` fails |
| picker answer relayed on to the agent | 3 checks fail |
| the swallowed turn never completed | completion check fails |
| `stop()` leaves connections open | suite hangs (timeout, not an assertion) |

The last is a detection by hang rather than by assertion — worth knowing, since
a hang is a weaker signal than a named failure.

## Also in this diff

The endpoint suite gained a check that **unknown headers do not break
admission**. grok injects `X-XAI-Token-Auth` and two others into every request
to `127.0.0.1` (its `is_cli_chat_proxy_url` returns true for loopback
unconditionally), so a client we want to support sends headers we never asked
for. Pinned both ways: they are tolerated, and they cannot smuggle a browser
past the `Origin` refusal.

## NOT done, and NOT verified

- **`/start` does nothing yet.** The relay intercepts, raises a picker and
  completes the turn. Wiring it to catalog → quote → open, and supervising it
  from the app (spawn the real leader, spawn the relay, enable leader mode, and
  report loudly when the relay is down) is the next piece.
- **No live on-chain run.** Still true of everything on this branch.
- **The picker has never been rendered by the real TUI.** The suite drives a
  fake client that speaks the protocol; that the pager *renders* our
  `x.ai/ask_user_question` is inferred from grok's source, not observed.
- **One grok version is blessed** (`0.2.106`, the installed one). Any other
  build is refused until exercised.
- **The quiet-fallback risk is unaddressed here.** If the relay is not
  accepting, the pager silently falls back to its embedded agent — and a dead
  relay leads it to spawn a *real* leader on our socket path. Detecting and
  reporting that belongs to the app-side supervisor, not to the relay.
