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
  isSecureModel,
  SECURE_TAG,
  formatModelName,
  modelMatchesQuery,
  userTextFromPrompt,
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
// Modelled on a typical on-chain early close (Base mainnet), where
// a user closed a session well before it ended and part of the stake silently vanished
// for a day. The values are chain-derived and match no session, but their
// magnitudes and the used-share arithmetic are the chain's, so this pins
// the contract's behaviour without carrying any wallet's history: stake 229.508381 MOR,
// openedAt 1787872655, endsAt 1787873854 (1199s), closedAt 1787872961 (306s in).
console.log('');
console.log('queries: earlyCloseLock (the Close button warning)');
{
  const FIXTURE = {
    Stake: '229508381291933645347',
    OpenedAt: 1787872655,
    EndsAt: 1787873854,
  };
  const atClose = earlyCloseLock(FIXTURE, 1787872961);
  ok('fixture session: priced', atClose.known && atClose.isEarly);
  // This model withholds no fee: the stake splits in two, a locked share
  // and an immediate refund, and the two must sum back to it. The predicted
  // lock must land ON the used share, not near it.
  ok(
    `fixture session: locks ~58.5734 MOR (got ${weiToMor(atClose.lockedWei, 4)})`,
    weiToMor(atClose.lockedWei, 4) === '58.5734',
  );
  ok(
    `fixture session: returns ~170.9349 MOR (got ${weiToMor(atClose.returnedWei, 4)})`,
    weiToMor(atClose.returnedWei, 4) === '170.9349',
  );
  // The lock is the ONLY thing the user can avoid, and waiting is how.
  ok('fixture session: nothing is lost — locked + returned == stake',
    atClose.lockedWei + atClose.returnedWei === BigInt(FIXTURE.Stake));
  // startOfDay(1787872961) = 1787788800 -> unlock 1787875200
  ok('fixture session: unlock is startOfDay(close) + 1 day', atClose.unlockAt === 1787875200);

  // The good path: waiting until endsAt locks NOTHING. This is the asymmetry
  // the warning exists to tell the user about, so it must be pinned.
  const atEnd = earlyCloseLock(FIXTURE, 1787873854);
  ok('closing AT endsAt locks nothing', atEnd.known && !atEnd.isEarly && atEnd.lockedWei === 0n);
  ok('closing at endsAt returns the whole stake', atEnd.returnedWei === BigInt(FIXTURE.Stake));
  const after = earlyCloseLock(FIXTURE, 1787873854 + 999);
  ok('closing AFTER endsAt locks nothing', !after.isEarly && after.lockedWei === 0n);

  // Monotonic: the longer you wait (within the session) the more is locked.
  const early = earlyCloseLock(FIXTURE, 1787872655 + 30);
  ok('locks less 30s in than 306s in', early.lockedWei < atClose.lockedWei);
  ok('locking is proportional at the halfway point',
    earlyCloseLock({ Stake: '1000', OpenedAt: 1787788800, EndsAt: 1787788800 + 100 }, 1787788800 + 50)
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
    earlyCloseLock({ Stake: '100', OpenedAt: 1787788800, EndsAt: 1787788801 }, 1787788800).lockedWei <= 100n);
}

// ---- nextStakeReleaseAt: WHEN the on-hold tile says it returns --------------
// Same fixture session: closed 1787872961 (2026-08-27 in UTC), so its lock releases
// at startOfDay(1787872961)+1day = 1787875200 (2026-08-28 00:00 UTC).
console.log('');
console.log('queries: nextStakeReleaseAt (the On Hold tile clock)');
{
  const FIXTURE = { Stake: '229508381291933645347', OpenedAt: 1787872655, EndsAt: 1787873854, ClosedAt: 1787872961 };
  // Standing BEFORE that release, it is the next unlock.
  ok('early-closed session -> releaseAt 1787875200',
    nextStakeReleaseAt([FIXTURE], 1787873407) === 1787875200);
  // Standing AFTER it, the entry has matured (auto-claimer's job) -> null.
  ok('after release -> null (matured, not a future date)',
    nextStakeReleaseAt([FIXTURE], 1787875200 + 1) === null);
  // Exactly at release is matured too (contract frees at >=).
  ok('at the release second -> null',
    nextStakeReleaseAt([FIXTURE], 1787875200) === null);

  // Closed LATE (>= endsAt) locks nothing, so it never contributes a date.
  const late = { ...FIXTURE, ClosedAt: 1787873854 };
  ok('closed at endsAt -> no release (locks nothing)',
    nextStakeReleaseAt([late], 1787873407) === null);
  const later = { ...FIXTURE, ClosedAt: 1787874165 };
  ok('closed after endsAt -> no release',
    nextStakeReleaseAt([later], 1787873407) === null);

  // Still open (ClosedAt 0) -> nothing on hold from it.
  ok('open session -> no release',
    nextStakeReleaseAt([{ ...FIXTURE, ClosedAt: 0 }], 1787873407) === null);

  // The EARLIEST future release wins across many sessions, and matured/late ones
  // do not drag it. Three early closes on three different UTC days:
  const day = 86400;
  const mk = (closedAt) => ({ Stake: '1000', OpenedAt: closedAt - 100, EndsAt: closedAt + 100, ClosedAt: closedAt });
  const d1 = 1787875200 + 10 * 3600; // closes on 2026-08-28 -> release 2026-08-29 00:00 = 1787961600
  const d2 = d1 + day; //                                    -> release +1 day
  const now = d1 - 3600;
  ok('earliest future release across sessions',
    nextStakeReleaseAt([mk(d2), mk(d1)], now) === 1787875200 + day);
  ok('a matured entry does not become "next"',
    nextStakeReleaseAt([mk(d1), { ...FIXTURE, ClosedAt: 1787872961 }], now) === 1787875200 + day);

  // Robustness: never throw on junk, never invent a date.
  ok('empty -> null', nextStakeReleaseAt([], 1787873407) === null);
  ok('undefined -> null', nextStakeReleaseAt(undefined, 1787873407) === null);
  ok('missing fields -> null', nextStakeReleaseAt([{ foo: 1 }], 1787873407) === null);
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
  const D = 1787875200; // a UTC-midnight
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

  // The fixture session as a one-tranche schedule, amount matching earlyCloseLock.
  const FIXTURE_S = { Stake: '229508381291933645347', OpenedAt: 1787872655, EndsAt: 1787873854, ClosedAt: 1787872961 };
  const real = stakeReleaseSchedule([FIXTURE_S], 1787873407);
  ok('fixture session -> one tranche', real.length === 1);
  ok('fixture tranche amount == earlyCloseLock lock (58.5734)',
    weiToMor(real[0].lockedWei, 4) === '58.5734');
  ok('fixture tranche release == 1787875200', real[0].releaseAt === 1787875200);

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
// resumed chat rendered as the opening prompt. Fixture is a short resumed chat
// (turns of length 1,3,5,7), each turn's expected text being the LAST user
// message.
console.log('');
console.log('queries: userTextFromPrompt (resumed-chat bubble text)');
{
  // Prepended shapes, growing [u], [u,a,u], [u,a,u,a,u], …
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

// ---- model-picker pricing: MOR/s vs 6-minute stake -------------------------
// The 6-min stake mirrors the marketplace floor used by the affordability gate:
// price * 360 * supply / budget. At supply/budget = 1 the arithmetic is legible
// (a 1e15 wei/s price -> 0.36 MOR to open), exactly the numbers the affordability
// evidence used.
console.log('');
console.log('queries: sixMinuteStakeMor / modelPriceDisplay (picker toggle)');
{
  const meta1 = { supply: 1, budget: 1 };
  ok('1e15 wei/s -> 0.36 MOR to open', sixMinuteStakeMor(1e15, meta1) === 0.36);
  ok('2e15 wei/s -> 0.72 MOR', Math.abs(sixMinuteStakeMor(2e15, meta1) - 0.72) < 1e-9);
  ok('1e16 wei/s -> 3.6 MOR', Math.abs(sixMinuteStakeMor(1e16, meta1) - 3.6) < 1e-9);
  // The ratio scales it: supply/budget = 1000 -> 1000x the stake.
  ok('supply/budget ratio scales the stake',
    Math.abs(sixMinuteStakeMor(1e15, { supply: 1e24, budget: 1e21 }) - 360) < 1e-6);
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
  // Same bids in stake mode: 0.36–0.72 MOR to open.
  const st = modelPriceDisplay(bids, 'stake6m', meta1);
  ok('stake range 0.36–0.72 MOR',
    st.kind === 'range' && Math.abs(st.min - 0.36) < 1e-9 && Math.abs(st.max - 0.72) < 1e-9);
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

console.log('');
console.log(`LOGIC CHECKS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
