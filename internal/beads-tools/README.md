# Beads Tools

**INTERNAL USE ONLY** - Beads integration for Intent Solutions' internal task tracking.

## Purpose

Beads provides:
- Task tracking for development work (replaces markdown TODOs)
- Issue/bead linkage for agent workflows
- Dependency tracking between tasks

Reference: https://github.com/steveyegge/beads

## Files

- `beads-task-tracker.ts` - Implements `TaskTracker` interface using Beads
- `beads-hook.ts` - Agent lifecycle hook for task tracking via Beads

## Beads Hook

The `BeadsHook` creates/updates Beads issues based on agent activity:

- **Issue creation**: For complex runs (AUTOPILOT, RESOLVE with high complexity)
- **Status updates**: Track progress through agent steps
- **Issue closure**: When runs complete successfully

### Smart Heuristics

The hook avoids spam by only creating issues when:
- Run type is AUTOPILOT or RESOLVE
- Complexity >= 3
- Step failed or partial success
- Deferred work detected

## CLI Commands Used

```bash
# Create issue (types: epic, task, bug, feature, chore, research)
bd create "GWI: RESOLVE run" -t task -p 1

# Update status (statuses: open, in_progress, closed, blocked)
bd update bd-xxxx --status in_progress

# Close issue
bd close bd-xxxx --reason "Run completed successfully"

# List ready issues (no blockers)
bd ready
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GWI_BEADS_ENABLED` | Set to `true` to enable Beads hook |
| `GWI_BEADS_DEBUG` | Enable debug logging for Beads decisions |

Legacy (deprecated):
| `GWI_USE_BEADS` | Alias for GWI_BEADS_ENABLED |

## Policy

This code is for internal development only. External users of Git With Intent
do not need Beads installed. See:
- `000-docs/006-DR-ADRC-agentfs-beads-policy.md`
- `000-docs/014-DR-ADRC-agent-hook-system-policy.md`
