// Node-runnable assertions over the PR's exported substrate utils.
// Run: npm run logic   (uses vite-node to transform the .ts/.tsx/.js sources)
import {
  morToWei,
  weiToMor,
  earlyCloseLock,
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

console.log('');
console.log(`LOGIC CHECKS: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
