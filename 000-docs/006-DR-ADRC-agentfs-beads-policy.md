# 006-DR-ADRC: AgentFS and Beads Internal Tooling Policy

**Document ID:** 006-DR-ADRC
**Document Type:** Architecture Decision Record (ADR)
**Created:** 2025-12-15
**Last Updated:** 2025-12-15
**Status:** ACCEPTED
**Author:** Jeremy Longshore, Claude Code (Opus 4.5)
**Applies To:** git-with-intent repository

---

> **Filing Standard:** This document follows docs-filing v4 (6767-a-DR-STND-document-filing-system-standard-v4.md)
> - `006` = chronological sequence number
> - `DR` = Documentation & Reference category
> - `ADRC` = Architecture Decision type

---

## Context

Git With Intent is transitioning from an internal experimental project to a public, commercial SaaS product. The original architecture assumed all developers would have access to Intent Solutions' internal tooling:

- **AgentFS** (https://github.com/tursodatabase/agentfs) - Agent state management and audit logging
- **Beads** (https://github.com/steveyegge/beads) - Work graph and task tracking

However, external users of the `gwi` CLI should NOT need to:
1. Install or configure AgentFS
2. Install or configure Beads
3. Understand our internal development workflows

This creates a need for a clear policy on when and where these tools are used.

---

## Decision

**AgentFS and Beads are REQUIRED for internal development but OPTIONAL for external runtime.**

### Internal Development (Intent Solutions Team)

When working on the Git With Intent codebase:

| Tool | Status | Enforcement |
|------|--------|-------------|
| AgentFS | **REQUIRED** | All agent state goes through AgentFS |
| Beads | **REQUIRED** | All work tracked as Beads issues |
| Hard Mode | **REQUIRED** | CI enforces rules on `internal/*` branches |

**Why required internally:**
- AgentFS provides audit trails for agent development
- Beads ensures work is tracked and dependencies are visible
- These tools are core to Intent Solutions' operational standards (6767-g)

### External Runtime (End Users)

When users run the `gwi` CLI or use the hosted API:

| Tool | Status | Alternative |
|------|--------|-------------|
| AgentFS | **NOT USED** | SQLite via storage interfaces |
| Beads | **NOT USED** | No task tracking exposed to users |
| Hard Mode | **OPTIONAL** | Set `HARD_MODE=true` to opt-in |

**Why optional externally:**
- Users want `npm install && gwi resolve <url>` simplicity
- External users don't need audit trails or task graphs
- SQLite provides sufficient persistence for local CLI usage

---

## Implementation

### 1. Directory Structure

All internal tooling lives in the `internal/` directory:

```
internal/
├── README.md                    # Policy overview
├── agentfs-tools/               # AgentFS adapters
│   ├── README.md
│   ├── agentfs-run-store.ts     # RunStore implementation using AgentFS
│   └── agentfs-pr-store.ts      # PRStore implementation using AgentFS
├── beads-tools/                 # Beads adapters
│   ├── README.md
│   ├── beads-task-tracker.ts    # TaskTracker interface using Beads
│   └── session-tasks.ts         # Session-scoped task management
└── ci-hardmode/                 # Hard Mode CI scripts
    └── README.md
```

### 2. Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `GWI_USE_AGENTFS` | Enable AgentFS adapter | `false` |
| `GWI_USE_BEADS` | Enable Beads task tracking | `false` |
| `GWI_AGENTFS_ID` | AgentFS agent identifier | — |
| `HARD_MODE` | Enable Hard Mode CI rules | `false` |

### 3. Code Boundaries

**Runtime code (packages/core, packages/agents, apps/cli):**
- MUST NOT import from `internal/`
- MUST use storage interfaces (`PRStore`, `RunStore`, `SettingsStore`)
- MUST work with SQLite by default

**Internal code (internal/*):**
- MAY import from packages/
- MAY use AgentFS and Beads directly
- SHOULD implement storage interfaces as adapters

### 4. Storage Interface Mapping

| Interface | External Implementation | Internal Implementation |
|-----------|------------------------|------------------------|
| `PRStore` | `SQLitePRStore` | `AgentFSPRStore` |
| `RunStore` | `SQLiteRunStore` | `AgentFSRunStore` |
| `SettingsStore` | `SQLiteSettingsStore` | `AgentFSSettingsStore` |
| `TaskTracker` | `NoOpTaskTracker` | `BeadsTaskTracker` |

### 5. Factory Pattern

```typescript
// packages/core/src/storage/index.ts

export function createStoreFactory(): StoreFactory {
  // Internal: AgentFS when enabled
  if (process.env.GWI_USE_AGENTFS === 'true') {
    const { createAgentFSStoreFactory } = await import('../../internal/agentfs-tools');
    return createAgentFSStoreFactory();
  }

  // External: SQLite by default
  return new SQLiteStoreFactory();
}

// internal/beads-tools/beads-task-tracker.ts

export function createTaskTracker(): TaskTracker {
  if (process.env.GWI_USE_BEADS === 'true') {
    return new BeadsTaskTracker();
  }
  return new NoOpTaskTracker();
}
```

---

## Session Start Protocol

**CRITICAL:** When starting a new Claude Code session on this repository, the following MUST be read:

1. `CLAUDE.md` - Repository conventions and rules
2. `000-docs/003-AA-AUDT-appaudit-devops-playbook.md` - DevOps rules of operation
3. `000-docs/006-DR-ADRC-agentfs-beads-policy.md` (this document) - Tool policy

This ensures every session understands:
- When to use AgentFS vs SQLite
- When to use Beads vs no task tracking
- What code can import from `internal/`

See also: `.claude/settings.json` session hooks (if configured).

---

## Consequences

### Positive

- External users get simple, dependency-free experience
- Internal team keeps audit trails and work tracking
- Clear code boundaries prevent accidental coupling
- Storage interfaces allow future backend flexibility

### Negative

- Two mental models to maintain (internal vs external)
- Internal adapters must be kept in sync with storage interfaces
- CI must differentiate between internal and external branches

### Risks

| Risk | Mitigation |
|------|------------|
| Feature drift between modes | All features must work with SQLite first |
| Internal tools leaking to runtime | CI checks import boundaries |
| Session confusion about mode | Session hook forces policy read |

---

## Compliance Checklist

For this repository to be compliant with this ADR:

- [x] `internal/` directory exists with README
- [x] AgentFS adapters implement storage interfaces
- [x] Beads adapters implement TaskTracker interface
- [x] NoOpTaskTracker provides fallback
- [ ] CI enforces import boundaries
- [ ] Session hooks configured in `.claude/`

---

## References

- 004-DR-ADRC: Runtime vs DevTools Architecture Decision
- 6767-g-DR-STND: Beads + AgentFS Complementary Systems Standard
- 003-AA-AUDT: AppAudit DevOps Playbook
- AgentFS: https://github.com/tursodatabase/agentfs
- Beads: https://github.com/steveyegge/beads

---

**Decision:** ACCEPTED
**Date:** 2025-12-15

---

*intent solutions io — confidential IP*
*Contact: jeremy@intentsolutions.io*
