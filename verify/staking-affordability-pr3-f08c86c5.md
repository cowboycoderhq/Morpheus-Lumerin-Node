# verify: resumed-chat bubbles show the right prompt — 2026-07-17

Branch `staking-affordability-pr3`. Fixes a bug the operator hit live: resuming a
chat from history rendered **every** user bubble as the FIRST prompt ("hello",
"hello", "hello"…), while the assistant replies were correct and distinct.

## Root cause — confirmed against the operator's real stored chat

`Chat.tsx:loadChatHistory` read the user text as `prompt.messages[0].content`.
The proxy-router stores each turn's request with the WHOLE prepended conversation
in `prompt.messages`, so for turn N the array is `[u, a, u, a, …, u]` and
`messages[0]` is always the very first turn.

Verified against the real file
`data/chats/0x056db22a…json` (the DeepSeek chat in the report): per-turn
`prompt.messages` lengths are **1, 3, 5, 7**, and `messages[0]` is "hello" in
every one. Running the FIXED extractor over that same file yields the four real
prompts:

```
"hello"
"speak in english"
"what language were you speaking in"
"why did you start in that language"
```

(old code: "hello" ×4.)

## The fix

Extracted the per-turn user text into a pure, tested helper
`userTextFromPrompt(prompt, isAudioContent)` in `components/chat/utils.js`, and
called it from `loadChatHistory`. It returns the **last user-role message** (the
one that elicited `m.response`), falling back to the last entry, then `''`. All
three stored shapes handled: chat (`messages[]`), TTS (`input`), STT (audio
flag). The assistant-side branch (TTS "replay not available", image/video flags)
is unchanged.

Also correct for the OTHER stored format some chats use — single-message turns
(`messages` length 1) — because there the last message is the only message.

## Evidence

12 new logic checks (**85 total**, was 73), fixtured on the real prepended shapes:
each growing turn resolves to its OWN prompt, the three turns do NOT collapse to
one ("hello"/"speak in english"/"what language…" — `new Set(...).size === 3`), a
trailing assistant entry is skipped, single-message turns work, and TTS/STT/junk
never crash.

Mutation — 2, both caught:

| mutation | result |
|---|---|
| revert to `messages[0]` (the exact original bug) | ✗ 3 checks (turn 1, turn 2, "not all collapse") |
| ignore role, take the literal last element | ✗ "skips a trailing assistant entry" |

End-to-end: ran the shipped `userTextFromPrompt` over the operator's real
on-disk chat file — output is the four distinct prompts above.

## Gates

| gate | result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `node frozen-values.mjs` | exit 0 |
| `vite-node logic-checks.mjs` | **85 passed, 0 failed** |
| `node run.mjs` (isolate) | 14 passed, 0 failed |
| lint (touched) | `utils.js` 84 → 84 (new fn clean); `Chat.tsx` +1 house-style |

## Still not proven

- **No isolate case mounts Chat and drives a real resume.** The extractor is
  covered exhaustively AND run against the real file, but nothing renders the chat
  view from history and asserts the bubbles on screen. `loadChatHistory` itself
  (the wiring around the helper) is not under test — only the helper is.
- **Not observed live in the running app** with this build yet: the app has not
  been relaunched since this commit. The operator should re-open the DeepSeek chat
  to confirm on screen.
- Only the two most-common stored shapes were seen on disk (prepended multi and
  single-message). An STT/TTS resume was reasoned about, not observed.
