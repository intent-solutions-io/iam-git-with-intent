# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Git With Intent** (`gwi`) is an AI-powered CLI for PR automation: semantic merge conflict resolution, issue-to-code generation, complexity scoring, and full autopilot with approval gating.

| Attribute | Value |
|-----------|-------|
| CLI Command | `gwi` |
| Version | 0.4.0 |
| Node | 20+ |
| Build | Turbo monorepo (npm workspaces) |

## Build & Test

```bash
npm install                           # Install dependencies
npm run build                         # Build all packages
npm run typecheck                     # Type check all packages
npm run test                          # Run all tests
npm run arv                           # Pre-commit validation (required)

# Single package
npx turbo run test --filter=@gwi/core
npx turbo run build --filter=@gwi/agents

# Single test file
npx vitest run path/to/test.test.ts

# Run CLI locally (after build)
node apps/cli/dist/index.js --help
```

**Before committing**: Always run `npm run build && npm run typecheck && npm run arv`

## ARV (Agent Readiness Verification)

CI fails if ARV doesn't pass. Run before every commit:

```bash
npm run arv           # All checks
npm run arv:lint      # Forbidden patterns
npm run arv:contracts # Zod schema validation
npm run arv:goldens   # Deterministic output fixtures
npm run arv:smoke     # Boot check
```

## Monorepo Structure

```
git-with-intent/
├── apps/
│   ├── cli/              # CLI tool (gwi command)
│   ├── api/              # REST API (Cloud Run)
│   ├── gateway/          # A2A Gateway (Cloud Run)
│   ├── github-webhook/   # Webhook handler (Cloud Run)
│   ├── worker/           # Background jobs (Cloud Run)
│   └── web/              # Dashboard (React/Firebase Hosting)
├── packages/
│   ├── core/             # Storage, billing, security interfaces
│   ├── agents/           # AI agent implementations
│   ├── engine/           # Workflow orchestration with hooks
│   ├── integrations/     # GitHub/GitLab connectors
│   ├── connectors/       # Airbyte-style data connectors
│   ├── forecasting/      # TimeGPT integration
│   └── sdk/              # TypeScript SDK
├── infra/                # OpenTofu (source of truth for GCP)
├── test/                 # Cross-cutting tests (contracts, goldens)
└── 000-docs/             # Internal docs (NNN-CC-ABCD-*.md)
```

### Package Dependencies

```
@gwi/cli → @gwi/agents, @gwi/integrations, @gwi/core
@gwi/engine → @gwi/agents, @gwi/core
@gwi/agents → @gwi/core
apps/* → @gwi/core
```

## CLI Commands

```bash
gwi triage <pr-url>      # Score PR complexity (1-10)
gwi resolve <pr-url>     # Resolve merge conflicts
gwi review <pr-url>      # Generate review summary
gwi issue-to-code <url>  # Create PR from issue
gwi autopilot <pr-url>   # Full pipeline with approval

gwi run list             # List recent runs
gwi run status <id>      # Check run details
gwi run approve <id>     # Approve pending changes
```

## Agent Architecture

| Agent | Model | Purpose |
|-------|-------|---------|
| Orchestrator | Gemini Flash | Workflow coordination |
| Triage | Gemini Flash | Fast complexity scoring |
| Coder | Claude Sonnet | Code generation |
| Resolver | Claude Sonnet/Opus | Conflict resolution (complexity-based) |
| Reviewer | Claude Sonnet | Review summaries |

**Approval gating**: Destructive operations (commit, push, merge) require explicit approval with SHA256 hash binding.

## Storage

| Backend | Usage |
|---------|-------|
| Firestore | Production (`GWI_STORE_BACKEND=firestore`) |
| SQLite | Local dev with analytics |
| In-Memory | Fast unit tests |

Key interfaces in `packages/core/src/storage/interfaces.ts` - do not break these contracts.

## Environment Variables

```bash
# Required (at least one AI provider)
ANTHROPIC_API_KEY="..."
GOOGLE_AI_API_KEY="..."
GITHUB_TOKEN="..."

# Production
GWI_STORE_BACKEND=firestore
GCP_PROJECT_ID=...
```

## Infrastructure

- **OpenTofu** in `infra/` is the source of truth
- **Never** use direct `gcloud deploy` - all deploys via GitHub Actions + OpenTofu
- Check drift: `cd infra && tofu plan -var-file=envs/dev.tfvars`

## Run Artifacts

Every run creates artifacts at `.gwi/runs/<runId>/`:
- `run.json`, `triage.json`, `plan.json`, `patch.diff`, `review.json`, `approval.json`, `audit.log`

## Key Constraints

- Do NOT hard-code model names - use config/env
- Use Zod schemas for all external data
- Add tests with every change
- Prefer small diffs over rewrites
- Do NOT delete `000-docs/`, `.claude/`, `infra/` without explicit instruction

## Debugging

```bash
gwi run status <run-id>
cat .gwi/runs/<run-id>/audit.log
```

## Documentation

- Infrastructure: `infra/README.md`
- Threat model: `000-docs/110-DR-TMOD-security-threat-model.md`
- SLO/SLA: `000-docs/111-DR-TARG-slo-sla-targets.md`
- Disaster recovery: `000-docs/112-DR-RUNB-disaster-recovery-runbook.md`