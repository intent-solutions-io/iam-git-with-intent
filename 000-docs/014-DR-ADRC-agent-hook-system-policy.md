# 014-DR-ADRC: Agent Hook System Policy

**Document ID:** 014-DR-ADRC
**Document Type:** Architecture Decision Record (ADR)
**Created:** 2025-12-15
**Last Updated:** 2025-12-15
**Status:** ACCEPTED
**Author:** Jeremy Longshore, Claude Code (Opus 4.5)
**Applies To:** git-with-intent repository

---

> **Filing Standard:** This document follows docs-filing v4 (6767-a-DR-STND-document-filing-system-standard-v4.md)
> - `014` = chronological sequence number
> - `DR` = Documentation & Reference category
> - `ADRC` = Architecture Decision type

---

## Context

Git With Intent uses a multi-agent pipeline to process PRs and issues. Each run involves multiple agent steps:

```
User Command → Orchestrator → [Triage, Planner, Coder, Validator, Reviewer] → Result
```

We need a way to:
1. **Audit agent activity** - Record what each agent did for debugging and compliance
2. **Track long-horizon tasks** - Create issues for complex work that spans multiple runs
3. **Enable extensibility** - Allow future hooks for telemetry, notifications, etc.

This must be done without:
- Breaking the core pipeline if hooks fail
- Requiring external users to install internal tools
- Slowing down agent execution

---

## Decision

**Implement a hook system in `packages/engine` that runs after each agent step, with hooks for AgentFS (audit) and Beads (task tracking) in `internal/`.**

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    packages/engine                           │
│                                                              │
│  ┌─────────────────┐    ┌──────────────────────────────┐    │
│  │ AgentHookRunner │───▶│ hooks: AgentHook[]           │    │
│  └────────┬────────┘    │   - AgentFSHook (internal)   │    │
│           │             │   - BeadsHook (internal)      │    │
│           │             │   - Custom hooks (future)     │    │
│           │             └──────────────────────────────┘    │
│           ▼                                                  │
│  ┌─────────────────┐                                        │
│  │ afterStep(ctx)  │ ◀── Called after each agent step       │
│  │ runStart(ctx)   │ ◀── Called when run starts             │
│  │ runEnd(ctx)     │ ◀── Called when run ends               │
│  └─────────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    internal/ (optional)                      │
│                                                              │
│  ┌──────────────────┐        ┌──────────────────┐           │
│  │ AgentFSHook      │        │ BeadsHook        │           │
│  │                  │        │                  │           │
│  │ - tools.record() │        │ - bd create      │           │
│  │ - kv.set/get     │        │ - bd update      │           │
│  │ - Audit trail    │        │ - bd close       │           │
│  └──────────────────┘        └──────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

### Core Interfaces

```typescript
// packages/engine/src/hooks/types.ts

interface AgentRunContext {
  tenantId?: string;
  runId: string;
  runType: 'TRIAGE' | 'PLAN' | 'RESOLVE' | 'REVIEW' | 'AUTOPILOT';
  stepId: string;
  agentRole: 'FOREMAN' | 'TRIAGE' | 'PLANNER' | 'CODER' | 'VALIDATOR' | 'REVIEWER';
  stepStatus: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  timestamp: string;
  inputSummary?: string;
  outputSummary?: string;
  durationMs?: number;
  tokensUsed?: { input: number; output: number };
  metadata?: Record<string, unknown>;
}

interface AgentHook {
  name: string;
  onAfterStep(ctx: AgentRunContext): Promise<void>;
  onRunStart?(ctx: AgentRunContext): Promise<void>;
  onRunEnd?(ctx: AgentRunContext, success: boolean): Promise<void>;
  isEnabled?(): Promise<boolean>;
}
```

### Configuration

Hooks are enabled via environment variables:

| Variable | Purpose | Default |
|----------|---------|---------|
| `GWI_AGENTFS_ENABLED` | Enable AgentFS audit hook | `false` |
| `GWI_AGENTFS_ID` | AgentFS agent identifier | — |
| `GWI_BEADS_ENABLED` | Enable Beads task tracking | `false` |
| `GWI_HOOK_DEBUG` | Enable debug logging | `false` |
| `GWI_HOOK_TIMEOUT_MS` | Hook execution timeout | `5000` |

### Integration with AgentFS

The `AgentFSHook` uses the AgentFS API for:

1. **Tool call recording** (`agent.tools.record()`):
   ```typescript
   await agent.tools.record(
     'gwi:coder:step',           // tool name
     startedAt,                  // Unix timestamp (seconds)
     endedAt,                    // Unix timestamp (seconds)
     { runId, stepId, input },   // input params
     { status, output }          // output results
   );
   ```

2. **State persistence** (`agent.kv.set/get()`):
   ```typescript
   await agent.kv.set('steps:run-123:step-456', contextData);
   const meta = await agent.kv.get('runs:run-123:meta');
   ```

Reference: https://github.com/tursodatabase/agentfs

### Integration with Beads

The `BeadsHook` uses the Beads CLI for:

1. **Issue creation** (`bd create`):
   ```bash
   bd create "GWI: RESOLVE run abc123" -t task -p 1
   ```

2. **Status updates** (`bd update`):
   ```bash
   bd update bd-xxxx --status in_progress
   bd update bd-xxxx --status blocked
   ```

3. **Issue closure** (`bd close`):
   ```bash
   bd close bd-xxxx --reason "Run completed successfully"
   ```

Reference: https://github.com/steveyegge/beads

### Beads Heuristics (Avoiding Spam)

The BeadsHook implements smart heuristics to avoid creating too many issues:

| Condition | Action |
|-----------|--------|
| Run type is AUTOPILOT or RESOLVE | Create initial tracking issue |
| Complexity >= 3 | Create or update issue |
| Step failed | Update issue to blocked |
| Partial success | Create follow-up issue |
| Deferred work detected | Create issue |
| Simple completion | Skip issue creation |

---

## Implementation

### Directory Structure

```
packages/engine/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    └── hooks/
        ├── index.ts      # Public exports
        ├── types.ts      # AgentRunContext, AgentHook interfaces
        ├── runner.ts     # AgentHookRunner implementation
        └── config.ts     # Environment-based configuration

internal/
├── agentfs-tools/
│   ├── README.md
│   ├── agentfs-run-store.ts   # Storage adapter (existing)
│   └── agentfs-hook.ts        # Hook implementation (new)
└── beads-tools/
    ├── README.md
    ├── beads-task-tracker.ts  # TaskTracker adapter (existing)
    └── beads-hook.ts          # Hook implementation (new)
```

### Engine Integration

The hook runner is integrated into the agent execution flow:

```typescript
// In agent execution code:
import { buildDefaultHookRunner } from '@gwi/engine/hooks';

const hookRunner = await buildDefaultHookRunner();

// When run starts:
await hookRunner.runStart({
  runId,
  runType: 'RESOLVE',
  stepId: 'init',
  agentRole: 'FOREMAN',
  stepStatus: 'running',
  timestamp: new Date().toISOString(),
});

// After each agent step:
await hookRunner.afterStep({
  runId,
  runType,
  stepId,
  agentRole: 'CODER',
  stepStatus: 'completed',
  timestamp: new Date().toISOString(),
  durationMs: elapsed,
  outputSummary: 'Applied 3 conflict resolutions',
});

// When run ends:
await hookRunner.runEnd(ctx, success);
```

---

## Consequences

### Positive

- **Audit trail**: All agent activity recorded to AgentFS for debugging and compliance
- **Task tracking**: Complex work automatically creates Beads issues
- **Resilient**: Hook failures don't crash the main pipeline
- **Extensible**: New hooks can be added without changing core code
- **Optional**: External users don't need hooks or internal tools

### Negative

- **Complexity**: Another system to understand and maintain
- **Dependencies**: AgentFS SDK and Beads CLI are soft dependencies
- **Performance**: Hooks add latency (mitigated by timeouts and parallel execution)

### Risks

| Risk | Mitigation |
|------|------------|
| Hook timeout blocks pipeline | 5-second timeout with graceful failure |
| AgentFS/Beads unavailable | Hooks check availability and skip if missing |
| Too many Beads issues created | Smart heuristics based on complexity/status |
| Hook errors mask real issues | Hooks log errors but don't throw |

---

## Compliance Checklist

- [x] Hook system implemented in `packages/engine`
- [x] AgentFSHook uses correct SDK/CLI API
- [x] BeadsHook uses correct bd CLI commands
- [x] Configuration via environment variables
- [x] CLAUDE.md updated with hook documentation
- [x] Hooks are optional (external users unaffected)
- [x] Error handling prevents pipeline crashes

---

## References

- 006-DR-ADRC: AgentFS and Beads Internal Tooling Policy
- 012-AT-ARCH: Run Types and Sub-Agent Pipeline
- AgentFS: https://github.com/tursodatabase/agentfs
- Beads: https://github.com/steveyegge/beads

---

**Decision:** ACCEPTED
**Date:** 2025-12-15

---

*intent solutions io — confidential IP*
*Contact: jeremy@intentsolutions.io*
