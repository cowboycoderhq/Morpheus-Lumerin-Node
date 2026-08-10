import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { LogFunctions } from 'electron-log'
import { OrchestratorConfig } from './orchestrator.types'
import { isPortAvailable } from './managed-process'

async function findFreePort(start: number, span = 50): Promise<number | undefined> {
  for (let p = start; p < start + span; p++) {
    if (await isPortAvailable(p)) return p
  }
  return undefined
}

type RouterState = 'absent' | 'usable' | 'unusable'

// Classify what is (or isn't) answering at this origin, probing over `localhost`
// exactly like the orchestrator's ProcessFactory does — NOT with an IPv4 bind
// check. A Dockerized router publishes on [::]:8082 (IPv6); an isPortAvailable()
// bind on 127.0.0.1 sees the port "free" and we'd skip the whole check, while
// ProcessFactory then adopts the IPv6 router anyway. Probing the endpoint keeps
// this decision consistent with adoption.
//
// 'usable' requires more than a health response: we must be able to READ the
// auth cookie the router points at. A container reports its cookie at a path
// that only exists inside the container (/app/app/data/.cookie), so every
// authenticated call (onboarding, balances, sessions) fails with ENOENT on the
// host. "Responds" is not enough; "we can authenticate against it" is the bar.
async function probeRouter(origin: string, log?: LogFunctions): Promise<RouterState> {
  let cookiePath: unknown
  try {
    const res = await fetch(`${origin}/auth/cookie/path`, { signal: AbortSignal.timeout(2500) })
    if (!res.ok) {
      log?.info(`router at ${origin} answered ${res.status} for the cookie path — treating as unusable`)
      return 'unusable'
    }
    const body = (await res.json().catch(() => null)) as { path?: unknown } | null
    cookiePath = body?.path
  } catch (e) {
    // Network-level failure = nothing is answering here. We'll start our own.
    log?.info(`no router answering at ${origin}: ${(e as Error).message}`)
    return 'absent'
  }
  if (typeof cookiePath !== 'string' || !cookiePath) return 'unusable'
  try {
    await fs.access(cookiePath, fsConstants.R_OK)
    return 'usable'
  } catch {
    log?.info(`router at ${origin} reports an unreadable cookie path (${cookiePath}) — unusable`)
    return 'unusable'
  }
}

/**
 * Decide the endpoint our proxy-router should use, BEFORE the renderer loads its
 * config (must run before createWindow, since the renderer calls the router
 * directly via config.chain.localProxyRouterUrl).
 *
 * Three cases:
 *   - the API port is free             -> we start our own there (no change)
 *   - a USABLE router already holds it -> we adopt it (our own prior instance,
 *                                         or a compatible local router)
 *   - a FOREIGN/unusable router holds it (the Docker case) -> we run OUR OWN on
 *     free ports instead of hijacking or failing against it, and rewrite every
 *     reference (proxy config + config.chain.localProxyRouterUrl) so the whole
 *     app — main process AND renderer — talks to our router.
 */
export async function resolveRouterEndpoint(
  cfg: OrchestratorConfig,
  config: { chain: { localProxyRouterUrl: string } },
  log?: LogFunctions
): Promise<void> {
  const proxy = cfg.proxyRouter
  if (!proxy?.probe?.url) return

  const apiUrl = new URL(proxy.probe.url)
  const apiPort = Number(apiUrl.port)
  if (!apiPort) return

  const state = await probeRouter(apiUrl.origin, log)
  if (state === 'absent') return // nothing answering — we'll start our own here
  if (state === 'usable') {
    log?.info(`Adopting the usable router already running on port ${apiPort}`)
    return
  }
  // state === 'unusable' -> a foreign/containerized router. Fall through and
  // start our own on free ports instead of adopting it.

  // The router binds TWO ports: the web/API port and a P2P port. Relocate BOTH.
  // A foreign router holding the API port almost always holds the P2P port too
  // (a Dockerized proxy-router publishes both), and we can't reliably tell via
  // isPortAvailable() — it binds IPv4 and would miss an IPv6 [::] listener, the
  // very blind spot that let the API-port router get adopted. Allocating a fresh
  // P2P port unconditionally sidesteps that; using a free port we didn't need is
  // harmless.
  const p2pPort = Number(proxy.ports?.[0]) || undefined
  const newApi = await findFreePort(apiPort + 1)
  if (!newApi) {
    log?.warn(
      `Port ${apiPort} holds a router we can't authenticate with, and no free port ` +
        `was found nearby — leaving it and letting startup surface the failure.`
    )
    return
  }
  const newP2p = p2pPort ? await findFreePort(newApi + 1) : undefined

  log?.warn(
    `Port ${apiPort} is held by a router we can't authenticate with (foreign/containerized). ` +
      `Starting our own on API ${newApi}${newP2p ? `, P2P ${newP2p}` : ''}.`
  )

  const from = String(apiPort)
  const to = String(newApi)

  proxy.probe.url = proxy.probe.url.replace(`:${from}`, `:${to}`)
  config.chain.localProxyRouterUrl = `http://localhost:${to}`

  const env = proxy.env as Record<string, string> | undefined
  if (env) {
    if (env.WEB_ADDRESS) env.WEB_ADDRESS = env.WEB_ADDRESS.replace(`:${from}`, `:${to}`)
    if (env.WEB_PUBLIC_URL) env.WEB_PUBLIC_URL = env.WEB_PUBLIC_URL.replace(`:${from}`, `:${to}`)
    if (newP2p && p2pPort && env.PROXY_ADDRESS) {
      env.PROXY_ADDRESS = env.PROXY_ADDRESS.replace(`:${p2pPort}`, `:${newP2p}`)
    }
  }

  const ports: number[] = []
  if (p2pPort) ports.push(newP2p ?? p2pPort)
  ports.push(newApi)
  proxy.ports = ports
}
