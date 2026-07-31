# Verify evidence — parallel-sessions @ 28ff68cc

Round-4 review of the five defect fixes returned **FAIL**. This commit fixes what
it found and repairs the tests that were not constraining what they claimed.

## Gates

| Check | Result |
|---|---|
| `npm run typecheck` | **exit 0** |
| `npm run build` | **exit 0** |
| Frozen-value gate | **exit 0** — 0 reachable findings |
| Logic checks | **161 passed, 0 failed** |
| Isolation cases | **25 passed, 0 failed** (was 23) |
| `go build ./...` | **exit 0** |
| `go test -race ./internal/chatstorage/...` | **pass** |

## Mutation results — every fix is now caught

The review used mutation testing (revert one fix, run the suite). That found two
fixes whose tests did not constrain them. Repeated after this commit:

| mutation | suite |
|---|---|
| M1 · fix-1 economy guard removed | **23 passed, 1 failed** |
| M2 · fix-2 boot filter removed | **23 passed, 1 failed** |
| M3 · fix-3 latch removed | **23 passed, 1 failed** |
| M4a · retention removed | **23 passed, 1 failed** |
| M4b · retained overlaid by live (old shape) | **23 passed, 1 failed** |
| M5 · stop-all gate reverted | **24 passed, 1 failed** |

Before this commit M3 and M5 both left the suite fully green.

## Defects fixed

### 1. Fix-1 was a regression: readonly cleared over a DEAD block
`Chat.tsx` mirror effect. `myRun.running` is not "this block is open". Economy
mode leaves a real gap (`REOPEN_DELAY_SEC` + up to ~7.5s of `fetchSession`
polling) where the run is running and `sessionsByChat` holds the **expired**
block. Clearing readonly there re-enabled the composer over a dead session and
the prompt went out against it. Now guarded on `!isClosed(myRunSession)`.

New case `economy-gap-does-not-unlock-a-dead-block` — the existing fixture used a
live block and structurally could not see this.

### 2. Fix-4 was incomplete: a restart wiped its own chat's retained claims
`publish()` seeded retained and then **assigned** live over it, so restarting a
run on a chat republished `chatA: []` — the previous run's final block (open for
up to a full block) lost its claim for the entire life of the new run, which is
exactly the hole retention exists to close.

Retained is now a **separate** context field (`retainedSessionIds`), unioned with
the live map only where entitlement is the question. It is deliberately NOT
merged into `sessionIdsByChat`, because `closeSession` maps an id back to a run
in order to STOP it — folding ended runs in would let an old id stop a healthy
new run on the same chat.

### 3. Fix-5 was incomplete: stop-all hid in the case it was built for
Gated on `!myRun?.running`, so standing inside any chat with a live run hid it —
and the unreachable run the fix targets is precisely a second, never-prompted
one. Now `runningCount - (own run ? 1 : 0) > 0`, rendering alongside the per-chat
Stop, labelled `Stop all renewing (N)`.

### 4. Pre-existing: duplicate chat rows
`setChatsData([...chatData, entry])` fired whenever a chat had no messages, which
is not the same as "not in the list" — a chat restored from the drawer with an
empty transcript was appended a second time. React's duplicate-key warning states
children may be duplicated **or omitted**, so a real chat can vanish from the
sidebar. Replaced both call sites with `upsertChat`. Confirmed pre-existing:
`git diff 3cf723ce HEAD` touches neither line.

## Tests repaired — several were not constraining their defect

- **`restore-race-{cold,warm}` tested fix 2 twice, not fix 3.** Both fixtures made
  *every* open session run-owned, so fix 2's filter emptied the list and boot
  short-circuited before the latch was ever consulted. Added an unowned session;
  M3 is now caught.
- **9 logic checks re-implemented production logic locally** and passed with the
  bugs applied — green suite, shipped defect. Deleted and replaced with checks
  that import the real `claimedSessionIds` / `adoptableSessions`, now extracted to
  `chat/utils.js` and called by `Chat.tsx`. One deleted check actively *encoded*
  the replace-not-merge semantics that loses claims, and its assertion was
  satisfied by merge and replace alike.
- **`/Stop renewing/i` also matched the per-chat button** — tightened to the
  `Stop all renewing (N)` form.
- **The boot case could pass vacuously with zero sends** — the fixture now has a
  legitimately adoptable session, so post-fix exactly one prompt is sent and the
  theft check has something to judge.
- **The `claimed-ids` probe spread `{...retained, ...live}`**, reproducing in the
  probe the very key-overwrite it exists to detect. Now merges per chat.

## Corrections to earlier claims in this branch

- I previously reported the restore-race cases as verifying fix 3. They did not:
  my falsification reverted all of `Chat.tsx` at once, so fix 2 and fix 3 moved
  together and fix 2's absence produced the failure. Mutation testing one fix at
  a time is what exposed this.
- An earlier suite failure was attributed to "load flake". It was a **stale vite
  dev server on port 5233** serving old case code; the same cause produced a
  bogus `ERR_CONNECTION_REFUSED` run. The harness is port-fragile and intermediate
  runs deserve less trust than I gave them.

## Still open

**A reopened, paid session is orphaned by any remount** (a third payment). Needs
the durability refactor — persist the binding at session OPEN rather than at the
first prompt — not another instance patch.

Unverified rather than cleared: failover persists the closed session id; the
aggregate gate under-reserves by one block while another run's first block is in
flight; and boot's filter is remount-only by construction (at real app start
`runsRef` is empty, so a process restart is still covered only by the durability
work).

## Not verified

- **Still no running-app pass.** No `liveness.sh`, no live two-chat test against a
  real provider.
- The isolate virtual clock advances by exactly the requested delay, so a late
  timer — the condition the `tick` target-time guard exists for — remains
  unrepresentable.
- Lockfiles are again excluded: the real `npm install` needed for the DMG rewrote
  both, and that is machine-local fallout, not part of this change.
