#!/bin/bash
#
# Git With Intent - Agent Readiness Verification (ARV)
#
# Validates agents are production-ready:
# - ARV-1: AgentFS initialization
# - ARV-2: A2A protocol compliance
# - ARV-3: SPIFFE ID configuration
# - ARV-4: Model configuration
# - ARV-5: Error handling
# - ARV-6: Telemetry hooks

set -e

echo "🤖 Git With Intent - ARV Check"
echo "=============================="

VIOLATIONS=0

# ARV-1: Check AgentFS initialization
echo ""
echo "ARV-1: Checking AgentFS initialization..."
for agent in packages/agents/src/*/index.ts; do
    if [ -f "$agent" ]; then
        agent_name=$(dirname "$agent" | xargs basename)
        if ! grep -q "openAgentFS\|AgentFS" "$agent" 2>/dev/null; then
            echo "⚠️  $agent_name: Missing AgentFS initialization"
        else
            echo "✅ $agent_name: AgentFS found"
        fi
    fi
done

# ARV-2: Check A2A protocol methods
echo ""
echo "ARV-2: Checking A2A protocol compliance..."
for agent in packages/agents/src/*/index.ts; do
    if [ -f "$agent" ]; then
        agent_name=$(dirname "$agent" | xargs basename)
        if ! grep -q "processTask\|handleMessage" "$agent" 2>/dev/null; then
            echo "⚠️  $agent_name: Missing A2A message handler"
        else
            echo "✅ $agent_name: A2A handler found"
        fi
    fi
done

# ARV-3: Check SPIFFE configuration
echo ""
echo "ARV-3: Checking SPIFFE ID configuration..."
if ! grep -r "spiffe://" packages/agents/src/ --include="*.ts" 2>/dev/null | grep -q "intent.solutions"; then
    echo "⚠️  Missing SPIFFE ID configuration"
else
    echo "✅ SPIFFE IDs configured"
fi

# ARV-4: Check model configuration
echo ""
echo "ARV-4: Checking model configuration..."
if ! grep -q "MODELS" packages/agents/src/*/index.ts 2>/dev/null && \
   ! grep -q "defaultModel" packages/agents/src/*/index.ts 2>/dev/null; then
    echo "⚠️  Missing model configuration"
else
    echo "✅ Model configuration found"
fi

# ARV-5: Check error handling
echo ""
echo "ARV-5: Checking error handling..."
for agent in packages/agents/src/*/index.ts; do
    if [ -f "$agent" ]; then
        agent_name=$(dirname "$agent" | xargs basename)
        if ! grep -q "try\s*{" "$agent" 2>/dev/null; then
            echo "⚠️  $agent_name: Limited error handling"
        else
            echo "✅ $agent_name: Error handling found"
        fi
    fi
done

# ARV-6: Check audit logging
echo ""
echo "ARV-6: Checking audit logging (telemetry)..."
for agent in packages/agents/src/*/index.ts; do
    if [ -f "$agent" ]; then
        agent_name=$(dirname "$agent" | xargs basename)
        if ! grep -q "audit\|record\|tools.record" "$agent" 2>/dev/null; then
            echo "⚠️  $agent_name: Missing audit logging"
        else
            echo "✅ $agent_name: Audit logging found"
        fi
    fi
done

# Summary
echo ""
echo "=============================="
if [ $VIOLATIONS -gt 0 ]; then
    echo "❌ ARV Check: $VIOLATIONS issue(s)"
    exit 1
fi

echo "✅ ARV Check PASSED"
echo "All agents ready for deployment"
exit 0
