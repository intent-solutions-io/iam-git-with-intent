# Internal DevTools

**INTERNAL USE ONLY** - This directory contains tools for Intent Solutions' internal development workflows.

These tools are **NOT required** for external users of Git With Intent.

## Directory Structure

```
internal/
├── agentfs-tools/     # AgentFS integration for internal state/audit
├── beads-tools/       # Beads integration for internal task tracking
└── ci-hardmode/       # Hard Mode CI checks (optional, internal)
```

## Policy Summary

| Tool | Internal Use | External Runtime |
|------|--------------|------------------|
| AgentFS | **Required** for agent state/audit | Optional, behind interfaces |
| Beads | **Required** for task tracking | Optional, not exposed |
| Hard Mode | **Required** for internal CI | Opt-in via `HARD_MODE=true` |

## Usage

### For Internal Development

When working on Git With Intent as a developer at Intent Solutions:

1. **AgentFS** - Use for all agent state management during development
2. **Beads** - Use for task tracking instead of markdown TODOs
3. **Hard Mode** - CI will enforce rules on internal branches

### For External Users

External users of the `gwi` CLI or hosted service:

- Do NOT need to install AgentFS or Beads
- Use standard SQLite storage by default
- All features work without internal tools

## See Also

- `000-docs/006-DR-ADRC-agentfs-beads-policy.md` - Full policy ADR
- `000-docs/004-DR-ADRC-runtime-vs-devtools.md` - Runtime vs DevTools decision
