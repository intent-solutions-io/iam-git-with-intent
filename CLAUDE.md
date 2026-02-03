# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Git With Intent** (`gwi`) is an AI-powered CLI for PR automation: semantic merge conflict resolution, issue-to-code generation, complexity scoring, and full autopilot with approval gating.

| Attribute | Value |
|-----------|-------|
| CLI Command | `gwi` |
| Version | 0.6.0 |
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
│   ├── webhook-receiver/ # Generic webhook receiver
│   ├── worker/           # Background jobs (Cloud Run)
│   ├── registry/         # Workflow template registry
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
├── scripts/arv/          # Agent Readiness Verification gates
├── test/                 # Cross-cutting tests (contracts, goldens)
└── 000-docs/             # Internal docs (NNN-CC-ABCD-*.md, 6767-*-DR-STND-*.md)
```

**Documentation Standard**: All docs follow [6767-a-DR-STND-document-filing-system-standard-v4-2.md](000-docs/6767-a-DR-STND-document-filing-system-standard-v4-2.md) naming convention.

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
gwi review --local       # Review staged changes (fast, deterministic)
gwi review --local --ai  # AI-powered local review
gwi issue-to-code <url>  # Create PR from issue
gwi autopilot <pr-url>   # Full pipeline with approval

gwi run list             # List recent runs
gwi run status <id>      # Check run details
gwi run approve <id>     # Approve pending changes

gwi gate                 # Pre-commit approval gate
gwi hooks install        # Install pre-commit hook
gwi explain <run-id>     # Explain AI decisions
```

## Agent Architecture

| Agent | Model Selection | Purpose |
|-------|-----------------|---------|
| Orchestrator | Gemini Flash (tier 1) | Workflow coordination |
| Triage | Gemini Flash / GPT-4o-mini (tier 1) | Fast complexity scoring |
| Coder | Claude Sonnet 4 → Claude Opus 4 (complexity-based) | Code generation |
| Resolver | Claude Sonnet 4 → Claude Opus 4 (complexity 7+) | Conflict resolution |
| Reviewer | Claude Sonnet 4 | Review summaries |

**Model Routing**: `packages/core/src/llm/selection-policy.ts` routes tasks to models based on:
- Complexity (1-3 → tier 1, 4-7 → tier 3, 8-10 → tier 5)
- Task type (code_generation, merge_resolution, reasoning, etc.)
- Cost constraints and required capabilities

**Approval gating**: Destructive operations (commit, push, merge) require explicit approval with SHA256 hash binding.

### Agent Implementation

All agents extend `BaseAgent` from `packages/agents/src/base/agent.ts`:
- Agents are stateful and autonomous (not function wrappers)
- Use A2A (Agent-to-Agent) protocol for inter-agent messaging
- Each agent has a SPIFFE ID: `spiffe://intent.solutions/agent/<name>`
- In-memory state resets on restart; use Storage interfaces for persistence

## LLM Providers

Providers are configured via environment variables. At least one is required:

| Provider | Env Variable | Models |
|----------|--------------|--------|
| Anthropic | `ANTHROPIC_API_KEY` | claude-sonnet-4, claude-opus-4, claude-3-5-haiku |
| Google | `GOOGLE_AI_API_KEY` | gemini-2.0-flash, gemini-1.5-pro |
| OpenAI | `OPENAI_API_KEY` | gpt-4o, gpt-4o-mini, gpt-4-turbo, o1 |

Provider capabilities and costs defined in `packages/core/src/llm/provider-capabilities.ts`.

## Storage

| Backend | Usage |
|---------|-------|
| Firestore | Production (`GWI_STORE_BACKEND=firestore`) |
| SQLite | Local dev with analytics |
| In-Memory | Fast unit tests |

### Storage Architecture

Production uses Firestore with multi-tenant isolation:

| Store | Key Types | Purpose |
|-------|-----------|---------|
| TenantStore | `Tenant`, `TenantRepo` | Org installations, repos |
| RunStore | `Run`, `SaaSRun` | Pipeline executions |
| SignalStore | `Signal` | Inbound events (webhooks, issues) |
| WorkItemStore | `WorkItem` | PR queue items |
| PRCandidateStore | `PRCandidate` | Generated patches awaiting approval |

All stores implement interfaces in `packages/core/src/storage/interfaces.ts` - do not break these contracts.

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
- Storage interfaces in `packages/core/src/storage/interfaces.ts` are contracts - do not break them
- All Cloud Run deploys via GitHub Actions + OpenTofu - never `gcloud deploy` directly

## Test Organization

Tests are organized by purpose:
- `packages/*/src/**/__tests__/*.test.ts` - Unit tests (co-located with source)
- `test/contracts/*.test.ts` - Zod schema contract tests (ARV gate)
- `test/goldens/*.golden.test.ts` - Deterministic output fixtures (ARV gate)
- `test/e2e/*.e2e.test.ts` - End-to-end tests

Golden tests ensure deterministic outputs. Update fixtures with:
```bash
npx tsx scripts/arv/update-goldens.ts
```

## Debugging

```bash
gwi run status <run-id>
cat .gwi/runs/<run-id>/audit.log
```

## ARV Gates (scripts/arv/)

ARV includes specialized gates beyond lint/contracts/goldens:

| Gate | What It Checks |
|------|----------------|
| `forbidden-patterns.ts` | No deprecated patterns, no TODO/FIXME in production |
| `security-gate.ts` | No hardcoded secrets, proper sanitization |
| `identity-gate.ts` | SPIFFE IDs correctly formed, auth flows valid |
| `reliability-gate.ts` | Retry policies present, circuit breakers configured |
| `observability-gate.ts` | Proper logging, tracing spans defined |
| `planner-gate.ts` | Plan validation, step ordering correct |
| `openapi-gate.ts` | API schema valid, endpoints documented |
| `connector-supply-chain.ts` | Connector signatures verified, trust chain valid |
| `marketplace-gate.ts` | Marketplace listings complete and valid |
| `merge-resolver-gate.ts` | Conflict resolution produces valid patches |
| `forensics-gate.ts` | Forensics/audit trail integrity |
| `ga-readiness-gate.ts` | General availability readiness checklist |

## Documentation

- Infrastructure: `infra/README.md`
- Threat model: `000-docs/110-DR-TMOD-security-threat-model.md`
- SLO/SLA: `000-docs/111-DR-TARG-slo-sla-targets.md`
- Disaster recovery: `000-docs/112-DR-RUNB-disaster-recovery-runbook.md`

## Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):
```
<type>(<scope>): <description>
```

**Types**: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

**Scopes**: `cli`, `api`, `agents`, `core`, `engine`, `integrations`, `sdk`, `infra`

Examples:
```
feat(cli): add --local flag for local review
fix(resolver): handle three-way merge edge case
docs(readme): update installation instructions
```