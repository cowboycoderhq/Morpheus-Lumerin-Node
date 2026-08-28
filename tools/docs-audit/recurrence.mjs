#!/usr/bin/env node
// A defect is a CLAIM, not a line. Once a claim is confirmed wrong, every other
// place the corpus repeats it is wrong too — even if no ledger row flagged it.
//
// Reviewer B found this the hard way: the 10000-MOR "subnet tier" was corrected
// in two files while eight others still asserted it, leaving the docs
// contradicting themselves. This sweeps for the siblings.
import { readFileSync } from 'node:fs';
import { docFiles, read } from './lib.mjs';
import { PARAMS, retiredWeiFor } from './onchain-params.mjs';

// The retired bid floors are read from onchain-params.mjs — the SAME record
// verify-fixes.mjs takes its allow-list from — so the deny-list here and the
// allow-list there cannot drift apart. Two copies of one lookup drifting apart
// is the exact failure this correction came out of.
const RETIRED_FLOOR = retiredWeiFor('bidMinPricePerSecond');
// Match the CLAIM, not a phrasing: one of the retired numbers presented AS the
// bound. The bare number is not enough on its own — docs/providers/full/
// pricing.mdx:72 posts 1e13 as a sample pricePerSecond in a curl body, which is
// a perfectly valid bid well inside the real bounds and not a claim about the
// floor at all. So the number has to sit near floor vocabulary or near the
// parameter's own name, which is what makes it an assertion about the bound.
const FLOOR_CTX = '(?:floor|minimum|min\\s*bid|at least|lowest|>=|≥'
  + '|bidMinPricePerSecond|marketplaceMinBidPricePerSecond|MinMaxBidPricePerSecond)';
const RETIRED_ALT = '(?:' + RETIRED_FLOOR.join('|') + ')';
const BID_FLOOR_RE = new RegExp(
  FLOOR_CTX + '[^\\n]{0,120}\\b' + RETIRED_ALT + '\\b'
  + '|\\b' + RETIRED_ALT + '\\b[^\\n]{0,120}' + FLOOR_CTX, 'i');

// The retired mainnet provider-stake figure, same record verify-fixes.mjs
// would draw an allow-list from if this parameter were wired into it (it is
// not yet — see onchain-params.mjs — recurrence.mjs is the only reader so far).
const RETIRED_PROVIDER_STAKE = retiredWeiFor('providerMinStake');
// The bare retired number is not just insufficient here, the way 1e13 needed
// floor vocabulary above — it is actively misleading, because 0.1 /
// 100000000000000000 IS modelMinStake's own current, correct, UNCHANGED value
// on both networks (93c85651: "modelMinStake is unchanged - the chain agrees
// with the file at 0.1"). A same-line match on "provider" and "stake" merely
// sitting near each other is not enough either:
// smart-contracts/docs/inference-contract-enhancements-rfp.md:383 reads
// "forces every provider to stake 0.1 MOR per model" — a genuine
// design-doc sentence about the MODEL bond that happens to phrase "provider"
// as its grammatical subject, eleven characters from "stake" and thirty from
// the number. What every real occurrence of the retired claim shares, and
// that sentence and every model-stake line in the corpus lack, is a same-line
// pairing with "mainnet": the claim was only ever wrong on mainnet — Sepolia
// was already 0.2 in every historical phrasing — so it was always written as
// a mainnet-qualified figure. The check below requires the retired number to
// sit within 130 characters of "provider" AND within 130 characters of
// "mainnet" (not necessarily the same occurrence of either word — a table row
// can put the label, the network qualifier and the figure in three separate
// cells). 130 has real margin: across the twelve historical phrasings of this
// claim the widest true gap is 97 characters (the wei-units table row,
// register-onchain.mdx, pre-93c85651), and on the corrected
// docs/providers/full/register-onchain.mdx:92 — which puts "provider" and
// "mainnet" both on the line, just nowhere near its model-stake `0.1` additions
// — the nearest "provider" sits over 190 characters from every `0.1` on that
// line, outside the window on both counts.
const PROVIDER_STAKE_NUM = '(?:0\\.1\\b|' + RETIRED_PROVIDER_STAKE.join('|') + ')';
const NEAR_PROVIDER_WORD = new RegExp(
  'provider[^\\n]{0,130}' + PROVIDER_STAKE_NUM + '|' + PROVIDER_STAKE_NUM + '[^\\n]{0,130}provider', 'i');
const NEAR_MAINNET_WORD = new RegExp(
  'mainnet[^\\n]{0,130}' + PROVIDER_STAKE_NUM + '|' + PROVIDER_STAKE_NUM + '[^\\n]{0,130}mainnet', 'i');
const PROVIDER_STAKE_RE = { test: (line) => NEAR_PROVIDER_WORD.test(line) && NEAR_MAINNET_WORD.test(line) };

// ---------------------------------------------------------------------------
// THE REFUND-AT-CLOSE CLAIM — and why this table had no row for it.
//
// "A session consumed within a single UTC day returns nothing at close" is
// wrong, and it survived being fixed once. 50ed82f8 corrected nine files; with
// no CLAIMS row to answer to, that fix REWORDED the sentence in the files it
// happened to open instead of retiring the claim, and six line-sites in five
// documents plus AGENTS.md:65 and .cursor/rules/morpheus.mdc:25 then passed a
// full audit pass unremarked. A claim with no row here is a claim that gets
// re-litigated per file.
//
// What returns scales with what went UNUSED, not with whether the session sat
// inside one UTC day. Re-derived from source rather than carried over on
// report: getSessionEnd sizes the scheduled duration D from the stake
// (duration_ = stakeToStipend(amount_, openedAt_) / pricePerSecond_,
// SessionRouter.sol:169), and _rewardUserAfterClose sizes the lock from the
// seconds ACTUALLY CONSUMED (userDuration_, :306-308). Both directions convert
// through getComputeBalance/totalMORSupply, and both of those quantise their
// timestamp to startOfTheDay (:494, :505) — so for a session inside one UTC day
// the open-side and close-side conversion factors are the SAME number and the
// transfer at :314 is (1 - consumed/D) x stake exactly, up to integer floors.
// The min() at :308 is inert for consumed < D; it is not what makes the refund
// small. An integer replay of that arithmetic at two stake sizes: closing at
// 10% of D returns 90.008% / 90.002%, at 50% returns 50.008% / 50.002%, at 100%
// returns 0.008% / 0.002%. The residual is the floor in duration_ and shrinks
// as 1/D, which is what the probe read as 0.06% at full consumption.
//
// So "~nothing" is TRUE of full consumption — which is what natural expiry
// inside one UTC day is — and FALSE of an early close. The rule must split on
// consumption and on nothing else. At least four documents state the natural
// expiry case correctly; a rule that flagged those would be silenced by the
// next person who ran it, which is worse than having no rule.
//
// ANCHORED ON THE CLAIM, NOT ON A WORD. The universal-auth family could not see
// the claim it was named for because its verb pattern ended (require|need)\b,
// which matches neither "requires" nor "needs" (724f66a8). So this one is
// checked against the plural, the third person, the past, the gerund, and the
// hedged forms — usually / commonly / typically / often / in practice / can be
// — and against the COPULAR phrasing that carries no return verb at all ("the
// remainder is usually nothing"), which is exactly how what-is-morpheus.mdx:49
// and the pre-fix glossary Early-close row were written. Enumerating verbs is
// what fails; the three shapes below are assertion, order-reversed assertion,
// and no-verb assertion.
//
// This is a NEW row, not a widened one, and the unit scope it opts into is
// opt-in — so the file's standing rule (never widen a family until it stops
// firing) is not engaged: nothing that is still firing has been loosened.
const REFUND_NOTHING = '(?:\\*{0,2}(?:nothing|zero)\\*{0,2}|~\\s*(?:nothing|zero|0)\\b)';
// "and it is not zero" (docs/ai/where-is-my-mor.mdx:29) is the CORRECTION, and
// it necessarily repeats the claim's vocabulary. A negation immediately before
// the nothing-word is not an assertion of it. Deliberately tight: a line-wide
// negation test would exempt api-endpoints.mdx:186, whose sentence opens with
// not "unused stake" thirty words before the claim it was making.
const REFUND_NOT = '(?<!\\bnot\\s)(?<!\\bnot\\s\\*\\*)(?<!n\'t\\s)';
const REFUND_HEDGE = '(?:usually|commonly|typically|often|generally|normally|effectively'
  + '|essentially|basically|practically|almost\\s+always|in\\s+practice|approximately'
  + '|roughly|about|near(?:ly)?|can\\s+be|may\\s+be|will\\s+be)';
const REFUND_ASSERT = new RegExp(
  // 1. a return/refund verb, then the nothing-word
    '(?:returns?|returned|returning|refunds?|refunded|comes?\\s+back|gets?\\s+back'
  + '|get\\s+back|back)[^\\n]{0,70}?' + REFUND_NOT + REFUND_NOTHING
  // 2. the nothing-word first, then the return/close it is predicated of
  + '|' + REFUND_NOT + REFUND_NOTHING
  + '[^\\n]{0,45}?(?:returns?|returned|returning|comes?\\s+back|at\\s+close|in\\s+the\\s+close)'
  // 3. the copular form, which has no return verb to anchor on
  + '|(?:remainder|refund|return|amount|balance|stake|slice|it|which)'
  + '[^\\n]{0,40}?\\b(?:is|are|was|were|be)\\b\\s*(?:' + REFUND_HEDGE + '\\s*)*'
  + REFUND_NOT + REFUND_NOTHING, 'i');
// The wrong scoping predicate: a TEMPORAL qualifier standing in for a
// consumption one. This is what makes the sentence a claim about same-day
// sessions rather than about fully consumed ones.
const REFUND_SAMEDAY = new RegExp(
    '(?:with?in|inside|during)\\s+(?:a\\s+)?(?:one|a\\s+single|the\\s+same|1)\\s+(?:UTC\\s+)?day'
  + '|same-day\\s+session|(?:one|a\\s+single)\\s+UTC\\s+day|same\\s+UTC\\s+day'
  + '|closed\\s+the\\s+same\\s+day', 'i');
// The RIGHT scoping predicate. Its presence means the sentence is the true
// statement, not the retired one, so the rule stands down. Kept to phrasings
// that actually mean full consumption: "late close" is NOT here, because a
// genuinely late close is a different claim (the conditional day-lock) and
// including it made api-endpoints.mdx:186 invisible.
const REFUND_FULLY = new RegExp(
    'full(?:y|)\\s*(?:-|\\s)?consum|consumed\\s+in\\s+full'
  + '|(?:run|ran|left\\s+to\\s+run|runs)\\s+to\\s+`?endsAt|natural(?:ly)?\\s+expir'
  + '|to\\s+term|full\\s+scheduled\\s+duration|entire\\s+scheduled\\s+duration'
  + '|whole\\s+scheduled\\s+duration|closedAt\\s*>=\\s*endsAt', 'i');

// Each entry: a confirmed-wrong claim, and a pattern matching how it is phrased.
// Two earlier passes narrowed this claim and both narrowings were still wrong.
// "cannot be overridden" became "cannot be overridden for a SecretVM deployment,
// because the compose is measured into RTMR3" — and the compose IS measured, but
// it declares `env_file: - usr/.env` (proxy-router/docker-compose.tee.yml:15-16)
// and the referenced file's CONTENTS are not part of the compose bytes. So an
// override placed there takes effect (Docker precedence puts env_file above the
// image's ENV) and leaves RTMR3 byte-identical, without touching the compose at
// all — the one door the retired wording called the only way in. Nothing
// downstream re-forces the value: config/loader.go:54-61 reads every env:-tagged
// field with no allowlist, and Dockerfile.tee:45 is a bare ENTRYPOINT.
//
// TWO shapes, because this claim survived two passes by being REPHRASED, never
// by being repeated: the flat assertion, and the narrowed "what holds it is the
// deployment's measurement rather than the image" assertion. A rule carrying
// only the first would have watched the second walk past twice.
const TEE_FROZEN_FLAT = '\\b(?:cannot be (?:re-enabled|overridden|changed)'
  + '|(?:not|un-?)\\s*overridable|frozen in the image|configurable at runtime)\\b';
const TEE_FROZEN_DEPLOYMENT = '(?:is the \\*\\*deployment\\*\\*, not the image'
  + '|rather than by the image on its own|held (?:there )?by the same RTMR3)';
// `foreclose` is deliberately NOT here. It is the TOPIC word, not the claim: a
// line saying what the measurement DOES foreclose is a correction, and adding
// the word makes this rule flag its own fix. The selftest mutation below holds
// that open, because "obviously related word" is exactly how a family widens.
const TEE_FROZEN_RE = new RegExp(TEE_FROZEN_FLAT + '|' + TEE_FROZEN_DEPLOYMENT);

const CLAIMS = [
  { id: 'subnet-tier-10000', why: 'no on-chain subnet tier exists (ProviderRegistry.sol:40-44)',
    re: /10[,.]?000\s*(MOR|\bLABEL_[0-9a-f]+)|subnet\s+provider/i },
  // Was pinned to the words minimum/floor/at least sitting NEXT TO the number, so
  // the bare table row "| Consumer session open | `5` <token> |" in
  // networks-and-tokens.mdx went unflagged while the gate reported 0. Same class
  // as the `is NOT` bug: a rule matching a PHRASING instead of the CLAIM.
  { id: 'session-floor-5mor', why: 'no MOR session floor; MIN_SESSION_DURATION = 5 minutes is the only one',
    re: /(?:minimum|floor|at least)[^\n]{0,12}\b5\b[^\n]{0,12}(?:MOR|LABEL_[0-9a-f]+)|\b5\b[^\n]{0,12}(?:MOR|LABEL_[0-9a-f]+)[^\n]{0,30}(?:minimum|floor)|session[\s-]*open[^\n]{0,40}\b5\b[^\n]{0,12}(?:MOR|LABEL_[0-9a-f]+)/i },
  // INVERTED 2026-08-27 (c1fc046e). This rule used to fire on 1e10, under the
  // rationale "deployed floor is 1e13 mainnet / 5e15 sepolia; 1e10 reverts".
  // All three parts were false. A two-network event scan found exactly one event
  // ever setting the mainnet parameter — initialization, writing 1e10 — and 40
  // archive samples across the contract's 10.9M-block life all return
  // 10000000000. So 1e10 IS the mainnet floor, a bid at it does not revert, and
  // the numbers this rule used to DEFEND are the ones that can now creep back:
  // out of config_base_mainnet.json:7, which still says 1e13 and which no deploy
  // path reads, or out of someone restoring a pre-c1fc046e document. The
  // recurrence risk reversed, so the rule points the other way.
  //
  // It passed before only because REFUTES_CI exempts any line containing
  // "mainnet", which all nine corrected lines contain — green for the wrong
  // reason, and one tightening of that exemption away from flagging every
  // corrected line as a recurrence.
  //
  // guard:'explicit-only' for that same reason, and only here. The broad guard
  // exempts "mainnet", and "the Base mainnet floor is 1e13" is PRECISELY the
  // recurrence this rule hunts — the blanket exemption would swallow it. Opting
  // out is safe for this rule because its pattern does not match the corrected
  // value (1e10) at all, so it cannot re-flag its own corrections, which is the
  // only thing the broad guard was there to prevent.
  { id: 'bid-floor-1e13-5e15', guard: 'explicit-only',
    why: 'deployed mainnet floor is ' + PARAMS.bidMinPricePerSecond.networks['base-mainnet'].value
       + ' (one init event + 40 archive samples, re-read 2026-08-27); 1e13 was never on chain '
       + 'at any block, and 5e15 is a Sepolia deploy input the live contract does not return',
    re: BID_FLOOR_RE },
  { id: 'go-1.22', why: 'proxy-router/go.mod requires go 1.25.0',
    re: /\bgo\b[^\n]{0,12}1\.22/i },
  { id: 'reward-period-1day', why: 'PROVIDER_REWARD_LIMITER_PERIOD = 365 days',
    re: /REWARD_LIMITER_PERIOD[^\n]{0,40}1\s*day|limiter[^\n]{0,30}\b1\s*day/i },
  { id: 'mnemonic-tier1-only', why: 'the import flow offers 10 derived accounts',
    re: /(tier-?1|top-level)[^\n]{0,80}(mnemonic|address)|mnemonic[^\n]{0,80}(does\s*\*{0,2}not\*{0,2}\s*support|only)[^\n]{0,40}derived/i },
  // INVERTED 2026-08-27, the same defect class as bid-floor-1e13-5e15 and
  // deliberately left for its own proof obligation when that rule was fixed —
  // c6457455's own commit message names this exact rule and defers it. This
  // rule used to fire on 0.2, under the rationale "mainnet providerMinStake is
  // 0.1 MOR; 0.2 is Sepolia". Backwards: 93c85651 read
  // getProviderMinimumStake() directly off the live Base mainnet Diamond and
  // got 0.2, and cef943ef reconciled config_base_mainnet.json:4 to match
  // (both 2026-08-26). Every corrected documentation line asserts 0.2 for
  // both networks and is correct; stripped of exemptions the old rule flagged
  // 7 of them — every line phrased as "provider stake ... 0.2" or "0.2
  // <MOR> ... stake" — and passed only because REFUTES_CI exempts any line
  // containing "mainnet", the identical failure mode the bid-floor rule had.
  //
  // What can creep back is the 0.1 still sitting in
  // config_arbitrum_mainnet.json:4 (deliberately untouched by cef943ef — no
  // Arbitrum Diamond was read, so it is a recorded finding, not a confirmed
  // fix) or a restored pre-93c85651 document — never the corrected 0.2.
  //
  // guard:'explicit-only' for the same reason as bid-floor: the broad guard's
  // "mainnet" alternative would exempt "the Base mainnet provider stake is
  // 0.1", precisely the recurrence this rule hunts. Safe to opt out because
  // PROVIDER_STAKE_RE cannot match the corrected value — it requires the
  // RETIRED number, and 0.2 is not that number — so it cannot re-flag its own
  // corrections, which is the only thing the broad guard was there to
  // prevent. Measured against 5 planted recurrences (a table row, two prose
  // sentences, and a parameter assignment among them): 4 of 5 are silently
  // swallowed under the broad guard (their line contains a word-boundary
  // "mainnet"); the 5th — the parameter assignment, whose merged
  // `providerMinStake_mainnet` identifier has no word boundary before
  // "mainnet" — still fires even under the broad guard, which is not a reason
  // to trust it: with the opt-out, all 5 of 5 fire, and unlike the broad
  // guard that result does not depend on how a future recurrence happens to
  // be typeset.
  { id: 'provider-stake-0.1-mainnet', guard: 'explicit-only',
    why: 'mainnet providerMinStake is ' + PARAMS.providerMinStake.networks['base-mainnet'].value
       + ' wei = 0.2 MOR (getProviderMinimumStake() on the live Base mainnet '
       + 'Diamond, 93c85651/cef943ef, 2026-08-26); 0.1 was only ever the '
       + 'deploy-time initial value and is not the figure the chain has '
       + 'returned since',
    re: PROVIDER_STAKE_RE },
  { id: 'starting-services-screen', why: 'replaced by SetupWizard "Setting up your AI assistant"',
    re: /Starting services/i },
  { id: 'tls-immediate-hard-fail', why: 'SPKI fallback re-attests instead of failing (backend_verifier.go:367-376, commit 878ee3b4)',
    re: /TLS[- ]?fingerprint[^\n]{0,40}(immediate|hard fail)|fingerprint[^\n]{0,30}immediate\s+(hard\s+)?fail/i },
  { id: 'withdraw-manual-only', why: 'stake_claimer.go auto-sweeps every 10 minutes',
    re: /no\s+(HTTP\s+)?route[^\n]{0,40}proxy-router|must be claimed via `?withdrawUserStakes/i },  // scope:'unit' — the claim is a SENTENCE, and a sentence here is not a line.
  // Two in-corpus facts forced it, one in each direction:
  //   docs/concepts/tokens-and-fees.mdx:84-85 wrapped the live claim across a
  //     newline ("commonly nothing for a session that" / "ran inside one UTC
  //     day"), so a line-scoped rule reads neither half as a claim and misses a
  //     defect that was sitting in the tree.
  //   docs/ai/myths.mdx:59 is CORRECT, and the qualifier that makes it correct
  //     is on line 58 — the accordion title "MYTH: Natural expiration / late
  //     close ...". Line-scoped, this rule fires on a true sentence, which is
  //     the failure that gets a gate switched off.
  // Measured both ways in the selftest below: evaluated line-locally the first
  // case flips to silent and the second flips to firing.
  // The unit is a run of non-blank lines, cut wherever a new block-level
  // element starts. Cutting at table rows and list items matters: glossary.mdx
  // rows 24-33 are one unbroken table, so a whole-paragraph scope would let row
  // 29's "Natural expiration" exempt a recurrence planted in any other row.
  // Known cost, accepted and stated rather than discovered later: a unit that
  // holds BOTH a recurrence and a correct natural-expiry sentence is exempted
  // whole — docs/concepts/what-is-morpheus.mdx:44-54 is one such unit, a
  // three-Card group with no blank line in it.
  //
  // guard:'explicit-only' for the reason bid-floor and provider-stake give, plus
  // one this scope adds. The stated condition for opting out of the broad guard
  // is that the pattern cannot match its own corrections; that holds here by
  // construction, since every correction carries a REFUND_FULLY phrase and the
  // rule requires that phrase to be ABSENT. The addition: at unit scope the
  // broad guard is actively unsafe, because one "instead of", "rather than",
  // "automatically every" or "mainnet" anywhere in a multi-line unit would
  // exempt every line in it, and those words are ordinary prose in exactly the
  // paragraphs that describe close-and-sweep behaviour.
  { id: 'refund-nothing-same-day', scope: 'unit', guard: 'explicit-only',
    why: 'what returns at close scales with the UNUSED fraction — SessionRouter.sol:306-308 '
       + 'sizes the lock from seconds consumed and :314 transfers the rest, so an early close '
       + 'at 10% of the scheduled duration returns ~90% of stake. "~nothing" is true of FULL '
       + 'consumption (natural expiry), never of a same-UTC-day session as such',
    re: REFUND_ASSERT,
    context: (u) => REFUND_SAMEDAY.test(u) && !REFUND_FULLY.test(u) },
  // guard:'explicit-only' is not a preference here, it is required: the broad
  // REFUTES_CI list contains "rather than", and two of the sites this rule
  // exists for say "…rather than by the image on its own". Under the broad
  // guard those two lines exempt themselves — the claim's own phrasing reading
  // as its own correction. The selftest mutation below proves it.
  { id: 'tee-config-frozen-by-attestation', guard: 'explicit-only',
    why: 'the attestation measures the COMPOSE, not the container environment — the compose '
       + 'declares `env_file: - usr/.env` (docker-compose.tee.yml:15-16) whose contents are not '
       + 'in the measured bytes, and Docker precedence puts env_file above the image ENV, so any '
       + 'baked value the compose does not also name in `environment:` can be changed with RTMR3 '
       + 'unmoved. `runtime_secrets_only` (build.yml:944-950) is a manifest declaration, not an '
       + 'enforced boundary; loader.go:54-61 applies every env:-tagged field with no allowlist',
    re: TEE_FROZEN_RE },
];

// A line that REFUTES the claim necessarily repeats its vocabulary. Without this
// guard the sweep re-flags its own corrections — the same over-reach that made
// the first mechanized checker produce 164 artefacts.
const REFUTES_CI = /\b(no on-chain tier|does not exist|no longer|replaced|which replaced|not wired|no MOR-denominated|no subnet tier|auto-?sweep|automatically every|informal term|instead of|rather than|now requires|owner-settable|derived accounts?|no such tier|Base Sepolia|on Sepolia|Sepolia\)|mainnet)\b/i;

// "is NOT" is an emphasis marker we write deliberately in corrective text. Under
// the /i flag it also matched ordinary lower-case English, so ANY flagged line
// containing "is not" was silently exempted. That hid a real repeat at
// docs/get-started/quickstart-consumer.mdx:46 ("onboarding is not blocked")
// while the guard selftest still reported 4/4 — the gate was proven by passing,
// not by firing. Matched case-sensitively now.
const REFUTES_CS = /\bis NOT\b/;
const REFUTES = { test: (line) => REFUTES_CI.test(line) || REFUTES_CS.test(line) };
// Most claims use the broad guard. A claim may set guard:'explicit-only' to use
// ONLY the deliberate capitalised marker — see bid-floor-1e13-5e15 and
// provider-stake-0.1-mainnet, where the broad guard's "mainnet" alternative
// would exempt the very line each one hunts.
const guardFor = (c) => (c.guard === 'explicit-only' ? REFUTES_CS : REFUTES);


// A claim is asserted on a LINE; what the claim MEANS can depend on its
// neighbours. A unit is a run of non-blank lines, cut wherever a new
// block-level element begins, so wrapped prose joins but table rows and list
// items stay apart. Only claims that ask for it (scope:'unit') see this.
const NEW_UNIT = /^\s*(?:\||[-*+]\s|\d+[.)]\s|#{1,6}\s|```|~~~)/;
function unitMap(lines) {
  const acc = new Array(lines.length).fill(null);
  let cur = null;
  lines.forEach((l, i) => {
    if (!l.trim()) { cur = null; return; }
    if (!cur || NEW_UNIT.test(l)) cur = [];
    cur.push(l);
    acc[i] = cur;            // same array object; joined AFTER it is complete
  });
  return acc.map((u) => (u ? u.join(' ') : null));
}

// ONE decision, called by the corpus sweep AND by the guard selftest below.
// Two copies would let the selftest certify a detector the sweep does not run —
// the same shape as the `read` / `git` duplications lib.mjs collapsed.
function hits(c, line, unit) {
  if (!c.re.test(line)) return false;                 // WHERE it is asserted
  const subject = c.scope === 'unit' ? unit : line;   // WHAT decides its meaning
  if (c.context && !c.context(subject)) return false;
  return !guardFor(c).test(subject);
}

const out = {};
for (const f of docFiles()) {
  const lines = read(f).split('\n');
  const units = unitMap(lines);
  lines.forEach((l, i) => {
    for (const c of CLAIMS) {
      if (hits(c, l, units[i] || l)) (out[c.id] ||= []).push(`${f}:${i + 1}`);
    }
  });
}

let total = 0;
for (const c of CLAIMS) {
  const hits = out[c.id] || [];
  total += hits.length;
  console.log(`\n### ${c.id}  — ${hits.length} occurrence(s)`);
  console.log(`    ${c.why}`);
  hits.forEach((h) => console.log(`      ${h}`));
}
console.log(`\ntotal occurrences of confirmed-wrong claims still in the corpus: ${total}`);
process.exitCode = total ? 1 : 0;   // a gate that reports and exits 0 has cleared nothing

// The runner shows ONE line per gate. Left to "last non-empty line" that line
// was the guard selftest below — a sentence asserting the detector fires on
// repeats, printed in the corpus verdict's slot at the moment a repeat was
// found and reported. Mark the verdict so the runner selects it deliberately
// instead of inferring it from print order.
console.log(`GATE-VERDICT: RECURRENCE: ${total
  ? `${total} occurrence(s) of confirmed-wrong claims still in the corpus`
  : 'PASS (no corrected claim has crept back)'}`);

// Prove the guard discriminates rather than blanket-suppressing.
const SELF_BASE_SESSIONROW = '| Consumer session open | `5` MOR |';
const SELF_BASE_FLOORPROSE = '- Consumer session-open stake floor: **5 '
  + (SELF_BASE_SESSIONROW.match(/`5`\s*(\S+)/) || [, ''])[1] + '**.';
const SELF_BASE_REPEAT = 'shows a **Starting services** screen: the app downloads';
const SELF_BASE_CORRECTION =
  '| **Subnet provider** | There is NOT any such tier — one providerMinimumStake applies to every provider. |';
// The two scope fixtures. WRAP_* is the live claim as it was actually typeset
// in docs/concepts/tokens-and-fees.mdx:84-85 — one sentence, two lines, the
// assertion on the first and the qualifier on the second. ACCORDION_* is
// docs/ai/myths.mdx:58-59, where the sentence is correct only because of the
// title above it.
const WRAP_LINE = 'back: the remainder immediately on close — commonly nothing for a session that';
const WRAP_UNIT = WRAP_LINE + ' ran inside one UTC day — and the final day\'s locked slice after `releaseAt`';
const ACCORDION_LINE = '    **No (after the day-lock fix).** The remainder returns in the close txn — often nothing, for a same-day session.';
const ACCORDION_UNIT = '<Accordion title="MYTH: Natural expiration / late close returns all my tokens immediately with no hold.">'
  + ACCORDION_LINE;
// --- the TEE frozen-config rule, both directions -------------------------
// Every fixture below is bytes LIFTED from the corpus — the pre-correction
// line for the fire cases, the post-correction line for the silent ones. A
// retyped fixture drifts from the defect it claims to cover, and then the
// selftest certifies a detector nobody ran against the real thing.
const TEE_RATHER_THAN_OVERVIEW =
  "and held there by the same RTMR3 compose measurement rather than by the image on its own.";
const TEE_RATHER_THAN_REFERENCE =
  "another Docker `ENV` default, held by the same RTMR3 compose measurement rather than by the image on its own.";
const TEE_CORRECTED_FORECLOSE =
  "What the measurement *does* foreclose is editing the compose itself: an `environment:` entry re-enabling storage";
const SELF = [
  ['| **Subnet provider** | A provider that has staked `10000` MOR and gets elevated standing. |', true,  'an uncorrected repeat must still fire'],
  ['| **Subnet provider** | Informal term. No on-chain tier exists — one providerMinimumStake for all. |', false, 'a corrected line must not fire'],
  ['shows a **Starting services** screen: the app downloads', true,  'uncorrected screen name must fire'],
  ['a setup wizard titled **Setting up your AI assistant** (which replaced the older "Starting services" list)', false, 'a correction referencing the old name must not fire'],
  // near-miss: an uncorrected repeat that merely contains ordinary English
  // "is not" must still fire. This is the mutation the original four missed.
  [SELF_BASE_REPEAT + ', and onboarding is not blocked if IPFS fails', true,
   'ordinary lower-case "is not" must not exempt a repeat'],
  // near-miss: the claim stated as a bare table cell, with no keyword nearby
  [SELF_BASE_SESSIONROW, true, 'a bare table row stating the claim must fire'],
  // Third phrasing of the SAME claim to slip this rule: prose, hyphenated,
  // colon-separated, bold. Enumerating phrasings does not converge — match the
  // claim (a bare 5 near the token in a session/floor context) instead.
  [SELF_BASE_FLOORPROSE, true, 'prose phrasing of the claim must fire'],
  [SELF_BASE_CORRECTION, false, 'an explicit capitalised "is NOT" correction stays exempt'],
  // --- the inverted bid-floor rule, both directions ------------------------
  // Built from RETIRED_FLOOR and from the recorded mainnet value rather than
  // typed in, so a selftest case cannot drift from the record the rule is made
  // from. None of these four carries an exemption word, so each one tests the
  // PATTERN, not the guard — the old rule's problem was that it was only ever
  // green because "mainnet" exempted the lines it would otherwise have flagged.
  ['| Bid price floor | `' + RETIRED_FLOOR[0] + '` wei/sec |', true,
   'the retired 1e13 restated as the floor must fire'],
  ['- Floor: `bidMinPricePerSecond = ' + RETIRED_FLOOR[1] + '` wei/sec', true,
   'the retired 5e15 restated as the floor must fire'],
  ['- Bid price floor: `' + PARAMS.bidMinPricePerSecond.networks['base-mainnet'].value
    + '` wei/sec, the deployed value.', false,
   'the CORRECTED floor must stay silent with no exemption word present'],
  ['"pricePerSecond": "' + RETIRED_FLOOR[0] + '"', false,
   'a retired number as an example bid price, asserting no floor, must not fire'],
  // --- the inverted provider-stake rule, both directions -------------------
  // Four phrasings of the retired claim — table row, prose, parameter
  // assignment (merged `_mainnet` identifier, wei form), and a second prose
  // near-duplicate of a real historical line — plus two near-misses that
  // would fool a checker anchored on the bare number or on "provider" and
  // "stake" merely sitting near each other. None carries an exemption word,
  // so each tests the PATTERN, not the guard.
  ['| Provider stake | `0.1` MOR (Base mainnet) · `0.2` MOR (Base Sepolia) |', true,
   'the retired 0.1 restated as the mainnet provider stake, table row, must fire'],
  ['Your provider stake requirement on Base mainnet is `0.1` MOR, refundable on deregister.', true,
   'the retired 0.1 restated as the mainnet provider stake, prose, must fire'],
  ['providerMinStake_mainnet = ' + RETIRED_PROVIDER_STAKE[0], true,
   'the retired value in a parameter assignment, wei form, must fire'],
  ['If you registered as a provider, your provider stake (`0.1` MOR on Base mainnet, `0.2` on Sepolia; no subnet tier) is held in the contract.', true,
   'the actual pre-93c85651 sentence, restored, must fire'],
  ['- Provider stake: `' + PARAMS.providerMinStake.networks['base-mainnet'].value
    + '` wei on Base mainnet, the corrected value.', false,
   'the CORRECTED provider stake must stay silent with no exemption word present'],
  ['Open model registration forces every provider to stake `0.1` MOR per model — no subnet tier.', false,
   'model stake with "provider" as the grammatical subject and no "mainnet" qualifier must not fire'],
  ['| Model stake (`modelMinStake`) | `0.1` MOR (Base mainnet and Base Sepolia) |', false,
   'the CORRECT model-stake figure, "mainnet"-qualified, with no "provider" word on the line, must not fire'],

  // --- the refund-at-close rule, both directions ---------------------------
  // The FIRING cases are the retired phrasing lifted out of the pre-fix file
  // bytes (git show 50ed82f8^:<path>), not retyped: a retyped "verbatim" case
  // proves the typist. The SILENT cases are the correct sentences standing in
  // the tree right now, for the same reason.
  ["Always close manually if you are finished well before the session timer expires. The remainder returns to your wallet on close (in practice a session consumed within a single UTC day returns **nothing** at close — the day-lock is computed from the final UTC day's consumption and can absorb the whole remaining stake); the final UTC day's consumed slice day-locks until the next UTC day (`withdrawUserStakes`). See [Sessions: stake, close, claim](/concepts/sessions-stake-close-recover).",
   true, 'pre-fix chat.mdx:74 bytes — the retired claim must fire'],
  ["| **Early close** | User-initiated `closeSession` before `endsAt`. The final UTC day's consumed slice day-locks; the remainder returns immediately — which for a short same-day session can be zero. |",
   true, 'pre-fix glossary.mdx:30 bytes — "can be zero", the copular hedge, must fire'],
  ['sessions consumed within a single UTC day return nothing at close', true,
   'the PLURAL verb must fire — (require|need)\\b missed "requires" for a year'],
  ['a same-day session returned nothing at close', true, 'the past tense must fire'],
  ['closing inside one UTC day, returning nothing to your wallet', true, 'the gerund must fire'],
  ['for a same-day session the remainder is usually nothing', true,
   'the copular hedge with no return verb at all must fire'],
  ['for a same-day session the remainder is typically zero', true, '"typically" + zero must fire'],
  ['| Refund | `0` — a session consumed within a single UTC day returns nothing |', true,
   'the claim as a bare table row, no keyword nearby, must fire'],
  ['a session inside one UTC day gets nothing back at close', true, '"gets ... back" must fire'],
  ['nothing comes back at close for a session inside one UTC day', true,
   'the reversed word order must fire'],
  ["| **Natural expiration** | Session close where `closedAt >= endsAt` (often auto-submitted ~1 minute after `endsAt`). For a session that ran inside one UTC day this typically day-locks the **entire** remaining stake, returning ~nothing at close. |",
   false, 'in-tree glossary.mdx:29 Natural expiration — TRUE, must stay silent'],
  ["| **Early close** | User-initiated `closeSession` before `endsAt`. **Returns the unconsumed stake immediately** — approximately *(1 − fraction consumed) × stake*, so a close at 10% of the scheduled duration returns about 90%. Only the seconds actually consumed during the final UTC day day-lock; the return approaches zero as consumption approaches the full scheduled duration, not because the session was short. |",
   false, 'in-tree glossary.mdx:30 corrected Early close must stay silent'],
  ["Always close manually if you are finished well before the session timer expires. **What returns at close scales with how much of the session went unused.** The day-lock is sized from the seconds you actually consumed, so closing at 10% of the scheduled duration returns roughly 90% of the stake to your wallet in the close transaction — whether or not the whole session sat inside one UTC day. Only the consumed part day-locks, until the next UTC day (`withdrawUserStakes`). The return approaches nothing only as consumption approaches the full scheduled duration: a session left to run to `endsAt` inside one UTC day returns approximately zero, which is exactly what closing early avoids. See [Sessions: stake, close, claim](/concepts/sessions-stake-close-recover).",
   false, 'in-tree chat.mdx:74 corrected must stay silent'],
  ["| \"I closed and **nothing** came back.\" | Expected when the session was fully consumed inside one UTC day — e.g. it ran to `endsAt` — because then the consumed slice is essentially the whole stake. **Not** expected from an early close, which returns the unconsumed part in the close txn. The proxy-router automatically sweeps the held part after `releaseAt`; no manual claim needed. |",
   false, 'in-tree where-is-my-mor.mdx:119 "nothing came back" — TRUE, must stay silent'],
  ['what returns is the part you did not consume, and it is not zero, same UTC day or not', false,
   'the NEGATED form is a correction, not the claim, and must stay silent'],
  ['a fully consumed session returns nothing at close', false,
   'no same-day qualifier — this is simply true and must stay silent'],
  ['`SessionRouter.sol:300` gives the provider `0` of the user stake, same UTC day or not', false,
   'a provider-side zero is not a refund claim and must stay silent'],
  // The two cases that prove the unit scope is load-bearing rather than
  // decorative. Each is given a UNIT that differs from its line; the block
  // below re-runs both line-locally and asserts each flips to the wrong answer.
  [WRAP_LINE, true, 'the claim WRAPPED across a newline (tokens-and-fees:84-85) must fire', WRAP_UNIT],
  [ACCORDION_LINE, false,
   'a TRUE sentence whose qualifier is in the accordion title above it (myths:58-59) must stay silent',
   ACCORDION_UNIT],
  // --- the TEE frozen-config rule ------------------------------------------
  ["what forecloses a runtime override is the **deployment**, not the image — RTMR3 measures the compose the VM was launched with", true , "the deployment-holds-it narrowing must fire"],
  [TEE_RATHER_THAN_OVERVIEW, true , "\"rather than by the image on its own\" (overview) must fire"],
  [TEE_RATHER_THAN_REFERENCE, true , "\"rather than by the image on its own\" (reference) must fire"],
  ["Only **5 variables** are configurable at runtime — the per-provider secrets:", true , "\"only N are configurable at runtime\" must fire"],
  ["Because configuration is frozen in the image, when run inside a TEE", true , "\"frozen in the image\" must fire"],
  ["3. Configured such that PII/chat logging is disabled and cannot be re-enabled at runtime", true , "\"cannot be re-enabled at runtime\" must fire"],
  ["  - `PROXY_STORE_CHAT_CONTEXT=false` (no chat logging) and `ENVIRONMENT=production` are immutable — not overridable at runtime.", true , "\"immutable — not overridable at runtime\" must fire"],
  [TEE_CORRECTED_FORECLOSE, false, "the corrected bullet naming what IS foreclosed must stay silent"],
  ["**What the attestation actually pins.** RTMR3 is the replay of two inputs", false, "the corrected \"what the attestation actually pins\" must stay silent"],
  ["Neither is immutable at runtime: both are Docker `ENV` defaults", false, "the corrected \"neither is immutable at runtime\" must stay silent"],
];
let bad = 0;
console.log('\n--- guard selftest ---');
// A 4th element is the UNIT the line sits in, for claims whose meaning depends
// on its neighbours. Omitted, the line is its own unit — every legacy case
// below is unchanged by this.
for (const [line, want, label, unit] of SELF) {
  const fires = CLAIMS.some((c) => hits(c, line, unit === undefined ? line : unit));
  const ok = fires === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
}
// Gate the gate: re-run the two scope cases with the unit collapsed to the line,
// which is what this rule would be without scope:'unit'. Both must flip. A
// scope that changes no answer is not doing anything, and saying so here is
// cheaper than rediscovering it the next time someone simplifies this file.
const scopeCase = CLAIMS.find((c) => c.id === 'refund-nothing-same-day');
const lineLocal = (l) => hits(scopeCase, l, l);
const wrapMissed = lineLocal(WRAP_LINE) === false;
const accordionMisfires = lineLocal(ACCORDION_LINE) === true;
if (!wrapMissed || !accordionMisfires) bad++;
console.log(`${wrapMissed && accordionMisfires ? 'ok  ' : 'FAIL'}  unit scope is load-bearing: `
  + `line-locally the wrapped claim is ${wrapMissed ? 'MISSED' : 'still caught'} and the correct `
  + `accordion sentence is ${accordionMisfires ? 'FALSE-FLAGGED' : 'still silent'}`);
// Gate the gate, twice, for the TEE rule — both mutations are ones a later
// simplification would actually make.
//   (a) swap guard:'explicit-only' for the broad guard: the two "rather than"
//       lines stop firing, because the claim's own words sit in the exemption
//       list. A guard choice that changes no answer is decoration; this one
//       decides two of the rule's ten corpus sites.
//   (b) add `forecloses?` to the pattern, the obvious "related word": the
//       CORRECTED bullet — the one whose whole job is to say what the
//       measurement does and does not foreclose — starts firing. That is the
//       widening this family is one edit away from, so it is pinned here.
const teeCase = CLAIMS.find((c) => c.id === 'tee-config-frozen-by-attestation');
const broadGuarded = (l) => teeCase.re.test(l) && !REFUTES.test(l);
const guardLoadBearing = !broadGuarded(TEE_RATHER_THAN_OVERVIEW) && !broadGuarded(TEE_RATHER_THAN_REFERENCE);
if (!guardLoadBearing) bad++;
console.log(`${guardLoadBearing ? 'ok  ' : 'FAIL'}  explicit-only guard is load-bearing: `
  + `under the broad guard both "rather than by the image on its own" sites `
  + `${guardLoadBearing ? 'go SILENT' : 'still fire'}`);
const widened = new RegExp(TEE_FROZEN_FLAT + '|' + TEE_FROZEN_DEPLOYMENT + '|\\bforecloses?\\b');
const wordIsNotTheClaim = !teeCase.re.test(TEE_CORRECTED_FORECLOSE) && widened.test(TEE_CORRECTED_FORECLOSE);
if (!wordIsNotTheClaim) bad++;
console.log(`${wordIsNotTheClaim ? 'ok  ' : 'FAIL'}  leaving the topic word out is load-bearing: `
  + `adding it ${wordIsNotTheClaim ? 'FALSE-FLAGS' : 'does not flag'} the corrected bullet`);
console.log(bad ? `GUARD SELFTEST: FAIL (${bad}/${SELF.length})` : `GUARD SELFTEST: PASS (${SELF.length}/${SELF.length} — fires on repeats, silent on corrections)`);
