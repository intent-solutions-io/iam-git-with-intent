#!/bin/bash
# PRE-FLIGHT VERIFICATION (workspace/ resting zone)
# Run from repo root. Exits non-zero on any hard failure.

set -euo pipefail

REST_ROOT="workspace"
REST_ZONE="${REST_ROOT}/rest-zone"
DEVTOOLS="${REST_ROOT}/devtools"

echo "== 0) Repo + commit =="
pwd
git rev-parse HEAD
git status -sb

echo "== 1) Resting zone exists (workspace/) =="
test -d "${REST_ROOT}" && echo "OK: ${REST_ROOT} exists" || { echo "FAIL: ${REST_ROOT} missing"; exit 1; }
test -d "${REST_ZONE}" && echo "OK: ${REST_ZONE} exists" || { echo "FAIL: ${REST_ZONE} missing"; exit 1; }
test -d "${DEVTOOLS}" && echo "OK: ${DEVTOOLS} exists" || { echo "FAIL: ${DEVTOOLS} missing"; exit 1; }

echo "== 2) Ensure workspace/** is excluded from shipping/build contexts =="
echo "-- Docker ignores --"
if test -f .dockerignore; then
  if grep -qE "^workspace" .dockerignore; then
    echo "OK: .dockerignore excludes workspace/"
    grep -n "workspace" .dockerignore
  else
    echo "FAIL: .dockerignore does NOT exclude workspace/"
  fi
else
  echo "WARN: .dockerignore missing"
fi

echo "-- Firebase ignores --"
if test -f .firebaseignore; then
  if grep -qE "^workspace" .firebaseignore; then
    echo "OK: .firebaseignore excludes workspace/"
    grep -n "workspace" .firebaseignore
  else
    echo "FAIL: .firebaseignore does NOT exclude workspace/"
  fi
else
  echo "WARN: .firebaseignore missing"
fi

echo "== 3) HARD LEAK CHECK: forbidden internal-tool terms in shipped paths (must be ZERO) =="
FORBIDDEN=$(grep -rn -E "(^|[^a-zA-Z])(agentfs|AgentFS|beads|bd )([^a-zA-Z]|$)" apps packages infra .github docs 2>/dev/null || true)
if [ -n "$FORBIDDEN" ]; then
  echo "FAIL: Forbidden terms found in shipped paths:"
  echo "$FORBIDDEN"
  exit 1
else
  echo "OK: No forbidden terms in shipped paths"
fi

echo "== 4) Allow workspace/** to contain internal terms (optional informational) =="
grep -rn -E "(agentfs|AgentFS|beads)" "${REST_ROOT}" 2>/dev/null || echo "OK: none found (or workspace empty)"

echo "== 5) Ensure runtime code does not import/exec internal tooling =="
RUNTIME_AGENTFS=$(grep -rn -E "from ['\"]agentfs['\"]|require\(['\"]agentfs['\"]\)|child_process\.(exec|execSync|spawn)\(.*agentfs" apps packages 2>/dev/null || true)
if [ -n "$RUNTIME_AGENTFS" ]; then
  echo "FAIL: Runtime appears to import/exec agentfs:"
  echo "$RUNTIME_AGENTFS"
  exit 1
else
  echo "OK: No runtime imports/exec of agentfs detected"
fi

echo "== 6) CI guard exists and is wired (must exist) =="
# Adjust path if your guard script lives elsewhere
GUARD_SCRIPT="scripts/ci/check_no_internal_tools.sh"
if test -f "${GUARD_SCRIPT}"; then
  echo "OK: Guard script exists at ${GUARD_SCRIPT}"
else
  echo "FAIL: Guard script missing at ${GUARD_SCRIPT}"
  exit 1
fi

# Verify workflows call it (or equivalent)
CI_WIRED=$(grep -rn -E "check_no_internal_tools|arv:no-internal-tools|FORBIDDEN.*agentfs" .github/workflows 2>/dev/null || true)
if [ -n "$CI_WIRED" ]; then
  echo "OK: CI appears wired to run the guard:"
  echo "$CI_WIRED"
else
  echo "WARN: CI may not be wired to run the guard script/check (check manually)"
fi

echo "== 7) Google-native posture quick scan (informational) =="
echo "-- Firestore usage --"
grep -rn "firestore\|firebase-admin" packages apps 2>/dev/null | head -n 10 || echo "WARN: no firestore hits found"
echo "-- Pub/Sub usage --"
grep -rn "pubsub" apps packages 2>/dev/null | head -n 5 || echo "WARN: no pubsub hits found"
echo "-- Secret Manager usage --"
grep -rn "secretmanager\|secret-manager" apps packages infra 2>/dev/null | head -n 5 || echo "WARN: no secret manager hits found"

echo ""
echo "== PREFLIGHT COMPLETE =="
echo "If any FAIL above: fix before using subagents."
echo "If all OK: safe to begin multi-subagent build."
