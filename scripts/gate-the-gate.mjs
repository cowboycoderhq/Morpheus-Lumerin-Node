#!/usr/bin/env node
// gate-the-gate.mjs — standalone. Run by hand:
//   node scripts/gate-the-gate.mjs            (all three gates; exit 1 if any hole)
//   node scripts/gate-the-gate.mjs --quick     (skip the behaviour-diff runs)
//   node scripts/gate-the-gate.mjs --only=cite (one gate)
//   node scripts/gate-the-gate.mjs --list      (print the mutation table)
//
// WHAT THIS IS FOR
// ----------------
// A self-test that passes is not evidence. It is evidence only if it FAILS when
// the checker it guards is broken, and that has to be demonstrated rather than
// assumed: on this repository, six of eight sabotage mutations once went
// undetected by a suite reporting 17/17. So each mutation below deliberately
// breaks one thing in one gate, and the gate's own `--selftest` must go RED.
//
// THE DISTINCTION THAT MAKES THE RESULT HONEST
// --------------------------------------------
// A mutation that goes green is not automatically a hole. It might be INERT —
// removing a guard that is redundant with another, so no input reaches different
// output. Two of the mutations below are exactly that (see `inert: true`), and
// both were verified by re-running the mutated gate over the real tree and
// diffing byte-for-byte, not by arguing about the code. So this harness reports
// three states, not two:
//
//   RED    — the self-test caught it. What every mutation should do.
//   INERT  — self-test green AND the mutated gate produces byte-identical
//            output on the real tree. The guard is redundant; nothing is
//            unprotected. Marked in the table, and the harness re-checks the
//            claim rather than trusting the label.
//   HOLE   — self-test green and the output CHANGED. A real defect: the gate
//            can be broken with its own suite still reporting PASS.
//
// Exit 1 on any HOLE, or on any mutation whose search text is missing (a
// mutation that fails to apply is a silent pass and is treated as a failure of
// this harness, not as a success of the gate).

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..');
const QUICK = process.argv.includes('--quick');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

const SWEEP = 'check-sweep-preconditions.mjs';
const CITE = 'check-citation-reachability.mjs';
const FIG = 'check-figure-provenance.mjs';

// [gate, name, find, replace, opts]
const MUTATIONS = [
  // ---------------------------------------------------------------- sweep ----
  [SWEEP, 'walk: drop the UI extensions (the hole this extension closed)',
    '|go|jsx|tsx|ts|js)$/.test(p)', '|go)$/.test(p)'],
  [SWEEP, 'walk: drop only .js',
    '|go|jsx|tsx|ts|js)$/.test(p)', '|go|jsx|tsx|ts)$/.test(p)'],
  [SWEEP, 'SCAN_ROOTS: drop "ui-desktop"',
    "'verify', 'proxy-router/docs', 'smart-contracts/docs', 'ui-desktop',",
    "'verify', 'proxy-router/docs', 'smart-contracts/docs',"],
  [SWEEP, 'IS_SCANNED_UI: always false (rendered strings out of scope)',
    'const IS_SCANNED_UI = (rel) =>\n  /', 'const IS_SCANNED_UI = (rel) => false && (\n  /'],
  [SWEEP, 'DICTATES_ASSERTIONS: drop the ui-rendered tier',
    "  || baseKind(kind) === 'ui-rendered'\n", '  || false\n'],
  [SWEEP, 'IN_SCOPE: raise ui-comment to in-scope (collapse the two readers)',
    "|| (baseKind(kind) === 'ui-rendered' && IS_SCANNED_UI(rel));",
    "|| (['ui-rendered','ui-comment'].includes(baseKind(kind)) && IS_SCANNED_UI(rel));"],
  [SWEEP, 'jsxUnits: return nothing at all',
    'function jsxUnits(text) {', 'function jsxUnits(text) {\n  if (1) return [];'],
  [SWEEP, 'jsxOwnFrags: stop reading literals inside a children container',
    '          if (st.start >= i && st.end <= j && st.value.trim()) frags.push',
    '          if (false && st.start >= i && st.end <= j && st.value.trim()) frags.push'],
  [SWEEP, 'jsxTree: drop TAG_PREV_KEYWORD (`return <Foo>` stops being a tag)',
    '          && !TAG_PREV_KEYWORD.test(masked.slice(Math.max(0, k - 12), k + 1))', '          && !false'],
  [SWEEP, 'jsxMask: treat an apostrophe in JSX text as a string quote',
    "      if (k >= 0 && /[A-Za-z0-9_]/.test(text[k])) { i++; continue; }   // don't / it's",
    '      if (false) { i++; continue; }'],
  [SWEEP, 'jsxMask: stop recording JSX/block comments',
    "      comments.push({ start: i, end: j, value: text.slice(i + 2, j - 2), block: true });\n      blank(i, j); i = j; continue;\n    }\n    if (c === '\"' || c === \"'\") {",
    "      blank(i, j); i = j; continue;\n    }\n    if (c === '\"' || c === \"'\") {"],
  [SWEEP, 'classify: demand COND_WALLET of a UI string again',
    '    return !(any(COND_NODE, w) && (ui || any(COND_WALLET, w)));',
    '    return !(any(COND_NODE, w) && any(COND_WALLET, w));'],
  [SWEEP, 'scan: drop the fragment offset map (every finding names the wrong line)',
    '        if (su.frags && c.at && c.at.length) {', '        if (false && su.frags && c.at && c.at.length) {'],
  [SWEEP, 'cue: delete RETURN_TO_WALLET', "  ['RETURN_TO_WALLET',", "  ['RETURN_TO_WALLET_OFF', /(?!)x/], // ["],
  [SWEEP, 'cue: delete UNAIDED_RETURN', "  ['UNAIDED_RETURN',", "  ['UNAIDED_RETURN_OFF', /(?!)x/], // ["],

  // ----------------------------------------------------------------- cite ----
  [CITE, "SCAN_ROOTS: drop 'verify' (where every finding lives)",
    "const SCAN_ROOTS = ['docs', 'verify',", "const SCAN_ROOTS = ['docs',"],
  [CITE, 'IN_SCOPE: always false',
    'const IN_SCOPE = (rel) =>\n  (rel', 'const IN_SCOPE = (rel) => false && (\n  (rel'],
  [CITE, 'refsContaining: pretend everything is published',
    "  try { return git(root, ['for-each-ref',",
    "  if (space === 'refs/remotes') return ['refs/remotes/origin/main'];\n  try { return git(root, ['for-each-ref',"],
  [CITE, 'refsContaining: pretend nothing is published (fires on everything)',
    "  try { return git(root, ['for-each-ref',",
    "  if (space === 'refs/remotes') return [];\n  try { return git(root, ['for-each-ref',"],
  [CITE, 'objectType: nothing resolves (Class U silently empty)',
    "  try { return git(root, ['cat-file', '-t', tok]).trim(); } catch { return null; }", '  return null;'],
  [CITE, 'objectType: everything resolves (claim ids become commits)',
    "  try { return git(root, ['cat-file', '-t', tok]).trim(); } catch { return null; }", "  return 'commit';"],
  [CITE, 'DECLARED: never matches (Class B off)', 'const DECLARED = /(?:^|[^\\w])', 'const DECLARED = /(?!)(?:^|[^\\w])'],
  [CITE, 'DECLARED: always matches (every claim id becomes a broken citation)',
    'const DECLARED = /(?:^|[^\\w])', 'const DECLARED = /|(?:^|[^\\w])'],
  [CITE, 'FOREIGN: never matches (the upstream SHA is reported)', 'const FOREIGN = /\\bUpstream\\b', 'const FOREIGN = /(?!)\\bUpstream\\b'],
  [CITE, 'NOT_COMMIT: never matches (staged-diff hashes reported)', 'const NOT_COMMIT = /(?:staged diff', 'const NOT_COMMIT = /(?!)(?:staged diff'],
  [CITE, 'TOKEN: require 12+ hex (drops every short SHA)', 'const TOKEN = /`([0-9a-f]{7,40})`/g;', 'const TOKEN = /`([0-9a-f]{12,40})`/g;'],
  [CITE, 'walk: stop admitting .md', '  } else if (/\\.(mdx?|mdc)$/.test(p)) acc.push(p);', '  } else if (/\\.(mdc)$/.test(p)) acc.push(p);'],
  [CITE, 'reachability: accept refs/heads as published (a local branch is not publication)',
    '      if (rem.length) { info.push', '      const rem2 = rem.length ? rem : locals(c.tok);\n      if (rem2.length) { info.push'],
  [CITE, 'collapse the two Class U sub-shapes (wrong repair advice)',
    "        note: loc.length\n          ? `on local ref ${loc.join(', ')} only - one push from published`\n          : 'on NO ref at all - unreferenced, a garbage-collection candidate',",
    "        note: 'unpublished',"],
  [CITE, 'scan: never push a violation',
    "      violations.push({\n        ...rec, cls: 'UNPUBLISHED',", "      info.push({\n        ...rec, cls: 'UNPUBLISHED',"],

  // ------------------------------------------------------------------ fig ----
  [FIG, "SCAN_ROOTS: drop 'verify'", "const SCAN_ROOTS = ['verify',", 'const SCAN_ROOTS = ['],
  [FIG, 'IN_SCOPE: always false', 'const IN_SCOPE = (rel) => (rel', 'const IN_SCOPE = (rel) => false && (rel'],
  [FIG, 'maskCode: stop blanking backticks (evidence becomes claims)', "    if (text[i] === '`') {", '    if (false) {'],
  [FIG, 'classify: report nothing', 'function classify(body) {', 'function classify(body) {\n  if (1) return [];'],
  [FIG, 'PROVENANCE: never discharges (an honest document becomes a wall)',
    '    const proof = PROVENANCE.filter(([, re]) => re.test(win)).map(([n]) => n);', '    const proof = [];'],
  [FIG, 'PROVENANCE: always discharges (nothing is ever reported)',
    '    const proof = PROVENANCE.filter(([, re]) => re.test(win)).map(([n]) => n);', "    const proof = ['CITATION'];"],
  [FIG, 'NON_FIGURE: drop the whole exclusion list',
    'function maskedRanges(text) {\n  const bad = [];', 'function maskedRanges(text) {\n  const bad = []; if (1) return bad;'],
  [FIG, 'FIGURES: drop RATIO', "  ['RATIO',    new RegExp(String.raw`(?<!", "  ['RATIO_OFF',    new RegExp(String.raw`(?!)(?<!"],
  [FIG, 'FIGURES: drop PERCENT', "  ['PERCENT',  new RegExp(String.raw`${NUM}\\s*%`, 'g')],", "  ['PERCENT',  new RegExp(String.raw`(?!)${NUM}\\s*%`, 'g')],"],
  [FIG, 'FIGURES: drop COUNTED', "  ['COUNTED',  new RegExp(String.raw`${NUM}", "  ['COUNTED',  new RegExp(String.raw`(?!)${NUM}"],
  [FIG, 'DURATION: drop the measurement-context requirement (constants flood back)',
    "    if (h.name === 'DURATION' && !MEASURED_CTX.test(win)) continue;", '    if (false) continue;'],
  [FIG, 'NUM: allow entering a number halfway (10,219 -> "219 lines")',
    '(?<![\\w,.])\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?', '\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?'],
  [FIG, 'INT: allow a digit inside an identifier (S1 finding -> "1 finding")',
    '(?<![\\w,.])\\d{1,3}(?:,\\d{3})*(?![.\\d])', '(?<![,.])\\d{1,3}(?:,\\d{3})*(?![.\\d])'],
  [FIG, 'ratio-suppression: report a rate beside its own ratio again',
    "    if (h.name === 'PERCENT' && hits.some((o) => o.name === 'RATIO'",
    "    if (false && h.name === 'PERCENT' && hits.some((o) => o.name === 'RATIO'"],
  [FIG, 'window: let provenance discharge from anywhere in the unit',
    'function windowAt(body, idx) {\n  if (body.length <= CLAIM_WINDOW) return body;', 'function windowAt(body, idx) {\n  return body;'],
  [FIG, 'walk: stop admitting .md', '  } else if (/\\.mdx?$/.test(p)) acc.push(p);', '  } else if (/\\.mdc$/.test(p)) acc.push(p);'],
  // --- the two verified-inert ones. Kept in the table ON PURPOSE: an inert
  // guard silently becoming load-bearing (or a redundant one being relied on)
  // is exactly the drift nobody notices, and the harness re-derives the label
  // every run instead of taking the comment's word for it.
  [FIG, 'units: stop skipping code fences (redundant with maskCode)',
    "      if (u.kind === 'code' || u.kind === 'heading') continue;", "      if (u.kind === 'heading') continue;",
    { inert: 'maskCode already blanks a fenced block whole; the unit-kind skip is belt and braces' }],
  [FIG, 'maskCode: pair single backticks only (fences still pair up)',
    "      let ticks = 0; while (text[i + ticks] === '`') ticks++;", '      let ticks = 1;',
    { inert: 'the fence delimiters still pair with each other, so the body is blanked either way' }],
];

function run(script, args) {
  const r = spawnSync(process.execPath, [script, `--root=${ROOT}`, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

if (process.argv.includes('--list')) {
  for (const [gate, name] of MUTATIONS) console.log(`${gate.padEnd(34)} ${name}`);
  process.exit(0);
}

const gates = [...new Set(MUTATIONS.map((m) => m[0]))].filter((g) => !ONLY || g.includes(ONLY));
const dir = mkdtempSync(join(tmpdir(), 'gate-the-gate-'));
let holes = 0, unapplied = 0, red = 0, inert = 0, unmeasurable = 0;
try {
  for (const gate of gates) {
    const src = readFileSync(join(HERE, gate), 'utf8');
    console.log(`\n=== ${gate} ===`);
    // CONTROL. Without this the whole run is meaningless: a self-test that is
    // already red would report every mutation as "caught".
    const ctlSelf = run(join(HERE, gate), ['--selftest']);
    if (ctlSelf.code !== 0) {
      // NOT a hole: a hole means a mutation escaped, and none of this
      // gate's mutations ran at all. Counted apart so the caught total is
      // never read as a denominator it is not.
      const unrun = MUTATIONS.filter(([g]) => g === gate).length;
      console.log(`  UNMEASURABLE: --selftest is not green before any`
              + ` mutation, so ${unrun} mutation(s) were never run`);
      unmeasurable += unrun; continue;
    }
    const ctlScan = QUICK ? null : run(join(HERE, gate), []);
    console.log(`  control: --selftest exit 0${ctlScan ? `, scan exit ${ctlScan.code}` : ''}`);

    for (const [g, name, find, replace, opts] of MUTATIONS) {
      if (g !== gate) continue;
      if (!src.includes(find)) {
        console.log(`  UNAPPLIED  ${name}\n             search text not found - this mutation tested nothing`);
        unapplied++; continue;
      }
      const path = join(dir, `mut-${gate}`);
      writeFileSync(path, src.replace(find, replace));
      const self = run(path, ['--selftest']);
      if (self.code !== 0) { console.log(`  RED        ${name}`); red++; continue; }
      const scan = QUICK ? null : run(path, []);
      const changed = scan && ctlScan && (scan.out !== ctlScan.out || scan.code !== ctlScan.code);
      if (QUICK) { console.log(`  GREEN?     ${name}\n             (--quick: cannot tell INERT from HOLE without the behaviour diff)`); holes++; continue; }
      if (!changed) {
        console.log(`  INERT      ${name}\n             self-test green AND byte-identical output on the real tree${opts?.inert ? ` - ${opts.inert}` : ' - UNLABELLED, so check whether the guard is really redundant'}`);
        inert++;
        if (!opts?.inert) holes++;   // an unlabelled inert mutation is a claim nobody has checked
        continue;
      }
      console.log(`  HOLE       ${name}\n             self-test GREEN but the gate's output CHANGED - it can be broken with its suite still passing`);
      holes++;
    }
  }
} finally { rmSync(dir, { recursive: true, force: true }); }

console.log(`\n${red} caught, ${inert} verified-inert, ${holes} hole(s), `
          + `${unapplied} unapplied, ${unmeasurable} unmeasurable`);
if (unmeasurable) {
  console.log(`  ${unmeasurable} mutation(s) could not be run here,`
            + ` so ${red} caught is a TRUNCATED count, not a score.`);
}
console.log(holes || unapplied || unmeasurable ? 'FAIL' : 'PASS');
process.exit(holes || unapplied || unmeasurable ? 1 : 0);
