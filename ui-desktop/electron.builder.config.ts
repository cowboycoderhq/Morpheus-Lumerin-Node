import { Configuration, AfterPackContext } from 'electron-builder'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

// Apple Silicon's kernel (AMFI) refuses to load ANY arm64 Mach-O with no code
// signature at all — this is unconditional, unrelated to Gatekeeper/quarantine
// trust, and it applies even to a binary built and launched on the same
// machine with no download involved. The `yarn app` front door builds with
// CSC_IDENTITY_AUTO_DISCOVERY=false and no configured identity, so
// electron-builder's own signing step SKIPS entirely (confirmed by reading
// macPackager.js's sign(): identity == null -> logs "skipped macOS code
// signing" and returns false). Without at least an ad-hoc signature — free,
// no Apple account needed — the result cannot launch on arm64 at all, which
// is exactly what "'MorpheusUI' is damaged and can't be opened. You should
// move it to the Trash" looks like to a user with no other explanation.
//
// `resetAdHocDarwinSignature` (the documented @electron/fuses mechanism for
// this) is NOT used here: it re-signs after this app's electron-fuse
// flipping step, which this config does not use at all (no `electronFuses`
// key), so a plain afterPack hook is sufficient and does not require opting
// into a set of security-relevant fuse toggles this fix has no reason to
// decide. `afterPack` runs before electron-builder's own conditional signing
// step (doSignAfterPack) — see platformPackager.js — so when a real identity
// IS available (CSC_IDENTITY_AUTO_DISCOVERY left on, a cert in the keychain),
// electron-builder's own signing simply re-signs over this ad-hoc signature
// afterward, exactly as it would with no signature there at all. This hook
// changes nothing about the signed build path.
const adHocSignUnsignedMacBuild = async (context: AfterPackContext) => {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath])
}

const config: Configuration = {
  appId: 'com.electron.morpheus-ui',
  productName: 'MorpheusUI',
  afterPack: adHocSignUnsignedMacBuild,
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
    // With a Developer ID cert in the keychain (CSC_IDENTITY_AUTO_DISCOVERY
    // left on), a plain `npm run build:mac-arm64` produces a SIGNED,
    // UNNOTARIZED DMG: fine for local use, refused by Gatekeeper on any other
    // Mac. `yarn app` (scripts/build-app.mjs) sets
    // CSC_IDENTITY_AUTO_DISCOVERY=false deliberately — see that script — so
    // electron-builder's own signing skips entirely; adHocSignUnsignedMacBuild
    // above is what keeps THAT path launchable on Apple Silicon.
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
