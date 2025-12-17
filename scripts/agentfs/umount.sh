#!/usr/bin/env bash
# Unmount AgentFS
set -euo pipefail

echo "=== Unmounting AgentFS ==="

if mountpoint -q ./agents/gwi 2>/dev/null; then
    fusermount -u ./agents/gwi 2>/dev/null || umount ./agents/gwi
    echo "Unmounted: ./agents/gwi"
else
    echo "Not mounted: ./agents/gwi"
fi
