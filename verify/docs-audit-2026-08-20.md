# Docs accuracy audit — 88 documents @ stake-duration

> **Scope note.** This report was written against the full audit tree, none of
> which ships on this branch. The documentation gates and their checkers were
> removed from this pull request and held back for a review of their own; the
> audit-run orchestration, the per-commit coherence records, the raw
> model-output rounds and the review screenshots stayed local. Script and
> directory names mentioned below name artifacts of that audit tree, not files
> in this checkout — nothing in this report is runnable from here. The findings
> and the evidence for them are reproduced in full; only the run artifacts are
> absent.

**Scope** Every tracked `.md`/`.mdx` in the repo except `verify/` evidence files:
88 documents, 10,219 lines. That is the four root operator docs (`CLAUDE.md`,
`AGENTS.md`, `README.md`, `CONTRIBUTING.md`), the two `.ai-docs/` design
documents, `smart-contracts/docs/`, the component readmes and verification-kit
docs, and the whole 70-page Mintlify site under `docs/`.

**Question asked** Which claims in these documents are still true of this repo?

**Verification reach** In-repo only. External URLs, third-party ecosystem
services, and upstream release tags are recorded as `UNVERIFIABLE-IN-REPO`
rather than guessed. No document was edited.

**Ledger** `verify/docs-audit-2026-08-20.ledger.tsv` — one row per claim, with
verdict, evidence and severity. Every number below is derived from it.

---

## Result

| | count |
|---|---|
| Claims in ledger | **2,225** |
| TRUE | 1,585 |
| UNVERIFIABLE-IN-REPO | 401 |
| **FALSE** | **86** |
| **STALE** (was true, code moved) | **34** |
| AMBIGUOUS | 52 |
| N/A (example values, runtime paths, shell locals) | 66 |
| WITHDRAWN (mis-cited, see Verification) | 1 |

**120 defects** (FALSE + STALE) across **39 of 88 documents**, of which **13 are fixed on this branch** (see Fixes applied).

**This number is now measured rather than extrapolated.** 298 of the 505
model-judged claims have been re-adjudicated blind across two rounds — including
**every** claim on a page where being wrong costs money, breaks security, or
wastes install time. The pooled defect rate among claims first marked TRUE is
**8% (95% CI 5–12%)**, and only 97 judgment TRUEs remain unchecked, implying
**~8 further defects (range 5–12)** rather than the ~90 an earlier small sample
projected. See Verification.

| severity | n | meaning |
|---|---|---|
| **S1** | 6 | acting on it costs money or misstates a security property |
| **S2** | 79 | acting on it wastes real time — dead command, wrong port, wrong default |
| **S3** | 35 | misleads about behaviour without immediate cost |

Worst-affected documents: `.ai-docs/TEE_Attestation_Architecture.md` (8),
`docs/reference/api-endpoints.mdx` (7), `docs/providers/full/pricing.mdx` (5),
`docs/consumers/buy-bid.mdx` (5), `docs/concepts/tokens-and-fees.mdx` (5),
`docs/get-started/networks-and-tokens.mdx` (5), `CLAUDE.md` (4).

---

## Method, and the gates that make the numbers meanable

Two independent passes, because doc claims split cleanly into ones a script can
settle and ones that need reading.

**Phase 0 — deterministic (no model).** The audit tree's `extract.mjs` pulls every
mechanically-shaped claim (paths, env names, script names, endpoints, ports,
addresses, chain ids, links, versions, `last_verified`, frontmatter) and
`check.mjs` adjudicates each against a source-of-truth artifact — `config.go`
struct tags, `swagger.yaml`, the `.env.example` files, `deploy/data/config_*.json`,
the Makefiles, `docs.json`, `go.mod`. 1,716 rows, re-runnable, byte-identical
across runs.

**Phase 1 — semantic (12 low tier extractors, gated).** Behaviour and architecture
assertions cannot be regex'd, so twelve agents read all 88 files and emitted
claims with file+line. They extract only; they never assign verdicts.

**Phase 3 — verification (8 lanes, grouped by source of truth, not by document).**
One agent loads `config.go` once and settles all config claims, rather than
twenty agents each re-reading it. Lanes were told to *falsify*: a TRUE verdict
requires citing the mechanism that makes it true, and "nothing contradicted it"
is recorded as `UNVERIFIABLE-IN-REPO`, not TRUE.

| Gate | Command | Result |
|---|---|---|
| Adjudicator selftest | `check.mjs --selftest` (audit tree) | **10/10** — each adjudicator fires on a near-miss (a real env var + `_X`, a real script + `x`, a real path + `2`, a real route + `/nope`) |
| Quote-fidelity gate | `gate-quotes.mjs --selftest` (audit tree) | **6/6** — accepts the faithful quote as VERBATIM; rejects a fabricated quote, unrelated text at a real line, and a real quote in the wrong file; demotes a wrong-line quote and a one-word-altered quote so neither can be cited as wording |
| Extraction fidelity | `gate-quotes.mjs` over 613 extracted rows | **505 accepted / 108 rejected** |
| Ledger invariant | `merge.mjs` | **every TRUE row carries evidence**; 0 rows unsettled; 0 defects unsevered |

### The extraction gate earned its place

Of 613 claims the cheap-tier extractors produced, only **249 were verbatim**.
224 more were *reworded* but provably drawn from the cited lines, 32 were
compressions, and **108 could not be tied to the text they cited and were
discarded**. Without the gate, roughly one in six rows would have entered the
ledger as a quotation of something the document does not say.

That is a finding about the pipeline, not about the docs, and it is why the
ledger carries a `quotable` column. Rows marked `quotable=no` are **pointers**:
they identify a real claim at a real location, but their `verbatim` text is a
paraphrase. Nothing in this report quotes a document except from text re-read
out of the file.

---

## S1 — eight findings a reader acts on with money or trusts for security

All eight were re-adjudicated blind by a second reviewer that never saw the first
verdict. Six were confirmed outright; two were reclassified FALSE -> STALE (still
defects, with the flipping commit identified). A ninth was **withdrawn** — see
Verification.

### 1-2. TEE: a security control documented as shipped has no callers

`.ai-docs/TEE_Attestation_Architecture.md:64` marks *"Pinned-cert HTTP client for
onward inference traffic (`PinnedHTTPClient`) — DONE"*. `PinnedHTTPClient` and its
`VerifyPeerCertificate` do exist at `proxy-router/internal/attestation/backend_verifier.go:414-454`
— with **zero production callers anywhere in the repo**, only its own test file.
The client that actually carries inference traffic is a bare
`http.Client{}` reached via `aiengine/ai_engine.go:64` passing `nil`, giving
`openai.go:38-40` a default client on system roots.

Blind review confirmed this and **found a further defect in the same mechanism**:
at `backend_verifier.go:441-447` a peer certificate whose SHA-256 differs is still
accepted when its SPKI digest matches, so `:62`'s *"Mismatch on TLS fingerprint →
immediate hard fail"* overstates what the code does. (Independently rediscovered
in the TRUE-sample as `B02-040`, which the first pass had marked TRUE.)

Line 58 says NVIDIA NRAS verification is *"non-fatal if unreachable"*.
`backend_verifier.go:243-251` treats any NRAS error or `OverallResult==false` as
fatal — `storeFailure` then abort. Blind review reclassified this **FALSE ->
STALE**, identifying commit `33b063f8` ("NRAS is now fatal") as the change that
replaced the `log.Warnf` branch the doc still describes. Two other pages in the
same doc set state the fatal behaviour correctly, so the set contradicts itself.

### 3. The reward limiter period is off by 365×

`docs/concepts/rewards-and-economics.mdx:30` gives `PROVIDER_REWARD_LIMITER_PERIOD`
as *"currently 1 day"*. `smart-contracts/contracts/diamond/storages/ProviderStorage.sol:21`
sets it to **`365 days`**. A provider who hits the cap waits up to a year, not a
day. The cap also **equals the full stake** (`SessionRouter.sol:383`) rather than
being "proportional to" it.

This is the same defect class that was previously extracted as a reusable rule
from this very codebase: the docs deny one relationship precisely while omitting
the limiter that actually binds.

### 4-5. Consumer escrow uses the wrong formula, ~317× off

`docs/concepts/tokens-and-fees.mdx:26` and `:62` give consumer escrow as
`pricePerSecond * sessionDuration`. The page is describing **pool mode**, whose
escrow is `stipendToStake` — `cost * totalMORSupply * 100 / computeBalance`
(`SessionRouter.sol:408-414`), roughly **317× larger** with the shipped pool
parameters. The quoted 5-token session floor exists in no contract.

### 6. `PROXY_FORWARD_CHAT_CONTEXT` default is documented backwards (STALE)

`docs/reference/env-proxy-router.mdx:158` states the default is `true`.
`proxy-router/internal/config/config.go:198-206` sets it `false`, with a comment
reading "Default OFF". This inverts whether the router re-injects stored chat
history into every prompt — a behaviour with direct token-cost consequences.
Blind review reclassified FALSE -> STALE: it *was* `val := true` at commit
`a541fc10` and flipped at `390465b1`. Still wrong for a reader today.

### 7. Mnemonic recovery is documented as tier-1-only; it is not

`docs/reference/troubleshooting.mdx:65` says recovery works only with top-level
addresses and that derived addresses show a zero balance. The import flow
(`ui-desktop/src/renderer/src/components/onboarding/ImportFlow.jsx:110-129`)
presents a *"Select one of 10 accounts derived from mnemonic"* dropdown, and
`proxy-router/internal/repositories/wallet/keychainwallet.go:163-176` derives
from any supplied path. A user reading this may believe funds are unrecoverable,
or reach for an unnecessary private-key workaround.

### 8. Agent retry guidance keys on status codes the router never sends

`docs/prosumers/gateway-for-everclaw.mdx:70` tells agent developers to detect
401/403/429 for an expired session.
`proxy-router/internal/proxyapi/controller_http.go:281-284` maps every adapter
error — including `ErrSessionExpired` — to **HTTP 500**. Retry logic built to
this spec never fires.

---

## S2 — the themes, not the full list

All 56 are in the ledger. The recurring ones:

**A bid posted at the documented price floor reverts.** Seven pages repeat a
floor of `10000000000` wei/sec. `deploy/data/config_base_mainnet.json:7` is `1e13`
and `config_base_sepolia.json:7` is `5e15`; `1e10` survives only as a
commented-out line in `deploy/2_change_bid_price.migration.ts:14`.
`Marketplace.sol:80-84` reverts below the real floor.

**"There is no upper limit" on bid price.** `pricing.mdx:19` says so;
`Marketplace.sol:80-84` reverts above a governance-set `bidMaxPricePerSecond`.
Another precise-sounding denial hiding a hard on-chain bound.

**The 10,000-token "subnet provider" stake tier does not exist.** Repeated across
six pages. `ProviderRegistry.sol:40-44` enforces a single `providerMinimumStake`
for every provider; the delegation path declares no minimum at all. Relatedly,
every page calling the provider bond "refundable" omits
`ProviderRegistry.sol:99-105`, where deregistration returns only
`stake - limitPeriodEarned` inside the 365-day window.

**`api-endpoints.mdx` contradicts itself about its own port.** Line 10 states the
API is on `:8082`. Six curl examples then use `:8084` (lines 39, 75, 104, 145,
160) and `:8085` (line 90), while other curls on the same page correctly use
`:8082`. Neither 8084 nor 8085 appears in any non-doc file. Copy-paste gets
connection refused.

**"All endpoints require Basic Authentication" is false.** Stated in
`api-endpoints.mdx:18` and again in `api-auth.mdx:10`. Four operations carry no
`security:` in `swagger.yaml` and no `CheckAuth` in route registration:
`GET /healthcheck`, `POST /proxy/provider/ping`, `POST /auth/users/request`,
`GET /auth/cookie/path`.

**Three documented settings do not exist.** `MAX_CACHED_DESTS` (with a stated
default of 5), `PROXY_WEB_URL`, and `PROXY_WEB_DEFAULT_PORT` appear nowhere in
the code they are documented against. The live variable is
`SERVICE_PROXY_API_PORT` (`ui-desktop/env.schema.ts:40`).

**Manual stake recovery is now automatic.** Five pages instruct users to call
`withdrawUserStakes` by hand.
`proxy-router/internal/blockchainapi/stake_claimer.go` sweeps matured stake every
10 minutes, and `controller.go:69` exposes `GET /blockchain/stakes/on-hold`.

**The bundled local model moved twice.** Docs say `localhost:8080`; the default
is `3434` (`ui-desktop/env.schema.ts:43`). Five pages still call the bundled
model "tinyllama"; `ui-desktop/orchestrator.config.ts:44-49` replaced it with
Qwen2.5-1.5B-Instruct, explicitly because TinyLlama was "incoherent".

**Toolchain floors are stale.** Install docs say "go 1.22+"; `proxy-router/go.mod:3`
requires `go 1.25.0`.

**Wrong method and a phantom path segment.** `register-onchain.mdx:144` shows
`curl -X POST .../blockchain/bids/<id>/delete`. `swagger.yaml:1481-1482` defines
`DELETE /blockchain/bids/{id}` — no `/delete` segment.

**The release checklist trusts CI to do something CI never does.**
`RELEASE_CHECKLIST.md:29` says `swagger.yaml` is auto-regenerated by the pipeline
via `swag init`. No workflow invokes it; the only invocation is the manual
`proxy-router/Makefile:41` target. Corroborating evidence: the
`/blockchain/stakes/on-hold` route shipped in the code is **absent from
`swagger.yaml`** — exactly the drift an unregenerated spec produces.

---

## Two systematic findings

**19 of 21 docs pages point their own provenance at deleted files.** Each page
declares a `source:` in frontmatter. Only `docs/proxy-router.all.env` and
`docs/ui-desktop.all.env` still exist. The other 19 name pre-Mintlify markdown
files (`docs/02.3-proxy-router-tee.md`, `docs/04-consumer-setup.md`, …) removed
in the site migration. The provenance chain is repo-wide broken, which also
explains the dead cross-references inside `.ai-docs/`.

**32 pages claim verification against releases that do not exist here.**
`last_verified` values run v7.6.0–v7.9.0; the highest tag in this repo is
`v7.5.0` (282 tags, version-sorted). Under in-repo-only reach this is
`UNVERIFIABLE-IN-REPO`, not proven false — upstream tags may simply be unfetched.
Worth noting regardless: the CI job meant to catch this
(`.github/workflows/docs.yml:88`) compares with a **shell string comparison**
(`[ "$VERIFIED" \< "$LATEST_TAG" ]`), which mis-orders versions, and all three
docs CI checks are `|| echo "::warning::"` — they cannot fail a build.

---

## CLAUDE.md specifically

The file that prompted this audit. It was last committed 2026-07-16; the branch
then absorbed a 125-commit merge from `origin/main` on 2026-08-18. Its opening
orientation is wrong in five independent ways:

| Claim | Reality |
|---|---|
| `:3` "You are on **`pr3-reskin`**" | branch is `stake-duration` |
| `:5,10-12` remotes `cowboycoder` + `ccfork` | one remote: `origin` → cowboycoderhq/Morpheus-Lumerin-Node |
| `:12` "tagged `aurora-v1`" | no such tag |
| `:14-15` `ui-desktop/node_modules` "is a SYMLINK" | a real directory, 813 entries |
| `:16` "run `cd ui-desktop && npm install`" | `packageManager: yarn@1.22.22`, yarn-only lockfile, and `.gitignore` **bans** `package-lock.json` with a comment explaining that an npm tree "surfaces later as behaviour nobody can reproduce" |

Also stale: "9 isolation cases" (there are **25**); the lint counts
"~7374 problems — 3471 prettier, 2308 return types, 909 prop-types" (actual:
**12,972** — 8,195 / 3,037 / 913); and open item 2, which says the on-hold stake
is "invisible and unclaimable" with "no proxy-router endpoint, no UI" — since
implemented (`stake_claimer.go`, `controller.go:69`, `Dashboard.jsx`).

**A gate listed as mechanical is not installed.** Under *"Gates (mechanical — do
not route around)"*, the first entry is a git pre-commit hook running
typecheck+build. There is no `.git/hooks/pre-commit`, `core.hooksPath` is unset,
and no tracked installer exists — so no clone has it. `SKILL.md:33` repeats the
claim. The two the in-family model hooks (`visual-gate.sh`, `claim-gate.sh`) **are** genuinely
wired in `.claude/settings.json`.

What CLAUDE.md still gets right: lint carries `--fix`; `build` runs typecheck
first; `DEFAULT_VARIANT` is in `ui/theme.tsx:335` and is `'classic'`;
`liveness.sh` exists; `VerifyMnemonicStep` still has no isolate case; and
`ModelRow.tsx:114` really does carry a comment denying `successTint` seven lines
above `:121`, which uses it.

`ui-desktop/tools/ui-verify/TESTING.md` is stale in the same way: it pins
`MIN_REQUEST_SECONDS = 360` where the tree has **305**, and advertises "30
assertions" against roughly 523 `ok()` calls in `logic-checks.mjs`.

---

## What went wrong in this audit's own instrument

Recorded because a clean-looking number from a broken instrument is the failure
mode this audit exists to catch.

- **The first extractor manufactured 255 defects; 164 were artifacts.** It read
  component-relative references (`attestation/verifier.go`) as broken paths, Solidity
  constants and CI variables as undefined env vars, "make sure" as a Makefile
  target, and `/docker-compose` as an API route. Fixed by widening the authority
  set so FALSE means "appears nowhere in the repo", then re-running.
- **A near-miss slipped the path checker** — `proxy-router/go.mod2` escaped as an
  "external owner/repo reference". The selftest caught it; the heuristic now
  excludes this repo's own top-level directories.
- **Two claim rows cite the wrong line** (`B04-115`, `B04-116` in `api-auth.mdx`,
  off by one), found by the L2 lane. Pipeline defect, not a doc defect.
- **A false finding I nearly reported**: `docs/index.mdx:73` and `AGENTS.md:10`
  appeared to link a nonexistent `/ai/myths.md`. They are documenting a feature —
  append `.md` to any page URL for raw Markdown. The extractor had grabbed a
  markdown link *label*. Both are correct; no finding.
- **An inline call of mine was wrong.** I first judged CLAUDE.md's on-hold-stake
  open item as still holding, having grepped only `internal/handlers/`. The
  route lives in `internal/blockchainapi/`. The L5 lane caught it; the item is
  STALE, as recorded above. That wrong premise was passed to the L6 agent — checked
  for propagation, and it produced no verdict citing it.

---

## Verification — a blind second pass, and what it says about these numbers

The first pass was single-verifier and self-graded. A second pass re-adjudicated
64 claims **blind**: each reviewer saw the claim as the document words it (re-read
from disk) plus the rubric, and never the first verdict, its evidence, or its
severity. Four **control claims** with answers established by hand — two known-false,
two known-true — were shuffled into every packet without telling the reviewers, so
a reviewer that rubber-stamps could be detected rather than trusted.

| Packet | Controls | Trust |
|---|---|---|
| R1 (all 8 S1 + 1 withdrawn) | **4/4** | trusted |
| R2 (20 sampled TRUEs) | **4/4** | trusted |
| R3 (20 sampled TRUEs) | 3/4 | see note |
| R4 (15 sampled S2 defects) | **4/4** | trusted |

R3's single miss was `FALSE` vs `STALE` on a control both passes agree is a defect.
That is a flaw in the control's exact-match scoring, which conflates *detecting* a
defect with *classifying* it identically — not evidence R3 rubber-stamped.

**Overall agreement: 43/64 (67%).**

### What the blind pass changed

- **One S1 withdrawn.** `B02-041` cited `TEE_Attestation_Architecture.md:782` and
  argued about the CDN/MITM assertion — which is at line **781**. Line 782 asserts
  the GPU/NRAS binding, and the blind reviewer correctly found it **TRUE**
  (`backend_verifier.go:243-262`, `VerifyCPUGPUBinding:459-490`). The finding as
  published was mis-cited and is withdrawn. The MITM concern itself survives under
  finding 1-2, which was independently confirmed.
- **Two S1s reclassified FALSE -> STALE**, each with the flipping commit named.
  Both remain defects for a reader today.
- **Nine defects found that the first pass had marked TRUE**, including the
  unpinned inference client (`B02-040`), the missing git pre-commit hook
  (`B12-040`), derived-address mnemonic support asserted correctly in one place and
  wrongly in three (`B08-055`, `B10-020`), and a Docker install page that lists four
  values to change when a fifth (`ETH_NODE_ADDRESS`) also needs it or startup
  hard-fails (`B08-022`).

### The error rates

**False negatives.** Of 40 sampled first-pass TRUEs, the blind reviewer disagreed
on **12 (30%)**; **9 (22%)** were genuine defects and 3 were reclassifications to
UNVERIFIABLE/AMBIGUOUS. 95% Wilson CI on the disagreement rate: **18–45%**.
Projected over the 392 judgment-TRUEs, that is **roughly 90 defects still unfound**
(CI ~70–180). The 99 in the summary is a floor.

**False positives.** Of 15 sampled S2 defects, the blind reviewer confirmed 9 and
disputed **6 (40%)**. Some disputes are genuine over-calls; others are
letter-versus-spirit (`B08-006`: the manual `withdrawUserStakes` instruction is
accurate but obsolete now that `stake_claimer.go` sweeps automatically). One is
self-contradicting: on `B04-009` the reviewer returned TRUE while its own note
lists five unauthenticated routes, which supports the original FALSE.

### The structural cause

Several disputes are not disagreements about the code — they are the two passes
adjudicating **different propositions on the same line**. `B02-041` is the clearest
case; `B12-029` is another (one pass judged "run `npm install`", the other judged
"the kit needs the app's deps" — same line). The claim row's unit is a **line**,
and a line often carries several assertions.

That is the design defect to fix before a re-run: one row per proposition, not per
line. It is also why the individually-cited findings in this report are far more
reliable than the counts — each was traced to a specific mechanism, whereas the
totals inherit the unit error.

## Fixes applied on this branch

A third lane moved two claim classes out of model judgment into deterministic
checks (the audit tree's `check-mechanized.mjs`): *documented-as-wired vs has a
caller*, and *documented default vs the default the code applies*. Both were
chosen because the blind review had already proved they catch real defects.

The lane produced 16 candidate findings. **Scouts confirmed 12 and refuted 4** —
so a third of what the script reported would have become a wrong edit:

| Refuted | Why the doc was right |
|---|---|
| `LOG_COLOR` | No `SetDefaults` entry means the Go zero value `false` applies. `.env.example`'s `true` is a shipped sample, not the compiled default — the checker was treating a sample as authoritative. |
| `EXPLORER_RETRY_DELAY` | The Notes column states "(seconds)", so bare `5` matches `5 * time.Second`. |
| `ETH_NODE_POLLING_INTERVAL` | Same — Notes states the unit. |
| `MODELS_CONFIG_PATH` | `proxy-router/internal/config/models_config.go:14` defines `ConfigPathDefault`; an empty sample is not an absent default. |

Each refutation was fixed **in the checker**, not waved past, and pinned with a
synthetic selftest case so it cannot regress. Narrowing zero-value inference to
`bool` also removed two further false positives it had introduced
(`ETH_NODE_CHAIN_ID`, `ARTIFACT_REGISTRY_REFRESH_INTERVAL`), which now report
`UNDETERMINED` rather than accusing a correct doc.

The 12 confirmed findings are corrected in `docs/reference/env-proxy-router.mdx`,
`.ai-docs/TEE_Attestation_Architecture.md` and
`.ai-docs/TEE_CICD_Supply_Chain_Hardening.md`:

- Four `LOG_LEVEL_*` defaults `warn` → the compiled `debug`/`info`/`info`/`info`,
  each noting that `.env.example` ships `warn` as a recommendation (which is what
  made the discrepancy look deliberate).
- `PROXY_FORWARD_CHAT_CONTEXT` `true` → `false`.
- `TEE_PORTAL_URL` gains the `/quote-parse` path the code actually uses.
- Six status claims about `PinnedHTTPClient` and `MatchSEVMeasurement` changed
  from **DONE** to **NOT WIRED** / **Partially wired**, each naming the definition
  site and the fact that no production code calls it.

**The doc fix is not the real fix.** `PinnedHTTPClient` is the control that was
supposed to stop a TLS-terminating CDN sitting between the P-Node and the
backend. Correcting the document makes the gap visible; it does not close it.
Wiring `aiengine` to use the pinned client — or deciding the control is not
wanted — is a code decision that remains open.

After the edits the detector that found them reports **0 remaining default
mismatches** and **0 remaining unwired-symbol claims**, and the matching-default
count rose 32 → 38.

The unwired-symbol case is now a **regression guard**: it asserts no document
reasserts one of these symbols while the wiring is still missing. It was
mutation-tested — reinstating the old `DONE` line makes the gate fail, reverting
makes it pass — so it is proven by firing, not by passing.

## Verification round 2 — every high-stakes claim, blind

Round 1 sampled 40 judgment TRUEs and found a 23% defect rate, which projected
~90 unfound defects. That projection was built on a small sample and is now
superseded by a census rather than an estimate.

**Round 2 re-adjudicated all 234 remaining judgment TRUEs on money-, security-,
and install-affecting pages** — blind, in 12 packets, each carrying the same four
hand-established controls (two known-false, two known-true) mixed in unannounced.

| | |
|---|---|
| Packets | 12, **all trusted** — 11 scored 4/4 on controls, one scored FALSE-vs-STALE on a control both verdicts call a defect |
| Claims | 234 |
| Confirmed TRUE | 208 |
| Flipped | 26 (11%) — **13 real defects (6%)**, 13 reclassified to UNVERIFIABLE/AMBIGUOUS |

### Reconciling 23% with 6%

The two rounds disagree, and the intervals barely overlap, so this is not noise.
Two causes, and the honest answer is that both contribute:

- **Round 1's sample was small and unlucky.** Broken down by the lane that
  originally marked each claim TRUE, round 1 drew 4 defects from just 8
  `L3b-behavior` rows (50%). Round 2 checked 54 rows from that same lane and
  found 9%. A 4-of-8 draw carries an interval from roughly 16% to 84%; the lane
  is worse than average, but nowhere near 50%.
- **Round 2's prompt told reviewers most claims were correct.** I added that to
  stop manufactured disagreement, and it may also have suppressed genuine
  disagreement. It cannot be ruled out. What can be said is that every packet
  still returned FALSE on both known-false controls, so no reviewer was
  wholesale rubber-stamping.

**Pooled across both rounds: 22 defects in 274 checked claims = 8% (CI 5–12%).**
That is the number to use. With 97 judgment TRUEs unchecked, ~8 more defects are
expected — the audit is near-complete on model-judged claims, not missing ~90.

### What round 2 found

13 defects the first pass had marked TRUE. Five of them are one cause:
`.ai-docs/TEE_Attestation_Architecture.md` describes TLS binding as a plain
certificate-fingerprint comparison at lines 55, 62, 656, 668 and 754, but commit
`878ee3b4` (2026-07-15) moved the check to an **SPKI** digest with the full-cert
digest as a legacy fallback, and added a port-probe fallback. The word "SPKI"
does not appear in that document. Several reviewers reached this independently.

Others worth naming:

- **`docs/consumers/buy-bid.mdx:64`** states unconditionally that the provider is
  paid from a protocol funding account. `SessionRouter.sol:394` pays from the
  **escrowed stake** when `isDirectPaymentFromUser` — a first-class API field that
  appears in that same page's own curl example at line 43.
- **`docs/providers/resale/registering-bid.mdx:39`** repeats "there is no upper
  limit" on bid price. `Marketplace.sol:80-84` reverts above an owner-set
  `bidMaxPricePerSecond`. This is the same defect already found on `pricing.mdx`,
  now confirmed to be duplicated.
- **`docs/consumers/install-from-source.mdx:41`** still says `go 1.22+`;
  `proxy-router/go.mod:3` requires `go 1.25.0`, CI pins `1.25.x`, and the
  Dockerfile uses `golang:1.25`.
- **`.ai-docs/TEE_CICD_Supply_Chain_Hardening.md:184`** says consumers use
  `MatchSEVMeasurement` to pick a per-template SEV golden by `family_id`. That
  helper has no callers, and matches on measurement value rather than family_id.

Reviewers also flagged defects **outside their own packets** — `line 58/59` (NRAS
described as "non-fatal" when the code is fail-closed, corroborating an S1 already
recorded), `line 147` ("the portal is not a trust dependency", which the code does
not support), and `line 173`. These are leads, not adjudicated findings.

### A blindness leak to fix before any round 3

One reviewer disclosed that a repo-wide grep surfaced
`verify/docs-audit-2026-08-20.ledger.tsv` — which is now committed, and contains
the prior verdicts. It reported re-deriving everything from source afterwards.
Others may have hit it without noticing. Any future blind round must exclude the
ledger from the reviewer's reachable tree, or the blindness is nominal.

## Verification round 3 — an independent reader

Every reviewer to this point ran on the in-family model. If the in-family shares a bias,
no amount of further the in-family model review samples it: an instrument built on the fault's
own substrate returns clean readings as selection bias, not evidence. So the S1s
and the contested rows went to **external reviewer A** (Moonshot), driven through a direct
tool loop against a Morpheus-hosted OpenAI-compatible endpoint with real
grep/read access and `verify/` excluded from its reachable tree.

### The instrument was qualified first — 7/7

Six file-anchored controls plus a **fabrication probe**: a claim about
`ValidateSessionEscrow`, a symbol that exists in no file. Four of the seven are
"the document is RIGHT", so a reviewer flipping to please the asker is
detectable.

external reviewer A passed all seven. On the fabrication probe it returned UNSUPPORTED,
correctly reported that the only occurrence of the symbol anywhere is *the probe
file itself*, and volunteered the real mechanism (`computeSessionTokenAmount`,
`service.go:1547`). It refused to invent a citation. Published hallucination
rates for this model class run near 50% on closed-book recall, so this control
was the precondition for using any of its output.

### Result — all 55 packet claims read

| | |
|---|---|
| My **confirmations** upheld | **20 of 20 — 100%** |
| Band C (previously-confirmed TRUEs) | **16/16 read** |
| My **defect calls** upheld, after tie-break | **25 of 30 — 83%** |

The Band C result answers the question that motivated the whole exercise: there
is **no evidence of an in-family charitable-reading bias** inflating the
confirm rate. A different model family, reading independently, upheld all but one.

### The disagreements, and why the first reading of them was wrong

Ten claims came back contradicted. Scored naively — treating the independent
verdict as ground truth — that put defect precision at 59%, and I reported that
number. **It was wrong, and reporting it that confidently was a mistake.**

Two were my own ledger lagging my own fixes. For the rest, a yes/no verdict lets
each reviewer seize a different sufficient-looking fact and stop, which is how the
disagreements arose in the first place. So the tie-break asked a different shape
of question — one that **forces enumeration** rather than a verdict:

> "Enumerate EVERY route the proxy-router registers that can be called without
> credentials." · "Trace the actual HTTP client used to send a chat completion."

Seven such questions resolved all ten:

| Claim | Ruling |
|---|---|
| `B02-040` TEE MITM | **Upheld** — inference runs over a default `http.Client`; the binding is checked only on the separate attestation probe |
| `B02-036` / `B02-035` | **Upheld** — a changed cert does not hard-fail when the SPKI digest matches |
| `B08-026` startup screen | **Upheld** — replaced by `SetupWizard` "Setting up your AI assistant" |
| `B04-009` auth | **Upheld, and I undercounted** — 5 unauthenticated routes, not 4 (`GET /swagger/*any` also open) |
| `B08-022` testnet swap | **Upheld, wrong reason** — 5 vars must change so "four" is wrong, but `ETH_NODE_ADDRESS` is not one of them |
| `B08-008` provider payment | **Downgraded** — the default path really does pay from `fundingAccount`; the doc omits the exception rather than stating a falsehood |
| `B02-003` chat-context | **Ambiguous** — no runtime setter, but an ordinary Docker `ENV` an operator can override at container start |
| `B04-028`, `B02-016` | **My ledger was stale** relative to fixes I had already applied |

Six upheld, two downgraded to AMBIGUOUS, two my own bookkeeping. Corrected defect
precision: **83%**, not 59%. The single-fact-and-stop failure was the *reviewer's*,
not the finding's — and it is worth noting the enumeration questions caught it in
both directions, including where they made my own evidence look wrong.

S1 count drops 8 -> 6 as a result.

### What this cost, and what it did not settle

$0.03 across three sessions. Cost was never the constraint; two mid-run session
lapses and my own plumbing errors were.

The final five Band B claims surfaced three more disagreements, and all three
turned out to be the **multi-clause-per-row** defect rather than a factual
dispute — each reviewer judged a different assertion on the same line. Two
resolved in my favour once the clause was pinned down (`B12-038`: external reviewer A's own
evidence gives `ENTRY = main.tsx`, which is what makes the doc stale;
`B08-036`: tie-break T6 already settled the screen-name clause). One,
`B08-035`, is genuinely two clauses and is now AMBIGUOUS — the asset-name
pattern is right and the `-test` suffix claim is not.

That is the third independent confirmation that the row unit is wrong. It is
the highest-value fix before any future run: **one row per proposition, not per
line.**

Not settled: the external pass covered 55 of 2,225 rows. A single independent reader is a second opinion, not ground truth — where
external reviewer A and the in-family model disagreed, the tie-break went to the in-family model six times out of ten, so
external reviewer A's verdicts carry no automatic authority either.

## Fixes applied — round 2 (39 corroborated defects)

Every defect that survived blind review, external independent review, or a
tie-break is now corrected. **52 of the ledger's rows are fixed; 0 corroborated
defects remain.** No code was changed — these are documentation edits only.

Applied as 40 exact-match replacements across 26 files, grouped by root cause:

| Theme | Rows | What was wrong |
|---|---|---|
| T1 TLS binding moved to SPKI | 8 | commit `878ee3b4` changed the check; the doc described the old behaviour in six places and never said "SPKI" |
| T2 bid floor `1e10` | 5 | matched no deployment — a bid at the documented floor reverts |
| T3 the "5 MOR session minimum" | 5 | does not exist; it is `MIN_SESSION_DURATION = 5 minutes` misread as a token amount |
| T4 provider stake tiers | 3 | 365 days not 1 day; no subnet tier exists |
| T5 derived addresses | 3 | are supported; docs pushed users to an unnecessary private-key workaround |
| T6 on-hold stake | 2 | now swept automatically every 10 minutes |
| T7 install / onboarding | 6 | go 1.25, five env vars, the replaced setup wizard |
| T8 this repo's tooling docs | 4 | symlink/npm claims, entry file, the uninstalled hook |
| T9 remaining | 3 | five open routes, Akash pin, HTTP 500 |

**`F8.4` is labelled a TODO, not silently fixed.** `TESTING.md` claimed every
commit passes typecheck + build. No hook exists and no CI step runs it, so the
text now says the check is **manual** and carries an explicit TODO to either
install the hook or keep running it by hand. Installing it would be a code
change, which is out of scope for this round.

**`F1.7` documents a gap it does not close.** The unwired `PinnedHTTPClient` is a
code decision — the doc now states plainly that inference traffic is unpinned
rather than claiming a control that is not in effect.

### Verification of the fixes themselves

- The **mechanized detector re-run against the edited tree** reports **0 unwired-symbol
  claims** and **0 default mismatches** — the same detectors that found these
  defects now pass, and the corrected text documents the gap rather than
  re-asserting the claim.
- All three gates green: **10/10**, **6/6**, **32/32**.
- Phase 0's script-detected FALSEs fell **33 → 29**.
- Every replacement was applied under an exact-match, single-occurrence assertion,
  so a stale target would have failed loudly rather than mis-editing.

### Still unfixed, deliberately

**69 uncorroborated defects.** They rest on a single in-family model pass; at the measured
83% precision roughly one in six would not survive review. Editing docs on that
basis would import the audit's own error rate into the documentation.

## Not verified / out of scope

- **~260 external URLs were not fetched.** In-repo reach was the chosen scope. The
  repo already ships `mint broken-links` in CI for these — currently warning-only.
- **Third-party ecosystem claims are unsettled by design.** 10 rows on mirrored
  `docs/ecosystem/` pages are AMBIGUOUS/S3: a mirrored claim asserted without a
  date is stale by construction. `attribution.mdx`'s own editorial-cadence claims
  have no artifact in the repo — not even a CI gate — to evidence them.
- **The upstream tag question is open.** Whether v7.6.0–v7.9.0 exist upstream needs
  a network check this audit did not make.
- **No S1 finding was reproduced at runtime.** All nine are code-read, not
  observed. The TEE findings in particular assert that a function has no callers;
  that is a whole-repo grep result, strong but not a runtime trace.
- **49 AMBIGUOUS rows are genuinely unresolved**, not quietly passed. The largest
  group is claims that a TEE deployment "cannot be overridden" — `Dockerfile.tee`
  sets ordinary Docker `ENV` defaults, overridable by `docker run -e`, and whether
  SecretVM attestation catches the tampering is not decidable here.
- **AGENTS.md was audited as prose, not as an agent contract.** Whether an LLM
  following it reaches correct answers was not tested.
- **13 rows are now fixed** (see Fixes applied); the rest of the ledger is
  unedited findings.
- **The mechanized lane's own false-positive rate was ~25% before scout review**
  (4 of 16), and two further false positives appeared while correcting it. Every
  inference added to that checker over-reached on first attempt; only checking
  against the tree caught it. Treat a fresh mechanized rule as a candidate list,
  never as findings.
- **298 of 505 judgment rows are blind-checked**; 97 judgment TRUEs are not, and
  the ~1,220 script-settled verdicts were never sampled at all (they are
  deterministic and reproducible, which is a different kind of assurance, not the
  same one).
- **The S2 false-positive rate was never re-measured.** Round 1 disputed 6 of 15
  sampled S2 defects; round 2 checked TRUEs, not defects, so that ~40% figure
  still stands unrefined.
- **Every layer is the in-family model** — extractors, verifiers, blind reviewers, and the
  author. A within-family review cannot clear a family-shared flaw; this wants a
  independent reader or the operator before the totals are relied on.
- **Blind review is a second opinion, not ground truth.** Where the two passes
  disagree and no third check was run, the ledger records both under
  `blind_verdict` and `disposition` rather than picking a winner.

---

## Re-running

The audit tooling is not part of this branch — the checkers were removed from
this pull request and held back for a review of their own, and the Phase 0
extractor and adjudicator were never published at all. Re-running the phases
below therefore requires that audit tree, not this one.

Phase 0 is deterministic and reproduces identically. Phases 1 and 3 involve
model judgment and will not reproduce byte-for-byte; the ledger records each
verdict's evidence so any row can be re-checked by hand.

To spot-check this report: pick any ledger row, open `file:line`, and confirm the
evidence says what the verdict claims. Rows with `quotable=no` carry a paraphrase
in `verbatim` — read the file, not the row.
