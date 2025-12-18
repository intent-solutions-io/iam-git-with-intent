#!/bin/bash
# verify-tools.sh - Check required development tools are installed
# Run with: npm run tools:verify

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║           GWI Development Tools Verification               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

FAILED=0

# Check AgentFS
echo -n "AgentFS: "
if command -v agentfs &> /dev/null || [ -x "$HOME/.cargo/bin/agentfs" ]; then
    if [ -x "$HOME/.cargo/bin/agentfs" ]; then
        echo "✅ installed ($HOME/.cargo/bin/agentfs)"
    else
        echo "✅ installed ($(command -v agentfs))"
    fi
else
    echo "❌ NOT FOUND"
    echo "   Install with: curl --proto '=https' --tlsv1.2 -LsSf https://github.com/tursodatabase/agentfs/releases/download/v0.1.2/agentfs-installer.sh | sh"
    FAILED=1
fi

# Check Beads
echo -n "Beads (bd): "
if command -v bd &> /dev/null; then
    VERSION=$(bd --version 2>/dev/null || echo "unknown")
    echo "✅ $VERSION"
else
    echo "❌ NOT FOUND"
    echo "   Install with: curl -sSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash"
    FAILED=1
fi

# Check Beads DB
echo -n "Beads database: "
if [ -f ".beads/issues.jsonl" ]; then
    ISSUE_COUNT=$(wc -l < .beads/issues.jsonl 2>/dev/null || echo "0")
    echo "✅ exists ($ISSUE_COUNT issues)"
else
    echo "⚠️  No .beads/issues.jsonl (run 'bd init' to create)"
fi

# Check Beads ready status
echo -n "Beads ready: "
if bd ready --json &> /dev/null; then
    READY_COUNT=$(bd ready --json 2>/dev/null | grep -c '"id"' || echo "0")
    echo "✅ $READY_COUNT tasks ready"
else
    echo "⚠️  No ready tasks (this is okay if just initialized)"
fi

# Check Node.js
echo -n "Node.js: "
if command -v node &> /dev/null; then
    echo "✅ $(node --version)"
else
    echo "❌ NOT FOUND"
    FAILED=1
fi

# Check npm
echo -n "npm: "
if command -v npm &> /dev/null; then
    echo "✅ $(npm --version)"
else
    echo "❌ NOT FOUND"
    FAILED=1
fi

echo ""
echo "────────────────────────────────────────────────────────────"
if [ $FAILED -eq 0 ]; then
    echo "✅ All required tools installed"
    exit 0
else
    echo "❌ Some tools missing - see above for install instructions"
    exit 1
fi
