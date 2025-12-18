# AGENTS.md

Instructions for AI agents working in this repository.

---

## BEFORE ANYTHING ELSE

Run `bd onboard` and follow the instructions.

---

## Required Tools

1. **Beads** (`bd`) - Task tracking system
2. **AgentFS** - Agent filesystem (FUSE mount on Linux)

## Session Start

```bash
# First time only
bd onboard

# Every session
bd ready           # Pick work from queue
npm run agentfs:mount  # Mount agent filesystem
```

## Session End

```bash
bd sync
git add .beads/issues.jsonl
git commit -m "chore: sync beads"
npm run agentfs:umount
```

## Rules

- **No markdown TODO lists** - Use Beads for all task tracking
- Reference bead IDs in commits and PRs
- Work inside `agents/gwi/` when AgentFS is mounted
