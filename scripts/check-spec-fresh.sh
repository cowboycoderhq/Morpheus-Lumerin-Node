#!/usr/bin/env bash
# check-spec-fresh — proxy-router/docs/ must be what the Makefile's OWN swag
# invocation produces from the annotations in the source.
#
# The committed OpenAPI spec is generated, but nothing regenerated it and nothing
# compared it. It drifted once already and silently: `swag init` writes NO files
# when it errors, so `make swagger` left the stale spec in place and exited as if
# it had worked (see the comment above the `swagger:` target in
# proxy-router/Makefile).
#
# Three design points, each of which cost a real failure to establish. None is
# cosmetic; changing any one of them turns this into a check that cannot fail:
#
#   1. The scratch output directory's basename MUST be `docs`. swag names the
#      generated Go package after the output directory, so `-o $TMP/out` emits
#      `package out` and every run reports a permanent, unfixable diff on line 1.
#
#   2. `swag init` ONLY — never `make swagger`, whose `swag fmt` half REWRITES
#      tracked source in place. A check that mutates the tree it is checking is
#      not a check; it is a formatter that reports on its own output.
#
#   3. The flags are DERIVED from `make -n swagger`, never copied here. An
#      earlier draft hardcoded `--parseInternal` and printed PASS while
#      `--parseDependency` was restored to the Makefile — the exact defect the
#      Makefile comment exists to prevent, cleared by the gate that existed to
#      catch it. Deriving them means the gate re-reads the real command every
#      run, so a flag change is measured rather than assumed.
#
# Exit 0 = fresh. 1 = stale (or swag refused to generate). 2 = could not run,
# which is NOT a pass: a check that cannot execute has cleared nothing.
set -uo pipefail

SELFTEST=0
ROOT=""
for a in "$@"; do
  case "$a" in
    --selftest) SELFTEST=1 ;;
    -*) echo "usage: check-spec-fresh.sh [repo-root] [--selftest]" >&2; exit 2 ;;
    *) ROOT="$a" ;;
  esac
done
if [ -z "$ROOT" ]; then
  ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    echo "SPEC-FRESH: could not run — no repo root given and not inside a git tree." >&2; exit 2; }
fi

# ---------------------------------------------------------------- the check
# Compares $1/proxy-router/docs against a fresh generation. Prints its own
# verdict. Returns 0 fresh / 1 stale / 2 cannot-run.
spec_fresh() {
  local root="$1" prefix="${2:-}"
  local tmp init rc=0 f
  command -v swag >/dev/null 2>&1 || {
    echo "${prefix}SPEC-FRESH: could not run — swag is not on PATH." >&2
    echo "${prefix}            install the pinned version, do not skip:" >&2
    echo "${prefix}            go install github.com/swaggo/swag/cmd/swag@v1.16.4" >&2
    return 2; }
  [ -d "$root/proxy-router" ] || { echo "${prefix}SPEC-FRESH: could not run — no proxy-router/ under $root" >&2; return 2; }

  tmp="$(mktemp -d)" || return 2
  # basename MUST be `docs` — see design point 1 above.
  mkdir -p "$tmp/docs" || { rm -rf "$tmp"; return 2; }

  # Design point 3: take the real `swag init ...` out of the target rather than
  # restating it. `make -n` prints the recipe without running it, `tr '&'`
  # splits the `swag fmt && swag init` conjunction so only the init half is
  # taken (design point 2), and any `-o` the target sets is stripped so ours is
  # the only one — two -o flags would silently write to the target's directory,
  # i.e. over the tracked spec this is supposed to be comparing against.
  init="$(cd "$root/proxy-router" && make -n swagger 2>/dev/null \
          | tr '&' '\n' | grep -E '^[[:space:]]*swag init' | head -1 \
          | sed -E 's/[[:space:]]-o[[:space:]]+[^[:space:]]+//g')"
  if [ -z "$init" ]; then
    echo "${prefix}SPEC-FRESH: could not run — no 'swag init' line in \`make -n swagger\`." >&2
    echo "${prefix}            The target moved or was renamed. Update this check; do not delete it." >&2
    rm -rf "$tmp"; return 2
  fi
  echo "${prefix}spec-fresh: swag $(swag --version 2>/dev/null | tr -d '\n')"
  echo "${prefix}spec-fresh: derived from \`make -n swagger\`:$init"

  if ! (cd "$root/proxy-router" && eval "$init -o \"$tmp/docs\"") >"$tmp/gen.log" 2>&1; then
    echo "${prefix}SPEC-FRESH: FAIL — the Makefile's swag invocation exits nonzero." >&2
    echo "${prefix}            swag emits NO files on error, so \`make swagger\` would leave the" >&2
    echo "${prefix}            committed spec untouched and the stale spec would ship silently." >&2
    sed 's/^/'"${prefix}"'            /' "$tmp/gen.log" | tail -4 >&2
    rm -rf "$tmp"; return 1
  fi

  for f in docs.go swagger.json swagger.yaml; do
    # Belt to the exit-code braces: a zero exit with no file is the failure
    # shape this whole check exists for, and `cmp` would report it as "stale",
    # which points the reader at the wrong file.
    if [ ! -f "$tmp/docs/$f" ]; then
      echo "${prefix}SPEC-FRESH: FAIL — swag exited 0 but emitted no $f." >&2
      rc=1; continue
    fi
    if [ ! -f "$root/proxy-router/docs/$f" ]; then
      echo "${prefix}SPEC-FRESH: FAIL — proxy-router/docs/$f is not committed at all." >&2
      rc=1; continue
    fi
    if ! cmp -s "$tmp/docs/$f" "$root/proxy-router/docs/$f"; then
      echo "${prefix}SPEC-FRESH: FAIL — proxy-router/docs/$f is stale." >&2
      echo "${prefix}            regenerate with: cd proxy-router && make swagger" >&2
      diff -u "$root/proxy-router/docs/$f" "$tmp/docs/$f" | sed 's/^/'"${prefix}"'            /' | head -20 >&2
      rc=1
    fi
  done
  rm -rf "$tmp"
  [ $rc -eq 0 ] && echo "${prefix}SPEC-FRESH: PASS (docs/ matches the Makefile's own swag output)"
  return $rc
}

# ---------------------------------------------------------------- selftest
# A detector observed only passing is not known to fire. This plants the two
# defect shapes the gate exists for into a COPY of the tree — never the real one
# — and requires a nonzero exit from each, plus a zero exit from the untouched
# copy. Without the pristine arm a script that returns FAIL unconditionally
# would score a perfect selftest.
if [ "$SELFTEST" = "1" ]; then
  echo "---------------------------------------------------------------- selftest"
  WORK="$(mktemp -d)" || { echo "SELFTEST: FAIL (no temp dir)"; exit 1; }
  trap 'rm -rf "$WORK"' EXIT
  mkdir -p "$WORK/tree"
  cp -R "$ROOT/proxy-router" "$WORK/tree/proxy-router" || { echo "SELFTEST: FAIL (copy)"; exit 1; }
  T="$WORK/tree"
  BAD=0
  arm() { # arm <label> <want: pass|fail>
    local label="$1" want="$2" code
    spec_fresh "$T" "      " >/dev/null 2>&1; code=$?
    if [ "$want" = "pass" ] && [ "$code" -eq 0 ]; then echo "  ok   $label"
    elif [ "$want" = "fail" ] && [ "$code" -ne 0 ]; then echo "  ok   $label (exit $code)"
    else echo "  FAIL $label — wanted $want, got exit $code"; BAD=1; fi
  }

  # The annotation file is FOUND, not named: the annotations live across five
  # internal/*/controller*.go files and a hardcoded path here would make the
  # planted defect land in a file swag never reads, so every arm would "pass"
  # by mutating nothing.
  ANN="$(grep -rl '@Summary' "$T/internal" 2>/dev/null | head -1)"
  [ -n "$ANN" ] || ANN="$(grep -rl '@Summary' "$T/proxy-router/internal" 2>/dev/null | head -1)"
  if [ -z "$ANN" ]; then echo "  FAIL could not locate any @Summary annotation to mutate"; echo "SELFTEST: FAIL"; exit 1; fi
  SEC="$(grep -rl '@Security' "$T/proxy-router/internal" 2>/dev/null | head -1)"

  # ---- arm 1: the negative control. Without it, a script that returns FAIL
  # unconditionally scores a perfect selftest.
  arm "arm 1 pristine copy            — a clean tree must PASS" pass

  # ---- arm 2: a changed @Summary must move the generated spec.
  cp "$ANN" "$WORK/ann.bak"
  perl -0pi -e 's/\@Summary(\s+)/\@Summary$1SELFTEST-MUTATED /' "$ANN"
  cmp -s "$ANN" "$WORK/ann.bak" && { echo "  FAIL arm 2 planted nothing — the @Summary edit did not change the file"; BAD=1; }
  arm "arm 2 changed @Summary          — must FAIL" fail
  cp "$WORK/ann.bak" "$ANN"

  # ---- arm 3: a REMOVED @Security annotation. Deletion is the direction that
  # matters: it silently widens the documented auth surface.
  if [ -n "$SEC" ]; then
    cp "$SEC" "$WORK/sec.bak"
    perl -0pi -e 's/^.*\@Security.*\n//m' "$SEC"
    cmp -s "$SEC" "$WORK/sec.bak" && { echo "  FAIL arm 3 planted nothing — the @Security line was not removed"; BAD=1; }
    arm "arm 3 removed @Security         — must FAIL" fail
    cp "$WORK/sec.bak" "$SEC"
  else
    echo "  FAIL arm 3 no @Security annotation found to remove"; BAD=1
  fi

  # ---- arm 4: --parseDependency restored to the Makefile. The draft that
  # hardcoded its flags printed PASS on exactly this.
  cp "$T/proxy-router/Makefile" "$WORK/mk.bak"
  perl -0pi -e 's/(swag init -g [^\n]*?--parseInternal)/$1 --parseDependency/' "$T/proxy-router/Makefile"
  cmp -s "$T/proxy-router/Makefile" "$WORK/mk.bak" && { echo "  FAIL arm 4 planted nothing — --parseDependency was not added"; BAD=1; }
  arm "arm 4 --parseDependency restored — must FAIL" fail
  cp "$WORK/mk.bak" "$T/proxy-router/Makefile"

  # ---- arm 5: the committed artefact hand-edited. Drift arrives from either side.
  cp "$T/proxy-router/docs/swagger.json" "$WORK/spec.bak"
  printf '\n' >> "$T/proxy-router/docs/swagger.json"
  arm "arm 5 committed spec hand-edited — must FAIL" fail
  cp "$WORK/spec.bak" "$T/proxy-router/docs/swagger.json"

  if [ "$BAD" -ne 0 ]; then echo "SELFTEST: FAIL"; exit 1; fi
  echo "SELFTEST: PASS (5 arms — one pristine control, four planted defects)"
  exit 0
fi

spec_fresh "$ROOT"
CODE=$?
echo "GATE-VERDICT: $( [ $CODE -eq 0 ] && echo 'SPEC-FRESH: PASS (generated spec matches the annotations)' || echo "SPEC-FRESH: exit $CODE — see above" )"
exit $CODE
