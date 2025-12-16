# AgentFS Tools

**INTERNAL USE ONLY** - AgentFS integration for Intent Solutions' development workflows.

## Purpose

AgentFS provides:
- Persistent state management for agents during development
- Audit trails for all agent operations
- Tool call recording for debugging and replay

## Files

- `agentfs-run-store.ts` - Implements `RunStore` interface using AgentFS
- `agentfs-pr-store.ts` - Implements `PRStore` interface using AgentFS
- `session-recorder.ts` - Records session state for audit/replay

## Usage

```typescript
// INTERNAL ONLY - Do not use in packages/core or apps/cli runtime
import { AgentFSRunStore } from '@internal/agentfs-tools';

const runStore = new AgentFSRunStore({ agentId: 'gwi-dev' });
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GWI_USE_AGENTFS` | Set to `true` to enable AgentFS (internal only) |
| `GWI_AGENTFS_ID` | Agent ID for AgentFS namespace |
| `TURSO_URL` | Turso database URL (for AgentFS backend) |
| `TURSO_AUTH_TOKEN` | Turso auth token |

## Policy

This code is for internal development only. External users of Git With Intent
do not need AgentFS installed. See `000-docs/006-DR-ADRC-agentfs-beads-policy.md`.
