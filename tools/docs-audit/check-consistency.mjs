#!/usr/bin/env node
// check-consistency — do the docs agree with the source, and with THEMSELVES?
//
// Six review rounds compared docs against source and never asked whether a page
// contradicts its own examples. api-endpoints.mdx stated "the API your node exposes
// on :8082" and then gave six curl commands against :8084/:8085 — every one of them
// fails if pasted, and nothing caught it, because every lane was pointed outward at
// the source instead of inward at the page.
//
// Two checks:
//   1. VALUE DRIFT — a doc states a port for a known service that disagrees with the
//      value the source actually defaults to.
//   2. SELF-CONTRADICTION — one page uses two different ports for the same service.
//
// Ports are resolved from source ONCE and every doc is compared against that single
// resolver, rather than each page carrying its own copy of the number.
//
//   node tools/docs-audit/check-consistency.mjs
//   node tools/docs-audit/check-consistency.mjs --selftest

import { readFileSync } from 'node:fs';
import { join, resolve as resolveFs } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO, docFiles } from './lib.mjs';

const read = (f) => readFileSync(join(REPO, f), 'utf8');

// ---- the single resolver: every known port, derived from source, never typed ----
export function truthPorts() {
  const out = {};
  const cfg = read('proxy-router/internal/config/config.go');
  const web = /cfg\.Web\.Address\s*=\s*"[^":]*:(\d+)"/.exec(cfg);
  if (web) out.proxyApi = { port: web[1], src: 'proxy-router/internal/config/config.go (cfg.Web.Address)' };

  const env = read('ui-desktop/env.schema.ts');
  for (const [key, name] of [
    ['SERVICE_AI_API_PORT', 'aiRuntime'],
    ['SERVICE_IPFS_API_PORT', 'ipfsApi'],
    ['SERVICE_PROXY_PORT', 'proxyTcp'],
  ]) {
    const m = new RegExp(`${key}:\\s*TypePort\\(\\{\\s*default:\\s*(\\d+)`).exec(env);
    if (m) out[name] = { port: m[1], src: `ui-desktop/env.schema.ts (${key})` };
  }
  return out;
}

// Which service a URL refers to, judged by the path that follows it. Only paths
// that unambiguously belong to one service are classified; anything else is left
// alone rather than guessed at.
const PROXY_API_PATH = /^\/(v1|blockchain|proxy|auth|healthcheck|swagger|config|files|ipfs|docker)\b/;

// /v1/chat/completions is served BOTH by the proxy-router and by a provider's own
// model backend. In a models-config apiUrl the host is the backend, not the router,
// so the router's port must not be imposed on it. Judging the path alone flagged a
// correct example as drift.
const BACKEND_CONTEXT = /apiUrl|model_host|model_port|models-config|"apiType"|llama-server/i;

export function classify(url, tail, lineText = '') {
  if (BACKEND_CONTEXT.test(lineText)) return null;
  if (PROXY_API_PATH.test(tail)) return 'proxyApi';
  return null;
}

// THE SERVICES THIS GATE CAN ACTUALLY ADJUDICATE.
// truthPorts() resolves four ports; classify() can only ever return 'proxyApi',
// so the other three are resolved, printed, and never consulted. Anyone reading
// "ports resolved from source: proxyApi/aiRuntime/ipfsApi/proxyTcp" would take
// all four to be checked. Naming the set here — beside the only function that
// can widen it — makes the gap explicit, lets the verdict label the unused rows,
// and gives the NOT-RUN guard below something exact to require.
export const CLASSIFIABLE = ['proxyApi'];

const URL_RE = /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::(\d+))?((?:\/[\w:*.$%{}<>-]*)*)/g;

export function scanText(file, text, truth) {
  const findings = [];
  const seen = {};       // service -> Set(port) within this file
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(URL_RE)) {
      const port = m[1];
      if (!port) continue;
      const svc = classify(m[0], m[2] || '', line);
      if (!svc || !truth[svc]) continue;
      (seen[svc] ||= new Map()).set(port, (seen[svc].get(port) || 0) + 1);
      if (port !== truth[svc].port) {
        findings.push({
          kind: 'value-drift', file, line: i + 1,
          msg: `${svc} port ${port} but source defaults to ${truth[svc].port} — ${truth[svc].src}`,
        });
      }
    }
  });
  for (const [svc, ports] of Object.entries(seen)) {
    if (ports.size > 1) {
      findings.push({
        kind: 'self-contradiction', file, line: 0,
        msg: `page uses ${ports.size} different ${svc} ports: ${[...ports.keys()].join(', ')}`,
      });
    }
  }
  return findings;
}

function selftest() {
  const truth = { proxyApi: { port: '8082', src: 'test' } };
  const cases = [];
  const run = (label, text, wantKinds) => {
    const got = scanText('x.mdx', text, truth).map((f) => f.kind);
    const ok = wantKinds.length === 0
      ? got.length === 0
      : wantKinds.every((k) => got.includes(k)) && got.length >= wantKinds.length;
    cases.push([ok, label, wantKinds.length ? `must flag ${wantKinds.join('+')}` : 'must stay silent']);
  };

  run('correct port', "curl 'http://localhost:8082/v1/chat/completions'", []);
  // near-miss: one digit off, still a plausible port
  run('one digit off', "curl 'http://localhost:8083/v1/chat/completions'", ['value-drift']);
  // the real defect: page states one port, examples use another
  run('page contradicts itself',
    "the API on `:8082`\ncurl 'http://localhost:8084/v1/chat/completions'\ncurl 'http://localhost:8082/blockchain/providers'",
    ['value-drift', 'self-contradiction']);
  // a port for a DIFFERENT service on a path we do not classify must not be flagged
  run('unclassified path left alone', "open http://localhost:8080/ in your browser", []);
  // a bare host with no port must not be flagged
  run('no port present', "curl 'http://localhost/v1/models'", []);
  // a provider's own model backend, not the router — its port is the provider's choice
  run('models-config apiUrl left alone',
    '  "apiUrl": "http://localhost:8080/v1/chat/completions"', []);

  // --- live anchors: the RESOLVER, not a hardcoded stand-in -----------------
  // Every case above feeds the hardcoded `truth` on the first line of this
  // function, so all six keep passing when truthPorts() stops resolving
  // anything at all — and that is the one failure that turns this entire gate
  // into a no-op. classify() can only name a CLASSIFIABLE service, so an
  // unresolved entry makes scanText skip every URL at `!truth[svc]` and main()
  // print a vacuous PASS over a full corpus. Reproduced by replacing the literal
  // address in config.go with a named constant — an ordinary refactor.
  //
  // Each case REQUIRES its row to exist. check-mechanized:373-386 records why:
  // a live case asserted negatively over an optional chain reported ok while its
  // own evidence read "row not found" — it passed BECAUSE the subject had been
  // deleted, and deleting the subject is the easier of the two to do by accident.
  const live = truthPorts();
  for (const svc of CLASSIFIABLE) {
    const row = live[svc];
    cases.push([!!row && /^\d+$/.test(String(row.port)),
      `live: truthPorts() resolves ${svc}`,
      row ? `port ${row.port} from ${row.src}` : 'NOT RESOLVED — this gate would adjudicate nothing']);
  }

  let bad = 0;
  console.log('--- check-consistency selftest ---');
  for (const [ok, label, want] of cases) {
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(32)} ${want}`);
  }
  console.log(bad
    ? `CONSISTENCY SELFTEST: FAIL (${bad}/${cases.length})`
    : `CONSISTENCY SELFTEST: PASS (${cases.length}/${cases.length} — every check returns both answers)`);
  return bad === 0;
}

const IS_MAIN = process.argv[1] && resolveFs(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1);

  const truth = truthPorts();
  console.log('ports resolved from source:');
  for (const [k, v] of Object.entries(truth)) {
    const used = CLASSIFIABLE.includes(k);
    console.log(`  ${k.padEnd(10)} ${v.port}   ${v.src}`
      + (used ? '' : '   (resolved, NOT adjudicated — no documented path classifies to it)'));
  }

  // A SCAN OF NOTHING IS NOT A PASS — the same decision check-routes.mjs:302-341,
  // check-addresses.mjs:139-146, check-dox.mjs:271-286 and check-hygiene.mjs:340-365
  // already make, and the one this gate was missing.
  //
  // The oracle here is ONE regex over ONE line of config.go. When it stops
  // matching — a named constant, a reformat, a rename — truth.proxyApi is
  // undefined, scanText skips every URL at `!truth[svc]`, `all` is empty and
  // main() prints CONSISTENCY: PASS over a full corpus, having adjudicated
  // nothing. Measured: with a planted port drift in the tree, refactoring that
  // one line took the gate from 2 findings to PASS with 91 docs "scanned".
  //
  // Emptiness is not the test — a MISSING CLASSIFIABLE SERVICE is. truthPorts()
  // still returned three other ports in that run, so `Object.keys(truth).length`
  // was 3 and any check for a bare empty object would have waved it through.
  const missing = CLASSIFIABLE.filter((s) => !truth[s]);
  if (missing.length) {
    console.error(`CONSISTENCY: NOT RUN — the port oracle resolved nothing for: ${missing.join(', ')}. `
      + 'Every URL for those services is skipped unjudged, so a PASS would clear nothing. '
      + 'Check the resolver in truthPorts() against the source it reads.');
    process.exit(2);
  }
  const docs = docFiles();
  if (!docs.length) {
    console.error('CONSISTENCY: NOT RUN — 0 document(s) were found, so no page was examined.');
    process.exit(2);
  }

  const all = [];
  for (const f of docs) all.push(...scanText(f, read(f), truth));

  console.log(`\ndocs scanned: ${docs.length}`);
  if (!all.length) {
    console.log('\nCONSISTENCY: PASS (no page disagrees with source or with itself)');
    process.exit(0);
  }
  for (const f of all) console.log(`  [${f.kind}] ${f.file}${f.line ? ':' + f.line : ''} — ${f.msg}`);
  console.log(`\nCONSISTENCY: ${all.length} problem(s)`);
  process.exit(1);
}
