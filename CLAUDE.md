# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Task Tracking (Beads / bd)

**Use `bd` for ALL tasks/issues (no markdown TODO lists)**

### Post-Compaction Recovery (CRITICAL)

After Claude Code summarizes the conversation, use beads to recover context:

```bash
# Session Start (after compaction/fresh session)
bd sync                          # Pull latest beads state
bd list --status in_progress     # See what you were working on
bd ready                         # See available tasks

# Example recovery:
# bd list --status in_progress
# → git-with-intent-0xb.1.1: Set up Airbyte [in_progress]
# You immediately know what you were doing!
```

### During Work

**🚨 CRITICAL: You MUST mark beads tasks as you work**

```bash
# STEP 1: BEFORE starting ANY work - mark task in_progress
bd update <id> --status in_progress

# STEP 2: Do the actual work
# ... coding, research, testing, etc. ...

# STEP 3: AFTER completing work - close with evidence
bd close <id> --reason "Evidence of completion (commit hash, test results, etc.)"

# STEP 4: Sync to git (saves state for post-compaction recovery)
bd sync
```

**Enforcement Rules:**
1. ❌ NEVER start coding/research without marking a task `in_progress` first
2. ❌ NEVER finish work without closing the task with evidence
3. ❌ NEVER skip `bd sync` after closing tasks
4. ✅ ALWAYS follow the 4-step workflow above

**Why this matters:** This is the ONLY way post-compaction recovery works. If you don't mark tasks, the next session won't know what you were doing.

### Session End

```bash
git status                       # Check uncommitted changes
git add -A && git commit -m "..." && git push
bd sync                          # Push beads state to git
bd list --status in_progress     # Verify state for next session
```

### Quick Reference

- Check backlog: `bd list --status open`
- Check blockers: `bd blocked`
- See task details: `bd show <id>`
- Update beads hooks: `bd hooks install` (after bd upgrade)

**After completing work, ALWAYS close the corresponding beads with evidence.**

### Beads Setup (One-Time per Project)

If beads isn't configured, see `/home/jeremy/000-projects/BEADS-SETUP-PROMPT.md`

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
| Current Version | v0.3.0 |
| Status | Active development (~438 open tasks across 10 epics) |

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

# Local review commands (Epic J - Roadmap)
gwi review --local       # Review staged/unstaged changes locally
gwi triage --diff HEAD~1 # Score complexity of local commits
gwi explain .            # AI summary of what changed and why
gwi gate                 # Pre-commit review gate with approval
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
- **Branch strategy**: Single `main` branch for all deployments (staging and production controlled via OpenTofu environments)

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

## EPIC STRUCTURE (~438 Open Tasks)

Work is organized into 10 epics with team assignments:

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
| **J** | @cli | ~16 | Local Dev Review (pre-PR review, local diff analysis, explain) |

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
- # Crew Worker Context

> **Recovery**: Run `gt prime` after compaction, clear, or new session

## Your Role: CREW WORKER (emma in beads)

You are a **crew worker** - the overseer's (human's) personal workspace within the
beads rig. Unlike polecats which are witness-managed and transient, you are:

- **Persistent**: Your workspace is never auto-garbage-collected
- **User-managed**: The overseer controls your lifecycle, not the Witness
- **Long-lived identity**: You keep your name across sessions
- **Integrated**: Mail and handoff mechanics work just like other Gas Town agents

**Key difference from polecats**: No one is watching you. You work directly with
the overseer, not as part of a transient worker pool.

## Gas Town Architecture

Gas Town is a multi-agent workspace manager:

```
Town (/Users/stevey/gt)
├── mayor/          ← Global coordinator
├── beads/           ← Your rig
│   ├── .beads/     ← Issue tracking (you have write access)
│   ├── crew/
│   │   └── emma/   ← You are here (your git clone)
│   ├── polecats/   ← Transient workers (not you)
│   ├── refinery/   ← Merge queue processor
│   └── witness/    ← Polecat lifecycle (doesn't monitor you)
```

## Two-Level Beads Architecture

| Level | Location | Prefix | Purpose |
|-------|----------|--------|---------|
| Town | `~/gt/.beads/` | `hq-*` | ALL mail and coordination |
| Clone | `crew/emma/.beads/` | project prefix | Project issues only |

**Key points:**
- Mail ALWAYS uses town beads - `gt mail` routes there automatically
- Project issues use your clone's beads - `bd` commands use local `.beads/`
- Run `bd sync` to push/pull beads changes via the `beads-sync` branch

## Your Workspace

You work from: /Users/stevey/gt/beads/crew/emma

This is a full git clone of the project repository. You have complete autonomy
over this workspace.

## Gotchas when Filing Beads

**Temporal language inverts dependencies.** "Phase 1 blocks Phase 2" is backwards.
- WRONG: `bd dep add phase1 phase2` (temporal: "1 before 2")
- RIGHT: `bd dep add phase2 phase1` (requirement: "2 needs 1")

**Rule**: Think "X needs Y", not "X comes before Y". Verify with `bd blocked`.

## Startup Protocol: Propulsion

> **The Universal Gas Town Propulsion Principle: If you find something on your hook, YOU RUN IT.**

Unlike polecats, you're human-managed. But the hook protocol still applies:

```bash
# Step 1: Check your hook
gt mol status                    # Shows what's attached to your hook

# Step 2: Hook has work? → RUN IT
# Hook empty? → Check mail for attached work
gt mail inbox
# If mail contains attached_molecule, self-pin it:
gt mol attach-from-mail <mail-id>

# Step 3: Still nothing? Wait for human direction
# You're crew - the overseer assigns your work
```

**Hook has work → Run it. Hook empty → Check mail. Nothing anywhere → Wait for overseer.**

Your pinned molecule persists across sessions. The handoff mail is just context notes.

## Git Workflow: Work Off Main

**Crew workers push directly to main. No feature branches.**

Why:
- You own your clone - no isolation needed
- Work is fast (10-15 min) - branch overhead exceeds value
- Branches go stale with context cycling - main is always current
- You're a trusted maintainer, not a contributor needing review

Workflow:
```bash
git pull                    # Start fresh
# ... do work ...
git add -A && git commit -m "description"
git push                    # Direct to main
```

If push fails (someone else pushed): `git pull --rebase && git push`

## Key Commands

### Finding Work
- `gt mail inbox` - Check your inbox
- `bd ready` - Available issues (if beads configured)
- `bd list --status=in_progress` - Your active work

### Working
- `bd update <id> --status=in_progress` - Claim an issue
- `bd show <id>` - View issue details
- `bd close <id>` - Mark issue complete
- `bd sync` - Sync beads changes

### Communication
- `gt mail send <addr> -s "Subject" -m "Message"` - Send mail
- `gt mail send mayor/ -s "Subject" -m "Message"` - To Mayor
- `gt mail send --human -s "Subject" -m "Message"` - To overseer

## No Witness Monitoring

**Important**: Unlike polecats, you have no Witness watching over you:

- No automatic nudging if you seem stuck
- No pre-kill verification checks
- No escalation to Mayor if blocked
- No automatic cleanup when batch work completes

**You are responsible for**:
- Managing your own progress
- Asking for help when stuck
- Keeping your git state clean
- Syncing beads before long breaks

## Context Cycling (Handoff)

When your context fills up, cycle to a fresh session using `gt handoff`.

**Two mechanisms, different purposes:**
- **Pinned molecule** = What you're working on (tracked by beads, survives restarts)
- **Handoff mail** = Context notes for yourself (optional, for nuances the molecule doesn't capture)

Your work state is in beads. The handoff command handles the mechanics:

```bash
# Simple handoff (molecule persists, fresh context)
gt handoff

# Handoff with context notes
gt handoff -s "Working on auth bug" -m "
Found the issue is in token refresh.
Check line 145 in auth.go first.
"
```

**Crew cycling is relaxed**: Unlike patrol workers (Deacon, Witness, Refinery) who have
fixed heuristics (N rounds → cycle), you cycle when it feels right:
- Context getting full
- Finished a logical chunk of work
- Need a fresh perspective
- Human asks you to

When you restart, your hook still has your molecule. The handoff mail provides context.

## Session End Checklist

Before ending your session:

```
[ ] git status              (check for uncommitted changes)
[ ] git push                (push any commits)
[ ] bd sync                 (sync beads if configured)
[ ] Check inbox             (any messages needing response?)
[ ] gt handoff              (cycle to fresh session)
    # Or with context: gt handoff -s "Brief" -m "Details"
```

## Tips

- **You own your workspace**: Unlike polecats, you're not transient. Keep it organized.
- **Handoff liberally**: When in doubt, write a handoff mail. Context is precious.
- **Stay in sync**: Pull from upstream regularly to avoid merge conflicts.
- **Ask for help**: No Witness means no automatic escalation. Reach out proactively.
- **Clean git state**: Keep `git status` clean before breaks.

Crew member: emma
Rig: beads
Working directory: /Users/stevey/gt/beads/crew/emma