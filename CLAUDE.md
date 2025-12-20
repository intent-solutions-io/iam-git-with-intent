## Task Tracking (Beads / bd)
- Use `bd` for ALL tasks/issues (no markdown TODO lists).
- Start of session: `bd ready`
- Create work: `bd create "Title" -p 1 --description "Context + acceptance criteria"`
- Update status: `bd update <id> --status in_progress`
- Finish: `bd close <id> --reason "Done"`
- End of session: `bd sync` (flush/import/export + git sync)
- Manual testing safety:
  - Prefer `BEADS_DIR` to isolate a workspace if needed. (`BEADS_DB` exists but is deprecated.)


# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## BEADS BACKLOG (452 OPEN TASKS)

**This project uses [beads](https://github.com/Dicklesworthstone/beads_viewer) for task tracking.**

```bash
bd list --status open          # View all open tasks
bd list --status open | wc -l  # Count remaining tasks
bd close <id> -r "reason"      # Close completed tasks with evidence
```

### Current Backlog by Epic

| Epic | Tasks | Assignee | Focus Area |
|------|-------|----------|------------|
| A (A1-A12) | 74 | @backend, @security | Security hardening, auth, limits |
| B (B1-B10) | 60 | @backend | Core platform features |
| C (C1-C10) | 61 | @connectors | GitHub/GitLab integrations |
| D (D1-D8) | 48 | @security | Policy engine, audit |
| E (E1-E7) | 52 | @orchestrator | Agent orchestration |
| F (F1-F9) | 54 | @orchestrator | Run execution |
| G (G1-G6) | 36 | @frontend | Web UI |
| H (H1-H7) | 44 | @infra | Infrastructure, DR |
| I (I1-I6) | 36 | @ai | AI/ML features |

**After completing work, ALWAYS close the corresponding beads with evidence.**

---

## SESSION BOOT (MANDATORY)

**You MUST start by invoking the foreman subagent to route the task.**

### Quick Boot Sequence

```bash
npm run hooks:preflight     # Validate setup
# Invoke foreman subagent
```

### Then:

1. **Read context capsules**:
   - `000-docs/044-DR-GUID-agent-engine-context.md`
   - `000-docs/045-DR-CHKL-agent-engine-compliance.md`
   - `docs/context-capsule.md`

2. **Print a Constraints Recap** (10-20 bullets max):
   - Deployment target (Vertex AI Agent Engine)
   - ADK patterns to use/avoid
   - Tool contract rules
   - Run artifact requirements
   - Approval gating rules
   - ARV checks that apply

3. **Inventory files** you will touch and list them explicitly

4. **Write a test plan** before implementing:
   - What tests will be added/modified
   - Which ARV checks apply
   - How to verify the change

### Subagents

Route tasks through the foreman (`.claude/agents/foreman.md`) which delegates to:
- **planner.md** - PRDs, epics, tasks
- **engine-core.md** - Run bundle, schemas, policy
- **connector-engineer.md** - Tool SDKs, integrations
- **reviewer.md** - ARV, security, drift
- **docs-filer.md** - Documentation, 000-docs
- **ops-arv.md** - Agent Engine patterns

### Hard Requirements

- This repo targets **Vertex AI Agent Engine** deployments. No local-only shortcuts.
- Use approved ADK patterns. If unsure, find current usage in repo and match it.
- Every tool has a Zod schema; validate with contract tests.
- Produce deterministic outputs where required (goldens/fixtures).
- Implement approval gating for any destructive external writes.
- All runs produce artifacts + audit log using the repo's run bundle format.

### Execution Requirements

- Add/adjust tests with every change
- Run `npm run arv` before finalizing
- Provide evidence (command outputs) in the final message

**If anything conflicts, prefer `000-docs/044-DR-GUID-agent-engine-context.md` as source of truth.**

---

## SAFETY GUARDRAILS

- **No direct gcloud deploys** - All infra goes through GitHub Actions + OpenTofu
- **No deletion** of `000-docs/`, `.claude/`, `infra/` without explicit instruction
- **No secrets in code** - Use environment variables and Secret Manager
- **Prefer small diffs** over wholesale rewrites

---

## PROJECT OVERVIEW

**Git With Intent** is an AI-powered multi-agent PR assistant:

- Read and understand GitHub issues and PRs
- Detect and resolve merge conflicts
- Generate code changes from issue descriptions
- Run validation (tests, linting)
- Produce human-readable review summaries

| Attribute | Value |
|-----------|-------|
| CLI Command | `gwi` |
| Target Users | Developers wanting AI assistance with PR workflows |
| Business Model | CLI open-source; hosted service paid |
| Current Version | v0.2.0 |
| Status | BETA READY (Phases 1-15 complete) |

### Technology Stack

- **Language**: TypeScript (strict mode), Node.js 20+
- **Build**: Turbo monorepo with npm workspaces
- **Database**: Firestore (production), in-memory (dev)
- **AI**: Anthropic SDK (Claude), Google AI SDK (Gemini)
- **Payments**: Stripe
- **Infrastructure**: OpenTofu → Cloud Run, GitHub Actions with WIF

### Package Dependency Graph

```
@gwi/cli → @gwi/agents, @gwi/integrations, @gwi/core
@gwi/engine → @gwi/agents, @gwi/core
@gwi/agents → @gwi/core
@gwi/integrations → @gwi/core
apps/gateway, apps/github-webhook → @gwi/core
```

---

## KEY DIRECTORIES

| Directory | Purpose |
|-----------|---------|
| `apps/cli/` | CLI (`gwi` commands) |
| `apps/gateway/` | A2A Gateway (Cloud Run) |
| `apps/github-webhook/` | GitHub webhook handler |
| `apps/web/` | React SPA (Firebase Hosting) |
| `packages/core/` | Storage interfaces, models, billing, security |
| `packages/agents/` | Agent implementations (Triage, Coder, Resolver, Reviewer) |
| `packages/engine/` | Agent execution engine with hook system |
| `packages/integrations/` | GitHub/GitLab integrations |
| `infra/` | All infrastructure - OpenTofu (SOURCE OF TRUTH) |
| `000-docs/` | Internal docs (flat, numbered: `NNN-CC-ABCD-*.md`) |

---

## MULTI-AGENT ARCHITECTURE

CLI commands (agents hidden from users):

```bash
gwi triage <pr-url>      # Analyze PR/issue
gwi plan <pr-url>        # Generate change plan
gwi resolve <pr-url>     # Apply conflict resolutions
gwi review <pr-url>      # Generate review summary
gwi autopilot <pr-url>   # Full pipeline
```

**Internal Agents**: Orchestrator (Gemini Flash), Triage (Gemini Flash), Coder (Claude Sonnet), Resolver (Claude Sonnet/Opus), Reviewer (Claude Sonnet)

---

## STORAGE ARCHITECTURE

| Backend | Usage | Config |
|---------|-------|--------|
| Firestore | Production | `GWI_STORE_BACKEND=firestore` + `GCP_PROJECT_ID` |
| In-Memory | Development | `GWI_STORE_BACKEND=memory` or unset |

**Key interfaces** (in `packages/core/src/storage/interfaces.ts`):
- `TenantStore` - Multi-tenant CRUD for orgs, repos, runs
- `RunStore` - Run tracking and step management
- `UserStore`, `MembershipStore` - Auth and permissions

**Known limitation**: Orchestrator step tracking is in-memory; Cloud Run restarts leave runs stuck "running".

---

## CI/CD & INFRASTRUCTURE

- **OpenTofu is source of truth** - All infra changes in `infra/`
- **Deployment flow**: GitHub Actions → OpenTofu → Cloud Run (NOT direct `gcloud`)
- **CI checks**: `scripts/ci/check_nodrift.sh`, `scripts/ci/check_arv.sh`
- **Branches**: `main` → prod, `develop` → dev, `internal` → hard mode checks

---

## BUILD & TEST COMMANDS

```bash
# Install dependencies
npm install

# Build all packages (Turbo, respects dependency graph)
npm run build

# Type check all packages
npm run typecheck

# Run all tests
npm run test

# Run tests for a single package
npx turbo run test --filter=@gwi/core
npx turbo run test --filter=@gwi/engine

# Lint (currently non-blocking in CI)
npm run lint

# Development watch mode
npm run dev

# Run CLI after build
node apps/cli/dist/index.js --help

# Smoke tests
npm run smoke:staging
npm run smoke:production
```

**Important**: Always run `npm run build && npm run typecheck` before considering work complete.

---

## ENVIRONMENT VARIABLES

**Required** (at least one AI provider):
```bash
ANTHROPIC_API_KEY="REDACTED"
GOOGLE_AI_API_KEY="REDACTED"
GITHUB_TOKEN="REDACTED"
```

**Production**:
```bash
GWI_STORE_BACKEND=firestore
GCP_PROJECT_ID=your-project
STRIPE_SECRET_KEY="REDACTED"
STRIPE_WEBHOOK_SECRET="REDACTED"
```

**Note**: Values must be set outside the repo (Secret Manager / CI env / local shell). Never commit real secrets.

---

## CONSTRAINTS

- Do NOT hard-code model names (use config/env)
- Do NOT break storage interface contracts (`packages/core/src/storage/interfaces.ts`)
- Use storage interfaces for ALL persistence
- Keep CLI experience simple (one command does the job)

---

## KNOWN GAPS (v0.2.0)

| Gap | Severity |
|-----|----------|
| No rate limiting | HIGH |
| Orchestrator step state in-memory | HIGH |
| Limited test coverage | MEDIUM |

---

## REFERENCE

- **Agent Engine Context**: `000-docs/044-DR-GUID-agent-engine-context.md` (read first!)
- **Compliance Checklist**: `000-docs/045-DR-CHKL-agent-engine-compliance.md`
- System audit: `000-docs/126-AA-AUDT-appaudit-devops-playbook.md`
- Phase AARs: `000-docs/NNN-AA-REPT-*.md`

---

## ARV (Agent Readiness Verification)

Run before every commit:

```bash
npm run arv           # All checks
npm run arv:lint      # Forbidden patterns
npm run arv:contracts # Schema validation
npm run arv:goldens   # Deterministic outputs
npm run arv:smoke     # Boot check
```

CI will fail if ARV does not pass.

---

## PHASE EXECUTION PROTOCOL

**Quiet mode**: Do not spam output. Only print when:
- There are errors/issues needing attention
- End-of-phase summary with evidence + AAR filename

### Every Phase Must End With:

1. `npm test` (or applicable test command)
2. **AAR created** in `000-docs/` using `docs/templates/aar-template.md`
   - Filename: `NNN-AA-AACR-phase-<n>-short-description.md`
3. Commit + push

### Subagent Routing (Mandatory)

All work routes through the foreman (`.claude/agents/foreman.md`):
- AAR/docs work → `docs-filer.md`
- Hook/enforcement → `reviewer.md` + `ops-arv.md`
- Scripting → `engine-core.md`
- Planning → `planner.md`
- Integrations → `connector-engineer.md`

### Output Evidence Required

At phase end, print:
- Key file changes
- Test/ARV results
- AAR filename
- Commit hash
