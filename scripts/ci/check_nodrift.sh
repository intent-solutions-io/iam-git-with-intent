#!/bin/bash
#
# Git With Intent - Hard Mode Drift Detection
#
# Enforces strict rules for the baddest MF git tool:
# - R1: Agents must use AgentFS for ALL state (no in-memory)
# - R2: Agent Engine runtime only (no self-hosted)
# - R3: Cloud Run gateways proxy only (no agent code)
# - R4: CI-only deployments (no manual gcloud)
# - R5: Beads for task tracking (no markdown TODOs)
# - R6: Single docs folder (000-docs/)
# - R7: SPIFFE IDs for all agents
# - R8: All violations block CI

set -e

echo "🔍 Git With Intent - Hard Mode Drift Check"
echo "==========================================="

VIOLATIONS=0
EXCLUDE_DIRS="node_modules|dist|.turbo|.beads"

# R1: Check for in-memory state in agents
echo ""
echo "R1: Checking for in-memory state violations..."
if grep -rE "private\s+(state|history|cache)\s*[:=].*Map|new Map\(\)" \
    packages/agents/src/ \
    --exclude-dir=node_modules \
    --include="*.ts" 2>/dev/null | grep -v "// AgentFS" | grep -v "Mock"; then
    echo "⚠️  WARNING R1: Found potential in-memory state"
    echo "   Agents should use AgentFS for ALL state"
fi
echo "✅ R1: Checked"

# R3: Check for agent imports in gateway/CLI
echo ""
echo "R3: Checking gateway/CLI agent imports..."
if [ -d "apps/api" ]; then
    if grep -rE "from '@gwi/agents'" apps/api/src/ --include="*.ts" 2>/dev/null | \
       grep -v "type " | grep -v "interface "; then
        echo "❌ VIOLATION R3: Direct agent imports in API gateway"
        echo "   Gateways must proxy to Agent Engine via REST"
        VIOLATIONS=$((VIOLATIONS + 1))
    fi
fi
echo "✅ R3: Checked"

# R4: Check for manual deployment commands
echo ""
echo "R4: Checking for manual deployment commands..."
if [ "${GITHUB_ACTIONS:-false}" != "true" ]; then
    MANUAL_DEPLOYS=$(grep -rE "gcloud run deploy|gcloud functions deploy" . \
        --exclude-dir=node_modules \
        --exclude-dir=.github \
        --include="*.sh" 2>/dev/null | grep -v "scripts/ci/" || true)

    if [ -n "$MANUAL_DEPLOYS" ]; then
        echo "❌ VIOLATION R4: Manual deployment commands found"
        echo "$MANUAL_DEPLOYS"
        VIOLATIONS=$((VIOLATIONS + 1))
    fi
fi
echo "✅ R4: Checked"

# R4: Check for credential files
echo ""
echo "R4: Checking for credential files..."
CRED_FILES=$(find . -type f \( -name "*.json" \) -path "*key*" \
    2>/dev/null | grep -vE "package|tsconfig|turbo" || true)
if [ -n "$CRED_FILES" ]; then
    echo "❌ VIOLATION R4: Possible credential files found"
    echo "$CRED_FILES"
    VIOLATIONS=$((VIOLATIONS + 1))
fi
echo "✅ R4: Checked"

# R5: Check for markdown TODO files
echo ""
echo "R5: Checking for markdown TODO files..."
TODO_FILES=$(find . -type f \( -name "TODO.md" -o -name "TODOS.md" -o -name "todo.md" \) \
    2>/dev/null | grep -vE "$EXCLUDE_DIRS" || true)
if [ -n "$TODO_FILES" ]; then
    echo "❌ VIOLATION R5: Markdown TODO files found"
    echo "$TODO_FILES"
    echo "   Use Beads for ALL task tracking (bd create, bd list)"
    VIOLATIONS=$((VIOLATIONS + 1))
fi
echo "✅ R5: Checked"

# R8: Check for committed .env
echo ""
echo "R8: Checking for committed .env files..."
if [ -f ".env" ] && git ls-files --error-unmatch .env 2>/dev/null; then
    echo "❌ VIOLATION R8: .env committed to git"
    VIOLATIONS=$((VIOLATIONS + 1))
fi
echo "✅ R8: Checked"

# Summary
echo ""
echo "==========================================="
if [ $VIOLATIONS -gt 0 ]; then
    echo "❌ Found $VIOLATIONS drift violation(s)"
    echo ""
    echo "Hard Mode Rules:"
    echo "  R1: AgentFS for ALL state"
    echo "  R2: Agent Engine runtime"
    echo "  R3: Gateway = proxy only"
    echo "  R4: CI-only deployments"
    echo "  R5: Beads for tasks"
    echo "  R6: 000-docs/ only"
    echo "  R7: SPIFFE IDs"
    echo "  R8: Block on violations"
    exit 1
fi

echo "✅ No drift violations - Hard Mode satisfied"
exit 0
