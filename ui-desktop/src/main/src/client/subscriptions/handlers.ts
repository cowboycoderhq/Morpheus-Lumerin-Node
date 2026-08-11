import { app, BrowserWindow, dialog } from 'electron'
import restart from '../electron-restart'
import dbManager from '../database'
import storage from '../storage'
import auth from '../auth'
import wallet from '../wallet'
import {
  setProxyRouterConfig,
  getProxyRouterConfig,
  getDefaultCurrencySetting,
  setDefaultCurrencySetting,
  getKey,
  setKey,
  getFailoverSetting,
  setFailoverSetting as setFailoverSettingMain,
  setPasswordHash
} from '../settings'
import config from '../../../config'
import {
  OpenAiCompatServer,
  defaultConfig as defaultOpenAiConfig,
  generateToken,
  type OpenAiApiConfig,
  type ExternalActivity
} from '../../openai-compat/server'
import { claimNewestOffer } from '../../openai-compat/session-offers'
import { isPickerRoute } from '../../openai-compat/protocol'
import { getOpenAiApiSetting, setOpenAiApiSetting } from '../settings'
import {
  buildLaunchScript,
  buildMorpheusConfig,
  detectOpencode,
  installCommand,
  launchInTerminal,
  writeMorpheusConfig,
  writeStartPlugin,
  writeEndpointDescriptor
} from '../../opencode/setup'
import { GrokSupervisor, bringAppToFront } from '../../grok/supervisor'
import {
  buildGrokLaunchScript,
  buildGrokModelsToml,
  managedConfigPath,
  selectGrokModels,
  writeGrokModelsConfig
} from '../../grok/models-config'
import { buildProviderPlugin } from '../../opencode/start-plugin'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import fs from 'node:fs'
import {
  AgentAllowanceRequestsRes,
  AgentTxRes,
  AgentUserRes,
  ChatHistory,
  ChatTitle,
  ResultResponse
} from './api.types'
import { Orchestrator } from '../../../orchestrator/orchestrator'
import log from '../../../logger'
import { Core } from './core.types'
import WalletError from '../../client/WalletError'
import keys from '../keys'
import { cfg } from '../../../../../orchestrator.config'
import { OrchestratorConfig } from '../../../orchestrator/orchestrator.types'

let authentication: Record<string, string> | null = null
let orchestrator: Orchestrator | null = null

export const validatePassword = (data) => auth.isValidPassword(data)

export const clearCache = () => {
  log.verbose('Clearing database cache')
  return dbManager.getDb().dropDatabase().then(restart)
}

export const clearCacheV2 = () => {
  log.verbose('Clearing database cache')
  return dbManager.getDb().dropDatabase()
}

export const persistState = (data) => storage.persistState(data).then(() => true)

export const changePassword = ({ oldPassword, newPassword }) => {
  return validatePassword(oldPassword).then(function (isValid) {
    if (!isValid) {
      return isValid
    }
    return auth.setPassword(newPassword).then(function () {
      const seed = wallet.getSeed(oldPassword)
      wallet.setSeed(seed, newPassword)

      return true
    })
  })
}

export const saveProxyRouterSettings = (data) => Promise.resolve(setProxyRouterConfig(data))

export const getProxyRouterSettings = async () => {
  return getProxyRouterConfig()
}

// The router's live /config (DerivedConfig etc.), fetched from the MAIN
// process: a renderer-side fetch paints every boot-time 500 into the devtools
// console; here a not-ready router just yields the safe default, silently.
export const getProxyRouterDerivedConfig = async () => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/config`
    const response = await fetch(path, { headers: await getAuthHeaders() })
    if (!response.ok) return {}
    return await response.json()
  } catch (e) {
    log.verbose('Router /config not available yet', String(e))
    return {}
  }
}

// Backstop redaction for anything that reaches the error log: never let a
// private key OR a mnemonic land in main.log verbatim. Precise redaction of the
// user's actual secrets happens at the source (onboardingCompleted), but a bad
// import can echo the input back through many layers, so scrub here too.
export const redactSecretsInText = (s: unknown): string =>
  String(s ?? '')
    // 0x-prefixed or bare 32-byte hex private key
    .replace(/\b(0x)?[0-9a-fA-F]{64}\b/g, '[REDACTED_KEY]')
    // A BIP39 mnemonic: 12-24 consecutive short lowercase words separated by
    // whitespace, commas, or quotes — covers plain, newline, comma, and
    // JSON-array forms. Deliberately greedy for a LOG backstop: over-redacting a
    // run of words is fine; leaking a seed is not. (Precise per-value redaction
    // elsewhere is the primary.)
    .replace(/\b([a-z]{3,8}[\s"',]+){11,23}[a-z]{3,8}\b/g, '[REDACTED_MNEMONIC]')
    // A basic-auth cookie (user:token) echoed into a log outside an Authorization
    // header — long token after a colon. Same greedy-backstop tradeoff; URLs and
    // timestamps are safe (the token run is broken by dots / is too short).
    .replace(/\b[\w.-]{2,40}:[A-Za-z0-9+/=_-]{20,}={0,2}\b/g, '[REDACTED_COOKIE]')

export const handleClientSideError = (data) => {
  log.error('client-side error', redactSecretsInText(data.message), redactSecretsInText(data.stack))
}

export const getDefaultCurrency = async () => getDefaultCurrencySetting()
export const setDefaultCurrency = async (curr) => setDefaultCurrencySetting(curr)

export const getCustomEnvs = async () => getKey('customEnvs')
export const setCustomEnvs = async (value) => setKey('customEnvs', value)

export const getProfitSettings = async () =>
  getKey('profitSettings') || {
    deviation: 2,
    target: 10,
    adaptExisting: false
  }
export const setProfitSettings = async (value) => setKey('profitSettings', value)

export const getAutoAdjustPriceData = async () => getKey('autoAdjustPriceData')
export const setAutoAdjustPriceData = async (value) => {
  const oldData = await getAutoAdjustPriceData()
  setKey('autoAdjustPriceData', {
    ...oldData,
    ...value
  })
}

export const getContractHashrate = async (params: { contractId: string; fromDate: Date }) => {
  const { contractId, fromDate } = params
  const collection = await dbManager.getDb().collection('hashrate').findAsync({ id: contractId })
  return collection
    .filter((x) => x.timestamp > fromDate.getTime())
    .sort((a, b) => a.timestamp - b.timestamp)
}

export const isFailoverEnabled = async () => {
  const settings = await getFailoverSetting()
  if (!settings) {
    return { isEnabled: config.isFailoverEnabled }
  }
  return settings
}

export const setFailoverSetting = (params) => setFailoverSettingMain(params)

export const restartWallet = () => restart(1)

export const openSelectFolderDialog = () => {
  return dialog.showOpenDialog({
    properties: ['openDirectory']
  })
}

export const getAuthHeaders = async () => {
  if (authentication) {
    return authentication
  }

  try {
    const path = `${config.chain.localProxyRouterUrl}/auth/cookie/path`
    const response = await fetch(path)
    const body = await response.json()
    let cookieFilePath = body.path

    const isWindows = os.platform() === 'win32'
    cookieFilePath = isWindows ? cookieFilePath.replace(/\//g, '\\') : cookieFilePath

    const cookieFile = fs.readFileSync(cookieFilePath, 'utf8').trim()
    const [username, password] = cookieFile.split(':')
    authentication = {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`, 'utf-8').toString('base64')}`
    }
    return authentication
  } catch (e) {
    console.log('Error', e)
    throw e
  }
}

export const getAllModels = async (): Promise<unknown[]> => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/blockchain/models`
    const response = await fetch(path, {
      headers: await getAuthHeaders(),
      method: 'GET'
    })
    // A non-OK response still parses (error body) — data.models would be
    // undefined, which react-query rejects loudly. Same guard on every
    // fetcher that feeds a query.
    if (!response.ok) return []
    const data = await response.json()
    return data.models ?? []
  } catch (e) {
    console.log('Error', e)
    return []
  }
}

export const getBalances = async (): Promise<unknown[]> => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/blockchain/balance`
    const response = await fetch(path, {
      headers: await getAuthHeaders()
    })
    const data = await response.json()
    return data
  } catch (e) {
    console.log('Error', e)
    return []
  }
}

// The proxy-router holds the signing key and pays gas; the renderer only names
// the recipient and the amount. Contract: proxy-router structs.SendRequest —
//   { to: eth_addr (required), amount: BigInt WEI (required, > 0) }
// returning { tx: "0x..." }.
//
// These MUST throw on failure. They previously did `catch -> return undefined`,
// and SendForm treats "did not throw" as success — so a rejected or failed
// transfer rendered a SUCCESS screen to the user. On a money surface that is the
// worst possible failure mode. A send either yields a tx hash or raises.
const postSend = async (
  route: 'eth' | 'mor',
  payload: { to: string; amount: string }
): Promise<string> => {
  const path = `${config.chain.localProxyRouterUrl}/blockchain/send/${route}`

  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      body: JSON.stringify({ to: payload.to, amount: payload.amount }),
      headers: await getAuthHeaders()
    })
  } catch (e: any) {
    throw new Error(`Could not reach the local node: ${e?.message || e}`)
  }

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    // The router reports failures as { error: "..." } (structs.ErrRes).
    throw new Error(data?.error || `Transfer failed (HTTP ${response.status})`)
  }
  if (!data?.tx) {
    throw new Error('The node accepted the request but returned no transaction hash')
  }
  return data.tx
}

export const sendEth = async (payload: {
  to: string
  amount: string
}): Promise<string> => postSend('eth', payload)

export const sendMor = async (payload: {
  to: string
  amount: string
}): Promise<string> => postSend('mor', payload)

export const getTransactions = async (payload: {
  page: number
  pageSize: number
}): Promise<unknown[]> => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/blockchain/transactions?page=${payload.page}&limit=${payload.pageSize}`
    const response = await fetch(path, {
      headers: await getAuthHeaders()
    })
    // During router boot this endpoint 500s; the error body parsed "fine" and
    // data.transactions came back undefined — which react-query surfaces as
    // "Query data cannot be undefined" on every Dashboard mount.
    if (!response.ok) return []
    const data = await response.json()
    return data.transactions ?? []
  } catch (e) {
    console.log('Error', e)
    return []
  }
}

export const getMorRate = async (payload?: {
  tokenAddress: string
  network: string
}): Promise<number | null> => {
  const tokenAddress = payload?.tokenAddress || '0x7431ada8a591c955a994a21710752ef9b882b8e3'
  const network = payload?.network || 'base'
  try {
    const path = `https://api.geckoterminal.com/api/v2/simple/networks/${network}/token_price/${tokenAddress}`
    const response = await fetch(path)
    const body = await response.json()
    return body.data.attributes.token_prices[tokenAddress]
  } catch (e) {
    console.log('Error', e)
    return null
  }
}

export const getTodaysBudget = async () => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/blockchain/sessions/budget`
    const response = await fetch(path, {
      headers: await getAuthHeaders()
    })
    const body = await response.json()
    return body.budget
  } catch (e) {
    console.log('Error', e)
    return null
  }
}

export const getTokenSupply = async () => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/blockchain/token/supply`
    const response = await fetch(path, {
      headers: await getAuthHeaders()
    })
    const body = await response.json()
    return body.supply
  } catch (e) {
    console.log('Error', e)
    return null
  }
}

export const getChatHistoryTitles = async (): Promise<ChatTitle[] | null> => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/v1/chats`
    const response = await fetch(path, {
      headers: await getAuthHeaders()
    })
    const body = await response.json()
    return body
  } catch (e) {
    console.log('Error', e)
    return null
  }
}

export const getChatHistory = async (chatId: string): Promise<ChatHistory | null> => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/v1/chats/${chatId}`
    const response = await fetch(path, {
      headers: await getAuthHeaders()
    })
    const body = await response.json()
    return body
  } catch (e) {
    console.log('Error', e)
    return null
  }
}

export const deleteChatHistory = async (chatId: string): Promise<boolean> => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/v1/chats/${chatId}`
    const response = await fetch(path, {
      method: 'DELETE',
      headers: await getAuthHeaders()
    })
    const body = await response.json()
    return body.result
  } catch (e) {
    console.log('Error', e)
    return false
  }
}

export const updateChatHistoryTitle = async (params: {
  id: string
  title: string
}): Promise<boolean> => {
  const { id, title } = params
  try {
    const path = `${config.chain.localProxyRouterUrl}/v1/chats/${id}`
    const response = await fetch(path, {
      method: 'POST',
      body: JSON.stringify({ title }),
      headers: await getAuthHeaders()
    })
    const body = await response.json()
    return body.result
  } catch (e) {
    console.log('Error', e)
    return false
  }
}

// Bind a chat to the session serving it. Called when the session is OPENED and
// on every rolling rotation — the stake is spent at open, so the durable record
// cannot wait for the first prompt (a session opened and never typed in was
// otherwise recorded nowhere, and got orphaned or adopted by another chat).
//
// Returns false rather than throwing: the caller treats a failed bind as an
// orphaned session to surface, never as a reason to abandon the open.
export const updateChatSession = async (params: {
  id: string
  sessionId: string
  modelId?: string
}): Promise<boolean> => {
  const { id, sessionId, modelId } = params
  try {
    const path = `${config.chain.localProxyRouterUrl}/v1/chats/${id}/session`
    const response = await fetch(path, {
      method: 'POST',
      body: JSON.stringify({ sessionId, modelId }),
      headers: await getAuthHeaders()
    })
    const body = await response.json()
    return body.result
  } catch (e) {
    console.log('Error', e)
    return false
  }
}

export const checkProviderConnectivity = async (params: {
  address: string
  endpoint: string
}): Promise<boolean> => {
  const { address, endpoint } = params
  try {
    const path = `${config.chain.localProxyRouterUrl}/proxy/provider/ping`
    const response = await fetch(path, {
      method: 'POST',
      body: JSON.stringify({
        providerAddr: address,
        providerUrl: endpoint
      }),
      headers: await getAuthHeaders()
    })

    if (!response.ok) {
      return false
    }

    const body = await response.json()
    return !!body.ping
  } catch (e) {
    console.log('checkProviderConnectivity: Error', e)
    return false
  }
}

export const clearEthNodeEnv = async () => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/config/ethNode`
    const response = await fetch(path, { method: 'DELETE', headers: await getAuthHeaders() })
    const data = await response.json()
    return data.status
  } catch (e) {
    console.log('CLEAR ETH NODE ERROR', e)
    return false
  }
}

export const clearWallet = async () => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/wallet`
    const response = await fetch(path, { method: 'DELETE', headers: await getAuthHeaders() })
    const data = await response.json()
    return data.status
  } catch (e) {
    console.log('CLEAR WALLET ERROR', e)
    return false
  }
}

export const resetWallet = async () => {
  // The LOCAL settings wallet decides onboarding-vs-login routing, so it must
  // be cleared first and synchronously, together with the credentials. The
  // old order ran the network clears first: `clearWallet()` here is the HTTP
  // DELETE to the proxy-router — if the router wasn't up yet it failed
  // silently and the local wallet survived, leaving a bricked half-state
  // (wallet present + no password hash = a login screen no password can pass).
  wallet.clearWallet()
  setPasswordHash('')
  // Best-effort deep cleans — each may fail without leaving a half-account.
  try {
    await clearWallet()
  } catch (e) {
    log.error('Router wallet clear failed during reset', e)
  }
  try {
    await clearEthNodeEnv()
  } catch (e) {
    log.error('Eth node env clear failed during reset', e)
  }
  try {
    await clearCacheV2()
  } catch (e) {
    log.error('Cache clear failed during reset', e)
  }
  if (app.isPackaged) {
    app.relaunch()
    app.quit()
  } else {
    // In electron-vite dev, app.relaunch() reloads the packaged renderer path
    // (which dev serves from memory, not disk) and shows a blank screen. The
    // wallet is already cleared above, so reload the window instead — it
    // re-initialises straight to onboarding. Production keeps the full relaunch.
    BrowserWindow.getAllWindows()[0]?.webContents.reload()
  }
}

export const getAgentUsers = async (): Promise<AgentUserRes | null> => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/auth/users`
    const response = await fetch(path, { method: 'GET', headers: await getAuthHeaders() })
    return await response.json()
  } catch (e) {
    console.log('Error', e)
    return null
  }
}

export const confirmDeclineAgentUser = async (params: {
  username: string
  confirm: boolean
}): Promise<boolean> => {
  const { username, confirm } = params
  try {
    const path = `${config.chain.localProxyRouterUrl}/auth/users/confirm`

    const res = await fetch(path, {
      method: 'POST',
      body: JSON.stringify({ username, confirm }),
      headers: await getAuthHeaders()
    })
    await res.json()
    return true
  } catch (e) {
    console.log('Error', e)
    return false
  }
}

export const removeAgentUser = async (params: { username: string }): Promise<boolean> => {
  const { username } = params
  try {
    const path = `${config.chain.localProxyRouterUrl}/auth/users`
    await fetch(path, {
      method: 'DELETE',
      body: JSON.stringify({ username }),
      headers: await getAuthHeaders()
    })
    return true
  } catch (e) {
    console.log('Error', e)
    return false
  }
}

export const getAgentTxs = async (params: {
  username: string
  cursor: string
  limit: number
}): Promise<AgentTxRes | null> => {
  try {
    const query = new URLSearchParams()
    query.set('cursor', params.cursor)
    query.set('limit', params.limit.toString())

    const path = `${config.chain.localProxyRouterUrl}/auth/users/${encodeURIComponent(params.username)}/txs?${query.toString()}`
    const response = await fetch(path, {
      headers: await getAuthHeaders()
    })
    if (response.ok) {
      return await response.json()
    }
    throw new Error(await response.text())
  } catch (e) {
    console.log('Error', e)
    return null
  }
}

export const revokeAgentAllowance = async (params: {
  username: string
  token: string
}): Promise<boolean> => {
  const { username, token } = params
  try {
    const path = `${config.chain.localProxyRouterUrl}/auth/allowance/revoke`
    await fetch(path, {
      method: 'POST',
      body: JSON.stringify({ username, token }),
      headers: await getAuthHeaders()
    })
    return true
  } catch (e) {
    console.log('Error', e)
    return false
  }
}

export const getAgentAllowanceRequests = async (): Promise<AgentAllowanceRequestsRes | null> => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/auth/allowance/requests`
    const response = await fetch(path, { headers: await getAuthHeaders() })
    const data = await response.json()
    return data
  } catch (e) {
    console.log('Error', e)
    return null
  }
}

export const confirmDeclineAgentAllowanceRequest = async (params: {
  username: string
  token: string
  confirm: boolean
}): Promise<boolean> => {
  const { username, token, confirm } = params
  try {
    const path = `${config.chain.localProxyRouterUrl}/auth/allowance/confirm`
    await fetch(path, {
      method: 'POST',
      body: JSON.stringify({ username, token, confirm }),
      headers: await getAuthHeaders()
    })
    return true
  } catch (e) {
    console.log('Error', e)
    return false
  }
}

export const getIpfsVersion = async (): Promise<{ version: string } | null> => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/ipfs/version`
    const response = await fetch(path, { headers: await getAuthHeaders() })
    const body = await response.json()
    return body
  } catch (e) {
    console.log('Error', e)
    return null
  }
}

export const getIpfsFile = async ({
  cidHash,
  destinationPath
}: {
  cidHash: string
  destinationPath: string
}): Promise<ResultResponse | null> => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/ipfs/download/${cidHash}?dest=${encodeURIComponent(destinationPath)}`
    const response = await fetch(path, {
      headers: await getAuthHeaders(),
      method: 'GET'
    })
    const body = await response.json()
    return body
  } catch (e) {
    console.log('Error', e)
    return null
  }
}

export const pinIpfsFile = async ({ cidHash }: { cidHash: string }): Promise<ResultResponse | null> => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/ipfs/pin`
    const response = await fetch(path, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ cidHash })
    })
    const body = await response.json()
    return body
  } catch (e) {
    console.log('Error', e)
    return null
  }
}

export const unpinIpfsFile = async ({ cidHash }: { cidHash: string }): Promise<ResultResponse | null> => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/ipfs/unpin`
    const response = await fetch(path, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ cidHash })
    })
    const body = await response.json()
    return body
  } catch (e) {
    console.log('Error', e)
    return null
  }
}

export const addFileToIpfs = async ({
  filePath
}: {
  filePath: string
}): Promise<{
  fileCID: string
  metadataCID: string
  fileCIDHash: string
  metadataCIDHash: string
} | null> => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/ipfs/add`
    const response = await fetch(path, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ filePath }),
      signal: AbortSignal.timeout(10 * 60 * 1000)
    })
    const body = await response.json()
    return body
  } catch (e) {
    console.log('Error', e)
    return null
  }
}

export const getIpfsPinnedFiles = async (): Promise<
  {
    fileName: string
    fileSize: number
    fileCID: string
    fileCIDHash: string
    tags: string[]
    id: string
    modelName: string
    metadataCID: string
    metadataCIDHash: string
  }[] | null
> => {
  try {
    const path = `${config.chain.localProxyRouterUrl}/ipfs/pin`
    const response = await fetch(path, { headers: await getAuthHeaders() })
    const body = await response.json()
    return body
  } catch (e) {
    console.log('Error', e)
    return null
  }
}

const getOrchestrator = (core: Core): Orchestrator => {
  if (!orchestrator) {
    orchestrator = new Orchestrator(
      cfg,
      (state) => {
        core.emitter.emit('services-state', state)
      },
      log
    )
  }
  return orchestrator
}

export const startServices = async (_, core: Core) => {
  await getOrchestrator(core).startAll()
}

export const restartService = async (data: { service: keyof OrchestratorConfig }, core: Core) => {
  await getOrchestrator(core).restartService(data.service)
}

export const pingService = async (data: { service: keyof OrchestratorConfig }, core: Core) => {
  return await getOrchestrator(core).ping(data.service)
}

export const onboardingCompleted = async (data, core: Core) => {
  try {
    const { proxyUrl } = data

    if (data.ethNode) {
      const ethNodeResult = await fetch(`${proxyUrl}/config/ethNode`, {
        method: 'POST',
        body: JSON.stringify({ urls: [data.ethNode] }),
        headers: await getAuthHeaders()
      })

      const dataResponse = await ethNodeResult.json()
      if (dataResponse.error) {
        return dataResponse.error
      }
    }

    await auth.setPassword(data.password)

    if (data.mnemonic) {
      const mnemonicRes = await fetch(`${proxyUrl}/wallet/mnemonic`, {
        method: 'POST',
        body: JSON.stringify({
          mnemonic: data.mnemonic,
          derivationPath: String(data.derivationPath || 0)
        }),
        headers: await getAuthHeaders()
      })
      if (!mnemonicRes.ok) {
        throw new Error(await mnemonicRes.text())
      }

      console.log('Set Mnemonic To Wallet', await mnemonicRes.json())
    } else {
      const pKeyResp = await fetch(`${proxyUrl}/wallet/privateKey`, {
        method: 'POST',
        body: JSON.stringify({ privateKey: String(data.privateKey) }),
        headers: await getAuthHeaders()
      })
      if (!pKeyResp.ok) {
        throw new Error(await pKeyResp.text())
      }
      console.log('Set Private Key To Wallet', await pKeyResp.json())
    }

    const walletAddress = await fetch(`${proxyUrl}/wallet`, {
      method: 'GET',
      headers: await getAuthHeaders()
    })
      .then((res) => res.json())
      .then((res) => res.address)

    console.log('Wallet Address Is', walletAddress)

    wallet.setSeed(walletAddress, data.password)
    wallet.setAddress(walletAddress)
    core.emitter.emit('create-wallet', { address: walletAddress })
    openWallet(data.password, core)
  } catch (err) {
    // NEVER let the seed/private key reach a log or the propagated error. A bad
    // import makes the router echo its input back in the error body ("invalid
    // hex string: <the mnemonic>"), which otherwise lands in main.log verbatim
    // and in the "Copy diagnostics" clipboard. Redact the exact secrets the user
    // entered — precise, no false positives.
    const secrets = [data.mnemonic, data.privateKey, data.password].filter(
      (v): v is string => typeof v === 'string' && v.length > 0
    )
    const redact = (s: unknown): string =>
      secrets.reduce((acc, sec) => acc.split(sec).join('[REDACTED]'), String(s ?? ''))

    const safe = new Error(redact((err as Error)?.message))
    safe.stack = redact((err as Error)?.stack)
    log.error('Onboarding failed', safe.message)
    return { error: new WalletError('Onboarding unable to be completed: ', safe) }
  }
}

export const onLoginSubmit = ({ password }, core: Core) => {
  var checkPassword = config.chain.bypassAuth
    ? new Promise((r) => r(true))
    : auth.isValidPassword(password)

  return checkPassword
    .then(function (isValid) {
      if (!isValid) {
        return { error: new WalletError('Invalid password') }
      }
      openWallet(password, core)

      return isValid
    })
    .catch((err) => log.error('onLoginSubmit err', err))
}

export async function openWallet(password: string, { emitter }: Core) {
  const storedAddress = wallet.getAddress()
  if (!storedAddress) {
    return
  }

  const { address } = storedAddress as { address?: string }

  emitter.emit('open-wallet', { address, isActive: true })
  emitter.emit('open-proxy-router', { password })

  // Fire-and-forget: repair the router's signing wallet if it's missing.
  healRouterWallet(address).catch((e) => log.error('Router wallet heal failed', e))
}

// Self-heal for "wallet not set": the proxy-router keeps its signing key in
// the OS keychain under a FIXED service name (morpheus-proxy-router) — global
// machine state. Anything that deletes or overwrites it (another instance of
// the router on the same machine, a reset that outlived onboarding) leaves
// the router unable to sign: /blockchain/balance 500s and sessions can't
// open, with no recovery path short of a full account reset. On every login,
// check the router's wallet and re-provision it from the app's own Keychain
// mnemonic backup (written by createSimpleAccount). Accounts without that
// backup (classic crypto onboarding never persists the phrase) can't be
// auto-healed — log loudly so the gap is visible.
async function healRouterWallet(localAddress?: string) {
  const proxyUrl = config.chain.localProxyRouterUrl
  const APP_KEYCHAIN_SERVICE = 'org.morpheus.simple-account'
  // Login can beat the router's boot — poll with patience, then give up loudly.
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const res = await fetch(`${proxyUrl}/wallet`, { headers: await getAuthHeaders() })
      if (res.ok) {
        const { address } = await res.json().catch(() => ({}) as any)
        if (
          address &&
          localAddress &&
          String(address).toLowerCase() !== String(localAddress).toLowerCase()
        ) {
          log.error(`Router wallet ${address} != local ${localAddress}; re-provisioning`)
        } else {
          return // healthy
        }
      } else {
        const body = await res.json().catch(() => ({}) as any)
        if (!String(body?.error || '').includes('wallet not set')) {
          // Some other transient error — let the router settle and retry.
          await new Promise((r) => setTimeout(r, 3000))
          continue
        }
      }

      // Router is reachable and has no (or the wrong) wallet — re-provision.
      const username = getKey('user.username')
      const keytarModule = (await import('keytar')).default
      const mnemonic = username
        ? await keytarModule
            .getPassword(APP_KEYCHAIN_SERVICE, String(username))
            .catch(() => null)
        : null
      if (!mnemonic) {
        log.error(
          'Router wallet is not set and no Keychain mnemonic backup exists — ' +
            'cannot self-heal. The user must reset or re-import their phrase.'
        )
        return
      }
      const prov = await fetch(`${proxyUrl}/wallet/mnemonic`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ mnemonic, derivationPath: '0' })
      })
      if (!prov.ok) {
        log.error('Router wallet re-provision failed', await prov.text())
        return
      }
      const check = await fetch(`${proxyUrl}/wallet`, {
        headers: await getAuthHeaders()
      })
        .then((r) => r.json())
        .catch(() => ({}) as any)
      log.info(`Router wallet self-healed: ${check?.address}`)
      return
    } catch {
      // Router not reachable yet.
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  log.error('Router never became reachable during the wallet-heal window')
}

export const suggestAddresses = async (mnemonic: string) => {
  const seed = keys.mnemonicToSeedHex(mnemonic)
  let results: any[] = []
  for (let i = 0; i < 10; i++) {
    const walletAddress = wallet.createAddress(seed, i)
    results.push(walletAddress)
  }
  return results
}

export const quitApp = async () => {
  app.quit()
}


// ---- OpenAI-compatible local endpoint ---------------------------------------
//
// One server instance for the app's lifetime; `sync()` starts, stops or rebinds
// it to match the stored config. Disabled by default, and even when enabled it
// cannot open a paid session unless `allowAutoOpen` is explicitly turned on —
// so by default nothing reaching this port can cause a chain transaction.

let openAiServer: OpenAiCompatServer | null = null
// Most recent external use, surfaced in the UI. Deliberately not a log of
// prompts — only that something used a model, and when.
let lastExternalActivity: ExternalActivity | null = null

const readOpenAiConfig = (): OpenAiApiConfig => {
  const stored = getOpenAiApiSetting()
  const base = defaultOpenAiConfig()
  if (!stored || typeof stored !== 'object') {
    // First read also PERSISTS the generated token, so the value shown in
    // Settings is stable rather than changing on every launch.
    setOpenAiApiSetting(base)
    return base
  }
  const merged: OpenAiApiConfig = {
    enabled: Boolean(stored.enabled),
    port: Number(stored.port) || base.port,
    token: typeof stored.token === 'string' && stored.token ? stored.token : base.token,
    allowAutoOpen: Boolean(stored.allowAutoOpen),
    maxStakeMor: Number.isFinite(Number(stored.maxStakeMor))
      ? Number(stored.maxStakeMor)
      : base.maxStakeMor,
    // Fall back to the DEFAULT, never to "unbounded", when a stored config
    // predates these caps or carries junk. A cap that silently becomes
    // infinite on a malformed read is worse than having no cap, because the
    // UI still shows one.
    maxDailyStakeMor: Number.isFinite(Number(stored.maxDailyStakeMor))
      ? Number(stored.maxDailyStakeMor)
      : base.maxDailyStakeMor,
    maxDailySessions: Number.isFinite(Number(stored.maxDailySessions))
      ? Number(stored.maxDailySessions)
      : base.maxDailySessions,
    // Anything that is not a non-empty string is dropped rather than kept: these
    // ids are written into a terminal agent's config file, and a null or an
    // object there breaks the whole file, not just its own entry.
    starredModelIds: Array.isArray(stored.starredModelIds)
      ? stored.starredModelIds.filter(
          (id: unknown): id is string => typeof id === 'string' && id.length > 0
        )
      : base.starredModelIds,
    offerSessionOnUse: Boolean(stored.offerSessionOnUse)
  }
  if (merged.token !== stored.token) {
    setOpenAiApiSetting(merged)
  }
  return merged
}

const ensureOpenAiServer = (): OpenAiCompatServer => {
  if (!openAiServer) {
    // Publishing Morpheus models into grok's picker follows the ENDPOINT, not
    // the Settings screen. Hanging it off getGrokStatus meant the models only
    // appeared once someone opened Settings — so a user who just wanted to pick
    // a model in their terminal found nothing there.
    setImmediate(() => startGrokModelsRefresh())
    openAiServer = new OpenAiCompatServer({
      routerUrl: () => config.chain.localProxyRouterUrl,
      authHeaders: getAuthHeaders,
      walletAddress: () => {
        const stored = wallet.getAddress() as { address?: string } | undefined
        return stored?.address
      },
      config: readOpenAiConfig,
      onActivity: (activity) => {
        lastExternalActivity = activity
      },
      onSessionSeen: (modelId) => {
        const cfg = readOpenAiConfig()
        if (cfg.starredModelIds?.includes(modelId)) return
        // Written straight to the store rather than through setOpenAiApiConfig:
        // this fires from inside a model-list rebuild, and that path restarts
        // the server on change.
        setOpenAiApiSetting({
          ...cfg,
          starredModelIds: [...(cfg.starredModelIds ?? []), modelId]
        })
        log.info(`openai-compat: ${modelId} starred — it had an open session`)
      },
      // A terminal asked for a starred model with no session. The request has
      // already been refused; this only offers to open one. The picker is the
      // same one the relay used, so there is a single place where a session is
      // chosen and a single place where the spend is confirmed.
      onSessionRequired: (model) => {
        const win = bringAppToFront()
        if (!win) {
          // Settle rather than leave it in flight: with no window there is
          // nothing to answer the offer, and an unanswered one would block
          // every later offer for this model until it expired.
          ensureOpenAiServer().settleOffer(model.id, 'declined')
          log.info(`openai-compat: no window to offer a session for ${model.advertised}`)
          return
        }
        const requestId = nextOfferRequestId++
        offerModelByRequestId.set(requestId, {
          modelId: model.id,
          advertised: model.advertised,
          at: Date.now()
        })
        // Sent AND remembered. The picker host lives inside the signed-in
        // layout, so when the app is locked this event lands nowhere — the
        // window comes forward showing the wallet screen and the offer is lost,
        // while the gate goes on believing one is in flight. Remembering it lets
        // the host claim it the moment it mounts, which is what unlocking does.
        win.webContents.send('grok-picker-request', {
          requestId,
          args: model.advertised
        })
      },
      log: (message) => log.info(message)
    })
  }
  return openAiServer
}

export const getOpenAiApiConfig = async () => ({
  ...readOpenAiConfig(),
  running: ensureOpenAiServer().isRunning(),
  lastActivity: lastExternalActivity
})

export const setOpenAiApiConfig = async (next: Partial<OpenAiApiConfig>) => {
  const current = readOpenAiConfig()
  const merged: OpenAiApiConfig = {
    ...current,
    ...next,
    // The token is replaced only through regenerateOpenAiApiToken, never by a
    // config write — so a UI round-trip cannot blank it by omission.
    token: current.token
  }
  setOpenAiApiSetting(merged)
  try {
    await ensureOpenAiServer().sync()
  } catch (e) {
    log.error('openai-compat: could not apply config', e)
    return { ...merged, running: false, error: String(e) }
  }
  return { ...merged, running: ensureOpenAiServer().isRunning() }
}

export const regenerateOpenAiApiToken = async () => {
  const current = readOpenAiConfig()
  const merged = { ...current, token: generateToken() }
  setOpenAiApiSetting(merged)
  await ensureOpenAiServer().sync()
  return { ...merged, running: ensureOpenAiServer().isRunning() }
}

// Called once at startup so an endpoint left enabled comes back up with the app.
export const startOpenAiApiIfEnabled = async () => {
  try {
    await ensureOpenAiServer().sync()
  } catch (e) {
    log.error('openai-compat: startup failed', e)
  }
}


// ---- opencode handoff --------------------------------------------------------
//
// Hands a live session to `opencode`. The app publishes its OWN opencode config
// and points OPENCODE_CONFIG at it, so the user's ~/.config/opencode/opencode.jsonc
// is never read or rewritten — see ../../opencode/setup.ts for why that matters.

const opencodeDir = () => path.join(app.getPath('userData'), 'opencode')
const opencodeConfigPath = () => path.join(opencodeDir(), 'morpheus.json')
const endpointDescriptorPath = () => path.join(opencodeDir(), 'endpoint.json')
// opencode auto-loads every file here at startup, for EVERY session — which is
// what makes /start exist in a terminal the user opened themselves. Writing
// into this directory adds files; it never reads or rewrites the user's
// opencode.jsonc.
const globalPluginDir = () => path.join(os.homedir(), '.config', 'opencode', 'plugins')

/**
 * Install both generated plugins globally, plus the descriptor they read.
 *
 * Idempotent and cheap, so it runs on every status check rather than only at
 * install time: a rotated token or a changed port must not leave a stale copy
 * behind, and there is no install hook to hang this off.
 */
const provisionOpencodePlugins = async (api: OpenAiApiConfig) => {
  const descriptor = endpointDescriptorPath()
  writeEndpointDescriptor(descriptor, {
    baseUrl: `http://127.0.0.1:${api.port}`,
    apiKey: api.token,
    models: await ensureOpenAiServer()
      .advertisedModels()
      .catch(() => [])
  })
  const dir = globalPluginDir()
  writeStartPlugin(path.join(dir, 'morpheus-provider.js'), buildProviderPlugin(descriptor))

  // The /start plugin is NOT installed.
  //
  // It is written against `TuiPluginApi` (api.ui.dialog, api.command.register),
  // which @opencode-ai/plugin declares but the opencode 1.18.10 RUNTIME does
  // not provide: a directory-loaded plugin's `tui` export is called with
  // `PluginInput` instead — {client, project, worktree, directory,
  // experimental_workspace, serverUrl, $} and nothing else. Probed directly
  // against the installed binary on 2026-08-08. Loading it therefore threw
  // "undefined is not an object (evaluating 'api.ui.dialog')" at startup, which
  // opencode logs and then skips the plugin, so /start never appeared.
  //
  // Removing any copy a previous build installed, so opencode stops erroring on
  // every launch while the command is rebuilt against the API that exists
  // (Hooks.config can inject a slash command — verified — plus Hooks.tool and
  // the permission.ask gate).
  for (const stale of [
    path.join(dir, 'morpheus-start.js'),
    path.join(opencodeDir(), 'morpheus-start.js')
  ]) {
    try {
      fs.rmSync(stale, { force: true })
    } catch {
      /* best effort */
    }
  }
  return { descriptor, dir }
}

// ---- grok integration -------------------------------------------------------
// `/start` is typed in a terminal, so the picker cannot live there: three
// attempts at another tool's in-terminal UI failed on APIs that were published
// but absent, or present and then removed by a self-installed update. The relay
// takes the command off the wire — that part is stable — and the choosing
// happens in this window, which we own. See ../../grok/supervisor.ts.

let grokSupervisor: GrokSupervisor | null = null
const grokPicker = new Map<number, (outcome: { opened: boolean; note?: string }) => void>()

/**
 * Picker requests raised by the ENDPOINT rather than by the relay.
 *
 * Both render the same modal, so both travel on one channel and are told apart
 * by request id. The offer ids start far above anything the relay's own counter
 * reaches, because two live sources numbering from zero would eventually answer
 * each other's dialogs.
 */
const offerModelByRequestId = new Map<
  number,
  { modelId: string; advertised: string; at: number }
>()
let nextOfferRequestId = 1_000_000_000

const ensureGrokSupervisor = (): GrokSupervisor => {
  if (!grokSupervisor) {
    grokSupervisor = new GrokSupervisor({
      grokPath: () => {
        // A GUI app does not inherit the user's shell PATH, so probe where
        // grok's own installer puts it.
        for (const p of [
          path.join(os.homedir(), '.grok', 'bin', 'grok'),
          '/opt/homebrew/bin/grok',
          '/usr/local/bin/grok'
        ]) {
          if (fs.existsSync(p)) return p
        }
        return undefined
      },
      log: (m) => log.info(m),
      onStatus: (status) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('grok-status', status)
      },
      askRenderer: (request) =>
        new Promise((resolve) => {
          const win = bringAppToFront()
          if (!win) {
            // Resolve rather than hang: the terminal is holding a turn open on
            // a dialog that can never appear.
            resolve({ opened: false, note: 'the app window is not available' })
            return
          }
          let settled = false
          const done = (outcome: { opened: boolean; note?: string }) => {
            if (settled) return
            settled = true
            grokPicker.delete(request.requestId)
            resolve(outcome)
          }
          grokPicker.set(request.requestId, done)
          // A renderer that never answers must not wedge the turn forever.
          const timer = setTimeout(() => done({ opened: false, note: 'timed out' }), 10 * 60_000)
          timer.unref?.()
          win.webContents.send('grok-picker-request', request)
        })
    })
  }
  return grokSupervisor
}

/**
 * Publish the models grok can currently reach, into its managed config.
 *
 * Cheap and idempotent, so it runs on a timer rather than trying to observe
 * every place a session can open or close (the Chat tab, the keep-alive loop,
 * and the endpoint itself all can). A stale list is the failure that matters:
 * a model in the picker whose session has expired fails inside grok, where the
 * user has no way to see why.
 */
export const refreshGrokModels = async () => {
  const api = readOpenAiConfig()
  if (!api.enabled || !ensureOpenAiServer().isRunning()) {
    // Endpoint off: publish an EMPTY list rather than leaving the last one
    // behind, so the picker never offers a model that cannot answer.
    writeGrokModelsConfig(
      managedConfigPath(),
      buildGrokModelsToml({ baseUrl: '', apiKey: '', models: [] })
    )
    return { models: 0 }
  }
  const advertised = await ensureOpenAiServer()
    // Forced: this runs right after a session opens, and a cached list would
    // not contain it.
    .advertisedModels(true)
    .catch(() => [] as { id: string; label: string; isLocal: boolean }[])

  // Drops local models — the one decision this makes, kept in a tested function
  // rather than here, where nothing could check it. What is stable across
  // restarts now comes from the starred set the endpoint advertises, not from a
  // second list remembered on the side.
  const models = selectGrokModels(advertised)

  writeGrokModelsConfig(
    managedConfigPath(),
    buildGrokModelsToml({
      baseUrl: `http://127.0.0.1:${api.port}/v1`,
      apiKey: api.token,
      models
    })
  )
  return { models: models.length }
}

let grokModelsTimer: NodeJS.Timeout | null = null
const startGrokModelsRefresh = (): void => {
  if (grokModelsTimer) return
  const tick = () => {
    refreshGrokModels().catch((e) => log.warn(`grok models: ${String(e)}`))
  }
  tick()
  grokModelsTimer = setInterval(tick, 60_000)
  grokModelsTimer.unref?.()
}

/**
 * Open a terminal running grok on this model.
 *
 * Publishes the model FIRST and waits for it: grok reads its config at startup,
 * so launching before the file is written gives a terminal whose picker does
 * not contain the model the user just paid for — which is precisely the bug
 * they reported.
 */
export const openInGrok = async ({ modelId, cwd }: { modelId: string; cwd?: string }) => {
  const grok = ensureGrokSupervisor().status()
  if (!grok.installed || !grok.grokPath) {
    return {
      ok: false,
      reason: 'not_installed',
      message: 'grok is not installed. Install it from x.ai and try again.'
    }
  }
  const api = readOpenAiConfig()
  if (!api.enabled || !ensureOpenAiServer().isRunning()) {
    return {
      ok: false,
      reason: 'endpoint_off',
      message:
        'Turn on the OpenAI-compatible API in Settings first — grok connects to it, not to the app directly.'
    }
  }

  // Callers here hold the hex32 CHAIN id; the config is keyed off the id the
  // endpoint ADVERTISES (a name). Passing the chain id straight through built a
  // key that is in no model map, and grok answered "unknown model id" — the
  // same hex-vs-name mismatch that broke the opencode handoff. Resolve through
  // the endpoint, which is the one definition of "which model is this".
  const { advertised } = await ensureOpenAiServer().resolveForHandoff(modelId)
  if (!advertised) {
    return {
      ok: false,
      reason: 'model_unavailable',
      message: `The endpoint is not currently serving "${modelId}". Is the session still open?`
    }
  }

  // Write the config BEFORE launching, forced, so the new session is in it.
  await refreshGrokModels().catch((e) => log.warn(`grok models: ${String(e)}`))

  const workdir = cwd || (getOpenAiApiSetting()?.opencodeCwd as string) || app.getPath('home')
  try {
    const script = buildGrokLaunchScript({
      grokPath: grok.grokPath,
      // The ADVERTISED id, so grokModelKey produces the key the config declares.
      modelId: advertised,
      cwd: workdir
    })
    await launchInTerminal(path.join(opencodeDir(), 'open-morpheus-grok.command'), script)
    return { ok: true, modelId: advertised, cwd: workdir }
  } catch (e) {
    return { ok: false, reason: 'unsafe_input', message: String(e) }
  }
}

export const getGrokStatus = async () => {
  startGrokModelsRefresh()
  return ensureGrokSupervisor().status()
}

export const setGrokEnabled = async (enabled: boolean) => {
  const sup = ensureGrokSupervisor()
  if (enabled) return sup.start()
  await sup.stop()
  return sup.status()
}

/** The renderer reporting what the user chose. */
/**
 * An offer raised while the picker could not be shown.
 *
 * The host asks for this when it mounts, which is the moment the app becomes
 * capable of showing it — including straight after the user unlocks. Offers
 * older than the gate's own window are dropped rather than surfaced: a dialog
 * asking you to spend on a request you made twenty minutes ago is worse than
 * nothing, and the gate has already stopped treating it as in flight.
 */
export const getPendingSessionOffer = async () => {
  const { claim, expired } = claimNewestOffer(offerModelByRequestId.entries(), Date.now())
  for (const dead of expired) {
    offerModelByRequestId.delete(dead.requestId)
    // Settle it, or the gate keeps this model marked in flight and the user is
    // never offered it again.
    ensureOpenAiServer().settleOffer(dead.modelId, 'declined')
  }
  return claim
}

/**
 * The picker's calls to our own endpoint, made from MAIN.
 *
 * The renderer cannot call it directly, and should not be able to: the endpoint
 * refuses any request carrying an `Origin` header and sends no CORS headers,
 * because a web page must never be able to reach a port that can spend MOR. A
 * renderer IS a browser, so its fetch was blocked before it could even read the
 * refusal — the picker showed "Failed to fetch" with nothing to explain it.
 *
 * Relaying through main fixes it without weakening anything: node's fetch sends
 * no Origin, the browser rule stays exactly as strict for actual pages, and the
 * bearer token stops being handed to the renderer at all.
 *
 * The allowlist is the point — this must stay a door to four known routes, not
 * a general-purpose proxy that a renderer bug could point anywhere.
 */
/**
 * Which providers the user marked up or down, and setting one.
 *
 * Stored beside the other user preferences rather than in the endpoint config:
 * this is a judgement about a counterparty, not a setting for the API, and it
 * outlives any particular model or session.
 */
export const getProviderPrefs = async () => (await getKey('providerPrefs')) || {}

export const setProviderPref = async ({
  provider,
  preference
}: {
  provider: string
  preference: 'favorite' | 'disliked' | null
}) => {
  const address = String(provider ?? '').toLowerCase()
  if (!address) return await getProviderPrefs()
  const prefs = { ...((await getKey('providerPrefs')) || {}) }
  if (preference === null) {
    delete prefs[address]
  } else {
    prefs[address] = preference
  }
  await setKey('providerPrefs', prefs)
  return prefs
}

export const morpheusApiRequest = async (payload: {
  path: string
  method?: string
  body?: unknown
}) => {
  const path = String(payload?.path ?? '')
  if (!isPickerRoute(path)) {
    return { ok: false, status: 400, data: { error: { message: `Refusing to call ${path}.` } } }
  }

  const api = readOpenAiConfig()
  if (!api.enabled || !ensureOpenAiServer().isRunning()) {
    return {
      ok: false,
      status: 503,
      data: {
        error: {
          message:
            'The OpenAI-compatible endpoint is not running. Turn it on in Settings → OpenAI-compatible API.'
        }
      }
    }
  }

  try {
    const res = await fetch(`http://127.0.0.1:${api.port}${path}`, {
      method: payload?.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${api.token}`
      },
      body: payload?.body === undefined ? undefined : JSON.stringify(payload.body)
    })
    const data = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: { error: { message: `Could not reach the local endpoint: ${String(e)}` } }
    }
  }
}

export const grokPickerDone = async (payload: {
  requestId: number
  opened: boolean
  note?: string
}) => {
  grokPicker.get(payload.requestId)?.({ opened: payload.opened, note: payload.note })

  // An endpoint-raised offer has no waiting turn to resolve — what it needs is
  // the gate updated, so a decline buys quiet and an open drops the cached model
  // list before the agent resends.
  const offered = offerModelByRequestId.get(payload.requestId)
  if (offered !== undefined) {
    offerModelByRequestId.delete(payload.requestId)
    ensureOpenAiServer().settleOffer(offered.modelId, payload.opened ? 'opened' : 'declined')
    if (payload.opened) {
      // Publish immediately: the model just stopped being "no session", and the
      // agent is about to be told to try again.
      await refreshGrokModels().catch((e) => log.warn(`grok models: ${String(e)}`))
    }
  }
  return { ok: true }
}

export const getOpencodeStatus = async () => {
  const status = await detectOpencode()
  const api = readOpenAiConfig()
  const running = ensureOpenAiServer().isRunning()

  // Provision the config and the /start plugin as soon as the endpoint is up,
  // rather than only during a Chat handoff.
  //
  // Previously the ONLY writer was openInOpencode, which needed a model — so a
  // user had to open a session in the app before `/start` existed, and `/start`
  // is the thing that exists so you do not have to. Writing here means opening
  // Settings is enough. Best-effort: a failure must not stop Settings rendering.
  let pluginsInstalledAt: string | null = null
  if (running && status.installed) {
    try {
      const { dir } = await provisionOpencodePlugins(api)
      pluginsInstalledAt = dir
    } catch (e) {
      log.warn(`opencode: could not install the plugins — ${String(e)}`)
    }
  }

  return {
    ...status,
    installCommand: installCommand().display,
    // The handoff needs the endpoint running: opencode talks to it, not to us.
    endpointEnabled: api.enabled,
    endpointRunning: running,
    configPath: opencodeConfigPath(),
    // Surfaced so Settings can say /start is available everywhere, not only in
    // terminals this app launched.
    pluginsInstalledAt
  }
}

export const installOpencode = async () => {
  const { file, args, display } = installCommand()
  log.info(`opencode: running installer — ${display}`)
  try {
    const { stdout, stderr } = await promisify(execFile)(file, args, {
      timeout: 10 * 60 * 1000,
      maxBuffer: 4 * 1024 * 1024
    })
    const status = await detectOpencode()
    return { ok: status.installed, status, output: `${stdout}\n${stderr}`.trim() }
  } catch (e: any) {
    // Surfaced verbatim in the UI. An installer that fails silently is worse
    // than one that never ran.
    return {
      ok: false,
      status: await detectOpencode(),
      output: `${e?.stdout ?? ''}\n${e?.stderr ?? ''}\n${String(e?.message ?? e)}`.trim()
    }
  }
}

/**
 * Write the provider config and open a terminal running opencode against
 * `modelId`. Refuses rather than guesses when the endpoint is not actually
 * serving — a terminal that opens onto a connection error is a worse outcome
 * than a clear message here.
 */
export const openInOpencode = async ({
  modelId,
  cwd
}: {
  // OPTIONAL. Without it, opencode opens with the Morpheus provider configured
  // and no model preselected — which is the whole point of `/start`: you should
  // not need a session in the app before you can open one from the terminal.
  // Requiring a modelId here made the plugin unreachable except through the
  // handoff it exists to replace.
  modelId?: string
  cwd?: string
}) => {
  const api = readOpenAiConfig()
  if (!api.enabled || !ensureOpenAiServer().isRunning()) {
    return {
      ok: false,
      reason: 'endpoint_off',
      message:
        'Turn on the OpenAI-compatible API in Settings first — opencode connects to it, not to the app directly.'
    }
  }

  const status = await detectOpencode()
  if (!status.installed || !status.path) {
    return { ok: false, reason: 'not_installed', message: 'opencode is not installed yet.' }
  }

  // Callers here hold the hex32 chain id; the endpoint advertises names. Resolve
  // through the endpoint itself rather than comparing the two forms — that
  // mismatch is what made this report "not serving" for a live session.
  // ONE pass: resolving the id and listing models both need the usable-model
  // set, and asking for them separately meant paying the 5-10s /blockchain/models
  // read twice — which exceeded the IPC timeout and made this look like it had
  // failed while the terminal opened anyway.
  const { advertised, models } = await ensureOpenAiServer().resolveForHandoff(modelId ?? '')
  if (modelId && !advertised) {
    return {
      ok: false,
      reason: 'model_unavailable',
      message: `The endpoint is not currently serving "${modelId}". Is the session still open?`
    }
  }

  const configPath = opencodeConfigPath()
  // Refresh the GLOBAL install here too, so launching from the app and opening
  // a terminal by hand can never disagree about which plugin is current.
  //
  // Deliberately NOT declared in the config below any more: the auto-load
  // directory already loads it, and naming the same plugin twice registers
  // /start twice.
  await provisionOpencodePlugins(api).catch((e) =>
    log.warn(`opencode: could not install the plugins — ${String(e)}`)
  )
  writeMorpheusConfig(
    configPath,
    buildMorpheusConfig({
      baseUrl: `http://127.0.0.1:${api.port}/v1`,
      apiKey: api.token,
      models
    })
  )

  const workdir = cwd || (getOpenAiApiSetting()?.opencodeCwd as string) || app.getPath('home')
  try {
    const script = buildLaunchScript({
      opencodePath: status.path,
      configPath,
      // opencode must be given the ADVERTISED id — it has to match the config's
      // model key and what /v1/models returns. Absent when no model was asked
      // for, in which case opencode opens with no preselection and `/start` is
      // how you pick one.
      modelId: advertised ?? undefined,
      cwd: workdir
    })
    await launchInTerminal(path.join(opencodeDir(), 'open-morpheus.command'), script)
    return { ok: true, modelId: advertised, cwd: workdir, configPath }
  } catch (e) {
    // buildLaunchScript throws on control characters rather than quoting them.
    return { ok: false, reason: 'unsafe_input', message: String(e) }
  }
}

export const setOpencodeCwd = async (cwd: string) => {
  const current = readOpenAiConfig()
  setOpenAiApiSetting({ ...(getOpenAiApiSetting() ?? {}), ...current, opencodeCwd: cwd })
  return { cwd }
}
