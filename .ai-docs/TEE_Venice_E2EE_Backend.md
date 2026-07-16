# Venice E2EE — A Second TEE Backend Flavor for the Attested P-Node

**Status:** v0.1 — Research / design sketch. **Discussion only — nothing implemented.**
**Last updated:** 2026-06-17
**Companion doc:** [`TEE_Attestation_Architecture.md`](./TEE_Attestation_Architecture.md) (the shipped SecretVM two-hop chain this builds on)

> **One-line summary:** The attested P-Node already plays the role of an "attestation-verifying TEE client" when it talks to its SecretVM backend (Phase 2). Venice's E2EE protocol asks for a client that does the *same job* with a different attestation flavor and an added app-layer encryption envelope. So we can add Venice as a **second backend flavor**, selected cleanly by `apiType`, without touching the SecretVM path.

---

## 1. Intent

Let a Morpheus provider, running its proxy-router (**P-Node**) inside a SecretVM TDX/SEV enclave, serve **Venice TEE / E2EE models** to MOR-marketplace consumers — with the P-Node acting as Venice's E2EE client.

The privacy properties compose into a single unbroken chain:

```
Consumer ──(Phase 1: SecretVM attest + pinned TLS)──▶ P-Node enclave ──(Venice E2EE: ECDH/AES-256-GCM)──▶ Venice TDX enclave
   C-Node                                              proxy-router (-tee)                         NEAR AI Cloud / Phala
```

**Why this is sound:** the P-Node must decrypt Venice's response to re-stream it to the consumer over the MOR protocol — so plaintext *does* exist briefly inside the P-Node. That is acceptable **only because the consumer already attested the P-Node in Phase 1**. Plaintext therefore never sits on any *untrusted* hop:

- Consumer → P-Node: protected by Phase 1 SecretVM attestation + TLS pinning.
- P-Node → Venice: protected by Venice's client-side ECDH/AES-GCM envelope (Venice's proxy only ever sees ciphertext).

This feature is **only meaningful for `tee`-tagged providers** (P-Node inside SecretVM). A plain (non-TEE) provider doing Venice E2EE would expose plaintext on its own host the instant it decrypts — defeating the point.

### Non-goals

- Replacing or weakening the SecretVM backend path. The SecretVM Phase 2 chain must keep working unchanged.
- Re-implementing Venice's billing/account model. The provider holds a Venice API key and resells capacity (resale-provider economics — out of scope here).
- Client-side changes. As with the existing chain, a v6.0.0+ consumer benefits transparently; no UI/consumer upgrade is required to talk to a Venice-backed provider.

---

## 2. Background — what already exists (and why it matters)

The shipped two-hop chain (see companion doc) is driven by the single on-chain `tee` model tag:

- **Phase 1:** consumer verifies the P-Node (`attestation/verifier.go`, called from `blockchainapi/service.go`, `proxyapi/proxy_sender.go`).
- **Phase 2:** the P-Node verifies its **own backend LLM** on startup and on every prompt (`attestation/backend_verifier.go`: `AttestBackend`, `FastVerifyBackend`, `PinnedHTTPClient`).

The Phase 2 hot path is already a clean interface seam:

```go
// proxy-router/internal/proxyapi/proxy_receiver.go
type BackendTEEVerifier interface {
    FastVerifyBackend(ctx context.Context, modelID string) error
}

if s.backendVerifier != nil && session.IsTee() {
    if verifyErr := s.backendVerifier.FastVerifyBackend(ctx, session.ModelID().Hex()); verifyErr != nil {
        return handleError(verifyErr, "LLM TEE verification failed", sourceLog)
    }
}
```

**Key insight:** in Phase 2 the P-Node already (a) fetches a remote TEE's attestation quote, (b) verifies it, (c) pins the channel, and (d) only then forwards inference. Venice's "E2EE client" does the same four steps with a different attestation source and an added encryption layer. We are adding a *flavor*, not a new concept.

---

## 3. Steering — clean separation via `apiType`

Backend behavior is already selected by `apiType` in `ApiAdapterFactory` (`aiengine/factory.go`). Today there are **6 registered adapters**, of which **4 are exposed in the config schema enum**:

| `apiType` constant | string | In `models-config-schema.json` enum? | Notes |
|---|---|---|---|
| `API_TYPE_OPENAI` | `openai` | ✅ | Default LLM forwarder (streaming SSE) |
| `API_TYPE_CLAUDEAI` | `claudeai` | ✅ | Anthropic Messages API |
| `API_TYPE_PRODIA_V2` | `prodia-v2` | ✅ | Image gen |
| `API_TYPE_HYPERBOLIC_SD` | `hyperbolic-sd` | ✅ | Image gen |
| `API_TYPE_PRODIA_SDXL` | `prodia-sdxl` | ❌ (legacy) | Registered in factory, not in schema enum |
| `API_TYPE_PRODIA_SD` | `prodia-sd` | ❌ (legacy) | Registered in factory, not in schema enum |

**Proposal: add a 7th —** `API_TYPE_VENICE_E2EE = "venice-e2ee"` (and add it to the schema enum). This is the entire "steering" mechanism:

- The adapter type fully determines the *transport + attestation flavor*. No overloading of the `tee` tag, no string-sniffing of URLs.
- `DeriveAttestationURL()` (which today hard-codes the SecretVM `:29343` convention) is bypassed for `venice-e2ee`; the Venice verifier owns its own endpoint derivation (`/api/v1/tee/attestation?model=&nonce=`).
- The on-chain `tee` tag remains the single master switch for "this session must be verified." The *how* is read off `apiType` locally.

```
                          on-chain tag "tee"  ──▶  session.IsTee() == true
                                                          │
                            ┌─────────────────────────────┴───────────────────────────┐
              apiType == "openai" (+ SecretVM)                        apiType == "venice-e2ee"
                            │                                                           │
              BackendVerifier (SecretVM)                          VeniceBackendVerifier (Venice)
              :29343/cpu, RTMR3 replay,                           /tee/attestation, signing-key
              TLS pinning, GPU NRAS                                binding, ECDH/AES-GCM envelope
```

Both verifiers satisfy the **same** `BackendTEEVerifier` interface → the `proxy_receiver` hot path is untouched. A small dispatcher (map `modelID → verifier flavor`, chosen at startup from `apiType`) routes `FastVerifyBackend` to the right implementation.

---

## 4. Venice protocol (as published)

Source: [Venice — TEE & E2EE Models](https://docs.venice.ai/guides/features/tee-e2ee-models) · [launch blog](https://venice.ai/blog/venice-launches-end-to-end-encrypted-ai). Venice's TEE partners are **NEAR AI Cloud** and **Phala Network** (Intel TDX + NVIDIA GPU enclaves). Model naming: `tee-*` (enclave only) and `e2ee-*` (enclave + client-side encryption).

**Attestation handshake** — `GET https://api.venice.ai/api/v1/tee/attestation?model=<m>&nonce=<32-byte hex>`:

| Field | Meaning |
|---|---|
| `verified` | Venice's server-side verification result |
| `nonce` | echoes the client nonce (freshness / anti-replay) |
| `intel_quote` | raw Intel TDX quote (base64) for **client-side** verification |
| `nvidia_payload` | NVIDIA GPU attestation data (if applicable) |
| `signing_key` | enclave public key (for response-signature verification / E2EE key agreement) |
| `signing_address` | Ethereum address derived from `signing_key`, bound in the quote `REPORTDATA` |

Client verification: confirm the nonce appears in `REPORTDATA`, confirm `signing_address` binding, **reject debug-mode TEEs**, optionally validate `intel_quote` against Intel TDX roots independently.

**E2EE message flow** (only `user`/`system` messages encrypted; assistant messages are not):

1. Generate ephemeral **secp256k1** keypair (per session/message; private key in memory only, zeroed after use).
2. ECDH(clientPriv, modelPub) → **HKDF-SHA256** (info `ecdsa_encryption`) → **AES-256-GCM** key.
3. Payload framing (hex): `[ephemeral pubkey 65B] + [nonce 12B] + [ciphertext+tag]`.
4. Headers: `X-Venice-TEE-Client-Pub-Key` (uncompressed, 130 hex), `X-Venice-TEE-Model-Pub-Key`, `X-Venice-TEE-Signing-Algo: ecdsa`.
5. **`stream: true` is required.** Response is per-chunk encrypted SSE: each chunk is `hex(ephemeralPub + nonce + ciphertext)`, decrypted client-side. E2EE disables web search, memory, and tool flows (they need plaintext outside the enclave).

**Bonus — response signing:** Venice `e2ee-*` models sign `promptHash:responseHash` with the enclave key (Ethereum `personal_sign`), verifiable via `GET /api/v1/tee/signature?...`. See [terriclaw/onlyagent](https://github.com/terriclaw/onlyagent). This is effectively the "verifiable per-message signing" Morpheus deferred to Phase 2b (companion doc §7.6) — available for free on Venice endpoints.

Reference client implementations to study (do **not** vendor blindly — these are community / "vibecoded"): [elkimek/venice-e2ee](https://github.com/elkimek/venice-e2ee) (TS, client-side quote verification), [x1m4x/e2ee-llm-proxy](https://github.com/x1m4x/e2ee-llm-proxy) (local OpenAI-compatible proxy).

---

## 5. SecretVM vs Venice — what maps and what doesn't

| Aspect | SecretVM backend (today) | Venice E2EE backend (proposed) |
|---|---|---|
| Attestation endpoint | `https://host:29343/cpu`, `/gpu`, `/docker-compose` | `GET /api/v1/tee/attestation?model=&nonce=` |
| Quote format | raw TDX hex (TDX) / base64 (SEV) | `intel_quote` base64 (TDX) + `nvidia_payload` |
| Channel binding | `reportData[0:32]` = SHA-256(TLS cert) → TLS pinning | `signing_address` bound in `REPORTDATA`; nonce freshness |
| Workload integrity | **RTMR3 replay** of `compose+rootfs` vs **cosign-signed Morpheus golden** | **Not available** — we don't build Venice's image; no Morpheus golden |
| GPU trust | CPU-GPU nonce binding + NVIDIA NRAS | `nvidia_payload` (verify against NRAS independently) |
| Transport privacy | pinned TLS only | pinned/validated TLS **+ app-layer ECDH/AES-256-GCM** |
| Response provenance | deferred (§7.6) | per-request enclave signature `promptHash:responseHash` |
| Streaming | optional | **mandatory** |

The honest gap: **there is no Morpheus-controlled golden measurement for a Venice workload.** "Verified" for a Venice model means *genuine Intel TDX enclave + signing-key binding + debug-mode rejection (+ optional local quote parse against Intel roots)* — **not** "exact known-good Morpheus workload" like SecretVM gives. That semantic difference must be surfaced (see §8).

---

## 6. The work (file-level sketch)

All additive; the SecretVM path is untouched.

**A. New AI-engine adapter** — `proxy-router/internal/aiengine/venice_e2ee.go`
- Implements the existing `AIEngineStream` interface (`Prompt`, `Embeddings`, etc.; `ApiType() == "venice-e2ee"`).
- Internals: ephemeral keygen, attestation fetch+verify (delegated to the verifier below), AES-GCM encrypt of `user`/`system` messages, set `X-Venice-TEE-*` headers, force `stream: true`, decrypt per-chunk SSE back into the standard `gcs.ChatCompletionStreamResponseExtra` chunks the pipeline already emits.
- Reuses the OpenAI adapter's SSE plumbing pattern (`openai.go::readStream`) for the framing/decrypt loop.
- Register in `aiengine/factory.go::ApiAdapterFactory`; add `venice-e2ee` to `config/models-config-schema.json` enum.

**B. New attestation verifier flavor** — `proxy-router/internal/attestation/venice_verifier.go`
- Satisfies `BackendTEEVerifier` (`FastVerifyBackend`) and a Venice-shaped `AttestBackend` analog.
- Checks: nonce-in-`REPORTDATA`, `signing_address` binding, debug-mode rejection; optional in-process Intel TDX quote parse (overlaps with companion §Phase 2b.4 "local quote verification in Go").
- Caches `{signing_key, signing_address, quote_hash, verified_at}` per model; fast path re-fetches attestation and compares (analogous to SecretVM `FastVerifyBackend`).
- Reuses TDX parsing in `attestation/tdx_quote.go` where possible.

**C. Verifier dispatch** — small change at startup wiring (`cmd/main.go`) + the `proxy_receiver` injection point
- Build a `map[modelID]BackendTEEVerifier` keyed off each TEE model's `apiType` (`openai`+SecretVM vs `venice-e2ee`).
- `proxy_receiver.SessionPrompt` keeps calling `FastVerifyBackend` exactly as today — it just resolves to the right flavor. (Either via a composite verifier that dispatches internally, or by setting the correct verifier per session.)

**D. Crypto envelope helpers** — `proxy-router/internal/attestation/venice_crypto.go` (or `lib/`)
- secp256k1 ECDH (reuse go-ethereum's `crypto`/`btcec`), HKDF-SHA256 (`golang.org/x/crypto/hkdf`), AES-256-GCM (stdlib). Frame/parse `ephemeralPub‖nonce‖ciphertext`. Zeroize private keys.

**E. Config / secrets**
- Venice API key as a runtime secret (mirrors `MODELS_CONFIG_CONTENT` handling; **never** baked into the image — it would otherwise land in RTMR3 / the attestation manifest). Add to `runtime_secrets_only` documentation.
- Optional env: `VENICE_ATTESTATION_URL` override, `VENICE_REQUIRE_LOCAL_QUOTE_VERIFY` (bool).

**F. Tests**
- Adapter encrypt/decrypt round-trip + streaming decode; verifier against captured Venice attestation fixtures; dispatch routing test (SecretVM vs Venice). Mirror the existing `attestation/*_test.go` fixture style.

**G. Docs / health**
- Extend `GET /v1/models/attestation` to report the Venice flavor's state (provider, signing_address, verified_at) distinctly from SecretVM fields.
- Provider how-to + consumer-facing note on what "verified" means for a Venice model.

---

## 7. Dependencies

| Dependency | Status | Notes |
|---|---|---|
| secp256k1 ECDH | ✅ in-tree | go-ethereum `crypto` / `btcec` already used for wallets |
| HKDF-SHA256 | ✅ available | `golang.org/x/crypto/hkdf` |
| AES-256-GCM | ✅ stdlib | `crypto/aes` + `crypto/cipher` |
| TDX quote parsing | ✅ in-tree | `attestation/tdx_quote.go` (extend for Venice's base64 `intel_quote`) |
| Intel TDX root verification (local) | ⚠️ optional / future | overlaps companion §Phase 2b.4; until then rely on Venice `verified` + signing binding |
| Venice account + API key | ⚠️ external | provider must hold a paid Venice key; resale economics TBD |
| Venice protocol stability | ⚠️ external | community libs are "vibecoded"; pin to the official docs and capture fixtures |
| NVIDIA NRAS (for `nvidia_payload`) | ✅ in-tree | `attestation/nras_verifier.go` already integrates NRAS v4 |

---

## 8. Tradeoffs & open decisions

1. **What does "verified" mean for a Venice model?** No Morpheus golden RTMR3. Options: (a) trust Venice `verified:true` + signing binding (weakest, fastest); (b) add local Intel TDX quote parse (stronger, more work, overlaps Phase 2b.4); (c) require a published Venice measurement allow-list maintained by Morpheus CI (strongest, most ops burden). **Recommendation:** ship (a)+(b), document the difference, and show a distinct consumer badge ("TEE: Venice/Phala" vs "TEE: Morpheus SecretVM").
2. **Badge / disclosure.** The consumer UI currently shows one TEE badge. Venice-backed models need a visibly different provenance label so users aren't misled into thinking it's a Morpheus-measured workload.
3. **Streaming-only.** The adapter must force `stream:true` and reject non-stream requests for `venice-e2ee` models. Confirm all consumer flows that hit these models stream (they do today).
4. **Feature loss.** Web search / memory / tools are unavailable in E2EE mode. If a model advertises tool use, don't tag it `venice-e2ee`.
5. **Where plaintext lives.** Only safe inside a SecretVM P-Node. **Decision:** gate `venice-e2ee` models so they're only servable by a `-tee` proxy-router image (refuse to start a `venice-e2ee` model on a non-TEE build, or at least loudly warn). Otherwise the privacy story is false.
6. **Key/secret hygiene.** Venice API key must be a runtime secret, never baked (would change RTMR3 / leak into the signed manifest). Ephemeral keys zeroed after use.
7. **Latency.** Per-message ECDH + AES-GCM + the attestation handshake add overhead; cache the attestation/session like the existing fast-verify and rotate keys on Venice's schedule (~1h per community proxies).
8. **Trust in Venice's `verified` flag vs. doing the math.** Until (b) lands, we're partially trusting Venice's own server-side verification — note this explicitly; it's the same caveat the community proxies carry.
9. **Resale economics & ToS.** Reselling Venice through MOR must comply with Venice's API terms; confirm before productionizing.

---

## 9. Recommendation

Feasible and architecturally clean. The shipped SecretVM work is exactly what makes it safe — the P-Node is already an attesting TEE client, so Venice is just a second backend flavor steered by `apiType`. Suggested sequencing:

1. **Spike:** prove the encrypt → send → decrypt-stream round-trip against one `e2ee-*` model from a throwaway Go program (validates crypto framing + headers).
2. **Adapter + verifier (flavor (a)):** land `venice-e2ee` adapter, `VeniceBackendVerifier`, dispatch, behind the `-tee`-only gate.
3. **Harden (flavor (b)):** in-process Intel TDX quote verification; distinct consumer badge.
4. **Optional:** surface Venice's `promptHash:responseHash` signature as Morpheus per-message provenance (closes part of §7.6).

Estimated effort: **M–L** — the crypto envelope, streaming decryption, and Venice quote parsing are the real work; the wiring (adapter registration + verifier dispatch) is small because the interfaces already exist.

---

## 10. Reference links

| Resource | URL |
|---|---|
| Companion: Morpheus SecretVM two-hop chain | [`TEE_Attestation_Architecture.md`](./TEE_Attestation_Architecture.md) |
| Phase 2 developer reference | [`proxy-router/docs/tee-backend-verification.md`](../proxy-router/docs/tee-backend-verification.md) |
| Venice — TEE & E2EE Models (protocol) | https://docs.venice.ai/guides/features/tee-e2ee-models |
| Venice — E2EE launch blog (NEAR AI Cloud + Phala) | https://venice.ai/blog/venice-launches-end-to-end-encrypted-ai |
| Venice E2EE TS reference (client-side quote verify) | https://github.com/elkimek/venice-e2ee |
| Venice E2EE local OpenAI-compatible proxy | https://github.com/x1m4x/e2ee-llm-proxy |
| Venice per-request enclave signing (`promptHash:responseHash`) | https://github.com/terriclaw/onlyagent |
| Morpheus TEE landing | https://tech.mor.org/tee.html |
| **Code seams** | |
| AI-engine adapter factory (steering) | `proxy-router/internal/aiengine/factory.go` |
| OpenAI adapter (SSE streaming pattern to mirror) | `proxy-router/internal/aiengine/openai.go` |
| `AIEngineStream` interface | `proxy-router/internal/aiengine/interfaces.go` |
| Models config schema (`apiType` enum) | `proxy-router/internal/config/models-config-schema.json` |
| Backend verifier (SecretVM flavor) | `proxy-router/internal/attestation/backend_verifier.go` |
| `BackendTEEVerifier` interface + hot path | `proxy-router/internal/proxyapi/proxy_receiver.go` |
| TDX quote parser (reuse for Venice `intel_quote`) | `proxy-router/internal/attestation/tdx_quote.go` |
| NVIDIA NRAS client (reuse for `nvidia_payload`) | `proxy-router/internal/attestation/nras_verifier.go` |
| Startup wiring | `proxy-router/cmd/main.go` |
