#!/usr/bin/env bash
#
# Context Compaction Check
#
# Validates context capsule exists and is within line limit.
#
set -uo pipefail

CAPSULE="docs/context-capsule.md"
MAX_LINES=250

echo "=== Context Capsule Check ==="

if [[ ! -f "$CAPSULE" ]]; then
    echo "WARNING: $CAPSULE does not exist"
    echo "  Create it to keep agent context compact"
    exit 0
fi

LINES=$(wc -l < "$CAPSULE")
echo "Capsule: $CAPSULE ($LINES lines)"

if [[ "$LINES" -gt "$MAX_LINES" ]]; then
    echo "WARNING: Capsule exceeds $MAX_LINES lines"
    echo "  Compact it to prevent context drift"
fi

echo ""
echo "Reminder: Update capsule if new constraints were introduced"
