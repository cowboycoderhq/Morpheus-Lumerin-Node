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

// The real session behind the close-session cases (Base 8453, 2026-07-16).
const SESSION_ID = '0xc78d14e43e9802cd063f32b0513a3e5049c5f0c8d5ab190636e18b661bf63796';
const SESSION_ID_JS = SESSION_ID;

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

// --- theme-swap: default=CLASSIC (an existing install must not be restyled),
//     swap re-renders tokens live, persists + rehydrates ---
{
  const page = await browser.newPage({ viewport: { width: 600, height: 520 } });
  await drive(page, 'theme-swap', `http://localhost:${PORT}/?case=theme-swap`, async (p) => {
    const bg = (sel) =>
      p.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
    await p.waitForSelector('[data-testid="brand-swatch"]', { timeout: 20000 });
    // Start from a clean slate so the default is what's under test, not a leftover.
    // No stored choice IS the upgrade case: an existing install has never picked.
    await p.evaluate(() => window.localStorage.removeItem('trinity.themeVariant'));
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('[data-testid="brand-swatch"]');

    // The load-bearing assertion of the whole PR: with nothing stored, the app
    // is dev's classic green. Aurora is offered, never imposed — a user who
    // updates and never touches Settings sees exactly what they saw before.
    const defaultBg = await bg('[data-testid="brand-swatch"]');
    assert(
      /\b32,\s*220,\s*142\b/.test(defaultBg),
      `default is not classic green — an existing install would be restyled without asking (got ${defaultBg})`,
    );
    assert(
      (await p.getByTestId('active-variant').innerText()) === 'classic',
      'default variant not classic',
    );

    // Swap → the swatch must actually re-render to aurora cyan.
    await p.getByTestId('set-aurora').click();
    await p
      .waitForFunction(
        () =>
          /\b111,\s*214,\s*255\b/.test(
            getComputedStyle(document.querySelector('[data-testid="brand-swatch"]')).backgroundColor,
          ),
        null,
        { timeout: 5000 },
      )
      .catch(() => {});
    const auroraBg = await bg('[data-testid="brand-swatch"]');
    assert(/\b111,\s*214,\s*255\b/.test(auroraBg), `swap did not re-render to aurora cyan (got ${auroraBg})`);
    const stored = await p.evaluate(() => window.localStorage.getItem('trinity.themeVariant'));
    assert(stored === 'aurora', `choice not persisted (got ${stored})`);

    // Persist across a reload (rehydrate from localStorage, no flash of default).
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('[data-testid="brand-swatch"]');
    const afterReload = await bg('[data-testid="brand-swatch"]');
    assert(/\b111,\s*214,\s*255\b/.test(afterReload), `did not rehydrate aurora after reload (got ${afterReload})`);
    await p.screenshot({ path: `${SHOTS}/theme-swap.png` });
    await p.evaluate(() => window.localStorage.removeItem('trinity.themeVariant'));
  });
  await page.close();
}

// --- password: the strength meter guides instead of scolding — bar and label
//     side by side (they used to overlap), checklist + inline suggestion ---
{
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  await drive(page, 'password-meter', `http://localhost:${PORT}/?case=password`, async (p) => {
    await p.waitForSelector('[data-testid="pass-field"]', { timeout: 20000 });

    // Nothing typed: the meter must not exist yet — an empty field is not a
    // weak password, it's an unstarted one.
    assert(!/Stronger if/i.test(await p.locator('body').innerText()), 'meter shown before typing');

    await p.getByTestId('pass-field').fill('ab');
    await p.waitForSelector('text=Stronger if', { timeout: 5000 });
    const weak = await p.locator('body').innerText();
    assert(/12\+ characters/.test(weak), 'checklist missing the length criterion');
    assert(/letters, numbers/i.test(weak), 'checklist missing the variety criterion');

    // The bar and its score label must not occupy the same pixels. This is the
    // reported defect: the label sat on top of the hint text underneath.
    const overlap = await p.evaluate(() => {
      const label = [...document.querySelectorAll('*')].find((el) =>
        /^(Too weak|Very weak|Almost there|Strong|Very strong)$/.test(el.textContent.trim()) &&
        el.children.length === 0,
      );
      if (!label) return { found: false };
      const hint = [...document.querySelectorAll('p')].find((el) =>
        /guide, not a requirement/i.test(el.textContent),
      );
      if (!hint) return { found: true, collided: false, note: 'no hint element' };
      const a = label.getBoundingClientRect();
      const b = hint.getBoundingClientRect();
      const collided = !(a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left);
      return { found: true, collided };
    });
    assert(overlap.found, 'no strength label rendered');
    assert(!overlap.collided, 'the strength label overlaps the hint text — the reported bug');

    // Never red at the low end: a half-typed password is unfinished, not wrong.
    const labelColor = await p.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((x) =>
        /^(Too weak|Very weak)$/.test(x.textContent.trim()) && x.children.length === 0,
      );
      return el ? getComputedStyle(el).color : null;
    });
    if (labelColor) {
      assert(
        !/\b(255,\s*(0|59|7[0-9]),|219,\s*38)/.test(labelColor),
        `weak password shown as an error colour (${labelColor}) — it should read as unfinished, not wrong`,
      );
    }
    await p.screenshot({ path: `${SHOTS}/password-meter.png` });

    // A strong password lights the checklist up rather than blocking anything.
    await p.getByTestId('pass-field').fill('correct horse battery staple 7!');
    await p.waitForTimeout(300);
    assert(/Strong/i.test(await p.locator('body').innerText()), 'strong password not reported as strong');
    await p.screenshot({ path: `${SHOTS}/password-meter-strong.png` });
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
    // Classic is active here, so the AURORA card is the one proving the point:
    // it must show cyan while the live theme is green.
    assert(
      /\b111,\s*214,\s*255\b/.test(auroraSwatch),
      `aurora swatch not cyan while classic active — swatch is painting the ACTIVE theme, not its own (got ${auroraSwatch})`,
    );
    assert(/\b32,\s*220,\s*142\b/.test(classicSwatch), `classic swatch not green (got ${classicSwatch})`);

    // Default selection is classic, carried by more than colour.
    assert(
      (await p.getByTestId('presetup-theme-classic').getAttribute('aria-pressed')) === 'true',
      'classic not selected by default',
    );

    // Picking Aurora re-themes the page you are standing on — assert on the
    // Continue button (real product chrome), not a probe.
    await p.getByTestId('presetup-theme-aurora').click();
    // A swap re-renders styled-components' classes, so the new computed style
    // lands a frame later. Poll for it — reading in the click's tick catches a
    // stale value and fails a feature that works. Still a real assertion: if
    // the page never re-themes, this times out and the check below reports it.
    await p
      .waitForFunction(
        () =>
          /\b94,\s*208,\s*255\b|\b111,\s*214,\s*255\b/.test(
            getComputedStyle(document.querySelector('[data-testid="presetup-continue-btn"]'))
              .backgroundColor,
          ),
        null,
        { timeout: 5000 },
      )
      .catch(() => {});
    const btnBg = await bg('[data-testid="presetup-continue-btn"]');
    assert(
      /\b94,\s*208,\s*255\b|\b111,\s*214,\s*255\b/.test(btnBg),
      `picking Aurora did not re-theme the live page (continue btn: ${btnBg})`,
    );
    assert(
      (await p.getByTestId('presetup-theme-aurora').getAttribute('aria-pressed')) === 'true',
      'aurora not marked selected after click',
    );
    const stored = await p.evaluate(() => window.localStorage.getItem('trinity.themeVariant'));
    assert(stored === 'aurora', `choice not persisted (got ${stored})`);
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

    // Help offers a choice instead of guessing (operator, 2026-07-17). Opening
    // the menu must open NOTHING — a Help button that fires a browser at you
    // before you have chosen is the bug this replaced.
    await p.getByTestId('help-nav-btn').click();
    await p.waitForSelector('[data-testid="help-menu"]', { timeout: 5000 });
    let opened = await p.evaluate(() => window.__docs + window.__discord);
    assert(opened === 0, `opening the Help menu opened a link (${opened}x, want 0)`);

    const menu = await p.locator('[data-testid="help-menu"]').innerText();
    assert(/discord/i.test(menu), `Help menu missing the Discord choice: ${menu}`);
    assert(/documentation/i.test(menu), `Help menu missing the Documentation choice: ${menu}`);

    // Each choice opens ONLY its own destination. Wiring both to the same
    // handler would still render two items and look right.
    await p.getByTestId('help-discord-btn').click();
    let d = await p.evaluate(() => ({ docs: window.__docs, discord: window.__discord }));
    assert(d.discord === 1 && d.docs === 0, `Discord opened wrong target: ${JSON.stringify(d)}`);
    assert(
      !(await p.locator('[data-testid="help-menu"]').count()),
      'Help menu stayed open after choosing',
    );

    await p.getByTestId('help-nav-btn').click();
    await p.getByTestId('help-docs-btn').click();
    d = await p.evaluate(() => ({ docs: window.__docs, discord: window.__discord }));
    assert(d.docs === 1 && d.discord === 1, `Documentation opened wrong target: ${JSON.stringify(d)}`);

    // Escape must dismiss: this menu sits on a rail whose other controls all
    // navigate away, so a menu you cannot close is a trap.
    await p.getByTestId('help-nav-btn').click();
    await p.waitForSelector('[data-testid="help-menu"]');
    await p.keyboard.press('Escape');
    assert(
      !(await p.locator('[data-testid="help-menu"]').count()),
      'Help menu did not close on Escape',
    );

    // The rail's background is a token, so it must change with the variant.
    const railBg = () =>
      p.evaluate(
        () => getComputedStyle(document.querySelector('[data-testid="sidebar-rail"]')).backgroundImage,
      );
    // Nothing stored = the upgrade case. The rail an existing user sees must
    // still be dev's green, not the reskin's cyan.
    const classicRail = await railBg();
    assert(
      /32,\s*220,\s*142/.test(classicRail),
      `default rail not classic green — an existing install would be restyled unasked (got ${classicRail})`,
    );
    assert(!/94,\s*208,\s*255/.test(classicRail), `rail pinned to cyan under classic (got ${classicRail})`);

    // The active nav item is the rail's one accent-bearing state — assert it by
    // computed style, not by eye: a mid-transition screenshot reads as unswapped.
    const activeAccent = () =>
      p.evaluate(() => {
        const a = Array.from(document.querySelectorAll('a')).find((x) => /chat/i.test(x.textContent));
        const cs = getComputedStyle(a);
        return { color: cs.color, border: cs.borderLeftColor };
      });
    const classicActive = await activeAccent();
    assert(/32,\s*220,\s*142/.test(classicActive.color), `active nav not classic green (got ${classicActive.color})`);
    assert(/32,\s*220,\s*142/.test(classicActive.border), `active nav border not classic green (got ${classicActive.border})`);
    await p.screenshot({ path: `${SHOTS}/shell-sidebar-classic.png` });

    await p.getByTestId('set-aurora').click();
    // The nav transitions colour/border-color, so a screenshot fired straight
    // after the swap catches the tokens MID-fade and shows the OLD accent —
    // evidence that reads as "aurora is still green" when it isn't. Settle first.
    await p.waitForTimeout(400);
    const auroraRail = await railBg();
    assert(/94,\s*208,\s*255/.test(auroraRail), `rail sheen did not swap to aurora cyan (got ${auroraRail})`);
    assert(!/32,\s*220,\s*142/.test(auroraRail), `rail still pinned to green under aurora (got ${auroraRail})`);
    const auroraActive = await activeAccent();
    assert(/111,\s*214,\s*255/.test(auroraActive.color), `active nav did not swap to aurora cyan (got ${auroraActive.color})`);
    assert(/111,\s*214,\s*255/.test(auroraActive.border), `active nav border did not swap to aurora cyan (got ${auroraActive.border})`);
    await p.screenshot({ path: `${SHOTS}/shell-sidebar-aurora.png` });
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

    // Default classic, and the control reflects it.
    assert(
      (await p.getAttribute('[data-testid="theme-classic"]', 'aria-pressed')) === 'true',
      'classic not marked active by default',
    );

    // The swap must actually re-render tokens, not just flip a flag: assert a
    // real computed colour on the page changes.
    const headerColor = () =>
      p.evaluate(() => getComputedStyle(document.querySelector('h2')).color);
    const before = await headerColor();
    await p.getByTestId('theme-aurora').click();
    await p.waitForTimeout(400); // let the colour transition settle
    assert(
      (await p.getAttribute('[data-testid="theme-aurora"]', 'aria-pressed')) === 'true',
      'aurora not marked active after click',
    );
    const after = await headerColor();
    assert(before !== after, `theme swap did not re-render Settings (colour stayed ${before})`);
    const stored = await p.evaluate(() => window.localStorage.getItem('trinity.themeVariant'));
    assert(stored === 'aurora', `choice not persisted (got ${stored})`);

    // Nothing on this page may wipe a wallet just by rendering or swapping.
    const logouts = await p.evaluate(() => window.__logout);
    assert(logouts === 0, `logout fired ${logouts}x without confirming (must be 0)`);
    await p.screenshot({ path: `${SHOTS}/settings-appearance.png` });
    await p.evaluate(() => window.localStorage.removeItem('trinity.themeVariant'));
  });
  await page.close();
}

// --- chat-affordability: stake with only SOME providers affordable ----------
// The money claim, on the real Chat: a balance covering only some of a model's
// providers must (a) still be allowed to stake, (b) report the count HONESTLY,
// and (c) size the session off the priciest provider it can actually afford.
//
// Fixture (see the case): supply/budget = 1, so minStake(price) = price*360.
// Prices 1e15 / 2e15 / 1e16 wei/s => 6-min floors of 0.36 / 0.72 / 3.6 MOR.
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

  // Select the marketplace model through the REAL picker — onCreateNewChat is
  // what commits selectedModel, so a case that skipped the modal would pin a
  // state the app cannot actually reach.
  const pickModel = async (p) => {
    await p.waitForSelector('text=Select payment method', { timeout: 20000 });
    await p.getByText('New chat', { exact: false }).first().click();
    await p.getByText('Test Model', { exact: false }).first().click();
    await p.waitForTimeout(500);
  };
  const intro = (p) => p.locator('body').innerText();

  await drive(page, 'chat-affordability', `http://localhost:${PORT}/?case=chat-affordability&bal=1000000000000000000`, async (p) => {
    await pickModel(p);
    const text = await intro(p);

    // (a) Partially-affordable must still be stakeable — this is the whole point
    // of the feature; the old code required the DEAREST provider and blocked it.
    assert(!/You’ll need some MOR/.test(text), 'a wallet that can afford 2 of 3 providers was blocked from staking');

    // (b) The count must be exact. 1 MOR clears the 0.36 and 0.72 floors but not
    // the 3.6 one -> 2 of 3. A wrong count here is the user being lied to about
    // money, which is worse than no warning at all.
    assert(/covers 2 of 3 providers/.test(text), `expected "covers 2 of 3 providers", got: ${text.slice(0, 400)}`);

    // (c) The session is sized off the priciest AFFORDABLE provider (2e15), not
    // the dearest (1e16): 2e15 * 1440min * 60 = 172.8 MOR. If a refactor ever
    // sizes off the dearest again this reads 864.00 and fails — which is the
    // exact regression the design exists to prevent.
    assert(/max:\s*172\.80 MOR/.test(text), `stake ceiling not sized off the priciest AFFORDABLE provider: ${text.slice(0, 400)}`);
    assert(/min:\s*0\.36 MOR/.test(text), `stake floor not the cheapest provider's 6-min floor: ${text.slice(0, 400)}`);

    // Rendering the warning must not open anything on-chain.
    const opened = await p.evaluate(() => window.__opened.length);
    assert(opened === 0, `onOpenSession fired ${opened}x just by rendering (must be 0)`);
    await p.screenshot({ path: `${SHOTS}/chat-affordability.png` });
  });

  // A warning that always fires is noise. With 10 MOR every provider clears its
  // floor, so there must be NO count warning — and the ceiling moves to the
  // dearest (1e16 * 1440 * 60 = 864 MOR) because it is now affordable.
  await drive(page, 'chat-affordability-no-cry-wolf', `http://localhost:${PORT}/?case=chat-affordability&bal=10000000000000000000`, async (p) => {
    await pickModel(p);
    const text = await intro(p);
    assert(!/covers \d+ of \d+ providers/.test(text), `warned about partial affordability when ALL providers are affordable: ${text.slice(0, 400)}`);
    assert(/max:\s*864\.00 MOR/.test(text), `ceiling did not rise to the dearest provider once affordable: ${text.slice(0, 400)}`);
  });

  // Below the cheapest provider's floor there is nothing to warn about — the
  // user needs the way forward, not a count.
  await drive(page, 'chat-affordability-none', `http://localhost:${PORT}/?case=chat-affordability&bal=100000000000000`, async (p) => {
    await pickModel(p);
    const text = await intro(p);
    assert(/You’ll need some MOR/.test(text), `a balance under every provider's floor did not get the add-MOR screen: ${text.slice(0, 400)}`);
    assert(!/covers \d+ of \d+ providers/.test(text), 'showed a partial-affordability count when NOTHING is affordable');
    const opened = await p.evaluate(() => window.__opened.length);
    assert(opened === 0, `onOpenSession fired ${opened}x (must be 0)`);
  });
  await page.close();
}

// --- close-session: the Close button must state what it locks ---------------
// Fixture is the real session a user lost ~2.7 MOR of access to (0xc78d14…).
// The tab has to be opened first — sessions live behind it.
{
  const page = await browser.newPage({ viewport: { width: 460, height: 900 } });
  const openSessions = async (p) => {
    await p.waitForSelector('text=Sessions', { timeout: 20000 });
    await p.getByText('Sessions', { exact: false }).first().click();
    await p.waitForSelector(`[data-testid="close-session-btn-${SESSION_ID}"]`, { timeout: 5000 });
  };

  await drive(page, 'close-session-warns', `http://localhost:${PORT}/?case=close-session&at=1784262509`, async (p) => {
    await openSessions(p);

    // THE regression that cost real money: Close must not close on one click.
    await p.getByTestId(`close-session-btn-${SESSION_ID}`).click();
    await p.waitForSelector('[data-testid="close-session-confirm"]', { timeout: 5000 });
    let closed = await p.evaluate(() => window.__closed.length);
    assert(closed === 0, `Close closed the session on the FIRST click (${closed}x, want 0)`);

    // The figure must be the real one, not a vague "some MOR may be held".
    // 180s of a 359s session on a 5.360550 MOR stake -> 2.6877 locked / 2.6728 back.
    const panel = await p.locator('[data-testid="close-session-confirm"]').innerText();
    assert(/2\.6877 MOR/.test(panel), `confirm did not state the locked amount: ${panel}`);
    assert(/2\.6728 MOR/.test(panel), `confirm did not state what comes back: ${panel}`);
    // The escape hatch is the whole point: waiting costs nothing.
    assert(/nothing locked/i.test(panel), `confirm did not say waiting locks nothing: ${panel}`);
    assert(/nothing is lost/i.test(panel), `confirm did not say the MOR is not lost: ${panel}`);

    // Backing out must not close it.
    await p.getByTestId('close-session-cancel-btn').click();
    closed = await p.evaluate(() => window.__closed.length);
    assert(closed === 0, `cancelling still closed the session (${closed}x, want 0)`);
    assert(
      !(await p.locator('[data-testid="close-session-confirm"]').count()),
      'confirm stayed open after cancel',
    );

    // Confirming closes exactly once.
    await p.getByTestId(`close-session-btn-${SESSION_ID}`).click();
    await p.getByTestId('close-session-confirm-btn').click();
    const ids = await p.evaluate(() => window.__closed);
    assert(ids.length === 1 && ids[0] === SESSION_ID_JS, `confirm did not close once: ${JSON.stringify(ids)}`);
    await p.screenshot({ path: `${SHOTS}/close-session-warns.png` });
  });

  // At/after endsAt the contract locks NOTHING. Claiming a lock here would be a
  // lie that pushes users into keeping dead sessions open.
  await drive(page, 'close-session-late-locks-nothing', `http://localhost:${PORT}/?case=close-session&at=1784262688`, async (p) => {
    await p.waitForSelector('text=Sessions', { timeout: 20000 });
    await p.getByText('Sessions', { exact: false }).first().click();
    // isClosed() treats now >= EndsAt as closed, so the row offers no Close
    // button at all — there is nothing to warn about. Assert the UI does not
    // invent one, which is the failure that matters here.
    const body = await p.locator('body').innerText();
    assert(!/locks/i.test(body), `an ended session still threatened a lock: ${body.slice(0, 300)}`);
  });
  await page.close();
}

// --- model-picker: the price-mode toggle switches rate <-> 6-min stake -------
{
  const page = await browser.newPage({ viewport: { width: 760, height: 900 } });
  await drive(page, 'model-picker-price-toggle', `http://localhost:${PORT}/?case=model-picker`, async (p) => {
    await p.waitForSelector('[data-testid="price-mode-toggle"]', { timeout: 20000 });

    // Default is per-second: the row shows the MOR/s rate range.
    let body = await p.locator('body').innerText();
    assert(/0\.001\s*–\s*0\.002/.test(body), `default per-second range missing: ${body.slice(0, 300)}`);
    assert(/MOR\/s/.test(body), 'per-second unit MOR/s missing by default');
    assert(
      (await p.getAttribute('[data-testid="price-mode-persec"]', 'aria-pressed')) === 'true',
      'per-second not marked active by default',
    );

    // Switch to 6-min stake: the SAME bids now read as the stake to open
    // (0.36–0.72 MOR), a different number — proving the toggle recomputes, not
    // relabels. supply/budget=1 makes 1e15 -> 0.36, 2e15 -> 0.72.
    await p.getByTestId('price-mode-stake').click();
    await p.waitForTimeout(150);
    body = await p.locator('body').innerText();
    assert(/0\.36\s*–\s*0\.72/.test(body), `stake range 0.36–0.72 missing after toggle: ${body.slice(0, 300)}`);
    assert(/MOR to open/.test(body), 'stake unit "MOR to open" missing');
    assert(!/0\.001\s*–\s*0\.002/.test(body), 'per-second range still shown in stake mode');
    assert(
      (await p.getAttribute('[data-testid="price-mode-stake"]', 'aria-pressed')) === 'true',
      'stake not marked active after click',
    );

    // Toggling back restores the rate.
    await p.getByTestId('price-mode-persec').click();
    await p.waitForTimeout(150);
    body = await p.locator('body').innerText();
    assert(/0\.001\s*–\s*0\.002/.test(body), 'per-second not restored after toggling back');

    // The toggle is a display control only — it must not select a model.
    const picked = await p.evaluate(() => window.__picked.length);
    assert(picked === 0, `price toggle selected a model (${picked}x, must be 0)`);
    await p.screenshot({ path: `${SHOTS}/model-picker-price-toggle.png` });
  });

  // --- sort: Standard / Cheapest / Most providers reorder the list -----------
  // Fixture prices/providers:  Test Model (min 0.001/s, 2 prov) · Aardvark
  // (0.009/s, 1) · Broadcast (0.004–0.006/s, 3). Read the on-screen order of the
  // three distinctive names.
  await drive(page, 'model-picker-sort', `http://localhost:${PORT}/?case=model-picker`, async (p) => {
    await p.waitForSelector('[data-testid="sort-toggle"]', { timeout: 20000 });
    const orderOf = async () => {
      const text = await p.locator('body').innerText();
      return ['Aardvark', 'Broadcast', 'Test Model']
        .map((n) => ({ n, i: text.indexOf(n) }))
        .filter((x) => x.i >= 0)
        .sort((a, b) => a.i - b.i)
        .map((x) => x.n);
    };

    // Standard defaults active: the SECTIONED browse view (Local + Marketplace
    // headers), marketplace models alphabetical within their section.
    assert(
      (await p.getAttribute('[data-testid="sort-standard"]', 'aria-pressed')) === 'true',
      'standard sort not active by default',
    );
    let body = await p.locator('body').innerText();
    assert(/Marketplace/.test(body) && /Local/.test(body), `standard view lost its section headers: ${body.slice(0, 300)}`);
    assert(
      JSON.stringify(await orderOf()) === JSON.stringify(['Aardvark', 'Broadcast', 'Test Model']),
      `standard order wrong: ${JSON.stringify(await orderOf())}`,
    );

    // Cheapest: FLATTENS the sections into one global list (this is the fix —
    // sorting must cross section boundaries). Marketplace order becomes Test
    // Model (0.001) < Broadcast (0.004) < Aardvark (0.009), and the free local
    // model leads everything despite its late name.
    await p.getByTestId('sort-cheapest').click();
    await p.waitForTimeout(150);
    assert(
      (await p.locator('[data-testid="flat-model-list"]').count()) === 1,
      'cheapest did not flatten into a single list',
    );
    body = await p.locator('body').innerText();
    assert(/cheapest first/i.test(body), 'flat cheapest label missing');
    assert(!/Marketplace/.test(body), 'section headers still shown when sorting globally');
    assert(
      JSON.stringify(await orderOf()) === JSON.stringify(['Test Model', 'Broadcast', 'Aardvark']),
      `cheapest order wrong: ${JSON.stringify(await orderOf())}`,
    );
    // The free local model leads the whole flattened list.
    assert(
      body.indexOf('Zulu Local') < body.indexOf('Test Model'),
      'free local model did not lead the cheapest global sort',
    );

    // Most providers: also flat/global. Broadcast (3) > Test Model (2) >
    // Aardvark (1); the local model (no providers) trails the paid ones.
    await p.getByTestId('sort-mostProviders').click();
    await p.waitForTimeout(150);
    assert(
      JSON.stringify(await orderOf()) === JSON.stringify(['Broadcast', 'Test Model', 'Aardvark']),
      `most-providers order wrong: ${JSON.stringify(await orderOf())}`,
    );
    body = await p.locator('body').innerText();
    assert(
      body.indexOf('Broadcast') < body.indexOf('Zulu Local'),
      'most-providers put the 0-provider local model ahead of a 3-provider one',
    );

    // Back to Standard restores the sectioned view.
    await p.getByTestId('sort-standard').click();
    await p.waitForTimeout(150);
    body = await p.locator('body').innerText();
    assert(/Marketplace/.test(body), 'standard did not restore section headers');

    // Sorting selects nothing.
    const picked = await p.evaluate(() => window.__picked.length);
    assert(picked === 0, `sort selected a model (${picked}x, must be 0)`);
    await p.screenshot({ path: `${SHOTS}/model-picker-sort.png` });
  });
  await page.close();
}

await browser.close();
await server.close();

console.log('ISOLATION CASES:');
results.forEach((r) => console.log(r));
console.log(`\n${results.length - failures} passed, ${failures} failed  (screenshots in shots/)`);
process.exit(failures === 0 ? 0 : 1);
