// ============================================================================
// grok integration — the supervisor.
//
// Owns the whole arrangement:
//
//   grok TUI  ──►  ~/.grok/leader.sock   (US, the relay)
//                        │
//                        └──►  ~/.grok/morpheus-agent.sock  (the real agent)
//
// We take the DEFAULT leader socket path and put the real agent on a private
// one. That is what makes plain `grok`, typed in any terminal, run through the
// relay — the alternative was a flag only the app's own launcher passed, so
// `/start` existed in exactly the window the app opened and nowhere else.
//
// WHY THE PICKER IS RENDERED IN THIS APP AND NOT IN THE TUI
// Three attempts at another tool's in-terminal UI failed for the same reason:
// the API was published but absent, or present and then removed. opencode's
// TuiPluginApi is declared and not provided; grok 1.0.0 answers the dialog
// method its own 0.2.x source dispatches with `-32601 Method not found`, after
// updating itself mid-session. The interception seam is stable and does the
// part that must be reliable. The picker is the part that kept breaking, and it
// is the part we can simply own — so `/start` brings this window forward and
// the choosing happens here.
// ============================================================================

import { app, BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { GrokLeaderRelay, type RelayState } from './relay'

/** Where grok's TUI looks by default — so we answer there. */
export const defaultLeaderSocket = (): string => path.join(homedir(), '.grok', 'leader.sock')
/** Where we put the real agent instead. */
export const agentSocket = (): string => path.join(homedir(), '.grok', 'morpheus-agent.sock')

export type GrokStatus = {
  enabled: boolean
  installed: boolean
  grokPath?: string
  agentRunning: boolean
  relay: RelayState
  /** Set when something needs the operator to act, in plain words. */
  problem?: string
}

export type PickerRequest = {
  requestId: number
  sessionId: string
  args: string
}

/** What the renderer sends back once the user has chosen (or not). */
export type PickerOutcome = { opened: boolean; note?: string }

export type SupervisorDeps = {
  grokPath: () => string | undefined
  /** Hands the picker to the renderer and resolves when the user is done. */
  askRenderer: (request: PickerRequest) => Promise<PickerOutcome>
  log?: (message: string) => void
  onStatus?: (status: GrokStatus) => void
}

export class GrokSupervisor {
  private deps: SupervisorDeps
  private agent: ChildProcess | null = null
  private relay: GrokLeaderRelay | null = null
  private enabled = false
  private problem: string | undefined
  private nextRequestId = 1

  constructor(deps: SupervisorDeps) {
    this.deps = deps
  }

  status(): GrokStatus {
    return {
      enabled: this.enabled,
      installed: !!this.deps.grokPath(),
      grokPath: this.deps.grokPath(),
      agentRunning: !!this.agent && this.agent.exitCode === null,
      relay: this.relay?.getState() ?? { status: 'stopped' },
      problem: this.problem
    }
  }

  private publish(): void {
    this.deps.onStatus?.(this.status())
  }

  async start(): Promise<GrokStatus> {
    await this.stop()
    this.problem = undefined

    const grok = this.deps.grokPath()
    if (!grok) {
      this.problem = 'grok is not installed, so /start has nothing to attach to.'
      this.publish()
      return this.status()
    }

    // The real agent, on a socket only we point at.
    //
    // --no-exit-on-disconnect matters: without it the agent exits when its
    // first client leaves, and grok's TUI then quietly spawns an agent of its
    // own on OUR path — a working terminal with no /start and no sign that
    // anything was bypassed.
    const priv = agentSocket()
    if (existsSync(priv)) {
      try {
        unlinkSync(priv)
      } catch {
        /* the spawn will report it */
      }
    }
    // This app's typed env carries non-string values; a child env must be all
    // strings, so pass only what the agent actually needs.
    const childEnv: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === 'string') childEnv[k] = v
    }
    childEnv.GROK_LEADER_SOCKET = priv

    const child: ChildProcess = spawn(grok, ['agent', 'leader', '--no-exit-on-disconnect'], {
      // Cast: this app augments ProcessEnv with non-string values, but a
      // child's environment is strings only — which is what childEnv is.
      env: childEnv as unknown as NodeJS.ProcessEnv,
      stdio: 'ignore'
    })
    this.agent = child
    child.on('exit', (code) => {
      this.deps.log?.(`grok: the agent exited (${code})`)
      // Say so rather than leaving a relay pointed at nothing. A dead agent
      // looks exactly like a broken app from the terminal.
      this.problem = 'The grok agent stopped. Turn the integration off and on again.'
      this.publish()
    })

    // Wait for the agent's socket rather than guessing at a delay.
    const deadline = Date.now() + 20_000
    while (!existsSync(priv) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250))
    }
    if (!existsSync(priv)) {
      this.problem = 'The grok agent did not start. Is `grok` working from a terminal?'
      await this.stop()
      this.publish()
      return this.status()
    }

    this.relay = new GrokLeaderRelay({
      realSocketPath: priv,
      listenSocketPath: defaultLeaderSocket(),
      commands: ['start'],
      log: (m) => this.deps.log?.(m),
      onState: (state) => {
        if (state.status === 'refused') {
          // The one message the operator must actually see: their grok updated
          // and we will not carry a spending path on a build we have not
          // checked.
          this.problem = state.reason
        }
        this.publish()
      },
      onCommand: async ({ args, sessionId }) => {
        const outcome = await this.deps.askRenderer({
          requestId: this.nextRequestId++,
          sessionId,
          args
        })
        this.deps.log?.(
          `grok: /start finished — ${outcome.opened ? 'session opened' : 'nothing opened'}`
        )
      }
    })

    try {
      await this.relay.start()
    } catch (e: any) {
      this.problem = `Could not take over grok's leader socket: ${e?.message ?? e}`
      await this.stop()
      this.publish()
      return this.status()
    }

    this.enabled = true
    this.publish()
    return this.status()
  }

  async stop(): Promise<void> {
    this.enabled = false
    if (this.relay) {
      await this.relay.stop()
      this.relay = null
    }
    if (this.agent) {
      const child = this.agent
      this.agent = null
      child.removeAllListeners('exit')
      try {
        child.kill()
      } catch {
        /* already gone */
      }
    }
    // Leave grok's own socket path free, so a terminal opened after this can
    // still start its own agent normally.
    for (const p of [defaultLeaderSocket(), agentSocket()]) {
      if (existsSync(p)) {
        try {
          unlinkSync(p)
        } catch {
          /* best effort */
        }
      }
    }
    this.publish()
  }
}

/**
 * Bring the app to the front, from a keystroke that happened in a terminal.
 *
 * `/start` is invoked somewhere else entirely, so the window has to come
 * forward on its own or the user is left staring at a terminal that appears to
 * have done nothing. `steal: true` is required on macOS to raise an app the
 * user is not currently in — which is exactly this case.
 */
export function bringAppToFront(): BrowserWindow | null {
  const win = BrowserWindow.getAllWindows()[0] ?? null
  if (!win) return null
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  try {
    app.focus({ steal: true })
  } catch {
    /* not fatal — the window is already shown */
  }
  return win
}
