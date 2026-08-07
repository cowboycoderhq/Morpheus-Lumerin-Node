// End-to-end check of the OpenAI-compatible endpoint.
//
// The unit checks in logic-checks.mjs pin the admission RULES. This starts the
// REAL server against a FAKE proxy-router and talks to it over a real socket,
// because the things that actually bite live between the rules and the wire:
// whether it binds loopback only, whether streaming passes through byte-exact,
// whether a cancelled client stops the upstream, and whether an unauthenticated
// caller can get anything at all.
//
// Run: npm run openai   (from tools/ui-verify)
import { createServer } from 'http';
import { connect as netConnect } from 'net';
import { OpenAiCompatServer, generateToken } from '../../src/main/src/openai-compat/server.ts';

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

// ---- a fake proxy-router ----------------------------------------------------
const upstreamCalls = [];
let upstreamAborted = false;
let abortReason = null;
let upstreamChunks = 0;
let registryReads = 0;
const fakeRouter = createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  upstreamCalls.push({ url, headers: req.headers });

  if (url === '/v1/models') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([{ Id: '0xlocal1', Name: 'local-llama' }]));
    return;
  }
  if (url === '/blockchain/models') {
    registryReads++;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ models: [{ Id: '0xremote1', Name: 'deepseek-v4' }] }));
    return;
  }
  if (url === '/blockchain/sessions/user') {
    const now = Math.floor(Date.now() / 1000);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      sessions: [
        { Id: '0xsessOPEN', ModelAgentId: '0xremote1', ClosedAt: 0, EndsAt: now + 3600 },
        { Id: '0xsessDEAD', ModelAgentId: '0xremote9', ClosedAt: 0, EndsAt: now - 10 },
      ],
    }));
    return;
  }
  if (url === '/v1/chat/completions') {
    const body = await new Promise((resolve) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => resolve(b));
    });
    if (JSON.parse(body).stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      // Deliberately chunked oddly, to prove the facade does not re-frame.
      res.write('data: {"choices":[{"delta":{"content":"He');
      res.write('llo"}}]}\n\n');
      let i = 0;
      const timer = setInterval(() => {
        if (upstreamAborted) { clearInterval(timer); return; }
        if (i++ > 200) { clearInterval(timer); res.end('data: [DONE]\n\n'); return; }
        upstreamChunks++;
        res.write(`data: {"choices":[{"delta":{"content":"${i}"}}]}\n\n`);
      }, 5);
      const markAborted = (why) => {
        upstreamAborted = true;
        abortReason = why;
        clearInterval(timer);
      };
      req.on('close', () => markAborted('req:close'));
      req.on('aborted', () => markAborted('req:aborted'));
      res.on('close', () => markAborted('res:close'));
      res.on('error', () => markAborted('res:error'));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'chatcmpl-1', object: 'chat.completion', choices: [] }));
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise((r) => fakeRouter.listen(0, '127.0.0.1', r));
const routerPort = fakeRouter.address().port;

// ---- the real facade --------------------------------------------------------
const TOKEN = generateToken();
const PORT = 8231;
let cfg = {
  enabled: true,
  port: PORT,
  token: TOKEN,
  allowAutoOpen: false,
  maxStakeMor: 1,
};
const activity = [];
const server = new OpenAiCompatServer({
  routerUrl: () => `http://127.0.0.1:${routerPort}`,
  authHeaders: async () => ({ Authorization: 'Basic ZmFrZTpmYWtl' }),
  walletAddress: () => '0xuser',
  config: () => cfg,
  onActivity: (a) => activity.push(a),
  log: () => {},
});
await server.sync();

const base = `http://127.0.0.1:${PORT}`;
const auth = { Authorization: `Bearer ${TOKEN}` };

console.log('openai endpoint: admission over a real socket');
{
  const r = await fetch(`${base}/v1/models`);
  ok('unauthenticated is refused', r.status === 401);
  const body = await r.json();
  ok('and the refusal uses the OpenAI error envelope', !!body.error?.message);

  const bad = await fetch(`${base}/v1/models`, { headers: { Authorization: 'Bearer wrong' } });
  ok('a wrong key is refused', bad.status === 401);

  const origin = await fetch(`${base}/v1/models`, {
    headers: { ...auth, Origin: 'https://evil.example' },
  });
  ok('a browser Origin is refused even with a valid key', origin.status === 403);

  // Real DNS-rebinding shape: correct socket, attacker's Host header.
  //
  // This MUST use a raw socket. `fetch` treats Host as a forbidden header and
  // silently overwrites it with the connection's authority — an earlier version
  // of this check used fetch, "failed", and was measuring nothing at all.
  const rawStatus = await new Promise((resolve, reject) => {
    const socket = netConnect(PORT, '127.0.0.1', () => {
      socket.write(
        'GET /v1/models HTTP/1.1\r\n' +
          'Host: evil.example\r\n' +
          `Authorization: Bearer ${TOKEN}\r\n` +
          'Connection: close\r\n\r\n',
      );
    });
    let buf = '';
    socket.on('data', (d) => (buf += d.toString()));
    socket.on('end', () => resolve(Number(/^HTTP\/1\.\d (\d+)/.exec(buf)?.[1])));
    socket.on('error', reject);
  });
  ok('a rebinding Host is refused', rawStatus === 403, `got ${rawStatus}`);

  // Prove the raw-socket harness itself works, so a 403 above cannot be a
  // malformed request being rejected for the wrong reason.
  const rawOk = await new Promise((resolve, reject) => {
    const socket = netConnect(PORT, '127.0.0.1', () => {
      socket.write(
        'GET /v1/models HTTP/1.1\r\n' +
          `Host: 127.0.0.1:${PORT}\r\n` +
          `Authorization: Bearer ${TOKEN}\r\n` +
          'Connection: close\r\n\r\n',
      );
    });
    let buf = '';
    socket.on('data', (d) => (buf += d.toString()));
    socket.on('end', () => resolve(Number(/^HTTP\/1\.\d (\d+)/.exec(buf)?.[1])));
    socket.on('error', reject);
  });
  ok('the same raw request with a loopback Host succeeds', rawOk === 200, `got ${rawOk}`);

  const good = await fetch(`${base}/v1/models`, { headers: auth });
  ok('a correct key is admitted', good.status === 200);
}

console.log('');
console.log('openai endpoint: the model list a client sees');
{
  const r = await fetch(`${base}/v1/models`, { headers: auth });
  const body = await r.json();
  ok('it is OpenAI-shaped', body.object === 'list' && Array.isArray(body.data));
  const ids = body.data.map((m) => m.id);
  ok('local models are advertised', ids.includes('local-llama'));
  ok('a marketplace model WITH an open session is advertised', ids.includes('deepseek-v4'));
  // The honesty rule: never list something that would fail on use.
  ok('a model whose session EXPIRED is not advertised',
    !body.data.some((m) => m.owned_by === 'morpheus-marketplace' && m.id.startsWith('0xremote9')));
}

console.log('');
console.log('openai endpoint: repeat calls do not re-read the slow registry');
{
  // opencode calls /v1/models on startup and again as it works. Each read cost
  // 5-10s against the real router, so without a cache the endpoint felt broken.
  registryReads = 0;
  await fetch(`${base}/v1/models`, { headers: auth });
  const first = registryReads;
  await fetch(`${base}/v1/models`, { headers: auth });
  await fetch(`${base}/v1/models`, { headers: auth });
  ok('three /v1/models calls cost one registry read',
    registryReads === first && first <= 1, `reads=${registryReads}`);
}

console.log('');
console.log('openai endpoint: chat completions');
{
  upstreamCalls.length = 0;
  const r = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'local-llama', messages: [{ role: 'user', content: 'hi' }] }),
  });
  ok('a non-streaming completion succeeds', r.status === 200);
  const body = await r.json();
  ok('and returns the router response untouched', body.object === 'chat.completion');

  const call = upstreamCalls.find((c) => c.url === '/v1/chat/completions');
  // The whole point of the facade: body `model` in, routing HEADERS out.
  ok('the facade converts body.model into the model_id header',
    call.headers.model_id === '0xlocal1');
  ok('a local model carries no session_id', !call.headers.session_id);
  ok('the router credential is attached', !!call.headers.authorization);

  // A marketplace model must route over its open session.
  upstreamCalls.length = 0;
  await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-v4', messages: [] }),
  });
  const remoteCall = upstreamCalls.find((c) => c.url === '/v1/chat/completions');
  ok('a marketplace model routes over its open session',
    remoteCall.headers.session_id === '0xsessOPEN');

  // The refusal that keeps the port spend-inert.
  const noSession = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'no-such-model', messages: [] }),
  });
  ok('an unusable model is refused, not opened', noSession.status === 404);
  const err = await noSession.json();
  ok('and the error tells the user what IS available', /local-llama/.test(err.error.message));

  ok('external use is recorded for the UI', activity.length >= 2);
  ok('and the record carries no prompt text',
    !JSON.stringify(activity).includes('hi'));
}

console.log('');
console.log('openai endpoint: the in-app handoff speaks hex, the wire speaks names');
{
  // The handoff must cost ONE registry read, not two. Two exceeded the IPC
  // timeout in the real app: the renderer reported failure while main went on
  // to open the terminal — an error message for work that succeeded.
  registryReads = 0;
  const handoff = await server.resolveForHandoff('0xremote1');
  ok('the handoff resolves and lists in a single registry read',
    registryReads === 1, `made ${registryReads} reads`);
  ok('and it returns both halves',
    handoff.advertised === 'deepseek-v4' && handoff.models.length > 0);

  // The bug this pins, found in live testing: callers inside the app hold the
  // hex32 chain id, /v1/models advertises NAMES, and the handoff compared the
  // two directly — so "Open in opencode" reported "not currently serving 0x…"
  // for a session that was open and working.
  const byHex = await server.resolveAdvertisedId('0xremote1');
  ok('a hex chain id resolves to the advertised name', byHex === 'deepseek-v4', `got ${byHex}`);
  const byName = await server.resolveAdvertisedId('deepseek-v4');
  ok('the advertised name resolves to itself', byName === 'deepseek-v4', `got ${byName}`);
  const localHex = await server.resolveAdvertisedId('0xlocal1');
  ok('a local model resolves by hex too', localHex === 'local-llama', `got ${localHex}`);
  ok('an unusable model resolves to null',
    (await server.resolveAdvertisedId('0xnotserved')) === null);

  // And what it resolves to must be a model the endpoint would actually accept —
  // otherwise the config we write names something that 404s inside opencode.
  const advertised = await server.advertisedModels();
  ok('every resolved id appears in the advertised list',
    advertised.some((m) => m.id === byHex));
}

console.log('');
console.log('openai endpoint: streaming');
{
  const r = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'local-llama', messages: [], stream: true }),
  });
  ok('streaming keeps the SSE content type',
    (r.headers.get('content-type') || '').includes('text/event-stream'));

  const reader = r.body.getReader();
  let text = '';
  for (let i = 0; i < 4; i++) {
    const { value, done } = await reader.read();
    if (done) break;
    text += Buffer.from(value).toString('utf8');
  }
  // The upstream split "Hello" mid-token across two writes. If the facade
  // re-framed rather than passed bytes through, this would not reassemble.
  ok('bytes pass through without re-framing', text.includes('Hello'));
  ok('SSE framing is intact', /^data: /.test(text));

  // Hanging up must stop the upstream — otherwise a cancelled request keeps a
  // PAID session generating tokens nobody reads.
  // Measure GENERATION, not a close event. An earlier version asserted on the
  // upstream's 'close' handler, which fires whether or not the request was
  // actually aborted — it passed with the abort removed, i.e. it was measuring
  // nothing. Counting chunks produced after the client leaves is the real claim:
  // for a marketplace model this is a paid session burning compute for output
  // nobody will read.
  await reader.cancel();
  await new Promise((res) => setTimeout(res, 400));
  const afterCancel = upstreamChunks;
  await new Promise((res) => setTimeout(res, 600));
  const stillGenerating = upstreamChunks - afterCancel;
  ok('cancelling the client stops the upstream generation', stillGenerating === 0,
    `upstream produced ${stillGenerating} more chunks after the client left (reason=${abortReason})`);
}

console.log('');
console.log('openai endpoint: the enable toggle actually binds and unbinds');
{
  cfg = { ...cfg, enabled: false };
  await server.sync();
  let refused = false;
  try {
    await fetch(`${base}/v1/models`, { headers: auth });
  } catch {
    refused = true;
  }
  ok('disabling the endpoint closes the port', refused === true);

  cfg = { ...cfg, enabled: true };
  await server.sync();
  const back = await fetch(`${base}/v1/models`, { headers: auth });
  ok('re-enabling brings it back', back.status === 200);
}

await server.stop();
await new Promise((r) => fakeRouter.close(r));

console.log('');
console.log(`OPENAI ENDPOINT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
