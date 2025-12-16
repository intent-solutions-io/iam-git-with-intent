# AgentFS Tools

**INTERNAL USE ONLY** - AgentFS integration for Intent Solutions' development workflows.

## Purpose

AgentFS provides:
- Persistent state management for agents during development
- Audit trails for all agent operations
- Tool call recording for debugging and replay

Reference: https://github.com/tursodatabase/agentfs

## Prerequisites (One-Time Setup)

Before using AgentFS hooks in this repo:

```bash
# 1. Initialize AgentFS for this repo
npx tsx scripts/agentfs-init.ts

# 2. Verify the database was created
ls -la .agentfs/

# 3. Set environment variables
export GWI_AGENTFS_ENABLED=true
export GWI_AGENTFS_ID=gwi
```

## Files

- `agentfs-run-store.ts` - Implements `RunStore` interface using AgentFS
- `agentfs-hook.ts` - Agent lifecycle hook for auditing to AgentFS

## AgentFS Hook

The `AgentFSHook` audits agent activity by recording:

- **Tool calls**: Each agent step recorded via `agent.tools.record()`
- **State**: Run metadata stored via `agent.kv.set/get()`

```typescript
// Tool call recording (Unix timestamps in seconds)
await agent.tools.record(
  'gwi:coder:step',
  startedAt,   // e.g., 1702648800
  endedAt,     // e.g., 1702648805
  { runId, stepId },
  { status: 'completed' }
);

// State storage
await agent.kv.set('runs:run-123:meta', { ... });
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GWI_AGENTFS_ENABLED` | Set to `true` to enable AgentFS hook |
| `GWI_AGENTFS_ID` | Agent ID for AgentFS namespace (default: `gwi`) |
| `TURSO_URL` | Turso database URL (for cloud sync, optional) |
| `TURSO_AUTH_TOKEN` | Turso auth token (for cloud sync, optional) |

## Verifying AgentFS is Working

After running a hook smoke test:

```bash
# Check the database file exists and has data
ls -la .agentfs/gwi.db*

# Use SQLite to inspect (if sqlite3 is installed)
sqlite3 .agentfs/gwi.db "SELECT * FROM tool_calls ORDER BY ended_at DESC LIMIT 5;"
sqlite3 .agentfs/gwi.db "SELECT key, value FROM kv_store WHERE key LIKE 'runs:%' LIMIT 5;"
```

## Database Location

AgentFS stores data in `.agentfs/gwi.db` at the repo root. This includes:
- `tool_calls` table: All recorded tool/step invocations
- `kv_store` table: Key-value metadata

The database files are gitignored (local only). The config.json is tracked.

## Policy

This code is for internal development only. External users of Git With Intent
do not need AgentFS installed. See:
- `000-docs/006-DR-ADRC-agentfs-beads-policy.md`
- `000-docs/014-DR-ADRC-agent-hook-system-policy.md`
