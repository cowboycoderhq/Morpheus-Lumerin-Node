'use strict'

const { ipcMain, app } = require('electron')
const path = require('path')
const stringify = require('json-stringify-safe')

import logger from '../../../logger'
import WalletError from '../WalletError'

export function getLogData(data) {
  if (!data) {
    return ''
  }
  const logData = Object.assign({}, data)

  const blackList = ['password']
  blackList.forEach((w) => delete logData[w])

  return stringify(logData)
}

export const checkIfLoggableEvent = (eventName) => eventName !== 'persist-state'

export const isPromise = (p) => {
  if (typeof p === 'object' && typeof p.then === 'function') {
    return true
  }

  return false
}

export const ignoreChain = (chain, data) =>
  chain !== 'multi' && chain !== 'none' && data.chain && chain !== data.chain

// Every IPC handler below can move money or read the wallet (send-mor, send-eth,
// get-auth-headers, login-submit, logout, …). The renderer→main boundary is the
// real trust boundary, so reject any message whose sender frame is not the app's
// own origin. Without this, a window navigated to a hostile origin (a clicked
// provider link) inherits the ipcRenderer bridge and can drive these channels.
// Verified: the navigation+IPC fund-theft chain, 2026-07-17.
// A file: URL that resolves INSIDE the app bundle (proper path boundary +
// cross-platform), not merely one sharing its string prefix. Mirrors
// fileUrlIsInAppBundle in main/index.ts — keep the two in sync.
const fileUrlIsInAppBundle = (u) => {
  if (u.host) return false // reject file://host/… (UNC / authority tricks)
  let p = decodeURIComponent(u.pathname)
  if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(p)) p = p.slice(1)
  const rel = path.relative(app.getAppPath(), path.normalize(p))
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel))
}

export const isTrustedSender = (event) => {
  try {
    const url = (event.senderFrame && event.senderFrame.url) || event.sender.getURL()
    const u = new URL(url)
    if (u.protocol === 'file:') return fileUrlIsInAppBundle(u) // packaged renderer
    // Dev: strict ORIGIN equality (a startsWith prefix is defeated by
    // `localhost:5173@evil.com` and a port suffix), http/https only so a
    // `blob:`/`data:` cannot ride the origin match.
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (!app.isPackaged && devUrl && (u.protocol === 'http:' || u.protocol === 'https:')) {
      return u.origin === new URL(devUrl).origin
    }
    return false
  } catch (e) {
    return false
  }
}

export function onRendererEvent(eventName, handler, chain) {
  ipcMain.on(eventName, function (event, evProps) {
    if (!isTrustedSender(event)) {
      logger.warn(`<-- ${eventName} rejected: untrusted sender frame`)
      return
    }
    const { id, data } = evProps
    if (ignoreChain(chain, data)) {
      return
    }
    const result = handler(data)

    if (!isPromise(result)) {
      logger.warn(`<-- ${eventName} result is not a promise!. ${result}`)
      return
    }

    result
      .then(function (res) {
        if (event.sender.isDestroyed()) {
          return
        }
        event.sender.send(eventName, { id, data: res })
      })
      .catch(function (err) {
        if (event.sender.isDestroyed()) {
          return
        }
        const error = new WalletError(err.message)
        event.sender.send(eventName, { id, data: { error } })
        logger.warn(`<-- ${eventName}:${id} ${err.message}`)
      })
      .catch(function (err) {
        logger.warn(`Could not send message to renderer: ${err.message}`)
      })
  })
}

export const subscribeTo = (types, chain) =>
  Object.keys(types).forEach((type) => {
    onRendererEvent(type, types[type], chain)
  })

export const unsubscribeTo = (types) =>
  Object.keys(types).forEach((type) => ipcMain.removeAllListeners(type, types[type]))

export default { subscribeTo, unsubscribeTo }
