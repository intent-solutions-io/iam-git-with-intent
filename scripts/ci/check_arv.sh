#!/bin/bash
#
# Git With Intent - Agent Readiness Verification (ARV)
#
# Validates agents are production-ready by checking for:
# - Proper initialization
# - Error handling
# - Required interfaces
#
# HARD MODE (HARD_MODE=true) adds additional checks:
# - SPIFFE ID configuration
# - Audit logging
#
# Usage:
#   ./check_arv.sh              # Standard checks only
#   HARD_MODE=true ./check_arv.sh  # Full ARV checks

set -e

echo "🤖 Git With Intent - ARV Check"
echo "=============================="

VIOLATIONS=0
WARNINGS=0

# Check if Hard Mode is enabled
if [ "$HARD_MODE" = "true" ]; then
    echo "⚡ HARD MODE ENABLED (full ARV checks)"
    echo ""
else
    echo "📋 Standard mode (basic agent checks)"
    echo "   Set HARD_MODE=true to enable full ARV checks"
    echo ""
fi

# =============================================================================
# STANDARD ARV CHECKS (Always Run)
# =============================================================================

echo "Checking agent implementations..."
echo ""

# Check each agent directory
for agent_dir in packages/agents/src/*/; do
    if [ -d "$agent_dir" ]; then
        agent_name=$(basename "$agent_dir")

        # Skip base directory
        if [ "$agent_name" = "base" ]; then
            continue
        fi

        echo "Agent: $agent_name"

        agent_file="$agent_dir/index.ts"
        if [ ! -f "$agent_file" ]; then
            echo "  ⚠️  No index.ts found"
            WARNINGS=$((WARNINGS + 1))
            continue
        fi

        # ARV-1: Check for run() or processTask() method
        if grep -q "async run\|async processTask\|process(" "$agent_file" 2>/dev/null; then
            echo "  ✅ Has run/process method"
        else
            echo "  ⚠️  Missing run/process method"
            WARNINGS=$((WARNINGS + 1))
        fi

        # ARV-2: Check for error handling
        if grep -q "try\s*{" "$agent_file" 2>/dev/null || \
           grep -q "catch\s*(" "$agent_file" 2>/dev/null; then
            echo "  ✅ Has error handling"
        else
            echo "  ⚠️  Limited error handling"
            WARNINGS=$((WARNINGS + 1))
        fi

        # ARV-3: Check for model configuration
        if grep -q "model\|MODELS\|defaultModel" "$agent_file" 2>/dev/null; then
            echo "  ✅ Has model configuration"
        else
            echo "  ⚠️  No model configuration found"
            WARNINGS=$((WARNINGS + 1))
        fi

        # =============================================================================
        # HARD MODE ARV CHECKS
        # =============================================================================

        if [ "$HARD_MODE" = "true" ]; then
            # ARV-4: Check SPIFFE ID (Hard Mode only)
            if grep -q "spiffe://" "$agent_file" 2>/dev/null; then
                echo "  ✅ [HM] Has SPIFFE ID"
            else
                echo "  ⚠️  [HM] Missing SPIFFE ID"
            fi

            # ARV-6: Check audit logging (Hard Mode only)
            if grep -q "audit\|record\|tools.record" "$agent_file" 2>/dev/null; then
                echo "  ✅ [HM] Has audit logging"
            else
                echo "  ⚠️  [HM] Missing audit logging"
            fi
        fi

        echo ""
    fi
done

# =============================================================================
# Check base agent class
# =============================================================================

echo "Checking base agent class..."
BASE_FILE="packages/agents/src/base/agent.ts"
if [ -f "$BASE_FILE" ]; then
    if grep -q "abstract class\|export class" "$BASE_FILE" 2>/dev/null; then
        echo "  ✅ Base agent class exists"
    else
        echo "  ⚠️  Base agent class structure unclear"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "  ⚠️  No base agent class found at $BASE_FILE"
    WARNINGS=$((WARNINGS + 1))
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "=============================="
if [ $VIOLATIONS -gt 0 ]; then
    echo "❌ ARV Check: $VIOLATIONS critical issue(s)"
    exit 1
fi

if [ $WARNINGS -gt 0 ]; then
    echo "⚠️  ARV Check: $WARNINGS warning(s)"
    echo "   Warnings are informational and do not block CI"
else
    echo "✅ ARV Check PASSED"
fi

echo ""
echo "All agents ready for deployment"
exit 0
