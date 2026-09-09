#!/usr/bin/env node
// check-sweep-preconditions.mjs — standalone. Run by hand:
//   node scripts/check-sweep-preconditions.mjs                   (repo root; exit 1 on violations, 2 could-not-run)
//   node scripts/check-sweep-preconditions.mjs --info            (also list out-of-scope mentions)
//   node scripts/check-sweep-preconditions.mjs --selftest        (gate the gate; corpus-independent)
//   node scripts/check-sweep-preconditions.mjs --verify-fixtures (fixture provenance vs the tree)
//
// WHAT IT CHECKS
// -------------
// Three facts, all read out of source, not out of a doc:
//
//   1. NODE:   StakeClaimer is constructed and started only inside `Proxy.run`
//              (proxy-router/internal/proxyctl/proxyctl.go:237-240). With no
//              proxy-router running, nothing sweeps. There is no other caller
//              and no HTTP route.
//   2. WALLET: it reads and withdraws for `GetMyAddress` alone
//              (proxy-router/internal/blockchainapi/service.go:1105, 1119), so
//              stake held against any other wallet is never touched.
//   3. START:  `Run` calls `claimOnce(ctx)` BEFORE it constructs the ticker and
//              enters the select loop (stake_claimer.go:87-89 vs :91, :94-101).
//              Starting a proxy-router that holds the wallet therefore claims
//              matured stake immediately on startup — not after a 10-minute wait.
//
// Those three put TWO defects on one axis, and a fix for either can create the
// other. Both are violations:
//
//   Class L — WRONG ABOUT THE LOCK. Not a missing qualifier but a false
//   statement: the day-lock anchored to the close rather than to
//   startOfTheDay(min(closedAt, endsAt)) (:296-298), or attributed to closing
//   EARLY when the gate at :305 has no early/late test. Classes E and S ask
//   "what is missing"; this asks "is it true", and no amount of qualifying
//   repairs it. Added after the wrong anchor survived seven passes at
//   docs/concepts/tokens-and-fees.mdx:26 with this checker reporting PASS: 0.
//
//   Class E — OVER-PROMISE. "It comes back automatically" / "no manual call is
//   needed", without BOTH (1) and (2) in reach of the claim. Facts 1 and 2 mean
//   nothing sweeps at all unless a proxy-router holding that wallet is running,
//   so an unqualified sweep claim tells a reader with a stopped node to wait for
//   money that is never coming.
//
//   Class S — UNDER-PROMISE (the mirror, and the one this checker was blind to
//   for six passes). "With the node off, or for another wallet's stake, you must
//   call withdrawUserStakes yourself / that is the only route." Fact 3 makes that
//   false: starting a proxy-router that holds the wallet sweeps the stake on
//   startup, and for most users that is the easier of the two routes. Text that
//   names the manual call as THE remedy steers people into a `cast send` they
//   did not need.
//
// The rule, stated once: nothing sweeps until a proxy-router holding that wallet
// runs; starting one claims matured stake immediately on startup; and calling
// `withdrawUserStakes` yourself is the ALTERNATIVE — never the only route.
//
// WHY "UNIT", AND WHY IT IS BOUNDED
// ---------------------------------
// A frontmatter description, a table row, an accordion/step/card body, a
// single-line <Note> and a mermaid edge label are each read in isolation —
// quoted, rendered as a cell, or scraped by an agent — so a qualifier elsewhere
// on the page does not reach them. Units are computed here rather than judged by
// eye, which is the whole point: six previous passes over these claims were done
// by reading and every one was incomplete.
//
// Units alone are not enough, because a unit can be long. A 1,622-character list
// item (CLAUDE.md) is one "unit" whose bolded lead sentence is an unqualified
// sweep claim and whose qualifier sits 1,200 characters away. Nobody quotes 1,622
// characters. So two bounds sit on top of units:
//
//   * CLAIM_WINDOW (600 chars). A qualifier only discharges a claim if it lands
//     within a 600-character, sentence-aligned window around that claim. 600 is
//     chosen as the ceiling of what actually travels intact: every frontmatter
//     description, table row and callout in this repo's docs is under it, and it
//     spans 3-4 sentences, so a "…automatically — but only while your node is
//     running and only for the wallet it holds" qualifier one or two sentences
//     after the claim still counts, which is how the corrected corpus is written.
//     Units at or under 600 chars behave exactly as before, so this bound can only
//     add findings, never remove them.
//   * BOLD LEAD. A bolded lead sentence is classified as a unit in its own right.
//     Bold is the single most-quoted fragment in these files — it is the summary
//     line an agent lifts and a reader skims — so it has to carry its own
//     qualifier. This is what catches the CLAUDE.md case above.
//
// WHAT IS IN SCOPE, AND THE THREE THINGS THAT USED TO BE STRUCTURALLY INVISIBLE
// -----------------------------------------------------------------------------
// Scope is per UNIT, not per file. Three categories could not produce a finding
// at any wording, which meant `PASS: 0` was never evidence about them:
//
//   * GO SOURCE. A string the program PRINTS is read by a user in a terminal, a
//     log file or a support paste — the one place this claim family reaches
//     someone who never chose to read documentation. Printed strings in the
//     scanned Go packages are now in scope; comments in the same file stay INFO,
//     because their reader is already inside the code.
//   * FRONTMATTER OUTSIDE docs/ai/**. `description:` was cut as its own unit
//     "because an agent quotes it alone", then judged at the tier of the
//     directory it sat in — so the same fragment was simultaneously held to
//     travel alone and to be discharged by a paragraph it never travels with.
//     Frontmatter now carries the assertion-dictating tier everywhere.
//   * smart-contracts/docs/**. In SCAN_ROOTS but never in IN_SCOPE, so every
//     claim in it was listed forever and could fail nothing. It is hand-written
//     prose an integrator reads and cites; neither exclusion reason applied.
//
//   * ui-desktop/**. The fourth instance of the identical hole, found by looking
//     for it deliberately rather than by it failing: `ui-desktop` has been in
//     SCAN_ROOTS since this file was written, and walk() admitted none of the
//     extensions its source uses. Nineteen files (a package.json, a tsconfig, a
//     yml) were read; the 437 .jsx/.tsx/.ts/.js files holding every sentence the
//     desktop app paints on screen were not. `PASS: 0` was never evidence about
//     the UI at any wording, exactly as it was never evidence about
//     smart-contracts/docs. See the ui units section for the three JSX text
//     kinds and which of them is in scope.
//
// WHAT THE UI LEG STILL CANNOT SEE, stated so the gap is on the record:
//   * ATTRIBUTE strings. `title="..."`, `placeholder=`, `aria-label=`, `alt=`
//     are human-facing and are NOT cut into units -- only children text and
//     literals inside a children expression container are. Measured before
//     accepting the gap: zero attribute strings in ui-desktop/src match
//     /automatic|returns|swept|comes back/ today, so the omission costs nothing
//     in this corpus and would cost something in another.
//   * .mjs. ui-desktop/tools/ui-verify/run.mjs is a test harness and is neither
//     walked nor in scope; its assertions about UI copy are invisible here.
//   * The JSX reader is a MASK AND A TAG SCANNER, not a parser. It decides
//     whether `<` opens a tag from the preceding token, so a construct that
//     breaks that heuristic loses a subtree silently. The forms that were
//     actually tried -- TS generics, comparisons, `return <Tag>`, an apostrophe
//     in text, a `//` inside a string, a styled-components template -- are each
//     pinned in legWiring so a later refactor cannot quietly drop one. Forms
//     nobody tried are not covered by that and are not claimed to be.
//
// Mermaid node labels joined the frontmatter tier for the same structural
// reason — see DICTATES_ASSERTIONS, which also records where the line is drawn
// and what was measured before drawing it.
//
// WHY THE SELF-TEST LOOKS LIKE THAT
// ---------------------------------
// The previous self-test called classify() directly on hand-typed strings. It
// therefore passed 17/17 against a checker that scanned nothing: dropping 'docs'
// from SCAN_ROOTS, making IN_SCOPE return false, and dropping .mdx from the walk
// each hid every real violation with the self-test still green. A self-test that
// cannot detect a disabled scanner is theatre. So it now has three legs and the
// pipeline leg is the load-bearing one — see selftest().

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv.find((a) => a.startsWith('--root='))?.slice(7)
  ?? join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SHOW_INFO = process.argv.includes('--info');

// ---------------------------------------------------------------- scope ----
// Scope is decided per UNIT, not per file, because one file can hold prose with
// two different readers. A Go file is the case that forced it: a string the
// program PRINTS and a comment beside it are not read by the same person.
//
// Prose a human or an agent reads as guidance. Deliberately NOT included, and
// why (they are reported under --info so the enumeration stays complete):
//   proxy-router/docs/** generated swagger, three generated copies of the
//                        @Description annotations; `swag init` would overwrite
//                        an edit made there, so the annotation is the editable
//                        site and the copies are not
//   Go COMMENTS          read by whoever is already editing that file, who has
//                        the surrounding code; INFO, like the swagger copies
//   *.sol, *.ts          source comments; same reason
const PROSE_IN_SCOPE = (rel) =>
  (rel.startsWith(`docs${sep}`) && /\.mdx?$/.test(rel))
  || rel.startsWith(`.cursor${sep}rules${sep}`)
  // smart-contracts/docs/** is hand-written prose an integrator reads and cites
  // — an RFP and a runbook, not generated output. It was in SCAN_ROOTS but never
  // in scope, so every claim in it was INFO forever: scanned, listed, and unable
  // to fail anything. Neither exclusion reason above applies to it.
  || rel.startsWith(`smart-contracts${sep}docs${sep}`)
  || ['README.md', 'AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md'].includes(rel);

// Go packages whose printed strings are scanned. Bounded to the packages that
// can print about this subject at all, so the walk stays cheap and the
// enumeration stays readable.
const GO_SOURCE_ROOTS = [
  `proxy-router${sep}internal${sep}blockchainapi`,
  `proxy-router${sep}internal${sep}proxyctl`,
  // The registries package wraps the Diamond calls and its doc comments are
  // where this subject is described most concretely. It was never scanned, so
  // session_router.go sat at base wording through every pass of this branch --
  // byte-identical at ea7028d7 and at the tip -- carrying "Closing late locks
  // nothing", which is false for a late close inside the session's own UTC day.
  // Nothing here could have reported that, so PASS said nothing about it.
  `proxy-router${sep}internal${sep}repositories${sep}registries`,
];
const IS_SCANNED_GO = (rel) =>
  /\.go$/.test(rel) && GO_SOURCE_ROOTS.some((r) => rel === r || rel.startsWith(r + sep));

// The UI source whose rendered strings are scanned. Bounded to `src/` on purpose:
// `ui-desktop/tools/**` and `ui-desktop/scripts/**` are test harnesses and build
// scripts whose strings are read by a developer running them, not by a user --
// the same reader distinction that keeps a Go comment out of scope. They are
// still walked, so they appear under --info and the enumeration stays complete.
const UI_SOURCE_ROOTS = [`ui-desktop${sep}src`];
const IS_SCANNED_UI = (rel) =>
  /\.(jsx|tsx|ts|js)$/.test(rel) && UI_SOURCE_ROOTS.some((r) => rel === r || rel.startsWith(r + sep));

// `kind` may be a sub-unit kind ("frontmatter/bold-lead"); scope and tier are
// decided by the kind it was cut from.
const baseKind = (k) => String(k ?? 'para').split('/')[0];

// A string the program prints is read by a user — in a terminal, in a log file,
// in a support paste pasted into a chat. It is a page with a smaller frame, not
// a lesser one, and it is the one instance of this claim family a user meets
// without having chosen to read documentation at all. So printed strings in the
// scanned Go packages are IN scope; comments in the very same file are not.
const IN_SCOPE = (rel, kind) =>
  PROSE_IN_SCOPE(rel)
  || (baseKind(kind) === 'go-log-string' && IS_SCANNED_GO(rel))
  // A string the app PAINTS is the same case one screen further out: the user is
  // reading it about their own balance, having chosen no documentation at all.
  // A JSX comment beside it stays INFO, exactly as a Go comment does.
  || (baseKind(kind) === 'ui-rendered' && IS_SCANNED_UI(rel));

// Text that dictates what an AI assistant ASSERTS, rather than describing a
// mechanism to a human. In these, a bare "it is swept back" is itself a
// violation: the assistant will repeat it unconditionally, and the reader of
// that answer is told to do nothing without ever seeing the condition.
//
// FRONTMATTER CARRIES THIS TIER WHEREVER IT APPEARS, not only under docs/ai/**.
// units() already cuts one unit per frontmatter key "because an agent quotes
// `description:` alone" — and that is precisely the definition of assertion-
// dictating text: a fragment consumed detached from the body that would qualify
// it. Mintlify emits `description:` as the page's <meta name="description">, so
// it is what a search result shows, what a link preview shows, and what a
// scraper lifts as the page summary; none of those carry the paragraph three
// screens down. Conceding that for unit-splitting while withholding it for tier
// was incoherent: it said the fragment travels alone AND that a qualifier
// elsewhere on the page discharges it. It cannot be both.
//
// A MERMAID NODE LABEL CARRIES IT TOO, for the same structural reason and no
// other. The header above already concedes that a mermaid label "is read in
// isolation"; units() enforces it by cutting one unit per mermaid line. Inside a
// rendered diagram there is no adjacent sentence a qualifier could live in — the
// box is a graphic object — and an end-to-end flow diagram is not a component
// inventory, it is a promise about the reader's own money: a box reading
// "6. StakeClaimer auto-sweep after releaseAt" tells them step 6 happens to
// them. Measured before adopting: across the 21 fenced mermaid blocks in this
// repo it produces exactly one finding, the diagram the previous pass missed
// while fixing its twin in docs/ai/.
//
// It stops there, and the stopping rule is not taste. Frontmatter and mermaid
// labels are rendered into places that REMOVE the page — a <meta> tag, a search
// snippet, a link preview, a box in an image. A table row, a heading and a list
// item are still on the page, with prose either side, which is exactly the case
// CLAIM_WINDOW already handles. Also measured: extending the tier to table rows,
// headings, list items and callouts as well surfaces nothing further in this
// corpus, so there is no evidence for it and it would only make a human page's
// bare mechanism description fail — the thing this checker deliberately calls
// INFO ("a component is not falsified by not running").
const DICTATES_ASSERTIONS = (rel, kind) =>
  baseKind(kind) === 'frontmatter'
  || baseKind(kind) === 'mermaid-line'
  // A RENDERED UI STRING, for the mermaid reason and no other: it is painted into
  // a box that removes the page, with no adjacent sentence a qualifier could sit
  // in, and it is a promise about the reader's own money rather than a component
  // inventory. See the ui units header.
  || baseKind(kind) === 'ui-rendered'
  || ['AGENTS.md', 'CLAUDE.md'].includes(rel)
  || rel.startsWith(`.cursor${sep}rules${sep}`)
  || rel.startsWith(`docs${sep}ai${sep}`);   // the whole agent-facing tree: these
                                             // pages declare themselves the
                                             // agent-citable reference, so a bare
                                             // assertion here is repeated verbatim

// The scan roots that are a FILE rather than a directory. Kept as its own
// list because the self-test has to enumerate them: dropping one removes
// exactly one file from the walk, which no directory-level assertion sees.
const SINGLE_FILE_ROOTS = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md'];

const SCAN_ROOTS = ['docs', '.cursor', ...SINGLE_FILE_ROOTS,
  'verify', 'proxy-router/docs', 'smart-contracts/docs', 'ui-desktop',
  // The @Description annotations in this package ARE the /blockchain/stakes/on-hold
  // text a user reads in Swagger UI; proxy-router/docs/{docs.go,swagger.json,
  // swagger.yaml} are three generated copies of them. Scanned so the enumeration
  // names the file that can actually be edited, and the generated copies stay out
  // of scope because `swag init` would overwrite a fix made in them.
  //
  // Within this package the two Go unit kinds part company: a PRINTED string is
  // in scope (see IN_SCOPE), a comment is INFO.
  'proxy-router/internal/blockchainapi',
  'proxy-router/internal/repositories/registries',
  // Where the claimer is CONSTRUCTED and started. Fact 1 of this checker is a
  // claim about this file, so the file has to be readable by the checker that
  // makes it.
  'proxy-router/internal/proxyctl'];

// ------------------------------------------------------------- matchers ----
// The subject: is this unit talking about the day-locked-stake sweep at all?
// Two tiers, because "sweep" is also the word for the model-health sweep and the
// zombie-session sweep. A STRONG token names the stake-claim machinery outright;
// a WEAK one ("sweeps", "held part") only counts alongside stake context.
const SUBJECT_STRONG = /StakeClaimer|stake_claimer|stake auto-claim|auto-?claimer|withdrawUserStakes|userStakesOnHold/i;
const SUBJECT_WEAK = /\bswept\b|\bsweeps?\b|\bsweeping\b|\bmanual claim\b|held (stake|stakes|part|amount|slice|portion)|matured stake|locked slice|on-hold|day-lock/i;
const STAKE_CTX = /\bstakes?\b|\bMOR\b|day-lock|releaseAt|on-hold|userStakesOnHold|\bwallet\b/i;
const SUBJECT = { test: (t) => SUBJECT_STRONG.test(t) || (SUBJECT_WEAK.test(t) && STAKE_CTX.test(t)) };

// Class E — EXCULPATORY: tells the reader that manual action is unnecessary.
// Every one of these is a violation when the claim lacks both conditions.
const EXCULPATORY = [
  ['NOT_REQUIRED',   /\b(is|are|was|were|be)?\s*not required\b/i],
  ['NOT_A_MANUAL',   /\bnot a manual\b/i],
  ['NO_MANUAL',      /\bno manual\b[^.;:]{0,60}?\b(needed|required|call|claim|step)\b/i],
  ['NO_X_NEEDED',    /\bno\b[^.;:]{0,40}?\b(needed|required)\b/i],
  ['NO_ACTION',      /\bno (user )?action\b/i],
  // OPTIONAL was `/\boptional\b/i` — the bare word, anywhere. That fires on any
  // parameter table for withdrawUserStakes ("`iterations_` — optional cap"),
  // which is a schema description, not a claim that the sweep needs no help.
  // Tie the word to the thing being called optional.
  ['OPTIONAL',       /\b(manual|manually|claiming|call(ing)?|withdrawUserStakes)\b[^.;:]{0,80}?\boptional\b|\boptional\b[^.;:]{0,80}?\b(manual|manually|claim|withdrawUserStakes)\b/i],
  ['FOR_YOU',        /\b(for|on behalf of) you\b|\bon your behalf\b/i],
  ['NO_NEED',        /\b(do(es)? not|don'?t|doesn'?t) (need|have) to\b|\bno need to\b/i],
  ['NOTHING_TO_DO',  /\bnothing (further |more )?(to do|is needed|is required)\b/i],
  ['MAY_ALSO',       /\byou (may|can) also\b/i],
  ['WITHOUT_ACTION', /\bwithout\b[^.;:]{0,40}?\b(manual|intervention|action|calling)\b/i],
  ['ON_ITS_OWN',     /\bon its own\b|\bby itself\b/i],
  ['HANDS_OFF',      /\bhands-?off\b/i],
  // "anyone running a router never calls it by hand" is an exculpation, and it
  // was invisible: `by hand` existed only as a Class S cue, where it means the
  // opposite ("you have to call it by hand"). So the one phrasing that both
  // smart-contracts/docs sites used to over-promise in tripped nothing. Measured
  // when added: exactly one new finding in the whole corpus, and it converts two
  // reverts that previously passed into failures.
  ['NEVER_BY_HAND',  /\bnever\b[^.;:]{0,50}?\bby hand\b|\bnever\s+(has|have|need|needs)\s+to\s+(call|claim|submit|invoke|run|withdraw)\b/i],
];

// Class A — ASSERTS THE SWEEP HAPPENS, with no exculpatory clause. For a human
// page this merely describes a component that exists, and a component is not
// falsified by not running: INFO, not a violation. In a file that dictates an
// assistant's assertions it IS a violation (see DICTATES_ASSERTIONS).
// The verb lists here are the gate's weakest joint and were measured to be so.
// AUTO_SWEEP did not match "auto-claimer" -- `claim` needs a word boundary and
// "claimer" supplies none -- even though SUBJECT_STRONG lists `auto-?claimer`
// as a name for the very thing. SWEPT_BACK did not match "the money comes home"
// because `comes` was not in its list. Together those two gaps hid an
// unqualified sweep promise that THIS pull request wrote, at
// controller.go:73-74: the file produced no violation, no INFO record, and no
// line in --info at all.
//
// The suffixes and the motion verbs below close the specific paraphrases that
// were observed. They do NOT make this a semantic check, and it is worth being
// plain about that: any lexical cue set is a list of ways of saying a thing,
// and English has more. A writer who says "you do not have to do anything for
// it to arrive" still evades every entry here. What the gate can honestly
// claim is that it fires on the forms observed in this corpus and on the ones
// that have evaded it before, each pinned as a fixture so a later refactor
// cannot quietly drop one.
const ASSERTS_SWEEP = [
  ['AUTOMATIC',   /\bautomatic(ally)?\b/i],
  // suffixes: auto-claimer, auto-claiming, auto-sweeper, auto-sweeping
  ['AUTO_SWEEP',  /\bauto-?(sweep|claim)(s|ed|er|ers|ing)?\b/i],
  ['SWEPT_BACK',  /\b(swept|sweeps|sweep|claimed|claims|returns?|returned)\b[^.;:]{0,40}?\b(back|home|to (your|the) wallet)\b/i],
  // Class A's other face: not naming a mechanism at all, but removing the
  // reader's agency -- "the money comes home whether or not anyone looks".
  // That sentence carries the full promise with none of SWEPT_BACK's verbs.
  //
  // Widening SWEPT_BACK's verb list to reach it was tried first and REVERTED,
  // measured: adding come/came/get/land/arrive took the scan from 0 violations
  // to 4, and the two new ones were a quoted user complaint ("I closed and
  // nothing came back") and a sentence about what the CLOSE transaction
  // returns. Those are different claims that happen to share a verb, and a
  // gate that cannot tell them apart teaches its reader to wave it through.
  // The agency phrasing is specific to the promise, so it costs no precision:
  // 0 new findings across the corpus.
  ['NO_AGENCY',   /\bwhether or not (anyone|you|the user)\b|\bwithout (you|anyone|the user) (doing|having to|lifting|needing)\b|\bon its own\b|\bby itself\b|\bno (user )?action (is )?(needed|required)\b/i],
];

// Class S — SOLE REMEDY. Names the manual call as THE remedy for the node-off /
// other-wallet case. False, because starting a proxy-router that holds the wallet
// claims on startup (stake_claimer.go:87-89). Only counts inside a FALLBACK_CTX:
// "you must call withdrawUserStakes" in a bare API reference is a true statement
// about an on-chain function, not a claim about the only way to get paid.
const SOLE_REMEDY = [
  ['ONLY_ROUTE',    /\bthe only (route|way|option|remedy|method|means|path|recourse)\b/i],
  ['ONLY_BY',       /\bonly by (calling|invoking|submitting|running|sending)\b/i],
  // "must be the delegatee" is a precondition on the caller, not an instruction
  // to call, so the verb list is closed and excludes `be`.
  ['MUST_CALL',     /\b(must|have to|has to|need to|needs to)\s+(call|submit|invoke|run|claim|withdraw|use|send)\b/i],
  ['BY_HAND',       /\b(has|have) to be (called|claimed|submitted|done|made)\b|\bby hand\b/i],
  ['YOU_SUBMIT',    /\b(you|the user|users|they)\s+(call|calls|submit|submits|invoke|invokes|claim|claims|withdraw|withdraws)\b[^.;:]{0,80}?\b(yourself|themselves|itself|by hand)\b/i],
  ['CALL_YOURSELF', /\b(call|calls|calling|submit|submits|submitting|invoke|invoking|claim|claims|claiming)\b[^.;:]{0,80}?\b(yourself|themselves)\b/i],
  ['IS_REQUIRED',   /\b(is|are|becomes|remains|stays) required\b/i],
  ['REQUIRED_W',    /\b(and|then|but|so) required\b/i],
  ['IS_MANUAL',     /\b(is|becomes|remains|stays) (a|an|the) manual\b/i],
  ['NEEDS_MANUAL',  /\b(needs?|requires?|takes)\s+(a|an|the)\s+manual\b/i],
];
// Cue names whose meaning flips under a preceding negation: "no user action IS
// REQUIRED" is the opposite of "the manual call IS REQUIRED", and the old
// checker had no way to tell them apart.
const NEG_SENSITIVE = new Set(['IS_REQUIRED', 'REQUIRED_W', 'MUST_CALL', 'BY_HAND', 'IS_MANUAL', 'NEEDS_MANUAL']);
const NEGATED_BEFORE = /\b(no|not|never|n'?t|nothing|neither)\b[^.;:]{0,45}$/i;
// A rule that FORBIDS the claim is not the claim. AGENTS.md ends its stake rule
// with "never state the manual call as the only route" — proscription, not
// assertion — and a checker that flags its own instruction is a checker people
// switch off.
const PROSCRIBED_BEFORE = /\b(never|not|don'?t|do not|avoid|rather than|instead of|stop)\b[^.;:]{0,70}$/i;

// The fallback case Class S is about: the reader has been told the sweep will
// not happen for them, and is now being told what to do instead.
const FALLBACK_CTX = [
  /\bwith (the |that |your |it |its )?(node |proxy-?router |router )?(off|stopped|down|offline)\b/i,
  /\b(node|proxy-?router|router) is (off|stopped|down|offline|not running)\b/i,
  /\b(another|a different|other|someone else'?s) wallet\b/i,
  /\botherwise\b/i,
  /\bif not\b/i,
  /\bnothing (sweeps|is claimed|is swept)\b/i,
  /\bin (those|these) two cases\b/i,
  /\bopened from another wallet\b/i,
  /\bbelongs to another wallet\b/i,
  /\bheld against a different wallet\b/i,
];

// The two conditions that discharge Class E and Class A. BOTH legs are required:
// a claim that says "while your node is running" but not "and only for its own
// wallet" is still wrong for the other-wallet case, and vice versa.
const COND_NODE = [
  /\**running\**\s+(a|the|your|that|its)?\s*(proxy-?router|node|c-?node|router)\b/i,
  /\b(proxy-?router|node|router)\b[^.;:]{0,40}?\bis (still )?running\b/i,
  /\bwhile\b[^.;:]{0,40}?\b(node|proxy-?router|router)\b/i,
  /\bnode\b[^.;:]{0,30}?\b(is )?(off|offline|down|stopped|not running)\b/i,
  /\bwith (the|that|your|it) (node )?(off|stopped|down|offline)\b/i,
  /\bnode is (yours and )?running\b/i,
  /\b(that|the|your) node is running\b/i,
  /\bProxy\.Run\b/,
  /\bproxyctl\.go\b/,
  /\binside a running\b/i,
];
const COND_WALLET = [
  /\b(a |an )?(different|another|other) wallet\b/i,
  /\b(its|it|that node|the node) own wallet\b/i,
  /\bown wallet\b/i,
  /\bwallet (it|that node|the node|its) holds\b/i,
  /\bholds the wallet\b/i,
  /\bonly (ever )?for (its|the node'?s?) own\b/i,
  /\bGetMyAddress\b/,
  /\bover the wallet that node holds\b/i,
  /\bopened from (its|that node'?s?) wallet\b/i,
  /\bheld against a different wallet\b/i,
];
// The condition that discharges Class S: the OTHER route is named. Starting a
// proxy-router that holds the wallet claims on startup, so any text that says so
// has told the reader the whole truth.
const COND_START = [
  /\bstarting (one|it|that node|the node|a proxy-?router|a node)\b/i,
  /\bstart(ing|s)? (a|one|that|the|your) (proxy-?router|node|router)\b/i,
  /\buntil a proxy-?router holding that wallet runs\b/i,
  /\bholding that wallet runs\b/i,
  /\bimmediately on startup\b/i,
  /\bon startup\b/i,
  /\bbring(ing|s)? (that|the|your) node back up\b/i,
  /\b(the )?two routes\b/i,
  /\bclaimOnce\b/,
  /\bstake_claimer\.go:87-89\b/,
];

const any = (res, text) => res.some((re) => re.test(text));
// Index-aware cue matching. The old `hit()` returned names only, which is why a
// negation sitting immediately before a cue was invisible to it.
function cueHits(list, text) {
  const out = [];
  for (const [name, re] of list) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = g.exec(text)) !== null) {
      out.push({ name, index: m.index, text: m[0] });
      if (m.index === g.lastIndex) g.lastIndex++;
    }
  }
  return out.sort((a, b) => a.index - b.index);
}
// What sits immediately before a cue, with the fallback phrases removed first.
// "nothing sweeps and `withdrawUserStakes` has to be called by hand" is NOT a
// negated requirement - the "nothing" negates the sweep, and is precisely the
// context that makes the rest of the sentence a sole-remedy claim. Leaving it in
// suppressed the cue and let CLAUDE.md's stake rule through.
const precededBy = (body, h, re) => re.test(
  body.slice(Math.max(0, h.index - 90), h.index)
    .replace(/\bnothing (sweeps|is claimed|is swept|is withdrawn)\b/gi, ' '));

// ------------------------------------------------------- claim windowing ----
const CLAIM_WINDOW = 600;

// Sentence spans, offsets preserved. Only . ! ? and newline terminate: an em-dash
// or a semicolon continues the same thought, and the corrected corpus attaches
// its qualifier with exactly those ("…automatically — but only while…").
function sentenceSpans(text) {
  const spans = [];
  let start = 0;
  const re = /[.!?](?=\s|$)|\n/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const end = m.index + m[0].length;
    if (end > start) spans.push([start, end]);
    start = end;
  }
  if (start < text.length) spans.push([start, text.length]);
  return spans.length ? spans : [[0, text.length]];
}

// The span a qualifier has to live in to discharge a claim at `idx`. Grows
// forward first (the corpus qualifies after the claim), then backward, and stops
// at CLAIM_WINDOW characters.
function windowAt(body, idx) {
  if (body.length <= CLAIM_WINDOW) return body;
  const spans = sentenceSpans(body);
  let c = spans.findIndex(([s, e]) => idx >= s && idx < e);
  if (c < 0) c = spans.length - 1;
  let lo = c, hi = c;
  for (;;) {
    const canHi = hi + 1 < spans.length && spans[hi + 1][1] - spans[lo][0] <= CLAIM_WINDOW;
    const canLo = lo - 1 >= 0 && spans[hi][1] - spans[lo - 1][0] <= CLAIM_WINDOW;
    if (canHi) hi++;
    else if (canLo) lo--;
    else break;
  }
  return body.slice(spans[lo][0], spans[hi][1]);
}

// ------------------------------------------------------------- classify ----
// One place decides what a unit is, so the self-test exercises the same code the
// sweep does.
// Class L — THE LOCK, not the sweep. Classes E and S both ask "is this sweep
// promise missing a qualifier". Neither can reach a sentence that is complete
// and simply FALSE about when the lock fires or where it is anchored, and that
// is a different failure with its own history on this branch:
//
//   * WRONG ANCHOR. `releaseAt_ = startOfTheDay(min(closedAt, endsAt)) + 1 days`
//     (SessionRouter.sol:296-298). Text that anchors it to the CLOSE instead
//     disagrees with the contract on every close landing on a later UTC day than
//     the one the session ended in — the contract returns everything, the text
//     says it is locked. docs/concepts/tokens-and-fees.mdx:26 said exactly that
//     for seven passes, and stake_claimer.go:16 and session_router.go:258 said
//     it in code comments the scanner did not read.
//
//   * EARLY-CLOSE ATTRIBUTION. The gate is `block.timestamp < releaseAt_`
//     (:305) with no early/late test at all, so "closing EARLY locks it" and
//     "closing late locks nothing" are both false — a late close inside the
//     session's own UTC day locks, usually the whole stake. This is the claim
//     this pull request was opened to correct, and it survived at base wording
//     in four source comments while the gate reported PASS.
//
// The provider path is the reason ANCHOR_CLOSE is not simply "mentions
// closedAt": _getProviderOnHoldAmount really does anchor to
// startOfTheDay(session.closedAt) (SessionRouter.sol:268), and a comment about
// THAT is correct. So the cue only fires where the surrounding text is about the
// USER stake, and any text carrying the correct formula discharges it.
const LOCK_SUBJECT = /userStakesOnHold|OnHold\(|releaseAt|day-?lock|_rewardUserAfterClose/i;
const CORRECT_ANCHOR = /min\(\s*(?:session\.)?closed_?At\s*,\s*(?:session\.)?ends_?At\s*\)|min\(\s*(?:session\.)?ends_?At\s*,\s*(?:session\.)?closed_?At\s*\)/i;
const PROVIDER_CTX = /provider|_getProviderOnHoldAmount|_rewardProviderAfterClose/i;

const LOCK_FALSE = [
  ['ANCHOR_CLOSE', /startOf(?:The)?Day\s*\(\s*(?:session\.)?closed_?At\s*\)/i],
  ['ANCHOR_PROSE', /\b(?:before|until)\s+the\s+(?:start\s+of\s+the\s+)?next\s+UTC\s+day\s*\(\s*`?releaseAt`?\s*\)/i],
  // CASE-SENSITIVE on purpose, and this is the cue's known limit. Uppercase
  // EARLY is the emphatic form the base source comments used and is almost
  // always the attribution error. Lowercase "early" is not: "an early close
  // returns the part you did not consume" is TRUE and appears correctly on
  // several pages, so a case-insensitive version was measured to fire on them.
  // A lowercase attribution error therefore evades this cue and is caught only
  // if it also names the wrong anchor. Stated so the gap is on the record.
  ['EARLY_ONLY',   /\bclosing (?:a session |sessions )?EARLY\b|\bclosed? (?:a session )?EARLY\b|\bfrom closing sessions\s+EARLY\b/],
  ['BEFORE_ENDS',  /\bclosing a session before it ends\b|\bclosing before (?:a block's )?`?EndsAt`?/i],
  ['LATE_NO_LOCK', /\bclosing late locks nothing\b|\bclos\w+ late\b[^.;:]{0,25}\block\w*\s+nothing\b/i],
];

// "any close, not only an early one" and its kin explicitly repair the
// attribution, so a unit carrying one is making the correct claim.
const LOCK_DISCHARGE = /any close(?:\s+landing)?[^.;:]{0,40}not only an early one|not only an early one|any close, natural expiry included|natural expiry included|not on early closes only/i;

// The two faces discharge SEPARATELY. An earlier draft let the correct formula
// discharge everything, which was too generous in one direction and untested in
// the other: text reading "locked by closing sessions EARLY ... until
// startOfTheDay(min(closedAt, endsAt))" would have been waved through with its
// attribution still wrong, and no self-test case exercised the discharge at all,
// so deleting it left the suite green. Both are fixed here.
const ANCHOR_CUES = new Set(['ANCHOR_CLOSE', 'ANCHOR_PROSE']);

function classifyLock(body) {
  if (!LOCK_SUBJECT.test(body)) return null;
  let hits = cueHits(LOCK_FALSE, body)
    .filter((h) => !(h.name === 'ANCHOR_CLOSE' && PROVIDER_CTX.test(windowAt(body, h.index))));
  // Stating the real formula discharges the ANCHOR cues only. Text that names
  // both anchors on purpose is correct — ui-desktop/src/renderer/src/utils/
  // marketplace.ts:574-577 says the chain uses min(ClosedAt, EndsAt) while that
  // function reports startOfDay(ClosedAt), and explains why they agree whenever
  // anything is held. That is the case this discharge exists for.
  if (CORRECT_ANCHOR.test(body)) hits = hits.filter((h) => !ANCHOR_CUES.has(h.name));
  // Repairing the attribution in words discharges the ATTRIBUTION cues only.
  if (LOCK_DISCHARGE.test(body)) hits = hits.filter((h) => ANCHOR_CUES.has(h.name));
  if (!hits.length) return null;
  return {
    verdict: 'violation',
    cues: [...new Set(hits.map((h) => h.name))],
    missing: 'ANCHOR',
    note: 'lock claim: the gate is block.timestamp < releaseAt_ anchored at startOfTheDay(min(closedAt, endsAt)) (SessionRouter.sol:296-298, :305)',
  };
}

// `ui` switches three things and nothing else: the Class A cue list gains the two
// rendered-only forms, the subject may be satisfied by the enclosing element's
// SOURCE, and the qualifier window is the on-screen window computed by jsxUnits
// rather than a character window inside the unit. COND_WALLET is treated as
// discharged -- see the ui units header for why that is a property of the surface
// and not a concession.
function classify(body, { agentFile, ui, uiWindow, uiSource } = {}) {
  const ASR = ui ? ASSERTS_SWEEP_UI : ASSERTS_SWEEP;
  if (ui ? !(SUBJECT.test(body) || SUBJECT_UI.test(uiSource ?? body)) : !SUBJECT.test(body)) return null;

  // Class L is decided first and independently of agentFile: a false statement
  // about the contract is false on a human page too.
  const lock = classifyLock(body);
  if (lock) return lock;

  const winOf = (h) => (ui ? (uiWindow ?? body) : windowAt(body, h.index));

  const exc = cueHits(EXCULPATORY, body);
  const asr = cueHits(ASR, body);
  const sole = cueHits(SOLE_REMEDY, body)
    .filter((h) => !precededBy(body, h, PROSCRIBED_BEFORE))
    .filter((h) => !(NEG_SENSITIVE.has(h.name) && precededBy(body, h, NEGATED_BEFORE)))
    .filter((h) => any(FALLBACK_CTX, winOf(h)));

  // A claim is discharged only by a qualifier inside its own window.
  const liveEA = [...exc, ...asr].filter((h) => {
    const w = winOf(h);
    return !(any(COND_NODE, w) && (ui || any(COND_WALLET, w)));
  });
  const liveExc = liveEA.filter((h) => EXCULPATORY.some(([n]) => n === h.name));
  const liveAsr = liveEA.filter((h) => ASR.some(([n]) => n === h.name));
  const liveSole = sole.filter((h) => !any(COND_START, winOf(h)));

  // Nothing survived: either no cue fired, or every cue that did fire had its
  // qualifier inside its own window. Both are "clean".
  if (!liveEA.length && !liveSole.length) return null;

  const names = (hs) => [...new Set(hs.map((h) => h.name))];
  const missing = [];
  if (liveExc.length || liveAsr.length) {
    const w = liveEA.map(winOf).join(' ');
    const node = any(COND_NODE, w), wallet = ui || any(COND_WALLET, w);
    missing.push([!node && 'NODE', !wallet && 'WALLET'].filter(Boolean).join('+'));
  }
  if (liveSole.length) missing.push('START');

  // `at` carries the cue OFFSETS, not only the names. A JSX unit is assembled
  // from fragments on different source lines, so without offsets every finding
  // in a multi-line rendered block reports the first line of the block and the
  // report cannot say WHICH string is wrong.
  const cues = names([...liveExc, ...liveAsr, ...liveSole]);
  const at = [...liveExc, ...liveAsr, ...liveSole].map((h) => ({ name: h.name, index: h.index }));
  if (liveSole.length) {
    return { verdict: 'violation', cues, at, missing: missing.join(','), note: 'sole-remedy: the manual call is not the only route' };
  }
  if (liveExc.length) return { verdict: 'violation', cues, at, missing: missing.join(',') };
  if (agentFile) return { verdict: 'violation', cues, at, missing: missing.join(','), note: 'agent-instruction file' };
  return { verdict: 'info', cues, at, missing: missing.join(','), why: 'describes the mechanism; no exculpatory clause' };
}

// ------------------------------------------------------------- go units ----
// Go prose has two readers, so it gets two unit kinds:
//
//   go-log-string  a literal the program PRINTS. A user meets it in a terminal,
//                  a log file or a support paste. IN_SCOPE.
//   go-comment     read by whoever is already editing the file. INFO.
//
// Splitting them is the whole point: collapsing the two would either let a bad
// log line pass as "just a comment" or turn every stale comment into a blocking
// violation, and the second is how a gate gets switched off.
//
// goMask blanks every string body and comment body in place, preserving offsets,
// so a `(` inside a string cannot unbalance the statement scan and a `//` inside
// a string cannot start a comment. Offsets survive, so the mask and the original
// index the same bytes.
function goMask(text) {
  const out = text.split('');
  const strings = [], comments = [];
  const n = text.length;
  const blank = (a, b) => { for (let k = a; k < b && k < n; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      let j = text.indexOf('\n', i); if (j < 0) j = n;
      comments.push({ start: i, end: j, value: text.slice(i + 2, j) });
      blank(i, j); i = j; continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      let j = text.indexOf('*/', i + 2); j = j < 0 ? n : j + 2;
      comments.push({ start: i, end: j, value: text.slice(i + 2, j - 2), block: true });
      blank(i, j); i = j; continue;
    }
    if (c === '"') {
      let j = i + 1, v = '';
      while (j < n && text[j] !== '"' && text[j] !== '\n') {
        if (text[j] === '\\') { v += ' '; j += 2; continue; }
        v += text[j]; j++;
      }
      const end = Math.min(j + 1, n);
      strings.push({ start: i, end, value: v });
      blank(i, end); i = end; continue;
    }
    if (c === '`') {                              // raw string, may span lines
      let j = text.indexOf('`', i + 1); if (j < 0) j = n - 1;
      strings.push({ start: i, end: j + 1, value: text.slice(i + 1, j) });
      blank(i, j + 1); i = j + 1; continue;
    }
    if (c === "'") {                              // rune literal
      let j = i + 1;
      while (j < n && text[j] !== "'" && text[j] !== '\n') { if (text[j] === '\\') { j += 2; continue; } j++; }
      const end = Math.min(j + 1, n);
      blank(i, end); i = end; continue;
    }
    i++;
  }
  return { masked: out.join(''), strings, comments };
}

// Calls whose string arguments reach a person: the logger, and the error text
// that gets wrapped up to an HTTP response or printed on exit.
const GO_PRINTS = /\.\s*(Infof?|Warnf?|Warningf?|Errorf?|Debugf?|Fatalf?|Panicf?|Printf?|Println)\s*\(|\b(fmt\.Errorf|fmt\.Printf|fmt\.Println|errors\.New)\s*\(/g;

function goUnits(text) {
  const { masked, strings, comments } = goMask(text);
  // line number for a byte offset, without rescanning the file each time
  const starts = [0];
  for (let k = 0; k < text.length; k++) if (text[k] === '\n') starts.push(k + 1);
  const lineOf = (off) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };

  const out = [];

  // printed strings: one unit per call statement, all its literals joined, so a
  // wrapped Warnf("... " + "...") is one thing a user reads, not two fragments.
  GO_PRINTS.lastIndex = 0;
  let m;
  while ((m = GO_PRINTS.exec(masked)) !== null) {
    const open = masked.indexOf('(', m.index);
    if (open < 0) continue;
    let depth = 0, close = masked.length;
    for (let k = open; k < masked.length; k++) {
      if (masked[k] === '(') depth++;
      else if (masked[k] === ')') { depth--; if (depth === 0) { close = k; break; } }
    }
    const lits = strings.filter((st) => st.start > open && st.end <= close + 1).map((st) => st.value);
    if (!lits.length) continue;
    out.push({ kind: 'go-log-string', start: lineOf(open), end: lineOf(close), lines: [lits.join(' ')] });
    GO_PRINTS.lastIndex = close;
  }

  // comments: contiguous // lines are one block; a /* */ is one on its own
  let cur = null;
  const flush = () => { if (cur && cur.lines.some((l) => l.trim())) out.push(cur); cur = null; };
  for (const c of comments) {
    const ln = lineOf(c.start);
    if (c.block) { flush(); out.push({ kind: 'go-comment', start: ln, end: lineOf(c.end), lines: [c.value] }); continue; }
    if (cur && ln === cur.end + 1) { cur.lines.push(c.value); cur.end = ln; continue; }
    flush();
    cur = { kind: 'go-comment', start: ln, end: ln, lines: [c.value] };
  }
  flush();

  return out.sort((a, b) => a.start - b.start);
}

// ------------------------------------------------------------- ui units ----
// `ui-desktop` has been in SCAN_ROOTS since this checker was written, but walk()
// admitted only .md .mdx .mdc .yml .yaml .json .go -- so the directory was
// SCANNED AND NEVER IN SCOPE, the identical structural hole this file records
// having closed for smart-contracts/docs. Nineteen files (package.json,
// tsconfig, a yml) were read; the 407 .jsx/.tsx/.ts files that contain every
// sentence a user of the app actually reads were not. `PASS: 0` was therefore
// never evidence about the desktop UI at any wording.
//
// JSX prose has THREE text kinds and they do not share a reader:
//
//   ui-rendered   text the app PAINTS ON SCREEN -- bare JSX children text, and
//                 string/template literals inside a JSX expression container in
//                 children position. IN_SCOPE, and the high-stakes kind: this is
//                 the sentence a user reads next to their own balance.
//   ui-comment    `{/* ... */}`, `// ...` and `/* ... */`. Read by whoever is
//                 already editing the component. INFO, exactly like go-comment.
//   (attributes)  className, data-testid, styled-component CSS. Not prose at
//                 all; never cut into a unit, but the element's SOURCE is used
//                 as subject context (see SUBJECT_UI) because `onHoldLines` and
//                 `lock.unlockAt` are how a JSX subtree says what it is about.
//
// A RENDERED STRING CARRIES THE ASSERTION-DICTATING TIER, and the reason is the
// one DICTATES_ASSERTIONS already gives for a mermaid node label: it is rendered
// into a place that REMOVES the page. "Returns automatically" sits in a tile
// beside "On Hold  12.4 MOR". There is no adjacent sentence a qualifier could
// live in, the user did not choose to read documentation, and the box is not a
// component inventory -- it is a promise about the reader's own money. So a bare
// Class A assertion is a violation here, where on a human prose page it is INFO.
//
// THE WALLET LEG IS DISCHARGED BY CONSTRUCTION IN THIS SURFACE, and only here.
// Fact 2 (the claimer withdraws for GetMyAddress alone) cannot strand a reader
// of this app: ui-desktop/src/main/orchestrator/** spawns and owns the
// proxy-router, and every balance the renderer shows is that node's own wallet.
// Requiring COND_WALLET of a UI string would be requiring text to disclaim a
// case the surface cannot produce -- a gate firing on something unfixable, which
// is how a gate gets switched off. COND_NODE is NOT discharged: the app can be
// quit, and then nothing sweeps. That is the whole finding.

// The subject test for a UI unit. Rendered text alone is too thin to carry it --
// "Returns automatically" names nothing -- so the enclosing element's SOURCE
// counts as subject evidence. Identifiers cannot themselves produce a cue hit,
// so widening here can only add candidate units, never invent a claim.
const SUBJECT_UI = /\bstakes?\b|\bstaking\b|\bstaked\b|stakesOnHold|onHold|on-hold|lockedWei|unlockAt|releaseAt|StakeClaimer|withdrawUserStakes|day-?lock/i;

// Class A cues for RENDERED text only. Two forms the prose cue set does not
// reach, both measured live in this tree:
//   RETURN_TO_WALLET  "Returning to your wallet now" -- SWEPT_BACK's verb list
//                     has `returns?|returned` and no participle, so the one
//                     string on the On Hold tile that names the destination
//                     tripped nothing at all.
//   UNAIDED_RETURN    "each one returns at the end of the day it closes" -- a
//                     bare intransitive `returns` with no destination and no
//                     adverb. In PROSE this cue would be unusable: the corpus
//                     note above ASSERTS_SWEEP records that widening the verb
//                     list took the scan 0 -> 4 violations on sentences about
//                     what the CLOSE transaction returns and on a quoted user
//                     complaint. Rendered UI text has neither shape, which is
//                     why the cue is scoped to it and not promoted. Measured
//                     across all 407 UI source files before adopting.
const ASSERTS_SWEEP_UI = [
  ...ASSERTS_SWEEP,
  ['RETURN_TO_WALLET', /\b(return|returns|returned|returning|comes?|coming|came|back)\b[^.;:]{0,40}?\bto (your|the) wallet\b/i],
  ['UNAIDED_RETURN',   /\b(returns|returning|return)\b(?![^.;:]{0,20}\b(in the close|at close|in the same txn)\b)[^.;:]{0,60}?\b(at the end of|after|once|when|automatically|on its own)\b/i],
];

// jsxMask blanks every string body and comment body in place, preserving
// offsets, exactly as goMask does -- so a `<` inside a string cannot open a tag
// and a `//` inside a string cannot start a comment.
//
// Two deliberate deviations from goMask, both forced by JSX:
//   * an apostrophe in JSX TEXT ("It's locked") is not a string opener. A quote
//     only opens a literal when the previous non-space character is not a word
//     character, and an unterminated quote at end-of-line is abandoned rather
//     than swallowing the rest of the file.
//   * a TAGGED template (styled.div`...`) is masked but NOT recorded as a
//     string: styled-components CSS is not prose, and recording it would put a
//     stylesheet into the rendered-text stream.
function jsxMask(text) {
  const out = text.split('');
  const strings = [], comments = [];
  const n = text.length;
  const blank = (a, b) => { for (let k = a; k < b && k < n; k++) if (out[k] !== '\n') out[k] = ' '; };
  const wordch = /[A-Za-z0-9_$)\]`]/;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      let j = text.indexOf('\n', i); if (j < 0) j = n;
      comments.push({ start: i, end: j, value: text.slice(i + 2, j) });
      blank(i, j); i = j; continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      let j = text.indexOf('*/', i + 2); j = j < 0 ? n : j + 2;
      comments.push({ start: i, end: j, value: text.slice(i + 2, j - 2), block: true });
      blank(i, j); i = j; continue;
    }
    if (c === '"' || c === "'") {
      let k = i - 1; while (k >= 0 && /[ \t]/.test(text[k])) k--;
      if (k >= 0 && /[A-Za-z0-9_]/.test(text[k])) { i++; continue; }   // don't / it's
      let j = i + 1, v = '';
      while (j < n && text[j] !== c && text[j] !== '\n') {
        if (text[j] === '\\') { v += ' '; j += 2; continue; }
        v += text[j]; j++;
      }
      if (j >= n || text[j] === '\n') { i++; continue; }               // unterminated
      const end = j + 1;
      strings.push({ start: i, end, value: v });
      blank(i, end); i = end; continue;
    }
    if (c === '`') {
      let k = i - 1; while (k >= 0 && /\s/.test(text[k])) k--;
      const tagged = k >= 0 && wordch.test(text[k]);
      let j = i + 1, v = '';
      while (j < n) {
        if (text[j] === '\\') { v += ' '; j += 2; continue; }
        if (text[j] === '$' && text[j + 1] === '{') {
          let d = 1; j += 2; v += ' ';
          while (j < n && d > 0) { if (text[j] === '{') d++; else if (text[j] === '}') d--; if (d) j++; }
          j++; continue;
        }
        if (text[j] === '`') break;
        v += text[j]; j++;
      }
      const end = Math.min(j + 1, n);
      if (!tagged) strings.push({ start: i, end, value: v });
      blank(i, end); i = end; continue;
    }
    i++;
  }
  return { masked: out.join(''), strings, comments };
}

// A '<' opens a JSX tag unconditionally when we are already inside JSX CHILDREN
// (an element is open and brace depth is 0): a comparison there would have to
// sit inside an expression container. Everywhere else it must be in expression
// position -- after an identifier it is a comparison or a TS generic
// (`useState<Foo>`, `Array<string>`, `a < b`), never a tag. Getting this wrong
// in the safe direction costs a spurious element with no text; getting it wrong
// in the other direction loses a subtree, which is why legWiring asserts the
// generic and comparison forms explicitly.
const TAG_PREV_OK = /[({[>,=;?&|!+\n]|^$/;
// ...and after a keyword. `return <Panel/>` is the single most common JSX form in
// this tree and its preceding character is `n`, which TAG_PREV_OK rejects. Tested
// in legWiring both ways: the keyword must open a tag, a bare identifier must not.
const TAG_PREV_KEYWORD = /(?:^|[^\w$])(return|case|await|yield|typeof|void|delete|else|do|of|in)$/;

function jsxTree(text) {
  const { masked, strings, comments } = jsxMask(text);
  const n = masked.length;
  const root = { name: '#root', openStart: 0, openEnd: 0, closeStart: text.length, closeEnd: text.length,
                 children: [], parent: null, depth: 0 };
  let cur = root, brace = 0, i = 0;
  while (i < n) {
    const c = masked[i];
    if (c === '{') { brace++; i++; continue; }
    if (c === '}') { if (brace > 0) brace--; i++; continue; }
    if (c !== '<') { i++; continue; }
    const nx = masked[i + 1];
    if (!nx || !/[A-Za-z/>]/.test(nx)) { i++; continue; }
    if (!(cur !== root && brace === 0) && nx !== '/') {
      let k = i - 1; while (k >= 0 && /\s/.test(masked[k])) k--;
      if (!TAG_PREV_OK.test(k >= 0 ? masked[k] : '\n')
          && !TAG_PREV_KEYWORD.test(masked.slice(Math.max(0, k - 12), k + 1))) { i++; continue; }
    }
    let j = i + 1;
    const closing = masked[j] === '/';
    if (closing) j++;
    const nm = /^[A-Za-z][\w.$:-]*/.exec(masked.slice(j, j + 120));
    const name = nm ? nm[0] : '';
    if (!name && masked[j] !== '>') { i++; continue; }        // neither <Tag nor <> / </>
    j += name.length;
    let d = 0, end = -1;
    while (j < n) {
      const ch = masked[j];
      if (ch === '{') d++;
      else if (ch === '}') d--;
      else if (ch === '>' && d === 0) { end = j + 1; break; }
      else if (ch === '<' && d === 0) break;                  // ran into another '<': not a tag
      j++;
    }
    if (end < 0) { i++; continue; }
    if (closing) {
      let up = cur;
      while (up && up !== root && up.name !== name) up = up.parent;
      if (up && up !== root) { up.closeStart = i; up.closeEnd = end; cur = up.parent; brace = up.savedBrace; }
      i = end; continue;
    }
    const selfClosing = masked[end - 2] === '/';
    const el = { name, openStart: i, openEnd: end, closeStart: end, closeEnd: end,
                 children: [], parent: cur, depth: cur.depth + 1, selfClosing };
    cur.children.push(el);
    if (!selfClosing) { el.savedBrace = brace; cur = el; brace = 0; }
    i = end;
  }
  return { root, masked, strings, comments };
}

// Rendered fragments owned DIRECTLY by `el` -- the gaps between its open tag and
// its children and its close tag. Bare text comes from the raw source (so an
// apostrophe survives); text inside a `{...}` container contributes only the
// string literals it holds, which is what `{cond ? 'A' : 'B'}` actually paints.
function jsxOwnFrags(el, text, masked, strings, lineOf) {
  const frags = [];
  const gaps = [];
  let a = el.openEnd;
  for (const c of el.children) { gaps.push([a, c.openStart]); a = c.closeEnd; }
  gaps.push([a, el.closeStart]);
  for (const [s, e] of gaps) {
    if (e <= s) continue;
    let i = s;
    while (i < e) {
      if (masked[i] === '{') {
        let d = 0, j = i;
        while (j < e) { if (masked[j] === '{') d++; else if (masked[j] === '}') { d--; if (!d) { j++; break; } } j++; }
        for (const st of strings) {
          if (st.start >= i && st.end <= j && st.value.trim()) frags.push({ line: lineOf(st.start), text: st.value.trim() });
        }
        i = j; continue;
      }
      let j = i;
      while (j < e && masked[j] !== '{') j++;
      let off = i;
      for (const piece of text.slice(i, j).split('\n')) {
        if (piece.trim()) frags.push({ line: lineOf(off), text: piece.trim() });
        off += piece.length + 1;
      }
      i = j;
    }
  }
  return frags;
}

const fragBody = (frags) => frags.map((f) => f.text).join(' ');

// One unit per element that OWNS rendered text. Body is its own text only, so a
// cue can never be counted twice up the ancestor chain; the qualifier window is
// widened separately (see jsxUnits below), which is the JSX form of CLAIM_WINDOW:
// what a qualifier has to be on the same SCREEN as, not merely in the same file.
function jsxUnits(text) {
  const { root, masked, strings, comments } = jsxTree(text);
  const starts = [0];
  for (let k = 0; k < text.length; k++) if (text[k] === '\n') starts.push(k + 1);
  const lineOf = (off) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= off) lo = m; else hi = m - 1; }
    return lo + 1;
  };

  const out = [];
  const visit = (el) => {
    el.own = jsxOwnFrags(el, text, masked, strings, lineOf);
    for (const c of el.children) visit(c);
    el.sub = [...el.own];
    for (const c of el.children) el.sub.push(...c.sub);
    el.sub.sort((a, b) => a.line - b.line);
  };
  visit(root);

  // `root` owns every byte outside a JSX element -- imports, hooks, statements.
  // It is not something the app paints, so it never becomes a unit.
  const emit = (el) => {
    if (el !== root && el.own.length) {
      // The qualifier window: climb while the ancestor's whole rendered subtree
      // still fits in CLAIM_WINDOW. That ancestor's rendered text is what a
      // qualifier must live in to reach the claim, and its SOURCE is the subject
      // context. Beyond CLAIM_WINDOW a qualifier is on a different part of the
      // screen and does not travel with the claim -- the same bound, and the
      // same reason, as the prose case.
      let win = el;
      while (win.parent && win.parent !== root
             && fragBody(win.parent.sub).length <= CLAIM_WINDOW) win = win.parent;
      const body = fragBody(el.own);
      out.push({
        kind: 'ui-rendered', start: el.own[0].line, end: el.own[el.own.length - 1].line,
        lines: [body], body,
        frags: el.own,
        window: fragBody(win.sub),
        source: text.slice(win.openStart, win.closeEnd),
      });
    }
    for (const c of el.children) emit(c);
  };
  emit(root);

  // comments: contiguous // lines are one block; a /* */ (which is what a
  // {/* ... */} JSX comment reduces to) is one on its own
  let cur = null;
  const flush = () => { if (cur && cur.lines.some((l) => l.trim())) out.push(cur); cur = null; };
  for (const c of comments) {
    const ln = lineOf(c.start);
    if (c.block) { flush(); out.push({ kind: 'ui-comment', start: ln, end: lineOf(c.end), lines: [c.value] }); continue; }
    if (cur && ln === cur.end + 1) { cur.lines.push(c.value); cur.end = ln; continue; }
    flush();
    cur = { kind: 'ui-comment', start: ln, end: ln, lines: [c.value] };
  }
  flush();

  return out.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------- units ----
// Split a document into the spans a reader can encounter on their own.
function units(text, ext = 'md') {
  if (ext === 'go') return goUnits(text);
  if (['jsx', 'tsx', 'ts', 'js'].includes(ext)) return jsxUnits(text);
  const lines = text.split('\n');
  const out = [];
  let cur = null;
  const flush = () => { if (cur && cur.lines.some((l) => l.trim())) out.push(cur); cur = null; };
  const start = (i, kind) => { flush(); cur = { kind, start: i + 1, lines: [] }; };
  const push = (i, l) => { if (!cur) start(i, 'para'); cur.lines.push(l); cur.end = i + 1; };

  let inFrontmatter = false, fence = null, fenceLang = '';

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], t = l.trim();

    // frontmatter: one unit per key, because an agent quotes `description:` alone
    if (i === 0 && t === '---') { inFrontmatter = true; flush(); continue; }
    if (inFrontmatter) {
      if (t === '---') { inFrontmatter = false; flush(); continue; }
      if (/^[A-Za-z_][\w-]*\s*:/.test(t)) start(i, 'frontmatter');
      push(i, l);
      continue;
    }

    // fenced code
    const f = t.match(/^(`{3,}|~{3,})\s*(\S*)/);
    if (f && !fence) { flush(); fence = f[1][0].repeat(3); fenceLang = f[2].toLowerCase(); continue; }
    if (f && fence && t.startsWith(fence)) { flush(); fence = null; fenceLang = ''; continue; }
    if (fence) {
      // Only mermaid label text is prose a reader consumes. A `cast send` example
      // is not a claim about whether they must run it.
      if (fenceLang === 'mermaid') { start(i, 'mermaid-line'); push(i, l); flush(); }
      continue;
    }

    if (!t) { flush(); continue; }
    if (/^#{1,6}\s/.test(t)) { start(i, 'heading'); push(i, l); flush(); continue; }

    // table: one unit per row; skip the alignment rule
    if (/^\|/.test(t)) {
      if (/^\|[\s:|-]+\|?$/.test(t)) { flush(); continue; }
      start(i, 'table-row'); push(i, l); flush(); continue;
    }

    // JSX component boundaries. An opening tag that carries a `title=` starts a
    // unit and stays attached to the body it titles (a Step title is read WITH
    // its step, not alone).
    //
    // A bare open/close tag used to be JUST a boundary — the line was flushed and
    // dropped. That discarded every single-line callout, `<Note>…</Note>` on one
    // line, which is Mintlify's most common form and exactly where a one-sentence
    // unqualified claim lives. Strip the tags and keep whatever prose rides along.
    if (/^<\/?[A-Z][\w.]*/.test(t)) {
      if (/^<[A-Z][\w.]*[^>]*\btitle=/.test(t)) { start(i, 'component'); push(i, l); continue; }
      const residue = l.replace(/<\/?[A-Z][\w.]*(?:\s[^>]*?)?\/?>/g, ' ').trim();
      if (!residue) { flush(); continue; }
      const selfContained = /<\/[A-Z][\w.]*>\s*$/.test(t) || /\/>\s*$/.test(t);
      start(i, 'component'); push(i, residue);
      if (selfContained) flush();
      continue;
    }

    // list item: each bullet is its own unit, continuation lines join it
    if (/^([-*+]|\d+\.)\s/.test(t)) { start(i, 'list-item'); push(i, l); continue; }

    push(i, l);
  }
  flush();
  return out;
}

// A bolded lead sentence is the fragment that actually gets quoted: the summary
// line. It has to carry its own qualifier, so it is classified as a unit too.
const BOLD_LEAD = /^(?:\s*(?:[-*+]|\d+\.)\s+)?\*\*([^*][\s\S]{38,}?)\*\*(?=[\s.,;:]|$)/;
function subUnits(u) {
  const body = u.body ?? u.lines.join(' ');
  const out = [{ ...u, body }];
  const m = BOLD_LEAD.exec(body.trim());
  if (m && m[1].length + 4 < body.trim().length) {
    out.push({ ...u, kind: `${u.kind}/bold-lead`, body: m[1] });
  }
  return out;
}

// ---------------------------------------------------------------- files ----
function walk(p, acc) {
  let st; try { st = statSync(p); } catch { return acc; }
  if (st.isDirectory()) {
    if (/(^|\/)(node_modules|\.git|dist|build)$/.test(p)) return acc;
    for (const e of readdirSync(p)) walk(join(p, e), acc);
  } else if (/\.(mdx?|mdc|ya?ml|json|go|jsx|tsx|ts|js)$/.test(p)) acc.push(p);
  return acc;
}

// The whole pipeline as ONE callable, so the self-test can run the real thing
// against a corpus it controls. Everything below --selftest goes through here;
// there is no second code path.
function scan(root) {
  const files = [];
  for (const r of SCAN_ROOTS) walk(join(root, r), files);
  files.sort();

  const violations = [], info = [];
  let scanned = 0, scannedInScope = 0;

  for (const abs of files) {
    const rel = relative(root, abs);
    let text; try { text = readFileSync(abs, 'utf8'); } catch { continue; }
    scanned++;
    // File-level count, kept as the coarse "did the walk reach real prose"
    // signal the pipeline leg asserts on. Per-unit scope is decided below.
    if (PROSE_IN_SCOPE(rel)) scannedInScope++;
    const ext = abs.slice(abs.lastIndexOf('.') + 1).toLowerCase();
    const isUi = ['jsx', 'tsx', 'ts', 'js'].includes(ext);
    // File-level prefilter. A UI file has to be allowed in on SUBJECT_UI too, or
    // the widening is undone one line above the code that implements it: no
    // rendered string in this app contains the word "StakeClaimer".
    if (!SUBJECT.test(text) && !(isUi && SUBJECT_UI.test(text))) continue;

    for (const u of units(text, ext)) {
      for (const su of subUnits(u)) {
        const body = su.body;
        const ui = su.kind === 'ui-rendered';
        if (!ui && !SUBJECT.test(body)) continue;
        const c = classify(body, {
          agentFile: DICTATES_ASSERTIONS(rel, su.kind),
          ui, uiWindow: su.window, uiSource: su.source,
        });
        if (!c) continue;
        // A Go COMMENT is INFO for the sweep classes, and the reason is about the
        // reader: a comment describes a mechanism to whoever is already editing
        // the file, not a promise to a user with money in the contract. That
        // reasoning does not transfer to Class L. A comment that says the wrong
        // thing about what the contract DOES is read by the next editor and
        // copied outward — which is the measured history here: at ea7028d7,
        // stake_claimer.go:12-28 and session_router.go:255-259 both carried the
        // wrong anchor AND the early-close attribution, they survived every pass
        // of this branch, and the wording reappeared in the docs those comments
        // describe. So Class L is in scope wherever it is scanned.
        // Restricted to Go comments in the scanned packages. A blanket override
        // was tried and REVERTED: it also dragged the evidence root in, which records
        // what was true at a past commit and is out of scope on purpose — two
        // audit files immediately became violations for correctly quoting the
        // wording they were auditing.
        const inScope = IN_SCOPE(rel, su.kind)
          || (c.missing === 'ANCHOR' && baseKind(su.kind) === 'go-comment' && IS_SCANNED_GO(rel));

        // Attribute each cue to the source line of the FRAGMENT it landed in.
        // For md/go there is one line span and this is a no-op; for a JSX unit
        // it is the difference between "somewhere in this 12-line block" and
        // Dashboard.jsx:676.
        let cueLines = null;
        if (su.frags && c.at && c.at.length) {
          const bounds = []; let off = 0;
          for (const f of su.frags) { bounds.push([off, off + f.text.length, f.line]); off += f.text.length + 1; }
          const ls = new Set();
          for (const h of c.at) {
            const b = bounds.find(([a, z]) => h.index >= a && h.index < z) ?? bounds[bounds.length - 1];
            if (b) ls.add(b[2]);
          }
          cueLines = [...ls].sort((a, b) => a - b);
        }
        const rec = {
          file: rel, line: su.start, endLine: su.end ?? su.start, kind: su.kind,
          cueLines, cues: c.cues, missing: c.missing, note: c.note,
          excerpt: body.replace(/\s+/g, ' ').trim().slice(0, 200),
        };

        if (!inScope) { info.push({ ...rec, why: 'out of scope (see IN_SCOPE)' }); continue; }
        if (c.verdict === 'violation') violations.push(rec);
        else info.push({ ...rec, why: c.why });
      }
    }
  }
  return { violations, info, scanned, scannedInScope, files };
}

// ------------------------------------------------------------ self-test ----
// Gate the gate, in three legs. Leg 2 is the one that matters: the previous
// self-test called classify() on hand-typed strings and therefore could not tell
// a working checker from a checker that scanned zero files.
//
//   node scripts/check-sweep-preconditions.mjs --selftest

// Leg 1a — SHAPES. Hand-written, for wordings the corpus does not currently
// contain. Kept small; the corpus cases below carry the weight.
const SYNTHETIC_CASES = [
  // [expect, agentFile, text]
  ['violation', false, 'the locked amount in `userStakesOnHold` is automatically swept by the proxy-router\'s StakeClaimer after ~1 UTC day; manual `withdrawUserStakes` is not required'],
  ['violation', false, 'Cleared by the StakeClaimer, which submits `withdrawUserStakes` automatically once an entry matures; calling it yourself is optional.'],
  ['violation', false, 'the proxy-router\'s StakeClaimer sweeps it back automatically, with no manual `withdrawUserStakes` needed'],
  ['violation', false, 'The proxy-router automatically sweeps matured stake every 10 minutes; no manual claim needed.'],
  ['violation', false, 'it does make the second call for you: its StakeClaimer sweeps matured stake automatically, so a manual claim is not required'],
  ['violation', false, 'the proxy-router sweeps it automatically every 10 minutes; you may also call `withdrawUserStakes` yourself'],
  ['violation', false, 'the StakeClaimer sweeps it back automatically. The wait is the day-lock, not a manual claim step.'],
  // "never ... by hand" is an exculpation, not a requirement. Class S owns the
  // words `by hand`; before NEVER_BY_HAND this sentence tripped nothing at all.
  ['violation', false, 'The proxy-router auto-sweeps matured on-hold rows every 10 minutes, so anyone running a router never calls it by hand.'],
  ['clean',     false, 'The proxy-router auto-sweeps matured on-hold rows every 10 minutes, but only while that router is running and only for the wallet it holds, so its operator never calls it by hand for their own stake; with the router off, or for stake held against a different wallet, nothing sweeps until a proxy-router holding that wallet runs - starting one claims it immediately on startup - and the manual call is the alternative.'],
  // one condition is not enough - the other case still strands the reader
  ['violation', false, 'a running proxy-router sweeps matured stake, so manual `withdrawUserStakes` is not required'],
  ['violation', false, 'the StakeClaimer withdraws only for its own wallet, so a manual claim is not required'],
  // a bare assertion: fine in prose for a human, a violation where it dictates
  // what an assistant asserts
  ['info',      false, 'Whatever was locked is swept back to the wallet after `releaseAt`.'],
  ['violation', true,  'Whatever was locked is swept back to the wallet after `releaseAt`.'],

  // --- Class S. These three USED TO BE ASSERTED AS `clean`. Every one of them
  // is wording 60b7535d deleted from the docs, so the checker was certifying the
  // exact regression it exists to prevent. `Run` claims on startup
  // (stake_claimer.go:87-89), so "the manual call is required / the only route"
  // is false: starting a proxy-router that holds the wallet is the other route.
  ['violation', false, 'the StakeClaimer sweeps matured stake, so manual `withdrawUserStakes` is not required - but only while your own node is running and only for the wallet it holds; with the node off, or for a session opened from another wallet, the manual call is required'],
  ['violation', true,  'Held stakes past their lock are auto-claimed back for you while your own node is running - with it stopped, or for stakes held against a different wallet, the claim is a manual on-chain call.'],
  ['violation', false, 'A **running** proxy-router claims matured on-hold stakes automatically via its StakeClaimer, and only for its own wallet. There is no HTTP endpoint; manual claiming is the alternative - and the only route when the node is off or the stake belongs to another wallet.'],

  // --- the same three, repaired the way the corpus now words them: both
  // conditions AND both routes. These are what `clean` is supposed to mean.
  ['clean',     false, 'the StakeClaimer sweeps matured stake, so manual `withdrawUserStakes` is not required - but only while your own node is running and only for the wallet it holds; with the node off, or for a session opened from another wallet, nothing sweeps until a proxy-router holding that wallet runs - starting one claims matured stake immediately on startup - and the manual call is the alternative'],
  ['clean',     true,  'Held stakes past their lock are auto-claimed back for you while your own node is running - with it stopped, or for stakes held against a different wallet, nothing sweeps until a proxy-router holding that wallet runs: starting one claims it immediately on startup, and the manual on-chain call is the alternative.'],
  ['clean',     false, 'A **running** proxy-router claims matured on-hold stakes automatically via its StakeClaimer, and only for its own wallet. There is no HTTP endpoint; manual claiming is the alternative. When the node is off or the stake belongs to another wallet, nothing sweeps until a proxy-router holding that wallet runs - starting one claims matured stake immediately on startup - so starting that node and the manual call are the two routes.'],

  // CLAIM_WINDOW, and ONLY CLAIM_WINDOW. A 1,071-character unit with no bolded
  // lead: the claim is at character 0 and its qualifier starts at 763, so the
  // qualifier is real but does not travel with the claim. Removing the 600-char
  // bound turns this into `clean` and changes nothing else in the suite - which
  // is how it was verified to be the only case pinning that bound. Before this
  // case, deleting CLAIM_WINDOW passed the self-test 41/41 (checked against
  // e93817ae, so the hole predates the widening).
  ['violation', false, 'The StakeClaimer sweeps matured stake back to your wallet automatically, so no manual `withdrawUserStakes` call is needed. The on-hold queue is a per-user array on the Diamond and each row carries an amount and a release time. Rows are popped as they are withdrawn, so the array stays short in practice and the bounded loop is cheap. The read side is a view call that takes an iteration cap, and the write side pops every row that has matured. A row that has not matured is skipped rather than reverted, so a call that finds nothing due is a no-op. The amount in a row is computed from the seconds actually consumed in the final UTC day of the session. None of that changes with how the session ended, and none of it depends on which key submits the transaction. That happens only while your own node is running and only for the wallet it holds; with the node off, or for a session opened from another wallet, nothing sweeps until a proxy-router holding that wallet runs - starting one claims matured stake immediately on startup - and the manual call is the alternative.'],

  // a rule that FORBIDS the claim is not the claim (AGENTS.md ends this way)
  ['clean',     true,  'Whatever was locked is swept back by the consumer\'s own running proxy-router, and only for the wallet that node holds - with the node off, or for a session opened from another wallet, nothing sweeps until a proxy-router holding that wallet runs: starting one claims matured stake immediately on startup, and calling `withdrawUserStakes` themselves is the alternative. Never state the sweep unconditionally, and never state the manual call as the only route.'],
  // a bare parameter table must not trip the exculpatory OPTIONAL cue
  ['clean',     false, '`withdrawUserStakes(address, uint8)` moves past-releaseAt rows from `userStakesOnHold` to the user\'s wallet. `iterations_` is optional and caps how many rows to process per call; the caller must be the delegatee for that consumer.'],

  // not this subject: the model-health sweep and the zombie-session sweep also
  // use the word, and recovery there really is automatic
  ['clean',     false, 'What cannot stall is the model-health sweep, which calls ReattestBackend on every sweep. Recovery is automatic either way - no restart, no manual clear.'],
  ['clean',     true,  'Queue an immediate model health sweep instead of waiting for the next scheduled run. Returns immediately; the sweep runs in the background.'],
  // no claim at all -> nothing to report
  ['clean',     false, '`withdrawUserStakes(address, uint8)` moves past-releaseAt rows from `userStakesOnHold` to the user\'s wallet.'],

  // --- Class L: the lock claim itself ---
  ['violation', false, 'Closing a session early locks the used-compute portion until `startOfTheDay(closedAt) + 1 day` in `userStakesOnHold`.'],
  ['violation', false, 'GetUserStakesOnHold reports stake locked from closing sessions EARLY. Closing late locks nothing.'],
  // discharged by carrying the real formula
  ['clean', false, 'The day-lock parks the slice in `userStakesOnHold` until `releaseAt = startOfTheDay(min(closedAt, endsAt)) + 1 day`.'],
  // discharged by repairing the attribution in words
  ['clean', false, 'Stake time-locked by a close landing before releaseAt in `userStakesOnHold` - any close, not only an early one.'],
  // exercises the ANCHOR discharge specifically: ANCHOR_CLOSE fires on
  // startOfDay(ClosedAt) and is discharged by the min() form in the same unit.
  // Deleting the discharge turns this clean case into a violation.
  ['clean', false, "The chain's release time for `userStakesOnHold` is startOfDay(min(ClosedAt, EndsAt)) + 1 day; this helper reports startOfDay(ClosedAt) + 1 day, and they are the same day whenever anything is actually held."],
  // exercises the ATTRIBUTION discharge specifically: EARLY_ONLY fires and is
  // repaired in words by the same unit. Deleting that discharge turns this
  // clean case into a violation.
  ['clean', false, 'Stake in `userStakesOnHold` was once described as coming from closing sessions EARLY; it is parked by any close landing before releaseAt, not only an early one.'],
  // the correct formula does NOT excuse a wrong attribution in the same unit
  ['violation', false, 'Stake time-locked by closing sessions EARLY sits in `userStakesOnHold` until `releaseAt = startOfTheDay(min(closedAt, endsAt)) + 1 day`.'],
  // the PROVIDER path really is anchored to closedAt, so this must NOT fire
  ['clean', false, '_getProviderOnHoldAmount locks the provider tokens for the current day; withdrawal is allowed a day after `startOfTheDay(session.closedAt)`, and `userStakesOnHold` is a different list.'],
];

// Leg 1b — CORPUS. Byte slices lifted programmatically out of the tree (and, for
// the three that 60b7535d deleted, out of `git show 60b7535d^:<path>`), not
// retyped. The provenance string is the file and line the slice came from;
// `--verify-fixtures` re-extracts each one and asserts it is still byte-identical
// and still gets the same verdict. It is a separate mode on purpose: the docs
// pass that follows this commit will change those lines, and a gate that breaks
// when the corpus is FIXED would be a gate nobody keeps.
const CORPUS_CASES = [
  // sole-remedy: 'submit withdrawUserStakes yourself' with no start-the-node route
  ['violation', true, "165945e4:docs/ai/where-is-my-mor.mdx:118",
   "| \"I closed (or let it expire) and only part came back.\" | Expected — the final UTC day's slice is in the on-hold queue (Bucket 2). A running proxy-router automatically sweeps matured stake every 10 minutes for the wallet it holds, so no manual claim is needed — with the node off, or for another wallet's stake, submit `withdrawUserStakes` yourself. |"],
  // same shape, second row
  ['violation', true, "165945e4:docs/ai/where-is-my-mor.mdx:119",
   "| \"I closed and **nothing** came back.\" | Expected when the session was fully consumed inside one UTC day — e.g. it ran to `endsAt` — because then the consumed slice is essentially the whole stake. **Not** expected from an early close, which returns the unconsumed part in the close txn. A running proxy-router automatically sweeps the held part after `releaseAt` for the wallet it holds, so no manual claim is needed — with the node off, or for another wallet's stake, submit `withdrawUserStakes` yourself. |"],
  // mermaid node label
  ['violation', true, "165945e4:docs/ai/why-locked-in-contract.mdx:61",
   "  Q2 -->|Yes| A2[Consumed slice likely in userStakesOnHold — a running node auto-sweeps after releaseAt for its own wallet only, otherwise call withdrawUserStakes yourself]"],
  // inside an APPROVED-ANSWER template
  ['violation', true, "165945e4:docs/ai/llm-prompt-cheatsheet.mdx:68",
   "  - ✅ \"Opening a session escrows MOR; the final UTC day's **consumed** slice day-locks until the next UTC day, and the **unconsumed** remainder returns in the close transaction. Closing at 10% of the scheduled duration returns roughly 90% of the stake; the return is near zero only when the session was fully consumed, e.g. left to run to `endsAt` inside one UTC day. A running proxy-router's StakeClaimer sweeps the held slice automatically after `releaseAt`, for the wallet that node holds — with the node off, or for a session opened from another wallet, you call `withdrawUserStakes` yourself.\""],
  // corrective half of a myth bullet
  ['violation', true, "165945e4:docs/ai/session-states-open-close-recover.mdx:61",
   "- ❌ \"I closed, I should see all my MOR back instantly.\" → **Only the remainder returns at close** — `remaining stake − the final UTC day's day-locked slice` — which is the part you did not consume: roughly **90%** of the stake for a close at 10% of the scheduled duration, and **zero** only for a fully consumed session such as one run to `endsAt` inside one UTC day. The split is **not** \"unused vs used\" because the lock is windowed to the **final UTC day**: `userDuration_` starts at `max(openedAt, startOfTheDay(sessionEnd))` (`SessionRouter.sol:306`), so on a multi-day session the earlier days' *consumed* stake comes back at close too. The rest arrives after `releaseAt`, swept automatically by a running proxy-router holding that wallet — with the node off, or for a session opened from another wallet, you submit `withdrawUserStakes` yourself."],
  // <Step> body
  ['violation', false, "165945e4:docs/concepts/sessions-stake-close-recover.mdx:103",
   "  <Step title=\"Done\">     Spendable MOR is back in your wallet — everything except the final UTC day's locked slice lands at close, and that slice once the day-lock expires and the proxy-router's StakeClaimer sweeps it back, which needs no manual claim while your own node is running and holds the wallet you opened from. With the node off, or for a session opened from another wallet, nothing sweeps and you submit `withdrawUserStakes` yourself. It is not an \"unused now, used later\" split: on a multi-day session the earlier days' consumed stake is in the amount returned at close."],
  // 'optional while running - and required with the node off'
  ['violation', false, "165945e4:docs/consumers/buy-bid.mdx:62",
   "- **On close (early or natural):** the contract locks `min(remaining stake, stake-equivalent of the final UTC day's consumed seconds)` with `releaseAt = startOfTheDay(min(closedAt, endsAt)) + 1 day`, and returns the remainder in the same txn — **the unconsumed portion**, which is close to the whole stake for an early close and approximately zero only for a session run to `endsAt` inside one UTC day. After `releaseAt` a running proxy-router sweeps matured stake automatically every 10 minutes (`blockchainapi/stake_claimer.go`), and only for the wallet it holds; `GET /blockchain/stakes/on-hold` reports the balance. Calling `withdrawUserStakes(yourAddress, iterations)` on the Diamond yourself is optional while that node is running — and required with the node off, or for a session opened from another wallet."],
  // 1703-char rule; 'the user calls withdrawUserStakes themselves'
  ['violation', true, "165945e4:.cursor/rules/morpheus.mdc:25",
   "5. **Opening a session escrows MOR; it does not spend MOR.** But do not say it all returns on close: the stake-equivalent of the final UTC day's consumption is day-locked in `userStakesOnHold` until `releaseAt = startOfTheDay(min(closedAt, endsAt)) + 1 day`. The lock is sized from the seconds actually consumed ([`SessionRouter.sol:306-308`](../../smart-contracts/contracts/diamond/facets/SessionRouter.sol)), so it equals the whole remaining stake only as consumption approaches the full scheduled duration, not because the session was same-day. A session left to run to `endsAt` inside one UTC day is fully consumed and commonly returns **nothing** at close — while an early close returns the part you did not consume, roughly 90% of the stake at 10% of the scheduled duration; the locked slice is swept to the wallet after `releaseAt` by the consumer's own running proxy-router, and only for the wallet that node holds — with the node off, or for a session opened from another wallet, nothing sweeps and the user calls `withdrawUserStakes` themselves. The lock is **conditional, not automatic**: the contract enters that branch only while `block.timestamp < releaseAt_` ([`SessionRouter.sol:305`](../../smart-contracts/contracts/diamond/facets/SessionRouter.sol)), so a genuinely late close — a session that ended at noon on day 1 and is closed on day 4 — skips it, leaves `userStakeToLock_` at zero and transfers the entire remaining stake at once ([`SessionRouter.sol:314-315`](../../smart-contracts/contracts/diamond/facets/SessionRouter.sol)). Do not state the day-lock unconditionally. Cite [`docs/ai/session-states-open-close-recover.mdx`](../../docs/ai/session-states-open-close-recover.mdx)."],
  // CORRECT: 'no user action is required WHILE ...' - negated, fully qualified
  ['clean', true, "docs/ai/where-is-my-mor.mdx:50",
   "After `releaseAt` your own proxy-router sweeps matured stake automatically every 10 minutes (`stake_claimer.go`); `GET /blockchain/stakes/on-hold` reports the balance. That sweep runs only inside a running node and only over the wallet that node holds \u2014 the StakeClaimer is started by `Proxy.run` (`proxy-router/internal/proxyctl/proxyctl.go:237-240`) and withdraws for `GetMyAddress` alone (`proxy-router/internal/blockchainapi/service.go:1118-1124`). So no user action is required **while your node is running and the session was opened from its wallet**; with the node stopped, or for sessions opened from a different wallet, nothing sweeps until a proxy-router holding that wallet runs \u2014 starting one claims matured stake immediately on startup (`stake_claimer.go:87-89`), and the call below is the alternative:"],
  // CORRECT: 'a manual withdrawUserStakes is optional only while ...'
  ['clean', true, "docs/ai/myths.mdx:63",
   "  <Accordion title=\"MYTH: An early close returns all my unused MOR immediately.\">     **Mostly true — but the split is not \"unused vs used.\"** What returns immediately is `remaining stake − the final UTC day's consumed slice`, which on a single-day session is essentially your unused stake: closing at 10% of the scheduled duration returns roughly **90%** of it in the close transaction. What is *held* is the **consumed** part, not the unused part — it goes to `userStakesOnHold[you]` with `releaseAt = startOfTheDay(min(closedAt, endsAt)) + 1 day`, and the proxy-router's StakeClaimer sweeps it automatically after that; a manual `withdrawUserStakes` is optional only while your own node is running and holds the wallet the session was opened from — with the node off, or for another wallet's stake, nothing sweeps until a proxy-router holding that wallet runs — starting one claims it immediately on startup, and the manual call is the alternative. Two places the wording matters: on a **multi-day** session you get back *more* than \"unused\", because only the final day's consumption is locked; and a close that lands after `releaseAt` locks nothing at all. The held amount is not lost — it's parked until the timelock expires. See [Sessions: stake, close, claim](/concepts/sessions-stake-close-recover)."],
  // CORRECT: parameter prose - 'the caller must BE the delegatee', bare 'optional' cap
  ['clean', false, "docs/reference/api-endpoints.mdx:214",
   "Function selector: `0xa98a7c6b`. The caller must be the delegatee allowed for that consumer (usually the same key your consumer node uses). `iterations_` (e.g. `20`) caps how many releasable on-hold rows to process per call. Read on-hold balance via `getUserStakesOnHold(addr, iterations_)` — see [Where is my MOR? → Bucket 2](/ai/where-is-my-mor#bucket-2-on-hold-queue-used-stipend-day-lock)."],
  // CORRECT: heading '(no node HTTP route)' - about the route, not about running
  ['clean', false, "docs/reference/api-endpoints.mdx:203",
   "## Claim day-locked on-hold balance (no node HTTP route)"],
  // CORRECT: both conditions AND both routes named
  ['clean', false, "docs/reference/api-endpoints.mdx:205",
   "A running proxy-router claims matured on-hold stakes automatically via its internal StakeClaimer (see `proxy-router/internal/blockchainapi/stake_claimer.go`). That is bounded twice: the claimer is started only inside `Proxy.run` (`internal/proxyctl/proxyctl.go:237-240`), and it withdraws only for the node's own `GetMyAddress` (`internal/blockchainapi/service.go:1118-1124`). With the node stopped, or for stakes belonging to a different wallet, nothing is claimed. There is no dedicated HTTP endpoint, so manual claiming via `cast send` or a wallet UI is the alternative for direct contract interaction. In those two cases nothing sweeps until a proxy-router holding that wallet runs \u2014 starting one claims matured stake immediately on startup (`stake_claimer.go:87-89` calls `claimOnce` before entering the ticker loop) \u2014 so starting that node and the manual call are the two routes."],
  // DELETED by 60b7535d: '...the alternative - and the only route when the node is off'
  ['violation', false, "60b7535d^:docs/reference/api-endpoints.mdx:205",
   "A running proxy-router claims matured on-hold stakes automatically via its internal StakeClaimer (see `proxy-router/internal/blockchainapi/stake_claimer.go`). That is bounded twice: the claimer is started only inside `Proxy.Run` (`internal/proxyctl/proxyctl.go:237-240`), and it withdraws only for the node's own `GetMyAddress` (`internal/blockchainapi/service.go:1118-1124`). With the node stopped, or for stakes belonging to a different wallet, nothing is claimed. There is no dedicated HTTP endpoint, so manual claiming via `cast send` or a wallet UI is the alternative for direct contract interaction — and the only route in those two cases."],
  // DELETED by 60b7535d: 'calling it yourself is the only way'
  ['violation', false, "60b7535d^:docs/reference/glossary.mdx:26",
   "| **`userStakesOnHold`** | Per-user array on the Inference Contract that holds the **final UTC day's consumed slice** after close — but only when `closeSession` lands **before** `releaseAt` (`SessionRouter.sol:305`); a genuinely late close skips the lock entirely and the whole remaining stake returns at close. Each entry has an amount and `releaseAt = startOfTheDay(min(closedAt, endsAt)) + 1 day`. Cleared by the proxy-router's StakeClaimer, which submits `withdrawUserStakes` automatically once an entry matures — but only while your own node is running and only for the wallet it holds; with the node off, or for a session opened from another wallet, calling it yourself is the only way. |"],
  // DELETED by 60b7535d: 'the manual call is the only route'
  // Class L, proven by firing on the defect this branch shipped for seven
  // passes: the day-lock anchored to the CLOSE instead of to the session end.
  // Pinned to d70b648b, the published tip at which it was still live.
  ['violation', false, "d70b648b:docs/concepts/tokens-and-fees.mdx:26",
   "  <Accordion title=\"Consumer session stake\"> In **pool mode**, the session duration is derived from the staked amount: the system converts the stake to a stipend using the inverse of `stipendToStake`, then divides by `pricePerSecond`. The required stake for a desired duration D is approximately `D * pricePerSecond * totalMORSupply * 100 / computeBalance` (`SessionRouter.sol:408-414`). This stake is typically much larger than the direct-payment cost (`price \u00d7 duration`) because of the pool parameters. There is **no MOR minimum**; the only floor is a 5-minute duration. Paid in MOR, escrowed in the Inference Contract on `openSession`. On close, the lock is only applied when the close time is before the start of the next UTC day (`releaseAt`). If the close happens after `releaseAt`, the entire remaining stake is returned immediately and no day-lock is created. The locked amount (if any) is automatically swept by the proxy-router's StakeClaimer after the next UTC day \u2014 but only while your own node is running and only for the wallet it holds; with the node off, or for a session opened from another wallet, nothing sweeps until a proxy-router holding that wallet runs: starting one claims matured stake immediately on startup, and a manual `withdrawUserStakes` is the alternative. The provider is paid from a separate protocol `fundingAccount` for pool-mode sessions, or from your escrowed stake for direct-pay sessions, not from your stake in real time. See [Sessions: stake, close, claim](/concepts/sessions-stake-close-recover)."],
  ['violation', false, "60b7535d^:docs/reference/glossary.mdx:27",
   "| **`withdrawUserStakes`** | On-chain function (`withdrawUserStakes(address, uint8)`, selector `0xa98a7c6b`) on the Diamond contract that moves past-`releaseAt` rows from `userStakesOnHold` to the user's wallet. A running proxy-router auto-sweeps matured stakes every 10 minutes via `stake_claimer.go`, and only for the wallet it holds; with the node off, or for stakes held against a different wallet, the manual call is the only route. The balance is still reported at `GET /blockchain/stakes/on-hold`. |"],
];

// Leg 2 — PIPELINE. A corpus this test writes itself, scanned by the real
// scan(): walk -> extension filter -> IN_SCOPE -> DICTATES_ASSERTIONS -> units
// -> subUnits -> classify. Every mutation that disables the scanner (drop 'docs'
// from SCAN_ROOTS, make IN_SCOPE return false, drop .mdx from walk, break units)
// makes an expected violation disappear from this fixture tree, and the leg
// fails. That is the property the old self-test did not have.
const FIXTURE_TREE = {
  // agent-facing: a bare assertion is a violation here, and the table row below
  // is a sole-remedy violation in either kind of file
  'docs/ai/fx-agent.mdx':
    '---\n'
    + 'title: Fixture\n'
    + 'description: "Any locked amount is swept back to your wallet by the StakeClaimer after the next UTC day."\n'
    + '---\n\n'
    + '| Symptom | Answer |\n'
    + '| --- | --- |\n'
    + '| "Only part came back." | The held stake is on hold; with the node off, or for another wallet\'s stake, submit `withdrawUserStakes` yourself. |\n',

  // Mintlify\'s most common callout shape: one line, tags and prose together.
  // The old units() flushed this line and dropped it entirely.
  'docs/concepts/fx-note.mdx':
    '# Fixture\n\n'
    + '<Note>The day-locked stake is swept back to your wallet automatically, so no manual `withdrawUserStakes` is needed.</Note>\n',

  // fully qualified, both conditions AND both routes -> no finding at all
  'docs/concepts/fx-clean.mdx':
    '# Fixture\n\n'
    + 'The StakeClaimer sweeps matured stake automatically - but only while your own node is running and only for the wallet it holds. '
    + 'With the node off, or for a session opened from another wallet, nothing sweeps until a proxy-router holding that wallet runs: '
    + 'starting one claims matured stake immediately on startup, and a manual `withdrawUserStakes` is the alternative.\n',

  // a mermaid edge label is prose a reader consumes
  'docs/concepts/fx-mermaid.mdx':
    '# Fixture\n\n'
    + '```mermaid\n'
    + 'flowchart TD\n'
    + '  A -->|Yes| B[Consumed slice in userStakesOnHold - a running node auto-sweeps for its own wallet only, otherwise call withdrawUserStakes yourself]\n'
    + '```\n',

  // parameter prose: "must BE the delegatee", bare "optional". Must NOT fire.
  'docs/reference/fx-params.mdx':
    '# Fixture\n\n'
    + '`withdrawUserStakes(address, uint8)` moves past-`releaseAt` rows from `userStakesOnHold` to the wallet. '
    + 'The caller must be the delegatee for that consumer. `iterations_` is optional and caps how many rows to process per call.\n',

  '.cursor/rules/fx.mdc':
    '# Fixture rule\n\n'
    + '- With the node off, or for a session opened from another wallet, nothing sweeps and the user calls `withdrawUserStakes` themselves.\n',

  // the long-unit / bold-lead shape: the whole unit carries both conditions, so
  // the unit is discharged, but the bolded summary line an agent would quote is
  // an unconditional sweep claim on its own.
  'CLAUDE.md':
    '# Fixture\n\n'
    + '2. **Stake on hold is claimed automatically by the proxy-router\'s StakeClaimer and returned to the wallet.** '
    + 'The proxy-router runs a StakeClaimer that claims matured on-hold stake every 10 minutes - but only while that node is running, '
    + 'and only for the wallet it holds (`proxyctl.go:237-240` starts the claimer inside `Proxy.Run`; `service.go:1118-1124` withdraws for `GetMyAddress` alone). '
    + 'Closing a session day-locks the final UTC day\'s consumed slice until the next UTC day, and that stake is recoverable. '
    + 'With the node off, or for a session opened from another wallet, nothing sweeps until a proxy-router holding that wallet runs: '
    + 'starting one claims matured stake immediately on startup, and the manual call is the alternative.\n',

  // The other three SINGLE-FILE scan roots. CLAUDE.md above was the only one
  // with a fixture, so leg 2 could not see README.md, AGENTS.md or
  // CONTRIBUTING.md being dropped from SCAN_ROOTS: leg 3 pinned the directory
  // roots by name and the four file roots not at all. Dropping README.md hid a
  // real README.md violation with the self-test still green (measured against
  // ea7028d7, where README.md:46-50 is one of the two base violations: the
  // scan drops from 2 violations to 1 and --selftest still says 44/44).
  // A root that no fixture exercises is a root the self-test cannot defend.
  'README.md':
    '# Fixture readme\n\n'
    + 'The StakeClaimer sweeps the day-locked stake back to your wallet automatically, so no manual `withdrawUserStakes` call is needed.\n',

  // an agent-instruction file: a bare assertion is a violation here on its own
  'AGENTS.md':
    '# Fixture agents\n\n'
    + 'Stake on hold is returned to the wallet by the StakeClaimer automatically.\n',

  'CONTRIBUTING.md':
    '# Fixture contributing\n\n'
    + 'With the node off, or for a session opened from another wallet, you must call `withdrawUserStakes` yourself - that is the only route.\n',

  // Go, both halves in ONE file: the PRINTED string is in scope, the comment
  // above it is not. A mutation that collapses the two kinds breaks one of the
  // two assertions whichever way it collapses them.
  'proxy-router/internal/blockchainapi/fx_claimer.go':
    'package blockchainapi\n\n'
    + '// The StakeClaimer sweeps matured stake back to the wallet automatically, so\n'
    + '// no manual withdrawUserStakes call is needed.\n'
    + 'func (s *StakeClaimer) fx(ctx context.Context) {\n'
    + '\ts.log.Infof("%s wei of matured stake is swept back to your wallet automatically, no manual claim needed", hold)\n'
    + '}\n',

  // Class L in a Go COMMENT, which the sweep classes deliberately treat as INFO.
  // This asserts the narrow override: a false statement about what the contract
  // DOES is a violation even in a comment. Without it, the four base-wording
  // comments this branch shipped would still be invisible to leg 2.
  'proxy-router/internal/repositories/registries/fx_registry.go':
    'package registries\n\n'
    + '// FxGetUserStakesOnHold reports stake locked from closing sessions EARLY;\n'
    + '// the entry is OnHold(amount, startOfDay(closedAt)+1day) on userStakesOnHold.\n'
    + '// Closing late locks nothing.\n'
    + 'func fx() {}\n',

  // the second Go root, and a log line whose defect is the sole-remedy face
  'proxy-router/internal/proxyctl/fx_proxyctl.go':
    'package proxyctl\n\n'
    + 'func fx() {\n'
    + '\tlog.Warnf("stake is on-hold and this node holds a different wallet; you have to claim it by hand")\n'
    + '}\n',

  // hand-written prose an integrator reads and cites, in a tree that used to be
  // scanned-but-never-in-scope
  'smart-contracts/docs/fx-rfp.md':
    '# Fixture RFP\n\n'
    + '5. **On-hold funds need a second transaction, but not a manual one.** The router auto-sweeps matured rows every 10 minutes, so anyone running a router never calls it by hand.\n',

  // frontmatter in a NON-agent directory: still assertion-dictating, because a
  // description is what a meta tag and a search snippet carry without the body
  'docs/concepts/fx-frontmatter.mdx':
    '---\n'
    + 'title: Fixture\n'
    + 'description: "The day-locked slice is swept back to your wallet by the StakeClaimer after releaseAt."\n'
    + '---\n\n'
    + '# Body\n\n'
    + 'Only while your own node is running and only for the wallet it holds; otherwise nothing sweeps until a proxy-router holding that wallet runs - starting one claims it immediately on startup - and the manual call is the alternative.\n',

  // a mermaid node in a NON-agent directory: same tier, same reason
  'docs/concepts/fx-mermaid-node.mdx':
    '# Fixture\n\n'
    + '```mermaid\n'
    + 'flowchart TB\n'
    + '  Hold --> Claim["6. StakeClaimer auto-sweep after releaseAt"]\n'
    + '```\n',

  // --- ui-desktop. The three JSX text kinds in one place. ---
  // A rendered STRING LITERAL inside a children expression container, which is
  // what a ternary paints, plus a JSX comment carrying the SAME defect one line
  // above it. A mutation that collapses the two kinds breaks one of the two
  // assertions whichever way it collapses them -- the Go fixture's property,
  // transplanted, because the failure it guards against is the same one.
  'ui-desktop/src/renderer/fx-tile.jsx':
    'export function FxTile({ onHoldMor }) {\n'
    + '  return (\n'
    + '    <StatCard data-testid="stakes-on-hold-tile">\n'
    + '      <StatLabel>On Hold</StatLabel>\n'
    + '      {/* The stake is swept back to the wallet automatically, so no manual claim is needed. */}\n'
    + "      <StatSub>{onHoldMor ? 'Returns automatically' : 'Returning to your wallet now'}</StatSub>\n"
    + '    </StatCard>\n'
    + '  );\n'
    + '}\n',

  // BARE JSX CHILDREN TEXT spanning two lines -- not a string literal at all,
  // which is the form three of the four live findings actually take. Pins the
  // fragment offset map too: the cue is on line 5, the unit starts on line 4,
  // and legPipeline asserts the report says 5.
  'ui-desktop/src/renderer/fx-multiline.tsx':
    'export function FxMulti() {\n'
    + '  return (\n'
    + '    <StakeNote>\n'
    + '      Your stake is collateral, not a fee. It is locked until the end of the\n'
    + '      day the session closes, then returns automatically.\n'
    + '    </StakeNote>\n'
    + '  );\n'
    + '}\n',

  // Qualified with the NODE condition -> no finding. The wallet leg is not
  // required here and this fixture is what says so: if COND_WALLET were ever
  // demanded of a UI string again, this clean case becomes a violation.
  'ui-desktop/src/renderer/fx-clean.tsx':
    'export function FxClean() {\n'
    + '  return (\n'
    + '    <StakeNote>\n'
    + '      Your stake is locked until the end of the day, then returns automatically\n'
    + '      - but only while this app is running a proxy-router.\n'
    + '    </StakeNote>\n'
    + '  );\n'
    + '}\n',

  // ui-desktop/tools/** is a developer harness: scanned, listed, out of scope.
  // Same defect as fx-tile, and it must land in INFO and never in violations.
  'ui-desktop/tools/fx-tool.tsx':
    'export function FxTool() {\n'
    + '  return <StakeNote>Your stake returns automatically after the day-lock.</StakeNote>;\n'
    + '}\n',

  // out of scope: same defect, must land in info and NEVER in violations
  'verify/fx-audit.md':
    '# Fixture audit\n\n'
    + 'The locked stake is swept back automatically by the StakeClaimer, so no manual `withdrawUserStakes` is needed.\n',
};

// file:line of every violation the fixture tree must produce.
const FIXTURE_EXPECTED = [
  'CLAUDE.md:3/bold-lead',
  'README.md:3',
  'AGENTS.md:3',
  'CONTRIBUTING.md:3',
  '.cursor/rules/fx.mdc:3',
  'docs/ai/fx-agent.mdx:3',
  'docs/ai/fx-agent.mdx:8',
  'docs/concepts/fx-frontmatter.mdx:3',
  'docs/concepts/fx-mermaid-node.mdx:5',
  'docs/concepts/fx-mermaid.mdx:5',
  'docs/concepts/fx-note.mdx:3',
  'proxy-router/internal/repositories/registries/fx_registry.go:3',
  'proxy-router/internal/blockchainapi/fx_claimer.go:6',
  'proxy-router/internal/proxyctl/fx_proxyctl.go:4',
  'smart-contracts/docs/fx-rfp.md:3',
  'smart-contracts/docs/fx-rfp.md:3/bold-lead',
  'ui-desktop/src/renderer/fx-tile.jsx:6',
  'ui-desktop/src/renderer/fx-multiline.tsx:4',
];

function writeTree(dir, tree) {
  for (const [rel, body] of Object.entries(tree)) {
    const abs = join(dir, rel);
    mkdirSync(abs.slice(0, abs.lastIndexOf(sep)), { recursive: true });
    writeFileSync(abs, body);
  }
}

function legPipeline(fail) {
  const dir = mkdtempSync(join(tmpdir(), 'sweep-selftest-'));
  try {
    writeTree(dir, FIXTURE_TREE);
    const r = scan(dir);

    // the walk has to have reached the fixture tree at all
    if (r.scanned === 0) fail('pipeline: scan() read 0 files - the walk or SCAN_ROOTS is broken');
    if (r.scannedInScope === 0) fail('pipeline: 0 files judged in scope - IN_SCOPE is broken');
    const rels = r.files.map((f) => relative(dir, f));
    for (const need of ['docs/ai/fx-agent.mdx'.split('/').join(sep), '.cursor/rules/fx.mdc'.split('/').join(sep)]) {
      if (!rels.includes(need)) fail(`pipeline: walk never reached ${need} - SCAN_ROOTS or the extension filter dropped it`);
    }
    // Every SINGLE-FILE root, named one at a time so the failure says which one
    // went. A directory root announces itself when a whole tree stops being
    // scanned; a file root can be deleted from SCAN_ROOTS and take exactly one
    // file's violations with it, which is why this was invisible for six passes.
    for (const need of SINGLE_FILE_ROOTS) {
      if (!rels.includes(need)) fail(`pipeline: walk never reached the single-file root ${need} - it was dropped from SCAN_ROOTS`);
    }

    const got = r.violations.map((v) => `${v.file.split(sep).join('/')}:${v.line}${v.kind.includes('/') ? '/' + v.kind.split('/')[1] : ''}`).sort();
    const want = [...FIXTURE_EXPECTED].sort();
    for (const w of want) if (!got.includes(w)) fail(`pipeline: expected violation not found: ${w}`);
    for (const g of got) if (!want.includes(g)) fail(`pipeline: unexpected violation (false positive): ${g}`);

    // scope really is a filter, not decoration
    if (r.violations.some((v) => v.file.startsWith('verify'))) fail('pipeline: an out-of-scope file produced a VIOLATION');
    if (!r.info.some((v) => v.file.startsWith('verify'))) fail('pipeline: the out-of-scope file produced no INFO record either - it was not scanned');

    // the Go split, both directions. Asserted separately from the expected-set
    // comparison so the failure message says WHICH way it collapsed.
    const goRel = 'proxy-router/internal/blockchainapi/fx_claimer.go'.split('/').join(sep);
    if (!r.violations.some((v) => v.file === goRel && v.kind === 'go-log-string')) {
      fail('pipeline: the printed Go string produced no violation - Go units, the Go roots or the Go scope leg is broken');
    }
    // Still asserted, but scoped to the SWEEP classes. Class L is deliberately a
    // violation in a comment (see the scope note in scan()), so the original
    // blanket form would now fail for the reason the change was made.
    if (r.violations.some((v) => v.kind === 'go-comment' && v.missing !== 'ANCHOR')) {
      fail('pipeline: a Go COMMENT was raised to a SWEEP violation - the two Go readers were collapsed');
    }
    // ...and the Class L override must actually be reaching a comment, or the
    // narrowing above has quietly become permission to report nothing.
    const lockRel = 'proxy-router/internal/repositories/registries/fx_registry.go'.split('/').join(sep);
    if (!r.violations.some((v) => v.file === lockRel && v.kind === 'go-comment' && v.missing === 'ANCHOR')) {
      fail('pipeline: the Class L comment produced no violation - the lock class or its scope override is off');
    }
    if (!r.info.some((v) => v.file === goRel && v.kind === 'go-comment')) fail('pipeline: the Go comment produced no INFO record - goUnits never cut a comment unit');

    // frontmatter and mermaid carry the agent tier OUTSIDE docs/ai
    const fmRel = 'docs/concepts/fx-frontmatter.mdx'.split('/').join(sep);
    if (!r.violations.some((v) => v.file === fmRel && v.kind === 'frontmatter')) {
      fail('pipeline: a frontmatter description outside docs/ai produced no violation - the frontmatter tier is gone');
    }
    const mmRel = 'docs/concepts/fx-mermaid-node.mdx'.split('/').join(sep);
    if (!r.violations.some((v) => v.file === mmRel && v.kind === 'mermaid-line')) {
      fail('pipeline: a mermaid node label outside docs/ai produced no violation - the mermaid tier is gone');
    }
    const scRel = 'smart-contracts/docs/fx-rfp.md'.split('/').join(sep);
    if (!r.violations.some((v) => v.file === scRel)) fail('pipeline: smart-contracts/docs produced no violation - it is scanned but out of scope again');

    // --- ui-desktop, the three text kinds and the scope line between them ---
    const uiTile = 'ui-desktop/src/renderer/fx-tile.jsx'.split('/').join(sep);
    if (!r.violations.some((v) => v.file === uiTile && v.kind === 'ui-rendered')) {
      fail('pipeline: a rendered JSX string produced no violation - the UI extension filter, UI_SOURCE_ROOTS, jsxUnits or the ui-rendered scope leg is broken');
    }
    if (r.violations.some((v) => v.kind === 'ui-comment')) {
      fail('pipeline: a JSX COMMENT was raised to a violation - the two UI readers were collapsed');
    }
    if (!r.info.some((v) => v.file === uiTile && v.kind === 'ui-comment')) {
      fail('pipeline: the JSX comment produced no INFO record - jsxUnits never cut a comment unit');
    }
    const uiMulti = 'ui-desktop/src/renderer/fx-multiline.tsx'.split('/').join(sep);
    const multi = r.violations.find((v) => v.file === uiMulti);
    if (!multi) fail('pipeline: bare JSX children text produced no violation - only string literals are being read');
    else if (!multi.cueLines || !multi.cueLines.includes(5) || multi.cueLines.includes(4)) {
      fail(`pipeline: the cue line is wrong (got ${multi.cueLines}, want [5]) - the fragment offset map is broken, so every multi-line finding reports the wrong line`);
    }
    const uiClean = 'ui-desktop/src/renderer/fx-clean.tsx'.split('/').join(sep);
    if (r.violations.some((v) => v.file === uiClean)) {
      fail('pipeline: the NODE-qualified UI string was reported - either the on-screen window stopped reaching the qualifier, or COND_WALLET is being demanded of a surface that cannot fail it');
    }
    const uiTool = 'ui-desktop/tools/fx-tool.tsx'.split('/').join(sep);
    if (r.violations.some((v) => v.file === uiTool)) fail('pipeline: ui-desktop/tools produced a VIOLATION - UI_SOURCE_ROOTS lost its bound');
    if (!r.info.some((v) => v.file === uiTool)) fail('pipeline: ui-desktop/tools produced no INFO record either - it was not scanned at all');
    return got.length;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// Leg 3 — WIRING. Cheap structural assertions about the real configuration.
// These bite the same mutations a second way and stay true after the docs are
// fixed, so they never become a reason to weaken the gate.
function legWiring(fail) {
  if (!SCAN_ROOTS.includes('docs')) fail('wiring: SCAN_ROOTS no longer contains "docs"');
  if (!SCAN_ROOTS.includes('.cursor')) fail('wiring: SCAN_ROOTS no longer contains ".cursor"');
  const mdx = join('docs', 'ai', 'where-is-my-mor.mdx');
  if (!IN_SCOPE(mdx)) fail(`wiring: IN_SCOPE says ${mdx} is out of scope`);
  if (!IN_SCOPE(join('docs', 'concepts', 'sessions-stake-close-recover.mdx'))) fail('wiring: a docs/**.mdx page is out of scope');
  if (IN_SCOPE(join('verify', 'x.md'))) fail('wiring: verify/ is now IN scope - the scope filter inverted');
  if (!DICTATES_ASSERTIONS('CLAUDE.md')) fail('wiring: CLAUDE.md no longer counts as an agent-instruction file');
  if (!DICTATES_ASSERTIONS(mdx)) fail('wiring: docs/ai/** no longer counts as agent-facing');
  if (DICTATES_ASSERTIONS(join('docs', 'consumers', 'buy-bid.mdx'))) fail('wiring: a human page is being treated as agent-facing');
  // the extension filter must still admit .mdx and .mdc
  const probe = mkdtempSync(join(tmpdir(), 'sweep-ext-'));
  try {
    mkdirSync(join(probe, 'docs'), { recursive: true });
    for (const n of ['a.mdx', 'b.md', 'c.mdc']) writeFileSync(join(probe, 'docs', n), 'x\n');
    writeFileSync(join(probe, 'docs', 'd.png'), 'x\n');
    const found = walk(join(probe, 'docs'), []).map((p) => p.slice(p.lastIndexOf(sep) + 1)).sort();
    for (const n of ['a.mdx', 'b.md', 'c.mdc']) if (!found.includes(n)) fail(`wiring: walk() no longer picks up ${n}`);
    if (found.includes('d.png')) fail('wiring: walk() is picking up binaries');
  } finally { rmSync(probe, { recursive: true, force: true }); }

  // units() must still cut the shapes the whole design rests on
  const u = units('---\ntitle: T\ndescription: "d"\n---\n\n| a | b |\n| --- | --- |\n| c | d |\n\n<Note>one line</Note>\n');
  const kinds = u.map((x) => x.kind);
  for (const k of ['frontmatter', 'table-row', 'component']) {
    if (!kinds.includes(k)) fail(`wiring: units() no longer produces a "${k}" unit (got ${kinds.join(',')})`);
  }

  // --- Class L wiring ---
  if (!SCAN_ROOTS.includes('proxy-router/internal/repositories/registries')) {
    fail('wiring: the registries package left SCAN_ROOTS - session_router.go goes unread again');
  }
  if (!IS_SCANNED_GO(join('proxy-router', 'internal', 'repositories', 'registries', 'session_router.go'))) {
    fail('wiring: the registries package left GO_SOURCE_ROOTS - its comments cannot be cut into units');
  }
  if (!classifyLock('Closing a session early locks it until `startOfTheDay(closedAt) + 1 day` in `userStakesOnHold`.')) {
    fail('wiring: classifyLock no longer fires on the wrong anchor - Class L is disabled');
  }
  if (classifyLock('The slice sits in `userStakesOnHold` until `releaseAt = startOfTheDay(min(closedAt, endsAt)) + 1 day`.')) {
    fail('wiring: classifyLock fires on the CORRECT formula - the discharge is broken');
  }

  // --- the four SINGLE-FILE roots, asserted by name ---
  // Leg 3 previously pinned only the directory roots, so `SCAN_ROOTS` could
  // lose README.md, AGENTS.md or CONTRIBUTING.md and every leg stayed green.
  // Spelled out as a literal, NOT read from SINGLE_FILE_ROOTS: an assertion
  // that reads the constant it is checking cannot notice that constant
  // shrinking. This is the same reason leg 3 names 'docs' and '.cursor'
  // literally instead of iterating SCAN_ROOTS.
  for (const r of ['README.md', 'AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md']) {
    if (!SINGLE_FILE_ROOTS.includes(r)) fail(`wiring: SINGLE_FILE_ROOTS no longer lists "${r}"`);
    if (!SCAN_ROOTS.includes(r)) fail(`wiring: SCAN_ROOTS no longer contains the single-file root "${r}"`);
    if (!IN_SCOPE(r)) fail(`wiring: ${r} is scanned but out of scope - it can no longer fail anything`);
  }

  // --- the three widened categories, asserted structurally ---
  for (const r of ['smart-contracts/docs', 'proxy-router/internal/blockchainapi', 'proxy-router/internal/proxyctl']) {
    if (!SCAN_ROOTS.includes(r)) fail(`wiring: SCAN_ROOTS no longer contains "${r}"`);
  }
  const rfp = join('smart-contracts', 'docs', 'inference-contract-enhancements-rfp.md');
  if (!IN_SCOPE(rfp)) fail('wiring: smart-contracts/docs is scanned but out of scope again - it can no longer fail anything');
  if (IN_SCOPE(join('proxy-router', 'docs', 'swagger.json'))) fail('wiring: generated swagger became IN scope - a fix there would be overwritten by `swag init`');

  const goFile = join('proxy-router', 'internal', 'blockchainapi', 'stake_claimer.go');
  if (!IN_SCOPE(goFile, 'go-log-string')) fail('wiring: a printed Go string is out of scope - the Go leg is disabled');
  if (IN_SCOPE(goFile, 'go-comment')) fail('wiring: a Go COMMENT is in scope - the two Go readers were collapsed');
  if (IN_SCOPE(join('proxy-router', 'internal', 'lib', 'x.go'), 'go-log-string')) fail('wiring: an unscanned Go package is in scope - GO_SOURCE_ROOTS lost its bound');

  const human = join('docs', 'concepts', 'sessions-stake-close-recover.mdx');
  if (!DICTATES_ASSERTIONS(human, 'frontmatter')) fail('wiring: frontmatter outside docs/ai lost the assertion-dictating tier');
  if (!DICTATES_ASSERTIONS(human, 'frontmatter/bold-lead')) fail('wiring: a frontmatter SUB-unit lost the tier - baseKind() is broken');
  if (!DICTATES_ASSERTIONS(human, 'mermaid-line')) fail('wiring: a mermaid node label outside docs/ai lost the assertion-dictating tier');
  if (DICTATES_ASSERTIONS(human, 'para')) fail('wiring: an ordinary paragraph on a human page is being treated as agent-facing');
  if (DICTATES_ASSERTIONS(human, 'table-row')) fail('wiring: the tier spread to table rows - a tier that matches every row cannot discriminate');

  // goUnits must cut BOTH kinds out of one file, or the split above is theatre
  const gu = goUnits('package p\n\n// swept back automatically, no manual claim needed\nfunc f() {\n\tlog.Infof("swept back automatically, no manual claim needed")\n}\n');
  const gk = gu.map((x) => x.kind);
  for (const k of ['go-comment', 'go-log-string']) {
    if (!gk.includes(k)) fail(`wiring: goUnits() no longer produces a "${k}" unit (got ${gk.join(',') || 'nothing'})`);
  }
  // a `(` and a `//` inside a printed string must not derail the statement scan
  const gm = goUnits('package p\nfunc f() {\n\tlog.Warnf("see http://x/y (bracketed) and more")\n}\n');
  if (!gm.some((x) => x.kind === 'go-log-string' && x.lines[0].includes('bracketed'))) {
    fail('wiring: goMask lost a string containing "//" or "(" - the mask is not masking');
  }
  if (gm.some((x) => x.kind === 'go-comment')) fail('wiring: goMask treated a "//" INSIDE a string literal as a comment');
  // the extension filter has to admit .go at all
  const goProbe = mkdtempSync(join(tmpdir(), 'sweep-go-'));
  try {
    writeFileSync(join(goProbe, 'a.go'), 'package p\n');
    if (!walk(goProbe, []).some((p) => p.endsWith('a.go'))) fail('wiring: walk() no longer picks up .go');
  } finally { rmSync(goProbe, { recursive: true, force: true }); }

  // --- ui-desktop wiring ---
  if (!SCAN_ROOTS.includes('ui-desktop')) fail('wiring: SCAN_ROOTS no longer contains "ui-desktop"');
  // The extension filter is the exact hole this extension closed: ui-desktop was
  // in SCAN_ROOTS for the whole life of the checker and walk() admitted none of
  // its source. Named one extension at a time so the failure says which one went.
  const uiProbe = mkdtempSync(join(tmpdir(), 'sweep-ui-'));
  try {
    for (const n of ['a.jsx', 'b.tsx', 'c.ts', 'd.js']) writeFileSync(join(uiProbe, n), 'x\n');
    writeFileSync(join(uiProbe, 'e.tsbuildinfo'), 'x\n');
    const found = walk(uiProbe, []).map((f) => f.slice(f.lastIndexOf(sep) + 1));
    for (const n of ['a.jsx', 'b.tsx', 'c.ts', 'd.js']) {
      if (!found.includes(n)) fail(`wiring: walk() no longer picks up ${n} - ui-desktop is scanned-but-invisible again`);
    }
    if (found.includes('e.tsbuildinfo')) fail('wiring: walk() is picking up build artefacts');
  } finally { rmSync(uiProbe, { recursive: true, force: true }); }

  const uiSrc = join('ui-desktop', 'src', 'renderer', 'src', 'components', 'dashboard', 'Dashboard.jsx');
  const uiTool = join('ui-desktop', 'tools', 'ui-verify', 'run.tsx');
  if (!IS_SCANNED_UI(uiSrc)) fail('wiring: ui-desktop/src left UI_SOURCE_ROOTS - its rendered strings cannot be cut into units');
  if (IS_SCANNED_UI(uiTool)) fail('wiring: ui-desktop/tools is inside UI_SOURCE_ROOTS - the harness bound is gone');
  if (!IN_SCOPE(uiSrc, 'ui-rendered')) fail('wiring: a rendered UI string is out of scope - the UI leg is disabled');
  if (IN_SCOPE(uiSrc, 'ui-comment')) fail('wiring: a JSX COMMENT is in scope - the two UI readers were collapsed');
  if (IN_SCOPE(uiTool, 'ui-rendered')) fail('wiring: a developer harness string is in scope - UI_SOURCE_ROOTS lost its bound');
  if (!DICTATES_ASSERTIONS(uiSrc, 'ui-rendered')) fail('wiring: a rendered UI string lost the assertion-dictating tier - a bare sweep promise on a tile is INFO again');
  if (DICTATES_ASSERTIONS(uiSrc, 'ui-comment')) fail('wiring: the tier spread to JSX comments');

  // jsxUnits must cut BOTH kinds out of one file, or the split above is theatre
  const ju = jsxUnits("function f() {\n  return (\n    <A>\n      {/* swept back automatically, no manual claim needed */}\n      <B>{'swept back automatically'}</B>\n    </A>\n  );\n}\n");
  const jk = ju.map((x) => x.kind);
  for (const k of ['ui-comment', 'ui-rendered']) {
    if (!jk.includes(k)) fail(`wiring: jsxUnits() no longer produces a "${k}" unit (got ${jk.join(',') || 'nothing'})`);
  }
  // `return <Tag>` -- the commonest JSX form, and its preceding character is `n`
  if (!jsxUnits('function f() {\n  return <A>Returns automatically</A>;\n}\n').some((x) => x.kind === 'ui-rendered' && x.body.includes('Returns automatically'))) {
    fail('wiring: `return <Tag>` is no longer read as a tag - TAG_PREV_KEYWORD is gone and most components render nothing');
  }
  // ...and a bare identifier before `<` must still NOT open one, or every
  // comparison and TS generic in 400 files becomes an element
  if (jsxUnits('const [a, b] = useState<Foo>(1);\nconst c = a < b ? 1 : 2;\nconst d: Array<string> = [];\n').some((x) => x.kind === 'ui-rendered')) {
    fail('wiring: a TS generic or a comparison is being parsed as a JSX tag');
  }
  // sibling elements: if a closing tag stops being matched the second sibling
  // owns nothing and its claim disappears silently
  const sib = jsxUnits('function f() {\n  return (\n    <A>\n      <B>On Hold</B>\n      <C>Returns automatically</C>\n    </A>\n  );\n}\n')
    .filter((x) => x.kind === 'ui-rendered');
  if (sib.length !== 2 || !sib.some((x) => x.start === 5 && x.body === 'Returns automatically')) {
    fail(`wiring: sibling JSX elements did not produce two separate units (got ${sib.map((x) => x.start + ':' + x.body).join(' | ')}) - the element tree is collapsing`);
  }
  // a ternary in children position paints both branches
  const tern = jsxUnits("function f() {\n  return <A>{x ? 'Returns automatically' : 'Returning to your wallet now'}</A>;\n}\n")
    .find((x) => x.kind === 'ui-rendered');
  if (!tern || !/Returns automatically/.test(tern.body) || !/Returning to your wallet now/.test(tern.body)) {
    fail('wiring: string literals inside a children expression container are not being read - the ternary form paints nothing');
  }
  // a `<` and a `//` inside a rendered string must not derail the tag scan
  const jm = jsxUnits('function f() {\n  return <A>{"see http://x <b> y"}</A>;\n}\n');
  if (!jm.some((x) => x.kind === 'ui-rendered' && x.body.includes('http://x <b> y'))) {
    fail('wiring: jsxMask lost a string containing "//" or "<" - the mask is not masking');
  }
  if (jm.some((x) => x.kind === 'ui-comment')) fail('wiring: jsxMask treated a "//" INSIDE a string literal as a comment');
  // An apostrophe in JSX TEXT is not a string opener. TWO of them on one line is
  // the shape that matters: with one, an unterminated quote is abandoned at the
  // newline and nothing is lost, so a one-apostrophe case cannot detect the guard
  // being removed. With two, the text between them is masked away and the
  // sentence the user reads is silently truncated.
  // The discriminating shape is an apostrophe in TEXT and a real string literal
  // LATER ON THE SAME LINE: the quote pairs across the closing tag, `</A>` is
  // masked out of existence, the element tree collapses and two elements' text is
  // served as one corrupted blob with raw markup in it. A single apostrophe
  // cannot detect the guard being removed -- an unterminated quote is abandoned
  // at the newline and nothing is lost, which is why the first version of this
  // assertion passed against the sabotaged mask.
  const apos = jsxUnits("function f() {\n  return (\n    <>\n      <A>It's locked</A>{' '}\n      <B>Returns automatically</B>\n    </>\n  );\n}\n")
    .filter((x) => x.kind === 'ui-rendered').map((x) => `${x.start}:${x.body}`);
  if (apos.join(' | ') !== "4:It's locked | 5:Returns automatically") {
    fail(`wiring: an apostrophe in JSX text is being read as a string quote (got ${JSON.stringify(apos)})`);
  }
  // styled-components CSS is a TAGGED template: masked, never a rendered string
  const styled = jsxUnits('const S = styled.div`color: red; content: "returns automatically";`;\nfunction f() {\n  return <A>ok</A>;\n}\n');
  if (styled.some((x) => x.kind === 'ui-rendered' && /color: red/.test(x.body))) {
    fail('wiring: a styled-components stylesheet entered the rendered-text stream');
  }

  // --- the UI classify lane ---
  const uiOpt = (win) => ({ ui: true, agentFile: true, uiWindow: win, uiSource: 'onHoldLines' });
  const bare = 'Returns automatically';
  if (!classify(bare, uiOpt(bare))) fail('wiring: a bare sweep promise on a rendered tile is no longer a violation - the ui-rendered tier is off');
  const qualified = 'Returns automatically - but only while this app is running a proxy-router.';
  if (classify(qualified, uiOpt(qualified))) fail('wiring: a NODE-qualified rendered string is still a violation - the on-screen window stopped discharging');
  if (classify(bare, { ui: true, agentFile: true, uiWindow: bare, uiSource: 'no subject here' })) {
    fail('wiring: SUBJECT_UI is satisfied by text that names nothing - the subject gate inverted');
  }
  if (!classify('Returning to your wallet now', uiOpt('Returning to your wallet now'))) {
    fail('wiring: RETURN_TO_WALLET is gone - the one string on the On Hold tile that names the destination trips nothing');
  }
  if (!classify('each one returns at the end of the day it closes', uiOpt('each one returns at the end of the day it closes'))) {
    fail('wiring: UNAIDED_RETURN is gone - a bare intransitive return promise trips nothing');
  }
  // ...and the UI cues must stay OUT of the prose lane, where the header records
  // that widening the verb list cost four false positives
  if (classify('each one returns at the end of the day it closes and the stake is swept', { agentFile: true })
      ?.cues?.includes('UNAIDED_RETURN')) {
    fail('wiring: a rendered-only cue leaked into the prose lane');
  }
}

function selftest() {
  let bad = 0;
  const fail = (msg) => { bad++; console.log(`FAIL ${msg}`); };

  console.log('--- leg 1a: cue/verdict shapes (hand-written) ---');
  for (const [expect, agentFile, text] of SYNTHETIC_CASES) {
    const c = classify(text, { agentFile });
    const got = c === null ? 'clean' : c.verdict;
    const ok = got === expect;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} expect=${expect} got=${got} agentFile=${agentFile}\n       ${text.slice(0, 110)}`);
  }

  console.log('\n--- leg 1b: byte slices extracted from the corpus (and from git, for deleted wording) ---');
  for (const [expect, agentFile, src, text] of CORPUS_CASES) {
    const c = classify(text, { agentFile });
    const got = c === null ? 'clean' : c.verdict;
    const ok = got === expect;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} expect=${expect} got=${got} agentFile=${agentFile}  <- ${src}`);
  }

  console.log('\n--- leg 2: whole pipeline over a fixture tree (walk/scope/units/classify) ---');
  const before = bad;
  let n = 0;
  try { n = legPipeline(fail); } catch (e) { fail(`pipeline: threw ${e && e.message}`); }
  if (bad === before) console.log(`ok   pipeline produced exactly the ${n} expected violation(s), scope filter honoured`);

  console.log('\n--- leg 3: wiring (SCAN_ROOTS / IN_SCOPE / DICTATES_ASSERTIONS / walk / units) ---');
  const before3 = bad;
  try { legWiring(fail); } catch (e) { fail(`wiring: threw ${e && e.message}`); }
  if (bad === before3) console.log('ok   scan roots, scope filter, agent-file classifier, extension filter and unit shapes all intact');

  const total = SYNTHETIC_CASES.length + CORPUS_CASES.length + 2;
  console.log(`\n${bad === 0 ? 'PASS' : 'FAIL'}: ${total - bad}/${total} self-test check(s)`);
  return bad;
}

// --------------------------------------------------- fixture provenance ----
// Proves the corpus fixtures above were extracted, not retyped: each slice must
// still occur byte-for-byte in the file it cites, and the live unit at that line
// must classify the same way the frozen slice does.
//
// PROVENANCE IS PINNED TO A COMMIT, NOT TO THE WORKING TREE.
// A fixture may cite either `path:line` (the working tree) or `rev:path:line`.
// The `violation` fixtures quote wording the docs pass then REMOVED, so a
// tree-relative citation for one of those goes stale the moment the fix lands,
// and the mode shipped red: 8/17, exit 1. Those are pinned.
//
// A `clean` fixture stays tree-relative on purpose -- that is the half of this
// mode that says something about the CURRENT tree. It does still drift when an
// unrelated correction touches the same line (renaming Proxy.Run to Proxy.run
// moved two of them), and the repair there is to RE-EXTRACT the slice from the
// tree, not to pin it: re-extracting keeps the assertion live, and --selftest
// leg 1b independently re-checks that the new bytes still classify `clean`, so
// a re-extraction cannot quietly launder a verdict change into the corpus.
//
// Red was defensible for one commit and not after that. An advertised mode that
// always fails teaches its reader to ignore it, and then it cannot report the
// failure it exists for -- a fixture that was never in the tree at all. So the
// nine drifted slices are pinned to 165945e4, the commit that introduced them,
// where each is byte-identical AND still classifies as the verdict it asserts.
// The pin was measured per fixture by walking ea7028d7..HEAD newest-first for
// the last commit whose unit at that line equals the frozen slice, not assumed.
//
// What a green run does NOT mean: 165945e4 and 60b7535d are reachable only from
// this pull request's branch. Squash-merging and deleting the branch makes every
// rev-pinned fixture unreadable and this mode will report `cannot read source`
// -- correctly, and loudly. It is a provenance check, not a regression check;
// whether the CURRENT tree is clean is the main scan's job, not this one's.
//
// Deliberately NOT part of --selftest, which stays corpus-independent: this mode
// shells out to git and asserts about history rather than about the classifier.
function verifyFixtures() {
  let bad = 0;
  for (const [expect, agentFile, src, text] of CORPUS_CASES) {
    const m = /^(?:([0-9a-f]{6,40}\^?):)?(.+):(\d+)$/.exec(src);
    if (!m) { console.log(`FAIL  unparseable provenance: ${src}`); bad++; continue; }
    const [, rev, file, lineS] = m;
    let doc;
    try {
      doc = rev
        ? execFileSync('git', ['show', `${rev}:${file}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 })
        : readFileSync(join(ROOT, file), 'utf8');
    } catch (e) { console.log(`FAIL  ${src}: cannot read source (${e && e.message})`); bad++; continue; }

    const ln = Number(lineS);
    const live = units(doc, file.endsWith('.go') ? 'go' : 'md').find((u) => u.start <= ln && (u.end ?? u.start) >= ln);
    if (!live) { console.log(`FAIL  ${src}: no unit covers that line any more`); bad++; continue; }
    const liveBody = live.lines.join(' ');
    const same = liveBody === text;
    const lv = classify(liveBody, { agentFile });
    const got = lv === null ? 'clean' : lv.verdict;
    const ok = same && got === expect;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${src}  byte-identical=${same} live-verdict=${got} expect=${expect}`);
  }
  console.log(`\n${bad === 0 ? 'PASS' : 'FAIL'}: ${CORPUS_CASES.length - bad}/${CORPUS_CASES.length} fixture(s) still match their cited source`);
  return bad;
}

if (process.argv.includes('--verify-fixtures')) process.exit(verifyFixtures() ? 1 : 0);
if (process.argv.includes('--selftest')) process.exit(selftest() ? 1 : 0);

// ----------------------------------------------------------------- main ----
// Exit 2 is COULD-NOT-RUN, and it is a distinct code on purpose: a checker that
// throws and exits non-zero is indistinguishable from a checker that found a
// violation, so a broken gate reads as a failing tree and gets "fixed" by being
// switched off. 0 = clean, 1 = violations, 2 = the gate did not run.
let scanned_, scannedInScope_, violations_, info_;
try {
  ({ violations: violations_, info: info_, scanned: scanned_, scannedInScope: scannedInScope_ } = scan(ROOT));
} catch (e) {
  console.error(`COULD NOT RUN: ${e && e.stack ? e.stack : e}`);
  process.exit(2);
}
const violations = violations_, info = info_, scanned = scanned_, scannedInScope = scannedInScope_;
// Pointed at the wrong directory, walk() finds nothing, every loop below is empty
// and the gate prints `PASS: 0 violation(s)` and exits 0. A gate that certifies a
// directory it never read is worse than no gate, so being unable to find the
// repo is COULD-NOT-RUN, not clean.
for (const r of ['README.md', 'AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md']) {
  try { statSync(join(ROOT, r)); } catch {
    console.error(`COULD NOT RUN: ${join(ROOT, r)} is missing - --root is not this repository`);
    process.exit(2);
  }
}

const fmt = (v) => `${v.file}:${v.line}${v.endLine > v.line ? `-${v.endLine}` : ''}${v.cueLines && (v.cueLines.length > 1 || v.cueLines[0] !== v.line) ? ` [cue at ${v.cueLines.join(',')}]` : ''}  [${v.kind}] missing:${v.missing} cues:${v.cues.join(',')}${v.note ? ` (${v.note})` : ''}\n    ${v.excerpt}`;

console.log(`scanned ${scanned} file(s), ${scannedInScope} in scope`);
console.log(`\nVIOLATIONS (${violations.length}):`);
for (const v of violations) console.log('  ' + fmt(v));
if (SHOW_INFO) {
  console.log(`\nINFO — not violations (${info.length}):`);
  for (const v of info) console.log(`  ${fmt(v)}\n    ~ ${v.why}`);
} else {
  console.log(`\n(${info.length} informational match(es); re-run with --info to list them)`);
}
console.log(`\n${violations.length === 0 ? 'PASS' : 'FAIL'}: ${violations.length} violation(s)`);
process.exit(violations.length ? 1 : 0);
