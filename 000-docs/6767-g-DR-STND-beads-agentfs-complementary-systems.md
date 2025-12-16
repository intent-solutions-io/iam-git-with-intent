# BEADS + AGENTFS COMPLEMENTARY SYSTEMS STANDARD

**Document ID:** 6767-g
**Purpose:** Define how Beads and AgentFS operate as complementary systems alongside doc filing
**Status:** Production Standard
**Last Updated:** 2025-12-15
**Applies To:** All Intent Solutions repositories

---

## Overview

Intent Solutions projects operate on a foundation of four complementary systems:

| System | Purpose | Primary Artifact |
|--------|---------|------------------|
| **Doc Filing (6767-a)** | Where standards/specs/evidence live | `000-docs/` files |
| **AAR Template (6767-b)** | How each phase is documented | Phase AAR documents |
| **Beads** | Work graph and task IDs | Task dependency graph |
| **AgentFS** | Audit/snapshots/replay | Execution evidence |

**Core Principle:** These systems are complementary, not competing. Each has a distinct role.

---

## 1. System Alignment

### 1.1 The Four Pillars

```
┌─────────────────────────────────────────────────────────────────┐
│                 INTENT SOLUTIONS OPERATING SYSTEM               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐│
│  │ Doc Filing  │  │ AAR Template│  │   Beads     │  │ AgentFS ││
│  │  (6767-a)   │  │  (6767-b)   │  │             │  │         ││
│  ├─────────────┤  ├─────────────┤  ├─────────────┤  ├─────────┤│
│  │ WHERE docs  │  │ HOW phases  │  │ WHAT work   │  │ HOW work││
│  │ are stored  │  │ documented  │  │ is tracked  │  │ executed││
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────┘│
│         │                │                │              │      │
│         └────────────────┴────────────────┴──────────────┘      │
│                              │                                  │
│                      ┌───────▼───────┐                          │
│                      │   TRACEABILITY │                          │
│                      │   Task → Commit → AAR → Evidence         │
│                      └───────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 How They Connect

| From | To | Connection |
|------|-----|------------|
| Beads Task | Commit | Commit message includes `[Task: bd-xxxx]` |
| Beads Task | AAR | AAR lists task in "Beads / Task IDs Touched" |
| AAR | Doc Filing | AAR saved to `000-docs/` with NNN naming |
| AgentFS | AAR | AAR references AgentFS snapshots in "Evidence" |
| AgentFS | Beads | Snapshot captures state when task completed |

---

## 2. Beads: The Work Graph

### 2.1 Role

Beads is the **canonical source of truth for work**:
- What needs to be done (tasks)
- What depends on what (graph)
- What's complete vs blocked (status)
- Who's responsible (ownership)

### 2.2 What Beads Tracks

| Element | Description |
|---------|-------------|
| Tasks | Individual work units |
| Epics | Groups of related tasks |
| Dependencies | What blocks what |
| Status | open/in_progress/blocked/closed |
| Tags | Phase tags, category tags |

### 2.3 Beads Artifacts

```
.beads/
├── issues.jsonl       # Source of truth (committed)
├── deletions.jsonl    # Deletion manifest (committed)
├── config.yaml        # Configuration (committed)
└── beads.db           # SQLite cache (gitignored)
```

### 2.4 Reference

- Repository: https://github.com/steveyegge/beads
- See also: 6767-f (Work Tracking Standard)

---

## 3. AgentFS: The Audit Ledger

### 3.1 Role

AgentFS is the **audit and reproducibility substrate**:
- Records agent actions and tool calls
- Captures state snapshots
- Enables replay for debugging
- Provides compliance evidence

### 3.2 What AgentFS Captures

| Element | Description |
|---------|-------------|
| Tool calls | What tools were invoked, when, with what params |
| State | Key-value context at any point |
| Files | Agent working files |
| Snapshots | Point-in-time database copies |

### 3.3 AgentFS Artifacts

```
.agentfs/
├── <agent-id>.db      # Agent database (gitignored)
├── config.yaml        # Configuration (committed)
└── snapshots/         # Milestone snapshots (committed)
    └── YYYY-MM-DD-<agent>-<label>.db
```

### 3.4 Reference

- Repository: https://github.com/tursodatabase/agentfs

---

## 4. The "Moving Forward" Rule

### 4.1 Universal Assumption

Every repository created from the `project-template` assumes:

1. **Beads is the work graph**
   - All tasks tracked as Beads issues
   - Dependencies explicitly declared
   - "No orphan work" principle

2. **AgentFS mindset governs execution**
   - Agent actions are auditable
   - Snapshots capture key milestones
   - Replay is possible for debugging

3. **Doc filing (6767-a) governs documentation**
   - All docs in `000-docs/` (flat)
   - Naming follows NNN/6767 patterns
   - Standards are canonical

4. **AARs bridge everything**
   - Every phase produces an AAR
   - AAR references task IDs
   - AAR references evidence (including AgentFS)

### 4.2 Conflict Resolution

If there is a conflict between systems:

**Template standards win.**

Specifically:
1. Doc filing rules (6767-a) are authoritative for file naming/location
2. AAR template (6767-b) is authoritative for phase documentation structure
3. Beads conventions defer to doc filing for evidence storage
4. AgentFS snapshots are evidence, stored/referenced per doc filing rules

### 4.3 Example Conflict Resolution

**Scenario:** Beads wants to store notes in `.beads/notes/`, but doc filing says all docs go in `000-docs/`.

**Resolution:**
- `.beads/` contains only Beads operational files
- Human-readable notes/docs go in `000-docs/` with proper naming
- Beads tasks can reference `000-docs/` file paths

---

## 5. Integration Patterns

### 5.1 Phase Completion Pattern

```
1. Work on tasks (Beads tracks)
   └─▶ bd update bd-xxxx --status in_progress

2. Execute actions (AgentFS records)
   └─▶ agent.tools.record('action', ...)

3. Commit changes (reference Task ID)
   └─▶ git commit -m "... [Task: bd-xxxx]"

4. Complete phase (AAR documents)
   └─▶ Create NNN-AA-AACR-phase-n-....md
       ├─▶ List task IDs in "Beads / Task IDs Touched"
       └─▶ Reference AgentFS snapshots in "Evidence"

5. Create snapshot (AgentFS captures)
   └─▶ cp .agentfs/agent.db .agentfs/snapshots/...

6. Close tasks (Beads updates)
   └─▶ bd close bd-xxxx --reason "Completed in AAR-xxx"
```

### 5.2 Audit Trail Pattern

For any piece of work, you can trace:

```
AAR (000-docs/NNN-AA-AACR-...)
├─▶ Task IDs listed → Beads dependency graph
├─▶ Commits listed → Git history with [Task: bd-xxxx]
├─▶ Files listed → 000-docs/ evidence files
└─▶ Snapshots listed → AgentFS replay capability
```

---

## 6. Initialization Timeline

### 6.1 Template Repository (This Repo)

| System | Status | Reason |
|--------|--------|--------|
| Doc Filing | Active | Always active |
| AAR Template | Active | Always active |
| Beads | Referenced only | Docs-only seed |
| AgentFS | Referenced only | Docs-only seed |

### 6.2 Project Repository Phase 0

| System | Status | Reason |
|--------|--------|--------|
| Doc Filing | Active | Copied from template |
| AAR Template | Active | Copied from template |
| Beads | Not initialized | Phase 0 is docs-only |
| AgentFS | Not initialized | Phase 0 is docs-only |

### 6.3 Project Repository Phase 1+

| System | Status | Reason |
|--------|--------|--------|
| Doc Filing | Active | Foundation |
| AAR Template | Active | Foundation |
| Beads | Initialized | `bd init` in Phase 1 |
| AgentFS | Initialized | `agentfs init` in Phase 1 |

---

## 7. bobs-brain Reference

The [bobs-brain](https://github.com/intent-solutions-io/bobs-brain.git) repository demonstrates the "tight ARV posture" that Intent Solutions projects aspire to:

- **A**utomated checks that fail fast
- **R**eproducible builds and deployments
- **V**erifiable evidence for every change

Study bobs-brain when implementing CI/CD gates in Phase 1+.

---

## 8. Quick Reference: System Responsibilities

| Question | Answer By |
|----------|-----------|
| "Where do I put this doc?" | Doc Filing (6767-a) |
| "How do I document this phase?" | AAR Template (6767-b) |
| "What work needs to be done?" | Beads |
| "What blocks this task?" | Beads |
| "What actions were taken?" | AgentFS |
| "Can I replay this execution?" | AgentFS |
| "What's the evidence?" | AAR (referencing all systems) |

---

## 9. Compliance Checklist

For any Intent Solutions project to be compliant:

- [ ] `000-docs/` exists and is flat
- [ ] 6767 standards imported (a, b, c, d, e, f, g)
- [ ] Phase 0 AAR exists
- [ ] (Phase 1+) Beads initialized
- [ ] (Phase 1+) AgentFS initialized
- [ ] Every phase has an AAR
- [ ] Every AAR lists task IDs touched
- [ ] Every commit references a task ID
- [ ] Evidence is traceable from AAR

---

## References

- 6767-a: Document Filing System Standard
- 6767-b: AAR Template
- 6767-c: Project Start SOP
- 6767-f: Work Tracking Standard (Beads + Task IDs)
- Beads: https://github.com/steveyegge/beads
- AgentFS: https://github.com/tursodatabase/agentfs
- bobs-brain: https://github.com/intent-solutions-io/bobs-brain.git

---

**BEADS + AGENTFS COMPLEMENTARY SYSTEMS STANDARD — Intent Solutions**
*Four pillars. One traceability chain. Complete auditability.*
