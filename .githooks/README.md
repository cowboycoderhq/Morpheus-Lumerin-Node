# Tracked git hooks

`.git/hooks/` is never tracked by git — a hook that lives only there exists on
one machine and nowhere a fresh clone can find it. This directory is the
tracked alternative: point git at it with

```bash
git config core.hooksPath .githooks
```

`ui-desktop/package.json`'s `postinstall` script runs this automatically (best
effort — it never fails an install if git isn't available or this isn't a git
checkout), so anyone who runs `yarn install`/`npm install` in `ui-desktop/`
gets it without a separate step. Anyone who never runs that — a Go-only
contributor working purely in `proxy-router/`, say — can set it by hand with
the command above from the repo root.

Both hooks accept `git commit --no-verify` / `git push --no-verify` to bypass
them, same as any git hook. That bypass is a real gap, which is why both sets
of checks are mirrored server-side — `.github/workflows/opsec-check.yml` for
the identity-leak gate and `.github/workflows/docs-gates.yml` for the
documentation gates (CI runs their full form, not the `--staged` subset). The
local hooks are the fast, friendly first line; CI is the one that can't be
skipped by forgetting a flag.

- `pre-commit` — three gates, cheapest/most-severe first: the identity-leak gate
  (`scripts/check-identity-leak.mjs --staged`); the documentation gates
  (`scripts/docs-gates.mjs --staged`, run only when documentation or one of its
  checkers is staged); and the typecheck+build gate, path-scoped to `ui-desktop/`.
- `pre-push` — the identity-leak gate over the actual commit range and content
  about to become public (`--diff` and `--commits`); then the full documentation
  gate set (`scripts/docs-gates.mjs`, including the history-dependent gates
  `--staged` skips). Either one blocks the push.
