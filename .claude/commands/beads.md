# Beads (bd) Workflow Reference

This project uses **beads** (`bd`) for issue tracking. 452 open tasks in backlog.

## Quick Commands

```bash
# Find work
bd ready --json              # Unblocked issues
bd stale --days 30 --json    # Forgotten issues

# Create issues (ALWAYS include --description)
bd create "Title" --description="Why/what/how" -t bug|feature|task -p 0-4 --json
bd create "Found bug" --description="Details" -p 1 --deps discovered-from:<parent-id> --json

# Claim and update
bd update <id> --status in_progress --json
bd close <id> -r "Implemented" --json

# Search
bd list --status open --priority 1 --json
bd show <id> --json

# CRITICAL: Sync at end of session
bd sync
```

## Workflow

1. `bd ready` - Find unblocked work
2. `bd update <id> --status in_progress` - Claim task
3. Implement, test, document
4. `bd close <id> -r "reason"` - Complete with evidence
5. `bd sync` + `git push` - MANDATORY before ending session

## Priorities

- `0` - Critical (security, data loss)
- `1` - High (major features, important bugs)
- `2` - Medium (nice-to-have)
- `3` - Low (polish)
- `4` - Backlog

## Dependencies

```bash
bd dep add <child> <parent>    # child NEEDS parent
bd dep tree <id>               # View dependency graph
bd blocked                     # Show blocked issues
```

## Current Backlog by Epic

| Epic | Assignee | Focus |
|------|----------|-------|
| A (74) | @backend, @security | Security, auth, limits |
| B (60) | @backend | Core platform |
| C (61) | @connectors | GitHub/GitLab |
| D (48) | @security | Policy engine, audit |
| E (52) | @orchestrator | Agent orchestration |
| F (54) | @orchestrator | Run execution |
| G (36) | @frontend | Web UI |
| H (44) | @infra | Infrastructure, DR |
| I (36) | @ai | AI/ML features |

## Rules

- ALWAYS close completed beads with evidence
- ALWAYS use `--json` for programmatic output
- ALWAYS run `bd sync` and `git push` at session end
- Link discoveries with `discovered-from`
