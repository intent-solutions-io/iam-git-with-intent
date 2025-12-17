#!/usr/bin/env bash
# Install AgentFS CLI
set -euo pipefail

echo "=== Installing AgentFS CLI ==="

if command -v agentfs &> /dev/null; then
    echo "AgentFS already installed: $(which agentfs)"
    agentfs --help | head -1
    exit 0
fi

curl --proto '=https' --tlsv1.2 -LsSf \
    https://github.com/tursodatabase/agentfs/releases/latest/download/agentfs-installer.sh | sh

export PATH="$HOME/.cargo/bin:$PATH"
agentfs --help | head -1
echo "Done."
