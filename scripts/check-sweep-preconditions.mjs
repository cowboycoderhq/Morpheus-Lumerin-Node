#!/usr/bin/env node
// check-sweep-preconditions.mjs — standalone. Run by hand:
//   node scripts/check-sweep-preconditions.mjs                   (repo root; exit 1 on violations)
//   node scripts/check-sweep-preconditions.mjs --info            (also list out-of-scope mentions)
//   node scripts/check-sweep-preconditions.mjs --selftest        (gate the gate; corpus-independent)
//   node scripts/check-sweep-preconditions.mjs --verify-fixtures (fixture provenance vs the tree)
//
// WHAT IT CHECKS
// -------------
// Three facts, all read out of source, not out of a doc:
//
//   1. NODE:   StakeClaimer is constructed and started only inside `Proxy.Run`
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
//   verify/**            audit records of what was true at a past commit
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
];
const IS_SCANNED_GO = (rel) =>
  /\.go$/.test(rel) && GO_SOURCE_ROOTS.some((r) => rel === r || rel.startsWith(r + sep));

// `kind` may be a sub-unit kind ("frontmatter/bold-lead"); scope and tier are
// decided by the kind it was cut from.
const baseKind = (k) => String(k ?? 'para').split('/')[0];

// A string the program prints is read by a user — in a terminal, in a log file,
// in a support paste pasted into a chat. It is a page with a smaller frame, not
// a lesser one, and it is the one instance of this claim family a user meets
// without having chosen to read documentation at all. So printed strings in the
// scanned Go packages are IN scope; comments in the very same file are not.
const IN_SCOPE = (rel, kind) =>
  PROSE_IN_SCOPE(rel) || (baseKind(kind) === 'go-log-string' && IS_SCANNED_GO(rel));

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
  || ['AGENTS.md', 'CLAUDE.md'].includes(rel)
  || rel.startsWith(`.cursor${sep}rules${sep}`)
  || rel.startsWith(`docs${sep}ai${sep}`);   // the whole agent-facing tree: these
                                             // pages declare themselves the
                                             // agent-citable reference, so a bare
                                             // assertion here is repeated verbatim

const SCAN_ROOTS = ['docs', '.cursor', 'README.md', 'AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md',
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
const ASSERTS_SWEEP = [
  ['AUTOMATIC',   /\bautomatic(ally)?\b/i],
  ['AUTO_SWEEP',  /\bauto-?(sweep|sweeps|claim|claimed|claims)\b/i],
  ['SWEPT_BACK',  /\b(swept|sweeps|sweep|claimed|claims|returns?|returned)\b[^.;:]{0,40}?\b(back|home|to (your|the) wallet)\b/i],
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
function classify(body, { agentFile }) {
  if (!SUBJECT.test(body)) return null;

  const exc = cueHits(EXCULPATORY, body);
  const asr = cueHits(ASSERTS_SWEEP, body);
  const sole = cueHits(SOLE_REMEDY, body)
    .filter((h) => !precededBy(body, h, PROSCRIBED_BEFORE))
    .filter((h) => !(NEG_SENSITIVE.has(h.name) && precededBy(body, h, NEGATED_BEFORE)))
    .filter((h) => any(FALLBACK_CTX, windowAt(body, h.index)));

  // A claim is discharged only by a qualifier inside its own window.
  const liveEA = [...exc, ...asr].filter((h) => {
    const w = windowAt(body, h.index);
    return !(any(COND_NODE, w) && any(COND_WALLET, w));
  });
  const liveExc = liveEA.filter((h) => EXCULPATORY.some(([n]) => n === h.name));
  const liveAsr = liveEA.filter((h) => ASSERTS_SWEEP.some(([n]) => n === h.name));
  const liveSole = sole.filter((h) => !any(COND_START, windowAt(body, h.index)));

  // Nothing survived: either no cue fired, or every cue that did fire had its
  // qualifier inside its own window. Both are "clean".
  if (!liveEA.length && !liveSole.length) return null;

  const names = (hs) => [...new Set(hs.map((h) => h.name))];
  const missing = [];
  if (liveExc.length || liveAsr.length) {
    const w = liveEA.map((h) => windowAt(body, h.index)).join(' ');
    const node = any(COND_NODE, w), wallet = any(COND_WALLET, w);
    missing.push([!node && 'NODE', !wallet && 'WALLET'].filter(Boolean).join('+'));
  }
  if (liveSole.length) missing.push('START');

  const cues = names([...liveExc, ...liveAsr, ...liveSole]);
  if (liveSole.length) {
    return { verdict: 'violation', cues, missing: missing.join(','), note: 'sole-remedy: the manual call is not the only route' };
  }
  if (liveExc.length) return { verdict: 'violation', cues, missing: missing.join(',') };
  if (agentFile) return { verdict: 'violation', cues, missing: missing.join(','), note: 'agent-instruction file' };
  return { verdict: 'info', cues, missing: missing.join(','), why: 'describes the mechanism; no exculpatory clause' };
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

// ---------------------------------------------------------------- units ----
// Split a document into the spans a reader can encounter on their own.
function units(text, ext = 'md') {
  if (ext === 'go') return goUnits(text);
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
  const body = u.lines.join(' ');
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
  } else if (/\.(mdx?|mdc|ya?ml|json|go)$/.test(p)) acc.push(p);
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
    if (!SUBJECT.test(text)) continue;
    const ext = abs.slice(abs.lastIndexOf('.') + 1).toLowerCase();

    for (const u of units(text, ext)) {
      for (const su of subUnits(u)) {
        const body = su.body;
        if (!SUBJECT.test(body)) continue;
        const inScope = IN_SCOPE(rel, su.kind);
        const c = classify(body, { agentFile: DICTATES_ASSERTIONS(rel, su.kind) });
        if (!c) continue;

        const rec = {
          file: rel, line: su.start, endLine: su.end ?? su.start, kind: su.kind,
          cues: c.cues, missing: c.missing, note: c.note,
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
  // is wording d627040c deleted from the docs, so the checker was certifying the
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
  // 253a0f74, so the hole predates the widening).
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
];

// Leg 1b — CORPUS. Byte slices lifted programmatically out of the tree (and, for
// the three that d627040c deleted, out of `git show d627040c^:<path>`), not
// retyped. The provenance string is the file and line the slice came from;
// `--verify-fixtures` re-extracts each one and asserts it is still byte-identical
// and still gets the same verdict. It is a separate mode on purpose: the docs
// pass that follows this commit will change those lines, and a gate that breaks
// when the corpus is FIXED would be a gate nobody keeps.
const CORPUS_CASES = [
  // sole-remedy: 'submit withdrawUserStakes yourself' with no start-the-node route
  ['violation', true, "docs/ai/where-is-my-mor.mdx:118",
   "| \"I closed (or let it expire) and only part came back.\" | Expected — the final UTC day's slice is in the on-hold queue (Bucket 2). A running proxy-router automatically sweeps matured stake every 10 minutes for the wallet it holds, so no manual claim is needed — with the node off, or for another wallet's stake, submit `withdrawUserStakes` yourself. |"],
  // same shape, second row
  ['violation', true, "docs/ai/where-is-my-mor.mdx:119",
   "| \"I closed and **nothing** came back.\" | Expected when the session was fully consumed inside one UTC day — e.g. it ran to `endsAt` — because then the consumed slice is essentially the whole stake. **Not** expected from an early close, which returns the unconsumed part in the close txn. A running proxy-router automatically sweeps the held part after `releaseAt` for the wallet it holds, so no manual claim is needed — with the node off, or for another wallet's stake, submit `withdrawUserStakes` yourself. |"],
  // mermaid node label
  ['violation', true, "docs/ai/why-locked-in-contract.mdx:61",
   "  Q2 -->|Yes| A2[Consumed slice likely in userStakesOnHold — a running node auto-sweeps after releaseAt for its own wallet only, otherwise call withdrawUserStakes yourself]"],
  // inside an APPROVED-ANSWER template
  ['violation', true, "docs/ai/llm-prompt-cheatsheet.mdx:68",
   "  - ✅ \"Opening a session escrows MOR; the final UTC day's **consumed** slice day-locks until the next UTC day, and the **unconsumed** remainder returns in the close transaction. Closing at 10% of the scheduled duration returns roughly 90% of the stake; the return is near zero only when the session was fully consumed, e.g. left to run to `endsAt` inside one UTC day. A running proxy-router's StakeClaimer sweeps the held slice automatically after `releaseAt`, for the wallet that node holds — with the node off, or for a session opened from another wallet, you call `withdrawUserStakes` yourself.\""],
  // corrective half of a myth bullet
  ['violation', true, "docs/ai/session-states-open-close-recover.mdx:61",
   "- ❌ \"I closed, I should see all my MOR back instantly.\" → **Only the remainder returns at close** — `remaining stake − the final UTC day's day-locked slice` — which is the part you did not consume: roughly **90%** of the stake for a close at 10% of the scheduled duration, and **zero** only for a fully consumed session such as one run to `endsAt` inside one UTC day. The split is **not** \"unused vs used\" because the lock is windowed to the **final UTC day**: `userDuration_` starts at `max(openedAt, startOfTheDay(sessionEnd))` (`SessionRouter.sol:306`), so on a multi-day session the earlier days' *consumed* stake comes back at close too. The rest arrives after `releaseAt`, swept automatically by a running proxy-router holding that wallet — with the node off, or for a session opened from another wallet, you submit `withdrawUserStakes` yourself."],
  // <Step> body
  ['violation', false, "docs/concepts/sessions-stake-close-recover.mdx:103",
   "  <Step title=\"Done\">     Spendable MOR is back in your wallet — everything except the final UTC day's locked slice lands at close, and that slice once the day-lock expires and the proxy-router's StakeClaimer sweeps it back, which needs no manual claim while your own node is running and holds the wallet you opened from. With the node off, or for a session opened from another wallet, nothing sweeps and you submit `withdrawUserStakes` yourself. It is not an \"unused now, used later\" split: on a multi-day session the earlier days' consumed stake is in the amount returned at close."],
  // 'optional while running - and required with the node off'
  ['violation', false, "docs/consumers/buy-bid.mdx:62",
   "- **On close (early or natural):** the contract locks `min(remaining stake, stake-equivalent of the final UTC day's consumed seconds)` with `releaseAt = startOfTheDay(min(closedAt, endsAt)) + 1 day`, and returns the remainder in the same txn — **the unconsumed portion**, which is close to the whole stake for an early close and approximately zero only for a session run to `endsAt` inside one UTC day. After `releaseAt` a running proxy-router sweeps matured stake automatically every 10 minutes (`blockchainapi/stake_claimer.go`), and only for the wallet it holds; `GET /blockchain/stakes/on-hold` reports the balance. Calling `withdrawUserStakes(yourAddress, iterations)` on the Diamond yourself is optional while that node is running — and required with the node off, or for a session opened from another wallet."],
  // 1703-char rule; 'the user calls withdrawUserStakes themselves'
  ['violation', true, ".cursor/rules/morpheus.mdc:25",
   "5. **Opening a session escrows MOR; it does not spend MOR.** But do not say it all returns on close: the stake-equivalent of the final UTC day's consumption is day-locked in `userStakesOnHold` until `releaseAt = startOfTheDay(min(closedAt, endsAt)) + 1 day`. The lock is sized from the seconds actually consumed ([`SessionRouter.sol:306-308`](../../smart-contracts/contracts/diamond/facets/SessionRouter.sol)), so it equals the whole remaining stake only as consumption approaches the full scheduled duration, not because the session was same-day. A session left to run to `endsAt` inside one UTC day is fully consumed and commonly returns **nothing** at close — while an early close returns the part you did not consume, roughly 90% of the stake at 10% of the scheduled duration; the locked slice is swept to the wallet after `releaseAt` by the consumer's own running proxy-router, and only for the wallet that node holds — with the node off, or for a session opened from another wallet, nothing sweeps and the user calls `withdrawUserStakes` themselves. The lock is **conditional, not automatic**: the contract enters that branch only while `block.timestamp < releaseAt_` ([`SessionRouter.sol:305`](../../smart-contracts/contracts/diamond/facets/SessionRouter.sol)), so a genuinely late close — a session that ended at noon on day 1 and is closed on day 4 — skips it, leaves `userStakeToLock_` at zero and transfers the entire remaining stake at once ([`SessionRouter.sol:314-315`](../../smart-contracts/contracts/diamond/facets/SessionRouter.sol)). Do not state the day-lock unconditionally. Cite [`docs/ai/session-states-open-close-recover.mdx`](../../docs/ai/session-states-open-close-recover.mdx)."],
  // 1622-char rule; also the bold-lead case
  ['violation', true, "CLAUDE.md:123",
   "2. **MOR on hold is shown in the app and claimed automatically by the proxy-router's StakeClaimer.** The proxy-router includes a StakeClaimer that automatically claims matured on-hold MOR and returns it to the wallet every 10 minutes — but only while that node is    running, and only for the wallet it holds (`proxyctl.go:237-240` starts the    claimer inside `Proxy.Run`; `service.go:1118-1124` withdraws for    `GetMyAddress` alone). The Diamond has    `getUserStakesOnHold` + `withdrawUserStakes`; these are accessible through the    proxy-router, and the app DOES display them (`Dashboard.jsx:658-666`, with a    per-tranche release schedule at `:527-553`). Closing a session day-locks the    final UTC day's used-compute portion until `startOfTheDay(min(closedAt,    endsAt)) + 1 day` (`SessionRouter.sol:296-298`), and that MOR is now    recoverable. That lock is **conditional, not automatic**: the contract enters the    branch only while `block.timestamp < releaseAt_` (`SessionRouter.sol:305`), so a    genuinely late close — a session that ended at noon on day 1 and is closed on    day 4 — skips it, leaves `userStakeToLock_` at its initialiser of 0 (`:302`) and    transfers the entire remaining stake at once (`:314-315`), locking nothing. Do    not state the day-lock unconditionally.    The proxy-router's StakeClaimer returns it to the wallet automatically while    that node is running; with the node off, or for sessions opened from a    different wallet, nothing sweeps and `withdrawUserStakes` has to be called by    hand.    Diamond `0x6aBE1d282f72B474E54527D93b979A4f64d3030a` (Base, chainId 8453)."],
  // CORRECT: 'no user action is required WHILE ...' - negated, fully qualified
  ['clean', true, "docs/ai/where-is-my-mor.mdx:50",
   "After `releaseAt` your own proxy-router sweeps matured stake automatically every 10 minutes (`stake_claimer.go`); `GET /blockchain/stakes/on-hold` reports the balance. That sweep runs only inside a running node and only over the wallet that node holds — the StakeClaimer is started by `Proxy.Run` (`proxy-router/internal/proxyctl/proxyctl.go:237-240`) and withdraws for `GetMyAddress` alone (`proxy-router/internal/blockchainapi/service.go:1118-1124`). So no user action is required **while your node is running and the session was opened from its wallet**; with the node stopped, or for sessions opened from a different wallet, nothing sweeps until a proxy-router holding that wallet runs — starting one claims matured stake immediately on startup (`stake_claimer.go:87-89`), and the call below is the alternative:"],
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
   "A running proxy-router claims matured on-hold stakes automatically via its internal StakeClaimer (see `proxy-router/internal/blockchainapi/stake_claimer.go`). That is bounded twice: the claimer is started only inside `Proxy.Run` (`internal/proxyctl/proxyctl.go:237-240`), and it withdraws only for the node's own `GetMyAddress` (`internal/blockchainapi/service.go:1118-1124`). With the node stopped, or for stakes belonging to a different wallet, nothing is claimed. There is no dedicated HTTP endpoint, so manual claiming via `cast send` or a wallet UI is the alternative for direct contract interaction. In those two cases nothing sweeps until a proxy-router holding that wallet runs — starting one claims matured stake immediately on startup (`stake_claimer.go:87-89` calls `claimOnce` before entering the ticker loop) — so starting that node and the manual call are the two routes."],
  // DELETED by d627040c: '...the alternative - and the only route when the node is off'
  ['violation', false, "d627040c^:docs/reference/api-endpoints.mdx:205",
   "A running proxy-router claims matured on-hold stakes automatically via its internal StakeClaimer (see `proxy-router/internal/blockchainapi/stake_claimer.go`). That is bounded twice: the claimer is started only inside `Proxy.Run` (`internal/proxyctl/proxyctl.go:237-240`), and it withdraws only for the node's own `GetMyAddress` (`internal/blockchainapi/service.go:1118-1124`). With the node stopped, or for stakes belonging to a different wallet, nothing is claimed. There is no dedicated HTTP endpoint, so manual claiming via `cast send` or a wallet UI is the alternative for direct contract interaction — and the only route in those two cases."],
  // DELETED by d627040c: 'calling it yourself is the only way'
  ['violation', false, "d627040c^:docs/reference/glossary.mdx:26",
   "| **`userStakesOnHold`** | Per-user array on the Inference Contract that holds the **final UTC day's consumed slice** after close — but only when `closeSession` lands **before** `releaseAt` (`SessionRouter.sol:305`); a genuinely late close skips the lock entirely and the whole remaining stake returns at close. Each entry has an amount and `releaseAt = startOfTheDay(min(closedAt, endsAt)) + 1 day`. Cleared by the proxy-router's StakeClaimer, which submits `withdrawUserStakes` automatically once an entry matures — but only while your own node is running and only for the wallet it holds; with the node off, or for a session opened from another wallet, calling it yourself is the only way. |"],
  // DELETED by d627040c: 'the manual call is the only route'
  ['violation', false, "d627040c^:docs/reference/glossary.mdx:27",
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

  // out of scope: same defect, must land in info and NEVER in violations
  'verify/fx-audit.md':
    '# Fixture audit\n\n'
    + 'The locked stake is swept back automatically by the StakeClaimer, so no manual `withdrawUserStakes` is needed.\n',
};

// file:line of every violation the fixture tree must produce.
const FIXTURE_EXPECTED = [
  'CLAUDE.md:3/bold-lead',
  '.cursor/rules/fx.mdc:3',
  'docs/ai/fx-agent.mdx:3',
  'docs/ai/fx-agent.mdx:8',
  'docs/concepts/fx-frontmatter.mdx:3',
  'docs/concepts/fx-mermaid-node.mdx:5',
  'docs/concepts/fx-mermaid.mdx:5',
  'docs/concepts/fx-note.mdx:3',
  'proxy-router/internal/blockchainapi/fx_claimer.go:6',
  'proxy-router/internal/proxyctl/fx_proxyctl.go:4',
  'smart-contracts/docs/fx-rfp.md:3',
  'smart-contracts/docs/fx-rfp.md:3/bold-lead',
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
    if (r.violations.some((v) => v.kind === 'go-comment')) fail('pipeline: a Go COMMENT was raised to a violation - the two Go readers were collapsed');
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
  if (DICTATES_ASSERTIONS(human, 'table-row')) fail('wiring: the tier spread to table rows - a gate that fires on everything fires on nothing');

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
// must classify the same way the frozen slice does. Deliberately NOT part of
// --selftest: the docs pass that follows this commit will legitimately change
// those lines, and this mode is expected to report drift then.
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
const { violations, info, scanned, scannedInScope } = scan(ROOT);

const fmt = (v) => `${v.file}:${v.line}${v.endLine > v.line ? `-${v.endLine}` : ''}  [${v.kind}] missing:${v.missing} cues:${v.cues.join(',')}${v.note ? ` (${v.note})` : ''}\n    ${v.excerpt}`;

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
