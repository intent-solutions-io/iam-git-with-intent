#!/usr/bin/env bash
#
# Run command with preflight/postflight hooks
#
# Usage:
#   scripts/hooks/run-with-hooks.sh npm test
#   scripts/hooks/run-with-hooks.sh node dist/cli.js workflow start
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run preflight
"$SCRIPT_DIR/preflight.sh"
PREFLIGHT_STATUS=$?

if [[ "$PREFLIGHT_STATUS" -ne 0 ]]; then
    echo "Preflight failed. Aborting."
    exit $PREFLIGHT_STATUS
fi

# Run the actual command
echo ""
echo "=== Running: $* ==="
echo ""

"$@"
CMD_STATUS=$?

# Always run postflight
"$SCRIPT_DIR/postflight.sh"
"$SCRIPT_DIR/context-compact.sh"

exit $CMD_STATUS
