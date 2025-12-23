# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Task Tracking (Beads / bd)

- Use `bd` for ALL tasks/issues (no markdown TODO lists)
- Start of session: `bd ready`
- Create work: `bd create "Title" -p 1 --description "Context + acceptance criteria"`
- Update status: `bd update <id> --status in_progress`
- Finish: `bd close <id> --reason "Done"`
- End of session: `bd sync` (flush/import/export + git sync)
- After upgrading `bd`: run `bd info --whats-new`, then `bd hooks install` if warned

Check backlog: `bd list --status open`

**After completing work, ALWAYS close the corresponding beads with evidence.**

---

## PROJECT OVERVIEW

**Git With Intent** is an AI-powered multi-agent platform with two core capabilities:

1. **PR Automation (shipping now)**: Resolve merge conflicts, create PRs from issues, review code, full autopilot mode
2. **Predictive Analytics (in progress)**: TimeGPT-powered forecasting for merge times, sprint delivery, technical debt trajectories

**Core capabilities:**
- Semantic merge conflict resolution (not just textual)
- Generate code from GitHub issues
- PR complexity scoring and review analysis
- Repository health analysis and pattern detection
- Time series forecasting (roadmap: TimeGPT integration)

| Attribute | Value |
|-----------|-------|
| CLI Command | `gwi` |
| Target Users | Developers wanting AI assistance with PR workflows |
| Business Model | CLI open-source; hosted service paid |
| Current Version | v0.2.0 |
| Status | Active development (422 open tasks across 9 epics) |

### Technology Stack

- **Language**: TypeScript (strict mode), Node.js 20+
- **Build**: Turbo monorepo with npm workspaces
- **Database**: Firestore (production), SQLite (local dev with analytics)
- **AI Models**:
  - Claude Sonnet/Opus (Anthropic) - Code generation, conflict resolution, reviews
  - Gemini Flash (Google) - Fast triage, orchestration
  - TimeGPT (Nixtla) - Time series forecasting (roadmap)
- **Payments**: Stripe
- **Infrastructure**: OpenTofu → Cloud Run, GitHub Actions with WIF

---

## WORKSPACE STRUCTURE

```
git-with-intent/
├── apps/
│   ├── api/              # REST API (Cloud Run)
│   ├── cli/              # CLI tool (gwi command)
│   ├── gateway/          # A2A Gateway (Cloud Run)
│   ├── github-webhook/   # GitHub webhook handler (Cloud Run)
│   ├── registry/         # Plugin registry
│   ├── web/              # React dashboard (Firebase Hosting)
│   └── worker/           # Background jobs (Cloud Run)
├── packages/
│   ├── agents/           # Agent implementations (Triage, Coder, Resolver, Reviewer)
│   ├── core/             # Storage interfaces, billing, security, reliability (68 modules)
│   ├── engine/           # Agent execution engine with hook system
│   ├── integrations/     # GitHub/GitLab integrations
│   └── sdk/              # SDK for external consumers
├── infra/                # OpenTofu infrastructure (SOURCE OF TRUTH)
├── 000-docs/             # Internal documentation (flat, numbered: NNN-CC-ABCD-*.md)
├── scripts/              # Build, CI, ARV, deployment scripts
└── test/                 # Cross-cutting tests (contracts, goldens)
```

### Package Dependency Graph

```
@gwi/cli → @gwi/agents, @gwi/integrations, @gwi/core
@gwi/engine → @gwi/agents, @gwi/core
@gwi/agents → @gwi/core
@gwi/integrations → @gwi/core
apps/api, apps/gateway, apps/github-webhook, apps/worker → @gwi/core
@gwi/sdk → @gwi/core
```

---

## BUILD & TEST COMMANDS

```bash
# Install dependencies
npm install

# Build all packages (Turbo, respects dependency graph)
npm run build

# Type check all packages
npm run typecheck

# Run all tests (~1700 tests)
npm run test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run tests for a single package
npx turbo run test --filter=@gwi/core
npx turbo run test --filter=@gwi/engine
npx turbo run test --filter=@gwi/agents

# Lint (currently non-blocking in CI)
npm run lint
npm run lint:fix

# Development watch mode
npm run dev

# Format code
npm run format

# Run CLI after build
node apps/cli/dist/index.js --help

# Smoke tests
npm run smoke:staging
npm run smoke:production

# Test hooks
npm run test:hooks:smoke

# Preflight/postflight hooks
npm run hooks:preflight
npm run hooks:postflight
```

**Important**: Always run `npm run build && npm run typecheck` before considering work complete.

---

## ARV (Agent Readiness Verification)

Run before every commit to enforce code standards:

```bash
npm run arv           # All checks
npm run arv:lint      # Forbidden patterns (no deprecated code)
npm run arv:contracts # Schema validation (Zod contracts)
npm run arv:goldens   # Deterministic outputs (fixtures)
npm run arv:smoke     # Boot check
```

CI will fail if ARV does not pass.

---

## MULTI-AGENT ARCHITECTURE

CLI commands (agents are internal implementation):

```bash
gwi triage <pr-url>      # Analyze PR/issue complexity
gwi plan <pr-url>        # Generate change plan
gwi resolve <pr-url>     # Apply conflict resolutions
gwi review <pr-url>      # Generate review summary
gwi autopilot <pr-url>   # Full pipeline
gwi issue-to-code <url>  # Turn issue into code
gwi run list             # List recent runs
gwi run status <id>      # Check run details
gwi run approve <id>     # Approve changes for commit
```

**Agent Routing**:
- Orchestrator: Gemini Flash (workflow coordination)
- Triage: Gemini Flash (fast scoring)
- Coder: Claude Sonnet (code generation)
- Resolver: Claude Sonnet/Opus (conflict resolution, complexity-based)
- Reviewer: Claude Sonnet (review summaries)

**Approval Gating**: Destructive operations (commit, push, merge) require explicit approval with SHA256 hash binding.

---

## STORAGE ARCHITECTURE

**Dual-backend design:**

| Backend | Usage | Config |
|---------|-------|--------|
| Firestore | Production - Real-time operational data (runs, approvals) | `GWI_STORE_BACKEND=firestore` + `GCP_PROJECT_ID` |
| SQLite | Local dev - Full analytics with backup/restore | In-memory for testing, file-based for persistence |
| In-Memory | Quick testing only | `GWI_STORE_BACKEND=memory` or unset |

**Why multiple backends?**
- Firestore: Production runtime for low-latency PR automation
- SQLite: Local development with full analytics, backup, and testing
- In-Memory: Fast unit tests without persistence overhead

**Key interfaces** (in `packages/core/src/storage/interfaces.ts`):
- `TenantStore` - Multi-tenant CRUD for orgs, repos, runs
- `RunStore` - Run tracking and step management
- `UserStore`, `MembershipStore` - Auth and permissions

**Known limitation**: Orchestrator step tracking is in-memory; Cloud Run restarts leave runs stuck "running".

---

## CI/CD & INFRASTRUCTURE

- **OpenTofu is source of truth** - All infra changes in `infra/`
- **Deployment flow**: GitHub Actions → OpenTofu → Cloud Run
- **NEVER use direct `gcloud deploy`** - All deployments go through GitHub Actions + OpenTofu
- **CI checks**: ARV (forbidden patterns, contracts, goldens, smoke), drift detection, OpenTofu plan
- **Branches**: `main` → prod, `develop` → dev

### GitHub Actions Workflows

- `.github/workflows/ci.yml` - Build, test, typecheck, ARV
- `.github/workflows/arv.yml` - ARV checks
- `.github/workflows/tofu-plan.yml` - Infrastructure planning
- `.github/workflows/tofu-apply.yml` - Infrastructure deployment
- `.github/workflows/drift-detection.yml` - Detect configuration drift

---

## ENVIRONMENT VARIABLES

**Required** (at least one AI provider):
```bash
ANTHROPIC_API_KEY="your-anthropic-key"
GOOGLE_AI_API_KEY="your-google-key"
GITHUB_TOKEN="your-github-token"
```

**Production**:
```bash
GWI_STORE_BACKEND=firestore
GCP_PROJECT_ID=your-project
STRIPE_SECRET_KEY="your-stripe-key"
STRIPE_WEBHOOK_SECRET="your-webhook-secret"
```

**Note**: Values must be set outside the repo (Secret Manager / CI env / local shell). Never commit real secrets.

---

## RUN ARTIFACTS

Every run creates a bundle at `.gwi/runs/<runId>/`:

```
.gwi/runs/550e8400.../
├── run.json          # Run metadata
├── triage.json       # Complexity score
├── plan.json         # Resolution plan
├── patch.diff        # Proposed changes
├── review.json       # Review findings
├── approval.json     # Approval record with hash binding
└── audit.log         # JSONL audit trail
```

You can replay, audit, or debug any run from these artifacts.

---

## DEVELOPMENT CONSTRAINTS

### Storage
- Do NOT break storage interface contracts (`packages/core/src/storage/interfaces.ts`)
- Use storage interfaces for ALL persistence (no direct Firestore access outside storage layer)

### AI Models
- Do NOT hard-code model names - use config/env
- Support both Anthropic and Google AI providers

### Infrastructure
- **No direct gcloud deploys** - All infra goes through GitHub Actions + OpenTofu
- **No deletion** of `000-docs/`, `.claude/`, `infra/` without explicit instruction
- **No secrets in code** - Use environment variables and Secret Manager
- **Prefer small diffs** over wholesale rewrites

### CLI Experience
- Keep CLI simple - one command does the job
- Provide clear error messages
- Show progress for long-running operations

### Code Quality
- Add/adjust tests with every change
- Run `npm run arv` before finalizing
- Provide evidence (command outputs) in the final message
- Follow TypeScript strict mode
- Use Zod schemas for all external data

---

## KNOWN GAPS (v0.2.0)

| Gap | Severity |
|-----|----------|
| No rate limiting | HIGH |
| Orchestrator step state in-memory | HIGH |
| Limited test coverage in some areas | MEDIUM |

---

## EPIC STRUCTURE (422 Open Tasks)

Work is organized into 9 epics with team assignments:

| Epic | Owner | Open Tasks | Focus Area |
|------|-------|------------|------------|
| **A** | @backend, @security | ~40 | Core Infrastructure (Firestore, queues, artifacts, SLOs) |
| **B** | @connectors | 80 | Data Ingestion (GitHub/GitLab/JIRA, Airbyte-style connectors) |
| **C** | @orchestrator | 85 | Workflow Engine (multi-step pipelines, approval gates) |
| **D** | @security | ~40 | Policy & Audit (governance, compliance, immutable logs) |
| **E** | @security | 32 | RBAC & Governance (tenant management, quotas, secrets) |
| **F** | @frontend | 45 | Web Dashboard (React SPA, runs viewer, approvals UI) |
| **G** | @frontend | ~30 | Slack Integration (notifications, interactive approvals) |
| **H** | @infra | 37 | Infrastructure & Ops (Cloud Run, observability, DR, cost) |
| **I** | @ai | 30 | Forecasting & ML (TimeGPT integration, predictions, embeddings) |

Check task backlog: `bd list --status open`
View epic tasks: `bd list --epic @orchestrator`

Each epic contains 6-12 stories, each story has 5-6 implementation steps.

---

## REFERENCE DOCUMENTATION

- **Infrastructure README**: `infra/README.md`
- **Phase AARs**: `000-docs/NNN-AA-AACR-*.md`
- **Architecture docs**: `000-docs/NNN-DR-ADRC-*.md`
- **System audit**: `000-docs/126-AA-AUDT-appaudit-devops-playbook.md`
- **Threat model**: `000-docs/110-DR-TMOD-security-threat-model.md`
- **SLO/SLA targets**: `000-docs/111-DR-TARG-slo-sla-targets.md`
- **Disaster recovery**: `000-docs/112-DR-RUNB-disaster-recovery-runbook.md`

Documentation uses flat numbering scheme: `NNN-CC-ABCD-description.md` where:
- `NNN` = sequence number
- `CC` = category (AA=admin, DR=design/reference)
- `ABCD` = type (AUDT=audit, ADRC=architecture, REPT=report, AACR=AAR, etc.)

---

## SAFETY GUARDRAILS

1. **Approval Gating**: All destructive external writes (commit, push, merge) require explicit approval with hash binding
2. **Audit Trail**: Every run produces artifacts + audit log
3. **Deterministic Scoring**: Complexity scores are reproducible
4. **No Auto-Merge**: Changes are never automatically merged to main
5. **Infrastructure as Code**: All infra changes reviewed via GitHub PR before apply

---

## COMMON WORKFLOWS

### Run a single test file
```bash
npx vitest run path/to/test.test.ts
```

### Run CLI locally (after build)
```bash
# Direct execution
node apps/cli/dist/index.js triage <pr-url>

# Docker (isolated/sandboxed)
docker build -t gwi-cli -f apps/cli/Dockerfile .
docker run -it --rm \
  -e ANTHROPIC_API_KEY="your-key" \
  -e GITHUB_TOKEN="your-token" \
  -v $(pwd):/workspace \
  gwi-cli triage <pr-url>
```

### Deploy to staging
```bash
npm run deploy:staging  # Triggers GitHub Actions
```

### Check for infrastructure drift
```bash
cd infra
tofu plan -var-file=envs/dev.tfvars
```

### Debug a failed run
```bash
gwi run status <run-id>
cat .gwi/runs/<run-id>/audit.log
```

### Update package after core changes
```bash
# Core change affects agents
npx turbo run build --filter=@gwi/core
npx turbo run build --filter=@gwi/agents
npx turbo run test --filter=@gwi/agents
```

### Work with beads (task tracking)
```bash
bd list --status open              # View open tasks
bd list --epic @orchestrator       # Tasks by epic
bd create "Task title" -p 1 --description "Details"
bd update <id> --status in_progress
bd close <id> --reason "Completed with evidence"
```
