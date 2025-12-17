#!/usr/bin/env bash
#
# Preflight Hook - Validates AgentFS + Beads setup
#
# Environment:
#   GWI_REQUIRE_AGENTFS=1 (default) - Enforce mount
#   GWI_REQUIRE_AGENTFS=0 - Only check installation (CI mode)
#   GWI_REQUIRE_BEADS=1 (default) - Always enforce
#
set -euo pipefail

GWI_REQUIRE_AGENTFS="${GWI_REQUIRE_AGENTFS:-1}"
GWI_REQUIRE_BEADS="${GWI_REQUIRE_BEADS:-1}"

ERRORS=0

echo "=== GWI Preflight Check ==="
echo ""

# Check AgentFS CLI
echo -n "AgentFS CLI: "
if command -v agentfs &> /dev/null; then
    echo "OK ($(which agentfs))"
else
    echo "MISSING"
    echo "  Install: npm run agentfs:install"
    ((ERRORS++))
fi

# Check Beads CLI
echo -n "Beads CLI: "
if command -v bd &> /dev/null; then
    echo "OK ($(bd --version 2>/dev/null || echo 'installed'))"
else
    echo "MISSING"
    echo "  Install: brew tap steveyegge/beads && brew install bd"
    if [[ "$GWI_REQUIRE_BEADS" == "1" ]]; then
        ((ERRORS++))
    fi
fi

# Check Beads initialized
echo -n "Beads config: "
if [[ -f ".beads/config.yaml" ]]; then
    echo "OK (.beads/config.yaml exists)"
else
    echo "MISSING"
    echo "  Run: bd init --team"
    if [[ "$GWI_REQUIRE_BEADS" == "1" ]]; then
        ((ERRORS++))
    fi
fi

# Check AgentFS mount (if required)
echo -n "AgentFS mount: "
if [[ "$GWI_REQUIRE_AGENTFS" == "1" ]]; then
    if [[ "$PWD" == *"/agents/gwi"* ]] || mount 2>/dev/null | grep -q "agents/gwi"; then
        echo "OK (inside mount)"
    else
        echo "NOT MOUNTED"
        echo "  Run: npm run agentfs:mount && cd agents/gwi"
        ((ERRORS++))
    fi
else
    echo "SKIPPED (GWI_REQUIRE_AGENTFS=0)"
fi

# Check .gitignore
echo -n ".gitignore: "
GITIGNORE_OK=1
if ! grep -q "^\.agentfs/" .gitignore 2>/dev/null; then
    GITIGNORE_OK=0
fi
if ! grep -q "^agents/" .gitignore 2>/dev/null; then
    GITIGNORE_OK=0
fi
if ! grep -q "^\.beads/\*\.db" .gitignore 2>/dev/null; then
    GITIGNORE_OK=0
fi

if [[ "$GITIGNORE_OK" == "1" ]]; then
    echo "OK"
else
    echo "INCOMPLETE"
    echo "  Missing: .agentfs/, agents/, .beads/*.db"
    ((ERRORS++))
fi

# Check AAR template
echo -n "AAR template: "
if [[ -f "docs/templates/aar-template.md" ]]; then
    echo "OK (docs/templates/aar-template.md)"
else
    echo "MISSING"
    echo "  Create: docs/templates/aar-template.md"
    ((ERRORS++))
fi

echo ""

# Run agents verification
echo ""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/agents-verify.sh" ]]; then
    "$SCRIPT_DIR/agents-verify.sh" || ((ERRORS++))
fi

echo ""

if [[ "$ERRORS" -gt 0 ]]; then
    echo "PREFLIGHT FAILED: $ERRORS error(s)"
    exit 1
else
    echo "PREFLIGHT PASSED"
    exit 0
fi
