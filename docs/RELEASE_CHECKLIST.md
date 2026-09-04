# Documentation release checklist

Run through this checklist as part of every release of the Morpheus Lumerin Node. The goal: keep `/docs` truthful, current, and aligned with the binaries and contracts shipped in the release.

Maintainer-only file (not in the Mintlify nav). Links to repo-root paths use GitHub URLs so `mint broken-links` and the static site build stay clean.

## Per-release tasks

### 1. Update canonical numbers and addresses

- [ ] [`docs/get-started/networks-and-tokens.mdx`](get-started/networks-and-tokens.mdx) — confirm chain IDs, MOR token, and Diamond addresses match the release. Bump `last_verified`.
- [ ] [`README.md`](https://github.com/MorpheusAIs/Morpheus-Lumerin-Node/blob/main/README.md) — same table sanity-check.

### 2. Refresh affected pages

For each substantive change in the release, identify the affected `audience` and `product` tags in the docs frontmatter and bump `last_verified` on every matching page that reflects the change.

| Change category | Audiences to sweep |
|-----------------|--------------------|
| proxy-router HTTP API change | `developer`, all consumer/provider tags |
| MorpheusUI change | `consumer` |
| TEE / attestation change | `provider-full`, `developer`, `consumer` |
| New backend integration (`apiType`) | `provider-full`, `provider-resale`, `developer` |
| Contract change | all |
| New mor.org / tech.mor.org / active.mor.org behavior | `consumer`, `prosumer`, `provider-*` (touch ecosystem mirrors) |

### 3. Regenerate API reference

- [ ] Confirm [`proxy-router/docs/swagger.yaml`](https://github.com/MorpheusAIs/Morpheus-Lumerin-Node/blob/main/proxy-router/docs/swagger.yaml) is up to date. **Regenerate it manually** — `cd proxy-router && make swagger` (`proxy-router/Makefile:57`, which runs `swag init`). CI now checks this rather than trusting it: the `spec-fresh` job in `.github/workflows/proxy-router-ci.yml:210-233` runs `scripts/check-spec-fresh.sh`, which regenerates the spec with the Makefile's own `swag init` line and fails on any difference against `docs.go`, `swagger.json` or `swagger.yaml`. Run the target here so the regenerated files land in your commit; skipping it turns the pull request red rather than shipping a stale spec.
- [ ] If endpoint shapes changed, update the curated subset in [`docs/reference/api-endpoints.mdx`](reference/api-endpoints.mdx) and bump its `last_verified`.
- [ ] If the **hosted Morpheus Inference API** product (separate from this repo, documented at [apidocs.mor.org](https://apidocs.mor.org)) has shipped breaking changes, refresh [`docs/inference-api/overview.mdx`](inference-api/overview.mdx) and bump its `last_verified`.

### 4. Refresh ecosystem mirrors

For each page under `docs/ecosystem/` whose `source_url` may have changed:

- [ ] Visit `source_url`, compare to mirror text.
- [ ] If only superficial / live data drift: bump `last_verified`.
- [ ] If meaningful structural change: rewrite, then bump `last_verified`.
- [ ] If the source has gone away: remove the page; add a redirect in [`docs.json`](docs.json).

### 5. Run CI locally before merging

- [ ] `cd docs && mint dev` boots without errors.
- [ ] `mint broken-links` returns clean (or all flagged links are intentional external links).
- [ ] Check `last_verified` staleness **by hand**. The [docs CI workflow](https://github.com/MorpheusAIs/Morpheus-Lumerin-Node/blob/main/.github/workflows/docs.yml) does not enforce it, and does not implement a two-minor-release window:
  - Its `last-verified-staleness` job compares each page against the **single latest release tag**, not a two-release window.
  - It only emits `::warning::` and always exits 0, so it can never fail a build or block `deploy`.
  - Its checkout step sets no `fetch-depth` / `fetch-tags`, so on the default shallow checkout no tags are present, `LATEST_TAG` falls back to `v0.0.0`, and **every page passes regardless of its value**.
  - The comparison is a shell string compare (`[ "$VERIFIED" \< "$LATEST_TAG" ]`), which will mis-order `v7.10.0` against `v7.5.0` once double-digit minors exist.

Snapshot 2026-08-26: latest release tag in this repo is `v7.9.0`; **51** of 70 pages sit below it, and **0** declare a `last_verified` higher than any tag that exists here. The earlier snapshot recorded `v7.5.0` as latest and 31 pages above it; that was true of a shallower tag set and is false now — `v7.6.0` through `v7.9.0` all resolve to real commits here. Re-derive these counts rather than trusting them; a stale tag snapshot caused a correct `last_verified` to be downgraded.

### 6. Update redirects if pages moved

- [ ] Every removed or renamed `.mdx` has a redirect entry in [`docs.json`](docs.json) `redirects`.
- [ ] No internal markdown links point at deleted paths (`grep` the repo).

### 7. Final sweep

- [ ] [`AGENTS.md`](https://github.com/MorpheusAIs/Morpheus-Lumerin-Node/blob/main/AGENTS.md) lookup table still points at correct pages.
- [ ] [`.cursor/rules/morpheus.mdc`](https://github.com/MorpheusAIs/Morpheus-Lumerin-Node/blob/main/.cursor/rules/morpheus.mdc) rules still reflect current behavior.

## When in doubt

If this checklist is ambiguous for a particular change, **be conservative**: bump `last_verified` only on pages whose content you re-read and confirmed. A stale `last_verified` is better than a falsely-confident one.
