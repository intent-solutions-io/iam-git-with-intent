# 020-DR-ADRC: GWI Live AgentFS and Beads Configuration

**Document ID:** 020-DR-ADRC
**Document Type:** Architecture Decision Record (ADR)
**Created:** 2025-12-15
**Last Updated:** 2025-12-15
**Status:** ACCEPTED
**Author:** Jeremy Longshore, Claude Code (Opus 4.5)
**Applies To:** git-with-intent repository

---

> **Filing Standard:** This document follows docs-filing v4 (6767-a-DR-STND-document-filing-system-standard-v4.md)
> - `020` = chronological sequence number
> - `DR` = Documentation & Reference category
> - `ADRC` = Architecture Decision type

---

## Context

Phases 3 and 4 introduced the hook system and Claude Internal Hook Protocol, but these were theoretical implementations without live backends:

- Phase 3: Created `AgentFSHook` and `BeadsHook` classes
- Phase 4: Defined behavioral contract for Claude to run post-message audits

However, the hooks were not wired to actual AgentFS databases or Beads projects. The documentation stated "AgentFS Status: Not yet initialized."

### Problem

Without live configuration:
1. The hooks would silently no-op or log warnings
2. No actual audit trail was being created
3. No Beads tasks were being tracked
4. The Claude Internal Hook Protocol was aspirational, not functional

---

## Decision

**Configure AgentFS and Beads as live, functional systems for git-with-intent's internal development workflows.**

This includes:

1. **AgentFS Initialization**: Create `.agentfs/gwi.db` SQLite database using agentfs-sdk
2. **Beads Verification**: Confirm `.beads/` is initialized (already existed from Phase 3)
3. **Hook Wiring**: Update import paths and ensure hooks connect to live instances
4. **Smoke Tests**: Add `npm run test:hooks:smoke` to prove hooks are working
5. **Documentation Updates**: Update CLAUDE.md and create this ADR

---

## Implementation Details

### AgentFS Configuration

```bash
# Initialize AgentFS (one-time)
npm run agentfs:init         # Runs: npx tsx scripts/agentfs-init.ts

# Creates:
# - .agentfs/gwi.db           # SQLite database
# - .agentfs/config.json      # Configuration file
# - .agentfs/.gitignore       # Ignore DB files, keep config

# Environment Variables:
export GWI_AGENTFS_ENABLED=true
export GWI_AGENTFS_ID=gwi
```

### Beads Configuration

```bash
# Beads was already initialized in Phase 3
# Verify health:
bd doctor

# Environment Variables:
export GWI_BEADS_ENABLED=true
```

### bd Commands Used by BeadsHook

```bash
# Create issue (types: epic, task, bug, feature, chore, research)
bd create "GWI: RESOLVE run xyz (CODER)" -t task -p 1 --json

# Update status (statuses: open, in_progress, closed, blocked)
bd update git-with-intent-xxx --status in_progress

# Close issue
bd close git-with-intent-xxx --reason "Run completed successfully"

# Health check (used by isEnabled())
bd list --json >/dev/null 2>&1
```

### Smoke Test

```bash
# Run with hooks enabled
export GWI_AGENTFS_ENABLED=true GWI_AGENTFS_ID=gwi GWI_BEADS_ENABLED=true
npm run test:hooks:smoke

# Verify Beads task created
bd list --json | jq '.[0:3]'

# Verify AgentFS records
sqlite3 .agentfs/gwi.db "SELECT id, name, started_at FROM tool_calls ORDER BY started_at DESC LIMIT 5;"
```

---

## Policy

### When Hooks Create Beads Tasks

The `BeadsHook` creates tasks when ALL of these conditions are met:
- `GWI_BEADS_ENABLED=true`
- `runType` is `RESOLVE` or `AUTOPILOT`
- `agentRole` is `FOREMAN` or `CODER`
- `outputSummary` is non-empty OR complexity >= 3

### When Hooks Log to AgentFS

The `AgentFSHook` records every step when:
- `GWI_AGENTFS_ENABLED=true`
- `GWI_AGENTFS_ID` is set (defaults to `gwi`)

Records created:
- `tool_calls` table: Every agent step with name, timestamps, input/output
- `kv_store` table: Run metadata keyed by `runs:{runId}:meta` and `steps:{runId}:{stepId}`

---

## Supersedes

This ADR supersedes previous statements in:
- `000-docs/015-AA-AACR-phase-3-*`: "AgentFS Status: Not yet initialized"
- `000-docs/017-AA-AACR-phase-4-*`: "AgentFS/Beads are opt-in internal tools"

Those documents accurately described the state at the time. This ADR documents the transition from theoretical hooks to live, working systems.

---

## Consequences

### Positive

- **Audit trail exists**: Every agent step creates a record in AgentFS
- **Task tracking works**: Complex runs create Beads tasks for follow-up
- **Smoke test proves it**: `npm run test:hooks:smoke` verifies configuration
- **Documentation updated**: CLAUDE.md and this ADR reflect reality

### Negative

- **Local state required**: `.agentfs/gwi.db` must exist for hooks to work
- **Not synced to cloud**: AgentFS uses local SQLite; cloud sync requires additional Turso configuration
- **Beads tasks accumulate**: Need periodic cleanup or archival

### What's NOT Configured

| Feature | Status |
|---------|--------|
| Turso cloud sync for AgentFS | Not configured (local SQLite only) |
| CI integration for smoke tests | Optional future work |
| Auto-close Beads on successful runs | Implemented but needs policy tuning |

---

## Verification Steps

```bash
# 1. Check Beads health
bd doctor

# 2. Check AgentFS database exists
ls -la .agentfs/gwi.db*

# 3. Run smoke test
export GWI_AGENTFS_ENABLED=true GWI_AGENTFS_ID=gwi GWI_BEADS_ENABLED=true
npm run test:hooks:smoke

# 4. Verify Beads task was created
bd list --json | jq '.[0]'

# 5. Verify AgentFS records
sqlite3 .agentfs/gwi.db "SELECT * FROM tool_calls ORDER BY started_at DESC LIMIT 1;"
```

---

## References

- **Phase 3 (Hooks Introduction):** `000-docs/015-AA-AACR-phase-3-agentfs-beads-hooks-and-repo-wiring.md`
- **Phase 4 (Claude Protocol):** `000-docs/016-DR-ADRC-claude-internal-hook-protocol.md`
- **AgentFS/Beads Policy:** `000-docs/006-DR-ADRC-agentfs-beads-policy.md`
- **Agent Hook System Policy:** `000-docs/014-DR-ADRC-agent-hook-system-policy.md`
- **Beads CLI Reference:** https://github.com/steveyegge/beads
- **AgentFS SDK Reference:** https://github.com/tursodatabase/agentfs

---

**Decision:** ACCEPTED
**Date:** 2025-12-15

---

*intent solutions io - confidential IP*
*Contact: jeremy@intentsolutions.io*
