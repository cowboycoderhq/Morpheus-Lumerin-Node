#!/bin/bash
# Claim gate (Stop hook, exit 2 blocks). Mechanizes the rule the 2026-07-13
# post-mortem verification demanded: a message telling the operator a behavior
# changed must cite an observation (evidence file, VERIFY/LIVENESS line, driver
# log, screenshot) or carry an explicit "unverified" label. The gate fires
# without anyone's in-the-moment discipline — that discipline is the broken
# part it replaces. Claude Code's built-in 8-block cap is the loop breaker.
#
# --selftest: run three synthetic messages through the matcher and exit 0 iff
# the gate blocks the naked claim and passes the other two.

CLAIMS='\b(fixed( it)?|now works|works now|working now|it works|should work now|is live|live now|is working|resolved|repaired|back up|up and running|restarted|try it( now)?|picked up the (fix|change))\b'
EVIDENCE='(unverified|UNVERIFIED|VERIFY: (PASS|[0-9])|verify/[A-Za-z0-9._-]+\.md|selftest|LIVENESS: (FRESH|STALE|NO-)|lstart|\.png\b|driver log|evidence file|exit code [0-9]|✅ (test|build|typecheck))'

check() {  # $1 = message text; returns 2 to block, 0 to allow
  printf '%s' "$1" | python3 -c "
import re, sys
msg = sys.stdin.read()
claims = re.compile(r'''$CLAIMS''', re.I)
evidence = re.compile(r'''$EVIDENCE''')
sys.exit(2 if (claims.search(msg) and not evidence.search(msg)) else 0)
"
}

if [ "${1:-}" = "--selftest" ]; then
  check "The buttons are fixed and live — try it."; A=$?
  check "The buttons are fixed — evidence: verify/main-ab12cd34.md, VERIFY: PASS."; B=$?
  check "I refactored the theme tokens; review when you can."; C=$?
  if [ "$A" -eq 2 ] && [ "$B" -eq 0 ] && [ "$C" -eq 0 ]; then
    echo "claim-gate selftest: PASS (naked claim blocked; evidenced claim and neutral message allowed)"
    exit 0
  fi
  echo "claim-gate selftest: FAIL (naked=$A evidenced=$B neutral=$C — want 2/0/0)" >&2
  exit 1
fi

INPUT=$(cat)
MSG=$(printf '%s' "$INPUT" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("last_assistant_message") or "")' 2>/dev/null)
[ -z "$MSG" ] && exit 0

check "$MSG"
if [ $? -eq 2 ]; then
  echo "CLAIM GATE: this message claims a behavior changed but cites no observation." >&2
  echo "Either cite evidence (verify/<branch>-<hash>.md line, VERIFY: PASS, LIVENESS: FRESH," >&2
  echo "a driver log line, a screenshot path) or label the claim explicitly 'unverified'." >&2
  echo "Producing the observation: cd tools/ui-verify && node run.js --routes '<route>'" >&2
  echo "  (declared interactions: --click 'sel => expectSel'; dev-app freshness: ./liveness.sh <app-dir>)" >&2
  exit 2
fi
exit 0
