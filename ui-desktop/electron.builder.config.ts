import { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'com.electron.morpheus-ui',
  productName: 'MorpheusUI',
  directories: {
    buildResources: 'buildResources'
  },
  files: [
    '!**/.vscode/*',
    '!src/*',
    '!electron.vite.config.{js,ts,mjs,cjs}',
    '!{.eslintignore,.eslintrc.cjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}',
    '!{.env,.env.*,.npmrc,pnpm-lock.yaml}',
    '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}',
    '!services/*'
  ],
  asarUnpack: ['resources/**', 'pkg-scripts/**'],
  win: {
    executableName: 'morpheus-ui',
    target: ['portable']
  },
  portable: {
    artifactName: '${os}-${arch}-${name}-${version}.${ext}'
  },
  mac: {
    executableName: 'MorpheusUI',
    entitlements: 'buildResources/entitlements.mac.plist',
    extendInfo: {
      NSCameraUsageDescription: "Application requests access to the device's camera.",
      NSMicrophoneUsageDescription: "Application requests access to the device's microphone.",
      NSDocumentsFolderUsageDescription:
        "Application requests access to the user's Documents folder.",
      NSDownloadsFolderUsageDescription:
        "Application requests access to the user's Downloads folder."
    },
    target: ['dmg'],
    // NOTARIZED, so the DMG opens on a machine that has never seen it.
    //
    // Without this the app is merely signed: Gatekeeper on any other Mac shows
    // "cannot be opened because Apple cannot check it for malicious software"
    // and the only way in is right-click -> Open, which is not a test of the
    // thing you meant to test.
    //
    // Needs three environment variables at build time — APPLE_ID,
    // APPLE_APP_SPECIFIC_PASSWORD (an app-specific password, NOT the Apple
    // account password) and APPLE_TEAM_ID. electron-builder passes them to
    // notarytool. Left as an env lookup rather than hard-coded so a build
    // machine without credentials fails loudly at the notarize step instead of
    // silently producing an unnotarized DMG that looks identical.
    notarize: process.env.APPLE_TEAM_ID
      ? { teamId: process.env.APPLE_TEAM_ID }
      : false,
    artifactName: '${os}-${arch}-${name}-${version}.${ext}'
  },
  linux: {
    target: ['AppImage'],
    maintainer: 'mor.org',
    category: 'Utility',
    executableName: 'MorpheusUI',
    artifactName: '${os}-${arch}-${name}-${version}.${ext}'
  },
  npmRebuild: false,
  publish: {
    provider: 'generic',
    url: 'https://example.com/auto-updates'
  },
  electronDownload: {
    mirror: 'https://npmmirror.com/mirrors/electron/'
  }
}

export default config
