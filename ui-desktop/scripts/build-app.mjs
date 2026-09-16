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

// Re-running the README's one-liner on a machine that already has the repo
// is a completely normal thing a real person does — not a mistake to
// document around. `git clone` into a directory that already exists fails
// outright, but that failure is easy to miss (scrolled past, or the person
// isn't chaining the commands with &&) — and if the shell just carries on
// into the pre-existing checkout, `yarn app` builds from whatever commit
// happened to be sitting there, silently. That cost real diagnostic time:
// a freeze bug was already fixed upstream, but the checkout was
// one commit behind and nothing said so — the build looked identical and
// reported the exact prior commit's SHA, correctly, because it genuinely
// was that commit.
//
// So: before building, bring THIS checkout up to date with its own remote,
// same branch, fast-forward only. That's the safe half of "update" — it can
// only succeed if nobody has local commits this checkout would otherwise
// discard, so a contributor mid-change is left alone (a failed fast-forward
// is not an error here, just a reason to build from what's already there).
// Best-effort: no git, no network, or genuinely no remote configured all
// degrade to "build whatever is checked out," same as before this existed.
// Earlier versions stopped at a failed fast-forward and told the reader to go
// fix their checkout. That is a worse failure than it looks: the person ran ONE
// command to get an app, and got homework about rebases in a repository they
// may never have opened. So this recovers on its own — under one rule that
// makes recovering safe: NOTHING IS EVER DISCARDED. Work in progress is
// stashed, diverging commits are kept on a named backup branch, and both are
// printed with the command that brings them back. A recovery that can lose
// work would be worse than the homework it replaces.
//
// Set MOR_NO_AUTO_RECOVER=1 to keep the old behaviour (report and build as-is),
// which is what a contributor mid-change on a shared machine wants.
const git = (args, opts = {}) =>
  execSync(`git ${args}`, { cwd: uiDesktop, encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
const gitOk = (args) => {
  try { git(args); return true; } catch { return false; }
};

try {
  const branch = git('rev-parse --abbrev-ref HEAD');
  const before = git('rev-parse --short HEAD');
  git('fetch --quiet');

  if (gitOk('merge --ff-only --quiet @{u}')) {
    const after = git('rev-parse --short HEAD');
    if (after !== before) {
      console.log(`[app] Updated ${branch}: ${before} -> ${after} (was behind its remote)`);
    }
  } else if (process.env.MOR_NO_AUTO_RECOVER) {
    console.warn(`\n[app] NOT updated (MOR_NO_AUTO_RECOVER is set).`);
    console.warn(`[app] Building ${branch} at ${before} — the checkout as it stands.\n`);
  } else {
    // Work out where "up to date" actually IS. The branch may have no upstream
    // at all, in which case fall back to the remote's default branch rather
    // than giving up — that is the branch a plain clone would have produced.
    let target = null;
    if (gitOk('rev-parse --verify --quiet @{u}')) {
      target = git('rev-parse --abbrev-ref --symbolic-full-name @{u}');
    } else if (gitOk(`rev-parse --verify --quiet origin/${branch}`)) {
      target = `origin/${branch}`;
    } else {
      try {
        // "origin/HEAD -> origin/x" is only populated by some clones; ask the
        // remote directly when it is not, rather than guessing a branch name.
        target = git('rev-parse --abbrev-ref origin/HEAD');
      } catch {
        const head = git('ls-remote --symref origin HEAD')
          .split('\n')
          .find((l) => l.startsWith('ref:'));
        if (head) target = `origin/${head.split(/\s+/)[1].replace('refs/heads/', '')}`;
      }
    }

    if (!target) {
      console.warn('\n[app] No remote branch to update from — building the checkout as-is.\n');
    } else {
      const recovered = [];

      // 1. Uncommitted work, tracked and untracked, goes to the stash.
      if (git('status --porcelain')) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        git(`stash push --include-untracked --message "yarn-app auto-save ${stamp}"`);
        recovered.push(['Uncommitted changes', 'git stash pop']);
      }

      // 2. Commits that only exist here are parked on a branch that says what
      //    it is. Created BEFORE the reset, so the objects stay reachable.
      if (git(`rev-list --count ${target}..HEAD`) !== '0') {
        const backup = `backup/${branch.replace(/[^\w.-]/g, '-')}-${before}`;
        if (!gitOk(`rev-parse --verify --quiet ${backup}`)) git(`branch ${backup}`);
        recovered.push([`Local commits (kept on ${backup})`, `git rebase ${backup}`]);
      }

      git(`reset --hard ${target}`, { stdio: 'pipe' });
      const after = git('rev-parse --short HEAD');
      // Re-point the branch at its remote so the NEXT run fast-forwards normally.
      gitOk(`branch --set-upstream-to=${target} ${branch}`);

      console.log(`\n[app] Checkout could not fast-forward, so it was reset to ${target}.`);
      console.log(`[app] ${branch}: ${before} -> ${after}`);
      for (const [what, how] of recovered) console.log(`[app]   ${what} — restore with: ${how}`);
      if (!recovered.length) console.log('[app]   Nothing needed saving — the tree was clean.');
      console.log('');
    }
  }
} catch (err) {
  console.warn(`[app] Could not check for updates (${err.message}) — building the checkout as-is.`);
}

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
  // Excludes build-info.ts itself: this very step overwrites it on every
  // build and it's never committed, so from the second build onward it
  // would show up in `git status` regardless of whether anything real
  // changed — making BUILD_DIRTY permanently stuck on ("<sha>-dirty"
  // reported after a clean re-run) instead of meaning what it says.
  const dirty = execSync(
    "git status --porcelain -- . ':!src/shared/build-info.ts'",
    { cwd: uiDesktop, encoding: 'utf8' },
  ).trim().length > 0;
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
// Snapshot dist/ BEFORE building. Reporting "the newest installer matching this
// version" is not the same claim as "the installer this run produced": when
// electron-builder skips or fails its packaging step, a stale artifact from a
// previous build still matches, and the script announced it with a tick. The
// person then ships, tests, or reports a bug against a binary that predates
// every change they just made. A success indicator has to be able to say no.
const dist = join(uiDesktop, 'dist');
const INSTALLERS = /\.(dmg|exe|AppImage|deb|snap)$/;
const listInstallers = () =>
  (existsSync(dist) ? readdirSync(dist) : [])
    .filter((f) => INSTALLERS.test(f) && f.includes(version))
    .map((f) => [f, statSync(join(dist, f)).mtimeMs]);
const preBuild = new Map(listInstallers());

execSync(`npm run ${script}`, {
  cwd: uiDesktop,
  stdio: 'inherit',
  env: { ...forwardedEnv, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
});

// Only artifacts this run created or rewrote count. mtime is compared with >,
// not >=, so an untouched file from an earlier build can never qualify.
const built = listInstallers()
  .filter(([f, mtime]) => !preBuild.has(f) || mtime > preBuild.get(f))
  .map(([f, mtime]) => ({ f, mtime }))
  .sort((a, b) => b.mtime - a.mtime);

if (!built.length) {
  const stale = preBuild.size;
  console.error(`\n[app] Build finished but produced no new installer in ${dist}.`);
  if (stale) {
    console.error(
      `[app] ${stale} installer(s) for ${version} are already there from an earlier\n` +
        `[app] build. They are NOT this build's output, so this run reports failure\n` +
        `[app] rather than handing you a binary that predates your changes.`,
    );
  }
  console.error('[app] Scroll up for the packaging step\'s own error.');
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
