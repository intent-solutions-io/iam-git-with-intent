# Workspace Directory

**INTERNAL DEV/OPS ONLY** - This is NOT production code.

This directory contains:
- Internal development tooling
- Audit evidence and planning artifacts
- Ephemeral run outputs
- Subagent working state

---

## Structure

```
workspace/
├── rest-zone/          # Planning artifacts, audit evidence
│   ├── architecture-audit.md
│   ├── evidence-index-*.md
│   └── subagent-*.md
├── devtools/           # Internal dev tooling
├── ci-hardmode/        # CI enforcement tools
└── runs/               # Ephemeral AI-generated outputs
    └── run-<id>/
        ├── plan.md
        └── patch-*.txt
```

---

## Rules

1. **NEVER import** from workspace/ in production code
2. **NEVER include** in Docker images or Firebase deploys
3. **NEVER reference** in customer-facing docs/UI
4. **SAFE to delete** - Can be regenerated

---

## Related Internal Tooling

| Tool | Location | Purpose |
|------|----------|---------|
| AgentFS | `.agentfs/` | Audit trail database |
| Beads | `.beads/` | Task tracking database |

Both are git-ignored and local-only.

---

## CI Guard

The CI guard (`npm run arv:no-internal-tools`) ensures forbidden terms don't leak into production paths:
- `agentfs`, `AgentFS`
- `beads`, `bd `
- `.agentfs/`, `.beads/`
