import { app, BrowserWindow, ipcMain, session, shell, systemPreferences } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import {
  default as install,
  REDUX_DEVTOOLS
  // REACT_DEVELOPER_TOOLS,
} from 'electron-devtools-installer'
import { createClient } from './src/client'
import config from './config'
import { cfg } from '../../orchestrator.config'
import { resolveRouterEndpoint } from './orchestrator/resolve-router-endpoint'
import initContextMenu from './contextMenu'
import initMenu from './menu'
import errorHandler from './errorHandler'
import logger from './logger'
import { join, relative, normalize, sep, isAbsolute } from 'path'

const installExtension = (install as any).default as typeof install

// --- Navigation / external-link hardening ----------------------------------
// This is a key-holding wallet whose renderer displays UNTRUSTED provider chat
// (react-markdown renders real <a href> links). Without these guards, a single
// click on a provider-supplied link top-level-navigates the wallet window to a
// hostile origin, which then inherits the preload's ipcRenderer bridge and can
// call money channels (send-mor/send-eth) with no XSS required. (Verified end to
// end, 2026-07-17.) Two independent controls close it: refuse to navigate the
// window off its own origin, and only ever hand https/mailto to the OS launcher.

// A file: URL that resolves to a path INSIDE the app bundle — not merely one
// that shares its string prefix. `startsWith(getAppPath())` is wrong twice: it
// accepts a sibling (`app.asar.unpacked`, `app.asar-evil`), and on Windows the
// URL pathname (`/C:/…`, forward slashes) never prefix-matches getAppPath()
// (`C:\…`, backslashes), which would reject the LEGIT renderer and brick the app.
// (Kept in sync with isTrustedSender in subscriptions/utils.js.)
const fileUrlIsInAppBundle = (u: URL): boolean => {
  if (u.host) return false // reject file://host/… (UNC / authority tricks)
  let p = decodeURIComponent(u.pathname)
  if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(p)) p = p.slice(1)
  const rel = relative(app.getAppPath(), normalize(p))
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))
}

const isAppUrl = (url: string): boolean => {
  try {
    const u = new URL(url)
    if (u.protocol === 'file:') return fileUrlIsInAppBundle(u) // packaged renderer
    // Dev: the vite origin, by strict ORIGIN equality (a `startsWith` prefix is
    // defeated by `http://localhost:5173@evil.com` and a port suffix), and only
    // for http/https so a `blob:`/`data:` cannot ride the origin match.
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (is.dev && devUrl && (u.protocol === 'http:' || u.protocol === 'https:')) {
      return u.origin === new URL(devUrl).origin
    }
    return false
  } catch {
    return false
  }
}

// Only https/mailto reach the OS launcher — never file:, custom app schemes, or
// javascript:, the classic shell.openExternal desktop-RCE vectors.
const ALLOWED_EXTERNAL_SCHEMES = new Set(['https:', 'mailto:'])
const openExternalSafe = (rawUrl: string): boolean => {
  try {
    const u = new URL(rawUrl)
    if (ALLOWED_EXTERNAL_SCHEMES.has(u.protocol)) {
      void shell.openExternal(rawUrl)
      return true
    }
    logger.warn(`blocked openExternal for disallowed scheme: ${u.protocol}`)
  } catch {
    logger.warn('blocked openExternal for an unparseable url')
  }
  return false
}

// Dev-console hygiene: the Electron CSP warning fires on every dev boot and
// (by its own text) never shows in a packaged app. Suppressing it in dev only
// keeps the console readable for real errors. Content-Security-Policy hardening
// is tracked as a separate follow-up (a correct connect-src must cover the
// router's streaming endpoints); this line only silences the dev-only warning.
if (!app.isPackaged) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    // ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    if (is.dev) {
      mainWindow.webContents.openDevTools()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    openExternalSafe(details.url)
    return { action: 'deny' }
  })

  // Refuse to navigate the wallet window away from its own origin. The app is a
  // hash-routed SPA that never legitimately does a top-level navigation after
  // the initial load, so anything that tries is either a provider link click or
  // a redirect attack — block it, and send a genuine https link to the browser.
  const denyOffAppNavigation = (e: Electron.Event, url: string): void => {
    if (isAppUrl(url)) return
    e.preventDefault()
    logger.warn(`blocked in-window navigation to: ${url}`)
    openExternalSafe(url)
  }
  mainWindow.webContents.on('will-navigate', denyOffAppNavigation)
  mainWindow.webContents.on('will-redirect', denyOffAppNavigation)

  // Belt for child frames: will-navigate only covers the main frame. A subframe
  // has no preload today (so no ipcRenderer) and react-markdown emits no raw
  // iframes, but deny off-app frame navigation anyway so a future regression
  // can't quietly reopen a navigation vector.
  mainWindow.webContents.on('will-frame-navigate', (details) => {
    if (isAppUrl(details.url)) return
    details.preventDefault()
    logger.warn(`blocked frame navigation to: ${details.url}`)
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

errorHandler({ logger: logger.error })

const sleepBeforeStart = 3000

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app
  .whenReady()
  .then(() => new Promise((r) => setTimeout(r, sleepBeforeStart)))
  .then(async () => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron')

    // Content-Security-Policy — packaged builds ONLY. Vite's dev server needs
    // inline script + eval + a websocket for HMR, so a strict CSP would break
    // `npm run dev`; the packaged app has none of that. This is the second wall
    // behind the nav-guard + IPC sender-check: if any XSS primitive is ever
    // introduced (e.g. someone adds rehype-raw), the CSP still denies script and
    // exfiltration. img-src/media-src also CLOSE the provider IP-beacon — a chat
    // `![x](http://attacker/px.png)` no longer auto-loads (only self/data/blob and
    // the local router are allowed). connect-src is the local router only (the
    // renderer's fetches all target it; the marketplace raw-RPC path is dead and
    // the price API is fetched in main, not the renderer). style-src keeps
    // 'unsafe-inline' for styled-components; frame-src 'self' preserves the
    // same-origin mnemonic-print iframe.
    if (!is.dev) {
      const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: http://localhost:* http://127.0.0.1:*",
        "media-src 'self' data: blob: http://localhost:* http://127.0.0.1:*",
        "font-src 'self'",
        "connect-src 'self' http://localhost:* http://127.0.0.1:*",
        "frame-src 'self'",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; ')
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [csp]
          }
        })
      })
    }

    // Allow the renderer to use the microphone (STT recording) and other
    // media devices. Without an explicit handler Electron does not grant the
    // `media` permission, so getUserMedia() yields a silent track instead of
    // throwing. On macOS we also proactively request the OS-level mic grant.
    const grantedPermissions = new Set(['media', 'mediaKeySystem', 'audioCapture', 'videoCapture'])

    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(grantedPermissions.has(permission))
    })

    session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
      return grantedPermissions.has(permission)
    })

    if (process.platform === 'darwin') {
      const micStatus = systemPreferences.getMediaAccessStatus('microphone')
      logger.info(`Microphone access status: ${micStatus}`)
      if (micStatus === 'denied' || micStatus === 'restricted') {
        logger.error(
          `Microphone access is "${micStatus}". macOS will return a SILENT audio track. ` +
            `Reset it with: tccutil reset Microphone com.github.Electron (dev) ` +
            `or enable it in System Settings > Privacy & Security > Microphone, then restart.`
        )
      }
      systemPreferences
        .askForMediaAccess('microphone')
        .then((granted) => logger.info(`Microphone access granted: ${granted}`))
        .catch((err) => logger.error('Failed requesting microphone access', err))
    }

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // install devtools
    if (is.dev) {
      installExtension([REDUX_DEVTOOLS])
        .then((name) => console.log(`Added Extension:  ${name[0].name}`))
        .catch((err) => console.log('An error occurred: ', err))
    }

    // IPC test
    ipcMain.on('ping', () => console.log('pong'))

    // Decide our router's endpoint BEFORE the window loads. The renderer calls
    // the router directly via config.chain.localProxyRouterUrl, so this must be
    // settled before that config is handed over — otherwise a foreign router
    // (e.g. the user's own Dockerized proxy-router on the same port) gets
    // adopted, and every authenticated call fails because its auth cookie lives
    // inside the container. Non-fatal: on any error we keep the default.
    await resolveRouterEndpoint(cfg, config, logger).catch((e) =>
      logger.error('resolveRouterEndpoint failed; using default router endpoint', e)
    )

    createWindow()

    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    logger.info('App ready, initializing...')

    initMenu()
    initContextMenu()

    createClient(config)
  })

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
