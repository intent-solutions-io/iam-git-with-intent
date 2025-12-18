# 008-AA-AACR: Phase 1a - Directory Scaffold + DevTools Policy

**Document ID:** 008-AA-AACR
**Document Type:** After Action Report (AAR)
**Created:** 2025-12-15
**Status:** FINAL

---

> **Filing Standard:** This document follows docs-filing v4 (6767-a-DR-STND-document-filing-system-standard-v4.md)

---

## Metadata

| Field | Value |
|-------|-------|
| **Phase** | 1a |
| **Repo/App** | git-with-intent |
| **Owner** | Jeremy Longshore |
| **Date/Time (CST)** | 2025-12-15 21:42 CST |
| **Status** | FINAL |
| **Related Issues/PRs** | N/A (foundation work) |
| **Commit(s)** | Pending |

---

## Beads / Task IDs Touched

| Task ID | Status | Title |
|---------|--------|-------|
| N/A | N/A | Beads not yet initialized |

**Beads Status:** Not yet initialized (Phase 1a is foundation work)

**Logical Work Units:**
- Created internal/ directory with AgentFS and Beads tool adapters
- Created ADR for AgentFS/Beads policy (006)
- Created ADR for directory structure (007)
- Created session hook for devops rules enforcement
- Updated CLAUDE.md with session start protocol

---

## Executive Summary

- Created `internal/` directory to house Intent Solutions-only development tools
- Implemented AgentFS adapter (`AgentFSRunStore`) with full `RunStore` interface
- Implemented Beads adapter (`BeadsTaskTracker`) with `TaskTracker` interface + `NoOpTaskTracker` fallback
- Established formal policy: AgentFS/Beads **required** for internal dev, **optional** for external runtime
- Created directory structure ADR defining monorepo layers and import rules
- Implemented session start protocol to force reading devops rules at every session
- All adapters use dynamic imports to avoid hard runtime dependencies

---

## What Changed

### New Directories

- `.claude/` - Claude Code settings and hooks
- `.claude/commands/` - Session commands
- `internal/` - Internal development tools
- `internal/agentfs-tools/` - AgentFS adapters
- `internal/beads-tools/` - Beads adapters
- `internal/ci-hardmode/` - Hard Mode CI (placeholder)

### New Files

| File | Purpose |
|------|---------|
| `.claude/settings.json` | Claude Code project settings |
| `.claude/commands/session-start.md` | Session start command with required reading |
| `internal/README.md` | Internal tools overview and policy |
| `internal/agentfs-tools/README.md` | AgentFS tools documentation |
| `internal/agentfs-tools/agentfs-run-store.ts` | `RunStore` implementation using AgentFS |
| `internal/beads-tools/README.md` | Beads tools documentation |
| `internal/beads-tools/beads-task-tracker.ts` | `TaskTracker` implementation using Beads |
| `000-docs/006-DR-ADRC-agentfs-beads-policy.md` | ADR for AgentFS/Beads policy |
| `000-docs/007-DR-ADRC-directory-structure.md` | ADR for directory structure |

### Modified Files

| File | Change |
|------|--------|
| `CLAUDE.md` | Added SESSION START PROTOCOL section, updated references |

---

## Why

### Business Context

Git With Intent is transitioning from internal experiment to public SaaS product. External users should not need to understand or install AgentFS/Beads - they just want `npm install && gwi resolve`.

### Technical Rationale

1. **Adapter Pattern**: AgentFS/Beads adapters implement storage interfaces, making them swappable
2. **Dynamic Imports**: `internal/` code uses dynamic imports to avoid bundling AgentFS/Beads in user runtime
3. **NoOp Fallback**: `NoOpTaskTracker` provides graceful degradation when Beads is unavailable
4. **Session Protocol**: Explicit session start requirements prevent confusion across context resets

### Decision Drivers

- User experience: Simple installation and usage
- Internal productivity: Keep powerful tools for our team
- Code hygiene: Clear boundaries between public and internal code
- Auditability: Every session starts with consistent understanding of rules

---

## How to Verify

```bash
# Step 1: Verify internal directory structure exists
ls -la internal/
ls -la internal/agentfs-tools/
ls -la internal/beads-tools/

# Step 2: Verify ADRs created
ls -la 000-docs/006-*.md
ls -la 000-docs/007-*.md

# Step 3: Verify session hook files
ls -la .claude/
ls -la .claude/commands/

# Step 4: Verify CLAUDE.md has session protocol
head -30 CLAUDE.md

# Step 5: Verify adapters have correct interfaces
head -70 internal/agentfs-tools/agentfs-run-store.ts
head -70 internal/beads-tools/beads-task-tracker.ts
```

---

## Risks / Gotchas

- **Import Boundaries Not Enforced**: CI script to check imports not yet created
- **AgentFS Not Tested**: Adapter written but not tested against real AgentFS
- **Beads Not Tested**: Adapter written but not tested against real Beads
- **Session Hook Relies on Convention**: No technical enforcement of session start reading

---

## Rollback Plan

1. Delete `internal/` directory
2. Delete `.claude/` directory
3. Delete ADR files (006, 007)
4. Revert CLAUDE.md changes
5. `git checkout HEAD -- CLAUDE.md`

---

## Open Questions

- [ ] Should we add a pre-commit hook to prevent imports from `internal/` in runtime code?
- [ ] When will Beads be initialized for actual task tracking?
- [ ] Should session start protocol be enforced via Claude Code hooks feature?

---

## Next Actions

| Action | Owner | Due |
|--------|-------|-----|
| Initialize Beads for task tracking | Jeremy | Phase 2 |
| Create CI script to enforce import boundaries | Jeremy | Phase 2 |
| Test AgentFS adapter against real AgentFS | Jeremy | Phase 2 |
| Create remaining specialist agents (Planner, Coder, Validator) | Jeremy | Phase 2 |

---

## Evidence Links / Artifacts

### Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `internal/README.md` | created | Document internal tools policy |
| `internal/agentfs-tools/README.md` | created | Document AgentFS tools |
| `internal/agentfs-tools/agentfs-run-store.ts` | created | AgentFS RunStore adapter |
| `internal/beads-tools/README.md` | created | Document Beads tools |
| `internal/beads-tools/beads-task-tracker.ts` | created | Beads TaskTracker adapter |
| `.claude/settings.json` | created | Project settings |
| `.claude/commands/session-start.md` | created | Session start command |
| `000-docs/006-DR-ADRC-agentfs-beads-policy.md` | created | AgentFS/Beads policy ADR |
| `000-docs/007-DR-ADRC-directory-structure.md` | created | Directory structure ADR |
| `CLAUDE.md` | modified | Added session start protocol |

### Commits

| Hash | Message |
|------|---------|
| (pending) | Phase 1a: Directory scaffold + DevTools policy |

### AgentFS Snapshots

**AgentFS Status:** Not yet initialized (N/A for docs-only phase)

### External References

- AgentFS: https://github.com/tursodatabase/agentfs
- Beads: https://github.com/steveyegge/beads

---

## Phase Completion Checklist

- [x] All planned task IDs completed or accounted for
- [x] Verification steps documented
- [x] Evidence documented above
- [x] No blocking open questions
- [x] Next phase entry criteria defined

---

## Phase 1a Summary

This phase established the foundation for separating internal development tools from the public product runtime:

1. **Internal Directory**: `internal/` houses AgentFS and Beads adapters
2. **Adapter Pattern**: Storage interfaces allow swapping SQLite (external) for AgentFS (internal)
3. **Policy ADR**: Formal decision record for when/where internal tools are used
4. **Session Protocol**: Every Claude Code session starts by reading devops rules
5. **Directory Structure ADR**: Clear monorepo layers with import boundaries

The repository is now ready for:
- Phase 2: Initialize Beads for task tracking
- Phase 2: Implement remaining specialist agents
- Phase 2: CI enforcement of import boundaries

---

*intent solutions io — confidential IP*
*Contact: jeremy@intentsolutions.io*
