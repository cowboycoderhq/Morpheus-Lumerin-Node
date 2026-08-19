// Create .env from .env.example on install, if it is missing. If it already
// exists, merge in any keys .env.example has that it doesn't — never touch a
// key that's already set, to anything, including empty.
//
// WHY THIS EXISTS. The build validates its environment before doing anything,
// so a fresh clone with no .env dies at:
//
//     Invalid environment variables: ENV must have required property
//     'BLOCKSCOUT_API_URL'
//
// .env is gitignored, so every contributor hits this on their first build and
// the message points at a variable rather than at the missing file. Anyone who
// has worked here a while never sees it, which is exactly why it survived.
//
// NEVER CLOBBERS AN EXISTING KEY. Your local edits, and CI's real environment,
// are not this script's business. CI copies its own .env AFTER `yarn install`
// with a plain `cp` (.github/actions/copy_env_files), so it overwrites
// whatever this wrote; the ordering is safe in both directions.
//
// BUT A MISSING KEY IS DIFFERENT FROM A SET ONE. The original version of this
// script left an existing .env completely untouched, full stop — meaning a
// checkout's very first .env, once generated, could never gain a variable
// .env.example later added, no matter how many times the source updated.
// SERVICE_PROXY_DOWNLOAD_URL_MAC_ARM64 (see .env.example) shipped weeks after
// this repo existed; a checkout whose first build predated it kept hitting
// the exact freeze that variable fixes, forever, because its .env was
// created once, before the fix, and every later `yarn app` correctly
// refused to touch a file that already existed — confirmed directly against
// a real tester's checkout: current source, current build-app.mjs, current
// .env.example, and still the old ENOENT, because the one file nothing was
// merging into was the one actually read at runtime.
//
// Node rather than `cp` because postinstall also runs on Windows.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const uiDesktop = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(uiDesktop, '.env');
const examplePath = join(uiDesktop, '.env.example');

if (!existsSync(examplePath)) {
  console.warn(
    '[env] no .env and no .env.example — the build will fail its environment check.',
  );
  process.exit(0); // a warning, never a failed install
}

const exampleText = readFileSync(examplePath, 'utf8');

if (!existsSync(envPath)) {
  writeFileSync(envPath, exampleText);
  console.log(
    '[env] created ui-desktop/.env from .env.example (mainnet defaults).\n' +
      '[env] Edit it if you need testnet or your own endpoints.',
  );
  process.exit(0);
}

// KEY=value lines only — not commented-out ones (the Linux/Windows proxy-
// router placeholders in .env.example are deliberately commented out; they
// are not "keys that should exist," they're a note that no value exists yet).
const keyOf = (line) => /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)?.[1];

const envText = readFileSync(envPath, 'utf8');
const existingKeys = new Set(envText.split('\n').map(keyOf).filter(Boolean));

const missing = exampleText
  .split('\n')
  .filter((line) => {
    const key = keyOf(line);
    return key && !existingKeys.has(key);
  });

if (missing.length === 0) {
  // Silent: this is the normal case on every install once .env has caught up.
  process.exit(0);
}

const separator = envText.endsWith('\n') ? '' : '\n';
writeFileSync(
  envPath,
  envText +
    separator +
    '\n# Added by ensure-env.mjs — new in .env.example since this file was created:\n' +
    missing.join('\n') +
    '\n',
);
console.log(
  `[env] .env was missing ${missing.length} key(s) from .env.example — added: ` +
    missing.map((l) => keyOf(l)).join(', '),
);
