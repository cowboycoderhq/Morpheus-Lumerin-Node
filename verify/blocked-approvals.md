# Blocked findings — decision memo

> **Scope note.** This report was written against the full audit tree. The
> audit-run orchestration, the per-commit coherence records, the raw
> model-output rounds and the review screenshots stayed local and are not
> included in this branch — so citations below to run scripts under
> `tools/docs-audit/` (the checkers ship; the runners do not), to numbered
> `verify/round*/` directories, and to `verify/coherence/` records will not
> resolve here. The findings and the evidence for them are reproduced in full;
> only the run artifacts are absent.

Worklist: the loop's blocked-findings queue file, kept locally (17 findings the
loop confirmed, then could not fix because every occurrence sat in a file it may
not edit).

Every finding below was re-verified **against source**, not against another
document. The loop's own verdicts were not inherited. Two did not survive that
check; two more had already been fixed in-tree by the time this memo was written.

## Bottom line

| | count |
|---|---|
| findings in worklist | 17 |
| REAL and still open | 13 |
| REAL but already fixed in-tree (no action) | 2 |
| NOT REAL (disproved — do not spend time) | 1 finding + the code half of a 2nd |
| distinct issues after collapsing duplicates | **9 open** |
| decisions you actually need to make | **7 groups** |

Duplicate pairs (one decision covers both): `0253ee0d5092`+`f1edbc478755`;
`d751e49924bd`+`db3d2b86de02`; `6b9e00e4a959`+`8a3882feb9a1`;
`624393604506`+`e9969a800289`.

**No Solidity change is required by anything in this worklist.** The Solidity was
the *arbiter* for four findings, not the defect. Nothing here touches deployed
bytecode or a future deployment. `smart-contracts/contracts/diamond/facets/SessionRouter.sol`
should stay exactly as it is.

---

## Group A — the audit's own tooling: gate DOCUMENTATION drifted from gate CODE

Findings: `f987ac29d4eb`, `0253ee0d5092`, `f1edbc478755` (last two are the same issue).

**Status — FIXED on this branch.** The finding was real when filed; it is kept
here, in the state it was found, because a blocked approval that was resolved is
part of the audit record and deleting it would be the exact failure this branch
exists to correct. The repair shipped in `.githooks/README.md`; the evidence that
settles it is under *Verification now*, below. One clause of the finding as filed
described a gate this branch does not ship, and is corrected in place.

**What was wrong.** `.githooks/README.md` is the only place a human learns what the
hooks do, and it described a strictly smaller set of gates than the hooks ran.

1. `.githooks/README.md`, the `pre-commit` bullet — "`pre-commit` — the identity-leak gate ... plus the
   existing typecheck+build gate". The hook runs **three** gates: identity-leak
   (`.githooks/pre-commit:25`), documentation gates (`.githooks/pre-commit:39`,
   `node scripts/docs-gates.mjs --staged`, fired whenever a `.md`/`.mdx`/
   `tools/docs-audit/` path is staged), then the build gate
   (`.githooks/pre-commit:51`). The hook's own header at `.githooks/pre-commit:3`
   literally says "Three gates, in order".
2. `.githooks/README.md`, the `pre-push` bullet — "`pre-push` — the identity-leak gate again". The
   hook additionally runs the full documentation gate set and exits on its code.

   > **Corrected since filing — one clause of this item is not true of what ships.**
   > As filed, this item also said the hook requires `verify/coherence/<sha>.md` for
   > every doc-changing commit in the push range and sets `FAILED=1` if absent. That
   > described the hook in the **audit tree**, where the audit ran under a per-commit
   > coherence requirement. The requirement was **not carried into this branch**: the
   > component that writes those records is audit-run orchestration, which stays local
   > (see the scope note at the top). Shipping the enforcement without the writer would
   > block every doc-changing commit on evidence nothing here can produce, so the block
   > was removed from `pre-push` along with the rest of the lane. On this branch
   > `grep -rn coherence .githooks/` returns nothing. This is also why reports in this
   > directory cite `verify/coherence/` records that do not resolve here.
3. Bonus, same class, not separately filed: `.githooks/README.md`'s bypass
   paragraph says
   `.github/workflows/opsec-check.yml` "runs the identical checks server-side".
   The documentation gates are mirrored by a *different* workflow —
   `.github/workflows/docs-gates.yml` — as `.githooks/pre-commit:18-20` states.

**Verification as filed.** Read both hooks end-to-end; `grep -c "docs-gates\|coherence"
.githooks/README.md` returned **0** — the README named neither the documentation
gates nor the coherence lane.

**Verification now — this is what settles it.** The same command returns **3** on
this branch:

```
$ grep -n "docs-gates\|coherence" .githooks/README.md
21:the identity-leak gate and `.github/workflows/docs-gates.yml` for the
28:  (`scripts/docs-gates.mjs --staged`, run only when documentation or one of its
32:  gate set (`scripts/docs-gates.mjs`, including the history-dependent gates
```

All three hits are `docs-gates` and none is `coherence`, which is the correct
result rather than a partial fix: the README documents the gates that ship and
does not document a lane that does not. The shipped README names all three
`pre-commit` gates, `pre-push`'s full gate set, and both mirroring workflows by
name. A reviewer running the *as filed* command above will get 3, not 0 — that is
the repair, not a contradiction of this entry.

**The change — applied.** Prose only, in `.githooks/README.md`. What shipped is
below; the coherence clause of the original proposal was dropped, because the
requirement it described was not carried into this branch:

```
- `pre-commit` — three gates, cheapest/most-severe first: the identity-leak gate
  (`scripts/check-identity-leak.mjs --staged`); the documentation gates
  (`scripts/docs-gates.mjs --staged`, run only when documentation or one of its
  checkers is staged); and the typecheck+build gate, path-scoped to `ui-desktop/`.
- `pre-push` — the identity-leak gate over the actual commit range and content
  about to become public (`--diff` and `--commits`); then the full documentation
  gate set (`scripts/docs-gates.mjs`, including the history-dependent gates
  `--staged` skips). Either one blocks the push.
```

and the bypass paragraph now names both `opsec-check.yml` and `docs-gates.yml`
(`.githooks/README.md:20-22`).

**Blast radius if wrong.** Zero executable risk — it is a README. The cost of
having left it wrong was that a contributor hits a documentation gate with no idea
such a gate exists, and reaches for `--no-verify`.

> **Approved and applied — as a one-off human edit, with `.githooks/` kept closed to the loop.**
> `.githooks/README.md` is technically a `.md` and therefore inside this agent's
> nominal write allowlist. It was deliberately **not** edited by the loop; the
> correction above was made by hand. Reason: if the audit
> loop can rewrite the document that describes the gates, then a hook that silently
> *loses* a gate gets its README "corrected" to match, and the drift becomes
> invisible in exactly the direction that matters. The README's value is that it is
> an *independent* record of intent. Opening `.githooks/` to an automated fixer
> destroys that property for a three-line saving.

---

## Group B — the audit's own tooling: a CI gate under-scans (real hole, not a doc bug)

Finding: `8ac0b0dd9e36`.

**Status — RESOLVED on this branch; the step it was filed against no longer exists.**
Kept in full because the reasoning is what justified the range logic that did ship,
and because the finding was the highest-value one in the worklist.

**What was wrong.** In the **audit tree**, `.github/workflows/docs-gates.yml` carried a
step named "Every doc-changing commit must carry a coherence record", and that step set
`RANGE="HEAD~1..HEAD"` when `github.event.before` was empty or all-zeros — the push of a
brand-new branch. `HEAD~1..HEAD` is exactly **one** commit
(`git rev-list HEAD~1..HEAD | wc -l` → `1`), so on the first push of a branch
carrying N doc-changing commits, N-1 of them were never checked and CI was green.

The local `pre-push` hook did **not** have this hole: on a new ref it walks back to
the oldest commit not reachable from any remote (`.githooks/pre-push:26-32`). So the
layer the workflow's own header (`.github/workflows/docs-gates.yml:3-7`) calls "the
only layer a committer cannot skip" was **weaker** than the layer it backstops.

> **Two things changed since filing — do not go looking for this step.**
> (1) The per-commit coherence requirement was **not carried into this branch**, because
> the component that writes those records is audit-run orchestration that stays local
> (see the scope note at the top). The step that enforced it was removed with the rest
> of the lane: `grep -rn -i coherence .github/` returns nothing here.
> (2) The range arithmetic the finding was actually about was **fixed** where it still
> matters — the same all-zeros case now governs the diff base for the three
> history-dependent gates, and it resolves the fork point instead of truncating to one
> commit: `CAND="$(git merge-base "origin/<default-branch>" "$TIP")"`
> (`.github/workflows/docs-gates.yml:67-73`). The comment there states the reason in
> this finding's own terms — a first push carrying N commits "would otherwise check one
> and report green on the other N-1". The workflow additionally refuses to run at all on
> an unresolved base rather than passing vacuously
> (`.github/workflows/docs-gates.yml:93-97`).
> The line numbers this entry cited as filed (`:40`, `:52`) no longer point at the
> quoted text.

**Verification.** Mechanism verified by reading + the local `rev-list` count above.
The *trigger* (GitHub sets `event.before` to all-zeros on a new branch's first push)
is documented GitHub push-event behaviour but was **not** exercised here — no CI run
was available. Flagged as unverified-in-this-environment; the range arithmetic itself
is verified. **That caveat still stands for the shipped `merge-base` form**: it is
verified by reading, not by a CI run, because no CI run has been available at any
point in this work.

**The change — applied, in the second of the two forms proposed.** The zeros branch no
longer truncates to one commit; it falls back to the merge-base against the default
branch. The checkout is `fetch-depth: 0` (`.github/workflows/docs-gates.yml:28-31`), so
the history needed for that is present.

**Blast radius if wrong.** A too-wide range makes CI measure commits inherited from
upstream history and blocks pushes that should pass — noisy but safe and immediately
visible. A too-narrow range was the state as filed: silent false green. Failure is loud
in one direction and silent in the other, which argued for erring wide, and the shipped
`merge-base` form errs that way.

> **Approved and applied — human-authored, with `.github/` kept closed to the loop.**
> Same reason as Group A, stronger: this file *is* gate logic. An automated fixer with
> write access to the workflow that judges it can make its own failures disappear.
> `.githooks/`, `.github/`, `scripts/`, and `tools/docs-audit/` should stay permanently
> closed for that reason alone — not because the findings in them are low-value (this
> one is the highest-value finding in the worklist) but because the *fixer* must not be
> the *judge*.

---

## Group C — comment-only in Go source, file not yet approved (2 lines, 2 files)

Finding: `a0c2589a229c`.

**What is wrong.** Two Go comments say the stake lock is caused by closing **early**.
It is not. The contract locks on **any** close that lands before `releaseAt_`,
including a natural or late close on the same UTC day.

- `proxy-router/internal/blockchainapi/controller.go:66` — "Stake time-locked by
  closing sessions EARLY."
- `proxy-router/internal/blockchainapi/structs/res.go:28` — "StakesOnHoldRes reports
  stake time-locked by closing sessions early."

**Source that proves it.** `smart-contracts/contracts/diamond/facets/SessionRouter.sol:296-305`:

```solidity
uint128 sessionEnd_    = uint128(session.closedAt.min(session.endsAt));
uint128 startOfEndDay_ = startOfTheDay(sessionEnd_);
uint128 releaseAt_     = startOfEndDay_ + 1 days;
...
if (block.timestamp < releaseAt_) {          // <-- the only condition
```

There is no `isEarly` term anywhere in `_rewardUserAfterClose`. Corroborated by
`docs/ai/session-states-open-close-recover.mdx:41` ("Applies to **early close and
same-day natural/late close**") and by the mainnet measurement recorded at
`ui-desktop/src/renderer/src/utils/marketplace.ts:349-352` — two sessions closed
3s and 31s **after** `endsAt` still locked 28.1413 MOR of a 28.1569 MOR stake.

**The change.** Two comment lines. `EARLY` → `before the end of the UTC day the
session ended in (any close, not only an early one)`.

**Blast radius if wrong.** Zero. Neither string is compiled into behaviour, and
neither reaches the published API docs — `grep -rn "StakesOnHold\|stakes/on-hold"
proxy-router/docs/` returns nothing, so `res.go:28` is a plain godoc comment, not a
swaggo definition description. No regeneration needed.

> **Recommend approve.** Cheapest approval in the worklist: two comment lines, zero
> compile impact, and the wrong version actively misleads — a user reading it concludes
> that letting a session expire naturally avoids the lock, which is the single most
> expensive misconception in this product's surface area.

---

## Group D — swaggo annotation collision (needs a swagger regeneration)

Findings: `6b9e00e4a959`, `8a3882feb9a1` (same issue).

**What is wrong.** Two handlers carry the **same** `@Router` annotation.

- `proxy-router/internal/blockchainapi/controller.go:401` — `getBidsByModelAgent`,
  `@Router /blockchain/models/{id}/bids [get]`. **Correct**; registered at
  `controller.go:57`.
- `proxy-router/internal/blockchainapi/controller.go:439` — `getActiveBidsByModel`,
  `@Router /blockchain/models/{id}/bids [get]`. **Wrong**; actually registered at
  `controller.go:59` as `/blockchain/models/:id/bids/active`.

**The damage is already in the shipped artifact.** The collision did not produce a
warning — one entry silently overwrote the other. `proxy-router/docs/swagger.yaml:1643`
declares `/blockchain/models/{id}/bids`, and `:1678` gives its summary as
**`Get Active Bids by Model`**. So the published swagger:

1. describes `/blockchain/models/{id}/bids` as returning *active* bids, when that path
   is served by `getBidsByModelAgent` and returns *all* bids; and
2. omits `/blockchain/models/{id}/bids/active` **entirely** — `grep -rn "models/{id}/bids/active"
   proxy-router/docs/` returns nothing, while the analogous
   `/blockchain/providers/{id}/bids/active` *is* documented (`swagger.yaml:1844`).

**The change.** One comment line — `controller.go:439` gains `/active` — **then
regenerate** (`swag init`), which rewrites `proxy-router/docs/docs.go`,
`swagger.json`, and `swagger.yaml`. Flagged separately per your instruction: this is
a comment that *compiles into* the docs artifact.

**Blast radius if wrong.** No route, handler, or signature changes; `@Router` is inert
at runtime. The regenerated `docs.go` is compiled Go, so the build must be re-run, but
its only content is a documentation string constant. The one way this could be wrong is
if `/bids/active` were slated for deletion and the annotation was deliberately pointing
at its replacement — nothing in the tree supports that, and the route is live at
`controller.go:59`. Note also that **no `.mdx` page references either path**
(`grep -rn "models/{id}/bids" docs/` is empty), which is why the `routes` gate passes
today; the defect is confined to the Swagger UI.

> **Recommend approve.** Low risk, and it is the only finding here that misleads a
> third-party API consumer into calling the wrong endpoint and silently getting a
> superset of what they asked for. Please schedule the `swag init` regeneration in the
> same change — the annotation fix alone leaves the shipped `swagger.yaml` wrong.

---

## Group E — comment-only in a UI source file, file not yet approved

Finding: `7d4be13482a7`.

**What is wrong.** `ui-desktop/src/renderer/src/components/keepalive/KeepAliveProvider.tsx:122-123`,
in the `reserveWei` docblock: "A closed block's stake is held to the end of the UTC
day, so nothing is recycled into the next block in either restake mode."

That universal is false, and the **same file** contradicts it twice:

- `KeepAliveProvider.tsx:35-39` gives the correct day-slice formula — the lock covers
  only `min(endsAt, closedAt) − max(openedAt, startOfDay(closedAt))`, i.e. the portion
  inside the closing day. `KeepAliveProvider.tsx:166` says the current cap is **7 days**,
  and `maxSessionDuration` is operator-settable
  (`smart-contracts/contracts/diamond/facets/SessionRouter.sol:72-77`), so multi-day
  blocks are ordinary. A 7-day block returns ~6/7 of its stake at close, and that ~6/7
  *is* available to fund the next block.
- `KeepAliveProvider.tsx:46` says a block closed on a **later** UTC day than it ended
  "returns the stake IN FULL ... hold delta exactly 0" — measured. Nothing is held.

Both are confirmed by `SessionRouter.sol:296-313`: the lock is anchored to
`startOfTheDay(min(closedAt, endsAt))` and fires only while
`block.timestamp < releaseAt_`.

**The change.** Reword `:122-123` to state the actual rule and why the code is
nonetheless mode-independent. Suggested: *"Mode does not matter. What a close returns
immediately is only the portion of the block outside the closing UTC day, so a renewing
run cannot count on recycling — reserve the full per-block stake in both modes.
Skipping sequential runs here let the gate approve runs the wallet could not fund."*

**Blast radius if wrong.** Zero runtime risk: this is a docblock, and the `reserveWei`
code below it (`:133-155`) already errs conservative — it reserves the whole per-block
stake regardless. Over-reserving can only produce a false *refusal* of a run the wallet
could in fact fund; it can never approve one it cannot. The defect is that the stated
*reason* is wrong, so the next person to "simplify" `reserveWei` will do it from a false
premise. Same wording appears at `KeepAliveProvider.tsx:825` and should go with it.

> **Recommend approve.** Comment-only, one file, no build or test impact.

---

## Group F — executable code change: the CLI silently truncates session lists at 10

Findings: `d751e49924bd`, `db3d2b86de02` (same issue).

**Important correction to the finding's framing.** The finding says the documentation
"contradicts the specified API contract". It does not — **the documentation is
correct**. `/blockchain/sessions/user` really does accept `offset`/`limit`/`order`
(`proxy-router/internal/blockchainapi/controller.go:781-784`). The defect is in the
**CLI client**, and it is worse than a missing feature.

**What is wrong.** `cli/chat/client/client.go:326` —
`ListUserSessions(ctx context.Context, user string)` — builds the URL at `:329` as
`/blockchain/sessions/user?user=%s` with no paging parameters. Called once, at
`cli/main.go:620`.

The server does **not** treat "no limit" as "no limit". `getSessionsForUser` uses the
*defaulting* binder (`controller.go:784`, `getOffsetLimitOrder`), whose struct is
`proxy-router/internal/blockchainapi/structs/req.go:32-35`:

```go
Limit uint8 `form:"limit,default=10" ...`
```

So `morpheus session list --user <addr>` returns **at most 10 sessions**, prints them
as though that were the complete set, and offers no way to reach page 2. There is no
error and no indication of truncation. (Contrast `getOffsetLimitOrderNoDefault` at
`controller.go:1220` / `req.go:38-42`, `default=0`, which this endpoint does not use.)

**The change — a signature change.** `ListUserSessions(ctx, user string, offset *big.Int,
limit uint8, order string)`, threading the values into the query string, plus `--offset`
/ `--limit` / `--order` flags on the `listBlockchainSessions` command.

**Blast radius.** The method has exactly **one** caller (`cli/main.go:620`), so the
signature change is contained and the compiler finds any miss. Getting it wrong yields
a compile error, not a silent regression — this is a cheap change to verify.

**Not flagged by the audit but identical:** `ListProviderSessions`
(`cli/chat/client/client.go:336`) has the same shape, and its endpoint also uses the
defaulting binder (`controller.go:860`). Fix both or the CLI stays half-broken.

> **Needs your judgement.** Not because the defect is doubtful — it is verified — but
> because the *scope* is a product call: minimal (add the parameters, default them to
> today's behaviour) versus correct (have the CLI page to exhaustion so `session list`
> means what it says). It is also the only finding here that changes a function
> signature, and `cli/` is not in the loop's allowlist for good reason.

---

## Group G — executable code change: an example script hardcodes the wrong chain's token

Finding: `79cdfb4f3420`.

**What is wrong.** `agents/agent-user-request.js:13` hardcodes a single token
address as `const MOR_TOKEN = ...`. Compared byte-for-byte against the deploy
configs, that value is the **Arbitrum Sepolia** MOR token — it matches
`smart-contracts/deploy/data/config_arbitrum_sepolia.json:2` and nothing else.

Every environment file the repo ships targets **Base**, and none of them uses that
address. (Addresses are deliberately not reproduced here — compare the files.)

| file | which chain's MOR it names | chain id |
|---|---|---|
| `agents/agent-user-request.js:13` | Arbitrum Sepolia (`config_arbitrum_sepolia.json:2`) | — |
| `.github/workflows/proxy-router.test.env:20` | Base Sepolia (`config_base_sepolia.json:2`) | `84532` (`:22`) |
| `proxy-router/.env.example:16` | Base mainnet (`config_base_mainnet.json:2`) | `8453` (`:18`) |
| `proxy-router/.env.example:23` (testnet block) | Base Sepolia | `84532` (`:25`) |

So the allowance created by step 3 of `agents/readme.md` is keyed to a token the
proxy-router does not recognise as MOR, and the agent user is created with an
allowance that can never be spent. `agents/readme.md:6-9` tells the reader to update
`config.js` and lists `proxyRouterUrl`, `modelId`, `agentUsername`, `agentPassword`,
`agentPerms` — the token address is **not** among them, and is not in `config.js`
(`agents/config.js`) at all. There is no documented way for the reader to correct it
short of editing the script.

**The change.** Either (a) move `MOR_TOKEN` into `agents/config.js` and document it in
`agents/readme.md` as a value the reader must set, or (b) have the script read the
router's own configured token — `GET /config` exposes it (`proxy-router/internal/config/config.go:295`,
`publicCfg`), which removes the constant entirely and cannot drift.

**Blast radius.** `agents/` is standalone example code with no importers — nothing in
the build or test path depends on it. If the change is wrong the example fails
loudly at run time for the person running the example, which is exactly where it should
fail. Option (b) is strictly more robust; option (a) is a two-line change.

> **Needs your judgement**, on scope only. The defect is verified and unambiguous.
> The question is whether the example is meant to be chain-agnostic (→ b) or is simply
> stale from an Arbitrum-era snapshot (→ a). If you want the cheap call: (a) now,
> because it is small and reversible, with (b) as the real fix.

---

## Group H — dangling file reference in two non-code text files

Findings: `624393604506`, `e9969a800289` (same issue, two occurrences).

**What is wrong.** Two files point readers at a file that does not exist:

- `.github/workflows/proxy-router.test.env:3` — "Full ENV details can be found in
  /docs/proxy-router.full.env"
- `proxy-router/.env.example.win:3` — identical line.

`ls docs/proxy-router.*.env` returns only `docs/proxy-router.all.env`. There is no
`full.env` anywhere in the tree.

**The correct target is verified complete, not just present.** `proxy-router/.env.example:3`
already points at `all.env` and claims it "is verified against config.go and includes all
live tags". That claim was checked mechanically rather than taken on trust — set-difference
of every `env:"NAME"` tag in `proxy-router/internal/config/config.go` against every
`NAME=` in `docs/proxy-router.all.env`:

```
config.go env: tags       63
all.env variables         62
in config.go, not all.env: EXPLORER_API_URL
in all.env, not config.go: (none)
```

and `EXPLORER_API_URL` is a **commented-out** field (`config.go:31`), i.e. not a variable
the proxy-router reads — exactly as `docs/proxy-router.all.env:1-4` states. So the header
is accurate and redirecting readers to `all.env` is safe. (Note: earlier adjudications in
`verify/loop-findings.md` around lines 2629-2802 assert `all.env` is incomplete and missing
`LLM_TIMEOUT`, `CNODE_PNODE_TIMEOUT`, `MODEL_HEALTH_CHECK_PROBE_DELAY`. Those are **stale** —
all three are present today. Do not re-open on that basis.)

**The change.** `full.env` → `all.env`, one line each, in two files. Both are comment
lines in `.env` fixtures; neither is parsed by anything.

**Blast radius.** Zero. A `#` comment in a `.env` file.

> **Recommend approve** for `proxy-router/.env.example.win`.
> **Recommend approve, but as a human edit** for `.github/workflows/proxy-router.test.env`,
> purely to keep the "`.github/` stays closed to the loop" rule categorical. A rule with a
> "unless it's only a comment" exception is a rule someone will later argue their way past.
> If you would rather not carve out an exception at all, note that
> `proxy-router/.env.example.win:2` also says "Contract and Token current as of 1/15/2025"
> while the workflow file says "11/15/2024" — worth doing both in one pass either way.

---

## NOT REAL — disproved; do not spend time on these

### `49c188e174ad` — "Runner and visual gate compute different evidence filenames"

**Claim.** `tools/ui-verify/run.js:97` preserves a trailing underscore when sanitising
the branch name; `.claude/hooks/visual-gate.sh:23` strips it with `sed 's/_$//'`; so for
a branch `feature_` the runner writes `verify/feature_-<hash>.md` while the gate looks for
`verify/feature-<hash>.md`, blocking a verified commit.

**Disproof.** The finding missed what the `sed` is *for*. `git rev-parse --abbrev-ref HEAD`
emits a trailing **newline**. `tr -c 'a-zA-Z0-9._-' '_'` converts that newline to an
underscore; `sed 's/_$//'` removes exactly that one character. `run.js` never sees the
newline because its `sh()` helper calls `.trim()` (`tools/ui-verify/run.js:96`). The two
are equivalent:

```
$ printf 'feature_\n' | tr -c 'a-zA-Z0-9._-' '_' | od -c
0000000   f  e  a  t  u  r  e  _  _          <- newline became the 2nd underscore
$ printf 'feature_\n' | tr -c 'a-zA-Z0-9._-' '_' | sed 's/_$//' | od -c
0000000   f  e  a  t  u  r  e  _             <- back to the branch name
```

Both sanitisers were run over the finding's own counterexample and four more:

```
main         js=[main]        sh=[main]        MATCH
feature_     js=[feature_]    sh=[feature_]    MATCH   <- the claimed failure case
loop-fixes   js=[loop-fixes]  sh=[loop-fixes]  MATCH
feat/x       js=[feat_x]      sh=[feat_x]      MATCH
a__          js=[a__]         sh=[a__]         MATCH
ünicode      js=[_nicode]     sh=[_nicode]     MATCH
```

No divergence exists. **No change needed. Closed.**

### `fb43156bf9b8` — the *executable* half is not real (its comment half was real, and is fixed)

**Claim.** `marketplace.ts`'s `earlyCloseLock` "anchors the day-clamp and unlock time to
the close timestamp, so for natural closes where `closedAt > endsAt` (especially across a
UTC boundary) [it] predict[s] a different locked amount and release time than the deployed
contract."

**Disproof.** The anchor really does differ textually — `earlyCloseLock` uses
`startOfDay(now)` (`ui-desktop/src/renderer/src/utils/marketplace.ts:463`, `const startOfDay = now - (now % BigInt(DAY))`) where the
contract uses `startOfTheDay(min(closedAt, endsAt))` (`SessionRouter.sol:296-297`). But the
two are **functionally equivalent**, because the case where the anchors diverge is exactly
the case where both produce zero:

- The anchors differ only when the close lands on a **later** UTC day than the session
  ended. In that case `releaseAt_ <= block.timestamp`, so the contract's guard at
  `SessionRouter.sol:305` locks **nothing**.
- In that same case `to = min(endsAt, now)` falls **before** `from = max(openedAt,
  startOfDay(now))`, so `marketplace.ts:492` yields `userDuration = 0` and `lockedWei = 0n`.
- The divergent `unlockAt` never reaches the UI either: `stakeReleaseSchedule` drops
  zero-lock entries (`marketplace.ts:558`, `if (!at.known || at.lockedWei <= 0n) continue;`).

Verified by brute force, not by argument — both models implemented side by side and swept
over opens at 140 offsets across a UTC day × 10 durations (305s … 7 days) × 13 close
offsets (early, exact, +3s, +31s, +1 day, +2 days):

```
cases=18330   lockedWei mismatches=0   releaseAt mismatches=0
```

*Scope of that result:* it tests the **day-anchor** logic, which is what the finding
alleges is broken. It models `stipendToStake` as the proportional identity the file itself
argues for (`marketplace.ts:368-379`) — exact within one UTC day, a conservative ceiling
across midnight. A defect in the stipend conversion itself would not be caught by this
sweep and is not claimed by this finding.

**No code change needed.** Changing `earlyCloseLock` to "fix" this would be churn on
correct code. The *comment* half of this finding (the pseudocode block) was real and has
since been fixed in-tree — see below.

---

## Already fixed in-tree — no decision needed

Both were fixed by the running loop between this agent's verification pass and its write
pass. Re-verified as fixed, not assumed.

- **`ffe97c03e1b0`** — "BASE Sepolia switch: five values vs four".
  Was real: `docs/consumers/install/docker.mdx:65` said five values including `ENVIRONMENT`
  while `docs/reference/env-proxy-router.mdx` showed a four-value quick-switch block.
  Source arbitrated for `docker.mdx`: `proxy-router/.env.example:19` and `:26` do put
  `ENVIRONMENT` inside each chain block. Now fixed at
  `docs/reference/env-proxy-router.mdx:264-290`, and the fix also carries the nuance this
  agent derived independently — `ENVIRONMENT` is **not** a chain selector. Its only
  behavioural consumer is `proxy-router/internal/authapi/controller_http.go:350`, where
  `"development"` resolves the cookie path against the working directory instead of the
  executable directory (declared `config.go:40`, defaulted to `"development"` at
  `config.go:112-113`). It sits in the chain blocks as a layout convention only.

- **`179d9969a22a`** — the close-lock pseudocode in `marketplace.ts`.
  Was real: the block quoted `startOfDay(closedAt)` where the contract uses
  `startOfTheDay(min(closedAt, endsAt))`, and omitted the `block.timestamp < releaseAt_`
  guard entirely. Now correct at `ui-desktop/src/renderer/src/utils/marketplace.ts:331-339`,
  matching `SessionRouter.sol:296-314` line for line.

---

## Fixed in this pass (comment-only, inside the pre-approved allowlist)

Not on the worklist — found while verifying `fb43156bf9b8`, and more dangerous than the
finding that led to it.

`ui-desktop/src/renderer/src/utils/marketplace.ts` carried, at what was then lines 466-471, a TODO asserting that
`earlyCloseLock` "may be incorrect" and asking for an early return when
`now >= unlockAt`. **That condition is unreachable by construction:**
`unlockAt = startOfDay(now) + DAY`, so `unlockAt - now == DAY - (now % DAY)`, which is
always in `(0, DAY]`. Confirmed over 28,572 sampled timestamps: 0 occurrences.

The comment was therefore inviting a future maintainer to add dead code on the strength of
a false premise about correct code — and it mislocated the contract's real guard while
doing so. Replaced with the accurate statement: the contract's guard is
`block.timestamp < releaseAt_` anchored to the session's *end* day, the existing
`to > from` clamp already implements it, and here is the 18,330-case evidence, with the
scope limit of that evidence stated. Comment-only; no behaviour, no test, no build change.

---

## Standing recommendation on the audit's own tooling

Keep `.githooks/`, `.github/`, `scripts/`, and `tools/docs-audit/` **permanently closed**
to the loop, including the `.md` files inside them.

The reason is not that findings there are low-value — `8ac0b0dd9e36` (Group B) is the most
consequential finding in this worklist, a real hole in the only unbypassable layer. The
reason is that the fixer must not be the judge. A loop with write access to
`scripts/docs-gates.mjs` can make a failing gate pass by editing the gate. A loop with
write access to `.githooks/README.md` can make gate drift invisible by rewriting the
description instead of the hook. Both failure modes are silent, and both look exactly like
a clean audit from the outside.

The correct escape valve is the one already used here: the loop files the finding, verifies
it against source, writes the exact replacement text, and a human applies it. That costs
one approval and preserves the independence the whole apparatus depends on.
