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
import { join } from 'path'

const installExtension = (install as any).default as typeof install

// Dev-console hygiene: the Electron CSP warning fires on every dev boot and
// (by its own text) never shows in a packaged app. Suppressing it in dev only
// keeps the console readable for real errors. NOTE the underlying gap is
// real — no CSP is defined anywhere — but a correct policy needs its own pass
// (connect-src must cover the router's streaming endpoints), tracked as a
// follow-up, not silenced by this line.
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
    shell.openExternal(details.url)
    return { action: 'deny' }
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
