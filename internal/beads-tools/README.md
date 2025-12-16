# Beads Tools

**INTERNAL USE ONLY** - Beads integration for Intent Solutions' internal task tracking.

## Purpose

Beads provides:
- Task tracking for development work (replaces markdown TODOs)
- Issue/bead linkage for agent workflows
- Dependency tracking between tasks

## Files

- `beads-task-tracker.ts` - Implements `TaskTracker` interface using Beads
- `session-tasks.ts` - Manages tasks for the current session

## Usage

```typescript
// INTERNAL ONLY - Do not use in packages/core or apps/cli runtime
import { BeadsTaskTracker } from '@internal/beads-tools';

const tracker = new BeadsTaskTracker();
await tracker.createTask({ title: 'Fix merge conflict', type: 'task' });
```

## Commands

```bash
# List ready tasks
bd list --ready

# Create a new task
bd create "Task title" --type task

# Mark task complete
bd done <task-id>
```

## Policy

This code is for internal development only. External users of Git With Intent
do not need Beads installed. See `000-docs/006-DR-ADRC-agentfs-beads-policy.md`.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GWI_USE_BEADS` | Set to `true` to enable Beads integration (internal only) |
