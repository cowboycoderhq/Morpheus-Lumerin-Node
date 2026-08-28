#!/usr/bin/env node
// Two claim classes moved OUT of the model-judgment lane into a deterministic
// one. Both were chosen because the blind review proved they catch real defects:
//
//   A. "documented as wired up" vs "has any non-test caller"
//      -> caught B02-016 and B02-040 (PinnedHTTPClient, S1)
//   B. "documented default" vs "the default the code actually applies"
//      -> caught B04-028 (PROXY_FORWARD_CHAT_CONTEXT, S1)
//
// Deterministic checks re-run identically; judgment lanes do not. Anything that
// can move here permanently stops being a source of run-to-run variance.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { REPO, read, docFiles, repoFiles } from './lib.mjs';

const goFiles = () => repoFiles().filter((f) => f.endsWith('.go'))
  .filter((f) => !f.includes('node_modules/') && !f.includes('ui-desktop/Morpheus-Lumerin-Node/'));

// ---------------------------------------------------------------- A. symbols
// Indexes package-level exported funcs AND exported methods. Excluding methods
// was wrong: an interface call still writes `.MethodName(` at the call site, so
// the selector names the method whether dispatch is concrete or dynamic. Only
// reflection hides a call, and that is rare enough to state as a caveat rather
// than a reason to skip the whole class. (Excluding methods also silently
// dropped PinnedHTTPClient — a method — which is the defect this check exists
// to catch, and made a selftest case pass for the wrong reason.)
export function symbolIndex() {
  const defs = new Map();     // Name -> file:line
  const refs = new Map();     // Name -> {prod, test}
  const kind = new Map();     // Name -> 'func' | 'method'
  const files = goFiles();
  for (const f of files) {
    const t = read(f);
    t.split('\n').forEach((line, i) => {
      const fn = line.match(/^func\s+([A-Z]\w+)\s*\(/);            // package-level, exported
      if (fn && !defs.has(fn[1])) { defs.set(fn[1], `${f}:${i + 1}`); kind.set(fn[1], 'func'); return; }
      const me = line.match(/^func\s+\([^)]*\)\s+([A-Z]\w+)\s*\(/); // exported method
      if (me && !defs.has(me[1])) { defs.set(me[1], `${f}:${i + 1}`); kind.set(me[1], 'method'); }
    });
  }
  for (const f of files) {
    const isTest = /_test\.go$/.test(f);
    const t = read(f);
    for (const name of defs.keys()) {
      const own = defs.get(name).startsWith(f + ':');
      // a method is always invoked through a selector; a func by bare name
      const re = kind.get(name) === 'method'
        ? new RegExp(`\\.${name}\\s*\\(`, 'g')
        : new RegExp(`\\b${name}\\s*\\(`, 'g');
      let n = (t.match(re) || []).length;
      if (own && kind.get(name) === 'func') n -= 1;           // discount the definition itself
      if (n <= 0) continue;
      const r = refs.get(name) || { prod: 0, test: 0 };
      r[isTest ? 'test' : 'prod'] += n;
      refs.set(name, r);
    }
  }
  return { defs, refs, kind };
}

// A doc line asserting the thing is built, not merely describing a design.
const ASSERTS_WIRED = /\b(DONE|shipped|implemented|enforced|wired|in place|is used|uses|pins|verifies|rejects|refuses|hard fail)\b/i;
// ...but a line that DOCUMENTS THE GAP is not asserting use, even though it
// necessarily repeats the vocabulary of the thing it says is missing. Without
// this, correcting a doc to say "NOT WIRED — no production caller" keeps the
// detector firing on the now-accurate line.
// The `\b` sits AFTER the alternation, so an alternative that is a proper
// prefix of the word actually present fails the boundary and the whole
// suppressor gives up: "has no caller" matched inside "has no callers", then
// `\b` between `r` and `s` did not hold. One letter decided whether a correct
// gap note read as a claim of use — .ai-docs/TEE_Attestation_Architecture.md:175
// says `MatchSEVMeasurement` "has no callers", and the detector called it a
// reassertion. Every caller alternative therefore carries its own `s?`.
const DOCUMENTS_GAP = /\b(not wired|no production callers?|has no callers?|no callers?|never reached|never called|not currently in effect|partially wired|does not return|not in effect|zero callers)\b/i;

// Pure predicate so the distinction is testable without touching the tree.
export const assertsWired = (line) => ASSERTS_WIRED.test(line) && !DOCUMENTS_GAP.test(line);

export function checkSymbols() {
  const { defs, refs } = symbolIndex();
  const out = [];
  const seen = new Set();
  for (const file of docFiles()) {
    const lines = read(file).split('\n');
    lines.forEach((line, i) => {
      if (!assertsWired(line)) return;
      for (const m of line.matchAll(/`([A-Z][A-Za-z0-9]{3,})`/g)) {
        const name = m[1];
        if (!defs.has(name)) continue;
        const r = refs.get(name) || { prod: 0, test: 0 };
        const key = `${file}:${i + 1}:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          file, line: i + 1, symbol: name, def: defs.get(name),
          prod: r.prod, test: r.test,
          verdict: r.prod === 0 ? 'DOCUMENTED-BUT-UNWIRED' : 'WIRED',
          evidence: r.prod === 0
            ? `defined ${defs.get(name)}; 0 non-test callers (${r.test} test refs) — doc asserts it is in use`
            : `defined ${defs.get(name)}; ${r.prod} non-test call site(s)`,
        });
      }
    });
  }
  return out;
}

// --------------------------------------------------------------- B. defaults
// env name -> dotted struct path, from the tagged fields inside each group.
export function envFieldMap() {
  const t = read('proxy-router/internal/config/config.go').split('\n');
  const map = new Map();
  let group = null;
  for (const line of t) {
    const g = line.match(/^\t([A-Z]\w*)\s+struct\s*\{/);
    if (g) { group = g[1]; continue; }
    if (/^\t\}/.test(line)) { group = null; continue; }
    const f = line.match(/^\s*([A-Z]\w*)\s+(\S+)\s*`[^`]*env:"([A-Z0-9_]+)"/);
    if (f) map.set(f[3], { path: group ? `${group}.${f[1]}` : f[1], type: f[2] });
  }
  return map;
}

// dotted struct path -> the literal SetDefaults actually applies
export function codeDefaults() {
  const src = read('proxy-router/internal/config/config.go');
  const body = src.slice(src.indexOf('func (cfg *Config) SetDefaults()'));
  const out = new Map();
  const lines = body.split('\n');
  lines.forEach((line, i) => {
    let m = line.match(/^\s*cfg\.([A-Za-z.]+)\s*=\s*"([^"]*)"/);          // string literal
    if (m) { out.set(m[1], m[2]); return; }
    m = line.match(/^\s*cfg\.([A-Za-z.]+)\s*=\s*([0-9]+(?:\s*\*\s*[a-zA-Z.]+)?)\s*$/); // numeric / duration
    if (m) { out.set(m[1], m[2].trim()); return; }
    m = line.match(/^\s*cfg\.([A-Za-z.]+)\s*=\s*&lib\.Bool\{Bool:\s*&val\}/);          // bool via `val :=`
    if (m) {
      for (let j = i - 1; j >= 0 && j > i - 12; j--) {
        const v = lines[j].match(/^\s*val\s*:?=\s*(true|false)\s*$/);
        if (v) { out.set(m[1], v[1]); return; }
      }
    }
  });
  return out;
}

// Normalisation exists so the checker compares MEANING, not spelling. Without
// it, `5` vs `5 * time.Second` and `1h` vs `1 * time.Hour` read as defects and
// the check manufactures more noise than signal.
const DUR = { second: 's', minute: 'm', hour: 'h', millisecond: 'ms' };
// Zero-value inference is sound ONLY for bool: an absent SetDefaults entry
// genuinely means `false`, and docs state it that way. For an int, duration or
// string the effective default may come from the shipped sample or a fallback
// constant in consuming code, so inferring 0/"" and calling the doc wrong
// manufactures findings (it flagged ETH_NODE_CHAIN_ID as "default 0" while
// .env.example ships 8453). Those are reported UNDETERMINED instead.
const ZERO = { bool: 'false' };
const normDefault = (s) => {
  let v = String(s || '').trim().replace(/`/g, '').replace(/^"|"$/g, '').replace(/\s+/g, ' ');
  // Go duration expression -> compact form
  const g = v.match(/^(\d+)\s*\*\s*time\.(\w+)$/i);
  if (g && DUR[g[2].toLowerCase()]) v = g[1] + DUR[g[2].toLowerCase()];
  return v.replace(/^\(unset.*\)$/i, '').toLowerCase();
};
// A doc cell may legitimately state several network-scoped values, or decline to
// state one. Neither is a mismatch.
const NOT_STATED = /^\((depends|varies|unset|none|empty)/i;
const docVariants = (s) => {
  const raw = String(s || '').trim();
  if (NOT_STATED.test(raw)) return null;                 // doc declines to state
  if (/[<>]/.test(raw)) return null;                      // placeholder like <WEB_ADDRESS port>
  // Split on a SPACED slash only. An unspaced slash is part of a URL or path
  // ("https://x/api/v2", "./data/badger/") and splitting there shreds the value
  // into fragments that match nothing.
  return raw.split(/\s+\/\s+|;\s*|,\s*| or /)             // "mainnet X / testnet Y"
    .map((p) => normDefault(p.replace(/\([^)]*\)/g, '')            // drop "(mainnet)" annotations
                             // LEADING annotation only. A bare \b(base)\b strips
                             // "base" out of "base.blockscout.com" and turns an
                             // identical value into a mismatch.
                             .replace(/^(mainnet|testnet|sepolia)\s+/i, '').trim()))
    .filter(Boolean);
};

// ui-desktop declares its own defaults in a TypeBox schema, not in config.go.
export function uiDesktopDefaults() {
  // Parsed per DECLARATION, not per line. LOG_LEVEL's Type.Union spans eleven
  // lines with its `default: 'warn'` on the last of them, so a line-at-a-time
  // regex reported "no default" for a default that is plainly there — a false
  // negative on a value the docs state.
  const out = new Map();
  const lines = read('ui-desktop/env.schema.ts').split('\n');
  const starts = [];
  lines.forEach((l, i) => { const m = l.match(/^\s{2}([A-Z][A-Z0-9_]+):/); if (m) starts.push([i, m[1]]); });
  starts.forEach(([i, name], k) => {
    const end = k + 1 < starts.length ? starts[k + 1][0] : lines.length;
    const block = lines.slice(i, end).join(' ');
    const d = block.match(/default:\s*'([^']*)'/) || block.match(/default:\s*([^,'}\s]+)/);
    if (d) out.set(name, d[1].trim());
  });
  return out;
}

// Declared-ness and having-a-default are DIFFERENT facts, and conflating them
// made the checker state a falsehood: NODE_ENV is declared at env.schema.ts:19
// with no default, and the evidence line read "NODE_ENV is not in
// ui-desktop/env.schema.ts". Same verdict, wrong reason — and a wrong reason in
// an evidence string is what a reader acts on.
export function uiDesktopDeclared() {
  const out = new Set();
  for (const line of read('ui-desktop/env.schema.ts').split('\n')) {
    const m = line.match(/^\s{2}([A-Z][A-Z0-9_]+):/);
    if (m) out.add(m[1]);
  }
  return out;
}

// Pure comparison, no filesystem. The selftest exercises THIS on synthetic
// pairs, so fixing a document can never turn a detector case green — the gate
// stays anchored to behaviour, not to whatever the docs currently happen to say
// (learnings/2026-07-08-relabel-the-fixture-dont-soften-the-metric).
export function compareDefault(statedRaw, actual) {
  const variants = docVariants(statedRaw);
  if (!variants || !variants.length) return { verdict: 'NOT-STATED' };
  if (actual === null || actual === undefined) return { verdict: 'NO-CODE-DEFAULT' };
  const a = normDefault(actual);
  // An empty sample does not establish a default — consuming code often carries
  // a fallback constant (models_config.go's ConfigPathDefault is one).
  if (a === '') return { verdict: 'NO-CODE-DEFAULT', note: 'resolved value is empty; a fallback may live in consuming code' };
  const bare = a.match(/^(\d+)(ms|s|m|h)$/);                 // duration -> magnitude
  const same = variants.some((v) =>
    a === v
    || a.replace(/^\.\//, '') === v.replace(/^\.\//, '')
    || (bare && v === bare[1]));                             // doc states the number, units in Notes
  return { verdict: same ? 'MATCH' : 'MISMATCH', normalisedDoc: variants, normalisedCode: a };
}

export function checkDefaults() {
  const envField = envFieldMap();
  const code = codeDefaults();
  const ui = uiDesktopDefaults();
  const uiDeclared = uiDesktopDeclared();
  const envExample = new Map();
  for (const f of ['proxy-router/.env.example', 'proxy-router/.env.example.win']) {
    read(f).split('\n').forEach((l) => {
      const m = l.match(/^\s*([A-Z][A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !envExample.has(m[1])) envExample.set(m[1], m[2].trim());
    });
  }
  const out = [];
  for (const file of docFiles().filter((f) => /docs\/reference\/env-/.test(f))) {
    read(file).split('\n').forEach((line, i) => {
      const m = line.match(/^\|\s*`([A-Z][A-Z0-9_]+)`\s*\|\s*([^|]*)\|/);
      if (!m) return;
      const [, name, statedRaw] = m;
      const variants = docVariants(statedRaw);
      const stated = variants ? variants[0] : '';
      const fld = envField.get(name);
      const path = fld?.path;
      const isUi = /env-ui-desktop/.test(file);
      // SetDefaults is the compiled default and outranks the shipped sample;
      // label which one answered so the evidence is not misattributed.
      let actual = null, src = null;
      if (isUi && ui.has(name)) { actual = ui.get(name); src = 'ui-desktop/env.schema.ts'; }
      else if (!isUi && path && code.has(path)) { actual = code.get(path); src = `SetDefaults ${path}`; }
      else if (!isUi && fld && ZERO[fld.type] !== undefined) {  // bool only
        // No SetDefaults entry: the compiled default is the Go zero value.
        // .env.example is a shipped SAMPLE and must not be read as the default —
        // it routinely carries recommended values that differ.
        actual = ZERO[fld.type]; src = `Go zero value for ${fld.type} (no SetDefaults entry)`;
      }
      // Only adjudicate where BOTH sides state something; a doc that says
      // "(unset)" against a code default of "" agrees, and neither side
      // asserting anything is not a finding.
      if (!variants || !variants.length) return;   // doc states no default; nothing to contradict
      if (actual === null) {
        out.push({ file, line: i + 1, name, stated: statedRaw.trim(),
                   verdict: isUi ? 'OUT-OF-SCOPE' : path ? 'UNDETERMINED' : 'NO-CODE-DEFAULT',
                   evidence: isUi ? (uiDeclared.has(name)
                            ? `${name} is declared in ui-desktop/env.schema.ts but carries no default — there is nothing to compare the documented value against`
                            : `${name} is not in ui-desktop/env.schema.ts — checker cannot settle it`)
                          : path ? `${path} has no SetDefaults entry; effective default may come from .env.example or a fallback in consuming code — checker cannot settle it`
                                 : `no env: tag named ${name} in config.go` });
        return;
      }
      const cmp = compareDefault(statedRaw, actual);
      out.push({ file, line: i + 1, name, stated: statedRaw.trim(), actual,
                 verdict: cmp.verdict,
                 evidence: cmp.verdict === 'MATCH' ? `matches ${src}`
                                : `doc says "${statedRaw.trim()}"; code applies "${normDefault(actual)}" (${src})` });
    });
  }
  return out;
}

// ------------------------------------------------------------------ selftest
// Each case pins a KNOWN answer established independently. Both detectors must
// be able to return both answers, or a green run means nothing.
function selftest() {
  const cases = [];
  const syms = checkSymbols();
  const { defs, refs, kind } = symbolIndex();

  // Assert INDEXED first. Without this, a symbol the index never saw reads as
  // "0 callers" and the case passes for the wrong reason — which it did.
  cases.push(['symbol: PinnedHTTPClient is indexed at all', defs.has('PinnedHTTPClient'), defs.get('PinnedHTTPClient') || 'NOT INDEXED']);
  const pinned = refs.get('PinnedHTTPClient') || { prod: 0, test: 0 };
  cases.push(['symbol: PinnedHTTPClient has test refs (sanity)', pinned.test > 0, `test=${pinned.test}`]);
  cases.push(['symbol: PinnedHTTPClient has no prod caller', defs.has('PinnedHTTPClient') && pinned.prod === 0, `prod=${pinned.prod} test=${pinned.test}`]);
  const rtmr = refs.get('CalculateRTMR3') || { prod: 0, test: 0 };
  cases.push(['symbol: CalculateRTMR3 IS wired (control)', rtmr.prod > 0, `prod=${rtmr.prod}`]);
  // Regression guard. These docs were corrected on 2026-08-20 to stop claiming
  // PinnedHTTPClient / MatchSEVMeasurement are in use; the symbols are still
  // unwired in code. If a future edit reinstates a "DONE"-style claim while the
  // wiring is still missing, this fires. The detector's ability to FIRE is
  // proven separately by the assertsWired cases below, which are synthetic and
  // do not depend on what the docs currently say
  // (learnings/2026-08-15-gate-documented-dead-ends-they-get-reintroduced).
  cases.push(['symbol: no doc reasserts an unwired symbol (regression guard)',
    syms.filter((s) => s.verdict === 'DOCUMENTED-BUT-UNWIRED').length === 0,
    `${syms.filter((s) => s.verdict === 'DOCUMENTED-BUT-UNWIRED').length} unwired claims (expect 0)`]);

  const defs2 = checkDefaults();

  // --- comparison logic, on SYNTHETIC pairs (independent of live doc content) ---
  const C = (doc, code, want, label) =>
    cases.push([`compare: ${label}`, compareDefault(doc, code).verdict === want,
                `doc=${JSON.stringify(doc)} code=${JSON.stringify(code)} -> ${compareDefault(doc, code).verdict} (want ${want})`]);
  C('`warn`', 'debug', 'MISMATCH', 'differing level is a mismatch');
  C('`true`', 'false', 'MISMATCH', 'inverted bool is a mismatch');
  C('`false`', 'false', 'MATCH', 'identical bool matches');
  C('`1h`', '1 * time.Hour', 'MATCH', 'go duration normalises');
  C('`60s`', '60 * time.Second', 'MATCH', 'go duration normalises (seconds)');
  C('`8453` (mainnet) / `84532` (testnet)', '8453', 'MATCH', 'multi-network cell matches either');
  C('`https://base.blockscout.com/api/v2`', 'https://base.blockscout.com/api/v2', 'MATCH', 'URL survives intact');
  C('`https://x/api`', 'https://x/api/quote-parse', 'MISMATCH', 'extra path segment is a mismatch');
  C('(depends on release)', '90 * time.Second', 'NOT-STATED', 'doc declining to state is not a defect');
  C('`http://localhost:<PORT>`', 'http://localhost:8082', 'NOT-STATED', 'placeholder is not a defect');
  C('`warn`', null, 'NO-CODE-DEFAULT', 'absent code default reported, not guessed');
  // Corrections proven necessary by scout confirmation — each was a false
  // positive that would have produced a wrong doc edit.
  C('`5`', '5 * time.Second', 'MATCH', 'bare number + units-in-Notes is not a defect');
  C('`10`', '10 * time.Second', 'MATCH', 'bare number + units-in-Notes is not a defect');
  C('`./models-config.json`', '', 'NO-CODE-DEFAULT', 'empty sample is not an absent default');
  C('`false`', ZERO.bool, 'MATCH', 'bool with no SetDefaults entry is the Go zero value');
  C('`5`', '7 * time.Second', 'MISMATCH', 'the bare-number rule still catches a real magnitude difference');
  const W = (line, want, label) => cases.push([`assertsWired: ${label}`, assertsWired(line) === want, `-> ${assertsWired(line)} (want ${want})`]);
  W('- Pinned-cert HTTP client (`PinnedHTTPClient`) — **DONE**', true, 'a DONE status asserts use');
  W('- `PinnedHTTPClient` refuses any cert whose SHA-256 differs', true, 'a behaviour claim asserts use');
  W('- `PinnedHTTPClient` — **NOT WIRED**: no production code calls it; inference uses the default client', false, 'a line documenting the gap is not a claim of use');
  W('| `PinnedHTTPClient` — refuse onward TLS certs | S | **NOT WIRED** | tests only |', false, 'a corrected table row is not a claim of use');
  W('`MatchSEVMeasurement` has no caller anywhere, including tests', false, 'an explicit no-caller note is not a claim of use');
  W('The design will eventually pin certs via a helper', false, 'future-tense design text is not a claim of use');
  // The plural, pinned. Without this the suppressor's boundary bug returns the
  // moment someone re-tightens the alternation, and it returns SILENTLY — the
  // only symptom is a correct doc line reported as a defect. The second case is
  // the non-vacuity control: strip the gap clause and the same sentence must
  // still assert use, or the first case would be green merely because nothing
  // in it trips ASSERTS_WIRED at all.
  W('The values are not yet wired, and `MatchSEVMeasurement` has no callers, as documented elsewhere', false, 'the PLURAL no-callers note is not a claim of use');
  W('The values are wired, and `MatchSEVMeasurement` is used on the live consumer path', true, 'same sentence minus the gap clause still asserts use (control)');
  cases.push(['compare: non-bool with no SetDefaults is UNDETERMINED, not a mismatch',
    (defs2.find((d) => d.name === 'ETH_NODE_CHAIN_ID') || {}).verdict === 'UNDETERMINED',
    (defs2.find((d) => d.name === 'ETH_NODE_CHAIN_ID') || {}).verdict]);
  cases.push(['compare: bool with no SetDefaults still resolves (LOG_COLOR)',
    (defs2.find((d) => d.name === 'LOG_COLOR') || {}).verdict === 'MATCH',
    (defs2.find((d) => d.name === 'LOG_COLOR') || {}).verdict]);

  // --- wiring still exercised against the live tree, on MATCH-side cases only ---
  const store = defs2.find((d) => d.name === 'PROXY_STORE_CHAT_CONTEXT');
  cases.push(['live: STORE_CHAT_CONTEXT resolves', store?.verdict === 'MATCH', store ? store.verdict : 'row not found']);
  const addr = defs2.find((d) => d.name === 'PROXY_ADDRESS');
  cases.push(['live: PROXY_ADDRESS resolves', addr?.verdict === 'MATCH', addr ? addr.verdict : 'row not found']);
  // Two defects sat on this one line, and together they made the case
  // unfalsifiable:
  //   - the anchor was DEAD. PROXY_WEB_DEFAULT_PORT was renamed upstream to
  //     SERVICE_PROXY_API_PORT (env.schema.ts:40, default 8082) and abdbf26d
  //     removed the last of it here, so the lookup found nothing.
  //   - the assertion was NEGATIVE over an optional chain. `undefined !==
  //     'NO-CODE-DEFAULT'` is true, so the case reported ok while its own
  //     evidence string printed "row not found" — it passed BECAUSE the row
  //     had been deleted. A live case must require the row to exist; otherwise
  //     deleting the subject is indistinguishable from the checker working,
  //     and the delete is the easier of the two to do by accident.
  const port = defs2.find((d) => d.name === 'SERVICE_PROXY_API_PORT');
  cases.push(['live: ui-desktop var not a false NO-CODE-DEFAULT',
    !!port && port.verdict !== 'NO-CODE-DEFAULT',
    port ? port.verdict : 'row not found — a missing row cannot satisfy this case']);

  let bad = 0;
  for (const [n, ok, note] of cases) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${n.padEnd(48)} ${note}`); }
  console.log(bad === 0 ? `\nMECHANIZED SELFTEST: PASS (${cases.length}/${cases.length} — both detectors return both answers)`
                        : `\nMECHANIZED SELFTEST: FAIL (${bad}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

if (process.argv.includes('--selftest')) selftest();
else {
  const syms = checkSymbols(), defs = checkDefaults();
  console.log('=== A. documented-as-wired vs callers ===');
  for (const s of syms.filter((x) => x.verdict === 'DOCUMENTED-BUT-UNWIRED'))
    console.log(`  ${s.verdict}  ${s.file}:${s.line}  \`${s.symbol}\`  — ${s.evidence}`);
  console.log(`  (${syms.filter((x) => x.verdict === 'WIRED').length} symbol mentions confirmed wired)`);
  console.log('\n=== B. documented default vs applied default ===');
  for (const d of defs.filter((x) => x.verdict !== 'MATCH'))
    console.log(`  ${d.verdict}  ${d.file}:${d.line}  ${d.name} — ${d.evidence}`);
  const matched = defs.filter((x) => x.verdict === 'MATCH');
  const mismatched = defs.filter((x) => x.verdict === 'MISMATCH');
  const unresolved = defs.filter((x) => x.verdict === 'UNDETERMINED' || x.verdict === 'NO-CODE-DEFAULT' || x.verdict === 'OUT-OF-SCOPE');
  // This line is the ENTIRE gate summary a caller sees when the run exits 0:
  // docs-gates.mjs keeps only the last output line as the "ok" tail. Below,
  // this printed only "(45 defaults confirmed matching)" and, separately,
  // never called process.exit on a MISMATCH — so this gate could not fail and
  // could not report an unresolved row either, no matter what the rows above
  // said. That is the silence the AGENT_CONFIG_PATH / ARTIFACT_REGISTRY_*
  // defaults slipped through repeatedly: a checker that computes the right
  // verdict but never surfaces or acts on it is equivalent to no checker.
  console.log(`  (${matched.length} MATCH; ${mismatched.length} MISMATCH; ${unresolved.length} UNRESOLVED — not verified, not proven wrong, see rows above)`);
  if (mismatched.length) {
    console.error(`\nMECHANIZED: FAIL — ${mismatched.length} documented default(s) contradict the compiled SetDefaults() value (see MISMATCH rows above).`);
    process.exit(1);
  }
  // Part A (documented-as-wired vs callers) intentionally does not gate exit
  // code here — DOCUMENTED-BUT-UNWIRED is a different, pre-existing defect
  // class outside this change's scope (documented DEFAULT vs compiled
  // default); wiring it to process.exit belongs with whoever owns that class.
}
