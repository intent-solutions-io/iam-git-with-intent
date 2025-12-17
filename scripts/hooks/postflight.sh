#!/usr/bin/env bash
#
# Postflight Hook - Reminder checklist after commands
#
# This never fails - it only prints reminders.
#
set -uo pipefail

echo ""
echo "=== GWI Postflight Reminders ==="
echo ""
echo "[ ] Did you route via foreman?"
echo "[ ] Did you update Beads?      → bd ready / bd sync"
echo "[ ] Did you remain in mount?   → agents/gwi"
echo "[ ] Did you run ARV?           → npm run arv"
echo "[ ] Artifacts saved?           → .gwi/runs/<runId>/..."
echo "[ ] 000-docs flat?             → No subdirectories"
echo "[ ] Context capsule updated?   → docs/context-capsule.md"
echo ""
echo "Before pushing:"
echo "    npm run arv"
echo "    bd sync"
echo "    git add .beads/issues.jsonl"
echo "    git commit -m 'chore: ...' # Include bead ID"
echo ""
