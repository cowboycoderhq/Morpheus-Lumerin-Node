import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path'; import { fileURLToPath } from 'url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE,'..','..','verify','shots'); mkdirSync(SHOTS,{recursive:true});
const arg=(n,d)=>{const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;};
const LABEL = arg('label','run');

const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('localhost:5173'));

const msgs = [];
page.on('console', m => msgs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', e => msgs.push(`pageerror: ${e.message}`));

// 1. PROVE THE PIPE. A silent console is only evidence if the pipe demonstrably carries traffic.
await page.evaluate(`console.log('PIPE-SELFTEST-OK')`);
await page.waitForTimeout(500);
const pipeOk = msgs.some(m => m.includes('PIPE-SELFTEST-OK'));
console.log(`[capture] pipe self-test: ${pipeOk ? 'PASS (listener is live)' : 'FAIL (listener dead)'}`);
if (!pipeOk) { console.error('ABORT: cannot trust an "absent" result from a dead pipe.'); await b.close(); process.exit(2); }

// 2. Fresh JS context so SC's module-level warn-once Set is reset.
console.log('[capture] reloading -> app drops to Login. WAITING FOR OPERATOR LOGIN...');
await page.reload({ waitUntil: 'domcontentloaded' });

let inApp = 0;
for (let i = 0; i < 240; i++) {
  inApp = await page.locator('[data-testid="router-container"]').count().catch(()=>0);
  if (inApp) break;
  await new Promise(r => setTimeout(r, 5000));
}
if (!inApp) { console.error('TIMEOUT: never reached the router shell.'); await b.close(); process.exit(1); }
console.log('[capture] logged in — router shell up. Visiting every route to mount all styled(Component) wrappers...');

for (const h of ['#/wallet','#/chat','#/models','#/agents','#/providers','#/settings']) {
  await page.evaluate(`location.hash = ${JSON.stringify(h)}`);
  await page.waitForTimeout(2000);
}
// the trigger surfaces the SC v4 checker keys on
const triggers = await page.evaluate(`({
  navLinks: document.querySelectorAll('a[href^="#/"]').length,
  textareas: document.querySelectorAll('textarea').length,
})`);
await page.evaluate(`location.hash = "#/chat"`); await page.waitForTimeout(1500);
await page.screenshot({ path: join(SHOTS, `boot-${LABEL}.png`), animations:'disabled' });

const hits = msgs.filter(m => /findDOMNode/i.test(m));
console.log(`\n[capture] trigger surfaces mounted: ${JSON.stringify(triggers)}`);
console.log(`[capture] console messages captured: ${msgs.length}`);
console.log(`[capture] findDOMNode hits: ${hits.length}`);
hits.slice(0,3).forEach(h=>console.log('  >> '+h.slice(0,170)));
console.log('[capture] all warnings/errors:');
msgs.filter(m=>/^(error|pageerror|warning)/i.test(m)).slice(0,12).forEach(m=>console.log('   '+m.slice(0,140)));
writeFileSync(join(HERE,'..','..','verify',`boot-${LABEL}.json`), JSON.stringify({triggers,msgs},null,2));
console.log(`\nRESULT[${LABEL}]: findDOMNode ${hits.length ? 'PRESENT' : 'ABSENT'} (pipe proven live, ${msgs.length} msgs)`);
await b.close();
