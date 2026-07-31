# Verify evidence — parallel-sessions @ 23404b72

**Change:** several rolling ("keep-alive") sessions renew CONCURRENTLY, including
several against the same provider, and each chat is bound to its own session.

## Gates

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | **exit 0** |
| Build | `npm run build` | **exit 0** |
| Frozen-value gate | `npm run frozen` | **exit 0** — 0 reachable findings |
| Logic checks | `npm run logic` | **152 passed, 0 failed** (was 142) |
| Isolation cases | `npm run isolate` | **18 passed, 0 failed** — run twice |
| Go build | `go build ./...` | **exit 0** |
| Go tests | `go test -race ./internal/chatstorage/...` | **pass** (4 new) |

The `aiengine` test-build failure (`prodia_sd.go:79`, `prodia_sdxl.go:79`,
non-constant format string) is byte-identical on baseline — pre-existing.

## What this ships

- `KeepAliveProvider` holds `Map<chatId, run>` with a per-run timer and identity
  token. Previously one run, one timer ref, one session, and `start()` opened
  with a blanket `stop()` — a second rolling session killed the first and
  overwrote its pending restake handle.
- `stop(chatId)` ends one run, `stop()` all. Chat-switch and new-chat no longer
  stop anything, so runs survive navigation. A "Stop renewing" header control
  replaces the implicit stop those calls used to provide.
- Per-chat session binding (`resolveChatSession`) replacing a model lookup, so
  two chats on one model no longer collapse onto one session.
- Aggregate stake reserve (`committedOverlapMor`): admitting run N+1 requires
  `free ≥ 2B + N·B`, which with `free = W − N·B` is `W ≥ 2B(N+1)` — exactly the
  all-runs-overlapping peak.
- `tick` re-checks `targetEndTime` before staking (a late timer — sleep,
  background throttling — otherwise bought a block past the user's target, one
  wasted stake per run).
- Go: `sessionId` persisted per chat; `fileMutexes` map guarded (see below);
  `GetChats` tolerates a zero-message file.

## Falsification — the tests were checked against the broken code

Green tests prove nothing unless they can fail. Two were falsified:

- Restoring the blanket `stop()` makes both `keepalive-*` isolation cases fail;
  the fix makes them pass.
- Removing the map guard makes the Go concurrency test produce
  `fatal error: concurrent map read and map write` — the crash it exists to catch.

`TestConcurrentWritesToDifferentChatsDoNotRaceOnTheMutexMap` covers a router-wide
crash: `initFileMutex` read-then-wrote `fileMutexes` while four call sites indexed
it unguarded. In Go that is a runtime throw, not a benign race — the proxy-router
dies, killing inference for every live session while stakes burn. Pre-existing,
but concurrent rolling sessions make two writes for different chats the normal
pattern, which is what makes it reachable.

## Review history — three rounds, and what they cost

Round 1 (Opus) and round 2 (Opus) found 12 defects, all fixed. Round 3 ran three
reviewers in parallel — Opus, Fable 5, and Grok 4.5 via the non-Claude council
lane (`:8785` was down; used mordiem direct).

Grok's two highest-severity findings were **wrong** — it received only the diff
and inferred an `else` branch that exists at `Chat.tsx:1156-1159`, and its
under-reservation claim does not survive the arithmetic above. Its real finds are
in the open-defect list below.

**Two of the defects fixed in round 3 were introduced by round 2's own fixes.**
Across three rounds this branch produced ~14 confirmed defects, most of them
money or misbilling. Green gates here mean "no known defect," and on this branch
that has repeatedly not meant "correct."

## KNOWN UNFIXED DEFECTS — shipped deliberately

Round 3 found six more (five executed against the real component). They are NOT
fixed in this commit. Four reduce to a single root cause that Fable 5 and Opus
identified independently:

> **MOR is spent at session OPEN. The durable record is written at the first
> PROMPT.** Everything in that window is the renderer reconstructing a binding
> from stale projections.

1. **Boot init can hand a rolling run's paid block to a brand-new chat**
   (`Chat.tsx:454,466` vs the restore guard at `:936-937`). Two chat files then
   permanently claim one session. Executed.
2. **`restoredOnceRef` latches optimistically** (`Chat.tsx:944`), before the
   restore has stuck. On a cold query cache the boot layout effect then clobbers
   it and restore can never re-fire. Correctness currently depends on cache
   warmth. Executed.
3. **After "Stop renewing", the run's still-open final block is unclaimed** for
   up to 305s and can be adopted by a legacy chat. Executed.
4. **Returning to a live rolling chat renders it READONLY** — `selectChat`
   resolves the persisted (lapsed) block and sets `isReadonly`; the mirror effect
   adopts the live block but never clears it. The user cannot type into a session
   they are paying to keep alive, while the header offers "Stop renewing".
   Executed, and verified independently. **This one is a regression introduced by
   round 2's fixes, and is the most user-visible item here.**
5. **A reopened, paid session is orphaned by any remount** — a third payment.
   Regression: the pre-diff model fallback used to rescue this case. Executed.
6. **A run started in a never-prompted chat is unreachable**: no drawer row, no
   Stop control (it renders only inside that chat), and no "stop all". The only
   reachable control is Sessions-tab Close — the early-close penalty path this
   design exists to avoid. Executed.

Also unverified rather than cleared: failover persists the closed session id
(`ai_engine.go:89` → `history.go:74`); and the aggregate gate under-reserves by
one block while another run's first block is still in flight.

## Recommended next step (not done here)

Persist the binding at OPEN time — pass `chat_id` on the session-open call or add
`PUT /v1/chats/{id}/session` — and make the renderer a read-through cache over
it. That closes 1/3/5/6 by construction and deletes `bindChatToSession`, the
freshness merge heuristic, and the claimed-set patch. The counter-argument, named
by the reviewer that proposed it: it widens a UI feature into backend surface
being kept minimal for upstream contribution.

## Not verified

- **No running-app pass.** `liveness.sh` was not run; no two-chat manual test
  against a live provider. No automated gate here substitutes for that, and given
  defect 4 above, the first manual test will hit a visible problem.
- The isolate virtual clock advances by exactly the requested delay, so it
  structurally cannot represent a late timer — the condition the new `tick` guard
  exists for is itself untested.
- No real simultaneous on-chain opens from one wallet; nonce/gas contention has
  zero coverage.
