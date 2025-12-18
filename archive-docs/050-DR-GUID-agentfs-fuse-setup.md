# AgentFS FUSE Setup Guide

> **Document ID**: 050-DR-GUID-agentfs-fuse-setup
> **Category**: DR (Development Reference) / GUID (Guide)
> **Created**: 2025-12-16
> **Status**: Active

---

## Overview

AgentFS is a SQLite-backed "agent filesystem" from Turso that provides:
- Persistent agent state in a single portable SQLite file
- FUSE mount for standard filesystem access (Linux)
- Key-value storage for configuration and state
- Tool call auditing for all agent operations

**Reference**: https://docs.turso.tech/agentfs

---

## Installation

### Install AgentFS CLI

```bash
npm run agentfs:install

# Or manually:
curl --proto '=https' --tlsv1.2 -LsSf \
    https://github.com/tursodatabase/agentfs/releases/latest/download/agentfs-installer.sh | sh

agentfs --version
```

### Prerequisites (Linux FUSE)

```bash
# Ubuntu/Debian
sudo apt install fuse libfuse2

# Fedora/RHEL
sudo dnf install fuse fuse-libs
```

---

## Initialize Database

```bash
npm run agentfs:init

# Creates: .agentfs/gwi.db
```

This creates a SQLite database with tables for:
- `kv_store` - Key-value pairs
- `tool_calls` - Audit log of tool invocations
- `fs_*` tables - Virtual filesystem metadata

---

## Mount as FUSE Filesystem

```bash
npm run agentfs:mount

# Mounts at: ./agents/gwi
```

Once mounted, use standard Unix tools:

```bash
ls agents/gwi
echo "data" > agents/gwi/output.txt
cat agents/gwi/output.txt
mkdir agents/gwi/runs
```

All writes are persisted to the SQLite database.

---

## Unmount

```bash
npm run agentfs:umount

# Or manually:
fusermount -u ./agents/gwi
```

---

## Inspect Database

```bash
npm run agentfs:inspect

# Shows:
# - Database file info
# - Filesystem contents (agentfs fs ls)
# - KV entry count
# - Tool call count
```

### Direct SQLite Access

```bash
sqlite3 .agentfs/gwi.db

# List tables
.tables

# View KV entries
SELECT key, value FROM kv_store LIMIT 10;

# View recent tool calls
SELECT name, started_at, status FROM tool_calls ORDER BY id DESC LIMIT 10;

# Check filesystem entries
SELECT * FROM fs_dentry LIMIT 10;
```

---

## Session Boot Workflow

For Claude Code sessions:

```bash
# 1. Install (one-time)
npm run agentfs:install

# 2. Initialize (one-time per project)
npm run agentfs:init

# 3. Mount (each session)
npm run agentfs:mount

# 4. Work from inside the mount
cd agents/gwi
claude

# 5. Unmount when done
npm run agentfs:umount
```

---

## Sandbox Mode (Alternative)

Run commands with AgentFS mounted at `/agent`:

```bash
agentfs run /bin/bash
# Inside: ls /agent, write to /agent/output.txt, etc.
```

---

## Portability

The `.agentfs/gwi.db` file is a standard SQLite database. You can:
- Copy it to another machine
- Back it up
- Query it directly with any SQLite client
- Sync to Turso cloud (see Turso docs)

---

## Troubleshooting

### Mount fails with "fuse: device not found"

```bash
sudo modprobe fuse
```

### Permission denied on mount

```bash
# Check FUSE permissions
ls -la /dev/fuse
# Should be: crw-rw-rw- 1 root root ...

# Add user to fuse group if needed
sudo usermod -aG fuse $USER
```

### Database locked

```bash
# Unmount first
npm run agentfs:umount

# Then access directly
sqlite3 .agentfs/gwi.db
```

---

## Git Hygiene

These paths are gitignored (local state only):
- `.agentfs/` - Database files
- `agents/` - Mount points

The backing SQLite file should NOT be committed.

---

## Related Documents

- `CLAUDE.md` - Session boot instructions
- `000-docs/006-DR-ADRC-agentfs-beads-policy.md` - Policy on AgentFS vs Beads
- `000-docs/6767-g-DR-STND-beads-agentfs-complementary-systems.md` - How they work together
