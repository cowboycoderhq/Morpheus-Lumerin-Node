export const isClosed = (item) => item.ClosedAt || (new Date().getTime() > item.EndsAt * 1000);

// On-chain tag that marks a model as running inside a Trusted Execution Environment (TEE).
// Mirrors the backend IsTeeModel() check in proxy-router/internal/blockchainapi/model_tags.go.
export const SECURE_TAG = 'tee';

export const isSecureModel = (model) =>
    Array.isArray(model?.Tags) &&
    model.Tags.some((t) => String(t).toLowerCase().trim() === SECURE_TAG);

// Plain-language copy explaining the TEE feature to non-technical users.
// Accuracy-checked against docs/concepts/tee-overview.mdx — do not over-claim.
export const SECURE_BADGE_TOOLTIP =
    'Secure: this model runs inside a Trusted Execution Environment (TEE) — hardware-isolated, encrypted memory. Your prompts are processed privately and the provider is cryptographically prevented from logging or storing them.';

export const SECURE_MODE_INFO =
    "Secure models run inside a Trusted Execution Environment (TEE). When you chat with one, your node automatically verifies the provider's software at session open and on every prompt — confirming chat storage is off and prompts can't be logged. It verifies the software, not the quality of the answer. Models without this label have no such guarantee.";

// Maps on-chain model tags to an interaction modality. Mirrors the backend
// DetectModelType() synonym lists in proxy-router/internal/blockchainapi/model_tags.go.
export const MODALITY_TAGS = {
    stt: ['stt', 'transcribe', 's2t', 'speech', 'speech-to-text', 'speech2text'],
    tts: ['tts', 'text-to-speech', 'text2speech', 't2s'],
    embedding: ['embedding', 'embeddings'],
    llm: ['llm', 'textgeneration', 'text2text', 'text-to-text', 't2t'],
};

// Returns 'stt' | 'tts' | 'embedding' | 'llm' for a model. LLM is the default
// when no recognised modality tag is present.
export const getModelModality = (model) => {
    const tags = (model?.Tags || []).map((t) => String(t).toLowerCase().trim());
    for (const k of ['stt', 'tts', 'embedding']) {
        if (tags.some((t) => MODALITY_TAGS[k].includes(t))) {
            return k;
        }
    }
    return 'llm';
};

export const makeId = (length) => {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
        counter += 1;
    }
    return result;
}

export const generateHashId = (length = 64) => {
    const hex = [...Array(length)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    return `0x${hex}`;
}

export const getHashCode = (string) => {
    var hash = 0;
    for (var i = 0; i < string.length; i++) {
        var code = string.charCodeAt(i);
        hash = ((hash << 5) - hash) + code;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

const colors = [
    '#1899cb', '#da4d76', '#d66b38', '#d39d00', '#b46fc4', '#269c68', '#86858a'
];

export const getColor = (name) => {
    if (!name) {
        return;
    }
    return colors[(getHashCode(name) + 1) % colors.length]
}

export const tryParseDataChunk = (decodedChunk) => {
    const lines = decodedChunk.split('\n');
    const trimmedData = lines.map(line => line.replace(/^data: /, ""));
    const filteredData = trimmedData.filter(line => !["", "[DONE]"].includes(line));

    let isChunkIncomplete = false;
    const parsedData = filteredData.map(line => {
        try {
            return JSON.parse(line);
        }
        catch (e) {
            console.warn("Failed to parse line")
            isChunkIncomplete = true;
            return null;
        }
    });

    return { data: parsedData, isChunkIncomplete };
}

export const formatSmallNumber = (number) => {
    const strNum = String(number);
    if(!strNum.includes("e")) {
        return number;
    }

    const exponentionalIndex = strNum.indexOf('-');
    if(exponentionalIndex == -1) {
        return number;
    }
    const pow = strNum.substring(exponentionalIndex + 1);
    return number.toFixed(+pow);
}

export const getTimeRemaining = (endtime) => {
    const total = endtime - Date.parse(new Date());
    const seconds = Math.floor( (total/1000) % 60 );
    const minutes = Math.floor( (total/1000/60) % 60 );
    const hours = Math.floor( (total/(1000*60*60)) % 24 );
    const days = Math.floor( total/(1000*60*60*24) );
  
    return {
      days,
      hours,
      minutes,
      seconds
    };
  }

// Model IDs are machine strings — "qwen2.5-1.5b-instruct", "deepseek-r1-70b:tee".
// Hyphens and colons are how the registry separates tokens, not how a person
// reads a name. This is DISPLAY ONLY: the underlying Name/Id is never changed,
// because it is what the network matches on.
export function formatModelName(name) {
  if (!name) return '';
  return String(name)
    .replace(/[-_:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => {
      // Keep size/precision tokens shouting (70B, 4B, TEE, FP8), and leave
      // version-ish tokens (qwen2.5, v4) alone rather than mangling their case.
      if (/^\d+(\.\d+)?[bkm]$/i.test(word)) return word.toUpperCase();
      if (/^(tee|fp\d+|gguf|moe|vl|it)$/i.test(word)) return word.toUpperCase();
      if (/\d/.test(word)) return word.charAt(0).toUpperCase() + word.slice(1);
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}


// The user-bubble text for one stored history turn.
//
// THE BUG THIS FIXES: the proxy-router stores each turn's request with the WHOLE
// prepended conversation in `prompt.messages` (turn N holds [u,a,u,a,…,u]), so
// `prompt.messages[0]` is always the FIRST turn's text — every bubble in a
// resumed chat rendered as the opening prompt ("hello", "hello", "hello"…). The
// text for THIS turn is the LAST user message: the one that elicited m.response.
//
// Handles all three stored shapes:
//   - chat/LLM: { messages: [{ role, content }, …] } — take the last user turn
//   - TTS:      { input: '…' }
//   - STT:      audio request flagged with isAudioContent (audio not replayable)
// Falls back to '' rather than guessing, so a malformed turn renders blank, not
// wrong.
export function userTextFromPrompt(prompt, isAudioContent) {
  const p = prompt || {};
  if (Array.isArray(p.messages) && p.messages.length > 0) {
    for (let i = p.messages.length - 1; i >= 0; i--) {
      if (p.messages[i]?.role === 'user') {
        return p.messages[i]?.content ?? '';
      }
    }
    // No user-role entry (shouldn't happen — a request ends with the user turn);
    // last message is still a better guess than the first.
    return p.messages[p.messages.length - 1]?.content ?? '';
  }
  if (typeof p.input === 'string') return p.input; // TTS
  if (isAudioContent) return p.Prompt || p.prompt || '🎤 Audio input'; // STT
  return '';
}

// Token-based model matching, shared with the chat model picker.
// A single contiguous `includes` means the separators in a model's name decide
// whether you can find it: "deepseek v4 pro" would miss `deepseek-v4-pro`
// because the hyphens are not spaces. Nobody types the hyphens.
const normalizeSearch = (s) =>
  String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function modelMatchesQuery(model, q) {
  const query = normalizeSearch(q);
  if (!query) return true;
  const tokens = query.split(' ').filter(Boolean);
  const haystack = `${normalizeSearch(model?.Name)} ${(model?.Tags || [])
    .map(normalizeSearch)
    .join(' ')}`.trim();
  return tokens.every((t) => haystack.includes(t));
}

// Which session does a chat talk through?
//
// The binding lives on the CHAT, not on the model. Resolving it from the model
// (`openSessions.find(s => s.ModelAgentId === modelId)` — first open session
// wins) was what made parallel sessions impossible: every chat on a model
// collapsed onto one session, so a second session with the same provider could
// never be reached even though the contract and the router both allow it.
//
// Rules, in order:
//  - bound chat  -> ONLY its own session. If that session has closed the answer
//    is undefined (the chat goes readonly and offers a reopen). It must never
//    fall back to another open session on the same model: that would silently
//    bill this thread's prompts to a different session.
//  - unbound chat -> the legacy model lookup, so chats written before the router
//    persisted sessionId keep working instead of going dead.
// `claimedByOthers` is the set of session ids other chats are already bound to.
// The legacy fallback MUST skip them: without it a legacy chat adopts a session
// that a bound chat owns, and — unlike the old code, which merely recomputed the
// same wrong answer each time — the router now PERSISTS that binding on the next
// turn, so two chat files permanently claim one session and both bill to it.
export function resolveChatSession(openSessions, chat, claimedByOthers) {
  const open = openSessions || [];
  if (chat?.sessionId) {
    return open.find((s) => s.Id === chat.sessionId);
  }
  if (!chat?.modelId) {
    return undefined;
  }
  const claimed = claimedByOthers || new Set();
  return open.find(
    (s) => s.ModelAgentId === chat.modelId && !claimed.has(s.Id),
  );
}

// Session ids owned by chats OTHER than `exceptChatId`.
export function sessionsClaimedByOtherChats(chats, exceptChatId) {
  const claimed = new Set();
  for (const c of chats || []) {
    if (c?.sessionId && c.id !== exceptChatId) {
      claimed.add(c.sessionId);
    }
  }
  return claimed;
}

// Add a chat to the list, or update it in place if its id is already there.
// The callers fire when a chat has no messages yet, which is NOT the same as
// "not in the list" — a chat restored from the drawer with an empty transcript
// is already present, and a blind append produced two rows with the same key.
// React's duplicate-key warning is not cosmetic: it says children may be
// duplicated OR OMITTED, so a real chat can disappear from the sidebar.
export function upsertChat(chats, entry) {
  const list = chats || [];
  if (!entry?.id) {
    return list;
  }
  const i = list.findIndex((c) => c.id === entry.id);
  if (i === -1) {
    return [...list, entry];
  }
  const next = [...list];
  // Preserve fields the caller didn't carry (e.g. an existing sessionId).
  next[i] = { ...next[i], ...entry };
  return next;
}

// Every session id that some chat is still entitled to — live runs AND runs that
// have ended but whose final block may still be open (blocks are never closed
// early; that time-locks the stake).
//
// Extracted so the tests exercise THIS, not a copy. Local re-implementations in
// the test file passed happily with the production bug applied, which is worse
// than no test: the suite reported green while the defect shipped.
export function claimedSessionIds(liveIdsByChat, retainedIdsByChat, exceptChatId) {
  const out = new Set();
  for (const map of [liveIdsByChat || {}, retainedIdsByChat || {}]) {
    for (const [chatId, ids] of Object.entries(map)) {
      if (chatId === exceptChatId) continue;
      (ids || []).forEach((id) => out.add(id));
    }
  }
  return out;
}

// Open sessions that boot may adopt into a new chat. A session belonging to any
// run — live or recently ended — is off limits: adopting one staples a paid
// block to a second chat, and the router then writes that binding to disk.
export function adoptableSessions(openSessions, liveIdsByChat, retainedIdsByChat) {
  const owned = claimedSessionIds(liveIdsByChat, retainedIdsByChat, undefined);
  return (openSessions || []).filter((s) => !owned.has(s?.Id));
}
