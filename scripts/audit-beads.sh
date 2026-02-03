#!/usr/bin/env bash
# Beads Audit Script - Detect stale beads and implementation gaps
# Run weekly or before releases to ensure tracking alignment

set -e

echo "=== Beads Audit Report ==="
echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Check if bd is available
if ! command -v bd &> /dev/null; then
  echo "ERROR: beads CLI (bd) not found"
  exit 1
fi

# Section 1: Summary Stats
echo "--- Summary ---"
TOTAL_OPEN=$(bd list --status open 2>/dev/null | wc -l || echo "0")
TOTAL_IN_PROGRESS=$(bd list --status in_progress 2>/dev/null | wc -l || echo "0")
TOTAL_CLOSED=$(bd list --status closed 2>/dev/null | wc -l || echo "0")
echo "Open beads: $TOTAL_OPEN"
echo "In progress: $TOTAL_IN_PROGRESS"
echo "Closed: $TOTAL_CLOSED"
echo ""

# Section 2: In-Progress Beads (should have recent activity)
echo "--- In-Progress Beads ---"
if [ "$TOTAL_IN_PROGRESS" -gt 0 ]; then
  bd list --status in_progress 2>/dev/null || echo "  (none)"
else
  echo "  (none)"
fi
echo ""

# Section 3: Connector Implementation Status
echo "--- Connector Directory Analysis ---"
CONNECTOR_DIR="packages/connectors/src"
if [ -d "$CONNECTOR_DIR" ]; then
  echo "Implemented connectors (with file count):"
  for dir in "$CONNECTOR_DIR"/*/; do
    if [ -d "$dir" ]; then
      connector=$(basename "$dir")
      file_count=$(find "$dir" -name "*.ts" 2>/dev/null | wc -l)
      test_count=$(find "$dir" -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | wc -l)
      echo "  - $connector: $file_count files ($test_count tests)"
    fi
  done
else
  echo "  Connector directory not found: $CONNECTOR_DIR"
fi
echo ""

# Section 4: Open Epics with Matching Implementations
echo "--- Potential Gaps (Open Epics with Implemented Code) ---"
echo "Checking for implemented features with open tracking beads..."

# Known patterns to check
declare -A PATTERNS=(
  ["slack"]="EPIC.*Slack"
  ["jira"]="EPIC.*Jira"
  ["linear"]="EPIC.*Linear"
  ["secrets"]="EPIC.*Secret"
  ["github"]="EPIC.*GitHub"
  ["gitlab"]="EPIC.*GitLab"
)

for connector in "${!PATTERNS[@]}"; do
  if [ -d "$CONNECTOR_DIR/$connector" ]; then
    pattern="${PATTERNS[$connector]}"
    # Check if there's an open bead matching this pattern
    open_bead=$(bd list --status open 2>/dev/null | grep -iE "$pattern" || echo "")
    if [ -n "$open_bead" ]; then
      echo "  POTENTIAL GAP: $connector/ exists but bead still open:"
      echo "    $open_bead"
    fi
  fi
done
echo ""

# Section 5: Stale Open Beads
echo "--- Stale Beads (Open with no recent activity) ---"
echo "Note: Beads open > 30 days should be reviewed"
bd list --status open 2>/dev/null | head -10 || echo "  (none)"
if [ "$TOTAL_OPEN" -gt 10 ]; then
  echo "  ... and $((TOTAL_OPEN - 10)) more"
fi
echo ""

# Section 6: Sync Status
echo "--- Beads Sync Status ---"
if bd info 2>/dev/null | grep -q "sync"; then
  bd info 2>/dev/null | grep -E "(sync|branch)" || echo "  Sync info not available"
else
  echo "  Sync not configured"
fi
echo ""

echo "=== Audit Complete ==="
