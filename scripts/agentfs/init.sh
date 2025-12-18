#!/usr/bin/env bash
# Initialize AgentFS database for gwi
set -euo pipefail

echo "=== Initializing AgentFS ==="

mkdir -p .agentfs
cd .agentfs
agentfs init gwi.db --force 2>/dev/null || agentfs init gwi.db
cd ..

echo "Created: .agentfs/gwi.db"
ls -lh .agentfs/gwi.db
