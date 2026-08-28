# Documentation corrections — every change this audit made

**Base:** `462c664d` (`origin/stake-duration-probe`)
**Upstream compared against:** `MorpheusAIs/Morpheus-Lumerin-Node` @ `7dac1b6` (2026-08-10)
**Date:** 2026-08-24
**Scope:** documentation only. No application code was changed.

## What this document is

One record of every documentation change made by the accuracy audit, grouped by
root cause rather than by file. It exists so the changes can be reviewed — or
handed upstream — without re-deriving why each was made.

The full evidence sits in `verify/docs-audit-2026-08-20.md` (findings, severity,
blind-review results) and `verify/docs-audit-2026-08-20.ledger.tsv` (2,225 claim
rows with verdicts). This file is the change list, not the argument.

**How to read an entry.** Each states what the document said, what the source says,
and the `file:line` that settles it. A correction with no source citation is a bug
in this record.

**Nearly every defect here is inherited from upstream**, not introduced by this
fork — the two repos share these files. Where a change is fork-specific it says so.

## Verifying this record

The mechanical checkers that backed this audit — page-vs-source consistency,
citation resolution, documented-vs-compiled defaults, and recurrence of
corrected claims — are **not part of this branch**. They were removed from this
pull request and held back for a review of their own, along with the
`--selftest` mutations that prove each one fires.

Nothing in this branch depends on them. Each correction below cites the
`file:line` in this tree that settles it, so any entry can be checked by hand
against the source without the tooling.

---

## 1. Settings the app does not read — removed

Four MorpheusUI environment variables were documented as configurable. None is
read by any released build. Verified three ways: no source file names them; the
Go loader's env names come from struct tags in `proxy-router/internal/config/config.go`, none of which match;
and — decisively — `ui-desktop/electron.vite.config.ts:9` builds its injection
list as `Object.keys(EnvSchema.properties)`, so a variable absent from
`ui-desktop/env.schema.ts` is loaded from `.env` and then discarded. It cannot
reach `process.env` in a packaged app. All four are absent from that schema.

Upstream commit **`50a8c1aa`** ("cicd: move back to single release", 2025-04-04) —
the commit that introduced `env.schema.ts` — is responsible for three of them:

```diff
-    localProxyRouterUrl: `http://localhost:${process.env.PROXY_WEB_DEFAULT_PORT || 8082}`,
-    symbol: process.env.SYMBOL_COIN || '<token>',
-    symbolEth: process.env.SYMBOL_ETH || 'ETH'
+    localProxyRouterUrl: `http://localhost:${process.env.SERVICE_PROXY_API_PORT}`,
+    symbol: '<token>',
+    symbolEth: 'ETH'
```

| Variable | What actually happened | Change made |
|---|---|---|
| `PROXY_WEB_DEFAULT_PORT` | **Renamed**, not removed → `SERVICE_PROXY_API_PORT` (`env.schema.ts:40`, read at `ui-desktop/src/main/config/index.ts:11`). The docs never followed the rename. | Replaced with `SERVICE_PROXY_API_PORT` everywhere, noting its `8082` default |
| `SYMBOL_COIN` | **Hardcoded** at `ui-desktop/src/main/config/index.ts:13`. The same commit annotated it `# remove it` in `ui-desktop/.env.example`. | Removed from docs and from `ui-desktop/.env.example` |
| `SYMBOL_ETH` | **Hardcoded** at `ui-desktop/src/main/config/index.ts:14`, plus a second hardcode at `ui-desktop/src/renderer/src/store/reducers/wallet.jsx:20`. Also annotated `# remove it`. | Removed from docs and from `ui-desktop/.env.example` |
| `PROXY_WEB_URL` | **Never implemented.** Every commit that has ever touched the string is a docs commit. `localProxyRouterUrl` hardcodes `http://localhost:`, so the capability its name implies — pointing the app at another host — has never existed. | Removed; replaced with an accurate description of what *is* configurable |

`PROXY_WEB_URL` was the one with real user impact. Two install pages instructed
readers to set it, and the reference page's pairing procedure told them to use it
to reach a **remote** C-Node — which cannot work at any value:

- `docs/consumers/install/docker.mdx:69` — "point MorpheusUI at it with `PROXY_WEB_URL=…`"
- `docs/consumers/install/macos.mdx:113` — "confirm `PROXY_WEB_URL` points at the proxy-router API port"
- `docs/reference/env-ui-desktop.mdx` — step 3 of "Pairing with a custom proxy-router"

All three now describe the real mechanism: publish the proxy-router's API on the
host, on port 8082 or whatever `SERVICE_PROXY_API_PORT` is set to. The reference
page carries an explicit warning that a remote proxy-router is unsupported and
that `PROXY_WEB_URL` has no effect — readers who already set it need to know it
was never doing anything.

**Files:** `docs/reference/env-ui-desktop.mdx`, `docs/ui-desktop.all.env`,
`docs/consumers/install/docker.mdx`, `docs/consumers/install/macos.mdx`,
`ui-desktop/.env.example`.

> `ui-desktop/.env.example` is a source file, not documentation. It is included
> because leaving it would keep handing every new setup two dead settings. The
> edit removes five lines and changes no behaviour — nothing reads the keys.

## 2. Session stake return — the largest correction

Seventeen files described what a consumer gets back when closing a session. The
contract locks `min(remaining stake, stipendToStake(seconds consumed in the FINAL
UTC DAY × pricePerSecond, startOfEndDay))` (`SessionRouter.sol:306-308`).

Consequences the docs did not state: a **same-day** session returns close to
nothing at close; a **multi-day** session returns *more* than "the unused
portion"; and a close after `releaseAt` locks nothing at all. The previous text
described a simple unused-portion refund, which is right in none of those cases.

This was the most contested finding in the audit. Two independent external
reviewers and the oracle all objected to the first reading; the in-family
reviewers marked the original claim TRUE twice. The final formula was settled
against the contract source, not against any reviewer's opinion.

## 3. Security controls documented as shipped

`.ai-docs/TEE_Attestation_Architecture.md` marked several controls **DONE** that
have no production callers. `PinnedHTTPClient` and its `VerifyPeerCertificate`
exist at `proxy-router/internal/attestation/backend_verifier.go:414-454` with
zero callers outside their own test; inference traffic actually goes through a
bare `http.Client{}` on system roots (`aiengine/ai_engine.go:64` → `openai.go:38-40`).

Six status claims changed from **DONE** to **NOT WIRED** / **Partially wired**,
each naming its definition site and the absence of callers. Two related fixes:
the TLS check binds **SPKI**, not a whole-certificate fingerprint (commit
`878ee3b4`; the old behaviour was described in six places and the word "SPKI"
appeared nowhere), and NVIDIA NRAS verification is **fatal**, not "non-fatal if
unreachable" (commit `33b063f8`).

> **The doc fix is not the real fix.** Correcting the text makes the gap visible;
> it does not close it. Wiring `aiengine` to the pinned client — or deciding the
> control is not wanted — remains an open code decision.

## 4. Numbers a reader acts on with money

| Was | Is | Source |
|---|---|---|
| `PROVIDER_REWARD_LIMITER_PERIOD` "currently 1 day" | **365 days** | `ProviderStorage.sol:21` |
| Reward cap "proportional to" stake | the period budget **is** the full stake; a claim is capped at `provider.stake - provider.limitPeriodEarned`, the unused remainder of it | `SessionRouter.sol:383` |
| Consumer escrow = `pricePerSecond * duration` | pool mode uses `stipendToStake`, ~**317×** larger | `SessionRouter.sol:408-414` |
| Bid price floor `1e10` wei/sec (7 pages) | `1e13` mainnet, `5e15` sepolia — a bid at the documented floor **reverts** | `deploy/data/config_base_*.json:7`, `Marketplace.sol:80-84` |
| "There is no upper limit" on bid price | a governance-set `bidMaxPricePerSecond` reverts above it | `Marketplace.sol:80-84` |
| A "5-token session minimum" | does not exist — it is `MIN_SESSION_DURATION = 5 **minutes**` misread as a token amount | — |
| 10,000-token "subnet provider" tier (6 pages) | no tier exists; one `providerMinimumStake` for all | `ProviderRegistry.sol:40-44` |
| Provider bond "refundable" | deregistration returns `stake - limitPeriodEarned` inside the 365-day window | `ProviderRegistry.sol:99-105` |

## 5. Instructions that fail when followed

- **Wrong port in six curl examples.** `api-endpoints.mdx:10` states the API is on
  `:8082`; six examples use `:8084`/`:8085`, which appear in no non-doc file.
- **"All endpoints require Basic Authentication" is false.** Four operations carry
  no `security:` in `swagger.yaml` and no `CheckAuth`: `GET /healthcheck`,
  `POST /proxy/provider/ping`, `POST /auth/users/request`, `GET /auth/cookie/path`.
- **A phantom path segment.** `register-onchain.mdx:144` showed
  `POST .../bids/<id>/delete`; the spec defines `DELETE /blockchain/bids/{id}`
  (`swagger.yaml:1481-1482`).
- **Manual stake recovery is automatic.** Five pages instructed users to call
  `withdrawUserStakes` by hand; `stake_claimer.go` sweeps matured stake every 10
  minutes and `proxy-router/internal/blockchainapi/controller.go:69` exposes `GET /blockchain/stakes/on-hold`.
- **Mnemonic recovery is not tier-1-only.** The import flow offers ten derived
  accounts (`ImportFlow.jsx:110-129`); the old text pushed users toward an
  unnecessary private-key workaround.
- **Agent retry guidance keyed on 401/403/429.** Every adapter error, including
  `ErrSessionExpired`, maps to **HTTP 500** (`proxy-router/internal/proxyapi/controller_http.go:281-284`), so
  retry logic built to the old spec never fires.
- **Stale toolchain floor.** "go 1.22+" → `go 1.25.0` (`proxy-router/go.mod:3`).
- **Bundled model moved twice.** Port `8080` → `3434` (`env.schema.ts:43`), and
  "tinyllama" → Qwen2.5-1.5B-Instruct (`orchestrator.config.ts:44-49`).

## 6. Defaults that did not match the compiled value

Found by the audit's `check-mechanized.mjs` checker, which compares documented
defaults against the defaults the code applies. It produced 16 candidates;
**scouts confirmed 12 and refuted 4**, and each refutation was fixed in the
checker rather than waved past.

- Four `LOG_LEVEL_*` defaults `warn` → the compiled `debug`/`info`/`info`/`info`,
  each noting that `proxy-router/.env.example` ships `warn` as a recommendation.
- `PROXY_FORWARD_CHAT_CONTEXT` `true` → `false` (`proxy-router/internal/config/config.go:198-206`, "Default OFF").
  This inverts whether stored chat history is re-injected into every prompt — a
  direct token-cost consequence.
- `TEE_PORTAL_URL` gained the `/quote-parse` path the code actually uses.
- `CHAIN_NAME` replaced a `DISPLAY_NAME` entry that nothing reads.

## 7. Fork-operator documents

`CLAUDE.md` opened by telling a reader they were on branch `pr3-reskin` with two
git remotes; the branch is `stake-duration` and exactly one remote exists. It
also claimed `ui-desktop/node_modules` is a symlink (it is a real directory) and
instructed `npm install` in a directory whose `ui-desktop/package.json:15` declares
`"packageManager": "yarn@1.22.22"`, where only `yarn.lock` is present and
`.gitignore` explicitly bans a `package-lock.json` there (which is why no such file is tracked). The setup document told you to
do the thing the repository guards against.

`ui-verify/TESTING.md` claimed every commit passes typecheck + build via a
pre-commit hook. At audit time no hook existed. One has since arrived with the
opsec work — `.githooks/pre-commit` runs `npm run build` (which is
`npm run typecheck && electron-vite build`) on staged `ui-desktop/` files, wired
up by `ui-desktop`'s `postinstall`. The page now describes that, and keeps the
part that is still true: **no CI workflow runs a typecheck**, so a
`git commit --no-verify` bypass is never caught server-side — unlike the
identity-leak check, which `opsec-check.yml` re-runs. It also warns that a global
`core.hooksPath` silently overrides the repo's hook wherever `postinstall` has
not run, which is the case in this very checkout.

## 8. Provenance metadata

**19 of 21 pages point their `source:` frontmatter at deleted files** — pre-Mintlify
markdown removed during the site migration. This also explains the dead
cross-references inside `.ai-docs/`. The chain is broken repo-wide; individual
pages were corrected where the real source was identifiable.

## Resolved since the audit — the hedge paid off

The audit flagged **32 pages declaring `last_verified` values of v7.6.0–v7.9.0**
when the highest tag reachable at the time was `v7.5.0` (282 tags). It recorded
these as `UNVERIFIABLE-IN-REPO` rather than FALSE, on the explicit reasoning that
upstream tags might simply be unfetched.

**They were.** The repository now carries 295 tags, and `v7.6.0`, `v7.7.0`,
`v7.8.0` and `v7.9.0` all exist. **No correction is needed and none was made** —
had the audit called it FALSE, 32 pages would have been wrongly edited.

One real defect remains in that area: the CI job meant to catch stale
`last_verified` values (`.github/workflows/docs.yml:88`) compares versions with a
**shell string comparison** (`[ "$VERIFIED" \< "$LATEST_TAG" ]`), which mis-orders
them — and all three docs CI checks end in `|| echo "::warning::"`, so none can
fail a build. That is a code change, out of scope here.

## Deliberately not changed

- **69 uncorroborated defects.** They rest on a single in-family review pass at a
  measured 83% precision, so roughly one in six would not survive scrutiny.
  Editing on that basis would import the audit's own error rate into the docs.
- **~260 external URLs** were never fetched; in-repo reach was the chosen scope.
- **All application code.** Several corrections document a gap rather than close
  it — the unwired `PinnedHTTPClient`, the pre-commit hook that ships but is not
  wired in this clone, and the version-comparison bug above.

## 9. Every shipped example config pointed at the wrong endpoint

`apiUrl` is documented as the "full url including endpoint"
(`proxy-router/internal/config/models-config-schema.json:31`), and the code holds
it to that literally: **no engine appends a path**. All four POST to the
configured URL verbatim after trimming a trailing slash —
`proxy-router/internal/aiengine/openai.go:64`, `claudeai.go:109`,
`prodia_v2.go:64`, `hyperbolic_sd.go:69`.

Every one of the six entries in the shipped example stopped at the API version
segment, so a provider who copied it POSTed to `/v1` and got nothing back.

| `apiType` | Was | Now | How the correct value was established |
|---|---|---|---|
| `openai` | `http://localhost:8080/v1` | `…/v1/chat/completions` | request shape + `.github/workflows/models-config.json:8` |
| `prodia-v2` | `https://inference.prodia.com/v2` | `…/v2/job` | the engine's own `PRODIA_V2_DEFAULT_BASE_URL` (`prodia_v2.go:20`) |
| `hyperbolic-sd` | `https://api.hyperbolic.xyz/v1` | `…/v1/image/generation` | the engine's own `HYPERBOLIC_DEFAULT_BASE_URL` (`hyperbolic_sd.go:17`) |
| `claudeai` | `https://api.anthropic.com/v1` | `…/v1/messages` | `x-api-key` + `anthropic-version` headers identify the Messages API (`claudeai.go:115-117`) |
| `openai` (remote) | `https://api.openai.com/v1` | `…/v1/chat/completions` | as above |

No value was guessed. Two came from the engines' own default constants — the code
says what a complete URL looks like — and all five are independently confirmed by
`docs/reference/models-config.mdx:41,47,54,65,72`, which already documented the
correct form. The repository knew the right answer; only the copies people paste
were stale.

The same blob appears in **four** files, so fixing one would have left three:

- `proxy-router/models-config.json.example` — the file providers copy
- `docs/proxy-router.all.env:80` — `MODELS_CONFIG_CONTENT`
- `proxy-router/.env.example:36` — `MODELS_CONFIG_CONTENT`
- `.github/workflows/proxy-router.test.env:25` — commented out

24 URLs corrected, six per file. The example still parses as JSON and its URL set
is now a strict subset of the documented set.

> Two of these are source files rather than documentation. They are included
> because a provider copies them; leaving them would preserve the exact failure
> the fix exists to remove. Neither changes behaviour — a config nobody has
> copied yet cannot regress.

## 10. The settings page listed roughly half of what the app accepts

`docs/ui-desktop.all.env` calls itself the full set. It listed 14 of the 25
variables `ui-desktop/env.schema.ts` declares.

The cause was a wrong source, not laziness: the file's own header named
`src/main/config/index.ts`, and it mirrored that file faithfully. But the app
reads its settings in **three** places — that file, `orchestrator.config.ts`, and
`src/main/logger.ts` — so the chosen source was never the whole list. The header
now names `env.schema.ts`, which is the definition the build actually injects
from.

**Not every absence was a defect.** MorpheusUI launches the proxy-router as a
child process and hands it an environment block (`orchestrator.config.ts:14-42`),
so some of its settings are pass-throughs whose behaviour belongs to the router
and is documented on the router's page. Two of the twelve are that:
`BLOCKSCOUT_API_URL` (forwarded unchanged, `:17`) and `NODE_ENV` (forwarded
renamed as `ENVIRONMENT`, `:19`). They are now listed under a "Passed through"
heading that points at the router's page rather than restating it.

The other ten are the desktop app's own and appeared in no document:

| Added | What it does |
|---|---|
| 6 × `SERVICE_PROXY_DOWNLOAD_URL_*` | where the proxy-router binary is fetched, per platform. All default to empty |
| `SERVICE_PROXY_PORT` | the router's consumer-facing TCP tunnel (`PROXY_ADDRESS`) |
| `SERVICE_IPFS_API_PORT` | the bundled IPFS daemon, also the router's `IPFS_MULTADDR` |
| `SERVICE_AI_API_PORT` | the bundled llama.cpp server, also the local model's `apiUrl` |
| `LOG_LEVEL` | the desktop app's own logger verbosity |

**`LOG_LEVEL` was worse than missing.** A search for it appears to find it on the
proxy-router's page — but that is a substring match on `LOG_LEVEL_APP`,
`LOG_LEVEL_ETH_RPC`, `LOG_LEVEL_STORAGE` and `LOG_LEVEL_TCP`. The router has no
plain `LOG_LEVEL`. The desktop app's is a different setting in a different
program that happens to share a word, and both pages now say so explicitly.

One caveat is recorded rather than resolved: `IGNORE_DEBUG_LOGS` is the only
variable the app reads (`src/main/config/index.ts:17`) that the schema does not
declare, so by the same injection rule a value set in `.env` never reaches it in
a packaged build. The mechanism is verifiable from source; the runtime behaviour
was not tested against a build, and the doc says exactly that.

The dump is now 25 of 25. Every line reference added here was checked
mechanically against the file it cites — 19 of 19 contain the identifier claimed.

## Every file changed

| File | Lines |
|---|---|
| `.ai-docs/TEE_Attestation_Architecture.md` | +17 / -17 |
| `.ai-docs/TEE_CICD_Supply_Chain_Hardening.md` | +5 / -5 |
| `.github/workflows/proxy-router.test.env` | +1 / -1 |
| `AGENTS.md` | +3 / -3 |
| `CLAUDE.md` | +17 / -11 |
| `docs/ai/llm-prompt-cheatsheet.mdx` | +1 / -1 |
| `docs/ai/local-vs-blockchain-models.mdx` | +3 / -3 |
| `docs/ai/myths.mdx` | +7 / -7 |
| `docs/ai/session-states-open-close-recover.mdx` | +5 / -5 |
| `docs/ai/where-is-my-mor.mdx` | +7 / -6 |
| `docs/ai/why-locked-in-contract.mdx` | +4 / -4 |
| `docs/concepts/local-vs-onchain-models.mdx` | +3 / -3 |
| `docs/concepts/rewards-and-economics.mdx` | +2 / -2 |
| `docs/concepts/sessions-stake-close-recover.mdx` | +25 / -12 |
| `docs/concepts/tokens-and-fees.mdx` | +19 / -13 |
| `docs/concepts/what-is-morpheus.mdx` | +1 / -1 |
| `docs/consumers/buy-bid.mdx` | +4 / -4 |
| `docs/consumers/chat.mdx` | +1 / -1 |
| `docs/consumers/install-from-source.mdx` | +2 / -2 |
| `docs/consumers/install/docker.mdx` | +2 / -2 |
| `docs/consumers/install/linux.mdx` | +3 / -3 |
| `docs/consumers/install/macos.mdx` | +3 / -3 |
| `docs/consumers/install/windows.mdx` | +3 / -3 |
| `docs/consumers/quickstart.mdx` | +7 / -7 |
| `docs/consumers/troubleshooting.mdx` | +3 / -3 |
| `docs/ecosystem/app-mor-org.mdx` | +1 / -1 |
| `docs/get-started/introduction.mdx` | +1 / -1 |
| `docs/get-started/networks-and-tokens.mdx` | +6 / -6 |
| `docs/get-started/quickstart-consumer.mdx` | +3 / -3 |
| `docs/get-started/quickstart-provider.mdx` | +1 / -1 |
| `docs/prosumers/gateway-for-everclaw.mdx` | +1 / -1 |
| `docs/prosumers/running-local-agents.mdx` | +1 / -1 |
| `docs/providers/full/pricing.mdx` | +7 / -7 |
| `docs/providers/full/proxy-router-akash.mdx` | +1 / -1 |
| `docs/providers/full/quickstart.mdx` | +3 / -3 |
| `docs/providers/full/register-onchain.mdx` | +10 / -10 |
| `docs/providers/full/verify-setup.mdx` | +1 / -1 |
| `docs/providers/resale/container-pnode.mdx` | +1 / -1 |
| `docs/providers/resale/registering-bid.mdx` | +4 / -4 |
| `docs/providers/resale/reselling-venice.mdx` | +1 / -1 |
| `docs/proxy-router.all.env` | +1 / -1 |
| `docs/reference/api-auth.mdx` | +50 / -26 |
| `docs/reference/api-endpoints.mdx` | +26 / -8 |
| `docs/reference/env-proxy-router.mdx` | +6 / -6 |
| `docs/reference/env-ui-desktop.mdx` | +9 / -6 |
| `docs/reference/glossary.mdx` | +7 / -7 |
| `docs/reference/troubleshooting.mdx` | +4 / -4 |
| `docs/RELEASE_CHECKLIST.md` | +8 / -2 |
| `docs/ui-desktop.all.env` | +9 / -11 |
| `proxy-router/.env.example` | +1 / -1 |
| `proxy-router/models-config.json.example` | +6 / -6 |
| `README.md` | +1 / -1 |
| `smart-contracts/docs/inference-contract-enhancements-rfp.md` | +1 / -1 |
| `ui-desktop/.env.example` | +0 / -5 |
| `ui-desktop/tools/ui-verify/README.md` | +5 / -3 |
| `ui-desktop/tools/ui-verify/TESTING.md` | +7 / -3 |

**56 files.** Counts are `git diff --numstat` against `462c664d`.
