# Docs audit — handoff / resume point

> **Scope note.** This report was written against the full audit tree. The
> audit-run orchestration, the per-commit coherence records, the raw
> model-output rounds and the review screenshots stayed local and are not
> included in this branch — so citations below to run scripts under
> `tools/docs-audit/` (the checkers ship; the runners do not), to numbered
> `verify/round*/` directories, and to `verify/coherence/` records will not
> resolve here. The findings and the evidence for them are reproduced in full;
> only the run artifacts are absent.

**Branch** `docs-audit-2026-08-20` · **`stake-duration` is untouched at `1aba12a8`** and must stay that way.
Commits are authored as `Cowboy Coder <howdy@cowboycoderhq.com>` (repo-local identity is already set — do
not commit without checking `git config user.email`, the global one leaks a real name on this public repo).

## Where things are

| | |
|---|---|
| Ledger (every claim, verdict, evidence) | `verify/docs-audit-2026-08-20.ledger.tsv` |
| Report | `verify/docs-audit-2026-08-20.md` |
| Fix plan (exact old→new for 36 fixes) | `verify/docs-audit-2026-08-20.fixplan.md` |
| Round-4 verification data | `verify/round4/` |
| Tooling | `tools/docs-audit/` |

`verify/round4/` holds the two-lane verification: `review-map.tsv` (proposition id → original finding),
`scout-all.out` (in-family reviewer verdicts, 202), `kq.out` (external reviewer A verdicts, 129), `prop*.tsv` (the
decomposition), `calib.md` + `sys-prop.md` (the calibrated prompts).

## Gates — run these before trusting anything

```
node tools/docs-audit/check.mjs --selftest             # 10/10
node tools/docs-audit/gate-quotes.mjs --selftest       # 6/6
node tools/docs-audit/check-mechanized.mjs --selftest  # 32/32
node tools/docs-audit/recurrence.mjs                   # expect 0 + guard 4/4
```

`recurrence.mjs` sweeps the corpus for claims already proven wrong. It must stay at 0.

## Status — all planned fix work is DONE (2026-08-21)

- **52 + 34 + 4 + 4 + 14 + 18 = 126 doc defects fixed** and committed, docs only, no product code.
- The 15 contested findings are **resolved** — see `verify/round4/contested-resolved.md`.
  8 were real defects, 6 were correct docs, 1 was already fixed.
- The two real-risk findings are **double-verified**:
  - `register-onchain.mdx:90` `spender` — **NOT a defect, do not edit.** The step is
    titled "Authorize the Diamond contract" and instructs the caller what to set;
    that is correct. Both lanes answered a different question.
  - bid fee — **was** a defect. Fixed across 14 locations; see `4b9282f9`.
- 14 findings were refuted by both lanes; closed, do not re-raise.

### Commits on this branch

| | |
|---|---|
| `4a1dcb97` | the four dual-confirmed defects (remotes, swagger CI, staleness CI, moved TEE doc) |
| `b06b2d66` | resolution of the 15 contested, with evidence |
| `082f1725` | auth coverage, cookie path, bid floor, TEE compose |
| `4b9282f9` | bid fee 0.1 mainnet / 0.3 Sepolia, 14 locations + derived totals |
| `81c2d7b3` | **recurrence-gate false-negative fix** — read this before trusting any earlier "recurrence: 0" |
| `15c16085` | bundled model is Qwen2.5-1.5B-Instruct, 18 locations |

### Round 5 — post-fix verification (2026-08-21)

Three lanes swept the fixed branch: a mechanical checker, six in-family reviewers reading all
45 changed files blind, and external reviewer B on 33 propositions. Full writeup in
`verify/round5/findings.md`.

- **All fixes verified applied and correct.** Mechanical lane: 48 citations, 14 figures,
  16 links, all re-derived. external reviewer B: controls **5/5**, **28/30** scored correct.
  All six scout batches **3/3** on spot checks.
- **3 of my fixes were INCOMPLETE** — sibling occurrences on pages I had already edited.
  Fixed in `e6d0b1e5`.
- **7 new pre-existing defects** found and fixed in `672b4904`, worst a "5 <token>"
  session minimum that is really a 5-MINUTE duration floor.
- **The stake-return claim was wrong** and is corrected across 17 files in `08e490c9`,
  after external reviewer A, external reviewer B and the oracle all objected against two in-family lane TRUEs.

**Four instrument defects were found, and they matter more than any single doc fix:**

1. The review tree is a clone — repo-remote state is not sampleable there. Two
   propositions and one scout spot-check are unanswerable; findings from them are
   artifacts, not defects.
2. Second false-negative in the recurrence gate (`session-floor-5mor` matched a phrasing,
   not a claim). Two gate blind spots in one day. **Treat every "recurrence: 0" before
   `81c2d7b3` / this round as weaker than it looked.**
3. The corrected docs are necessarily in the review tree, so a fix can be cited as
   evidence for itself. Seen three times (A05, A07, A23). Future packets must demand
   source-tree citations for propositions about code.
4. A lane can reach the right verdict from false reasoning (A21 claimed `.git/refs/tags`
   is empty; 282 tags exist). Score the evidence, not just the verdict.

**The single most useful process result:** three external readers caught the stake-return
defect that the in-family reviewer lane called TRUE twice. The independent lane is not
redundancy — it is the only thing that caught a family-shared error.

## How the gates are enforced, and what can still get past them

Three layers, all calling `scripts/docs-gates.mjs` — one definition, because
three copies drift and the weakest becomes the real gate.

| Layer | Runs | Catches | Bypassable by |
|---|---|---|---|
| `.githooks/pre-commit` | on commit, when docs are staged | the 8 gates that need no history | `--no-verify`, editing the hook, repointing `core.hooksPath` |
| `.githooks/pre-push` | on push | all 11 gates | `--no-verify` |
| `.github/workflows/docs-gates.yml` | server-side | the same 11 gates, then `--selftests` to prove each detector still fires | **only repo admin** |

Counts verified against the runner, not read off this table:
`node scripts/docs-gates.mjs` reports `docs-gates: 11 gate(s)`, and
`--staged` reports `8 gate(s) (staged mode — index content, history gates skipped)`,
naming `dox`, `verify-fixes` and `partial` as the three it defers.

> **What this table said during the audit, and why it is shorter now.** The audit ran
> with a fourth layer — a `post-commit` hook that wrote a `verify/coherence/<sha>.md`
> record after every doc-changing commit — and `pre-push` and CI each additionally
> required that record to exist before letting a push through. **None of that is
> carried into this branch.** The component that writes those records is audit-run
> orchestration, which stays local (see the scope note at the top of this report), so
> shipping the enforcement without the writer would block every doc-changing commit on
> evidence nothing in this tree can produce. The hook and the CI step were therefore
> removed together, and the table above lists only what ships:
> `grep -rn -i coherence .githooks/ .github/` returns nothing on this branch. This is
> also why reports in this directory cite `verify/coherence/` records that do not
> resolve here — they were written while that layer existed.

**A git hook cannot be structurally unbypassable.** `--no-verify` skips it,
`core.hooksPath` can be repointed, the file can be edited. That is not a flaw in
the hooks — it is why the CI job exists, exactly as `opsec-check.yml` exists
behind the opsec hooks. **CI is the only structural layer, and even it is only
binding once it is a REQUIRED status check in branch protection.** That is a
GitHub setting, not a file in this repo, and it is not yet set.

Two live proofs, both on the production path:

- Committing a doc with an unregistered API call was **blocked** by the real
  pre-commit hook and did not land. Removing it passes.
- An earlier revision of `pre-push` set `FAILED=1` from the docs gate and then
  ran `exit 0`, so the gate would have printed its failure and let the push
  through. A gate whose result is discarded is worse than no gate: it produces
  the reassurance without the check. Now `exit "$FAILED"`.

**This clone had `core.hooksPath` pointing at a global directory**, so none of
the repo's tracked hooks ran here at all — the ones that ship, the ones the
README describes. Set with `git config --local core.hooksPath .githooks`. Check
it before trusting any of the above: `git config core.hooksPath`.

**The coherence lane cannot run in CI** — it needs a live external session and a key
that must never reach a runner. During the audit it therefore ran locally in a
`post-commit` hook and left evidence, and CI enforced that the evidence existed: a
record saying `NOT RUN` is still a record, and CI reported how many there were, so
"the reviewer was offline" could not quietly become "the reviewer is off".

**That arrangement is not part of this branch** — neither the writer nor the
enforcement ships, for the reason given under the layer table. The design is recorded
here because it is what the coherence citations throughout these reports refer to, and
because anyone re-establishing the lane needs the constraint that shaped it: the
enforcement is only honest when it ships together with the thing that writes the
record. Enforcing the record without shipping the writer produces a gate that fails
every commit; shipping the writer without the enforcement produces evidence nobody
checks.

## The failure that recurred three times, and the gate that ends it

A fix applied at the line a finding names, while the same claim survives
elsewhere under different wording. It happened three times:

| Round | Fixed | Survived |
|---|---|---|
| Escrow formula | the accordion | the code block further down the same page |
| "There is no subnet tier exists" | two files | a third, found only by finally writing a rule |
| TEE model-substitution claim | two sentences | a diagram node, a section heading, and the whole claim restated in a second document |

Reading more carefully never fixed it. Writing a rule did, every time.

`check-partial.mjs` was supposed to catch this and could not: it extracted only
formulas, numbers-with-units and large integers, so for the sentence
"swapping, adding, or removing any model changes the hash and fails verification"
it produced **zero signatures** — blind by construction, not by tuning.

It now also matches PROSE claims two ways. A long restatement shares several
words that are uncommon across the corpus. A short one — a heading, a diagram
node — cannot share enough words, so it matches on uncommon content-bigrams
instead; both real short misses were bigram hits on "model identity".

**Two things make it usable rather than noise.** It is scoped to ONE fix
(`--prose-range`, default `HEAD~1..HEAD`): over the whole branch's 239 removed
lines it returns 584 groups, over a single fix, 17. And its thresholds were tuned
against the REAL failure rather than a fixture — the tree state right after the
first TEE fix — where all three survivals are found.

**Re-prove it, do not trust this paragraph:**

```bash
node tools/docs-audit/check-partial.mjs --at 666ce3f5 --prose-range 666ce3f5~1..666ce3f5
```

It must name `tee-backend-verification.mdx:135`, `:195` and
`.ai-docs/TEE_Attestation_Architecture.md:780`. `--at` builds the corpus from a
past commit precisely so this stays re-runnable; a detector nobody can re-fire is
a claim, not a gate.

**The standing rule:** after every fix, run `check-partial.mjs` and read the
prose section before moving on. Most hits will be the corrected text itself —
a fix necessarily contains the vocabulary of the claim it corrects — so the
question to ask of each hit is "is this the fix, or the disease?"

## Tools that failed, and the guard that now prevents it

Every row is a real failure from this audit. The guard is mechanical — a selftest
case built from the actual damage, so it is proven by firing, not by passing.

| Tool | How it failed | Guard now in place |
|---|---|---|
| `scrub.mjs` | Replaced words inside a variable name (file stopped parsing), a URL, a filesystem path, a filename, the ledger's verbatim-quote column, and an API model id. Left determiner collisions — an article followed by a phrase that itself begins with one. | Rewritten with structural guards; refuses to substitute inside paths, URLs, identifiers, filenames, `.tsv`/`.out` verbatim files and product dirs. Runs `check-hygiene` after `--apply` and exits non-zero if it broke anything. Selftest **8/8**, one case per failure above. |
| `check-hygiene.mjs` | Exempted its OWN file wholesale, so a real scar anywhere inside the detector was invisible. Then, once `scrub.mjs` was committed, the gate began failing on `scrub.mjs`'s header comment — the tool documents the damage by quoting it, and the detector cannot tell a quotation from the thing quoted. **This failure was live and unreported: the gate was verified while `scrub.mjs` was still untracked, and `git ls-files` did not yet see it.** | Blanket per-file exemption replaced by a per-LINE `hygiene-fixture` marker, so an undeclared scar inside the detector still fires (proven by planting one). The test asserting that is assembled at runtime, so it cannot carry the scar as a source literal. Selftest **14/14**, including both answers for the exemption itself. |
| `lib.mjs` / `verify-fixes.mjs` / `scrub.mjs` / `check-dox.mjs` | The diff base was hardcoded to `stake-duration`. In the publishable clone the branch sits on the rewritten public history, which shares **no ancestor** with that ref, so `verify-fixes` died with `fatal: no merge base` and a raw stack trace — the gate stopped reporting without ever saying it had stopped. `scrub.mjs` would have died the same way. | `auditBase()` resolves the ref: `AUDIT_BASE`, then `@{upstream}`, then the two known branch points; first one that exists **and** has a merge base with HEAD wins. No candidate ⇒ one clear line and exit 2, never a stack trace. Verified to resolve differently in each of the two trees. |
| `check-dox.mjs` | First run produced 16 false blocks: flagged ordinary English prose as a seed phrase, flagged the deliberate pseudonym, flagged a generic `~/Library` path. Then a fix added real BIP39 words to the reject list, blinding it to genuine phrases. **And it contained a real tailnet address as a fixture.** | Rules tightened; email domain read from `git config` not hardcoded; fixtures built at runtime so no literal it hunts for is stored. Selftest **12/12** including the false positives as negatives. |
| `check-citations.mjs` | Needed **six** repairs, every one accusing a good citation: `.jsx`→`.js`, ambiguous basenames, absence-claims failing a presence check, a path named `does-not-exist.go` exempting itself, per-citation instead of union symbol scope, repo-wide negatives having nothing to cite. | Selftest **11/11**, all near-misses. |
| `recurrence.mjs` | **Three** blind spots on the same claim. `is NOT` under `/i` exempted any line containing ordinary "is not". Then the rule matched a phrasing, not a claim, and missed a bare table row, then a prose variant. | Matches the claim, not the wording. Guard selftest **8/8** with each escaped phrasing as a fixture. |
| `verify-fixes.mjs` | Resolved citations against three hardcoded roots, **skipped 35 of 49**, and printed PASS. Economics rule knew only the bid floor, so it fired on a correct citation of the deployed ceiling. | Suffix-match against `git ls-files`; refuses to guess on ambiguous shorthand. Knows both price bounds. Selftest **11/11**. |
| `ext-run.mjs` | Hardcoded an absolute home path. Shipped a vendor model id as a default. Discarded correct answers emitted as JSON — **four items lost across two rounds**. Not importable, so its parser could not be tested. | Path derived from module location; `EXT_MODEL` required with no default; parser accepts pipe/fenced-JSON/bare-JSON/prose; main-module guard so `parseAnswer` is tested against the real module. Parser selftest **5/5**. |
| `check.mjs` / `gate-quotes.mjs` | Both are pipeline stages fed a TSV on stdin. Run with no stdin they died inside `tsvParse` with a raw stack trace, so "I invoked it wrong" and "the checker is broken" looked identical. | `tsvParse` returns `[]` on empty input; each stage then refuses that emptiness with a usage line and exit 2 — the caller decides, because a stage that quietly succeeds on no input is worse than one that crashes. `check-citations.mjs` already did this and is the model. |
| `check-consistency.mjs` | Flagged a provider's own model-backend `apiUrl` because `/v1/chat/completions` is served by both the router and a backend. | Refuses to classify a URL in backend context. Selftest **6/6**. |
| `find-session-tx.sh` | `cast` annotates numbers as `42 [4.2e1]` — broke every integer test. macOS ships **bash 3.2**, where `"${arr[@]}"` on an empty array under `set -u` is a hard error. `${v,,}` is bash 4+. BSD `date -j -f` fills unspecified fields from the **current clock**, so a bare date drifted daily. | `num()` helper strips annotations; newline-string instead of arrays; `tr` instead of `${v,,}`; dates padded to a full timestamp before parsing. Every construct verified on bash 3.2 itself. |

**The standing rule this earned:** a new checker's first output is a candidate list,
never a result. Five consecutive rounds, no exceptions — and twice the checker's own
fix introduced the next bug.

**The second standing rule:** a gate verified before its inputs were complete has not
been verified. `check-hygiene` reads `git ls-files`, so it was green only because the
file that broke it was still untracked; the failure appeared at commit time and went
unnoticed because nothing re-ran the gate afterwards. **Re-run every gate after the
commit, not before it** — the tracked-file set is an input like any other.

**Shell traps hit repeatedly, worth remembering:** zsh does not word-split unquoted
parameters (a two-word `$g` became one filename); `cmd | head` returns *head's* exit
code, not the command's; `grep -c` on multiple files emits one count per file and
breaks `[ ]` numeric tests; `--include='*.md'` needs quoting in zsh.

## OPEN TODOs — nothing below is done

| # | Item | Why it is open | Size |
|---|---|---|---|
| T1 | ~~`docs/ui-desktop.all.env` + `env-ui-desktop.mdx` out of sync with `env.schema.ts`~~ **CLOSED 2026-08-24** | The dump is now 25/25 against the schema, and its header names `env.schema.ts` rather than one of the three readers. Ten additions are the app's own (6 download URLs, 3 service ports, `LOG_LEVEL`); two — `BLOCKSCOUT_API_URL` and `NODE_ENV` — turned out to be proxy-router pass-throughs already documented on that page, and are now labelled as such instead of being restated. `LOG_LEVEL` only *looked* documented: that was a substring match on the router's `LOG_LEVEL_APP`/`_ETH_RPC`/`_STORAGE`/`_TCP`. | done |
| T2 | `proxy-router/models-config.json.example` sets `"apiUrl": "http://localhost:8080/v1"` | The schema says apiUrl is the "full url including endpoint" and `openai.go:64` POSTs to it **verbatim**, appending nothing — so a provider copying the shipped example POSTs to `/v1` and fails. Every `apiUrl` in `docs/` is correct; only the example file is wrong. **Held: it is a source file, and the standing instruction is docs-only.** | small |
| T3 | ~~`ui-verify/TESTING.md` documents a pre-commit gate that does not exist~~ **CLOSED 2026-08-24** | The gate now exists: `.githooks/pre-commit` runs `npm run build` (= typecheck + build) on staged `ui-desktop/` files, installed by `ui-desktop`'s `postinstall`. The doc's TODO had become wrong in three ways — a hook does ship, a tracked installer does exist, and `core.hooksPath` is set by that installer. Rewritten to describe the hook and keep the one claim still true: **no CI workflow runs a typecheck**, so a `--no-verify` bypass is never caught server-side. | done |
| T4 | Round-6 proposition B07 unresolved | Parse-failed twice; the rule is to escalate rather than re-run the same tier. Not escalated because its substance was settled by B06 (same formula, reproduced from a source-only tree) and the oracle's algebra. The row is a miss; the question is not open. | none |
| T5 | ~260 external URLs unverified | Original scoping decision: in-repo only, external marked `UNVERIFIABLE-IN-REPO`. | out of scope |
| T6 | `ui-desktop/.env.example:20` carries a commented `#DISPLAY_NAME=` | Nothing reads it. Source file, so held under docs-only. The docs no longer document it (fixed). | small |

### What is NOT done

- Nothing is pushed. `origin` is a **public** repo; the repo-local identity
  `Cowboy Coder <howdy@cowboycoderhq.com>` is set, but check `git config user.email`
  before any push.
- `stake-duration` is untouched at `1aba12a8`.
- The ~260 external URLs remain `UNVERIFIABLE-IN-REPO`.
- The recurrence gate knows only its ~11 hardcoded claim patterns. It cannot see a
  contradiction it was never taught. Two of this session's findings — the internal
  bid-floor inconsistency and the "Starting services" screen name — were found by
  ad-hoc grep sweeps, not by the gate.

## Running the reviewers again

**external reviewer A (independent lane).** An OpenAI-compatible
`/v1/chat/completions` endpoint served over loopback by a local desktop client.
The endpoint address, the model id and the on-disk key descriptor are
operator-local and are deliberately not recorded here. The lane needs an open
Morpheus session in the desktop app — a lapse returns HTTP 400 "No open session".

The runner read the review tree's location from `REVIEW_REPO` and took three
arguments: the packet, the output file, and the calibrated system prompt that
fixed the reviewer's task framing so verdicts stayed comparable across items.

```
REVIEW_REPO=<review tree> \
  node <audit-run orchestration> <packet.md> <out> <calibrated system prompt>
```

The orchestration script and that system-prompt file belong to the audit-run
tooling, which is not part of this branch.

**It is single-threaded — never fan out parallel workers.** ~30-45s per item. Order the queue by value so
an early end loses the least. Results checkpoint per item, so re-running resumes.

**The design worth keeping.** The review tree is a clone with full git history
(needed to tell STALE from FALSE) in which `verify/` and `tools/docs-audit/` are
**physically removed** — so prior verdicts were unreachable rather than merely
forbidden by prompt. That is the whole point of the lane: a reader cannot be
anchored by evidence it has no way to open, and a prompt that says "do not look"
is not a control when looking is still possible. Rebuild it in a scratch
directory:

```
RT=<scratch dir>; rm -rf "$RT"
git clone -q --no-hardlinks . "$RT" && cd "$RT" && git checkout -q -b review docs-audit-2026-08-20
git rm -r -q --cached verify tools/docs-audit; rm -rf "$RT/verify" "$RT/tools/docs-audit"
git -c user.email=r@r -c user.name=r commit -q -m "review tree"
```

## Method notes that cost real time to learn

- **One proposition per row, never one line.** 68 doc lines carried 202 distinct assertions. Judging a
  whole line makes reviewers latch onto one clause and ignore the rest — it caused a withdrawn S1 and
  most of the false disagreements.
- **Ask for enumeration, not a verdict**, on anything contested ("list every unauthenticated route"). It
  resolved 6 of 10 disagreements in the first pass's favour.
- **Every packet carries 4 hidden controls**, two known-true and two known-false, plus a fabrication probe
  naming a symbol that does not exist. A lane that misses one is reported separately, not folded in.
- **A second opinion is not ground truth.** Scoring external reviewer A's TRUE as correct produced a bogus 59% precision
  figure. Tie-breaks went to the first pass 6 times out of 10.
- **Every fresh rule I wrote over-reached on first run** — four for four. Treat a new checker's output as
  a candidate list until it is checked against the tree.
- Ephemeral scratch directories do not survive. Anything worth keeping goes in `verify/`.
