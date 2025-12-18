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
echo "[ ] Route via foreman?         → .claude/agents/foreman.md"
echo "[ ] Update Beads?              → bd sync"
echo "[ ] Record AgentFS?            → agent id + mount path"
echo "[ ] Run ARV?                   → npm run arv"
echo "[ ] 000-docs flat?             → No subdirectories"
echo ""
echo "If phase complete:"
echo "    → Write AAR using docs/templates/aar-template.md"
echo "    → Save to 000-docs/NNN-AA-AACR-phase-<n>-description.md"
echo "    → Include Beads + AgentFS metadata"
echo ""
echo "Before pushing:"
echo "    bd sync"
echo "    npm run arv"
echo "    git add .beads/issues.jsonl"
echo "    git commit -m 'chore: ...' # Include bead ID"
echo ""
