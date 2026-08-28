#!/usr/bin/env node
// docs-gates — the single place the documentation gates are defined.
//
// Three layers call THIS file: the pre-commit hook, the pre-push hook, and CI.
// One definition, because three copies drift and the weakest copy becomes the
// real gate. Adding a checker here arms all three at once.
//
//   node scripts/docs-gates.mjs             # every gate, against the working tree
//   node scripts/docs-gates.mjs --staged    # stageable gates, against the INDEX
//   node scripts/docs-gates.mjs --selftests # run each gate's own --selftest
//   node scripts/docs-gates.mjs --list
//
// Exit 0 = all passed. 1 = a gate failed. 2 = a gate could not RUN, which is not
// a pass: a checker that cannot execute has cleared nothing, and reading that as
// success is how a gate silently dies.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

// Per-gate fields:
//   needsHistory  — needs a diff base, so --staged cannot run it at all.
//   advisory      — reports, never blocks.
//   indexUnsafe   — cannot honestly be pointed at index content (reads the
//                   working tree or live git state). Named UNCHECKED in --staged
//                   output rather than silently run against the wrong content.
//   pipelineStage — declared here, not sniffed from stderr: this entry is a
//                   pipeline stage that exits 2 when invoked with no arguments.
//                   The ONLY way a gate is exempt from "exit 2 = broken".
const GATES = [
  { id: 'hygiene',      file: 'check-hygiene.mjs',     why: 'modules parse; no identity strings; no substitution scars' },
  { id: 'consistency',  file: 'check-consistency.mjs', why: 'no page disagrees with source or with itself' },
  { id: 'routes',       file: 'check-routes.mjs',      why: 'every documented API call resolves to a registered route' },
  { id: 'addresses',    file: 'check-addresses.mjs',   why: 'every documented config address is backed by a source file' },
  { id: 'claim-sweep',  file: 'check-claim-sweep.mjs', why: 'no unqualified claim in a tracked family', advisory: true },
  { id: 'mechanized',   file: 'check-mechanized.mjs',  why: 'documented defaults match compiled defaults' },
  { id: 'ctor-defaults', file: 'check-constructor-defaults.mjs', why: 'no doc states a sentinel as a default the constructor overrides' },
  { id: 'recurrence',   file: 'recurrence.mjs',        why: 'no corrected claim has crept back' },
  { id: 'dox',          file: 'check-dox.mjs',         why: 'nothing publishable ties this to a person or machine', needsHistory: true },
  { id: 'verify-fixes', file: 'verify-fixes.mjs',      why: 'every citation this branch added resolves', needsHistory: true },
  { id: 'partial',      file: 'check-partial.mjs',     why: 'a fix landed at the finding and nowhere else', needsHistory: true, advisory: true },
];

const staged = process.argv.includes('--staged');
if (process.argv.includes('--list')) {
  for (const g of GATES) console.log(`${g.id.padEnd(13)} ${g.file.padEnd(24)} ${g.why}`);
  process.exit(0);
}

// ---------------------------------------------------------------- selftests
// Every gate ships planted near-misses proving its detector returns BOTH
// answers, and until this flag existed no layer ran them: the runner invoked
// each gate with no arguments, and no CI job called them either. A detector
// that has only ever been observed passing is not known to fire.
if (process.argv.includes('--selftests')) {
  let bad = 0, none = 0;
  for (const g of GATES) {
    if (!existsSync(join(REPO, 'tools/docs-audit', g.file))) { bad++; console.log(`  MISSING  ${g.id}`); continue; }
    let code = 0, out = '';
    try {
      out = execFileSync(process.execPath, [join(REPO, 'tools/docs-audit', g.file), '--selftest'],
        { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
    } catch (e) { code = typeof e.status === 'number' ? e.status : 2; out = `${e.stdout || ''}${e.stderr || ''}`; }
    const sum = out.split('\n').filter((l) => /SELFTEST:/i.test(l)).slice(-1)[0]
      || out.split('\n').filter(Boolean).slice(-1)[0] || '';
    // Judged on the SELFTEST summary line, not on the exit code. A script that
    // does not implement --selftest ignores the flag and runs its normal body,
    // so its exit code reports the CORPUS; reading that as a selftest result
    // gives a green tick for a run that never tested the detector, and a red one
    // for a live finding. recurrence is exactly this case: no flag, but an
    // always-on guard selftest whose summary line is the thing to read.
    if (!/SELFTEST:/i.test(out)) {
      none++;
      console.log(`  NO-SELFTEST ${g.id.padEnd(11)} ${g.file} printed no SELFTEST line — its detector is unproven here (exit ${code})`);
      continue;
    }
    if (/SELFTEST:\s*FAIL/i.test(out)) { bad++; console.log(`  FAILED   ${g.id.padEnd(13)} ${sum.trim().slice(0, 90)}`); continue; }
    console.log(`  ok       ${g.id.padEnd(13)} ${sum.trim().slice(0, 90)}`);
  }
  if (none) console.error(`\n${none} gate(s) expose no --selftest — not proven, not disproven.`);
  if (bad) { console.error(`\nGATE-SELFTESTS: ${bad} failed.`); process.exit(1); }
  console.log('\nGATE-SELFTESTS: PASS');
  process.exit(0);
}

// ------------------------------------------------- staged mode reads the INDEX
// What `git commit` ships is the INDEX, so that is what a pre-commit gate has to
// read. This mode used to run the checkers against the WORKING TREE: stage a
// one-digit port change in a doc, revert the working tree, and the suite printed
// "consistency PASS / DOCS-GATES: PASS" while the index still held the defect.
// Every gate here reads files off disk, so the honest fix is to give them a disk
// that IS the index — `git checkout-index` into a scratch tree.
//
// The scratch tree's PARENT directory is deliberately named after the real
// repo's parent: check-hygiene derives one of its identity needles from
// basename(dirname(REPO)), so an arbitrarily-named scratch parent manufactures
// LEAK hits that are an artefact of the path, not a finding.
//
// If the tree cannot be built we stop at exit 2. Falling back to the working
// tree is the exact substitution this fixes, and a gate that quietly checks
// something else is worse than one that refuses.
function materializeIndex() {
  // realpath, not the raw mkdtemp path. On macOS TMPDIR is /var/folders/... which
  // is a symlink to /private/var/folders/...; node's ESM loader canonicalises
  // import.meta.url but not process.argv[1], so five gates whose entry guard is
  //   resolveFs(process.argv[1]) === fileURLToPath(import.meta.url)
  // decided they were not the main module, printed NOTHING and exited 0. That is
  // a silent all-clear from a gate that never ran — strictly worse than the bug
  // this mode fixes. (The empty-output check below is the belt to this braces.)
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'docs-gates-index-')));
  const tree = join(root, basename(dirname(REPO)) || 'repo-parent', basename(REPO) || 'repo');
  mkdirSync(tree, { recursive: true });
  execFileSync('git', ['checkout-index', '-a', '-f', `--prefix=${tree}/`],
    { cwd: REPO, stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  return { root, tree };
}

let stageRoot = null, RUN_ROOT = REPO;
const childEnv = { ...process.env };
if (staged) {
  try {
    const m = materializeIndex();
    stageRoot = m.root; RUN_ROOT = m.tree;
  } catch (e) {
    console.error(`docs-gates: could not materialise the index (${String(e.stderr || e.message).trim().split('\n')[0]}).`);
    console.error('DOCS-GATES: 1 gate(s) could not run — that is not a pass. Refusing to fall back to the working tree.');
    process.exit(2);
  }
  // git exports these to hooks. Left set, a checker running inside the scratch
  // tree would resolve `git ls-files` back to the real repo and its worktree —
  // reintroducing the mixture this mode exists to remove.
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX',
                   'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR', 'GIT_CONFIG_PARAMETERS']) delete childEnv[k];
}
const T = (n) => join(RUN_ROOT, 'tools/docs-audit', n);

// -------------------------------------------------- which line is the verdict
// "Last non-empty line" is not a verdict; it is whatever the gate happened to
// print last. recurrence prints its corpus result and THEN a guard selftest, so
// the operator's one line read "GUARD SELFTEST: PASS (fires on repeats …)" at
// the exact moment the corpus check HAD a finding — a sentence asserting the
// opposite of the result, sitting in the result's slot.
//
// Two rules, in order:
//   1. A line the gate MARKED as its verdict (`GATE-VERDICT: …`) wins; last one
//      if several. That is the deliberate signal and new gates should emit it.
//   2. Otherwise, the last non-empty line BEFORE any selftest banner. A selftest
//      proves the DETECTOR, never the corpus, so it can never be the verdict —
//      which disarms this for the next gate that appends one, not just for
//      recurrence.
const VERDICT_MARK = /^\s*GATE-VERDICT:\s*/;
const SELFTEST_BANNER = /^\s*-{2,}[^\n]*\bselftest\b[^\n]*-{2,}\s*$/i;

function readOut(out) {
  const all = out.split('\n');
  const cut = all.findIndex((l) => SELFTEST_BANNER.test(l));
  const body = cut > 0 ? all.slice(0, cut) : all;
  const selftest = cut > 0 ? all.slice(cut) : [];
  const marked = all.filter((l) => VERDICT_MARK.test(l));
  const tail = marked.length
    ? marked[marked.length - 1].replace(VERDICT_MARK, '').trim()
    : (body.map((l) => l.trimEnd()).filter(Boolean).slice(-1)[0] || '').trim();
  // Findings live in the body. A FAILING selftest is still worth surfacing, so
  // it is appended rather than hidden by the truncation.
  const excerpt = body.map((l) => l.trimEnd()).filter(Boolean).slice(-6)
    .concat(selftest.filter((l) => /SELFTEST:\s*FAIL/i.test(l)));
  return { tail, excerpt: excerpt.length ? excerpt : all.filter(Boolean).slice(-6) };
}

let failed = 0, broken = 0, ran = 0;
const lines = [];
try {
  for (const g of GATES) {
    if (staged && g.needsHistory) {
      lines.push(`  skipped  ${g.id.padEnd(13)} needs a diff base — NOT checked here; pre-push and CI run it`);
      continue;
    }
    if (staged && g.indexUnsafe) {
      lines.push(`  UNCHECKED ${g.id.padEnd(12)} cannot run against index content — this commit is NOT covered by it`);
      continue;
    }
    if (!existsSync(T(g.file))) { broken++; lines.push(`  MISSING  ${g.id} — ${g.file} not found`); continue; }
    let code = 0, out = '';
    try {
      out = execFileSync(process.execPath, [T(g.file)], { cwd: RUN_ROOT, env: childEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
    } catch (e) {
      code = typeof e.status === 'number' ? e.status : 2;
      out = `${e.stdout || ''}${e.stderr || ''}`;
    }
    ran++;
    const { tail, excerpt } = readOut(out);
    // Silence is not a pass. Every gate here reports; one that exits 0 having
    // printed nothing has either died before its main body or been invoked in a
    // way that skipped it, and both look exactly like success from the outside.
    if (!out.trim()) {
      broken++;
      lines.push(`  BROKEN   ${g.id.padEnd(13)} exit ${code} with NO output — a gate that says nothing has cleared nothing`);
      continue;
    }
    if (code === 0) { lines.push(`  ok       ${g.id.padEnd(13)} ${tail.slice(0, 76)}`); continue; }
    // Exit 2 = could not run. This used to be swallowed whenever the output
    // matched /usage:/i — reported "skipped (pipeline stage)" and counted as
    // neither failed nor broken, so the suite exited 0. A stub printing
    // "usage: …" plus "FATAL: cannot read config; 9 defects undetected" on
    // stderr passed the whole suite. Five scripts in tools/docs-audit already
    // use exactly `console.error('usage: …'); process.exit(2)` when they die,
    // so the first one promoted to a gate would have been swallowed. Exemption
    // is now a DECLARATION in the GATES table above, not a string sniffed out
    // of stderr at the moment of failure.
    if (code === 2 && !g.pipelineStage) {
      broken++;
      lines.push(`  BROKEN   ${g.id.padEnd(13)} exit 2 — could not run, so it has cleared nothing`);
      for (const l of excerpt) lines.push(`             ${l.slice(0, 100)}`);
      continue;
    }
    if (code === 2) { lines.push(`  skipped  ${g.id.padEnd(13)} (declared pipeline stage, not a standalone gate)`); continue; }
    if (g.advisory) { lines.push(`  ADVISORY ${g.id.padEnd(13)} ${tail.slice(0, 76)}`); continue; }
    failed++;
    // The headline carries the gate's VERDICT, not its `why`. `why` states the
    // property the gate exists to hold — printed next to FAILED it reads as an
    // assertion that the property holds, which is the same inversion as showing
    // a passing selftest in the verdict slot. `why` is available via --list.
    lines.push(`  FAILED   ${g.id.padEnd(13)} exit ${code} — ${tail ? tail.slice(0, 76) : `(no verdict line) ${g.why}`}`);
    for (const l of excerpt) lines.push(`             ${l.slice(0, 100)}`);
  }
} finally {
  if (stageRoot) { try { rmSync(stageRoot, { recursive: true, force: true }); } catch { /* scratch */ } }
}

console.log(`docs-gates: ${ran} gate(s)${staged ? ' (staged mode — index content, history gates skipped)' : ''}`);
console.log(lines.join('\n'));
if (broken) { console.error(`\nDOCS-GATES: ${broken} gate(s) could not run — that is not a pass.`); process.exit(2); }
if (failed) { console.error(`\nDOCS-GATES: BLOCKED — ${failed} gate(s) failed.`); process.exit(1); }
console.log('\nDOCS-GATES: PASS');
