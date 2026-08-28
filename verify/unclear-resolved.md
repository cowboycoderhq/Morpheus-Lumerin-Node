# Re-classified: findings the first pass could not place

8 findings were re-examined WITH the real source in front of the model, which is
what the first pass lacked. Each answer cites the line it relied on.

**Two of the eight were then overturned by hand**, which is the point of citing a
line: a cited line can be read. Both `C-code` verdicts were wrong. The
classifier's evidence line is kept below with the correction next to it, rather
than deleted, so the failure mode stays visible.

Generated 2026-08-26 18:24 UTC.

| id | class | evidence | why |
|---|---|---|---|
| `c69042d5dcdd` | `B-comment` | `ui-desktop/src/renderer/src/utils/marketplace.` | The comment claims the vendored SessionRouter wraps the user lock in `if (!isClosingLate_)`, but the shown SessionRouter.sol `_rewardUserAfterClose` (lines 293-316) has no such guard. The ea |
| `2998829f3a6b` | `A-template` | `docs/proxy-router.all.env:147` | The all.env comment promises ARTIFACT_REGISTRY_URL 'can be left blank to use the built-in default', but config.go SetDefaults (lines 250-256) only defaults TEE.PortalURL and TEE.ImageRepo an |
| `31cc0460ab72` | `doc-only` | `smart-contracts/contracts/diamond/facets/Sessi` | The user day-lock in _rewardUserAfterClose triggers solely on block.timestamp < releaseAt_ with no check for early vs natural/late close, so the RFP document's claim that natural expiration  |
| `b3b01b0ad7ff` | `doc-only` | `docs/ai/session-states-open-close-recover.mdx:` | The mdx says providers are paid inside closeSession and denies a claim function, but controller.go registers POST /proxy/sessions/:id/providerClaim and SessionRouter.sol exposes claimForProv |
| `a49e05c88520` | `doc-only` | `smart-contracts/docs/inference-contract-enhanc` | The RFP problem statement claims a bid price change requires deleteModelBid + postModelBid, but Marketplace.sol:93-97 auto-deletes the prior active bid on repost and pricing.mdx:72 documents |
| `edca5f83fa40` | `B-comment` | `ui-desktop/src/renderer/src/store/hocs/withDas` | The comment says the on-hold stake is 'time-locked by closing a session EARLY', but the documented behavior also covers same-day natural/late closes; the fetching code itself is correct, so  |
| `d970c1fab1ee` | `C-code` | `proxy-router/internal/config/config.go:252` | The TEE_PORTAL_URL default is assigned in executable code at config.go:252; reconciling the disputed value requires changing that constant, not a comment or doc. |
| `210a724d0927` | `C-code` | `ui-desktop/src/main/src/openai-compat/server.t` | The admission check reads `x-morpheus-key` at server.ts:291 while appProofHeader() emits `x-morpheus-app` at server.ts:396; the mismatch is in executable request-handling code. |

---

## Overturned on hand-verification

### `210a724d0927` — REJECTED, not `C-code`

The classifier reported a mismatch between `x-morpheus-key` at `server.ts:291`
and `x-morpheus-app` at `server.ts:396`. There is no mismatch: those are two
distinct mechanisms that were never meant to agree.

- `server.ts:291` reads `x-morpheus-key` into `admitRequest()` as `morpheusKey`,
  checked against `cfg.token` — the bearer-key admission path.
- `server.ts:396` emits `x-morpheus-app`, and `server.ts:902-903` reads it back
  and compares it to `this.internalKey` — the per-process app-proof path.

Each header is emitted and read consistently. The classifier saw two similar
header names in one file and inferred a pairing.

### `d970c1fab1ee` — ALREADY FIXED by `2c9d4702`, not open `C-code`

The classifier was right that the default lives in executable code at
`config.go:252`, and wrong that anything still disagrees with it. At
`audit-base`, `docs/proxy-router.all.env` carried `.../api`; `2c9d4702` corrected
it. `config.go:252`, `.env.example:69` and `all.env:139` now all read
`.../api/quote-parse`. Real finding, stale by the time it was classified.

## Settled without a model at all

Eight of the original sixteen never needed the model. Six were one question —
whether `.env.example` shipped the plural `AGENTS_CONFIG_PATH` — already fixed by
`2198c13b`. Two were one question about whether `docs/proxy-router.all.env` is
complete, settled by an exact set comparison: `config.go` declares 63 `env:` tags,
`all.env` lists 51, 12 are missing and 0 are spurious.

Grouping duplicates before spending model calls is worth more here than any
per-finding cleverness.
