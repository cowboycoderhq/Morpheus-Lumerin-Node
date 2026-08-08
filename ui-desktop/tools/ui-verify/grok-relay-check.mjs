// End-to-end check of the grok-build leader relay.
//
// The relay carries EVERYTHING the user types to grok, plus grok's own config
// (which includes MCP server env vars — a spike version of this captured a live
// API key out of one). So the checks here are as much about what the relay must
// NOT do as what it must.
//
// Runs the real relay over real Unix sockets against a fake grok agent.
//
// Run: npm run grok   (from tools/ui-verify)
import net from 'node:net';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  encodeFrame,
  decodeFrames,
  summariseFrame,
  classifyClientFrame,
  isVersionBlessed,
  readLeaderVersion,
  buildAskQuestion,
  buildPromptResult,
  parsePickerAnswer,
  acpPayload,
} from '../../src/main/src/grok/protocol.ts';
import { GrokLeaderRelay } from '../../src/main/src/grok/relay.ts';

let pass = 0;
let fail = 0;
const ok = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const acp = (obj) => encodeFrame({ type: 'acp', payload: JSON.stringify(obj) });
const one = (buf) => decodeFrames(buf).frames[0];
const promptFrame = (text, id = 8, sessionId = 'sess-1') =>
  one(
    acp({
      jsonrpc: '2.0',
      id,
      method: 'session/prompt',
      params: { sessionId, prompt: [{ type: 'text', text }] },
    }),
  );

// ---- framing ---------------------------------------------------------------
console.log('grok relay: framing');
{
  const a = encodeFrame({ type: 'ping' });
  const b = encodeFrame({ type: 'pong' });
  const { frames, rest } = decodeFrames(Buffer.concat([a, b]));
  ok('two frames decode from one buffer', frames.length === 2);
  ok('and nothing is left over', rest.length === 0);
  ok('the parsed bodies survive', frames[0].json.type === 'ping' && frames[1].json.type === 'pong');
  ok('raw bytes are preserved exactly', frames[0].raw.equals(a) && frames[1].raw.equals(b));

  // A stream splits anywhere; a partial frame must wait, not error.
  const joined = Buffer.concat([a, b]);
  for (let cut = 1; cut < joined.length; cut++) {
    const first = decodeFrames(joined.subarray(0, cut));
    const second = decodeFrames(Buffer.concat([first.rest, joined.subarray(cut)]));
    const total = first.frames.length + second.frames.length;
    if (total !== 2) {
      ok(`split at ${cut} still yields both frames (got ${total})`, false);
      break;
    }
    if (cut === joined.length - 1) ok('every possible split still yields both frames', true);
  }

  // A wild length is a desynced stream, not a huge message.
  const bogus = Buffer.alloc(8);
  bogus.writeUInt32BE(0xfffffff0, 0);
  ok('an absurd length is reported as desync', !!decodeFrames(bogus).error);

  const nonJson = Buffer.concat([Buffer.from([0, 0, 0, 3]), Buffer.from('abc')]);
  const nj = decodeFrames(nonJson);
  ok('a non-JSON body still yields a forwardable frame', nj.frames.length === 1 && nj.frames[0].json === null);
}

// ---- THE redaction property ------------------------------------------------
// This is the check that exists because the spike failed it.
console.log('');
console.log('grok relay: nothing sensitive may reach a log');
{
  const SECRET = 'eyJhbGciOiJIUzI1NiJ9.SUPERSECRETJWT.sig';
  const PROMPT = 'my wallet seed is correct horse battery staple';

  const sessionNew = one(
    acp({
      jsonrpc: '2.0',
      id: 4,
      method: 'session/new',
      params: {
        cwd: '/tmp',
        mcpServers: [{ name: 'n8n', env: [{ name: 'N8N_API_KEY', value: SECRET }] }],
      },
    }),
  );
  const prompt = promptFrame(PROMPT);
  const result = one(acp({ jsonrpc: '2.0', id: 4, result: { secretish: SECRET } }));
  const register = one(
    encodeFrame({ type: 'register', client_type: 'grok-shell', capabilities: { token: SECRET } }),
  );

  for (const [label, frame] of [
    ['session/new', sessionNew],
    ['session/prompt', prompt],
    ['a result', result],
    ['the register frame', register],
  ]) {
    const line = summariseFrame('C->A', frame);
    ok(`${label}: the secret never appears in the summary`, !line.includes(SECRET), line);
    ok(`${label}: no params are echoed`, !line.includes('mcpServers') && !line.includes('cwd'), line);
  }
  ok('prompt text never appears in a summary',
    !summariseFrame('C->A', prompt).includes('battery'), summariseFrame('C->A', prompt));
  // It must still be USEFUL, or it will be replaced by something that leaks.
  ok('the summary still identifies the method',
    summariseFrame('C->A', prompt).includes('session/prompt'));
  ok('and the id, for correlation', summariseFrame('C->A', prompt).includes('id=8'));

  // Structural: the relay cannot reach the network or the disk-for-frames even
  // if someone later wants it to.
  const relaySrc = readFileSync(new URL('../../src/main/src/grok/relay.ts', import.meta.url), 'utf8');
  const protoSrc = readFileSync(new URL('../../src/main/src/grok/protocol.ts', import.meta.url), 'utf8');
  for (const [name, src] of [['relay', relaySrc], ['protocol', protoSrc]]) {
    ok(`${name}.ts imports nothing that can make a network call`,
      !/from '(node:)?(http|https|dgram|dns|tls)'/.test(src) && !/\bfetch\s*\(/.test(src));
    ok(`${name}.ts never writes frame content to disk`,
      !/writeFileSync|appendFileSync|createWriteStream/.test(src));
  }
}

// ---- interception ----------------------------------------------------------
console.log('');
console.log('grok relay: what gets taken off the wire');
{
  const CMDS = ['start', 'continue'];
  const verdict = (text) => classifyClientFrame(promptFrame(text), CMDS);

  ok('/start is intercepted', verdict('/start').action === 'intercept');
  ok('/start with args keeps the args', verdict('/start 1 day').args === '1 day');
  ok('leading whitespace still counts', verdict('   /start').action === 'intercept');
  ok('/continue is intercepted too', verdict('/continue').command === 'continue');
  ok('the session id is carried', verdict('/start').sessionId === 'sess-1');
  ok('the request id is carried, so the turn can be completed',
    verdict('/start').requestId === 8);

  // Everything below must reach the model untouched.
  ok('an ordinary prompt forwards', verdict('write me a test').action === 'forward');
  ok('an unknown command forwards', verdict('/deploy').action === 'forward');
  ok('a PREFIX of a command is not a command', verdict('/star').action === 'forward');
  ok('a command as a SUBSTRING is not an invocation',
    verdict('explain what /start does').action === 'forward');
  ok('/startle is not /start', verdict('/startle').action === 'forward');
  ok('a bare slash forwards', verdict('/').action === 'forward');

  // A prompt with an attachment is never a bare command invocation.
  const withFile = one(
    acp({
      jsonrpc: '2.0',
      id: 9,
      method: 'session/prompt',
      params: {
        sessionId: 's',
        prompt: [{ type: 'text', text: '/start' }, { type: 'resource', uri: 'file:///x' }],
      },
    }),
  );
  ok('a prompt carrying an attachment forwards', classifyClientFrame(withFile, CMDS).action === 'forward');

  // Other methods are never touched, whatever they contain.
  const other = one(acp({ jsonrpc: '2.0', id: 5, method: 'session/new', params: { text: '/start' } }));
  ok('a non-prompt method forwards', classifyClientFrame(other, CMDS).action === 'forward');
  const notification = one(
    acp({ jsonrpc: '2.0', method: 'session/prompt', params: { sessionId: 's', prompt: [{ type: 'text', text: '/start' }] } }),
  );
  ok('a prompt with no id forwards (nothing to reply to)',
    classifyClientFrame(notification, CMDS).action === 'forward');
  ok('a non-acp frame forwards', classifyClientFrame(one(encodeFrame({ type: 'ping' })), CMDS).action === 'forward');
}

// ---- the version gate ------------------------------------------------------
console.log('');
console.log('grok relay: the version gate');
{
  const reg = (v) =>
    one(encodeFrame(v === undefined ? { type: 'registered' } : { type: 'registered', leader_binary_version: v }));
  ok('the blessed version is read', readLeaderVersion(reg('0.2.106')) === '0.2.106');
  ok('and accepted', isVersionBlessed('0.2.106', ['0.2.106']));
  ok('a newer build is refused until checked', !isVersionBlessed('0.2.107', ['0.2.106']));
  ok('an older build is refused', !isVersionBlessed('0.2.99', ['0.2.106']));
  // "We could not tell" must never read as "it is fine".
  ok('an ABSENT version is refused', readLeaderVersion(reg(undefined)) === null);
  ok('and null is not blessed', !isVersionBlessed(null, ['0.2.106']));
  ok('a non-registered frame carries no version', readLeaderVersion(one(encodeFrame({ type: 'ping' }))) === null);
}

// ---- picker frames ---------------------------------------------------------
console.log('');
console.log('grok relay: the picker');
{
  const buf = buildAskQuestion({
    requestId: 8_000_001,
    sessionId: 'sess-1',
    toolCallId: 'morpheus-start-1',
    questions: [
      {
        question: 'Which model?',
        options: [{ label: 'deepseek-v4', description: '3 providers · from 0.30 MOR / hour' }],
      },
    ],
  });
  const inner = acpPayload(one(buf));
  ok('it is grok\'s own dialog method', inner.method === 'x.ai/ask_user_question');
  ok('addressed to the live session', inner.params.sessionId === 'sess-1');
  ok('with the camelCase field the ext_method expects',
    inner.params.questions[0].multiSelect === false);
  ok('and options the pager can render',
    inner.params.questions[0].options[0].label === 'deepseek-v4');
  ok('mode is set', inner.params.mode === 'default');

  ok('an accepted answer parses',
    parsePickerAnswer({ outcome: 'accepted', answers: { 'Which model?': ['deepseek-v4'] } }).outcome === 'accepted');
  ok('a single string answer is normalised to a list',
    parsePickerAnswer({ outcome: 'accepted', answers: { q: 'x' } }).answers.q[0] === 'x');
  // Anything that is not explicit consent is refusal — the next step spends.
  ok('cancelled is cancelled', parsePickerAnswer({ outcome: 'cancelled' }).outcome === 'cancelled');
  ok('an unreadable answer is NOT consent', parsePickerAnswer({ outcome: 'accepted' }).outcome === 'cancelled');
  ok('a missing outcome is NOT consent', parsePickerAnswer({}).outcome === 'cancelled');
  ok('null is NOT consent', parsePickerAnswer(null).outcome === 'cancelled');
  ok('chat_about_this is not consent to spend',
    parsePickerAnswer({ outcome: 'chat_about_this' }).outcome === 'cancelled');

  const res = acpPayload(one(buildPromptResult(8)));
  ok('a swallowed prompt is completed', res.id === 8 && res.result.stopReason === 'end_turn');
}

// ---- end to end over real sockets ------------------------------------------
console.log('');
console.log('grok relay: end to end against a fake agent');
{
  const dir = tmpdir();
  const realPath = join(dir, `grok-fake-agent-${process.pid}.sock`);
  const listenPath = join(dir, `grok-relay-${process.pid}.sock`);
  for (const p of [realPath, listenPath]) if (existsSync(p)) rmSync(p, { force: true });

  // The fake agent records everything it is given.
  const agentSaw = [];
  let agentSock = null;
  const agent = net.createServer((sock) => {
    agentSock = sock;
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      const { frames, rest } = decodeFrames(buf);
      buf = rest;
      for (const f of frames) {
        agentSaw.push(f.json);
        if (f.json?.type === 'register') {
          sock.write(encodeFrame({ type: 'registered', client_id: 1, ready: true, leader_binary_version: '0.2.106' }));
        }
      }
    });
  });
  await new Promise((r) => agent.listen(realPath, r));

  const invocations = [];
  let askResult = null;
  const relay = new GrokLeaderRelay({
    realSocketPath: realPath,
    listenSocketPath: listenPath,
    commands: ['start'],
    blessedVersions: ['0.2.106'],
    onCommand: async (inv) => {
      invocations.push({ command: inv.command, args: inv.args, sessionId: inv.sessionId });
      askResult = await inv.ask([
        { question: 'Which model?', options: [{ label: 'deepseek-v4', description: 'cheap' }] },
      ]);
    },
  });
  await relay.start();
  ok('the relay listens', relay.isRunning());

  // A fake TUI.
  const client = net.connect(listenPath);
  const clientSaw = [];
  let cbuf = Buffer.alloc(0);
  client.on('data', (d) => {
    cbuf = Buffer.concat([cbuf, d]);
    const { frames, rest } = decodeFrames(cbuf);
    cbuf = rest;
    for (const f of frames) clientSaw.push(f);
  });
  await new Promise((r) => client.once('connect', r));

  const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));

  client.write(encodeFrame({ type: 'register', client_type: 'grok-shell' }));
  await settle();
  ok('the handshake reaches the agent', agentSaw.some((f) => f.type === 'register'));
  ok('and the relay reports it is relaying', relay.getState().status === 'relaying');
  ok('with the version it vetted', relay.getState().leaderVersion === '0.2.106');
  ok('the registered frame reaches the client', clientSaw.some((f) => f.json?.type === 'registered'));

  // An ordinary prompt must pass through untouched.
  const ordinary = acp({
    jsonrpc: '2.0', id: 1, method: 'session/prompt',
    params: { sessionId: 'sess-1', prompt: [{ type: 'text', text: 'refactor this' }] },
  });
  client.write(ordinary);
  await settle();
  const gotOrdinary = agentSaw.filter((f) => f.type === 'acp').map((f) => JSON.parse(f.payload))
    .find((m) => m.method === 'session/prompt');
  ok('an ordinary prompt reaches the agent', !!gotOrdinary);
  ok('byte-for-byte, unmodified',
    JSON.stringify(gotOrdinary?.params?.prompt) === JSON.stringify([{ type: 'text', text: 'refactor this' }]));
  ok('and the handler was NOT invoked for it', invocations.length === 0);

  // /start must NOT reach the agent.
  const beforeStart = agentSaw.length;
  client.write(acp({
    jsonrpc: '2.0', id: 2, method: 'session/prompt',
    params: { sessionId: 'sess-1', prompt: [{ type: 'text', text: '/start 1 day' }] },
  }));
  await settle();

  const agentPrompts = agentSaw.slice(beforeStart).filter((f) => f.type === 'acp')
    .map((f) => JSON.parse(f.payload)).filter((m) => m.method === 'session/prompt');
  ok('/start NEVER reaches the agent', agentPrompts.length === 0,
    `agent saw ${agentPrompts.length} prompt(s) after /start`);
  ok('the handler ran instead', invocations.length === 1);
  ok('with the args', invocations[0]?.args === '1 day');
  ok('and the session id', invocations[0]?.sessionId === 'sess-1');

  // The picker should now be sitting with the client.
  const ask = clientSaw.map((f) => acpPayload(f)).filter(Boolean)
    .find((m) => m.method === 'x.ai/ask_user_question');
  ok('the relay raised a picker at the client', !!ask);
  ok('for the live session', ask?.params?.sessionId === 'sess-1');
  ok('with an id that cannot collide with either side\'s', ask?.id >= 8_000_000);

  // Answer it the way the pager would.
  client.write(acp({ jsonrpc: '2.0', id: ask.id, result: { outcome: 'accepted', answers: { 'Which model?': ['deepseek-v4'] } } }));
  await settle();
  ok('the answer comes back to the handler', askResult?.outcome === 'accepted');
  ok('carrying the selection', askResult?.answers?.['Which model?']?.[0] === 'deepseek-v4');
  ok('and the picker answer never reached the agent',
    !agentSaw.some((f) => f.type === 'acp' && String(f.payload).includes('ask_user_question')));

  // The swallowed turn must be completed, or the TUI hangs forever.
  const completed = clientSaw.map((f) => acpPayload(f)).filter(Boolean)
    .find((m) => m.id === 2 && m.result?.stopReason === 'end_turn');
  ok('the swallowed prompt is completed back to the client', !!completed);

  await relay.stop();
  ok('stopping removes the socket', !existsSync(listenPath));
  client.destroy();
  agentSock?.destroy();
  await new Promise((r) => agent.close(r));
  for (const p of [realPath, listenPath]) if (existsSync(p)) rmSync(p, { force: true });
}

// ---- an unblessed agent is refused, loudly ---------------------------------
console.log('');
console.log('grok relay: an unchecked grok build');
{
  const dir = tmpdir();
  const realPath = join(dir, `grok-fake-old-${process.pid}.sock`);
  const listenPath = join(dir, `grok-relay-old-${process.pid}.sock`);
  const agentSaw = [];
  const agent = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      const { frames, rest } = decodeFrames(buf);
      buf = rest;
      for (const f of frames) {
        agentSaw.push(f.json);
        if (f.json?.type === 'register') {
          sock.write(encodeFrame({ type: 'registered', leader_binary_version: '9.9.9' }));
        }
      }
    });
  });
  await new Promise((r) => agent.listen(realPath, r));

  const states = [];
  let handlerRan = false;
  const relay = new GrokLeaderRelay({
    realSocketPath: realPath,
    listenSocketPath: listenPath,
    commands: ['start'],
    blessedVersions: ['0.2.106'],
    onCommand: async () => { handlerRan = true; },
    onState: (s) => states.push(s),
  });
  await relay.start();

  const client = net.connect(listenPath);
  await new Promise((r) => client.once('connect', r));
  client.write(encodeFrame({ type: 'register', client_type: 'grok-shell' }));
  await new Promise((r) => setTimeout(r, 300));

  const refused = states.find((s) => s.status === 'refused');
  ok('an unchecked grok build is refused', !!refused);
  ok('naming the version, so the message can be acted on', refused?.leaderVersion === '9.9.9');
  ok('the refusal explains itself', /has not been checked/i.test(refused?.reason ?? ''));
  ok('the relay never reports "relaying"', !states.some((s) => s.status === 'relaying'));

  // And it must be inert: no interception on a build we do not trust.
  client.write(acp({
    jsonrpc: '2.0', id: 3, method: 'session/prompt',
    params: { sessionId: 's', prompt: [{ type: 'text', text: '/start' }] },
  }));
  await new Promise((r) => setTimeout(r, 250));
  ok('and it intercepts nothing', handlerRan === false);

  await relay.stop();
  client.destroy();
  await new Promise((r) => agent.close(r));
  for (const p of [realPath, listenPath]) if (existsSync(p)) rmSync(p, { force: true });
}

console.log('');
console.log(`GROK RELAY: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
