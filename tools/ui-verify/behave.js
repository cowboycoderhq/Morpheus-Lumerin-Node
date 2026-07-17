// Behavioral probes for the live DOM — the v2 counterpart to audit.js.
// audit.js proves what the UI LOOKS like; this proves what it DOES.
// Council-mandated after the 2026-07-13 post-mortem verification: the four
// operator-caught failures clustered on observation-unavailability — the kit
// could not see clickability, scroll function, or process freshness, so no
// disciplined claim about them was even possible.
//
// In-page function string (page.evaluate IIFE, same convention as AUDIT_FN).
// Returns { findings: [...], probes: {interactive, scrollables} } — counts let
// the evidence file show coverage, not just absence of findings.
export const BEHAVE_FN = `async () => {
  const findings = [];
  const tag = (el) =>
    el.tagName.toLowerCase() +
    (el.id ? '#' + el.id : '') +
    (el.dataset && el.dataset.testid ? '[' + el.dataset.testid + ']' : '');
  const text = (el) => (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 40);

  // ---- 1. Clickability hit-test (rule: unclickable) ----------------------
  // Two mechanical classes, both from the 2026-07-13 sessions:
  // (a) pointer-events:none control whose center lies OUTSIDE its parent's box
  //     — parent :hover can then never re-enable it (hit-testing never reaches
  //     the parent while pointing at the control); in-flow hover-reveals are
  //     legit and NOT flagged. (b) another element (overlay) wins the hit-test
  //     at the control's center. Containment both ways per Playwright's own
  //     hit-target semantics — a span inside the button IS a hit.
  const interactiveSel = 'button, a[href], [role="button"], input, select, textarea, summary';
  let interactive = 0;
  const coverCounts = {};
  for (const el of document.querySelectorAll(interactiveSel)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;                    // no geometry: needs a --click hover assertion
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue; // offscreen
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue; // intentionally inert
    interactive++;
    const cx = Math.max(0, Math.min(innerWidth - 1, r.left + r.width / 2));
    const cy = Math.max(0, Math.min(innerHeight - 1, r.top + r.height / 2));
    if (getComputedStyle(el).pointerEvents === 'none') {
      const p = el.parentElement && el.parentElement.getBoundingClientRect();
      const inParent = p && cx >= p.left - 1 && cx <= p.right + 1 && cy >= p.top - 1 && cy <= p.bottom + 1;
      if (!inParent)
        findings.push({ rule: 'unclickable', el: tag(el), text: text(el), reason: 'pointer-events:none and outside its parent box — parent :hover can never re-enable it' });
      continue;                                             // in-parent hover-reveal: legit pattern, not flagged
    }
    const hit = document.elementFromPoint(cx, cy);
    if (hit && !(el.contains(hit) || hit.contains(el))) {
      const k = tag(hit);
      coverCounts[k] = (coverCounts[k] || 0) + 1;
      if (coverCounts[k] <= 3)
        findings.push({ rule: 'unclickable', el: tag(el), text: text(el), reason: 'covered by ' + k + ' at its center' });
    }
  }
  for (const [k, n] of Object.entries(coverCounts))
    if (n > 3)
      findings.push({ rule: 'unclickable', el: '(' + (n - 3) + ' more)', reason: 'also covered by ' + k + ' — one overlay covering many controls (modal? z-index?)' });

  // ---- 2. Scroll write-and-read-back (rule: frozen-scroll) ---------------
  // scrollHeight>clientHeight + overflow says "should scroll"; the ground
  // truth is writing scrollTop and reading it back AFTER a settle tick — a
  // scroll-jacking listener that resets position passes the synchronous read
  // and fails the async one. Position restored afterward.
  const scrollables = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (!/(auto|scroll|overlay)/.test(cs.overflowY)) continue;
    if (el.scrollHeight <= el.clientHeight + 4 || el.clientHeight < 8) continue; // static dead-scroll rule owns the collapsed case
    scrollables.push(el);
  }
  for (const el of scrollables.slice(0, 30)) {
    const before = el.scrollTop;
    const target = before > 0 ? 0 : Math.min(50, el.scrollHeight - el.clientHeight);
    el.style.scrollBehavior = 'auto';
    el.scrollTop = target;
    await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 60)));
    const after = el.scrollTop;
    el.scrollTop = before;
    el.style.scrollBehavior = '';
    if (Math.abs(after - target) > 2 && Math.abs(after - before) < 1)
      findings.push({ rule: 'frozen-scroll', el: tag(el), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, note: 'scrollTop write does not stick — scroll-jacking listener or broken scroller' });
  }

  return { findings, probes: { interactive, scrollables: scrollables.length } };
}`;

// Accessible-name danger classes (OWASP high-impact action classes:
// irreversible / financial / admin / externally visible). A declared --click
// whose target matches is NEVER really clicked — it is downgraded to a
// Playwright trial click (actionability checks incl. hit-target, no dispatch).
export const DANGER_RE =
  /pay|purchase|buy|checkout|order|subscribe|unsubscribe|delete|remove|destroy|reset|wipe|send|submit|post|publish|confirm|approve|sign.?out|log.?out|transfer|withdraw|deposit|stake|swap|mint|burn/i;
