# Fix plan — 39 corroborated defects

Every fix below targets a defect that survived blind review, external (independent)
review, or a tie-break. Each is stated as an exact replacement so it can be checked
before it is applied. **Nothing here is applied yet.**

Grouped by root cause, not by file — most of these are one upstream change the
docs never absorbed.

---

## T1 — TLS binding moved to SPKI (commit `878ee3b4`) · 8 rows · `.ai-docs/`

One code change in July 2026 made the TLS binding compare the **SPKI digest**
first (full-certificate digest kept only as legacy), added a **re-attest** branch
when the cert rotates but the key does not, and added a **port fallback**. The
document still describes the pre-`878ee3b4` behaviour in six places. The word
"SPKI" appears nowhere in it.

**F1.1 · `TEE_Attestation_Architecture.md:55` (B02-009, S2)**
- OLD: `- TLS binding: compare TLS cert SHA-256 with CPU quote reportData[0:32]`
- NEW: `- TLS binding: compare SHA-256 of the peer certificate's **SPKI** (SubjectPublicKeyInfo DER) with CPU quote `reportData[0:32]`; the full-certificate digest is accepted only as a legacy fallback (`attestation/verifier.go:352-357`)`

**F1.2 · `:58` (B02-012, S1)**
- OLD: `- NVIDIA NRAS v4 API: submit GPU evidence for independent hardware validation (non-fatal if unreachable)`
- NEW: `- NVIDIA NRAS v4 API: submit GPU evidence for independent hardware validation. **Fatal if unreachable** — any NRAS error or `OverallResult == false` stores a failure snapshot and aborts (`attestation/backend_verifier.go:243-251`)`

**F1.3 · `:62` (B02-015, S2)**
- OLD: `- Mismatch on TLS fingerprint → immediate hard fail (MITM signal)`
- NEW: `- Mismatch on the full TLS fingerprint → re-attest if the **SPKI digest still matches** (certificate rotation over a TEE-resident key); hard fail only when the SPKI digest also differs (`backend_verifier.go:367-375`)`

**F1.4 · `:656` (B02-035, S2)** — inside a numbered walkthrough block
- OLD: `          peer TLS certificate — anti-MITM`
- NEW: `          peer TLS certificate's SPKI (full-cert digest is legacy) — anti-MITM`

**F1.5 · `:668` (B02-036, S2)**
- OLD: `5. If TLS fingerprint changed → hard fail (MITM signal), refuse to forward`
- NEW: `5. If the TLS fingerprint changed → re-run full verification when the SPKI digest matches; hard fail and refuse to forward only when the SPKI differs (`verifier.go:416-423`)`

**F1.6 · `:754` (B02-037, S2)**
- OLD: `- Always re-fetches `:21434/cpu` (~50 ms TLS handshake).`
- NEW: `- Always re-fetches the attestation endpoint's `/cpu` (~50 ms TLS handshake). The port is resolved by probing `21434` then falling back to `29343` (`backend_verifier.go:109-133`).`

**F1.7 · `:781` (B02-040, S3)**
- OLD: `- The TLS endpoint serving inference terminates inside the attested enclave (no CDN/reverse-proxy MITM can sit between the P-Node and the backend).`
- NEW: `- The TLS endpoint **probed during attestation** terminates inside the attested enclave. This does **not** currently extend to the inference connection: `aiengine/ai_engine.go:64` passes a nil HTTP client, so `openai.go:38-40` builds a default `http.Client` with no pinning. A TLS-terminating CDN in front of the backend would not be detected on the inference path.`

**F1.8 · `TEE_CICD_Supply_Chain_Hardening.md:184` (B03-006, S2)**
- Replace the clause `Consumers parse the live quote's `family_id` … `attestation.GoldenValues.MatchSEVMeasurement` does the lookup.`
- NEW: ``GoldenValues.MatchSEVMeasurement` exists (`attestation/golden.go:98`) but has **no callers**; it also matches on measurement value rather than `family_id`. The live consumer path compares only the legacy single `golden.Measurement` (`verifier.go:473-475`), so per-template SEV selection is not yet wired.`

---

## T2 — bid price floor `1e10` matches no deployment · 5 rows

`10000000000` wei/s appears in four places. Deployed config is `1e13` on Base
mainnet and `5e15` on Sepolia; `1e10` survives only in a **commented-out**
migration line. A bid at the documented floor reverts (`Marketplace.sol:80-84`).
Both bounds are owner-settable, so the fix cites the deployed config rather than
asserting a permanent constant.

**F2.1 · `providers/full/register-onchain.mdx:23` (B06-015)**
- OLD: `| `bidPricePerSecondMin` | `10000000000` | `0.00000001` MOR/sec |`
- NEW: `| `bidMinPricePerSecond` | `10000000000000` (Base mainnet, `deploy/data/config_base_mainnet.json:7`) | `0.00001` MOR/sec — Sepolia deploys `5e15`; both are owner-settable |`

**F2.2 · `providers/resale/registering-bid.mdx:34` (B07-033)** — same substitution.

**F2.3 · `ai/session-states-open-close-recover.mdx:91` (B10-008)**
- OLD: `- Bid price floor: **`10000000000` wei/sec** (`0.00000001` MOR/sec).`
- NEW: `- Bid price floor: **`10000000000000` wei/sec** on Base mainnet (`0.00001` MOR/sec); Base Sepolia deploys `5000000000000000`. Owner-settable via `setMinMaxBidPricePerSecond`.`

**F2.4 · `providers/resale/registering-bid.mdx:39` (B07-037 + B07-038)**
- OLD: `You **cannot** post below the floor. There is no upper limit, but consumer rating algorithms will skip you if you're far above other providers serving the same model.`
- NEW: `You **cannot** post below the floor **or above the ceiling** — `Marketplace.sol:80-84` reverts `MarketplaceBidPricePerSecondInvalid` outside `[bidMinPricePerSecond, bidMaxPricePerSecond]`, both owner-set. Within that band, consumer rating algorithms will still skip you if you are far above other providers serving the same model.`

---

## T3 — the "5 MOR session minimum" does not exist · 5 rows

No MOR-denominated session floor exists in any contract. The only open-time floor
is `MIN_SESSION_DURATION = 5 minutes` (`SessionStorage.sol:34`, enforced at
`SessionRouter.sol:147`). The "5" appears to be that duration misread as a token
amount. Required stake is **stipend-derived**, not `price × duration`.

**F3.1 · `concepts/sessions-stake-close-recover.mdx:145` (B09-015)**
- OLD: `- **Consumer session open**: `5` MOR minimum.`
- NEW: `- **Consumer session open**: no MOR-denominated minimum. The only contract floor is `MIN_SESSION_DURATION = 5 minutes` (`SessionStorage.sol:34`); the MOR required is derived from the bid price and the pool's stipend rate.`

**F3.2 · `concepts/tokens-and-fees.mdx:26` (B09-020 S1 + B09-021 S3)**
- Replace `Total = `pricePerSecond * sessionDuration` (minimum `5` MOR).`
- NEW: `In **pool mode** the escrow is `stipendToStake(pricePerSecond × sessionDuration)` = `cost × totalMORSupply × 100 / computeBalance` (`SessionRouter.sol:408-414`) — with shipped pool parameters this is far larger than `price × duration`. `price × duration` is the **direct-payment** figure. There is no MOR minimum; the only floor is a 5-minute duration.`

**F3.3 · `concepts/tokens-and-fees.mdx:62` (B09-026, S1)**
- OLD: `(minimum 5 MOR escrowed at open)`
- NEW: `(escrow is stipend-derived, not a flat minimum — see above)`

**F3.4 · `get-started/quickstart-consumer.mdx:57` (B10-022)**
- Replace `stake at least `5` MOR` → `stake the amount the app computes for your chosen bid and duration`
- Replace `click the **X** next to it` → `click **Close** next to it and confirm` (see F7.4)

---

## T4 — provider stake tiers · 3 rows

**F4.1 · `concepts/rewards-and-economics.mdx:30` (B09-004, S1)**
- OLD: ``PROVIDER_REWARD_LIMITER_PERIOD` (currently 1 day) caps how much a provider can earn per period proportional to their staked amount.`
- NEW: ``PROVIDER_REWARD_LIMITER_PERIOD` is **365 days** (`ProviderStorage.sol:21`). Within a period a provider can claim at most `stake − limitPeriodEarned` — i.e. **the full stake**, not a proportion of it (`SessionRouter.sol:383`). A provider who hits the cap waits up to a year, not a day.`

**F4.2 · `reference/glossary.mdx:32` (B04-119)**
- OLD: `A provider that has staked `10000` MOR (vs the standard `0.2`) and gets elevated marketplace standing.`
- NEW: `Informal term for a heavily-staked provider. **No on-chain tier exists** — `ProviderRegistry.sol:40-44` enforces one `providerMinimumStake` for everyone, and the rating stake-score saturates at 10× the minimum (`rating/scorer_default.go:67-69`), so stake beyond that buys no additional standing.`

**F4.3 · `ai/session-states-open-close-recover.mdx:90` (B10-007)**
- OLD: `- Provider stake (refundable): **0.2 MOR** (or **10000 MOR** for subnet).`
- NEW: `- Provider stake: **0.1 MOR** on Base mainnet (`config_base_mainnet.json:4`); Sepolia deploys `0.2`. No subnet tier exists. Refundable on deregistration, but only `stake − limitPeriodEarned` while the 365-day period is open (`ProviderRegistry.sol:99-105`).`

---

## T5 — derived addresses ARE supported · 3 rows

The import flow offers **10 derived accounts** (`ImportFlow.jsx:113`,
`handlers.ts:1014-1021`) and the wallet derives any supplied path
(`keychainwallet.go:163-176`). All three pages tell users the opposite, which
pushes them toward an unnecessary private-key workaround.

**F5.1 · `reference/troubleshooting.mdx:65` (B04-112, S1)**
- OLD: `The MorpheusUI mnemonic flow only works with **top-level (tier-1)** addresses.`
- NEW: `The import flow lets you pick any of 10 accounts derived from the mnemonic — make sure you selected the one holding your funds.`

**F5.2 · `consumers/troubleshooting.mdx:20` (B08-055)** — same correction.
**F5.3 · `get-started/networks-and-tokens.mdx:43` (B10-020)** — delete the "does not support secondary/derived addresses" sentence; replace with the account-picker note.

---

## T6 — on-hold stake is swept automatically · 2 rows

**F6.1 · `consumers/buy-bid.mdx:62` (B08-006)**
- Replace `After `releaseAt`, call `withdrawUserStakes(...)` on the Diamond — there is no HTTP route on the proxy-router.`
- NEW: `After `releaseAt` the proxy-router sweeps matured stake automatically every 10 minutes (`blockchainapi/stake_claimer.go`); `GET /blockchain/stakes/on-hold` reports the balance. Calling `withdrawUserStakes` yourself is possible but not required.`

**F6.2 · `smart-contracts/docs/inference-contract-enhancements-rfp.md:58` (B03-016)**
- Keep the two-transaction point (correct); replace `no proxy-router HTTP route exists today` with `the proxy-router now exposes `GET /blockchain/stakes/on-hold` and auto-sweeps matured stake (`controller.go:69`, `stake_claimer.go`)`.

---

## T7 — install / onboarding drift · 6 rows

**F7.1 · `consumers/install-from-source.mdx:41` (B08-013)** — `go` 1.22+ → **`go` 1.25+** (`proxy-router/go.mod:3`, CI pins `1.25.x`, `Dockerfile:2` uses `golang:1.25`).

**F7.2 · `consumers/install/docker.mdx:65` (B08-022)** — "the four blockchain values" → **five**, now enumerated and externally confirmed:
`DIAMOND_CONTRACT_ADDRESS`, `MOR_TOKEN_ADDRESS`, `BLOCKSCOUT_API_URL`, `ETH_NODE_CHAIN_ID`, **`ENVIRONMENT`**
(`proxy-router/.env.example:15-19,22-26`). `ETH_NODE_ADDRESS` is **not** among them — it is `omitempty` and blank in the template, so my original finding named the wrong fifth variable. The verdict was right; the reason is now corrected.

**F7.3 · `consumers/install/linux.mdx:15` (B08-025)** — delete `testnet builds end in -test`; the `-test` suffix lands on the **release tag**, never the asset filename (`build.yml:3090`).

**F7.4 · `install/linux.mdx:25` (B08-026) + `install/windows.mdx:21` (B08-036)** — the **Starting services** screen with Skip/Retry was replaced by a phase wizard titled *"Setting up your AI assistant"* with **Try again** / **Continue anyway** (`SetupWizard.tsx:2,293`). Keep the download-ordering and Docker-detect-only sentences — both verified true.

**F7.5 · `consumers/quickstart.mdx:83` (B08-051)** — the **X** → a text **Close** button plus a confirmation panel in the drawer's Sessions tab (`ChatHistory.tsx:386-393`).

---

## T8 — this repo's own tooling docs · 4 rows

**F8.1 · `CLAUDE.md:14-16` (B01-013)** — `node_modules` is described as a SYMLINK to a sibling clone; it is a real directory (813 entries). Replace with a plain `yarn install` instruction. *(Also corrects the `npm install` in the same sentence — the repo pins `yarn@1.22.22` and `.gitignore` bans `package-lock.json`.)*

**F8.2 · `ui-verify/README.md:13` (B12-029)** — `(cd ui-desktop && npm install)` → `(cd ui-desktop && yarn install)`.

**F8.3 · `ui-verify/README.md:55` (B12-038)** — reachability is walked from **`main.tsx`**, not `App.tsx` (`frozen-values.mjs:38`). The distinction is material: `main.tsx` reaches components `App.tsx` does not.

**F8.4 · `ui-verify/TESTING.md:6` (B12-040)** — "Every commit also passes `typecheck` + `electron-vite build`" describes a gate that **does not exist**: no `.git/hooks/pre-commit`, `core.hooksPath` unset, no tracked installer, and no `typecheck` step in CI. Either install the hook or state that the check is manual. **Recommend stating it is manual** — documenting an imaginary gate is what this row is.

---

## T9 — remaining · 3 rows

**F9.1 · `reference/api-auth.mdx:10` (B04-009)** — "API access requires authentication" → note the **five** unauthenticated routes: `GET /healthcheck`, `POST /proxy/provider/ping`, `POST /auth/users/request`, `GET /auth/cookie/path`, `GET /swagger/*any`. *(The fifth was found by the external reviewer; my own pass listed four.)*

**F9.2 · `providers/full/proxy-router-akash.mdx:37` (B06-043)** — minimum image `v2.3.0` conflicts with the page's own `last_verified: v7.0.0` and its linked SDL pinning `v3.0.0`. Raise to `v3.0.0` and note it as the SDL's pin.

**F9.3 · `prosumers/gateway-for-everclaw.mdx:70` (B07-011, S1)** — "detect 401/403/429" → the C-Node maps **every** adapter error, including session-expired, to **HTTP 500** (`controller_http.go:281-284`). Agents must key on the response body or re-check session state, not the status code.

---

## External review status

The whole plan was fact-checked by **external reviewer A** (independent, own tool access), asked
not whether the old text was wrong but whether **the proposed replacement is
accurate** — including the file:line citations inside each proposal.

**20 of 25 items checked: all ACCURATE.** No proposal was returned INACCURATE or
OVERSTATED, and no cited line number was wrong.

The remaining five went unchecked when the session expired. Three of those carry
independent corroboration from earlier rounds and one I verified by hand:

| Item | Status |
|---|---|
| F9.1 unauthenticated routes | **corroborated** — tie-break T2 independently enumerated the same five, incl. `GET /swagger/*any` |
| F9.3 C-Node returns 500 | **corroborated** — round-2 blind review reached this independently |
| F8.4 no pre-commit hook | **verified by hand** — I ran the git commands myself |
| F8.3 frozen-values ENTRY | **single-source** — rests on one in-family model pass plus external reviewer A's own contradicting-itself evidence |
| F9.2 Akash SDL v3.0.0 | **single-source** — unreviewed |

F8.3 and F9.2 are the only two fixes here with no second opinion. Both are S3.

---

## Not fixed here, and why

- **The unwired `PinnedHTTPClient` is a code gap, not a doc gap.** F1.7 makes it
  visible. Closing it means wiring `aiengine` to the pinned client, or deciding
  the control is not wanted. That is a product decision.
- **`B08-035`** (asset-name line) is AMBIGUOUS — two clauses, one right and one
  wrong. It needs the row split before it can be fixed cleanly.
- **69 uncorroborated defects** remain unfixed. They rest on a single in-family model pass
  and, at the measured 83% precision, roughly one in six would not survive review.
