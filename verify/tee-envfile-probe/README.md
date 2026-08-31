# Probe: does `usr/.env` override the image's baked-in TEE settings, and is that
# override covered by the attestation measurement?

Two claims in the docs depend on the answer:

- "Chat context storage is disabled and **cannot be re-enabled**" (`tee-overview.mdx:24`)
- "Only **5 variables** are configurable at runtime" (`tee-reference.mdx:35`)

## Method

Replicated the shipped structure rather than pulling the 1 GB TEE image, because
the question is a precedence question and a minimal image isolates it:

- an image baking `ENV PROXY_STORE_CHAT_CONTEXT=false`, exactly as
  `proxy-router/Dockerfile.tee:23` does
- a compose declaring `env_file: usr/.env`, exactly as
  `proxy-router/docker-compose.tee.yml:15-16` does
- `usr/.env` containing `PROXY_STORE_CHAT_CONTEXT=true`

Three arms, so the probe can return both answers.

## Result

| Arm | Setup | `PROXY_STORE_CHAT_CONTEXT` inside the container |
|---|---|---|
| A | image only, no settings file | `false` — the baked-in value holds |
| B | same image + `env_file: usr/.env` | **`true`** — the settings file wins |

Arm A is the control: it shows the baked-in value does apply, and that the probe
can see the difference.

## Is the override measured?

Computed with the repo's own `proxy-router/scripts/compute-rtmr3.py`, against the
shipped `proxy-router/docker-compose.tee.yml` (1871 bytes, SHA-256
`66af912ec3b3d0b58cc3a630b8bf671d78b46300f7e6f02b47d41cb4e55641ec`) and the
Intel TDX rootfs pinned at `.github/tee/secretvm.env:36`
(`9d1ace112bc52c088c8c11b713c5f6e3021e0788278bb2fb47c571c7e728710c`):

| `usr/.env` contents | RTMR3 |
|---|---|
| `PROXY_STORE_CHAT_CONTEXT=false` | `2a9b056cf537a746b310f38e2a6f990b…` |
| `PROXY_STORE_CHAT_CONTEXT=true`  | `2a9b056cf537a746b310f38e2a6f990b…` — **identical** |

Reproduce, from the repository root:

```
python3 proxy-router/scripts/compute-rtmr3.py \
  proxy-router/docker-compose.tee.yml \
  --rootfs-sha256=9d1ace112bc52c088c8c11b713c5f6e3021e0788278bb2fb47c571c7e728710c
```

The AMD SEV-SNP rootfs pinned at `.github/tee/secretvm.env:41`
(`4e11fcb840d9dffe2b33868314d33bac337f82a25f09b3ca990e21f3002a59d2`) gives
`5d5c8c85ebec14d3bd994cd0b30f60b0…` — a different absolute value, identical
across the same two arms.

Control: appending one byte to the compose file DOES change the measurement (TDX
arm becomes `63fc02220d3357b4b8f701023badb290…`), so the probe discriminates.

The script takes only the compose file and the rootfs digest. `usr/.env` is not
an input, and its contents are not in the compose, so nothing about it reaches
the measurement.

### Correction: the value first published here does not reproduce

This section originally reported `bc28581296013af3…` for both arms and named
neither the rootfs digest nor the compose bytes behind it, which is why the gap
went unnoticed. That value could not be reproduced. Checked: the shipped compose,
`proxy-router/docker-compose.yml`, and
`proxy-router/internal/attestation/testdata/tdx_cpu_docker_check_compose.yaml`,
each against both currently pinned rootfs digests; all three historical revisions
of `docker-compose.tee.yml`; and all 11 distinct rootfs digests any revision of
`.github/tee/secretvm.env` has ever pinned. A wider sweep of every ordered pair
and every compose-first triple over 60 repo-resident SHA-256 values — every file
under `proxy-router/` to depth 2, every file under `.github/tee/`, and those 11
pins, 7200 combinations — matched nothing. The compose and the pins are
byte-identical now to what they were at the commit that published the number, so
this is not drift.

The probe's stand-in image and minimal compose were never committed, so the
likeliest origin is that the number was computed over the minimal replica compose
described under Method rather than over the shipped compose this section named.
That cannot be confirmed from repo bytes, and is recorded as a hypothesis.

The finding is unaffected, because it is a comparison and not an absolute value.
Both arms take the same compose and the same rootfs digest as input, so whichever
pair was used, both arms shared it and their equality is the whole of the claim.
`usr/.env` is not an argument to the script — its signature is exactly one
compose path plus one rootfs digest — so no choice of rootfs can route its
contents into the measurement. What was wrong was the provenance of a published
number, and it is now stated with the inputs that produce it.

## What this means

The compose file is measured, so editing the compose to add an override is
detected. `usr/.env` is referenced BY the measured compose but its contents are
not measured, and Docker precedence puts `env_file` above the image's `ENV`. So
an override placed there takes effect and leaves the attestation unchanged.

The config loader imposes no allowlist — `internal/config/loader.go:39-64` reads
every `env:`-tagged field from the environment — and `Dockerfile.tee:45` is a
bare `ENTRYPOINT ["proxy-router"]` with no wrapper that could re-force values.

## Not tested

The real TEE image was not run, and no SecretVM deployment was exercised. This
establishes the precedence and measurement behaviour, not the behaviour of a
live attested deployment, where the platform may impose constraints not visible
in this repo.
