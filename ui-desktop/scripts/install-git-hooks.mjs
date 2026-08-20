// Points this checkout at the repo's TRACKED hooks (../.githooks) instead of
// the untracked, one-machine-only .git/hooks/ default. Best-effort: no git,
// not a git checkout (a tarball download rather than a clone), or a
// worktree/submodule oddity all degrade to "did nothing", never to a failed
// install — a git-hooks wiring problem is not a reason to block the app
// build this script otherwise supports.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const uiDesktop = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const toplevel = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: uiDesktop,
    encoding: 'utf8',
  }).trim();
  if (!existsSync(join(toplevel, '.githooks'))) {
    // Not this repo (or an unexpectedly old checkout without .githooks yet).
    process.exit(0);
  }
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: toplevel });
  console.log('[hooks] core.hooksPath -> .githooks (identity-leak + build gates on commit/push)');
} catch {
  // Any failure here (no git binary, not a git repo, permission issue) is
  // silent and non-fatal — see file header.
}
