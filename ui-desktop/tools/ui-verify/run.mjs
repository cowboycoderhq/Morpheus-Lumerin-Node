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
    // The aurora variant is labelled "Jarvis" for users (operator, 2026-07-17);
    // its internal key stays 'aurora' (asserted via localStorage below), so the
    // label and the key must NOT be the same word.
    assert(/jarvis/i.test(body) && /classic/i.test(body), 'missing a theme choice (Jarvis/Classic)');
    assert(!/\baurora\b/i.test(body), 'the old "Aurora" label is still shown to users');

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
  // The spend caps are the only editable numbers on this screen that bound what
  // an outside tool may stake, and they shipped BROKEN: the handler read
  // `e.target.value`, but this app's TextInput calls `onChange({id, value})`, so
  // every keystroke threw and the fields could not be edited at all. Nothing
  // covered them, because the whole card had no case. Type into them for real.
  await drive(page, 'settings-spend-caps-are-editable', `http://localhost:${PORT}/?case=settings`, async (p) => {
    const field = '#openai-api-maxStakeMor';
    await p.waitForSelector(field, { timeout: 20000 });

    const errors = [];
    p.on('pageerror', (e) => errors.push(String(e)));

    await p.fill(field, '');
    await p.type(field, '2.5');
    await p.waitForTimeout(300);

    assert(errors.length === 0, `typing into a cap threw: ${errors[0]}`);
    assert(
      (await p.inputValue(field)) === '2.5',
      `the field did not accept the text: got ${await p.inputValue(field)}`,
    );

    const writes = await p.evaluate(() => window.__apiWrites);
    const staked = writes.filter((w) => 'maxStakeMor' in w).map((w) => w.maxStakeMor);
    assert(staked.includes(2.5), `2.5 was never committed: ${JSON.stringify(staked)}`);
    // Clearing the field must NOT commit 0 — a cap of zero refuses everything,
    // and backspacing to retype was enough to set it.
    assert(!staked.includes(0), `clearing the field committed a 0 cap: ${JSON.stringify(staked)}`);

    // The other two exist and are wired to their own keys.
    for (const [sel, key] of [
      ['#openai-api-maxDailyStakeMor', 'maxDailyStakeMor'],
      ['#openai-api-maxDailySessions', 'maxDailySessions'],
    ]) {
      await p.fill(sel, '');
      await p.type(sel, '7');
      await p.waitForTimeout(200);
      const w = await p.evaluate(() => window.__apiWrites);
      assert(
        w.some((x) => x[key] === 7),
        `${key} was not committed from its own field`,
      );
    }
    assert(errors.length === 0, `a later cap field threw: ${errors[0]}`);
  });

  // /start is unreachable unless opencode can be opened WITHOUT a model — the
  // handoff it replaces is the only other writer of the config and plugin.
  await drive(page, 'settings-opens-opencode-with-no-model', `http://localhost:${PORT}/?case=settings`, async (p) => {
    await p.waitForSelector('text=Open opencode', { timeout: 20000 });
    await p.getByText('Open opencode', { exact: true }).first().click();
    await p.waitForTimeout(300);
    const opens = await p.evaluate(() => window.__opencodeOpens);
    assert(opens.length === 1, `expected one launch, got ${opens.length}`);
    assert(
      !opens[0]?.modelId,
      `it demanded a model, which is what made /start unreachable: ${JSON.stringify(opens[0])}`,
    );
  });

  await drive(page, 'settings-appearance', `http://localhost:${PORT}/?case=settings`, async (p) => {
    await p.waitForSelector('[data-testid="theme-aurora"]', { timeout: 20000 });
    await p.evaluate(() => window.localStorage.removeItem('trinity.themeVariant'));
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('[data-testid="theme-aurora"]');

    const body = await p.locator('body').innerText();
    assert(/appearance/i.test(body), 'Appearance section missing from Settings');
    assert(!!(await p.$('[data-testid="theme-classic"]')), 'classic option missing');
    // The aurora variant is labelled "Jarvis" (the testid + stored key stay
    // 'aurora' — see the aria-pressed / localStorage checks below).
    assert(/jarvis/i.test(body), 'Settings appearance does not label the theme "Jarvis"');
    assert(!/\baurora\b/i.test(body), 'Settings still shows the old "Aurora" label');

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
// Fixture (see the case): supply/budget = 1, so minStake(price) = price*305
// (MIN_SESSION_SECONDS: the 300s contract floor + a 5s truncation cushion).
// Prices 1e15 / 2e15 / 1e16 wei/s => min-block floors of 0.305 / 0.61 / 3.05 MOR.
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

    // (b) The count must be exact. 1 MOR clears the 0.305 and 0.61 floors but not
    // the 3.05 one -> 2 of 3. A wrong count here is the user being lied to about
    // money, which is worse than no warning at all.
    assert(/covers 2 of 3 providers/.test(text), `expected "covers 2 of 3 providers", got: ${text.slice(0, 400)}`);

    // (c) The session is sized off the priciest AFFORDABLE provider (2e15), not
    // the dearest (1e16): 2e15 * 1440min * 60 = 172.8 MOR. If a refactor ever
    // sizes off the dearest again this reads 864.00 and fails — which is the
    // exact regression the design exists to prevent.
    assert(/172\.80 MOR for a day/.test(text), `stake ceiling not sized off the priciest AFFORDABLE provider: ${text.slice(0, 400)}`);
    assert(/0\.305 MOR for 5 minutes/.test(text), `stake floor not the cheapest provider's min-block floor: ${text.slice(0, 400)}`);

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
    assert(/864\.00 MOR for a day/.test(text), `ceiling did not rise to the dearest provider once affordable: ${text.slice(0, 400)}`);
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

  // Typing must not move the page — measured where the typed length actually
  // CROSSES an affordability boundary. That needs several providers at
  // different prices, which is this fixture and not the single-provider
  // session-length one (there, "covers N of M" can never fire, so an earlier
  // version of this check passed while measuring nothing).
  //
  // Prices 1e15 / 2e15 / 1e16 with supply/budget = 1 and a 10 MOR balance:
  // at 5 minutes all three floors (0.305 / 0.61 / 3.05) clear, so no notice;
  // at 1 hour they cost 3.6 / 7.2 / 36, so only two are affordable and the
  // three-line "covers 2 of 3 providers" notice appears. Mounting it
  // conditionally moved everything above and below it, mid-keystroke, inside a
  // vertically centred card.
  await drive(page, 'affordability-notice-does-not-move-the-page',
    `http://localhost:${PORT}/?case=chat-affordability&bal=10000000000000000000`, async (p) => {
    await pickModel(p);
    const field = p.getByLabel('Session length');
    const anchor = p.getByText('Stake MOR', { exact: true }).first();

    await field.click();
    await field.fill('');
    await p.waitForTimeout(150);

    const ys = [];
    for (const ch of '1 hour') {
      await p.keyboard.type(ch);
      await p.waitForTimeout(80);
      const box = await anchor.boundingBox();
      if (box) ys.push(box.y);
    }
    const spread = Math.max(...ys) - Math.min(...ys);
    assert(spread <= 2,
      `the page moved ${spread.toFixed(1)}px while typing across an affordability boundary (samples: ${ys.map((y) => y.toFixed(1)).join(', ')})`);

    // The boundary really was crossed — otherwise this measures nothing. This
    // is the assertion an earlier, vacuous version of the case lacked.
    const text = await intro(p);
    assert(/covers 2 of 3 providers/.test(text),
      `the fixture did not cross an affordability boundary, so the check is vacuous: ${text.slice(0, 400)}`);
  });

  await page.close();
}

// --- session-length: the typed length IS the stake --------------------------
// The change this pins: length used to be a slider driving a chain of 305s
// stakes; it is now typed, and the length sets the stake directly. Two things
// can silently go wrong and cost real MOR — the quoted stake drifting from the
// staked one, and a session inside the chain's cap quietly becoming a CHAIN of
// stakes instead of one. Both are asserted on the arguments Chat actually hands
// the engine, not on prose.
//
// Fixture (see the case): one provider at 1e15 wei/s, supply/budget = 1, so
// stake(T) = T x 1e15 wei. 305s -> 0.305 MOR, 86,400s -> 86.40, 604,800s -> 604.80.
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const pickModel = async (p) => {
    await p.waitForSelector('text=Select payment method', { timeout: 20000 });
    await p.getByText('New chat', { exact: false }).first().click();
    await p.getByText('Test Model', { exact: false }).first().click();
    await p.waitForTimeout(500);
  };
  const setLength = async (p, text) => {
    await p.getByLabel('Session length').fill(text);
    await p.waitForTimeout(200);
  };
  const body = (p) => p.locator('body').innerText();
  const URL_ = `http://localhost:${PORT}/?case=session-length`;

  // The DEFAULT must be the cheapest session the chain sells. The length is now
  // a spend, so a friendlier default ("1 hour") would have made the untouched
  // path 12x costlier than the slider it replaced.
  await drive(page, 'session-length-defaults-to-the-floor', URL_, async (p) => {
    await pickModel(p);
    const text = await body(p);
    assert(/Stakes about\s*0\.305 MOR/.test(text), `default length did not quote the 5-minute floor stake: ${text.slice(0, 500)}`);
    // The lock, not a refund. MOR is held until the end of the day regardless of
    // when the session ends, so a disclosure promising it "returns in full" when
    // the session lapses would be telling the user something untrue about money.
    assert(/end of the day/.test(text),
      `the disclosure did not say when the MOR is actually released: ${text.slice(0, 500)}`);
    assert(!/returned in full|returns when its session lapses/.test(text),
      `the disclosure still promises an on-expiry refund: ${text.slice(0, 500)}`);

    // The disclosure must READ as a sentence. Making the note a flex container
    // to centre it turned every inline child into a flex item, so the emphasised
    // phrase rendered as a column of single stacked words — legible in the DOM,
    // unreadable on screen, and invisible to any text-content assertion.
    // Structural, not geometric. A geometric check passes at a wide viewport —
    // flex items only squeeze into stacked single words once the container is
    // narrow — so measuring at one window size proves nothing. The invariant is
    // that this element must NOT be a layout container at all: its children are
    // inline text, and flex/grid turn each of them into a separate item.
    const noteDisplay = await p
      .locator('strong', { hasText: 'end of the day' })
      .first()
      .evaluate((el) => getComputedStyle(el.parentElement).display);
    assert(!/flex|grid/.test(noteDisplay),
      `the disclosure's container is "${noteDisplay}" — flex/grid makes each inline child a layout item, which renders the sentence as a stack of single words`);

    // And confirm it flows at the NARROW end, where the breakage actually shows.
    await p.setViewportSize({ width: 620, height: 900 });
    await p.waitForTimeout(200);
    const emph = p.locator('strong', { hasText: 'end of the day' }).first();
    const box = await emph.boundingBox();
    assert(box && box.width > box.height,
      `emphasised text is stacked vertically at a narrow width (${box?.width}x${box?.height})`);
    await p.setViewportSize({ width: 1100, height: 900 });
    await p.screenshot({ path: `${SHOTS}/session-length-default.png` });
  });

  // A day is inside the 7-day cap, so it is ONE stake of exactly a day — the
  // core claim of the whole change. If blockSeconds ever comes back as 305 here,
  // the app has silently reverted to rolling.
  await drive(page, 'session-length-under-the-cap-is-one-stake', URL_, async (p) => {
    await pickModel(p);
    await setLength(p, '1 day');
    const text = await body(p);
    assert(/Stakes about\s*86\.40 MOR/.test(text), `1 day did not quote 86.40 MOR: ${text.slice(0, 500)}`);
    assert(!/Renewing/.test(text), 'offered a renewal mode for a session that never renews');

    await p.getByText('Stake MOR', { exact: true }).first().click();
    await p.waitForTimeout(400);
    const started = await p.evaluate(() => window.__started);
    assert(started.length === 1, `expected one start, got ${started.length}`);
    assert(started[0].totalSeconds === 86400, `totalSeconds was ${started[0].totalSeconds}, want 86400`);
    assert(started[0].blockSeconds === 86400, `blockSeconds was ${started[0].blockSeconds} — a 1-day session must be ONE block, not a chain`);
  });

  // Past the cap the chain will not sell a longer session at any stake, so the
  // length becomes a PLAN of cap-sized ones — and only then is the renewal mode
  // a real choice.
  await drive(page, 'session-length-past-the-cap-chains-7-day-blocks', URL_, async (p) => {
    await pickModel(p);
    await setLength(p, '2 years');
    const text = await body(p);
    assert(/105 sessions.{0,12}of up to 7 days/s.test(text), `2 years did not describe its plan: ${text.slice(0, 600)}`);
    assert(/604\.80 MOR/.test(text), `the per-session stake was not quoted: ${text.slice(0, 600)}`);
    assert(/Renewing/.test(text), 'a chained session did not offer the renewal mode');
    assert(/priced again when it opens/.test(text), 'did not disclose that later blocks re-price');

    // The disclosure must quote the number the GATE enforces — twice one
    // block's stake at the 7-day cap, i.e. 1,209.60 MOR — not the sum of all
    // 105 blocks. It used to say the stakes "ACCUMULATE across renewals and do
    // not come back between them", which reads as needing 105x and contradicted
    // the refusal message thirty lines away in the same component. A block's
    // hold clears at the end of the day it closed, six days before the next one
    // opens, so the wallet never carries more than two.
    // 2 x 604.80 = 1209.60, which formatMor renders as "1,210" — above 1000 it
    // rounds to whole MOR (coinValue.tsx:35).
    assert(
      /1,210 MOR/.test(text),
      `the plan did not quote the peak the gate enforces (2 x 604.80): ${text.slice(0, 600)}`,
    );
    assert(
      !/ACCUMULATE/i.test(text),
      `the plan still claims stakes accumulate across renewals: ${text.slice(0, 600)}`,
    );

    await p.getByText('Stake MOR', { exact: true }).first().click();
    await p.waitForTimeout(400);
    const started = await p.evaluate(() => window.__started);
    assert(started.length === 1, `expected one start, got ${started.length}`);
    assert(started[0].totalSeconds === 2 * 365 * 86400, `totalSeconds was ${started[0].totalSeconds}`);
    assert(started[0].blockSeconds === 604800, `blockSeconds was ${started[0].blockSeconds}, want the 7-day cap`);
  });

  // The page must not move while you type into it.
  //
  // Reported from the running app: "the page is jerking all over the place".
  // Three things resized per keystroke — the parsed-length echo mounted and
  // unmounted, the note below swapped between one and three lines, and the
  // per-provider stake figures changed width and re-wrapped the chip row ABOVE
  // the field, which shoved the field itself down the page. All three are now
  // space-reserved; this measures it rather than trusting it.
  await drive(page, 'session-length-typing-does-not-move-the-page', URL_, async (p) => {
    await pickModel(p);
    const field = p.getByLabel('Session length');
    const anchor = p.getByText('Stake MOR', { exact: true }).first();

    await field.click();
    await field.fill('');
    await p.waitForTimeout(150);

    // Type a realistic length one character at a time, sampling the position of
    // a fixed landmark below the field after every keystroke.
    const ys = [];
    const xs = [];
    for (const ch of '1 day') {
      await p.keyboard.type(ch);
      await p.waitForTimeout(60);
      const box = await anchor.boundingBox();
      const fieldBox = await field.boundingBox();
      if (box) ys.push(box.y);
      if (fieldBox) xs.push(fieldBox.x);
    }

    const spread = (arr) => Math.max(...arr) - Math.min(...arr);
    // A couple of pixels of sub-pixel rounding is fine; anything more is the
    // layout actually shifting under the user's hands.
    assert(ys.length > 0 && spread(ys) <= 2,
      `the page moved ${spread(ys).toFixed(1)}px vertically while typing (samples: ${ys.map((y) => y.toFixed(1)).join(', ')})`);
    assert(xs.length > 0 && spread(xs) <= 2,
      `the field moved ${spread(xs).toFixed(1)}px horizontally while typing (samples: ${xs.map((x) => x.toFixed(1)).join(', ')})`);
  });

  // The hardest case: typing a length that CROSSES the chain's per-session cap.
  //
  // "1 month" legitimately needs more words than "1 hour" — it stops being one
  // stake and becomes a plan of chained ones, with a renewal mode to choose. So
  // the page cannot be kept the same height, and pretending otherwise would mean
  // hiding something the user is paying for. What CAN be guaranteed is that the
  // growth happens below the cursor: the field being typed into must not move.
  //
  // Note the transition lands mid-word — "1 m" is one minute, "1 mo" is one
  // month — so this is a single keystroke flipping the panel from an error state
  // to a multi-session plan.
  await drive(page, 'session-length-crossing-the-cap-does-not-move-the-field', URL_, async (p) => {
    await pickModel(p);
    const field = p.getByLabel('Session length');
    await field.click();
    await field.fill('');
    await p.waitForTimeout(150);

    const ys = [];
    for (const ch of '1 month') {
      await p.keyboard.type(ch);
      await p.waitForTimeout(80);
      const box = await field.boundingBox();
      if (box) ys.push(box.y);
    }
    const spread = Math.max(...ys) - Math.min(...ys);
    assert(spread <= 2,
      `the field moved ${spread.toFixed(1)}px while typing across the cap (samples: ${ys.map((y) => y.toFixed(1)).join(', ')})`);

    // It really did become a chained plan — otherwise nothing was crossed.
    const text = await body(p);
    assert(/sessions/.test(text) && /Renewing/.test(text),
      `"1 month" did not become a chained plan, so the check is vacuous: ${text.slice(0, 400)}`);
  });

  // Clicking "Open in opencode" must SAY something. The launch detects opencode,
  // writes a config and shells out — not instant — and with no feedback the
  // click read as if nothing had happened.
  await drive(page, 'opencode-handoff-shows-progress', URL_, async (p) => {
    await pickModel(p);
    await setLength(p, '1 hour');
    await p.getByText('Stake MOR', { exact: true }).first().click();

    const offer = p.getByText('Use it from your terminal?', { exact: false });
    await offer.waitFor({ timeout: 10000 });

    await p.getByText('Open in opencode', { exact: true }).click();

    // The intermediate state, while the launch is in flight.
    await p.getByText('Starting opencode', { exact: false }).waitFor({ timeout: 5000 });
    // The action must not be clickable twice mid-launch.
    assert(await p.getByText('Open in opencode', { exact: true }).count() === 0,
      'the button stayed clickable while the launch was in flight');

    // Then the confirmation — worded for what is actually known: the terminal
    // was opened. Whether opencode finished booting is not observable here.
    await p.getByText('Opened in your terminal', { exact: false }).waitFor({ timeout: 5000 });
    const calls = await p.evaluate(() => window.__opencodeCalls);
    assert(calls === 1, `expected exactly one launch, got ${calls}`);
    await p.screenshot({ path: `${SHOTS}/opencode-handoff.png` });
  });

  // Tab finishes the unit, and the menu is OURS (themed), not the browser's.
  // A native <datalist> cannot take the theme's colours and offers no keyboard
  // completion hook, so both halves of this are the reason it was replaced.
  await drive(page, 'session-length-tab-completes-the-unit', URL_, async (p) => {
    await pickModel(p);
    const field = p.getByLabel('Session length');
    await field.click();
    await field.fill('');
    await field.type('2 d', { delay: 20 });
    await p.waitForTimeout(200);

    // The menu is a real element in OUR DOM — a datalist would not be.
    const menu = p.locator('[role="listbox"]');
    assert(await menu.count() === 1, 'no themed completion menu rendered');
    const optionText = (await menu.locator('[role="option"]').allInnerTexts()).join('|');
    assert(/2 days/.test(optionText), `menu did not offer the unit completion: ${optionText}`);

    // Themed, not stock OS chrome: its background must be the money surface
    // token, which is near-black in both variants — never a default white.
    const bg = await menu.evaluate((el) => getComputedStyle(el).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    assert(r + g + b < 200, `completion menu is not using the themed money surface (got ${bg})`);

    await p.keyboard.press('Tab');
    await p.waitForTimeout(150);
    assert(await field.inputValue() === '2 days', `Tab did not finish the unit (field is "${await field.inputValue()}")`);

    // And the completion is an OFFER: with the menu dismissed, Tab goes back to
    // meaning "move focus" rather than editing the field.
    await field.click();
    await field.fill('');
    await field.type('3 h', { delay: 20 });
    await p.keyboard.press('Escape');
    await p.keyboard.press('Tab');
    await p.waitForTimeout(150);
    assert(await field.inputValue() === '3 h', `Escape did not make Tab stop completing (field is "${await field.inputValue()}")`);
    await p.screenshot({ path: `${SHOTS}/session-length-tab-complete.png` });
  });

  // Just past the cap the remainder is under the contract minimum, so it is
  // dropped and the plan is STILL one block. Re-review caught the UI asking
  // "longer than one session?" instead of "does it renew?", which disagreed with
  // the affordability gate for 304 seconds' worth of typeable lengths: it
  // offered a renewal mode for a plan with no renewals and claimed twice the
  // stake was needed, turning away users who could in fact afford it.
  await drive(page, 'session-length-no-renewal-ui-for-a-single-block', URL_, async (p) => {
    await pickModel(p);
    await setLength(p, '10081 minutes'); // 7 days + 1 minute
    const text = await body(p);
    assert(!/Renewing/.test(text), `offered a renewal mode for a plan that is still one block: ${text.slice(0, 600)}`);
    assert(!/1 sessions/.test(text), `described a single block as a multi-session plan: ${text.slice(0, 600)}`);
    assert(!/Two are briefly staked/.test(text), `claimed the 2x overlap cost for a plan that never renews: ${text.slice(0, 600)}`);

    // And one contract minimum further, it really does chain.
    await setLength(p, '10086 minutes'); // 7 days + 6 minutes — past the drop threshold
    const chained = await body(p);
    assert(/Renewing/.test(chained), `a genuinely chained plan lost its renewal mode: ${chained.slice(0, 600)}`);
  });

  // Unparseable text must stake NOTHING. The button is the only path a user has,
  // so a disabled-looking button that still fires is the failure that matters.
  await drive(page, 'session-length-refuses-junk', URL_, async (p) => {
    await pickModel(p);
    await setLength(p, 'soon');
    const text = await body(p);
    assert(/isn’t a unit of time|Enter a length like/.test(text), `junk length produced no error: ${text.slice(0, 500)}`);
    await p.getByText('Stake MOR', { exact: true }).first().click({ force: true });
    await p.waitForTimeout(300);
    const started = await p.evaluate(() => window.__started.length);
    assert(started === 0, `an unparseable length still started ${started} session(s)`);
  });

  // A bare number is refused rather than guessed. "5" meaning minutes when the
  // user meant days is a 288x error in the stake and nobody would catch it.
  await drive(page, 'session-length-refuses-a-bare-number', URL_, async (p) => {
    await pickModel(p);
    await setLength(p, '5');
    await p.getByText('Stake MOR', { exact: true }).first().click({ force: true });
    await p.waitForTimeout(300);
    const started = await p.evaluate(() => window.__started.length);
    assert(started === 0, `a unit-less number still started ${started} session(s)`);
  });

  // Under the contract floor the chain reverts with SessionTooShort(). Say so
  // before the user pays gas to discover it.
  await drive(page, 'session-length-refuses-under-the-floor', URL_, async (p) => {
    await pickModel(p);
    await setLength(p, '1 minute');
    const text = await body(p);
    assert(/shortest session is 5 minutes/.test(text), `a 1-minute session was not refused: ${text.slice(0, 500)}`);
    await p.getByText('Stake MOR', { exact: true }).first().click({ force: true });
    await p.waitForTimeout(300);
    const started = await p.evaluate(() => window.__started.length);
    assert(started === 0, `a sub-floor length still started ${started} session(s)`);
  });

  // "5 minutes" is the natural way to ask for the minimum, and the app opens at
  // 305s for its truncation cushion. It must ACCEPT the ask rather than argue
  // that 5 minutes is under the 5-minute minimum.
  await drive(page, 'session-length-accepts-the-exact-minimum', URL_, async (p) => {
    await pickModel(p);
    await setLength(p, '5 minutes');
    const text = await body(p);
    assert(!/shortest session/.test(text), `"5 minutes" was refused as too short: ${text.slice(0, 500)}`);
    await p.getByText('Stake MOR', { exact: true }).first().click();
    await p.waitForTimeout(400);
    const started = await p.evaluate(() => window.__started);
    assert(started.length === 1, `"5 minutes" did not start a session`);
    assert(started[0].blockSeconds === 305, `opened at ${started[0].blockSeconds}s — the 5s cushion above the 300s floor is what keeps truncation from reverting it`);
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
    assert(/nothing is lost/i.test(panel), `confirm did not say the MOR is not lost: ${panel}`);
    // There is NO escape hatch, and the panel must not invent one. This used to
    // assert /nothing locked/ — the panel telling the user to wait for the end
    // time and avoid the lock entirely. On the deployed contract waiting locks
    // MORE (measured, Base mainnet 2026-08-06), so that advice was backwards.
    assert(
      /does not avoid this/i.test(panel),
      `confirm did not say that waiting fails to avoid the lock: ${panel}`,
    );
    assert(
      !/nothing locked/i.test(panel),
      `confirm still promises a lock-free wait: ${panel}`,
    );
    // And it must say the locked part comes back on its own, since it does.
    assert(
      /returns automatically/i.test(panel),
      `confirm did not say the locked MOR returns automatically: ${panel}`,
    );

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

  // At/after endsAt the row offers no Close button at all, so no lock warning
  // should appear either. (The comment here used to say the contract locks
  // NOTHING past endsAt — it locks everything; that is why this case is now
  // about the ABSENCE of an affordance, not about a lock-free close.)
  await drive(page, 'close-session-ended-shows-no-lock-warning', `http://localhost:${PORT}/?case=close-session&at=1784262688`, async (p) => {
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

    // Switch to min-block stake: the SAME bids now read as the stake to open
    // (0.305–0.61 MOR), a different number — proving the toggle recomputes, not
    // relabels. supply/budget=1 makes 1e15 -> 0.305, 2e15 -> 0.61.
    await p.getByTestId('price-mode-stake').click();
    await p.waitForTimeout(150);
    body = await p.locator('body').innerText();
    assert(/0\.305\s*–\s*0\.61/.test(body), `stake range 0.305–0.61 missing after toggle: ${body.slice(0, 1200)}`);
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

// --- a session inside the cap is ONE stake, through the REAL loop ------------
// Adversarial review's structural criticism of the other session-length cases:
// they stub the keep-alive context, so they pin the ARGUMENTS Chat passes and
// never the loop that spends the MOR. This drives the real provider, with the
// chain rigged to report each session ending 30s SHORT of the ask — the exact
// condition (clock skew / mining latency / stake→duration truncation) under
// which a "1 day, one stake" session used to quietly open a SECOND day-long
// stake the user was never quoted and the gate never approved.
{
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const url = `http://localhost:${PORT}/?case=single-stake-never-restakes`;
  const DAY = 24 * 60 * 60;
  const CAP = 7 * DAY;

  await drive(page, 'a-session-inside-the-cap-opens-exactly-one-stake', url, async (p) => {
    await p.waitForSelector('[data-testid="start-one-day"]', { timeout: 20000 });
    await p.getByTestId('start-one-day').click();
    // Generously past the point where a restake would have fired: the virtual
    // clock collapses a day into milliseconds, so a second open would already
    // have happened many times over.
    await p.waitForTimeout(1500);

    const opens = JSON.parse(await p.getByTestId('opens').innerText());
    assert(opens.length === 1, `a 1-day session opened ${opens.length} stakes — it must open exactly 1 (${JSON.stringify(opens)})`);
    assert(opens[0].sessionDuration === DAY, `the single stake was for ${opens[0].sessionDuration}s, want ${DAY}`);
    await p.screenshot({ path: `${SHOTS}/single-stake-never-restakes.png` });
  });

  // The other half of the same fix: past the cap it DOES chain, and the final
  // block is the remainder. A full-size final block is what made an 8-day ask
  // stay staked for ~14 days.
  await drive(page, 'a-chained-run-cuts-its-last-block-to-the-remainder', url, async (p) => {
    await p.waitForSelector('[data-testid="start-eight-days"]', { timeout: 20000 });
    await p.getByTestId('start-eight-days').click();
    await p.waitForTimeout(2500);

    const opens = JSON.parse(await p.getByTestId('opens').innerText());
    assert(opens.length === 2, `8 days should chain 2 blocks, got ${opens.length} (${JSON.stringify(opens)})`);
    assert(opens[0].sessionDuration === CAP, `first block was ${opens[0].sessionDuration}s, want the ${CAP}s cap`);
    assert(opens[1].sessionDuration < CAP, `the LAST block was a full ${opens[1].sessionDuration}s cap-block — that is the ~6 extra days of lockup this fix removes`);
    // It covers the ask without running past it: block 2 starts at the overlap
    // point, so its length is the remainder from there.
    const total = opens[1].atSec + opens[1].sessionDuration - opens[0].atSec;
    assert(Math.abs(total - 8 * DAY) < 300, `the run covers ${total}s against an 8-day (${8 * DAY}s) ask`);
  });

  await page.close();
}

// --- keep-alive: several rolling sessions renew at once, same provider ------
// The capability the feature exists for. Previously the provider held one run,
// one timer and one session, and start() began with a blanket stop(), so a
// second rolling session ended the first. Drives the REAL provider on a virtual
// clock (see the case) with both runs pinned to the SAME bid.
{
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const url = `http://localhost:${PORT}/?case=keepalive-concurrent`;

  await drive(page, 'keepalive-two-runs-same-provider', url, async (p) => {
    await p.waitForSelector('[data-testid="start-a"]', { timeout: 20000 });
    const count = () => p.getByTestId('running-count').innerText();
    const opens = async () => JSON.parse(await p.getByTestId('opens').innerText());

    await p.getByTestId('start-a').click();
    await p.waitForFunction(
      () => document.querySelector('[data-testid="running-count"]').innerText === '1',
      { timeout: 15000 },
    );

    // The assertion the old single-run provider could not satisfy.
    await p.getByTestId('start-b').click();
    await p.waitForFunction(
      () => document.querySelector('[data-testid="running-count"]').innerText === '2',
      { timeout: 15000 },
    );
    assert((await count()) === '2', `expected 2 concurrent runs, got ${await count()}`);
    const chats = await p.getByTestId('running-chats').innerText();
    assert(chats === 'chatA,chatB', `both chats should be rolling, got: ${chats}`);

    // Each run must hold its OWN session — a shared one would mean both chats
    // billing to the same stake, which is not two stakes at all.
    const sa = await p.getByTestId('session-a').innerText();
    const sb = await p.getByTestId('session-b').innerText();
    assert(sa !== '-' && sb !== '-', `both runs need a live block, got ${sa} / ${sb}`);
    assert(sa !== sb, `runs must not share a session, both were ${sa}`);

    // Both staked against the SAME provider bid — the actual request.
    const o1 = await opens();
    assert(o1.length >= 2, `expected at least 2 opens, got ${o1.length}`);
    assert(
      o1.every((o) => o.bid === '0xbid-same-provider'),
      `every block must stake the pinned provider: ${JSON.stringify(o1)}`,
    );

    // Both keep RENEWING: the open count must keep climbing while both live.
    const before = o1.length;
    await p.waitForFunction(
      (n) => JSON.parse(document.querySelector('[data-testid="opens"]').innerText).length >= n + 2,
      before,
      { timeout: 20000 },
    );
    assert((await count()) === '2', 'both runs should still be renewing');
  });

  // Stopping one run must not touch the other — the blanket stop() bug, inverted.
  await drive(page, 'keepalive-stop-one-leaves-the-other', url, async (p) => {
    await p.waitForSelector('[data-testid="start-a"]', { timeout: 20000 });
    await p.getByTestId('start-a').click();
    await p.getByTestId('start-b').click();
    await p.waitForFunction(
      () => document.querySelector('[data-testid="running-count"]').innerText === '2',
      { timeout: 15000 },
    );

    await p.getByTestId('stop-a').click();
    await p.waitForFunction(
      () => document.querySelector('[data-testid="running-count"]').innerText === '1',
      { timeout: 15000 },
    );
    const chats = await p.getByTestId('running-chats').innerText();
    assert(chats === 'chatB', `only chatB should survive stop(chatA), got: ${chats}`);

    // And B must still be RENEWING, not merely listed as running.
    const n = JSON.parse(await p.getByTestId('opens').innerText()).length;
    await p.waitForFunction(
      (x) => JSON.parse(document.querySelector('[data-testid="opens"]').innerText).length > x,
      n,
      { timeout: 20000 },
    );
    const after = await p.getByTestId('running-chats').innerText();
    assert(after === 'chatB', `chatB should keep renewing alone, got: ${after}`);

    // The stopped run's blocks must STAY claimed. Its final block is still open
    // (stopping never closes early — that time-locks the stake), and dropping
    // the claim along with the run made that paid block adoptable by any unbound
    // chat on the same model.
    const claimed = JSON.parse(await p.getByTestId('claimed-ids').innerText());
    assert(
      Array.isArray(claimed.chatA) && claimed.chatA.length > 0,
      `stopped run chatA lost its claim entirely: ${JSON.stringify(claimed)}`,
    );
    const aOpens = JSON.parse(await p.getByTestId('opens').innerText())
      .map((o) => o.id);
    assert(
      claimed.chatA.every((id) => aOpens.includes(id)),
      `retained ids are not real blocks chatA opened: ${JSON.stringify(claimed.chatA)}`,
    );

    // RESTART the stopped chat. Its previous final block can still be open for
    // up to a full block, so its claim must survive the new run starting. When
    // retained and live were published as one overlaid map, the new run (which
    // begins with openedSessionIds: []) wiped the whole entry and left that paid
    // block unclaimed for the new run's entire life.
    const before = new Set(claimed.chatA);
    await p.getByTestId('restart-a').click();
    await p.waitForFunction(
      () => document.querySelector('[data-testid="running-count"]').innerText === '2',
      { timeout: 15000 },
    );
    const after2 = JSON.parse(await p.getByTestId('claimed-ids').innerText());
    const lost = [...before].filter((id) => !(after2.chatA || []).includes(id));
    assert(
      lost.length === 0,
      `restarting chatA dropped ${lost.length} still-claimed block(s): ${JSON.stringify(lost)}`,
    );
  });

  await page.close();
}

// --- returning to a LIVE rolling chat must be usable ------------------------
// A rolling chat's PERSISTED binding is whichever block was current at its last
// prompt (the router writes SessionID on a prompt, not on a rotation), so
// selectChat resolved a lapsed block and set readonly — and nothing cleared it.
// The composer said "Session is closed" while the header offered "Stop
// renewing", on a session the user was paying for. Fixture: chat A's run is live
// on block b5 while its persisted binding is the dead b3.
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await drive(page, 'rolling-return-stays-usable', `http://localhost:${PORT}/?case=rolling-return-live`, async (p) => {
    await p.waitForSelector('textarea', { timeout: 20000 });
    // The drawer STAYS open after picking a chat, so it is opened once; clicking
    // the history button again would toggle it shut.
    await p.getByTitle('Chat history').click();
    await p.waitForTimeout(300);
    // Go to the plain chat, then back to the rolling one — the exact trip.
    await p.getByText('Plain B', { exact: false }).first().click();
    await p.waitForTimeout(600);
    await p.getByText('Rolling A', { exact: false }).first().click();
    await p.waitForTimeout(900);

    const ta = p.locator('textarea').first();
    const disabled = await ta.isDisabled();
    const placeholder = (await ta.getAttribute('placeholder')) || '';
    assert(
      !/ReadOnly|Session is closed/i.test(placeholder),
      `returned to a LIVE rolling session but the composer says: "${placeholder}"`,
    );
    assert(!disabled, 'composer is disabled on a live rolling session');
  });

  // The mirror clears readonly on a live block — but "the run is running" is NOT
  // "this block is open". Economy mode leaves a real gap (REOPEN_DELAY_SEC plus
  // fetchSession polling) where the run is running and sessionsByChat still
  // holds the EXPIRED block. Clearing readonly there re-enables the composer
  // over a dead session and the prompt goes out against it.
  await drive(page, 'economy-gap-does-not-unlock-a-dead-block', `http://localhost:${PORT}/?case=rolling-return-gap`, async (p) => {
    await p.waitForSelector('textarea', { timeout: 20000 });
    await p.getByTitle('Chat history').click();
    await p.waitForTimeout(300);
    await p.getByText('Plain B', { exact: false }).first().click();
    await p.waitForTimeout(600);
    await p.getByText('Rolling A', { exact: false }).first().click();
    await p.waitForTimeout(900);

    const ta = p.locator('textarea').first();
    const disabled = await ta.isDisabled();
    if (!disabled) {
      await ta.fill('hello');
      await ta.press('Enter');
      await p.waitForTimeout(700);
    }
    const sent = await p.evaluate(() => window.__sent || []);
    const onDead = sent.filter((s) => s.session_id === '0xb5');
    assert(
      onDead.length === 0,
      `prompt sent against the EXPIRED block during the economy gap: ${JSON.stringify(sent)}`,
    );
    assert(disabled, 'composer was unlocked while the run had no open block');
  });

  // Sitting INSIDE a chat whose own run is live, with ANOTHER run going in a
  // never-prompted chat (chatC — live run, no drawer row). The stop-all must
  // render alongside the per-chat Stop. Gating it on `!myRun?.running` hid it
  // exactly here, leaving that second run unreachable and unstoppable — the case
  // the fix exists for. The other drive block cannot see this: it stands in a
  // chat with no run of its own, where both the old and new gates render.
  await drive(page, 'stop-all-shows-even-inside-a-running-chat', `http://localhost:${PORT}/?case=rolling-return-live`, async (p) => {
    await p.waitForSelector('textarea', { timeout: 20000 });
    await p.getByTitle('Chat history').click();
    await p.waitForTimeout(300);
    await p.getByText('Rolling A', { exact: false }).first().click();
    await p.waitForTimeout(800);
    const body = await p.locator('body').innerText();
    assert(
      /Stop renewing/.test(body),
      `per-chat stop missing inside a running chat: ${body.slice(0, 200)}`,
    );
    assert(
      /Stop all renewing \(1\)/.test(body),
      `stop-all hidden inside a running chat, so chatC's run is unreachable: ${body.slice(0, 300)}`,
    );
  });

  // The run is live on a chat the user is NOT in, so a stop control must still
  // be reachable — otherwise the only way out is the early-close penalty.
  await drive(page, 'stop-control-reachable-from-another-chat', `http://localhost:${PORT}/?case=rolling-return-live`, async (p) => {
    await p.waitForSelector('textarea', { timeout: 20000 });
    await p.getByTitle('Chat history').click();
    await p.waitForTimeout(250);
    await p.getByText('Plain B', { exact: false }).first().click();
    await p.waitForTimeout(600);
    const body = await p.locator('body').innerText();
    assert(
      /Stop all renewing \(\d+\)/.test(body),
      `no stop-all control while runs are live elsewhere (the per-chat "Stop renewing" does not count): ${body.slice(0, 300)}`,
    );
  });
  await page.close();
}

// --- boot must not adopt a live run's paid block ----------------------------
// Chat unmounts on every tab switch, so the boot effect re-runs on a routine
// Wallet trip. It took openSessions[0] unconditionally — during a run that is
// the run's own current block — and stapled it to a BRAND NEW chat id, so two
// chats claimed one stake and the router wrote that to disk on the next prompt.
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await drive(page, 'boot-does-not-adopt-a-live-run-block', `http://localhost:${PORT}/?case=boot-skips-run-block`, async (p) => {
    await p.waitForSelector('textarea', { timeout: 20000 });
    await p.waitForTimeout(900);

    // Assert on what goes ON THE WIRE, not on rendered text. A first attempt
    // grepped the DOM for the session id, which never appears there — so it
    // passed against the unfixed code too. A test that cannot fail is worse than
    // no test: it manufactures confidence. Send a prompt and read the header.
    const ta = p.locator('textarea').first();
    if (!(await ta.isDisabled())) {
      await ta.fill('hello');
      await ta.press('Enter');
      await p.waitForTimeout(800);
    }
    const sent = await p.evaluate(() => window.__sent || []);
    assert(sent.length === 1, `expected exactly one prompt, got ${sent.length} — a zero-send makes the theft check vacuous`);
    const stolen = sent.filter(
      (s) => s.session_id === '0xsessA' || s.session_id === '0xsessB',
    );
    assert(
      stolen.length === 0,
      `boot adopted a live run's block and billed to it: ${JSON.stringify(sent)}`,
    );
    assert(
      (await p.locator('textarea').count()) > 0,
      'app failed to initialise at all',
    );
  });
  await page.close();
}

// --- the restore/boot ordering must not depend on cache warmth --------------
// Two effects race on remount: the mount-restore (which puts the user back in
// the single live rolling thread) and the boot init (which adopts an open
// session into a BRAND NEW chat id). Which ran first flipped with react-query
// cache state, so the restore fix was accidentally correct rather than correct
// by design — and when boot won, the prompt went out under the run's block with
// a chat id that exists nowhere. Both cache states must land in chatA.
for (const [label, kase] of [
  ['cold', 'restore-race-cold'],
  ['warm', 'restore-race-warm'],
]) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await drive(page, `restore-wins-over-boot-${label}-cache`, `http://localhost:${PORT}/?case=${kase}`, async (p) => {
    await p.waitForSelector('textarea', { timeout: 20000 });
    await p.waitForTimeout(1200); // let both effects settle
    // Assert on WHICH CHAT IS ACTIVE, not on a prompt round-trip. `data-active`
    // is driven by `activeChat?.id`, which is precisely what the race decides,
    // and it is present without needing a send to succeed — an earlier version
    // keyed on the outgoing header and failed pre-fix with "no prompt was sent",
    // a reason that says nothing about the defect and would also fire for
    // unrelated harness trouble.
    await p.getByTitle('Chat history').click();
    await p.waitForTimeout(400);
    const active = await p.evaluate(() =>
      [...document.querySelectorAll('[data-active="true"]')]
        .map((e) => e.innerText.trim().split('\n')[0])
        .filter(Boolean),
    );
    assert(
      active.includes('Rolling A'),
      `${label} cache: the live rolling thread is not the active chat — active=${JSON.stringify(active)}. Boot adopted the run's block into a new thread.`,
    );
  });
  await page.close();
}

// --- after a RELAUNCH, only the durable record protects a paid session -------
// Keep-alive state is in refs and dies with the process, so "open a session,
// quit before typing, reopen the app" had no in-memory claim at all — boot took
// openSessions[0] and stapled it to a fresh chat id, and the next prompt wrote
// that theft to disk. The router now records the binding when the session OPENS;
// this proves boot actually READS it. A durable record no consumer consults is
// worse than none: it makes the bug look retired while it still happens.
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await drive(page, 'relaunch-honours-the-durable-binding', `http://localhost:${PORT}/?case=boot-relaunch-durable`, async (p) => {
    await p.waitForSelector('textarea', { timeout: 20000 });
    await p.waitForTimeout(1000);
    const ta = p.locator('textarea').first();
    if (!(await ta.isDisabled())) {
      await ta.fill('hello');
      await ta.press('Enter');
      await p.waitForTimeout(800);
    }
    const sent = await p.evaluate(() => window.__sent || []);
    const stolen = sent.filter(
      (s) =>
        (s.session_id === '0xsessA' && s.chat_id !== 'chatA') ||
        (s.session_id === '0xsessB' && s.chat_id !== 'chatB'),
    );
    assert(
      stolen.length === 0,
      `after relaunch a durably-bound session was billed under another chat: ${JSON.stringify(sent)}`,
    );
  });
  await page.close();
}

// --- stop-all must NOT appear when the only run is the one you are in -------
// Reported from a live pass: "Stop all renewing" always showed (1). Every
// existing case has TWO runs, so none of them could see a miscount when there is
// exactly one and it belongs to the current chat.
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await drive(page, 'stop-all-hidden-when-only-your-own-run-is-live', `http://localhost:${PORT}/?case=stop-all-single-run`, async (p) => {
    await p.waitForSelector('textarea', { timeout: 20000 });
    await p.getByTitle('Chat history').click();
    await p.waitForTimeout(300);
    await p.getByText('Rolling A', { exact: false }).first().click();
    await p.waitForTimeout(900);
    const body = await p.locator('body').innerText();
    assert(
      /Stop renewing/.test(body),
      `per-chat stop missing: ${body.slice(0, 200)}`,
    );
    assert(
      !/Stop all renewing/.test(body),
      `stop-all shown with no OTHER run live: ${body.slice(0, 300)}`,
    );
  });
  await page.close();
}

// --- the double-stake notice must fire on the real New-chat flow ------------
// Reported from a live pass: it never appears. Drives the actual path (header
// New chat -> pick the model that already has open sessions) rather than
// asserting on a hand-built state, because the state is what is suspect.
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await drive(page, 'double-stake-notice-fires-on-new-chat', `http://localhost:${PORT}/?case=stop-all-single-run`, async (p) => {
    await p.waitForSelector('textarea', { timeout: 20000 });
    await p.getByText('New chat', { exact: false }).first().click();
    await p.waitForTimeout(600);
    // Pick the model inside the MODAL — the header also renders the model name,
    // and .first() matched that instead.
    await p.getByText('Test Model', { exact: false }).last().click();
    await p.waitForTimeout(900);
    const body = await p.locator('body').innerText();
    // Diagnostic first: are we even on the stake screen?
    assert(
      /Select payment method|Stake MOR/i.test(body),
      `not on the stake screen after New chat: ${body.slice(0, 400)}`,
    );
    assert(
      /already have \d+ open session/i.test(body),
      `no double-stake notice despite open sessions on this model: ${body.slice(0, 500)}`,
    );
  });
  await page.close();
}

await browser.close();
await server.close();

console.log('ISOLATION CASES:');
results.forEach((r) => console.log(r));
console.log(`\n${results.length - failures} passed, ${failures} failed  (screenshots in shots/)`);
process.exit(failures === 0 ? 0 : 1);
