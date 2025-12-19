#!/bin/bash
#
# Git With Intent - No Internal Tools in Runtime Check
#
# Ensures that forbidden internal tool references don't appear in user-visible code.
# Forbidden strings: beads, bd (as standalone), agentfs, AgentFS
#
# Exit code 0 = no violations
# Exit code 1 = violations found

set -e

echo "🔒 Checking for forbidden internal tool references..."
echo ""

# Directories to check (user-visible code)
CHECK_DIRS="apps packages infra .github docs"

# Pattern matches:
# - beads (case insensitive word boundary)
# - bd followed by space or end (standalone command references)
# - agentfs (case insensitive)
PATTERN="(^|[^a-zA-Z])(beads|bd |agentfs)([^a-zA-Z]|$)"

# Run the check
VIOLATIONS=$(rg -i -n "$PATTERN" $CHECK_DIRS 2>/dev/null || true)

if [ -n "$VIOLATIONS" ]; then
    echo "❌ VIOLATION: Found forbidden internal tool references:"
    echo ""
    echo "$VIOLATIONS"
    echo ""
    echo "These terms must be removed from user-visible code:"
    echo "  - beads, bd (internal task tracker)"
    echo "  - agentfs, AgentFS (internal state system)"
    echo ""
    echo "Fix: Remove or replace these references with neutral language."
    exit 1
fi

echo "✅ No forbidden internal tool references found"
exit 0
