# verify: Electron shell hardening — provider-link → IPC → fund-theft path — 2026-07-17

Branch `electron-hardening` off `pr3-reskin`. Closes a verified pre-existing
(upstream) chain surfaced by the security audit's non-Claude reviewer (Grok),
which five Claude-family reviewers had collectively rated "defense-in-depth,
not active without XSS." That rating was wrong.

## The vulnerability (verified end to end, no XSS required)

1. A malicious/compromised **provider** (untrusted by design) returns a chat
   response containing a plain markdown link `[…](https://evil.com)`.
2. react-markdown renders a real `<a href>`. Clicking it **top-level-navigates
   the wallet BrowserWindow** — there was no `will-navigate` guard and no global
   anchor interceptor, so a plain `<a>` click is an in-window navigation.
3. The hostile origin loads in the same webContents and inherits the preload's
   `window.ipcRenderer` bridge (arbitrary channels), and the ipcMain wrapper did
   **no sender-origin check**.
4. `window.ipcRenderer.send('send-mor', {to: attacker, amount})` → `handlers.
   sendMor` → `POST /blockchain/send/mor` (auth cookie auto-attached by main) →
   router signs with the **unlocked in-memory key, no per-tx password** → drain.

**Empirically confirmed (UNHARDENED):** an Electron harness using the REAL built
preload showed `did-navigate → evil.html` and `reached-main=YES sender=…evil.html
hasIpc:true` — a navigated hostile origin's `ipcRenderer.send` reaching a main
handler with no rejection. (Only the money send itself was not detonated; it needs
the real wallet. `sendMor` is a registered handler with no second factor, so the
path is complete.)

## The fix — three independent controls, defense in depth

- **`will-navigate` / `will-redirect` deny off-app origins** (`main/index.ts`).
  The app is a hash-routed SPA that never legitimately top-level-navigates after
  load, so anything that tries is a link click or a redirect attack. Blocked; a
  genuine `https:` link is handed to the OS browser instead.
- **`openExternal` scheme allowlist** → `https:`/`mailto:` only, in BOTH the main
  `setWindowOpenHandler` and the preload `openLink` bridge. No `file:`/custom/
  `javascript:` to the OS launcher (the classic desktop-RCE vector).
- **IPC sender-origin check** (`subscriptions/utils.js onRendererEvent`): every
  renderer→main handler rejects any message whose sender frame is not the app
  origin (`file://` prod, the vite dev URL). The money channels are why this
  boundary must be enforced.

Either the nav-guard or the sender-check alone breaks the chain; both close it
with redundancy.

## Evidence

**Fix blocks the chain (HARDENED harness, same real preload):**
```
WILL_NAVIGATE blocked -> https://example.com/attacker
SENDER_CHECK rejected sender=data:text/html,<script>…ipcRenderer.send('poc-probe')…</script>
RESULT will_navigate_blocked=YES sender_rejected=YES hostile_reached_main=NO
```

**No regression of the legit app:** the hardened build boots in dev to "App ready",
renderer loads (no white-screen / preload crash), services healthy, and **0**
`rejected: untrusted sender` warnings — the sender-check trusts the real renderer
(dev `localhost`; prod `file://`).

| gate | result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run build` (pre-commit gate) | exit 0 |
| `node run.mjs` (isolate) | 9 passed, 0 failed (renderer components unaffected) |
| `node frozen-values.mjs` | exit 0 |

## Still not done / follow-ups (NOT in this branch)

- **CSP** — deferred deliberately: a correct `connect-src` must cover the router's
  streaming endpoints + the eth node + the geckoterminal rate call, and a wrong
  CSP white-screens the app. Defense-in-depth; the chain is already closed without
  it. Needs its own careful pass.
- **Provider media beacon** — `<img|video src={message.text}>` still auto-loads
  remote `http(s)` (IP/online-status leak, undercuts the "Secure/TEE" privacy
  claim). Scheme/host-gate the media `src`. MEDIUM, separate fix.
- **Raw ipcRenderer channel passthrough** — the sender-check closes the origin
  hole, but the bridge still forwards arbitrary channel names; a named allowlist
  + a user confirm on money sends would be belt-and-suspenders.
- **Interactive round-trip not driven** — boot + zero-rejection is strong, but a
  full login→balances→send flow on a shim profile should be run before merge to
  confirm no legit channel is inadvertently blocked in the packaged (`file://`)
  build.
- The `sandbox_bundle` `TypeError` in the dev log is a pre-existing Electron
  internal (present unhardened), not from these changes.

## Provenance

The vulnerability was found by an independent non-Claude reviewer (Grok 4.5) after
five Claude-family reviewers shared the same blind spot — a live demonstration of
why the verification gate requires non-Claude eyes on family-shared failure
classes. The fix should be re-reviewed by the same non-Claude lane before merge.
