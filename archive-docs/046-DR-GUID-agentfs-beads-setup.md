# AgentFS + Beads Setup Guide

> **Status**: Active
> **Created**: 2025-12-16 19:30 CST
> **Purpose**: Install and configure required development tools

---

## Overview

AgentFS and Beads are **required** for development work on git-with-intent. They are NOT required for production runtime (users don't need them), but all internal development must use them.

| Tool | Purpose |
|------|---------|
| AgentFS | Agent state, audit trails, filesystem sandbox |
| Beads | Task tracking (replaces markdown TODOs) |

---

## Installation

### AgentFS

```bash
# Official installer (recommended)
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/tursodatabase/agentfs/releases/download/v0.1.2/agentfs-installer.sh | sh

# Verify installation
agentfs --help
# or if not in PATH:
~/.cargo/bin/agentfs --help
```

### Beads

```bash
# Official installer
curl -sSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash

# Verify installation
bd --version

# Initialize in repo (if not already done)
bd init --quiet
```

### Quick Verification

```bash
npm run tools:verify
```

Expected output:
```
AgentFS: ✅ installed
Beads (bd): ✅ bd version X.X.X
Beads database: ✅ exists (N issues)
```

---

## What Lives Where

### AgentFS (`.agentfs/`)

- Agent run state and context
- Audit trails from hook executions
- Filesystem sandbox for agent operations
- **NOT committed** (`.agentfs/*.db` in .gitignore)

Initialize with:
```bash
npm run agentfs:init
```

### Beads (`.beads/`)

- `issues.jsonl` - Task/issue database (**IS committed**)
- `*.db` - Local cache (**NOT committed**)

Task tracking workflow:
```bash
bd create "Task description" -t task
bd ls                          # List all tasks
bd ready                       # Show ready tasks
bd close <id> -r "Done note"   # Close task
```

---

## Common Failure Modes

### 1. AgentFS not in PATH

**Symptom**: `command not found: agentfs`

**Fix**: Add to PATH or use full path:
```bash
export PATH="$HOME/.cargo/bin:$PATH"
# or add to ~/.bashrc / ~/.zshrc
```

### 2. Beads database missing

**Symptom**: `bd ready` returns empty or error

**Fix**: Initialize:
```bash
bd init --quiet
```

### 3. .agentfs/ being tracked by git

**Symptom**: Database files showing in `git status`

**Fix**: Ensure .gitignore has:
```
.agentfs/*.db
```

Then untrack:
```bash
git rm -r --cached .agentfs/*.db 2>/dev/null || true
```

### 4. Beads issues.jsonl conflicts

**Symptom**: Merge conflicts in `.beads/issues.jsonl`

**Fix**: This is expected with multiple developers. Resolve by:
1. Accept both versions (JSONL is append-friendly)
2. Run `bd sync` if available

---

## Enforcement

The following checks enforce tool usage:

| Check | Command | Enforcement |
|-------|---------|-------------|
| Tools installed | `npm run tools:verify` | Manual / CI |
| ARV passes | `npm run arv` | CI blocks merge |

---

## Reference Implementation

See **bobs-brain** repository for:
- Canonical Agent Engine deployment patterns
- ARV (Agent Readiness Verification) setup
- Drift control mechanisms

---

## Environment Variables

For development with hooks enabled:

```bash
export GWI_AGENTFS_ENABLED=true
export GWI_AGENTFS_ID=gwi
export GWI_BEADS_ENABLED=true
export GWI_HOOK_DEBUG=true
```

---

## See Also

- `000-docs/006-DR-ADRC-agentfs-beads-policy.md` - Policy decisions
- `000-docs/044-DR-GUID-agent-engine-context.md` - Deployment context
- `CLAUDE.md` - Session boot requirements
