#!/usr/bin/env node
// ============================================================================
// Anti-identity-leak gate.
//
// This file is PUBLIC. That constrains its own design: it must be able to
// catch a real leak (a maintainer's local username, personal email, home
// directory) without ever containing that value itself — a scanner that
// hardcodes the secret it's guarding against would BE the leak. So every
// built-in check here is a GENERIC pattern (any local absolute path, any git
// author email outside an explicit allowlist) that needs no secret to work.
// A maintainer who wants EXTRA, specific strings checked (a real name, a
// personal domain) supplies them at runtime — from a gitignored local file
// (`.opsec-patterns.local.json`, never committed) or from an environment
// variable a CI secret can populate — never from this source file.
//
// Built to run with zero dependencies (plain Node ESM), matching this repo's
// other maintenance scripts (ui-desktop/scripts/build-app.mjs,
// ui-desktop/scripts/ensure-env.mjs).
//
// Modes (first CLI arg):
//   --staged            scan `git diff --cached` (added/modified lines only)
//   --tree               scan every git-tracked file's current content, text
//                        files by reading them, binary-ish files by
//                        extracting printable-ASCII runs (a `strings`
//                        equivalent) — the released proxy-router binaries
//                        leaked a local path through exactly this class of
//                        file, so tree mode does not skip them.
//   --diff <git-diff-args...>   scan added/modified lines from an arbitrary
//                        `git diff <args>` invocation — a push-time content
//                        check over a commit range, the --staged logic
//                        generalized past just the index.
//   --commits <rev-list-args...>   check author/committer email of every
//                        commit `git rev-list <args>` resolves, against the
//                        allowlist. Takes raw git-rev-list arguments so the
//                        caller (a pre-push hook, or CI computing a push
//                        event's before..after) decides the range.
//   (no args)            defaults to --tree, the safest "check everything"
//                        run for a manual invocation.
//
// Exit codes: 0 clean, 1 leak(s) found (details on stderr), 2 usage/internal
// error. Never exits nonzero for "nothing to check" (e.g. no staged files).
// ============================================================================

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Generic, safe-to-commit patterns. No secret needs to exist here for these
// to work — they describe a SHAPE (a local absolute path), not a value.
// ---------------------------------------------------------------------------
const GENERIC_PATTERNS = [
  { name: 'macOS/Linux user home path', re: /\/Users\/[A-Za-z0-9._-]+/g },
  { name: 'Linux home path', re: /\/home\/[A-Za-z0-9._-]+/g },
  { name: 'Windows user home path', re: /C:\\Users\\[A-Za-z0-9._-]+/g },
];

// Placeholders that are the generic pattern's own worked example, not a real
// leak — a comment or test fixture saying "e.g. /Users/yourname/..." is not
// itself a personal identifier. Kept narrow and exact-match on the captured
// segment, not a broad exemption.
const PLACEHOLDER_SEGMENTS = new Set([
  'x', 'me', 'name', 'yourname', 'username', 'user', 'you', 'someone',
  'johnsmith', 'jsmith', 'example', 'test', 'testuser', 'placeholder',
]);

// Only cowboycoderhq's own identity may author a NEW commit on this fork.
// Extend via the optional local/secret config's `allowedAuthorPatterns`, not
// by editing this default.
const DEFAULT_ALLOWED_AUTHOR_PATTERNS = [/@cowboycoderhq\.com$/i];

// ---------------------------------------------------------------------------
// Optional extra patterns — real, specific strings a maintainer wants
// checked, supplied at runtime, never committed here.
// ---------------------------------------------------------------------------
function loadExtraConfig() {
  const patterns = [];
  const allowedAuthorPatterns = [...DEFAULT_ALLOWED_AUTHOR_PATTERNS];

  const localPath = resolve(repoRoot, '.opsec-patterns.local.json');
  if (existsSync(localPath)) {
    try {
      const cfg = JSON.parse(readFileSync(localPath, 'utf8'));
      for (const p of cfg.patterns ?? []) patterns.push(String(p));
      for (const p of cfg.allowedAuthorPatterns ?? []) {
        allowedAuthorPatterns.push(new RegExp(p, 'i'));
      }
    } catch (e) {
      console.warn(`[opsec] could not parse .opsec-patterns.local.json: ${e.message}`);
    }
  }

  // CI populates this from a repository secret — see .github/workflows/opsec-check.yml.
  // Newline- or comma-separated; blank entries ignored.
  const envPatterns = process.env.OPSEC_EXTRA_PATTERNS ?? '';
  for (const p of envPatterns.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)) {
    patterns.push(p);
  }

  return { patterns, allowedAuthorPatterns };
}

function buildMatchers(extraPatterns) {
  const matchers = GENERIC_PATTERNS.map((p) => ({ name: p.name, re: p.re, isGeneric: true }));
  for (const raw of extraPatterns) {
    // Extra patterns are literal strings, not regex — a maintainer's real
    // name/email is not something to write as a regex by hand under stress.
    const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    matchers.push({ name: '(configured pattern)', re: new RegExp(escaped, 'gi'), isGeneric: false });
  }
  return matchers;
}

// A generic-path hit is a placeholder, not a leak, if its captured user
// segment is in the known-safe list above.
function isPlaceholderHit(matcherName, text) {
  if (!/home path/i.test(matcherName)) return false;
  const seg = text.match(/(?:\/Users\/|\/home\/|Users\\)([A-Za-z0-9._-]+)/i)?.[1];
  return seg ? PLACEHOLDER_SEGMENTS.has(seg.toLowerCase()) : false;
}

function scanText(matchers, text) {
  const hits = [];
  for (const m of matchers) {
    m.re.lastIndex = 0;
    let match;
    while ((match = m.re.exec(text))) {
      if (!isPlaceholderHit(m.name, match[0])) hits.push({ pattern: m.name, text: match[0] });
      if (!m.re.global) break;
    }
  }
  return hits;
}

// Binary "strings" equivalent: extract runs of >=6 printable ASCII bytes.
function extractStrings(buf) {
  const runs = [];
  let start = -1;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    const printable = b >= 0x20 && b <= 0x7e;
    if (printable) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      if (i - start >= 6) runs.push(buf.toString('ascii', start, i));
      start = -1;
    }
  }
  if (start !== -1 && buf.length - start >= 6) runs.push(buf.toString('ascii', start, buf.length));
  return runs.join('\n');
}

const TEXT_EXT = /\.(md|mdx|ts|tsx|js|jsx|mjs|cjs|json|json5|yml|yaml|toml|ini|cfg|conf|env|sh|bash|zsh|go|sol|py|rb|c|h|cpp|hpp|rs|css|scss|html|htm|svg|txt|sql|proto|graphql|gitignore|gitattributes|dockerfile|editorconfig|prettierrc|eslintrc)$/i;

function isLikelyText(path) {
  if (TEXT_EXT.test(path)) return true;
  return !/\.(png|jpg|jpeg|gif|ico|woff2?|ttf|otf|eot|wasm|node|dylib|so|dll|a|zip|gz|tar|pdf|mp4|mp3|wav|bin|dmg|exe|app)$/i.test(path);
}

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 });
}

// ---------------------------------------------------------------------------
// Mode: --tree — every tracked file, current content.
// ---------------------------------------------------------------------------
function runTree(matchers) {
  const files = git(['ls-files']).split('\n').filter(Boolean);
  const findings = [];
  for (const rel of files) {
    const abs = resolve(repoRoot, rel);
    let text;
    if (isLikelyText(rel)) {
      try {
        text = readFileSync(abs, 'utf8');
      } catch {
        continue; // unreadable (broken symlink etc.) — not this gate's concern
      }
    } else {
      let buf;
      try {
        buf = readFileSync(abs);
      } catch {
        continue;
      }
      text = extractStrings(buf);
    }
    for (const hit of scanText(matchers, text)) {
      findings.push({ file: rel, ...hit });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Mode: --staged / --diff — added/modified lines only, from either the
// index (--cached) or an arbitrary git-diff revision range.
// ---------------------------------------------------------------------------
function scanDiffOutput(matchers, diff) {
  const findings = [];
  let currentFile = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6);
      continue;
    }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const content = line.slice(1);
    for (const hit of scanText(matchers, content)) {
      findings.push({ file: currentFile ?? '(unknown)', ...hit, text: content.trim().slice(0, 200) });
    }
  }
  return findings;
}

function runStaged(matchers) {
  let diff;
  try {
    diff = git(['diff', '--cached', '-U0', '--no-color']);
  } catch {
    return [];
  }
  return scanDiffOutput(matchers, diff);
}

function runDiff(revRangeArgs, matchers) {
  if (revRangeArgs.length === 0) return [];
  let diff;
  try {
    diff = git(['diff', '-U0', '--no-color', ...revRangeArgs]);
  } catch (e) {
    console.warn(`[opsec] git diff failed (${e.message}); skipping content scan for this range`);
    return [];
  }
  return scanDiffOutput(matchers, diff);
}

// ---------------------------------------------------------------------------
// Mode: --commits <rev-list args...> — author/committer allowlist.
// ---------------------------------------------------------------------------
function runCommits(revListArgs, allowedAuthorPatterns) {
  if (revListArgs.length === 0) return [];
  let out;
  try {
    out = git(['rev-list', '--format=%H%x1f%an <%ae>%x1f%cn <%ce>', ...revListArgs]);
  } catch (e) {
    console.warn(`[opsec] git rev-list failed (${e.message}); skipping commit-author check`);
    return [];
  }
  const findings = [];
  const lines = out.split('\n').filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('commit ')) continue; // the "commit <sha>" header line rev-list --format also prints
    const [sha, authorLine, committerLine] = lines[i].split('\x1f');
    if (!authorLine) continue;
    for (const [role, who] of [['author', authorLine], ['committer', committerLine]]) {
      if (!who) continue;
      const allowed = allowedAuthorPatterns.some((re) => re.test(who));
      if (!allowed) {
        findings.push({ file: `commit ${sha?.slice(0, 12)}`, pattern: `${role} not on the allowlist`, text: who });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
function report(findings) {
  if (findings.length === 0) return 0;
  console.error(`\nOPSEC GATE: ${findings.length} possible identity leak(s) found:\n`);
  for (const f of findings) {
    console.error(`  ${f.file}: [${f.pattern}] ${f.text}`);
  }
  console.error(
    '\nIf any of these is real, remove it before committing/pushing. If it is a\n' +
      'false positive (a generic placeholder), extend PLACEHOLDER_SEGMENTS in\n' +
      'scripts/check-identity-leak.mjs rather than bypassing the gate.\n',
  );
  return 1;
}

function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const { patterns, allowedAuthorPatterns } = loadExtraConfig();
  const matchers = buildMatchers(patterns);

  let findings = [];
  switch (mode ?? '--tree') {
    case '--staged':
      findings = runStaged(matchers);
      break;
    case '--tree':
      findings = runTree(matchers);
      break;
    case '--diff':
      findings = runDiff(rest, matchers);
      break;
    case '--commits':
      findings = runCommits(rest, allowedAuthorPatterns);
      break;
    default:
      console.error(`[opsec] unknown mode: ${mode}`);
      process.exit(2);
  }
  process.exit(report(findings));
}

main();
