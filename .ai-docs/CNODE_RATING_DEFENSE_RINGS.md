# Consumer C-Node: Bid selection defense rings

**Status:** Design proposal (not implemented)  
**Audience:** Proxy-router / consumer-node developers  
**Branch:** `fix/cnode-rating-defense-rings-design` (docs only — no implementation PR yet)  
**Related code today:**

- Rating: `proxy-router/internal/rating/`
- Schema: `proxy-router/internal/rating/rating-config-schema.json`
- Open + ping gate: `proxy-router/internal/blockchainapi/service.go` (`OpenSessionByModelId`, `tryOpenSession`, `blockingModelHealthStatus`)
- On-chain stats: `smart-contracts/contracts/interfaces/storage/IStatsStorage.sol`, `SessionRouter._setStats`
- Local storage: `proxy-router/internal/storages/storage.go` (Badger at `PROXY_STORAGE_PATH`)
- Docs: `docs/reference/rating-config.mdx`, `docs/providers/full/model-health.mdx`

---

## TL;DR — Exec summary

**Problem:** Consumer nodes pick bids with `score = quality / price` over **lifetime** on-chain `(provider, model)` stats. Cheap underbidders with high historical “success” (valid closeout receipts) win even when they are `unknown`/broken for live prompts. There is no denylist, no durable local memory of “this pair just failed *me*,” and the pre-open health ping is too lenient (`unknown` proceeds). Result: open → instant fail → (for HA clients) early-close / reopen churn and locked MOR — bad for Node Neo, DIY consumers, and the API Gateway’s dedicated C-Node alike.

**Proposal:** Keep selection **inside the consumer proxy-router** (network-wide, not APIGW-specific). Four rings:

1. **Hard deny / allow** in `rating-config.json`
2. **Smarter scoring** of survivors (dampened price, drop stake & volume-duration, Bayesian success, soft newcomer prior, **local EWMA experience**)
3. **Configurable health strictness** on the existing ping (`permissive` | `preferred` | `strict`), with a **single-bid leniency** caveat
4. **Persistent local experience in Badger** — soft score bumps / short cooldowns, **not** an auto deny list

**APIGW:** No new omit/active_models dependency for cold opens. Mid-prompt failure still uses today’s single `omitProvider` failover; the C-Node’s local experience then self-protects on subsequent opens.

**Ask:** Review/approve this design, then implement behind defaults that preserve today’s behavior (`permissive`, empty deny/allow, local experience off or neutral).

![Consumer Node Bid Selection — Defense Rings](./assets/cnode-bid-selection-defense-rings.png)

---

## 1. Problem statement

### 1.1 What “best” means today

Default algorithm (`rating-config.json` → `algorithm: default`):

```text
score = (w_tps·tpŝ + w_ttft·ttft̂ + w_dur·dur̂ + w_succ·succ² + w_stake·stakê) / pricePerSecond
```

- Stats grain: **`(provider, modelId)`**, not per bid (`getProviderModelStats`).
- Stats lifetime only — no on-chain “last 24h” window.
- `successCount` increments on close when the provider receipt **signature verifies**, even if the session was useless (e.g. TTFT 0 / lived a few seconds).
- `totalDuration` is a **cumulative sum** of successful session lifetimes — high volume helps the score.
- Final divide by **linear price** — a ~10× cheaper bid needs impossible quality ratios to lose.
- `providerAllowlist` exists; **no denylist**.
- Pre-open ping skips only `unhealthy` | `tee_unverified` | `no_model`. **`unknown` / missing report proceeds.**

### 1.2 Real-world failure pattern (Qwen 2.5 7B)

Two on-chain bids (marketplace snapshot + Insights closes 2026-07-22 after housekeeping):

| Provider | Health (UI / self-report) | MOR/hr | On-chain-ish rank | Observed APIGW/C-Node behavior |
|----------|---------------------------|--------|-------------------|--------------------------------|
| `0x5A42…` (cheap IP) | **unknown** | ~0.00119 | **#1** (~2M score) | **114** early closes, **p50 ≈ 4s**, **0** TTFT |
| `0x5A37…` (mordiem) | healthy / degraded (429) | ~0.0114 | #2 (~235k) | Worked for minutes, then capacity/429; early closes after real use |

Weight retunes alone **cannot** flip #1: price ratio ~9.6×; success ≈ 99.9% vs 100%; duration volume favors the cheap peer.

Ping-pong: cold open → cheap unknown → fail → (HA) omit once → mordiem → later fail → next cold open **forgets** → cheap again. **No durable self-defense.**

### 1.3 Comparator (deepseek-v4-flash, 5 bids)

Healthy cheap high-TPS peer is already #1; degraded expensive peer is last. Cold-open ranking is mostly fine. Pain is **sticky memory after mid-session failure**, not “unknown underbidder always wins.” Same defense rings still help; they don’t invert a true quality leader.

### 1.4 Scope boundary

| In scope (this design) | Out of scope |
|------------------------|--------------|
| All consumer C-Nodes (Node Neo, DIY, APIGW’s router) | APIGW reading `active.mor.org` for cold opens |
| `rating-config` + Badger local experience | Multi-`omitProviders[]` (optional later) |
| Using existing ping / model health report | On-chain “recent stats” contract upgrade |
| Soft local EWMA (not shared gossip) | Replacing gateway failover |

---

## 2. Proposed solution

### 2.1 Defense rings (consumer node)

| Ring | Purpose | Durable where |
|------|---------|----------------|
| **1. Hard deny / allow** | Operator policy: never / only these providers | `rating-config.json` |
| **2. Score survivors** | Rank by reliability-first math + local EWMA | Config + Badger |
| **3. Open loop + health policy** | Ping with strictness; on fail record local experience and try next | Runtime + Badger |
| **4. Local experience store** | Soft ± score and short cooldown for provider×model | **Badger** (`PROXY_STORAGE_PATH`) |

**Order of operations:**

1. Load active bids for model  
2. Apply denylist, then allowlist (if non-empty)  
3. Score remaining (on-chain + local EWMA + newcomer prior; dampened price; **no stake**)  
4. For each bid in rank order: if local cooldown active → skip to next; else ping under `healthPolicy`; if disqualified → record fail/cooldown → next; else open  
5. On open/prompt outcome visible to the node → update Badger EWMA  

### 2.2 Health strictness (three modes)

Too many modes were rejected; use **three**:

| Mode | Behavior |
|------|----------|
| **`permissive`** | **Default = today.** Skip only `unhealthy`, `tee_unverified`, `no_model`. `unknown` / missing report allowed. |
| **`preferred`** | If **any** peer reports `healthy` or `degraded`, **skip** `unknown` / missing. If none do, fall back to permissive for that open (don’t black-hole the model). |
| **`strict`** | Only try providers that report **`healthy`** for that model. |

**Degraded:** Treat as **serviceable** under `preferred` (capacity risk ≠ “don’t open”). Only `strict` excludes degraded.

#### Single-bid caveat

If after hard filters **only one bid** remains (or only one peer for the model):

- Do **not** apply `preferred` / `strict` in a way that yields **zero** attempts.  
- **Force `permissive` for that open** (or equivalent: allow unknown/degraded so the sole provider can still be tried).  
- Rationale: single-provider models must remain usable; HA/omit already no-ops when there is no alternate.

Document in config as `healthPolicySingleBid: "permissive"` (fixed or default).

**Qwen under `preferred`:** 5A42 unknown skipped → mordiem tried.  
**Qwen under `strict`:** only if mordiem reports `healthy`; if mordiem is `degraded`, sole remaining path should still open via single-bid leniency **or** operator accepts outage — prefer leniency when it is the only bid.  
**deepseek under `preferred`/`strict`:** healthy pack remains; degraded p2 skipped only in `strict`.

### 2.3 Scoring survivors (on-chain + local)

**Remove / zero:**

- **Stake** — new contract world: stake no longer means “invested cap on earnings”; do not use in score.  
- **Duration-as-volume** — stop treating cumulative `totalDuration` as stability.

**Keep / reshape:**

- Bayesian success: `(successCount + a) / (totalCount + a + b)`  
- TPS / TTFT vs model peers (existing z-score style)  
- **Dampened price:** `score = quality / price^α` with configurable `α` (default `1.0` = today; prod suggestion `< 1`)  
- **Newcomer prior:** low `totalCount` → mild exploration boost so new reliable cheap entrants can climb; unreliable newcomers stay down via local EWMA + success  

**Local EWMA (Badger), per `(provider, modelId)`:**

- Configurable half-life / window (e.g. 1 day fails, 1 week successes — knobs in rating-config)  
- If pair unused for the window → influence → 0 (no permanent scarring)  
- Soft multiplier on score; optional **cooldown** (“don’t try first for N minutes”) after hard ping/open fail  
- **Must not** write into deny/allow lists  

Wiping Badger (corruption recovery / fresh volume) = cold start; impact acceptable.

### 2.4 Age on network

Soft only: young provider / new bid with thin samples gets a **small** boost so they can be tried and, if reliable, climb quickly. Not a permanent handicap for incumbents with good local+chain signal; not “bully new entrants away.”

### 2.5 APIGW interaction

If the C-Node implements the above well:

- **Cold opens:** APIGW does not need active.mor.org bid filtering or multi-omit.  
- **Mid-prompt failure:** APIGW keeps today’s failover + single `omitProvider` for that reopen; C-Node records local fail on the omitted provider×model and self-protects afterward.  
- Optional later: multi-omit — only if product still needs it.

---

## 3. Suggested `rating-config.json` extensions (additive)

Defaults preserve today’s behavior.

```json
{
  "$schema": "./internal/rating/rating-config-schema.json",
  "algorithm": "default",
  "providerAllowlist": [],
  "providerDenylist": [],
  "params": {
    "weights": {
      "tps": 0.30,
      "ttft": 0.10,
      "duration": 0.0,
      "success": 0.60,
      "stake": 0.0
    },
    "priceExponent": 1.0,
    "healthPolicy": "permissive",
    "healthPolicySingleBid": "permissive",
    "newcomer": {
      "maxSampleCount": 30,
      "scoreBoost": 0.1
    },
    "localExperience": {
      "enabled": false,
      "failHalfLifeSecs": 86400,
      "successHalfLifeSecs": 604800,
      "cooldownSecs": 900,
      "maxScoreBoost": 0.3,
      "maxScorePenalty": 0.5
    }
  }
}
```

**Precedence:** deny wins → allow (if non-empty) → score → try loop with health + cooldown.

Update `rating-config-schema.json`, `docs/reference/rating-config.mdx`, and unit tests accordingly.

---

## 4. Badger local experience (sketch)

- **Path:** existing Badger under `PROXY_STORAGE_PATH` (default `./data/badger/`).  
- **Key:** e.g. `rating/exp/<providerHex>/<modelIdHex>`  
- **Value:** EWMA success/fail signals, `lastUpdated`, optional `cooldownUntil`  
- **Writers:** ping disqualify, open fail, (optional) first-prompt failure if already visible in proxy-router  
- **Readers:** scoring step + try-loop cooldown check  
- **Not shared** across nodes; not synced to chain  

---

## 5. Validation scenarios

### 5.1 Qwen 2.5 7B (2 providers)

| Config | Expected cold-open first try |
|--------|------------------------------|
| Today / `permissive` | `0x5A42` (cheap unknown) |
| `preferred` + local off | `0x5A37` (skip unknown while degraded/healthy peer exists) |
| After forced fail on 5A42 with local on | Cooldown / penalty → next opens prefer 5A37 without deny list |

### 5.2 deepseek-v4-flash (5 providers)

| Config | Expected |
|--------|----------|
| `permissive` / `preferred` | Healthy cheap leader remains first among scored peers |
| `strict` | Degraded peer not tried; healthy set unchanged order by score |
| After mid-session fail + omit + local | Failed provider×model deprioritized for cooldown window; not permanently denied |

### 5.3 Single-bid model

Any `healthPolicy`: still attempts the sole bid (unknown/degraded allowed via `healthPolicySingleBid`).

---

## 6. Implementation prompt (for another developer / agent)

Copy-paste:

```text
Implement the Consumer C-Node “bid selection defense rings” design in
Morpheus-Lumerin-Node as specified in:

  .ai-docs/CNODE_RATING_DEFENSE_RINGS.md

Constraints:
- Preserve today’s behavior when using default config (permissive health,
  empty deny/allow, priceExponent 1.0, localExperience.enabled false,
  current weight sums = 1).
- Do NOT add APIGW-only active.mor.org cold-open filtering in this work.
- Do NOT make local experience a permanent deny list — soft EWMA + optional
  cooldown only; persist in existing Badger (PROXY_STORAGE_PATH).
- Drop stake from scoring influence (weight 0 / ignore); stop using
  cumulative duration as a positive stability signal (weight 0 or remove).
- healthPolicy: permissive | preferred | strict, with single-bid forced
  permissive behavior as documented.
- providerDenylist + existing providerAllowlist; deny then allow.
- Update JSON schema, docs/reference/rating-config.mdx, and unit tests
  (rating package + open/ping gate tests for health policy and single-bid).
- Add focused tests for: Qwen-like unknown+healthy/degraded pair under
  preferred; single-bid unknown still opens; local cooldown deprioritizes
  without removing from allow set.

Validate:
- go test ./internal/rating/... and relevant blockchainapi tests
- Manual or integration: with preferred policy, unknown peer skipped when
  a reported peer exists; after simulated fail, Badger key appears and
  ranking shifts until half-life/cooldown elapses
- Confirm APIGW failover omit path still works unchanged

Deliver a small PR series to origin/dev if possible:
  (1) schema + denylist + healthPolicy gating
  (2) scoring math (priceExponent, weights)
  (3) Badger local experience
```

---

## 7. Open questions (non-blocking)

1. Exact default half-lives for prod vs Node Neo presets.  
2. Whether first-token / prompt failure inside proxy-router should update EWMA (stronger self-defense) or only open/ping failures in v1.  
3. Future: on-chain windowed stats (contract) — complementary, not required for this design.  
4. Future: `omitProviders[]` — only if single omit + local EWMA proves insufficient for HA clients.

---

## 8. Decision ask

Approve this design for implementation on `dev` (proxy-router). No APIGW changes required for phase 1 beyond existing failover `omitProvider`.
