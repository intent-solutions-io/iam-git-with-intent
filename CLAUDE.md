# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## SESSION BOOT (MANDATORY)

**You MUST start by invoking the foreman subagent to route the task.**

The foreman will create/update Beads tasks before implementation. All work happens inside the AgentFS mount.

### Quick Boot Sequence

```bash
npm run hooks:preflight     # Validate setup
npm run agentfs:mount       # Mount filesystem
cd agents/gwi               # Enter mount
bd onboard                  # First time only
bd ready                    # Pick work
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
- **planner.md** - PRDs, epics, Beads tasks
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

- **No direct gcloud deploys** - All infra goes through GitHub Actions + Terraform
- **No deletion** of `000-docs/`, `.beads/`, `.claude/`, `infra/terraform/` without explicit instruction
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
- **Infrastructure**: Terraform → Cloud Run, GitHub Actions with WIF

### Package Dependency Graph

```
@gwi/cli → @gwi/agents, @gwi/integrations, @gwi/core
@gwi/engine → @gwi/agents, @gwi/core
@gwi/agents → @gwi/core
@gwi/integrations → @gwi/core
apps/gateway, apps/github-webhook → @gwi/core
```

---

## RUNTIME vs DEV TOOLS (GOLDEN RULE)

**Production Runtime** (user-facing CLI/API):
- Depends ONLY on: Node.js, GitHub API, Anthropic/Google AI APIs, Firestore
- **Does NOT require** AgentFS, Beads, or experimental tools

**Dev/Ops Tools** (internal only): AgentFS, Beads, "Hard Mode" CI

> **Golden Rule**: Any user-visible code path MUST work without AgentFS or Beads.

### AgentFS + Beads: REQUIRED for Development

**These tools are non-negotiable for internal development work:**

- **AgentFS**: All agent state and artifacts. Uses FUSE mount on Linux.
- **Beads**: All task tracking. **No markdown TODOs**—use Beads; reference bead IDs in PRs/commits.
- **Reference**: See `bobs-brain` repo for canonical Agent Engine deployment + ARV + drift control.

#### Session Boot: AgentFS FUSE (Linux)

```bash
npm run agentfs:install   # Install AgentFS CLI
npm run agentfs:init      # Create .agentfs/gwi.db
npm run agentfs:mount     # Mount at ./agents/gwi

# Start Claude Code from inside the mount
cd agents/gwi
claude
```

Verify setup: `npm run tools:verify`

#### AgentFS Commands

```bash
npm run agentfs:install   # Install CLI
npm run agentfs:init      # Initialize database
npm run agentfs:mount     # Mount FUSE filesystem
npm run agentfs:umount    # Unmount
npm run agentfs:inspect   # Show DB contents
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
| `infra/terraform/` | All infrastructure (SOURCE OF TRUTH) |
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

- **Terraform is source of truth** - All infra changes in `infra/terraform/`
- **Deployment flow**: GitHub Actions → Terraform → Cloud Run (NOT direct `gcloud`)
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
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=...
GITHUB_TOKEN=ghp_...
```

**Production**:
```bash
GWI_STORE_BACKEND=firestore
GCP_PROJECT_ID=your-project
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Dev tools** (internal only): `GWI_AGENTFS_ENABLED`, `GWI_BEADS_ENABLED`, `GWI_HOOK_DEBUG`

---

## CONSTRAINTS

- Do NOT require AgentFS/Beads for user-facing features
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
- System audit: `000-docs/032-AA-AUDT-appaudit-devops-playbook.md`
- AgentFS/Beads policy: `000-docs/006-DR-ADRC-agentfs-beads-policy.md`
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
