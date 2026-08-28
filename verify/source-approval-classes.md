# Source-file findings, grouped for approval

72 confirmed findings need an edit to a file that is **not** documentation.
None of them can be edited by the loop today: every path falls outside the `EDITABLE`
allowlist, and the `E-protected` ones are additionally blocked by prefix. That is the
fail-closed default, and it is why approving a class is a concrete act rather than a
promise - it means widening `LOOP_EDITABLE` to admit exactly that class's paths.

Grouped by **what an edit would touch at runtime**, not by which directory it lives in,
because runtime effect is what decides how much checking a fix needs.

Generated 2026-08-26 18:08 UTC.

| class | findings | what an edit can break | reversible by an existing check |
|---|--:|---|---|
| `A-template` | 14 | nothing at runtime | 0/14 |
| `B-comment` | 17 | nothing at runtime | 0/17 |
| `E-protected` | 6 | the audit's own gates | 6/6 |
| `C-code` | 14 | program behaviour | 0/14 |
| `D-contract` | 5 | protocol semantics on a future deploy | 0/5 |
| `unclear` | 16 | not yet known | 0/16 |

---

## `A-template` — 14 finding(s)

Files the running application never loads. An edit here cannot change behaviour - it changes what a human copies when setting up. **Lowest risk in the set.**

Paths this class would admit to the allowlist:

- `proxy-router/.env.example` — 11 finding(s)
- `docs/ui-desktop.all.env` — 3 finding(s)

- `760230113364` AGENT_CONFIG_PATH variable name inconsistency between .env.example and documentation
  - The fix is to the .env.example template to match the singular AGENT_CONFIG_PATH used by the documentation.
- `5196289143fe` PROXY_STORAGE_PATH default mismatch between files
  - The .env.example template sets a different PROXY_STORAGE_PATH value than the documented all.env default, so the template needs editing.
- `74fb0ba49b6b` EXPLORER_URL documented as both required and optional
  - The contradiction is between two env documentation files, and the fix edits the ui-desktop.all.env template/annotation, not runtime code.
- `0bbe3092db97` [recurrence of 654aefbbc4be] Pointer to a complete env file in .env.example
  - The fix is to the .env.example comment/pointer, which is a template file never loaded at runtime.
- `e26611d25bf6` PROXY_STORAGE_PATH default differs between proxy-router.all.env and .env.example
  - The fix corrects the PROXY_STORAGE_PATH value in .env.example, a sample file the running application does not load.
- `5a3f2246f2d8` Agent config variable name is plural in .env.example but singular in reference
  - The fix aligns the plural variable name in .env.example with the documented singular key, editing only a sample env file.
- `0d9da8ae2de5` ui-desktop.all.env claims TESTNET alignment but sets MAINNET contract addresses
  - The fix edits the header or address values in docs/ui-desktop.all.env, a sample env file not loaded by the running application.
- `6e9246ae3bac` AGENT_CONFIG_PATH naming inconsistency
  - The .env.example uses the plural variable name while the reference and code use singular, so the fix is in the unloaded example template.
- `78cad6fa9d92` [recurrence of 654aefbbc4be] .env.example header repeats the false 'Full ENV' completeness claim
  - The .env.example header repeats the false completeness claim, so the fix edits that comment in a template file never loaded at runtime.
- `af354b0f7cc8` [recurrence of 654aefbbc4be] Comment points users to 'full' env documentation
  - The pointer to 'full ENV details' in .env.example is a stale comment in an unloaded template file.
- `c7a20cca9bc7` RATING_CONFIG_CONTENT undocumented in reference
  - RATING_CONFIG_CONTENT appears in the .env.example sample and the issue is its absence from the reference, so the fix edits the sample/env-doc file, not runtime code.
- `1a0371592bbf` Agent config variable name mismatch (AGENT vs AGENTS)
  - The .env.example ships AGENTS_CONFIG_PATH while the reference uses AGENT_CONFIG_PATH, so the fix is to correct the sample env file.
- `8d0bd1af86f5` TESTNET alignment claim conflicts with MAINNET addresses in ui-desktop.all.env
  - The env dump file is a docs/sample file not loaded at runtime and its TESTNET alignment claim conflicts with the MAINNET addresses it contains, so the fix edits that file.
- `7271670ea81e` [recurrence of 654aefbbc4be] .env.example points to an incomplete proxy-router env file as the full reference
  - The completeness claim is made in a comment inside .env.example about another env doc file, so the fix edits the sample env file/comment, not runtime code.

## `B-comment` — 17 finding(s)

A comment, docstring or NatSpec block inside a real source file, where the CODE IS
RIGHT and the comment is stale. No executable line changes.

**Enforced, not trusted.** The classifier that assigned this class is a cheap model and
was measured wrong on 20% of rows (13 of 66 assignments were overridden by a filesystem
fact). So the class is not load-bearing on its own: `bin/comment-only-gate.mjs` reads the
staged diff and rejects the commit if any changed line is not a comment or blank. Its
selftest is 8/8 including three near-misses — a code change hidden beside a comment
change, a string that merely looks like a comment, and a deleted code line. A
misclassification therefore produces a blocked commit, never a code change.

**This class splits in two, and only one half is inert.**

- **B1-inert (13 findings)** — comment prose only. Editing changes no build output.
- **B2-generator (4 findings)** — the file carries `swaggo` annotations (`@Router`,
  `@Param`, `@Success`). Those lines are syntactically comments and semantically a code
  generator's input: they compile into `proxy-router/docs/swagger.yaml`. The comment-only
  gate passes them, correctly by its own definition, while the edit still changes a
  generated artifact — and `swagger.yaml` is one of *this audit's own* sources of truth
  for the `routes` gate. B2 needs a swagger regeneration and a re-run of `routes` after
  any edit; it is not a fire-and-forget class.

  B2 members: `0e403df15e4c`, `6b9e00e4a959`, `90ebcbf8278c`, `b6ad3b7df702`.

  Verified by hand on `6b9e00e4a959`: `controller.go:439` declares
  `@Router /blockchain/models/{id}/bids [get]` while `controller.go:59` registers
  `/blockchain/models/:id/bids/active`. The finding is real and the missing segment
  is `/active`.

Paths this class would admit to the allowlist:

- `ui-desktop/src/renderer/src/utils/marketplace.ts` — 4 finding(s)
- `proxy-router/internal/blockchainapi/controller.go` — 4 finding(s)
- `proxy-router/internal/attestation/golden.go` — 3 finding(s)
- `smart-contracts/contracts/diamond/facets/SessionRouter.sol` — 3 finding(s)
- `proxy-router/internal/attestation/golden_test.go` — 3 finding(s)
- `ui-desktop/src/renderer/src/components/dashboard/Dashboard.jsx` — 2 finding(s)
- `proxy-router/internal/config/config.go` — 1 finding(s)
- `proxy-router/.env.example` — 1 finding(s)
- `ui-desktop/tools/ui-verify/frozen-values.mjs` — 1 finding(s)

- `6e1113a74cc6` [recurrence of 54d3113895ab] SEVMeasurement comment claims per-template map is picked by family_id
  - The code's MatchSEVMeasurement is measurement-based and correct, so only the stale comment about family_id selection needs editing.
- `857647067656` Claim about vendored contract having early-close guard is false
  - The marketplace.ts comment describes a guard the included SessionRouter.sol does not have, so the code is right and only the comment is stale.
- `0e403df15e4c` On-hold described as early-close-only in source comment, but docs include same-day natural/late close
  - The getStakesOnHold godoc is stale relative to the documented day-lock behavior, so only the comment needs correction.
- `05d274ec3ca7` Claim that vendored SessionRouter locks only on early close is not in the included source
  - The marketplace.ts comment describes a guard absent from SessionRouter.sol, so the source code is right and the comment must be fixed.
- `6b9e00e4a959` getActiveBidsByModel godoc route does not match registered route
  - The registered route is the actual behavior and the godoc is stale, so the fix only updates the function's comment.
- `fa25c980dcee` Close-lock prose says no timing avoids the lock, docs say after releaseAt it locks nothing
  - The contract only locks while block.timestamp is before releaseAt_, so the stale prose in marketplace.ts is fixed without changing executable lines.
- `9ce10319316c` [recurrence of c36adbeec161] TEE_PORTAL_URL example points to /api/parse-quote instead of /api/quote-parse
  - The fix corrects the TEE_PORTAL_URL example inside an integration-test comment, with no executable line changes.
- `b66aa047c220` [recurrence of 54d3113895ab] GoldenValues comment claims consumers match family_id to per-template SEV table
  - The GoldenValues struct comment asserts a per-template consumer path that has no callers, so the stale comment is fixed without changing executable code.
- `2f3870d7a6cc` [recurrence of 54d3113895ab] Comment in GoldenValues struct asserts consumer picks SEV measurement by family_id
  - The stale claim is in the SEVPerTemplate field comment; the actual matching code works on measurement value, so only the comment would be edited.
- `db28e42f9222` Vendored source lock guard description
  - The marketplace.ts comment describes a guard that SessionRouter.sol does not contain, so the comment is stale and the contract code is the source of truth.
- `f5ec14b40fa4` [recurrence of e8c43863d3b0] TEE_PORTAL_URL path mismatch in golden_test.go run instructions
  - The golden_test.go run-instruction comment gives the wrong TEE_PORTAL_URL path while config.go/.env.example have the right one, so only the comment is stale.
- `90ebcbf8278c` Active-bids endpoint documented at the wrong Swagger path
  - The Swagger annotation in controller.go points to a path already served by another handler, so the route code is right and only the annotation comment is fixed.
- `fd1185d8f80e` [recurrence of 0e403df15e4c] On-hold release schedule derived only from early closes
  - The Dashboard.jsx comment derives the on-hold release schedule only from early closes, contradicting the documented same-day natural/late close behavior, so only the comment is wrong.
- `b6ad3b7df702` [recurrence of 0e3a219288f9] Auto-sweep of matured on-hold stake claimed in Swagger comment
  - The Swagger comment claims an automatic sweep that the docs say does not exist, so the fix is to correct the comment, not the code.
- `43e479d99ec2` Reachability root stated as main.tsx vs App.tsx
  - README and code use main.tsx while the source header comment says App.tsx, so the fix is to correct the stale comment.
- `b76405387c98` [recurrence of a1e90a7e22c5] TEE_PORTAL_URL integration-test comment uses /api/parse-quote instead of /api/quote-parse
  - The golden_test.go comment points to the wrong /api/parse-quote endpoint while the canonical default is /api/quote-parse, so the fix is comment-only.
- `3e0f149bc469` [recurrence of 0e403df15e4c] Dashboard release-schedule comment assumes on-hold comes only from early closes
  - The Dashboard.jsx comment attributes on-hold release schedule only to early closes while docs also cover same-day natural/late closes, so the fix is to correct the comment.

## `E-protected` — 6 finding(s)

Under `.githooks/`, `.github/workflows/`, `scripts/` or `tools/docs-audit/` - this audit's own machinery. The loop is blocked from editing these by design, and widening that would let the audit rewrite its own gates.

Paths this class would admit to the allowlist:

- `.githooks/pre-commit` — 4 finding(s)
- `.github/workflows/proxy-router.test.env` — 1 finding(s)
- `.githooks/pre-push` — 1 finding(s)

- `790a33ae5549` Pre-commit hook documentation and comment claim two gates, but code runs three gates
  - path is under a PROTECTED prefix - the loop cannot edit it and should not
- `89150af3205d` WALLET_PRIVATE_KEY is not needed for UI contradicts reference doc
  - path is under a PROTECTED prefix - the loop cannot edit it and should not
- `0253ee0d5092` pre-push gates described in README vs actual script
  - path is under a PROTECTED prefix - the loop cannot edit it and should not
- `63bb9a44b242` [recurrence of 0253ee0d5092] pre-commit hook also runs docs-gates.mjs, not just identity-leak gate
  - path is under a PROTECTED prefix - the loop cannot edit it and should not
- `b197f1a5c44d` Pre-commit comment says two gates but code runs three
  - path is under a PROTECTED prefix - the loop cannot edit it and should not
- `10df2d552158` pre-commit hook header says two gates but script runs three
  - path is under a PROTECTED prefix - the loop cannot edit it and should not

## `C-code` — 14 finding(s)

The fix must change executable code. Each one changes what the program does. **These stay per-case, not per-class.**

Paths this class would admit to the allowlist:

- `proxy-router/internal/config/config.go` — 2 finding(s)
- `cli/main.go` — 2 finding(s)
- `proxy-router/internal/config/rating_config.go` — 2 finding(s)
- `cli/chat/client/client.go` — 2 finding(s)
- `proxy-router/internal/blockchainapi/stake_claimer.go` — 1 finding(s)
- `proxy-router/internal/blockchainapi/controller.go` — 1 finding(s)
- `proxy-router/internal/config/models_config.go` — 1 finding(s)
- `ui-desktop/src/renderer/src/components/chat/utils.js` — 1 finding(s)
- `proxy-router/internal/attestation/golden.go` — 1 finding(s)
- `proxy-router/internal/attestation/verifier.go` — 1 finding(s)
- `ui-desktop/src/main/src/client/settings/index.ts` — 1 finding(s)

- `6fd4469fdfbc` Default LOG_LEVEL_APP value mismatch
  - The contradiction is between a documented default and config.go's SetDefaults, and the listed fix file is config.go, so the executable default must change.
- `db3d2b86de02` [recurrence of 9e3194ac5b8a] ListUserSessions missing offset/limit/order
  - The ListUserSessions method signature must be changed to add offset, limit, and order parameters.
- `eb896509b1c8` MODELS_CONFIG_PATH documented default is missing from config.go
  - SetDefaults omits the ModelsConfigPath default, so executable default-setting code in config.go must be added.
- `a5505355ee87` RATING_CONFIG_CONTENT described as one-shot file seeder in warning, but actual behavior is fallback-only
  - The listed fix file is rating_config.go and making RATING_CONFIG_CONTENT behave as the documented one-shot seeder changes executable fallback logic.
- `10ae33da9c24` MOR on hold claimed as unclaimable
  - The fix must alter the implemented automatic claimer in stake_claimer.go, changing executable Go behavior rather than a comment.
- `d751e49924bd` [recurrence of 9e3194ac5b8a] ListUserSessions omits offset/limit/order parameters
  - The Go client's ListUserSessions method must be changed to accept and forward offset/limit/order, an executable API change.
- `82a24aafae4a` OpenSessionByBid path receives ModelAgent ID
  - The fix changes the registered route or path-parameter handling in controller.go to match the documented models endpoint.
- `b2985b2a7eb8` Missing models config file with no MODELS_CONFIG_CONTENT fails instead of empty registry
  - Changing ModelConfigLoader.Init to log a warning and run with an empty registry instead of returning an error modifies executable Go logic.
- `1525fb0a0889` RATING_CONFIG_CONTENT: one-shot file seeder vs fallback-only
  - Resolving the contradiction by touching rating_config.go means changing RATING_CONFIG_CONTENT from fallback-only to the documented one-shot seeder behavior.
- `835c2fb9ebe6` UI `isClosed` treats past-end sessions as closed although docs say they can remain active
  - The isClosed helper's condition labels past-EndsAt sessions as closed contrary to docs/on-chain state, so executable code in utils.js must change.
- `b247ed16bc80` [recurrence of 54d3113895ab] SEVPerTemplate field defined but only single measurement used
  - The per-template SEV map is populated but never consulted by the verification path, so fixing this requires changing executable verification code.
- `9e3194ac5b8a` Session listing endpoint missing offset/limit/order parameters
  - The Go client's ListUserSessions omits documented offset/limit/order query parameters, so the fix must alter the client method/request code.
- `f6199b3ac774` upgradeSettings removes app settings still used by get/setAppVersion
  - upgradeSettings deletes app settings still read/written by getAppVersion/setAppVersion, so the fix must change executable settings logic.
- `7dd7216517b1` [recurrence of db3d2b86de02] ListUserSessions method lacks pagination parameters
  - The client's ListUserSessions method cannot pass offset/limit/order because the signature/URL omit them, so the fix must change the client code.

## `D-contract` — 5 finding(s)

Executable Solidity in a deployed diamond facet. The live bytecode is already on chain, so an edit here only affects a future deployment - and can change protocol semantics. **Highest stakes in the set.**

Paths this class would admit to the allowlist:

- `smart-contracts/contracts/diamond/facets/SessionRouter.sol` — 3 finding(s)
- `smart-contracts/contracts/diamond/facets/Marketplace.sol` — 2 finding(s)
- `ui-desktop/src/renderer/src/utils/marketplace.ts` — 1 finding(s)

- `eebecf381521` RFP says bid price updates require deleteModelBid + postModelBid; contract and docs say one postModelBid replaces the bi
  - The RFP requirement conflicts with Marketplace.sol and the listed fix file is the deployed facet, so executable Solidity must change.
- `a90e7a977f51` Natural expiration of a session does not return full stake immediately
  - Making natural expiration return the full stake immediately requires changing executable Solidity in SessionRouter.sol.
- `7411b7e8bfb8` RFP claims bid price update requires delete+post, but contract auto-deletes on repost
  - Making the contract match the RFP's delete+post requirement changes executable Solidity in Marketplace.sol's postModelBid behavior.
- `df05ae9e1683` earlyCloseLock lacks releaseAt condition from contract
  - RECLASSED to D-contract: the file is Solidity. The earlyCloseLock helper lacks the releaseAt check that the contract and docs require, so executable UI logic must be changed.
- `9e6c88ee0056` [recurrence of c690b0070bef] SessionRouter.sol uses 365-day period for limitPeriodEnd
  - The reward limiter period constant/usage in SessionRouter.sol conflicts with docs and lives in a deployed contract facet, so the fix is Solidity contract code.

## `unclear` — 16 finding(s)

The recorded detail did not establish whether the code or the comment is the wrong side. Each needs a look at the file before it can be classed.

Paths this class would admit to the allowlist:

- `proxy-router/internal/config/config.go` — 10 finding(s)
- `proxy-router/.env.example` — 5 finding(s)
- `smart-contracts/contracts/diamond/facets/SessionRouter.sol` — 2 finding(s)
- `ui-desktop/src/renderer/src/utils/marketplace.ts` — 1 finding(s)
- `smart-contracts/contracts/diamond/facets/Marketplace.sol` — 1 finding(s)
- `proxy-router/internal/blockchainapi/controller.go` — 1 finding(s)
- `ui-desktop/src/renderer/src/store/hocs/withDashboardState.jsx` — 1 finding(s)
- `ui-desktop/src/main/src/openai-compat/server.ts` — 1 finding(s)

- `854d3c70f047` AGENT_CONFIG_PATH env var name mismatch in .env.example
  - RECLASSED from A-template: touches proxy-router/internal/config/config.go, which is compiled. The .env.example template uses the plural AGENTS_CONFIG_PATH while code and docs use the singular AGENT_CONFIG_PATH, so the template is the file that needs correcting.
- `86537bebbbc8` proxy-router.all.env is not the documented full set of config variables
  - RECLASSED from A-template: touches proxy-router/internal/config/config.go, which is compiled. The all.env template omits variables config.go already defines, so the fix is to the template's variable list, not to executable code.
- `965407881ad7` [recurrence of 1a0371592bbf] config.go struct tags use AGENT_CONFIG_PATH/AGENT_CONFIG_CONTENT
  - RECLASSED from A-template: touches proxy-router/internal/config/config.go, which is compiled. config.go already uses the correct singular AGENT_CONFIG_PATH, so the .env.example template's plural AGENTS_CONFIG_PATH is what must be corrected.
- `c69042d5dcdd` Vendored contract user-lock guard claim contradicts actual code
  - The detail explicitly says either the marketplace.ts claim is inaccurate or the provided SessionRouter.sol is not the vendored copy, so the fix could be a comment update or a contract change.
- `db3931e07baf` .env.example uses wrong variable name AGENTS_CONFIG_PATH instead of AGENT_CONFIG_PATH
  - RECLASSED from A-template: touches proxy-router/internal/config/config.go, which is compiled. The code already expects the singular AGENT_CONFIG_PATH, so the inconsistent artifact is the .env.example variable name.
- `841317632cf8` Missing variables in 'full set' env file
  - RECLASSED from A-template: touches proxy-router/internal/config/config.go, which is compiled. The false 'full set' claim is in the docs/proxy-router.all.env header, an env documentation file not loaded at runtime.
- `beef8f19fc72` AGENTS_CONFIG_PATH variable name mismatch in .env.example
  - RECLASSED from A-template: touches proxy-router/internal/config/config.go, which is compiled. The .env.example misspells the variable relative to code/docs, so correcting the example template is the fix; the file is never loaded at runtime.
- `31cc0460ab72` Natural expiration day-lock behavior in RFP contradicts source and other docs
  - RECLASSED from A-template: touches smart-contracts/contracts/diamond/facets/SessionRouter.sol, which is compiled. The RFP document contradicts the contract source and other docs, so the fix edits the RFP document rather than the deployed contract.
- `a49e05c88520` RFP claims bid price change needs delete+post, but contract auto-deletes on repost
  - RECLASSED from A-template: touches smart-contracts/contracts/diamond/facets/Marketplace.sol, which is compiled. The RFP's delete+post workflow is contradicted by the contract's auto-delete in postModelBid, so the RFP document is what needs fixing.
- `d970c1fab1ee` [recurrence of a1e90a7e22c5] Go config default hardcodes TEE_PORTAL_URL to /api/quote-parse
  - RECLASSED from A-template: touches proxy-router/internal/config/config.go, which is compiled. The config.go default matches .env.example and the mdx docs, so the outlier is proxy-router.all.env and the fix edits that unloaded env docs file.
- `2998829f3a6b` [recurrence of ae75d685c8e3] docs/proxy-router.all.env claims a default and built-in fallback for ARTIFACT_REGISTRY_URL 
  - RECLASSED from A-template: touches proxy-router/internal/config/config.go, which is compiled. The all.env comment promises an ARTIFACT_REGISTRY_URL default that SetDefaults does not implement, so the false comment in the unloaded env docs file would be edited.
- `12be888e09d5` AGENTS_CONFIG_PATH in .env.example does not match AGENT_CONFIG_PATH env var
  - RECLASSED from A-template: touches proxy-router/internal/config/config.go, which is compiled. The detail labels AGENTS_CONFIG_PATH as the misspelled sample variable while code and docs use AGENT_CONFIG_PATH, so the fix is to correct the .env.example.
- `ed7bde90b814` .env.example sets AGENTS_CONFIG_PATH, but the proxy-router reads AGENT_CONFIG_PATH
  - RECLASSED from A-template: touches proxy-router/internal/config/config.go, which is compiled. The example's AGENTS_CONFIG_PATH is never read because config.go and the reference define AGENT_CONFIG_PATH, so the fix is to correct the sample env file.
- `b3b01b0ad7ff` Docs say providers are paid at close; source exposes a provider claim route
  - classifier returned no row for this finding
- `edca5f83fa40` [recurrence of 0e403df15e4c] withDashboardState comment says on-hold is early-close-only
  - classifier returned no row for this finding
- `210a724d0927` App proof header mismatch in openai-compat server
  - classifier returned no row for this finding
