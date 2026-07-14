import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { LogFunctions } from 'electron-log'
import { app } from 'electron'

// Services we spawn are plain child processes: Node does not reap them, so if
// the app crashes (rather than quitting cleanly) they keep running, keep
// holding their ports, and the next launch races them. Recording each spawned
// pid lets a later run kill an orphan *we* started, while never touching a
// process we didn't spawn (a user's own `ipfs daemon`, Docker, ...).

const pidDir = () => path.join(app.getPath('userData'), 'services', '.pids')
const pidFile = (name: string) => path.join(pidDir(), `${name}.pid`)

export function recordPid(name: string, pid: number, command: string): void {
  fs.mkdirSync(pidDir(), { recursive: true })
  fs.writeFileSync(pidFile(name), JSON.stringify({ pid, command }))
}

export function clearPid(name: string): void {
  fs.rmSync(pidFile(name), { force: true })
}

function readPid(name: string): { pid: number; command: string } | null {
  try {
    const { pid, command } = JSON.parse(fs.readFileSync(pidFile(name), 'utf-8'))
    return Number.isInteger(pid) && pid > 0 && typeof command === 'string' ? { pid, command } : null
  } catch {
    return null
  }
}

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0) // signal 0 tests for existence without killing
    return true
  } catch {
    return false
  }
}

// Pids get recycled, so a recorded pid may since have been handed to an
// unrelated process. Confirm the live process is still the binary we spawned
// before signalling it — otherwise a stale pidfile could kill something else.
function isStillOurBinary(pid: number, command: string): boolean {
  const expected = path.basename(command)
  try {
    const running =
      process.platform === 'win32'
        ? execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf-8' })
        : execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf-8' })
    return running.includes(expected)
  } catch {
    return false // process gone, or we can't tell — either way, don't kill it
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Kill a service left running by a previous run of this app. Safe to call when
 * no orphan exists. Returns true if something was actually killed.
 */
export async function reapOrphan(name: string, log?: LogFunctions): Promise<boolean> {
  const record = readPid(name)
  if (!record) return false

  const { pid, command } = record
  if (pid === process.pid || !isAlive(pid) || !isStillOurBinary(pid, command)) {
    clearPid(name)
    return false
  }

  log?.warn(`reaping orphaned ${name} (pid ${pid}) left behind by a previous run`)
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    clearPid(name)
    return false
  }

  for (let i = 0; i < 50 && isAlive(pid); i++) {
    await sleep(100)
  }
  if (isAlive(pid)) {
    log?.warn(`orphaned ${name} (pid ${pid}) ignored SIGTERM, killing`)
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* already gone */
    }
  }

  clearPid(name)
  return true
}
