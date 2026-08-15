import { chromium } from 'playwright';
const arg=(n,d)=>{const i=process.argv.indexOf('--'+n);return i>-1?process.argv[i+1]:d;};
const LABEL=arg('label','run'), EXPECT=arg('expect','absent');
const b = await chromium.connectOverCDP('http://localhost:9222');
const page = b.contexts()[0].pages().find(p => p.url().includes('localhost:5173'));
const msgs=[];
page.on('console', m => msgs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', e => msgs.push(`pageerror: ${e.message}`));
// prove every channel, not just log — React warnings ride console.error
await page.evaluate(`console.log('P-LOG');console.warn('P-WARN');console.error('P-ERROR')`);
await page.waitForTimeout(400);
const pipe = ['P-LOG','P-WARN','P-ERROR'].every(c=>msgs.some(m=>m.includes(c)));
console.log(`[boot] pipe (log+warn+error): ${pipe?'LIVE':'DEAD'}`);
if(!pipe){console.error('ABORT: dead pipe');await b.close();process.exit(2);}
msgs.length=0;
// fresh JS context; ToastsProvider mounts at App level, above the auth wall
await page.reload({waitUntil:'domcontentloaded'});
await page.waitForTimeout(12000);
const surface = await page.evaluate('(document.body.innerText||"").slice(0,80)');
const hits = msgs.filter(m=>/findDOMNode/i.test(m));
console.log(`[boot] surface: ${String(surface).replace(/\n/g,' | ')}`);
console.log(`[boot] messages: ${msgs.length} | findDOMNode hits: ${hits.length}`);
hits.slice(0,2).forEach(h=>console.log('  >> '+h.slice(0,120)));
const observed = hits.length?'present':'absent';
console.log(`RESULT[${LABEL}]: expected=${EXPECT} observed=${observed} -> ${observed===EXPECT?'PASS':'FAIL'}`);
await b.close(); process.exit(observed===EXPECT?0:1);
