// Phase-D verification runner v2: drives the REAL app surface (real IPC/backend),
// proves the page rendered (sentinel) AND that it is the intended page
// (route-identity), runs the computed-style audit (looks) and the behavioral
// probes (does: clickability hit-tests, scroll write-back, declared click
// assertions), captures motion-frozen screenshots, and writes the evidence
// file the visual gate checks.
//
// v2 (2026-07-13, council-mandated): v1 proved what the UI looks like, never
// what it does — the four operator-caught failures were all in the blind spot.
//
// Modes (auto-detected, overridable):
//   electron: --app-dir <dir with out/main/index.*js + node_modules/.bin/electron>
//             (or UI_APP_DIR env; auto-detected if exactly one candidate exists)
//   web:      --url http://localhost:5173   (or APP_URL env)
//
// Usage:  node run.js [--url U | --app-dir D] [--routes "#/,#/models"] [--hue green]
//                     [--expect "#/account=[data-testid=acct];#/models=[data-testid=models]"]
//                     [--click "button.save => [data-testid=saved-toast]"]   (repeatable;
//                        prefix the selector with "hover " to hover instead of click)
//                     [--label "chat reskin"] [--min-els 30] [--min-text 10]
//                     [--allow-net] [--selftest]
//
// Evidence: <repo>/verify/<branch>-<stagedDiffHash>.md  (+ shots in verify/shots/)
// The gate recomputes the staged-diff hash; edit anything after verifying and
// the hash moves -> gate re-fails. That is the point.
//
// SAFETY: the runner never real-clicks anything it wasn't explicitly told to
// click. Declared targets whose accessible name matches the danger classes
// (pay/delete/send/...) are downgraded to Playwright trial clicks (all
// actionability checks incl. hit-target, no dispatch). During real clicks,
// non-GET requests to non-local origins are blocked unless --allow-net.
import { _electron, chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIT_FN } from './audit.js';
import { BEHAVE_FN, DANGER_RE } from './behave.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = execSync('git rev-parse --show-toplevel', { cwd: here }).toString().trim();

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const args = (name) => {           // all occurrences of a repeatable flag
  const out = [];
  process.argv.forEach((a, i) => { if (a === '--' + name && process.argv[i + 1]) out.push(process.argv[i + 1]); });
  return out;
};
const routes = arg('routes', '').split(',').filter(Boolean);
const hue = arg('hue', 'green');
const label = arg('label', '');
const url = arg('url', process.env.APP_URL || '');
const allowNet = process.argv.includes('--allow-net');
const selftest = process.argv.includes('--selftest');

const fail = (msg) => {
  console.error('VERIFY: FAIL — ' + msg);
  process.exit(1);
};

// --expect "route=selector;route=selector" — selectors may contain commas, so ';' separates
const expectMap = {};
for (const pair of arg('expect', '').split(';').filter(Boolean)) {
  const eq = pair.indexOf('=');
  if (eq < 1) fail(`malformed --expect entry: ${pair}`);
  expectMap[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
}
// --click "sel => expectSel" (repeatable). "hover sel => expectSel" hovers instead.
const clicks = args('click').map((c) => {
  const m = c.split('=>');
  if (m.length !== 2) fail(`malformed --click (need "sel => expectSel"): ${c}`);
  let sel = m[0].trim(), action = 'click';
  if (sel.startsWith('hover ')) { action = 'hover'; sel = sel.slice(6).trim(); }
  return { sel, action, expect: m[1].trim() };
});

// Electron app dir: flag > env > auto-detect (exactly one match, else fail loudly)
const findElectronDir = () => {
  const flag = arg('app-dir', process.env.UI_APP_DIR || '');
  if (flag) return resolve(flag);
  const hits = readdirSync(repo, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
    .map((d) => join(repo, d.name))
    .concat([repo])
    .filter((p) =>
      existsSync(join(p, 'node_modules', '.bin', 'electron')) &&
      (existsSync(join(p, 'out', 'main', 'index.mjs')) || existsSync(join(p, 'out', 'main', 'index.js'))));
  if (hits.length !== 1)
    fail(`cannot auto-detect Electron app dir (${hits.length} candidates) — pass --app-dir or --url`);
  return hits[0];
};

const sh = (cmd) => execSync(cmd, { cwd: repo }).toString().trim();
const branch = sh('git rev-parse --abbrev-ref HEAD').replace(/[^a-zA-Z0-9._-]/g, '_');
const diffHash = sh('git diff --cached | git hash-object --stdin').slice(0, 8);

const verifyDir = join(repo, 'verify');
const shotsDir = join(verifyDir, 'shots');
mkdirSync(shotsDir, { recursive: true });

let app = null, browser = null, page;
if (url) {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => fail(`cannot reach ${url}: ${e.message}`));
} else {
  const appDir = findElectronDir();
  const entry = existsSync(join(appDir, 'out', 'main', 'index.mjs'))
    ? join(appDir, 'out', 'main', 'index.mjs') : join(appDir, 'out', 'main', 'index.js');
  app = await _electron.launch({
    executablePath: join(appDir, 'node_modules', '.bin', 'electron'),
    args: [entry],
    cwd: appDir,
    env: { ...process.env, NODE_ENV: 'production' },
  });
  page = await app.firstWindow({ timeout: 30000 });
}

// Backstop while we real-click: a mis-declared click must not be able to spend
// money or send anything — block non-GET requests to non-local origins.
let netBlocked = [];
const armNetGuard = async () => {
  if (allowNet) return;
  await page.route('**/*', (route) => {
    const req = route.request();
    let local = true;
    try { local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(new URL(req.url()).hostname); } catch { local = true; }
    if (req.method() !== 'GET' && !local) {
      netBlocked.push(`${req.method()} ${req.url()}`);
      return route.abort();
    }
    return route.continue();
  });
};
const disarmNetGuard = async () => { if (!allowNet) await page.unroute('**/*'); };

try {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // freeze motion + tests the policy honors it
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2500); // let the renderer settle

  const results = [];
  const targets = routes.length ? routes : [await page.evaluate('location.hash || "#/"')];

  for (const route of targets) {
    await page.evaluate(`location.hash = ${JSON.stringify(route)}`);
    await page.waitForTimeout(1200);

    // SENTINEL — the gate must be able to fail: an empty shell passes every
    // audit rule, so "nothing rendered" is a FAILURE, never a pass.
    const sentinel = await page.evaluate(`(() => ({
      els: document.querySelectorAll('*').length,
      text: (document.body.innerText || '').trim().length
    }))()`);
    const minEls = +arg('min-els', 30), minText = +arg('min-text', 10);
    if (sentinel.els < minEls || sentinel.text < minText)
      fail(`route ${route} rendered an empty shell (${sentinel.els} elements < ${minEls}, or ${sentinel.text} chars < ${minText}) — app surface not live (tune --min-els/--min-text only with a reason)`);

    // ROUTE IDENTITY — a sentinel proves *a* live surface, not *the* surface
    // (learnings 2026-07-12): an auth wall or wrong screen passes liveness and
    // every audit rule. The marker must be unique to the intended screen.
    let identity = null;
    if (expectMap[route]) {
      const n = await page.locator(expectMap[route]).count();
      identity = { marker: expectMap[route], found: n > 0 };
      if (!n)
        fail(`route ${route}: IDENTITY FAIL — marker ${expectMap[route]} not found; the live surface is not the intended screen (auth wall? wrong route?). Add the marker to the screen or fix the route.`);
      console.log(`route ${route}: identity PROVEN (${expectMap[route]})`);
    } else if (Object.keys(expectMap).length) {
      console.log(`route ${route}: no --expect marker declared — identity NOT proven for this route`);
    }

    await page.evaluate(`window.__AUDIT_HUE = ${JSON.stringify(hue)}`);

    // --selftest: plant one defect per rule; a detector that cannot fire is not a detector.
    if (selftest) {
      await page.evaluate(`(() => {
        const host = document.createElement('div');
        host.id = '__audit_selftest';
        // fixed + top z-index: in a 100vh app shell, body-appended content lands
        // below the fold and the hit-test's offscreen skip would drop the plants
        host.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;background:#fff;padding:4px';
        host.innerHTML =
          '<div style="background:rgb(30,30,30);width:200px;height:40px;border-radius:0">' +
          '<span style="color:rgb(50,50,50);font-size:14px">planted low contrast</span></div>' +
          '<div style="background:rgb(20,220,140);width:60px;height:30px;border-radius:8px"></div>' +
          '<div style="overflow-y:auto;height:0"><div style="height:400px"></div></div>' +
          '<div style="position:relative;width:10px;height:10px">' +
          '<button id="__st_pe" style="pointer-events:none;position:absolute;left:60px;top:0;width:80px;height:30px">pe btn</button></div>' +
          '<div style="position:relative;width:120px;height:36px">' +
          '<button id="__st_cov" style="position:absolute;inset:0">covered btn</button>' +
          '<div style="position:absolute;inset:0;background:rgba(0,0,0,0.01)"></div></div>' +
          '<div id="__st_frozen" style="overflow-y:auto;height:60px;width:100px"><div style="height:600px">tall</div></div>' +
          '<button id="__st_clickme" style="width:90px;height:30px">click me</button>' +
          '<button id="__st_danger" style="width:90px;height:30px">Delete everything</button>';
        document.body.appendChild(host);
        const fz = document.getElementById('__st_frozen');
        fz.addEventListener('scroll', () => { fz.scrollTop = 0; });
        document.getElementById('__st_clickme').addEventListener('click', () => {
          const t = document.createElement('div'); t.id = '__st_toast'; t.textContent = 'clicked';
          document.getElementById('__audit_selftest').appendChild(t);
        });
        window.__st_danger_fired = false;
        document.getElementById('__st_danger').addEventListener('click', () => { window.__st_danger_fired = true; });
      })()`);

      const stAudit = await page.evaluate(`(${AUDIT_FN})()`);
      const stBehave = await page.evaluate(`(${BEHAVE_FN})()`);
      const got = new Set([...stAudit, ...stBehave.findings].map((f) => f.rule));
      const want = ['contrast', 'hard-corner', 'palette-leftover', 'dead-scroll', 'unclickable', 'frozen-scroll'];
      const missing = want.filter((w) => !got.has(w));
      if (missing.length) fail(`selftest: planted defects NOT detected: ${missing.join(', ')}`);

      // unclickable must have fired for BOTH planted classes
      const uc = stBehave.findings.filter((f) => f.rule === 'unclickable').map((f) => f.el);
      if (!uc.some((e) => e.includes('__st_pe'))) fail('selftest: pointer-events:none button not detected');
      if (!uc.some((e) => e.includes('__st_cov'))) fail('selftest: overlay-covered button not detected');

      // route-identity detector must be able to fail: a nonexistent marker must count 0
      if (await page.locator('#__no_such_marker__').count() !== 0) fail('selftest: identity counter broken');

      // declared click: real click must land and its postcondition appear
      await page.click('#__st_clickme');
      if (await page.locator('#__st_toast').count() !== 1) fail('selftest: declared-click postcondition not observed');

      // danger downgrade: a danger-named target must be trial-clicked, never dispatched
      const dangerName = await page.evaluate(`document.getElementById('__st_danger').innerText`);
      if (!DANGER_RE.test(dangerName)) fail('selftest: danger regex did not match "Delete everything"');
      await page.click('#__st_danger', { trial: true, timeout: 2000 });
      if (await page.evaluate('window.__st_danger_fired')) fail('selftest: trial click DISPATCHED a real click — unsafe Playwright version?');

      await page.evaluate(`document.getElementById('__audit_selftest')?.remove()`);
      console.log('selftest: all 6 planted defect classes detected; trial click dispatched nothing; identity counter can fail');
    }

    const findings = await page.evaluate(`(${AUDIT_FN})()`);
    const behave = await page.evaluate(`(${BEHAVE_FN})()`);
    findings.push(...behave.findings);

    // Declared click assertions (real interaction, explicitly opted-in per run)
    const clickResults = [];
    if (clicks.length) await armNetGuard();
    for (const c of clicks) {
      const loc = page.locator(c.sel).first();
      if (!(await loc.count())) { clickResults.push({ ...c, ok: false, note: 'target not found' }); continue; }
      const name = ((await loc.innerText().catch(() => '')) || (await loc.getAttribute('aria-label').catch(() => '')) || '').trim();
      if (c.action === 'click' && DANGER_RE.test(name)) {
        try {
          await loc.click({ trial: true, timeout: 3000 });
          clickResults.push({ ...c, ok: true, note: `DANGER name "${name.slice(0, 30)}" — downgraded to trial click (actionable, not dispatched); postcondition NOT checked` });
        } catch (e) {
          clickResults.push({ ...c, ok: false, note: `DANGER name "${name.slice(0, 30)}" — trial click failed actionability: ${e.message.split('\n')[0]}` });
        }
        continue;
      }
      try {
        if (c.action === 'hover') await loc.hover({ timeout: 3000 });
        else await loc.click({ timeout: 3000 });
        await page.waitForSelector(c.expect, { timeout: 4000 });
        clickResults.push({ ...c, ok: true });
      } catch (e) {
        clickResults.push({ ...c, ok: false, note: e.message.split('\n')[0] });
      }
    }
    if (clicks.length) await disarmNetGuard();
    for (const cr of clickResults.filter((r) => !r.ok))
      findings.push({ rule: 'interaction', el: cr.sel, action: cr.action, expected: cr.expect, note: cr.note });

    const shot = join(shotsDir, `${branch}-${diffHash}-${route.replace(/[^a-z0-9]/gi, '_')}.png`);
    await page.screenshot({ path: shot, animations: 'disabled', fullPage: false });

    results.push({ route, sentinel, identity, probes: behave.probes, findings, clickResults, shot });
    console.log(`route ${route}: ${findings.length} findings — probes: ${behave.probes.interactive} interactive hit-tested, ${behave.probes.scrollables} scrollables exercised — ${shot}`);
    for (const f of findings.slice(0, 25)) console.log('  ', JSON.stringify(f));
    if (findings.length > 25) console.log(`   … ${findings.length - 25} more (see evidence file)`);
  }

  const evidence = join(verifyDir, `${branch}-${diffHash}.md`);
  writeFileSync(evidence, [
    `# UI verify evidence`,
    `- date: ${sh('date +%F')} · branch: ${branch} · staged-diff hash: ${diffHash}`,
    label ? `- label: ${label}` : null,
    `- surface: ${url || 'electron'} · routes: ${targets.join(', ')} · hue band: ${hue}`,
    netBlocked.length ? `- NET GUARD blocked during clicks: ${netBlocked.join(' · ')}` : null,
    ...results.map((r) =>
      `\n## ${r.route}\n- sentinel: ${r.sentinel.els} elements, ${r.sentinel.text} chars` +
      `\n- identity: ${r.identity ? (r.identity.found ? `PROVEN (${r.identity.marker})` : 'FAIL') : 'not declared — surface unproven'}` +
      `\n- behavioral probes: ${r.probes.interactive} interactive hit-tested, ${r.probes.scrollables} scrollables exercised` +
      (r.clickResults.length ? `\n- declared interactions:\n` + r.clickResults.map((c) => `  - ${c.action} ${c.sel} => ${c.expect}: ${c.ok ? 'OK' : 'FAIL'}${c.note ? ' — ' + c.note : ''}`).join('\n') : '') +
      `\n- screenshot: ${r.shot}\n- findings (${r.findings.length}):\n` +
      (r.findings.length
        ? r.findings.map((f) => `  - ${JSON.stringify(f)}`).join('\n')
        : '  - none')),
    `\n> Findings above are OPEN until fixed or explicitly waived here with a reason.`,
    `> A claim that behavior changed cites a line from THIS file (or a liveness/driver log) — or says "unverified".`,
  ].filter(Boolean).join('\n'));

  console.log(`\nevidence: ${evidence}`);
  const total = results.reduce((n, r) => n + r.findings.length, 0);
  const unproven = results.filter((r) => !r.identity).map((r) => r.route);
  const idNote = unproven.length ? `; identity UNPROVEN on ${unproven.join(', ')} — a sentinel proves a surface, not the surface` : '; identity proven';
  console.log(total === 0 ? `VERIFY: PASS (0 findings; sentinel ok${idNote})` : `VERIFY: ${total} findings — fix or waive in the evidence file${idNote}`);
} finally {
  if (app) await app.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
}
