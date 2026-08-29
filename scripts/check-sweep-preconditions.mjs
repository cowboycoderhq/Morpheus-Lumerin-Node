#!/usr/bin/env node
// check-sweep-preconditions.mjs — standalone. Run by hand:
//   node scripts/check-sweep-preconditions.mjs            (repo root; exit 1 on violations)
//   node scripts/check-sweep-preconditions.mjs --info     (also list out-of-scope mentions)
//
// WHAT IT CHECKS
// -------------
// The proxy-router's StakeClaimer sweeps day-locked stake back without a manual
// `withdrawUserStakes` — but only under two conditions, both in source:
//
//   1. NODE:   the claimer is started only inside `Proxy.Run`
//              (proxy-router/internal/proxyctl/proxyctl.go:237-240), so with the
//              node off nothing sweeps.
//   2. WALLET: it withdraws only for `GetMyAddress`
//              (proxy-router/internal/blockchainapi/service.go:1105,1119), so
//              stake held against another wallet is never touched.
//
// In either case the manual call is REQUIRED. A statement that tells a reader
// manual action is unnecessary, without both conditions in the same unit, is a
// violation.
//
// WHY "UNIT"
// ----------
// A frontmatter description, a table row, an accordion/step/card body and a
// mermaid edge label are each read in isolation — quoted, rendered as a cell, or
// scraped by an agent — so a qualifier elsewhere on the page does not reach them.
// Units are computed here rather than judged by eye, which is the whole point:
// three previous passes over these claims were done by reading and every one was
// incomplete.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv.find((a) => a.startsWith('--root='))?.slice(7)
  ?? join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SHOW_INFO = process.argv.includes('--info');

// ---------------------------------------------------------------- scope ----
// Prose a human or an agent reads as guidance. Deliberately NOT included, and
// why (they are reported under --info so the enumeration stays complete):
//   verify/**            audit records of what was true at a past commit
//   proxy-router/docs/** generated swagger; a schema field describing the
//                        mechanism, not an instruction to the reader
//   *.go, *.sol, *.ts    source comments; same reason
const IN_SCOPE = (rel) =>
  (rel.startsWith(`docs${sep}`) && /\.mdx?$/.test(rel))
  || rel.startsWith(`.cursor${sep}rules${sep}`)
  || ['README.md', 'AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md'].includes(rel);

// Files that dictate what an AI assistant ASSERTS, rather than describing a
// mechanism to a human. In these, a bare "it is swept back" is itself a
// violation: the assistant will repeat it unconditionally, and the reader of
// that answer is told to do nothing without ever seeing the condition.
const DICTATES_ASSERTIONS = (rel) =>
  ['AGENTS.md', 'CLAUDE.md'].includes(rel)
  || rel.startsWith(`.cursor${sep}rules${sep}`)
  || rel.startsWith(`docs${sep}ai${sep}`);   // the whole agent-facing tree: these
                                             // pages declare themselves the
                                             // agent-citable reference, so a bare
                                             // assertion here is repeated verbatim

const SCAN_ROOTS = ['docs', '.cursor', 'README.md', 'AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md',
  'verify', 'proxy-router/docs', 'smart-contracts/docs', 'ui-desktop'];

// ------------------------------------------------------------- matchers ----
// The subject: is this unit talking about the day-locked-stake sweep at all?
// Two tiers, because "sweep" is also the word for the model-health sweep and the
// zombie-session sweep. A STRONG token names the stake-claim machinery outright;
// a WEAK one ("sweeps", "held part") only counts alongside stake context.
const SUBJECT_STRONG = /StakeClaimer|stake_claimer|stake auto-claim|auto-?claimer|withdrawUserStakes|userStakesOnHold/i;
const SUBJECT_WEAK = /\bswept\b|\bsweeps?\b|\bsweeping\b|\bmanual claim\b|held (stake|stakes|part|amount|slice|portion)|matured stake|locked slice|on-hold|day-lock/i;
const STAKE_CTX = /\bstakes?\b|\bMOR\b|day-lock|releaseAt|on-hold|userStakesOnHold|\bwallet\b/i;
const SUBJECT = { test: (t) => SUBJECT_STRONG.test(t) || (SUBJECT_WEAK.test(t) && STAKE_CTX.test(t)) };

// Class E — EXCULPATORY: tells the reader that manual action is unnecessary.
// Every one of these is a violation when the unit lacks both conditions.
const EXCULPATORY = [
  ['NOT_REQUIRED',   /\b(is|are|was|were|be)?\s*not required\b/i],
  ['NOT_A_MANUAL',   /\bnot a manual\b/i],
  ['NO_MANUAL',      /\bno manual\b[^.;:]{0,60}?\b(needed|required|call|claim|step)\b/i],
  ['NO_X_NEEDED',    /\bno\b[^.;:]{0,40}?\b(needed|required)\b/i],
  ['NO_ACTION',      /\bno (user )?action\b/i],
  ['OPTIONAL',       /\boptional\b/i],
  ['FOR_YOU',        /\b(for|on behalf of) you\b|\bon your behalf\b/i],
  ['NO_NEED',        /\b(do(es)? not|don'?t|doesn'?t) (need|have) to\b|\bno need to\b/i],
  ['NOTHING_TO_DO',  /\bnothing (further |more )?(to do|is needed|is required)\b/i],
  ['MAY_ALSO',       /\byou (may|can) also\b/i],
  ['WITHOUT_ACTION', /\bwithout\b[^.;:]{0,40}?\b(manual|intervention|action|calling)\b/i],
  ['ON_ITS_OWN',     /\bon its own\b|\bby itself\b/i],
  ['HANDS_OFF',      /\bhands-?off\b/i],
];

// Class A — ASSERTS THE SWEEP HAPPENS, with no exculpatory clause. For a human
// page this merely describes a component that exists, and a component is not
// falsified by not running: INFO, not a violation. In a file that dictates an
// assistant's assertions it IS a violation (see DICTATES_ASSERTIONS).
const ASSERTS_SWEEP = [
  ['AUTOMATIC',   /\bautomatic(ally)?\b/i],
  ['AUTO_SWEEP',  /\bauto-?(sweep|sweeps|claim|claimed|claims)\b/i],
  ['SWEPT_BACK',  /\b(swept|sweeps|sweep|claimed|claims|returns?|returned)\b[^.;:]{0,40}?\b(back|home|to (your|the) wallet)\b/i],
];

// The two conditions. BOTH legs are required: a unit that says "while your node
// is running" but not "and only for its own wallet" is still wrong for the
// other-wallet case, and vice versa.
const COND_NODE = [
  /\**running\**\s+(a|the|your|that|its)?\s*(proxy-?router|node|c-?node|router)\b/i,
  /\b(proxy-?router|node|router)\b[^.;:]{0,40}?\bis (still )?running\b/i,
  /\bwhile\b[^.;:]{0,40}?\b(node|proxy-?router|router)\b/i,
  /\bnode\b[^.;:]{0,30}?\b(is )?(off|offline|down|stopped|not running)\b/i,
  /\bwith (the|that|your|it) (node )?(off|stopped|down|offline)\b/i,
  /\bnode is (yours and )?running\b/i,
  /\b(that|the|your) node is running\b/i,
  /\bProxy\.Run\b/,
  /\bproxyctl\.go\b/,
  /\binside a running\b/i,
];
const COND_WALLET = [
  /\b(a |an )?(different|another|other) wallet\b/i,
  /\b(its|it|that node|the node) own wallet\b/i,
  /\bown wallet\b/i,
  /\bwallet (it|that node|the node|its) holds\b/i,
  /\bholds the wallet\b/i,
  /\bonly (ever )?for (its|the node'?s?) own\b/i,
  /\bGetMyAddress\b/,
  /\bover the wallet that node holds\b/i,
  /\bopened from (its|that node'?s?) wallet\b/i,
  /\bheld against a different wallet\b/i,
];

const hit = (list, text) => list.filter(([, re]) => re.test(text)).map(([n]) => n);
const any = (res, text) => res.some((re) => re.test(text));

// ---------------------------------------------------------------- units ----
// Split a document into the spans a reader can encounter on their own.
function units(text) {
  const lines = text.split('\n');
  const out = [];
  let cur = null;
  const flush = () => { if (cur && cur.lines.some((l) => l.trim())) out.push(cur); cur = null; };
  const start = (i, kind) => { flush(); cur = { kind, start: i + 1, lines: [] }; };
  const push = (i, l) => { if (!cur) start(i, 'para'); cur.lines.push(l); cur.end = i + 1; };

  let inFrontmatter = false, fence = null, fenceLang = '';

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], t = l.trim();

    // frontmatter: one unit per key, because an agent quotes `description:` alone
    if (i === 0 && t === '---') { inFrontmatter = true; flush(); continue; }
    if (inFrontmatter) {
      if (t === '---') { inFrontmatter = false; flush(); continue; }
      if (/^[A-Za-z_][\w-]*\s*:/.test(t)) start(i, 'frontmatter');
      push(i, l);
      continue;
    }

    // fenced code
    const f = t.match(/^(`{3,}|~{3,})\s*(\S*)/);
    if (f && !fence) { flush(); fence = f[1][0].repeat(3); fenceLang = f[2].toLowerCase(); continue; }
    if (f && fence && t.startsWith(fence)) { flush(); fence = null; fenceLang = ''; continue; }
    if (fence) {
      // Only mermaid label text is prose a reader consumes. A `cast send` example
      // is not a claim about whether they must run it.
      if (fenceLang === 'mermaid') { start(i, 'mermaid-line'); push(i, l); flush(); }
      continue;
    }

    if (!t) { flush(); continue; }
    if (/^#{1,6}\s/.test(t)) { start(i, 'heading'); push(i, l); flush(); continue; }

    // table: one unit per row; skip the alignment rule
    if (/^\|/.test(t)) {
      if (/^\|[\s:|-]+\|?$/.test(t)) { flush(); continue; }
      start(i, 'table-row'); push(i, l); flush(); continue;
    }

    // JSX component boundaries. An opening tag that carries a `title=` starts a
    // unit and stays attached to the body it titles (a Step title is read WITH
    // its step, not alone); a bare open/close tag is just a boundary.
    if (/^<\/?[A-Z][\w.]*/.test(t)) {
      if (/^<[A-Z][\w.]*[^>]*\btitle=/.test(t)) { start(i, 'component'); push(i, l); }
      else flush();
      continue;
    }

    // list item: each bullet is its own unit, continuation lines join it
    if (/^([-*+]|\d+\.)\s/.test(t)) { start(i, 'list-item'); push(i, l); continue; }

    push(i, l);
  }
  flush();
  return out;
}

// ------------------------------------------------------------- classify ----
// One place decides what a unit is, so the self-test below exercises the same
// code the sweep does.
function classify(body, { agentFile }) {
  if (!SUBJECT.test(body)) return null;
  const exc = hit(EXCULPATORY, body);
  const asr = hit(ASSERTS_SWEEP, body);
  if (!exc.length && !asr.length) return null;
  const node = any(COND_NODE, body), wallet = any(COND_WALLET, body);
  if (node && wallet) return null;
  const missing = [!node && 'NODE', !wallet && 'WALLET'].filter(Boolean).join('+');
  const cues = [...exc, ...asr];
  if (exc.length) return { verdict: 'violation', cues, missing };
  if (agentFile) return { verdict: 'violation', cues, missing, note: 'agent-instruction file' };
  return { verdict: 'info', cues, missing, why: 'describes the mechanism; no exculpatory clause' };
}

// ------------------------------------------------------------ self-test ----
// Gate the gate. A checker that has only ever reported the answer you wanted is
// not known to work, so run it against text whose verdict is fixed in advance:
//   node scripts/check-sweep-preconditions.mjs --selftest
const CASES = [
  // [expect, agentFile, text]
  ['violation', false, 'the locked amount in `userStakesOnHold` is automatically swept by the proxy-router\'s StakeClaimer after ~1 UTC day; manual `withdrawUserStakes` is not required'],
  ['violation', false, 'Cleared by the StakeClaimer, which submits `withdrawUserStakes` automatically once an entry matures; calling it yourself is optional.'],
  ['violation', false, 'the proxy-router\'s StakeClaimer sweeps it back automatically, with no manual `withdrawUserStakes` needed'],
  ['violation', false, 'The proxy-router automatically sweeps matured stake every 10 minutes; no manual claim needed.'],
  ['violation', false, 'it does make the second call for you: its StakeClaimer sweeps matured stake automatically, so a manual claim is not required'],
  ['violation', false, 'the proxy-router sweeps it automatically every 10 minutes; you may also call `withdrawUserStakes` yourself'],
  ['violation', false, 'the StakeClaimer sweeps it back automatically. The wait is the day-lock, not a manual claim step.'],
  // one condition is not enough - the other case still strands the reader
  ['violation', false, 'a running proxy-router sweeps matured stake, so manual `withdrawUserStakes` is not required'],
  ['violation', false, 'the StakeClaimer withdraws only for its own wallet, so a manual claim is not required'],
  // a bare assertion: fine in prose for a human, a violation where it dictates
  // what an assistant asserts
  ['info',      false, 'Whatever was locked is swept back to the wallet after `releaseAt`.'],
  ['violation', true,  'Whatever was locked is swept back to the wallet after `releaseAt`.'],
  // both conditions present -> clean, in either kind of file
  ['clean',     false, 'the StakeClaimer sweeps matured stake, so manual `withdrawUserStakes` is not required - but only while your own node is running and only for the wallet it holds; with the node off, or for a session opened from another wallet, the manual call is required'],
  ['clean',     true,  'Held stakes past their lock are auto-claimed back for you while your own node is running - with it stopped, or for stakes held against a different wallet, the claim is a manual on-chain call.'],
  ['clean',     false, 'A **running** proxy-router claims matured on-hold stakes automatically via its StakeClaimer, and only for its own wallet. There is no HTTP endpoint; manual claiming is the alternative - and the only route when the node is off or the stake belongs to another wallet.'],
  // not this subject: the model-health sweep and the zombie-session sweep also
  // use the word, and recovery there really is automatic
  ['clean',     false, 'What cannot stall is the model-health sweep, which calls ReattestBackend on every sweep. Recovery is automatic either way - no restart, no manual clear.'],
  ['clean',     true,  'Queue an immediate model health sweep instead of waiting for the next scheduled run. Returns immediately; the sweep runs in the background.'],
  // no claim at all -> nothing to report
  ['clean',     false, '`withdrawUserStakes(address, uint8)` moves past-releaseAt rows from `userStakesOnHold` to the user\'s wallet.'],
];

function selftest() {
  let bad = 0;
  for (const [expect, agentFile, text] of CASES) {
    const c = classify(text, { agentFile });
    const got = c === null ? 'clean' : c.verdict;
    const ok = got === expect;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} expect=${expect} got=${got} agentFile=${agentFile}\n       ${text.slice(0, 110)}`);
  }
  console.log(`\n${bad === 0 ? 'PASS' : 'FAIL'}: ${CASES.length - bad}/${CASES.length} self-test case(s)`);
  return bad;
}

if (process.argv.includes('--selftest')) process.exit(selftest() ? 1 : 0);

// ---------------------------------------------------------------- files ----
function walk(p, acc) {
  let st; try { st = statSync(p); } catch { return acc; }
  if (st.isDirectory()) {
    if (/(^|\/)(node_modules|\.git|dist|build)$/.test(p)) return acc;
    for (const e of readdirSync(p)) walk(join(p, e), acc);
  } else if (/\.(mdx?|mdc|ya?ml|json|go)$/.test(p)) acc.push(p);
  return acc;
}

const files = [];
for (const r of SCAN_ROOTS) walk(join(ROOT, r), files);
files.sort();

const violations = [], info = [];
let scanned = 0, scannedInScope = 0;

for (const abs of files) {
  const rel = relative(ROOT, abs);
  let text; try { text = readFileSync(abs, 'utf8'); } catch { continue; }
  scanned++;
  const inScope = IN_SCOPE(rel);
  if (inScope) scannedInScope++;
  if (!SUBJECT.test(text)) continue;

  for (const u of units(text)) {
    const body = u.lines.join(' ');
    if (!SUBJECT.test(body)) continue;
    const c = classify(body, { agentFile: DICTATES_ASSERTIONS(rel) });
    if (!c) continue;

    const rec = {
      file: rel, line: u.start, endLine: u.end ?? u.start, kind: u.kind,
      cues: c.cues, missing: c.missing, note: c.note,
      excerpt: body.replace(/\s+/g, ' ').trim().slice(0, 200),
    };

    if (!inScope) { info.push({ ...rec, why: 'out of scope (see IN_SCOPE)' }); continue; }
    if (c.verdict === 'violation') violations.push(rec);
    else info.push({ ...rec, why: c.why });
  }
}

const fmt = (v) => `${v.file}:${v.line}${v.endLine > v.line ? `-${v.endLine}` : ''}  [${v.kind}] missing:${v.missing} cues:${v.cues.join(',')}${v.note ? ` (${v.note})` : ''}\n    ${v.excerpt}`;

console.log(`scanned ${scanned} file(s), ${scannedInScope} in scope`);
console.log(`\nVIOLATIONS (${violations.length}):`);
for (const v of violations) console.log('  ' + fmt(v));
if (SHOW_INFO) {
  console.log(`\nINFO — not violations (${info.length}):`);
  for (const v of info) console.log(`  ${fmt(v)}\n    ~ ${v.why}`);
} else {
  console.log(`\n(${info.length} informational match(es); re-run with --info to list them)`);
}
console.log(`\n${violations.length === 0 ? 'PASS' : 'FAIL'}: ${violations.length} violation(s)`);
process.exit(violations.length ? 1 : 0);
