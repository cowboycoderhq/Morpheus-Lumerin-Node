#!/usr/bin/env node
// verify-fixes — did the audit's corrections land, and are they self-consistent?
//
// This is the mechanical half of "were the fixes applied and not misconceived".
// It cannot judge prose; it CAN prove that every file:line citation the audit
// introduced resolves, that every number it wrote still matches the config it
// was derived from, and that every link it added has a target. A misconceived
// fix very often shows up as a citation that points one line off, or a figure
// that disagrees with the artifact it claims to quote.
//
//   node tools/docs-audit/verify-fixes.mjs            # report
//   node tools/docs-audit/verify-fixes.mjs --selftest  # prove the checks fire
//
// Exit 1 if any audit-introduced check fails, so this can gate a push.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, docFiles, auditBase } from './lib.mjs';
import { weiFor, retiredWeiFor, provenance } from './onchain-params.mjs';

// Resolved, not hardcoded — see auditBase() in lib.mjs. Lazy so --selftest runs
// in a tree that has no base at all.
let _BASE = null;
const BASE = () => (_BASE ??= auditBase());

const read = (f) => readFileSync(join(REPO, f), 'utf8');
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 });

// ---------------------------------------------------------------- diff lines
// Only lines this audit ADDED. Pre-existing defects are not this gate's job;
// mixing them in would bury a real regression in inherited noise.
function addedLines() {
  const out = [];
  let file = null;
  const diff = git('diff', '-U0', `${BASE()}...HEAD`, '--', '*.md', '*.mdx');
  for (const line of diff.split('\n')) {
    const m = /^\+\+\+ b\/(.+)$/.exec(line);
    if (m) { file = m[1]; continue; }
    if (!file || file.startsWith('verify/')) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) out.push({ file, text: line.slice(1) });
  }
  return out;
}

// ------------------------------------------------------------------- checks
const failures = [];
const notes = [];
const fail = (kind, where, msg) => failures.push({ kind, where, msg });

// A citation is only checkable if it names a path that exists in the tree. What
// counts as "path-shaped" used to be an extension whitelist, which is a
// hardcoded parameter standing in for a question the tree can answer directly —
// so every file type the repo grew reopened the hole (.env, .jsx, .example,
// .tee, .mod, and anything without an extension at all, like Makefile:57, were
// all invisible). Match permissively instead and let resolvePath decide: a token
// is a citation if and only if it resolves to a tracked file. The one guard is
// that it must contain a slash or a dot, which is what keeps `8080:8080` out.
const CITE = /`?(?<![\w.\/-])([\w.-]+(?:\/[\w.-]+)*)`?:(\d+)(?:-(\d+))?/g;

// Docs cite paths in shorthand — "attestation/verifier.go" for
// proxy-router/internal/attestation/verifier.go. A resolver that only tried a
// few fixed roots skipped 35 of 49 citations and still printed PASS, which is a
// checker reporting on the 29% it happened to understand. Resolve by
// suffix-match against the tracked file list instead.
let SUFFIX_INDEX = null;
function trackedIndex() {
  if (SUFFIX_INDEX) return SUFFIX_INDEX;
  SUFFIX_INDEX = git('ls-files').split('\n').filter(Boolean);
  return SUFFIX_INDEX;
}
function resolvePath(path) {
  if (existsSync(join(REPO, path))) return path;
  const hits = trackedIndex().filter((f) => f === path || f.endsWith('/' + path));
  // ambiguous shorthand (same basename in several trees) cannot be checked
  // safely — a wrong pick would invent a failure
  return hits.length === 1 ? hits[0] : null;
}

function checkCitations(lines) {
  let checked = 0;
  for (const { file, text } of lines) {
    for (const m of text.matchAll(CITE)) {
      const [, path, a, b] = m;
      if (!/[\/.]/.test(path)) continue; // `8080:8080` is not a path
      const hit = resolvePath(path);
      if (!hit) { notes.push(`${file}: citation path not resolvable, skipped — ${path}`); continue; }
      checked++;
      const n = read(hit).split('\n').length;
      const lo = Number(a), hi = Number(b || a);
      if (lo < 1 || hi > n) fail('citation', file, `${path}:${a}${b ? '-' + b : ''} — file has ${n} lines`);
    }
  }
  return checked;
}

// ----------------------------------------------- numbers vs the chain record
// Sourced from tools/docs-audit/onchain-params.mjs — observed values, each
// carrying the date and the method that established it — and NOT from
// smart-contracts/deploy/data/config_base_*.json, which is what this read
// before. A deploy config is an input to a FUTURE deployment; it cannot say what
// a live contract returns, and here it was wrong in both directions at once. It
// claims a mainnet floor of 1e13 that has never been on chain at any block, and
// it still lists a Sepolia bid fee the live contract stopped charging on
// 2026-07-30. Believing it made this gate fail 11 CORRECT lines (c1fc046e).
//
// providerStake and modelStake are gone rather than moved: they were computed
// here and read by nothing, so carrying them meant keeping a config read alive
// to feed a value no check consults.
function economics() {
  const mor = (wei) => Number(BigInt(wei)) / 1e18;
  return {
    bidFee: weiFor('marketplaceBidFee').map(mor),
    floorWei: weiFor('bidMinPricePerSecond'),
    // The price bounds are a PAIR. Knowing only the floor made the check fire on a
    // correct citation of the deployed ceiling — the rule was incomplete, not the doc.
    ceilWei: weiFor('bidMaxPricePerSecond'),
  };
}

// WHICH bound moved matters more than THAT one did. The mainnet floor is static;
// the Sepolia floor is owner-set — 1_full_protocol.migration.ts:105-109 passes the
// config figure straight into the initializer and Marketplace.sol:29-38 stores it
// unchanged, so the migration computes nothing and a redeploy would come up at the
// config file's figure, not a freshly derived one. An owner call is what moved it
// after deployment, so a mismatch there most likely means the chain moved and this
// record did not — not that the document is wrong.
const BOUNDS_NOTE = 'if the Sepolia figure is the one that moved, that bound is owner-set, '
  + 'not computed at deploy: a redeploy comes up at the config figure and needs an owner '
  + 'call to reach the live value again — re-read getMinMaxBidPricePerSecond() and update '
  + 'tools/docs-audit/onchain-params.mjs, the only place these values live';

function checkEconomics(lines) {
  const e = economics();
  const [feeMain, feeSep] = e.bidFee;
  let checked = 0;

  // Any line that states a bid fee must name a network alongside it. The whole
  // defect class was an unqualified number that happened to be the testnet one.
  for (const { file, text } of lines) {
    if (!/marketplaceBidFee|bid fee/i.test(text)) continue;
    const nums = [...text.matchAll(/`(\d+\.\d+)`/g)].map((m) => Number(m[1]));
    const fees = nums.filter((n) => n === feeMain || n === feeSep);
    if (!fees.length) continue;
    checked++;
    if (!/mainnet|Sepolia/i.test(text)) {
      fail('economics', file, `states a bid fee (${fees.join(', ')}) without naming a network — "${text.trim().slice(0, 90)}"`);
    }
    // the specific inversion we shipped for months: Sepolia's value presented as the only value
    if (fees.includes(feeSep) && !fees.includes(feeMain) && !/Sepolia/i.test(text)) {
      fail('economics', file, `states only the Sepolia bid fee (${feeSep}) with no Sepolia qualifier`);
    }
  }

  // The floor is quoted in wei in several places; assert the wei matches deploy.
  for (const { file, text } of lines) {
    for (const m of text.matchAll(/`(\d{10,})`\s*wei/g)) {
      checked++;
      const known = [...e.floorWei, ...e.ceilWei];
      if (!known.includes(m[1])) {
        fail('economics', file, `wei value ${m[1]} matches no observed bid bound (min ${e.floorWei.join('/')}, max ${e.ceilWei.join('/')}) — ${BOUNDS_NOTE}`);
      }
    }
  }
  return checked;
}

// --------------------------------------------------------------- link targets
function checkLinks(lines) {
  const nav = new Set(docFiles().filter((f) => f.startsWith('docs/') && f.endsWith('.mdx')));
  let checked = 0;
  for (const { file, text } of lines) {
    if (!file.startsWith('docs/')) continue;
    for (const m of text.matchAll(/\]\((\/[a-z0-9\-/]+)\)/gi)) {
      const target = `docs${m[1]}.mdx`;
      checked++;
      if (!nav.has(target)) fail('link', file, `internal link ${m[1]} has no page at ${target}`);
    }
  }
  return checked;
}

// ------------------------------------------------------------------ selftest
// A check that has only ever passed proves nothing. Each mutation below is a
// NEAR-MISS of a real corrected line, not a demolition: one digit off, one
// qualifier removed, one line number past the end.
function selftest() {
  const cases = [];
  const run = (label, lines, fn, wantFail) => {
    const before = failures.length;
    fn(lines);
    const fired = failures.length > before;
    failures.length = before;
    cases.push([fired === wantFail, label, wantFail ? 'must fire' : 'must stay silent']);
  };
  const e = economics();
  const [feeMain, feeSep] = e.bidFee;

  // citations
  run('citation to a real file+line', [{ file: 'x.md', text: 'see `proxy-router/internal/config/config.go:212`' }], checkCitations, false);
  run('citation one line past EOF', [{ file: 'x.md', text: 'see `proxy-router/internal/config/config.go:999999`' }], checkCitations, true);
  run('citation to line 0', [{ file: 'x.md', text: 'see `proxy-router/internal/config/config.go:0`' }], checkCitations, true);
  // A dot-directory path. The pattern anchored on \b, which cannot match before a
  // leading dot, so the capture began one character in: `.github/…` was read as
  // `github/…`, resolved against nothing, and was filed as unresolvable PROSE
  // rather than as a bad citation. The gate reported a healthy count while never
  // examining .github/, .githooks/ or .ai-docs/ at all — 15 citations. The tell
  // was a skipped count that moved while the checked count did not.
  // The near-miss below is what proves the boundary: a citation can only FAIL if
  // its path resolved, so a firing dot-path case proves the leading dot survives.
  run('dot-path citation to a real file+line',
    [{ file: 'x.md', text: 'see `.ai-docs/TEE_Attestation_Architecture.md:1`' }], checkCitations, false);
  run('dot-path citation one line past EOF',
    [{ file: 'x.md', text: 'see `.ai-docs/TEE_Attestation_Architecture.md:999999`' }], checkCitations, true);
  // Two file shapes the extension whitelist could never see: no extension at all,
  // and an extension nobody thought to list. Both resolve to real tracked files,
  // so both are now checkable — and both near-misses must fire, which is what
  // proves the resolver is deciding rather than a pattern guessing.
  run('extensionless path, one line past EOF',
    [{ file: 'x.md', text: 'see `proxy-router/Makefile:999999`' }], checkCitations, true);
  run('unlisted extension, one line past EOF',
    [{ file: 'x.md', text: 'see `proxy-router/Dockerfile.tee:999999`' }], checkCitations, true);
  // The guard that keeps the permissive pattern honest. A port map is not a path,
  // and must not even reach the resolver.
  run('a port map is not a citation',
    [{ file: 'x.md', text: 'listens on 8080:8080 by default' }], checkCitations, false);



  // economics — the exact defect class this audit fixed
  run('bid fee with both networks named',
    [{ file: 'x.mdx', text: `bid fee is \`${feeMain}\` on Base mainnet and \`${feeSep}\` on Base Sepolia` }], checkEconomics, false);
  // The Sepolia bid fee has been 0 since 2026-07-30, and `0` is not a decimal, so
  // there is no longer a distinct "testnet fee value" that could be stated
  // unqualified — the chain retired that mutation, and a case built on it would
  // prove only that the harness still runs. The near-miss that still
  // discriminates is a fee-shaped decimal which is NOT a known fee: it proves the
  // rule is anchored to the observed values rather than firing on any number.
  run('a decimal that is not a known fee',
    [{ file: 'x.mdx', text: 'marketplaceBidFee of `0.77`' }], checkEconomics, false);
  run('bid fee, mainnet value, no qualifier',
    [{ file: 'x.mdx', text: `marketplaceBidFee of \`${feeMain}\`` }], checkEconomics, true);
  run('wei floor matching deploy',
    [{ file: 'x.mdx', text: `floor is \`${e.floorWei[0]}\` wei/sec` }], checkEconomics, false);
  run('wei ceiling matching deploy',
    [{ file: 'x.mdx', text: `ceiling is \`${e.ceilWei[0]}\` wei/sec` }], checkEconomics, false);
  run('wei floor one digit short',
    [{ file: 'x.mdx', text: `floor is \`${e.floorWei[0].slice(0, -1)}\` wei/sec` }], checkEconomics, true);
  // The two directions this check was rebuilt for: it must accept every corrected
  // line now in the tree, including the computed Sepolia floor, and it must still
  // reject the number those lines replaced.
  run('wei floor at the observed Sepolia value',
    [{ file: 'x.mdx', text: `floor is \`${e.floorWei[1]}\` wei/sec` }], checkEconomics, false);
  run('wei floor at the RETIRED 1e13 value',
    [{ file: 'x.mdx', text: `floor is \`${retiredWeiFor('bidMinPricePerSecond')[0]}\` wei/sec` }], checkEconomics, true);

  // links
  run('link to a real page', [{ file: 'docs/x.mdx', text: 'see [p](/concepts/tokens-and-fees)' }], checkLinks, false);
  run('link to a near-miss page', [{ file: 'docs/x.mdx', text: 'see [p](/concepts/tokens-and-fee)' }], checkLinks, true);

  let bad = 0;
  console.log('--- verify-fixes selftest ---');
  for (const [ok, label, want] of cases) {
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(38)} ${want}`);
  }
  console.log(bad
    ? `FIXES SELFTEST: FAIL (${bad}/${cases.length})`
    : `FIXES SELFTEST: PASS (${cases.length}/${cases.length} — every check returns both answers)`);
  return bad === 0;
}

// ---------------------------------------------------------------------- main
if (process.argv.includes('--selftest')) {
  process.exit(selftest() ? 0 : 1);
}

const lines = addedLines();
const nCite = checkCitations(lines);
const nEcon = checkEconomics(lines);
const nLink = checkLinks(lines);

console.log(`audit-introduced doc lines examined: ${lines.length}`);
console.log(`  file:line citations resolved : ${nCite}`);
console.log(`  economic figures re-derived  : ${nEcon}`);
console.log(`  internal links resolved      : ${nLink}`);
// Print the oracle, not just the verdict. A committed value goes stale exactly as
// the config file did; the difference this file can make is that its age is
// visible in the run that depended on it, rather than only to whoever opens it.
for (const p of ['bidMinPricePerSecond', 'bidMaxPricePerSecond', 'marketplaceBidFee']) {
  for (const l of provenance(p)) console.log(`  oracle: ${l}`);
}

if (notes.length) {
  console.log(`\n${notes.length} unresolvable citation path(s) skipped (not a failure — prose that looks like a path):`);
  for (const n of [...new Set(notes)].slice(0, 12)) console.log(`  ${n}`);
}

if (failures.length) {
  console.log(`\nFAILURES (${failures.length}):`);
  for (const f of failures) console.log(`  [${f.kind}] ${f.where}: ${f.msg}`);
  console.log('\nVERIFY-FIXES: FAIL');
  process.exit(1);
}
console.log('\nVERIFY-FIXES: PASS (every audit-introduced citation, figure and link checks out)');
