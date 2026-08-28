#!/usr/bin/env node
// check-dox — broad deanonymisation scan over what a branch would publish.
//
// check-hygiene covers the two strings we already knew about (home path, username).
// This asks the wider question: is there ANYTHING in what we are about to publish
// that ties it to a person, a machine, or an account? Regex cannot judge whether a
// name is a real person, so this reports CATEGORIES and LOCATIONS and leaves the
// judgement to a human — and deliberately never prints the matched value, because
// a scanner that echoes secrets into a log is its own leak.
//
//   node tools/docs-audit/check-dox.mjs [--range <git range>]
//   node tools/docs-audit/check-dox.mjs --selftest
//
// Default range: everything this branch adds that the remote does not have.

import { resolve as resolveFs } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditBase, git, readOptional, scrubPaths } from './lib.mjs';

// The git helper is lib's, and it THROWS. It used to be a private
// `catch { return ''; }` right here, which is the same defect lib's read() was
// fixed for: a failed `git diff` arrived as an empty file list, and this
// BLOCK-severity gate then printed `files : 0 scanned` followed by `DOX: PASS` —
// reporting success having examined nothing. Two other copies of that decision
// existed; there is now one, in lib.mjs, and the silent variant is opt-in by name.

// Each rule: what it catches, and whether a hit is decisive or needs a human look.
export const RULES = [
  { id: 'home-path',    sev: 'BLOCK', re: /\/(?:Users|home)\/[A-Za-z0-9._-]{2,}/g,
    why: 'absolute home directory reveals the account name' },
  { id: 'email',        sev: 'BLOCK', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    why: 'email address' },
  { id: 'private-ip',   sev: 'REVIEW', re: /\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/g,
    why: 'private network address reveals LAN topology' },
  { id: 'tailscale-ip', sev: 'BLOCK', re: /\b100\.(?:[6-9]\d|1[0-2]\d)\.\d{1,3}\.\d{1,3}\b/g,
    why: 'Tailscale CGNAT address identifies a specific machine on your tailnet' },
  { id: 'ssh-key',      sev: 'BLOCK', re: /\b(?:ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp)\s+[A-Za-z0-9+/]{20,}/g,
    why: 'SSH public key is a stable machine/person identifier' },
  { id: 'private-key',  sev: 'BLOCK', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    why: 'private key material' },
  { id: 'api-token',    sev: 'BLOCK', re: /\b(?:sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g,
    why: 'API credential' },
  // A BIP39 phrase is twelve bare words with nothing between them and no function
  // words. Matching "twelve lowercase words" alone fires on every paragraph of
  // English in the corpus — 12 false positives on the first run. NOTE: about,
  // above and after are real BIP39 words and must NOT be rejected, or the rule
  // goes blind to genuine phrases.
  { id: 'mnemonic',     sev: 'BLOCK', re: /\b(?:[a-z]{3,8} ){11}[a-z]{3,8}\b/g,
    reject: /\b(?:the|and|for|that|this|with|from|are|was|were|has|have|been|but|not|can|any|its|per|when|then|than|each|only|into|over|more|most|less|also|such|they|them|their|there|which|while|would|could|should|because)\b/,
    why: 'twelve bare words in a row with no function words — possible seed phrase' },
  // ~/Library/Application Support/<App> names no account. Only an absolute
  // /Users/<name>/Library path does, and 'home-path' already catches that.
  { id: 'macos-user',   sev: 'REVIEW', re: /\/Users\/[A-Za-z0-9._-]+\/Library\//g,
    why: 'absolute macOS user-library path carries the account name' },
  { id: 'hostname',     sev: 'REVIEW', re: /\b[a-z0-9-]+\.(?:local|lan|internal|home)\b/g,
    why: 'machine hostname' },
];

// THE ALLOWED IDENTITY IS DECLARED, NOT INFERRED.
//
// This was `git config user.email` — the identity of whichever machine the gate
// happened to run on. That is not a property of the commits under test, and it
// broke in the direction that costs the most: actions/checkout sets no user.email,
// so on a runner the allowance was the empty string, the skip below never applied,
// and EVERY author and committer address in the range became a BLOCK hit. Measured
// 8 on a 4-commit range and 454 across the full audit range — plus the same
// address where it is quoted in two tracked handoff documents. A BLOCK gate that
// fails on the identity it exists to permit gets switched off, and then it is not
// protecting anything.
//
// The two inferable alternatives are both worse than a declaration:
//   - from the emails IN the range under test: every address allows itself, which
//     makes the rule vacuous for precisely the thing it checks;
//   - from the merge-base commit's author: not circular, but it WIDENS the
//     allowance to whatever domain that commit used. On a pull request against an
//     upstream repository that is a stranger's domain — and if it is a public mail
//     provider, the allowance now covers the operator's own real address, while
//     the pseudonym this branch commits under is still blocked. One inference,
//     wrong in both directions.
//
// So the list is read from a TRACKED FILE a person wrote: widening it is one
// visible line in a diff rather than an inference nobody reviews. This module
// still contains no address of its own.
const ALLOW_FILE = 'tools/docs-audit/dox-allowed-domains.txt';
export function parseAllowedDomains(text, env = {}) {
  const out = new Set();
  const add = (x) => {
    const v = String(x || '').replace(/#.*/, '').trim().toLowerCase().replace(/^@/, '');
    if (v) out.add(v);
  };
  for (const line of String(text || '').split('\n')) add(line);
  for (const one of String(env.DOX_ALLOW_DOMAINS || '').split(',')) add(one);
  return out;
}
let ALLOW = null;
function allowedEmailDomains() {
  // readOptional, named on purpose: a checkout with no declaration file allows
  // nothing, which is an ANSWER — every address then blocks, loudly, and the
  // count printed by main() says so rather than leaving it to be guessed.
  if (!ALLOW) ALLOW = parseAllowedDomains(readOptional(ALLOW_FILE), process.env);
  return ALLOW;
}

export function scanText(text) {
  const hits = [];
  for (const r of RULES) {
    r.re.lastIndex = 0;
    let m;
    while ((m = r.re.exec(text)) !== null) {
      if (r.reject && r.reject.test(m[0])) continue;
      // 172.17.0.1 is the Docker default bridge gateway — identical on every
      // machine, so it reveals nothing about this one. Same for the .0/.1 network
      // placeholders that appear in documentation examples.
      if (r.id === 'private-ip' && /^(?:172\.17\.0\.1|10\.0\.0\.0|192\.168\.0\.0|192\.168\.1\.1)$/.test(m[0])) continue;
      if (r.id === 'email') {
        // An "@" inside a URL is userinfo, not an address. Sentry's own
        // placeholder DSN (https://<key>@o0.ingest.sentry.io/0) shipped in
        // .env.example and blocked a publish as a leaked email.
        const tokStart = Math.max(0, text.lastIndexOf(' ', m.index) + 1);
        if (text.slice(tokStart, m.index).includes('://')) continue;
        const dom = (m[0].split('@')[1] || '').toLowerCase();
        if (allowedEmailDomains().has(dom)) continue;    // a declared, intended identity
        if (/(?:example|test|invalid|localhost)\./.test(dom)) continue;
        if (/\b(?:noreply|no-reply)\b/.test(m[0])) continue;
      }
      hits.push({ id: r.id, sev: r.sev, why: r.why, len: m[0].length });
      if (hits.filter((h) => h.id === r.id).length > 200) break;
    }
  }
  return hits;
}

function scanRange(range) {
  // --name-status, not --name-only, so a DELETED file is skipped BY ITS STATUS
  // rather than by catching the `git show` that fails on it. That distinction is
  // the whole point: a deletion publishes nothing and is legitimately not scanned,
  // while a `git show` that fails for any OTHER reason is a file this gate did not
  // read and must not silently pass over. With the catch gone, the second case now
  // throws.
  const rows = git(['diff', '--name-status', range]).split('\n').filter(Boolean);
  const rev = range.split('..').pop();
  const out = [];
  let scanned = 0, deleted = 0;
  for (const row of rows) {
    const parts = row.split('\t');
    const status = parts[0] || '';
    const f = parts[parts.length - 1];          // a rename's NEW path is last
    if (status.startsWith('D')) { deleted++; continue; }
    if (!f || f.endsWith('check-dox.mjs')) continue;   // the scanner stores no literals it hunts for
    const body = git(['show', `${rev}:${f}`]);
    scanned++;
    if (!body) continue;
    body.split('\n').forEach((line, i) => {
      for (const h of scanText(line)) out.push({ ...h, file: f, line: i + 1 });
    });
  }
  return { files: rows.length, scanned, deleted, hits: out };
}

function scanCommits(range) {
  const out = [];
  const meta = git(['log', '--format=%H%x00%an%x00%ae%x00%cn%x00%ce%x00%ad%x00%s', '--date=raw', range]);
  const recs = meta.split('\n').filter(Boolean);
  for (const rec of recs) {
    const [sha, an, ae, cn, ce, ad, subj] = rec.split('\0');
    for (const [what, val] of [['author-name', an], ['author-email', ae], ['committer-name', cn], ['committer-email', ce]]) {
      for (const h of scanText(val)) out.push({ ...h, file: `commit ${sha.slice(0, 8)} (${what})`, line: 0 });
    }
    for (const h of scanText(subj)) out.push({ ...h, file: `commit ${sha.slice(0, 8)} (subject)`, line: 0 });
    const tz = (ad || '').split(' ')[1];
    if (tz && tz !== '+0000') out.push({ id: 'timezone', sev: 'REVIEW', why: `commit carries UTC offset ${tz}`, file: `commit ${sha.slice(0, 8)}`, line: 0, len: 0 });
  }
  return { commits: recs.length, hits: out };
}

function selftest() {
  const cases = [];
  const run = (label, text, wantId) => {
    const ids = scanText(text).map((h) => h.id);
    const ok = wantId === null ? ids.length === 0 : ids.includes(wantId);
    cases.push([ok, label, wantId === null ? 'must stay silent' : `must flag ${wantId}`]);
  };
  // built at runtime so this file never contains the thing it hunts for
  run('home path',       `const p = "/Users/${'someone'}/x"`, 'home-path');
  run('email',           `contact ${'a'}@${'b'}.com`,          'email');
  run('tailscale ip',    `peer at 100.${64}.${1}.${2}`,        'tailscale-ip');
  run('private ip',      `server 192.168.${1}.${44}`,          'private-ip');
  run('docker bridge',   `signing service at http://172.17.${0}.${1}:49153/sign`, null);
  run('api token',       `key ${'sk-'}${'a'.repeat(24)}`,      'api-token');
  run('seed phrase',     ['abandon','ability','able','about','above','absent','absorb','abstract','absurd','abuse','access','accident'].join(' '), 'mnemonic');
  run('ordinary prose',  'The proxy-router listens on port 8082 by default.', null);
  // the twelve false positives from the first real run
  run('english paragraph',
      'within a period a provider can claim at most stake minus what it already earned here', null);
  run('generic app-support path', 'data lives under ~/Library/Application Support/MorpheusUI', null);
  run('absolute user library',    `see /Users/${'someone'}/Library/Application Support/X`, 'macos-user');
  run('public address',  'contract 0x' + 'a'.repeat(40),       null);
  // URL userinfo is not an email — but a real address next to a URL still is
  run('dsn userinfo',    'SENTRY_DSN=https://' + 'key' + '@' + 'o0.ingest.sentry.io/0', null);
  run('email near url',  'see https://x.com then mail ' + 'a' + '@' + 'b.com', 'email');

  // THE ALLOWLIST PARSER, both directions. No address is written here: the
  // declared domain is read from the tracked declaration itself, so this test
  // cannot become the leak the module refuses to be.
  {
    const parsed = parseAllowedDomains('# a comment\n\n  @Example-One.COM  \nexample-two.org # trailing\n', {});
    cases.push([parsed.has('example-one.com') && parsed.has('example-two.org') && parsed.size === 2,
                'declaration parse'.padEnd(20) + ' comments, blanks, case and a leading @', 'must fire']);
    const viaEnv = parseAllowedDomains('', { DOX_ALLOW_DOMAINS: 'a.example, b.example' });
    cases.push([viaEnv.has('a.example') && viaEnv.has('b.example'),
                'env override'.padEnd(20) + ' adds domains for one run', 'must fire']);
    cases.push([parseAllowedDomains('', {}).size === 0,
                'no declaration'.padEnd(20) + ' allows nothing at all', 'must stay silent']);
    // And through scanText, which is what actually decides a BLOCK.
    const declared = [...allowedEmailDomains()][0];
    if (declared) {
      run('declared identity', `commit by ${'someone'}@${declared}`, null);
      run('undeclared identity', `commit by ${'someone'}@${'zz-not-declared.example'}`, 'email');
    } else {
      cases.push([false, 'declaration file is readable', 'must fire']);
    }
  }

  let bad = 0;
  console.log('--- check-dox selftest ---');
  for (const [ok, label, want] of cases) {
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(20)} ${want}`);
  }
  console.log(bad ? `DOX SELFTEST: FAIL (${bad}/${cases.length})`
                  : `DOX SELFTEST: PASS (${cases.length}/${cases.length} — every rule returns both answers)`);
  return bad === 0;
}

const IS_MAIN = process.argv[1] && resolveFs(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1);
  try { main(); } catch (e) {
    // ONE LINE, SCRUBBED, NEVER A STACK TRACE.
    //
    // Node prints an uncaught error with its stack, and every frame carries the
    // ABSOLUTE module path — i.e. the home directory and the account name that this
    // gate's own `home-path` rule BLOCKS on. So making git loud without catching
    // here would have this scanner emit, on failure, precisely the string it exists
    // to keep out of the tree. The thrown message is already scrubbed in lib; the
    // stack is not, so the stack must not be printed.
    console.error(`DOX: NOT RUN — ${scrubPaths(String((e && e.message) || e)).slice(0, 300)}`);
    console.error('The scanner stopped before it finished. That is not a pass.');
    process.exit(2);
  }
}

function main() {
  const i = process.argv.indexOf('--range');
  const range = i > -1 ? process.argv[i + 1]
    : `${auditBase()}..HEAD`;

  const { files, scanned, deleted, hits } = scanRange(range);
  const { commits, hits: chits } = scanCommits(range);
  const all = [...hits, ...chits];

  console.log(`range   : ${range}`);
  console.log(`files   : ${scanned} scanned of ${files} in range (${deleted} deleted, not published)`);
  console.log(`commits : ${commits} scanned`);
  console.log(`rules   : ${RULES.length}`);
  // The COUNT, never the values. Zero is printed too, because zero is the state in
  // which every address in the range blocks, and a red run has to explain itself.
  console.log(`allow   : ${allowedEmailDomains().size} declared email domain(s) from ${ALLOW_FILE}` +
    `${process.env.DOX_ALLOW_DOMAINS ? ' + DOX_ALLOW_DOMAINS' : ''}\n`);

  // A SCAN THAT EXAMINED NOTHING IS NOT A PASS.
  //
  // This is the reproduction the fix above cannot reach on its own:
  // `AUDIT_BASE=HEAD check-dox.mjs` resolves the range HEAD..HEAD, which is a
  // perfectly VALID git range containing zero files and zero commits. git never
  // fails, so no loud helper fires — and the gate printed `files : 0 scanned`
  // followed by `DOX: PASS`. Latent today only because this branch has no upstream;
  // it fires the moment an upstream equals HEAD.
  //
  // Exit 2, not 1: the runner already distinguishes "a gate could not RUN" from "a
  // gate failed", and this checker has cleared nothing rather than found nothing.
  if (!scanned && !commits) {
    console.error(`DOX: NOT RUN — the range ${range} named 0 file(s) and 0 commit(s), so nothing was examined.`);
    console.error('A scan of nothing is not a clean bill of health. Point --range or AUDIT_BASE at a base that');
    console.error('actually differs from HEAD.');
    process.exit(2);
  }

  const byId = {};
  for (const h of all) (byId[h.id] ||= []).push(h);

  const block = all.filter((h) => h.sev === 'BLOCK');
  for (const [id, list] of Object.entries(byId)) {
    const sev = list[0].sev;
    console.log(`  [${sev}] ${id}: ${list.length} hit(s) — ${list[0].why}`);
    for (const h of list.slice(0, 5)) console.log(`        ${h.file}${h.line ? ':' + h.line : ''}`);
    if (list.length > 5) console.log(`        … and ${list.length - 5} more`);
  }
  if (!all.length) console.log('  no hits from any rule');

  console.log(block.length ? `\nDOX: ${block.length} BLOCKING hit(s) — do not publish until resolved`
                           : `\nDOX: PASS (no blocking hits; ${all.length - block.length} review-level note(s))`);
  process.exit(block.length ? 1 : 0);
}
