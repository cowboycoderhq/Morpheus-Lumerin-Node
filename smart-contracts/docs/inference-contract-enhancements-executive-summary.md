# Inference Contract Enhancements: Executive Summary & Impact Outlook

**Companion to:** [`inference-contract-enhancements-rfp.md`](inference-contract-enhancements-rfp.md)
**Date:** 2026-07-07
**Data basis:** All on-chain session closes for the 7 days 2026-06-30 → 2026-07-07 (8,156 closes, BASE mainnet Inference Diamond), plus live funding-wallet and emission-budget reads taken 2026-07-07.

---

## 1. The one-paragraph version

The RFP replaces the model catalog's human approval pipeline with a permissionless, bond-backed on-chain registry; removes the misunderstood 365-day provider reward limiter and replaces it with a *hard-enforced* daily emission budget; makes every close return the consumer's money in the same transaction; adds a 5% platform commission on provider payouts with airtight conservation accounting; and adds cold/hot custody delegation. We pressure-tested the whole design against a replay of recent live mainnet activity — every session open and close, the model catalog, bids, receipts, and the funding wallet's runway. The replay validated the consumer-side fixes (nearly half of real sessions hit the early-close friction the RFP removes), the catalog redesign (the live catalog demonstrates exactly the duplication and naming sprawl the grammar kills), and the budget/conservation accounting (which today is assumed, not enforced). It also surfaced the design's honest limit: **these changes do not stop capital-proportional emission farming — they bound it, price it openly, and strip it of every side benefit** (fake reputation, invisible over-issuance, funding-wallet surprises). Whether the residual — "locked MOR earns emission share without delivering service" — is a bug or just staking yield by another name is a tokenomics question the contract now forces into the open instead of hiding.

---

## 2. Proposed changes, by facet

### ModelRegistry — permissionless canonical catalog (RFP §3.1)

| What changes | Today | Proposed |
|---|---|---|
| Model identity | `keccak256(owner, name)` — same name registerable by many owners | One name = one immutable id, derived from the name itself |
| Naming | Any string, no validation | Strict on-chain ASCII grammar anchored to Hugging Face repo ids (open weights) or vendor API ids (proprietary); homoglyphs structurally impossible |
| Who can register | Anyone, ~free | Anyone, via commit-reveal + **500 MOR refundable bond** + 10 MOR fee |
| Curation | None (garbage accumulates) | **Nobody approves anything.** Lies are policed by bonded challenges (loser's bond slashed); dead listings auto-retire after 90 days without bids |
| Serving channel | Exposed ad-hoc in names ("venice-served-X") | **Channel neutrality:** names identify the model artifact only; resellers/aggregators bid on the same canonical listing as everyone else |

**Why it matters:** the catalog stops being a spam surface and a gatekeeping bottleneck at the same time. Registration survives total loss of every admin key. The "make it hurt" bar is collateral, not committee.

### Marketplace — bidding (§3.2)

In-place bid price updates (`updateBidPrice`) with its own configurable fee, instead of delete + repost. Small, quality-of-life.

### ProviderRegistry — provider bond (§3.3)

The provider stake stops pretending to be an earnings governor and becomes what it actually is: a nominal 10 MOR anti-bot entry bond, fully refunded on deregister. Earnings are decoupled from stake entirely.

### SessionRouter — sessions, settlement, rewards (§3.4). The heart of the RFP.

| Change | What it fixes |
|---|---|
| **Session quote views** | Consumers can finally see what a stake buys (duration, price, end time) before staking |
| **Direct-pay = prepayment semantics** | Direct-pay refunds immediately on early close; no on-hold rows |
| **Close returns everything, always** | No more second `withdrawUserStakes` tx, no stranded MOR behind the 1-day early-close lock (recommended: delete the lock — natural-close chaining already recycles stake penalty-free, so the lock only punishes the *lighter* user), and `closeSession` never reverts when the funding wallet is short: the consumer is always made whole, the provider's leg becomes a tracked debt (`pendingProviderClaims`) counted against the emission pool **at accrual** |
| **Reward limiter removed; daily budget enforced** | The 365-day stake-match cap goes away. In exchange, `getTodaysBudget` moves from an assumption to a hard clip-at-claim invariant, and **self-dealt sessions can never write reputation stats** |
| **5% platform commission** | On provider payouts only (consumer refunds untouched), with gross-vs-net conservation accounting (the emission pool is debited gross, so fees can never silently inflate the apparent remaining budget), a 7-day timelock on rate changes, and a disclosed conflict of interest (the fee receiver earns from farmed volume too — with a `burnSelfDealtFees` option priced for governance) |
| **`getFundingHealth()` view** | One call answers "how many days of runway does the funding wallet have, and is a shortfall already queuing?" — today that requires a bespoke script |

### Custody & delegation (§3.5)

Cold vaults grant capped, expiring, revocable staking allowances to hot node wallets (many cold : one hot, one bucket, FIFO). Providers can steer payouts to a cold `payoutTarget`. Delegation-linked sessions count as self-dealt for stats purposes, so sponsored capital can't launder reputation.

### Query facet & hygiene (§3.6–3.7)

Enriched one-call reads (session + bid + model + provider), bounded iteration everywhere, dead-field cleanup.

---

## 3. The last 7 days, replayed under the new rules

Real data, 2026-06-30 → 2026-07-07: **8,156 closes; 16,466 MOR of gross provider entitlements; 42% early closes; 49% of sessions served zero tokens.** Provider labels are anonymized; the shape of the market, not the identities, is the finding.

| Provider profile | Closes | Gross MOR | 5% fee | Net MOR | Self-dealt | Tokens served |
|---|---|---|---|---|---|---|
| Frontier-model provider (large sessions) | 334 | 8,519 | 426 | 8,093 | 0 | 4.5 M |
| Self-dealing operator (own consumer + model) | 48 | 6,796 | 340 | 6,456 | 48 / 48 | 0 |
| High-volume provider (small sessions) | 3,691 | 972 | 49 | 923 | 0 | 1,879.7 M |
| Seven others | 4,083 | 179 | 9 | 170 | 0 | 268.2 M |

**What the replay says about each part of the ecosystem:**

- **Consumers (the biggest everyday win).** 3,436 early closes (42% of the week) put stake behind the 1-day lock; under the RFP every one of them is whole in the close transaction, and the second `withdrawUserStakes` transaction plus the external recovery job disappear. Half of all sessions served zero tokens — consumers are demonstrably buying *availability windows*, which is exactly the semantics the RFP formalizes (quote before staking, prepayment-style direct pay, pay-for-readiness rewards).
- **Providers.** Earnings are heavily concentrated (two profiles account for ~93% of entitlements), and every closeout receipt is provider-signed with no verification. The limiter removal changes nothing for this week's honest volume (nobody was near their cap without topping up); what changes is that quality stats become the only route to rating-driven routing, because fabricated sessions stop writing them (REWARD-R6).
- **The model catalog.** Of 76 live names, 72 survive the new grammar as-is or via lowercase fold; 4 (names with spaces) get renamed to their upstream ids at migration. Case-duplicate and per-owner duplicate listings — visible in today's catalog — become structurally impossible. Nothing else a consumer sees changes.
- **Self-dealing (bounded, not stopped).** The one self-dealing operator's emission take — 6,796 MOR, 41.3% of the week's entitlements against 2.17M MOR of cycled stake — is unchanged under the new rules, because extraction is capital-proportional by design. What changes: its 48 zero-token, self-signed "perfect" sessions stop writing reputation stats, and its volume is tagged and visible instead of blended into network totals.
- **The budget throttle never binds at today's scale.** Peak day was 3,060 MOR of gross entitlements against a 27,890 MOR daily budget (~11%). It exists for the swarm scenario: if farming multiplied tenfold, the ceiling holds at the budget, claims queue and roll, and over-issuance is structurally impossible — instead of today, where nothing at claim time checks the budget at all.
- **The owner/ops burden shrinks.** The funding wallet holds 248.5k MOR: ~15 weeks at current burn, but only **~9 days if farming saturated the full daily budget**. Today that runway requires a bespoke script; `getFundingHealth()` makes it one RPC call anyone can alert on. The recovery job, the catalog approval queue, and the stuck-stake support tickets all go away; what remains for the owner is parameter tuning within on-chain bounds and challenge arbitration.
- **The fee raises real, but conflicted, revenue.** 823 MOR/week to the maintainer multisig at current volume — of which 340 MOR (41%) is commission on self-dealt volume. That is exactly why the RFP discloses the conflict and prices the burn option.

---

## 4. The token-economics question, answered head-on

*"If self-dealing is attractive, won't people buy MOR to farm, pump the price, and produce nothing?"*

Yes — and the design treats that as a feature to bound rather than a hole to deny. Walk the loop:

**Short term (0–3 months): farming is visibly attractive and demand-positive.** The observed self-dealing economics on mainnet: ~311k MOR locked → ~975 MOR/day of emissions ≈ **~0.31%/day, roughly 110% APR** (about 105% after the 5% fee), at essentially zero operational risk. Publishing rules that legalize this (no limiter, no cap) will attract imitators, and imitators must **buy and lock MOR** to play. That is genuine short-term demand and price support. It is also exactly what the emission schedule was going to pay out anyway — the daily budget is emitted regardless; farming changes *who captures it*, not *how much leaves*.

**Medium term (3–12 months): the yield self-dilutes.** The enforced budget is the crucial change. Total daily stake-pool payout is hard-capped at `getTodaysBudget` (~27.9k MOR/day today, declining on the emission curve). Every new farmer's capital competes for the same fixed pot, so the farming APR falls as locked capital rises — the system converges toward an equilibrium where farming yields no more than competitive staking. Meanwhile: farmed sessions can't buy routing (stats exclusion), the funding wallet's runway is public (`getFundingHealth`), a shortfall queues loudly instead of compounding invisibly (accrual accounting), and the treasury can see the drain rate and adjust top-up policy. What farmers *extract* they largely *sell* (that is the point of farming), so the net token flow is: buy-and-lock on entry (support), emission-sell on an ongoing basis (pressure). At equilibrium the two roughly offset; the token's price ends up carried by what it always had to be carried by — real inference demand.

**Long term (1 year+): the fork in the road is explicit, not hidden.** If real consumer demand grows, emissions increasingly flow to providers serving actual tokens, farming share shrinks as a fraction of activity, and the marketplace's public metrics (which now exclude self-dealt volume) tell the truth. If real demand does *not* grow, the protocol is honestly revealed as a staking-yield system with an inference skin — and governance has the levers this RFP deliberately installed: the fee and its burn option, budget parameters, and the flagged-but-out-of-scope endgame, **proof of delivered service** (TEE-attested receipts) as a reward gate. The worst outcome the old contract permitted — fabricated volume inflating public stats, over-issuance drifting past the budget, a funding wallet that empties by surprise, all invisible — is off the table either way.

**Reputation verdict:** the network's credibility is hurt far more by *undetectable* farming than by *priced* farming. Today an analyst who digs (as we did) finds 41% of provider entitlements going to one self-dealing wallet with zero tokens served and stats that claim excellence — that's a scandal. Under the RFP the same behavior is: visible in one view call, excluded from every quality metric, capped by budget, fee-taxed, and openly documented as capital-proportional yield. That's a disclosure, not a scandal.

---

## 5. What the world looks like

**Near term (launch + weeks).** Consumers notice closes that just work: money back in one transaction, no stuck MOR, a quote before staking. Providers notice the limiter is gone — no more topping up stake to keep earning — minus a 5% commission that was announced with a 7-day timelock. A handful of new farmers arrive, buy MOR, lock it, and draw yield; daily claims are still far below budget, so nobody feels the throttle. The model catalog reseeds under canonical HF-anchored names; a few squatters try the registry, discover a 500 MOR bond and a challenge process, and mostly don't bother.

**3 months.** The registry has settled into its economics: real models registered by the people who serve them, a couple of resolved challenges establishing precedent, dead listings decaying out. Dashboards read `getFundingHealth` and `getProtocolFeeSummary` directly from chain; treasury top-ups are scheduled against a public runway number instead of a private script. Farming capital has grown enough to matter but the budget clip has held every day it was tested; the farming APR is visibly lower than at launch. Rating-driven routing is meaningfully better because stats are no longer poisoned — honest providers win real consumers on measured quality, which is the first time serving well has had a compounding payoff.

**1 year.** Two scenarios, and the contract behaves correctly in both. In the growth scenario, real inference volume dominates: provider revenue is mostly real service, the fee funds maintenance from genuine marketplace activity, and MOR's lock-up from both farmers and consumers supports the token while metrics honestly show a working market. In the stagnation scenario, farming dominates emission capture — but it is bounded, taxed, reputation-inert, and publicly measurable, and governance has a clean decision to make (cut budgets, raise the burn, or gate rewards on attested service) with data instead of forensics. Either way, no one discovers a six-figure MOR hole by accident.

**Better or worse for attracting participants?** Better, on both sides, with one honest caveat. *Providers:* strictly better — no stake-match cap, no 365-day cliff, instant claims, payouts steerable to cold storage, and a quality flywheel that can't be gamed by competitors' fake stats; the 5% fee is the price of a maintained platform and is smaller than the limiter's implicit tax on growth. *Consumers:* strictly better — transparent pricing, instant refunds, a catalog where a name provably means one model, and routing stats that mean something. *The caveat:* the protocol will, for a while, pay real emission yield to capital that serves nobody. We chose to bound and disclose that rather than pretend a contract can distinguish a self-prompt from a real one without attestation. Fair-market exchange of value is what the design *converges toward* — every mechanism now pushes reward-share toward measured, honest service — rather than what it can promise on day one.

---

## 6. Numbers referenced (source of truth)

| Metric (7 days, Jun 30–Jul 7 2026) | Value |
|---|---|
| Session closes | 8,156 |
| Gross provider entitlements | 16,466 MOR |
| — of which pure self-dealing (one operator, 48 sessions, 0 tokens) | 6,796 MOR (41.3%) |
| 5% fee take (hypothetical) | 823 MOR (340 from self-dealing) |
| Early closes (stake behind 1-day lock today; instant under RFP) | 3,436 (42%) |
| Zero-token sessions | 49% |
| Peak daily gross vs. enforced daily budget | 3,060 vs 27,890 MOR (11%) |
| Funding wallet balance / worst-case runway | 248,526 MOR / ~9 days at full-budget drain |
| Observed farming yield on locked capital | ~0.31%/day (~110% APR) |
| Live model names surviving the new grammar | 72 of 76 (4 renamed at migration) |
