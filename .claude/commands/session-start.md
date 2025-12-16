# Session Start Command

This command MUST be run at the start of every Claude Code session working on git-with-intent.

## Required Reading

Before proceeding with any work, read and acknowledge the following documents:

1. **CLAUDE.md** - Core repository conventions and rules
2. **000-docs/003-AA-AUDT-appaudit-devops-playbook.md** - DevOps rules of operation
3. **000-docs/006-DR-ADRC-agentfs-beads-policy.md** - AgentFS/Beads tooling policy

## Key Policies to Remember

### Runtime vs DevTools Separation

- **Product Runtime** (apps/, packages/) MUST work without AgentFS or Beads
- **Internal Development** (internal/) uses AgentFS for state, Beads for tasks
- Storage interfaces abstract the underlying implementation

### Internal Tooling

When working on this repo as Intent Solutions developer:

```bash
# Enable internal tooling
export GWI_USE_AGENTFS=true
export GWI_USE_BEADS=true
```

When testing user-facing functionality:

```bash
# Disable internal tooling (user mode)
unset GWI_USE_AGENTFS
unset GWI_USE_BEADS
```

### Documentation Standards

- All docs go in `000-docs/` (flat directory)
- Follow `NNN-CC-ABCD-name.md` naming convention
- Create AAR after every phase using template 6767-b

## Confirmation

After reading the required documents, confirm you understand:

1. Runtime code NEVER imports from `internal/`
2. All persistence uses storage interfaces
3. AgentFS/Beads are for internal dev only
4. Every phase ends with an AAR

Proceed with the session.
