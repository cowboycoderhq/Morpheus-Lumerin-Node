// Shared loaders for the docs audit. Every function here reads a SOURCE OF TRUTH
// artifact — never another document. If a loader ever reads a .md/.mdx file to
// establish truth, that is a bug: docs are the thing under test.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// fileURLToPath, not .pathname: the vault path contains a space and .pathname
// percent-encodes it, yielding a cwd that does not exist.
export const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export const r = (...p) => join(REPO, ...p);
// READ FAILS LOUDLY. An unreadable file is an ERROR, not an empty file.
//
// This was `try { ... } catch { return ''; }`, and that one `catch` defeated every
// caller downstream that tried to NOTICE a file it could not read. Measured case:
// review-coherence's buildPacket() wraps `reader(f)` in a try/catch that pushes to
// a `dropped` list precisely so the record can name every file the reviewer was
// never shown. That catch COULD NOT FIRE. A missing file arrived as an empty
// string, was packed as a FILE header with no body, and the coherence record
// counted it among `files reviewed` — an instrument reporting success while doing
// nothing, which is the one failure shape this whole audit exists to catch.
//
// The thrown message is REPO-RELATIVE and carries only the errno. It must be: the
// caller above writes it into a COMMITTED, published record, and node's own
// message embeds the ABSOLUTE path — i.e. the home directory and the account name
// that check-dox and check-hygiene exist to keep out of the tree. A loud failure
// that doxes the machine would just trade one defect for a worse one.
export const read = (p) => {
  try { return readFileSync(r(p), 'utf8'); }
  catch (e) { throw new Error(`cannot read ${p}: ${(e && e.code) || 'read failed'}`); }
};
// The old behaviour, kept but made EXPLICIT and named at each call site, for the
// callers where ABSENCE IS AN ANSWER rather than a fault: an .env.example a
// component does not ship, a go.mod for a module this checkout does not contain,
// a ledger row pointing at a file since deleted. Opting in is one word and shows
// up in review; the dangerous case is no longer everybody's silent default.
export const readOptional = (p) => { try { return readFileSync(r(p), 'utf8'); } catch { return ''; } };
export const has = (p) => existsSync(r(p));

// ------------------------------------------------- the file corpus, git or not
// Every loader below needs "the files in this project". `git ls-files` answers
// that in a checkout — but the checkers must also run where there is no history:
// a released tarball, or the history-free review snapshot that exists precisely
// so a reviewer cannot read our commit messages. There, git threw and three
// gates died with a raw stack trace instead of an answer.
//
// So: ask git, and fall back to walking the filesystem with the same exclusions.
const EXCLUDE = /(^|\/)(\.git|node_modules|dist|out|build|\.next|\.turbo)(\/|$)/;
let _corpus = null;
export function repoFiles() {
  if (_corpus) return _corpus;
  try {
    _corpus = execSync('git ls-files', { cwd: REPO, encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n').filter(Boolean);
    if (_corpus.length) return _corpus;
  } catch { /* not a checkout — walk instead */ }
  const out = [];
  (function walk(dir, rel) {
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (EXCLUDE.test(r)) continue;
      if (e.isDirectory()) walk(join(dir, e.name), r);
      else if (e.isFile()) out.push(r);
    }
  })(REPO, '');
  _corpus = out.sort();
  return _corpus;
}
export const gitAvailable = () => {
  try { execSync('git rev-parse --git-dir', { cwd: REPO, stdio: 'ignore' }); return true; }
  catch { return false; }
};
const match = (f, exts) => exts.some((e) => f.endsWith(e));

export const sha8 = (s) => createHash('sha1').update(s).digest('hex').slice(0, 8);

// ---------------------------------------------------------------- doc corpus
// Every tracked .md/.mdx/.mdc except verify/ evidence files, node_modules, the
// untracked nested clone, and the legal terms copy.
//
// .mdc WAS MISSING, AND THE OMISSION HAD A DIRECTION.
// `.cursor/rules/morpheus.mdc` is a rule-numbered agent instruction file carrying
// `alwaysApply: true`, so a code generator loads it every session — and it sat
// outside all eleven gates. It and AGENTS.md are forked from a common ancestor and
// number their rules in parallel, so a disagreement at a matching number hands an
// agent a confident, opposite instruction depending on which file it read. Of the
// ten shared rules, three had drifted into direct contradiction and the .mdc was
// the wrong side of all three — including that unused stake returns at session
// close, which is verbatim the claim the docs exist to correct and would have an
// agent tell a user their funds come back.
//
// The asymmetry has exactly one cause: the gated file kept being corrected and the
// ungated one held the ancestor's claims. recurrence — the gate whose entire job is
// catching a corrected claim creeping back — was structurally unable to see it.
// A checker's corpus filter is part of what it checks.
//
// LICENSE files are the other unscoped text in the tree and stay out deliberately:
// they are legal boilerplate making no claim about this system, which is the same
// reason termsAndConditions.md is excluded by name below.
export function docFiles() {
  return repoFiles().filter((f) => match(f, ['.md', '.mdx', '.mdc'])).filter((f) =>
    !f.startsWith('verify/') &&
    !f.includes('node_modules/') &&
    !f.includes('ui-desktop/Morpheus-Lumerin-Node/') &&
    f !== 'ui-desktop/src/renderer/src/termsAndConditions.md');
}

// ------------------------------------------------------------------ env vars
// Authoritative: config.go struct tags + every .env.example in the repo.
export function envNames() {
  const m = new Map(); // NAME -> evidence string
  const cfg = 'proxy-router/internal/config/config.go';
  readOptional(cfg).split('\n').forEach((line, i) => {
    for (const mt of line.matchAll(/env:"([A-Z0-9_]+)"/g)) {
      if (!m.has(mt[1])) m.set(mt[1], `${cfg}:${i + 1}`);
    }
  });
  for (const f of ['proxy-router/.env.example', 'proxy-router/.env.example.win',
                   'cli/.env.example', 'ui-desktop/.env.example',
                   'smart-contracts/.env.example']) {
    readOptional(f).split('\n').forEach((line, i) => {
      const mt = line.match(/^\s*#?\s*([A-Z][A-Z0-9_]{2,})\s*=/);
      if (mt && !m.has(mt[1])) m.set(mt[1], `${f}:${i + 1}`);
    });
  }
  return m;
}

// ----------------------------------------------------------- swagger endpoints
export function swaggerPaths() {
  const y = readOptional('proxy-router/docs/swagger.yaml');
  const s = new Map();
  const lines = y.split('\n');
  let inPaths = false;
  lines.forEach((line, i) => {
    if (/^paths:/.test(line)) { inPaths = true; return; }
    if (inPaths && /^\S/.test(line)) inPaths = false;
    if (!inPaths) return;
    const mt = line.match(/^  (\/\S*):\s*$/);
    if (mt) s.set(mt[1], `proxy-router/docs/swagger.yaml:${i + 1}`);
  });
  return s;
}
// /blockchain/models/{id}/bids -> /blockchain/models/*/bids  (param-agnostic)
export const normPath = (p) => p.replace(/\{[^}]+\}/g, '*').replace(/\/+$/, '') || '/';

// ------------------------------------------------------------- build commands
export function npmScripts() {
  const m = new Map(); // script -> [pkg paths]
  const pkgs = repoFiles().filter((p) => p.endsWith('package.json'))
    .filter((p) => !p.includes('node_modules/') &&
      !p.includes('ui-desktop/Morpheus-Lumerin-Node/'));
  for (const p of pkgs) {
    let j; try { j = JSON.parse(read(p)); } catch { continue; }
    for (const k of Object.keys(j.scripts || {})) {
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    }
  }
  return m;
}

export function makeTargets() {
  const m = new Map();
  const mks = repoFiles().filter((p) => p.endsWith('Makefile'))
    .filter((p) => !p.includes('node_modules/'));
  for (const p of mks) {
    read(p).split('\n').forEach((line) => {
      const mt = line.match(/^([a-zA-Z][a-zA-Z0-9_.-]*):/);
      if (mt) { if (!m.has(mt[1])) m.set(mt[1], []); m.get(mt[1]).push(p); }
    });
  }
  return m;
}

// ------------------------------------------------ addresses (values never printed)
// Returns a Set of lowercased 0x addresses drawn ONLY from source-of-truth
// artifacts. Callers compare membership and report match/mismatch; the audit
// never emits an address value into a report, a ledger, or a model's context.
export function truthAddresses() {
  const set = new Set();
  const add = (t) => { for (const mt of t.matchAll(/0x[a-fA-F0-9]{40}/g)) set.add(mt[0].toLowerCase()); };
  for (const f of ['proxy-router/.env.example', 'proxy-router/.env.example.win',
                   'ui-desktop/.env.example', 'smart-contracts/.env.example']) add(readOptional(f));
  const dd = r('smart-contracts/deploy/data');
  if (existsSync(dd)) for (const f of readdirSync(dd)) if (f.endsWith('.json')) add(read(join('smart-contracts/deploy/data', f)));
  return set;
}

// ------------------------------------------------------------------- git tags
export function tags() {
  // No tags outside a checkout; callers treat an empty list as "cannot verify".
  try { return execSync('git tag --list', { cwd: REPO, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).split('\n').filter(Boolean); }
  catch { return []; }
}

// --------------------------------------------------------------- docs.json nav
export function navPages() {
  let j; try { j = JSON.parse(readOptional('docs/docs.json')); } catch { return new Set(); }
  const out = new Set();
  // Only strings inside a `pages` array are page slugs. Walking every string
  // also collects group/tab titles, which are not pages.
  const walk = (n) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!n || typeof n !== 'object') return;
    for (const [k, v] of Object.entries(n)) {
      if (k === 'pages' && Array.isArray(v)) {
        for (const e of v) { if (typeof e === 'string') out.add(e); else walk(e); }
      } else walk(v);
    }
  };
  walk(j.navigation);
  return out;
}

// ------------------------------------------------------------------ TSV utils
export const COLS = ['claim_id', 'lane', 'file', 'line', 'kind', 'token',
                     'in_fence', 'verbatim', 'proposed_check', 'verdict', 'evidence'];
const esc = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();
export const tsvRow = (o) => COLS.map((c) => esc(o[c])).join('\t');
export const tsvHeader = () => COLS.join('\t');
export function tsvParse(text) {
  const lines = text.split('\n').filter(Boolean);
  // Empty input used to throw on `lines.shift().split` — a stack trace instead of
  // an answer. Return nothing; the CALLER decides whether nothing is acceptable,
  // because a pipeline stage that quietly succeeds on no input is worse than one
  // that crashes.
  if (!lines.length) return [];
  const head = lines.shift().split('\t');
  return lines.map((l) => { const p = l.split('\t'); const o = {}; head.forEach((h, i) => (o[h] = p[i] ?? '')); return o; });
}

// Mark which lines of a doc sit inside a fenced code block.
export function fenceMap(text) {
  const lines = text.split('\n');
  const inF = new Array(lines.length).fill(false);
  let open = false;
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) { open = !open; inF[i] = true; return; }
    inF[i] = open;
  });
  return inF;
}

// ------------------------------------------------- repo-wide identifier index
// One pass over every tracked non-doc source file, recording where each
// ALL_CAPS identifier and each file path lives. This widens the authority set
// so a FALSE verdict means "appears nowhere in this repo" rather than "absent
// from the one narrow list I happened to check" — the latter manufactures
// findings for things like Solidity constants and CI-only env vars.
let _idx = null;
export function sourceIndex() {
  if (_idx) return _idx;
  const files = repoFiles()
    .filter((f) => !f.includes('node_modules/') && !f.includes('ui-desktop/Morpheus-Lumerin-Node/'))
    .filter((f) => !/\.(md|mdx|png|jpg|jpeg|gif|svg|ico|pdf|zip|gz|woff2?|ttf|lock|sum)$/i.test(f));
  const ident = new Map();          // ALL_CAPS token -> "file:line"
  for (const f of files) {
    let t; try { t = readFileSync(join(REPO, f), 'utf8'); } catch { continue; }
    if (t.length > 2_000_000) continue;
    t.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g)) {
        if (!ident.has(m[0])) ident.set(m[0], `${f}:${i + 1}`);
      }
    });
  }
  // every tracked path, plus a suffix map so component-relative references resolve
  const allPaths = repoFiles().filter((f) => !f.includes('node_modules/'));
  const suffix = new Map();         // "a/b.go" -> [full paths ending with it]
  for (const p of allPaths) {
    const parts = p.split('/');
    for (let i = 0; i < parts.length; i++) {
      const s = parts.slice(i).join('/');
      if (!suffix.has(s)) suffix.set(s, []);
      suffix.get(s).push(p);
    }
  }
  // directories too — docs reference dirs as often as files
  const dirs = new Set();
  for (const p of allPaths) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  for (const d of dirs) {
    const parts = d.split('/');
    for (let i = 0; i < parts.length; i++) {
      const s = parts.slice(i).join('/');
      if (!suffix.has(s)) suffix.set(s, []);
      if (!suffix.get(s).includes(d)) suffix.get(s).push(d);
    }
  }
  _idx = { ident, suffix };
  return _idx;
}

// Go module dependencies, for import-path claims
export function goModules() {
  const s = new Set();
  for (const f of ['proxy-router/go.mod', 'cli/go.mod', 'launcher/go.mod']) {
    for (const m of readOptional(f).matchAll(/^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]{2,}\/[^\s]+)\s+v/gm)) s.add(m[1]);
  }
  return s;
}

// ------------------------------------------------------------ git, loudly
// THE THIRD COPY OF ONE DECISION.
//
// `read` above returned '' on error until it was made to throw. The same shape
// survived in two private helpers: check-dox.mjs and scrub.mjs each wrapped git in
// `catch { return ''; }`. A failed `git diff` then arrived as an empty file list,
// and check-dox printed `files : 0 scanned` followed by `DOX: PASS` — a
// BLOCK-severity gate reporting success having examined nothing. Fixing one copy
// of a decision leaves the other copies to fail; three copies is WHY this survived
// being fixed once. So there is one, here, and the silent behaviour is opt-in and
// named at the call site.
//
// The thrown message is SCRUBBED and TRUNCATED, for the same reason read()'s is.
// It reaches a gate's stderr and can reach a committed, published record, and
// git's own stderr embeds ABSOLUTE paths — the home directory and the account name
// that check-dox and check-hygiene exist to keep out of the tree. A loud failure
// that doxes the machine trades one defect for a worse one.
export function scrubPaths(text) {
  let t = String(text == null ? '' : text);
  if (REPO && REPO.length > 3) t = t.split(REPO).join('<repo>');
  const home = process.env.HOME;
  if (home && home.length > 3) t = t.split(home).join('<home>');
  // Belt: any remaining absolute home-shaped path, the same shape check-dox
  // blocks on. A message this function returns must never be able to fail that gate.
  return t.replace(/\/(?:Users|home)\/[A-Za-z0-9._-]{2,}/g, '<home>');
}

export function git(args, opts = {}) {
  try {
    return execFileSync('git', args, {
      cwd: REPO, encoding: 'utf8', maxBuffer: 128 << 20,
      // stderr is CAPTURED, not inherited: it is the diagnosis, and it is also the
      // one channel that carries absolute paths. Captured means it can be scrubbed
      // before anyone sees it.
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    });
  } catch (e) {
    const status = (e && (e.status != null ? e.status : e.code));
    const detail = String((e && e.stderr) || (e && e.message) || '')
      .split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 2).join(' | ');
    // The DIAGNOSIS survives — silence is the bug, not the cure.
    throw new Error(scrubPaths(`git ${args.join(' ')} failed (status ${status == null ? 'unknown' : status})${detail ? `: ${detail}` : ''}`).slice(0, 400));
  }
}

// The opt-in silent variant, named at every call site the way readOptional is, for
// the calls where ABSENCE IS AN ANSWER rather than a fault: `git config user.email`
// in a checkout that declares none. One word, and it shows up in review; the
// dangerous case is no longer everybody's silent default.
export const gitOptional = (args, opts = {}) => { try { return git(args, opts); } catch { return ''; } };

// ------------------------------------------------------- the audit's base ref
// "What did this audit change?" is a diff against the branch point. That ref was
// hardcoded to `stake-duration`, which is only correct in the tree the audit
// started in. In the publishable clone the branch sits on the rewritten public
// history, which shares NO ancestor with the local `stake-duration` — so the
// hardcoded range died with `fatal: no merge base` and a raw stack trace, i.e.
// the gate stopped reporting without ever saying it had stopped.
//
// Resolve it instead: first candidate that both exists and has a merge base with
// HEAD wins. If none does, say so in one line and exit, rather than throwing.
let _auditBase = null;
export function auditBase() {
  if (_auditBase) return _auditBase;
  const try_ = (...a) => { try { return execSync(`git ${a.join(' ')}`, { cwd: REPO, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); } catch { return ''; } };
  const upstream = try_('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}');
  // `ownBranch` marks the candidate that is THIS BRANCH's own remote-tracking
  // ref. It needs a different test from the others — see the skip below.
  const candidates = [
    { ref: process.env.AUDIT_BASE, via: 'AUDIT_BASE' },
    { ref: upstream, via: '@{upstream}', ownBranch: true },
    { ref: 'stake-duration', via: 'fallback' },
    { ref: 'origin/stake-duration', via: 'fallback' },
  ].filter((c) => c.ref);
  const head = try_('rev-parse', 'HEAD');
  const skipped = [];
  for (const c of candidates) {
    const sha = try_('rev-parse', '--verify', '--quiet', `${c.ref}^{commit}`);
    if (!sha) { skipped.push(`${c.ref} — does not resolve`); continue; }
    const mb = try_('merge-base', c.ref, 'HEAD');
    if (!mb) { skipped.push(`${c.ref} — shares no history with HEAD`); continue; }
    // A base at or ahead of HEAD yields an EMPTY corpus, and every history gate
    // then passes having examined nothing. That is the shape this suite exists to
    // refuse, so skip such a candidate rather than measure zero lines and call it
    // clean. It is not hypothetical: once `push -u` sets an upstream, @{upstream}
    // above resolves to this branch's own remote ref and merge-base becomes HEAD.
    if (mb === head) { skipped.push(`${c.ref} — at or ahead of HEAD, so the corpus would be empty`); continue; }
    // ONE CASE TOO NARROW, AND THE MISSING CASE IS THE ORDINARY ONE.
    //
    // The check above only catches an upstream that equals HEAD. With a single
    // UNPUSHED commit the upstream is merely BEHIND HEAD, merge-base is the
    // upstream rather than HEAD, and it was accepted — so the audit's corpus
    // silently became "my unpushed commits" instead of "what this branch added".
    // Measured on this repo the moment a sibling commit landed: the base moved
    // from origin/stake-duration to origin/pr/docs-accuracy and the corpus went
    // from 23464 added doc lines to 32, with verify-fixes then reporting
    // `economic figures re-derived : 0` and PASS. Nothing in the output named
    // which base had been used, so the collapse was invisible.
    //
    // The test is ANCESTRY, and it applies ONLY to this branch's own upstream.
    // A blanket "reject any ancestor of HEAD" would also reject
    // origin/stake-duration — the branch point, and the correct answer. The
    // distinction is whose line of development the ref sits on: another branch's
    // tip that HEAD descends from IS a branch point; this branch's own remote ref
    // is just HEAD minus whatever has not been pushed yet.
    if (c.ownBranch && mb === sha) {
      skipped.push(`${c.ref} — this branch's own upstream, an ancestor of HEAD: `
        + `the diff would be only the ${try_('rev-list', '--count', `${sha}..HEAD`) || '?'} unpushed commit(s), not the audit`);
      continue;
    }
    _auditBase = c.ref;
    // PRINT THE BASE. A shrunken corpus used to be indistinguishable from a clean
    // one: three gates report "examined N lines" with no statement of what they
    // measured against, so a base that collapsed the range read as a tree with
    // little in it. CI already prints this (.github/workflows/docs-gates.yml:98-103,
    // added for the same reason); this brings a local or pre-push run to parity.
    const added = gitOptional(['diff', '-U0', `${c.ref}...HEAD`, '--', '*.md', '*.mdx', '*.mdc'])
      .split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
    console.log(`audit base: ${c.ref} @ ${sha.slice(0, 8)} (via ${c.via}) — `
      + `${try_('rev-list', '--count', `${mb}..HEAD`) || '?'} commit(s), ${added} added line(s) across *.md/*.mdx/*.mdc in range`);
    for (const s of skipped) console.log(`  base skipped: ${s}`);
    return _auditBase;
  }
  console.error('no usable audit base. Candidates and why each was rejected:');
  for (const s of skipped) console.error(`  ${s}`);
  console.error('set AUDIT_BASE to a ref that shares history with HEAD and is behind it.');
  process.exit(2);
}
