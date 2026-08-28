#!/usr/bin/env node
// check-partial — did a fix get applied at the finding, but not across the page?
//
// The blind review found several of our own corrections half-applied: the escrow
// formula fixed in one paragraph and left standing in a code block further down
// the SAME page; "proportional limiter" corrected in prose and re-asserted in the
// comparison table below it. Each was a real fix, applied where the finding
// pointed and nowhere else.
//
// recurrence.mjs cannot catch this: it knows ~11 hand-written claim patterns and
// is blind to any claim it was never taught. This derives the patterns from the
// DIFF instead — every line we removed carried a claim we judged wrong, so if a
// distinctive piece of that line still exists anywhere, the fix was partial.
//
//   node tools/docs-audit/check-partial.mjs
//   node tools/docs-audit/check-partial.mjs --selftest
//
// Output is a CANDIDATE LIST, not a result. A signature can legitimately survive
// (a page quoting the old value while correcting it). Every hit needs a human.

import { execFileSync } from 'node:child_process';
import { resolve as resolveFs } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO, docFiles, read, auditBase } from './lib.mjs';

// Distinctive enough that an accidental recurrence is unlikely. Deliberately
// NOT ordinary prose: matching on that would flag every page.
export function signatures(line) {
  const out = new Set();
  const t = line.replace(/^[-+]/, '');
  // a formula: two identifiers joined by * or x
  for (const m of t.matchAll(/\b[a-zA-Z_][a-zA-Z0-9_]{3,}\s*[*×]\s*[a-zA-Z_][a-zA-Z0-9_]{3,}\b/g)) out.add(m[0]);
  // a number carrying a unit
  for (const m of t.matchAll(/\b\d[\d,._]*\s*(?:days?|hours?|minutes?|seconds?|wei|%)\b/gi)) out.add(m[0]);
  // a parenthesised qualifier — where table re-assertions hide
  for (const m of t.matchAll(/\(([a-z][a-z ]{6,30})\)/gi)) out.add(m[0]);
  // a bare large integer (bid floors, stake amounts)
  for (const m of t.matchAll(/\b\d{6,}\b/g)) out.add(m[0]);
  // NOTE: bolded prose (**unused**, **MorpheusUI**) was tried and removed. Those
  // phrases recur legitimately on every page and drowned the real signal.
  return [...out].filter((s) => s.trim().length >= 6);
}

// Word-boundary match, NOT substring. `includes()` reported the corrected bid
// floor 10000000000000 as a survival of the old 10000000000, because the old
// value is a prefix of the new one — a detector that flags a fix AS the defect
// it fixed.
export function occurs(hay, sig) {
  const esc = sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lead = /^[\w]/.test(sig) ? '(?<![\\w.])' : '';
  const tail = /[\w]$/.test(sig) ? '(?![\\w.])' : '';
  try { return new RegExp(lead + esc + tail).test(hay); }
  catch { return hay.includes(sig); }
}


// ---------------------------------------------------------------- prose claims
// signatures() only sees formulas, numbers-with-units and large integers. The
// sentence "swapping, adding, or removing any model changes the hash and fails
// verification" has none of those, so the detector produced ZERO signatures for
// it and was blind by construction. Three restatements of that claim survived a
// fix — a diagram node, a section heading, and the same claim in a second
// document — and all three were found by hand.
//
// This closes it: a claim is also its distinctive WORDS. Take the uncommon
// content words of a removed line and find any other line that shares enough of
// them. Uncommon is measured against the corpus, so words like "model" that
// appear everywhere carry no weight and cannot drown the signal.
const STOP = new Set(('the a an and or but if then than that this these those of in on at to for from by with '
  + 'is are was were be been being it its as not no any all can will would should may might must have has had '
  + 'do does did you your they their we our i he she him her his which who whom what when where why how there '
  + 'here also only just more most other some such into over under between about after before while during '
  + 'each per via use used using see also note used one two both same only').split(' '));

export const words = (t) => (String(t || '').toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || [])
  .filter((w) => !STOP.has(w));

// document frequency across the corpus: how many files contain each word
export function docFreq(corpus) {
  const df = new Map();
  for (const body of Object.values(corpus)) {
    for (const w of new Set(words(body))) df.set(w, (df.get(w) || 0) + 1);
  }
  return df;
}

// the uncommon words of a line, rarest first
export function proseSignature(line, df, nDocs, maxShare = 0.25) {
  const seen = new Set();
  const out = [];
  for (const w of words(line)) {
    if (seen.has(w)) continue;
    seen.add(w);
    const f = df.get(w) || 0;
    if (f > 0 && f <= Math.max(2, Math.floor(nDocs * maxShare))) out.push([w, f]);
  }
  return out.sort((a, b) => a[1] - b[1]).slice(0, 10).map(([w]) => w);
}

// A LONG restatement shares several uncommon words. A SHORT one — a heading, a
// diagram node — cannot: "Model identity guarantee" has three words, so word
// overlap alone can never reach the threshold. Short claims are PHRASES, so also
// match on uncommon content-bigrams. Both real misses were bigram matches on
// "model identity"; the cross-document one was a word-overlap match.
export const bigrams = (t) => { const w = words(t); return w.slice(0, -1).map((x, i) => `${x} ${w[i + 1]}`); };

export function bigramFreq(corpus) {
  const df = new Map();
  for (const body of Object.values(corpus)) {
    for (const b of new Set(bigrams(body))) df.set(b, (df.get(b) || 0) + 1);
  }
  return df;
}

// Defaults tuned against the REAL failure, not a fixture: the tree state right
// after the first TEE fix, where three restatements of the corrected claim were
// still standing. At these values all three are found and the output is 17
// groups — reviewable. Looser values found them too but buried them in noise
// (the first attempt returned 1,854).
export function proseSurvivors(removedLines, corpus, minShared = 4, wordShare = 0.04, bigramShare = 0.02) {
  const df = docFreq(corpus);
  const bf = bigramFreq(corpus);
  const n = Object.keys(corpus).length;
  const rareBigram = (b) => { const f = bf.get(b) || 0; return f > 0 && f <= Math.max(2, Math.floor(n * bigramShare)); };
  const hits = [];
  for (const { file, text } of removedLines) {
    const sig = new Set(proseSignature(text, df, n, wordShare));
    const sigBi = new Set(bigrams(text).filter(rareBigram));
    if (sig.size < minShared && sigBi.size === 0) continue;
    for (const [f, body] of Object.entries(corpus)) {
      body.split('\n').forEach((l, i) => {
        const shared = [...new Set(words(l))].filter((w) => sig.has(w));
        const sharedBi = bigrams(l).filter((b) => sigBi.has(b));
        const byWords = sig.size >= minShared && shared.length >= Math.max(minShared, Math.ceil(sig.size * 0.3));
        if (byWords || sharedBi.length) {
          hits.push({ from: file, at: `${f}:${i + 1}`, shared: sharedBi.length ? sharedBi : shared,
                      how: sharedBi.length ? 'phrase' : 'words', line: l.trim().slice(0, 100) });
        }
      });
    }
  }
  return hits;
}

export function survivors(removedLines, corpus) {
  const hits = [];
  for (const { file, text } of removedLines) {
    for (const sig of signatures(text)) {
      for (const [f, body] of Object.entries(corpus)) {
        body.split('\n').forEach((l, i) => {
          if (!occurs(l, sig)) return;
          hits.push({ sig, from: file, at: `${f}:${i + 1}`, sameFile: f === file, line: l.trim().slice(0, 100) });
        });
      }
    }
  }
  return hits;
}

function selftest() {
  const cases = [];
  const corpus = {
    'docs/a.mdx': 'intro\nsession stake = pricePerSecond * sessionDuration\nend',
    'docs/b.mdx': '| Tied to stake | Yes (proportional limiter) | No |',
    'docs/c.mdx': 'nothing distinctive here at all',
  };
  const t = (label, removed, wantSome) => {
    const h = survivors(removed, corpus);
    cases.push([(h.length > 0) === wantSome, label, wantSome ? 'must fire' : 'must stay silent']);
  };
  // the real partial fixes
  t('formula surviving elsewhere on the page fires',
    [{ file: 'docs/a.mdx', text: '-escrow is pricePerSecond * sessionDuration' }], true);
  t('parenthesised qualifier surviving in a table fires',
    [{ file: 'docs/b.mdx', text: '-capped by a (proportional limiter) on rewards' }], true);
  // a fix that WAS applied everywhere must stay silent
  t('fully applied fix stays silent',
    [{ file: 'docs/c.mdx', text: '-the reward period is 30 days' }], false);
  // ordinary prose must not generate signatures at all
  cases.push([signatures('-this sentence is perfectly ordinary text').length === 0,
              'ordinary prose yields no signature', 'must stay silent']);
  // a number with a unit IS distinctive
  cases.push([signatures('-the period is 365 days').includes('365 days'),
              'a number with a unit is a signature', 'must fire']);

  // --- prose claims: the three real survivals this detector was blind to ---
  {
    const REMOVED = '- **Model identity** - The docker-compose.yaml declares which AI models are loaded. ' +
      'Because RTMR3 covers this file byte-for-byte, swapping, adding, or removing any model changes the hash and fails verification.';
    const corpus = {
      'a.mdx': 'DC --> MI[Model Identity Proven<br/>e.g. deepseek-r1:70b]',
      'b.mdx': '## Model identity guarantee',
      'c.md':  '- The exact set of loaded models is what the operator declared - swapping any model, port, or env var changes RTMR3 and fails verification.',
      'd.mdx': 'The proxy-router listens on port 8082 and forwards prompts to the provider.',
      'e.mdx': 'Consumers open a session by staking for a duration measured in seconds.',
      'f.mdx': 'Rating weights are tps, ttft, duration, success and stake.',
    };
    const hits = proseSurvivors([{ file: 'orig.mdx', text: REMOVED }], corpus);
    const where = new Set(hits.map((h) => h.at.split(':')[0]));
    cases.push([where.has('c.md'), 'restatement in ANOTHER document is found', 'must fire']);
    cases.push([where.has('a.mdx'), 'a diagram node restating the claim is found', 'must fire']);
    cases.push([where.has('b.mdx'), 'a section heading restating the claim is found', 'must fire']);
    cases.push([!where.has('d.mdx') && !where.has('e.mdx') && !where.has('f.mdx'),
                'unrelated prose is not swept in', 'must stay silent']);
    cases.push([proseSignature(REMOVED, docFreq(corpus), 6).length >= 3,
                'a prose claim yields a signature at all', 'must fire']);
  }

  // the dangerous false positive: a corrected value that CONTAINS the old one
  cases.push([!occurs('the floor is 10000000000000 wei', '10000000000'),
              'a corrected value containing the old one is not a survival', 'must stay silent']);
  cases.push([occurs('the floor is 10000000000 wei', '10000000000'),
              'the old value alone still fires', 'must fire']);

  let bad = 0;
  console.log('--- check-partial selftest ---');
  for (const [ok, label, want] of cases) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(48)} ${want}`); }
  console.log(bad ? `PARTIAL SELFTEST: FAIL (${bad}/${cases.length})`
                  : `PARTIAL SELFTEST: PASS (${cases.length}/${cases.length} — finds survivors, silent on clean fixes)`);
  return bad === 0;
}

const IS_MAIN = process.argv[1] && resolveFs(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1);

  const base = auditBase();
  const diff = execFileSync('git', ['diff', `${base}...HEAD`, '--', '*.md', '*.mdx'],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 128 << 20 });
  const removed = [];
  let file = null;
  for (const line of diff.split('\n')) {
    const m = /^--- a\/(.+)$/.exec(line);
    if (m) { file = m[1]; continue; }
    if (!file || file.startsWith('verify/')) continue;
    if (line.startsWith('-') && !line.startsWith('---')) removed.push({ file, text: line });
  }
  // The corpus normally comes from the working tree. --at <ref> builds it from a
  // commit instead, so this detector can be AIMED AT A PAST STATE and re-proven:
  //   --at 666ce3f5 --prose-range 666ce3f5~1..666ce3f5
  // must name tee-backend-verification.mdx:135 and :195 and
  // .ai-docs/TEE_Attestation_Architecture.md:780 — the three restatements that
  // survived that fix. A detector nobody can re-fire is a claim, not a gate.
  const ai = process.argv.indexOf('--at');
  const atRef = ai > -1 ? process.argv[ai + 1] : null;
  const corpus = {};
  if (atRef) {
    const names = execFileSync('git', ['ls-tree', '-r', '--name-only', atRef],
      { cwd: REPO, encoding: 'utf8', maxBuffer: 128 << 20 }).split('\n')
      .filter((f) => /\.(md|mdx)$/.test(f) && !f.startsWith('verify/'));
    for (const f of names) {
      try { corpus[f] = execFileSync('git', ['show', `${atRef}:${f}`],
        { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 }); } catch { /* gone */ }
    }
    console.log(`corpus             : ${atRef} (${Object.keys(corpus).length} docs)`);
  } else {
    for (const f of docFiles()) corpus[f] = read(f);
  }

  const hits = survivors(removed, corpus);
  // group by signature so one claim surviving in five places reads as one item
  const bySig = {};
  for (const h of hits) (bySig[`${h.from} :: ${h.sig}`] ||= []).push(h);

  console.log(`removed lines analysed : ${removed.length}`);
  console.log(`distinct survivors     : ${Object.keys(bySig).length}\n`);
  for (const [k, list] of Object.entries(bySig)) {
    const [from, sig] = k.split(' :: ');
    console.log(`  "${sig}"   (removed from ${from})`);
    for (const h of list.slice(0, 4)) console.log(`      still at ${h.at}${h.sameFile ? '  <-- SAME PAGE' : ''}: ${h.line}`);
    if (list.length > 4) console.log(`      … and ${list.length - 4} more`);
  }
  // --- prose claims: the class signatures() cannot see at all ---
  // Scoped to ONE fix, not the whole branch. Over 239 removed lines the signal
  // drowns (584 groups); over the last commit's it is a short list. This is a
  // per-fix check — run it after each fix, which is the habit that stops a claim
  // surviving under different wording.
  const pi = process.argv.indexOf('--prose-range');
  const prange = pi > -1 ? process.argv[pi + 1] : 'HEAD~1..HEAD';
  const pdiff = execFileSync('git', ['diff', prange, '--', '*.md', '*.mdx'],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 128 << 20 });
  const premoved = [];
  { let f = null;
    for (const line of pdiff.split('\n')) {
      const m = /^--- a\/(.+)$/.exec(line);
      if (m) { f = m[1]; continue; }
      if (!f || f.startsWith('verify/')) continue;
      if (line.startsWith('-') && !line.startsWith('---')) premoved.push({ file: f, text: line.slice(1) });
    } }
  console.log(`prose scope        : ${prange}  (${premoved.length} removed line(s))`);
  const pHits = proseSurvivors(premoved, corpus);
  const byClaim = {};
  for (const h of pHits) (byClaim[`${h.from} :: ${h.how} :: ${h.shared.slice(0, 3).join(' + ')}`] ||= []).push(h);
  const pKeys = Object.keys(byClaim);
  if (pKeys.length) {
    console.log('\n--- prose restatements (a claim can survive under different wording) ---\n');
    for (const k of pKeys) {
      const [from, how, sh] = k.split(' :: ');
      console.log(`  ${how}: "${sh}"   (from a line removed in ${from})`);
      for (const h of byClaim[k].slice(0, 3)) console.log(`      still at ${h.at}: ${h.line}`);
      if (byClaim[k].length > 3) console.log(`      … and ${byClaim[k].length - 3} more`);
    }
  }

  const total = Object.keys(bySig).length + pKeys.length;
  console.log(`\nPARTIAL: ${Object.keys(bySig).length} value candidate(s) + ${pKeys.length} prose candidate(s) — a candidate list, not a result. Check each.`);
}
