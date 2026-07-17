import { chromium } from 'playwright';
import { AUDIT_FN } from './audit.js';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path'; import { fileURLToPath } from 'url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE,'..','..','verify','shots'); mkdirSync(SHOTS,{recursive:true});

const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('localhost:5173'));

const msgs = [];
page.on('console', m => msgs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', e => msgs.push(`pageerror: ${e.message}`));

// NON-VACUITY: the SC v4 checker only fires for styled(Component) wrappers.
// Assert those trigger surfaces actually mount, or a clean console proves nothing.
const triggers = await page.evaluate(`({
  navLinks: document.querySelectorAll('nav a, [class*="sc-"] a[href^="#/"]').length,
  routerShell: document.querySelectorAll('[data-testid="router-container"]').length,
})`);
console.log(`TRIGGER SURFACES (styled(NavLink) etc): ${JSON.stringify(triggers)}`);

const routes = [
  { hash:'#/wallet',    name:'wallet',    marker:'[data-testid="dashboard-container"]' },
  { hash:'#/chat',      name:'chat',      marker:'textarea' },
  { hash:'#/models',    name:'models',    marker:'[data-testid="models-container"]' },
  { hash:'#/agents',    name:'agents',    marker:'[data-testid="agents-container"]' },
  { hash:'#/providers', name:'providers', marker:'[data-testid="models-container"]' },
  { hash:'#/settings',  name:'settings',  marker:'[data-testid="agents-container"]' },
];
const results = [];
for (const r of routes) {
  await page.evaluate(`location.hash = ${JSON.stringify(r.hash)}`);
  await page.waitForTimeout(2200);
  const identity = await page.locator(r.marker).count().catch(()=>0);
  const els = await page.evaluate('document.querySelectorAll("*").length');
  await page.evaluate(`window.__AUDIT_HUE = "green"`);
  const findings = await page.evaluate(`(${AUDIT_FN})()`).catch(e=>[{rule:'AUDIT_ERROR',detail:String(e)}]);
  // styled-components actually applied styles here? (v5 engine swap sanity)
  const styled = await page.evaluate(`document.querySelectorAll('[class*="sc-"]').length`);
  const sheets = await page.evaluate(`document.querySelectorAll('style[data-styled]').length`);
  await page.screenshot({ path: join(SHOTS, `v5-${r.name}.png`), animations:'disabled' });
  results.push({ ...r, identity, els, styled, sheets, findings: findings.length, detail: findings.slice(0,6) });
  console.log(`${r.hash.padEnd(12)} identity=${identity?'OK ':'FAIL'} els=${String(els).padStart(4)} sc-classed=${String(styled).padStart(4)} sc-sheets=${sheets} findings=${findings.length}`);
  findings.slice(0,5).forEach(f=>console.log(`    - ${JSON.stringify(f).slice(0,150)}`));
}
const hits = msgs.filter(m=>/findDOMNode/i.test(m));
console.log(`\nCONSOLE: ${msgs.length} messages | findDOMNode hits: ${hits.length}`);
hits.slice(0,3).forEach(h=>console.log('  >> '+h.slice(0,160)));
console.log('errors/warnings:');
msgs.filter(m=>/^(error|pageerror|warning)/i.test(m)).slice(0,10).forEach(m=>console.log('  '+m.slice(0,140)));
writeFileSync(join(HERE,'..','..','verify','sc-v5-routes.json'), JSON.stringify({results,console:msgs},null,2));
await b.close();
