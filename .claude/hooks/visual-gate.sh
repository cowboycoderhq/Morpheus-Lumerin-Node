#!/bin/bash
# Conditional visual gate (PreToolUse on Bash). Blocks `git commit` when the
# staged diff touches visual files and no verify-evidence exists for THIS staged
# state. Exit 2 blocks; exit 0 allows. (Exit 1 would NOT block — never use it here.)
# Skip is allowed only by writing the justification into the evidence file —
# skipping is visible, never silent.

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)

case "$CMD" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

REPO=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$REPO" || exit 0

# Only gate visual diffs: tsx/css/theme under the renderer
VISUAL=$(git diff --cached --name-only | grep -E '\.(tsx|css)$|/theme\.' | grep -v '__tests__' || true)
[ -z "$VISUAL" ] && exit 0

BRANCH=$(git rev-parse --abbrev-ref HEAD | tr -c 'a-zA-Z0-9._-' '_' | sed 's/_$//')
HASH=$(git diff --cached | git hash-object --stdin | cut -c1-8)
EVIDENCE="$REPO/verify/${BRANCH}-${HASH}.md"

if [ -f "$EVIDENCE" ]; then
  exit 0
fi

echo "VISUAL GATE: blocked. Staged diff touches visual files:" >&2
echo "$VISUAL" | head -10 >&2
echo "" >&2
echo "No evidence file for this staged state: verify/${BRANCH}-${HASH}.md" >&2
echo "Run the Phase-D verify (skill: frontend-verify):" >&2
echo "  cd tools/ui-verify && node run.js --routes '#/' --label '<what changed>'" >&2
echo "(Evidence is keyed to the staged diff — re-verify after any further edit.)" >&2
echo "To skip: create that file with a written justification for why visual" >&2
echo "verification is not needed for this diff." >&2
exit 2
