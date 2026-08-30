export type ProcessState = 'running' | 'stopped' | 'starting' | 'pending'

export interface ProcessInfo {
  state: ProcessState
  error?: string
  output?: string
}

export interface Process {
  start(): Promise<void>
  stop(): Promise<void>
  reset(): Promise<void>
  ping(timeoutMs?: number): Promise<void>
  /** Probe attempts so far — the only signal that moves while status is 'starting'. */
  getProbeAttempts(): number
  getState(): ProcessState
  getError(): string | undefined
  getOutput(): string | undefined
  isExternal(): boolean
}

export interface Pinger {
  ping(timeoutMs?: number, signal?: AbortSignal): Promise<void>
  /** Poll attempts so far — the proof that a not-yet-answering service is alive. */
  getAttempts?(): number
}

export interface StateInfo {
  state: ProcessState
  error?: string
  output?: string
}
