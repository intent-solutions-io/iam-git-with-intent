#!/usr/bin/env bash
# Stop hook: Check for unclosed in_progress beads before session ends

if ! command -v bd &> /dev/null || [ ! -d .beads ]; then
  exit 0  # No beads configured, skip
fi

IN_PROGRESS=$(bd list --status in_progress 2>/dev/null | wc -l)

if [ "$IN_PROGRESS" -gt 0 ]; then
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "⚠️  BEADS WARNING: $IN_PROGRESS task(s) still in_progress"
  echo "════════════════════════════════════════════════════════════"
  bd list --status in_progress 2>/dev/null
  echo ""
  echo "Before ending session, close completed beads:"
  echo "  bd close <id> -r \"Completed: <evidence>\""
  echo "  bd sync"
  echo "════════════════════════════════════════════════════════════"
fi
