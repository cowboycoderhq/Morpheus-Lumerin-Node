#!/usr/bin/env node
// check-routes — does every HTTP call the docs show actually exist?
//
// Written because one did not, and survived the whole audit. A provider page
// documented `curl -X POST .../blockchain/bids/<id>/delete`. The router
// registers `r.DELETE("/blockchain/bids/:id")` and has no `/delete` route at
// all, so the documented command 404s: wrong METHOD and a path segment that
// exists nowhere. It was reported in the findings and never fixed, then found by
// accident while validating something else. Accident is not a control.
//
// The Go source is authoritative, not swagger.yaml — but not because the spec is
// stale. It is no longer allowed to be: the `spec-fresh` job in
// .github/workflows/proxy-router-ci.yml lifts the Makefile's own `swag init` line
// out of `make -n swagger`, regenerates into a scratch tree, and fails on a byte
// difference, on every branch and every pull request. That closed the drift hole,
// and it changes nothing here — freshness was never the property this check needs.
//
// Registration is UPSTREAM of the annotation that produces a spec entry. A route
// can be registered with no godoc block at all, and it is then missing from a spec
// that is perfectly in sync with every annotation in the tree. The gin catch-all
// `r.GET("/swagger/*any", ...)` (handlers/httphandlers/http.go:64) is exactly that
// route: no annotation, and correspondingly no path in
// proxy-router/docs/swagger.yaml — and no regeneration will add one while nothing
// annotates it. A spec-derived check cannot see a route nobody described, so the
// router source stays the only complete list of what is actually served.
//
//   node tools/docs-audit/check-routes.mjs
//   node tools/docs-audit/check-routes.mjs --selftest

import { readFileSync } from 'node:fs';
import { join, resolve as resolveFs } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO, repoFiles, docFiles, read, scrubPaths } from './lib.mjs';

const norm = (p) => p.replace(/\*[A-Za-z_][A-Za-z0-9_]*/g, '*')  // gin catch-all /swagger/*any
                     .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '*')   // :id
                     .replace(/\{[^}]+\}/g, '*')                  // {id}
                     .replace(/0x[A-Za-z0-9_]*(?:\u2026|\.\.\.)?/g, '*')  // 0xABC, 0x\u2026, 0x...
                     .replace(/<[^>]+>/g, '*')                    // <YOUR_ID>
                     .replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, '*')   // $MODEL_ID
                     .replace(/\/+$/, '') || '/';

// errno if the reader supplies one, else its message. Never the stack: every
// frame carries an absolute module path, which is the string these gates exist
// to keep out of a published tree.
const reason = (e) => (e && e.code) || String((e && e.message) || 'read failed').slice(0, 100);

// A ROUTER FILE THAT CANNOT BE READ IS NOT A ROUTER THAT REGISTERS NOTHING.
//
// This loop was `try { body = reader(f); } catch { continue; }`, and the way it
// failed is not the one it looks like. adjudicate() below judges a documented call
// ONLY when the first segment of its path appears in knownPrefixes(routes), so a
// lost router file does not manufacture accusations — it deletes a whole PREFIX
// from this gate's scope, and every documented call beneath that prefix becomes
// silently out of scope. A narrower verdict, reported as a clean one.
//
// Measured on this tree with one router file made unreadable: registered routes
// fall from 91 to 57, the entire blockchain prefix disappears from the known set,
// and this BLOCKING gate printed
// `ROUTES: PASS (every documented call resolves to a registered route)` and exited
// 0 over a corpus it had quietly shrunk. Same class as the four sites already
// closed elsewhere in this directory, in a gate that blocks a publish.
//
// The unreadable set is returned beside the routes so the caller has to decide
// about it — silence is no longer an option the shape of this function offers.
export function registeredRoutes(files, reader) {
  const routes = new Map();                 // "METHOD path" -> "file:line"
  const unreadable = [];                    // { file, code }
  for (const f of files) {
    if (!f.endsWith('.go')) continue;
    let body;
    try { body = reader(f); }
    catch (e) { unreadable.push({ file: f, code: reason(e) }); continue; }
    body.split('\n').forEach((line, i) => {
      const m = line.match(/\br\.(GET|POST|PUT|PATCH|DELETE)\(\s*"([^"]+)"/);
      if (m) routes.set(`${m[1]} ${norm(m[2])}`, `${f}:${i + 1}`);
    });
  }
  return { routes, unreadable };
}

// Every HTTP call a document shows. Two shapes: a curl command, and prose of the
// form `METHOD /path`.
export function documentedCalls(text) {
  const calls = [];
  const lines = text.split('\n');

  // A curl command is a UNIT, not a line. Its method-determining flag routinely
  // sits BELOW the URL on a continued line (`--data` three lines down), so a
  // backwards-only window read those as GET and invented six mismatches.
  for (let i = 0; i < lines.length; i++) {
    if (!/\bcurl\b/.test(lines[i])) continue;
    let j = i, cmd = lines[i];
    while (/\\\s*$/.test(lines[j]) && j + 1 < lines.length) { j++; cmd += ' ' + lines[j]; }
    const url = cmd.match(/https?:\/\/[^\s'"`)]+/);
    if (url) {
      const path = url[0].replace(/^https?:\/\/[^/]+/, '') || '/';
      if (path.startsWith('/')) {
        // curl's own precedence: an explicit method wins; otherwise a body makes
        // it POST; otherwise GET.
        const ex = cmd.match(/(?:-X|--request)\s+([A-Z]+)/);
        const body = /(?:^|\s)(?:-d\b|--data(?:-raw|-binary|-urlencode)?\b|-F\b|--form\b)/.test(cmd);
        calls.push({ method: ex ? ex[1] : body ? 'POST' : 'GET', path: norm(path.split('?')[0]), line: i + 1 });
      }
    }
    i = j;
  }

  // Prose of the form `METHOD /path`. Skip PROPOSALS — an RFP saying the router
  // "should expose PATCH /blockchain/bids/:id" is describing work not yet done,
  // and reading it as a claim manufactures a finding.
  const PROPOSAL = /\b(should|would|could|propos|planned|future|not yet|TBD|roadmap)\b/i;
  lines.forEach((line, i) => {
    if (PROPOSAL.test(line)) return;
    // matchAll, not match: a card listing three endpoints on ONE line was being
    // checked only for the first of them, and the third was the wrong one. A
    // blind reviewer found it that this checker had already passed over.
    for (const m of line.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[A-Za-z0-9{}:*_$\u2026.\/-]+)/g))
      calls.push({ method: m[1], path: norm(m[2]), line: i + 1, prose: true });
  });
  return calls;
}

// Only adjudicate paths whose first segment belongs to this router. A doc may
// legitimately curl a third-party API, and calling that a defect manufactures
// findings.
export function knownPrefixes(routes) {
  const s = new Set();
  for (const k of routes.keys()) { const seg = k.split(' ')[1].split('/')[1]; if (seg) s.add(seg); }
  return s;
}

export function adjudicate(calls, routes, prefixes) {
  const out = [];
  for (const c of calls) {
    const seg = c.path.split('/')[1];
    if (!seg || !prefixes.has(seg)) continue;                       // not ours
    const key = `${c.method} ${c.path}`;
    if (routes.has(key)) continue;                                   // exists
    // gin wildcard: a registered `/swagger/*any` serves every path beneath it.
    let wild = false;
    for (const k of routes.keys()) {
      const [m, rp] = [k.split(' ')[0], k.split(' ')[1]];
      if (m !== c.method || !rp.endsWith('*')) continue;
      if (c.path.startsWith(rp.slice(0, -1))) { wild = true; break; }
    }
    if (wild) continue;
    const otherMethod = [...routes.keys()].find((k) => k.split(' ')[1] === c.path);
    out.push({
      ...c,
      why: otherMethod
        ? `path exists but only as ${otherMethod.split(' ')[0]} (${routes.get(otherMethod)}); doc uses ${c.method}`
        : `no route registered for this path under any method`,
    });
  }
  return out;
}

function selftest() {
  const routes = new Map([
    ['DELETE /blockchain/bids/*', 'controller.go:56'],
    ['GET /blockchain/bids/*',    'controller.go:55'],
    ['POST /blockchain/bids',     'controller.go:54'],
    ['GET /swagger/*',            'http.go:64'],
    ['POST /blockchain/sessions/*/close', 'controller.go:77'],
    ['GET /blockchain/providers',  'controller.go:44'],
    ['GET /blockchain/models',     'controller.go:49'],
  ]);
  const prefixes = knownPrefixes(routes);
  const cases = [];
  const t = (label, text, wantHits) => {
    const hits = adjudicate(documentedCalls(text), routes, prefixes);
    cases.push([hits.length === wantHits, label, `${wantHits} hit(s), got ${hits.length}`]);
  };

  // the real defect: right resource, wrong method AND a phantom segment
  t('phantom path segment fires',
    "curl -X POST 'http://localhost:8082/blockchain/bids/0xABC/delete'", 1);
  // near-miss: correct path, wrong method only
  t('wrong method alone fires',
    "curl -X POST 'http://localhost:8082/blockchain/bids/0xABC'", 1);
  // near-miss: correct method and path must stay silent
  t('correct call stays silent',
    "curl -X DELETE 'http://localhost:8082/blockchain/bids/0xABC'", 0);
  // an implicit GET
  t('implicit GET is understood',
    "curl -sS 'http://localhost:8082/blockchain/bids/0xABC'", 0);
  // prose form
  t('prose METHOD /path fires when wrong',
    'change pricing by calling PUT /blockchain/bids/:id instead', 1);
  t('prose METHOD /path silent when right',
    'delete the old bid (DELETE /blockchain/bids/:id) and post a new one', 0);
  // The extractor bug: two curls on adjacent lines. The second must NOT inherit
  // the first's method. Asserted on the PARSED METHOD, not on a hit count — a
  // count of zero would also pass if the extractor found nothing at all, which
  // is the failure this fixture exists to catch.
  {
    const parsed = documentedCalls(
      "curl -s -X POST 'http://localhost:8082/blockchain/bids'\n" +
      "curl -s 'http://localhost:8082/blockchain/bids/0xABC'");
    const curls = parsed.filter((c) => !c.prose);
    const ok = curls.length === 2 && curls[0].method === 'POST' && curls[1].method === 'GET';
    cases.push([ok, 'method does not leak across curls',
                `POST then GET (got ${curls.map((c) => c.method).join(',') || 'nothing'})`]);
  }
  // each new behaviour, with BOTH answers
  {
    const parsed = documentedCalls(
      "curl --location 'http://localhost:8082/blockchain/bids' \\\n" +
      "  --header 'Accept: application/json' \\\n" +
      "  --data '{}'");
    const c = parsed.filter((x) => !x.prose)[0];
    cases.push([c && c.method === 'POST', 'a body below the URL implies POST',
                `POST (got ${c ? c.method : 'nothing'})`]);
  }
  {
    const parsed = documentedCalls("curl -sS 'http://localhost:8082/blockchain/bids/0xABC'");
    const c = parsed.filter((x) => !x.prose)[0];
    cases.push([c && c.method === 'GET', 'no body and no -X stays GET',
                `GET (got ${c ? c.method : 'nothing'})`]);
  }
  t('wildcard route covers paths beneath it',
    "curl 'http://localhost:8082/swagger/index.html'", 0);
  t('a proposal is not a claim',
    'Proxy-router should expose PATCH /blockchain/bids/:id or equivalent.', 0);
  t('the same path stated as fact still fires',
    'The router exposes PATCH /blockchain/bids/:id today.', 1);
  t('ellipsis placeholder resolves to the real route',
    'Close a session | `POST /blockchain/sessions/0x\u2026/close`', 0);
  // Two valid endpoints then an invalid one, all on a single line. Exactly one
  // hit proves the scan reached the THIRD item — the real card that this
  // checker passed over while a blind reviewer caught it.
  t('all endpoints on one line are checked, not just the first',
    'Read: `GET /blockchain/providers`, `GET /blockchain/models`, `GET /blockchain/bids`.', 1);
  // a third-party API must never be adjudicated
  t('third-party URL is out of scope',
    "curl -X POST 'https://api.example.com/v1/chat/completions'", 0);

  // THE UNREADABLE ROUTER FILE, WHICH IS NOT A FALSE-ACCUSATION BUG.
  //
  // Losing a router file cannot produce a wrong finding; it removes a PREFIX, and
  // every documented call beneath it leaves the gate's scope without a word. So
  // the pair that proves it is the SAME document judged twice: once against a
  // complete route table, once against a table with one file missing. One fires,
  // the other is silent — and the silent one was reported as PASS.
  {
    const FILES = {
      'blockchainapi/controller.go': 'r.DELETE("/blockchain/bids/:id")\nr.POST("/blockchain/bids")',
      'walletapi/controller.go': 'r.GET("/wallet")',
      'notes.md': 'r.GET("/not-a-router-file")',
    };
    const all = Object.keys(FILES);
    const whole = registeredRoutes(all, (f) => FILES[f]);
    const boom = (f) => {
      if (f === 'blockchainapi/controller.go') { const e = new Error('denied'); e.code = 'EACCES'; throw e; }
      return FILES[f];
    };
    const holed = registeredRoutes(all, boom);
    cases.push([whole.unreadable.length === 0, 'a readable corpus reports nothing unreadable', 'must stay silent']);
    cases.push([holed.unreadable.length === 1 && holed.unreadable[0].file === 'blockchainapi/controller.go'
                && holed.unreadable[0].code === 'EACCES',
                'an unreadable router file is NAMED, not skipped', 'must fire']);
    cases.push([whole.routes.size === 3 && holed.routes.size === 1,
                'the readable routers are still collected', 'must fire']);
    cases.push([knownPrefixes(whole.routes).has('blockchain') && !knownPrefixes(holed.routes).has('blockchain'),
                'one lost router file removes a WHOLE prefix from scope', 'must fire']);
    const doc = "curl -X POST 'http://localhost:8082/blockchain/bids/0xABC/delete'";
    cases.push([adjudicate(documentedCalls(doc), whole.routes, knownPrefixes(whole.routes)).length === 1,
                'a wrong call fires against a COMPLETE route table', 'must fire']);
    cases.push([adjudicate(documentedCalls(doc), holed.routes, knownPrefixes(holed.routes)).length === 0,
                'the SAME wrong call is silent against the holed table', 'must stay silent']);
  }

  let bad = 0;
  console.log('--- check-routes selftest ---');
  for (const [ok, label, want] of cases) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(42)} ${want}`); }
  console.log(bad ? `ROUTES SELFTEST: FAIL (${bad}/${cases.length})`
                  : `ROUTES SELFTEST: PASS (${cases.length}/${cases.length} — fires on method and path, silent when correct or foreign)`);
  return bad === 0;
}

const IS_MAIN = process.argv[1] && resolveFs(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1);
  try { main(); } catch (e) {
    // ONE LINE, SCRUBBED, NEVER A STACK TRACE — the same wrapper check-dox and the
    // coherence lane carry, and for the same reason. lib's read() throws now, so a
    // document this gate cannot open arrives here; node would print the error WITH
    // its stack, and every frame carries the ABSOLUTE module path that the sibling
    // scanner BLOCKS on under `home-path`. A loud failure that doxes the machine
    // trades one defect for a worse one. The message is already scrubbed in lib;
    // the stack is not, so the stack must never be printed.
    //
    // Exit 2, not 1: nothing was adjudicated and nothing failed adjudication. The
    // runner already separates "could not run" from "ran and found a problem".
    console.error(`ROUTES: NOT RUN — ${scrubPaths(String((e && e.message) || e)).slice(0, 300)}`);
    console.error('The checker stopped before it finished. That is not a pass.');
    process.exit(2);
  }
}

function main() {
  // A SCAN OF NOTHING IS NOT A PASS. An empty corpus is a valid, non-failing input
  // that yields a green verdict having read no router and no document — the same
  // vacuous shape as the `HEAD..HEAD` pass one sibling gate over. It is a broken
  // run, not a clean tree, so it exits 2 (could not run) rather than 0.
  const corpus = repoFiles();
  if (!corpus.length) {
    console.error('ROUTES: NOT RUN — the corpus is EMPTY: 0 file(s) were found, so no router was read.');
    process.exit(2);
  }
  const goFiles = corpus.filter((f) => f.endsWith('.go'));
  const { routes, unreadable } = registeredRoutes(corpus, (f) => readFileSync(join(REPO, f), 'utf8'));
  const prefixes = knownPrefixes(routes);
  console.log(`routers read      : ${goFiles.length - unreadable.length} of ${goFiles.length} .go file(s)`);
  console.log(`routes registered : ${routes.size}`);
  console.log(`path prefixes     : ${[...prefixes].sort().join(', ') || '(none)'}\n`);

  // AN UNREADABLE ROUTER FILE IS A HOLE IN THE ROUTE TABLE, AND THIS GATE BLOCKS.
  // It REFUSES TO ADJUDICATE rather than judging documents against a table it knows
  // is short: the missing routes take their entire path prefix out of scope with
  // them, so every documented call under that prefix would be waved through
  // unexamined. The verdict names the hole instead of narrowing itself in silence.
  for (const u of unreadable.slice(0, 12)) console.log(`  UNREAD ${u.file} (${u.code})`);
  if (unreadable.length) {
    console.log(`\nROUTES: INCOMPLETE — ${unreadable.length} router file(s) could not be read, so every route they register is missing from the table and every documented call under those prefixes would be judged by nothing. NO document was adjudicated.`);
    process.exit(1);
  }
  // Zero routes is check-hygiene's "no module was found to parse" in this gate's
  // vocabulary: knownPrefixes() is empty, adjudicate() puts every documented call
  // out of scope, and PASS would have cleared nothing at all.
  if (!routes.size) {
    console.error('ROUTES: NOT RUN — no router file registered a single route, so every documented call is out of scope and a PASS would have cleared nothing.');
    process.exit(2);
  }
  const docs = docFiles();
  if (!docs.length) {
    console.error('ROUTES: NOT RUN — 0 document(s) were found, so no documented call was examined.');
    process.exit(2);
  }

  // A DOCUMENT THIS GATE CANNOT READ IS A DOCUMENT WHOSE WRONG CALL IT NEVER SAW —
  // the same decision as the router files above, on the other side of the
  // comparison. read() throws, so this used to leave the process on a raw stack.
  const unread = [];
  const findings = [];
  let scanned = 0, inScope = 0;
  for (const f of docs) {
    let text;
    try { text = read(f); }
    catch (e) { unread.push({ file: f, code: reason(e) }); continue; }
    scanned++;
    const calls = documentedCalls(text);
    // Printed because it is the ONE number that makes a narrowed scope visible: a
    // green run whose in-scope count has collapsed is the failure above, wearing a
    // clean verdict.
    for (const c of calls) { const seg = c.path.split('/')[1]; if (seg && prefixes.has(seg)) inScope++; }
    for (const h of adjudicate(calls, routes, prefixes)) {
      findings.push(`  MISMATCH ${f}:${h.line}  ${h.method} ${h.path}\n           ${h.why}`);
    }
  }
  for (const line of findings) console.log(line);
  console.log(`documents read    : ${scanned} of ${docs.length}`);
  console.log(`calls in scope    : ${inScope} documented call(s) under a registered prefix`);
  for (const u of unread.slice(0, 12)) console.log(`  UNREAD ${u.file} (${u.code})`);
  if (unread.length) {
    console.log(`\nROUTES: INCOMPLETE — ${unread.length} document(s) could not be read, so a wrong call in them was never checked`);
    process.exit(1);
  }
  console.log(findings.length ? `\nROUTES: ${findings.length} documented call(s) do not match a registered route`
                              : '\nROUTES: PASS (every documented call resolves to a registered route)');
  process.exit(findings.length ? 1 : 0);
}
