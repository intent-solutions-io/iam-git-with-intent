# Phase Execution Protocol

> **Document ID**: 054-DR-GUID-phase-protocol
> **Category**: DR (Development Reference) / GUID (Guide)
> **Created**: 2025-12-16
> **Status**: Active

---

## Overview

This document defines how phases are executed in git-with-intent, including quiet mode output, subagent routing, and mandatory AAR creation.

---

## Quiet Mode Policy

**Do NOT spam output.** Only print to screen when:

1. **Errors or issues** requiring immediate attention
2. **End-of-phase summary** with:
   - Key file changes
   - Test/ARV results
   - AAR filename
   - Commit hash

Silent operation is the default. Verbose output clutters context and wastes tokens.

---

## Subagent Routing (Mandatory)

All work routes through the **foreman** (`.claude/agents/foreman.md`).

| Task Type | Route To |
|-----------|----------|
| AAR/documentation | `docs-filer.md` |
| Hook/enforcement updates | `reviewer.md` + `ops-arv.md` |
| Scripting/engine work | `engine-core.md` |
| Planning/PRDs | `planner.md` |
| Integrations/connectors | `connector-engineer.md` |

**Never bypass the foreman** - it enforces Beads-first and AgentFS-first rules.

---

## AAR Requirement

**Every phase MUST end with an AAR.**

### Location

- Template: `docs/templates/aar-template.md`
- Save to: `000-docs/NNN-AA-AACR-phase-<n>-short-description.md`

### Required Metadata

| Field | Source |
|-------|--------|
| Beads | `bd list` snapshot or specific bead IDs |
| AgentFS | Agent ID + mount path + db path (if known) |
| Commit(s) | Hash(es) from the phase |
| Date/Time | CST (America/Chicago) timestamp |

### End-of-Phase Checklist

```bash
# 1. Sync Beads
bd sync

# 2. Run tests
npm test

# 3. Create AAR (use template)
# Save to 000-docs/NNN-AA-AACR-phase-<n>-description.md

# 4. Commit with bead reference
git add .
git commit -m "feat: phase N complete [bead-id]"
git push
```

---

## Beads Metadata

In every AAR, include the Beads state:

```markdown
| Beads | `GWI-42, GWI-43` or `bd list` output |
```

Example `bd list` snapshot:

```
GWI-42  in-progress  Phase 1: Engine core substrate
GWI-43  closed       Phase 0: Baseline setup
```

---

## AgentFS Metadata

In every AAR, include AgentFS info:

```markdown
| AgentFS | `gwi` / `agents/gwi` / `.agentfs/gwi.db` |
```

Fields:
- **Agent ID**: Usually `gwi`
- **Mount Path**: `agents/gwi` (FUSE mount)
- **DB Path**: `.agentfs/gwi.db` (SQLite database)

---

## Phase Lifecycle

```
Start Phase
    ↓
Route via foreman
    ↓
Execute tasks (quiet mode)
    ↓
bd sync + npm test
    ↓
Create AAR
    ↓
Commit + push
    ↓
End Phase (print summary)
```

---

## Quick Reference

| Action | Command |
|--------|---------|
| Boot session | `npm run hooks:preflight` |
| Mount AgentFS | `npm run agentfs:mount && cd agents/gwi` |
| Pick work | `bd ready` |
| Sync Beads | `bd sync` |
| Run tests | `npm test` |
| Check ARV | `npm run arv` |
| End session | `npm run hooks:postflight` |

---

## Related Documents

- `CLAUDE.md` - Session boot and constraints
- `docs/templates/aar-template.md` - AAR template
- `000-docs/053-DR-GUID-subagents-playbook.md` - Subagent reference
- `000-docs/051-DR-GUID-beads-setup.md` - Beads setup
- `000-docs/050-DR-GUID-agentfs-fuse-setup.md` - AgentFS setup
