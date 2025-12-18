# Hooks: AgentFS + Beads Enforcement

> **Document ID**: 052-DR-GUID-hooks-agentfs-beads
> **Category**: DR (Development Reference) / GUID (Guide)
> **Created**: 2025-12-16
> **Status**: Active

---

## Overview

This repo uses hooks to enforce AgentFS and Beads usage:
- **Preflight**: Validates tools are installed and configured
- **Postflight**: Prints reminder checklist
- **Context compaction**: Keeps capsule under line limit

---

## Hook Scripts

| Script | Purpose |
|--------|---------|
| `scripts/hooks/preflight.sh` | Validate setup before commands |
| `scripts/hooks/postflight.sh` | Print reminder checklist |
| `scripts/hooks/context-compact.sh` | Check context capsule |
| `scripts/hooks/run-with-hooks.sh` | Wrapper for commands |

---

## npm Commands

```bash
npm run hooks:preflight   # Run preflight checks
npm run hooks:postflight  # Print reminders
npm run hooks:wrap -- <cmd>  # Run command with hooks
```

---

## What Preflight Checks

1. **AgentFS CLI** - `agentfs` command available
2. **Beads CLI** - `bd` command available
3. **Beads initialized** - `.beads/config.yaml` exists
4. **AgentFS mount** - Working inside `agents/gwi` (if required)
5. **.gitignore** - Correct entries for local files

---

## Environment Flags

| Flag | Default | Effect |
|------|---------|--------|
| `GWI_REQUIRE_AGENTFS` | `1` | Enforce mount (set `0` for CI) |
| `GWI_REQUIRE_BEADS` | `1` | Always enforce |

### Local Development (default)

```bash
# Full enforcement
GWI_REQUIRE_AGENTFS=1  # Must be inside mount
```

### CI Mode

```bash
# Only check installation, not mount
GWI_REQUIRE_AGENTFS=0
```

---

## Disabling Locally

```bash
# Skip mount check
GWI_REQUIRE_AGENTFS=0 npm run hooks:preflight
```

---

## Required Workflow for Claude Sessions

### Session Start

```bash
npm run agentfs:install   # One-time
npm run agentfs:init      # One-time per project
npm run agentfs:mount     # Each session

cd agents/gwi
bd onboard                # First time
bd ready                  # Pick work
```

### During Work

```bash
# All work happens in agents/gwi/
# Use bd for task tracking
bd list
bd close <id>
```

### Session End

```bash
bd sync
npm run arv
git add .beads/issues.jsonl
git commit
npm run agentfs:umount
```

---

## CI Behavior

In CI, add to workflow:

```yaml
env:
  GWI_REQUIRE_AGENTFS: "0"  # Skip mount check

steps:
  - run: npm run hooks:preflight
  - run: npm run arv
```

This validates:
- AgentFS CLI is installed
- Beads CLI is installed
- Beads is initialized
- .gitignore is correct

But does NOT require the FUSE mount.

---

## Context Capsule

Keep `docs/context-capsule.md` under 250 lines.

The `context-compact.sh` script checks this and reminds you to update it when constraints change.

---

## Postflight Reminders

After each command, you'll see:

```
=== GWI Postflight Reminders ===

[ ] Beads updated?     → bd ready / bd sync
[ ] Artifacts saved?   → .gwi/runs/<runId>/...
[ ] 000-docs flat?     → No subdirectories
[ ] Context capsule?   → Update if new constraints

Before pushing:
    npm run arv
    git add .beads/issues.jsonl
    git commit
```

---

## Related Documents

- `000-docs/050-DR-GUID-agentfs-fuse-setup.md` - AgentFS setup
- `000-docs/051-DR-GUID-beads-setup.md` - Beads setup
- `CLAUDE.md` - Session boot
- `AGENTS.md` - Agent instructions
