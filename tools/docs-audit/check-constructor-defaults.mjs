// check-constructor-defaults — the default that is NOT in SetDefaults.
//
// check-mechanized.mjs resolves defaults from `func (cfg *Config) SetDefaults()`.
// When a field has no entry there it records UNDETERMINED (see check-mechanized
// .mjs:273, "effective default may come from ... a fallback in constructor") and
// stays silent. Silence is why ten green gates coexisted with three reference
// tables stating a false default.
//
// This resolves the other kind: a fallback applied at the CONSUMPTION site.
// Two code shapes both count, and both were shipped as wrong docs:
//
//   idiom A — override-then-coerce (artifacts_registry.go:20-21,51-53):
//     const DefaultRegistryRefreshInterval = 1 * time.Hour
//     func NewArtifactsRegistry(..., refreshInterval time.Duration, ...) {
//         if refreshInterval == 0 { refreshInterval = DefaultRegistryRefreshInterval }
//
//   idiom B — default-first-then-override, one hop further away
//   (config/agents_config.go:15,59-62 — the AGENT_CONFIG_PATH shape):
//     const ConfigAgentsPathDefault = "agents-config.json"
//     func NewAgentConfigLoader(configPath string, ...) *AgentConfigLoader {
//         return &AgentConfigLoader{ configPath: configPath, ... }   // stored
//     }
//     func (e *AgentConfigLoader) Init() error {
//         filePath := ConfigAgentsPathDefault
//         if e.configPath != "" { filePath = e.configPath }          // used
//
// idiom B is NOT a variant spelling of idiom A: the overridden name is a
// fresh local, not the function's own parameter, and the guard condition
// (`e.configPath`) is a receiver FIELD populated two functions upstream, in a
// different function's struct literal. A resolver that only knows idiom A
// reports idiom B as UNDETERMINED forever — which is exactly what happened:
// AGENT_CONFIG_PATH sat in check-mechanized.mjs's UNDETERMINED bucket, silent
// because that bucket carries no exit code, while idiom A already had its own
// dedicated (and blocking) gate.
//
// In both idioms the env var's real default is the CONSTANT, not the
// sentinel/empty condition that selects it. A doc that reports the default as
// the sentinel, or as "no default", is not merely stale — it is self-refuting,
// because setting the documented value produces the fallback.
//
// The gate: for every env var whose value reaches a sentinel-coerced
// parameter (by either idiom), no documentation may state that its default IS
// the sentinel, or that no default exists.
//
// Method, all static:
//   1. collect `<contains>Default<contains>` = <literal> consts per package
//      (prefix `Default*` and suffix `*Default` both occur in this codebase)
//   2. idiom A: find funcs with `if <param> == <sentinel> { <param> = Default* }`
//      idiom B: find funcs with `<local> := Default*` then
//      `if <cond> != <sentinel> { <local> = <cond> }`; if <cond> is a receiver
//      field, resolve it to the constructor parameter that fills it via that
//      constructor's struct literal, then treat it like idiom A from there
//   3. at each call site, take the argument in that parameter's position; if it
//      is `cfg.<Path>`, map <Path> to its `env:"NAME"` tag in config.go
//   4. scan docs for a stated default for NAME and compare against the CONSTANT
//
// A var this cannot resolve by either idiom (no matching coercion, or a
// constructor/call-site static analysis can't trace) is simply absent from
// `resolved` — reported as UNDETERMINED by check-mechanized.mjs (if it also
// has no SetDefaults entry), never silently treated as "fine". See
// check-mechanized.mjs's tail-line summary, which now states the UNDETERMINED
// count instead of only the MATCH count, for the same reason.
//
// Usage: node check-constructor-defaults.mjs [--selftest]

import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const REPO = process.env.AUDIT_REPO || process.cwd();

function walk(dir, out = [], filter = () => true) {
  let ents = [];
  try { ents = readdirSync(dir); } catch { return out; }
  for (const e of ents) {
    if (e === 'node_modules' || e === '.git' || e === 'vendor') continue;
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out, filter);
    else if (filter(p)) out.push(p);
  }
  return out;
}

/** `DefaultX = 1 * time.Hour` / `ConfigPathDefault = "models-config.json"` ->
 *  printable value. The codebase uses BOTH namings — `Default` as prefix
 *  (attestation package) and as suffix (config package's `ConfigPathDefault`,
 *  `ConfigAgentsPathDefault`) — so the identifier is matched by a lookahead
 *  for "contains Default" rather than "starts with Default"; a prefix-only
 *  regex silently drops every suffix-named constant, which is exactly the
 *  AGENT_CONFIG_PATH / MODELS_CONFIG_PATH shape below. */
export function collectConsts(src) {
  const out = new Map();
  const re = /\b((?=[A-Za-z0-9_]*Default)[A-Za-z][A-Za-z0-9_]*)\s*=\s*([^\n]+)/g;
  let m;
  while ((m = re.exec(src))) {
    let v = m[2].trim().replace(/\s*\/\/.*$/, '').replace(/,$/, '');
    out.set(m[1], v);
  }
  return out;
}

/** Render a Go duration expression the way a human would write it in docs. */
export function humanize(expr) {
  const d = expr.match(/^(\d+)\s*\*\s*time\.(Nanosecond|Microsecond|Millisecond|Second|Minute|Hour)$/);
  if (d) {
    const unit = { Nanosecond: 'ns', Microsecond: 'us', Millisecond: 'ms', Second: 's', Minute: 'm', Hour: 'h' }[d[2]];
    return `${d[1]}${unit}`;
  }
  const s = expr.match(/^"(.*)"$/);
  if (s) return s[1];
  return expr;
}

/** funcs containing `if p == <sentinel> { p = DefaultX }` -> {func, param, idx, constName} */
export function findCoercions(src, consts) {
  const out = [];
  // func Name(a T, b U) ... {   — capture name + param list
  const fnRe = /func\s+(?:\([^)]*\)\s*)?([A-Za-z0-9_]+)\s*\(([^)]*)\)/g;
  let f;
  while ((f = fnRe.exec(src))) {
    const name = f[1];
    const params = f[2];
    const bodyStart = src.indexOf('{', f.index + f[0].length);
    if (bodyStart < 0) continue;
    // crude brace match, adequate for Go source without brace-bearing strings here
    let depth = 0, end = bodyStart;
    for (let i = bodyStart; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = src.slice(bodyStart, end);
    const cRe = /if\s+([A-Za-z0-9_]+)\s*==\s*(0|"")\s*\{\s*\1\s*=\s*(Default[A-Za-z0-9_]*)/g;
    let c;
    while ((c = cRe.exec(body))) {
      const [, param, sentinel, constName] = c;
      if (!consts.has(constName)) continue;
      // parameter index, counting Go's grouped-declaration syntax (a, b T)
      const names = [];
      for (const grp of params.split(',')) {
        const t = grp.trim(); if (!t) continue;
        const parts = t.split(/\s+/);
        names.push(parts.length > 1 ? parts[0] : t);
      }
      const idx = names.indexOf(param);
      if (idx < 0) continue;
      out.push({ func: name, param, idx, constName, sentinel, value: humanize(consts.get(constName)) });
    }
  }
  return out;
}

/** Every func/method in src: {name, receiver (type name or null), params
 *  (ordered names), body}. One shared index so the idiom-B lookups below and
 *  a future idiom-C do not each grow their own private func-body scanner —
 *  that is how two resolvers drift apart (see file header). */
export function indexFuncs(src) {
  const out = [];
  const fnRe = /func\s+(?:\(\s*[A-Za-z0-9_]+\s+\*?([A-Za-z0-9_]+)\s*\)\s*)?([A-Za-z0-9_]+)\s*\(([^)]*)\)/g;
  let f;
  while ((f = fnRe.exec(src))) {
    const [, receiver, name, paramsRaw] = f;
    const bodyStart = src.indexOf('{', f.index + f[0].length);
    if (bodyStart < 0) continue;
    let depth = 0, end = bodyStart;
    for (let i = bodyStart; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const names = [];
    for (const grp of paramsRaw.split(',')) {
      const t = grp.trim(); if (!t) continue;
      const parts = t.split(/\s+/);
      names.push(parts.length > 1 ? parts[0] : t);
    }
    out.push({ name, receiver: receiver || null, params: names, body: src.slice(bodyStart, end) });
  }
  return out;
}

// ---------------------------------------------------------- idiom B: default
// assigned FIRST, then overridden — `filePath := ConfigAgentsPathDefault; if
// e.configPath != "" { filePath = e.configPath }` (config/agents_config.go,
// config/models_config.go). This is the AGENT_CONFIG_PATH / MODELS_CONFIG_PATH
// shape and it is NOT the same code shape as idiom A above: the overridden
// name is a fresh local, not the function's own parameter, and the guard
// (`e.configPath`) is a receiver FIELD set two hops upstream, in a different
// function's struct literal. Catching only idiom A is why AGENT_CONFIG_PATH
// stayed unresolved through the tool built to resolve exactly this.

/** funcs containing `x := Default*` then `if cond != <sentinel> { x = cond }`
 *  -> {func, receiver, cond, constName, sentinel, value}. `cond` is left as
 *  raw source text (`e.configPath`, or a bare identifier) for the caller to
 *  resolve; unlike idiom A it is not necessarily this function's own param. */
export function findFieldDefaultCoercions(funcs, consts) {
  const out = [];
  const re = /([A-Za-z0-9_]+)\s*:=\s*(\w*Default\w*)\s*\n\s*if\s+([A-Za-z0-9_.]+)\s*!=\s*(0|"")\s*\{\s*\1\s*=\s*\3\s*\n?\s*\}/g;
  for (const fn of funcs) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(fn.body))) {
      const [, , constName, cond, sentinel] = m;
      if (!consts.has(constName)) continue;
      out.push({ func: fn.name, receiver: fn.receiver, cond, constName, sentinel, value: humanize(consts.get(constName)) });
    }
  }
  return out;
}

/** `&AgentConfigLoader{ ..., configPath: configPath, ... }` -> whichever
 *  function actually constructs `receiverType` and sets `field`, and the
 *  identifier it sets that field to. Reads whatever identifier is really
 *  there rather than assuming field-name equals param-name, though in this
 *  codebase's two instances it is. Returns null if no constructor is found —
 *  the caller must treat that as UNRESOLVED, not as "no default exists". */
export function fieldSource(funcs, receiverType, field) {
  const lit = new RegExp(`&?${receiverType}\\s*\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\}`);
  const fre = new RegExp(`\\b${field}\\s*:\\s*([A-Za-z0-9_.]+)`);
  for (const fn of funcs) {
    const m = fn.body.match(lit);
    if (!m) continue;
    const fm = m[1].match(fre);
    if (fm) return { ctorFunc: fn.name, ident: fm[1] };
  }
  return null;
}

/** At each call to `func(...)`, the argument sitting in position idx. */
export function argAt(src, funcName, idx) {
  const found = [];
  const re = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    let depth = 0, end = open;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
    }
    const inner = src.slice(open + 1, end);
    const args = []; let d = 0, cur = '';
    for (const ch of inner) {
      if (ch === '(' || ch === '[' || ch === '{') d++;
      if (ch === ')' || ch === ']' || ch === '}') d--;
      if (ch === ',' && d === 0) { args.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) args.push(cur.trim());
    if (idx < args.length) found.push(args[idx]);
  }
  return found;
}

/** `cfg.TEE.ArtifactRegistryRefreshInterval` -> ARTIFACT_REGISTRY_REFRESH_INTERVAL */
export function envForField(configSrc, dotted) {
  const leaf = dotted.split('.').pop();
  if (!leaf) return null;
  const re = new RegExp(`\\b${leaf}\\b[^\\n]*env:"([A-Z0-9_]+)"`);
  const m = configSrc.match(re);
  return m ? m[1] : null;
}

/** Documented default cells that name the sentinel rather than the fallback. */
export function scanDocs(docFiles, envName, sentinel, value) {
  const bad = [];
  const sentinelTok = sentinel === '0' ? '0' : '';
  for (const f of docFiles) {
    let txt = ''; try { txt = readFileSync(f, 'utf8'); } catch { continue; }
    if (!txt.includes(envName)) continue;
    txt.split('\n').forEach((line, i) => {
      if (!line.includes(envName)) return;
      // a table row: | `NAME` | `default` | description |
      const cells = line.split('|').map((c) => c.trim());
      const stated = cells.find((c) => /^`[^`]*`$/.test(c) && !c.includes(envName));
      const statedVal = stated ? stated.replace(/`/g, '') : null;
      const saysSentinel = statedVal !== null
        && (statedVal === sentinelTok || (sentinel === '0' && statedVal === '0') || statedVal === '—' || statedVal === '-');
      const saysNone = /\b(no automatic|never|disabled by default|no default|none)\b/i.test(line);
      if (saysSentinel || saysNone) {
        bad.push({ file: f.replace(`${REPO}/`, ''), line: i + 1, envName, stated: statedVal, value, text: line.trim().slice(0, 150) });
      }
    });
  }
  return bad;
}

export function run(repo) {
  const goFiles = walk(join(repo, 'proxy-router'), [], (p) => p.endsWith('.go') && !p.endsWith('_test.go'));
  const docFiles = [
    ...walk(join(repo, 'docs'), [], (p) => /\.(mdx|md|env)$/.test(p)),
    ...walk(join(repo, '.ai-docs'), [], (p) => p.endsWith('.md')),
  ];
  let configSrc = '';
  try { configSrc = readFileSync(join(repo, 'proxy-router/internal/config/config.go'), 'utf8'); } catch { /* absent */ }

  const srcs = new Map(goFiles.map((f) => [f, readFileSync(f, 'utf8')]));
  const allGo = [...srcs.values()].join('\n');

  const resolved = [];
  const allFuncs = [...srcs.values()].flatMap((s) => indexFuncs(s));
  for (const [f, src] of srcs) {
    const consts = collectConsts(src);
    if (!consts.size) continue;
    for (const co of findCoercions(src, consts)) {
      // where does this parameter's value come from?
      for (const arg of argAt(allGo, co.func, co.idx)) {
        if (!/^cfg\./.test(arg)) continue;
        const env = envForField(configSrc, arg);
        if (!env) continue;
        resolved.push({ ...co, env, arg, file: f.replace(`${repo}/`, '') });
      }
    }

    // idiom B — see the block comment above findFieldDefaultCoercions.
    const funcs = indexFuncs(src);
    for (const fb of findFieldDefaultCoercions(funcs, consts)) {
      const dot = fb.cond.split('.');
      if (dot.length < 2) continue;                 // bare identifier: idiom A already covers same-func params
      const field = dot[dot.length - 1];
      if (dot[0] === 'cfg') {
        // set straight off the config struct — no constructor hop needed.
        const env = envForField(configSrc, fb.cond);
        if (env) resolved.push({ func: fb.func, param: fb.cond, idx: -1, constName: fb.constName, sentinel: fb.sentinel, value: fb.value, env, arg: fb.cond, file: f.replace(`${repo}/`, '') });
        continue;
      }
      if (!fb.receiver) continue;                   // no receiver type to resolve the field against
      const src2 = fieldSource(allFuncs, fb.receiver, field);
      if (!src2) continue;                           // no constructor found — leave UNRESOLVED (see selftest)
      if (src2.ident.includes('.')) {
        const env = envForField(configSrc, src2.ident);
        if (env) resolved.push({ func: fb.func, param: src2.ident, idx: -1, constName: fb.constName, sentinel: fb.sentinel, value: fb.value, env, arg: src2.ident, file: f.replace(`${repo}/`, '') });
        continue;
      }
      const ctor = allFuncs.find((x) => x.name === src2.ctorFunc);
      const idx = ctor ? ctor.params.indexOf(src2.ident) : -1;
      if (!ctor || idx < 0) continue;                 // the identifier isn't a resolvable param — UNRESOLVED
      for (const arg of argAt(allGo, ctor.name, idx)) {
        if (!/^cfg\./.test(arg)) continue;
        const env = envForField(configSrc, arg);
        if (!env) continue;
        resolved.push({ func: ctor.name, param: src2.ident, idx, constName: fb.constName, sentinel: fb.sentinel, value: fb.value, env, arg, file: f.replace(`${repo}/`, '') });
      }
    }
  }

  const findings = [];
  const seen = new Set();
  for (const r of resolved) {
    const k = `${r.env}|${r.value}`;
    if (seen.has(k)) continue;
    seen.add(k);
    // Spread the RESOLUTION first and the DOC HIT second: both carry a `file`
    // key, and the reader needs the documentation path, not the Go file the
    // constant lives in. Reversed, the gate reported artifacts_registry.go with
    // a .mdx line number - a coordinate pointing at no real location.
    findings.push(...scanDocs(docFiles, r.env, r.sentinel, r.value)
      .map((b) => ({ ...r, ...b, constFile: r.file })));
  }
  return { resolved, findings };
}

// --------------------------------------------------------------------------
// selftest — planted near-misses, because a gate that has only ever passed is
// unproven. The bad case is the EXACT text this repo shipped three times.
function selftest() {
  const dir = mkdtempSync(join(tmpdir(), 'ccd-'));
  for (const d of ['proxy-router/internal/attestation', 'proxy-router/internal/config', 'proxy-router/cmd', 'docs']) {
    mkdirSync(join(dir, d), { recursive: true });
  }

  writeFileSync(join(dir, 'proxy-router/internal/attestation/registry.go'), `package attestation

const (
	DefaultRegistryRefreshInterval = 1 * time.Hour
)

func NewArtifactsRegistry(url string, refreshInterval time.Duration, log lib.ILogger) *R {
	if refreshInterval == 0 {
		refreshInterval = DefaultRegistryRefreshInterval
	}
	return &R{}
}
`);
  writeFileSync(join(dir, 'proxy-router/internal/config/config.go'), `package config

type Config struct {
	TEE struct {
		ArtifactRegistryRefreshInterval time.Duration \`env:"ARTIFACT_REGISTRY_REFRESH_INTERVAL"\`
	}
	Proxy struct {
		AgentConfigPath string \`env:"AGENT_CONFIG_PATH"\`
	}
}
`);
  // idiom B fixture — the AGENT_CONFIG_PATH shape: default assigned first,
  // then overridden from a receiver FIELD that a different function (the
  // constructor) populated from its own parameter. Mirrors
  // config/agents_config.go's actual shape, not a simplification of it —
  // idiom A's fixture above cannot exercise this path at all.
  writeFileSync(join(dir, 'proxy-router/internal/config/agents_config.go'), `package config

const (
	ConfigAgentsPathDefault = "agents-config.json"
)

type AgentConfigLoader struct {
	configPath string
}

func NewAgentConfigLoader(configPath string) *AgentConfigLoader {
	return &AgentConfigLoader{
		configPath: configPath,
	}
}

func (e *AgentConfigLoader) Init() error {
	filePath := ConfigAgentsPathDefault
	if e.configPath != "" {
		filePath = e.configPath
	}
	_ = filePath
	return nil
}
`);
  writeFileSync(join(dir, 'proxy-router/cmd/main.go'), `package main

func main() {
	_ = attestation.NewArtifactsRegistry(cfg.TEE.ArtifactRegistryURL, cfg.TEE.ArtifactRegistryRefreshInterval, log)
	_ = config.NewAgentConfigLoader(cfg.Proxy.AgentConfigPath)
}
`);

  const cases = [];
  const write = (s) => writeFileSync(join(dir, 'docs/env.mdx'), s);

  write('| `ARTIFACT_REGISTRY_REFRESH_INTERVAL` | `1h` | How often to refresh |\n');
  cases.push(['correct documented default is ACCEPTED', run(dir).findings.length === 0]);

  write('| `ARTIFACT_REGISTRY_REFRESH_INTERVAL` | `0` | How often to refresh |\n');
  cases.push(['the sentinel documented as the default is REJECTED', run(dir).findings.length > 0]);

  write('| `ARTIFACT_REGISTRY_REFRESH_INTERVAL` | `1h` | refresh; if not set, no automatic refresh occurs |\n');
  cases.push(['right value but a PROSE paraphrase of the sentinel is REJECTED', run(dir).findings.length > 0]);

  write('| `ARTIFACT_REGISTRY_REFRESH_INTERVAL` | `—` | How often to refresh |\n');
  cases.push(['an em-dash "no default" is REJECTED', run(dir).findings.length > 0]);

  write('| `SOME_OTHER_VAR` | `0` | unrelated |\n');
  cases.push(['an unrelated var documented as 0 is ACCEPTED (no coercion for it)', run(dir).findings.length === 0]);

  // idiom B — the AGENT_CONFIG_PATH shape (default-first, receiver-field
  // override, two-hop resolution through the constructor). This is the exact
  // case check-mechanized.mjs cannot resolve (no SetDefaults entry) and idiom
  // A's own regex cannot resolve either (different shape) — the reason
  // AGENT_CONFIG_PATH specifically stayed wrong across earlier fixes.
  write('| `AGENT_CONFIG_PATH` | `agents-config.json` | Local agent registry path |\n');
  cases.push(['[idiom B] correct documented default is ACCEPTED', run(dir).findings.length === 0]);

  write('| `AGENT_CONFIG_PATH` | (unset) | Local agent registry path — no default is applied |\n');
  cases.push(['[idiom B] "no default" claim where a receiver-field fallback exists is REJECTED', run(dir).findings.length > 0]);

  const r = run(dir);
  cases.push(['the idiom-A coercion is resolved at all', r.resolved.some((x) => x.env === 'ARTIFACT_REGISTRY_REFRESH_INTERVAL' && x.value === '1h')]);
  cases.push(['[idiom B] the two-hop field coercion resolves to AGENT_CONFIG_PATH = agents-config.json',
    r.resolved.some((x) => x.env === 'AGENT_CONFIG_PATH' && x.value === 'agents-config.json')]);

  let pass = 0;
  for (const [name, ok] of cases) { if (ok) pass++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); }
  rmSync(dir, { recursive: true, force: true });
  console.log(`\nCONSTRUCTOR-DEFAULTS SELFTEST: ${pass === cases.length ? 'PASS' : 'FAIL'} (${pass}/${cases.length})`);
  return pass === cases.length;
}

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  process.exit(selftest() ? 0 : 1);
} else {
  const { resolved, findings } = run(REPO);
  if (findings.length) {
    console.log(`CONSTRUCTOR-DEFAULTS: FAIL — ${findings.length} doc line(s) state a sentinel as the default:`);
    for (const f of findings) {
      console.log(`  ${f.file}:${f.line}  ${f.env} documented as '${f.stated ?? 'no default'}' but the constructor coerces it to '${f.value}'`);
      console.log(`      ${f.constName} in ${f.constFile}; real default ${f.value}`);
    }
    process.exit(1);
  }
  console.log(`CONSTRUCTOR-DEFAULTS: PASS (${resolved.length} constructor-level fallback(s) resolved; no doc states the sentinel)`);
}
