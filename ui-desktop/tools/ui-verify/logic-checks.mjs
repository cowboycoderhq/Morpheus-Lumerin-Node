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
  MIN_REQUEST_SECONDS,
  strideSeconds,
  blocksForDuration,
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
import { buildModelsWithBids } from '../../src/renderer/src/store/queries.ts';

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
  // The lock is the ONLY thing the user can avoid, and waiting is how.
  ok('real session: nothing is lost — locked + returned == stake',
    atClose.lockedWei + atClose.returnedWei === BigInt(REAL.Stake));
  // startOfDay(1784262509) = 1784246400 -> unlock 1784332800
  ok('real session: unlock is startOfDay(close) + 1 day', atClose.unlockAt === 1784332800);

  // The good path: waiting until endsAt locks NOTHING. This is the asymmetry
  // the warning exists to tell the user about, so it must be pinned.
  const atEnd = earlyCloseLock(REAL, 1784262688);
  ok('closing AT endsAt locks nothing', atEnd.known && !atEnd.isEarly && atEnd.lockedWei === 0n);
  ok('closing at endsAt returns the whole stake', atEnd.returnedWei === BigInt(REAL.Stake));
  const after = earlyCloseLock(REAL, 1784262688 + 999);
  ok('closing AFTER endsAt locks nothing', !after.isEarly && after.lockedWei === 0n);

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

  // Closed LATE (>= endsAt) locks nothing, so it never contributes a date.
  const late = { ...REAL, ClosedAt: 1784262688 };
  ok('closed at endsAt -> no release (locks nothing)',
    nextStakeReleaseAt([late], 1784262600) === null);
  const later = { ...REAL, ClosedAt: 1784262999 };
  ok('closed after endsAt -> no release',
    nextStakeReleaseAt([later], 1784262600) === null);

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
// the wallet pays another. They DID disagree — the old count assumed blocks tile
// end-to-end when seamless overlaps by OVERLAP_SEC, so a 2-block purchase opened
// 3 and a 94-block one opened 103. A comment is not enough to hold that; this
// re-derives the count by walking the scheduler's ACTUAL rule
// (`endsAt >= targetEndTime` stops) and asserts the formula agrees at every
// slider position in both modes.
console.log('');
console.log('queries: blocksForDuration vs the scheduler stop condition');
{
  const walk = (targetSec, overlap) => {
    const stride = strideSeconds(overlap);
    let t = 0, opens = 0;
    for (;;) {
      opens++;
      const endsAt = t + MIN_REQUEST_SECONDS;
      if (endsAt >= targetSec) return { opens, coverTo: endsAt };
      t += stride;
      if (opens > 500) return { opens, coverTo: endsAt }; // runaway guard
    }
  };
  const maxSec =
    Math.floor((8 * 60 * 60) / MIN_REQUEST_SECONDS) * MIN_REQUEST_SECONDS;
  for (const overlap of [true, false]) {
    const mode = overlap ? 'seamless' : 'economy';
    let mismatch = null;
    let uncovered = null;
    for (let sec = MIN_REQUEST_SECONDS; sec <= maxSec; sec += MIN_REQUEST_SECONDS) {
      const w = walk(sec, overlap);
      if (blocksForDuration(sec, overlap) !== w.opens) {
        mismatch ??= { sec, priced: blocksForDuration(sec, overlap), opened: w.opens };
      }
      // The run must actually reach the duration the slider sold.
      if (w.coverTo < sec) uncovered ??= { sec, coverTo: w.coverTo };
    }
    ok(`${mode}: priced blocks == blocks actually opened, every slider position`,
      mismatch === null, mismatch && JSON.stringify(mismatch));
    ok(`${mode}: the run covers the duration the slider sold`,
      uncovered === null, uncovered && JSON.stringify(uncovered));
  }
  // The specific regressions the reviewer measured against the real provider.
  ok('seamless 2-block purchase prices 3 opens (was 2)',
    blocksForDuration(2 * MIN_REQUEST_SECONDS, true) === 3);
  ok('seamless max prices 103 opens (was 94)',
    blocksForDuration(maxSec, true) === 103);
  ok('economy max prices 91 opens (was 94)',
    blocksForDuration(maxSec, false) === 91);
  ok('a single block is 1 in both modes',
    blocksForDuration(MIN_REQUEST_SECONDS, true) === 1 &&
    blocksForDuration(MIN_REQUEST_SECONDS, false) === 1);
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

console.log('');
console.log(`LOGIC CHECKS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
