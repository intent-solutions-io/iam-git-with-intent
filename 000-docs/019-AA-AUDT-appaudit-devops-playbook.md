# Git With Intent: Operator-Grade System Analysis & Operations Guide

*For: DevOps Engineer*
*Generated: December 29, 2024*
*System Version: 0.3.0 (commit 5d7cf4c)*

---

## Table of Contents

1. Executive Summary
2. Operator & Customer Journey
3. System Architecture Overview
4. Directory Deep-Dive
5. Automation & Agent Surfaces
6. Operational Reference
7. Security, Compliance & Access
8. Cost & Performance
9. Development Workflow
10. Dependencies & Supply Chain
11. Integration with Existing Documentation
12. Current State Assessment
13. Quick Reference
14. Recommendations Roadmap

---

## 1. Executive Summary

### Business Purpose

Git With Intent is an AI-powered multi-agent platform that automates PR workflows and predicts repository outcomes. The platform operates in two modes:

1. **Automation (shipping now)**: Resolves merge conflicts semantically (not just textually), creates PRs from GitHub issues, reviews code quality, and provides full autopilot mode with approval gating
2. **Prediction (in progress)**: Uses TimeGPT integration to predict merge times, sprint delivery probability, and technical debt trajectories

The core differentiator is **semantic understanding** - analyzing git history as a time series of team behavior to predict outcomes rather than guess. Foundation models (LLMs for analysis, TimeGPT for forecasting) make this tractable.

The platform is structured as a **Turbo monorepo** with 7 applications and 5 packages, totaling **1,457 TypeScript files**. Development is organized into **9 epics with 422 open tasks** tracked via beads. The current release (v0.3.0) completed the RBAC & Governance epic with ~2,200 lines of security infrastructure.

**Business Model**: CLI is open-source (MIT), hosted service is commercial.

### Operational Status Matrix

| Environment | Status | Uptime Target | Current Uptime | Release Cadence | Active Users |
|-------------|--------|---------------|----------------|-----------------|--------------|
| Development | Active | N/A | N/A | Daily commits | 3-5 devs |
| Staging | Deployed | 95% | ~95% | Per PR merge | Testing only |
| Production | Deployed | 99.5% | Untested | Weekly | Pre-launch |

### Technology Stack Summary

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| Language | TypeScript | ^5.3.0 | Strict mode, monorepo |
| Runtime | Node.js | >=20.0.0 | All services |
| Build | Turbo | ^2.3.0 | Monorepo orchestration |
| Database | Firestore | ^13.6.0 | Production operational data |
| Database | SQLite | ^12.5.0 | Local dev with analytics |
| AI Models | Claude Sonnet/Opus | Anthropic SDK ^0.30.0 | Code gen, conflict resolution |
| AI Models | Gemini Flash | Vertex AI ^1.10.0 | Fast triage, orchestration |
| Forecasting | TimeGPT | Nixtla (planned) | Time series predictions |
| Payments | Stripe | ^20.0.0 | Billing, subscriptions |
| Infrastructure | OpenTofu | >=1.6.0 | IaC (Terraform fork) |
| CI/CD | GitHub Actions + WIF | 16 workflows | Keyless deployment |

---

## 2. Operator & Customer Journey

### Primary Personas

- **CLI Users (Developers)**: Run `gwi triage`, `gwi resolve`, `gwi autopilot` locally
- **GitHub App Users**: Receive automated PR comments, reviews, conflict resolution
- **Platform Operators**: Deploy, monitor, and maintain Cloud Run services
- **Tenant Admins**: Manage team access, quotas, and policies via web dashboard

### End-to-End Journey Map

```
Installation → Configuration → First Run → Autopilot → Dashboard
     │              │              │           │           │
     └→ npm install └→ gwi config  └→ gwi      └→ gwi      └→ web UI
        or Docker      + API keys     triage      autopilot    analytics
```

**Critical Touchpoints:**

1. **API Key Setup**: Requires ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY, GITHUB_TOKEN
2. **First Triage**: Validates GitHub access, API connectivity
3. **Approval Flow**: Destructive operations require explicit approval with SHA256 hash binding
4. **Run Artifacts**: Every run produces `.gwi/runs/<runId>/` bundle for audit/replay

### SLA Commitments

| Metric | Target | Current | Owner |
|--------|--------|---------|-------|
| CLI Response (triage) | < 30s | ~20s | Dev |
| Conflict Resolution | < 2 min | ~90s | Dev |
| API P95 Latency | < 5s | Untested | DevOps |
| Webhook Processing | < 10s | ~8s | DevOps |

---

## 3. System Architecture Overview

### Technology Stack (Detailed)

| Layer | Technology | Version | Source of Truth | Purpose | Owner |
|-------|------------|---------|-----------------|---------|-------|
| CLI | Commander.js | apps/cli/ | gwi commands | Dev |
| API | Express.js | apps/api/ | REST endpoints | Dev |
| A2A Gateway | Express.js | apps/gateway/ | Agent coordination | Dev |
| Webhook Handler | Express.js | apps/github-webhook/ | GitHub events | Dev |
| Worker | Pub/Sub handler | apps/worker/ | Background jobs | Dev |
| Web Dashboard | React + Vite | apps/web/ | Analytics UI | Dev |
| Core Library | TypeScript | packages/core/ | 68 modules | Dev |
| Agents | Multi-agent system | packages/agents/ | Triage, Coder, Resolver, Reviewer | Dev |
| Engine | Workflow runner | packages/engine/ | Step execution | Dev |
| SDK | TypeScript SDK | packages/sdk/ | External consumers | Dev |
| Infrastructure | OpenTofu | infra/ | GCP resources | DevOps |

### Environment Matrix

| Environment | Purpose | Hosting | Data Source | Release Cadence | IaC Source |
|-------------|---------|---------|-------------|-----------------|------------|
| local | Development | localhost | SQLite/memory | Continuous | N/A |
| staging | Pre-production | Cloud Run | Firestore (staging) | Per PR | infra/envs/staging.tfvars |
| production | Production | Cloud Run | Firestore (prod) | Weekly | infra/envs/production.tfvars |

### Cloud Run Services (4)

| Service | Purpose | CPU | Memory | Scaling |
|---------|---------|-----|--------|---------|
| gwi-api | REST API | 2 | 2Gi | 1-10 |
| gwi-a2a-gateway | Agent coordination | 2 | 2Gi | 1-5 |
| gwi-github-webhook | Webhook handler | 1 | 1Gi | 1-20 |
| gwi-worker | Background jobs | 2 | 4Gi | 1-5 |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GITHUB                                          │
│                     (Webhooks, API, Issues, PRs)                             │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │ Webhooks
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CLOUD RUN SERVICES                                    │
│                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                 │
│  │ github-webhook │  │   a2a-gateway  │  │      api       │                 │
│  │    Handler     │  │    (Agents)    │  │    (REST)      │                 │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘                 │
│          │                   │                   │                           │
│          └───────────────────┼───────────────────┘                           │
│                              │                                               │
│                              ▼                                               │
│                    ┌────────────────┐                                        │
│                    │     worker     │                                        │
│                    │  (Background)  │                                        │
│                    └───────┬────────┘                                        │
└────────────────────────────┼────────────────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│    Firestore    │ │  Secret Manager │ │   Pub/Sub       │
│  (Operational)  │ │    (Secrets)    │ │   (Queues)      │
└─────────────────┘ └─────────────────┘ └─────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           MULTI-AGENT SYSTEM                                 │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Orchestrator │  │    Triage    │  │    Coder     │  │   Resolver   │     │
│  │ (Gemini)     │  │ (Gemini)     │  │ (Claude)     │  │ (Claude)     │     │
│  │ Workflow     │  │ Complexity   │  │ Code Gen     │  │ Conflicts    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐                                         │
│  │   Reviewer   │  │  Forecaster  │                                         │
│  │ (Claude)     │  │ (TimeGPT)    │                                         │
│  │ Code Review  │  │ Predictions  │                                         │
│  └──────────────┘  └──────────────┘                                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLI (gwi)                                       │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐                │
│  │  triage    │ │  resolve   │ │  autopilot │ │ issue-to-  │                │
│  │            │ │            │ │            │ │    code    │                │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Directory Deep-Dive

### Project Structure Analysis

```
git-with-intent/                    # Turbo monorepo root
├── .github/workflows/              # 16 GitHub Actions workflows
├── apps/                           # 7 deployable applications
│   ├── api/                        # REST API (Cloud Run)
│   ├── cli/                        # gwi CLI tool
│   ├── gateway/                    # A2A Gateway (Cloud Run)
│   ├── github-webhook/             # Webhook handler (Cloud Run)
│   ├── registry/                   # Plugin registry
│   ├── web/                        # React dashboard
│   └── worker/                     # Background jobs (Cloud Run)
├── packages/                       # 5 shared packages
│   ├── agents/                     # Multi-agent implementations
│   ├── core/                       # 68 core modules
│   ├── engine/                     # Workflow execution engine
│   ├── integrations/               # GitHub/GitLab connectors
│   └── sdk/                        # TypeScript SDK
├── infra/                          # OpenTofu infrastructure (15+ files)
│   ├── cloud_run.tf                # 4 Cloud Run services
│   ├── monitoring.tf               # Observability (~47K lines)
│   ├── iam.tf                      # IAM roles and bindings
│   ├── network.tf                  # VPC, connectors
│   ├── storage.tf                  # Firestore, GCS
│   └── envs/                       # Environment-specific vars
├── scripts/                        # Build, CI, ARV scripts
├── test/                           # Cross-cutting tests
├── 000-docs/                       # 18 internal documents
├── CLAUDE.md                       # Claude Code instructions
├── README.md                       # Project overview
├── package.json                    # Root workspace config
├── turbo.json                      # Turbo pipeline config
└── vitest.workspace.ts             # Test configuration
```

### Detailed Package Analysis

#### packages/core/ (68 modules)

**Purpose**: Shared utilities, storage interfaces, billing, security, reliability

**Key Modules**:
| Module | Purpose | Lines (est.) |
|--------|---------|--------------|
| storage/ | Firestore, SQLite, memory backends | ~3,000 |
| billing/ | Stripe integration, metering, enforcement | ~2,000 |
| security/ | RBAC, quotas, secrets, governance | ~2,200 |
| agents/ | Agent adapters, intent receipts | ~1,000 |
| time-series/ | Time series utilities for forecasting | ~500 |
| forecasting/ | TimeGPT integration (foundation) | ~500 |
| compliance/ | Audit logging, data governance | ~1,000 |
| reliability/ | Rate limiting, circuit breakers | ~800 |

**Storage Interfaces** (`packages/core/src/storage/interfaces.ts`):
- `TenantStore` - Multi-tenant CRUD
- `RunStore` - Run tracking and steps
- `UserStore`, `MembershipStore` - Auth and permissions

#### packages/agents/ (Multi-Agent System)

**Purpose**: Agent implementations for PR automation

| Agent | Model | Purpose | Complexity Routing |
|-------|-------|---------|-------------------|
| Orchestrator | Gemini Flash | Workflow coordination | Always fast |
| Triage | Gemini Flash | PR complexity scoring | Fast |
| Coder | Claude Sonnet | Code generation | Medium |
| Resolver | Claude Sonnet/Opus | Conflict resolution | Complexity-based |
| Reviewer | Claude Sonnet | Code review | Medium |

#### apps/cli/ (CLI Application)

**Purpose**: `gwi` command-line interface

**Commands**:
| Command | Purpose |
|---------|---------|
| gwi triage <pr-url> | Analyze PR complexity |
| gwi resolve <pr-url> | Resolve merge conflicts |
| gwi autopilot <pr-url> | Full automation pipeline |
| gwi issue-to-code <url> | Generate code from issue |
| gwi run list | List recent runs |
| gwi run approve <id> | Approve pending changes |

#### infra/ (OpenTofu Infrastructure)

**Purpose**: Infrastructure as Code for GCP deployment

| File | Lines | Purpose |
|------|-------|---------|
| cloud_run.tf | ~600 | 4 Cloud Run services |
| monitoring.tf | ~47,000 | Dashboards, alerts, SLOs |
| iam.tf | ~300 | Service accounts, bindings |
| network.tf | ~250 | VPC, connectors |
| storage.tf | ~300 | Firestore, GCS buckets |
| agent_engine.tf | ~300 | Vertex AI Agent Engine |
| service_topology.tf | ~250 | Service configuration |

---

## 5. Automation & Agent Surfaces

### CLI Commands

| Command | Description | Agent(s) Used |
|---------|-------------|---------------|
| `gwi triage <url>` | Score PR complexity | Triage |
| `gwi plan <url>` | Generate change plan | Orchestrator, Triage |
| `gwi resolve <url>` | Resolve conflicts | Resolver |
| `gwi review <url>` | Generate review | Reviewer |
| `gwi autopilot <url>` | Full pipeline | All agents |
| `gwi issue-to-code <url>` | Code from issue | Coder |
| `gwi run list` | List runs | None |
| `gwi run status <id>` | Check run | None |
| `gwi run approve <id>` | Approve changes | None |

### GitHub Actions Workflows (16)

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| ci.yml | PR, push | Build, test, typecheck, ARV |
| ci-enhanced.yml | PR | Extended CI with sharding |
| arv.yml | PR | Agent Readiness Verification |
| deploy.yml | push to main | Deploy to Cloud Run |
| tofu-plan.yml | PR to infra/ | OpenTofu plan |
| tofu-apply.yml | push to main | OpenTofu apply |
| drift-detection.yml | scheduled | Detect config drift |
| release.yml | manual | Create release |
| auto-fix.yml | scheduled | Auto-fix bot |
| auto-fix-monitor.yml | scheduled | Monitor auto-fix |
| auto-fix-budget.yml | scheduled | Budget monitoring |
| auto-fix-report.yml | scheduled | Generate reports |
| code-assist.yml | manual | AI code assistance |
| test.yml | PR | Test suite |

### ARV (Agent Readiness Verification)

```bash
npm run arv           # All checks
npm run arv:lint      # Forbidden patterns
npm run arv:contracts # Zod schema validation
npm run arv:goldens   # Deterministic outputs
npm run arv:smoke     # Boot check
```

CI fails if ARV does not pass.

---

## 6. Operational Reference

### Deployment Workflows

#### Local Development

```bash
# Prerequisites
node --version  # v20+
npm --version   # v10+

# Install and build
npm install
npm run build

# Set environment
export ANTHROPIC_API_KEY="your-key"
export GOOGLE_AI_API_KEY="your-key"
export GITHUB_TOKEN="your-token"

# Run CLI
node apps/cli/dist/index.js triage <pr-url>
```

#### Staging Deployment

```bash
# Trigger via GitHub Actions
npm run deploy:staging

# Or manual
cd infra
tofu workspace select staging
tofu plan -var-file=envs/staging.tfvars
tofu apply -var-file=envs/staging.tfvars
```

#### Production Deployment

**Pre-deployment Checklist**:
- [ ] CI pipeline green (all 4 shards)
- [ ] ARV passes (lint, contracts, goldens, smoke)
- [ ] OpenTofu plan reviewed
- [ ] Rollback plan documented

**Deployment**:
1. Merge PR to main
2. GitHub Actions triggers deploy.yml
3. Docker images built and pushed to Artifact Registry
4. OpenTofu applies Cloud Run updates
5. Health checks validate deployment

**Rollback**:
```bash
cd infra
tofu workspace select production
# Revert to previous image tag
tofu apply -var-file=envs/production.tfvars \
  -var="api_image=us-central1-docker.pkg.dev/.../api:previous-sha"
```

### Monitoring & Alerting

**Dashboards** (defined in infra/monitoring.tf):
- Service Health Dashboard
- Agent Performance Dashboard
- Cost & Usage Dashboard
- Error Rate Dashboard

**Key Metrics**:
- Cloud Run request latency (P50, P95, P99)
- Agent response times by model
- Error rates by service
- Pub/Sub queue depth
- Firestore read/write operations

### Run Artifacts

Every run creates a bundle at `.gwi/runs/<runId>/`:

```
.gwi/runs/550e8400.../
├── run.json          # Run metadata
├── triage.json       # Complexity score
├── plan.json         # Resolution plan
├── patch.diff        # Proposed changes
├── review.json       # Review findings
├── approval.json     # Approval record (hash-bound)
└── audit.log         # JSONL audit trail
```

---

## 7. Security, Compliance & Access

### Security Model

**Approval Gating** (all destructive operations):

| Operation | Risk Level | Approval Required |
|-----------|------------|-------------------|
| Read repo data | Safe | No |
| Analyze patterns | Safe | No |
| Generate patch | Safe | No |
| Post PR comment | Low | No |
| Commit changes | High | Yes (hash-bound) |
| Push to remote | High | Yes (hash-bound) |
| Merge PR | Critical | Yes (hash-bound) |

**Hash Binding**: After approval, if patch changes, approval is invalidated.

### RBAC & Governance (Epic E - Complete)

| Component | Status | Lines |
|-----------|--------|-------|
| RBAC model + enforcement | ✅ | ~2,200 |
| Tenant lifecycle (state machine) | ✅ | ~500 |
| Quota enforcement (3 modes) | ✅ | ~400 |
| Secrets management (AES-256-GCM) | ✅ | ~300 |
| Governance & audit | ✅ | ~500 |
| Compliance export (CSV/JSON) | ✅ | ~200 |
| Express middleware + 47 tests | ✅ | ~400 |

### Identity & Access

| Account | Purpose | Permissions | Used By |
|---------|---------|-------------|---------|
| gwi-api SA | API service | Firestore, Pub/Sub | Cloud Run |
| gwi-gateway SA | A2A gateway | Vertex AI, Firestore | Cloud Run |
| gwi-webhook SA | Webhook handler | Firestore, Pub/Sub | Cloud Run |
| gwi-worker SA | Background jobs | All resources | Cloud Run |
| GitHub WIF | CI/CD | Deploy Cloud Run | GitHub Actions |

### Secrets Management

| Secret | Location | Purpose |
|--------|----------|---------|
| ANTHROPIC_API_KEY | Secret Manager | Claude API |
| GOOGLE_AI_API_KEY | Secret Manager | Gemini API |
| GITHUB_TOKEN | Secret Manager | GitHub API |
| STRIPE_SECRET_KEY | Secret Manager | Billing |
| Tenant secrets | AES-256-GCM encrypted | Per-tenant data |

---

## 8. Cost & Performance

### Estimated Monthly Costs

| Service | Estimate | Notes |
|---------|----------|-------|
| Cloud Run (4 services) | $200-500 | Depends on traffic |
| Firestore | $50-150 | Read/write operations |
| Secret Manager | $5-10 | Secret storage |
| Artifact Registry | $10-20 | Docker images |
| Vertex AI | $100-500 | Agent Engine |
| Anthropic API | $100-1000+ | Claude usage |
| Google AI | $50-200 | Gemini usage |
| **Total** | **$515-2,380** | Pre-launch estimate |

### Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Triage response | < 30s | Gemini Flash |
| Conflict resolution | < 2 min | Claude Sonnet/Opus |
| API P95 latency | < 5s | REST endpoints |
| Webhook processing | < 10s | GitHub events |
| Test suite | < 10 min | ~1700 tests, 4 shards |

### Known Gaps

| Gap | Severity | Impact |
|-----|----------|--------|
| No rate limiting | HIGH | Abuse risk |
| Orchestrator step state in-memory | HIGH | Cloud Run restarts lose state |
| Limited test coverage in some areas | MEDIUM | Reliability risk |

---

## 9. Development Workflow

### Build and Test

```bash
npm run build        # Build all (Turbo respects deps)
npm run typecheck    # Type check all
npm run test         # ~1700 tests
npm run test:unit    # Unit tests only
npm run test:integration  # Integration only
npm run lint         # ESLint
npm run arv          # Agent Readiness Verification
```

### Single Package Operations

```bash
npx turbo run test --filter=@gwi/core
npx turbo run test --filter=@gwi/agents
npx turbo run test --filter=@gwi/engine
npx turbo run build --filter=apps/cli
```

### Common Workflows

```bash
# Run CLI locally
node apps/cli/dist/index.js triage <pr-url>

# Docker (isolated)
docker build -t gwi-cli -f apps/cli/Dockerfile .
docker run -it --rm \
  -e ANTHROPIC_API_KEY="..." \
  -e GITHUB_TOKEN="..." \
  gwi-cli triage <pr-url>

# Check infrastructure drift
cd infra && tofu plan -var-file=envs/dev.tfvars

# Debug failed run
gwi run status <run-id>
cat .gwi/runs/<run-id>/audit.log
```

---

## 10. Dependencies & Supply Chain

### Key Dependencies

| Package | Version | Purpose | Risk |
|---------|---------|---------|------|
| @anthropic-ai/sdk | ^0.30.0 | Claude API | Low |
| @google-cloud/vertexai | ^1.10.0 | Gemini API | Low |
| @google/generative-ai | ^0.21.0 | Gemini API | Low |
| firebase-admin | ^13.6.0 | Firestore | Low |
| stripe | ^20.0.0 | Payments | Low |
| zod | ^3.22.0 | Schema validation | Low |
| turbo | ^2.3.0 | Monorepo | Low |
| openai | ^6.14.0 | OpenAI API (optional) | Low |
| better-sqlite3 | ^12.5.0 | Local SQLite | Low |

### Third-Party Services

| Service | Purpose | SLA | Risk |
|---------|---------|-----|------|
| GitHub API | Repository access | 99.9% | Low |
| Anthropic API | Claude models | 99.5% | Medium |
| Google AI | Gemini models | 99.9% | Low |
| Stripe | Payments | 99.99% | Low |
| Firestore | Operational DB | 99.99% | Low |

---

## 11. Integration with Existing Documentation

### Documentation Inventory (18 files in 000-docs/)

| Document | Purpose |
|----------|---------|
| 001-DR-CHKL-openapi-creation-checklist.md | OpenAPI setup |
| 004-BL-POLI-security-policy.md | Security policy |
| 008-DR-EPIC-epic-b-connector-framework.md | Connector architecture |
| 012-DR-ADRC-connector-framework-architecture-decision.md | ADR |
| 014-DR-DSGN-connector-abstraction.md | Design spec |
| 015-DR-DSGN-iconnector-interface.md | Interface spec |
| 016-DR-DSGN-authentication-strategy.md | Auth design |
| 017-DR-DSGN-webhook-receiver.md | Webhook design |
| 018-DR-DSGN-connector-registry.md | Registry design |

### Key References

- `infra/README.md` - Infrastructure overview
- `packages/sdk/README-CODEGEN.md` - SDK type generation
- `test/e2e/README.md` - E2E testing guide
- `.github/workflows/README.md` - Workflow documentation
- `CLAUDE.md` - Claude Code instructions

---

## 12. Current State Assessment

### What's Working Well

- **Multi-Agent Architecture**: Clean agent abstraction, complexity-based routing
- **RBAC & Governance**: Complete security layer (Epic E, ~2,200 lines)
- **Infrastructure as Code**: Comprehensive OpenTofu with 15+ modules
- **CI/CD Pipeline**: 16 workflows, 4-shard parallel tests
- **Test Coverage**: ~1,700 tests with ARV enforcement
- **Approval Gating**: Hash-bound approvals prevent surprise commits
- **Audit Trail**: Complete run artifacts for replay/debug

### Areas Needing Attention

- **Rate Limiting**: Not implemented (HIGH severity)
- **Orchestrator State**: In-memory, lost on Cloud Run restart (HIGH severity)
- **TimeGPT Integration**: Planned but not started (Epic I)
- **Web Dashboard**: Foundational, not production-ready
- **Connector Framework**: Active development (Epic B, 80 tasks)

### Open Task Backlog (422 tasks across 9 epics)

| Epic | Owner | Open Tasks | Status |
|------|-------|------------|--------|
| A: Core Infrastructure | @backend, @security | ~40 | Active |
| B: Connectors | @connectors | 80 | Active |
| C: Workflows | @orchestrator | 85 | Active |
| D: Policy & Audit | @security | ~40 | Active |
| E: RBAC & Governance | @security | 0 | ✅ Complete |
| F: Web Dashboard | @frontend | 45 | Active |
| G: Slack Integration | @frontend | ~30 | Planned |
| H: Infrastructure | @infra | 37 | Active |
| I: Forecasting & ML | @ai | 30 | Planned |

---

## 13. Quick Reference

### Operational Command Map

| Capability | Command | Source |
|------------|---------|--------|
| Install | `npm install` | package.json |
| Build all | `npm run build` | Turbo |
| Type check | `npm run typecheck` | Turbo |
| Test all | `npm run test` | Turbo |
| Lint | `npm run lint` | Turbo |
| ARV | `npm run arv` | scripts/arv/ |
| Deploy staging | `npm run deploy:staging` | scripts/ |
| Smoke test | `npm run smoke:staging` | scripts/ |
| CLI triage | `gwi triage <url>` | apps/cli |
| CLI autopilot | `gwi autopilot <url>` | apps/cli |
| OpenTofu plan | `tofu plan -var-file=...` | infra/ |

### Critical Endpoints

| Resource | URL/Path |
|----------|----------|
| GitHub Repo | github.com/intent-solutions-io/git-with-intent |
| GCP Project | git-with-intent |
| Staging API | gwi-api-staging.run.app |
| Production API | gwi-api-production.run.app |
| Web Dashboard | gwi-web.web.app |

### First-Week Checklist

- [ ] Clone repo and run `npm install`
- [ ] Set up API keys (Anthropic, Google AI, GitHub)
- [ ] Run `npm run build && npm run test`
- [ ] Read CLAUDE.md for beads workflow
- [ ] Run `bd sync` and review open tasks
- [ ] Try `gwi triage` on a test PR
- [ ] Review infra/README.md
- [ ] Understand OpenTofu structure
- [ ] Review GitHub Actions workflows
- [ ] Check Cloud Run service health

---

## 14. Recommendations Roadmap

### Week 1 - Critical Gaps

**Goals**:
1. Implement rate limiting middleware
2. Add persistent state for orchestrator steps
3. Document known gaps and workarounds

**Deliverables**:
- [ ] Rate limiting in @gwi/core
- [ ] Redis/Firestore state for orchestrator
- [ ] Gap documentation

### Month 1 - Foundation Hardening

**Goals**:
1. Complete Epic B connector framework (top 20 tasks)
2. Improve web dashboard for operator use
3. Add monitoring for agent response times

**Deliverables**:
- [ ] GitHub connector hardened
- [ ] Basic operator dashboard
- [ ] Agent performance metrics

### Quarter 1 - Strategic Enhancements

**Goals**:
1. TimeGPT integration (Epic I)
2. Production hardening with load testing
3. Slack integration for approvals

**Deliverables**:
- [ ] TimeGPT predictor service
- [ ] Load test results
- [ ] Slack app basics

---

## Appendices

### Appendix A. Glossary

| Term | Definition |
|------|------------|
| ARV | Agent Readiness Verification - pre-commit checks |
| A2A | Agent-to-Agent protocol for coordination |
| Triage | PR complexity scoring (1-10 scale) |
| Hash binding | Approval tied to specific patch SHA256 |
| Run bundle | Artifact package for audit/replay |
| OpenTofu | Open-source Terraform fork |
| WIF | Workload Identity Federation (keyless CI/CD) |

### Appendix B. Reference Links

- [Turbo Documentation](https://turbo.build/repo/docs)
- [OpenTofu Documentation](https://opentofu.org/docs)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Anthropic API](https://docs.anthropic.com)
- [Vertex AI](https://cloud.google.com/vertex-ai/docs)

### Appendix C. Troubleshooting

**CLI hangs on triage**:
```
Check: ANTHROPIC_API_KEY and GITHUB_TOKEN set?
Check: GitHub repo accessible?
Try: gwi doctor (diagnostic command)
```

**Cloud Run service unhealthy**:
```
Check: gcloud run services describe <service>
Check: gcloud logging read "resource.type=cloud_run_revision"
Check: Secret Manager permissions
```

**OpenTofu state issues**:
```
Check: tofu workspace list
Check: Backend configuration in main.tf
Try: tofu refresh
```

### Appendix D. Open Questions

1. Should orchestrator state use Redis or Firestore?
2. What's the right rate limiting strategy per tenant?
3. When to start TimeGPT integration?
4. Should web dashboard be separate deployment?
5. What's the SLA for webhook processing?

---

*Generated by IntentMail DevOps Audit System*
*Document: 019-AA-AUDT-appaudit-devops-playbook.md*
*Classification: Internal Use*
