#!/usr/bin/env bash
#
# CI Guard: Verify AgentFS is NOT in runtime code paths
#
# AgentFS is INTERNAL DEV TOOLING ONLY. Production code MUST NOT depend on it.
# See CLAUDE.md "Golden Rule": Any user-visible code path MUST work without AgentFS or Beads.
#
# This script fails if AgentFS imports are found in runtime code paths.
#
set -e

echo "=== AgentFS Runtime Guard ==="
echo "Checking that AgentFS is not imported in runtime code paths..."
echo ""

# Runtime directories that MUST NOT contain AgentFS imports
RUNTIME_DIRS=(
  "apps/cli/src"
  "apps/gateway/src"
  "apps/api/src"
  "apps/github-webhook/src"
  "apps/web/src"
  "packages/core/src"
  "packages/agents/src"
  "packages/engine/src"
  "packages/integrations/src"
)

# Patterns that indicate AgentFS usage
FORBIDDEN_PATTERNS=(
  "agentfs-sdk"
  "AgentFsRunIndexStore"
  "from.*agentfs"
  "import.*agentfs"
  "require.*agentfs"
)

VIOLATIONS=0

for dir in "${RUNTIME_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
      # Search for pattern, excluding test files and internal directories
      matches=$(grep -r -l --include="*.ts" --include="*.tsx" --include="*.js" \
        -E "$pattern" "$dir" 2>/dev/null | grep -v "__tests__" | grep -v ".test." | grep -v "internal/" || true)

      if [ -n "$matches" ]; then
        echo "ERROR: AgentFS pattern '$pattern' found in runtime code:"
        echo "$matches" | sed 's/^/  - /'
        VIOLATIONS=$((VIOLATIONS + 1))
      fi
    done
  fi
done

echo ""

if [ $VIOLATIONS -gt 0 ]; then
  echo "FAILED: Found $VIOLATIONS AgentFS violation(s) in runtime code!"
  echo ""
  echo "AgentFS is internal dev tooling ONLY. Production code MUST NOT depend on it."
  echo "See CLAUDE.md 'Golden Rule' for details."
  exit 1
fi

echo "PASSED: No AgentFS imports found in runtime code paths."
echo ""
exit 0
