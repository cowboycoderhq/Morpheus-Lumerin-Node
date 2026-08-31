# Remaining blind-review findings, by category

Source: seven blind reviewers over the history-free packet, all 5/5 on planted
controls. Items already fixed on this branch are excluded. Nothing here is
actioned — this is the decision list.

Severity is by **harm to a reader who acts on the claim**, not by how wrong it is.

---

## A. Security and trust claims that overstate the code (11)

The pattern: a control is described as enforced, frozen, or cryptographically
guaranteed, and the code does something weaker. These matter most because a
reader stops looking for a risk the doc says is handled.

| Where | Claim | What the code does |
|---|---|---|
| `tee-backend-verification.mdx:41` **EDITED — NOT SIGNED OFF** (awaiting external review) | "swapping, adding or removing any model fails verification" | Rewritten. The premise was true (RTMR3 does cover the compose byte-for-byte) but the conclusion did not follow: the expected value is recomputed from the compose the backend serves, not compared to a published one. Now states what it does prove — the reported compose is the one measured into its own quote — and links to the page's own gap table. |
| `tee-backend-verification.mdx:209` **EDITED — NOT SIGNED OFF** (awaiting external review) | "a cryptographic guarantee … exactly the declared set of models" | Rewritten to separate what is proven (authentic image, self-consistent workload, registers unfakeable) from what is not (which models the compose ought to declare), citing `NoopGoldenSource` at `cmd/main.go:342`. Check 4's row in the summary table carried the same overclaim and was corrected too. |
| `tee-reference.mdx:21` | "-tee image: blockchain config is frozen and cannot be changed at runtime" | `Dockerfile.tee:9-19` sets them as ordinary `ENV` defaults; `loader.go:39-64` reads every env-tagged field from `os.Getenv` with no allowlist, plus `godotenv.Load(".env")` and CLI flags |
| `tee-reference.mdx:35` | "Only **5 variables** are configurable at runtime" | Nothing restricts which variables `usr/.env` may set. The 5-name list is an assertion in the signed manifest, not a mechanism |
| `env-proxy-router.mdx:87, 157, 141` | `PROXY_STORE_CHAT_CONTEXT` and the log vars are "frozen / cannot be overridden / have no effect" in `-tee` images | Dockerfile `ENV` is an image **default**, overridable by `docker run -e`. In an attested SecretVM an override is *detectable* (compose measured into RTMR3) — but detectable is not prevented, and outside attestation it is neither |
| `api-overview.mdx:24`, `api-auth.mdx:103` | "All endpoints require HTTP Basic Auth" | Five routes register with no `CheckAuth` and the global middleware is commented out (`http.go:67-85`): `GET /healthcheck`, `POST /proxy/provider/ping`, `POST /auth/users/request`, `GET /auth/cookie/path`, `GET /swagger/*any`. **`/auth/cookie/path` returns the admin credential file path.** Both pages contradict their own correct lists elsewhere |
| ~~`c-node-setup.mdx:53`~~ **RESOLVED 2026-08-24** | Claimed the router creates a `.cookie` with a random password | **The page was correct** — it supplies its own `.env` block, which does not set `COOKIE_CONTENT`. The real defect was one page over: `proxy-router-docker.mdx:31` called the credentials "auto-generated" while instructing the copy that hard-codes them. Fixed, and all four source-install pages now tell the reader to delete the line (the router then generates a random 32-char password) and how to read it with `cat .cookie`. The packaged desktop app was never affected. Still open as a SOURCE issue: `.env.example` ships the value and `.env.example.win` does not. |
| `architecture.mdx:63` | Port table: "8082 (HTTP) — Consumer proxy-router — **Loopback**" | Default bind is all-interfaces: `config.go:180-181` `0.0.0.0:8082`, and the desktop app sets the same. The admin/wallet API is LAN-reachable by default |
| `secretvm-quickstart.mdx:100` | CLI deploy uses `--docker-compose proxy-router/docker-compose.tee.yml` | That template pins `:latest`. CI computes the golden RTMR3 from a **digest-substituted** file. Deploying the template yields an RTMR3 that cannot match the published manifest — contradicting the page's own warning at `:52-55` |
| `tee-backend-verification.mdx:292` **NEW — found by the external coherence lane, in no reviewer's findings** | "the inference API uses a separate certificate whose integrity is covered by workload verification" | The Caddy config being measured makes a *config change* detectable, but the inference client does not pin: `aiengine/ai_engine.go:64` passes nil and `openai.go:39` builds a bare `http.Client{}`. Interception on the live inference path is not detected at connection time. The same repo's architecture doc states this plainly; this page implies cover. |
| `.ai-docs/TEE_Attestation_Architecture.md:205, 651` | Consumer verification includes "baked_env checks" comparing `PROXY_STORE_CHAT_CONTEXT`, `ENVIRONMENT`, chain id | `BakedEnv` is declared at `golden.go:48` and **never read** — one hit repo-wide. No such comparison exists, so §1's "logging disabled and cannot be re-enabled" is not machine-enforced |
| `.ai-docs/TEE_Attestation_Architecture.md:745` | NRAS GPU attestation is "non-fatal on network failure" | `backend_verifier.go:244-246` treats any NRAS error as fatal — `storeFailure` then abort. The same document says "Fatal if unreachable" at `:58` |

## B. Wrong values and stale pins (9)

| Where | Says | Is |
|---|---|---|
| `secretvm-quickstart.mdx:144` | provider min stake `0.2` on a **Base mainnet** page | `0.1` mainnet; `0.2` is the Sepolia value. `register-onchain.mdx:74` has it right |
| `tee-reference.mdx:282` | `SECRETVM_RELEASE=v0.0.25` | `v0.0.31` (`secretvm.env:22`). The same page says v0.0.31 at `:323` |
| `tee-reference.mdx:283` | `SECRETVM_ROOTFS_VARIANT=rootfs-prod-tdx` | `rootfs-prod`. The same page says so at `:330` |
| `.ai-docs/TEE_Attestation_Architecture.md:830, 838` | pins v0.0.25 / v0.0.27 as done | v0.0.31 |
| `.ai-docs/TEE_CICD…:352` | "SecretVM v0.0.27 pin — Done" | v0.0.31; the doc self-corrects at `:7` but the status table still asserts it |
| `.ai-docs/TEE_Attestation_Architecture.md:743` | NRAS path `/v2/attest/gpu` | `/v4/attest/gpu` (`nras_verifier.go:18`) |
| `.ai-docs/TEE_Attestation_Architecture.md:960`, `sev-verification.mdx:24`, `TEE_CICD…:155, 354` | SEV/TDX registry on `raw.githubusercontent.com/scrtlabs/secretvm-verify` | jsDelivr npm mirror (`sev_registry.go:17`, `artifacts_registry.go:20`). `secretvm.env:5` records the GitHub repo was removed |
| `TESTING.md:92` | `MIN_REQUEST_SECONDS = 360` | `305` (`Chat.tsx:739`) |
| `inference-…-rfp.md:44, 284` | bid fee `0.3` for the **mainnet** product it scopes | `0.1` mainnet; `0.3` is Sepolia |

## C. Commands, paths and instructions that do not work (8)

| Where | Problem |
|---|---|
| `quickstart.mdx:122`, `c-node-setup.mdx:77`, `running-local-agents.mdx:49` | "logs are in `./data/`" — `./data/` is the Badger store. File logging only happens when `LOG_FOLDER_PATH` is set, which `.env.example` never sets, and the file is `<folder>/<timestamp>/main.log`. No `proxy-router.log` is ever created |
| `cli/chat/README.md:41` | TUI is reached by running `chatgptui` — that string appears nowhere in the repo. The commands are `chat-local` and `chat` |
| `session-day-lock-upgrade-runbook.md:34` | `npm ci && npx hardhat compile` — `smart-contracts/` has no `package-lock.json`, only `yarn.lock`. `npm ci` aborts |
| `smart-contracts/README.md:3` | Describes "a sample contract, a test for it, and a Hardhat Ignition module" — no `ignition/` exists and the dep is not installed. It is the Hardhat template README, never replaced |
| `TESTING.md:26` | `npm install` in `ui-desktop/` — the repo pins yarn, bans the npm lockfile, and CI runs `yarn install --frozen-lockfile`. The kit's own README says yarn |
| `macos.mdx:27` | dependency table gives `yarn | any` — the repo pins `yarn@1.22.22` and ships a v1 lockfile. "any" invites Yarn Berry, which migrates the lockfile and defaults to PnP |
| `quickstart.mdx:21` | "Mainnet builds have no suffix; testnet builds end in `-test`" — every desktop asset is named from the bare version; the branch suffix only lands on the tag. Three sibling pages get it right |
| `networks-and-tokens.mdx:49` | "convert from ETH inside MorpheusUI" — no swap/on-ramp path exists anywhere in the app; the wallet offers send and receive only |

## D. "Complete", "enforced", "auto-generated" claims that are not (7)

| Where | Claim | Reality |
|---|---|---|
| `env-proxy-router.mdx:10` | "documents every variable" | 4 live vars have no row: `IPFS_DISABLED`, `IPFS_MULTADDR` (which MorpheusUI actively sets), `MULTICALL3_ADDR`, `RATING_CONFIG_CONTENT`. A 5th, `PROVIDER_ALLOW_LIST`, is read via `os.Getenv` |
| `env-proxy-router.mdx:155` | `MAX_CACHED_DESTS` with default `5` | The variable does not exist. One hit repo-wide: this doc line |
| `api-overview.mdx:34` | `swagger.yaml` is "auto-generated by `swag init` as part of every release build" | `swag init` is only in the manual `Makefile:41` target. Demonstrably stale: three registered routes are missing from the spec |
| `api-endpoints.mdx:220, 3, 148` | "the complete OpenAPI schema" | 91 Go registrations vs 87 spec operations |
| `models-config.mdx:10` | "schema enforced by `models-config-schema.json`" | No Go code loads it — it is an editor hint. Validation is struct tags. The page's own `apiType` list includes two values the schema's enum omits, so its two claims cannot both hold |
| `rating-config.mdx:23` | Same class, `rating-config-schema.json` | Enforcement is `ScorerDefaultParams.Validate()` |
| `.ai-docs/TEE_Attestation_Architecture.md:962` | Phase 2 pinned TLS client "returns PinnedHTTPClient for TEE models" | `ai_engine.go:64` passes `nil`; `openai.go:38-39` builds a bare client. The same document says NOT WIRED at `:63` and `:718` |

## E. Self-contradictions and inverted mechanics (10)

| Where | Problem |
|---|---|
| `session-states-open-close-recover.mdx:43` | `getUserStakesOnHold` documented as returning `(hold_, available_)`. It returns `(available_, hold_)` (`SessionRouter.sol:417-420`), and the Go client reads that order. A reader inverts the answer to "can I claim yet?" |
| `where-is-my-mor.mdx:50` | "Calling `withdrawUserStakes` yourself is optional… you submit the on-chain call yourself" — contradicts itself in one sentence; the auto-sweep is real |
| `session-states…:44`, `sessions-stake-close-recover.mdx:115`, `where-is-my-mor.mdx:63`, `why-locked-in-contract.mdx:25` | "If `fundingAccount` is empty or under-approved, **every** `closeSession` fails" — overbroad; direct-payment sessions never touch it |
| `architecture.mdx:80`, `what-is-morpheus.mdx:52` | Rating tracks "uptime" — no uptime metric exists; weights are tps/ttft/duration/success/stake |
| `gateway-for-everclaw.mdx:69` | "the C-Node closes the stuck session and returns the unused MOR" — only when failover is enabled, and the page's own open-session body omits it (defaults false) |
| `resale/overview.mdx:39`, `prosumers/overview.mdx:15`, `container-pnode.mdx:77` | An internal `:3333 → :8082` HTTP hop that does not exist; `:8082` is the same process's operator API. Also ":3333 is a tunnel" — it is one request/response per connection |
| `verify-setup.mdx:77` | 429 listed under "unhealthy" — a 429 now sets `degraded`. The status table also has no `degraded` or `tee_unverified` row |
| `model-health.mdx:120` | "`lastHealthy: 0` means never worked" — the field is `omitempty`, so zero is omitted entirely. `jq 'select(.lastHealthy==0)'` matches nothing |
| `model-health.mdx:89, 22` | "skipped = TTS, image, video" — probing covers LLM and embedding only, so STT is skipped too, and image/video are not model types |
| `pricing.mdx:72`, `registering-bid.mdx:59` | "delete the old bid then post a new one" — `postModelBid` already auto-deletes the previous active bid. The delete step is unnecessary |

## F. Ecosystem / third-party pages (8)

| Where | Problem |
|---|---|
| `attribution.mdx:3`, `overview.mdx:36` | Both promise "licenses"; the target page has no licence content at all |
| `attribution.mdx:14`, `overview.mdx:42` | "Mirrored pages are reviewed at least once per release" — 7 of 9 ecosystem pages are stamped v7.0.0 while others in the tree are v7.9.0 |
| `mor-org.mdx:6` + 6 siblings | `last_verified: v7.0.0` — the least-recently-verified group in the tree |
| `nodeneo.mdx:27` | "bundled local model" — model, inference server and IPFS are all downloaded at runtime. A sibling page says "downloaded on first launch" |
| `app-mor-org.mdx:32` | "optional **offline** local-only test" — first run downloads three components and dials the chain |
| `nodeneo.mdx:11` | "transitioning from nodeneo.io" while linking to nodeneo.io — the origin domain is missing |
| `active-status.mdx:38 vs :39` | `PricePerSecond` and `pricePerSecond` for the same field, one line apart |
| `myprovider.mdx:45` | "HTTP-only nodes: desktop app" — this repo's app hard-disables provider registration ("Coming soon"). Defensible only if it means MyProvider's own desktop build |

## G. Precision nits (11)

| Where | Problem |
|---|---|
| `api-endpoints.mdx:27` | Cites the commented middleware as `http.go:67-88`; it is `:67-85`. Every other citation on the page is exact |
| `troubleshooting.mdx:30` | "These four values must match" above a five-item list |
| `env-proxy-router.mdx:104, 124-125` | Presents network-selection values in a column headed "Default" on a page whose note says defaults come from `config.go`; the compiled default is the zero value |
| `env-proxy-router.mdx:169-172` | Four timeouts given as "(depends on release)" when the compiled defaults are explicit and unchanged |
| `env-proxy-router.mdx:67, 70` | Keychain fallback scoped "(macOS)"; the code branches only on whether a private key is set, and the library backs Linux and Windows too |
| `env-ui-desktop.mdx:31, 24` | `CHAIN_NAME` default `Base` and `DIAMOND_ADDRESS` — neither has a schema default; the value comes from the shipped sample |
| `TESTING.md:35, 44` | `npm run verify` description omits the frozen-value stage; "524 assertions" vs 526 call sites |
| `env-proxy-router.mdx:29` | `COOKIE_CONTENT` written with a trailing newline — it is written verbatim; the newline is only on the generated-password path |
| `CLAUDE.md:104` | Open item says the on-hold endpoint exists "only in the generated Go bindings" — `GET /blockchain/stakes/on-hold` is registered |
| `CLAUDE.md:56` | Visual gate described as covering visual files; it filters `.tsx|.css|/theme.` so `.jsx` renderer components are never gated |
| `README.md:212` | "None of them need a network" — the block's own `npm install` does, and `npm run isolate` needs a Playwright browser download on a cold machine |
