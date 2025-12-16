#!/bin/bash
#
# Git With Intent - Drift Detection (Quality Gates)
#
# This script has two modes:
#
# 1. STANDARD MODE (default): Runs checks that apply to ALL code
#    - Security checks (no credentials, no .env)
#    - Gateway architecture (no agent imports in gateways)
#
# 2. HARD MODE (HARD_MODE=true): Internal ops checks
#    - AgentFS state requirements
#    - Beads task tracking requirements
#    - These are OPT-IN for internal development
#
# Usage:
#   ./check_nodrift.sh              # Standard checks only
#   HARD_MODE=true ./check_nodrift.sh  # Full Hard Mode checks

set -e

echo "🔍 Git With Intent - Drift Check"
echo "==========================================="

VIOLATIONS=0
EXCLUDE_DIRS="node_modules|dist|.turbo|.beads|internal"

# Check if Hard Mode is enabled
if [ "$HARD_MODE" = "true" ]; then
    echo "⚡ HARD MODE ENABLED (internal ops checks)"
    echo ""
else
    echo "📋 Standard mode (public quality gates only)"
    echo "   Set HARD_MODE=true to enable internal ops checks"
    echo ""
fi

# =============================================================================
# STANDARD CHECKS (Always Run)
# =============================================================================

# Check for credential files (security)
echo "🔒 Checking for credential files..."
CRED_FILES=$(find . -type f \( -name "*.json" \) -path "*key*" \
    2>/dev/null | grep -vE "package|tsconfig|turbo|node_modules" || true)
if [ -n "$CRED_FILES" ]; then
    echo "❌ VIOLATION: Possible credential files found"
    echo "$CRED_FILES"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo "✅ No credential files"
fi

# Check for committed .env (security)
echo ""
echo "🔒 Checking for committed .env files..."
if [ -f ".env" ] && git ls-files --error-unmatch .env 2>/dev/null; then
    echo "❌ VIOLATION: .env committed to git"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo "✅ No committed .env files"
fi

# Check for direct agent imports in gateways
echo ""
echo "🏗️  Checking gateway architecture..."
if [ -d "apps/gateway" ]; then
    if grep -rE "from '@gwi/agents'" apps/gateway/src/ --include="*.ts" 2>/dev/null | \
       grep -v "type " | grep -v "interface "; then
        echo "❌ VIOLATION: Direct agent imports in gateway"
        echo "   Gateways should proxy to agent backend, not import agents directly"
        VIOLATIONS=$((VIOLATIONS + 1))
    else
        echo "✅ Gateway architecture OK"
    fi
else
    echo "✅ Gateway check skipped (no gateway app)"
fi

# Check for manual deployment commands outside CI
echo ""
echo "🚀 Checking for manual deployment scripts..."
if [ "${GITHUB_ACTIONS:-false}" != "true" ]; then
    MANUAL_DEPLOYS=$(grep -rE "gcloud run deploy|gcloud functions deploy" . \
        --exclude-dir=node_modules \
        --exclude-dir=.github \
        --exclude-dir=internal \
        --include="*.sh" 2>/dev/null | grep -v "scripts/ci/" || true)

    if [ -n "$MANUAL_DEPLOYS" ]; then
        echo "⚠️  WARNING: Manual deployment commands found (consider moving to CI)"
        echo "$MANUAL_DEPLOYS"
        # Not a violation in standard mode
    else
        echo "✅ No manual deployment scripts"
    fi
else
    echo "✅ Running in CI, deployment check skipped"
fi

# =============================================================================
# HARD MODE CHECKS (Internal Ops Only)
# =============================================================================

if [ "$HARD_MODE" = "true" ]; then
    echo ""
    echo "==========================================="
    echo "⚡ HARD MODE CHECKS (Internal Ops)"
    echo "==========================================="

    # R1: Check for in-memory state in agents (should use AgentFS)
    echo ""
    echo "R1: Checking for in-memory state violations..."
    if grep -rE "private\s+(state|history|cache)\s*[:=].*Map|new Map\(\)" \
        packages/agents/src/ \
        --exclude-dir=node_modules \
        --include="*.ts" 2>/dev/null | grep -v "// AgentFS" | grep -v "Mock" | grep -v "// internal"; then
        echo "⚠️  WARNING R1: Found potential in-memory state"
        echo "   Internal ops guideline: Use AgentFS for agent state"
        # Warning only, not a violation
    else
        echo "✅ R1: No in-memory state issues"
    fi

    # R5: Check for markdown TODO files (should use Beads)
    echo ""
    echo "R5: Checking for markdown TODO files..."
    TODO_FILES=$(find . -type f \( -name "TODO.md" -o -name "TODOS.md" -o -name "todo.md" \) \
        2>/dev/null | grep -vE "$EXCLUDE_DIRS" || true)
    if [ -n "$TODO_FILES" ]; then
        echo "⚠️  WARNING R5: Markdown TODO files found"
        echo "$TODO_FILES"
        echo "   Internal ops guideline: Use Beads (bd create, bd list)"
        # Warning only in Hard Mode, not blocking
    else
        echo "✅ R5: No markdown TODO files"
    fi

    # R6: Check docs are in 000-docs/
    echo ""
    echo "R6: Checking documentation location..."
    STRAY_DOCS=$(find . -maxdepth 2 -type f -name "*.md" \
        ! -path "./000-docs/*" \
        ! -path "./node_modules/*" \
        ! -path "./.git/*" \
        ! -name "README.md" \
        ! -name "CLAUDE.md" \
        ! -name "CHANGELOG.md" \
        ! -name "LICENSE.md" \
        2>/dev/null || true)
    if [ -n "$STRAY_DOCS" ]; then
        echo "⚠️  WARNING R6: Documentation files outside 000-docs/"
        echo "$STRAY_DOCS"
        echo "   Internal ops guideline: Keep docs in 000-docs/"
    else
        echo "✅ R6: Documentation in correct location"
    fi

    echo ""
    echo "==========================================="
    echo "Hard Mode checks complete (warnings only, not blocking)"
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "==========================================="
if [ $VIOLATIONS -gt 0 ]; then
    echo "❌ Found $VIOLATIONS violation(s)"
    echo ""
    echo "These are blocking issues that must be fixed:"
    echo "  - No credential files in repo"
    echo "  - No .env committed to git"
    echo "  - Gateways must not import agent code directly"
    exit 1
fi

echo "✅ All quality checks passed"
if [ "$HARD_MODE" = "true" ]; then
    echo "   (Hard Mode warnings are informational, not blocking)"
fi
exit 0
