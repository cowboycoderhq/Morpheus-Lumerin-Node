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
    // Signing only. Notarization is scripts/release.sh's job, because it has to
    // happen to the .app BEFORE the DMG is built around it and again to the DMG
    // afterwards — an order electron-builder's own step cannot express. Doing it
    // there also means the credentials stay in a notarytool keychain profile
    // rather than in this process's environment.
    //
    // A plain `npm run build:mac-arm64` therefore produces a SIGNED, UNNOTARIZED
    // DMG: fine for local use, refused by Gatekeeper on any other Mac.
    notarize: false,
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
