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
import { writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pathToFileURL } from 'url';
import { OpenAiCompatServer, generateToken } from '../../src/main/src/openai-compat/server.ts';
import { buildStartPlugin, buildProviderPlugin } from '../../src/main/src/opencode/start-plugin.ts';

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
const sessionOpens = [];
let openShouldFail = false;
let openReturnsNoId = false;
let modelsShouldBeGarbage = false;
// Release-together barrier for the concurrency check; see the bid route.
const bidGate = { want: 0, pending: [] };
const respondBid = (res, id) => {
  const known = {
    '0xbidCHEAP': { Id: '0xbidCHEAP', ModelAgentId: '0xremote1', PricePerSecond: '1000000000000000' },
    '0xbidDEAR': { Id: '0xbidDEAR', ModelAgentId: '0xremote1', PricePerSecond: '9000000000000000' },
    '0xbidTIE': { Id: '0xbidTIE', ModelAgentId: '0xremote1', PricePerSecond: '1000000000000000' },
    '0xbidOTHER': { Id: '0xbidOTHER', ModelAgentId: '0xSOMETHINGELSE', PricePerSecond: '1000000000000000' },
    // Carries NO model id at all: the check must fail closed.
    '0xbidNOAGENT': { Id: '0xbidNOAGENT', PricePerSecond: '1000000000000000' },
  }[id];
  if (!known) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'no such bid' }));
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ bid: known }));
};
let supplyOverride = null;
let budgetOverride = null;
const fakeRouter = createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  upstreamCalls.push({ url, headers: req.headers });

  if (url === '/v1/models') {
    res.writeHead(200, { 'content-type': 'application/json' });
    // A 200 whose body is not an array is enough to throw inside
    // buildUsableModels — the post-spend path this suite now covers.
    res.end(JSON.stringify(modelsShouldBeGarbage
      ? { error: 'router busy' }
      : [{ Id: '0xlocal1', Name: 'local-llama' }]));
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
  // ---- the /morpheus/v1 surface's upstream ----------------------------------
  // supply/budget: the two figures every stake is derived from. 1e18 supply
  // over 1e18 budget makes stake == pricePerSecond * durationSec / 1e18 MOR,
  // so a 1e15 wei/s bid over 3600s is exactly 3.6 MOR — a number a human can
  // check by hand, which is the point of choosing it.
  if (url === '/blockchain/token/supply') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ supply: supplyOverride ?? 1e18 }));
    return;
  }
  if (url === '/blockchain/sessions/budget') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ budget: budgetOverride ?? 1e18 }));
    return;
  }
  if (url === '/blockchain/models/0xremote1/bids/active') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      bids: [
        { Id: '0xbidCHEAP', Provider: '0xprovA', PricePerSecond: '1000000000000000' },
        { Id: '0xbidDEAR', Provider: '0xprovB', PricePerSecond: '9000000000000000' },
        // Deliberately TIED with the cheapest. Two providers at the same price
        // are both the cheapest, and a "cheapest" badge derived from list
        // POSITION can only ever mark one of them — which is what makes this
        // fixture able to tell a price-based label from an index-based one.
        { Id: '0xbidTIE', Provider: '0xprovC', PricePerSecond: '1000000000000000' },
      ],
    }));
    return;
  }
  if (url.startsWith('/blockchain/bids/') && url.endsWith('/session')) {
    sessionOpens.push(url);
    if (openShouldFail) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'provider unreachable' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    // 200 with no id: accepted, but we cannot name it — it may have landed.
    res.end(JSON.stringify(openReturnsNoId ? { ok: true } : { sessionID: '0xNEWSESSION' }));
    return;
  }
  if (url.startsWith('/blockchain/bids/')) {
    const id = url.split('/')[3];
    // Barrier for the concurrency check. Holding N bid lookups and releasing
    // them together is what makes their continuations resume in the SAME tick.
    // Left to real socket timing they finish milliseconds apart, each request
    // reaching the ledger before the next one reads it — so the race never
    // occurs and a test built on it proves nothing.
    if (bidGate.want > 0) {
      bidGate.pending.push(() => respondBid(res, id));
      if (bidGate.pending.length >= bidGate.want) {
        const flush = bidGate.pending.slice();
        bidGate.pending.length = 0;
        bidGate.want = 0;
        for (const send of flush) send();
      }
      return;
    }
    respondBid(res, id);
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
  maxDailyStakeMor: 5,
  maxDailySessions: 10,
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

// ---- unknown headers must not break admission ------------------------------
// grok-build injects X-XAI-Token-Auth, x-authenticateresponse and a client-mode
// header into EVERY request to 127.0.0.1 (verified in its source:
// is_cli_chat_proxy_url returns true for loopback unconditionally). A client we
// want to support therefore sends headers we never asked for, and admission
// must ignore them rather than treat them as suspicious.
console.log('');
console.log('admission: headers we did not ask for');
{
  const withJunk = await fetch(`${base}/v1/models`, {
    headers: {
      ...auth,
      'X-XAI-Token-Auth': 'xai-grok-cli',
      'x-authenticateresponse': 'authenticate-response',
      'X-Some-Client-Mode': 'whatever',
    },
  });
  ok('a client sending its own extra headers is still admitted', withJunk.status === 200);

  // But the Origin refusal must NOT be relaxed by the same tolerance: a browser
  // is still a browser however many other headers it sends.
  const browsery = await fetch(`${base}/v1/models`, {
    headers: { ...auth, 'X-XAI-Token-Auth': 'xai-grok-cli', Origin: 'https://evil.example' },
  });
  ok('extra headers do not smuggle a browser past the Origin refusal',
    browsery.status === 403);
}

// ---- /morpheus/v1: the surface `/start` drives ------------------------------
// One route here can spend. Everything below is about proving it cannot be
// reached by accident, cannot be talked past, and cannot stake a figure other
// than the one it quoted.
console.log('');
console.log('morpheus: catalog, quote, and the one spending route');
{
  const post = (path, body, headers = auth) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  // --- admission applies to the whole surface, not just /v1 ---
  for (const path of ['/morpheus/v1/status', '/morpheus/v1/catalog']) {
    const r = await fetch(`${base}${path}`);
    ok(`${path} refuses an unauthenticated caller`, r.status === 401);
  }
  const originRefused = await post(
    '/morpheus/v1/sessions',
    { confirm: true },
    { ...auth, Origin: 'https://evil.example' },
  );
  ok('a browser Origin cannot reach the spending route', originRefused.status === 403);

  // --- catalog ---
  const catalog = await (await fetch(`${base}/morpheus/v1/catalog`, { headers: auth })).json();
  const model = catalog.models.find((m) => m.id === '0xremote1');
  ok('catalog lists a model with live bids', !!model);
  ok('catalog names every provider behind it', model.providers.length === 3);
  ok('catalog exposes the bidId a session is opened against',
    model.providers.every((p) => typeof p.bidId === 'string' && p.bidId));
  // 1e15 wei/s * 3600s * 1e18 / 1e18 / 1e18 = 3.6 MOR
  const cheap = model.providers.find((p) => p.bidId === '0xbidCHEAP');
  ok(`catalog prices per HOUR, not per second (got ${cheap.stakeMorPerHour})`,
    Math.abs(cheap.stakeMorPerHour - 3.6) < 1e-9);
  ok('catalog states the chain cap so the picker can bound its duration',
    catalog.maxSessionSeconds === 604800 && catalog.minSessionSeconds === 305);

  // --- duration validation REFUSES rather than silently clamping ---
  const tooLong = await post('/morpheus/v1/quote',
    { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 604801 });
  ok('a duration past the chain cap is refused, not clamped', tooLong.status === 400);
  ok('and the refusal says what the cap is',
    /604800/.test(JSON.stringify(await tooLong.json())));
  const tooShort = await post('/morpheus/v1/quote',
    { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 304 });
  ok('a duration under the contract floor is refused', tooShort.status === 400);
  const fractional = await post('/morpheus/v1/quote',
    { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 3600.5 });
  ok('a fractional duration is refused', fractional.status === 400);

  // --- a bid must belong to the model it is quoted against ---
  const mismatched = await post('/morpheus/v1/quote',
    { modelId: '0xremote1', bidId: '0xbidOTHER', durationSec: 3600 });
  ok('a bid belonging to another model is refused', mismatched.status === 404);

  // --- quote is read-only and honest about the cap ---
  const q = await (await post('/morpheus/v1/quote',
    { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 3600 })).json();
  ok(`quote prices an hour at 3.6 MOR (got ${q.stakeMor})`,
    Math.abs(q.stakeMor - 3.6) < 1e-9);
  ok('quote refuses while auto-open is off', q.allowed === false);
  ok('and says so, rather than reporting a cap problem',
    /turned off/i.test(q.reason ?? ''));
  ok('quoting NEVER opens a session', sessionOpens.length === 0);

  // --- the spending route, with auto-open still off ---
  //
  // 305s = 0.305 MOR, comfortably INSIDE every cap, so the only thing that can
  // refuse it is the auto-open gate itself. Asserting the code rather than the
  // status is what makes this discriminate: an earlier version asked for 3600s
  // (3.6 MOR, over the 1 MOR cap) and checked only `status === 403`, so it
  // passed identically whether the gate existed or not — deleting the gate
  // outright left the suite green.
  const blocked = await post('/morpheus/v1/sessions',
    { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 305, confirm: true });
  const blockedBody = await blocked.json();
  ok('the spending route is closed while auto-open is off', blocked.status === 403);
  ok('refused by the auto-open gate specifically, not by a cap',
    blockedBody?.error?.code === 'auto_open_disabled');
  ok('and it still opened nothing', sessionOpens.length === 0);

  // --- turn it on: now the caps are the boundary ---
  cfg = { ...cfg, allowAutoOpen: true };

  const noConfirm = await post('/morpheus/v1/sessions',
    { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 3600 });
  ok('opening without an explicit confirm is refused', noConfirm.status === 400);
  ok('the un-confirmed call opened nothing', sessionOpens.length === 0);

  // 3.6 MOR is over the 1 MOR per-session cap.
  const overCap = await post('/morpheus/v1/sessions',
    { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 3600, confirm: true });
  ok('a session over the per-session cap is refused', overCap.status === 403);
  ok('the refusal names the limit it hit',
    /per-session limit/i.test(JSON.stringify(await overCap.json())));
  ok('a capped session opened nothing', sessionOpens.length === 0);

  // A caller cannot name its own price: the stake is re-derived at spend time.
  const liar = await post('/morpheus/v1/sessions',
    { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 3600, confirm: true, stakeMor: 0.01 });
  ok('a caller-supplied stakeMor is ignored — it is re-priced', liar.status === 403);
  ok('the lie opened nothing', sessionOpens.length === 0);

  // --- a session that fits: 305s at 1e15 wei/s = 0.305 MOR ---
  const okRes = await post('/morpheus/v1/sessions',
    { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 305, confirm: true });
  const okBody = await okRes.json();
  ok('a session inside the caps opens', okRes.status === 200);
  ok('exactly one session was opened', sessionOpens.length === 1);
  ok('it staked the quoted figure, not a rounded one',
    Math.abs(okBody.stakeMor - 0.305) < 1e-9);
  ok('it returns the id the caller must send as `model`, not the chain id',
    okBody.model === 'deepseek-v4');
  ok('the open is surfaced to the UI',
    activity.some((a) => a.openedSessionId === '0xNEWSESSION'));

  // --- the daily ledger counts it ---
  const status = await (await fetch(`${base}/morpheus/v1/status`, { headers: auth })).json();
  ok('status reports auto-open is now on', status.canOpen === true);
  ok(`the day's spend is recorded (got ${status.spentTodayMor})`,
    Math.abs(status.spentTodayMor - 0.305) < 1e-9);
  ok('the day\'s session count is recorded', status.sessionsToday === 1);

  // --- the daily MOR cap binds across several small sessions ---
  cfg = { ...cfg, maxStakeMor: 1, maxDailyStakeMor: 0.5 };
  const overDaily = await post('/morpheus/v1/sessions',
    { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 305, confirm: true });
  ok('the daily MOR cap refuses the next session', overDaily.status === 403);
  ok('and names the daily limit',
    /daily limit/i.test(JSON.stringify(await overDaily.json())));
  ok('still only one session ever opened', sessionOpens.length === 1);

  // --- the daily COUNT cap binds even when the MOR cap would not ---
  cfg = { ...cfg, maxDailyStakeMor: 1000, maxDailySessions: 1 };
  const overCount = await post('/morpheus/v1/sessions',
    { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 305, confirm: true });
  ok('the daily session-count cap refuses even a cheap session',
    overCount.status === 403);
  ok('and names the count limit',
    /session 2 today/i.test(JSON.stringify(await overCount.json())));

  // --- a failed open must not consume the day's budget ---
  cfg = { ...cfg, maxDailySessions: 10 };
  openShouldFail = true;
  const failed = await post('/morpheus/v1/sessions',
    { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 305, confirm: true });
  ok('an open the router rejects reports the failure', failed.status === 502);
  openShouldFail = false;
  const afterFail = await (await fetch(`${base}/morpheus/v1/status`, { headers: auth })).json();
  ok(`a failed open does not consume the daily budget (got ${afterFail.spentTodayMor})`,
    Math.abs(afterFail.spentTodayMor - 0.305) < 1e-9);
  ok('nor the daily session count', afterFail.sessionsToday === 1);

  // --- a PAID open must never be reported as a failure -------------------
  // The worst outcome this surface can produce: the chain tx lands, then
  // bookkeeping throws, the caller gets a 500, and the user is told nothing
  // happened while the MOR is staked and the session id is lost. An agent
  // reading that failure retries and spends again. Nothing in this suite used
  // to cover it — `openShouldFail` only tests a router refusal BEFORE the tx.
  {
    const before = sessionOpens.length;
    // Break the post-spend path: /v1/models answering 200 with a non-array is
    // enough to throw inside resolveForHandoff.
    modelsShouldBeGarbage = true;
    const r = await post('/morpheus/v1/sessions',
      { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 305, confirm: true });
    const body = await r.json();
    modelsShouldBeGarbage = false;
    ok('the tx really did land', sessionOpens.length === before + 1);
    ok('a paid open still returns 200, not 500', r.status === 200);
    ok('and hands back the session id', typeof body.sessionId === 'string' && body.sessionId);
    ok('and what was staked', Math.abs(body.stakeMor - 0.305) < 1e-9);
    ok('while flagging that the model name could not be confirmed',
      body.modelResolved === false);
    ok('falling back to an id the endpoint still accepts',
      body.model === '0xremote1');
  }

  // --- the confirmed figure is a ceiling on what may be staked ------------
  // supply/budget are re-read at spend time and are fixed per UTC day, so a
  // confirmation straddling midnight can be priced against different inputs
  // than the dialog showed. Doubling the supply here doubles the stake.
  {
    const before = sessionOpens.length;
    supplyOverride = 2e18; // everything now costs 2x what was quoted
    const moved = await post('/morpheus/v1/sessions',
      { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 305,
        confirm: true, confirmedStakeMor: 0.305 });
    ok('a stake above the confirmed figure is refused', moved.status === 409);
    ok('and says the price moved',
      /price moved/i.test(JSON.stringify(await moved.json())));
    ok('nothing was staked at the higher price', sessionOpens.length === before);

    // Downward movement is fine — a ceiling may only ever refuse.
    supplyOverride = 5e17; // now HALF the quoted price
    const cheaper = await post('/morpheus/v1/sessions',
      { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 305,
        confirm: true, confirmedStakeMor: 0.305 });
    ok('a stake BELOW the confirmed figure still opens', cheaper.status === 200);
    supplyOverride = null;
  }

  // --- a bid that does not name its model must be refused -----------------
  // This check used to end `?? modelId`, which made it vacuously true for any
  // bid carrying neither field — opening a paid session against one model
  // while the confirmation named another.
  {
    const before = sessionOpens.length;
    const anon = await post('/morpheus/v1/sessions',
      { modelId: '0xremote1', bidId: '0xbidNOAGENT', durationSec: 305, confirm: true });
    ok('a bid that names no model is refused', anon.status === 404);
    ok('and nothing was staked against it', sessionOpens.length === before);
  }

  // --- ambiguous failures keep their reservation --------------------------
  // A router 200 with no session id may still have landed on-chain. Releasing
  // the reservation there under-counts the day's spend, which this file's own
  // rule says is the expensive direction to be wrong in.
  {
    const spentBefore = (await (await fetch(`${base}/morpheus/v1/status`, { headers: auth })).json()).spentTodayMor;
    openReturnsNoId = true;
    const ambiguous = await post('/morpheus/v1/sessions',
      { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 305, confirm: true });
    openReturnsNoId = false;
    ok('an ambiguous open is reported as a failure', ambiguous.status === 502);
    ok('and warns it may still exist',
      /may still have been created/i.test(JSON.stringify(await ambiguous.json())));
    const spentAfter = (await (await fetch(`${base}/morpheus/v1/status`, { headers: auth })).json()).spentTodayMor;
    ok(`an ambiguous open KEEPS its reservation (${spentBefore} -> ${spentAfter})`,
      Math.abs(spentAfter - (spentBefore + 0.305)) < 1e-9);

    // A clean router refusal is unambiguous and must still release.
    openShouldFail = true;
    await post('/morpheus/v1/sessions',
      { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 305, confirm: true });
    openShouldFail = false;
    const spentAfterClean = (await (await fetch(`${base}/morpheus/v1/status`, { headers: auth })).json()).spentTodayMor;
    ok('a clean router refusal still releases its reservation',
      Math.abs(spentAfterClean - spentAfter) < 1e-9);
  }

  // --- durationSec must be a JSON number ---------------------------------
  // Number() coercion accepted "0x1000" as 4096 seconds, so a caller could
  // stake for a duration it never believed it asked for.
  for (const bad of ['0x1000', [3600], ' 3600 ', '3600']) {
    const r = await post('/morpheus/v1/quote',
      { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: bad });
    ok(`durationSec ${JSON.stringify(bad)} is refused, not coerced`, r.status === 400);
  }

  // --- a cap that is not a number must refuse, not wave things through ----
  // Every cap comparison is `x > cap`, and that is false for NaN.
  {
    const before = sessionOpens.length;
    for (const broken of [
      { maxStakeMor: NaN },
      { maxDailyStakeMor: NaN },
      { maxDailySessions: NaN },
    ]) {
      const saved = { ...cfg };
      cfg = { ...cfg, ...broken };
      const r = await post('/morpheus/v1/sessions',
        { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 305, confirm: true });
      ok(`a NaN ${Object.keys(broken)[0]} refuses rather than meaning "no limit"`,
        r.status === 403);
      cfg = saved;
    }
    ok('no session opened while the caps were unusable',
      sessionOpens.length === before);
  }

  // --- concurrent opens must not both slip past the daily cap ---
  //
  // Budget for exactly ONE 0.305 MOR session on top of today's spend, then
  // fire five at once, with the fake router holding all five bid lookups and
  // releasing them in a single tick so their continuations resume together.
  //
  // WHAT THIS DOES AND DOES NOT SHOW: it shows five concurrent opens respect
  // the cap. It does NOT pin the synchronous re-check in serveOpenSession —
  // removing that guard leaves this green, because every path to the cap check
  // goes through I/O while the check-to-reserve span is pure microtask. Said
  // plainly because a check that cannot fail for the reason its name implies is
  // the kind that reads as coverage and is not.
  {
    const before = sessionOpens.length;
    const spent = (await (await fetch(`${base}/morpheus/v1/status`, { headers: auth })).json()).spentTodayMor;
    cfg = { ...cfg, maxStakeMor: 1, maxDailyStakeMor: spent + 0.305, maxDailySessions: 50 };
    bidGate.want = 5; // hold all five bid lookups, then release them together
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        post('/morpheus/v1/sessions',
          { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 305, confirm: true }),
      ),
    );
    const opened = results.filter((r) => r.status === 200).length;
    ok(`five concurrent opens yield exactly one session (got ${opened})`, opened === 1);
    ok('and only one reached the chain', sessionOpens.length === before + 1);
    ok('the rest were refused by the cap',
      results.filter((r) => r.status === 403).length === 4);
    cfg = { ...cfg, maxDailyStakeMor: 1000 };
  }

  // --- unpriceable means REFUSE, never guess ---
  supplyOverride = 0;
  const beforeUnpriceable = sessionOpens.length;
  const unpriceable = await post('/morpheus/v1/quote',
    { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 305 });
  ok('an unpriceable session is refused, not guessed at', unpriceable.status === 503);
  const unpriceableOpen = await post('/morpheus/v1/sessions',
    { modelId: '0xremote1', bidId: '0xbidCHEAP', durationSec: 305, confirm: true });
  ok('and it cannot be opened either', unpriceableOpen.status === 503);
  ok('no session was opened without a price',
    sessionOpens.length === beforeUnpriceable);
  supplyOverride = null;

  cfg = { ...cfg, allowAutoOpen: false, maxStakeMor: 1, maxDailyStakeMor: 5 };
}

// ---- the /start plugin, actually executed --------------------------------
// The plugin ships as a STRING, so it is the one part of this feature that no
// compiler ever checks. Write it out, import it for real, and drive the whole
// flow against the real server: pick model -> provider -> duration -> confirm.
// A "test" that only asserted the string contains "/start" would prove nothing.
console.log('');
console.log('morpheus: the /start plugin');
{
  // The plugin reads its endpoint from a DESCRIPTOR, because opencode gives
  // auto-loaded plugins no options. Write a real one and let it read it.
  const descriptorFile = join(tmpdir(), `morpheus-endpoint-${process.pid}.json`);
  writeFileSync(descriptorFile, JSON.stringify({ baseUrl: base, apiKey: TOKEN, models: [] }), 'utf8');
  const pluginFile = join(tmpdir(), `morpheus-start-${process.pid}.mjs`);
  writeFileSync(pluginFile, buildStartPlugin(descriptorFile), 'utf8');
  const mod = await import(pathToFileURL(pluginFile).href);
  ok('the plugin source parses and exports a tui entrypoint',
    typeof mod.tui === 'function');

  // A fake TUI api. Dialog components are called as FUNCTIONS by the plugin,
  // so returning the props verbatim is enough to inspect and drive them.
  const toasts = [];
  let rendered = null;
  let disposed = 0;
  let modelsDialogOpened = 0;
  let registered = null;
  const api = {
    ui: {
      toast: (t) => toasts.push(t),
      DialogSelect: (props) => ({ kind: 'select', ...props }),
      DialogConfirm: (props) => ({ kind: 'confirm', ...props }),
      dialog: {
        replace: (render) => { rendered = render(); },
        clear: () => { rendered = null; },
      },
    },
    lifecycle: { onDispose: () => { disposed++; } },
    command: { register: (cb) => { registered = cb; return () => {}; } },
    client: { tui: { openModels: async () => { modelsDialogOpened++; } } },
  };

  await mod.tui(api);
  ok('the plugin registers its command', typeof registered === 'function');
  const cmds = registered();
  const startCmd = cmds.find((c) => c.slash && c.slash.name === 'start');
  ok('it registers the /start slash command', !!startCmd);
  ok('and it is reachable by its /morpheus alias',
    startCmd.slash.aliases.includes('morpheus'));

  const settle = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 25)); };

  // Drive one step of the dialog flow, failing as an ASSERTION rather than a
  // crash when the flow stalls. Without this, a mutation that breaks step 2
  // throws a TypeError deep in the file and the run dies before reporting the
  // steps that did work — a suite that crashes tells you much less than one
  // that says which step it could not reach.
  const advance = async (pred, what) => {
    const option =
      rendered && Array.isArray(rendered.options)
        ? rendered.options.find(pred)
        : null;
    if (!option) {
      ok(`could not select ${what} — flow stalled at ${rendered ? rendered.kind : 'no dialog'}`, false);
      return false;
    }
    rendered.onSelect(option);
    await settle();
    return true;
  };

  // --- with auto-open OFF, /start must stop at the first step ---
  cfg = { ...cfg, allowAutoOpen: false };
  toasts.length = 0;
  rendered = null;
  const beforeBrowse = sessionOpens.length;
  startCmd.onSelect();
  await settle();
  ok('/start refuses to even browse while auto-open is off', rendered === null);
  ok('and it says where the switch is',
    toasts.some((t) => /Settings/i.test(t.message)));
  ok('nothing was opened', sessionOpens.length === beforeBrowse);

  // --- turn it on and walk the whole flow ---
  cfg = { ...cfg, allowAutoOpen: true, maxStakeMor: 5, maxDailyStakeMor: 500, maxDailySessions: 50 };
  toasts.length = 0;
  rendered = null;
  startCmd.onSelect();
  await settle();

  ok('step 1 is a searchable model picker', rendered?.kind === 'select');
  ok('the model step is filterable', typeof rendered.placeholder === 'string');
  const modelOpt = rendered.options.find((o) => o.value.id === '0xremote1');
  ok('it lists the model with live bids', !!modelOpt);
  ok('and shows what it costs before you commit',
    /per hour|\/ hour/i.test(modelOpt.description));

  await advance((o) => o.value.id === '0xremote1', 'the model');
  ok('step 2 is the provider picker', rendered?.kind === 'select');
  ok('it lists every provider, not just one', rendered.options.length === 3);
  ok('cheapest provider is offered first',
    rendered.options[0].value.bidId === '0xbidCHEAP');
  // Assert the badge sits on the genuinely cheapest BID, not on whatever landed
  // at index 0. Checking options[0].description said nothing: the label used to
  // be index-based, so reversing the sort relabelled the dearest provider
  // "cheapest" and this check still passed.
  const badge = (bidId) =>
    /cheapest/i.test(
      rendered.options.find((o) => o.value.bidId === bidId).description,
    );
  ok('the cheapest badge is on the cheap bid', badge('0xbidCHEAP'));
  ok('and NOT on the expensive one', !badge('0xbidDEAR'));
  // The discriminating case: a provider TIED at the cheapest price is also
  // cheapest. An index-based badge marks exactly one option and would fail
  // here; a price-based one marks both. Without this the two implementations
  // are indistinguishable whenever the sort happens to be correct.
  ok('a provider tied at the cheapest price is also badged', badge('0xbidTIE'));

  await advance((o) => o.value.bidId === '0xbidCHEAP', 'the provider');
  ok('step 3 is the duration picker', rendered?.kind === 'select');
  ok('durations past the chain cap are not offered',
    rendered.options.every((o) => o.value <= 604800));
  ok('durations under the contract floor are not offered',
    rendered.options.every((o) => o.value >= 305));

  const opensBeforeConfirm = sessionOpens.length;
  await advance((o) => o.value === 3600, 'the duration');
  ok('step 4 is a confirmation, not an open', rendered?.kind === 'confirm');
  ok('NOTHING is staked before the confirm', sessionOpens.length === opensBeforeConfirm);
  // Read through a default rather than off `rendered` directly: when a mutation
  // removes the confirm step there IS no dialog, and dereferencing it turns
  // four clean assertion failures into one stack trace.
  const confirmText = (rendered && rendered.message) || '';
  ok('the confirm states the real quoted stake (3.60 MOR)',
    /3\.60 MOR/.test(confirmText));
  ok('it names the model, provider and duration',
    /deepseek-v4/.test(confirmText) &&
    /0xprovA/.test(confirmText) &&
    /1 hour/.test(confirmText));
  ok('it says the stake is collateral, not a fee',
    /collateral, not a fee/i.test(confirmText));
  ok('and that it is locked to the end of the day',
    /end of\s+the day/i.test(confirmText));

  // --- cancelling must not spend ---
  if (rendered && rendered.kind === 'confirm') rendered.onCancel();
  await settle();
  ok('cancelling the confirm opens nothing',
    sessionOpens.length === opensBeforeConfirm);

  // --- confirming does ---
  startCmd.onSelect();
  await settle();
  await advance((o) => o.value.id === '0xremote1', 'the model');
  await advance((o) => o.value.bidId === '0xbidCHEAP', 'the provider');
  await advance((o) => o.value === 3600, 'the duration');
  toasts.length = 0;
  if (rendered && rendered.kind === 'confirm') rendered.onConfirm();
  await settle();
  ok('confirming opens exactly one session',
    sessionOpens.length === opensBeforeConfirm + 1);
  ok('the user is told it worked, with the figure',
    toasts.some((t) => t.variant === 'success' && /3\.60 MOR/.test(t.message)));
  ok('and the model picker is opened so the session can be used',
    modelsDialogOpened === 1);

  // --- a refusal from the app must surface verbatim, not be swallowed ---
  cfg = { ...cfg, maxStakeMor: 0.001 };
  startCmd.onSelect();
  await settle();
  await advance((o) => o.value.id === '0xremote1', 'the model');
  await advance((o) => o.value.bidId === '0xbidCHEAP', 'the provider');
  toasts.length = 0;
  const beforeRefusal = sessionOpens.length;
  await advance((o) => o.value === 3600, 'the duration');
  ok('a capped session never reaches a confirm dialog', rendered === null);
  ok('the app\'s own refusal is shown to the user',
    toasts.some((t) => /per-session limit/i.test(t.message)));
  ok('and nothing was staked', sessionOpens.length === beforeRefusal);

  // --- the companion provider plugin -------------------------------------
  // /start is useless without it in a terminal the app did not launch: the
  // session opens and the model cannot be selected, because opencode has never
  // heard of the provider.
  {
    const provFile = join(tmpdir(), `morpheus-provider-${process.pid}.mjs`);
    writeFileSync(provFile, buildProviderPlugin(descriptorFile), 'utf8');
    const prov = await import(pathToFileURL(provFile).href);
    ok('the provider plugin parses and exports a server entrypoint',
      typeof prov.server === 'function');
    const hooks = await prov.server();
    ok('it registers a config hook', typeof hooks.config === 'function');

    const cfg = { provider: { theirs: { name: 'Their Provider' } } };
    await hooks.config(cfg);
    ok('it adds the morpheus provider', !!cfg.provider.morpheus);
    ok('pointed at the running endpoint',
      cfg.provider.morpheus.options.baseURL === base);
    ok('carrying the key', cfg.provider.morpheus.options.apiKey === TOKEN);
    ok('using the generic OpenAI-compatible adapter',
      cfg.provider.morpheus.npm === '@ai-sdk/openai-compatible');
    ok("and it leaves the user's own providers alone",
      cfg.provider.theirs?.name === 'Their Provider');

    // No descriptor -> add NOTHING. A provider pointed at nothing would put
    // dead models in the picker.
    const orphan = join(tmpdir(), `morpheus-missing-${process.pid}.json`);
    const orphanFile = join(tmpdir(), `morpheus-provider-orphan-${process.pid}.mjs`);
    writeFileSync(orphanFile, buildProviderPlugin(orphan), 'utf8');
    const orphanMod = await import(pathToFileURL(orphanFile).href);
    const cfg2 = { provider: { theirs: {} } };
    await (await orphanMod.server()).config(cfg2);
    ok('with no descriptor it adds no provider at all', !cfg2.provider.morpheus);
    rmSync(provFile, { force: true });
    rmSync(orphanFile, { force: true });
  }

  rmSync(pluginFile, { force: true });
  rmSync(descriptorFile, { force: true });
  cfg = { ...cfg, allowAutoOpen: false, maxStakeMor: 1, maxDailyStakeMor: 5 };
}

await server.stop();
await new Promise((r) => fakeRouter.close(r));

console.log('');
console.log(`OPENAI ENDPOINT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
