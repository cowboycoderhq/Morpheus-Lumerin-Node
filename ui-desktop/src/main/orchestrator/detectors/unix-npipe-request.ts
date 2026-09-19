import http from 'node:http'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export type UnixNpipeResponse = {
  status: number
  data: string
}

/**
 * Parse the orchestrator's unix/npipe probe URLs:
 *   unix:///var/run/docker.sock:/version
 *   npipe:////./pipe/docker_engine:/version
 *
 * Same split axios's transform used. Not a general URL parser.
 */
export function parseUnixNpipeUrl(
  uri: string
): { proto: 'unix' | 'npipe'; socketPath: string; apiPath: string } | null {
  const sep = uri.indexOf('://')
  if (sep < 0) return null
  const proto = uri.slice(0, sep)
  if (proto !== 'unix' && proto !== 'npipe') return null
  const pathname = uri.slice(sep + 3)
  const colon = pathname.indexOf(':')
  if (colon < 0) return null
  let socketPath = pathname.slice(0, colon)
  if (proto === 'npipe') {
    // URL form is //./pipe/docker_engine; Node wants \\.\pipe\docker_engine.
    socketPath = socketPath.replace(/^\/\/\.\//, '\\\\.\\').replace(/\//g, '\\')
  }
  const rest = pathname.slice(colon + 1)
  const apiPath = rest.startsWith('/') ? rest : `/${rest || ''}`
  return { proto, socketPath, apiPath }
}

/**
 * HTTP over a Unix socket / Windows named pipe with a timeout that actually
 * destroys the socket.
 *
 * Axios `timeout` is an idle timer on the HTTP request. A dead Docker Desktop
 * leaves docker.sock up: connect succeeds (the VM proxy accepts) and then
 * nothing is ever read. That hang used to pin Electron's startAll / the
 * start-services IPC. HTTP timeouts do not abort it. This one does: a timer
 * and socket.setTimeout both call destroy().
 */
export function unixNpipeRequest(
  uri: string,
  method: HttpMethod,
  timeoutMs: number
): Promise<UnixNpipeResponse> {
  const parsed = parseUnixNpipeUrl(uri)
  if (!parsed) {
    return Promise.reject(new Error(`not a unix/npipe url: ${uri}`))
  }
  const { socketPath, apiPath } = parsed
  const timeout = Math.max(1, timeoutMs)

  return new Promise((resolve, reject) => {
    let settled = false
    const req = http.request(
      {
        socketPath,
        path: apiPath,
        method,
        timeout
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk as Buffer))
        res.on('end', () => {
          const status = res.statusCode ?? 0
          const data = Buffer.concat(chunks).toString('utf8')
          if (status >= 400) {
            settle(new Error(`unix/npipe probe HTTP ${status}`))
            return
          }
          settle(undefined, { status, data })
        })
        res.on('error', (err) => settle(err))
      }
    )

    const settle = (err?: Error, value?: UnixNpipeResponse) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err) {
        req.destroy()
        reject(err)
      } else {
        resolve(value as UnixNpipeResponse)
      }
    }

    const timer = setTimeout(() => {
      settle(
        new Error(
          `unix/npipe probe timed out after ${timeout}ms (${socketPath})`
        )
      )
    }, timeout)

    req.on('socket', (socket) => {
      socket.setTimeout(timeout)
      socket.on('timeout', () => {
        socket.destroy()
        settle(
          new Error(
            `unix/npipe socket timed out after ${timeout}ms (${socketPath})`
          )
        )
      })
    })
    req.on('timeout', () => {
      settle(
        new Error(
          `unix/npipe request timed out after ${timeout}ms (${socketPath})`
        )
      )
    })
    req.on('error', (err) => settle(err))
    req.end()
  })
}
