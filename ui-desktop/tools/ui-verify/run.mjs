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

// --- terms: BOTH consents still gate Accept, and the terms text is still on
//     screen when you agree to it (crypto-version drops both) ---
{
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await drive(page, 'terms-two-consents', `http://localhost:${PORT}/?case=terms`, async (p) => {
    await p.waitForSelector('[data-testid="onboarding-container"]', { timeout: 20000 });

    // The agreement is IN FRONT of the user, not behind a link. crypto-version
    // replaces this scroll box with a one-line summary; that is not a re-skin.
    const termsText = await p.locator('[data-testid="onboarding-container"]').innerText();
    assert(termsText.length > 400, `terms text not rendered on screen (len ${termsText.length})`);

    // ...and it is legible where it is shown. The markdown renders through
    // marked-react's own nodes and inherits its colour from the box, so a
    // colour set anywhere else leaves the terms dark-on-dark — present in the
    // DOM, unreadable on screen, and invisible to every assertion above.
    const contrast = await p.evaluate(() => {
      const box = document.querySelector('[data-testid="terms-box"]');
      const node = box.querySelector('p, h1, h2, li') || box;
      const parse = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
      // Text sits on the box, which is translucent over the card — compose the
      // box over the card so the luminance is what the eye actually receives.
      const over = (fg, bg, a) => fg.map((c, i) => c * a + bg[i] * (1 - a));
      const lum = (rgb) => {
        const [r, g, b] = rgb.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const boxBg = getComputedStyle(box).backgroundColor;
      const alpha = Number((boxBg.match(/[\d.]+/g) || [])[3] ?? 1);
      const card = parse(getComputedStyle(document.body).backgroundColor);
      const bg = over(parse(boxBg), card, alpha);
      const fg = parse(getComputedStyle(node).color);
      const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
      return (hi + 0.05) / (lo + 0.05);
    });
    assert(contrast >= 4.5, `terms text unreadable — contrast ${contrast.toFixed(2)}:1, need 4.5:1`);

    // Two independent consents, not one collapsed toggle.
    const boxes = await p.locator('input[type="checkbox"]').count();
    assert(boxes === 2, `expected 2 consent checkboxes, found ${boxes}`);

    const accept = p.getByTestId('accept-terms-btn');
    assert(await accept.isDisabled(), 'Accept enabled with no consent given');

    // Each consent alone must NOT open the gate — this is what a collapsed
    // single-checkbox rewrite would silently pass.
    await p.getByTestId('accept-terms-chb').check();
    assert(await accept.isDisabled(), 'Accept enabled with only the terms consent');
    await p.getByTestId('accept-terms-chb').uncheck();
    await p.getByTestId('accept-license-chb').check();
    assert(await accept.isDisabled(), 'Accept enabled with only the license consent');

    // Both → open.
    await p.getByTestId('accept-terms-chb').check();
    assert(await accept.isEnabled(), 'Accept still disabled with both consents given');

    // The license link opens the license; it must not toggle the consent it
    // sits next to (a wrapping <label> would do exactly that).
    const before = await p.getByTestId('accept-license-chb').isChecked();
    await p.getByText('software license').click();
    assert(
      (await p.getByTestId('accept-license-chb').isChecked()) === before,
      'clicking the license link toggled the consent checkbox',
    );
    assert((await p.evaluate(() => window.__licenseLinkClicks)) === 1, 'license link did not fire');

    await p.screenshot({ path: `${SHOTS}/terms-two-consents.png` });
    await accept.click();
    assert((await p.evaluate(() => window.__accepted)) === 1, 'Accept did not fire exactly once');
  });
  await page.close();
}

// --- presetup: the pre-wizard preferences screen — each card previews its OWN
//     accent, picking one re-themes the live page, and Continue hands off once ---
{
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
  await drive(page, 'presetup-prefs', `http://localhost:${PORT}/?case=presetup`, async (p) => {
    const bg = (sel) =>
      p.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
    await p.waitForSelector('[data-testid="presetup-container"]', { timeout: 20000 });
    // Clean slate: the default is what's under test, not a leftover choice.
    await p.evaluate(() => window.localStorage.removeItem('trinity.themeVariant'));
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('[data-testid="presetup-container"]');

    // It reads as a preference, not a wallet step: no "Step X of N" claim.
    const body = await p.locator('body').innerText();
    assert(/choose your look/i.test(body), 'missing title');
    assert(!/step\s*\d+\s*of\s*\d+/i.test(body), 'presetup claims to be a numbered wizard step');
    assert(/aurora/i.test(body) && /classic/i.test(body), 'missing a theme choice');

    // Each card's swatch shows ITS OWN accent — the bug being pinned is both
    // swatches painting with the ACTIVE theme's brand, which would make the
    // Classic card cyan while Aurora is selected.
    const auroraSwatch = await bg('[data-testid="presetup-theme-aurora"] span:last-of-type');
    const classicSwatch = await bg('[data-testid="presetup-theme-classic"] span:last-of-type');
    assert(/\b111,\s*214,\s*255\b/.test(auroraSwatch), `aurora swatch not cyan (got ${auroraSwatch})`);
    assert(
      /\b32,\s*220,\s*142\b/.test(classicSwatch),
      `classic swatch not green while aurora active — swatch is painting the ACTIVE theme, not its own (got ${classicSwatch})`,
    );

    // Default selection is aurora, carried by more than colour.
    assert(
      (await p.getByTestId('presetup-theme-aurora').getAttribute('aria-pressed')) === 'true',
      'aurora not selected by default',
    );

    // Picking Classic re-themes the page you are standing on — assert on the
    // Continue button (real product chrome), not a probe.
    await p.getByTestId('presetup-theme-classic').click();
    // A swap re-renders styled-components' classes, so the new computed style
    // lands a frame later. Poll for it — reading in the click's tick catches a
    // stale value and fails a feature that works. Still a real assertion: if
    // the page never re-themes, this times out and the check below reports it.
    await p
      .waitForFunction(
        () =>
          /\b32,\s*220,\s*142\b/.test(
            getComputedStyle(document.querySelector('[data-testid="presetup-continue-btn"]'))
              .backgroundColor,
          ),
        null,
        { timeout: 5000 },
      )
      .catch(() => {});
    const btnBg = await bg('[data-testid="presetup-continue-btn"]');
    assert(
      /\b32,\s*220,\s*142\b/.test(btnBg),
      `picking Classic did not re-theme the live page (continue btn: ${btnBg})`,
    );
    assert(
      (await p.getByTestId('presetup-theme-classic').getAttribute('aria-pressed')) === 'true',
      'classic not marked selected after click',
    );
    const stored = await p.evaluate(() => window.localStorage.getItem('trinity.themeVariant'));
    assert(stored === 'classic', `choice not persisted (got ${stored})`);
    await p.screenshot({ path: `${SHOTS}/presetup-prefs.png` });

    // Continue hands off to the wizard exactly once.
    assert((await p.evaluate(() => window.__onDone)) === 0, 'onDone fired before Continue');
    await p.getByTestId('presetup-continue-btn').click();
    assert((await p.evaluate(() => window.__onDone)) === 1, 'Continue did not hand off exactly once');
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
