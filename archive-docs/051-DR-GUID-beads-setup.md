# Beads Setup Guide

> **Document ID**: 051-DR-GUID-beads-setup
> **Category**: DR (Development Reference) / GUID (Guide)
> **Created**: 2025-12-16
> **Status**: Active

---

## Overview

Beads (`bd`) is the task tracking system for this repository. **No markdown TODO lists**—all tasks go through Beads.

**Reference**: https://github.com/steveyegge/beads

---

## Installation

### macOS/Linux (Homebrew)

```bash
brew tap steveyegge/beads
brew install bd
bd --version
```

---

## Initialize in Repo

Pick ONE mode based on your workflow:

```bash
# Team members (branch workflow)
bd init --team

# OSS contributor (fork workflow)
bd init --contributor

# Protected main branch
bd init --branch beads-metadata

# Non-interactive (for agents)
bd init --quiet
```

This repo uses `--team` mode.

---

## Files Committed to Git

These files are tracked and shared:

- `.beads/issues.jsonl` - Task data
- `.beads/deletions.jsonl` - Deleted tasks
- `.beads/config.yaml` - Configuration
- `.beads/README.md` - Documentation
- `.beads/metadata.json` - Metadata
- `.gitattributes` - Merge driver config

---

## Files Ignored (Local Only)

These are local and NOT committed:

- `.beads/*.db` - SQLite cache
- `.beads/*.db-*` - WAL files
- `.beads/bd.sock` - Unix socket
- `.beads/bd.pipe` - Named pipe
- `.beads/.exclusive-lock` - Lock file
- `.git/beads-worktrees/` - Worktree data

---

## Merge Driver

Beads uses a custom merge driver for JSONL files:

```bash
# Already configured in this repo
git config merge.beads.driver "bd merge %A %O %A %B"
git config merge.beads.name "bd JSONL merge driver"
```

The `.gitattributes` file specifies:
```
.beads/issues.jsonl merge=beads
```

---

## Agent Protocol

### Session Start

```bash
# First time in repo
bd onboard

# Every session
bd ready         # Pick work from queue
```

### During Work

```bash
bd list          # Show all tasks
bd show <id>     # Show task details
bd close <id>    # Complete task
bd create "..."  # Create new task
```

### Session End

```bash
bd sync
git add .beads/issues.jsonl
git commit -m "chore: sync beads"
git push
```

---

## Common Commands

```bash
bd --version     # Check installation
bd onboard       # First-time setup
bd ready         # Pick next task
bd list          # List all tasks
bd show <id>     # Task details
bd create "..."  # New task
bd close <id>    # Complete task
bd sync          # Sync changes
```

---

## Integration with AgentFS

When running inside AgentFS mount:

```bash
npm run agentfs:mount
cd agents/gwi
bd ready
# ... work ...
bd sync
cd ../..
npm run agentfs:umount
```

---

## Related Documents

- `AGENTS.md` - Agent instructions
- `CLAUDE.md` - Session boot workflow
- `000-docs/050-DR-GUID-agentfs-fuse-setup.md` - AgentFS setup
