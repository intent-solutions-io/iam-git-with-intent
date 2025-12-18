# Subagents Playbook

> **Document ID**: 053-DR-GUID-subagents-playbook
> **Category**: DR (Development Reference) / GUID (Guide)
> **Created**: 2025-12-16
> **Status**: Active

---

## Overview

This repo uses project-level subagents to organize work. All tasks route through the **foreman** which delegates to specialized agents.

---

## Subagent Reference

| Agent | When to Use |
|-------|-------------|
| **foreman.md** | Always start here. Routes tasks and enforces compliance. |
| **planner.md** | PRDs, ADRs, epics, Beads task breakdown. |
| **engine-core.md** | Run bundle, schemas, state machine, policy gates. |
| **connector-engineer.md** | Tool SDKs, integrations, GitHub/GitLab connectors. |
| **reviewer.md** | ARV, security review, drift control. |
| **docs-filer.md** | Documentation, 000-docs compliance, AARs. |
| **ops-arv.md** | Agent Engine patterns, bobs-brain parity. |

---

## Required Boot Sequence

```bash
# 1. Mount AgentFS
npm run agentfs:mount

# 2. Enter mount
cd agents/gwi

# 3. Initialize Beads (first time)
bd onboard

# 4. Pick work
bd ready

# 5. Invoke foreman
# The foreman routes to appropriate subagent(s)
```

---

## Workflow

```
Task → Foreman → Subagent(s) → Evidence → Review → Done
```

1. **Foreman receives task**
2. **Foreman creates Beads** for tracking
3. **Foreman routes** to appropriate subagent(s)
4. **Subagent executes** and produces evidence
5. **Reviewer validates** ARV and quality
6. **Foreman confirms** completion with `bd sync`

---

## Hard Rules (All Agents)

1. **Beads-first**: No markdown TODOs. Use `bd create`, `bd ready`, `bd sync`.
2. **AgentFS-first**: Work inside `agents/gwi` mount.
3. **Evidence**: Run tests/ARV and paste outputs.
4. **Docs**: 000-docs is flat, use v4.2 filenames.

---

## Definition of Done

- [ ] Beads task created and tracked
- [ ] Work done inside AgentFS mount
- [ ] Tests written/updated
- [ ] ARV passes: `npm run arv`
- [ ] Documentation updated if needed
- [ ] `bd sync` completed
- [ ] Changes committed with bead ID reference

---

## Quick Commands

```bash
# Boot sequence
npm run agentfs:mount && cd agents/gwi
bd onboard  # first time
bd ready

# During work
bd list
bd close <id>
npm run arv

# End session
bd sync
cd ../..
npm run agentfs:umount
```

---

## Agent Locations

All agents are in `.claude/agents/`:

```
.claude/agents/
├── foreman.md
├── planner.md
├── engine-core.md
├── connector-engineer.md
├── reviewer.md
├── docs-filer.md
└── ops-arv.md
```

---

## Related Documents

- `CLAUDE.md` - Session boot
- `AGENTS.md` - Agent instructions
- `000-docs/050-DR-GUID-agentfs-fuse-setup.md`
- `000-docs/051-DR-GUID-beads-setup.md`
- `000-docs/052-DR-GUID-hooks-agentfs-beads.md`
