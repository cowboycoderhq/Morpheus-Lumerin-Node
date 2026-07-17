#!/bin/bash
# Liveness check: is the RUNNING app newer than the built code?
# electron-vite dev rebuilds main/preload but does NOT restart Electron
# (learnings 2026-07-13) — the operator once QA'd day-stale main code for a
# full day. "The app restarted" is a claim; this is the observation.
#
# usage: liveness.sh <app-dir> [--proc-regex RE]
#   exit 0 = FRESH (every matching process is newer than the newest artifact)
#   exit 1 = STALE, NO-PROCESS, or NO-BUILD (all three falsify "it's running the fix")
set -u
APPDIR=""; PROC_RE=""
while [ $# -gt 0 ]; do case "$1" in
  --proc-regex) PROC_RE="${2:?}"; shift 2;;
  *) APPDIR="$1"; shift;;
esac; done
[ -n "$APPDIR" ] || { echo "usage: liveness.sh <app-dir> [--proc-regex RE]" >&2; exit 64; }
APPDIR=$(cd "$APPDIR" 2>/dev/null && pwd) || { echo "LIVENESS: NO-BUILD — $1 is not a directory" >&2; exit 1; }
[ -n "$PROC_RE" ] || PROC_RE="[Ee]lectron.*${APPDIR}|${APPDIR}.*[Ee]lectron"

NEWEST=$(find "$APPDIR/out" -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) -exec stat -f %m {} + 2>/dev/null | sort -n | tail -1)
[ -n "$NEWEST" ] || { echo "LIVENESS: NO-BUILD — no build artifacts under $APPDIR/out" >&2; exit 1; }

FOUND=0; STALE=0
while IFS= read -r line; do
  L=$(printf '%s' "$line" | awk '{print $1" "$2" "$3" "$4" "$5}')
  PID=$(printf '%s' "$line" | awk '{print $6}')
  START=$(date -j -f "%a %b %d %T %Y" "$L" +%s 2>/dev/null) || continue
  FOUND=1
  if [ "$START" -lt "$NEWEST" ]; then
    STALE=1
    echo "LIVENESS: STALE — pid $PID started $(date -r "$START" '+%F %T') but out/ was built $(date -r "$NEWEST" '+%F %T'); the running app predates the code. Relaunch it."
  fi
done < <(ps -axo lstart=,pid=,command= | grep -E "$PROC_RE" | grep -v grep | grep -v "liveness.sh" | tr -s ' ')

if [ "$FOUND" -eq 0 ]; then
  echo "LIVENESS: NO-PROCESS — nothing running matches ($PROC_RE). A 'restarted' claim is false until it runs."
  exit 1
fi
[ "$STALE" -eq 1 ] && exit 1
echo "LIVENESS: FRESH — every matching process started after the newest build artifact."
exit 0
