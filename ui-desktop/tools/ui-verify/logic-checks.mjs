// Node-runnable assertions over the PR's exported substrate utils.
// Run: npm run logic   (uses vite-node to transform the .ts/.tsx/.js sources)
import {
  morToWei,
  weiToMor,
  earlyCloseLock,
  nextStakeReleaseAt,
  stakeReleaseSchedule,
} from '../../src/renderer/src/utils/marketplace.ts';
import { formatMor } from '../../src/renderer/src/utils/coinValue.tsx';
import {
  isSecureModel,
  SECURE_TAG,
  formatModelName,
  modelMatchesQuery,
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

console.log('');
console.log(`LOGIC CHECKS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
