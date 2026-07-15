// Isolation-render drive: start Vite, mount each component in a real browser,
// drive it, assert behaviour (incl. that destructive handlers fired 0x), screenshot.
// Run: npm run isolate   (or node run.mjs)
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(here, 'shots');
mkdirSync(SHOTS, { recursive: true });
const PORT = 5233;
let failures = 0;
const results = [];

async function drive(page, name, url, fn) {
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await fn(page);
    if (errs.length) throw new Error('console errors: ' + errs.join(' | '));
    results.push(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    results.push(`  ✗ ${name} — ${e.message}`);
    await page.screenshot({ path: `${SHOTS}/${name}-FAIL.png` }).catch(() => {});
  }
  page.removeAllListeners('console');
  page.removeAllListeners('pageerror');
}

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const server = await createServer({ configFile: resolve(here, 'isolate/vite.config.mjs') });
await server.listen(PORT);
const browser = await chromium.launch();

// --- sendform: two-step confirm; onSubmit must NOT fire on the first press ---
{
  const page = await browser.newPage({ viewport: { width: 760, height: 900 } });
  await drive(page, 'sendform-confirm', `http://localhost:${PORT}/?case=sendform`, async (p) => {
    await p.waitForSelector('text=You are sending', { timeout: 20000 });
    await p.getByTestId('send-review-btn').click();
    await p.waitForSelector('[data-testid="send-confirm"]', { timeout: 5000 });
    const panel = await p.locator('[data-testid="send-confirm"]').innerText();
    assert(/1\.5\s*MOR/.test(panel), 'confirm panel missing amount');
    assert(panel.includes('0x2f4E8a1B9c3D5e6F7a8B9c0d1E2f3A4b5C6d7E8f'), 'confirm panel missing full toAddress');
    assert(/cannot be undone/i.test(panel), 'confirm panel missing irreversible warning');
    const btn = await p.getByTestId('send-confirm-btn').innerText();
    assert(/confirm & send/i.test(btn), 'button did not switch to Confirm & send');
    const submits = await p.evaluate(() => window.__onSubmit);
    assert(submits === 0, `onSubmit fired ${submits}x before confirm (must be 0)`);
    await p.screenshot({ path: `${SHOTS}/sendform-confirm.png` });
  });
  await page.close();
}

// --- models: Secure pill on TEE model, raw 'tee' tag filtered, names formatted ---
{
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
  await drive(page, 'models-secure-badge', `http://localhost:${PORT}/?case=models`, async (p) => {
    await p.waitForSelector('text=Deepseek V4 Pro', { timeout: 20000 });
    const body = await p.locator('body').innerText();
    assert(body.includes('Deepseek V4 Pro'), 'name not formatted (deepseek-v4-pro)');
    assert(body.includes('Llama 3 1 8B Instruct'), 'name not formatted (llama_3_1_8b_instruct)');
    assert(body.includes('Secure'), 'Secure pill missing on TEE model');
    // The raw 'tee' tag must be filtered from the tag chips (case-insensitive whole-word)
    const tags = await p.evaluate(() =>
      Array.from(document.querySelectorAll('.tag-item')).map((e) => e.textContent.trim().toLowerCase()),
    );
    assert(!tags.includes('tee'), `raw 'tee' tag not filtered: ${JSON.stringify(tags)}`);
    assert(tags.includes('reasoning') && tags.includes('70b'), 'expected non-tee tags missing');
    await p.screenshot({ path: `${SHOTS}/models-secure-badge.png` });
  });
  await page.close();
}

// --- login reset gate: first click must NOT wipe; confirm appears; cancel returns ---
{
  const page = await browser.newPage({ viewport: { width: 700, height: 640 } });
  await drive(page, 'login-reset-gate', `http://localhost:${PORT}/?case=login`, async (p) => {
    await p.waitForSelector('[data-testid="create-new-account-btn"]', { timeout: 20000 });
    await p.getByTestId('create-new-account-btn').click();
    await p.waitForSelector('[data-testid="reset-confirm-btn"]', { timeout: 5000 });
    const logouts = await p.evaluate(() => window.__logout);
    assert(logouts === 0, `logout fired ${logouts}x on the first (non-confirming) press (must be 0)`);
    const txt = await p.locator('body').innerText();
    assert(/erase and set up new/i.test(txt) && /keep my wallet/i.test(txt), 'confirm/cancel controls missing');
    await p.screenshot({ path: `${SHOTS}/login-reset-gate.png` });
    await p.getByTestId('reset-cancel-btn').click();
    const back = await p.$('[data-testid="create-new-account-btn"]');
    assert(!!back, 'cancel did not return to the initial state');
    const stillZero = await p.evaluate(() => window.__logout);
    assert(stillZero === 0, 'logout fired during the cancel path');
  });
  await page.close();
}

await browser.close();
await server.close();

console.log('ISOLATION CASES:');
results.forEach((r) => console.log(r));
console.log(`\n${results.length - failures} passed, ${failures} failed  (screenshots in shots/)`);
process.exit(failures === 0 ? 0 : 1);
