// ============================================================================
// grok-build leader protocol — the pure half.
//
// The app sits between grok's TUI (an ACP *client*) and grok's agent, on the
// leader Unix socket. Everything here is a pure function over bytes so it can
// be tested without a socket, a TUI, or an agent.
//
// WHAT THIS RELAY IS FOR
// grok's slash commands are prompt templates: typing `/start` sends the text to
// the model, and the model decides what to do. That is unacceptable for opening
// a paid blockchain session — a model must not be the thing that decides to
// spend. On this seam we can take `/start` off the wire before the agent ever
// sees it and run our own code, with no model in the loop.
//
// THE CONFIDENTIALITY RULE, WHICH IS THE POINT OF THIS FILE
// Everything the user types, and everything grok's own config carries, crosses
// this socket. A spike relay logged one session and captured a live API key out
// of the `session/new` frame's MCP server env. So:
//
//   * frames are forwarded as their ORIGINAL BYTES, never re-serialised
//   * `summariseFrame` is the ONLY thing allowed to describe a frame, and it
//     emits type/method/id and nothing else — never params, never results,
//     never prompt text
//   * nothing here writes to disk
//
// `summariseFrame` is pinned by a check that feeds it a frame containing a
// secret and asserts the secret cannot appear in its output. Redaction by
// construction, not by remembering.
// ============================================================================

/** 4-byte big-endian length prefix + JSON body (grok: leader/protocol.rs). */
export type LeaderFrame = {
  /** The original bytes, including the length prefix. Forward THESE. */
  raw: Buffer<ArrayBufferLike>;
  /** Parsed for classification only. null when the body is not JSON. */
  json: any | null;
};

const MAX_FRAME_BYTES = 64 * 1024 * 1024;

export function encodeFrame(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  const head = Buffer.allocUnsafe(4);
  head.writeUInt32BE(body.length, 0);
  return Buffer.concat([head, body]);
}

/**
 * Split whatever complete frames are in `buf`, returning the unconsumed tail.
 *
 * A partial frame is normal — TCP/Unix streams split anywhere — so the tail is
 * carried to the next read rather than treated as an error.
 */
export function decodeFrames(buf: Buffer): {
  frames: LeaderFrame[];
  rest: Buffer<ArrayBufferLike>;
  error?: string;
} {
  const frames: LeaderFrame[] = [];
  let off = 0;
  while (buf.length - off >= 4) {
    const len = buf.readUInt32BE(off);
    // A wild length is a desynced stream, not a big message. Say so instead of
    // buffering forever.
    if (len > MAX_FRAME_BYTES) {
      return {
        frames,
        rest: buf.subarray(off),
        error: `frame length ${len} exceeds the ${MAX_FRAME_BYTES} byte ceiling`,
      };
    }
    if (buf.length - off - 4 < len) break;
    const raw = buf.subarray(off, off + 4 + len);
    let json: any = null;
    try {
      json = JSON.parse(buf.subarray(off + 4, off + 4 + len).toString('utf8'));
    } catch {
      /* forwarded verbatim regardless; classification simply declines */
    }
    frames.push({ raw, json });
    off += 4 + len;
  }
  return { frames, rest: buf.subarray(off) };
}

/** The ACP message inside an `{type:'acp', payload:'<json>'}` envelope. */
export function acpPayload(frame: LeaderFrame): any | null {
  if (!frame.json || frame.json.type !== 'acp') return null;
  try {
    return JSON.parse(String(frame.json.payload));
  } catch {
    return null;
  }
}

/**
 * A one-line description safe to log.
 *
 * Type, method and id. Nothing else, ever — no params, no results, no error
 * bodies. Callers cannot opt into more, which is the point: the rule holds
 * without anyone having to remember it at the call site.
 */
export function summariseFrame(direction: string, frame: LeaderFrame): string {
  if (!frame.json) return `${direction} <non-json ${frame.raw.length}B>`;
  const type = String(frame.json.type ?? '?');
  if (type !== 'acp') {
    // register/registered/ping/pong carry no user content, but they are still
    // not echoed wholesale — only the discriminator.
    return `${direction} ${type}`;
  }
  const inner = acpPayload(frame);
  if (!inner) return `${direction} acp <unparsed>`;
  const method =
    typeof inner.method === 'string'
      ? inner.method
      : inner.result !== undefined
        ? '<result>'
        : inner.error !== undefined
          ? '<error>'
          : '<unknown>';
  return `${direction} acp id=${inner.id ?? '-'} ${method}`;
}

// ---- the version gate ------------------------------------------------------
// The leader protocol is an internal seam of a tool that ships without any
// stability promise for it. Pinning what we INSTALL is half the answer; the
// other half is refusing to relay for a build we have not checked, so an update
// the user made for unrelated reasons turns into a clear refusal rather than
// silent misbehaviour on a money path.

/** Versions this relay has actually been exercised against. */
export const BLESSED_LEADER_VERSIONS = [
  // Each entry means: the relay has been RUN against this build and the app
  // path — handshake, framing, /start interception, turn completion — was
  // observed working. Not "it looked compatible".
  '0.2.106',
  // 1.0.0 rejects x.ai/ask_user_question with -32601, which is why the picker
  // moved into the app; nothing the supervisor does uses that method. Verified
  // 2026-08-10 against the installed 1.0.0.
  '1.0.0',
];

export function readLeaderVersion(frame: LeaderFrame): string | null {
  if (!frame.json || frame.json.type !== 'registered') return null;
  const v = frame.json.leader_binary_version;
  return typeof v === 'string' && v ? v : null;
}

export function isVersionBlessed(
  version: string | null,
  blessed: readonly string[] = BLESSED_LEADER_VERSIONS,
): boolean {
  // An ABSENT version is refused too. "We could not tell" is not "it is fine" —
  // that conflation is how an unchecked build gets onto a spending path.
  return version !== null && blessed.includes(version);
}

// ---- intercepting a command ------------------------------------------------

export type ClientVerdict =
  | { action: 'forward' }
  | {
      action: 'intercept';
      command: string;
      args: string;
      sessionId: string;
      requestId: string | number;
    };

/**
 * Should this client→agent frame be taken off the wire?
 *
 * ONLY an exact `session/prompt` whose text begins with a registered command
 * word. Everything else forwards untouched — including any prompt that merely
 * mentions the command, because the trigger is the first token of a deliberate
 * invocation, not a substring.
 */
export function classifyClientFrame(
  frame: LeaderFrame,
  commands: readonly string[],
): ClientVerdict {
  const inner = acpPayload(frame);
  if (!inner || inner.method !== 'session/prompt') return { action: 'forward' };
  if (inner.id === undefined || inner.id === null) return { action: 'forward' };

  const sessionId = inner?.params?.sessionId;
  if (typeof sessionId !== 'string' || !sessionId) return { action: 'forward' };

  const blocks = inner?.params?.prompt;
  if (!Array.isArray(blocks)) return { action: 'forward' };
  // A prompt is a list of blocks; only a pure-text one can be a command. A
  // prompt carrying a file or image attachment is never an invocation.
  if (blocks.some((b: any) => b?.type !== undefined && b.type !== 'text')) {
    return { action: 'forward' };
  }
  const text = blocks.map((b: any) => (typeof b?.text === 'string' ? b.text : '')).join('');

  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return { action: 'forward' };
  const space = trimmed.search(/\s/);
  const word = (space === -1 ? trimmed : trimmed.slice(0, space)).slice(1);
  if (!commands.includes(word)) return { action: 'forward' };

  return {
    action: 'intercept',
    command: word,
    args: space === -1 ? '' : trimmed.slice(space + 1).trim(),
    sessionId,
    requestId: inner.id,
  };
}

// ---- frames we originate ---------------------------------------------------

/** Complete a prompt we swallowed, so the TUI does not wait forever. */
export function buildPromptResult(requestId: string | number): Buffer {
  return encodeFrame({
    type: 'acp',
    payload: JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      result: { stopReason: 'end_turn' },
    }),
  });
}

export type PickerOption = { label: string; description: string; preview?: string };
export type PickerQuestion = {
  question: string;
  options: PickerOption[];
  multiSelect?: boolean;
};

/**
 * grok's own selection dialog, addressed to the client.
 *
 * `x.ai/ask_user_question` is an agent→client reverse request, and the pager's
 * only precondition is a sessionId it has a view for — no in-flight tool call.
 * So the relay can raise a real picker at any point in a session.
 */
export function buildAskQuestion(input: {
  requestId: number;
  sessionId: string;
  toolCallId: string;
  questions: PickerQuestion[];
}): Buffer {
  return encodeFrame({
    type: 'acp',
    payload: JSON.stringify({
      jsonrpc: '2.0',
      id: input.requestId,
      method: 'x.ai/ask_user_question',
      params: {
        sessionId: input.sessionId,
        toolCallId: input.toolCallId,
        questions: input.questions.map((q) => ({
          question: q.question,
          options: q.options.map((o) => ({
            label: o.label,
            description: o.description,
            ...(o.preview === undefined ? {} : { preview: o.preview }),
          })),
          multiSelect: Boolean(q.multiSelect),
        })),
        mode: 'default',
      },
    }),
  });
}

export type PickerAnswer =
  | { outcome: 'accepted'; answers: Record<string, string[]> }
  | { outcome: 'cancelled' };

/**
 * Read the pager's reply to a picker.
 *
 * Anything that is not an explicit `accepted` is treated as cancelled —
 * including a malformed body. On a path whose next step spends money, an
 * unreadable answer must never read as consent.
 */
export function parsePickerAnswer(result: any): PickerAnswer {
  const outcome = result?.outcome;
  if (outcome !== 'accepted') return { outcome: 'cancelled' };
  const raw = result?.answers;
  if (!raw || typeof raw !== 'object') return { outcome: 'cancelled' };
  const answers: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') answers[k] = [v];
    else if (Array.isArray(v)) answers[k] = v.map((x) => String(x));
  }
  return { outcome: 'accepted', answers };
}
