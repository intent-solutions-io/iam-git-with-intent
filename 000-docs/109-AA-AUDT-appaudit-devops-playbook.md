# 109-AA-AUDT-appaudit-devops-playbook.md

**Document Type:** AA-AUDT (After-Action Audit)
**Created:** 2025-12-18T00:30:00-06:00 (CST)
**Author:** Claude Code AppAudit System
**Project:** Git With Intent (GWI)
**Version:** v0.2.0 (Beta Ready)

---

## Executive Summary

This DevOps Playbook provides comprehensive operational guidance for the **Git With Intent** platform - an AI-powered multi-agent PR assistant. The system uses Claude (Anthropic) and Gemini (Google) models to automate PR workflows including conflict resolution, code review, and issue-to-code generation.

### Key System Characteristics

| Attribute | Value |
|-----------|-------|
| **Architecture** | Multi-agent orchestration (4 specialized agents) |
| **Infrastructure** | GCP Cloud Run + Vertex AI Reasoning Engine + Firestore |
| **Deployment** | GitHub Actions → OpenTofu → Cloud Run (WIF auth) |
| **Language** | TypeScript (strict), Node.js 20+ |
| **Build System** | Turbo monorepo (10 packages) |
| **Current Status** | Beta Ready (Phases 1-31 complete) |

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Repository Structure](#2-repository-structure)
3. [Infrastructure Overview](#3-infrastructure-overview)
4. [Development Workflow](#4-development-workflow)
5. [CI/CD Pipeline](#5-cicd-pipeline)
6. [Deployment Procedures](#6-deployment-procedures)
7. [Monitoring & Alerting](#7-monitoring--alerting)
8. [Security Model](#8-security-model)
9. [Troubleshooting Guide](#9-troubleshooting-guide)
10. [Runbooks](#10-runbooks)
11. [Known Gaps & Roadmap](#11-known-gaps--roadmap)

---

## 1. System Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          User Interfaces                             │
├─────────────────┬─────────────────┬─────────────────────────────────┤
│   CLI (gwi)     │   Web UI        │   GitHub App Webhook            │
│   apps/cli      │   apps/web      │   apps/github-webhook           │
└────────┬────────┴────────┬────────┴────────┬────────────────────────┘
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      A2A Gateway (apps/gateway)                      │
│                   Cloud Run - Agent-to-Agent Router                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   Orchestrator  │ │   Triage Agent  │ │ Resolver Agent  │
│  (Gemini Flash) │ │  (Gemini Flash) │ │ (Claude Sonnet) │
│                 │ │                 │ │                 │
│ Route workflows │ │ Classify issues │ │ Resolve merges  │
│ Manage state    │ │ Identify files  │ │ Generate code   │
└─────────────────┘ └─────────────────┘ └─────────────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Reviewer Agent                                │
│                     (Claude Sonnet/Opus)                             │
│             Security scan, code quality, human summary               │
└─────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Persistent Storage                                │
├─────────────────────────────────────────────────────────────────────┤
│  Firestore (prod)          │  In-Memory (dev)                       │
│  - gwi_tenants             │  - Same interface                      │
│  - gwi_runs                │  - Auto-selected via env               │
│  - gwi_memberships         │                                        │
│  - gwi_audit_logs          │                                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Agent Architecture

| Agent | Primary Model | Fallback Model | Purpose |
|-------|---------------|----------------|---------|
| **Orchestrator** | Gemini 2.0 Flash | - | Route work, manage workflows |
| **Triage** | Gemini 2.0 Flash | - | Classify complexity, identify files |
| **Resolver** | Claude Sonnet 4 | Claude Opus 4 (complex) | Resolve merge conflicts, generate code |
| **Reviewer** | Claude Sonnet 4 | - | Review code, security scan |

### 1.3 Workflow Types

```
PR-RESOLVE:    Triage → Resolver → Reviewer
PR-REVIEW:     Triage → Reviewer
ISSUE-TO-CODE: Triage → Coder → Reviewer
AUTOPILOT:     Full pipeline with human-in-the-loop
```

---

## 2. Repository Structure

### 2.1 Directory Layout

```
git-with-intent/
├── apps/                    # Deployable applications
│   ├── api/                 # SaaS REST API (Cloud Run)
│   ├── cli/                 # CLI: gwi commands
│   ├── gateway/             # A2A Gateway (Cloud Run)
│   ├── github-webhook/      # GitHub webhook handler (Cloud Run)
│   ├── registry/            # Connector registry
│   ├── web/                 # React SPA (Firebase Hosting)
│   └── worker/              # Background job processor
│
├── packages/                # Shared libraries
│   ├── agents/              # Agent implementations (triage, resolver, reviewer)
│   ├── core/                # Storage, models, billing, security, identity
│   ├── engine/              # Agent execution engine + hooks
│   ├── integrations/        # GitHub/GitLab integrations
│   └── sdk/                 # TypeScript SDK for API consumers
│
├── infra/                   # Infrastructure as Code
│   └── *.tf                 # All GCP infrastructure (OpenTofu - SOURCE OF TRUTH)
│       ├── main.tf          # API enablement, naming
│       ├── cloud_run.tf     # Cloud Run services
│       ├── agent_engine.tf  # Vertex AI Reasoning Engines
│       ├── monitoring.tf    # Alert policies
│       ├── variables.tf     # Configuration variables
│       └── envs/            # Environment-specific tfvars
│           ├── dev.tfvars
│           ├── staging.tfvars
│           └── prod.tfvars
│
├── scripts/                 # Operational scripts
│   ├── arv/                 # Agent Readiness Verification gates
│   │   ├── identity-gate.ts
│   │   ├── security-gate.ts
│   │   ├── observability-gate.ts
│   │   ├── forensics-gate.ts
│   │   ├── metering-gate.ts
│   │   └── run-all.ts
│   ├── ci/                  # CI helper scripts
│   └── docs/                # Documentation generators
│
├── test/                    # Test suites
│   └── contracts/           # Contract tests for schemas
│
├── 000-docs/                # All documentation (flat, numbered)
│   ├── NNN-AA-REPT-*.md     # After-Action Reports
│   ├── NNN-AA-AUDT-*.md     # Audits
│   ├── NNN-DR-ADRC-*.md     # Architecture Decision Records
│   └── 6767-*.md            # Standards documents
│
├── .github/
│   └── workflows/
│       └── ci.yml           # Main CI/CD pipeline
│
├── firestore.rules          # Firestore security rules (RBAC)
├── turbo.json               # Turbo build configuration
├── package.json             # Root package (workspaces)
└── CLAUDE.md                # AI assistant instructions
```

### 2.2 Package Dependencies

```
@gwi/core ← Foundation (storage, models, security, identity)
    ↑
@gwi/agents ← Agent implementations
    ↑
@gwi/engine ← Execution engine + hooks
    ↑
@gwi/integrations ← GitHub/GitLab connectors
    ↑
apps/* ← Deployable services
```

---

## 3. Infrastructure Overview

### 3.1 GCP Services

| Service | Purpose | OpenTofu Resource |
|---------|---------|-------------------|
| **Cloud Run** | API, Gateway, Webhook, Worker | `google_cloud_run_v2_service` |
| **Vertex AI Reasoning Engine** | Agent execution | `google_vertex_ai_reasoning_engine_engine` |
| **Firestore** | Multi-tenant storage | `google_firestore_database` |
| **Pub/Sub** | Async job queue | `google_pubsub_topic` |
| **Secret Manager** | Secrets storage | `google_secret_manager_secret` |
| **Artifact Registry** | Docker images | `google_artifact_registry_repository` |
| **Cloud Monitoring** | Alerts & dashboards | `google_monitoring_alert_policy` |

### 3.2 Environment Configuration

| Environment | GCP Project | Branch | Scaling |
|-------------|-------------|--------|---------|
| **dev** | `git-with-intent-dev` | `develop` | min=0, max=5 |
| **staging** | `git-with-intent-staging` | `develop` + manual | min=1, max=10 |
| **prod** | `git-with-intent-prod` | `main` | min=2, max=20 |

### 3.3 Cloud Run Services

```hcl
# Production service configuration (from cloud_run.tf)
Service: gwi-api-prod
  - Image: us-central1-docker.pkg.dev/git-with-intent-prod/gwi/api:latest
  - Memory: 2Gi
  - CPU: 2
  - Max instances: 10
  - Concurrency: 80

Service: gwi-a2a-gateway-prod
  - Image: us-central1-docker.pkg.dev/git-with-intent-prod/gwi/gateway:latest
  - Memory: 1Gi
  - CPU: 1
  - Max instances: 20

Service: gwi-github-webhook-prod
  - Image: us-central1-docker.pkg.dev/git-with-intent-prod/gwi/github-webhook:latest
  - Memory: 512Mi
  - CPU: 1
  - Max instances: 10
```

---

## 4. Development Workflow

### 4.1 Local Development Setup

```bash
# Clone and install
git clone https://github.com/intent-solutions/git-with-intent.git
cd git-with-intent
npm install

# Environment setup (development defaults to in-memory storage)
cp apps/web/.env.example apps/web/.env
# Edit with your Firebase config

# Build all packages
npm run build

# Run in development mode (watch)
npm run dev

# Run tests
npm run test

# Type check
npm run typecheck

# Lint
npm run lint
```

### 4.2 Environment Variables

#### Required (Users)

```bash
# At least one AI provider
ANTHROPIC_API_KEY=sk-ant-...
# OR
GOOGLE_AI_API_KEY=...

# GitHub access
GITHUB_TOKEN=ghp_...
```

#### Production

```bash
GWI_STORE_BACKEND=firestore
GCP_PROJECT_ID=git-with-intent-prod
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

#### Development/Internal

```bash
GWI_STORE_BACKEND=memory  # or unset for in-memory
GWI_AGENTFS_ENABLED=true
GWI_BEADS_ENABLED=true
GWI_FORENSICS_ENABLED=true
GWI_FORENSICS_DIR=.gwi/forensics
```

### 4.3 CLI Commands

```bash
# After build, CLI is available at:
node apps/cli/dist/index.js --help

# Or install globally for development:
npm link -w apps/cli
gwi --help

# Available commands:
gwi triage <pr-url>      # Analyze PR/issue complexity
gwi plan <pr-url>        # Generate change plan
gwi resolve <pr-url>     # Apply conflict resolutions
gwi review <pr-url>      # Generate review summary
gwi autopilot <pr-url>   # Full automated pipeline
gwi status <run-id>      # Check run status
gwi workflow start ...   # Start specific workflow
```

---

## 5. CI/CD Pipeline

### 5.1 Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Actions CI/CD                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  On: push(main, develop), pull_request(main)                    │
│                                                                  │
│  ┌──────────────────┐                                           │
│  │ Quality Checks   │ ←── Always runs first                     │
│  │ - check_nodrift  │                                           │
│  │ - check_arv      │                                           │
│  └────────┬─────────┘                                           │
│           │                                                      │
│  ┌────────▼─────────┐                                           │
│  │ Build & Test     │                                           │
│  │ - npm ci         │                                           │
│  │ - npm run lint   │                                           │
│  │ - npm run type   │                                           │
│  │ - npm run build  │                                           │
│  │ - npm run test   │                                           │
│  └────────┬─────────┘                                           │
│           │                                                      │
│  ┌────────▼─────────┐                                           │
│  │ Build Images     │ ←── Push events only                      │
│  │ - WIF Auth       │                                           │
│  │ - Docker build   │                                           │
│  │ - Push to AR     │                                           │
│  └────────┬─────────┘                                           │
│           │                                                      │
│   ┌───────┴───────┐                                             │
│   │               │                                              │
│   ▼               ▼                                              │
│ ┌────────┐    ┌────────┐                                        │
│ │Dev     │    │Prod    │                                        │
│ │develop │    │main    │                                        │
│ │branch  │    │branch  │                                        │
│ │        │    │        │                                        │
│ │tofu    │    │tofu    │                                        │
│ └────────┘    └────────┘                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Workload Identity Federation (WIF)

Authentication uses WIF - no service account keys in GitHub secrets.

```yaml
# Required GitHub Variables (repo settings)
vars.GCP_PROJECT_ID: git-with-intent-prod
vars.WIF_PROVIDER: projects/123456/locations/global/workloadIdentityPools/github-pool/providers/github
vars.WIF_SERVICE_ACCOUNT: github-actions@git-with-intent-prod.iam.gserviceaccount.com
vars.TF_STATE_BUCKET: git-with-intent-tofu-state
```

### 5.3 Agent Readiness Verification (ARV)

ARV gates run as part of quality checks:

```bash
# ARV scripts in scripts/arv/
identity-gate.ts       # SSO/SCIM/RBAC checks
security-gate.ts       # Security policy checks
observability-gate.ts  # Logging/metrics checks
forensics-gate.ts      # Audit trail checks
metering-gate.ts       # Billing/usage checks
marketplace-gate.ts    # Connector registry checks
reliability-gate.ts    # Error handling checks
openapi-gate.ts        # API spec validation
run-all.ts             # Execute all gates

# Run manually:
npx tsx scripts/arv/run-all.ts
```

---

## 6. Deployment Procedures

### 6.1 Standard Deployment (Automated)

```bash
# Development (automatic on develop branch push)
git checkout develop
git merge feature/my-feature
git push origin develop
# → CI builds → Deploys to dev environment

# Production (automatic on main branch push)
git checkout main
git merge develop
git push origin main
# → CI builds → Deploys to prod environment
```

### 6.2 Manual OpenTofu Operations

```bash
cd infra

# Initialize with state bucket
tofu init -backend-config="bucket=git-with-intent-tofu-state"

# Plan changes for specific environment
tofu plan -var-file="envs/prod.tfvars"

# Apply changes
tofu apply -var-file="envs/prod.tfvars"

# View current state
tofu state list

# Import existing resource
tofu import google_cloud_run_v2_service.gwi_api projects/git-with-intent-prod/locations/us-central1/services/gwi-api-prod
```

### 6.3 Rollback Procedure

```bash
# Option 1: Revert to previous image tag
cd infra
tofu apply -var-file="envs/prod.tfvars" \
  -var="gwi_api_image=us-central1-docker.pkg.dev/git-with-intent-prod/gwi/api:previous-sha"

# Option 2: Git revert and re-deploy
git revert HEAD
git push origin main
# CI will rebuild and deploy

# Option 3: Direct Cloud Run rollback (emergency)
gcloud run services update-traffic gwi-api-prod \
  --region=us-central1 \
  --to-revisions=gwi-api-prod-00001-abc=100
```

---

## 7. Monitoring & Alerting

### 7.1 Alert Policies

From `infra/monitoring.tf`:

| Alert | Threshold | Severity |
|-------|-----------|----------|
| API High Error Rate | 5xx > 5% for 60s | Critical |
| API High Latency | P95 > 5000ms for 5m | Warning |
| API Unavailable | No requests for 5m | Critical |
| Gateway Error Rate | 5xx > 5% for 60s | Critical |
| Webhook Error Rate | 5xx > 5% for 60s | Critical |

### 7.2 Key Metrics

```bash
# Cloud Run metrics
run.googleapis.com/request_count
run.googleapis.com/request_latencies
run.googleapis.com/container/cpu/utilization
run.googleapis.com/container/memory/utilization

# Custom metrics (future)
gwi/runs/total
gwi/runs/success_rate
gwi/agent/execution_time
```

### 7.3 Log Queries

```bash
# View Cloud Run logs
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="gwi-api-prod"' \
  --limit=100 --format=json

# Filter by severity
gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR' \
  --limit=50

# Search for specific run
gcloud logging read 'jsonPayload.runId="run-abc123"' \
  --limit=100
```

---

## 8. Security Model

### 8.1 RBAC Roles

From `firestore.rules`:

| Role | Permissions |
|------|-------------|
| **OWNER** | Full access, can delete tenant |
| **ADMIN** | Manage members, settings, repos |
| **DEVELOPER** | Trigger runs, cancel runs |
| **VIEWER** | Read-only access to runs |

### 8.2 Authentication Flow

```
User → Firebase Auth → ID Token → Firestore Rules (RBAC check) → Data
                                          ↓
Service Account → Custom Token → isServiceAccount() check → Full access
```

### 8.3 Secrets Management

```bash
# Secrets stored in Secret Manager
gwi-github-webhook-secret      # GitHub webhook validation
gwi-stripe-secret-key          # Stripe API key
gwi-stripe-webhook-secret      # Stripe webhook validation
gwi-anthropic-api-key          # Anthropic API key

# Access in Cloud Run via environment variables
# Configured in OpenTofu with secret version references
```

### 8.4 Enterprise Identity (Phase 31)

```
OIDC SSO:     User → IdP → OIDC Flow (PKCE) → ID Token → Role Mapping → GWI Session
SAML SSO:     User → IdP → SAML Assertion → Signature Verify → Role Mapping → GWI Session
SCIM:         IdP → SCIM 2.0 API → User/Group Sync → Auto-provisioning
```

### 8.5 Rate Limiting (Phase 30/30.1)

Rate limiting is implemented via `@gwi/core/ratelimit` with a fallback chain:

```
Redis (distributed) → Firestore (serverless) → In-Memory (single instance)
```

**Where rate limiting is applied:**

| Service | Middleware | Scopes |
|---------|------------|--------|
| `apps/api` | Global middleware on ALL routes | `api:read` (300/min), `api:write` (60/min) |
| `apps/api` | Expensive endpoints | `run:create` (10/min), `auth:login` (10/15min), `invite:send` (20/hr) |
| `apps/gateway` | Marketplace routes | `marketplace:search` (100/15min), `marketplace:publish` (10/15min) |
| `apps/github-webhook` | **Not applied** | Relies on GitHub's webhook throttling |

**Key files:**
- `packages/core/src/ratelimit/index.ts` - Rate limiter + Express middleware
- `packages/core/src/ratelimit/redis-store.ts` - Redis store + factory with fallback
- `packages/core/src/ratelimit/firestore-store.ts` - Firestore store (Phase 30.1)

**Metrics exposed at:** `GET /v1/ops/metrics` (when `GWI_METRICS_ENABLED=true`)
```
gwi_ratelimit_allowed_total{scope="marketplace:search"} 123
gwi_ratelimit_rejected_total{scope="marketplace:publish"} 5
```

---

## 9. Troubleshooting Guide

### 9.1 Common Issues

#### Build Failures

```bash
# Clean and rebuild
npm run clean
npm install
npm run build

# Check for circular dependencies
npx madge --circular packages/*/src

# TypeScript errors
npm run typecheck -- --pretty
```

#### Storage Connection Issues

```bash
# Check backend setting
echo $GWI_STORE_BACKEND

# Test Firestore connectivity
gcloud firestore databases list --project=git-with-intent-prod

# Verify service account permissions
gcloud projects get-iam-policy git-with-intent-prod \
  --filter="bindings.members:serviceAccount:*" \
  --format="table(bindings.role,bindings.members)"
```

#### Agent Execution Failures

```bash
# Check agent initialization
GWI_DEBUG=true node apps/cli/dist/index.js triage https://github.com/org/repo/pull/1

# Verify API keys
echo "Anthropic: ${ANTHROPIC_API_KEY:0:10}..."
echo "Google: ${GOOGLE_AI_API_KEY:0:10}..."

# Test model access
curl -H "Authorization: Bearer $GOOGLE_AI_API_KEY" \
  "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent"
```

### 9.2 Health Checks

```bash
# Cloud Run service health
gcloud run services describe gwi-api-prod --region=us-central1 --format='value(status.url)'
curl -s $(gcloud run services describe gwi-api-prod --region=us-central1 --format='value(status.url)')/health

# Firestore health (via API)
curl -s "$API_URL/health/firestore"

# Agent health (via A2A)
curl -s "$GATEWAY_URL/.well-known/agent.json"
```

---

## 10. Runbooks

### 10.1 Deploy New Version

```bash
# 1. Create release branch
git checkout -b release/v0.3.0 develop

# 2. Update version
npm version minor --no-git-tag-version --workspaces

# 3. Run full test suite
npm run build
npm run test
npm run typecheck
npx tsx scripts/arv/run-all.ts

# 4. Merge to main
git checkout main
git merge release/v0.3.0
git push origin main

# 5. Monitor deployment
# Watch GitHub Actions: https://github.com/intent-solutions/git-with-intent/actions
# Check Cloud Run: gcloud run services list --region=us-central1
```

### 10.2 Add New Agent

```bash
# 1. Create agent implementation
mkdir packages/agents/src/new-agent
# Implement: index.ts, types.ts, prompts.ts

# 2. Export from package
# Edit packages/agents/src/index.ts

# 3. Register in orchestrator
# Edit packages/agents/src/orchestrator/index.ts

# 4. Add ARV gate
# Create scripts/arv/new-agent-gate.ts

# 5. Add OpenTofu config for Vertex AI deployment
# Edit infra/agent_engine.tf

# 6. Test locally
npm run build
npm run test
```

### 10.3 Rotate Secrets

```bash
# 1. Generate new secret
NEW_SECRET=$(openssl rand -base64 32)

# 2. Create new secret version
echo -n "$NEW_SECRET" | gcloud secrets versions add gwi-github-webhook-secret --data-file=-

# 3. Update GitHub App webhook secret in GitHub settings

# 4. Redeploy services (to pick up new version)
cd infra
tofu apply -var-file="envs/prod.tfvars" -target=google_cloud_run_v2_service.gwi_github_webhook

# 5. Verify webhook still works
# Check GitHub App → Advanced → Recent Deliveries

# 6. Disable old secret version
gcloud secrets versions disable 1 --secret=gwi-github-webhook-secret
```

### 10.4 Scale for High Load

```bash
# Increase max instances via OpenTofu
cd infra

# Edit envs/prod.tfvars
# gateway_max_instances = 50
# gwi_api_max_instances = 30

tofu apply -var-file="envs/prod.tfvars"

# Or emergency scale via gcloud
gcloud run services update gwi-api-prod \
  --region=us-central1 \
  --max-instances=50
```

---

## 11. Known Gaps & Roadmap

### 11.1 Current Gaps (HIGH Priority)

| Gap | Impact | Mitigation |
|-----|--------|------------|
| **Rate limiting partial coverage** | Partial API abuse risk | Rate limiting implemented for API (global + expensive ops) and Gateway (marketplace search/publish) via Redis → Firestore → In-memory fallback chain. **Not applied to:** github-webhook (relies on GitHub's throttling). Extend middleware coverage + add ARV gate asserting rate-limit middleware on required route groups |
| **Orchestrator state in-memory** | Runs lost on Cloud Run restart | Persist to Firestore |
| **Test coverage ~30%** | Regression risk | Target 70% by v1.0 |
| **CLI commands incomplete** | Some commands show migration messages | Complete refactor |

### 11.2 Medium Priority Gaps

| Gap | Impact | Status |
|-----|--------|--------|
| No WebSocket for real-time updates | Polling required | Planned Phase 33 |
| Single-region deployment | No DR | Multi-region Phase 35 |
| No automated backup | Data loss risk | Firestore exports Phase 34 |

### 11.3 Roadmap (Next Phases)

- **Phase 32**: Rate Limiting Coverage Extension (github-webhook) + ARV Gate
- **Phase 33**: Real-time Updates (WebSockets)
- **Phase 34**: Backup & Disaster Recovery
- **Phase 35**: Multi-region Deployment
- **Phase 36**: Advanced Analytics Dashboard

---

## Appendix A: Quick Reference

### A.1 Key URLs

| Resource | URL |
|----------|-----|
| GitHub Repo | `https://github.com/intent-solutions/git-with-intent` |
| GCP Console (Prod) | `https://console.cloud.google.com/run?project=git-with-intent-prod` |
| Firestore Console | `https://console.cloud.google.com/firestore/data?project=git-with-intent-prod` |
| Cloud Logging | `https://console.cloud.google.com/logs/query?project=git-with-intent-prod` |

### A.2 Key Commands

```bash
# Build & Test
npm run build                # Build all
npm run test                 # Run tests
npm run typecheck            # Type check
npm run lint                 # Lint

# ARV Gates
npx tsx scripts/arv/run-all.ts

# OpenTofu
tofu init -backend-config="bucket=git-with-intent-tofu-state"
tofu plan -var-file="envs/prod.tfvars"
tofu apply -var-file="envs/prod.tfvars"

# Cloud Run
gcloud run services list --region=us-central1
gcloud run services logs read gwi-api-prod --region=us-central1 --limit=100

# Firestore
gcloud firestore databases list
```

### A.3 Emergency Contacts

| Role | Contact |
|------|---------|
| Platform Lead | [Configure in prod.tfvars] |
| On-Call | [Configure alert channels in OpenTofu] |

---

## Document Metadata

**Filed Under:** `000-docs/109-AA-AUDT-appaudit-devops-playbook.md`
**Next Document Number:** 110
**Related Documents:**
- `000-docs/032-AA-AUDT-appaudit-devops-playbook.md` (previous audit)
- `000-docs/107-DR-ADRC-phase-31-enterprise-sso-scim.md` (latest ADR)
- `CLAUDE.md` (AI assistant contract)

---

*This playbook is the authoritative operational reference for Git With Intent. Update this document as the system evolves.*
