import { LogFunctions } from 'electron-log'
import { Pinger, Process, ProcessState, StateInfo } from './process'
import { ChildProcess } from 'node:child_process'
import { spawn } from 'child_process'
import net from 'node:net'
import fs from 'node:fs/promises'
import path from 'node:path'
import { clearPid, recordPid } from './service-pids'

export type ManagedProcessParams = {
  name: string
  command: string
  args: string[]
  log: LogFunctions
  redirectProcessOutput?: boolean
  onStateChange?: (stateInfo: StateInfo) => void
  pinger?: Pinger
  ports?: number[]
}

export class ManagedProcess implements Process {
  // 10 lines was not enough to diagnose anything: llama-server prints pages of
  // load progress before it fails, so the ONE line that says why was always
  // pushed out of the buffer before a human saw it.
  private static readonly MAX_OUTPUT_LINES = 400

  private name: string
  private command: string
  private args: string[]
  private state: ProcessState = 'stopped'
  private process?: ChildProcess
  private error?: string
  private output: string[] = []
  private exitReason?: string
  private log: LogFunctions
  private redirectProcessOutput: boolean
  private onStateChange?: (stateInfo: StateInfo) => void
  private ports?: number[]
  private pinger?: Pinger

  // Every start() gets a generation. A probe, a close handler, or a stop() from
  // an OLD attempt must never act on the child owned by a NEWER one.
  //
  // The bug this kills: attempt #1's probe has a long budget (the AI runtime
  // needs minutes to load a 1GB model). Meanwhile the self-heal retry fires
  // after ~2s, starts attempt #2, and the service comes up HEALTHY. Then
  // attempt #1's probe finally times out and runs `await this.stop()` — killing
  // the healthy child that attempt #2 started. Observed: the app comes up, the
  // user starts chatting, and the service dies minutes later for no visible
  // reason.
  private generation = 0
  // Cancels the in-flight probe when this attempt is retired (child died, or a
  // newer start()/stop() superseded it). Without cancellation a lost race
  // leaves the poller running its full budget — up to 5 minutes for the AI
  // runtime — and firing a late verdict on a child that is long gone.
  private probeAbort?: AbortController

  constructor(params: ManagedProcessParams) {
    this.name = params.name
    this.command = path.resolve(params.command)
    this.args = params.args
    this.log = params.log
    this.redirectProcessOutput = params.redirectProcessOutput ?? true
    this.onStateChange = params.onStateChange
    this.pinger = params.pinger
    this.ports = params.ports
  }

  async start(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      if (this.state === 'running') {
        return resolve()
      }

      if (this.state === 'starting') {
        this.log.info('Starting process exists, stopping it before starting again')
        await this.stop().catch((err) => {
          this.log.error('Failed to stop process', err)
          return reject(err)
        })
      }

      const gen = ++this.generation
      const isCurrent = () => this.generation === gen

      try {
        // check if ports are available
        if (this.ports) {
          for (const port of this.ports) {
            const isAvailable = await isPortAvailable(port)
            if (!isAvailable) {
              throw new Error(`Port ${port} is not available`)
            }
          }
        }

        const cwd = path.resolve(path.dirname(this.command))

        this.setState('starting', null)
        this.log.info('process starting')

        try {
          // Check if file exists and is executable
          await fs.access(this.command, fs.constants.X_OK)
        } catch (err) {
          // If not executable, change permissions
          this.log.info(`Setting executable permissions for ${this.command}`)
          await fs.chmod(this.command, 0o755) // rwxr-xr-x
        }

        const child = spawn(this.command, this.args, { stdio: 'pipe', cwd })
        this.process = child
        this.exitReason = undefined

        // Remember the pid on disk so a later run can clean this child up if we
        // crash before we get the chance to stop it ourselves.
        if (child.pid) {
          recordPid(this.name, child.pid, this.command)
        }

        // log the stdout and stderr
        child.stdout.on('data', (data: Buffer) => {
          const outputLine = data.toString('utf-8').trimEnd()
          if (this.redirectProcessOutput) {
            this.log.info('\n\t' + outputLine)
          }
          this.output.push(outputLine)
          if (this.output.length > ManagedProcess.MAX_OUTPUT_LINES) {
            this.output.shift()
          }
        })
        child.stderr.on('data', (data: Buffer) => {
          const errorLine = data.toString('utf-8').trimEnd()

          if (this.redirectProcessOutput) {
            this.log.error('\n\t' + errorLine)
          }
          this.output.push(errorLine)
          if (this.output.length > ManagedProcess.MAX_OUTPUT_LINES) {
            this.output.shift()
          }
        })

        // Resolves/rejects the moment THIS child dies. Racing the probe against
        // it is what stops a crashed service from stalling start() for the
        // probe's full budget (300s for the AI runtime): a dead child is a
        // verdict available immediately, and waiting out the clock for it just
        // freezes the setup wizard on a service that is already gone.
        let onChildDeath: (err: Error) => void = () => {}
        const childDied = new Promise<never>((_, rej) => {
          onChildDeath = rej
        })
        childDied.catch(() => {
          /* may never be awaited if the probe wins — do not warn */
        })

        child.on('close', (code, signal) => {
          // A close from a SUPERSEDED attempt says nothing about the child we
          // now own. Acting on it would report a stale death as the current
          // state.
          if (!isCurrent()) {
            this.log.info(`Ignoring close from superseded attempt #${gen}`)
            return
          }

          // Keep the EXIT STATUS, not just the last words. A signal death
          // (SIGKILL/SIGSEGV/SIGILL) and a clean non-zero exit are completely
          // different diagnoses, and the old message collapsed both into the
          // process's final stdout line — so a crash and a config error read
          // identically from the outside.
          const how = signal ? `killed by signal ${signal}` : `exit code ${code}`
          const errMessage = `Process closed (${how})`
          this.log.info(errMessage)

          // A service that dies on startup almost always says why on its way
          // out (proxy-router, for one, prints `cannot connect to ethereum
          // node: ...` and exits 1). Keep that last word too — but qualified by
          // how it died, never instead of it.
          if (code !== 0 || signal) {
            const lastWords = this.lastOutputLine()
            this.exitReason = lastWords ? `${how}: ${lastWords}` : errMessage
          }
          clearPid(this.name)

          const wasStarting = this.state === 'starting'
          this.setState('stopped', this.exitReason ?? errMessage)

          // Was a single-quoted string: it rejected with the literal text
          // "${code}" and threw the real exit code away. It was also dead code —
          // setState() had already flipped this.state to 'stopped' on the line
          // above, so `this.state === 'starting'` could never be true. Capture
          // the flag BEFORE setState, or the check never fires.
          if (wasStarting) {
            onChildDeath(new Error(this.exitReason ?? errMessage))
          }
        })

        child.on('error', (error) => {
          if (!isCurrent()) return
          this.log.error(error.message)
          this.setState(undefined, error.message)
          onChildDeath(error)
        })

        // Health check, but never outliving the child it is checking. If the
        // child dies first, abort the probe so it stops polling immediately
        // rather than running its full budget and firing a late stop().
        const probe = new AbortController()
        this.probeAbort = probe
        childDied.catch(() => probe.abort())

        await Promise.race([this.ping(undefined, gen, probe.signal), childDied])

        resolve()
      } catch (err) {
        if (isCurrent()) this.setState('stopped', (err as Error)?.message)
        return reject(err)
      }
    })
  }

  async stop(): Promise<void> {
    this.log.info('stopping process started')
    // Retire the current attempt: any probe still in flight for it is now stale
    // and must not act on whatever child comes next. Aborting it makes a
    // stop()-during-start() return promptly instead of the superseded ping
    // waiting out its whole budget.
    this.generation++
    this.probeAbort?.abort()

    if (!this.process || this.state === 'stopped') {
      // The child may have been retired by a superseded close handler that
      // early-returned before clearing its pidfile — clear it here so a
      // gracefully-stopped service never leaks a stale pid to the next launch.
      clearPid(this.name)
      this.log.info('stopping process which already stopped')
      return
    }

    const timeout = 5000

    return new Promise((resolve, reject) => {
      if (!this.process) {
        this.log.info('attempt to stop process which never started')
        return resolve()
      }

      if (this.state === 'stopped') {
        this.log.info('attempt to stop process which already stopped')
        return resolve()
      }

      const timeoutId = setTimeout(() => {
        if (!this.process) {
          this.log.info('attempt to stop process which never started')
          return resolve()
        }
        this.log.warn(`shutdown timed out after ${timeout}ms, killing process`)
        if (!this.process.kill('SIGINT')) {
          const err = new Error(`failed to kill process`)
          this.log.error(err)
          this.setState('stopped', err.message)
          return reject(err)
        }
      }, timeout)

      this.process.once('close', () => {
        clearTimeout(timeoutId)
        clearPid(this.name)
        this.log.info('process stopped')
        this.setState('stopped', 'Process stopped')
        return resolve()
      })

      const res = this.process.kill('SIGTERM')
      if (!res) {
        const err = new Error(`process failed to stop`)
        this.log.error(err.message)
        this.setState('stopped', err.message)
        return reject(err)
      }
    })
  }

  async reset() {
    await this.stop()
    this.setState('pending', null)
  }

  async ping(timeoutArg?: number, gen?: number, signal?: AbortSignal) {
    // A superseded/aborted probe must never touch state, on EITHER branch.
    const superseded = () => gen !== undefined && this.generation !== gen

    if (this.pinger) {
      try {
        await this.pinger.ping(timeoutArg, signal)
      } catch (error) {
        // THE SERVICE-KILLER. If a newer start() has superseded us, the child
        // running right now is not ours — stopping it would kill a service that
        // is very likely healthy. Report and get out of the way.
        if (superseded()) {
          this.log.info(`Probe from superseded attempt #${gen} stood down — not stopping the current process`)
          throw new Error(`superseded`)
        }
        // Two very different failures reach this branch, and telling them apart
        // is the whole diagnosis:
        //   - the process DIED  -> exitReason is set (exit code / signal + its
        //     last words). Believe the process over the probe: it knows it
        //     couldn't reach the chain or that the port was taken; the probe
        //     only knows nobody answered.
        //   - the process is ALIVE and simply hasn't finished starting -> no
        //     exitReason. We are about to kill a healthy service for being
        //     slow, so say so in as many words rather than reporting a bare
        //     "timed out" that reads like a crash.
        const diedOnItsOwn = this.exitReason !== undefined
        const reason = diedOnItsOwn
          ? this.exitReason!
          : `still starting up and did not answer the health probe in time ` +
            `(${(error as Error).message}) — the service was alive and was stopped by this check`

        await this.stop()
        this.setState('stopped', `Health check failed: ${reason}`)
        throw new Error(reason)
      }
    }

    // The probe PASSED — but a probe that has been superseded proves the health
    // of a child we no longer own (e.g. the port answered by the user's own ipfs
    // daemon, or by the next attempt's child). Flipping to 'running' here would
    // report a dead service as ready. Only the current attempt may do so.
    if (superseded()) {
      this.log.info(`Superseded probe #${gen} saw a healthy port — not claiming 'running'`)
      throw new Error('superseded')
    }

    if (this.state !== 'running') {
      this.setState('running')
    }
  }

  /** The most recent non-empty line the child printed — its parting words. */
  private lastOutputLine(): string | undefined {
    return [...this.output]
      .reverse()
      .map((line) => line.trim())
      .find((line) => line.length > 0)
  }

  private setState(newState?: ProcessState, error?: string | null) {
    if (newState !== undefined) {
      this.state = newState
    }
    if (error === null) {
      this.error = undefined
    } else if (error !== undefined) {
      this.error = error
    }

    this.onStateChange?.({ state: this.state, error: this.error, output: this.output.join('\n') })
  }

  getState() {
    return this.state
  }

  getError() {
    return this.error
  }

  getOutput() {
    return this.output.join('\n')
  }

  isExternal(): boolean {
    return false
  }
}

export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.once('error', () => {
      // Port is in use
      resolve(false)
    })

    server.once('listening', () => {
      // Port is available, now close the server
      server.close(() => {
        resolve(true)
      })
    })

    server.listen(port, '127.0.0.1')
  })
}
