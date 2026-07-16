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
    // The panel must show the address that will actually be SENT (toAddress =
    // the HOC state onSubmit uses), not the input's local echo. The case feeds
    // the two props different values so a rename cannot pass silently.
    assert(panel.includes('0x2f4E8a1B9c3D5e6F7a8B9c0d1E2f3A4b5C6d7E8f'), 'confirm panel missing full toAddress');
    assert(
      !panel.includes('0x1111111111111111111111111111111111111111'),
      'confirm panel shows the input echo (destinationAddress) instead of the address being sent',
    );
    assert(/cannot be undone/i.test(panel), 'confirm panel missing irreversible warning');
    const btn = await p.getByTestId('send-confirm-btn').innerText();
    assert(/confirm & send/i.test(btn), 'button did not switch to Confirm & send');
    const submits = await p.evaluate(() => window.__onSubmit);
    assert(submits === 0, `onSubmit fired ${submits}x before confirm (must be 0)`);
    await p.screenshot({ path: `${SHOTS}/sendform-confirm.png` });

    // A transfer is irreversible, so a click landing while one is IN FLIGHT must
    // not start a second. Two things stop it — the button unmounts behind a
    // Spinner (isPending), and `if (isPending) return;` guards the handler. This
    // asserts the OUTCOME rather than either mechanism, so it stays true if the
    // reskin restructures the button, and fails if the last guard is lost.
    // (onSubmit is deliberately slow in the case, or there is no in-flight
    // window to click into and this proves nothing.)
    await p.getByTestId('send-confirm-btn').click();
    await p
      .getByTestId('send-confirm-btn')
      .click({ timeout: 250 })
      .catch(() => {}); // expected: the button is gone mid-send
    await p.waitForTimeout(700);
    const total = await p.evaluate(() => window.__onSubmit);
    assert(total === 1, `send fired ${total}x — a click during flight started a second transfer`);
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

// --- theme-swap: default=aurora, swap re-renders tokens live, persists+rehydrates ---
{
  const page = await browser.newPage({ viewport: { width: 600, height: 520 } });
  await drive(page, 'theme-swap', `http://localhost:${PORT}/?case=theme-swap`, async (p) => {
    const bg = (sel) =>
      p.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
    await p.waitForSelector('[data-testid="brand-swatch"]', { timeout: 20000 });
    // Start from a clean slate so the default is what's under test, not a leftover.
    await p.evaluate(() => window.localStorage.removeItem('trinity.themeVariant'));
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('[data-testid="brand-swatch"]');

    const auroraBg = await bg('[data-testid="brand-swatch"]');
    assert(/\b111,\s*214,\s*255\b/.test(auroraBg), `default not aurora cyan (got ${auroraBg})`);
    assert((await p.getByTestId('active-variant').innerText()) === 'aurora', 'default variant not aurora');

    // Swap → the swatch must actually re-render to classic green.
    await p.getByTestId('set-classic').click();
    const classicBg = await bg('[data-testid="brand-swatch"]');
    assert(/\b32,\s*220,\s*142\b/.test(classicBg), `swap did not re-render to classic green (got ${classicBg})`);
    const stored = await p.evaluate(() => window.localStorage.getItem('trinity.themeVariant'));
    assert(stored === 'classic', `choice not persisted (got ${stored})`);

    // Persist across a reload (rehydrate from localStorage, no flash of default).
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('[data-testid="brand-swatch"]');
    const afterReload = await bg('[data-testid="brand-swatch"]');
    assert(/\b32,\s*220,\s*142\b/.test(afterReload), `did not rehydrate classic after reload (got ${afterReload})`);
    await p.screenshot({ path: `${SHOTS}/theme-swap.png` });
    await p.evaluate(() => window.localStorage.removeItem('trinity.themeVariant'));
  });
  await page.close();
}

// --- shell: the rail renders, Help keeps pr2's onHelpLinkClick contract, and
//     the rail's own surface re-renders on a theme swap (not just a probe) ---
{
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
  await drive(page, 'shell-sidebar', `http://localhost:${PORT}/?case=shell`, async (p) => {
    await p.waitForSelector('[data-testid="help-nav-btn"]', { timeout: 20000 });
    await p.evaluate(() => window.localStorage.removeItem('trinity.themeVariant'));
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('[data-testid="help-nav-btn"]');

    // The rail actually rendered its nav, not an empty frame.
    const body = await p.locator('body').innerText();
    for (const item of ['Chat', 'Models', 'Agents', 'Settings', 'Help']) {
      assert(new RegExp(item, 'i').test(body), `sidebar missing nav item: ${item}`);
    }

    // PR3 keeps pr2's client contract — crypto renamed this to onLinkClick and
    // wrapped it in a menu. If the rename ever leaks in, this goes to 0.
    await p.getByTestId('help-nav-btn').click();
    const helps = await p.evaluate(() => window.__help);
    assert(helps === 1, `Help did not call onHelpLinkClick (fired ${helps}x, want 1)`);

    // The rail's background is a token, so it must change with the variant.
    const railBg = () =>
      p.evaluate(
        () => getComputedStyle(document.querySelector('[data-testid="sidebar-rail"]')).backgroundImage,
      );
    const auroraRail = await railBg();
    assert(/94,\s*208,\s*255/.test(auroraRail), `rail sheen not aurora cyan (got ${auroraRail})`);

    // The active nav item is the rail's one accent-bearing state — assert it by
    // computed style, not by eye: a mid-transition screenshot reads as unswapped.
    const activeAccent = () =>
      p.evaluate(() => {
        const a = Array.from(document.querySelectorAll('a')).find((x) => /chat/i.test(x.textContent));
        const cs = getComputedStyle(a);
        return { color: cs.color, border: cs.borderLeftColor };
      });
    const auroraActive = await activeAccent();
    assert(/111,\s*214,\s*255/.test(auroraActive.color), `active nav not aurora cyan (got ${auroraActive.color})`);
    assert(/111,\s*214,\s*255/.test(auroraActive.border), `active nav border not aurora cyan (got ${auroraActive.border})`);
    await p.screenshot({ path: `${SHOTS}/shell-sidebar-aurora.png` });

    await p.getByTestId('set-classic').click();
    // The nav transitions colour/border-color, so a screenshot fired straight
    // after the swap catches the tokens MID-fade and shows the OLD accent —
    // evidence that reads as "classic is still cyan" when it isn't. Settle first.
    await p.waitForTimeout(400);
    const classicRail = await railBg();
    assert(/32,\s*220,\s*142/.test(classicRail), `rail sheen did not swap to classic green (got ${classicRail})`);
    assert(!/94,\s*208,\s*255/.test(classicRail), `rail still pinned to cyan under classic (got ${classicRail})`);
    const classicActive = await activeAccent();
    assert(/32,\s*220,\s*142/.test(classicActive.color), `active nav did not swap to classic green (got ${classicActive.color})`);
    assert(/32,\s*220,\s*142/.test(classicActive.border), `active nav border did not swap to classic green (got ${classicActive.border})`);
    await p.screenshot({ path: `${SHOTS}/shell-sidebar-classic.png` });
    await p.evaluate(() => window.localStorage.removeItem('trinity.themeVariant'));
  });
  await page.close();
}

// --- settings: the Appearance control is the ONLY way to reach the theme swap,
//     and it lives in the one file crypto's reskin fully rewrites. If a future
//     graft clobbers Settings.tsx, the dual-theme feature silently becomes
//     unreachable while everything still compiles. This is that tripwire. ---
{
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await drive(page, 'settings-appearance', `http://localhost:${PORT}/?case=settings`, async (p) => {
    await p.waitForSelector('[data-testid="theme-aurora"]', { timeout: 20000 });
    await p.evaluate(() => window.localStorage.removeItem('trinity.themeVariant'));
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('[data-testid="theme-aurora"]');

    const body = await p.locator('body').innerText();
    assert(/appearance/i.test(body), 'Appearance section missing from Settings');
    assert(!!(await p.$('[data-testid="theme-classic"]')), 'classic option missing');

    // Default aurora, and the control reflects it.
    assert(
      (await p.getAttribute('[data-testid="theme-aurora"]', 'aria-pressed')) === 'true',
      'aurora not marked active by default',
    );

    // The swap must actually re-render tokens, not just flip a flag: assert a
    // real computed colour on the page changes.
    const headerColor = () =>
      p.evaluate(() => getComputedStyle(document.querySelector('h2')).color);
    const before = await headerColor();
    await p.getByTestId('theme-classic').click();
    await p.waitForTimeout(400); // let the colour transition settle
    assert(
      (await p.getAttribute('[data-testid="theme-classic"]', 'aria-pressed')) === 'true',
      'classic not marked active after click',
    );
    const after = await headerColor();
    assert(before !== after, `theme swap did not re-render Settings (colour stayed ${before})`);
    const stored = await p.evaluate(() => window.localStorage.getItem('trinity.themeVariant'));
    assert(stored === 'classic', `choice not persisted (got ${stored})`);

    // Nothing on this page may wipe a wallet just by rendering or swapping.
    const logouts = await p.evaluate(() => window.__logout);
    assert(logouts === 0, `logout fired ${logouts}x without confirming (must be 0)`);
    await p.screenshot({ path: `${SHOTS}/settings-appearance.png` });
    await p.evaluate(() => window.localStorage.removeItem('trinity.themeVariant'));
  });
  await page.close();
}

await browser.close();
await server.close();

console.log('ISOLATION CASES:');
results.forEach((r) => console.log(r));
console.log(`\n${results.length - failures} passed, ${failures} failed  (screenshots in shots/)`);
process.exit(failures === 0 ? 0 : 1);
