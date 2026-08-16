// Create .env from .env.example on install, if it is missing.
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
// NEVER CLOBBERS. If .env exists it is left alone — your local edits, and CI's
// real environment, are not this script's business. CI copies its own .env
// AFTER `yarn install` with a plain `cp` (.github/actions/copy_env_files), so
// it overwrites whatever this wrote; the ordering is safe in both directions.
//
// Node rather than `cp` because postinstall also runs on Windows.
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const uiDesktop = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = join(uiDesktop, '.env');
const example = join(uiDesktop, '.env.example');

if (existsSync(env)) {
  // Silent: this is the normal case on every install after the first.
  process.exit(0);
}

if (!existsSync(example)) {
  console.warn(
    '[env] no .env and no .env.example — the build will fail its environment check.',
  );
  process.exit(0); // a warning, never a failed install
}

copyFileSync(example, env);
console.log(
  '[env] created ui-desktop/.env from .env.example (mainnet defaults).\n' +
    '[env] Edit it if you need testnet or your own endpoints.',
);
