#!/usr/bin/env node
// check-figure-provenance.mjs — standalone. Run by hand:
//   node scripts/check-figure-provenance.mjs              (advisory listing; exit 0 unless it could not run)
//   node scripts/check-figure-provenance.mjs --info        (also list every numeral it decided was NOT a figure)
//   node scripts/check-figure-provenance.mjs --strict      (exit 1 on findings — see WHY THIS IS ADVISORY)
//   node scripts/check-figure-provenance.mjs --selftest    (gate the gate; corpus-independent)
//   node scripts/check-figure-provenance.mjs --measure     (print the numbers the advisory decision rests on)
//
// WHAT IT CHECKS
// -------------
// A durable artifact that publishes a MEASURED QUANTITY as fact — a rate, a
// count, a percentage, a timing — and does not say beside it where the number
// came from. The reader cannot re-derive it, cannot tell a measurement from a
// recollection, and a figure that entered as an estimate is indistinguishable
// six weeks later from one that came off an instrument. That is the failure
// this looks for: not a wrong number, an UNTRACEABLE one.
//
// A figure is discharged by any of four things inside its own window:
//   * a `file.ext:NN` citation — someone can open the line;
//   * a runnable command in backticks (`git diff --numstat`, `cast call`) —
//     someone can re-run it;
//   * a commit SHA or a URL — someone can fetch the artifact;
//   * an explicit RELAY or UNVERIFIED marker ("reported", "simulated",
//     "projected", "per the release notes", "unverified") — the author has
//     said this is not their own measurement, which is the honest alternative
//     to providing one and is the whole point of allowing it.
//
// WHY THIS IS ADVISORY AND NOT A BLOCKING GATE
// --------------------------------------------
// It ships defaulting to exit 0, and that is a measurement rather than modesty.
// THE NUMBER THAT MADE THE CALL: 21 of 84 findings on the current tree are
// false positives — 25.0%, reached by hand-adjudicating EVERY finding, not a
// sample. Three tightening passes got it there from 68% (27 of 40 in the first
// adjudicated sample, then 45%, then 30%, then 25%), and each pass was a rule
// with a reason, not a filter fitted to the data: comma-grouped numbers read
// whole, named constants excluded, quoted text treated as reported speech,
// durations required to sit beside a measurement word, a rate beside its own
// ratio attributed once, digits inside identifiers not read as numbers.
//
// One finding in four being something a reader would correctly wave through is
// too much to put in anyone's way. A gate that fires on things people know are
// fine is a gate they learn to skip, and once skipped it cannot report the
// finding it exists for. So this one reports and does not block.
//
// THE RESIDUAL FALSE-POSITIVE CLASSES, so the next pass starts from evidence:
//   * a rate derived from counts that are adjacent but not written as a ratio
//     ("22 defects in 274 checked claims = 8%") — the suppression keys on the
//     RATIO shape and `N in M` is not one;                              (2/21)
//   * a confidence bound not adjacent to its ratio;                     (2/21)
//   * a superseded figure being CORRECTED ("83%, not 59%") and a rhetorical
//     restatement ("nowhere near 50%") — asserted by nobody;            (2/21)
//   * a table COLUMN HEADER ("95% CI (Wilson)");                        (1/21)
//   * a METHOD statement doing the work of provenance ("Reviewer measured
//     against the real provider under a virtual clock") — real provenance, but
//     naming an instrument rather than an artifact, and separating that from a
//     bare "the measured 83%" is beyond a lexical rule;                 (2/21)
//   * a constant not written as `NAME = N` ("at the 305 s unit", "collapses the
//     duration to 1s") and a concurrency parameter ("8 pages per round"); (6/21)
//   * a prose distance ("the gate 30 lines away");                      (1/21)
//   * a count of the document's OWN contents ("39 fixes", "8 findings"), where
//     the items are the evidence and they are directly below;           (2/21)
//   * illustrative arithmetic ("roughly 90% of the stake at 10% of the
//     scheduled duration") whose citation is in the same list item but outside
//     the 400-character window.                                         (3/21)
//
// `--strict` is provided for a corpus cleaned to the point where the rate is
// worth it. On this one it is not, and `--measure` reprints the numbers so the
// decision can be re-taken rather than believed.
//
// The irreducible reason it is noisy, stated plainly: whether a numeral asserts
// a MEASURED quantity or merely appears in a sentence is a semantic question,
// and every lexical proxy for it — a counted noun, a percent sign, a ratio —
// also matches prose that is not a measurement claim. The three shapes below
// are the tightest proxies found; they are not the concept.
//
// SCOPE, AND WHY IT IS THIS SMALL
// -------------------------------
// The evidence roots and the four root documents. These are DURABLE and they
// are cited: a figure gets quoted into later documents, which is how an
// unsourced number becomes a load-bearing fact. `docs/**` is deliberately
// excluded — it is written for a reader who wants the mechanism, its numbers are
// overwhelmingly parameters and prices rather than measurements, and including
// it multiplied the finding count without adding a single defect of this class
// (measured; see --measure).
//
// WHAT NEVER COUNTS AS A FIGURE, and this list is the difference between a
// signal and 2,875 numerals:
//   * anything inside backticks or a fenced block — that is evidence being
//     shown, not a claim being made, and it is where the provenance LIVES;
//   * version numbers (`v7.9.0`, `0.0.3`) and dates and clock times;
//   * the NN in a `file.ext:NN-NN` citation, and a bare `:NN` line reference;
//   * hex and 0x literals, and wei-scale integers;
//   * section and list numbering, footnote markers, and ordinals;
//   * a bare integer with no counted noun after it. "3 correct but incomplete"
//     counts; "the 3 in column 2" does not.

import { readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv.find((a) => a.startsWith('--root='))?.slice(7)
  ?? join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SHOW_INFO = process.argv.includes('--info');
const STRICT = process.argv.includes('--strict');

// ---------------------------------------------------------------- scope ----
const SINGLE_FILE_ROOTS = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md'];
const SCAN_ROOTS = ['verify', ...SINGLE_FILE_ROOTS];
const IN_SCOPE = (rel) => (rel.startsWith(`verify${sep}`) && /\.mdx?$/.test(rel)) || SINGLE_FILE_ROOTS.includes(rel);

// ----------------------------------------------------------------- mask ----
// Two views of one unit, and the split is the whole design:
//   claimText  backticks and fenced blocks BLANKED. Numerals are hunted here, so
//              a number inside `git diff --numstat` or inside a quoted log line
//              can never itself become a claim.
//   proofText  the raw text. Provenance is hunted here, because provenance is
//              exactly what lives inside those backticks.
// Offsets are preserved so an index into claimText indexes the same byte of the
// original, which is what lets a finding report a column and an excerpt.
function maskCode(text) {
  const out = text.split('');
  const n = text.length;
  const blank = (a, b) => { for (let k = a; k < b && k < n; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0;
  while (i < n) {
    if (text[i] === '`') {
      let ticks = 0; while (text[i + ticks] === '`') ticks++;
      const fence = '`'.repeat(ticks);
      const close = text.indexOf(fence, i + ticks);
      const end = close < 0 ? n : close + ticks;
      blank(i, end); i = end; continue;
    }
    i++;
  }
  return out.join('');
}

// ------------------------------------------------------------- matchers ----
// A FIGURE — three shapes, each a claim about a quantity someone measured.
// Ordered most-specific first so the same byte is reported once.
//
// COUNTED's noun list is closed and it is this gate's weakest joint, said out
// loud for the same reason the sweep checker says it about its verb lists: any
// lexical cue set is a list of ways of saying a thing and English has more. A
// count of something not on this list is invisible here.
const COUNTED_NOUN = String.raw`files?|commits?|claims?|rows?|findings?|defects?|errors?|falsehoods?|cases?|tests?|checks?|assertions?|occurrences?|instances?|lines?|pages?|calls?|sessions?|tokens?|refs?|tags?|violations?|mutations?|reviewers?|passes|samples?|fixes|reverts?|warnings?|failures?|hits?|matches|endpoints?|variables?|places?|sites?|words?|sentences?|paragraphs?`;

// A number may be comma-grouped, and it must not be entered halfway. `10,219
// lines` read without the leading guard yields the figure "219 lines", and
// `0 / 91,414` yields "0 / 91" -- two findings that are not merely noise but
// WRONG, reporting a number the document does not contain. Both were live in the
// first draft and both turned up in the first adjudicated sample.
// The lookbehind excludes LETTERS as well as digits, because a digit inside an
// identifier is not a number: `S1 finding` yielded the figure "1 finding",
// `S2 defects` yielded "2 defects", and `Phase 2 runs` yielded "2 runs" -- three
// findings reporting quantities the document never asserted. Found by
// adjudicating the output, not by reading the regex.
const NUM = String.raw`(?<![\w,.])\d{1,3}(?:,\d{3})*(?:\.\d+)?`;
const INT = String.raw`(?<![\w,.])\d{1,3}(?:,\d{3})*(?![.\d])`;
const FIGURES = [
  ['PERCENT',  new RegExp(String.raw`${NUM}\s*%`, 'g')],
  // `7 / 33`, `18 of 21`, `43/64`, `20 of 20`
  // Integer operands only. `0.36 / 0.72 / 1.80` is a slash-separated LIST of
  // computed floors, not a ratio, and reading it as one reports a denominator
  // the document never wrote.
  // ...and not followed by a third term. `the three measured numbers (3 / 103 /
  // 91)` is a LIST, and reading its first two elements as a ratio invents a
  // denominator.
  // ...and neither preceded nor followed by a third term. `the three measured
  // numbers (3 / 103 / 91)` is a LIST: without the trailing guard it yields
  // "3 / 103", and without the LEADING guard the scan simply slides along and
  // yields "103 / 91" instead. Either way the finding invents a denominator.
  ['RATIO',    new RegExp(String.raw`(?<!\/\s{0,3})${INT}\s*(?:\/|out of|of)\s*${INT}\b(?!\s*\/\s*\d)`, 'g')],
  // `2.4s`, `305 s`, `10 minutes`, `55s`
  ['DURATION', new RegExp(String.raw`${NUM}\s*(?:ms|s|sec|secs|seconds|min|mins|minutes|hrs?|hours)\b`, 'g')],
  // `33 commits`, `eleven` is not a numeral and is deliberately out
  ['COUNTED',  new RegExp(String.raw`${NUM}\s+(?:\*\*)?(?:${COUNTED_NOUN})\b`, 'gi')],
];

// A DURATION is only a FIGURE where the surrounding text says it was MEASURED.
// Without this the shape is dominated by CONFIGURATION: `MIN_SESSION_DURATION` =
// 300 s, a 305 s cushion, a 604800 s contract cap, a 10-minute ticker interval.
// Those are parameters, and asking a parameter for its provenance is asking the
// document to cite the constant it just quoted.
const MEASURED_CTX = /\b(?:measured|measurement|took|takes|latency|elapsed|ran in|runs in|timed|timing|p50|p95|p99|average|mean|median|worst-case|observed|benchmark\w*|throughput|per (?:call|request|run))\b/i;

// Byte ranges that are NOT a figure however they match. Computed on the ORIGINAL
// text and subtracted from every candidate, because each of these contains
// digits that a naive scan reads as a measurement.
const NON_FIGURE = [
  /\bv?\d+\.\d+\.\d+(?:[-.\w]+)?\b/g,                 // versions: v7.9.0, 0.0.3
  /\b20\d\d-\d\d-\d\d\b/g,                            // dates
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/g,                    // clock times
  /[\w./-]+\.[A-Za-z]{1,5}:\d+(?:[-,:]\d+)*/g,        // file.ext:NN-NN citations
  /\b0x[0-9a-fA-F]+\b/g,                              // addresses, hashes, selectors
  /\b\d{10,}\b/g,                                     // wei-scale integers, unix timestamps
  /(?:^|\n)\s{0,3}(?:\d{1,3}[.)])\s/g,                // ordered-list numbering
  /(?:^|\n)#{1,6}\s+\d+[.)]?\s/g,                     // numbered headings
  /\bCI\b[^.;|]{0,20}\d/g,                            // "95% CI" -- the interval belongs to the rate beside it
  // A NAMED CONSTANT is a parameter, not a measurement: `MIN_SESSION_DURATION` =
  // 300 s, `getMaxSessionDuration()` = 604800 s.
  /\b[A-Z][A-Z0-9_]{3,}\b\s*(?:=|is|of)?\s*[^.;|]{0,20}?\d[\d,.]*\s*(?:ms|s|sec|secs|seconds|min|mins|minutes|hrs?|hours)?\b/g,
  /\b(?:get|set)[A-Z]\w*\(\)\s*(?:=|returns?)?\s*[^.;|]{0,20}?\d[\d,.]*/g,
  // QUOTED TEXT is reported speech -- a UI string being audited, a claim being
  // quoted in order to correct it. The figure in it is not this document's own
  // assertion, so demanding provenance for it is demanding provenance for
  // someone else's number.
  /"[^"\n]{0,200}"/g,
  /\u201c[^\u201d\n]{0,200}\u201d/g,
  // A THRESHOLD is a policy, not a measurement: "diffs >=500 lines", "at least
  // 3 reviewers", "no more than 5 pages". Asking a rule for its provenance is a
  // category error.
  /(?:\u2265|\u2264|>=|<=|>|<|at least|at most|no more than|fewer than|more than|under|over|up to|minimum of|maximum of)\s*\**\s*\d[\d,.]*[^.;|]{0,24}/gi,
  // A RANGE shares the provenance of its ends; reporting both ends doubles every
  // finding without adding one.
  /\d[\d,.]*\s*(?:%|s|ms)?\s*[-\u2013\u2014]\s*\d[\d,.]*\s*(?:%|s|ms)\b/g,
];

// PROVENANCE — searched in proofText (backticks intact).
const PROVENANCE = [
  // someone can open the line
  ['CITATION',  /[\w./-]+\.[A-Za-z]{1,5}:\d+(?:[-,:]\d+)*/],
  // someone can re-run it
  // ...a named tool, OR a backticked SCRIPT INVOCATION (`gate-quotes.mjs
  // --selftest`), which is the form this corpus actually uses to say "re-run
  // this". Without the second alternative every self-test result table
  // reads as an unsourced figure.
  ['COMMAND',   /`[^`]*\b(?:git|cast|curl|node|npm|npx|pnpm|bun|yarn|docker|go|jq|rg|grep|sed|awk|psql|make|python3?|wc|find|gh|eslint|tsc|vitest|jest|cargo|forge|hardhat|lms)\b[^`]*`|`\s*\$\s[^`]*`|`[^`]*[\w./-]+\.(?:mjs|sh|py|js|ts|go)\b[^`]*`/],
  // someone can fetch it
  ['SHA',       /`[0-9a-f]{7,40}`/],
  ['URL',       /https?:\/\/\S+/],
  ['TXHASH',    /\b0x[0-9a-fA-F]{40,66}\b|\bblock \d+\b|\btx(?:n|hash)?\b/i],
  // ...or the author has said it is not their own measurement, which is the
  // honest alternative to providing one and is why this class exists at all
  ['RELAYED',   /\b(?:reported(?: by| in| as)?|as reported|per the|per \w+'s|according to|unverified|not verified|claimed|self-reported|relayed|second-?hand|simulated|projected|extrapolat\w+|estimated|assume[ds]?|hypothetical|illustrative|back-of-the-envelope|from memory|recalled)\b/i],
  // an explicit in-document pointer to where the figure was established
  ['INTERNAL',  /\bsee (?:\u00a7|section|above|below|the table|note|notes|fixes applied)\b|\btable \d\b|\u00a7\s*\d/i],
  // A bare path with no line number. Weaker than CITATION -- it does not say
  // WHERE in the file -- but for a COUNT of things in a file it is the whole
  // answer ("14 of the 25 variables `ui-desktop/env.schema.ts` declares"), and
  // treating it as no provenance at all was the largest false-positive class
  // after constants.
  ['FILEREF',   /`[^`]*[\w-]+\/[\w./-]+`|`[\w./-]+\.(?:go|sol|ts|tsx|jsx|js|mjs|mdx?|json|ya?ml|env|toml)`/],
];

// ---------------------------------------------------------------- units ----
// A unit is a line-block (paragraph / table row / list item / heading), and the
// WINDOW a figure is judged in is a sentence-aligned span of at most
// CLAIM_WINDOW characters around it. Same bound and same reason as the sweep
// checker: a citation four sentences away does not travel with the number when
// the row is quoted into another document.
const CLAIM_WINDOW = 400;

function sentenceSpans(text) {
  const spans = []; let start = 0;
  const re = /[.!?](?=\s|$)|\n/g; let m;
  while ((m = re.exec(text)) !== null) { const end = m.index + m[0].length; if (end > start) spans.push([start, end]); start = end; }
  if (start < text.length) spans.push([start, text.length]);
  return spans.length ? spans : [[0, text.length]];
}
function windowAt(body, idx) {
  if (body.length <= CLAIM_WINDOW) return body;
  const spans = sentenceSpans(body);
  let c = spans.findIndex(([s, e]) => idx >= s && idx < e);
  if (c < 0) c = spans.length - 1;
  let lo = c, hi = c;
  for (;;) {
    const canHi = hi + 1 < spans.length && spans[hi + 1][1] - spans[lo][0] <= CLAIM_WINDOW;
    const canLo = lo - 1 >= 0 && spans[hi][1] - spans[lo - 1][0] <= CLAIM_WINDOW;
    if (canHi) hi++; else if (canLo) lo--; else break;
  }
  return body.slice(spans[lo][0], spans[hi][1]);
}

function units(text) {
  const lines = text.split('\n');
  const out = [];
  let cur = null, fence = null;
  const flush = () => { if (cur && cur.lines.some((l) => l.trim())) out.push(cur); cur = null; };
  const start = (i, kind) => { flush(); cur = { kind, start: i + 1, end: i + 1, lines: [] }; };
  const push = (i, l) => { if (!cur) start(i, 'para'); cur.lines.push(l); cur.end = i + 1; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], t = l.trim();
    const f = t.match(/^(`{3,}|~{3,})/);
    // A fenced block is one unit of KIND `code`, kept so it is enumerated under
    // --info rather than silently dropped; classify() never reads it.
    if (f && !fence) { flush(); fence = f[1][0].repeat(3); start(i, 'code'); push(i, l); continue; }
    if (fence) { push(i, l); if (t.startsWith(fence)) { flush(); fence = null; } continue; }
    if (!t) { flush(); continue; }
    if (/^#{1,6}\s/.test(t)) { start(i, 'heading'); push(i, l); flush(); continue; }
    if (/^\|/.test(t)) {
      if (/^\|[\s:|-]+\|?$/.test(t)) { flush(); continue; }
      start(i, 'table-row'); push(i, l); flush(); continue;
    }
    if (/^>/.test(t)) { if (!cur || cur.kind !== 'quote') start(i, 'quote'); push(i, l); continue; }
    if (/^([-*+]|\d+\.)\s/.test(t)) { start(i, 'list-item'); push(i, l); continue; }
    push(i, l);
  }
  flush();
  return out;
}

// ------------------------------------------------------------- classify ----
function maskedRanges(text) {
  const bad = [];
  for (const re of NON_FIGURE) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m; while ((m = g.exec(text)) !== null) { bad.push([m.index, m.index + m[0].length]); if (m.index === g.lastIndex) g.lastIndex++; }
  }
  return bad;
}

// One place decides what a figure is, so the self-test exercises the same code
// the sweep does.
function classify(body) {
  if (!body.trim()) return [];
  const claimText = maskCode(body);
  const bad = maskedRanges(body);
  const covered = (a, b) => bad.some(([x, y]) => a >= x && a < y) || bad.some(([x, y]) => b > x && b <= y);

  const hits = [];
  const taken = [];
  for (const [name, re] of FIGURES) {
    const g = new RegExp(re.source, re.flags);
    let m;
    while ((m = g.exec(claimText)) !== null) {
      const a = m.index, b = m.index + m[0].length;
      if (m.index === g.lastIndex) g.lastIndex++;
      if (!m[0].trim()) continue;
      if (covered(a, b)) continue;
      if (taken.some(([x, y]) => a < y && b > x)) continue;   // one byte, one figure
      taken.push([a, b]);
      hits.push({ name, index: a, text: m[0].trim() });
    }
  }
  if (!hits.length) return [];

  const out = [];
  for (const h of hits) {
    const win = windowAt(body, h.index);
    if (h.name === 'DURATION' && !MEASURED_CTX.test(win)) continue;
    // A PERCENT beside its own RATIO is ARITHMETIC ON IT, not a second
    // measurement: `| 7 / 33 | 21.2% | 10.7% - 37.8% |` is one measured quantity
    // and three numbers derived from it, and a reader can check the division.
    // The provenance burden belongs to the ratio, which is still reported. This
    // is the same reasoning as the range exclusion above and it removes the
    // largest remaining false-positive class -- every Wilson bound and every
    // rate-next-to-its-count in the audit tables.
    if (h.name === 'PERCENT' && hits.some((o) => o.name === 'RATIO' && Math.abs(o.index - h.index) <= CLAIM_WINDOW)) continue;
    const proof = PROVENANCE.filter(([, re]) => re.test(win)).map(([n]) => n);
    out.push({ ...h, proof, sourced: proof.length > 0 });
  }
  return out.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------- files ----
function walk(p, acc) {
  let st; try { st = statSync(p); } catch { return acc; }
  if (st.isDirectory()) {
    if (/(^|[/\\])(node_modules|\.git|dist|build|out)$/.test(p)) return acc;
    for (const e of readdirSync(p)) walk(join(p, e), acc);
  } else if (/\.mdx?$/.test(p)) acc.push(p);
  return acc;
}

function scan(root) {
  const files = [];
  for (const r of SCAN_ROOTS) walk(join(root, r), files);
  files.sort();
  const findings = [], sourced = [];
  let scanned = 0, scannedInScope = 0, figures = 0;
  for (const abs of files) {
    const rel = relative(root, abs);
    let text; try { text = readFileSync(abs, 'utf8'); } catch { continue; }
    scanned++;
    if (!IN_SCOPE(rel)) continue;
    scannedInScope++;
    for (const u of units(text)) {
      // A HEADING that counts what is under it ("## T2 -- ... - 5 rows") is
      // self-evidencing: the rows are on the next line and the reader can count
      // them. It is still cut as a unit; it is not classified.
      //
      // The `code` half of this test is BELT AND BRACES, and saying so matters:
      // maskCode already blanks a fenced block whole (a fence is just a
      // three-backtick span), so deleting this clause changes no output on any
      // corpus. That was found by mutating it and watching nothing move -- a
      // mutation with no effect is not a hole the self-test missed, and the
      // guard that IS load-bearing here is maskCode's fence handling, pinned by
      // name in legWiring.
      if (u.kind === 'code' || u.kind === 'heading') continue;
      const body = u.lines.join('\n');
      // map an offset in the joined body back to its source line
      const bounds = []; let off = 0;
      for (let k = 0; k < u.lines.length; k++) { bounds.push([off, off + u.lines[k].length, u.start + k]); off += u.lines[k].length + 1; }
      for (const h of classify(body)) {
        figures++;
        const b = bounds.find(([a, z]) => h.index >= a && h.index <= z) ?? bounds[0];
        const rec = {
          file: rel, line: b[2], kind: u.kind, shape: h.name, figure: h.text, proof: h.proof,
          excerpt: windowAt(body, h.index).replace(/\s+/g, ' ').trim().slice(0, 180),
        };
        (h.sourced ? sourced : findings).push(rec);
      }
    }
  }
  return { findings, sourced, scanned, scannedInScope, figures, files };
}

// ------------------------------------------------------------ self-test ----
// Leg 1 — SHAPES. classify() on hand-written units, one per class and one per
// discharge, plus the exclusions that make the difference between 2,875 numerals
// and a signal.
const CASES = [
  // [expect, text, why]
  ['finding', 'Result: 18 of 21 checks were correct.', 'a bare ratio with no provenance'],
  ['finding', 'The central-claim false rate is 21.2% across the lane.', 'a bare percentage'],
  ['finding', 'The sweep took 2.4 seconds on this tree.', 'a bare timing'],
  ['finding', 'Eleven false statements were live; 33 commits were audited.', 'a bare count'],
  // discharged, one per provenance class
  ['sourced', 'Result: 18 of 21 checks were correct (`verify/report-a.md:192`).', 'file:line citation'],
  ['sourced', 'Counts are `git diff --numstat` against the base: 56 files changed.', 'a runnable command'],
  ['sourced', 'The fix landed in `fee1dead` and closed 7 findings.', 'a commit SHA'],
  ['sourced', 'Upstream reports 12 defects, see https://example.invalid/x.', 'a URL'],
  ['sourced', 'Simulated survival was 28.2% over 10000 draws.', 'an explicit method marker'],
  ['sourced', 'The vendor reported 40 errors; unverified here.', 'an explicit relay marker'],
  // exclusions
  ['clean', 'Tagged `v7.9.0`, superseding 0.0.3.', 'version numbers are not figures'],
  ['clean', 'Generated 2026-01-02 09:15 UTC.', 'dates and clock times are not figures'],
  ['clean', 'See `SessionRouter.sol:296-298` and :305.', 'line numbers inside a citation are not figures'],
  ['clean', 'Diamond 0x6aBE1d282f72B474E54527D93b979A4f64d3030a on chain 8453.', 'addresses are not figures'],
  ['clean', 'A floor of 10000000000 wei/sec.', 'wei-scale integers are not figures'],
  ['clean', 'The gate is `block.timestamp < releaseAt_` and it takes 3 arguments each run.', 'a counted noun inside backticks stays out; "3 arguments" is not on the noun list'],
  ['clean', 'It returns nothing at all.', 'no numeral'],
  // the rules added after the first two adjudicated samples, each pinned so a
  // later refactor cannot quietly drop one
  // Two real figures here, and the point of the case is WHICH two: legWiring
  // asserts the token is `10,219 lines` and not `219 lines`. A comma-grouped
  // number entered halfway does not merely add noise, it reports a number the
  // document never wrote.
  ['finding', 'The scope was 88 documents, 10,219 lines of prose.', 'two measured counts, and the comma-grouped one must be read whole'],
  ['clean', '`MIN_SESSION_DURATION` = 300 s; the app opens at 305 s.', 'a named constant is a parameter, not a measurement'],
  ['clean', 'Diffs of at least 100 lines go through review.', 'a threshold is a policy, not a measurement'],
  ['clean', 'The tile advertises "30 assertions" against the panel.', 'a figure inside quotes is reported speech'],
  ['clean', 'Prices map to floors 0.36 / 0.72 / 1.80 MOR.', 'a slash-separated list of decimals is not a ratio'],
  ['finding', 'The router took 3.41 s to answer on the first call.', 'a timing WITH a measurement word is a figure'],
  ['sourced', 'The router took 3.41 s to answer (`verify/report-e.md:77`).', '...and a cited one is discharged'],
  ['clean', 'The lane sits at 305 s.', 'a bare duration with no measurement word is a parameter'],
];

// Leg 2 — PIPELINE. A corpus this test writes itself, scanned by the real
// scan(): walk -> IN_SCOPE -> units -> maskCode -> NON_FIGURE -> FIGURES ->
// PROVENANCE. Every mutation that disables a stage makes an expected finding
// vanish from this fixture tree.
const FIXTURE_TREE = {
  'verify/fx-report.md': [
    '# Fixture report',
    '',
    'Result: 18 of 21 checks were correct, a rate of 86%.',
    '',
    'The lane false-positive rate settled at 25% once the review pass landed.',
    '',
    'The same figure, sourced: 18 of 21 checks were correct (`verify/fx.md:12`).',
    '',
    '| measure | count | rate |',
    '| --- | --- | --- |',
    '| central claim false | 7 / 33 | 21.2% |',
    '',
    '- The vendor reported 40 errors, which we did not check.',
    '',
    'Tagged `v9.9.9` on 2026-01-02 at 09:15 UTC, see `SessionRouter.sol:296-298`.',
    '',
    '```',
    'stats: 99 files, 12 errors',
    '```',
    '',
  ].join('\n'),
  // an out-of-scope tree with the same defect: must never produce a finding
  'docs/fx-page.mdx': '# Fixture page\n\nResult: 18 of 21 checks were correct, a rate of 86%.\n',
  'README.md': '# Fixture readme\n\nThe sweep took 2.4 seconds across 33 commits.\n',
};
// Note what is NOT here: `fx-report.md:3 PERCENT` and `:11 PERCENT`. A rate
// sitting beside the ratio it was computed from is arithmetic on that ratio, and
// the ratio IS reported -- so the figure is not lost, it is attributed once. The
// standalone 25% on line 5 keeps the PERCENT shape itself pinned, which is the
// point of having both cases: delete the suppression and line 3 fails; delete
// the PERCENT shape and line 5 fails.
const FIXTURE_EXPECTED = [
  'verify/fx-report.md:3 RATIO',
  'verify/fx-report.md:5 PERCENT',
  'verify/fx-report.md:11 RATIO',
  'README.md:3 DURATION',
  'README.md:3 COUNTED',
];

function writeTree(dir, tree) {
  for (const [rel, body] of Object.entries(tree)) {
    const abs = join(dir, rel.split('/').join(sep));
    mkdirSync(abs.slice(0, abs.lastIndexOf(sep)), { recursive: true });
    writeFileSync(abs, body);
  }
}

function legPipeline(fail) {
  const dir = mkdtempSync(join(tmpdir(), 'figprov-selftest-'));
  try {
    writeTree(dir, FIXTURE_TREE);
    const r = scan(dir);
    if (r.scanned === 0) fail('pipeline: scan() read 0 files - the walk or SCAN_ROOTS is broken');
    if (r.scannedInScope === 0) fail('pipeline: 0 files judged in scope - IN_SCOPE is broken');
    if (r.figures === 0) fail('pipeline: 0 figures found at all - FIGURES, maskCode or NON_FIGURE swallowed everything');

    const key = (v) => `${v.file.split(sep).join('/')}:${v.line} ${v.shape}`;
    const got = r.findings.map(key).sort();
    const want = [...FIXTURE_EXPECTED].sort();
    for (const w of want) if (!got.includes(w)) fail(`pipeline: expected finding not found: ${w}`);
    for (const g of got) if (!want.includes(g)) fail(`pipeline: unexpected finding (false positive): ${g}`);

    // the sourced twin of line 3 must be discharged, not merely absent
    if (!r.sourced.some((v) => v.line === 7 && v.proof.includes('CITATION'))) {
      fail('pipeline: the file:line-cited figure produced no SOURCED record - PROVENANCE is not being read, so "clean" here means "never looked"');
    }
    if (r.findings.some((v) => v.line === 7)) fail('pipeline: a figure cited to file:line was still reported - the discharge is broken');
    if (!r.sourced.some((v) => v.line === 13 && v.proof.includes('RELAYED'))) {
      fail('pipeline: the explicitly relayed figure produced no SOURCED record - the relay marker is the honest alternative to a citation and it is gone');
    }
    // the exclusions
    for (const [ln, what] of [[15, 'a version, a date, a clock time and a citation line number']]) {
      if (r.findings.some((v) => v.line === ln)) fail(`pipeline: FALSE POSITIVE on line ${ln} - ${what} is being read as a measured figure`);
    }
    if (r.findings.some((v) => v.kind === 'code') || r.sourced.some((v) => v.kind === 'code')) {
      fail('pipeline: a fenced code block produced a figure - numbers being SHOWN are being read as numbers being CLAIMED');
    }
    if (r.findings.some((v) => v.file.startsWith('docs'))) fail('pipeline: an out-of-scope file produced a finding');
    return r.findings.length;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function legWiring(fail) {
  if (!SCAN_ROOTS.includes('verify')) fail('wiring: SCAN_ROOTS no longer contains "verify"');
  for (const r of SINGLE_FILE_ROOTS) {
    if (!SCAN_ROOTS.includes(r)) fail(`wiring: SCAN_ROOTS lost the single-file root "${r}"`);
    if (!IN_SCOPE(r)) fail(`wiring: ${r} is scanned but out of scope - it can no longer report anything`);
  }
  if (!IN_SCOPE(join('verify', 'x.md'))) fail('wiring: verify/** is out of scope');
  if (IN_SCOPE(join('docs', 'x.mdx'))) fail('wiring: docs/** is in scope - the measured scope decision was reverted without re-measuring');

  // maskCode must blank backticks and only backticks, offsets preserved
  const mk = maskCode('a `99 files` b');
  if (mk.length !== 'a `99 files` b'.length) fail('wiring: maskCode changed the length - offsets no longer index the original');
  if (/99/.test(mk)) fail('wiring: maskCode is not blanking inline code - every number inside evidence becomes a claim');
  if (!/^a /.test(mk) || !/ b$/.test(mk)) fail('wiring: maskCode blanked text outside the backticks');
  // A FENCED block is a three-backtick span and maskCode is what actually keeps
  // it out -- the `code` unit-kind skip in scan() is redundant with this, so
  // this is the assertion that has to hold.
  const fenced = maskCode('before\n```\nstats: 99 files, 12 errors\n```\nafter\n');
  if (/99|12/.test(fenced)) fail('wiring: maskCode is not blanking a fenced block - every number a document SHOWS as evidence becomes a number it CLAIMS');
  if (!/before/.test(fenced) || !/after/.test(fenced)) fail('wiring: maskCode blanked prose outside the fence');
  if (classify('before\n```\nstats: 99 files, 12 errors\n```\nafter\n').length) {
    fail('wiring: a figure inside a fenced block is being classified');
  }

  // the three shapes, one at a time so the failure says which
  const shapes = (s) => classify(s).map((h) => h.name);
  if (!shapes('Result: 18 of 21 checks were correct.').includes('RATIO')) fail('wiring: RATIO no longer fires');
  if (!shapes('The rate is 21.2% overall.').includes('PERCENT')) fail('wiring: PERCENT no longer fires');
  if (!shapes('It took 2.4 seconds.').includes('DURATION')) fail('wiring: DURATION no longer fires');
  if (!shapes('We audited 33 commits.').includes('COUNTED')) fail('wiring: COUNTED no longer fires');

  // the exclusions, one at a time for the same reason
  for (const [text, what] of [
    ['Tagged v7.9.0.', 'a version'],
    ['Generated 2026-01-02.', 'a date'],
    ['At 09:15 UTC.', 'a clock time'],
    ['See SessionRouter.sol:296-298.', 'a citation line number'],
    ['Diamond 0x6aBE1d282f72B474E54527D93b979A4f64d3030a.', 'an address'],
    ['A floor of 10000000000 wei/sec.', 'a wei-scale integer'],
    ['The literal `99 files` in a log line.', 'a number inside backticks'],
  ]) {
    if (classify(text).length) fail(`wiring: ${what} is being read as a measured figure ("${text}") - the noise floor is back`);
  }

  // every provenance class discharges, named one at a time: a class silently
  // dropped turns an honest document into a wall of findings
  for (const [text, cls] of [
    ['18 of 21 correct (`a/b.go:12`).', 'CITATION'],
    ['56 files, per `git diff --numstat`.', 'COMMAND'],
    ['closed 7 findings in `fee1dead`.', 'SHA'],
    ['12 defects, see https://example.invalid/x.', 'URL'],
    ['Simulated survival was 28.2%.', 'RELAYED'],
  ]) {
    const h = classify(text);
    if (!h.length) fail(`wiring: the ${cls} case produced no figure at all, so its discharge is untested ("${text}")`);
    else if (!h.every((x) => x.sourced)) fail(`wiring: ${cls} no longer discharges a figure ("${text}")`);
  }
  // ...and provenance must NOT discharge from outside the window
  const far = '18 of 21 checks were correct. ' + 'Filler sentence that carries no evidence at all. '.repeat(12) + 'See `a/b.go:12`.';
  if (classify(far).some((h) => h.sourced)) {
    fail('wiring: a citation 500+ characters away is discharging the figure - CLAIM_WINDOW is gone, so any document with one citation anywhere passes entirely');
  }

  // the four rules added after adjudication, named one at a time
  const fig = (t) => classify(t).map((h) => `${h.name}:${h.text}`);
  const cg = classify('88 documents, 10,219 lines.').map((h) => h.text);
  if (!cg.includes('10,219 lines')) {
    fail(`wiring: a comma-grouped number is being entered halfway - findings report numbers the document does not contain (got ${JSON.stringify(cg)})`);
  }
  if (classify('`MIN_SESSION_DURATION` = 300 s; opens at 305 s.').length) fail('wiring: a named constant is being read as a measurement');
  if (classify('Diffs of at least 100 lines go to review.').length) fail('wiring: a threshold is being read as a measurement');
  if (classify('It advertises "30 assertions" here.').length) fail('wiring: a figure inside quotes is being read as this document\'s own assertion');
  if (fig('floors 0.36 / 0.72 / 1.80 MOR').some((x) => x.startsWith('RATIO'))) fail('wiring: a slash-separated list of decimals is being read as a ratio');
  if (classify('The lane sits at 305 s.').length) fail('wiring: a duration with no measurement word is being read as a measurement');
  if (!classify('It took 3.41 s per call.').length) fail('wiring: a duration WITH a measurement word stopped firing - MEASURED_CTX inverted');
  const rr = fig('| central claim false | 7 / 33 | 21.2% | 10.7% - 37.8% |');
  if (!rr.some((x) => x.startsWith('RATIO'))) fail('wiring: the ratio in a rate table stopped firing');
  if (rr.some((x) => x.startsWith('PERCENT'))) fail('wiring: a rate beside its own ratio is still reported - every Wilson bound is a finding again');
  if (!fig('The lane false-positive rate settled at 25% after review.').some((x) => x.startsWith('PERCENT'))) {
    fail('wiring: a STANDALONE percentage stopped firing - the ratio suppression swallowed the whole PERCENT shape');
  }
  for (const [t, what] of [['No S1 finding was reproduced.', '"S1 finding" -> "1 finding"'],
                          ['Round 1 disputed the S2 defects.', '"S2 defects" -> "2 defects"'],
                          ['Phase 2 runs inside the P-Node.', '"Phase 2 runs" -> "2 runs"']]) {
    if (classify(t).length) fail(`wiring: a digit inside an identifier is being read as a number (${what}) - findings report quantities the document never asserted`);
  }
  if (fig('regression pins for the three measured numbers (3 / 103 / 91)').some((x) => x.startsWith('RATIO'))) {
    fail('wiring: a three-element slash LIST is being read as a ratio - the finding invents a denominator');
  }
  if (!classify('0 errors from `npx eslint` on the new files.').every((h) => h.sourced)) {
    fail('wiring: a backticked invocation no longer discharges - the COMMAND cue list lost an entry');
  }

  // units() must still cut the shapes the design rests on
  const u = units('# H\n\npara\n\n| a | b |\n| --- | --- |\n| c | d |\n\n- item\n\n```\ncode\n```\n');
  const kinds = u.map((x) => x.kind);
  for (const k of ['heading', 'para', 'table-row', 'list-item', 'code']) {
    if (!kinds.includes(k)) fail(`wiring: units() no longer produces a "${k}" unit (got ${kinds.join(',')})`);
  }
}

function selftest() {
  let bad = 0;
  const fail = (msg) => { bad++; console.log(`FAIL ${msg}`); };

  console.log('--- leg 1: figure/provenance shapes (hand-written) ---');
  for (const [expect, text, why] of CASES) {
    const h = classify(text);
    const got = !h.length ? 'clean' : (h.every((x) => x.sourced) ? 'sourced' : 'finding');
    const ok = got === expect;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} expect=${expect} got=${got}  ${why}\n       ${text.slice(0, 100)}`);
  }

  console.log('\n--- leg 2: whole pipeline over a fixture tree (walk/scope/units/mask/figures/provenance) ---');
  const b2 = bad; let n = 0;
  try { n = legPipeline(fail); } catch (e) { fail(`pipeline: threw ${e && e.stack}`); }
  if (bad === b2) console.log(`ok   pipeline produced exactly the ${n} expected finding(s); the sourced twin, the relay marker, the code fence and the out-of-scope tree all behaved`);

  console.log('\n--- leg 3: wiring (SCAN_ROOTS / IN_SCOPE / maskCode / FIGURES / NON_FIGURE / PROVENANCE / window / units) ---');
  const b3 = bad;
  try { legWiring(fail); } catch (e) { fail(`wiring: threw ${e && e.stack}`); }
  if (bad === b3) console.log('ok   scan roots, scope filter, code mask, the four figure shapes, the seven exclusions, the five provenance classes, the window and the unit shapes all intact');

  const total = CASES.length + 2;
  console.log(`\n${bad === 0 ? 'PASS' : 'FAIL'}: ${total - bad}/${total} self-test check(s)`);
  return bad;
}

if (process.argv.includes('--selftest')) process.exit(selftest() ? 1 : 0);

// ----------------------------------------------------------------- main ----
let R;
try { R = scan(ROOT); }
catch (e) { console.error(`COULD NOT RUN: ${e && e.stack ? e.stack : e}`); process.exit(2); }
if (R.scannedInScope === 0) {
  console.error(`COULD NOT RUN: no in-scope documentation under ${ROOT} - --root is not this repository`);
  process.exit(2);
}
const { findings, sourced, scanned, scannedInScope, figures } = R;

if (process.argv.includes('--measure')) {
  const byShape = findings.reduce((a, v) => (a[v.shape] = (a[v.shape] || 0) + 1, a), {});
  const byFile = findings.reduce((a, v) => (a[v.file] = (a[v.file] || 0) + 1, a), {});
  console.log(`figures found: ${figures}`);
  console.log(`  sourced   : ${sourced.length} (${(100 * sourced.length / (figures || 1)).toFixed(1)}%)`);
  console.log(`  unsourced : ${findings.length} (${(100 * findings.length / (figures || 1)).toFixed(1)}%)`);
  console.log(`by shape  : ${JSON.stringify(byShape)}`);
  console.log(`by provenance class (discharged): ${JSON.stringify(sourced.reduce((a, v) => { for (const p of v.proof) a[p] = (a[p] || 0) + 1; return a; }, {}))}`);
  console.log('by file   :');
  for (const [f, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${f}`);
  process.exit(0);
}

console.log(`scanned ${scanned} file(s), ${scannedInScope} in scope; ${figures} figure(s), ${sourced.length} with provenance in reach`);
console.log(`\nADVISORY — figures with no provenance in reach (${findings.length}):`);
for (const v of findings) console.log(`  ${v.file}:${v.line}  [${v.shape}] ${JSON.stringify(v.figure)}  (${v.kind})\n      ${v.excerpt}`);
if (SHOW_INFO) {
  console.log(`\nSOURCED — figures whose provenance was found (${sourced.length}):`);
  for (const v of sourced) console.log(`  ${v.file}:${v.line}  [${v.shape}] ${JSON.stringify(v.figure)}  via ${v.proof.join(',')}`);
} else {
  console.log(`\n(${sourced.length} figure(s) discharged; re-run with --info to list them, --measure for the rates)`);
}
// Advisory by default. See WHY THIS IS ADVISORY at the top: the measured
// false-positive rate on this corpus is too high to put in anyone's way, and a
// gate people learn to skip cannot report the finding it exists for.
console.log(`\n${STRICT ? (findings.length ? 'FAIL' : 'PASS') : 'ADVISORY'}: ${findings.length} unsourced figure(s)`);
process.exit(STRICT && findings.length ? 1 : 0);
