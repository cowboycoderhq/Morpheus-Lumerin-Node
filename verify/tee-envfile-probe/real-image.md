# Probe 2 — the real TEE image, run locally

Probe 1 used a stand-in image to isolate the precedence question. This runs the
**shipped image** through the **shipped compose shape**, so the result is about
the product rather than about Docker.

Setup: `ghcr.io/morpheusais/morpheus-lumerin-node-tee:latest` (amd64 under
emulation), `network_mode: none`, no published ports, a disposable key generated
for the run and never funded or broadcast, and an RPC pointed at a closed local
port. Nothing was reachable from outside this machine and nothing was sent
anywhere.

Observation point: the router prints `Loaded config: {...}` at startup, before it
fails to reach the chain. That is its own effective configuration, not an
inference about it.

## The image does bake the values in

`docker image inspect` on the shipped image confirms `PROXY_STORE_CHAT_CONTEXT=false`,
`ENVIRONMENT=production`, `LOG_IS_PROD=true`, and the four log levels. Entrypoint
is a bare `proxy-router` — no wrapper that could re-force anything.

## Every claimed-frozen setting was overridable

Each row: the operator's `usr/.env` is the only thing that changed, exactly the
file the shipped compose names in `env_file:`.

| Doc claim | Setting | Baseline | With the operator's file |
|---|---|---|---|
| "Chat context storage … **cannot be re-enabled**" | `StoreChatContext` | `false` | **`true`** |
| "Logging is in production mode and **cannot be increased**" | `IsProd` | `true` | **`false`** |
| " | `LevelApp` | `info` | **`debug`** |
| "Blockchain config … **immutable, frozen**" | `ChainID` | `8453` | **`1`** |
| " | Diamond address | image value | **the injected test value** |

Addresses were compared, never printed.

## The measurement does not move

From probe 1, using the repo's own `compute-rtmr3.py` against the shipped compose:
flipping `PROXY_STORE_CHAT_CONTEXT` in `usr/.env` leaves the value byte-identical,
while changing one byte of the compose does move it.

## Two failures in my own probe, recorded because they nearly produced a wrong answer

- I first queried the container with `printenv`. **That binary does not exist in
  this image**, so the command never ran, `grep -c` on empty output returned 0,
  and I read it as "the variable never reached the container." A tool that cannot
  answer answered anyway.
- I then compared the Diamond address with a lowercase exact match. Go prints
  addresses in EIP-55 **checksummed mixed case**, so the comparison could never
  have matched, and I recorded "override did not take effect" for a setting that
  in fact was overridden.

Both were caught by results that disagreed with each other. Neither would have
been caught by the probe passing.

## Not established

No live SecretVM deployment was exercised. This shows what the shipped image and
binary do with an operator settings file; it does not show what the hosting
platform may additionally constrain when it provisions that file.
