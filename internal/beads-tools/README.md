# Beads Tools

**INTERNAL USE ONLY** - Beads integration for Intent Solutions' internal task tracking.

## Purpose

Beads provides:
- Task tracking for development work (replaces markdown TODOs)
- Issue/bead linkage for agent workflows
- Dependency tracking between tasks

Reference: https://github.com/steveyegge/beads

## Prerequisites (One-Time Setup)

Before using Beads hooks in this repo:

```bash
# 1. Initialize beads for this repo (if not already done)
bd init

# 2. Verify health
bd doctor

# 3. (Optional) Run quickstart to understand workflow
bd quickstart

# 4. Set environment variables
export GWI_BEADS_ENABLED=true
```

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
- Agent role is FOREMAN or CODER
- Complexity >= 3
- Step failed or partial success
- Deferred work detected
- outputSummary is non-empty

## CLI Commands Used

```bash
# Create issue (types: epic, task, bug, feature, chore, research)
# Output: {"id":"git-with-intent-xxx","title":"...","status":"open",...}
bd create "GWI: RESOLVE run xyz (CODER)" -t task -p 1 --json

# Update status (statuses: open, in_progress, closed, blocked)
bd update git-with-intent-xxx --status in_progress

# Close issue
bd close git-with-intent-xxx --reason "Run completed successfully"

# List all issues (for health check)
bd list --json

# List ready issues (no blockers)
bd ready --json

# Add dependency between issues
bd dep add <new-id> <parent-id> --type discovered-from
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GWI_BEADS_ENABLED` | Set to `true` to enable Beads hook |
| `GWI_BEADS_DEBUG` | Enable debug logging for Beads decisions |

## Verifying Beads is Working

```bash
# Check last 5 issues
bd list --json | jq '.[0:5]'

# Check ready issues
bd ready --json | jq '.[0:5]'

# Full health check
bd doctor
```

## Policy

This code is for internal development only. External users of Git With Intent
do not need Beads installed. See:
- `000-docs/006-DR-ADRC-agentfs-beads-policy.md`
- `000-docs/014-DR-ADRC-agent-hook-system-policy.md`
