# Verify evidence — parallel-sessions @ d92a9750

**Change:** five of the six known defects from the three-way review. The sixth
needs the durability refactor and is deliberately left open.

## Gates

| Check | Result |
|---|---|
| `npm run typecheck` | **exit 0** |
| `npm run build` | **exit 0** |
| Frozen-value gate | **exit 0** — 0 reachable findings |
| Logic checks | **161 passed, 0 failed** (was 152; 9 new) |
| Isolation cases | **18 passed, 0 failed** |

## Fixed

1. **Returning to a live rolling chat rendered it READONLY.** `selectChat`
   resolves a chat's PERSISTED binding, which for a rolling chat is whichever
   block was current at its last prompt — long lapsed — so it set readonly and
   nothing cleared it. The composer said "Session is closed" while the header
   offered "Stop renewing", and the user could not type into a session they were
   paying to keep alive. The mirror effect now clears readonly when it adopts a
   live block. **This was a regression introduced by an earlier fix on this
   branch**, and the most user-visible item in the set.

2. **Boot handed a live run's paid block to a brand-new chat.** The boot effect
   took `openSessions[0]` unconditionally and stapled it to a fresh chat id;
   during a run that IS the run's current block, so two chats claimed one stake
   and the router wrote that to disk on the next prompt. Chat unmounts on every
   tab switch, so this fired on a routine trip to Wallet and back, not only at
   startup. Boot now skips any session a live run owns.

3. **Restore vs. boot was a race decided by cache warmth.** `restoredOnceRef`
   latched, then the boot effect overwrote `chat` anyway, and which won flipped
   with react-query cache state — making the earlier restore fix accidentally
   correct rather than correct by design. Boot now respects the latch.

4. **A stopped run's final block became stealable.** Blocks are never closed
   early (that time-locks the stake), so a run's last block stays open for up to
   a full block after the run ends — but dropping its claim along with the run
   left that paid block adoptable by any unbound chat on the same model. Ended
   runs now retain their session ids. Retention is unbounded on purpose and
   costs nothing: an expired id is no longer in `openSessions`, so claiming it
   can never block anything real.

5. **A run in a never-prompted chat was unreachable and unstoppable.** Such a
   chat has no file, so it never appears in the drawer; the per-chat Stop renders
   only inside that chat; and there was no stop-all. The only reachable control
   was the Sessions-tab Close — the ~24h early-close lock the whole design exists
   to avoid. Added a "Stop renewing (N)" header control that appears whenever
   runs are live elsewhere.

## STILL OPEN — needs the durability refactor

**A reopened, paid session is orphaned by any remount, costing a third payment.**
`bindChatToSession` writes React state only; the binding becomes durable solely
on the next prompt. Reopen a session, switch tabs before typing, come back — the
app has forgotten, and Reopen is the only way forward. This is a regression from
pre-diff behaviour, where the model fallback rescued exactly this case.

It shares its root cause with items 2 and 4 above, which are patched here at the
instance level rather than at the cause:

> MOR is spent at session OPEN. The durable record is written at the first
> PROMPT. Everything in that window is the renderer reconstructing a binding from
> state that does not survive.

The repair both Fable 5 and Opus proposed independently: persist the binding at
open time (`chat_id` on the session-open call, or `PUT /v1/chats/{id}/session`)
and make the renderer a read-through cache over it. That closes this by
construction and deletes `bindChatToSession`, the freshness merge heuristic, and
the claimed-set patch. Counter-argument, named by the reviewer proposing it: it
widens a UI feature into backend surface being kept minimal for upstream.

Also still unverified rather than cleared: failover persists the closed session
id; the aggregate gate under-reserves by one block while another run's first
block is in flight.

## New checks

9 added. The retention ones include the inverse case — that without retention the
stopped run's block WOULD be adopted — so the test fails if the fix is removed
rather than merely passing alongside it.

## Note on lockfiles

Building the DMG required replacing this worktree's symlinked `node_modules` with
a real install (electron-builder walks the dependency tree itself and its Yarn
collector died on the symlink). npm 7+ rewrites a `yarn.lock` when it finds one,
so that install rewrote BOTH lockfiles — ~4900 lines, registry URLs changed. That
is machine-local install fallout, not part of this change, and rewriting
`yarn.lock` could alter what electron-builder's collector sees. Both lockfiles
were restored to HEAD and are NOT in this commit.

## Not verified

- **Still no running-app pass.** No `liveness.sh`, no two-chat test against a
  live provider. Fix 1 in particular is a UI-state fix whose whole point is what
  the user sees, and it has been verified only by reading and by typecheck.
- The isolate virtual clock advances by exactly the requested delay, so a late
  timer — the condition the `tick` target-time guard exists for — remains
  unrepresentable in the suite.
