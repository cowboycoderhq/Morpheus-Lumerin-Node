# Inference Contract Enhancements — Contractor RFP

**Product:** Morpheus Lumerin Node — Inference Diamond (BASE)  
**Repository:** [`smart-contracts/`](../)  
**Status:** Draft for contractor scoping  
**Last updated:** 2026-05-29  
**Audience:** Smart contract engineering contractor, Morpheus protocol team

---

## 1. Purpose

This document consolidates a review of the current Inference Diamond facets (`ModelRegistry`, `Marketplace`, `ProviderRegistry`, `SessionRouter`) and proposes enhancements aimed at **user-facing simplification**, **marketplace integrity**, and **developer experience**.

It is intended as a scoping brief for a smart contract contractor: prioritized backlog, acceptance criteria, migration constraints, and open design decisions.

### 1.1 Canonical code references

| Facet | Path |
|-------|------|
| ModelRegistry | [`contracts/diamond/facets/ModelRegistry.sol`](../contracts/diamond/facets/ModelRegistry.sol) |
| Marketplace | [`contracts/diamond/facets/Marketplace.sol`](../contracts/diamond/facets/Marketplace.sol) |
| ProviderRegistry | [`contracts/diamond/facets/ProviderRegistry.sol`](../contracts/diamond/facets/ProviderRegistry.sol) |
| SessionRouter | [`contracts/diamond/facets/SessionRouter.sol`](../contracts/diamond/facets/SessionRouter.sol) |
| Model struct | [`contracts/interfaces/storage/IModelStorage.sol`](../contracts/interfaces/storage/IModelStorage.sol) |
| Session struct | [`contracts/interfaces/storage/ISessionStorage.sol`](../contracts/interfaces/storage/ISessionStorage.sol) |

### 1.2 Related product docs (behavior today)

- [Session states (open, close, claim)](../../docs/ai/session-states-open-close-recover.mdx)
- [Why is my MOR locked?](../../docs/ai/why-locked-in-contract.mdx)
- [Tokens and fees](../../docs/concepts/tokens-and-fees.mdx)
- [Rewards and economics](../../docs/concepts/rewards-and-economics.mdx)

---

## 2. Current architecture (baseline)

The Inference Contract is a Diamond proxy with four primary write facets and shared storage slots.

| Facet | Role today |
|-------|------------|
| **ModelRegistry** | Any wallet meeting min stake registers a model. `modelId = keccak256(owner, baseModelId)`. Re-registering with the same `baseModelId` **upserts** metadata and adds stake. |
| **Marketplace** | Providers post bids (`pricePerSecond`). Reposting auto-deletes the prior active bid for that provider↔model pair. The fee is 0.3 MOR on Base mainnet and 0.3 MOR on Base Sepolia, as specified in `smart-contracts/deploy/data/config_base_*.json` and documented in `tokens-and-fees.mdx`. |
| **ProviderRegistry** | Provider bond + endpoint string. Re-register upserts endpoint and adds stake. |
| **SessionRouter** | Open/close sessions, stipend-based duration, close day-lock (gated at `SessionRouter.sol:305` on `block.timestamp < releaseAt_`, so it fires on *any* close before the day after session end, natural expiry included — not on early closes only), provider payouts from `fundingAccount` or user escrow. |

### 2.1 Key behavioral facts (contract-verified)

1. **Model identity is per-owner, not global.** Two providers can each register `"glm-5.1"` as a display name; they are unrelated on-chain models with different `modelId`s.

2. **No global name idempotency.** `modelRegister` does not check for existing names. Idempotency exists only for `(modelOwner, baseModelId)`.

3. **`fee` on Model is unused.** Documented as a royalty placeholder; not referenced in settlement logic.

4. **Direct pay vs staking share the duration and lock math, but the modes are not identical.** `getSessionEnd` and `stakeToStipend` run the same for both, and `_rewardUserAfterClose`'s day-lock applies to both. Two things do differ: who pays the provider at close (`fundingAccount` vs the user's escrowed stake, `SessionRouter.sol:394-402`), and one open-time check that runs **only** for direct pay — `_validateSession` reverts `SessionStakeTooLow()` when `duration_ * bid.pricePerSecond > amount_` (`SessionRouter.sol:152-153`), which the source annotates as a defensive case that "cannot be achieved in theory". The open conditions are therefore not identical either, even though the extra revert is unreachable in practice.

5. **On-hold funds need a second transaction — not a manual one while a router is running and only for the wallet it holds.** Any close landing before `releaseAt_` parks a slice in `userStakesOnHold[]`, cleared by `withdrawUserStakes`. The proxy-router exposes `GET /blockchain/stakes/on-hold` (`blockchainapi/controller.go:73`) for the read side and auto-sweeps matured rows on the write side every 10 minutes (`blockchainapi/stake_claimer.go`, `claimInterval = 10 * time.Minute`) — but only while that router is running and only for the wallet it holds, so a router operator never calls it by hand for their own stake. With the router off, or for stake held against a different wallet, nothing sweeps until a proxy-router holding that wallet runs — starting one claims matured stake immediately on startup, because `Run` calls `claimOnce` before it builds the ticker (`stake_claimer.go:87-89`) — and calling `withdrawUserStakes` on the Diamond is the alternative. There is still no proxy-router HTTP route for `withdrawUserStakes` itself, so a user without a router calls it on the Diamond directly.

6. **Read queries are fragmented.** A complete model-market or session view requires multiple chain calls (see §5).

7. **Provider reward limiter period is 365 days** in contract (`PROVIDER_REWARD_LIMITER_PERIOD`).

---

## 3. Prioritized backlog

Items are grouped by **impact** and tagged with an **objective**. Each item includes acceptance criteria and migration notes.

### Legend

| Tag | Meaning |
|-----|---------|
| 🔴 High | Direct user confusion or marketplace integrity risk |
| 🟡 Medium | Provider onboarding, data quality, economics clarity |
| 🟢 Low | Hygiene, mostly off-chain, or incremental |

| Objective | Focus |
|-----------|-------|
| **UX** | Consumer/provider confusion, "where's my MOR?", opaque pricing |
| **Integrity** | Model sprawl, duplicates, wrong metadata |
| **DX** | Read APIs, indexer/app integration |
| **Economics** | Fees, direct pay, provider rewards |

---

### Phase 1 — Quick wins (read-only, low risk)

#### H2 · UX · Session quote view

**Problem:** Session duration uses `stakeToStipend(amount) / pricePerSecond`, not `amount / pricePerSecond`. Consumers cannot infer how much stake buys how much access.

**Proposal:** Add read-only functions (new `QueryFacet` or extend `SessionRouter`):

```solidity
function quoteSession(
    bytes32 bidId_,
    uint256 amount_,
    bool isDirectPaymentFromUser_
) external view returns (
    uint256 stipend,
    uint128 durationSeconds,
    uint128 endsAt,
    uint256 pricePerSecond,
    bytes32 modelId,
    address provider
);
```

**Acceptance criteria:**
- [ ] Pure `view`; no state changes.
- [ ] `endsAt` matches what `openSession` would set for the same inputs at `block.timestamp`.
- [ ] Documented formula references `stakeToStipend`, `getSessionEnd`, `maxSessionDuration`.
- [ ] Hardhat tests cover stake-pool and direct-pay flag paths.

**Migration:** Additive facet cut; no storage migration.

---

#### H5 · DX · Aggregated read-only facet

**Problem:** Building a model picker or enriched session view requires a call chain:

| Use case | Current calls |
|----------|---------------|
| Pick a model | `getModel` → `getModelActiveBids` → `getBid` (×N) → `getProvider` (×N) |
| Session detail | `getSession` → `getBid` → `getModel` → `getProvider` |

**Proposal:** New **QueryFacet** (view-only, joins existing storage):

```solidity
struct SessionView {
    Session session;
    Bid bid;
    Model model;
    Provider provider;
    uint256 providerClaimable;   // optional
    uint256 userOnHold;          // optional
}

struct ModelBidView {
    Bid bid;
    Provider provider;
    ProviderModelStats stats;    // optional
}

function getSessionView(bytes32 sessionId_) external view returns (SessionView memory);
function getBidView(bytes32 bidId_) external view returns (ModelBidView memory);
function getModelBidsEnriched(bytes32 modelId_, uint256 offset_, uint256 limit_)
    external view returns (ModelBidView[] memory, uint256 total);
```

**Acceptance criteria:**
- [ ] All functions are `view`.
- [ ] Paginated list functions respect existing `Paginator` patterns.
- [ ] Gas benchmarks documented for typical page sizes (e.g. 20 bids).
- [ ] Does not duplicate write storage; reads from existing slots only.

**Migration:** Additive facet cut.

**Downstream:** Morpheus proxy-router may adopt these to reduce multicall complexity (`proxy-router/internal/repositories/registries/`).

---

#### M6 · UX/Economics · Provider earnings transparency

**Problem:** Provider earnings are capped by `provider.stake - limitPeriodEarned` over `PROVIDER_REWARD_LIMITER_PERIOD` (365 days). This is opaque to providers and misdocumented in places.

**Proposal:**

```solidity
function getProviderEarningsStatus(address provider_) external view returns (
    uint256 stake,
    uint256 earnedThisPeriod,
    uint256 remainingCapacity,
    uint128 periodEnd
);
```

**Acceptance criteria:**
- [ ] Values match `_claimForProvider` limiter logic exactly.
- [ ] Tests cover period rollover (`limitPeriodEnd` reset).

**Migration:** Additive. Optional follow-up (separate item): make `PROVIDER_REWARD_LIMITER_PERIOD` owner-configurable — requires product decision.

---

#### M5 · Economics · Unused `fee` field

**Problem:** `Model.fee` is writable on every `modelRegister` but never used in settlement. Creates confusion and wasted calldata.

**Proposal (pick one, document choice in PR):**

| Option | Action |
|--------|--------|
| A | Reject non-zero `fee` until royalty logic is implemented |
| B | Remove field in storage migration (breaking ABI) |
| C | Wire fee as model-owner royalty on session close (new economics — scope separately) |

**Acceptance criteria (Option A — recommended for Phase 1):**
- [ ] `modelRegister` reverts if `fee_ != 0` with clear error.
- [ ] Existing models with `fee == 0` unaffected.
- [ ] Interface comment updated.

**Migration:** Option A is non-breaking. Options B/C need explicit governance approval.

---

#### L4 · Hygiene · Input validation bounds

**Problem:** `name`, `tags`, `endpoint` have TODO comments for length limits; unbounded strings allow griefing via calldata size.

**Proposal:**
- Max length on `name` (e.g. 64 bytes).
- Max count and max length per tag (e.g. 10 tags × 32 bytes).
- Max length on `endpoint` (e.g. 256 bytes).
- Reject empty `name` on create.

**Acceptance criteria:**
- [ ] Revert with named errors on violation.
- [ ] Existing active records grandfathered OR migration script documented if retroactive enforcement is required.

**Migration:** Forward-only enforcement on new writes is lowest risk.

---

### Phase 2 — UX and economics (state-changing)

#### H1 · UX · Rethink direct pay vs staking

**Problem:** `isDirectPaymentFromUser` changes **who pays the provider** (`fundingAccount` vs user escrow) and adds a single open-time guard: `_validateSession` reverts `SessionStakeTooLow()` for direct pay when `duration_ * bid.pricePerSecond > amount_` (`SessionRouter.sol:152-153`, annotated in source as unreachable in practice). Everything else — duration via stipend, day-lock (applies to any close before the day after session end), `endsAt` calculation — is identical. Users expect direct pay to behave like prepayment for N seconds at the bid price.

**Current code paths:**
- Duration: `getSessionEnd` → `stakeToStipend(amount) / pricePerSecond` for **both** modes.
 - Day-lock (applies to any close before the day after session end): `_rewardUserAfterClose` applies `userStakesOnHold` for **both** modes.

**Proposal:** Split into two semantically distinct session modes:

 | Mode | Duration | Refund on close before day after session end | Provider paid from |
|------|----------|-------------------|-------------------|
 | **Pool / stake session** | `stakeToStipend(amount) / pricePerSecond` | Existing day-lock logic (applies to any close before day after session end; or H3 simplification) | `fundingAccount` |
| **Direct-pay session** | `amount / pricePerSecond` (capped by `maxSessionDuration`) | Immediate unused refund (no stipend lock) | User escrow in contract |

**Acceptance criteria:**
- [ ] Direct-pay sessions: `endsAt = openedAt + min(amount / pricePerSecond, maxSessionDuration)`.
- [ ] Direct-pay early close: user receives unused escrow immediately; no `userStakesOnHold` row for direct-pay mode.
- [ ] Stake-pool sessions: preserve existing stipend math (unless H3 also approved).
- [ ] `openSession` API: consider renaming flag in ABI/docs (`isDirectPaymentFromUser` → clearer name) with backward-compatible overload or deprecated alias.
- [ ] Full Hardhat regression suite for both modes × natural close × early close × dispute.
- [ ] Migration guide for proxy-router (`directPayment` body field) and MorpheusUI.

**Migration:** Breaking behavior change for direct-pay users. Requires facet upgrade + coordinated client release. Feature flag or opt-in period recommended.

---

#### H3 · UX · Day-lock on close before day after session end and harvest

**Problem:** Any close before `releaseAt_` parks a computed slice in `userStakesOnHold[user]` with `releaseAt_ = startOfTheDay(min(closedAt, endsAt)) + 1 days` (`SessionRouter.sol:296-298`, gated at `:305` on `block.timestamp < releaseAt_` — not on early close specifically). Clearing those rows takes a second transaction, `withdrawUserStakes`; the proxy-router's StakeClaimer auto-sweeps matured rows every 10 minutes (`blockchainapi/stake_claimer.go`), but only while that router runs and only for the wallet it holds, so an operator whose router holds that wallet never issues it by hand. With the router off, or for stake held against a different wallet, nothing sweeps until a proxy-router holding that wallet runs — starting one claims matured stake immediately on startup — and issuing `withdrawUserStakes` on the Diamond is the alternative. This is the #1 "where's my MOR?" support driver after active sessions.

**Proposal (select or combine):**

| Option | Description |
|--------|-------------|
| **H3a** | Auto-transfer releasable on-hold rows at end of `closeSession` when `releaseAt <= block.timestamp` |
| **H3b** | Remove or shorten day-lock for **non-disputed** early closes; retain provider on-hold only on dispute |
| **H3c** | Add `withdrawAllUserStakes(user)` without iteration cap |
| **H3d** | Emit `UserStakeOnHold(user, amount, releaseAt)` event for indexers and wallet UIs |

**Acceptance criteria:**
- [ ] Document anti-gaming rationale for any retained lock period.
- [ ] Natural expiration path: a portion of the user's stake is placed on hold via `userStakesOnHold` when the close transaction lands before the day after the session end; this is not a full immediate refund.
- [ ] Disputed close (`closeoutType == 1`) provider on-hold behavior preserved unless explicitly changed.
- [ ] Tests for multi-row `userStakesOnHold` arrays and partial release.
- [ ] Gas analysis for H3a auto-sweep on close.

**Migration:** Facet upgrade. If H3b removes consumer lock entirely, update [session-states doc](../../docs/ai/session-states-open-close-recover.mdx) and tech.mor.org checker.

**Parallel (non-contract):** Add proxy-router HTTP route for `withdrawUserStakes` if any lock remains.

---

#### M3 · Provider onboarding · Bid update without full repost

**Problem:** Changing bid price requires a full `postModelBid` repost, paying the **0.3 MOR** fee on every price change. A separate `deleteModelBid` is *not* required — `postModelBid` deletes the provider's prior active bid for that model in the same transaction once the provider->model nonce is non-zero (`Marketplace.sol:93-98`) — but the fee is charged on the repost regardless. Docs already warn providers about fee accumulation during setup.

**Proposal:**

```solidity
function updateBidPrice(bytes32 bidId_, uint256 newPricePerSecond_) external;
```

- Same min/max price checks as `postModelBid`.
- No `marketplaceBidFee` (or reduced fee — product decision).
- Only active bid owner (or delegate) may call.
- Emits `MarketplaceBidUpdated`.

**Acceptance criteria:**
- [ ] Inactive/deleted bids cannot be updated.
- [ ] Price bounds enforced.
- [ ] Existing `postModelBid` auto-delete behavior unchanged for new bid creation flow.
- [ ] Tests: update price, open session on updated bid, close session settlement unchanged.

**Migration:** Additive function. Proxy-router should expose `PATCH /blockchain/bids/:id` or equivalent.

---

#### M4 · Provider onboarding · Explicit endpoint update

**Problem:** Endpoint changes require calling `providerRegister` with `amount_=0`, which re-validates min stake but is undocumented as an "update" path.

**Proposal:**

```solidity
function providerUpdateEndpoint(string calldata endpoint_) external;
```

**Acceptance criteria:**
- [ ] Only active provider (or delegate) may call.
- [ ] Stake unchanged; no token transfer.
- [ ] Same endpoint length bounds as L4.

**Migration:** Additive. Document equivalence with existing `providerRegister(..., 0, endpoint)` if both remain.

---

### Phase 3 — Marketplace model (governance, breaking)

#### H4 · Integrity · Model name sprawl and duplicates

**Problem:** No global uniqueness. Display names are free-form strings. Users cannot tell if `"GLM-5.1"` and `"glm-5.1"` are the same offering.

**Design options (contractor must implement **one** chosen by Morpheus governance before coding):

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A — Canonical registry** | Governance/multisig registers global `canonicalModelId`; providers only `postModelBid`. | Clean marketplace, single metadata owner | Centralization, governance workload |
| **B — Soft dedup** | `nameKey = normalize(name)` index; block or warn on duplicate per `capability` | Decentralized registration | Wrong metadata still blocks names (see §4) |
| **C — Curated allowlist** | Only approved addresses may `modelRegister` | Simple | Same as A with extra role management |

**Acceptance criteria (Option A — recommended default in RFP):**
- [ ] `modelRegister` restricted to `MODEL_REGISTRAR_ROLE` (or `onlyOwner`).
- [ ] Global `mapping(bytes32 nameKey => bytes32 modelId)` or explicit `canonicalModelId` bytes32 chosen by registrar.
- [ ] `normalize(name)`: lowercase, trim, collapse separators — exact algorithm spec'd and tested.
- [ ] Providers register only via `postModelBid` against canonical models.
- [ ] Migration plan for existing per-owner models (sunset, alias map, or grandfather).

**Migration:** Breaking. Requires governance vote, indexer updates, provider re-registration campaign.

---

#### M1 · Integrity · Typed model capabilities

**Problem:** Capabilities are untyped `string[] tags`. `"tee"` is convention only. No way to filter LLM vs STT vs TTS vs embedding on-chain.

**Proposal:**

```solidity
enum Capability { LLM, STT, TTS, EMBEDDING /* extensible */ }

struct Model {
    // ... existing fields ...
    Capability capability;
    bytes32[] secondaryTags;  // e.g. keccak256("tee")
}

function addCapability(uint8 capabilityId_, string calldata name_) external onlyOwner;
```

- Bids must reference a model; optional rule: reject bids where provider endpoint capability mismatches model (off-chain enforcement may suffice).
- Owner can add new capability enum values via governed extension.

**Acceptance criteria:**
- [ ] Every new model registration requires valid `capability`.
- [ ] `getModel` / QueryFacet views expose capability.
- [ ] Storage layout migration documented (Diamond storage gap strategy).

**Migration:** Storage change to `Model` struct. Existing models need default capability assignment in migration script.

---

#### M2 · Provider onboarding · Governance-only model creation

**Problem:** Open model registration forces every provider to stake 0.1 MOR per model and creates duplicate display names.

**Proposal:** Pair with H4 Option A — remove public `modelRegister` except for registrar role. Providers only:
1. `providerRegister`
2. `postModelBid(canonicalModelId, price)`

**Acceptance criteria:**
- [ ] Unauthorized `modelRegister` reverts.
- [ ] Provider onboarding docs updated: model stake no longer required for typical providers.
- [ ] Model stake refund path preserved for registrars.

**Migration:** Same as H4.

---

#### M7 · Data quality · Structured model metadata

**Problem:** Only `name`, `tags[]`, `ipfsCID`. No filterable size class, context window, or security requirements on-chain.

**Proposal:** Extend `Model` or canonical registry entry:

| Field | Type | Example |
|-------|------|---------|
| `paramSizeBucket` | `uint8` enum | 7B, 8B, 70B |
| `contextTokens` | `uint32` | 8192 |
| `securityFlags` | `uint8` bitmask | TEE_REQUIRED, TEE_OPTIONAL |
| `metadataHash` | `bytes32` | keccak256 of IPFS JSON schema |

Heavy detail remains on IPFS; on-chain fields are for filtering and marketplace UX.

**Acceptance criteria:**
- [ ] Schema version in IPFS JSON documented.
- [ ] `metadataHash` mismatch optionally rejectable on update (governance choice).

**Migration:** Storage extension; pairs with H4/M1.

---

### Phase 4 — Lower priority / mostly off-chain

#### L1 · Model veracity

**Problem:** On-chain stats (`tpsScaled1000`, `ttftMs`) are provider-signed at close. No attestation that runtime model weights match registered name.

**Contract scope (minimal):**
- Optional `attestationHash` on `Model` or `Bid`.
- Optional `verificationLevel` per provider-model pair (oracle/governance set).

**Primary work:** Off-chain benchmarks, TEE attestation (see [TEE Attestation Architecture](../../.ai-docs/TEE_Attestation_Architecture.md)), challenge/dispute with slashing — separate RFP.

---

#### L2 · Rating / interrogation standards

**Problem:** Rating is post-hoc latency only, not model identity verification.

**Contract scope:** Extend stats or emit dispute outcome events. Standard definition is product work, not contract-only.

---

#### L3 · Storage hygiene

- Remove on-chain `closeoutReceipt` bytes (TODO already in `SessionRouter`; store `tps`/`ttft` + receipt hash).
- Compact `OnHold` struct; consider hours instead of epoch seconds (TODO in interface).
- Document unbounded `userStakesOnHold[user]` array growth risk.

---

#### L5 · Name → modelId reverse index

Only meaningful if H4 canonical registry is adopted:

```solidity
mapping(bytes32 nameKey => bytes32 canonicalModelId)
function resolveModelByName(string calldata name_) external view returns (bytes32);
```

---

## 4. Open design decision — metadata ownership

Before Phase 3, Morpheus governance must resolve:

> If `qwen3:8b` is registered with wrong capability (e.g. embeddings-only metadata on an LLM slot), who may update or revoke that metadata?

| Approach | Metadata owner | Duplicate name handling |
|----------|----------------|-------------------------|
| Canonical registry (A) | Governance / registrar multisig | Global unique `nameKey` |
| Open + normalized names (B) | First registrant | Duplicates blocked per capability |
| Open + dispute (C) | First registrant until challenged | Duplicates allowed until slashed |

**Recommendation:** Option A (canonical registry) for clearest provider onboarding and consumer trust. Option B creates the rights problem Alex identified without a governance escape hatch.

---

## 5. Appendix A — Direct pay vs staking (evidence)

### Duration (both modes)

```solidity
// SessionRouter.sol:296-312 — _rewardUserAfterClose (excerpt)
uint128 sessionEnd_ = uint128(session.closedAt.min(session.endsAt));
uint128 startOfEndDay_ = startOfTheDay(sessionEnd_);
uint128 releaseAt_ = startOfEndDay_ + 1 days;

// Lock only while the epoch the stipend was drawn against is still open.
if (block.timestamp < releaseAt_) {
    uint256 userDuration_ = sessionEnd_ - session.openedAt.max(startOfEndDay_);
    uint256 userInitialLock_ = userDuration_ * bid.pricePerSecond;
    userStakeToLock_ = userStake.min(stipendToStake(userInitialLock_, startOfEndDay_));

    if (userStakeToLock_ > 0) {
        _getSessionsStorage().userStakesOnHold[session.user].push(OnHold(userStakeToLock_, releaseAt_));
    }
}
```

Direct pay flag is **not** passed to `getSessionEnd`.

### Close lock (both modes)

```solidity
// SessionRouter.sol — _rewardUserAfterClose
uint128 releaseAt_ = startOfTheDay(sessionEnd_) + 1 days;
if (block.timestamp < releaseAt_) {
            userStakeToLock_ = userStake.min(stipendToStake(userInitialLock_, startOfEndDay_));
    userStakesOnHold[session.user].push(OnHold(userStakeToLock_, releaseAt_));
}
```

Direct pay only affects `userStakeToProvider` subtraction before lock calculation; lock still applies.

### Provider payout (differs)

```solidity
// SessionRouter.sol — _claimForProvider
if (session.isDirectPaymentFromUser) {
    IERC20(token).safeTransfer(bid.provider, amount_);
} else {
    IERC20(token).safeTransferFrom(fundingAccount, bid.provider, amount_);
}
```

### Open-time validation (direct pay only)

```solidity
// SessionRouter.sol:151-154 — _validateSession
// This situation cannot be achieved in theory, but just in case, I'll leave it at that
if (isDirectPaymentFromUser_ && (duration_ * bid.pricePerSecond) > amount_) {
    revert SessionStakeTooLow();
}
```

The stake-pool path has no equivalent check, so "identical except for the payer"
is not quite right — the open conditions differ too. The source comment marks the
branch unreachable, which is why it does not change observed behaviour today; a
rewrite of either mode still has to preserve it or drop it deliberately.

---

## 6. Appendix B — Mapping from brainstorming list

| Source item | Verdict | Backlog ID |
|-------------|---------|------------|
| Model name idempotency (`GLM-5.1` vs `glm-5.1`) | Not global; per-owner upsert only | H4, L4, L5 |
| Restrict model creation to core group | Not implemented | M2, H4 |
| Capability / size / TEE structure | Tags only today | M1, M7 |
| Reduce duplicate names | No enforcement | H4 |
| Model veracity / rating | Latency stats only | L1, L2 |
| Close day-lock (fires on any close before the day after session end) — still needed? | Implemented; major UX pain | H3 |
| Better post-close harvest | `withdrawUserStakes`, auto-swept by the router's StakeClaimer | H3 |
| Stake → access opacity | Stipend math | H2, H1 |
| Direct pay enhancements | Same as stake except the payer and one direct-pay-only open-time revert | H1 |
| Modify facets | Upsert via register; bids repost only — the repost auto-deletes the prior bid | M3, M4 |
| Provider reward transparency | 365-day cap opaque | M6 |
| Unused `fee` field | Confirmed unused | M5 |
| Aggregated read faucets | Not on-chain | H5 |

---

## 7. Suggested delivery phases for contractor SOW

| Phase | Items | Risk | Est. dependency |
|-------|-------|------|-----------------|
| **1** | H2, H5, M6, M5 (Option A), L4 | Low | None |
| **2** | H3, M3, M4, H1 | Medium | Product sign-off on H1/H3 behavior |
| **3** | H4, M1, M2, M7 | High | Governance decision §4 |
| **4** | L1–L3, L5 | Low–Medium | Phase 3 if L5 |

### Deliverables per phase

1. Solidity implementation + interfaces
2. Hardhat test coverage ≥ existing facet standards
3. Storage layout diagram (Diamond slots affected)
4. Migration script / facet cut instructions
5. Breaking change changelog for proxy-router team
6. NatSpec on all new public functions

### Out of scope (separate workstreams)

- Proxy-router HTTP routes (except coordination notes)
- MorpheusUI changes
- Capital Contract / stake-for-liquidity
- Hosted Inference API (`api.mor.org`) billing
- TEE attestation implementation (see `.ai-docs/`)

---

## 8. Questions for contractor proposal

Please address in your response:

1. Recommended approach for **H4** (§4) given upgradeability constraints.
2. Gas budget for **H5** enriched list views at 20 and 100 bids.
3. Strategy for **H1** backward compatibility (new function vs flag behavior change).
4. Storage migration technique for **M1/M7** Model struct extension.
5. Test plan for **H3** early-close changes including dispute path.
6. Timeline and cost breakdown by phase (§7).

---

## 9. Revision history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-29 | Morpheus team (AI-assisted review) | Initial RFP from contract review + brainstorming list |
