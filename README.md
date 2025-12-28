# Git With Intent

**TL;DR:** CLI tool that automates PR workflows and predicts repository outcomes. Ships now: resolves merge conflicts, creates PRs from issues, reviews code, full autopilot mode with approval gating. Building next: Airbyte-style data ingestion + TimeGPT forecasting to predict merge times, sprint completion probability, and technical debt trajectories.

**Version:** 0.3.0 | **Status:** Active development. Core PR automation works. RBAC & governance complete. CI/CD operational.

**Security:** [Security policy](000-docs/004-BL-POLI-security-policy.md) | Comprehensive audit completed Dec 2025 | Responsible disclosure program

---

## What It Does

Two modes: automation and prediction.

**Automation (shipping now):**
- Resolves merge conflicts (semantic understanding, not just textual)
- Creates PRs from GitHub issues
- Reviews and scores PR complexity
- Generates code changes with approval gating
- Full autopilot mode (triage → resolve → review → commit)

**Prediction (in progress):**
- When will this PR actually merge (not just average merge time)
- Which repos are accumulating technical debt faster than they're paying it down
- Is this merge conflict pattern a symptom of architectural issues
- What's the probability this sprint commitment is realistic

Three components:
1. **Data Ingestion** - Airbyte-style connectors pull commits, PRs, issues, CI runs, reviews, deployment logs
2. **AI Analysis** - Multi-agent system analyzes repository health, conflict patterns, team dynamics
3. **Time Series Forecasting** - TimeGPT integration predicts delivery dates, velocity trends, technical debt accumulation

---

## How It's Different

**GitHub Insights / GitLab Analytics**
They show "average PR merge time is 3 days." This tool shows "PR #847 will merge in 5.2 days with 73% confidence based on conflict patterns and reviewer availability."

**Linear / JIRA Forecasting**
They forecast based on story points and velocity. This uses actual repository activity. Story points are estimates. Git history is data.

**Airbyte + Custom Analytics**
Airbyte gets you the data. You build the intelligence. This combines both - ingestion plus AI agents that understand what the data means.

**Code Quality Tools (SonarQube, CodeClimate)**
They analyze code quality at a point in time. This analyzes trajectory - is technical debt growing or shrinking, and at what rate.

**What's different:**
- Semantic merge conflict analysis (not just textual)
- Review bottlenecks and team dynamics from git history
- CI/CD failure pattern recognition
- Code churn vs actual progress
- Time series forecasting with TimeGPT (Nixtla's foundation model for temporal data)

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Data Ingestion (Airbyte-style connectors)                  │
│  • GitHub API (commits, PRs, issues, reviews, CI runs)       │
│  • GitLab, Bitbucket connectors (roadmap)                    │
│  • JIRA, Linear for project data (roadmap)                   │
│  • Slack, Discord for team communication (roadmap)           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Storage Layer                                               │
│  • Firestore for real-time operational data                  │
│  • SQLite for local development and testing                  │
│  • Time series optimized for forecasting                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Multi-Agent AI Analysis                                     │
│  • Triage Agent: PR complexity scoring (Gemini Flash)        │
│  • Coder Agent: Conflict resolution (Claude Sonnet)          │
│  • Resolver Agent: Semantic merge resolution (Claude Opus)   │
│  • Reviewer Agent: Code review analysis (Claude Sonnet)      │
│  • Orchestrator: Multi-repo pattern detection (Gemini)       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Forecasting Layer (TimeGPT)                                 │
│  • Delivery date prediction                                  │
│  • Velocity trend forecasting                                │
│  • Technical debt accumulation projections                   │
│  • Team capacity modeling                                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Outputs                                                     │
│  • CLI commands (gwi triage, gwi predict, gwi analyze)       │
│  • REST API for integrations                                 │
│  • Webhooks for automated responses                          │
│  • Dashboard for visualization                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Current Capabilities

### 1. PR Workflow Automation (SHIPPING NOW)

The tool actually does work, not just analysis:

```bash
# Score PR complexity, identify conflicts
gwi triage https://github.com/owner/repo/pull/123

# Resolve merge conflicts with semantic understanding
gwi resolve https://github.com/owner/repo/pull/123

# Turn GitHub issue into code + PR
gwi issue-to-code https://github.com/owner/repo/issues/456

# Full autopilot: triage → resolve → review → commit (with approval)
gwi autopilot https://github.com/owner/repo/pull/123
```

**Key features:**
- Actually resolves merge conflicts (not just detects them)
- Actually creates PRs from issues (not just generates templates)
- Deterministic complexity scoring (1-10 scale, reproducible)
- Approval gating with SHA256 hash binding (no surprise commits)
- Multi-agent routing (simple PRs → fast models, complex → powerful models)
- Complete audit trail for every run

### 2. Repository Analysis (IN PROGRESS)

```bash
# Single repo deep analysis
gwi analyze repo https://github.com/owner/repo

# Multi-repo pattern detection
gwi analyze org owner --repos=all

# Technical debt trajectory
gwi analyze debt https://github.com/owner/repo --forecast-days=90
```

**Analyzes:**
- Merge conflict patterns (where and why)
- Review bottlenecks (who's blocking PRs)
- Code churn vs value delivery
- CI/CD reliability trends
- Commit message quality and convention adherence

### 3. Predictive Forecasting (PLANNED - TimeGPT Integration)

```bash
# Predict when PR will actually merge
gwi predict merge https://github.com/owner/repo/pull/123

# Forecast sprint delivery probability
gwi predict sprint owner/repo --sprint=current

# Project technical debt trajectory
gwi predict debt owner/repo --horizon=6-months
```

**Uses TimeGPT to forecast:**
- Merge time prediction (accounting for reviewer patterns, conflict complexity, CI reliability)
- Sprint completion probability (based on actual velocity, not story points)
- Technical debt accumulation (trend analysis of code quality metrics)
- Team capacity and bottlenecks

---

## Architecture

### Turbo Monorepo Structure

```
git-with-intent/
├── apps/
│   ├── cli/              # CLI (gwi commands)
│   ├── api/              # REST API (Cloud Run)
│   ├── gateway/          # A2A Gateway for agent coordination
│   ├── github-webhook/   # GitHub webhook handler
│   ├── worker/           # Background job processor
│   ├── web/              # Analytics dashboard (React)
│   └── registry/         # Plugin registry
├── packages/
│   ├── core/             # 68 modules (storage, billing, security, forecasting)
│   ├── agents/           # AI agent implementations
│   ├── engine/           # Workflow orchestration
│   ├── integrations/     # GitHub/GitLab connectors
│   └── sdk/              # TypeScript SDK for external consumers
└── infra/                # OpenTofu (Terraform alternative) for GCP
```

### Data Flow

**For single-repo analysis:**
1. Connector pulls repo data (commits, PRs, issues, CI runs)
2. Storage layer indexes in Firestore + BigQuery
3. Agents analyze patterns (conflicts, bottlenecks, quality)
4. TimeGPT generates forecasts
5. Results cached and served via API/CLI

**For multi-repo analysis:**
1. Worker processes all repos in background
2. Aggregates patterns across organization
3. Identifies cross-repo dependencies and bottlenecks
4. Generates org-wide insights and predictions

### AI Agent Stack

- **Orchestrator** (Gemini Flash) - Fast workflow coordination
- **Triage** (Gemini Flash) - PR complexity scoring
- **Coder** (Claude Sonnet) - Code generation from issues
- **Resolver** (Claude Sonnet/Opus) - Semantic conflict resolution
- **Reviewer** (Claude Sonnet) - Code review analysis
- **Forecaster** (TimeGPT) - Time series prediction

Agent routing is complexity-based: simple tasks → fast/cheap models, complex → powerful models.

---

## Quick Start

### Install and Build

```bash
npm install
npm run build
```

### Set Environment Variables

```bash
# Required: At least one AI provider
export ANTHROPIC_API_KEY="your-anthropic-key"
export GOOGLE_AI_API_KEY="your-google-key"

# Required: GitHub access
export GITHUB_TOKEN="your-github-token"

# Optional: Storage backend (defaults to in-memory)
export GWI_STORE_BACKEND=firestore  # or 'memory'
export GCP_PROJECT_ID=your-project
```

### Try It

**Option 1: Direct Install (npm)**
```bash
# Analyze a PR
gwi triage https://github.com/facebook/react/pull/12345

# Resolve merge conflicts
gwi resolve https://github.com/owner/repo/pull/123

# Full autopilot
gwi autopilot https://github.com/owner/repo/pull/123
```

**Option 2: Docker (Isolated/Sandboxed)**
```bash
# Build image
docker build -t gwi-cli -f apps/cli/Dockerfile .

# Run with environment variables
docker run -it --rm \
  -e ANTHROPIC_API_KEY="your-key" \
  -e GITHUB_TOKEN="your-token" \
  -v $(pwd):/workspace \
  gwi-cli triage https://github.com/owner/repo/pull/123
```

Docker provides additional isolation and security sandboxing.

---

## Development

### Build and Test

```bash
npm run build        # Build all packages (Turbo respects dependency graph)
npm run typecheck    # Type check all packages
npm run test         # ~1700 tests
npm run arv          # Agent Readiness Verification (pre-commit checks)
```

### Run Single Package Tests

```bash
npx turbo run test --filter=@gwi/core
npx turbo run test --filter=@gwi/agents
npx turbo run test --filter=@gwi/engine
```

### E2E Testing Framework

Production-ready end-to-end testing infrastructure in `test/e2e/`:

```bash
# Run all E2E tests
npx vitest test/e2e

# Run specific test file
npx vitest test/e2e/example.e2e.test.ts
```

**Features:**
- Type-safe API client with authentication helpers
- GitHub API mock server with fixtures
- Test data factories matching current schemas
- Global setup/teardown with test isolation
- 18 example tests demonstrating best practices

See `test/e2e/README.md` for complete documentation.

### SDK Type Generation

Auto-generate TypeScript types from OpenAPI specification:

```bash
# Generate types (runs automatically on build)
npm run generate:sdk-types

# Validate types are in sync
npm run validate:sdk-types
```

**Features:**
- Zero type drift between API and SDK
- Full autocomplete and compile-time errors
- Type helper utilities (RequestBody, SuccessResponse, etc.)
- ARV validation ensures types stay in sync

See `packages/sdk/README-CODEGEN.md` for complete documentation.

### ARV (Agent Readiness Verification)

Pre-commit enforcement of code standards:

```bash
npm run arv           # All checks
npm run arv:lint      # No deprecated patterns
npm run arv:contracts # Zod schema validation
npm run arv:goldens   # Deterministic output checks
npm run arv:smoke     # Boot smoke test
```

---

## Task Backlog (Active Development)

**We use [beads](https://github.com/Dicklesworthstone/beads_viewer) for task tracking.**

Check current status: `bd list --status open`

### By Epic (Team Assignment)

| Epic | Status | Open Tasks | Focus Area |
|------|--------|------------|------------|
| **@security** | ✅ Complete | 0 | Epic E: RBAC, governance, quotas (v0.3.0) |
| **@orchestrator** | 🚧 Active | 85 | Multi-agent workflow coordination, run execution |
| **@connectors** | 📋 Planned | 80 | GitHub/GitLab/JIRA integrations, data ingestion |
| **@backend** | 🚧 Active | 73 | Core platform features, API endpoints |
| **@frontend** | 🚧 Active | 45 | Web dashboard, visualization, UI components |
| **@infra** | 🚧 Active | 37 | OpenTofu, Cloud Run, deployment automation |
| **@ai** | 🚧 Active | 30 | ML features, forecasting, embeddings, quality metrics |

---

### Epic Breakdown (8 Active + 1 Complete)

Each epic has 6-12 stories, each story has 5-6 steps.

#### Epic A: Core Infrastructure (@backend, @security)
Foundation layer for multi-tenant, production-grade operations.

- **A1** - Firestore data model (tenants/repos/runs/steps/policies/audit/idempotency)
- **A2** - Run state machine + transitions
- **A3** - Step execution contract (inputs/outputs, typed envelopes)
- **A4** - Idempotency layer for all event sources
- **A5** - Queue abstraction: Pub/Sub baseline + Cloud Tasks option
- **A6** - Concurrency caps + backpressure (per tenant/repo/workflow)
- **A7** - Correlation IDs + structured logging schema
- **A8** - Artifact model (GCS) for evidence bundles
- **A9** - Secrets model (Secret Manager)
- **A10** - Multi-tenant authorization middleware (API)
- **A11** - Cost metering primitives (tokens/time/ops)
- **A12** - SLO definitions + baseline perf tests

#### Epic B: Connectors (@connectors)
Airbyte-style data ingestion from GitHub, GitLab, JIRA, Linear, etc.

- **B1** - Connector framework contract (event envelope + handlers)
- **B2** - GitHub App installation lifecycle (tenant mapping)
- **B3** - Webhook verification + replay defense
- **B4** - GitHub API connector hardening
- **B5** - Normalized repo snapshot service (for context)
- **B6** - External system connector slots (Linear/Jira/Sentry/PostHog)
- **B7** - Airbyte integration design (no runtime dependency yet)
- **B8** - Connector health subsystem (UI/API)
- **B9** - Event schema registry + compatibility tests
- **B10** - Abuse prevention (webhooks + APIs)

#### Epic C: Workflows (@orchestrator)
Multi-step PR automation with human-in-the-loop approvals.

- **C1** - Workflow definitions as data (versioned)
- **C2** - Step runner + orchestration engine
- **C3** - Approval gates (human-in-the-loop)
- **C4** - PR creation pipeline (Issue → PR)
- **C5** - Evidence packet generator (standard format)
- **C6** - Test execution & verification hooks
- **C7** - Merge conflict detection & resolution tiers
- **C8** - Reviewer automation (structured review)
- **C9** - Cancellation, rollback, and undo strategy
- **C10** - Deterministic E2E Hello World workflow

#### Epic D: Policy & Audit (@security)
Governance, compliance, and audit trail for enterprise deployments.

- **D1** - Policy model (rules/conditions/actions)
- **D2** - Policy evaluation engine
- **D3** - Policy simulation (what would happen if)
- **D4** - Audit trail (immutable events)
- **D5** - Evidence retention + export bundles
- **D6** - Risk scoring (foundation)
- **D7** - Compliance-ready access logs
- **D8** - Supply-chain hooks (foundation)

#### Epic E: RBAC & Governance (@security) ✅ COMPLETE (v0.3.0)
Enterprise-grade multi-tenant security, governance, and compliance.

- ✅ **E1** - RBAC model + enforcement (~2,200 lines)
- ✅ **E2** - Tenant lifecycle management (state machine, soft/hard delete)
- ✅ **E3** - Quota enforcement (3 modes: hard/soft/warn, burst allowances)
- ✅ **E4** - Secrets management (AES-256-GCM encryption, rotation)
- ✅ **E5** - Governance & audit (5 compliance report types, anomaly detection)
- ✅ **E6** - Compliance export (CSV/JSON, immutable audit trail)
- ✅ **E7** - Express middleware + 47 integration tests

#### Epic F: Web Dashboard (@frontend)
React SPA for repository health, runs, approvals, and analytics.

- **F1** - Authenticated web app shell (Firebase Hosting + Firebase Auth)
- **F2** - Repos page (connected repos + health)
- **F3** - Runs page (filters + drilldown)
- **F4** - Approvals queue UX
- **F5** - Evidence viewer UX
- **F6** - Policy editor + simulation UI
- **F7** - Audit viewer UI
- **F8** - Ops dashboards (SLO/cost/queue depth)
- **F9** - Onboarding wizard UX

#### Epic G: Slack Integration (@frontend)
Slack app for notifications, interactive approvals, and slash commands.

- **G1** - Slack app basics + OAuth install per tenant
- **G2** - Notification pipeline
- **G3** - Interactive approvals
- **G4** - Slash commands
- **G5** - Deep links to Command Center
- **G6** - Slack audit linkage

#### Epic H: Infrastructure & Operations (@infra)
Cloud Run deployment, observability, disaster recovery, and cost controls.

- **H1** - Service decomposition & Cloud Run deployment model
- **H2** - CI/CD hardening with WIF
- **H3** - Observability baseline
- **H4** - DR & resilience plan
- **H5** - Security review & threat model
- **H6** - Cost controls
- **H7** - Domain + Firebase Hosting production posture

#### Epic I: Forecasting & ML (@ai) 🚀
**TimeGPT integration for predictive analytics.**

- **I1** - Canonical time-series schema
- **I2** - Airbyte ingestion mapping to canonical series
- **I3** - Predictor service contract (Cloud Run Python)
- **I4** - TimeGPT integration + deterministic fallback
- **I5** - Prediction dashboards & alerts
- **I6** - Optional auto-actions (propose runs only, policy-gated)

---

**After completing work, ALWAYS close the corresponding beads:** `bd close <id> -r "reason"`

---

## Roadmap

### Phase 1: PR Automation (SHIPPING)
- ✅ PR triage and complexity scoring
- ✅ AI-powered merge conflict resolution
- ✅ Issue-to-code generation
- ✅ Approval gating with hash binding
- ✅ Audit trail for all runs

### Phase 2: Data Ingestion (IN PROGRESS)
- 🚧 GitHub connector (commits, PRs, issues, CI runs)
- 🚧 SQLite storage layer with backup/restore
- 🚧 Firestore real-time operational DB
- ⏳ GitLab, Bitbucket connectors
- ⏳ JIRA, Linear project data connectors

### Phase 3: Repository Analysis (IN PROGRESS)
- 🚧 Single-repo deep analysis
- 🚧 Multi-repo pattern detection
- 🚧 Technical debt trajectory analysis
- 🚧 Review bottleneck identification
- ⏳ Team dynamics and communication patterns

### Phase 4: Predictive Forecasting (PLANNED)
- ⏳ TimeGPT integration for time series forecasting
- ⏳ Merge time prediction
- ⏳ Sprint delivery probability
- ⏳ Technical debt accumulation forecasting
- ⏳ Team capacity modeling

### Phase 5: Platform (PLANNED)
- ⏳ GitHub App for automated workflows
- ⏳ Slack/Discord bot for team notifications
- ⏳ Web dashboard for analytics
- ⏳ Webhook-triggered automation
- ⏳ Multi-tenant SaaS deployment

**Legend:** ✅ Shipped | 🚧 In Progress | ⏳ Planned

---

## Technical Details

### Storage Strategy

**Dual-backend architecture:**
- **Firestore** - Real-time operational data (runs, approvals, live repo state)
- **SQLite** - Local development and testing with full analytics support

**Why both?**
- Firestore for low-latency reads during PR automation
- SQLite for local development with full feature parity

### Forecasting Approach

**TimeGPT Integration (Planned)**

[TimeGPT](https://github.com/Nixtla/nixtla) is a foundation model for time series forecasting (like GPT but for temporal data). We use it to predict:

1. **Merge Time**: Historical merge patterns + current conflict complexity + reviewer availability
2. **Sprint Delivery**: Actual commit velocity + PR complexity trends + team capacity
3. **Technical Debt**: Code quality metric trajectories + churn rates + test coverage trends

**Why TimeGPT vs traditional time series models?**
- Pre-trained on massive time series datasets (transfer learning)
- Handles irregular intervals and missing data
- Better at capturing complex patterns than ARIMA/Prophet
- No per-dataset hyperparameter tuning needed

### Security Model

**Approval gating for destructive operations:**

| Operation | Risk Level | Approval Required |
|-----------|------------|-------------------|
| Read repo data | Safe | No |
| Analyze patterns | Safe | No |
| Generate patch | Safe | No |
| Post PR comment | Low | No |
| Commit changes | High | Yes (hash-bound) |
| Push to remote | High | Yes (hash-bound) |
| Merge PR | Critical | Yes (hash-bound) |

**Hash binding:** After you approve an operation, if the patch changes, approval is invalidated. No surprise commits.

---

## Production Deployment

**Infrastructure:** Google Cloud Platform via OpenTofu (Terraform fork)

```
Cloud Run Services:
├── gwi-api          # REST API
├── gwi-gateway      # A2A agent coordination
├── gwi-webhook      # GitHub webhook handler
└── gwi-worker       # Background analytics jobs

Firebase:
├── Firestore        # Operational database
└── Hosting          # Web dashboard

Storage:
└── SQLite           # Local dev with analytics and backup utilities

Vertex AI:
└── Agent Engine     # AI agent runtime (not managed by OpenTofu)
```

**Deployment flow:** GitHub Actions → OpenTofu → Cloud Run

**NO direct `gcloud` deploys.** All infrastructure changes go through PR review and OpenTofu apply.

---

## Current State

**What works (v0.3.0):**
- ✅ Merge conflict resolution (semantic, not just textual)
- ✅ Issue-to-PR code generation
- ✅ PR complexity scoring (deterministic 1-10 scale)
- ✅ Autopilot mode (triage → resolve → review → commit)
- ✅ Approval gating with hash binding (no surprise commits)
- ✅ Multi-agent AI routing (fast models for simple tasks, powerful for complex)
- ✅ RBAC & governance (tenant lifecycle, quotas, secrets, audit)
- ✅ CI/CD pipeline (4-shard parallel tests, auto-deploy, release automation)
- ✅ E2E and SDK integration tests (78 tests)
- ✅ 1700+ unit tests, ARV pre-commit checks

**What's in progress:**
- 🚧 Auto-fix monitoring system (grading, CI workflows, metrics)
- 🚧 Web dashboard (React SPA for runs, approvals, analytics)
- 🚧 TimeGPT forecasting integration (run outcome prediction, quality trends)

**What's planned:**
- ⏳ Data ingestion connectors (GitHub/GitLab/JIRA Airbyte-style)
- ⏳ Repository analysis engine (multi-repo pattern detection)
- ⏳ GitHub App for automated webhooks
- ⏳ Slack/Discord integration

---

## Why We Built This

Engineering teams have dashboards showing commits, PR velocity, test coverage. When someone asks "when will we ship?" the answer is usually a shrug and a 50% buffer.

Git repositories contain a time series of team behavior. Extract the signal from the noise, you can predict outcomes instead of guessing.

Foundation models (LLMs for analysis, TimeGPT for forecasting) make this tractable now.

---

## Contributing

This repo is currently private and under active development. If you're interested in contributing or early access:

📧 jeremy@intentsolutions.io

---

## Security

See [Security Policy](000-docs/004-BL-POLI-security-policy.md) for our security policy, responsible disclosure program, and security posture.

**TL;DR:**
- ✅ Comprehensive security audit completed (Dec 2025)
- ✅ All findings documented and tracked
- ⚠️ Pre-alpha software - not production-ready
- 📧 Security issues: security@intentsolutions.io

---

## License

**MIT License** - Copyright (c) 2025 Intent Solutions LLC / Jeremy Longshore

Open source CLI tool. Use it, fork it, learn from it. See [LICENSE](./LICENSE) for details.

**Hosted service** (when available) will be commercial. The code is free, the infrastructure/support is not.
