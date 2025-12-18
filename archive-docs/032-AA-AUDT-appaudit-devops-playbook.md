# Git With Intent: Operator-Grade System Analysis & Operations Guide

*For: DevOps Engineer*
*Generated: 2025-12-16*
*System Version: v0.2.0 (commit 97320b8)*
*Document ID: 032-AA-AUDT*

---

> **STATUS: AUDIT ARTIFACT**
>
> This document is a point-in-time system analysis generated 2025-12-16.
> It captures the state of git-with-intent at v0.2.0 for DevOps onboarding reference.
>
> **Canonical working spec**: `CLAUDE.md` (root)
> **Phase history**: `000-docs/NNN-AA-REPT-*.md` (After-Action Reports)
>
> This audit may be updated quarterly or on major architecture changes.
> For day-to-day operations, defer to `CLAUDE.md` and recent AARs.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Operator & Customer Journey](#2-operator--customer-journey)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [Directory Deep-Dive](#4-directory-deep-dive)
5. [Automation & Agent Surfaces](#5-automation--agent-surfaces)
6. [Operational Reference](#6-operational-reference)
7. [Security, Compliance & Access](#7-security-compliance--access)
8. [Cost & Performance](#8-cost--performance)
9. [Development Workflow](#9-development-workflow)
10. [Dependencies & Supply Chain](#10-dependencies--supply-chain)
11. [Integration with Existing Documentation](#11-integration-with-existing-documentation)
12. [Current State Assessment](#12-current-state-assessment)
13. [Quick Reference](#13-quick-reference)
14. [Recommendations Roadmap](#14-recommendations-roadmap)

---

## 1. Executive Summary

### Business Purpose

**Git With Intent** is an AI-powered DevOps automation platform designed to handle PRs, merge conflicts, and issue-to-PR workflows with minimal human intervention. The core value proposition: "Git with purpose. Ship with confidence." The platform uses a multi-agent architecture where specialized AI agents (Triage, Coder, Resolver, Reviewer) collaborate to automate common developer workflows.

The platform is currently in **BETA READY** status after completing Phases 1-15 of development. The system can accept user signups, authenticate via Firebase, connect GitHub repositories, execute AI-powered workflows using real LLM calls (Claude via Anthropic SDK, Gemini via Google AI SDK), and process payments through Stripe integration. The architecture follows a multi-tenant SaaS model with role-based access control (OWNER, ADMIN, DEVELOPER, VIEWER).

The technology foundation is built on **TypeScript/Node.js 20+** for all backend services, **React 18** for the web frontend, **Firestore** for multi-tenant data persistence, **Cloud Run** for serverless deployment, and **Vertex AI Agent Engine** for agent orchestration. Infrastructure is managed via **Terraform** with full IaC coverage. The build system uses **Turbo** for monorepo orchestration with 10 packages.

**Immediate Strengths**: Complete authentication/authorization system, functional multi-agent workflows with real LLM integration, Stripe payment processing, comprehensive Terraform IaC, CI/CD via GitHub Actions with WIF authentication. **Key Risks**: No rate limiting (abuse vector), in-memory workflow state (lost on restart), no production test coverage, CLI commands partially implemented. **Strategic Consideration**: Platform is positioned for closed beta launch immediately with path to GA within 4-6 weeks.

### Operational Status Matrix

| Environment | Status | Uptime Target | Current Uptime | Release Cadence | Active Users |
|-------------|--------|---------------|----------------|-----------------|--------------|
| Production  | NOT DEPLOYED | 99.9% | N/A | On demand | 0 |
| Staging     | AVAILABLE | 99.5% | Unknown | Per PR merge | ~5 internal |
| Development | LOCAL | N/A | N/A | Continuous | 2-3 developers |

### Technology Stack Summary

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| Language | TypeScript | 5.3.0 | Primary language, strict mode |
| Runtime | Node.js | 20+ | Server runtime |
| Framework | Express | 4.18.2 | API server |
| Database | Firestore | Latest | Multi-tenant data store |
| Frontend | React | 18.2.0 | Web UI |
| AI/ML | Anthropic SDK | 0.30.0 | Claude models (Sonnet/Opus) |
| AI/ML | Google AI SDK | 0.21.0 | Gemini models (Flash/Pro) |
| Payments | Stripe | 20.0.0 | Subscription billing |
| Cloud Platform | GCP | N/A | Cloud Run, Firestore, Vertex AI |
| CI/CD | GitHub Actions | N/A | Build, test, deploy |
| IaC | Terraform | Latest | Infrastructure provisioning |
| Monorepo | Turbo | 2.6.3 | Build orchestration |

---

## 2. Operator & Customer Journey

### Primary Personas

- **Operators (DevOps/Platform Engineers)**: Responsible for deploying, monitoring, and maintaining the Git With Intent infrastructure. Primary interaction through CLI, GCP Console, and monitoring dashboards.

- **External Customers (Developers/Teams)**: End users who sign up, connect GitHub repos, and trigger AI-powered workflows. Interact via web UI and eventually CLI (`gwi` commands).

- **Reseller Partners**: (Future) Partners who may white-label or resell Git With Intent capabilities. Will need API access and potentially custom deployments.

- **AI Agents**: Internal automation that processes workflows. Orchestrator routes work to Triage, Coder, Resolver, and Reviewer agents based on task type.

### End-to-End Journey Map

```
Discovery → Signup → GitHub Connect → First Workflow → Regular Use → Upgrade → Renewal
    │          │           │               │               │          │         │
    │          │           │               │               │          │         │
    v          v           v               v               v          v         v
Landing    Firebase    OAuth      API trigger     Dashboard    Stripe   Stripe
 Page       Auth      callback    /workflows      view runs   checkout  webhook
```

**Stage Details:**

1. **Discovery**: User lands on marketing site (Firebase Hosting)
   - Touchpoints: Landing page, docs
   - Dependencies: Firebase Hosting
   - Friction: None identified
   - Success Metric: Page load < 2s

2. **Signup/Login**: Firebase Authentication
   - Touchpoints: `/login` page, Firebase Auth popup
   - Dependencies: Firebase Auth, API `/auth/signup`
   - Friction: Beta invite code required (GWIBETA2025, EARLYBIRD, FOUNDER50)
   - Success Metric: Signup completion rate

3. **Onboarding**: Create tenant, connect GitHub
   - Touchpoints: `/onboarding` page, GitHub OAuth
   - Dependencies: API `/tenants`, `/github/install`, GitHub App
   - Friction: GitHub App installation complexity
   - Success Metric: GitHub repo connected within first session

4. **First Workflow**: Trigger AI workflow
   - Touchpoints: API `/workflows/start`, dashboard
   - Dependencies: Agent execution engine, LLM APIs
   - Friction: May take 30-60s for complex workflows
   - Success Metric: Workflow completion rate

5. **Upgrade**: Move from Free to Pro tier
   - Touchpoints: `/billing/checkout`, Stripe
   - Dependencies: Stripe integration, billing API
   - Friction: Credit card entry
   - Success Metric: Conversion rate

### SLA Commitments

| Metric | Target | Current | Owner |
|--------|--------|---------|-------|
| API Uptime | 99.9% | Not measured | Platform Team |
| Workflow Response Time | < 60s | ~30-60s | Platform Team |
| Support Response | 24h | N/A (no support yet) | Customer Success |
| CSAT | > 4.5/5 | Not measured | Product |

---

## 3. System Architecture Overview

### Technology Stack (Detailed)

| Layer | Technology | Version | Source of Truth | Purpose | Owner |
|-------|------------|---------|-----------------|---------|-------|
| Frontend/UI | React + Vite | 18.2.0 / 5.0.0 | `apps/web/package.json` | SaaS web interface | Frontend |
| Backend/API | Express + TypeScript | 4.18.2 / 5.3.0 | `apps/api/package.json` | Multi-tenant REST API | Backend |
| Database | Firestore | Latest | `infra/terraform/` | Tenant, run, user data | Platform |
| State Management | Firestore | Latest | `packages/core/src/storage/` | Run/workflow persistence | Platform |
| Dev Tooling | AgentFS | 0.2.3 | `packages/core/src/agentfs/` | Internal dev audit trail | Platform |
| Task Tracking | Beads | Latest | `.beads/` | Development task tracking | Platform |
| Infrastructure | Terraform | Latest | `infra/terraform/` | GCP provisioning | Platform |
| Observability | Cloud Monitoring | N/A | `infra/terraform/monitoring.tf` | Alerts, metrics | Platform |
| AI - Claude | Anthropic SDK | 0.30.0 | `packages/core/package.json` | Sonnet/Opus for complex tasks | AI |
| AI - Gemini | Google AI SDK | 0.21.0 | `packages/core/package.json` | Flash for fast routing | AI |
| Payments | Stripe | 20.0.0 | `packages/core/package.json` | Subscription billing | Billing |

### Environment Matrix

| Environment | Purpose | Hosting | Data Source | Release Cadence | IaC Source | Notes |
|-------------|---------|---------|-------------|-----------------|------------|-------|
| local | Development | localhost | In-memory / mock | Continuous | N/A | `npm run dev` |
| staging | Pre-prod validation | Cloud Run | Firestore (staging) | Per PR merge | `infra/terraform/envs/staging` | Beta users |
| prod | Production | Cloud Run | Firestore (prod) | Manual approval | `infra/terraform/envs/prod` | NOT DEPLOYED |

### Cloud & Platform Services

| Service | Purpose | Environment(s) | Key Config | Cost/Limits | Owner | Vendor Risk |
|---------|---------|----------------|------------|-------------|-------|-------------|
| Cloud Run | API + Webhook hosting | staging, prod | 512Mi/1CPU, autoscale 0-10 | Pay per request | Platform | Low |
| Firestore | Data persistence | staging, prod | Native mode | Pay per op | Platform | Low |
| Firebase Auth | User authentication | all | Email/password, Google | Free tier | Platform | Low |
| Firebase Hosting | Web UI | staging, prod | CDN distribution | Free tier | Frontend | Low |
| Vertex AI Agent Engine | Agent orchestration | staging, prod | Reasoning engines | Pay per call | Platform | Medium |
| Artifact Registry | Docker images | staging, prod | gcr.io equivalent | Storage costs | Platform | Low |
| Secret Manager | API keys, secrets | all | Automatic rotation | Pay per access | Platform | Low |
| Anthropic API | Claude LLM | all | API key in env | ~$15/M input tokens | AI | Medium |
| Google AI API | Gemini LLM | all | API key in env | ~$1.25/M input tokens | AI | Low |
| Stripe | Payment processing | all | Test/Live modes | 2.9% + $0.30 | Billing | Low |
| GitHub | Source + OAuth | all | App installation | Free | Integration | Low |

### Architecture Diagram

```
                                    ┌─────────────────────────────────────────────┐
                                    │              EXTERNAL USERS                  │
                                    │   (Developers, Teams, Resellers)            │
                                    └─────────────────────┬───────────────────────┘
                                                          │
                         ┌────────────────────────────────┼────────────────────────────────┐
                         │                                │                                │
                         ▼                                ▼                                ▼
              ┌──────────────────┐           ┌──────────────────┐           ┌──────────────────┐
              │   Web UI (React) │           │    CLI (gwi)     │           │   GitHub App     │
              │  Firebase Hosting │           │   (Node.js)      │           │   (Webhooks)     │
              └────────┬─────────┘           └────────┬─────────┘           └────────┬─────────┘
                       │                              │                              │
                       │                              │                              │
                       ▼                              ▼                              ▼
              ┌────────────────────────────────────────────────────────────────────────────────┐
              │                            GWI API (Cloud Run)                                  │
              │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
              │  │ Auth Routes │  │Tenant Routes│  │Workflow API │  │   Billing Routes    │   │
              │  │ /auth/*     │  │ /tenants/*  │  │ /workflows/*│  │   /billing/*        │   │
              │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘   │
              └────────┬─────────────────┬─────────────────┬─────────────────┬────────────────┘
                       │                 │                 │                 │
         ┌─────────────┼─────────────────┼─────────────────┼─────────────────┼─────────────┐
         │             │                 │                 │                 │             │
         ▼             ▼                 ▼                 ▼                 ▼             ▼
  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
  │ Firebase    │ │  Firestore  │ │ Orchestrator│ │   Stripe    │ │  Anthropic  │ │  Google AI  │
  │   Auth      │ │  (tenants,  │ │   Agent     │ │   (payments)│ │  (Claude)   │ │  (Gemini)   │
  │             │ │  runs, etc) │ │             │ │             │ │             │ │             │
  └─────────────┘ └─────────────┘ └──────┬──────┘ └─────────────┘ └─────────────┘ └─────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
             ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
             │   Triage    │      │   Coder     │      │  Resolver   │
             │   Agent     │      │   Agent     │      │   Agent     │
             │(Gemini Flash│      │(Claude      │      │(Claude      │
             │   - fast)   │      │ Sonnet)     │      │ Sonnet/Opus)│
             └─────────────┘      └─────────────┘      └──────┬──────┘
                                                              │
                                                              ▼
                                                       ┌─────────────┐
                                                       │  Reviewer   │
                                                       │   Agent     │
                                                       │(Claude      │
                                                       │ Sonnet)     │
                                                       └─────────────┘
```

**Data Flow:**

1. User requests hit GWI API via web UI, CLI, or GitHub webhook
2. API authenticates via Firebase Auth JWT validation
3. Workflow requests routed to Orchestrator Agent
4. Orchestrator dispatches to specialized agents based on workflow type
5. Agents call LLM APIs (Anthropic/Google) for AI processing
6. Results stored in Firestore, returned to user
7. Billing events sent to Stripe for payment processing

---

## 4. Directory Deep-Dive

### Project Structure Analysis

```
git-with-intent/                    # Monorepo root (v0.2.0)
├── .github/
│   └── workflows/
│       └── ci.yml                  # GitHub Actions CI/CD pipeline
├── .claude/
│   └── commands/
│       └── session-start.md        # Claude Code session initialization
├── .beads/                         # Beads task tracking database
├── .husky/                         # Git hooks (commit linting)
├── agents/
│   └── cards/                      # Agent card definitions (A2A protocol)
├── apps/                           # Deployable applications
│   ├── api/                        # GWI SaaS API (Cloud Run)
│   ├── cli/                        # CLI tool (gwi command)
│   ├── gateway/                    # A2A Gateway service
│   ├── github-webhook/             # GitHub webhook handler
│   └── web/                        # React SPA (Firebase Hosting)
├── packages/                       # Shared libraries
│   ├── agents/                     # Agent implementations
│   ├── core/                       # Core utilities (storage, models, billing)
│   ├── engine/                     # Agent execution engine
│   ├── integrations/               # GitHub/GitLab integrations
│   └── sdk/                        # TypeScript SDK for API consumers
├── infra/                          # Infrastructure as Code
│   ├── terraform/                  # Terraform configurations
│   │   ├── envs/                   # Environment-specific vars
│   │   ├── modules/                # Reusable TF modules
│   │   └── 000-docs/               # Terraform documentation
│   └── cloudbuild/                 # Cloud Build configs
├── scripts/                        # Operational scripts
│   ├── ci/                         # CI check scripts
│   ├── agentfs-init.ts             # AgentFS initialization
│   ├── claude-after-message.ts     # Claude audit hook
│   ├── cloud-smoke-test.ts         # Deployment validation
│   └── deploy-staging.sh           # Staging deployment
├── docs/                           # Project documentation
├── 000-docs/                       # Numbered documentation (v4 filing)
├── CLAUDE.md                       # Claude Code instructions
├── README.md                       # Project overview
├── package.json                    # Root package config
├── turbo.json                      # Turbo build config
└── tsconfig.json                   # TypeScript config
```

### Detailed Directory Analysis

#### apps/api/ (1,856 lines)

**Purpose**: Multi-tenant SaaS API deployed to Cloud Run. Handles all HTTP requests for tenant management, workflow execution, billing, and GitHub integration.

**Key Files**:
- `src/index.ts:1-1856` - Main Express application with all routes

**Patterns**:
- Express middleware chain: CORS → Helmet → JSON → Auth → Routes
- Zod schemas for all request validation
- Structured JSON logging (Cloud Logging compatible)
- JWT token validation via Firebase Admin SDK

**Entry Points**:
- `GET /health` - Health check
- `POST /auth/signup` - User registration
- `POST /tenants` - Tenant creation
- `POST /workflows/start` - Start AI workflow
- `POST /webhooks/stripe` - Stripe webhook handler

**Authentication**: Firebase JWT validation in middleware, tenant context injection

**Data Layer**: Firestore via `@gwi/core` storage interfaces

#### packages/core/ (~10,667 lines)

**Purpose**: Shared utilities used across all apps and packages.

**Key Modules**:
- `src/storage/` - Storage interfaces (Firestore, in-memory, SQLite)
- `src/models/` - LLM client abstraction (Anthropic, Google)
- `src/security/` - RBAC, permissions, plan enforcement
- `src/billing/` - Stripe integration, subscriptions, invoices
- `src/workflows/` - Workflow type contracts
- `src/agentfs/` - AgentFS wrapper for agent state
- `src/beads/` - Beads integration for task tracking

**Patterns**:
- Interface-first design with multiple implementations
- Provider pattern for swappable backends
- Zod schemas for type validation

#### packages/agents/ (~2,573 lines)

**Purpose**: AI agent implementations for workflow execution.

**Key Files**:
- `src/orchestrator/index.ts` - Central workflow coordinator
- `src/triage/index.ts` - Complexity classification (Gemini Flash)
- `src/coder/index.ts` - Code generation (Claude Sonnet)
- `src/resolver/index.ts` - Conflict resolution (Claude Sonnet/Opus)
- `src/reviewer/index.ts` - Code review (Claude Sonnet)
- `src/base/agent.ts` - Base agent class

**Patterns**:
- BaseAgent class with common lifecycle
- AgentFS for state persistence
- ModelSelector for LLM routing
- SPIFFE IDs for agent identity

#### infra/terraform/ (~60K+ lines including modules)

**Purpose**: Infrastructure as Code for all GCP resources.

**Key Files**:
- `main.tf` - API enablement, locals
- `cloud_run.tf` - Cloud Run services (API, webhook, gateway)
- `agent_engine.tf` - Vertex AI Reasoning Engines
- `iam.tf` - Service accounts, IAM bindings
- `monitoring.tf` - Alert policies
- `storage.tf` - Firestore, Artifact Registry

**State Management**: GCS backend (configured per environment)

**Change Process**: PR-based with `terraform plan` in CI, manual apply

---

## 5. Automation & Agent Surfaces

### AI Agents

| Agent | Purpose | Model | Trigger | State Storage |
|-------|---------|-------|---------|---------------|
| Orchestrator | Route work, manage workflows | Gemini Flash | API `/workflows/start` | AgentFS |
| Triage | Classify complexity, identify files | Gemini Flash | Orchestrator dispatch | AgentFS |
| Coder | Generate code from issues | Claude Sonnet | Orchestrator dispatch | AgentFS |
| Resolver | Resolve merge conflicts | Claude Sonnet/Opus | Orchestrator dispatch | AgentFS |
| Reviewer | Review code, security scan | Claude Sonnet | Orchestrator dispatch | AgentFS |

### Workflow Types

| Workflow | Agent Sequence | Use Case |
|----------|---------------|----------|
| `pr-resolve` | Triage → Resolver → Reviewer | Resolve PR merge conflicts |
| `issue-to-code` | Triage → Coder → Reviewer | Generate code from issue |
| `pr-review` | Triage → Reviewer | Review PR changes |
| `test-gen` | Triage → Coder | Generate tests |
| `docs-update` | Coder | Update documentation |

### CI/CD Automation

**GitHub Actions Pipeline** (`.github/workflows/ci.yml`):

| Job | Trigger | Purpose | Dependencies |
|-----|---------|---------|--------------|
| `quality-checks` | Push, PR | Security/architecture checks | None |
| `hard-mode-checks` | `internal` branch | Strict internal checks | None |
| `build` | Push, PR | Build + test all packages | `quality-checks` |
| `build-images` | Push only | Build Docker images | `build` |
| `deploy-dev` | `develop` branch | Deploy to dev | `build-images` |
| `deploy-prod` | `main` branch | Deploy to prod | `build-images` |

### Development Automation

| Script | Purpose | Usage |
|--------|---------|-------|
| `scripts/deploy-staging.sh` | Deploy to staging Cloud Run | `./scripts/deploy-staging.sh` |
| `scripts/cloud-smoke-test.ts` | Validate deployment | `npm run smoke:staging` |
| `scripts/agentfs-init.ts` | Initialize AgentFS | `npm run agentfs:init` |
| `scripts/claude-after-message.ts` | Claude audit hook | `npm run claude:after-message` |

### Slash Commands

| Command | Purpose | Location |
|---------|---------|----------|
| `/session-start` | Initialize Claude Code session | `.claude/commands/session-start.md` |

---

## 6. Operational Reference

### Deployment Workflows

#### Local Development

**Prerequisites**:
- Node.js 20+
- npm 10.2.0+
- Git
- GCP account (for Firestore emulator or cloud connection)

**Environment Setup**:
```bash
# Clone repository
git clone <repo-url>
cd git-with-intent

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Required environment variables
export ANTHROPIC_API_KEY=sk-ant-...
export GOOGLE_AI_API_KEY=...
export GITHUB_TOKEN=ghp_...
# Optional for cloud features
export GCP_PROJECT_ID=...
export GWI_STORE_BACKEND=memory  # or 'firestore'
```

**Service Startup**:
```bash
# Build all packages
npm run build

# Run in development mode (watch)
npm run dev

# Run API server only
cd apps/api && npm run start
```

**Verification**:
```bash
# Health check
curl http://localhost:3000/health

# Run tests
npm run test
```

#### Staging Deployment

**Trigger**: Push to `develop` branch or manual script

**Pre-flight**:
- All CI checks pass
- Docker images built and pushed
- Terraform state unlocked

**Execution**:
```bash
# Manual deployment
./scripts/deploy-staging.sh

# Or via CI (automatic on develop branch push)
git push origin develop
```

**Validation**:
```bash
npm run smoke:staging
```

**Rollback**:
```bash
# Revert to previous Cloud Run revision
gcloud run services update-traffic gwi-api-staging \
  --to-revisions=<previous-revision>=100 \
  --region=us-central1
```

#### Production Deployment

**Pre-deployment Checklist**:
- [ ] CI pipeline green on `main`
- [ ] Staging smoke tests pass
- [ ] Database migrations tested in staging
- [ ] Feature flags reviewed
- [ ] Rollback plan documented
- [ ] On-call notified

**Execution**:
```bash
# Merge to main triggers deploy-prod job
git checkout main
git merge develop
git push origin main
```

**Monitoring**: Watch Cloud Run metrics, error rates, latency

**Rollback Protocol**:
```bash
# Immediate rollback via Cloud Console or:
gcloud run services update-traffic gwi-api-prod \
  --to-revisions=<previous-revision>=100 \
  --region=us-central1
```

### Monitoring & Alerting

**Dashboards**:
- Cloud Run: `https://console.cloud.google.com/run?project=${PROJECT_ID}`
- Firestore: `https://console.cloud.google.com/firestore?project=${PROJECT_ID}`
- Logs: `https://console.cloud.google.com/logs?project=${PROJECT_ID}`

**SLIs/SLOs**:
| Indicator | Target | Measurement |
|-----------|--------|-------------|
| API Availability | 99.9% | Cloud Run uptime |
| P95 Latency | < 5s | `run.googleapis.com/request_latencies` |
| Error Rate | < 5% | 5xx response ratio |

**Alerts** (defined in `monitoring.tf`):
- High error rate (> 5% 5xx)
- High latency (P95 > 5s)
- Service unavailability

### Incident Response

| Severity | Definition | Response Time | Roles | Communication |
|----------|------------|---------------|-------|---------------|
| P0 | Complete service outage | Immediate | On-call, Lead | Status page, Slack |
| P1 | Partial degradation (>10% users) | 15 min | On-call | Slack |
| P2 | Minor impact (<10% users) | 1 hour | On-call | Ticket |
| P3 | Cosmetic/non-urgent | Next business day | Assigned dev | Ticket |

**Playbook for P0/P1**:
1. Acknowledge alert
2. Check Cloud Run logs for errors
3. Verify Firestore connectivity
4. Check external dependencies (Anthropic, Google AI, Stripe)
5. If recent deploy, rollback
6. If data issue, check Firestore
7. Communicate status updates every 15 min

### Backup & Recovery

**Firestore**:
- Automatic daily backups enabled (GCP managed)
- Point-in-time recovery available
- Export to GCS for long-term retention

**Secrets**:
- Stored in Secret Manager
- Versioned with rotation support
- Break-glass: Direct GCP Console access

**Recovery Targets**:
| Service | RPO | RTO |
|---------|-----|-----|
| Firestore | 24 hours | 1 hour |
| Cloud Run | N/A (stateless) | 5 minutes |
| Secrets | Immediate | 15 minutes |

---

## 7. Security, Compliance & Access

### Identity & Access Management

| Account/Role | Purpose | Permissions | MFA | Used By |
|--------------|---------|-------------|-----|---------|
| Firebase Auth Users | End user authentication | None (app-level only) | Optional | Customers |
| GCP Service Account (API) | Cloud Run API identity | Firestore user, Logs writer | N/A | Cloud Run |
| GCP Service Account (Webhook) | Webhook handler identity | Firestore user, AI Platform | N/A | Cloud Run |
| GitHub App | Repo access | Read/write contents, issues, PRs | N/A | Integration |
| Anthropic API Key | Claude access | API calls | N/A | Agents |
| Google AI API Key | Gemini access | API calls | N/A | Agents |
| Stripe API Key | Payment processing | Full access | N/A | Billing |

### RBAC Model

| Role | Tenant Operations | Member Operations | Run Operations | Billing |
|------|-------------------|-------------------|----------------|---------|
| OWNER | Full | Full | Full | Full |
| ADMIN | Update | Invite/Remove | Full | None |
| DEVELOPER | Read | Read | Create/Cancel | None |
| VIEWER | Read | Read | Read | None |

### Secrets Management

**Storage**: GCP Secret Manager

**Secrets Inventory**:
| Secret | Purpose | Rotation | Owner |
|--------|---------|----------|-------|
| `gwi-github-private-key` | GitHub App signing | Manual | Platform |
| `gwi-github-webhook-secret` | Webhook verification | Manual | Platform |
| `ANTHROPIC_API_KEY` | Claude API | On compromise | Platform |
| `GOOGLE_AI_API_KEY` | Gemini API | On compromise | Platform |
| `STRIPE_SECRET_KEY` | Stripe API | On compromise | Billing |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhooks | On rotation | Billing |

### Security Posture

| Control | Status | Notes |
|---------|--------|-------|
| Authentication | ✅ | Firebase Auth + JWT |
| Authorization | ✅ | RBAC with permission matrix |
| Input Validation | ✅ | Zod schemas on all endpoints |
| SQL Injection | ✅ | N/A (NoSQL Firestore) |
| XSS Prevention | ⚠️ | React escapes by default |
| CSRF Protection | ⚠️ | Using Authorization header |
| Rate Limiting | ⛔ | NOT IMPLEMENTED |
| Secrets Management | ✅ | GCP Secret Manager |
| Audit Logging | ✅ | Cloud Logging + AgentFS |
| Data Encryption | ✅ | Firestore at-rest encryption |

---

## 8. Cost & Performance

### Estimated Monthly Costs (Production)

**Cloud Infrastructure**: ~$50-200/month (low traffic)
- Cloud Run: $0 (scale to zero) - $50 (active use)
- Firestore: $10-50 (depending on operations)
- Firebase: Free tier
- Secret Manager: ~$1
- Artifact Registry: ~$5
- Monitoring/Logging: ~$5-20

**AI/ML APIs**: Variable based on usage
- Anthropic (Claude): ~$0.015/1K input, $0.075/1K output (Sonnet)
- Google AI (Gemini): ~$0.00125/1K input, $0.005/1K output (Flash)
- Estimated per workflow: $0.02 - $0.50

**Third-Party SaaS**:
- Stripe: 2.9% + $0.30 per transaction
- GitHub: Free

### Performance Baseline

| Metric | Target | Current | Notes |
|--------|--------|---------|-------|
| API Cold Start | < 5s | ~3-4s | Cloud Run cold start |
| API Warm Response | < 200ms | ~50-100ms | Health check |
| Workflow Execution | < 60s | 30-90s | Depends on complexity |
| LLM Latency (Flash) | < 2s | ~1-2s | Gemini Flash |
| LLM Latency (Sonnet) | < 10s | ~5-10s | Claude Sonnet |

### Optimization Opportunities

1. **Cloud Run Min Instances**: Set `minScale=1` in production to avoid cold starts
   - Est. cost increase: ~$30/month
   - Est. improvement: Eliminates 3-4s cold start

2. **Caching**: Add Redis for frequently accessed data
   - Est. cost: ~$25/month (Memorystore)
   - Est. improvement: 50% reduction in Firestore reads

3. **LLM Response Caching**: Cache common triage results
   - Est. savings: 30% on LLM costs
   - Est. improvement: Faster repeat workflows

---

## 9. Development Workflow

### Local Development

**Standard Environment**:
- macOS or Linux (Windows via WSL2)
- Node.js 20+ via nvm
- VS Code with ESLint, Prettier extensions

**Bootstrap**:
```bash
# First time setup
npm install
npm run build

# Start development
npm run dev
```

**Common Tasks**:
```bash
# Create feature branch
git checkout -b feature/my-feature

# Run specific package tests
cd packages/core && npm test

# Type check without build
npm run typecheck

# Format code
npm run format
```

### CI/CD Pipeline

**Platform**: GitHub Actions

**Stages**:
```
quality-checks → build → build-images → deploy-{env}
```

**Quality Gates**:
- Security checks (`scripts/ci/check_nodrift.sh`)
- Agent readiness (`scripts/ci/check_arv.sh`)
- TypeScript type check
- ESLint
- Unit tests

### Code Quality

**Linting**: ESLint 8.56.0
- Config: `.eslintrc.js` (per package)
- Enforcement: CI fails on errors

**Formatting**: Prettier 3.2.0
- Auto-format on commit (husky)

**Type Safety**: TypeScript 5.3.0 (strict mode)

**Code Review**: PR required for main/develop branches

---

## 10. Dependencies & Supply Chain

### Direct Dependencies (Root)

| Package | Version | Purpose | Risk |
|---------|---------|---------|------|
| turbo | 2.6.3 | Build orchestration | Low |
| typescript | 5.3.0 | Type system | Low |
| prettier | 3.2.0 | Code formatting | Low |
| husky | 9.0.0 | Git hooks | Low |
| firebase-admin | 13.6.0 | Firebase backend SDK | Low |
| agentfs-sdk | 0.2.3 | Agent state management | Medium (new) |
| better-sqlite3 | 12.5.0 | Local SQLite | Low |

### Key Package Dependencies

| Package | Dependency | Version | Purpose |
|---------|------------|---------|---------|
| @gwi/core | @anthropic-ai/sdk | 0.30.0 | Claude API |
| @gwi/core | @google/generative-ai | 0.21.0 | Gemini API |
| @gwi/core | stripe | 20.0.0 | Payments |
| @gwi/core | zod | 3.22.0 | Schema validation |
| @gwi/api | express | 4.18.2 | HTTP server |
| @gwi/api | helmet | 7.1.0 | Security headers |
| @gwi/web | react | 18.2.0 | UI framework |
| @gwi/web | firebase | 10.7.0 | Auth client |

### Third-Party Services

| Service | Purpose | Data Shared | SLA | Renewal |
|---------|---------|-------------|-----|---------|
| Anthropic | LLM (Claude) | User prompts | 99.9% | Monthly |
| Google AI | LLM (Gemini) | User prompts | 99.9% | Monthly |
| Firebase | Auth, Hosting | User credentials | 99.95% | Monthly |
| Stripe | Payments | Payment info | 99.99% | Monthly |
| GitHub | Source, OAuth | Code, user info | 99.9% | Annual |

---

## 11. Integration with Existing Documentation

### Documentation Inventory

| Document | Location | Status | Last Updated |
|----------|----------|--------|--------------|
| README.md | Root | Current | 2025-12-16 |
| CLAUDE.md | Root | Current | 2025-12-16 |
| Phase ADRs | `docs/` | Complete | Per phase |
| Phase AARs | `docs/` | Complete | Per phase |
| Terraform README | `infra/terraform/README.md` | Complete | 2025-12-15 |
| Launch Assessment | `000-docs/031-AA-AUDT-launch-readiness-assessment.md` | Current | 2025-12-16 |
| Filing Standard | `000-docs/6767-a-DR-STND-*` | Active | 2025-12-15 |

### Key Documents for Onboarding

1. **CLAUDE.md** - Repository conventions, agent architecture, storage patterns
2. **000-docs/031-AA-AUDT-launch-readiness-assessment.md** - Current state assessment
3. **infra/terraform/README.md** - Infrastructure documentation
4. **docs/phase-*-adr.md** - Architecture decisions per phase

### Documentation Gaps

- No runbook documentation for incidents
- No API documentation (OpenAPI spec exists but not published)
- No user-facing documentation/help center
- No architecture diagrams in docs (only in code comments)

---

## 12. Current State Assessment

### What's Working Well

✅ **Multi-Agent Architecture**: Fully functional workflow execution with real LLM calls (Anthropic + Google AI SDKs)

✅ **Authentication/Authorization**: Firebase Auth + RBAC permission matrix with role hierarchy

✅ **Infrastructure as Code**: Comprehensive Terraform covering all GCP resources

✅ **CI/CD Pipeline**: GitHub Actions with WIF authentication, Docker builds, multi-env deploys

✅ **Billing Integration**: Stripe provider with subscription, checkout, portal, and webhook handling

✅ **Multi-Tenant Storage**: Firestore with tenant isolation and proper data modeling

✅ **TypeScript SDK**: Generated SDK for API consumers with full type safety

✅ **Structured Logging**: Cloud Logging compatible JSON output

### Areas Needing Attention

⚠️ **Rate Limiting**: NOT IMPLEMENTED - abuse vector for LLM costs

⚠️ **Test Coverage**: Minimal test files, no coverage metrics

⚠️ **Orchestrator Step Tracking**: In-memory Map in orchestrator - if Cloud Run restarts mid-workflow, runs stuck "running" (Firestore Run records ARE persisted, but orchestrator loses which step it was on)

⚠️ **CLI Commands**: Only partial implementation (`gwi init`, `gwi workflow` missing)

⚠️ **Error Handling**: Some agent failures not gracefully handled

⚠️ **Monitoring**: Basic alerts only, no custom dashboards

### Immediate Priorities

| Priority | Issue | Impact | Action | Owner |
|----------|-------|--------|--------|-------|
| HIGH | No rate limiting | LLM cost exposure | Implement express-rate-limit | Platform |
| HIGH | Orchestrator step state in-memory | Stuck "running" on restart | Add workflow step persistence to Firestore OR idempotent resume | Platform |
| MEDIUM | No test coverage | Quality risk | Add unit tests for core modules | All |
| MEDIUM | CLI incomplete | Developer UX | Complete `gwi init`, `gwi workflow` | CLI |
| LOW | No OpenTelemetry | Limited observability | Add tracing | Platform |

---

## 13. Quick Reference

### Operational Command Map

| Capability | Command/Tool | Notes |
|------------|--------------|-------|
| Local dev start | `npm run dev` | Watches all packages |
| Build all | `npm run build` | Turbo orchestrated |
| Run tests | `npm run test` | All packages |
| Type check | `npm run typecheck` | No emit |
| Deploy staging | `./scripts/deploy-staging.sh` | Requires GCP auth |
| Smoke test | `npm run smoke:staging` | Post-deploy validation |
| View logs | GCP Console → Logging | Filter by service |
| Emergency rollback | `gcloud run services update-traffic` | See Rollback section |
| Terraform plan | `cd infra/terraform && terraform plan` | Review changes |
| Terraform apply | `cd infra/terraform && terraform apply` | Apply changes |

### Critical Endpoints & Resources

**Production URLs** (when deployed):
- API: `https://gwi-api-prod-<hash>.run.app`
- Web: `https://your-domain.web.app`
- Webhook: `https://gwi-github-webhook-prod-<hash>.run.app`

**Staging URLs**:
- API: `https://staging-gwi-api-<hash>.run.app`
- Web: `https://your-project-staging.web.app`

**GCP Console Links**:
- Cloud Run: `console.cloud.google.com/run`
- Firestore: `console.cloud.google.com/firestore`
- Logs: `console.cloud.google.com/logs`
- Monitoring: `console.cloud.google.com/monitoring`

**GitHub**:
- Repository: (your repo URL)
- Actions: (your repo URL)/actions
- GitHub App: `github.com/settings/apps/your-app`

### First-Week Checklist

- [ ] Access granted to GCP project (Viewer minimum)
- [ ] Access to GitHub repository (write)
- [ ] Local environment working (`npm run dev` succeeds)
- [ ] Completed staging deployment (or observed one)
- [ ] Reviewed CLAUDE.md and this playbook
- [ ] Validated secrets access (can view Secret Manager)
- [ ] Understood agent architecture (read orchestrator code)
- [ ] Logged first improvement ticket
- [ ] Met with product/engineering lead

---

## 14. Recommendations Roadmap

### Week 1 – Critical Setup & Stabilization

**Goals**:
- [ ] Implement rate limiting on API endpoints
- [ ] Add workflow state persistence to Firestore
- [ ] Set up monitoring dashboard in Cloud Console
- [ ] Document incident response playbook

**Stakeholders**: Platform Team, Product

**Dependencies**: GCP access, Firestore schema approval

### Month 1 – Foundation & Visibility

**Goals**:
- [ ] Achieve 50% unit test coverage on core modules
- [ ] Complete CLI commands (`gwi init`, `gwi workflow`)
- [ ] Implement OpenTelemetry tracing
- [ ] Create public API documentation
- [ ] Set up staging auto-deploy on PR merge

**Stakeholders**: Platform Team, Frontend, Documentation

**Dependencies**: Test framework decisions, OpenTelemetry SDK

### Quarter 1 – Strategic Enhancements

**Goals**:
- [ ] Production deployment with gradual rollout
- [ ] Usage metering integration for billing
- [ ] Billing UI pages (invoices, payment methods)
- [ ] Email notification system
- [ ] GitLab integration (stretch)

**Stakeholders**: Platform, Billing, Product

**Dependencies**: Production approval, email provider selection

---

## Appendices

### Appendix A. Glossary

| Term | Definition |
|------|------------|
| A2A | Agent-to-Agent protocol for inter-agent communication |
| AgentFS | Turso-based state persistence for AI agents |
| Beads | Task tracking system used in development |
| GWI | Git With Intent (product name) |
| RBAC | Role-Based Access Control |
| SPIFFE | Secure Production Identity Framework for Everyone |
| WIF | Workload Identity Federation (GCP) |

### Appendix B. Reference Links

- [Turbo Documentation](https://turbo.build/repo/docs)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Anthropic API Documentation](https://docs.anthropic.com)
- [Google AI Documentation](https://ai.google.dev/docs)
- [Stripe API Documentation](https://stripe.com/docs/api)

### Appendix C. Troubleshooting Playbooks

**API 5xx Errors**:
1. Check Cloud Run logs for stack traces
2. Verify Firestore connectivity
3. Check LLM API status (Anthropic, Google)
4. Review recent deployments
5. If persistent, rollback to previous revision

**Workflow Stuck in "running"**:
1. Check agent logs for errors
2. Verify LLM API keys are valid
3. Check for timeout issues
4. Force cancel via API if needed

**GitHub Webhook Not Triggering**:
1. Verify webhook secret matches
2. Check Cloud Run service is running
3. Review webhook delivery logs in GitHub
4. Verify GitHub App installation

### Appendix D. Change Management

**Release Calendar**: No fixed schedule, deploy on demand

**Change Process**:
1. Create PR against `develop`
2. Pass CI checks
3. Get code review approval
4. Merge to `develop` (auto-deploys to staging)
5. Verify in staging
6. Create PR from `develop` to `main`
7. Merge to `main` (auto-deploys to production)

### Appendix E. Open Questions

1. **Production Timeline**: When is target GA date?
2. **Scaling Expectations**: What traffic volume is expected at launch?
3. **Support Model**: Who handles customer support?
4. **Backup Strategy**: Should we enable Firestore PITR?
5. **Cost Allocation**: How are LLM costs tracked per tenant?

---

*Document generated by Claude Code AppAudit*
*Last updated: 2025-12-16*
*Next review: 2026-01-16 or on major architecture changes*
