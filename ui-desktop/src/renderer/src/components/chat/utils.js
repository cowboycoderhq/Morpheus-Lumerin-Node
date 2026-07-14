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
