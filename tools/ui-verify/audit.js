// Computed-style audit of the live DOM. Class-name-free (styled-components-safe):
// selects by walking every element's computed styles, never by class.
// Injected into the page via page.evaluate(). Returns an array of findings;
// an empty array is only a PASS if the sentinel check in run.js already proved
// the page rendered real UI (an empty IPC shell passes every rule here).
export const AUDIT_FN = `() => {
  const findings = [];
  const unmeasurable = [];
  const parseC = (s) => {
    const m = (s || '').match(/[\\d.]+/g);
    if (!m) return null;
    const [r, g, b] = m.slice(0, 3).map(Number);
    const a = m.length > 3 ? parseFloat(m[3]) : 1;
    return { r, g, b, a };
  };
  // Composite ancestor backgrounds top-down. Returns an rgb string, or null when
  // the effective backdrop is a background-image/gradient — unmeasurable by this
  // method; those pairings are deferred to the screenshot layer, never guessed.
  const bgOf = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const c = parseC(cs.backgroundColor);
      if (c && c.a >= 1) {
        let base = c;
        for (let i = layers.length - 1; i >= 0; i--) {
          const L = layers[i];
          base = {
            r: L.r * L.a + base.r * (1 - L.a),
            g: L.g * L.a + base.g * (1 - L.a),
            b: L.b * L.a + base.b * (1 - L.a),
            a: 1,
          };
        }
        return 'rgb(' + [base.r, base.g, base.b].map(Math.round).join(', ') + ')';
      }
      if (c && c.a > 0) layers.push(c);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
    }
    return null; // no opaque backdrop found — treat as unmeasurable, not white
  };
  const lum = (c) => {
    const m = c.match(/\\d+(\\.\\d+)?/g);
    if (!m) return 1;
    const [r, g, b] = m.slice(0, 3).map(Number).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const pair = [lum(a), lum(b)].sort((p, q) => q - p);
    return (pair[0] + 0.05) / (pair[1] + 0.05);
  };
  const tag = (el) =>
    el.tagName.toLowerCase() +
    (el.dataset && el.dataset.testid ? '[' + el.dataset.testid + ']' : '');

  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();

    // 4. scroll containers that cannot scroll (flex min-height:0 class of bug).
    // MUST run before the zero-size skip: a collapsed container IS the defect.
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4 && el.clientHeight < 8)
      findings.push({ rule: 'dead-scroll', el: tag(el), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });

    if (!r.width || !r.height) continue;

    // 1. contrast: any element directly containing text (pairing, not literals)
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim();
    if (text && parseFloat(cs.fontSize) >= 9) {
      const bg = bgOf(el);
      if (bg === null) {
        unmeasurable.push(text.slice(0, 40));
      } else {
        const c = contrast(cs.color, bg);
        const large = parseFloat(cs.fontSize) >= 18.66 || (parseFloat(cs.fontSize) >= 14 && +cs.fontWeight >= 700);
        const floor = large ? 3 : 4.5;
        if (c < floor)
          findings.push({ rule: 'contrast', el: tag(el), text: text.slice(0, 40), ratio: +c.toFixed(2), floor, bg });
      }
    }

    // 2. hard corners on visible surfaces (radius PRESENCE, not remembered values)
    const bg = cs.backgroundColor;
    const hasBg = bg && bg !== 'transparent' && !/rgba\\(\\s*\\d+,\\s*\\d+,\\s*\\d+,\\s*0\\s*\\)/.test(bg);
    if (hasBg && r.width > 40 && r.height > 24 && cs.borderRadius === '0px' &&
        el !== document.body && el !== document.documentElement)
      findings.push({ rule: 'hard-corner', el: tag(el), size: (r.width | 0) + 'x' + (r.height | 0) });

    // 3. palette leftovers: hue-band predicate (AUDIT_HUE=green|red|purple), never hex literals
    const band = (window.__AUDIT_HUE || 'green');
    for (const prop of ['color', 'backgroundColor', 'borderTopColor']) {
      const m = (cs[prop] || '').match(/\\d+/g);
      if (!m) continue;
      const [R, G, B] = m.slice(0, 3).map(Number);
      const hit =
        (band === 'green' && G > 110 && G > R * 1.35 && G > B * 1.35) ||
        (band === 'red' && R > 110 && R > G * 1.35 && R > B * 1.35) ||
        (band === 'purple' && R > 90 && B > 110 && B > G * 1.35);
      if (hit) findings.push({ rule: 'palette-leftover', prop, el: tag(el), val: cs[prop] });
    }

  }
  // dedupe identical findings (styled lists repeat)
  const seen = new Set();
  const out = findings.filter((f) => {
    const k = JSON.stringify(f);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 300);
  if (unmeasurable.length)
    out.push({
      rule: 'contrast-unmeasurable',
      count: unmeasurable.length,
      samples: [...new Set(unmeasurable)].slice(0, 5),
      note: 'text over background-image/gradient — judge via the screenshot layer, not this audit',
    });
  return out;
}`;
