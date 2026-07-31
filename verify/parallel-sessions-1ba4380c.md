# Verify evidence — parallel-sessions @ 1ba4380c

Closes the last known defect: the chat→session binding is now persisted when the
session **opens**, not when the first prompt is stored.

## Gates

| Check | Result |
|---|---|
| `npm run typecheck` | **exit 0** |
| `npm run build` | **exit 0** |
| Frozen-value gate | **exit 0** — 0 reachable |
| Logic checks | **169 passed, 0 failed** |
| Isolation cases | **26 passed, 0 failed** |
| `go build ./...` | **exit 0** |
| `go test -race ./internal/chatstorage/...` | **pass** |

## The decision — three-model council, unanimous

Asked Opus 5, Fable 5 and Grok 4.5 (non-Claude lane) to choose between:
A) `chat_id` on the session-open endpoints, B) a chat-scoped bind endpoint,
C) renderer-side durable store.

**All three chose B.** Reasons converged:
- **A** is a layering inversion — `blockchainapi` imports nothing from
  `chatstorage` today (verified: zero hits), and its open endpoints are shared by
  the CLI (`cli/chat/client/client.go:357`) and mobile SDK
  (`mobile/sdk_sessions.go:13`), where a chat id is meaningless. Upstream would
  reject it.
- **C** is a fourth copy of the truth, unreadable by the router — the same
  "renderer memory, but on disk" shape that generated this whole bug class.
- **B** is symmetric with the existing `UpdateChatTitle` on the same resource.

Implemented as `POST /v1/chats/:id/session` (POST, not PUT — the `Router`
interface has no `PUT`, and the sibling title route is already POST, so this adds
no interface surface).

Grok proposed a **D** (a chat-scoped endpoint that orchestrates open+bind,
removing the crash window). Not taken: it duplicates open logic across two
endpoints for a window measured in milliseconds, and Grok itself said "prefer D
if you can sell one chat-scoped endpoint; otherwise ship B."

**Write on EVERY rotation** — all three agreed. First-block-only would leave the
durable record naming a block that expired 305s ago.

## Council review of the implementation caught two criticals

Opus reviewed the built result and returned FAIL. Both were real:

**D1 — the persisted row was unusable.** `UpdateChatSession` wrote only
`SessionID`, so `GetChats` returned a row with an empty `ModelID` — and the
renderer discards any row whose modelId doesn't resolve to a known model. The
bound chat was invisible in the drawer, claimed nothing, and its paid session was
handed to the next unbound chat on that model. The binding existed and did
nothing. Now persists `modelId` too, with a test asserting the row is *usable*,
not merely present.

**D2 — nothing read the record on the path that steals sessions.** The boot
adoption path built its claimed set from the two keep-alive maps, which are refs
and are **empty after a relaunch** — precisely the "open a session, quit before
typing, reopen" case this change exists for. `chatTitlesQuery` was neither a
dependency nor read. A durable record no consumer consults is worse than none: it
makes the class look retired while the theft still happens. Boot now folds the
persisted bindings in, merged **per chat** rather than spread (a spread would
have dropped either the live or the persisted entry — the same key-overwrite that
already cost this branch two defects).

Also fixed from that review: the documented "a failed bind surfaces as an orphan"
contract was not implemented (return value ignored at both call sites) — it now
toasts. And rotation persistence was moved into `KeepAliveProvider`, because
Chat's mirror effect only fires for the chat on screen, so background rotations
would never have reached disk.

## Two bugs found by a probe left in the tree

A reviewer's stray probe file surfaced two real defects before I removed it:

- **`GetChats` panicked on any non-`.json` file** — `name[:len(name)-5]` on a
  4-character filename. It carries every binding, and gin runs without Recovery,
  so one stray file blanked the whole list.
- **A binding placeholder would have permanently untitled the chat.** The
  first-prompt metadata write was gated on `Messages == nil`, and the placeholder
  creates the file with an empty-but-non-nil slice — so title/modelId/isLocal
  would never have been set. Changed to `len(...) == 0`.

## No-adoption rule

Fable's condition for accepting B's crash window: adoption must be *refusable*.
Now that every new chat has a binding written at open, an unbound chat is either
genuinely old or a lost bind — and guessing an owner for the second case is how a
paid session got billed to the wrong chat. `resolveChatSession` takes
`allowAdoption`, and `orphanedSessions` surfaces sessions nobody claims. Orphaning
is bounded and visible; theft is neither.

## Falsification

`relaunch-honours-the-durable-binding` mutated (boot ignores the persisted set)
reproduces the theft exactly:

```
after relaunch a durably-bound session was billed under another chat:
[{"session_id":"0xsessA","chat_id":"0x601332dc…"}]
```

## Known and accepted

- **D3 — a scalar `SessionID` cannot represent the seamless overlap.** For
  ~`OVERLAP_SEC` (25s) two of a run's blocks are open and the field names only
  the newer, so the older is durably unclaimed for that window; likewise a
  retired run's final block is claimed in memory only. Accepted rather than
  changing the field to an array: the exposure is 25s against a ~305s block, and
  the in-memory retention covers the common case. Fixing it properly means
  `sessionIds []string` on the chat file.
- **B's crash window** — quit in the milliseconds between open returning and the
  bind landing leaves one unbound block. Accepted per the council: bounded,
  visible, and now surfaced as an orphan rather than adopted.

## Not verified

- **Still no running-app pass.** No `liveness.sh`, no live multi-chat test
  against a real provider. Everything here is static, unit, and
  isolation-mounted.
- The isolate virtual clock cannot represent a late timer, so the `tick`
  target-time guard remains untested.
- Lockfiles again excluded — machine-local `npm install` fallout from the DMG
  build, not part of this change.
