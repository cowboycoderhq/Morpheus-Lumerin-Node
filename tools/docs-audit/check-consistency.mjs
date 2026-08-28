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
  for (const [k, v] of Object.entries(truth)) console.log(`  ${k.padEnd(10)} ${v.port}   ${v.src}`);

  const all = [];
  for (const f of docFiles()) all.push(...scanText(f, read(f), truth));

  console.log(`\ndocs scanned: ${docFiles().length}`);
  if (!all.length) {
    console.log('\nCONSISTENCY: PASS (no page disagrees with source or with itself)');
    process.exit(0);
  }
  for (const f of all) console.log(`  [${f.kind}] ${f.file}${f.line ? ':' + f.line : ''} — ${f.msg}`);
  console.log(`\nCONSISTENCY: ${all.length} problem(s)`);
  process.exit(1);
}
