import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { parseUnixNpipeUrl, unixNpipeRequest } from './unix-npipe-request.ts'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'morpheus-docker-probe-'))
const sockets: string[] = []
const servers: Array<net.Server | http.Server> = []

function sockPath(name: string): string {
  const p = path.join(tmp, name)
  sockets.push(p)
  try {
    fs.unlinkSync(p)
  } catch {
    /* not there */
  }
  return p
}

after(() => {
  for (const s of servers) {
    try {
      s.close()
    } catch {
      /* ignore */
    }
  }
  for (const p of sockets) {
    try {
      fs.unlinkSync(p)
    } catch {
      /* ignore */
    }
  }
  try {
    fs.rmdirSync(tmp)
  } catch {
    /* ignore */
  }
})

test('parseUnixNpipeUrl: docker.sock form', () => {
  const parsed = parseUnixNpipeUrl('unix:///var/run/docker.sock:/version')
  assert.deepEqual(parsed, {
    proto: 'unix',
    socketPath: '/var/run/docker.sock',
    apiPath: '/version'
  })
})

test('parseUnixNpipeUrl: npipe form', () => {
  const parsed = parseUnixNpipeUrl(
    'npipe:////./pipe/docker_engine:/version'
  )
  assert.deepEqual(parsed, {
    proto: 'npipe',
    socketPath: '\\\\.\\pipe\\docker_engine',
    apiPath: '/version'
  })
})

test('missing socket fails immediately', async () => {
  const missing = path.join(tmp, 'no-such.sock')
  const t0 = Date.now()
  await assert.rejects(
    unixNpipeRequest(`unix://${missing}:/version`, 'GET', 2000),
    (err: Error) => /ENOENT|ECONNREFUSED|no such file/i.test(err.message)
  )
  assert.ok(
    Date.now() - t0 < 500,
    `missing socket took ${Date.now() - t0}ms (should be immediate)`
  )
})

test('socket that accepts and never replies times out and unblocks', async () => {
  const p = sockPath('hang.sock')
  const server = net.createServer((socket) => {
    // Hold the connection. Do not read or write. This is the dead-Docker-Desktop
    // shape: connect succeeds, HTTP never comes back.
    socket.pause()
  })
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(p, resolve)
  })

  const t0 = Date.now()
  await assert.rejects(
    unixNpipeRequest(`unix://${p}:/version`, 'GET', 250),
    (err: Error) => /timed out/i.test(err.message)
  )
  const elapsed = Date.now() - t0
  assert.ok(
    elapsed >= 200,
    `timed out too fast (${elapsed}ms)`
  )
  assert.ok(
    elapsed < 1500,
    `hang exceeded budget: ${elapsed}ms (axios used to wait forever here)`
  )
})

test('healthy /version resolves', async () => {
  const p = sockPath('ok.sock')
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{"Version":"test"}')
  })
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(p, resolve)
  })

  const res = await unixNpipeRequest(`unix://${p}:/version`, 'GET', 1000)
  assert.equal(res.status, 200)
  assert.match(res.data, /Version/)
})
