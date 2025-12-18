#!/usr/bin/env bash
#
# Agents Verify Hook - Validates subagent files exist and contain required sections
#
set -euo pipefail

AGENTS_DIR=".claude/agents"
REQUIRED_AGENTS=(
    "foreman.md"
    "planner.md"
    "engine-core.md"
    "connector-engineer.md"
    "reviewer.md"
    "docs-filer.md"
    "ops-arv.md"
)

ERRORS=0

echo "=== Subagents Verification ==="
echo ""

# Check agents directory exists
echo -n "Agents directory: "
if [[ -d "$AGENTS_DIR" ]]; then
    echo "OK ($AGENTS_DIR)"
else
    echo "MISSING"
    echo "  Create: mkdir -p $AGENTS_DIR"
    ((ERRORS++))
fi

# Check required agent files
echo ""
echo "Required agents:"
for agent in "${REQUIRED_AGENTS[@]}"; do
    echo -n "  $agent: "
    if [[ -f "$AGENTS_DIR/$agent" ]]; then
        echo "OK"
    else
        echo "MISSING"
        ((ERRORS++))
    fi
done

# Check for Beads-first content
echo ""
echo "Beads-first compliance:"
for agent in "${REQUIRED_AGENTS[@]}"; do
    if [[ -f "$AGENTS_DIR/$agent" ]]; then
        echo -n "  $agent: "
        if grep -q "Beads-first\|bd onboard\|bd ready\|bd sync" "$AGENTS_DIR/$agent" 2>/dev/null; then
            echo "OK"
        else
            echo "MISSING Beads section"
            ((ERRORS++))
        fi
    fi
done

# Check for AgentFS-first content
echo ""
echo "AgentFS-first compliance:"
for agent in "${REQUIRED_AGENTS[@]}"; do
    if [[ -f "$AGENTS_DIR/$agent" ]]; then
        echo -n "  $agent: "
        if grep -q "AgentFS-first\|agents/gwi\|agentfs:mount" "$AGENTS_DIR/$agent" 2>/dev/null; then
            echo "OK"
        else
            echo "MISSING AgentFS section"
            ((ERRORS++))
        fi
    fi
done

# Check AGENTS.md mentions required concepts
echo ""
echo "AGENTS.md compliance:"
if [[ -f "AGENTS.md" ]]; then
    echo -n "  Beads mention: "
    if grep -qi "beads\|bd onboard\|bd ready" AGENTS.md 2>/dev/null; then
        echo "OK"
    else
        echo "MISSING"
        ((ERRORS++))
    fi

    echo -n "  AgentFS mention: "
    if grep -qi "agentfs\|agents/gwi" AGENTS.md 2>/dev/null; then
        echo "OK"
    else
        echo "MISSING"
        ((ERRORS++))
    fi
else
    echo "  AGENTS.md: MISSING"
    ((ERRORS++))
fi

# Check CLAUDE.md mentions required concepts
echo ""
echo "CLAUDE.md compliance:"
if [[ -f "CLAUDE.md" ]]; then
    echo -n "  Beads mention: "
    if grep -qi "beads\|bd " CLAUDE.md 2>/dev/null; then
        echo "OK"
    else
        echo "MISSING"
        ((ERRORS++))
    fi

    echo -n "  AgentFS mention: "
    if grep -qi "agentfs" CLAUDE.md 2>/dev/null; then
        echo "OK"
    else
        echo "MISSING"
        ((ERRORS++))
    fi

    echo -n "  Subagents mention: "
    if grep -qi "subagent\|foreman" CLAUDE.md 2>/dev/null; then
        echo "OK"
    else
        echo "MISSING"
        ((ERRORS++))
    fi
else
    echo "  CLAUDE.md: MISSING"
    ((ERRORS++))
fi

echo ""

if [[ "$ERRORS" -gt 0 ]]; then
    echo "AGENTS VERIFICATION FAILED: $ERRORS error(s)"
    exit 1
else
    echo "AGENTS VERIFICATION PASSED"
    exit 0
fi
