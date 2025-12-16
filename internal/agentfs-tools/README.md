# AgentFS Tools

**INTERNAL USE ONLY** - AgentFS integration for Intent Solutions' development workflows.

## Purpose

AgentFS provides:
- Persistent state management for agents during development
- Audit trails for all agent operations
- Tool call recording for debugging and replay

Reference: https://github.com/tursodatabase/agentfs

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
| `GWI_AGENTFS_ID` | Agent ID for AgentFS namespace |
| `TURSO_URL` | Turso database URL (for AgentFS backend) |
| `TURSO_AUTH_TOKEN` | Turso auth token |

Legacy (deprecated):
| `GWI_USE_AGENTFS` | Alias for GWI_AGENTFS_ENABLED |

## Policy

This code is for internal development only. External users of Git With Intent
do not need AgentFS installed. See:
- `000-docs/006-DR-ADRC-agentfs-beads-policy.md`
- `000-docs/014-DR-ADRC-agent-hook-system-policy.md`
