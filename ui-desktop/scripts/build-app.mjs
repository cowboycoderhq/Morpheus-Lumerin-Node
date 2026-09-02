// `yarn app` — one command from a fresh clone to an installer you can open.
//
// The friction this removes: a newcomer previously had to know to copy .env,
// know which of ten build:* targets matched their machine, and then find the
// result inside ui-desktop/dist. Three chances to stop, none of them about the
// app. This picks the target from the machine it is running on and puts the
// finished installer in ~/Downloads, where a downloaded app belongs.
//
// Everything it does is still available piecemeal (`yarn build:mac-arm64` and
// friends) — this is the front door, not a replacement.
import { execSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const uiDesktop = join(dirname(fileURLToPath(import.meta.url)), '..');

// A stale `out/` from an interrupted or unrelated earlier build has one way
// to matter: electron-vite's production build overwrites the files it knows
// about, but it does not delete files it no longer produces. A hashed chunk
// from a previous build can survive alongside the new ones, referenced by
// nothing — harmless on its own, but the exact shape of the failure mode a
// reported crash could never otherwise be ruled out against without this.
// `dist/` holds the finished installer(s) this run should replace, not
// accumulate. Removing both before every build makes "freshly built" mean
// what it says, not "probably fresh, assuming nothing survived from before."
for (const dir of ['out', 'dist']) {
  rmSync(join(uiDesktop, dir), { recursive: true, force: true });
}

// Stamp which commit is actually being built. package.json's version is not
// this: it stays the same string across many commits in a day of work, so
// "About shows 1.1.4" cannot answer "which commit produced this DMG" — that
// ambiguity has already cost real time diagnosing a crash report that turned
// out to need this. Failure here (no git, not a repo) degrades to the
// checked-in 'dev-unbuilt' default rather than blocking the build.
try {
  const sha = execSync('git rev-parse --short HEAD', { cwd: uiDesktop, encoding: 'utf8' }).trim();
  const dirty = execSync('git status --porcelain', { cwd: uiDesktop, encoding: 'utf8' }).trim().length > 0;
  writeFileSync(
    join(uiDesktop, 'src/shared/build-info.ts'),
    `// Overwritten by scripts/build-app.mjs — see that file's comment.\n` +
      `export const BUILD_SHA = ${JSON.stringify(sha)};\n` +
      `export const BUILD_DIRTY = ${dirty};\n`,
  );
} catch (err) {
  console.warn(`[app] Could not stamp the build commit (${err.message}) — About will show 'dev-unbuilt'.`);
}
const version = JSON.parse(
  execSync('node -p "JSON.stringify(require(\'./package.json\'))"', {
    cwd: uiDesktop,
    encoding: 'utf8',
  }),
).version;

// The target for THIS machine. Building arm64 on an Intel Mac (or the reverse)
// produces something that will not run, and the old instructions left that
// choice to a reader who has no way to know it matters.
const { platform, arch } = process;
const TARGETS = {
  'darwin-arm64': 'build:mac-arm64',
  'darwin-x64': 'build:mac-x64',
  'win32-x64': 'build:win-x64',
  'win32-arm64': 'build:win-arm64',
  'linux-x64': 'build:linux-x64',
  'linux-arm64': 'build:linux-arm64',
};
const key = `${platform}-${arch}`;
const script = TARGETS[key];

if (!script) {
  console.error(
    `[app] No build target for ${key}.\n` +
      `[app] Supported: ${Object.keys(TARGETS).join(', ')}\n` +
      `[app] Run one of the build:* scripts directly if you know what you need.`,
  );
  process.exit(1);
}

console.log(`[app] Building Morpheus ${version} for ${key} …`);
console.log('[app] First run takes a few minutes; later ones are much faster.\n');

// SIGNING OFF, deliberately.
//
// electron-builder auto-discovers any Developer ID in the keychain and tries to
// use it. That makes this command's behaviour depend on which certificates the
// person running it happens to own: a contributor with none gets an unsigned
// build, and one with a certificate gets a signing attempt that can fail on a
// locked keychain or prompt for a password mid-build. A front door has to
// behave the same for everybody.
//
// So this always produces an UNSIGNED local build. Signing and notarizing is
// scripts/release.sh's job, and it needs credentials only the publisher has.
//
// This script itself runs as a yarn step ("app": "yarn install && node
// scripts/build-app.mjs"), so process.env already carries the npm_config_*
// variables yarn classic injects into every script for npm-compatibility —
// including a handful of npm's own decades-old `npm version` flags
// (version-git-tag, version-commit-hooks, ...) that current npm no longer
// recognizes. Spreading process.env wholesale into this NESTED npm run
// forwards all of them straight through, so every build printed five
// "Unknown env config" warnings that had nothing to do with this app.
const forwardedEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key)),
);
execSync(`npm run ${script}`, {
  cwd: uiDesktop,
  stdio: 'inherit',
  env: { ...forwardedEnv, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
});

// Find what was actually produced rather than predicting its name: the artifact
// pattern lives in electron.builder.config.ts and would drift out of sync with
// any name guessed here.
const dist = join(uiDesktop, 'dist');
const INSTALLERS = /\.(dmg|exe|AppImage|deb|snap)$/;
const built = readdirSync(dist)
  .filter((f) => INSTALLERS.test(f) && f.includes(version))
  .map((f) => ({ f, mtime: statSync(join(dist, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

if (!built.length) {
  console.error(`\n[app] Build finished but no installer appeared in ${dist}.`);
  process.exit(1);
}

const name = built[0].f;
const downloads = join(homedir(), 'Downloads');
let delivered = join(dist, name);

try {
  if (!existsSync(downloads)) mkdirSync(downloads, { recursive: true });
  copyFileSync(join(dist, name), join(downloads, name));
  delivered = join(downloads, name);
} catch (err) {
  // Never fail the build over the copy — the installer exists either way, and
  // saying where it is beats exiting non-zero on a finished build.
  console.warn(`\n[app] Could not copy to ~/Downloads (${err.message}).`);
}

console.log(`\n[app] ✅ ${name}`);
console.log(`[app]    ${delivered}`);

if (platform === 'darwin') {
  console.log(
    '\n[app] This build is UNSIGNED — signing and notarizing needs an Apple\n' +
      '[app] Developer ID that only the publisher has. macOS will refuse it with\n' +
      '[app] "Apple cannot check it for malicious software" on first open.\n' +
      '[app] Right-click the app in Applications and choose Open to run it.',
  );
}

console.log(
  '\n[app] On first launch the app downloads its services (proxy-router, IPFS,\n' +
    '[app] a local model) — about 2GB, and a few minutes before the window is usable.',
);
