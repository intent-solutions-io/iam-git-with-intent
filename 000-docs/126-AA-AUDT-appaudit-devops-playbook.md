# Git With Intent: Operator-Grade System Analysis & Operations Guide

*For: DevOps Engineer*
*Generated: 2025-12-19*
*System Version: 711660e (v0.2.0)*

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

**Git With Intent (GWI)** is an AI-powered CLI and multi-agent platform for GitHub PR workflows. Unlike generic AI coding assistants that focus on writing new code, GWI specializes in the "messy middle" of software development: merge conflict resolution, PR triage, complexity scoring, and automated code generation from GitHub issues.

The platform operates as a multi-agent system where different AI models are routed based on task complexity:
- **Simple PRs** → Gemini Flash (fast, cost-effective)
- **Complex PRs** → Claude Sonnet/Opus (stronger reasoning)
- **Code generation** → Claude Sonnet
- **Conflict resolution** → Claude Opus for high-complexity scenarios

GWI differentiates itself through deterministic complexity scoring (1-10 scale), approval gating with SHA256 hash binding, comprehensive audit trails, and a safety model that gates all destructive operations (commits, pushes, merges) behind explicit user approval.

**Current Status**: Active beta development. Core CLI functionality works, 1700+ tests passing. Cloud infrastructure deployed via OpenTofu to GCP. The platform targets Vertex AI Agent Engine for production agent runtime with A2A (Agent-to-Agent) protocol for inter-agent communication.

### Operational Status Matrix

| Environment | Status | Uptime Target | Current Uptime | Release Cadence | Active Users |
|-------------|--------|---------------|----------------|-----------------|--------------|
| Production  | Deployed | 99.5% | Not measured | On-demand | Internal only |
| Staging     | Deployed | 95% | Not measured | Per-PR | Developers |
| Development | Active | N/A | N/A | Continuous | 1-2 developers |

### Technology Stack Summary

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| Language | TypeScript | 5.3+ | Core application |
| Runtime | Node.js | 20+ | Server and CLI |
| Build | Turbo | 2.3 | Monorepo orchestration |
| Testing | Vitest | 2.1 | Unit/integration tests |
| Database | Firestore | 13.6 | Production storage |
| Cloud Platform | GCP | - | Vertex AI, Cloud Run, Artifact Registry |
| IaC | OpenTofu | 1.6+ | Infrastructure as Code |
| CI/CD | GitHub Actions | - | Build, test, deploy |
| AI - Primary | Vertex AI (Gemini) | 2.5 Flash | Fast triage, review |
| AI - Secondary | Anthropic (Claude) | Sonnet/Opus | Complex reasoning |

---

## 2. Operator & Customer Journey

### Primary Personas

- **Operators (DevOps)**: Manage infrastructure, deployments, monitoring. Need to understand OpenTofu state, Cloud Run services, and observability stack.
- **Developers**: Use CLI (`gwi` commands) to triage PRs, resolve conflicts, generate code. Need local setup and API keys.
- **Internal Testers**: Validate workflows end-to-end. Need staging environment access.
- **Future: External Customers**: SaaS users via web dashboard and GitHub App integration.

### End-to-End Journey Map

```
Developer → Install CLI → Configure API Keys → Run Commands → Review Output → Approve Changes → Commit
    │              │              │               │              │              │
    └─ npm install └─ GITHUB_TOKEN└─ gwi triage   └─ artifacts   └─ hash-bound  └─ gwi run approve
                      GCP_PROJECT_ID  gwi resolve    in .gwi/runs/   approval
```

**Critical Touchpoints**:
1. **CLI Installation**: `npm install && npm run build`
2. **API Key Setup**: GITHUB_TOKEN, GCP_PROJECT_ID (Vertex AI uses ADC)
3. **Command Execution**: `gwi triage <pr-url>`, `gwi resolve <pr-url>`
4. **Artifact Review**: `.gwi/runs/<runId>/` contains all outputs
5. **Approval Gating**: `gwi run approve <run-id>` with SHA256 binding

### SLA Commitments

| Metric | Target | Current | Owner |
|--------|--------|---------|-------|
| CLI Response (triage) | <10s | ~3-5s | @gwi/cli |
| API Latency (p95) | <5s | Not measured | @gwi/api |
| Workflow Completion | 99% | ~95% | @gwi/engine |
| Test Suite Pass | 100% | 100% (1698 tests) | All packages |

---

## 3. System Architecture Overview

### Technology Stack (Detailed)

| Layer | Technology | Version | Source of Truth | Purpose | Owner |
|-------|------------|---------|-----------------|---------|-------|
| CLI | Commander.js | - | apps/cli/ | User interface | @gwi/cli |
| API | Fastify | - | apps/api/ | REST endpoints | @gwi/api |
| Gateway | Express | - | apps/gateway/ | A2A protocol | @gwi/gateway |
| Webhook | Express | - | apps/github-webhook/ | GitHub events | @gwi/github-webhook |
| Web | React/Vite | - | apps/web/ | Dashboard (WIP) | @gwi/web |
| Agents | Custom | - | packages/agents/ | AI agent implementations | @gwi/agents |
| Engine | Custom | - | packages/engine/ | Workflow orchestration | @gwi/engine |
| Core | Custom | - | packages/core/ | 68 modules: storage, billing, security | @gwi/core |
| Integrations | Octokit | - | packages/integrations/ | GitHub client | @gwi/integrations |
| SDK | Custom | - | packages/sdk/ | TypeScript client | @gwi/sdk |
| IaC | OpenTofu | 1.6+ | infra/ | Cloud infrastructure | infra |

### Environment Matrix

| Environment | Purpose | Hosting | Data Source | Release Cadence | IaC Source | Notes |
|-------------|---------|---------|-------------|-----------------|------------|-------|
| local | Development | localhost | In-memory | Continuous | N/A | No cloud deps |
| staging | Pre-prod testing | Cloud Run | Firestore | Per-PR | infra/envs/staging.tfvars | Auto-deploy on PR |
| prod | Production | Cloud Run | Firestore | Manual | infra/envs/prod.tfvars | Approval required |

### Cloud & Platform Services

| Service | Purpose | Environment(s) | Key Config | Cost/Limits | Owner | Vendor Risk |
|---------|---------|----------------|------------|-------------|-------|-------------|
| Vertex AI | Agent runtime, Gemini models | All | gemini-2.5-flash | Pay-per-use | infra | Low (GCP native) |
| Cloud Run | API, Gateway, Webhook hosting | staging, prod | Min: 0, Max: 10 | ~$5/month idle | infra | Low |
| Artifact Registry | Docker images | All | gwi-docker repo | ~$1/month | infra | Low |
| Firestore | Production data store | staging, prod | Native mode | Free tier | infra | Low |
| Secret Manager | API keys, tokens | All | Per-secret | ~$0.06/secret | infra | Low |
| Cloud Monitoring | Alerts, dashboards | All | 5xx, latency alerts | Free tier | infra | Low |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                  EXTERNAL                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                           │
│  │   GitHub     │  │   Developer  │  │   Web UI     │                           │
│  │   Webhooks   │  │   (CLI)      │  │   (Future)   │                           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                           │
└─────────┼─────────────────┼─────────────────┼───────────────────────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CLOUD RUN (GCP)                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   GitHub     │  │    API       │  │   A2A        │  │   Worker     │         │
│  │   Webhook    │  │   Server     │  │   Gateway    │  │   (Future)   │         │
│  │   Handler    │  │   (Fastify)  │  │   (A2A Proto)│  │              │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────────────┘         │
└─────────┼─────────────────┼─────────────────┼───────────────────────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           VERTEX AI AGENT ENGINE                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Orchestrator │──│   Triage     │──│   Resolver   │──│   Reviewer   │         │
│  │   Agent      │  │   Agent      │  │   Agent      │  │   Agent      │         │
│  │ (Gemini Flash│  │ (Gemini Flash│  │ (Claude      │  │ (Gemini 2.5  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                           │
│  │  Firestore   │  │   Secret     │  │  Cloud       │                           │
│  │  (Storage)   │  │   Manager    │  │  Logging     │                           │
│  └──────────────┘  └──────────────┘  └──────────────┘                           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Directory Deep-Dive

### Project Structure Analysis

```
git-with-intent/
├── .github/
│   └── workflows/           # CI/CD pipelines
│       ├── ci.yml           # Main build/test/deploy
│       ├── arv.yml          # Agent readiness verification
│       ├── drift-detection.yml
│       ├── tofu-plan.yml    # OpenTofu plan on PR
│       └── tofu-apply.yml   # OpenTofu apply on merge
├── 000-docs/                # Internal documentation (126 files)
│   ├── NNN-AA-*.md          # Analysis/Assessment documents
│   ├── NNN-DR-*.md          # Design Review documents
│   └── NNN-XX-*.md          # Other categories
├── apps/
│   ├── api/                 # REST API (Fastify)
│   ├── cli/                 # CLI tool (gwi command)
│   ├── gateway/             # A2A Gateway
│   ├── github-webhook/      # GitHub event handler
│   ├── registry/            # Agent registry
│   ├── web/                 # React dashboard
│   └── worker/              # Background processor
├── infra/                   # OpenTofu IaC (SOURCE OF TRUTH)
│   ├── main.tf              # Core resources, APIs
│   ├── cloud_run.tf         # Cloud Run services
│   ├── iam.tf               # Service accounts, roles
│   ├── monitoring.tf        # Alerts, dashboards
│   ├── storage.tf           # Firestore, GCS
│   ├── agent_engine.tf      # Vertex AI Agent Engine
│   ├── artifact_registry.tf # Docker registry
│   └── envs/                # Environment-specific vars
├── packages/
│   ├── agents/              # Agent implementations
│   ├── core/                # 68 modules, 132K lines TS
│   ├── engine/              # Workflow orchestration
│   ├── integrations/        # GitHub, Airbyte, etc.
│   └── sdk/                 # TypeScript client SDK
├── scripts/                 # Operational scripts
│   ├── arv/                 # Agent readiness checks
│   ├── ci/                  # CI helper scripts
│   └── hooks/               # Pre/post-flight hooks
├── package.json             # Root workspace config
├── turbo.json               # Turbo build config
├── CLAUDE.md                # AI assistant instructions
└── README.md                # Project overview
```

### Detailed Directory Analysis

#### packages/core/src/ (68 modules, ~132K lines)

**Purpose**: Core business logic, shared utilities, and platform services.

**Key Modules**:
| Module | Purpose | Tests | Critical |
|--------|---------|-------|----------|
| storage/ | Firestore/memory backends | Yes | HIGH |
| billing/ | Usage metering, quotas | Yes | HIGH |
| security/ | RBAC, audit, secrets | Yes | HIGH |
| reliability/ | Rate limiting, circuit breakers | Yes | HIGH |
| scoring/ | Complexity scoring (1-10) | Yes | HIGH |
| approvals/ | Hash-bound approval gating | Yes | HIGH |
| models/ | LLM provider abstraction | Yes | HIGH |
| llm/providers/ | Vertex AI, Anthropic, OpenAI | Yes | HIGH |
| queue/ | Job queue abstraction | Yes | MEDIUM |
| forecasting/ | Time series analysis | Yes | LOW |
| marketplace/ | Plugin system (WIP) | Yes | LOW |

**Entry Points**: `packages/core/src/index.ts` exports all public APIs.

**Code Quality**: Well-structured with clear separation of concerns. Each module has `__tests__/` directory. 50 test files, 1698 tests.

#### packages/agents/src/

**Purpose**: AI agent implementations for PR workflows.

**Agents**:
| Agent | Model | Purpose | Input | Output |
|-------|-------|---------|-------|--------|
| orchestrator | Gemini Flash | Route workflows | WorkflowInput | OrchestratorOutput |
| triage | Gemini Flash | Score complexity | PRMetadata | TriageResult |
| coder | Claude Sonnet | Generate code | IssueMetadata | CodeResult |
| resolver | Claude Sonnet/Opus | Resolve conflicts | ConflictInfo | ResolutionResult |
| reviewer | Gemini 2.5 Flash | Review changes | ReviewInput | ReviewResult |

**Architecture**: All agents extend `BaseAgent` which provides `chat()`, state management, and lifecycle hooks.

#### infra/ (OpenTofu)

**Purpose**: Source of truth for all GCP infrastructure.

**Key Resources**:
| Resource | File | Purpose |
|----------|------|---------|
| APIs | main.tf | Enable required GCP APIs |
| Cloud Run | cloud_run.tf | 4 services: gateway, webhook, API, worker |
| IAM | iam.tf | 4 service accounts with least-privilege |
| Monitoring | monitoring.tf | Alert policies, uptime checks, budgets |
| Storage | storage.tf | Firestore, GCS buckets |
| Agent Engine | agent_engine.tf | Vertex AI Agent Engine config |
| Artifact Registry | artifact_registry.tf | Docker image storage |

**State Management**: Remote state in GCS bucket. Locking via GCS.

**Change Process**: PR triggers `tofu plan`, merge triggers `tofu apply` via WIF (Workload Identity Federation).

---

## 5. Automation & Agent Surfaces

### GitHub Actions Workflows

| Workflow | Trigger | Purpose | Duration | Owner |
|----------|---------|---------|----------|-------|
| ci.yml | Push, PR | Build, test, deploy | ~3 min | DevOps |
| arv.yml | PR | Agent readiness checks | ~1 min | DevOps |
| tofu-plan.yml | PR (infra/) | OpenTofu plan preview | ~2 min | DevOps |
| tofu-apply.yml | Merge to main | Apply infrastructure | ~3 min | DevOps |
| drift-detection.yml | Schedule | Detect config drift | ~2 min | DevOps |

### AI Agents

| Agent | Purpose | Model | Trigger |
|-------|---------|-------|---------|
| Orchestrator | Route workflows between agents | gemini-2.5-flash | API/CLI |
| Triage | Analyze PR complexity | gemini-2.5-flash | gwi triage |
| Coder | Generate code from issues | claude-sonnet | gwi issue-to-code |
| Resolver | Resolve merge conflicts | claude-sonnet/opus | gwi resolve |
| Reviewer | Validate resolutions | gemini-2.5-flash | gwi review |

### CLI Commands (Slash Commands)

| Command | Purpose | Risk Level |
|---------|---------|------------|
| gwi triage \<pr-url\> | Score PR complexity | Safe |
| gwi plan \<pr-url\> | Generate resolution plan | Safe |
| gwi resolve \<pr-url\> | AI conflict resolution | Safe (generates locally) |
| gwi review \<pr-url\> | Generate review summary | Safe |
| gwi issue-to-code \<url\> | Generate code from issue | Safe |
| gwi autopilot \<pr-url\> | Full pipeline | Safe |
| gwi run list | List recent runs | Safe |
| gwi run status \<id\> | Check run details | Safe |
| gwi run approve \<id\> | Approve for commit | Gated |

---

## 6. Operational Reference

### Deployment Workflows

#### Local Development

```bash
# Prerequisites
node --version  # >= 20.0.0
npm --version   # >= 10.2.0
gcloud auth application-default login  # For Vertex AI

# Setup
git clone https://github.com/intent-solutions-io/git-with-intent.git
cd git-with-intent
npm install
npm run build

# Environment
export GITHUB_TOKEN=$(gh auth token)
export GCP_PROJECT_ID=git-with-intent

# Verify
npm run test        # 1698 tests
npm run typecheck   # Type safety

# Run CLI
node apps/cli/dist/index.js --help
gwi triage https://github.com/owner/repo/pull/123
```

#### Staging Deployment

1. **Trigger**: Push to `develop` branch or PR to `main`
2. **Pipeline**: `.github/workflows/ci.yml`
3. **Steps**:
   - Quality checks (no-drift, ARV)
   - Build all packages
   - Run tests
   - Build Docker images
   - Push to Artifact Registry
   - (Manual) Deploy to staging Cloud Run

#### Production Deployment

**Pre-deployment Checklist**:
- [ ] CI pipeline green
- [ ] Tests passing (1698+)
- [ ] OpenTofu plan reviewed
- [ ] No drift detected
- [ ] Rollback plan ready

**Execution**:
```bash
# 1. Merge PR to main (triggers tofu-apply)
# 2. Monitor GitHub Actions
# 3. Verify deployment
curl https://gwi-a2a-gateway-prod-xxxxx.run.app/health
```

### Monitoring & Alerting

**Alert Policies** (defined in `infra/monitoring.tf`):
| Alert | Condition | Severity |
|-------|-----------|----------|
| High Error Rate | 5xx > 5% | P1 |
| High Latency | P95 > 5000ms | P2 |
| Service Unavailable | Uptime check fails | P1 |

**Dashboards**: Cloud Console → Monitoring → Dashboards

**Logging**: Cloud Console → Logging → Logs Explorer
- Filter: `resource.type="cloud_run_revision"`

### Incident Response

| Severity | Definition | Response Time | Actions |
|----------|------------|---------------|---------|
| P0 | All services down | Immediate | Page on-call, status page update |
| P1 | Critical degradation | 15 min | Investigate, rollback if needed |
| P2 | Partial impact | 1 hour | Triage, fix in next deploy |
| P3 | Minor issues | Next day | Log ticket, prioritize |

### Backup & Recovery

**Firestore**: Point-in-time recovery enabled (7-day retention)

**Rollback Procedure**:
```bash
# 1. Identify previous working image tag
gcloud run services describe gwi-a2a-gateway-prod --region=us-central1

# 2. Deploy previous revision
gcloud run services update-traffic gwi-a2a-gateway-prod \
  --to-revisions=PREVIOUS_REVISION=100

# 3. Verify
curl https://gwi-a2a-gateway-prod-xxxxx.run.app/health
```

---

## 7. Security, Compliance & Access

### Identity & Access Management

| Account | Purpose | Permissions | MFA |
|---------|---------|-------------|-----|
| gwi-agent-{env} | Agent Engine runtime | aiplatform.user, ml.developer, secretmanager.secretAccessor | N/A (SA) |
| gwi-a2a-{env} | A2A Gateway | aiplatform.user, logging.logWriter | N/A (SA) |
| gwi-github-{env} | Webhook handler | aiplatform.user, logging.logWriter | N/A (SA) |
| gwi-ci | GitHub Actions | artifactregistry.writer, run.admin, iam.workloadIdentityUser | N/A (WIF) |

### Secrets Management

**Location**: GCP Secret Manager

**Secrets**:
| Secret | Purpose | Rotation |
|--------|---------|----------|
| github-app-private-key | GitHub App auth | Manual |
| github-webhook-secret | Webhook validation | Manual |
| anthropic-api-key | Claude API | Manual |
| stripe-secret-key | Billing (future) | Manual |

**Access**: Via service account IAM roles (roles/secretmanager.secretAccessor)

### Security Posture

**Authentication**:
- GitHub OAuth for users (future)
- Service account tokens for inter-service
- WIF for CI/CD (no long-lived keys)

**Authorization**:
- RBAC implemented in `packages/core/src/security/`
- Tenant isolation via Firestore collections

**Encryption**:
- In-transit: TLS everywhere (Cloud Run default)
- At-rest: GCP-managed encryption (Firestore, GCS)

**Known Issues**:
- No rate limiting on public endpoints (HIGH)
- API keys in environment variables (MEDIUM)

---

## 8. Cost & Performance

### Current Costs (Estimated)

**Monthly Cloud Spend**: ~$20-50/month (light usage)

| Service | Est. Cost | Notes |
|---------|-----------|-------|
| Cloud Run | $5-10 | Scale to zero |
| Vertex AI | $5-20 | Pay-per-request |
| Artifact Registry | $1-2 | Storage |
| Firestore | $0 | Free tier |
| Secret Manager | $0.50 | Per-secret |
| Monitoring | $0 | Free tier |

### Performance Baseline

| Metric | Target | Current |
|--------|--------|---------|
| CLI triage latency | <10s | 3-5s |
| Workflow completion | <60s | 10-30s |
| API p95 latency | <5s | Not measured |
| Test suite | <60s | ~13s |

### Optimization Opportunities

1. **Reserved capacity** for Vertex AI → Est. savings: 20-40%
2. **Caching** Gemini responses for identical PRs → Latency reduction: 50%
3. **Batch processing** for bulk operations → Throughput: 10x

---

## 9. Development Workflow

### Local Development

```bash
# Standard workflow
npm install          # Install deps
npm run build        # Build all
npm run test         # Run tests
npm run typecheck    # Type check
npm run lint         # Lint (non-blocking)

# Watch mode
npm run dev          # Turbo watch

# Single package
npx turbo run test --filter=@gwi/core
npx turbo run build --filter=@gwi/cli
```

### CI/CD Pipeline

**Platform**: GitHub Actions

**Stages**:
1. **quality-checks**: No-drift, ARV (parallel)
2. **build**: Install, lint, build, typecheck, test
3. **build-images**: Docker build and push (push only)
4. **deploy-staging**: Cloud Run deploy (develop branch)

**Artifacts**: Docker images tagged with commit SHA and `latest`

### Code Quality

**Linting**: ESLint with TypeScript plugin
**Testing**: Vitest, 1698+ tests
**Type Safety**: TypeScript strict mode
**Coverage**: Not enforced (gap)

---

## 10. Dependencies & Supply Chain

### Direct Dependencies

**Production**:
- `@anthropic-ai/sdk`: Claude API
- `@google-cloud/vertexai`: Gemini via Vertex
- `firebase-admin`: Firestore
- `octokit`: GitHub API
- `commander`: CLI framework
- `fastify`: API framework

**Development**:
- `turbo`: Monorepo build
- `vitest`: Testing
- `typescript`: Type system
- `husky`: Git hooks

### Third-Party Services

| Service | Purpose | Data Shared | SLA |
|---------|---------|-------------|-----|
| GitHub | PR/Issue data | Code, metadata | 99.9% |
| Anthropic | Claude API | Prompts, code | 99.9% |
| Google Vertex AI | Gemini API | Prompts, code | 99.9% |

---

## 11. Integration with Existing Documentation

### Documentation Inventory

| Document | Status | Notes |
|----------|--------|-------|
| README.md | Current | Good overview |
| CLAUDE.md | Current | Comprehensive AI instructions |
| 000-docs/ | 126 files | Phase AARs, design docs |
| infra/README.md | Current | IaC documentation |

### Recommended Reading

1. **CLAUDE.md** - Full system context for developers
2. **000-docs/044-DR-GUID-agent-engine-context.md** - Agent Engine patterns
3. **000-docs/125-AA-AACR-gcp-deployment-opentofu-migration.md** - Latest deployment AAR
4. **infra/README.md** - Infrastructure details

---

## 12. Current State Assessment

### What's Working Well

- **Tests**: 1698 tests passing, comprehensive coverage of core
- **Build System**: Turbo monorepo working smoothly
- **IaC**: OpenTofu fully configured with WIF
- **Vertex AI**: ADC authentication working (no API keys)
- **CLI**: Core commands functional (triage, resolve, review)
- **CI/CD**: GitHub Actions pipeline with quality gates

### Areas Needing Attention

| Issue | Severity | Impact |
|-------|----------|--------|
| No rate limiting | HIGH | DoS risk |
| Orchestrator state in-memory | HIGH | Runs stuck on restart |
| No observability dashboards | MEDIUM | Blind to performance |
| Documentation gaps | MEDIUM | Onboarding friction |
| Web dashboard minimal | LOW | Future feature |

### Immediate Priorities

1. **[HIGH]** Add rate limiting to Cloud Run endpoints
   - Impact: Security
   - Action: Implement in gateway middleware
   - Owner: DevOps

2. **[HIGH]** Persist orchestrator state to Firestore
   - Impact: Reliability
   - Action: Update OrchestratorAgent
   - Owner: Backend

3. **[MEDIUM]** Create Cloud Monitoring dashboards
   - Impact: Observability
   - Action: Add to monitoring.tf
   - Owner: DevOps

---

## 13. Quick Reference

### Operational Command Map

| Task | Command | Source |
|------|---------|--------|
| Local setup | `npm install && npm run build` | package.json |
| Run tests | `npm run test` | package.json |
| Type check | `npm run typecheck` | package.json |
| Run CLI | `node apps/cli/dist/index.js` | apps/cli/ |
| ARV checks | `npm run arv` | scripts/arv/ |
| OpenTofu plan | `tofu plan` | infra/ |
| View logs | `gcloud logging read` | GCP |
| Deploy staging | Push to develop | .github/workflows/ci.yml |

### Critical Endpoints

| Environment | URL | Health |
|-------------|-----|--------|
| A2A Gateway (staging) | Cloud Run URL | /health |
| GitHub Webhook (staging) | Cloud Run URL | /health |
| Firestore | console.cloud.google.com | N/A |
| Artifact Registry | us-central1-docker.pkg.dev | N/A |

### First-Week Checklist

- [ ] Clone repo, run `npm install && npm run build`
- [ ] Run `npm run test` (1698 tests should pass)
- [ ] Set up `gcloud auth application-default login`
- [ ] Run `gwi triage` on a test PR
- [ ] Review CLAUDE.md and 000-docs/044-DR-GUID-agent-engine-context.md
- [ ] Review infra/ directory and OpenTofu state
- [ ] Get access to GCP project `git-with-intent`
- [ ] Review GitHub Actions workflow runs

---

## 14. Recommendations Roadmap

### Week 1 - Critical Setup & Stabilization

**Goals**:
- [ ] Deploy rate limiting middleware
- [ ] Set up Cloud Monitoring dashboard
- [ ] Document runbook for incident response
- [ ] Verify backup/restore procedures

**Stakeholders**: DevOps, Backend
**Dependencies**: GCP access, infra permissions

### Month 1 - Foundation & Visibility

**Goals**:
- [ ] Persist orchestrator state to Firestore
- [ ] Implement error budget tracking
- [ ] Add smoke tests to deployment pipeline
- [ ] Create alerting runbook

**Stakeholders**: DevOps, Backend, SRE
**Dependencies**: Week 1 complete

### Quarter 1 - Strategic Enhancements

**Goals**:
- [ ] GitHub App integration for automated workflows
- [ ] Web dashboard for run management
- [ ] Multi-tenant isolation validation
- [ ] Cost optimization review

**Stakeholders**: Product, Engineering, DevOps
**Dependencies**: Month 1 complete

---

## Appendices

### Appendix A. Glossary

| Term | Definition |
|------|------------|
| GWI | Git With Intent |
| A2A | Agent-to-Agent protocol |
| ARV | Agent Readiness Verification |
| ADC | Application Default Credentials |
| WIF | Workload Identity Federation |
| OpenTofu | Open-source Terraform fork |

### Appendix B. Reference Links

- **Repository**: https://github.com/intent-solutions-io/git-with-intent
- **GCP Console**: https://console.cloud.google.com/home/dashboard?project=git-with-intent
- **Vertex AI**: https://console.cloud.google.com/vertex-ai?project=git-with-intent
- **Cloud Run**: https://console.cloud.google.com/run?project=git-with-intent
- **Monitoring**: https://console.cloud.google.com/monitoring?project=git-with-intent

### Appendix C. Troubleshooting

| Issue | Symptom | Fix |
|-------|---------|-----|
| CLI fails with API key error | "GOOGLE_AI_API_KEY required" | Use GCP_PROJECT_ID with ADC instead |
| Tests timeout | Vitest hangs | Check for async leaks |
| Docker build fails | COPY error | Run from monorepo root |
| OpenTofu drift | State mismatch | Run `tofu apply` to reconcile |

### Appendix D. Open Questions

1. What is the production traffic baseline for capacity planning?
2. What are the SLA commitments for external customers?
3. What is the incident response escalation path?
4. What is the cost budget ceiling?

---

*Document: 126-AA-AUDT-appaudit-devops-playbook.md*
*Generated: 2025-12-19*
*Next Review: 2026-03-19*
