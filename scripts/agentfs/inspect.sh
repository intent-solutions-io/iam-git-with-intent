#!/usr/bin/env bash
# Inspect AgentFS contents
set -euo pipefail

echo "=== AgentFS Inspect ==="
echo ""

DB_PATH=".agentfs/gwi.db"

echo "Database: $DB_PATH"
ls -lh "$DB_PATH" 2>/dev/null || echo "(not found)"
echo ""

echo "Filesystem contents:"
agentfs fs ls "$DB_PATH" 2>/dev/null | head -20 || echo "(empty or error)"
echo ""

echo "Tables (sqlite3):"
sqlite3 "$DB_PATH" ".tables" 2>/dev/null || echo "(sqlite3 not available)"
echo ""

echo "KV entries:"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM kv_store;" 2>/dev/null || echo "0"

echo "Tool calls:"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM tool_calls;" 2>/dev/null || echo "0"
