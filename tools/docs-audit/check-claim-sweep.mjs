#!/usr/bin/env node
// check-claim-sweep — the companion check-partial cannot be.
//
// check-partial finds a surviving claim by matching the WORDS of the line that
// was removed. That works when the restatement reuses the vocabulary. It fails
// when the same claim is stated in different words entirely:
//
//   removed:   "swapping, adding, or removing any model changes the hash and
//               fails verification"
//   survived:  "RTMR3 is replayed … proving the exact set of models loaded"
//
// Those share almost nothing lexically, so check-partial was blind to it — even
// after being tuned against the real failure. Two survivals were found only by
// sweeping semantically: any sentence pairing a PROOF verb with a SUBJECT noun,
// minus those carrying an explicit limit.
//
// This is deliberately shallow and deliberately noisy: it is a reading list, not
// a verdict. Its job is to put every unqualified strong claim in front of a human.
//
//   node tools/docs-audit/check-claim-sweep.mjs
//   node tools/docs-audit/check-claim-sweep.mjs --selftest

import { resolve as resolveFs } from 'node:path';
import { fileURLToPath } from 'node:url';
import { docFiles, read } from './lib.mjs';

// Claim families: a verb that asserts certainty, and the subject it is asserted
// about. Add a family when a new overclaim class is found — never widen an
// existing one until it stops firing.
export const FAMILIES = [
  { id: 'model-identity',
    verb: /\b(prove[sd]?|proving|guarantee[sd]?|ensure[sd]?|tamper-proof)\b/i,
    noun: /\b(exact set|specific AI models|models loaded|declared set of models|substitut|swapping)\b/i },
  { id: 'immutability',
    verb: /\b(cannot be (?:changed|overridden|re-enabled|increased)|immutable|frozen|locked)\b/i,
    noun: /\b(config|configuration|variable|env|logging|storage|image)\b/i },
  { id: 'universal-auth',
    verb: /\b(all|every)\b/i,
    // Two shapes, because a live universal-auth claim escaped the first one for
    // a whole audit. .cursor/rules/morpheus.mdc:43 asserted that all
    // proxy-router HTTP *requests use* Basic Auth — which is neither a route
    // noun nor require/need, so this family never saw it, while the two
    // corrected counterparts happened to say "endpoints require" and sat inside
    // the shape. The claim was false: five routes carry no CheckAuth and no
    // @Security, among them POST /auth/users/request
    // (authapi/controller_http.go:35), the credential bootstrap — called before
    // the caller has credentials at all, so a generator fed the absolute emits
    // an onboarding flow that demands what the caller cannot yet possess.
    //
    // Shape 2 widens the noun to what a caller sends and the verb to plain
    // use/are, and pays for that looseness by demanding an auth object on the
    // line: "all requests use JSON" is a universal, not an auth claim, and must
    // not reach the reading list. Widening is licensed here by the rule above —
    // this family had stopped firing (zero hits corpus-wide) before it moved.
    //
    // Note `requires?`/`needs?` too: `(require|need)\b` could match neither
    // "requires" nor "needs", the boundary failing against the trailing s. So
    // "Every endpoint requires authentication" — the most natural phrasing of
    // the claim this family is named for — was invisible as well.
    noun: /\b(?:endpoints?|routes?)\s+(?:requires?|needs?)\b|\b(?:requests?|calls?|endpoints?|routes?)\s+(?:uses?|requires?|needs?|are)\b[^.]{0,40}?\b(?:auth|credential)/i },
];
// A sentence that already states its own limit is not an overclaim — but the
// limit has to BE a limit. This was a flat list of bare common English words
// under /i:
//
//   /\b(not|never|only partly|cannot prove|does not|no longer|except|unless|
//      detectable|nearly|most|almost|some|by default)\b/i
//
// so ANY line containing "not" anywhere on it was exempt, whatever the "not"
// was doing there. That is silence bought by phrasing rather than by being
// bounded, and it was collected: TEE_CICD_Supply_Chain_Hardening.md:308 stopped
// being flagged when a correction added "not the running container" — the right
// outcome for the wrong reason, because those same three letters anywhere on the
// line would have bought the same silence for a claim that gained no bound at
// all.
//
// MEASURED BEFORE NARROWING, because an exemption hides its own reach. With the
// exemption stripped entirely the sweep returns 16 lines; with it applied, 6. It
// was forgiving 10. Eight of those ten carry a real qualifier. Two do not:
//   .ai-docs/TEE_Attestation_Architecture.md:230 — "by **immutable digest** …,
//     not by mutable tag" contrasts HOW the image is named; it bounds nothing.
//   docs/providers/full/tee-reference.mdx:140 — "**Why digest, not tag?**" is a
//     heading fragment, on a line that then says the digest "guarantees RTMR3 is
//     cryptographically bound to one specific image binary" with no limit at all.
// Both now fire. Nothing that was already firing became exempt.
//
// This is the lesson recurrence.mjs wrote at REFUTES_CS, where /i-matched "is
// not" silently exempted ordinary lower-case English and hid a live repeat: an
// exemption keyed on a word ordinary prose also uses is an exemption on nothing.
// The shapes below are the four the eight genuinely-bounded lines actually use,
// each named with the line that requires it. Add a shape when a bounded line is
// wrongly flagged — never a bare word.
//
// Residual, stated rather than hidden: a bare word anywhere no longer buys
// silence (inserting each of the nine old words at every token position of every
// firing line: 1503/1503 mutants silenced under the old list, 22 under this one,
// all 22 from placing a negator immediately before the word it would have to
// negate — which changes what the sentence says, and is the reading this shape
// is for). The exemption is now positional, not lexical.

// The words a limit has to attach to for the attaching to mean anything.
// NOTE what is deliberately absent: `changed`, `overridden`, `re-enabled`,
// `increased`. Those are the immutability family's OWN verb tokens — its verb
// pattern is `cannot be (changed|overridden|re-enabled|increased)`, which
// already contains a negator. Listing them here made the claim look like its own
// refutation, and the planted case 'Chat context storage is disabled and cannot
// be re-enabled.' went silent: the gate would have stopped seeing the exact
// sentence it was built for. Caught by the pre-existing selftest, which is the
// argument for keeping planted near-misses next to a rule you are editing.
const CLAIM_WORD = String.raw`(?:immutab\w*|frozen|freeze|locked|guarantee\w*|prove\w*|proof|ensure\w*|pins?|pinned|cover\w*|anchor\w*|enforce\w*|tamper-proof|require\w*|prevent\w*)`;
// Markdown emphasis and quoting sit between a negator and what it governs —
// "does **not** pin", "is **not** immutable", "not (immutable)". The gap admits
// punctuation and space only, NEVER letters: a gap that admitted letters would
// let the negator reach across an intervening word and appear to govern
// something it does not.
const GAP = String.raw`[\s*_\x60"'()—]{0,4}`;

export const LIMITED = new RegExp([
  // (1) HEDGED UNIVERSAL — the hedge qualifies the quantifier where it stands,
  //     so the universal is never asserted. Required by api-endpoints.mdx:18 and
  //     api-overview.mdx:24 ("Nearly all endpoints require") and
  //     install-from-source.mdx:83 ("almost every route requires"). Bare
  //     "nearly"/"almost"/"most"/"some" are gone: they were the words, not the
  //     shape.
  String.raw`\b(?:nearly|almost|virtually)\s+(?:all|every)\b`,

  // (2) NEGATED CERTAINTY — the negator governs a CLAIM word rather than sitting
  //     somewhere on the line. Required by tee-reference.mdx:45 ("does **not**
  //     pin"), env-proxy-router.mdx:129 ("is **not** immutable"),
  //     TEE_CICD_Supply_Chain_Hardening.md:178 ("Neither is immutable at
  //     runtime") and tee-backend-verification.mdx:317 ("provides no
  //     guarantee"). The optional copula is what lets "Neither is immutable"
  //     through without letting a negator reach an arbitrary distance.
  String.raw`\b(?:not|never|no|nor|neither|cannot|can't)\b${GAP}(?:(?:is|are|was|were|be|been)${GAP})?${CLAIM_WORD}\b`,

  // (3) CONTRASTIVE SCOPE — "X, not the Y" names the thing the claim excludes,
  //     which is a bound on scope. Required by
  //     TEE_CICD_Supply_Chain_Hardening.md:308 ("it constrains the build, not
  //     the running container"). The determiner is what separates it from the
  //     two lines that now fire: :230's "not by mutable tag" excludes a MANNER
  //     and :140's "not tag?" excludes a WORD, and neither limits what is
  //     claimed.
  String.raw`[,;:]${GAP}(?:not|never)\s+(?:the|a|an|its|their|this|that|those|these|all|every)\b`,

  // (4) EXCEPTION CLAUSE — except/unless has to open a clause. Bare "except" and
  //     "unless" were single words like the rest; "except <determiner>" is not
  //     enough either, because prepending "except" to any line whatsoever
  //     produces it — that mutation was found and this is the form that survives
  //     it.
  String.raw`\b(?:except|unless)\s+(?:where|when|while|if|otherwise|explicitly|specifically)\b`,

  // (5) The two multi-word markers carried over from the original list. Neither
  //     is load-bearing on the corpus today and neither is reachable by adding
  //     one word (measured: zero mutants). "by default" was dropped — it was
  //     reachable, since inserting "default" after any existing "by" completes
  //     it, and it silenced three otherwise-unbounded mutants.
  String.raw`\bonly partly\b`,
  String.raw`\bno longer\b`,
].join('|'), 'i');

export function sweep(files, reader) {
  const out = [];
  for (const f of files) {
    let body; try { body = reader(f); } catch { continue; }
    body.split('\n').forEach((line, i) => {
      if (LIMITED.test(line)) return;
      for (const fam of FAMILIES) {
        if (fam.verb.test(line) && fam.noun.test(line)) {
          out.push({ file: f, line: i + 1, family: fam.id, text: line.trim().slice(0, 120) });
          break;
        }
      }
    });
  }
  return out;
}

function selftest() {
  const cases = [];
  const t = (label, text, wantFam) => {
    const got = sweep(['x.mdx'], () => text);
    const ok = wantFam === null ? got.length === 0 : got.some((h) => h.family === wantFam);
    cases.push([ok, label, wantFam === null ? 'must stay silent' : `must flag ${wantFam}`]);
  };
  // the two real survivals this sweep found and check-partial could not
  t('“proving the exact set of models loaded”',
    'RTMR3 is replayed against the live quote — proving the exact set of models loaded.', 'model-identity');
  t('“down to the specific AI models loaded”',
    'reaches a verified, tamper-proof backend — down to the specific AI models loaded inside the TEE.', 'model-identity');
  // the same sentences once corrected must go quiet
  t('the corrected form is silent',
    'proving the compose reported is the one measured into its quote. This does **not** anchor which models it declares.', null);
  // the other two families
  t('immutability claim', 'Chat context storage is disabled and cannot be re-enabled.', 'immutability');
  t('universal auth claim', 'All endpoints require HTTP Basic Authentication.', 'universal-auth');
  // ordinary prose must not fire
  t('ordinary prose', 'The proxy-router listens on port 8082 and forwards prompts upstream.', null);
  t('a hedged claim', 'This ensures the config is frozen, except where an operator overrides it.', null);
  // "Nearly all endpoints require Basic Authentication" IS hedged — the page
  // that says it is the one that got it right. Flagging it taught the reader to
  // ignore the family.
  t('“nearly all” is already hedged', 'Nearly all endpoints require **Basic Authentication**:', null);
  t('“all” without a hedge still fires', 'All endpoints require **HTTP Basic Auth**:', 'universal-auth');
  // The phrasing that escaped: "requests use", not "endpoints require". Verbatim
  // from .cursor/rules/morpheus.mdc:43 as it stood before the correction — the
  // one case that proves this family can now see what it was blind to.
  t('“requests use” — the shape that escaped',
    'All proxy-router HTTP requests use **HTTP Basic Auth** ([`docs/reference/api-auth.mdx`](../../docs/reference/api-auth.mdx)).',
    'universal-auth');
  // …and the correction that replaced it must go quiet, or the fix reads as a
  // hit and the next reader learns to scroll past this family.
  t('that line, once corrected, is silent',
    'Auth on the proxy-router is **HTTP Basic Auth**, but not on every route — a few are served with no `CheckAuth` and no `@Security`.',
    null);
  // The stem-boundary half of the same blind spot.
  t('third-person singular fires', 'Every endpoint requires HTTP Basic Authentication.', 'universal-auth');
  // The price of shape 2 is over-firing on universals that are not about auth.
  t('a non-auth universal stays silent', 'All requests use JSON request and response bodies.', null);

  // -------------------------------------------------------- corpus fixtures
  // The cases above are hand-written sentences. These are VERBATIM BYTE SLICES
  // of real corpus lines, cut out by script and never retyped — a retyped
  // fixture tests the typist's memory of the line, and every near-miss this
  // exemption turns on is punctuation and markdown emphasis ("does **not** pin",
  // ", not the", "**Why digest, not tag?**") which is exactly what memory drops.
  // Each comment carries the byte range and the length of the line it came from,
  // so the cut is re-runnable; each slice was checked at extraction time to
  // yield the SAME verdict as the whole line, to reproduce the family it
  // matches, and to still contain the word that used to silence it.
  const c = (site, text, wantFam) => t(`corpus ${site}`, text, wantFam);

  // .ai-docs/TEE_CICD_Supply_Chain_Hardening.md:178 — verbatim bytes [114,168) of a 449-byte line
  c('.ai-docs/TEE_CICD_Supply_Chain_Hardening.md:178', "Neither is immutable at runtime: both are Docker `ENV`",
    null);
  // .ai-docs/TEE_CICD_Supply_Chain_Hardening.md:308 — verbatim bytes [40,591) of a 690-byte line
  c('.ai-docs/TEE_CICD_Supply_Chain_Hardening.md:308', "immutable ENV config into the TEE image. Blockchain values are parameterized via `ARG` with mainnet defaults; overridden via `--build-arg` for testnet builds. **Logging values (`LOG_LEVEL_APP=info`, `LOG_LEVEL_TCP=warn`, `LOG_LEVEL_ETH_RPC=warn`, `LOG_LEVEL_STORAGE=warn`, plus `LOG_COLOR=false`, `LOG_JSON=true`, `LOG_IS_PROD=true`) are baked here and surfaced into the cosign-signed manifest's `baked_env` block \u2014 the privacy gate refuses to publish a manifest whose `Dockerfile.tee` bakes `debug`-level app logging; it constrains the build, not the",
    null);
  // docs/consumers/install-from-source.mdx:83 — verbatim bytes [165,192) of a 237-byte line
  c('docs/consumers/install-from-source.mdx:83', "almost every route requires",
    null);
  // docs/providers/full/tee-backend-verification.mdx:317 — verbatim bytes [174,220) of a 363-byte line
  c('docs/providers/full/tee-backend-verification.mdx:317', "exact set of models, but provides no guarantee",
    null);
  // docs/providers/full/tee-reference.mdx:45 — verbatim bytes [215,384) of a 1372-byte line
  c('docs/providers/full/tee-reference.mdx:45', "image by immutable digest. So editing the compose, including adding an `environment:` entry, changes the measurement and the consumer's replay fails. It does **not** pin",
    null);
  // docs/reference/api-endpoints.mdx:18 — verbatim bytes [0,28) of a 54-byte line
  c('docs/reference/api-endpoints.mdx:18', "Nearly all endpoints require",
    null);
  // docs/reference/env-proxy-router.mdx:129 — verbatim bytes [191,221) of a 1322-byte line
  c('docs/reference/env-proxy-router.mdx:129', "**not** immutable at the image",
    null);
  // .ai-docs/TEE_Attestation_Architecture.md:230 — verbatim bytes [68,122) of a 150-byte line
  c('.ai-docs/TEE_Attestation_Architecture.md:230', "**immutable digest** (`image: ...@sha256:DIGEST`), not",
    "immutability");
  // docs/providers/full/tee-reference.mdx:140 — verbatim bytes [14,202) of a 210-byte line
  c('docs/providers/full/tee-reference.mdx:140', "not tag?** Tags are mutable. The digest (`@sha256:...`) is an immutable content hash. Using the digest in the compose file guarantees RTMR3 is cryptographically bound to one specific image",
    "immutability");

  // ------------------------------------------------------- mutation guard
  // The defect being fixed was that ONE word bought silence. Prove it no longer
  // does, rather than asserting it: take the lines that now fire, append each
  // bare word the old exemption honoured, and require every mutant to keep
  // firing. Under the old list every one of these went quiet, which is what
  // "measure before you narrow" bought — the old rule's real behaviour was
  // invisible until the exemption was removed and the output changed.
  const OLD_BARE_WORDS = ['not', 'never', 'nearly', 'most', 'almost', 'some',
                          'except', 'unless', 'detectable'];
  const OLD_LIMITED = /\b(not|never|only partly|cannot prove|does not|no longer|except|unless|detectable|nearly|most|almost|some|by default)\b/i;
  const FIRING = [
    "**immutable digest** (`image: ...@sha256:DIGEST`), not",
    "not tag?** Tags are mutable. The digest (`@sha256:...`) is an immutable content hash. Using the digest in the compose file guarantees RTMR3 is cryptographically bound to one specific image",
  ];
  let mutTotal = 0, mutSilenced = 0, oldSilenced = 0;
  for (const base of FIRING) {
    for (const w of OLD_BARE_WORDS) {
      const mutant = `${base} ${w}`;
      mutTotal++;
      if (OLD_LIMITED.test(mutant)) oldSilenced++;
      if (sweep(['x.mdx'], () => mutant).length === 0) mutSilenced++;
    }
  }
  cases.push([mutSilenced === 0,
    `adding one bare word does not silence (${mutTotal} mutants)`,
    'every mutant must still fire']);
  // A narrowing that changes no answer is decoration. Assert the OLD list really
  // did swallow all of these, so this guard is known to be load-bearing rather
  // than merely green — the same contract recurrence.mjs holds its
  // explicit-only guard to.
  cases.push([oldSilenced === mutTotal,
    `the old bare-word list silenced all ${mutTotal} of them`,
    'narrowing is load-bearing']);

  let bad = 0;
  console.log('--- claim-sweep selftest ---');
  for (const [ok, label, want] of cases) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(46)} ${want}`); }
  console.log(bad ? `CLAIM-SWEEP SELFTEST: FAIL (${bad}/${cases.length})`
                  : `CLAIM-SWEEP SELFTEST: PASS (${cases.length}/${cases.length} — fires on the real misses, silent once corrected)`);
  return bad === 0;
}

const IS_MAIN = process.argv[1] && resolveFs(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1);
  const hits = sweep(docFiles(), read);
  const byFam = {};
  for (const h of hits) (byFam[h.family] ||= []).push(h);
  for (const [fam, list] of Object.entries(byFam)) {
    console.log(`\n  [${fam}] ${list.length} unqualified claim(s)`);
    for (const h of list) console.log(`      ${h.file}:${h.line}  ${h.text}`);
  }
  console.log(hits.length ? `\nCLAIM-SWEEP: ${hits.length} claim(s) stated without a limit — a reading list, not a verdict`
                          : '\nCLAIM-SWEEP: PASS (no unqualified claim in any tracked family)');
}
