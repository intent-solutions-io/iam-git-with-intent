#!/usr/bin/env bash
# Mount AgentFS as FUSE filesystem
set -euo pipefail

echo "=== Mounting AgentFS ==="

mkdir -p ./agents/gwi
agentfs mount .agentfs/gwi.db ./agents/gwi

echo "Mounted at: ./agents/gwi"
ls -la ./agents/gwi
