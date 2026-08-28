# What we would need to settle the parked findings

113 findings are parked because the deciding evidence is not in this repository.
113 were classified. They are grouped below **by the artifact needed**, because
one lookup usually closes several findings at once — that is the whole point of the
grouping. Ordered by how many findings each unlocks.

Generated 2026-08-26 17:09 UTC.

| what to fetch | findings it settles | effort |
|---|--:|---|
| settleable-in-repo | 103 | trivial, moderate |
| onchain-read | 4 | moderate |
| github-release | 3 | trivial |
| upstream-api | 1 | moderate |
| git-history | 1 | moderate |
| git-tags | 1 | trivial |

---

## settleable-in-repo — 103 finding(s)

### The marketplaceBidFee values in the Base mainnet and Base Sepolia deployment configs, likely smart-contracts/deploy/data/config_base_mainnet.json and config_base_sepolia.json.

_settles 3 finding(s)_

**What the answer means:** If mainnet is 0.1 MOR and Sepolia is 0.3 MOR, the quickstart is correct and the RFP's flat 0.3 is outdated/wrong. If both are 0.3 MOR, the RFP is correct and the quickstart is wrong.

- `a13cc36ae48d` **[S3]** [recurrence of 26555f497457] Marketplace bid fee in quickstart-provider.mdx
- `f46c9539efc8` **[S3]** [recurrence of 26555f497457] Marketplace bid fee amount in quickstart-provider.mdx
- `c44471d6c396` **[S3]** [recurrence of 26555f497457] Marketplace bid fee amount in pricing page (table in quickstart)

### ui-desktop/tools/ui-verify/package.json "verify" script and README/TESTING command descriptions

_settles 2 finding(s)_

**What the answer means:** If the verify script invokes logic, frozen, and isolate, README is correct and TESTING is incomplete/wrong; if it invokes only logic and isolate, TESTING is correct.

- `28e38c671dfe` **[S3]** `npm run verify` runs two suites vs three
- `da64f05b3c03` **[?]** README and TESTING disagree on whether `npm run verify` includes the frozen-values check

### The exact minimum-stake wording in docs/providers/full/secretvm-quickstart.mdx and the per-network wording in docs/providers/full/register-onchain.mdx.

_settles 1 finding(s)_

**What the answer means:** If secretvm-quickstart says 0.2 MOR with no network qualifier while register-onchain says mainnet 0.1 / Sepolia 0.2, the finding is real. If it qualifies by network, the finding is false.

- `db45f9123546` **[S3]** Provider minimum stake discrepancy

### The last_verified frontmatter in docs/ai/llm-prompt-cheatsheet.mdx plus git tag --list 'v7*' in this repository.

_settles 1 finding(s)_

**What the answer means:** If the frontmatter says v7.9.0 and no v7.9.0 tag exists, the finding is real. If it says v7.5.0 or a v7.9.0 tag exists, the finding is false.

- `23f2baa85d25` **[S3]** Non-existent version claimed in llm-prompt-cheatsheet last_verified

### The reward-limiter period constant in smart-contracts/contracts/diamond/storages/ProviderStorage.sol and the period sentence in docs/concepts/rewards-and-economics.mdx.

_settles 1 finding(s)_

**What the answer means:** If the contract constant is 365 days and the concept doc says 1 day, the contradiction is real. If the concept doc also says 365 days, or the constant is 1 day, the finding is false.

- `61028c4c5cd8` **[S3]** [recurrence of c690b0070bef] Provider reward limiter period length set to 365 days in contracts and documentat

### The direct-pay session duration branch in smart-contracts/contracts/diamond/facets/SessionRouter.sol and the proposed direct-pay formula in smart-contracts/docs/inference-contract-enhancements-rfp.md.

_settles 1 finding(s)_

**What the answer means:** If the RFP says direct-pay duration is amount / pricePerSecond while the code uses the stakeToStipend formula for direct-pay sessions, the finding is real. If the code has a separate direct-pay branch using amount / pricePerSecond, the finding is false.

- `9c1fdf684056` **[?]** Direct pay session duration calculation contradicts proposed enhancement

### The marketplaceBidFee value in the Base mainnet deployment config, likely smart-contracts/deploy/data/config_base_mainnet.json, and the Sepolia value if in scope.

_settles 1 finding(s)_

**What the answer means:** If mainnet config is 0.1 MOR and Sepolia is 0.3 MOR, the docs are correct and the RFP's uniform 0.3 is wrong/outdated. If mainnet config is 0.3 MOR, the RFP is correct and the docs are wrong.

- `d06af807032b` **[S3]** [recurrence of 26555f497457] Marketplace bid fee amounts differ between documentation and RFP

### The verify script definition in ui-desktop/tools/ui-verify/package.json (or the script's CLI implementation) and the descriptions in ui-desktop/tools/ui-verify/README.md and TESTING.md.

_settles 1 finding(s)_

**What the answer means:** If the script runs logic + frozen + isolate checks, README is correct and TESTING.md omits frozen. If it runs only logic + isolation, TESTING.md is correct and README is wrong.

- `1ee4a37d4a1a` **[S3]** Difference in description of npm run verify script

### The model-health report code at tag v7.0.0 of this repository, searching for rate_limited, modelName, httpStatus, and degraded, plus the two doc statements.

_settles 1 finding(s)_

**What the answer means:** If those fields are absent at v7.0.0, verify-setup.mdx is wrong and model-health.mdx is right. If they are present at v7.0.0, model-health.mdx's added-after-v7.4.0 claim is wrong.

- `55c6f435ee29` **[S4]** Availability of health check report fields in v7.0.0

### The opening product description in docs/index.mdx and the README's desktop-chat description.

_settles 1 finding(s)_

**What the answer means:** If index.mdx presents the hosted OpenAI-compatible API as a separate product and distinguishes it from the desktop chat app, the finding is false. If it presents the hosted API as the same software without distinction, the finding is real.

- `991706254d98` **[S4]** Consumer desktop chat vs. Inference API hosted product

### The secrets list in docs/providers/full/myprovider-gui.mdx compared with the lists in docs/providers/full/secretvm-quickstart.mdx and docs/providers/full/tee-reference.mdx.

_settles 1 finding(s)_

**What the answer means:** If myprovider-gui says five named secrets plus a separate MODELS_CONFIG_CONTENT value, the finding is real. If it says five total including MODELS_CONFIG_CONTENT, the finding is false.

- `d6511febdcd1` **[S3]** Number of required secrets for SecretVM deployment

### The stake auto-claimer source proxy-router/internal/blockchainapi/stake_claimer.go and the startup wiring that invokes it, e.g., proxy-router/main.go or controller setup.

_settles 1 finding(s)_

**What the answer means:** If the auto-claimer is started and calls withdrawUserStakes for matured on-hold stakes, the auto-sweep docs are correct and the concept doc's manual-only statement is wrong. If the file/loop does not exist or is never started, the concept doc is correct and the auto-sweep claims are false.

- `107926912dda` **[S3]** Automatic sweep of available on-hold stakes vs manual claim requirement

### The stake_claimer.go implementation and the code that starts it, checking specifically for a 10-minute ticker that calls withdrawUserStakes.

_settles 1 finding(s)_

**What the answer means:** If such a loop is active, the glossary auto-sweep wording is correct. If stake_claimer.go is absent or never invoked, the wording is false.

- `139b37215396` **[S4]** [re-audit 333397aba22c] Auto-sweep of userStakesOnHold by proxy-router

### The chat TUI implementation under cli/chat/ and the Interactive section of cli/chat/README.md.

_settles 1 finding(s)_

**What the answer means:** If the code has no ctrl+c/esc quit, no /clear command, and no OpenAI-key configuration fields, the README is describing a different UI and the finding is real. If those features exist, the finding is false.

- `e5ed2a0cb3d8` **[S3]** Chat UI documentation describes ChatGPTUI, not the actual TUI

### The consumer/proxy-router code path at tag v6.0.0 that connects to P-Nodes and performs TEE verification, searching for cosign, attestation, tdx, and Verify.

_settles 1 finding(s)_

**What the answer means:** If the v6.0.0+ consumer code contains a P-Node attestation/verification step, register-onchain is wrong and the other docs are right. If only P-Node to backend attestation exists, register-onchain is right and the other docs overstate.

- `e7d9e8954327` **[S4]** TEE Phase 1 consumer-side attestation: implemented vs not implemented

### The Init function in proxy-router/internal/config/models_config.go and the caller in proxy-router/main.go that handles its error.

_settles 1 finding(s)_

**What the answer means:** If Init returns a non-nil error when no models file exists and MODELS_CONFIG_CONTENT is unset, the env-reference's graceful-degradation wording is false. If it logs a warning and returns an empty registry, the doc is true.

- `b2985b2a7eb8` **[S4]** Missing models config file with no MODELS_CONFIG_CONTENT fails instead of empty registry

### A search for PinnedHTTPClient in production non-test code, especially where the inference HTTP client is constructed and used.

_settles 1 finding(s)_

**What the answer means:** If PinnedHTTPClient is instantiated and used for inference requests, the architecture doc's NOT WIRED claim is false and the CICD doc is right. If it is only defined/tested but never called, the architecture doc is right and the CICD doc is wrong.

- `4794dfb81ad3` **[S4]** PinnedHTTPClient claimed wired in CI/CD doc, NOT WIRED per architecture doc

### The passage in CLAUDE.md claiming on-hold MOR is invisible/unclaimable, and the proxy-router/internal/blockchainapi/stake_claimer.go auto-claimer plus its startup wiring.

_settles 1 finding(s)_

**What the answer means:** If CLAUDE.md says it is unclaimable while stake_claimer.go actively sweeps it, the finding is real. If CLAUDE.md acknowledges the auto-claimer, or stake_claimer.go is not active, the finding is false.

- `2ac39227c841` **[S3]** CLAUDE.md says MOR on hold is unclaimable, but proxy-router auto-claims it

### The proxy-router/internal/blockchainapi/stake_claimer.go file and the startup code that runs it, checking for a 10-minute loop calling withdrawUserStakes.

_settles 1 finding(s)_

**What the answer means:** If the loop exists and is active, the glossary auto-sweep claim is correct. If the file/loop does not exist or is never started, the glossary is wrong.

- `22d1e38335f6` **[S3]** [recurrence of 849cd1a3656f] Auto-sweep claim in Glossary

### The per-template golden-table passages in .ai-docs/TEE_Attestation_Architecture.md and the consumer SEV-SNP verification code, searching for golden, Measure, and per-template.

_settles 1 finding(s)_

**What the answer means:** If the doc says per-template matching is live while the code only compares a single legacy golden.Measure, the finding is real. If the code implements per-template matching, the later not-wired statement is false.

- `7aec18ca9601` **[S3]** SEV per-template consumer verification claimed but also not wired

### The README's v7 release summary Phase 1 bullet and the future-tense sentence in docs/providers/full/tee-reference.mdx or secretvm-quickstart.mdx.

_settles 1 finding(s)_

**What the answer means:** If README says v6.0.0+ consumers already verify at session open and every prompt while tee-reference says it will eventually happen, the contradiction is real. If both describe the same timing, the finding is false.

- `3405ae8c0b18` **[S3]** [recurrence of fae27ef05267] README says consumer-side Phase 1 verification already happens on every prompt

### The rate-limiting sentence in docs/prosumers/running-local-agents.mdx and the port assignment table for the C-Node proxy-router and the separate AI gateway in the prosumer overview.

_settles 1 finding(s)_

**What the answer means:** If both components are assigned port 8082, the finding is real. If the sentence refers to a different port or the AI gateway is not on 8082, the finding is false.

- `e32f07e87f48` **[?]** [recurrence of 33c671184aa5] Rate-limiting guidance assumes :8082 is the C-Node port

### The proxy-router stake-claimer source and startup wiring, specifically proxy-router/internal/blockchainapi/stake_claimer.go and main.go.

_settles 1 finding(s)_

**What the answer means:** If an active auto-sweep loop calls withdrawUserStakes after releaseAt, buy-bid.mdx is correct. If no such loop exists, buy-bid.mdx is wrong and manual withdrawal is required.

- `482bc0d2d79d` **[S3]** [recurrence of b6ad3b7df702] buy-bid.mdx claims proxy-router auto-sweeps matured on-hold MOR

### The stake_claimer.go implementation and its startup wiring, checking whether a 10-minute background job calls withdrawUserStakes.

_settles 1 finding(s)_

**What the answer means:** If it does, the glossary auto-sweep statement is correct. If it does not, the glossary statement is false.

- `be0273353bf4` **[S4]** [recurrence of b6ad3b7df702] Glossary defines withdrawUserStakes with auto-sweep every 10 minutes

### The on-hold tile comment/text in ui-desktop/src/renderer/src/components/dashboard/Dashboard.jsx and the staking lock rules in the sessions doc or SessionRouter.sol.

_settles 1 finding(s)_

**What the answer means:** If the UI text says on-hold is created only by closing early while same-day natural/late closes also create day-locked on-hold stakes, the finding is real. If the text covers all day-locked closes, the finding is false.

- `e3aff205855e` **[S4]** [recurrence of 0e403df15e4c] On-hold tile described as early-close-only

### The first-launch service lists in docs/consumers/install/linux.mdx, docs/consumers/install/windows.mdx, and docs/consumers/quickstart.mdx.

_settles 1 finding(s)_

**What the answer means:** If Linux/Windows omit IPFS while the consumer quickstart includes an IPFS/kubo node, the contradiction is real. If all lists include IPFS or all omit it, the finding is false.

- `25769a139fc3` **[S3]** Linux/Windows install docs omit IPFS, consumer quickstart includes it

### proxy-router/internal/attestation/backend_verifier.go in the current checkout; compare with .ai-docs/TEE_CICD_Supply_Chain_Hardening.md Phase 2 wording.

_settles 1 finding(s)_

**What the answer means:** If backend_verifier.go probes port 21434 first and falls back to 29343, the hardening doc's fixed-29343 statement is wrong and the finding is real; if it only uses 29343, the finding is false.

- `aa64946c4db5` **[S3]** Phase 2 backend CPU quote port: 29343 vs 21434

### Git tag v7.0.0 of this repository, specifically the /healthcheck endpoint and model-health code (git grep -n healthcheck v7.0.0 -- proxy-router), plus the v7.0.0/v7.4.0 release notes or changelog.

_settles 1 finding(s)_

**What the answer means:** If v7.0.0's healthcheck has no models array / model-health feature, verify-setup.mdx is wrong and the finding is real; if v7.0.0 already has it, the finding is false.

- `0103ec352bf3` **[S3]** Model health self-report existence in v7.0.0

### docs/providers/full/tee-reference.mdx, COOKIE_CONTENT section, and docs/reference/env-proxy-router.mdx, COOKIE_CONTENT row.

_settles 1 finding(s)_

**What the answer means:** If tee-reference explicitly says the default is admin:admin while env-proxy-router says unset/random-generated, the finding is real; if tee-reference does not say admin:admin, it is false.

- `f4b2493aeef1` **[?]** COOKIE_CONTENT default value mismatch between TEE reference and env reference

### .github/tee/secretvm.env and docs/providers/full/tee-reference.mdx's manifest example.

_settles 1 finding(s)_

**What the answer means:** If secretvm.env pins v0.0.31 and tee-reference still presents v0.0.27 as current, the finding is real; if tee-reference has been updated to v0.0.31 or no longer calls v0.0.27 current, the finding is false.

- `7fa1f5e29730` **[S3]** SDK image version pin differences across CICD docs

### smart-contracts/contracts/diamond/storages/ProviderStorage.sol constant PROVIDER_REWARD_LIMITER_PERIOD and the session concepts doc text asserting 1 day.

_settles 1 finding(s)_

**What the answer means:** If the constant is 365 days and the doc says 1 day, the finding is real; if the doc says 365 days or does not mention 1 day, the finding is false.

- `d460da21c942` **[S4]** [recurrence of c690b0070bef] Period length constant definition

### Repository tag list: git tag --list 'v7.9.0' (or GitHub releases for this repo), plus docs/ai/llm-prompt-cheatsheet.mdx frontmatter.

_settles 1 finding(s)_

**What the answer means:** If a v7.9.0 tag or release exists, the cheatsheet's last_verified is not impossible and the finding is false; if no v7.9.0 exists while latest is v7.5.0, the finding is true.

- `0957cfaec24b` **[S3]** Cheatsheet claims last_verified v7.9.0 but release checklist says latest tag is v7.5.0

### proxy-router/internal/config/config.go SetDefaults method and docs/reference/env-proxy-router.mdx LOG_LEVEL_APP row.

_settles 1 finding(s)_

**What the answer means:** If SetDefaults sets debug and the docs table says warn, the finding is real; if the docs say debug or the config says warn, the finding is false.

- `6fd4469fdfbc` **[S4]** Default LOG_LEVEL_APP value mismatch

### proxy-router/internal/blockchainapi/stake_claimer.go and docs/ai/session-states-open-close-recover.mdx's no-automatic-sweep sentence.

_settles 1 finding(s)_

**What the answer means:** If stake_claimer.go contains an automatic background loop calling withdrawUserStakes, the doc statement is wrong and the finding is real; if there is no loop, the finding is false.

- `36a05bc573f3` **[S4]** StakeClaimer runs automatically but session-states doc says no automatic sweep

### proxy-router/internal/config/rating_config.go LoadRating and docs/reference/env-proxy-router.mdx RATING_CONFIG_CONTENT description.

_settles 1 finding(s)_

**What the answer means:** If LoadRating only reads the file and never writes it, the docs' one-shot file-seeder description is wrong and the finding is real; if it writes then reads, the finding is false.

- `512f5e281e36` **[S3]** RATING_CONFIG_CONTENT seeding behavior contradicts source code

### ui-desktop/src/renderer/src/components/setup/phases.ts and the install/quickstart docs' IPFS wizard statements.

_settles 1 finding(s)_

**What the answer means:** If phases.ts intentionally excludes IPFS from the wizard phases while the docs say IPFS is downloaded/started in the wizard, the finding is real; if IPFS appears in the phases, the finding is false.

- `b04bfa0e4f9b` **[S4]** IPFS is excluded from setup wizard phases but included in docs

### .ai-docs/TEE_CICD_Supply_Chain_Hardening.md baked_env LOG_LEVEL_APP value and docs/providers/full/tee-reference.mdx logging description.

_settles 1 finding(s)_

**What the answer means:** If baked LOG_LEVEL_APP is info and tee-reference promises minimal verbosity, the mismatch is real or at least misleading; if the baked value is actually minimal or tee-reference does not promise minimal verbosity, the finding is false.

- `a5d99bda750a` **[S3]** Log level minimal verbosity vs actual value

### ui-desktop/tools/ui-verify/README.md and ui-desktop/tools/ui-verify/TESTING.md install commands.

_settles 1 finding(s)_

**What the answer means:** If README says yarn install and TESTING says npm install for the same app, the finding is real; if they refer to different projects or steps, the finding is false.

- `dabc9d984119` **[?]** Yarn vs npm for app dependency installation

### proxy-router/internal/blockchainapi/stake_claimer.go automatic sweep implementation.

_settles 1 finding(s)_

**What the answer means:** If the code has a periodic loop calling withdrawUserStakes, docs saying no automatic sweep are wrong and the finding is real; if no periodic loop exists, the finding is false.

- `6063740364b2` **[S3]** [re-audit 170f2ae265c4] Automatic sweep of day-locked stake: claimed vs denied

### proxy-router source for consumer-to-P-Node attestation: proxy-router/internal/proxy/session.go and proxy-router/internal/attestation/pnode_verifier.go, or grep for :29343 in proxy-router.

_settles 1 finding(s)_

**What the answer means:** If code fetches and verifies the P-Node :29343 quote at session open and per prompt, register-onchain's not-implemented statement is wrong and the finding is real; if only P-Node-to-backend attestation exists, secretvm-quickstart's active Phase 1 claim is wrong and the finding is real.

- `4292493c833d` **[S4]** TEE Phase 1 (consumer→P-Node) attestation: unimplemented vs active

### Same source as 4292493c833d: consumer proxy-router session-open attestation path, e.g. grep for Phase 1 or 29343 in proxy-router.

_settles 1 finding(s)_

**What the answer means:** If Phase 1 consumer-side attestation is implemented and active, register-onchain's not-implemented statement is false and the finding is real; if absent, secretvm-quickstart's active Phase 1 description is false and the finding is real; if both docs match code, the finding is false.

- `b36e38c053f6` **[S4]** TEE Phase 1 attestation: implemented vs not implemented

### proxy-router/internal/blockchainapi/stake_claimer.go and any UI/proxy endpoint that lists or returns on-hold MOR, such as getStakesOnHold.

_settles 1 finding(s)_

**What the answer means:** If matured stakes are automatically claimed, README is right and CLAUDE.md's open item is stale, so the finding is real; if there is no auto-claim and no way to see or return held MOR, README's auto-claim claim is false and the finding is real.

- `85ce3119f708` **[?]** Held MOR stake: auto-claimed vs invisible/unclaimable

### grep -R 'MatchSEVMeasurement' in the attestation source tree; compare with .ai-docs/TEE_Attestation_Architecture.md Phase 1c summary.

_settles 1 finding(s)_

**What the answer means:** If MatchSEVMeasurement has no callers and only the legacy single Measurement is compared, the summary's per-template golden table claim is false and the finding is real; if it is wired and called, the finding is false.

- `1f5d8464a799` **[S3]** SEV per-template golden table claimed used in Phase 1c summary, but not wired

### proxy-router/internal/config/config.go SetDefaults for ARTIFACT_REGISTRY_REFRESH_INTERVAL and docs/providers/full/sev-verification.mdx table row.

_settles 1 finding(s)_

**What the answer means:** If config sets no default and the docs table says default 1h, the finding is real; if config sets 1h, the finding is false.

- `4556382cb50c` **[S4]** [recurrence of 2b32fd0a3e9e] SEV verification docs list ARTIFACT_REGISTRY_REFRESH_INTERVAL default as 1h

### proxy-router/internal/config/config.go default for TEE_PORTAL_URL and docs/providers/full/tee-backend-verification.mdx environment-variable table.

_settles 1 finding(s)_

**What the answer means:** If config default is https://secretai.scrtlabs.com/api and the docs label https://secretai.scrtlabs.com/api/quote-parse as Default, the finding is real; if config default is /quote-parse, the finding is false.

- `eeb5b5d87bd8` **[S4]** [recurrence of cd9ef52221e3] TEE_PORTAL_URL default again asserted as /quote-parse

### proxy-router source at tag v6.0.0 (or current if unchanged) for session-open P-Node attestation: git show v6.0.0:proxy-router/internal/proxy/session.go and the attestation package.

_settles 1 finding(s)_

**What the answer means:** If v6.0.0+ consumer proxy-router actually performs P-Node attestation at session open and per prompt, README's callout is accurate and the finding is false; if not, the finding is true.

- `2bac45e095e7` **[S1]** [recurrence of 71234f8f63db] README v7.0.0 callout claims v6.0.0+ consumer proxy-router already verifies the P

### Same proxy-router session-open attestation source plus docs/concepts/tee-overview.mdx and docs/providers/full/tee-reference.mdx tense and claims.

_settles 1 finding(s)_

**What the answer means:** If automatic C-Node verification is implemented, overview's present-tense behavior is real and tee-reference's future-tense claim is wrong, so the finding is real; if not implemented, overview is wrong and the finding is real; if the docs do not actually conflict, the finding is false.

- `bcf5223b9baf` **[?]** [recurrence of fae27ef05267] TEE overview describes automatic C-Node verification as current behavior

### ui-desktop/tools/ui-verify/package.json scripts, especially the verify script, and README.md/TESTING.md descriptions of npm run verify.

_settles 1 finding(s)_

**What the answer means:** If npm run verify includes the frozen-values audit, README is right and TESTING is incomplete, so the finding is real; if verify only runs logic-checks and isolation, TESTING is right and README is wrong, so the finding is real; if they describe different scripts, the finding is false.

- `a02579636ac8` **[S3]** `npm run verify` composition described differently in TESTING.md and README.md

### proxy-router/internal/blockchainapi/stake_claimer.go.

_settles 1 finding(s)_

**What the answer means:** If no automatic sweep exists, glossary's 10-minute auto-sweep claim is false and the finding is real; if a 10-minute sweep exists, the finding is false.

- `e635ab895135` **[?]** [recurrence of b6ad3b7df702] glossary.mdx claims proxy-router auto-sweeps matured on-hold MOR

### proxy-router/internal/blockchainapi/stake_claimer.go, including its loop and comments.

_settles 1 finding(s)_

**What the answer means:** If code actually schedules automatic withdrawUserStakes every 10 minutes, CLAUDE.md is accurate and the finding is false; if no such loop exists, the finding is true.

- `09a28b6e219e` **[S3]** [recurrence of b6ad3b7df702] CLAUDE.md open item asserts StakeClaimer automatically returns matured on-hold MO

### ui-desktop/src/renderer/src/components/dashboard/Dashboard.jsx comment and the on-hold stake computation it queries, e.g. getStakesOnHold in proxy-router or marketplace code.

_settles 1 finding(s)_

**What the answer means:** If on-hold balance includes day-locked same-day natural/late closes, the only-early-closes comment is wrong and the finding is real; if on-hold truly only reflects early closes, the finding is false.

- `3535cb7bb8aa` **[S3]** [recurrence of 0e403df15e4c] Dashboard comment says on-hold MOR is only for early closes

### proxy-router/internal/attestation: run `git grep -n "MatchSEVMeasurement"` and read verifier.go / the attestation consumer path in the same package.

_settles 1 finding(s)_

**What the answer means:** If MatchSEVMeasurement has no non-test callers and the consumer path uses only the legacy single measurement, the claim is true; if verifier.go calls it, the claim is false.

- `9bcc34d4462e` **[S3]** [recurrence of 54d3113895ab] Per-template golden table consumer usage asserted in golden.go

### smart-contracts/deploy/data/config_base_mainnet.json and smart-contracts/deploy/data/config_base_sepolia.json: the marketplaceBidFee (or equivalent) value.

_settles 1 finding(s)_

**What the answer means:** If mainnet is 0.1 MOR and Sepolia is 0.3 MOR, the glossary is wrong and the other docs are right; if Sepolia is 0.1 MOR, the glossary is right and the other docs are wrong.

- `eee8e035e787` **[S3]** Marketplace bid fee amount mismatch

### The session concepts doc (likely docs/concepts/sessions.mdx): run `git grep -n "reward limiter\|1 day" docs/concepts` and read ProviderStorage.sol's PROVIDER_REWARD_LIMITER_PERIOD.

_settles 1 finding(s)_

**What the answer means:** If the session concepts doc says the period is 1 day while the contract constant is 365 days, the contradiction is real; if it says 365 days or does not state a period, it is false.

- `fc04bed72a79` **[S3]** [recurrence of c690b0070bef] Provider reward limiter period set to 365 days in contracts and docs

### The same session concepts doc (search docs/concepts for the 1-day reward limiter statement) plus ProviderRegistry.sol lines around limitPeriodEnd.

_settles 1 finding(s)_

**What the answer means:** If the doc says the registration period is 1 day while ProviderRegistry adds 365 days, the claim is true; otherwise false.

- `7c4c3d5923ad` **[S4]** [recurrence of c690b0070bef] Period used in provider registration

### smart-contracts/deploy/data/config_base_mainnet.json and smart-contracts/deploy/data/config_base_sepolia.json: the marketplaceBidFee values.

_settles 1 finding(s)_

**What the answer means:** If mainnet is 0.1 MOR and Sepolia is 0.3 MOR, quickstart is correct and the RFP's uniform 0.3 claim is wrong; if both are 0.3, quickstart is wrong.

- `99780051fd29` **[S3]** [recurrence of 26555f497457] Marketplace bid fee amount in quickstart.mdx

### smart-contracts/deploy/data/config_base_mainnet.json and smart-contracts/deploy/data/config_base_sepolia.json: marketplaceBidFee values.

_settles 1 finding(s)_

**What the answer means:** If mainnet=0.1 and Sepolia=0.3, the differentiated claim is true and the RFP is wrong; if both are 0.3, the RFP is right and this file's claim is wrong.

- `ae64424f51ee` **[S3]** [recurrence of 26555f497457] Marketplace bid fee differs by network (0.1 mainnet, 0.3 testnet) contradicts RFP

### smart-contracts/deploy/data/config_base_mainnet.json: marketplaceBidFee value (and config_base_sepolia.json for the testnet side).

_settles 1 finding(s)_

**What the answer means:** If mainnet bidFee is 0.1 MOR, the 0.1/0.3 distinction is true and the RFP's uniform 0.3 is wrong; if mainnet is 0.3, this finding is false.

- `0acb3cdb7716` **[S4]** [recurrence of 26555f497457] Marketplace bid fee differs by network

### smart-contracts/deploy/data/config_base_mainnet.json and config_base_sepolia.json: the deployed marketplaceBidFee values (or the original RFP document stating a uniform 0.3 MOR).

_settles 1 finding(s)_

**What the answer means:** If the deployed fees are 0.1 MOR mainnet / 0.3 MOR Sepolia, the resale page is correct and the RFP is wrong; if both are 0.3 MOR, the resale page is wrong.

- `864f772d29e1` **[S3]** [recurrence of 26555f497457] Marketplace bid fee amount in resale registering-bid

### The router handler for GET /blockchain/sessions/user (search `git grep -n "sessions/user" proxy-router`) and the OpenAPI/API docs for that endpoint.

_settles 1 finding(s)_

**What the answer means:** If the handler accepts and processes offset, limit, and order, the server.ts URL construction is valid and the claim is false; if it ignores them, the claim is true.

- `513cab95284b` **[S3]** [recurrence of 9e3194ac5b8a] Client code depends on session listing endpoint having offset/limit/order

### ui-desktop/tools/ui-verify/README.md, ui-desktop/tools/ui-verify/TESTING.md, and ui-desktop/tools/ui-verify/package.json (the `verify` script).

_settles 1 finding(s)_

**What the answer means:** If package.json's verify script runs logic, frozen, and isolate, README is right and TESTING is wrong; if it runs only logic and isolate, README is wrong.

- `c41c595349bc` **[?]** Scope of `npm run verify` differs between README and TESTING

### Root README.md section describing git hooks and .githooks/pre-commit (plus scripts/docs-gates.mjs to confirm it runs docs gates).

_settles 1 finding(s)_

**What the answer means:** If README says the pre-push hook only runs identity-leak while pre-commit actually runs docs gates, the contradiction is real; if README mentions the docs gates, it is false.

- `d19cc720428a` **[S3]** [recurrence of 0253ee0d5092] Pre-commit runs docs gates, contradicting README claim

### docs/providers/resale/reselling-venice.mdx (the concurrentSlots passage) and docs/reference/models-config.mdx.

_settles 1 finding(s)_

**What the answer means:** If reselling-venice says there is no built-in global cap while models-config says the proxy accepts up to sum(concurrentSlots), the contradiction is real; if both describe the same cap, it is false.

- `af94c9efade0` **[S4]** CONTRADICTION: Concurrent slots global cap behavior

### proxy-router/internal/config/config.go (default of PROXY_STORE_CHAT_CONTEXT) and the -tee image Dockerfile/entrypoint that sets PROXY_STORE_CHAT_CONTEXT (search `git grep -n PROXY_STORE_CHAT_CONTEXT -- .github docker .ai-docs`).

_settles 1 finding(s)_

**What the answer means:** If the -tee image hard-codes false and prevents runtime override, the TEE doc is right and the config default is irrelevant; if the env var can be overridden, the TEE doc is wrong.

- `db1ef73799f0` **[S4]** PROXY_STORE_CHAT_CONTEXT default: true vs false

### docs/ecosystem/everclaw.mdx and docs/prosumers/running-local-agents.mdx: the 8082 port assignments.

_settles 1 finding(s)_

**What the answer means:** If both pages put the C-Node proxy-router on 127.0.0.1:8082 while the prosumer overview puts a separate AI gateway there, the contradiction is real; if one assigns 8082 to a separate gateway, it is false.

- `c114fbfe1bda` **[S4]** [recurrence of 33c671184aa5] Other pages also put the C-Node proxy-router, not a separate AI gateway, on port 

### docs/reference/env-proxy-router.mdx (AGENT_CONFIG_PATH line) and proxy-router/internal/config/config.go (the env var actually read) plus proxy-router/.env.example.

_settles 1 finding(s)_

**What the answer means:** If the binary reads AGENTS_CONFIG_PATH (plural), the singular form in env-proxy-router.mdx is wrong; if it reads AGENT_CONFIG_PATH, .env.example is wrong.

- `bfbdd59ba13a` **[S2]** Agent config variable name plural vs singular

### ui-desktop/tools/ui-verify/README.md and ui-desktop/tools/ui-verify/package.json (the `verify` script; TESTING.md only if needed).

_settles 1 finding(s)_

**What the answer means:** If `npm run verify` invokes all three checks, TESTING's omission of frozen-values is wrong; if it runs only logic and isolate, README is wrong.

- `f21fff296b65` **[S4]** README and TESTING disagree on what `npm run verify` runs

### docs/providers/full/tee-backend-verification.mdx and .ai-docs/TEE_Attestation_Architecture.md: the failed-cache behavior paragraphs.

_settles 1 finding(s)_

**What the answer means:** If the backend-verification guide says a failed cached status triggers full re-attestation while the architecture doc says the next prompt is rejected, the contradiction is real; if both say the same outcome, it is false.

- `aae871540cbc` **[S3]** Cached failed attestation: re-attest vs reject

### docs/providers/full/tee-backend-verification.mdx: the inference data-path and TLS channel-binding passages.

_settles 1 finding(s)_

**What the answer means:** If the same document says the inference path is not TLS-pinned and also claims TLS channel binding prevents MITM / only attested endpoint can receive inference data, the contradiction is real; if either statement is absent or qualified, it is false.

- `74c6084944fa` **[S4]** TLS channel binding guarantee contradicts inference data path not pinned

### The server-side handler/API spec for GET /blockchain/sessions/user and cli/chat/client/client.go's ListUserSessions method.

_settles 1 finding(s)_

**What the answer means:** If the endpoint documents/supports offset, limit, and order but the Go client only sends ?user=..., the claim is true; if the endpoint also ignores those parameters, the claim is false.

- `e350f10ea8aa` **[S3]** [recurrence of db3d2b86de02] ListUserSessions method omits offset/limit/order

### proxy-router/internal/config/config.go (default of TEE_PORTAL_URL) and docs/proxy-router.all.env.

_settles 1 finding(s)_

**What the answer means:** If the compiled default is https://secretai.scrtlabs.com/api, then documenting /api/quote-parse as the default is false; if the compiled default is /api/quote-parse, the finding is false.

- `6cc3b66ebc8f` **[S4]** [recurrence of cd9ef52221e3] TEE_PORTAL_URL default documented as /api/quote-parse

### docs/ecosystem/everclaw.mdx: the Mermaid label for the C-Node proxy-router port.

_settles 1 finding(s)_

**What the answer means:** If the label says the C-Node proxy-router listens on 127.0.0.1:8082, the claim is true; if it shows a separate AI gateway on 8082, the claim is false.

- `c8631acd4c80` **[S4]** [recurrence of 33c671184aa5] C-Node proxy-router on 8082 repeated in Everclaw mirror

### proxy-router/internal/config/config.go: the compiled default of TEE_PORTAL_URL.

_settles 1 finding(s)_

**What the answer means:** If the compiled default is https://secretai.scrtlabs.com/api, the /api/quote-parse documentation is wrong; if it is /api/quote-parse, the documentation is right.

- `1907d9427002` **[S4]** [recurrence of cd9ef52221e3] TEE_PORTAL_URL default again documented as /api/quote-parse

### proxy-router/internal/blockchainapi/stake_claimer.go and its caller/scheduler (search `git grep -n "StakeClaimer\|ClaimStakes\|withdrawUserStakes" proxy-router`).

_settles 1 finding(s)_

**What the answer means:** If stake_claimer.go is wired to run automatically every 10 minutes, CLAUDE.md is true; if claims only happen via manual withdrawUserStakes, CLAUDE.md is false.

- `fcec45d1262a` **[S3]** [recurrence of b6ad3b7df702] CLAUDE.md claims StakeClaimer automatically claims matured on-hold MOR

### ui-desktop/src/renderer/src/components/SetupWizard.tsx (or the first-launch service list it drives).

_settles 1 finding(s)_

**What the answer means:** If the setup wizard downloads/starts an IPFS node on first launch, the Linux/Windows install docs' omission is real; if IPFS is not part of first launch, the claim is false.

- `7f4568f1bb2b` **[S3]** Linux/Windows install docs omit IPFS from first-launch services

### ui-desktop/src/renderer/src/components/dashboard/Dashboard.jsx (the tile comment) and the on-chain/contract implementation of getStakesOnHold / session-close lock logic.

_settles 1 finding(s)_

**What the answer means:** If the lock applies to all closes (not just early closes), the label's 'early-close-only' scope is wrong and the claim is true; if only early closes are locked, the label is correct and the claim is false.

- `0ea48edbe5b2` **[S3]** [recurrence of 0e403df15e4c] Dashboard tile comment labels on-hold as early-close-only

### docs/concepts/tee-overview.mdx, section on AMD SEV-SNP measurement generation in CI/CD

_settles 1 finding(s)_

**What the answer means:** If that section says measurements are not yet computed, the conflict with .ai-docs/TEE_CICD_Supply_Chain_Hardening.md is real; if it says they are published or does not address CI/CD, the conflict is false.

- `44ad05460c78` **[S4]** SEV-SNP measurement generation in CI/CD

### docs/concepts/architecture.mdx TEE-only SecretVM port list and docs/providers/full/model-setup.mdx probe sequence for ports 21434/29343

_settles 1 finding(s)_

**What the answer means:** If architecture lists only 29343 and never mentions 21434 while model-setup says the P-Node probes 21434 first, the contradiction is real; if architecture also mentions 21434 or model-setup does not probe 21434 first, it is false.

- `3cff4fbb6c03` **[S3]** TEE attestation ports differ between model-setup and architecture docs

### ui-desktop/tools/ui-verify/package.json "verify" script and the README/TESTING command lists

_settles 1 finding(s)_

**What the answer means:** If the verify script includes the frozen-values command, README is right and TESTING is wrong; if it runs only logic-checks and isolation, TESTING is right and README is wrong.

- `5e2b686dd7b4` **[S4]** Verify command includes frozen tests inconsistently

### docs/concepts/tee-overview.mdx, AMD SEV-SNP measurement/CI-CD section

_settles 1 finding(s)_

**What the answer means:** If tee-overview says SEV-SNP measurements are not yet computed in CI/CD, the contradiction with the hardening doc is real; if it says published or is silent, the claim is false.

- `95ef59bcf03a` **[S4]** AMD SEV-SNP measurement publication status

### docs/concepts/sessions-stake-close-recover.mdx (or the docs/concepts session document) passage about the provider reward limiter period, plus SessionRouter.sol PROVIDER_REWARD_LIMITER_PERIOD

_settles 1 finding(s)_

**What the answer means:** If the doc says 1 day and code says 365 days, the contradiction is real; if the doc says 365 days or does not specify, it is false.

- `9b25f4aead1d` **[S3]** [recurrence of c690b0070bef] Period used in reward claiming

### proxy-router/.env.example ENVIRONMENT line and docs/reference/env-proxy-router.mdx ENVIRONMENT default

_settles 1 finding(s)_

**What the answer means:** If .env.example says ENVIRONMENT=production and the reference says default is 'development', the inconsistency is real; if they agree, it is false.

- `bf7fc654215e` **[S3]** ENVIRONMENT default value differs between .env.example and docs/reference/env-proxy-router.mdx

### proxy-router/.env.example and docs/proxy-router.all.env TEE_PORTAL_URL lines, plus proxy-router/internal/config/config.go TEE_PORTAL_URL default if one exists

_settles 1 finding(s)_

**What the answer means:** If the two documented defaults differ and config.go does not reconcile them (or matches only one), the conflict is real; if they match after reading the actual default, it is false.

- `371fc0aebcb7` **[S4]** TEE_PORTAL_URL default differs

### Base Sepolia deployment config in the repo (e.g., smart-contracts config_base_sepolia.json) bidMinPricePerSecond value, and the two docs' stated values

_settles 1 finding(s)_

**What the answer means:** If the config value is 20000000000000000000 wei, pricing.mdx is right and register-onchain.mdx wrong; if 5000000000000000 wei, the reverse; if neither, both docs are wrong.

- `9dbc5419da59` **[S3]** Sepolia bidMinPricePerSecond value mismatch between docs

### README.md section describing the pre-push hook (grep for 'pre-push'), compared with .githooks/pre-push and .github/workflows/docs-gates.yml

_settles 1 finding(s)_

**What the answer means:** If README says pre-push only runs the identity-leak gate but the script also enforces coherence records and runs docs-gates.mjs, the contradiction is real; if README matches the script, it is false.

- `deea3459b76f` **[S3]** [recurrence of 0253ee0d5092] Pre-push description omits coherence record check

### docs/providers/full/verify-setup.mdx example JSON and errorKind table (httpStatus/modelName), compared with docs/providers/full/model-health.mdx version note

_settles 1 finding(s)_

**What the answer means:** If verify-setup.mdx presents httpStatus and modelName as available on v7.0.0 while model-health.mdx says they were added after v7.4.0, the contradiction is real; otherwise false.

- `d0dde75861b5` **[S3]** verify-setup.mdx asserts httpStatus and modelName exist in v7.0.0; model-health.mdx says they were added after

### docs/providers/full/tee-reference.mdx attestation/Traefik section and docs/providers/full/secretvm-quickstart.mdx port 29343 attestation statement

_settles 1 finding(s)_

**What the answer means:** If tee-reference says attestation is on port 443 at /cpu and quickstart says a separate port 29343 serves attestation, the contradiction is real; if they describe different access paths or quickstart does not say attestation is on 29343, it is false.

- `d5ace94004c6` **[S3]** CONTRADICTION: TEE attestation port number

### smart-contracts/contracts/diamond/facets/SessionRouter.sol: _claimForProvider and closeSession payment path, plus docs/concepts/sessions-stake-close-recover.mdx wording

_settles 1 finding(s)_

**What the answer means:** If pool-mode provider payment is taken from fundingAccount and an empty fundingAccount would revert, the committed wording is supported; if payment can come from another escrow/session account, the wording is wrong.

- `5659ccbd4df5` **[S4]** [re-audit 414c3f338b52] [recurrence of 0054a7482dbd] All closeSession calls rely on fundingAccount

### docs/consumers/buy-bid.mdx auto-sweep/on-hold passage and proxy-router source for automatic stake sweep and GET /blockchain/stakes/on-hold route

_settles 1 finding(s)_

**What the answer means:** If buy-bid.mdx says the proxy-router sweeps automatically and the code contains no such automatic sweep or on-hold route, the finding is real; if the code has both, the doc is correct and the finding is false.

- `6c090dd607c4` **[S4]** [recurrence of 0e3a219288f9] Buy-bid.mdx says proxy-router sweeps automatically and suggests a GET route exist

### docs/concepts/sessions-stake-close-recover.mdx authoritative-contract statement and ui-desktop/src/renderer/src/utils/marketplace.ts (or KeepAliveProvider.tsx) stale-vendored-source warning

_settles 1 finding(s)_

**What the answer means:** If one doc tells readers the repo contract is authoritative while source code in the same repo says the vendored smart-contracts copy is 18 months stale, the conflict is real; if either side does not say that, it is false.

- `4e6bd1ee98b9` **[S4]** Docs call the repo contract authoritative; marketplace.ts calls the same source stale and untrustworthy

### proxy-router source for consumer-side P-Node attestation verification (search proxy-router for attestation/quote verification on prompt forwarding), plus docs/providers/full/register-onchain.mdx and secretvm-quickstart.mdx Phase 1 statements

_settles 1 finding(s)_

**What the answer means:** If the proxy-router code verifies the P-Node quote on the consumer side before forwarding, secretvm-quickstart is right and register-onchain is wrong; if only the P-Node→backend hop exists, the reverse.

- `6b9bbf49bffa` **[S4]** TEE Phase 1 consumer attestation: implemented vs not yet implemented

### proxy-router/internal/config/config.go env bindings list and docs/reference/env-proxy-router.mdx variable table (plus proxy-router/.env.example if needed)

_settles 1 finding(s)_

**What the answer means:** If config.go binds IPFS_DISABLED, IPFS_MULTADDR, and MULTICALL3_ADDR and the reference page omits them despite claiming completeness, the finding is real; if those bindings are absent or documented elsewhere, it is false.

- `2c6ccadedb23` **[S4]** Reference page claims to document every proxy-router env var but omits IPFS and MULTICALL3 variables

### proxy-router inference HTTP-client construction (e.g., proxy-router/internal/ai_engine/ai_engine.go) and docs/providers/full/tee-backend-verification.mdx / .ai-docs/TEE_Attestation_Architecture.md pinning statements

_settles 1 finding(s)_

**What the answer means:** If the inference client is pinned to the attested TLS identity, the pinning docs are right; if ai_engine.go passes a nil/default HTTP client, the architecture doc's 'not wired' statement is right and the conflict is real.

- `d294e036a878` **[S4]** Inference-path TLS pinning: enforced vs not wired

### proxy-router listen-port definition (proxy-router/internal/config/config.go or docker-compose.yml) and the docs/ecosystem/everclaw.mdx / docs/prosumers/running-local-agents.mdx port-8082 passages

_settles 1 finding(s)_

**What the answer means:** If the C-Node proxy-router itself listens on 8082 and the prosumer overview assigns 8082 to a separate AI gateway, the contradiction is real; if the proxy-router listens elsewhere or the AI-gateway port is different, it is false.

- `3052e33ddd7a` **[S4]** [recurrence of 33c671184aa5] C-Node proxy-router listed on port 8082, contradicting AI-gateway-on-8082 topolog

### .ai-docs/TEE_Attestation_Architecture.md or docs/providers/full/tee-reference.mdx future-tense statement about automatic C-Node verification, compared with .ai-docs/TEE_CICD_Supply_Chain_Hardening.md shipped/DONE status

_settles 1 finding(s)_

**What the answer means:** If one document says consumer-side Phase 1 verification is already shipped while the other says automatic C-Node verification will eventually be built, the contradiction is real; if the 'future' statement refers to a different phase/component, it is false.

- `02fc0805ff0c` **[S3]** [recurrence of fae27ef05267] CI/CD doc says consumer-side Phase 1 verification is already shipped

### docs/prosumers/running-local-agents.mdx 127.0.0.1:8082 user-creation command and the proxy-router/docker-compose or config that defines the C-Node proxy-router port

_settles 1 finding(s)_

**What the answer means:** If the command targets the C-Node proxy-router on 8082 while the prosumer overview gives 8082 to an AI gateway, the port conflict is real; if 8082 is the AI gateway's port and the proxy-router is elsewhere, the example is wrong but the conflict is as stated.

- `1564db856b5c` **[S3]** [recurrence of 33c671184aa5] Running-local-agents example sends C-Node API calls to 8082

### proxy-router/internal/config/config.go TEE_PORTAL_URL default and docs/providers/full/tee-backend-verification.mdx TEE_PORTAL_URL table entry

_settles 1 finding(s)_

**What the answer means:** If config.go's default is https://secretai.scrtlabs.com/api and the doc lists .../api/quote-parse, the doc entry is wrong; if the config default includes /quote-parse, the doc is right.

- `f70309cc13fe` **[S4]** [recurrence of cd9ef52221e3] TEE backend verification doc lists quote-parse as TEE_PORTAL_URL default

### proxy-router/internal/blockchainapi/stake_claimer.go and docs/consumers/buy-bid.mdx expected-behavior bullet about auto-sweep/manual withdrawal

_settles 1 finding(s)_

**What the answer means:** If StakeClaimer periodically sweeps matured stakes, the guide's auto-sweep statement is correct and the 'no automatic sweep' premise is false; if it is not wired to run periodically, the finding is real.

- `1d177411bcc3` **[S2]** [recurrence of b6ad3b7df702] buy-bid guide repeats auto-sweep and says manual withdrawal is not required

### smart-contracts/contracts/diamond/facets/SessionRouter.sol (or relevant lock/release logic) defining when MOR is placed on hold, and Dashboard.jsx's on-hold comment

_settles 1 finding(s)_

**What the answer means:** If the day-lock applies to same-day natural/late closes as well as early closes, the comment's 'early' framing is incomplete/contradicts; if only early closes are on-hold, the comment is accurate.

- `3d5257cfba99` **[S4]** [recurrence of 0e403df15e4c] Dashboard comment limits on-hold to early closes

### proxy-router health-check implementation that maps session error streaks to unhealthy/degraded (grep proxy-router for 'session_errors' and '429'), plus docs/proxy-router.all.env comment

_settles 1 finding(s)_

**What the answer means:** If the implementation reports an all-429 streak as degraded, the env sample is right and the reference's 'always unhealthy' statement is wrong; if it reports unhealthy regardless of 429, the reference is right.

- `05bc2ac031ed` **[S3]** [recurrence of c07dd2cef57d] Env sample documents 429 session-error streak as degraded

## onchain-read — 4 finding(s)

### On-chain read: the deployed Marketplace contract's bid-fee getter (likely bidFee()) on Base mainnet and Base Sepolia, using the contract addresses in deploy/data/config_base_mainnet.json and deploy/data/config_base_sepolia.json.

_settles 1 finding(s)_

**What the answer means:** If mainnet returns 0.1 MOR and Sepolia returns 0.3 MOR, verify-setup.mdx is correct and the RFP's uniform-0.3 claim is wrong, so the finding is false; if both return 0.3 MOR, the finding is true.

- `152c9295ecf4` **[S1]** [recurrence of 26555f497457] Marketplace bid fee amount in verify-setup.mdx

### Same on-chain read as 152c9295ecf4: bid-fee getter on the deployed Marketplace contract on Base mainnet and Base Sepolia, addresses from deploy/data/config_base_mainnet.json and deploy/data/config_base_sepolia.json.

_settles 1 finding(s)_

**What the answer means:** If mainnet=0.1 MOR and Sepolia=0.3 MOR, myths.mdx is right and the RFP uniform-0.3 claim is wrong, so the finding is false; if both=0.3 MOR, the finding is true.

- `a5182cd7ff30` **[S3]** [recurrence of 26555f497457] Marketplace bid fee amount in myths page

### Deployed Marketplace contract on Base mainnet and Base Sepolia (addresses from the repo deployment configs), calling getBidFee() on each

_settles 1 finding(s)_

**What the answer means:** If mainnet returns 0.1e18 and Sepolia returns 0.3e18, registering-bid.mdx is right and the RFP's uniform 0.3 is wrong; if both return 0.3e18, the RFP is right.

- `4a5c056be641` **[S4]** [recurrence of 26555f497457] Marketplace bid fee amount in registering-bid.mdx

### Same on-chain read: Marketplace.getBidFee() on Base mainnet and Base Sepolia (deployment addresses from repo configs)

_settles 1 finding(s)_

**What the answer means:** If mainnet=0.1e18 and Sepolia=0.3e18, the differentiated docs are right and the uniform-0.3 RFP claim is wrong; if both are 0.3e18, the RFP is right.

- `1280d7822e77` **[S3]** [recurrence of 26555f497457] Marketplace bid fee differs by network (0.1 mainnet, 0.3 testnet) contradicts RFP

## github-release — 3 finding(s)

### The GitHub release assets for the repository linked by docs/get-started/quickstart-consumer.mdx, e.g., GET https://api.github.com/repos/MorpheusAIs/Morpheus/releases/latest and inspect the assets array.

_settles 1 finding(s)_

**What the answer means:** If the latest release contains desktop installer assets, the quickstart download link is valid and the finding is false. If the linked release has no desktop assets, the finding is true.

- `e5dfcf264e77` **[S4]** Docs direct users to GitHub-release downloads that the fork README says do not exist

### Release tag list for this repository, e.g. git ls-remote --tags origin or the GitHub releases page; look at testnet/branch release names.

_settles 1 finding(s)_

**What the answer means:** If actual testnet tags use -testnet, README's *-test rule is wrong and the finding is real; if they use -test, quickstart's -testnet is wrong; if both conventions appear for different branches, neither is universal and the finding is real as stated.

- `11e7e63ff5e3` **[S3]** Testnet release suffix: README says `*-test`, quickstart says `-testnet`

### GitHub releases page for this repo, specifically the asset list of tag v7.5.0-cc.1 (or the latest release).

_settles 1 finding(s)_

**What the answer means:** If that release has no desktop-app asset, app-mor-org's download-installer instructions are false and building from source is the only path; if a desktop asset exists, the finding is false.

- `713d1f4acc56` **[?]** MorpheusUI install instructions conflict with available release assets

## upstream-api — 1 finding(s)

### The OpenAPI/spec for the NVIDIA NRAS service the backend uses (or NVIDIA's published NRAS API reference), specifically the path of the GPU attestation operation.

_settles 1 finding(s)_

**What the answer means:** If the spec lists /v2/attest/gpu, the architecture doc is correct; if it lists /v4/attest/gpu, the backend-verification doc is correct. If both versions exist or are aliased, the contradiction is not a real error.

- `1442ce6a6ff6` **[S4]** NRAS API endpoint version: v2 vs v4

## git-history — 1 finding(s)

### `git show v7.0.0:docs/providers/full/verify-setup.mdx` (and `git log -S modelName -- docs/providers/full/verify-setup.mdx` if needed).

_settles 1 finding(s)_

**What the answer means:** If the v7.0.0 snapshot already contains modelName and rate_limited, the claim is true; if those fields are absent until after v7.4.0, the claim is false.

- `f1b8939473cf` **[S3]** modelName and rate_limited fields in v7.0.0

## git-tags — 1 finding(s)

### `git tag --list` (or `git ls-remote --tags origin`) for this repository.

_settles 1 finding(s)_

**What the answer means:** If a v7.5.0 tag exists, README's 'only release is v7.5.0-cc.1' is false; if no v7.5.0 tag exists, RELEASE_CHECKLIST's 'latest tag v7.5.0' is false.

- `0bc882f10ed3` **[S3]** Latest release tag discrepancy
