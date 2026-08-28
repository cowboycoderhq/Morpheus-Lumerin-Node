#!/usr/bin/env node
// check-hygiene — the checks that would have caught the scrub breaking the tools.
//
// A text substitution across a repo does not know the difference between prose and
// code. Scrubbing vendor names turned a one-word identifier into a multi-word
// phrase (not valid JavaScript) and turned a functional model id into a
// description that the API would reject. Every existing gate still passed, because
// none of them parsed those files or exercised that constant.
//
//   node tools/docs-audit/check-hygiene.mjs
//   node tools/docs-audit/check-hygiene.mjs --selftest
//
// Three checks:
//   1. PARSE       — every .mjs in this directory must parse.
//   2. IDENTITY    — no home path, username or workspace name in any tracked file.
//                    A file that CANNOT BE READ is reported and fails the gate: an
//                    unreadable file is one whose leak this gate never looked for.
//   3. PLACEHOLDER — no substitution scar sitting inside a path, URL, identifier or
//                    filename, and no redaction artifact baked into a tracked file.
//                    A blind find-and-replace cannot tell prose from structure; it
//                    already broke a variable name, a URL and a verbatim quote here.

import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync, unlinkSync, mkdtempSync, readFileSync } from 'node:fs';
import { join, resolve as resolveFs } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { REPO, repoFiles } from './lib.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 });

// Built from the runtime environment, never written literally, so this file does
// not itself become the leak it is checking for.
//
// A NEEDLE DERIVED FROM THE ENVIRONMENT CAN COLLIDE WITH LEGITIMATE CONTENT, AND
// ON A CI RUNNER IT DOES. Measured on a runner-shaped checkout of this repo, with
// HOME set to the runner's own home and the tree at <home>/work/<repo>/<repo>:
// 742 hits and HYGIENE: FAIL on a tree
// that contains no leak at all. 700 of them came from the workspace needle —
// under actions/checkout the directory ABOVE the checkout is named after the
// REPOSITORY, and the repository's own name is in go.mod, in every Go import path
// and throughout the docs. The other 44 came from the account needle, which on a
// runner is the fixed word every GitHub runner uses.
//
// Neither is an identity. A value that is IDENTICAL ON EVERY MACHINE of its kind
// names the platform, not a person — the same reasoning check-dox already applies
// to the Docker bridge address, which is the same on every host and therefore
// reveals nothing about this one.
//
// The DIRECTION of these exclusions is what makes them safe: each one drops a
// value the operator did not choose and a platform did. On the operator's own
// machine the home directory, the account name and the workspace name are all
// still needles, so nothing here weakens the check in the place where it is the
// last thing standing between a private tree and a public push.
//
// The home directories below are ASSEMBLED FROM PARTS, never written whole. A
// literal absolute home path in this file is a `home-path` BLOCK hit in the
// sibling scanner that reads every file this branch publishes — including this
// one. Writing the string out would fail the pipeline with a finding about the
// fix for the pipeline, which is the shape of mistake this directory keeps
// producing: a detector that becomes the thing it detects.
const homePath = (...seg) => `/${seg.join('/')}`;
const PLATFORM_HOMES = new Set([
  homePath('home', 'runner'),     // GitHub-hosted runner
  homePath('Users', 'runner'),    // the macOS image of the same
  homePath('github', 'home'),     // container action
  homePath('home', 'ubuntu'),     // common self-hosted image
  homePath('root'), homePath('builds'), homePath('workspace'),
]);
const PLATFORM_USERS = new Set(['runner', 'root', 'ubuntu', 'circleci', 'travis',
                                'jenkins', 'buildkite', 'vsts', 'gitlab-runner', 'docker']);
export function identityNeedles(env = process.env, repo = REPO) {
  const home = env.HOME || '';
  const user = home.split('/').filter(Boolean).pop() || '';
  const parts = repo.split('/').filter(Boolean);
  const workspace = parts.length >= 2 ? parts[parts.length - 2] : '';
  const needles = [];
  const dropped = [];
  // Values are never printed, only their ROLE and the reason — this reporting path
  // is published in CI logs, and a gate that echoes the string it hunts for is its
  // own leak.
  const take = (role, value, why) => {
    if (!value) { dropped.push(`${role} (this environment declares none)`); return; }
    if (value.length <= 3) { dropped.push(`${role} (too short to be distinctive)`); return; }
    if (why) { dropped.push(`${role} (${why})`); return; }
    needles.push(value);
  };
  take('the account name', user,
    PLATFORM_USERS.has(user.toLowerCase()) ? 'platform-fixed — every runner of this kind uses it, so it identifies nobody' : '');
  take('the home directory', home,
    PLATFORM_HOMES.has(home) ? 'platform-fixed — every runner of this kind uses it, so it identifies nobody' : '');
  // The workspace needle means "the private directory this checkout sits in".
  // actions/checkout clones into <workspace>/<repo>/<repo>, so when those two
  // basenames are equal the value is the REPOSITORY NAME, which is not identity —
  // it is the subject of the repository.
  take('the workspace directory name', workspace,
    workspace && workspace === (parts[parts.length - 1] || '') ? 'equal to the checkout directory name, i.e. the repository name under a CI checkout layout, not a workspace' : '');
  return { needles: [...new Set(needles)], dropped };
}

export function parseFailures(dir) {
  const bad = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.mjs'))) {
    try {
      execFileSync(process.execPath, ['--check', join(dir, f)], { stdio: 'pipe' });
    } catch (e) {
      bad.push({ file: f, msg: String(e.stderr || e.message).split('\n').find(Boolean) || 'parse error' });
    }
  }
  return bad;
}

// Phrases a scrub substituted in. Harmless in prose, damage inside structure.
const SCARS = ['external reviewer A','external reviewer B','the local CLI','the local endpoint',
  'the in-family model','the vendor','high tier','low tier','a third-party model'];
const SCAR_ALT = SCARS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
// Scars that already carry an article — a quantifier in front of one reads wrong.
const ART_SCARS = SCARS.filter((x) => /^(?:a|an|the)\s/i.test(x));
const ART_ALT = ART_SCARS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
// Bare substitution words beginning with a vowel sound — they need "an", not "a".
const VOWEL_WORDS = ['in-family', 'independent', 'external reviewer', 'in-family lane', 'in-family reviewer'];
const VOWEL_ALT = VOWEL_WORDS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

// Structure a multi-word phrase can never legitimately occupy.
const STRUCTURES = [
  ['inside a path',     new RegExp(`[\\w./~-]+/(?:${SCAR_ALT})|(?:${SCAR_ALT})/[\\w./-]+`)],
  ['inside a URL',      new RegExp(`https?://[^\\s\`)]*(?:${SCAR_ALT})|(?:${SCAR_ALT})\\.(?:ai|com|org|io|net)\\b`)],
  ['inside a filename', new RegExp(`(?:${SCAR_ALT})\\.(?:mjs|js|ts|json|md|mdx|out|tsv|go|sol|yml)\\b`)],
  ['as an identifier',  new RegExp(`(?:const|let|var|function)\\s+(?:${SCAR_ALT})`)],
  // A substituted phrase that itself begins with a determiner, dropped in after an
  // existing article, leaves "a the local CLI" / "the app-generated the vendor". [hygiene-fixture]
  // Regex over structure cannot see this; it is grammar, and it reads as nonsense.
  ['determiner collision', new RegExp(`\\b(?:a|an|the|its|our|your|每)\\s+(?:${SCAR_ALT})`, 'i')],
  // Grammar, not structure. A substitution changes the first SOUND of the phrase,
  // so the article in front of it can end up wrong ("a in-family review"), and a [hygiene-fixture]
  // phrase that already CARRIES an article can land after a quantifier ("one the
  // in-family model pass"). Six of these survived every structural rule and were
  // found by reading — the check that does not scale.
  //
  // Two vocabularies, because these are different mistakes: phrases that begin
  // with an article, and bare words that begin with a vowel sound.
  ['quantifier + article', new RegExp(`\\b(?:single|one|each|every|another|no)\\s+(?:${ART_ALT})`, 'i')],
  ['article disagreement', new RegExp(`\\ba\\s+(?:${VOWEL_ALT})\\b`, '')],
];
// Redaction placeholders that must never be committed.
const REDACTION = /LABEL_[0-9a-f]{6}|ADDR_[0-9a-f]{4,}/;

// A line that DECLARES itself a fixture is exempt — the tools that document this
// damage have to quote it. The exemption is per-LINE and explicit, replacing a
// blanket per-file skip on this module: a whole-file exemption would have hidden a
// real scar sitting anywhere in the detector itself.
const FIXTURE = /hygiene-fixture/;

export function placeholderHits(text) {
  if (FIXTURE.test(text)) return [];
  const out = [];
  for (const [label, rx] of STRUCTURES) { const m = rx.exec(text); if (m) out.push({ kind: label, at: m[0].slice(0, 60) }); }
  const r = REDACTION.exec(text);
  if (r) out.push({ kind: 'redaction artifact', at: r[0] });
  return out;
}

// errno if the reader supplies one, else its message. Never the stack: every
// frame carries an absolute module path, which is the string these gates exist
// to keep out of a published tree.
const reason = (e) => (e && e.code) || String((e && e.message) || 'read failed').slice(0, 100);

// ONE read of the corpus, used by BOTH scans below.
//
// Each scan used to open the corpus itself behind its own `catch { continue; }`,
// so an unreadable file vanished from a BLOCK-severity gate TWICE, silently, and
// the gate still printed PASS. A file this gate cannot read is a file whose leak
// it never looked for — that has to reach the VERDICT, not quietly narrow the
// scan. Two copies of one decision is also how the same defect survived being
// fixed once elsewhere in this directory, so there is now one copy, here.
//
// Scanned in-process rather than via `git grep`, so this works in a tarball or
// the history-free review snapshot as well as in a checkout.
export function readCorpus(files = repoFiles(), reader = (f) => readFileSync(join(REPO, f), 'utf8')) {
  const texts = [];          // { file, body, binary }
  const unreadable = [];     // { file, code }  — named, and fatal
  for (const f of files) {
    let body;
    try { body = reader(f); }
    catch (e) { unreadable.push({ file: f, code: reason(e) }); continue; }
    texts.push({ file: f, body, binary: body.includes('\u0000') });
  }
  return { texts, unreadable };
}

export function identityHits(needles, texts = readCorpus().texts) {
  const hits = [];
  for (const { file, body, binary } of texts) {
    if (file === 'tools/docs-audit/check-hygiene.mjs') continue;   // this file names none
    if (binary) continue;
    body.split('\n').forEach((line, i) => {
      for (const n of needles) if (line.includes(n)) hits.push({ needle: n, where: `${file}:${i + 1}` });
    });
  }
  return hits;
}

function selftest() {
  const cases = [];
  const tmp = mkdtempSync(join(tmpdir(), 'hygiene-'));

  // a valid module must not be flagged
  writeFileSync(join(tmp, 'good.mjs'), 'export const a = 1;\n');
  cases.push([parseFailures(tmp).length === 0, 'valid module passes', 'must stay silent']);

  // the EXACT damage the scrub caused: a prose phrase substituted into an identifier
  writeFileSync(join(tmp, 'bad.mjs'), "const external reviewer A = 1;\nexport default external reviewer A;\n");   // hygiene-fixture
  const bad = parseFailures(tmp);
  cases.push([bad.some((b) => b.file === 'bad.mjs'), 'identifier broken by substitution is caught', 'must fire']);

  // and it must still pass the good one alongside the bad
  cases.push([bad.length === 1, 'only the broken file is reported', 'must fire once']);

  for (const f of readdirSync(tmp)) unlinkSync(join(tmp, f));

  // identity check returns both answers
  cases.push([identityHits(['zzz-a-string-that-is-not-in-this-repo']).length === 0,
              'absent needle produces no hits', 'must stay silent']);
  {
    // A present needle must be FOUND. Assembled at runtime, never a literal.
    const needle = ['zz', 'planted', 'account', 'name'].join('-');
    const corpus = [{ file: 'x/y.md', body: `owner: ${needle}\nsecond line\n`, binary: false }];
    cases.push([identityHits([needle], corpus).length === 1,
                'a present needle IS found', 'must fire']);
    cases.push([identityHits([needle], corpus)[0].where === 'x/y.md:1',
                'the hit names file and line, never the value', 'must fire']);
  }

  // AN UNREADABLE FILE IS A FINDING, NOT A SKIP. Both scans read the corpus
  // through readCorpus, and it used to be two separate `catch { continue; }`.
  {
    const boom = () => { const e = new Error('denied'); e.code = 'EACCES'; throw e; };
    const c = readCorpus(['secret.md'], boom);
    cases.push([c.unreadable.length === 1 && c.unreadable[0].file === 'secret.md' && c.unreadable[0].code === 'EACCES',
                'an unreadable file is NAMED, not skipped', 'must fire']);
    cases.push([c.texts.length === 0, 'an unreadable file contributes no text', 'must fire']);
    const ok = readCorpus(['a.md', 'b.md'], (f) => `body of ${f}`);
    cases.push([ok.unreadable.length === 0 && ok.texts.length === 2,
                'a readable corpus reports nothing unreadable', 'must stay silent']);
  }

  // THE NEEDLE DERIVATION ITSELF RETURNS BOTH ANSWERS.
  // Left: an operator-shaped machine keeps all three needles. Right: a CI-shaped
  // one keeps none, because none of its three values identifies a person — that
  // exact collision produced 744 false hits and a red gate on every runner.
  {
    // Paths assembled from parts here too, for the reason given at PLATFORM_HOMES:
    // a test that writes an absolute home path is a leak in the file that hunts them.
    const opHome = homePath('Users', 'zzoperator');
    const op = identityNeedles({ HOME: opHome }, `${opHome}/zzworkspace/repo`);
    cases.push([op.needles.length === 3 && op.dropped.length === 0,
                'an operator-shaped machine keeps every needle', 'must fire']);
    const ciHome = homePath('home', 'runner');
    const ci = identityNeedles({ HOME: ciHome }, `${ciHome}/work/zzrepo/zzrepo`);
    cases.push([ci.needles.length === 0 && ci.dropped.length === 3,
                'a CI-shaped machine keeps none, and says why for each', 'must stay silent']);
    const mixed = identityNeedles({ HOME: ciHome }, `${ciHome}/zzprivate/repo`);
    cases.push([mixed.needles.length === 1 && mixed.needles[0] === 'zzprivate',
                'a private workspace name under a CI home is STILL a needle', 'must fire']);
  }

  // placeholder rules — each is a real scar this scrub actually produced
  const ph = (label, text, want) =>
    cases.push([ (placeholderHits(text).length > 0) === want, label,
                 want ? 'must fire' : 'must stay silent' ]);
  ph('scar inside a URL',        'see https://the local CLI.ai for more', true);   // hygiene-fixture
  ph('scar as an identifier',    'const external reviewer A = 1;', true);   // hygiene-fixture
  ph('scar inside a path',       'at ~/Library/Application Support/the local endpoint/x.json', true);   // hygiene-fixture
  ph('scar inside a filename',   'cited external reviewer A.md:88 as evidence', true);   // hygiene-fixture
  ph('redaction artifact',       'spend up to 3 LABEL_513a78 on your behalf', true);   // hygiene-fixture
  ph('determiner collision',     'documented as a the local CLI plugin here', true);   // hygiene-fixture
  ph('scar in ordinary prose',   'vendor confirmed this independently in review', false);
  ph('clean prose',              'The proxy-router listens on 8082 by default.', false);
  // the grammar class the structural rules could not see
  ph('wrong article before scar', 'this rests on a ' + 'in-family model' + ' pass', true);
  ph('right article is fine',     'this rests on an ' + 'in-family model' + ' pass', false);
  ph('quantifier + article',      'rests on one the ' + 'in-family model' + ' pass', true);
  // the exemption itself must return both answers, or it is a hole not a rule
  ph('declared fixture line is exempt',   "ph('x', 'const external reviewer A = 1;', true);   // " + 'hygiene-fixture', false);
  // assembled at runtime, the way check-dox builds its fixtures: a test asserting
  // that an UNDECLARED scar fires cannot carry that scar as a source literal, or
  // the scan of this file trips on the test for the scan.
  ph('undeclared same line still fires',  "ph('x', 'const " + "external reviewer A" + " = 1;', true);", true);

  let n = 0;
  console.log('--- check-hygiene selftest ---');
  for (const [ok, label, want] of cases) {
    if (!ok) n++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(44)} ${want}`);
  }
  console.log(n ? `HYGIENE SELFTEST: FAIL (${n}/${cases.length})`
                : `HYGIENE SELFTEST: PASS (${cases.length}/${cases.length} — every check returns both answers)`);
  return n === 0;
}

const IS_MAIN = process.argv[1] && resolveFs(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1);

  const modules = readdirSync(HERE).filter((f) => f.endsWith('.mjs'));
  const bad = parseFailures(HERE);
  const { needles, dropped } = identityNeedles();
  const corpus = readCorpus();
  const hits = identityHits(needles, corpus.texts);

  const scars = [];
  for (const { file, body } of corpus.texts) {
    body.split('\n').forEach((line, i) => {
      for (const h of placeholderHits(line)) scars.push({ file, line: i + 1, ...h });
    });
  }

  console.log(`parsed  : ${modules.length} module(s), ${bad.length} broken`);
  for (const b of bad) console.log(`  BROKEN ${b.file}: ${b.msg}`);
  console.log(`corpus  : ${corpus.texts.length} file(s) read, ${corpus.unreadable.length} unreadable`);
  for (const u of corpus.unreadable.slice(0, 12)) console.log(`  UNREAD ${u.file} (${u.code})`);
  if (needles.length) {
    console.log(`identity: ${needles.length} needle(s) checked, ${hits.length} hit(s)`);
  } else {
    // NOT the same sentence as "no identity strings found". The needles are
    // derived from the environment, and an environment that declares none leaves
    // this dimension UNCHECKED rather than clean. Saying PASS here without saying
    // this is the vacuous-pass shape the sibling gates were fixed for.
    console.log('identity: NOT CHECKED — no needle survived derivation:');
    for (const d of dropped) console.log(`            - ${d}`);
    console.log('          Nothing here identifies a person, so there is nothing for this');
    console.log('          scan to look for. Tree content is still covered by check-dox,');
    console.log('          whose rules are patterns and do not depend on the environment.');
  }
  for (const h of hits.slice(0, 10)) console.log(`  LEAK ${h.where}`);
  console.log(`scars   : ${scars.length} substitution/redaction artifact(s)`);
  for (const s of scars.slice(0, 12)) console.log(`  SCAR ${s.file}:${s.line} — ${s.kind}: ${s.at}`);

  // A SCAN OF NOTHING IS NOT A PASS — and the two ways of arriving at nothing are
  // NOT the same, so they get different exits.
  //
  //   * An EMPTY CORPUS, or no module to parse, is a broken run: this gate always
  //     has files to read (it is reading the checkout it lives in). Exit 2, the
  //     runner's "could not run", because it has cleared nothing.
  //   * ZERO NEEDLES with a stated reason for each is a legitimate narrowing, not
  //     a failure — it is what a CI runner looks like, and blocking every CI run
  //     for it is the false red this derivation was just fixed for. Reported
  //     above, and the other two dimensions still decide the verdict.
  //
  // Zero needles with NO reason means the environment gave us nothing to derive
  // from, which IS a broken run and is the one case that must not slip through as
  // a legitimate narrowing.
  if (!corpus.texts.length && !corpus.unreadable.length) {
    console.error('\nHYGIENE: NOT RUN — the corpus is EMPTY: 0 tracked file(s) were found, so nothing was scanned.');
    process.exit(2);
  }
  if (!modules.length) {
    console.error('\nHYGIENE: NOT RUN — no module was found to parse, so the parse check cleared nothing.');
    process.exit(2);
  }
  if (!needles.length && !dropped.length) {
    console.error('\nHYGIENE: NOT RUN — the environment declares no identity to search for and gave no reason,');
    console.error('so the identity scan examined the corpus for nothing at all.');
    process.exit(2);
  }

  // An unreadable file counts as a FAILURE, not a smaller scan: it is a file whose
  // leak this gate did not look for, and the gate's verdict must say so.
  if (bad.length || hits.length || scars.length || corpus.unreadable.length) {
    console.log('\nHYGIENE: FAIL');
    process.exit(1);
  }
  console.log(`\nHYGIENE: PASS (modules parse; ${corpus.texts.length} file(s) read, none unreadable; ` +
    `${needles.length ? `${needles.length} identity needle(s) clean` : 'identity needles NOT APPLICABLE in this environment'}; ` +
    'no substitution or redaction artifacts)');
}
