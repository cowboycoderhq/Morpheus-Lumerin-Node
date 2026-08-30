import { app } from 'electron'
import fs from 'fs-extra'
import path from 'node:path'
import { downloadFile } from './downloader'
import logger from '../logger'
import { extractFile } from './unzipper'
import {
  DownloadItem,
  LoadingState,
  OrchestratorConfig,
  OrchestratorStatus
} from './orchestrator.types'
import { Process } from './process'
import { ProcessFactory } from './process-factory'
import { reapOrphan } from './service-pids'
import { isPortAvailable } from './managed-process'

console.log('Process cwd', process.cwd())
console.log('App path', resolveAppDataPath(''))

// An extracted service is "already installed" only if the binary we are about to
// RUN is actually there and non-empty — not merely because its directory exists.
//
// The old guard was `fs.existsSync(extractPath)`. If an extraction was ever
// interrupted (app closed, network dropped, disk hiccup), the DIRECTORY survives
// while build/bin/llama-server does not — and every later run then logged
// "already exists, skipping download", set the state to SUCCESS, and left the AI
// phase to fail on a binary that was never there. "Try again" re-entered the same
// short-circuit, so it failed identically, forever. That is unrecoverable without
// deleting the folder by hand, which no user will ever be told to do.
const isInstalled = (runPath?: string): boolean => {
  if (!runPath) return false
  try {
    const p = resolveAppDataPath(runPath)
    if (!fs.existsSync(p) || fs.statSync(p).size === 0) return false

    // A binary we cannot execute is NOT installed. The extractor used to drop
    // the archive's unix mode, so every file landed 0644 and the binaries were
    // unrunnable; existence alone said "installed", so we skipped the re-extract
    // and the tree stayed broken.
    //
    // Scope honestly: this only rescues a tree that has never been through
    // ManagedProcess.start() (which chmods its own binary to 0755 before every
    // spawn). It does NOT repair a machine that already reached the start
    // path — that one already reads as executable. It is a cheap guard against
    // shipping a non-executable tree, not a general repair mechanism.
    // No-op on Windows: Node documents X_OK as having no effect there.
    fs.accessSync(p, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

export class Orchestrator {
  private proxyRouterProcess?: Process
  private aiRuntimeProcess?: Process
  private ipfsProcess?: Process
  private containerRuntimeProcess?: Process
  private onStateUpdate: (state: LoadingState) => void
  private cfg: OrchestratorConfig
  private log: typeof logger

  // Mutex-style guard: ensures only one startAll pipeline is in flight at a
  // time. Re-entrant callers (e.g. an auto-resume after a successful
  // restartService while the initial startAll hasn't returned yet) await the
  // existing promise instead of racing a second pipeline.
  private startInProgress: Promise<void> | null = null

  // How long a quit will wait for the services to stop before giving up on
  // them and exiting anyway.
  private static readonly SHUTDOWN_TIMEOUT_MS = 8000

  private shuttingDown = false

  // Reaping happens exactly once, before this run spawns anything — so every
  // live pid we recorded is by definition from a previous run, and we can never
  // kill a child of our own that is currently healthy.
  private orphansReaped = false

  private proxyDownloadState: DownloadItem = {
    name: 'Proxy Router',
    status: 'pending',
    progress: 0
  }

  private aiRuntimeDownloadState: DownloadItem = {
    name: 'AI Runtime',
    status: 'pending',
    progress: 0
  }

  private aiModelDownloadState: DownloadItem = {
    name: 'AI Model',
    status: 'pending',
    progress: 0
  }

  private ipfsDownloadState: DownloadItem = {
    name: 'IPFS',
    status: 'pending',
    progress: 0
  }

  constructor(
    cfg: OrchestratorConfig,
    onStateUpdate: (state: LoadingState) => void,
    log: typeof logger
  ) {
    this.cfg = cfg
    this.log = log
    this.onStateUpdate = onStateUpdate

    // `quit` fires too late to be useful: it returned a promise nobody awaited,
    // so the app exited and left the services running (they were surviving for
    // days). Hold the quit open until the children are actually dead — bounded,
    // so a wedged child can never trap the user in an app that won't close.
    app.on('before-quit', (event) => {
      if (this.shuttingDown) return
      this.shuttingDown = true
      event.preventDefault()
      this.log.warn('Quit requested — stopping services')

      Promise.race([
        this.stopAll(),
        new Promise((resolve) => setTimeout(resolve, Orchestrator.SHUTDOWN_TIMEOUT_MS))
      ])
        .catch((err) => this.log.error('Failed to stop services cleanly', err))
        .finally(() => app.exit(0))
    })
  }

  async startAll(): Promise<void> {
    if (this.startInProgress) {
      this.log.info('startAll already in progress; awaiting existing run')
      return this.startInProgress
    }
    this.startInProgress = this.runStartupPipeline()
    try {
      await this.startInProgress
    } finally {
      this.startInProgress = null
    }
  }

  private async runStartupPipeline() {
    this.log.info('Orchestrator started')

    // If we crashed last time, our services are still running and still holding
    // their ports. Clear them out before we try to start anything, otherwise the
    // spawn fails on a port conflict or we adopt a service running yesterday's
    // config. Only ever kills pids this app recorded when it spawned them.
    await this.reapOrphanedServices()

    // IPFS defaults to port 5001, which collides with all sorts of things a
    // developer already runs (it's a very common local port). A collision used
    // to be fatal: IPFS couldn't bind, never reached 'running', and — because it
    // was in the readiness gate — froze the whole app on "Connecting to the
    // Morpheus network" with no error. Find a free port for it instead, and
    // thread that port everywhere IPFS's port is referenced (its own --api bind,
    // the health probe, AND the IPFS_MULTADDR the proxy-router uses to reach it).
    // Must run BEFORE the proxy-router env is written/started, since the router
    // reads that multiaddr.
    await this.resolveIpfsPort()

    await this.resetState()
    this.emitStateUpdate()

    if (this.cfg.proxyRouter.downloadUrl) {
      await downloadFile(
        this.cfg.proxyRouter.downloadUrl,
        resolveAppDataPath(this.cfg.proxyRouter.fileName),
        (progress) => {
          this.proxyDownloadState.status = progress.status
          this.proxyDownloadState.progress = progress.progress
          this.proxyDownloadState.error = progress.error
          this.emitStateUpdate()
          this.log.info(`Downloading proxy-router: ${progress.bytesDownloaded} bytes`)
        },
        this.log.scope('Proxy-router download')
      )
    }

    this.proxyDownloadState.status = 'success'
    this.emitStateUpdate()

    if (this.cfg.aiRuntime.downloadUrl && this.cfg.aiRuntime.extractPath) {
      if (isInstalled(this.cfg.aiRuntime.runPath)) {
        this.log.info(
          'AI runtime already installed, skipping download',
          resolveAppDataPath(this.cfg.aiRuntime.runPath!)
        )
        this.aiRuntimeDownloadState.status = 'success'
        this.emitStateUpdate()
      } else {
        // A half-extracted tree is worse than none: it makes the guard above lie.
        // Clear it so the re-extract starts clean.
        const stale = resolveAppDataPath(this.cfg.aiRuntime.extractPath)
        if (fs.existsSync(stale)) {
          this.log.info(`AI runtime is present but incomplete — re-installing: ${stale}`)
          await fs.remove(stale).catch((e) => this.log.error('Failed to clear', e))
        }

        await downloadFile(
          this.cfg.aiRuntime.downloadUrl,
          resolveAppDataPath(this.cfg.aiRuntime.fileName),
          (progress) => {
            this.aiRuntimeDownloadState.status = progress.status
            this.aiRuntimeDownloadState.progress = progress.progress
            this.aiRuntimeDownloadState.error = progress.error
            this.emitStateUpdate()
            this.log.info(`Downloading ai-runtime: ${progress.bytesDownloaded} bytes`)
          },
          this.log.scope('Ai-runtime download')
        )

        this.log.info(`unzipping ai runtime`)

        await extractFile(
          resolveAppDataPath(this.cfg.aiRuntime.fileName),
          resolveAppDataPath(this.cfg.aiRuntime.extractPath),
          (progress) => {
            this.aiRuntimeDownloadState.status = progress.status === 'error' ? 'error' : 'unzipping'
            this.aiRuntimeDownloadState.progress = progress.progress
            this.aiRuntimeDownloadState.error = progress.error
            this.emitStateUpdate()
            this.log.info(`Extracting ai-runtime`, progress)
          }
        )
      }
    }

    this.aiRuntimeDownloadState.status = 'success'
    this.emitStateUpdate()

    // Anyone who ran an earlier build has the superseded TinyLlama .gguf sitting
    // in app-data, and nothing will ever load it again — the model filename is
    // what the downloader keys on. Reclaim the ~460MB rather than silently
    // leaving it on their disk forever.
    for (const stale of ['./services/ai-model.gguf', './services/ai-model.llvm']) {
      const stalePath = resolveAppDataPath(stale)
      if (stalePath !== resolveAppDataPath(this.cfg.aiModel.fileName) && fs.existsSync(stalePath)) {
        this.log.info(`Removing superseded AI model: ${stalePath}`)
        await fs.remove(stalePath).catch((err) => this.log.error('Failed to remove', err))
      }
    }

    if (this.cfg.aiModel.downloadUrl) {
      await downloadFile(
        this.cfg.aiModel.downloadUrl,
        resolveAppDataPath(this.cfg.aiModel.fileName),
        (progress) => {
          this.aiModelDownloadState.status = progress.status
          this.aiModelDownloadState.progress = progress.progress
          this.aiModelDownloadState.error = progress.error
          this.emitStateUpdate()
          this.log.info(`Downloading ai-model: ${progress.bytesDownloaded} bytes`)
        },
        this.log.scope('Ai-model download')
      )
    }
    this.aiModelDownloadState.status = 'success'
    this.emitStateUpdate()

    if (
      this.cfg.ipfs.downloadUrl &&
      this.cfg.ipfs.extractPath &&
      !isInstalled(this.cfg.ipfs.runPath)
    ) {
      await downloadFile(
        this.cfg.ipfs.downloadUrl,
        resolveAppDataPath(this.cfg.ipfs.fileName),
        (progress) => {
          this.ipfsDownloadState.status = progress.status
          this.ipfsDownloadState.progress = progress.progress
          this.ipfsDownloadState.error = progress.error
          this.emitStateUpdate()
          this.log.info(`Downloading ipfs: ${progress.bytesDownloaded} bytes`)
        },
        this.log.scope('IPFS node download')
      )

      // Both extractors early-return when the destination already exists. So
      // without this removal, a broken IPFS tree (e.g. one extracted by the old
      // mode-dropping code, leaving a non-executable binary) would be
      // re-DOWNLOADED — ~30MB — and then not extracted at all, repairing
      // nothing and orphaning the archive on disk. The aiRuntime branch above
      // already does this; the IPFS branch never did.
      const staleIpfs = resolveAppDataPath(this.cfg.ipfs.extractPath)
      if (fs.existsSync(staleIpfs)) {
        this.log.info(`IPFS is present but not usable — re-installing: ${staleIpfs}`)
        await fs.remove(staleIpfs).catch((e) => this.log.error('Failed to clear', e))
      }

      this.log.info(`unzipping ipfs`)

      await extractFile(
        resolveAppDataPath(this.cfg.ipfs.fileName),
        resolveAppDataPath(this.cfg.ipfs.extractPath),
        (progress) => {
          this.ipfsDownloadState.status = progress.status === 'error' ? 'error' : 'unzipping'
          this.ipfsDownloadState.progress = progress.progress
          this.ipfsDownloadState.error = progress.error
          this.emitStateUpdate()
          this.log.info(`Extracting ipfs: ${progress.status} ${progress.progress}`)
        }
      )
    }
    this.ipfsDownloadState.status = 'success'
    this.emitStateUpdate()

    if (!this.ipfsProcess) {
      this.ipfsProcess = await ProcessFactory({
        name: 'ipfs',
        command: resolveAppDataPath(this.cfg.ipfs.runPath),
        args: this.cfg.ipfs.runArgs,
        log: this.log.scope('IPFS'),
        redirectProcessOutput: true,
        probe: this.cfg.ipfs.probe,
        ports: this.cfg.ipfs.ports,
        onStateChange: () => this.emitStateUpdate()
      })
    }

    // One service failing must not abort the pipeline. This used to be a bare
    // `await ipfsProcess.start()`: when IPFS threw, aiRuntime.start() below was
    // never reached, so the AI runtime sat at 'pending' forever — which the
    // setup UI reads as "still working", i.e. an eternal spinner with no error
    // and no way to retry. It also meant the AI binary never got its
    // chmod-before-spawn, so a bad install could never even repair itself.
    //
    // A failed start() has ALREADY recorded state='stopped' + the real error on
    // its own ManagedProcess, which is what the UI escalates on. Swallowing the
    // throw here loses nothing and makes each service's failure visible instead
    // of silently fatal to everything downstream.
    await this.ipfsProcess.start().catch((err) => this.log.error('IPFS failed to start', err))
    this.emitStateUpdate()

    if (!this.aiRuntimeProcess) {
      this.aiRuntimeProcess = await ProcessFactory({
        name: 'aiRuntime',
        command: resolveAppDataPath(this.cfg.aiRuntime.runPath),
        args: this.cfg.aiRuntime.runArgs,
        log: this.log.scope('Ai-runtime'),
        redirectProcessOutput: false,
        probe: this.cfg.aiRuntime.probe,
        ports: this.cfg.aiRuntime.ports,
        onStateChange: () => this.emitStateUpdate()
      })
    }

    await this.aiRuntimeProcess
      .start()
      .catch((err) => this.log.error('AI runtime failed to start', err))
    this.emitStateUpdate()

    // Container runtime
    if (!this.containerRuntimeProcess) {
      this.containerRuntimeProcess = await ProcessFactory({
        probe: this.cfg.containerRuntime.probe,
        onStateChange: () => this.emitStateUpdate(),
        log: this.log.scope('Container-runtime')
      })
    }

    await this.containerRuntimeProcess.start().catch(this.log.error)
    this.emitStateUpdate()

    // Proxy router

    const proxyFolder = path.dirname(resolveAppDataPath(this.cfg.proxyRouter.runPath))

    // writting local config files if not exist
    await this.writeEnvFile(path.join(proxyFolder, '.env'), this.cfg.proxyRouter.env ?? {})
    await this.writeModelsConfigFile(
      path.join(proxyFolder, 'models-config.json'),
      this.cfg.proxyRouter.modelsConfig
    )
    await this.writeLocalConfigFile(
      path.join(proxyFolder, 'rating-config.json'),
      this.cfg.proxyRouter.ratingConfig
    )

    if (!this.proxyRouterProcess) {
      this.proxyRouterProcess = await ProcessFactory({
        name: 'proxyRouter',
        command: resolveAppDataPath(this.cfg.proxyRouter.runPath),
        args: this.cfg.proxyRouter.runArgs || [],
        log: this.log.scope('Proxy-router'),
        redirectProcessOutput: false,
        probe: this.cfg.proxyRouter.probe,
        ports: this.cfg.proxyRouter.ports,
        onStateChange: () => this.emitStateUpdate()
      })
    }

    await this.proxyRouterProcess
      .start()
      .catch((err) => this.log.error('Proxy router failed to start', err))
    this.emitStateUpdate()
  }

  /**
   * Kill any service still running from a previous, crashed run of this app.
   * Runs once per app launch, before anything is spawned.
   */
  // Find a free port for IPFS starting from its configured default, and rewrite
  // every reference to it in the live config. Idempotent and safe to call once
  // per startup. If the default is already free, nothing changes.
  private async resolveIpfsPort() {
    const ipfs = this.cfg.ipfs
    if (!ipfs?.probe?.url) return

    const configured = Number(new URL(ipfs.probe.url).port)
    if (!configured) return

    // Probe the default first, then walk upward. Bound the search so a machine
    // with a truly saturated range fails loudly rather than looping.
    let chosen = 0
    for (let port = configured; port < configured + 50; port++) {
      if (await isPortAvailable(port)) {
        chosen = port
        break
      }
    }
    if (!chosen) {
      this.log.warn(
        `No free port for IPFS in ${configured}..${configured + 49}; leaving it at ${configured} (it will fail to start, but IPFS is optional).`
      )
      return
    }
    if (chosen === configured) return // default was free — nothing to rewrite

    this.log.info(`IPFS port ${configured} is taken; using ${chosen} instead`)
    const from = String(configured)
    const to = String(chosen)

    ipfs.ports = [chosen]
    ipfs.runArgs = (ipfs.runArgs ?? []).map((a) => a.replace(`tcp/${from}`, `tcp/${to}`))
    ipfs.probe.url = ipfs.probe.url.replace(`:${from}`, `:${to}`)

    // The router reaches IPFS via this multiaddr — keep it in lockstep, or the
    // provider file-pinning feature would silently point at the wrong port.
    const env = this.cfg.proxyRouter?.env as Record<string, string> | undefined
    if (env?.IPFS_MULTADDR) {
      env.IPFS_MULTADDR = `/ip4/127.0.0.1/tcp/${to}`
    }
  }

  private async reapOrphanedServices() {
    if (this.orphansReaped) return
    this.orphansReaped = true

    for (const name of ['proxyRouter', 'aiRuntime', 'ipfs'] as const) {
      try {
        await reapOrphan(name, this.log.scope(name))
      } catch (err) {
        // Never let cleanup block startup — a surviving orphan surfaces as a
        // port conflict below, which now says so in plain terms.
        this.log.error(`Failed to reap orphaned ${name}`, err)
      }
    }
  }

  async stopAll() {
    this.log.info('Orchestrator shutting down')

    // Only stop managed processes
    await this.proxyRouterProcess?.stop()
    this.emitStateUpdate()

    await this.aiRuntimeProcess?.stop()
    this.emitStateUpdate()

    await this.ipfsProcess?.stop()
    this.emitStateUpdate()
  }

  public async restartService(service: keyof OrchestratorConfig) {
    const processMap = {
      proxyRouter: this.proxyRouterProcess,
      aiRuntime: this.aiRuntimeProcess,
      ipfs: this.ipfsProcess
    }
    const process: Process | undefined = processMap[service]
    if (!process) {
      this.log.error(`Service ${service} not found`)
      return
    }

    // Only restart managed processes
    if (process.isExternal()) {
      this.log.warn(`Cannot restart external service ${service}`)
      return
    }

    await process.stop()
    this.emitStateUpdate()

    try {
      await process.start()
    } finally {
      this.emitStateUpdate()
    }

    // If the original startAll pipeline aborted before reaching downstream
    // services (e.g. IPFS failed, so containerRuntime + proxyRouter were
    // never started), resume the pipeline now that this service is healthy.
    // startAll is idempotent: downloads check fs.exists, and each process's
    // start() short-circuits when already running.
    if (process.getState() === 'running' && !this.allServicesRunning()) {
      this.log.info(
        `Service ${service} restarted; resuming startup pipeline for any downstream services still pending`
      )
      try {
        await this.startAll()
      } catch (err) {
        this.log.error('Resume after restart failed', err)
        // Don't rethrow — the explicit restart did succeed; downstream
        // failures are surfaced via the per-service state.
      }
    }
  }

  private allServicesRunning(): boolean {
    const all = [
      this.ipfsProcess,
      this.aiRuntimeProcess,
      this.containerRuntimeProcess,
      this.proxyRouterProcess
    ]
    return all.every((p) => p?.getState() === 'running')
  }

  async ping(service: keyof OrchestratorConfig): Promise<boolean> {
    const processMap = {
      proxyRouter: this.proxyRouterProcess,
      aiRuntime: this.aiRuntimeProcess,
      ipfs: this.ipfsProcess,
      containerRuntime: this.containerRuntimeProcess
    }

    const process: Process | undefined = processMap[service]
    if (!process) {
      const error = `Service ${service} not found`
      this.log.error(error)
      throw new Error(error)
    }
    try {
      await process.ping(3000)
      this.emitStateUpdate()
      return true
    } catch (error) {
      this.log.error(`Service ${service} ping failed`, error)
      this.emitStateUpdate()
      return false
    }
  }

  private emitStateUpdate() {
    const orchestratorStatus = this.calculateOrchestratorStatus()
    this.onStateUpdate({
      download: [
        this.proxyDownloadState,
        this.aiRuntimeDownloadState,
        this.aiModelDownloadState,
        this.ipfsDownloadState
      ],
      startup: [
        {
          id: 'ipfs',
          name: 'IPFS',
          status: this.ipfsProcess?.getState() ?? 'pending',
          error: this.ipfsProcess?.getError(),
          stderrOutput: this.ipfsProcess?.getOutput(),
          ports: this.cfg.ipfs.ports,
          isExternal: this.ipfsProcess?.isExternal(),
          probeAttempts: this.ipfsProcess?.getProbeAttempts()
        },
        {
          id: 'aiRuntime',
          name: 'AI Runtime',
          status: this.aiRuntimeProcess?.getState() ?? 'pending',
          error: this.aiRuntimeProcess?.getError(),
          stderrOutput: this.aiRuntimeProcess?.getOutput(),
          ports: this.cfg.aiRuntime.ports,
          isExternal: this.aiRuntimeProcess?.isExternal(),
          probeAttempts: this.aiRuntimeProcess?.getProbeAttempts()
        },
        {
          id: 'containerRuntime',
          name: 'Container Runtime',
          status: this.containerRuntimeProcess?.getState() ?? 'pending',
          error: this.containerRuntimeProcess?.getError(),
          stderrOutput: this.containerRuntimeProcess?.getOutput(),
          isExternal: this.containerRuntimeProcess?.isExternal(),
          probeAttempts: this.containerRuntimeProcess?.getProbeAttempts()
        },
        {
          id: 'proxyRouter',
          name: 'Proxy Router',
          status: this.proxyRouterProcess?.getState() ?? 'pending',
          error: this.proxyRouterProcess?.getError(),
          stderrOutput: this.proxyRouterProcess?.getOutput(),
          ports: this.cfg.proxyRouter.ports,
          isExternal: this.proxyRouterProcess?.isExternal(),
          probeAttempts: this.proxyRouterProcess?.getProbeAttempts()
        }
      ],
      orchestratorStatus
    })
  }

  private calculateOrchestratorStatus(): OrchestratorStatus {
    // Check for any errors in downloads
    const hasDownloadErrors = [
      this.proxyDownloadState,
      this.aiRuntimeDownloadState,
      this.aiModelDownloadState,
      this.ipfsDownloadState
    ].some((item) => item.status === 'error')

    // Check for any errors in startup processes.
    // Container Runtime (Docker) AND IPFS are intentionally EXCLUDED — both are
    // optional. Docker a non-technical user won't have; IPFS is only used by the
    // PROVIDER "host/upload your own model" feature, never by the consumer chat/
    // staking flow (the proxy-router runs healthy without it). IPFS also
    // defaults to a commonly-taken port (5001); making it block the gate meant a
    // port conflict froze the entire app with no error. Its state is still
    // reported to the UI, but an IPFS error must not fail the whole app.
    const hasStartupErrors = [this.aiRuntimeProcess, this.proxyRouterProcess].some((process) =>
      process?.getError()
    )

    if (hasDownloadErrors || hasStartupErrors) {
      return 'error'
    }

    // Check if all downloads are complete
    const allDownloadsComplete = [
      this.proxyDownloadState,
      this.aiRuntimeDownloadState,
      this.aiModelDownloadState,
      this.ipfsDownloadState
    ].every((item) => item.status === 'success')

    // Check if all REQUIRED processes are running. Container Runtime (Docker)
    // and IPFS are optional (see above) and deliberately not part of the
    // readiness gate, so the app reaches 'ready' whether or not they are up.
    const allProcessesRunning = [this.aiRuntimeProcess, this.proxyRouterProcess].every(
      (process) => process?.getState() === 'running'
    )

    if (allDownloadsComplete && allProcessesRunning) {
      return 'ready'
    }

    return 'initializing'
  }

  private async writeEnvFile(path: string, env: Record<string, string>) {
    // ALWAYS overwrite — do NOT skip if it exists. This .env is fully derived
    // from orchestrator.config (contract addresses, ports, and PATHS), with no
    // user data or secrets in it (the router generates its own auth cookie
    // separately). Skipping meant a .env written by an OLDER or containerized
    // build survived forever: a cached .env carrying Docker paths
    // (PROXY_STORAGE_PATH=/app/app/data) made the router report its cookie at
    // /app/app/data/.cookie — a path that doesn't exist on the host. getAuthHeaders
    // then failed with ENOENT and onboarding died at its first authenticated
    // call, leaving a logged-in user with no wallet. Rewriting every launch keeps
    // the file in lockstep with the config (this also fixes stale IPFS_MULTADDR
    // after the dynamic-port change).
    const envString = Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')
    await fs.writeFile(path, envString)
    this.log.info(`Wrote env file: ${path}`)
  }

  private async writeLocalConfigFile(filepath: string, content: string) {
    // check if the file exists
    if (fs.existsSync(filepath)) {
      this.log.info(`Config file already exists: ${filepath}`)
      return
    }

    await fs.writeFile(filepath, content)
    this.log.info(`Created config file: ${filepath}`)
  }

  /**
   * Keep the bundled local model's entry in models-config.json in sync with the
   * app's config, WITHOUT clobbering models the user added themselves.
   *
   * Write-if-absent (as the other config files do) is wrong here: the file
   * outlives the app version, so after the model changed, the chat header went
   * on advertising the old one — the app was serving Qwen while calling itself
   * tiny-llama. But a blind overwrite would delete any remote models the user
   * registered by hand. So we reconcile exactly one entry: the local model,
   * identified by its all-zero modelId.
   */
  private async writeModelsConfigFile(filepath: string, content: string) {
    const generated = JSON.parse(content)
    const localModel = generated.models?.[0]

    if (!localModel || !fs.existsSync(filepath)) {
      await fs.writeFile(filepath, content)
      this.log.info(`Created models config: ${filepath}`)
      return
    }

    try {
      const existing = JSON.parse(await fs.readFile(filepath, 'utf-8'))
      const models: any[] = Array.isArray(existing.models) ? existing.models : []

      const index = models.findIndex((m) => m?.modelId === localModel.modelId)
      const next = [...models]
      if (index >= 0) {
        // Spread the user's entry first so anything they added (concurrentSlots,
        // parameters, ...) survives; our fields win on conflict.
        next[index] = { ...next[index], ...localModel }
      } else {
        next.unshift(localModel)
      }

      const merged = { ...existing, models: next }
      if (JSON.stringify(merged) === JSON.stringify(existing)) {
        this.log.info(`Models config already up to date: ${filepath}`)
        return
      }

      await fs.writeFile(filepath, JSON.stringify(merged))
      this.log.info(`Updated local model entry in models config: ${filepath}`)
    } catch (err) {
      // Unparseable (hand-edited into invalid JSON, truncated write) — a broken
      // config would stop proxy-router from serving any model at all, so reset
      // it to a known-good one rather than leave it wedged.
      this.log.error(`Models config unreadable, rewriting: ${filepath}`, err)
      await fs.writeFile(filepath, content)
    }
  }

  private async resetState() {
    // Only reset processes that aren't already running. This preserves the
    // healthy ones across a resume (e.g. when restartService kicks off a
    // pipeline re-run, we don't want to flap IPFS / AI Runtime).
    this.proxyRouterProcess?.getState() !== 'running' && (await this.proxyRouterProcess?.reset())
    this.aiRuntimeProcess?.getState() !== 'running' && (await this.aiRuntimeProcess?.reset())
    this.ipfsProcess?.getState() !== 'running' && (await this.ipfsProcess?.reset())
    this.containerRuntimeProcess?.getState() !== 'running' &&
      (await this.containerRuntimeProcess?.reset())

    // Preserve `success` download statuses across resume so the UI doesn't
    // flash completed bars back to pending. Clear errors regardless — they
    // belong to the previous attempt.
    for (const dl of [
      this.proxyDownloadState,
      this.aiRuntimeDownloadState,
      this.aiModelDownloadState,
      this.ipfsDownloadState
    ]) {
      dl.error = undefined
      if (dl.status !== 'success') {
        dl.status = 'pending'
      }
    }
  }
}

function resolveAppDataPath(subPath: string) {
  return path.join(app.getPath('userData'), subPath)
}
