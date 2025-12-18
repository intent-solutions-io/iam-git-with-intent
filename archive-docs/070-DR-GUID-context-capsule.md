# GWI Context Capsule

> Keep this under 250 lines. Update when constraints change.

## What is GWI

Git With Intent is an AI-powered multi-agent PR assistant:
- Analyze PRs and issues
- Resolve merge conflicts
- Generate code from issues
- Produce review summaries

## Stack

- TypeScript, Node.js 20+
- Turbo monorepo, npm workspaces
- Firestore (prod), in-memory (dev)
- Anthropic (Claude), Google AI (Gemini)
- Terraform → Cloud Run

## Key Packages

```
@gwi/cli      → apps/cli/
@gwi/core     → packages/core/
@gwi/agents   → packages/agents/
@gwi/engine   → packages/engine/
```

## Commands

```bash
gwi triage <pr>
gwi plan <pr>
gwi resolve <pr>
gwi review <pr>
gwi autopilot <pr>
```

## Required Tools (Internal)

1. **AgentFS** - Agent filesystem (FUSE)
2. **Beads** (`bd`) - Task tracking

## Session Boot

```bash
npm run agentfs:install
npm run agentfs:init
npm run agentfs:mount
cd agents/gwi
bd onboard  # first time
bd ready
```

## Session End

```bash
bd sync
npm run arv
git add .beads/issues.jsonl
git commit
npm run agentfs:umount
```

## Golden Rules

1. User code paths work WITHOUT AgentFS/Beads
2. No markdown TODOs - use Beads
3. 000-docs/ is FLAT (no subdirs)
4. Terraform is infra source of truth
5. Run `npm run arv` before pushing

## ARV Checks

```bash
npm run arv           # All checks
npm run arv:lint      # Forbidden patterns
npm run arv:contracts # Schema validation
npm run arv:goldens   # Deterministic outputs
```

## Environment Flags

```bash
GWI_REQUIRE_AGENTFS=1  # Enforce mount (default)
GWI_REQUIRE_AGENTFS=0  # CI mode (check install only)
GWI_REQUIRE_BEADS=1    # Always required
```

## Key Docs

- `CLAUDE.md` - Session boot
- `AGENTS.md` - Agent instructions
- `000-docs/044-DR-GUID-agent-engine-context.md`
- `000-docs/045-DR-CHKL-agent-engine-compliance.md`

## Current Version

v0.2.0 - BETA READY (Phases 1-15 complete)

## Known Gaps

- No rate limiting (HIGH)
- Orchestrator step state in-memory (HIGH)
- Limited test coverage (MEDIUM)
