#!/usr/bin/env node
// check-addresses — the one class this audit structurally cannot read.
//
// Addresses are redacted before they reach the reviewer, so no blind reviewer —
// human or model — can confirm the literal value in a doc is the right contract.
// What CAN be checked mechanically is consistency: whether every doc address
// also appears in a non-doc source file, and whether a given key holds the same
// value everywhere.
//
// This never prints an address. It prints roles, counts and verdicts, and writes
// block-explorer links to a LOCAL FILE for a human to open — so the values never
// transit a transcript, a report, or a model's context.
//
//   node tools/docs-audit/check-addresses.mjs [--links <path>]
//   node tools/docs-audit/check-addresses.mjs --selftest

import { writeFileSync } from 'node:fs';
import { join, resolve as resolveFs } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { REPO, repoFiles, read, docFiles, scrubPaths } from './lib.mjs';

const RE = /0x[a-fA-F0-9]{40}/g;
// Obvious non-addresses: doc placeholders and all-same-digit fixtures.
export const isPlaceholder = (a) => {
  const b = a.slice(2).toLowerCase();
  return /^(.)\1{39}$/.test(b) || /^0{30,}/.test(b) || /^1234/.test(b) || /^(dead|beef|cafe)/.test(b);
};


// A doc address with no source backing only matters if the reader would COPY it
// into a config. Enumerating the SAFE forms (sample JSON, curl headers, table
// cells, prose) never converges — there is always another shape. Invert it: flag
// only what is presented as a config ASSIGNMENT, which is the actual risk.
export function presentedAsConfig(line) {
  return /\b[A-Z][A-Z0-9_]{3,}\s*[=:]\s*['"`]?0x[a-fA-F0-9]{40}/.test(line);
}

// errno if the reader supplies one, else its message. Never the stack: every
// frame carries an absolute module path, which is the string these gates exist
// to keep out of a published tree.
const reason = (e) => (e && e.code) || String((e && e.message) || 'read failed').slice(0, 100);

// A FILE THAT CANNOT BE READ IS NOT A FILE WITHOUT ADDRESSES.
//
// This loop used to be `try { body = reader(f); } catch { continue; }`, and that
// catch became REACHABLE the day lib's read() started throwing instead of
// returning an empty string. From then on an unreadable file was a file whose
// undocumented address this BLOCKING gate never saw, while the run reported PASS
// over a corpus it had quietly shrunk. The unreadable set is returned beside the
// addresses so the caller has to decide about it — silence is no longer an option
// the shape of this function offers.
export function collect(files, reader) {
  const seen = new Map();  // addr -> { files:Set, keys:Set, docs:Set }
  const unreadable = [];   // { file, code }
  for (const f of files) {
    let body;
    try { body = reader(f); }
    // errno when the reader has one; otherwise the reader's own message, which
    // lib's read() already builds repo-relative so it cannot carry a home path.
    catch (e) { unreadable.push({ file: f, code: reason(e) }); continue; }
    body.split('\n').forEach((line, i) => {
      for (const m of line.match(RE) || []) {
        const a = m.toLowerCase();
        if (!seen.has(a)) seen.set(a, { files: new Set(), keys: new Set(), docs: new Set(), lines: [] });
        const e = seen.get(a);
        e.files.add(f);
        if (/\.(md|mdx)$/.test(f)) { e.docs.add(`${f}:${i + 1}`); e.lines.push(line); }
        const k = line.match(/\b([A-Z][A-Z0-9_]{4,})\s*[=:]/) || line.match(/"([a-zA-Z]+)"\s*:/);
        if (k) e.keys.add(k[1]);
      }
    });
  }
  return { addresses: seen, unreadable };
}

function selftest() {
  const cases = [];
  const A = '0x' + 'a'.repeat(40);
  const B = '0x' + '1234' + 'b'.repeat(36);
  const C = '0x' + 'c'.repeat(39) + '7';
  cases.push([isPlaceholder(A), 'repeating-digit fixture is a placeholder', 'must fire']);
  cases.push([isPlaceholder(B), '0x1234… sample is a placeholder', 'must fire']);
  cases.push([!isPlaceholder(C), 'a real-looking address is not a placeholder', 'must stay silent']);

  const files = { 'a.env': `TOKEN_ADDRESS=${C}`, 'b.mdx': `see ${C} and ${A}` };
  const { addresses: got, unreadable: none } = collect(Object.keys(files), (f) => files[f]);
  cases.push([none.length === 0, 'a readable corpus reports nothing unreadable', 'must stay silent']);
  {
    // The other direction, and the one that matters: a file this gate cannot open
    // is NAMED. It used to `continue`, so an undocumented address in it was never
    // seen and the gate still passed.
    const boom = (f) => { if (f === 'locked.env') { const e = new Error('denied'); e.code = 'EACCES'; throw e; } return files[f] || ''; };
    const r = collect(['a.env', 'locked.env'], boom);
    cases.push([r.unreadable.length === 1 && r.unreadable[0].file === 'locked.env' && r.unreadable[0].code === 'EACCES',
                'an unreadable file is NAMED, not skipped', 'must fire']);
    cases.push([r.addresses.size === 1, 'the readable files are still collected', 'must fire']);
  }
  cases.push([got.size === 2, 'collects each distinct address once', '2 distinct']);
  cases.push([got.get(C).keys.has('TOKEN_ADDRESS'), 'attributes the key name', 'TOKEN_ADDRESS']);
  cases.push([got.get(C).files.size === 2 && got.get(A).files.size === 1,
              'counts source files per address', '2 and 1']);
  // the dangerous class: a doc address backed by no source file
  const docOnly = [...got.entries()].filter(([, e]) => [...e.files].every((f) => /\.(md|mdx)$/.test(f)));
  cases.push([docOnly.length === 1 && docOnly[0][0] === A,
              'flags an address that only ever appears in docs', 'exactly one']);
  // and it must never leak a value
  const out = JSON.stringify([...got.keys()].map((k) => k.length));
  cases.push([!out.includes(C), 'reporting shape carries no address value', 'must stay silent']);

  // the classifier must return both answers
  cases.push([presentedAsConfig('DIAMOND_CONTRACT_ADDRESS=0x' + 'a'.repeat(40)), 'an env assignment is a config value', 'must fire']);
  cases.push([presentedAsConfig('  MOR_TOKEN_ADDRESS: 0x' + 'a'.repeat(40)), 'a yaml assignment is a config value', 'must fire']);
  cases.push([!presentedAsConfig('{ "sessionID": "0x' + 'a'.repeat(40) + '" }'), 'sample JSON is not a config value', 'must stay silent']);
  cases.push([!presentedAsConfig("  --header 'session_id: 0x" + 'a'.repeat(40) + "'"), 'a curl header is not a config value', 'must stay silent']);
  cases.push([!presentedAsConfig('| Provider wallet | `0x' + 'a'.repeat(40) + '` |'), 'a table cell is not a config value', 'must stay silent']);

  let bad = 0;
  console.log('--- check-addresses selftest ---');
  for (const [ok, label, want] of cases) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(46)} ${want}`); }
  console.log(bad ? `ADDRESSES SELFTEST: FAIL (${bad}/${cases.length})`
                  : `ADDRESSES SELFTEST: PASS (${cases.length}/${cases.length} — classifies, counts, and never emits a value)`);
  return bad === 0;
}

const IS_MAIN = process.argv[1] && resolveFs(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1);
  const li = process.argv.indexOf('--links');
  // `${process.env.HOME}/...` with HOME unset built the literal path
  // "undefined/morpheus-address-links.txt", and the write then threw uncaught:
  // this BLOCKING gate died with a node stack — carrying the absolute module path
  // that the sibling scanner treats as a BLOCK-severity leak — for a reason that
  // has nothing to do with addresses. Reproduced by running it with HOME removed.
  const linksPath = li > -1 ? process.argv[li + 1]
    : join(process.env.HOME || tmpdir(), 'morpheus-address-links.txt');

  const corpus = repoFiles();
  // A SCAN OF NOTHING IS NOT A PASS. An empty corpus is a valid, non-failing input
  // that produces a green verdict having examined no file at all — the same shape
  // as the vacuous `HEAD..HEAD` pass one gate over. It is a broken run, not a
  // clean tree, so it exits 2 (could not run) rather than 0.
  if (!corpus.length) {
    console.error('ADDRESSES: NOT RUN — the corpus is EMPTY: 0 file(s) were found, so no address was examined.');
    process.exit(2);
  }
  const { addresses: all, unreadable } = collect(corpus, (f) => read(f));
  const rows = [];
  let n = 0;
  for (const [addr, e] of all) {
    if (isPlaceholder(addr)) continue;
    const sourceFiles = [...e.files].filter((f) => !/\.(md|mdx|svg|drawio)$/.test(f));
    const asConfig = e.lines.some(presentedAsConfig);
    rows.push({ addr, keys: [...e.keys].sort().join(', ') || '(no key)',
                sources: sourceFiles.length, docs: e.docs.size, docList: [...e.docs],
                asConfig });
    n++;
  }
  rows.sort((a, b) => b.sources - a.sources || b.docs - a.docs);

  console.log(`distinct real addresses : ${n}   (placeholders excluded)\n`);
  console.log('  #  key(s)                                      source-files  doc-mentions  verdict');
  const links = ['# Open each URL and eyeball it. This file is NOT tracked by git.',
                 '# Delete it when you are done.', ''];
  let orphans = 0;
  rows.forEach((r, i) => {
    const verdict = r.sources === 0 ? (r.asConfig ? 'CONFIG VALUE with no source backing — check by hand' : 'doc-only, but never shown as a config value')
                  : r.sources === 1 ? 'single source — nothing to cross-check against'
                  : 'consistent across sources';
    if (r.sources === 0 && r.asConfig) orphans++;
    console.log(`  ${String(i + 1).padStart(2)}  ${r.keys.slice(0, 42).padEnd(44)}${String(r.sources).padStart(9)}${String(r.docs).padStart(14)}  ${verdict}`);
    links.push(`[${i + 1}] keys: ${r.keys}   (in ${r.sources} source file(s), ${r.docs} doc mention(s))`);
    links.push(`    Base mainnet : https://basescan.org/address/${r.addr}`);
    links.push(`    Base Sepolia : https://sepolia.basescan.org/address/${r.addr}`);
    if (r.docList.length) links.push(`    quoted in    : ${r.docList.slice(0, 6).join(', ')}`);
    links.push('');
  });
  // The link file is an EYEBALLING AID, not evidence: it holds block-explorer URLs
  // for a human to open. Failing to write it must be loud and must NOT decide the
  // address verdict, which is computed above and is unaffected by it. Paths are
  // printed scrubbed, because this output reaches a CI log.
  try {
    writeFileSync(linksPath, links.join('\n'));
    console.log(`\nwrote ${rows.length} link block(s) to ${scrubPaths(linksPath)}`);
  } catch (e) {
    console.log(`\nCOULD NOT WRITE the link file to ${scrubPaths(linksPath)}: ${scrubPaths(reason(e))}`);
    console.log('The address verdict below is unaffected — the file is an aid for a human, not evidence.');
  }
  console.log(`files   : ${corpus.length - unreadable.length} of ${corpus.length} read`);
  // An unreadable file is a HOLE IN THE CORPUS, and this gate blocks. It cannot
  // say "every documented address is backed" about a file it never opened, so the
  // verdict names the hole instead of narrowing itself in silence.
  for (const u of unreadable.slice(0, 12)) console.log(`  UNREAD ${u.file} (${u.code})`);
  if (unreadable.length) {
    console.log(`ADDRESSES: INCOMPLETE — ${unreadable.length} file(s) could not be read, so an address in them was never checked`);
    process.exit(1);
  }
  console.log(orphans ? `ADDRESSES: ${orphans} address(es) are presented as config values but appear in NO source file`
                      : 'ADDRESSES: PASS (every non-illustrative documented address is backed by a source file)');
  process.exit(orphans ? 1 : 0);
}
