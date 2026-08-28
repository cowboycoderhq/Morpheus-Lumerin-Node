// Frozen-value audit — the token system's blind spot.
//
// A theme swap works only if every colour-valued declaration DERIVES from
// props.theme. A literal is not invalid CSS; it is perfectly valid and simply
// frozen, so nothing — not tsc, not the build, not a render test of the
// component's own look — can see it. It surfaces only as "that panel stayed
// green when everything else went cyan".
//
// TWO design decisions, both learned the hard way:
//
// 1. The query is the INVARIANT (a colour-valued declaration that never
//    mentions `theme`), not a list of literals someone remembered. A hand-
//    listed query — `#hex`, `rgba(`, plus the colour names you can think of —
//    can only rediscover what its author already knew. That is a checklist
//    wearing a regex: it missed `grey` and `white` in ImportFlow, which an
//    adversarial reviewer then found by swapping the theme on the real
//    component.
//
// 2. Findings are split by REACHABILITY from `main.tsx`. This repo carries a dead
//    legacy marketplace (contracts-list, unused icons, tools/) holding 40 of
//    the 41 raw hits. Failing on those would make the gate red forever, and a
//    gate that is always red is a gate nobody runs. A frozen value in code that
//    never renders is not a defect — it is dead code, reported and not failed.
//
// Run: node frozen-values.mjs [--json] [--all]
//   --all   also FAIL on unreachable findings (use when deleting dead code)

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve as presolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..', 'src', 'renderer', 'src');
// One level up from the component tree, because index.html lives there and is
// the app's real entry — Electron loads it directly. Scoping the scan to src/
// is what let its hardcoded page background and scrollbars go unseen.
const RENDERER = join(here, '..', '..', 'src', 'renderer');
const ENTRY = join(SRC, 'main.tsx'); // the real entry: index.html loads it, it imports App
const HTML_ENTRY = join(RENDERER, 'index.html');

// ---------------------------------------------------------------- reachability
// Resolve each import specifier to a file and walk from the entry. Basename
// matching is not good enough: dashboard/tx-list/Filter.jsx and
// contracts-list/Filter.jsx are different files with the same name, and only
// one of them ships.
const EXT = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];

const resolveSpec = (spec, fromFile) => {
  let base;
  if (spec.startsWith('.')) base = presolve(dirname(fromFile), spec);
  else if (spec.startsWith('@renderer/')) base = join(SRC, spec.slice('@renderer/'.length));
  else if (spec.startsWith('src/renderer/src/')) base = join(SRC, spec.slice('src/renderer/src/'.length));
  else return null; // bare package — not ours
  for (const e of EXT) {
    const p = base + e;
    try {
      if (statSync(p).isFile()) return p;
    } catch (_) {
      /* keep trying extensions */
    }
  }
  return null;
};

const reachable = new Set();
const visit = (file) => {
  if (reachable.has(file)) return;
  reachable.add(file);
  let src = '';
  try {
    src = readFileSync(file, 'utf8');
  } catch (_) {
    return;
  }
  for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
    const r = resolveSpec(m[1], file);
    if (r) visit(r);
  }
};
visit(ENTRY);
// Nothing imports index.html, but Electron loads it — reachable by definition.
// Without this seed the graph files it as dead code and merely reports it.
reachable.add(HTML_ENTRY);

// ---------------------------------------------------------------- the invariant
const COLOR_PROPS =
  /\b(color|background|background-color|border|border-top|border-right|border-bottom|border-left|border-color|border-top-color|border-right-color|border-bottom-color|border-left-color|outline|outline-color|fill|stroke|box-shadow|text-shadow|caret-color|text-decoration-color|column-rule-color|accent-color)\b/;

// The full CSS named-colour set. An enumeration, but a COMPLETE one from the
// spec rather than a memory list — so it can surface a defect nobody thought of.
const NAMED = `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan
darkblue darkcyan darkgoldenrod darkgray darkgrey darkgreen darkkhaki darkmagenta darkolivegreen
darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey
darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite
forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray grey green greenyellow honeydew hotpink
indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral
lightcyan lightgoldenrodyellow lightgray lightgrey lightgreen lightpink lightsalmon lightseagreen
lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta
maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue
mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red
rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue
slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
whitesmoke yellow yellowgreen`
  .split(/\s+/)
  .filter(Boolean);

const COLOR_VALUE = new RegExp(
  `(#[0-9a-fA-F]{3,8}\\b|\\brgba?\\s*\\(|\\bhsla?\\s*\\(|\\b(${NAMED.join('|')})\\b)`,
);
const EXEMPT = /\b(transparent|inherit|currentColor|none|unset|initial|revert)\b/;

// .html and .css count. The gate originally walked .jsx/.tsx only and so never
// opened index.html — which pinned the page background and every scrollbar to
// classic with `!important`, unreachable by any theme. A literal is invisible
// to a sweep that does not read the file it lives in, and "the files I thought
// of" is the same defect as "the literals I could recall".
const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx|tsx|html|css)$/.test(p)) out.push(p);
  }
  return out;
};

// Strip comments while PRESERVING line numbers, block-aware. A per-line
// stripper only sees comments that open and close on one line, so a multi-line
// /* */ or <!-- --> leaves its prose looking like code — and a comment
// explaining a frozen literal then reads as a frozen literal. The detector
// must not flag the note about the bug as the bug.
const stripComments = (text) => {
  const out = [];
  let inBlock = false;
  let inHtml = false;
  for (const raw of text.split('\n')) {
    let line = raw;
    let acc = '';
    while (line.length) {
      if (inBlock) {
        const end = line.indexOf('*/');
        if (end === -1) { line = ''; break; }
        line = line.slice(end + 2);
        inBlock = false;
      } else if (inHtml) {
        const end = line.indexOf('-->');
        if (end === -1) { line = ''; break; }
        line = line.slice(end + 3);
        inHtml = false;
      } else {
        const b = line.indexOf('/*');
        const h = line.indexOf('<!--');
        const l = line.indexOf('//');
        const first = [b, h, l].filter((x) => x !== -1).sort((a, z) => a - z)[0];
        if (first === undefined) { acc += line; line = ''; break; }
        acc += line.slice(0, first);
        if (first === l && (b === -1 || l < b) && (h === -1 || l < h)) { line = ''; break; }
        if (first === b) { inBlock = true; line = line.slice(b + 2); }
        else { inHtml = true; line = line.slice(h + 4); }
      }
    }
    out.push(acc);
  }
  return out;
};

const live = [];
const dead = [];
for (const file of walk(RENDERER)) {
  const rawLines = readFileSync(file, 'utf8').split('\n');
  const lines = stripComments(readFileSync(file, 'utf8'));
  lines.forEach((code, i) => {
    if (!code.includes(':')) return;
    const prop = code.slice(0, code.indexOf(':'));
    const value = code.slice(code.indexOf(':') + 1);
    if (!COLOR_PROPS.test(prop)) return;
    if (!COLOR_VALUE.test(value)) return;
    if (EXEMPT.test(value) && !COLOR_VALUE.test(value.replace(EXEMPT, ''))) return;
    if (/theme/.test(value)) return; // derives from the live theme — the invariant holds
    (reachable.has(file) ? live : dead).push({
      file: relative(RENDERER, file),
      line: i + 1,
      text: rawLines[i].trim(),
      reachable: reachable.has(file),
    });
  });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ live, dead }, null, 2));
} else {
  console.log('FROZEN VALUES — colour-valued declarations that never read props.theme\n');
  console.log(`REACHABLE from the entry (${live.length}) — these ship and must swap:`);
  for (const f of live) console.log(`  ${f.file}:${f.line}  ${f.text}`);
  if (!live.length) console.log('  (none)');
  console.log(`\nUNREACHABLE (${dead.length}) — dead code, reported not failed:`);
  const byFile = {};
  for (const f of dead) byFile[f.file] = (byFile[f.file] || 0) + 1;
  for (const [f, n] of Object.entries(byFile).sort()) console.log(`  ${String(n).padStart(2)}  ${f}`);
  if (!dead.length) console.log('  (none)');
  console.log(`\nGraph: ${reachable.size} modules reachable from the entry.`);
}

const failOn = process.argv.includes('--all') ? live.length + dead.length : live.length;
process.exit(failOn ? 1 : 0);
