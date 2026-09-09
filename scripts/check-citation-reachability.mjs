#!/usr/bin/env node
// check-citation-reachability.mjs — standalone. Run by hand:
//   node scripts/check-citation-reachability.mjs            (repo root; exit 1 on violations, 2 could-not-run)
//   node scripts/check-citation-reachability.mjs --info      (also list every token it decided was NOT a citation)
//   node scripts/check-citation-reachability.mjs --selftest  (gate the gate; builds its own git repo, corpus-independent)
//
// WHAT IT CHECKS
// -------------
// A commit SHA in documentation is a POINTER, and a pointer is only worth what
// the reader can do with it. Two ways it can be worthless, and the gate reports
// them as separate classes because the repair is different:
//
//   Class U — UNPUBLISHED. `git cat-file -t <sha>` says `commit` here, and
//   `git for-each-ref --contains <sha> refs/remotes` returns NOTHING. The
//   citation resolves in the author's clone and in no one else's: every other
//   reader gets `fatal: bad object`. This is the failure mode that cannot be
//   found by reading, cannot be found by testing the citation in the clone that
//   wrote it, and gets WORSE with time — an unpublished commit that is also
//   unreferenced locally is a garbage-collection candidate, so the citation can
//   stop resolving for the author too. Repair: push the branch, or re-cite
//   something published.
//
//   Class B — BROKEN. The text names the token as a commit and it does not
//   resolve here at all. Already broken for everyone including the author.
//   Repair: correct the SHA, or say which repository it is in.
//
// THE DISCRIMINATOR, AND WHY IT IS NOT A LIST OF EXCEPTIONS
// --------------------------------------------------------
// A hand sweep, made when this was written, found most backticked hex tokens were
// not commits at all. Most non-resolvers are legitimately something else, and
// a gate that flagged them would be a gate people learn to wave through:
//
//   * 12-hex CLAIM IDS (in an audit record) — row identifiers in an audit table.
//   * STAGED-DIFF hashes (in an audit record) — the hash of a staged
//     tree, which was never a commit and never will be.
//   * WEI amounts and unix timestamps — `300000000000000000`, `1787872961`.
//   * one UPSTREAM sha from a different repository entirely.
//
// The temptation is a list of exclusions, one per shape. That list is wrong the
// day someone invents a sixth shape. So the rule is stated positively instead:
//
//   A hex token is a CITATION OF A COMMIT IN THIS REPOSITORY iff it either
//     (P1) RESOLVES to a commit object here — git's own answer, which no
//          wording can fake and no new shape can evade; or
//     (P2) is DECLARED one by the words immediately before it — `commit X`,
//          `@ X`, `reverted by X`, `Base: X`, `landed in X`;
//   and is not excluded by an explicit
//     (N1) FOREIGN marker on the line (`Upstream:`, another owner/repo slug), or
//     (N2) NON-COMMIT marker immediately before it (`staged diff X`).
//
// Every one of the four shapes above falls out of P1/P2 without being named:
// a claim ID neither resolves nor is introduced by a commit word, so it is
// silently INFO. Measured when this was written: the only token P2 admitted that P1 did
// not was a genuine broken citation, and P2 produced zero false positives
// across that corpus. Run the gate for the current figures rather than
// trusting these.
//
// P1 does the load-bearing work and P2 is deliberately the smaller half, because
// P2 is lexical and lexical rules leak. The known leak is stated rather than
// papered over: a broken SHA introduced by no commit word at all — a bare table
// cell, or a sentence-initial `` `a541fc10` and flipped at ... `` — is invisible
// to this gate. It cannot be otherwise: at that point the token is
// indistinguishable from a claim ID by any means short of asking the author.
//
// WHY refs/remotes AND NOT refs/tags OR refs/heads
// -----------------------------------------------
// `refs/remotes/**` is the local clone's record of what the REMOTE has. A local
// branch proves only that this machine has the commit; a local tag proves only
// that this machine has the tag, and a tag that was never pushed publishes
// nothing. Both are reported alongside a Class U finding because they change the
// REPAIR (a commit still on a local branch is one `git push` from fixed; a
// commit on no ref at all is a gc candidate and may need rewriting), but neither
// discharges the finding. Run the gate for the
// current split rather than trusting a count recorded here.
//
// WHY THE EVIDENCE ROOT IS IN SCOPE HERE AND OUT OF SCOPE IN check-sweep-preconditions
// ---------------------------------------------------------------------------
// That checker excludes `verify/**` because an audit record correctly QUOTES
// wording that was true at a past commit — fidelity to the past is the point,
// and flagging it would punish the file for doing its job. A SHA citation is the
// opposite kind of thing. Its truth does not decay with time, it decays with
// PUBLICATION, and an audit record's entire value is that a reader can run
// `git show` on what it cites. So `verify/**` is not merely in scope here, it is
// where such citations concentrate. Run the
// gate for the current distribution.
//
// KNOWN BLIND SPOTS
//   * NON-BACKTICKED SHAs. Only `` `hex` `` is read. Measured before accepting:
//     the bare 8-hex tokens then in scope, none of which resolved as
//     commits, so the omission cost nothing in that corpus and would cost something in another.
//   * SOURCE COMMENTS. Scope is documentation; a SHA pinned in a .mjs comment is
//     not read. `scripts/check-sweep-preconditions.mjs` pins fixtures to
//     `165945e4` and `60b7535d` and its own header says they become unreadable
//     when the branch is deleted — the same defect class, one file type out.
//   * A CORRECT-BUT-STALE citation. A SHA that resolves and is published still
//     might not say what the sentence claims. Nothing here reads the diff.
//   * `--contains` answers about THIS clone's refs. A commit published to a
//     remote this clone has not fetched reads as unpublished. Run after a fetch.

import { readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv.find((a) => a.startsWith('--root='))?.slice(7)
  ?? join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SHOW_INFO = process.argv.includes('--info');

// ---------------------------------------------------------------- scope ----
// Documentation a reader reads and cites. Same shape as the sweep checker's
// SCAN_ROOTS so the two gates cover the same surface, plus the evidence root for the
// reason given in the header.
const SINGLE_FILE_ROOTS = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md'];
const SCAN_ROOTS = ['docs', 'verify', 'smart-contracts/docs', '.cursor', ...SINGLE_FILE_ROOTS];
const IN_SCOPE = (rel) =>
  (rel.startsWith(`docs${sep}`) && /\.mdx?$/.test(rel))
  || (rel.startsWith(`verify${sep}`) && /\.mdx?$/.test(rel))
  || rel.startsWith(`smart-contracts${sep}docs${sep}`)
  || rel.startsWith(`.cursor${sep}rules${sep}`)
  || SINGLE_FILE_ROOTS.includes(rel);

// ------------------------------------------------------------- matchers ----
// The token shape. 7 is git's shortest default abbreviation; 40 is a full SHA-1.
const TOKEN = /`([0-9a-f]{7,40})`/g;

// P2 — DECLARED. What sits immediately before the opening backtick. Closed list,
// anchored at the end so it is the LAST thing before the token: the audit files
// put a claim ID and a commit on one line
// (`### 1. \`c0ffeec0ffee\` — "..." (S3, commit \`d0cd0cd0\`)`), so a same-line
// search for the word "commit" marks both and a proximity window marks the wrong
// one. Only adjacency separates them.
const DECLARED = /(?:^|[^\w])(?:commits?|Commits?|SHAs?|shas?|rev|revision|HEAD|[Bb]ase|tip|reverted by|reverted in|landed in|landed at|cherry-picked (?:in|as|to|from)|merged? (?:in|at|as)|pinned to|@)\s*[:*(\s]*$/;

// N1 — FOREIGN. The line says the SHA belongs to another repository, so it is
// not expected to resolve here and reporting it would be reporting a fact about
// a repo this gate cannot see.
const FOREIGN = /\bUpstream\b|\bupstream (?:repo|repository|commit)\b|\b[\w.-]+\/[\w.-]+\b\s*`?\s*@|different repository|another repository/;

// N2 — NOT A COMMIT OBJECT. `staged diff \`<hash>\`` is the hash of a staged
// tree; it was never a commit, so "does not resolve" is the correct state and a
// finding would be noise. Anchored the same way DECLARED is.
const NOT_COMMIT = /(?:staged diff|staged tree|tree|blob|claim(?: id)?|id)\s*[:*(\s]*$/i;

// ------------------------------------------------------------------ git ----
// One place shells out, so the self-test drives the same code the scan does and
// a git failure is COULD-NOT-RUN rather than a silent clean report.
function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });
}
function objectType(root, tok) {
  try { return git(root, ['cat-file', '-t', tok]).trim(); } catch { return null; }
}
function refsContaining(root, sha, space) {
  try { return git(root, ['for-each-ref', '--contains', sha, '--format=%(refname)', '--count=4', space]).trim().split('\n').filter(Boolean); }
  catch { return []; }
}

// ---------------------------------------------------------------- files ----
function walk(p, acc) {
  let st; try { st = statSync(p); } catch { return acc; }
  if (st.isDirectory()) {
    if (/(^|[/\\])(node_modules|\.git|dist|build|out)$/.test(p)) return acc;
    for (const e of readdirSync(p)) walk(join(p, e), acc);
  } else if (/\.(mdx?|mdc)$/.test(p)) acc.push(p);
  return acc;
}

// ----------------------------------------------------------------- scan ----
// The whole pipeline as ONE callable, so the self-test can run the real thing
// against a git repository it builds itself. There is no second code path.
function scan(root) {
  const files = [];
  for (const r of SCAN_ROOTS) walk(join(root, r), files);
  files.sort();

  const cites = [];                       // every token, classified
  let scanned = 0, scannedInScope = 0;
  for (const abs of files) {
    const rel = relative(root, abs);
    let text; try { text = readFileSync(abs, 'utf8'); } catch { continue; }
    scanned++;
    if (!IN_SCOPE(rel)) continue;
    scannedInScope++;
    text.split('\n').forEach((line, i) => {
      let m; TOKEN.lastIndex = 0;
      while ((m = TOKEN.exec(line)) !== null) {
        const pre = line.slice(0, m.index);
        cites.push({ file: rel, line: i + 1, tok: m[1], pre, full: line });
      }
    });
  }

  // Resolve each distinct token once.
  const types = new Map();
  for (const t of new Set(cites.map((c) => c.tok))) types.set(t, objectType(root, t));
  const remoteCache = new Map(), localCache = new Map();
  const remotes = (sha) => {
    if (!remoteCache.has(sha)) remoteCache.set(sha, refsContaining(root, sha, 'refs/remotes'));
    return remoteCache.get(sha);
  };
  const locals = (sha) => {
    if (!localCache.has(sha)) localCache.set(sha, [...refsContaining(root, sha, 'refs/heads'), ...refsContaining(root, sha, 'refs/tags')]);
    return localCache.get(sha);
  };

  const violations = [], info = [];
  for (const c of cites) {
    const resolves = types.get(c.tok) === 'commit';
    const declared = DECLARED.test(c.pre);
    const foreign = FOREIGN.test(c.full);
    const notCommit = NOT_COMMIT.test(c.pre);
    const rec = { ...c, resolves, declared };

    if (foreign) { info.push({ ...rec, cls: 'FOREIGN', why: 'the line says this SHA is in another repository; it is not expected to resolve here' }); continue; }
    if (notCommit) { info.push({ ...rec, cls: 'NOT-A-COMMIT', why: 'introduced as a staged diff / tree / claim id, which was never a commit object' }); continue; }

    if (resolves) {
      const rem = remotes(c.tok);
      if (rem.length) { info.push({ ...rec, cls: 'PUBLISHED', why: `reachable from ${rem[0]}` }); continue; }
      const loc = locals(c.tok);
      violations.push({
        ...rec, cls: 'UNPUBLISHED',
        note: loc.length
          ? `on local ref ${loc.join(', ')} only - one push from published`
          : 'on NO ref at all - unreferenced, a garbage-collection candidate',
      });
      continue;
    }
    if (declared) {
      violations.push({ ...rec, cls: 'BROKEN', note: 'named as a commit and does not resolve in this repository' });
      continue;
    }
    info.push({ ...rec, cls: 'NOT-A-CITATION', why: 'hex-shaped, but it neither resolves as a commit here nor is introduced as one (claim id, staged hash, wei amount, timestamp)' });
  }
  return { violations, info, cites, scanned, scannedInScope, files };
}

// ------------------------------------------------------------ self-test ----
// The gate's answer is a function of GIT STATE, not of text, so a self-test that
// only fed it strings would pass against a checker that never ran git. It builds
// a real repository with a real remote instead, and drives scan() end to end:
// walk -> IN_SCOPE -> TOKEN -> P1/P2/N1/N2 -> for-each-ref. Every mutation that
// disables a stage makes an expected finding vanish from this fixture repo.
// The fixture repository is isolated from the machine it runs on: its own
// identity, no signing, a fixed default branch, and core.hooksPath aimed at an
// empty directory. That last one is not `--no-verify` on anything real -- it
// stops any globally configured commit hook from
// deciding whether a THROWAWAY fixture may be built. A self-test that passes on
// one developer's machine and cannot run on another's is not a gate.
const FIXTURE_GIT = (hooks) => ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
  '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', '-c', `core.hooksPath=${hooks}`];
function shell(dir, hooks, args) {
  return execFileSync('git', [...FIXTURE_GIT(hooks), ...args],
    { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function buildFixtureRepo() {
  const base = mkdtempSync(join(tmpdir(), 'cite-selftest-'));
  const bare = join(base, 'remote.git');
  const work = join(base, 'work');
  const hooks = join(base, 'nohooks');
  mkdirSync(bare); mkdirSync(work); mkdirSync(hooks);
  const sh = (dir, args) => shell(dir, hooks, args);
  sh(bare, ['init', '--bare', '--quiet']);
  sh(work, ['init', '--quiet']);
  sh(work, ['remote', 'add', 'origin', bare]);

  const put = (rel, body) => {
    const abs = join(work, rel);
    mkdirSync(abs.slice(0, abs.lastIndexOf(sep)), { recursive: true });
    writeFileSync(abs, body);
  };

  // 1. a PUBLISHED commit
  put('README.md', 'seed\n');
  sh(work, ['add', '-A']); sh(work, ['commit', '-q', '-m', 'seed']);
  const published = sh(work, ['rev-parse', '--short=8', 'HEAD']).trim();
  sh(work, ['push', '-q', 'origin', 'HEAD:refs/heads/main']);
  sh(work, ['fetch', '-q', 'origin']);

  // 2. an UNPUBLISHED commit that is still on a local branch
  put('docs/a.md', 'x\n');
  sh(work, ['add', '-A']); sh(work, ['commit', '-q', '-m', 'local only']);
  const unpubOnBranch = sh(work, ['rev-parse', '--short=8', 'HEAD']).trim();

  // 3. an UNPUBLISHED commit on NO ref at all: commit, record it, reset away
  put('docs/b.md', 'y\n');
  sh(work, ['add', '-A']); sh(work, ['commit', '-q', '-m', 'dangling']);
  const dangling = sh(work, ['rev-parse', '--short=8', 'HEAD']).trim();
  sh(work, ['reset', '-q', '--hard', 'HEAD~1']);

  // 4. a SHA that does not exist here at all
  const missing = 'deadbee1';

  put('README.md', 'seed\n');
  put(`verify${sep}fx-audit.md`, [
    '# Fixture audit',
    '',
    `Published anchor: \`${published}\`.`,
    `Fix landed in \`${unpubOnBranch}\`.`,
    `Reverted by \`${dangling}\`.`,
    `Base: \`${missing}\`.`,
    '',
    '| id | class | why |',
    '|---|---|---|',
    '| `c0ffeec0ffee` | `doc-only` | a 12-hex claim id: neither resolves nor is declared |',
    '',
    'Branch `fx` (off `main`) · staged diff `1a2b3c4d` · 2026-08-31',
    '',
    'Upstream: `someone/other-repo`, commit `592e434619ab4b3c90cb3adec0861e0984027ada`',
    '',
    'A floor of `300000000000000000` wei/sec at `1787872961`.',
    '',
  ].join('\n'));

  // out of scope: same defects, must never produce a violation
  put(`proxy-router${sep}notes.md`, `Fix landed in \`${unpubOnBranch}\`.\n`);
  return { base, work, published, unpubOnBranch, dangling, missing };
}

function legPipeline(fail) {
  const fx = buildFixtureRepo();
  try {
    const r = scan(fx.work);
    if (r.scanned === 0) fail('pipeline: scan() read 0 files - the walk or SCAN_ROOTS is broken');
    if (r.scannedInScope === 0) fail('pipeline: 0 files judged in scope - IN_SCOPE is broken');
    if (!r.cites.length) fail('pipeline: TOKEN matched nothing - no hex token was even seen');

    const at = (cls) => r.violations.filter((v) => v.cls === cls).map((v) => v.tok);
    const infoOf = (tok) => r.info.find((v) => v.tok === tok);

    // Class U, both sub-shapes. Asserted separately so the failure says which.
    if (!at('UNPUBLISHED').includes(fx.unpubOnBranch)) {
      fail('pipeline: a commit that exists locally and on no REMOTE ref was not reported - the refs/remotes query, the resolve step or the scope filter is broken');
    }
    if (!at('UNPUBLISHED').includes(fx.dangling)) {
      fail('pipeline: a commit on NO ref at all was not reported - Class U is off');
    }
    const dang = r.violations.find((v) => v.tok === fx.dangling);
    if (dang && !/NO ref at all/.test(dang.note)) {
      fail(`pipeline: the unreferenced commit was not distinguished from the local-branch one (note: ${dang.note}) - the repair advice is wrong`);
    }
    const onbr = r.violations.find((v) => v.tok === fx.unpubOnBranch);
    if (onbr && !/local ref/.test(onbr.note)) {
      fail(`pipeline: the local-branch commit was not distinguished from the unreferenced one (note: ${onbr.note})`);
    }
    // Class B
    if (!at('BROKEN').includes(fx.missing)) {
      fail('pipeline: a SHA declared a commit that does not resolve was not reported - P2 (DECLARED) is off');
    }
    // published must be clean
    if (r.violations.some((v) => v.tok === fx.published)) {
      fail('pipeline: a PUBLISHED commit was reported - the refs/remotes query answers "no" for everything, so every citation is a violation and the gate is noise');
    }
    if (infoOf(fx.published)?.cls !== 'PUBLISHED') fail('pipeline: the published commit produced no PUBLISHED record - it was never resolved');

    // the four shapes that must NOT cry wolf
    for (const [tok, want] of [['c0ffeec0ffee', 'NOT-A-CITATION'], ['1a2b3c4d', 'NOT-A-COMMIT'],
                               ['592e434619ab4b3c90cb3adec0861e0984027ada', 'FOREIGN'],
                               ['300000000000000000', 'NOT-A-CITATION'], ['1787872961', 'NOT-A-CITATION']]) {
      if (r.violations.some((v) => v.tok === tok)) fail(`pipeline: FALSE POSITIVE on ${tok} - it should be ${want}`);
      const got = infoOf(tok);
      if (!got) fail(`pipeline: ${tok} produced no record at all - the token regex no longer sees it, so the "no false positive" assertion above is vacuous`);
      else if (got.cls !== want) fail(`pipeline: ${tok} classified ${got.cls}, want ${want}`);
    }
    // scope really is a filter
    if (r.violations.some((v) => v.file.startsWith('proxy-router'))) fail('pipeline: an out-of-scope file produced a VIOLATION');
    return r.violations.length;
  } finally { rmSync(fx.base, { recursive: true, force: true }); }
}

// Leg 2 — WIRING. Cheap structural assertions that bite the same mutations a
// second way and stay true whatever the corpus does.
function legWiring(fail) {
  for (const r of ['docs', 'verify', 'smart-contracts/docs']) {
    if (!SCAN_ROOTS.includes(r)) fail(`wiring: SCAN_ROOTS no longer contains "${r}"`);
  }
  for (const r of SINGLE_FILE_ROOTS) if (!SCAN_ROOTS.includes(r)) fail(`wiring: SCAN_ROOTS lost the single-file root "${r}"`);
  if (!IN_SCOPE(join('verify', 'report-b.md'))) {
    fail('wiring: verify/** is out of scope - but the filter must still admit one or the gate narrows silently');
  }
  if (!IN_SCOPE(join('docs', 'ai', 'where-is-my-mor.mdx'))) fail('wiring: a docs page is out of scope');
  if (IN_SCOPE(join('proxy-router', 'docs', 'x.md'))) fail('wiring: the scope filter inverted');

  // the token regex
  const grab = (s) => { const out = []; let m; TOKEN.lastIndex = 0; while ((m = TOKEN.exec(s)) !== null) out.push(m[1]); return out; };
  if (grab('see `fee1dead` and `592e434619ab4b3c90cb3adec0861e0984027ada`').length !== 2) fail('wiring: TOKEN no longer matches both a short and a full SHA');
  if (grab('`abcdef` short').length) fail('wiring: TOKEN matches a 6-hex token - below git\'s shortest abbreviation');
  if (grab('fee1dead unbackticked').length) fail('wiring: TOKEN matches an unbackticked token - the measured scope was backticks only');

  // P2 adjacency: the audit files put a claim id and a commit on ONE line, so a
  // proximity rule marks the wrong one. Only the LAST word before the token counts.
  if (!DECLARED.test('a fix landed in ')) fail('wiring: DECLARED no longer fires on "landed in"');
  if (!DECLARED.test('off `topic` @ ')) fail('wiring: DECLARED no longer fires on "@"');
  if (!DECLARED.test('**Base:** ')) fail('wiring: DECLARED no longer fires on a bolded "Base:"');
  if (DECLARED.test('### 1. ')) fail('wiring: DECLARED fires on a bare heading - every claim id becomes a broken citation');
  if (DECLARED.test('(S3, commit `d0cd0cd0`) and also ')) {
    fail('wiring: DECLARED is matching a commit word that is NOT adjacent - the claim id on the same line will be reported as a broken commit');
  }
  // N1 / N2
  if (!FOREIGN.test('Upstream: `scrtlabs/secretvm-verify`, commit `592e4346`')) fail('wiring: FOREIGN no longer recognises an upstream citation');
  if (FOREIGN.test('Fix landed in `fee1dead`.')) fail('wiring: FOREIGN fires on an ordinary citation - every finding is suppressed');
  if (!NOT_COMMIT.test('· staged diff ')) fail('wiring: NOT_COMMIT no longer recognises a staged-diff hash');
  if (NOT_COMMIT.test('a fix landed in ')) fail('wiring: NOT_COMMIT fires on an ordinary citation');

  // the walk
  const probe = mkdtempSync(join(tmpdir(), 'cite-ext-'));
  try {
    mkdirSync(join(probe, 'docs'), { recursive: true });
    for (const n of ['a.mdx', 'b.md', 'c.mdc']) writeFileSync(join(probe, 'docs', n), 'x\n');
    writeFileSync(join(probe, 'docs', 'd.png'), 'x\n');
    const found = walk(join(probe, 'docs'), []).map((p) => p.slice(p.lastIndexOf(sep) + 1)).sort();
    for (const n of ['a.mdx', 'b.md', 'c.mdc']) if (!found.includes(n)) fail(`wiring: walk() no longer picks up ${n}`);
    if (found.includes('d.png')) fail('wiring: walk() is picking up binaries');
  } finally { rmSync(probe, { recursive: true, force: true }); }

  // git really is being asked, and the answer really is about refs/remotes.
  // The probe builds its OWN one-commit repository: asking the ambient tree
  // makes a self-test that claims to be corpus-independent fail wherever the
  // corpus is an export rather than a clone, and an unrunnable check is not
  // the same finding as a check that ran and passed.
  const gprobe = mkdtempSync(join(tmpdir(), 'cite-wiring-'));
  try {
    const ghooks = join(gprobe, 'nohooks');
    mkdirSync(ghooks, { recursive: true });
    shell(gprobe, ghooks, ['init', '--quiet']);
    writeFileSync(join(gprobe, 'seed.md'), 'x\n');
    shell(gprobe, ghooks, ['add', '-A']);
    shell(gprobe, ghooks, ['commit', '-q', '-m', 'wiring']);
    const t = objectType(gprobe, 'HEAD');
    if (t !== 'commit') fail(`wiring: objectType(HEAD) returned ${t} - the gate is not talking to git`);
  } catch (e) { fail(`wiring: objectType threw (${e && e.message})`); }
  finally { rmSync(gprobe, { recursive: true, force: true }); }
}

function selftest() {
  let bad = 0;
  const fail = (msg) => { bad++; console.log(`FAIL ${msg}`); };

  console.log('--- leg 1: whole pipeline over a git repository the test builds (walk/scope/token/P1/P2/N1/N2/for-each-ref) ---');
  let n = 0;
  const before = bad;
  try { n = legPipeline(fail); } catch (e) { fail(`pipeline: threw ${e && e.stack}`); }
  if (bad === before) console.log(`ok   pipeline produced exactly the ${n} expected violation(s); published, claim-id, staged-diff, upstream, wei and timestamp tokens all stayed clean`);

  console.log('\n--- leg 2: wiring (SCAN_ROOTS / IN_SCOPE / TOKEN / DECLARED / FOREIGN / NOT_COMMIT / walk / git) ---');
  const before2 = bad;
  try { legWiring(fail); } catch (e) { fail(`wiring: threw ${e && e.stack}`); }
  if (bad === before2) console.log('ok   scan roots, scope filter, token shape, the three discriminators, the extension filter and the git lane all intact');

  console.log(`\n${bad === 0 ? 'PASS' : 'FAIL'}: ${2 - bad}/2 self-test leg(s)`);
  return bad;
}

if (process.argv.includes('--selftest')) process.exit(selftest() ? 1 : 0);

// ----------------------------------------------------------------- main ----
try { git(ROOT, ['rev-parse', '--git-dir']); }
catch (e) { console.error(`COULD NOT RUN: ${ROOT} is not a git repository (${e && e.message})`); process.exit(2); }
let R;
try { R = scan(ROOT); }
catch (e) { console.error(`COULD NOT RUN: ${e && e.stack ? e.stack : e}`); process.exit(2); }
if (R.scannedInScope === 0) {
  console.error(`COULD NOT RUN: no in-scope documentation under ${ROOT} - --root is not this repository`);
  process.exit(2);
}

const { violations, info, cites, scanned, scannedInScope } = R;
const distinct = new Set(cites.map((c) => c.tok)).size;
// Counted off the CLASSIFIED records, not off `cites`: the raw token list carries
// no verdict, and reading `c.resolves` there silently yields undefined for every
// entry and prints "0 of them commits", which is exactly the kind of always-zero
// summary this whole exercise exists to distrust.
const commits = new Set([...violations, ...info].filter((v) => v.resolves).map((v) => v.tok)).size;
const unpubDistinct = new Set(violations.filter((v) => v.cls === 'UNPUBLISHED').map((v) => v.tok)).size;
console.log(`scanned ${scanned} file(s), ${scannedInScope} in scope; ${cites.length} hex token(s), ${distinct} distinct, ${commits} of them commits here, ${unpubDistinct} distinct commit(s) cited but unpublished`);

const fmt = (v) => `${v.file}:${v.line}  ${v.tok}  [${v.cls}]${v.note ? ` ${v.note}` : ''}\n      ${v.full.trim().slice(0, 150)}`;
const order = { UNPUBLISHED: 0, BROKEN: 1 };
violations.sort((a, b) => (order[a.cls] - order[b.cls]) || a.file.localeCompare(b.file) || a.line - b.line);
console.log(`\nVIOLATIONS (${violations.length}):`);
for (const v of violations) console.log('  ' + fmt(v));

const byCls = info.reduce((a, v) => (a[v.cls] = (a[v.cls] || 0) + 1, a), {});
if (SHOW_INFO) {
  console.log(`\nINFO — not violations (${info.length}):`);
  for (const v of info) console.log(`  ${v.file}:${v.line}  ${v.tok}  [${v.cls}]\n      ~ ${v.why}`);
} else {
  console.log(`\n(${info.length} informational match(es): ${Object.entries(byCls).map(([k, n]) => `${n} ${k}`).join(', ')}; re-run with --info to list them)`);
}
console.log(`\n${violations.length === 0 ? 'PASS' : 'FAIL'}: ${violations.length} violation(s)`);
process.exit(violations.length ? 1 : 0);
