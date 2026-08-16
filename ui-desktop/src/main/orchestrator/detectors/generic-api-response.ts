import { LogFunctions } from 'electron-log'
import Axios, { AxiosRequestConfig, AxiosRequestHeaders, InternalAxiosRequestConfig } from 'axios'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'
type Params = {
  url: string
  method?: HttpMethod
  responseRegexp?: string
  timeout?: number
  pollInterval?: number
  log?: LogFunctions
  /**
   * Called once per poll attempt, with the attempt number (1-based).
   *
   * This is the ONLY evidence that a service which has not answered yet is
   * nonetheless making progress. Without it a service that is genuinely coming
   * up is indistinguishable from one that is wedged: both sit at
   * status 'starting' and report nothing, tick after tick.
   */
  onAttempt?: (attempt: number) => void
}

const DEFAULT_TIMEOUT = 10000
const DEFAULT_POLL_INTERVAL = 1000

export class GenericApiResponseDetector {
  private url: string
  private responseRegexp: RegExp | null
  private method: HttpMethod
  private timeout: number
  private pollInterval: number
  private log: LogFunctions | null
  private onAttempt: ((attempt: number) => void) | null
  /** Total poll attempts across every ping() this detector has run. */
  private attempts = 0

  constructor(params: Params) {
    this.url = params.url
    this.method = params.method ?? 'GET'
    this.responseRegexp = params.responseRegexp ? new RegExp(params.responseRegexp) : null
    this.timeout = params.timeout ?? DEFAULT_TIMEOUT
    this.pollInterval = params.pollInterval ?? DEFAULT_POLL_INTERVAL
    this.log = params.log ?? null
    this.onAttempt = params.onAttempt ?? null
  }

  getAttempts(): number {
    return this.attempts
  }

  async ping(timeoutMs?: number, signal?: AbortSignal): Promise<void> {
    const timeout = timeoutMs ?? this.timeout
    const startTime = Date.now()
    const pollInterval = this.pollInterval
    let lastError: string | undefined

    // Abortable so a caller who has stopped caring (the child died, or a newer
    // attempt superseded this one) can cancel the poll loop instead of leaving
    // it to hammer the URL for the rest of its budget and then fire a late
    // stop() — a poller that outlives its reason is how a dead service gets
    // flipped back to 'running' minutes later.
    const aborted = () =>
      signal?.aborted ? new Error('aborted') : undefined

    let attempt = 0

    while (Date.now() - startTime < timeout) {
      const preAbort = aborted()
      if (preAbort) throw preAbort

      // Report BEFORE the request, not after: a request that hangs for its full
      // per-attempt timeout is exactly when the UI most needs to know somebody
      // is still trying.
      attempt++
      this.attempts++
      try {
        this.onAttempt?.(attempt)
      } catch {
        /* a progress listener must never break the probe */
      }

      try {
        const res = await this.request(this.url, this.method)

        if (this.responseRegexp) {
          const isMatch = this.responseRegexp.test(res.data)
          if (!isMatch) {
            throw new Error(`Response body expected ${this.responseRegexp.source}, got ${res.data}`)
          }
        }
        this.log?.info('Service health check passed')
        return
      } catch (error: any) {
        lastError = error?.message
        this.log?.info('Ping attempt failed, retrying...', this.url, error?.message)
      }

      // Wait before next attempt — but wake early if aborted.
      this.log?.info(`waiting ${pollInterval}ms before next attempt`)
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        }, pollInterval)
        const onAbort = () => {
          clearTimeout(t)
          resolve()
        }
        signal?.addEventListener('abort', onAbort, { once: true })
      })

      const postAbort = aborted()
      if (postAbort) throw postAbort
    }

    // Carry the reason for the failure, not just the fact of it — it is the
    // only thing that tells a caller (or a user) whether this was a service
    // that crashed, a port conflict, or an unreachable network.
    this.log?.info('Service health check timed out')
    throw new Error(
      lastError
        ? `Service health check timed out (${this.url}: ${lastError})`
        : `Service health check timed out (${this.url})`
    )
  }

  request(uri: string, method: HttpMethod) {
    return Axios.request({
      url: uri,
      method,
      transformRequest: function (data, headers) {
        return unixNpipeProtocolTransform(this, data, headers)
      },
      transformResponse: (data) => data,
      timeout: this.pollInterval
    })
  }
}

function unixNpipeProtocolTransform(
  config: InternalAxiosRequestConfig,
  data: any,
  _: AxiosRequestHeaders
): AxiosRequestConfig {
  const [proto, pathname] = config.url?.split('://') ?? []
  if (proto === 'unix' || proto === 'npipe') {
    const [socketPath, apiPath] = pathname.split(':')

    config.socketPath = socketPath
    config.baseURL = 'http://localhost'
    config.url = apiPath
  }

  return data
}
