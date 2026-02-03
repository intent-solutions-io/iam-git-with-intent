# Git With Intent - Comprehensive DevOps Playbook

**Document ID**: 111-AA-AUDT
**Version**: 1.0.0
**Last Updated**: 2026-02-02
**Author**: System Analysis
**Status**: ACTIVE

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Infrastructure as Code](#3-infrastructure-as-code)
4. [CI/CD Workflows](#4-cicd-workflows)
5. [Service Catalog](#5-service-catalog)
6. [Security Controls](#6-security-controls)
7. [Monitoring and Alerting](#7-monitoring-and-alerting)
8. [Deployment Operations](#8-deployment-operations)
9. [Cost Estimates](#9-cost-estimates)
10. [Operational Commands](#10-operational-commands)
11. [Current State Assessment](#11-current-state-assessment)
12. [Recommendations Roadmap](#12-recommendations-roadmap)

---

## 1. Executive Summary

**Git With Intent (GWI)** is an AI-powered CLI and platform for PR automation, featuring semantic merge conflict resolution, issue-to-code generation, complexity scoring, and full autopilot with approval gating.

| Attribute | Value |
|-----------|-------|
| **Version** | 0.6.0 |
| **Repository** | intent-solutions-io/git-with-intent |
| **Primary Cloud** | Google Cloud Platform (GCP) |
| **IaC Tool** | OpenTofu 1.8.7 |
| **CI/CD** | GitHub Actions with Workload Identity Federation |
| **Runtime** | Node.js 20+ |
| **Build System** | Turbo monorepo (npm workspaces) |

### Key Capabilities

- **PR Automation**: Triage, resolve conflicts, review, autopilot
- **Local Development**: Pre-commit review, approval gates, git hooks
- **Multi-Agent Architecture**: Gemini Flash (fast), Claude Sonnet/Opus (complex tasks)
- **Approval Gating**: SHA256 hash-bound approval for destructive operations
- **Full Audit Trail**: Every AI decision logged and explainable

### Architecture Philosophy

- **CLI-first**: Works in terminal, not another web app
- **Approval-gated**: AI cannot push without explicit user consent
- **Multi-model routing**: Simple tasks use cheap models, complex use powerful ones
- **OpenTofu is source of truth**: Never deploy directly with gcloud

---

## 2. Architecture Overview

### System Components

```
                                  +------------------+
                                  |   GitHub/GitLab  |
                                  |    (External)    |
                                  +--------+---------+
                                           |
                    +----------------------+----------------------+
                    |                      |                      |
           +--------v--------+    +--------v--------+    +--------v--------+
           |  GitHub Webhook |    |   A2A Gateway   |    |     GWI CLI     |
           |   (Cloud Run)   |    |   (Cloud Run)   |    |   (Local/CI)    |
           +--------+--------+    +--------+--------+    +--------+--------+
                    |                      |                      |
                    +----------+-----------+                      |
                               |                                  |
                    +----------v-----------+                      |
                    |       GWI API        |<---------------------+
                    |     (Cloud Run)      |
                    +----------+-----------+
                               |
              +----------------+----------------+
              |                |                |
     +--------v--------+ +-----v-----+ +--------v--------+
     |     Worker      | | Firestore | |   Pub/Sub       |
     |   (Cloud Run)   | |  (Data)   | |  (Queue/DLQ)    |
     +--------+--------+ +-----------+ +-----------------+
              |
     +--------v--------+
     |  AI Providers   |
     | Claude/Gemini   |
     +-----------------+
```

### Service Summary

| Service | Type | Purpose | Exposure |
|---------|------|---------|----------|
| `gwi-api` | Cloud Run | REST API for runs, tenants, billing | Internet (auth required) |
| `gwi-a2a-gateway` | Cloud Run | Agent-to-Agent protocol coordination | Internet (IAM) |
| `gwi-github-webhook` | Cloud Run | GitHub webhook processing | Internet (HMAC validated) |
| `gwi-worker` | Cloud Run | Background jobs, autopilot execution | Internal (Pub/Sub push) |
| `gwi-webhook-receiver` | Cloud Run | Multi-source webhook receiver | Internet (HMAC validated) |
| Web Dashboard | Firebase Hosting | React SPA for dashboard | Internet (Firebase Auth) |

### Agent Architecture

| Agent | AI Model | Purpose |
|-------|----------|---------|
| Orchestrator | Gemini Flash | Workflow coordination |
| Triage | Gemini Flash | Fast complexity scoring (1-10) |
| Coder | Claude Sonnet | Code generation |
| Resolver | Claude Sonnet/Opus | Conflict resolution (complexity-based routing) |
| Reviewer | Claude Sonnet | Review summaries |

### Package Dependencies

```
@gwi/cli
    ├── @gwi/agents
    ├── @gwi/engine
    ├── @gwi/integrations
    └── @gwi/core

@gwi/agents → @gwi/core
@gwi/engine → @gwi/agents, @gwi/core
@gwi/integrations → @gwi/core
@gwi/connectors → @gwi/core
@gwi/forecasting → @gwi/core
@gwi/sdk → @gwi/core

apps/* → @gwi/core
```

### Data Flow

```
1. User/GitHub Event
       ↓
2. Webhook/CLI → API
       ↓
3. API creates Run → Firestore
       ↓
4. Pub/Sub message to Worker
       ↓
5. Worker orchestrates Agents
       ↓
6. Agents call AI (Claude/Gemini)
       ↓
7. Results stored → Artifacts bucket
       ↓
8. Approval gate (if destructive)
       ↓
9. Execute action (commit/push/merge)
```

---

## 3. Infrastructure as Code

### OpenTofu Structure

```
infra/
├── main.tf                 # Project services, locals
├── variables.tf            # All variable definitions
├── provider.tf             # GCP provider configuration
├── versions.tf             # Terraform/OpenTofu versions
├── outputs.tf              # Output values
├── iam.tf                  # Service accounts, WIF, IAM bindings
├── cloud_run.tf            # Cloud Run services (API, Gateway, Webhook, Worker)
├── pubsub.tf               # Pub/Sub topics, subscriptions, DLQ
├── storage.tf              # GCS buckets (artifacts, staging, docs)
├── monitoring.tf           # Alerts, uptime checks, dashboards
├── service_topology.tf     # Service topology configuration
├── service_auth.tf         # Service-to-service auth
├── scheduler.tf            # Cloud Scheduler jobs
├── network.tf              # VPC, connectors
├── agent_engine.tf         # Vertex AI Agent Engine
├── artifact_registry.tf    # Docker registry
├── webhook_receiver.tf     # Multi-source webhook receiver
└── envs/
    ├── dev.tfvars          # Development environment
    ├── staging.tfvars      # Staging environment
    ├── prod.tfvars         # Production environment
    └── local.tfvars        # Local development
```

### Key Resources

| Resource Type | Count | Purpose |
|---------------|-------|---------|
| Cloud Run Services | 5 | API, Gateway, Webhook, Worker, Webhook Receiver |
| Service Accounts | 6 | Per-service least privilege |
| Pub/Sub Topics | 4 | Worker jobs, DLQ, Run lifecycle |
| GCS Buckets | 3 | Run artifacts, ADK staging, ADK docs |
| Alert Policies | 12+ | Error rate, latency, uptime, queue depth |
| Uptime Checks | 4 | Health endpoints for all services |
| Log-based Metrics | 6+ | Critical errors, auth failures, AI errors |

### Environment Variables

**Required for all environments:**

```bash
# GCP
GCP_PROJECT_ID=git-with-intent
REGION=us-central1

# AI Providers (at least one)
ANTHROPIC_API_KEY="..."
GOOGLE_AI_API_KEY="..."

# GitHub
GITHUB_TOKEN="..."
```

**Production-specific:**

```bash
GWI_STORE_BACKEND=firestore
DEPLOYMENT_ENV=prod
```

### State Management

```bash
# Backend configuration (in provider.tf)
backend "gcs" {
  bucket = "git-with-intent-tfstate"
  prefix = "terraform/state"
}
```

### Common Operations

```bash
# Initialize
cd infra && tofu init

# Plan for specific environment
tofu plan -var-file="envs/prod.tfvars"

# Apply with approval
tofu apply -var-file="envs/prod.tfvars"

# Drift detection
tofu plan -var-file="envs/prod.tfvars" -detailed-exitcode

# Import existing resource
tofu import -var-file="envs/prod.tfvars" \
  google_cloud_run_service.gwi_api \
  projects/git-with-intent/locations/us-central1/services/git-with-intent-api-prod
```

---

## 4. CI/CD Workflows

### Workflow Overview

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push/PR to main, develop | Build, test, deploy |
| `deploy.yml` | Push to main/develop, tags, manual | Full deployment |
| `tofu-plan.yml` | PR with infra changes | Plan preview in PR |
| `tofu-apply.yml` | Push to main with infra changes | Apply infrastructure |
| `arv.yml` | PR | Agent Readiness Verification |
| `release.yml` | Version tags | Release process |
| `drift-detection.yml` | Scheduled | Detect infra drift |

### CI Pipeline (ci.yml)

```
quality-checks ──► build ──► build-images ──► deploy-dev (develop)
                                         └──► deploy-prod (main)
```

**Quality Checks:**
- Secret/credential scanning
- Architecture drift detection
- ARV gate verification

**Build Phase:**
- npm ci
- npm run lint
- npm run build
- npm run typecheck
- npm run test

**Image Build (push events only):**
- Docker build for each service
- Push to Artifact Registry
- Tag with commit SHA and :latest

### Deploy Pipeline (deploy.yml)

```
setup ──► build-images ──► deploy ──► deploy-hosting ──► notify
                              │
                              ├── OpenTofu init
                              ├── OpenTofu plan
                              ├── OpenTofu apply
                              └── Health checks
```

### OpenTofu Plan/Apply Workflows

**tofu-plan.yml (PRs):**
- Plans for dev, staging, prod
- Posts plan summary as PR comment
- Uploads plan artifacts

**tofu-apply.yml (main):**
- Applies to production
- Requires environment approval
- Uploads outputs as artifacts

### Authentication

All workflows use **Workload Identity Federation (WIF)**:

```yaml
- name: Authenticate to GCP (WIF)
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: ${{ vars.WIF_PROVIDER }}
    service_account: ${{ vars.WIF_SERVICE_ACCOUNT }}
```

**No long-lived service account keys in CI.**

### Required GitHub Secrets/Variables

| Name | Type | Purpose |
|------|------|---------|
| `GCP_PROJECT_ID` | Variable | GCP project ID |
| `WIF_PROVIDER` | Variable | WIF provider ID |
| `WIF_SERVICE_ACCOUNT` | Variable | CI service account email |
| `PROD_API_URL` | Variable | Production API URL |
| `STAGING_API_URL` | Variable | Staging API URL |

---

## 5. Service Catalog

### Cloud Run Services

#### GWI API (`gwi-api`)

| Attribute | Dev | Staging | Production |
|-----------|-----|---------|------------|
| CPU | 1000m | 1000m | 1000m |
| Memory | 512Mi | 512Mi | 512Mi |
| Concurrency | 100 | 100 | 100 |
| Timeout | 60s | 60s | 60s |
| Min Instances | 0 | 0 | 1 |
| Max Instances | 10 | 10 | 20 |

**Endpoints:**
- `GET /health` - Liveness check
- `GET /health/ready` - Readiness check
- `GET /health/deep` - Full dependency check
- `POST /api/v1/runs` - Create run
- `GET /api/v1/runs/:id` - Get run status

#### A2A Gateway (`gwi-a2a-gateway`)

| Attribute | Dev | Staging | Production |
|-----------|-----|---------|------------|
| CPU | 1000m | 1000m | 1000m |
| Memory | 512Mi | 512Mi | 512Mi |
| Concurrency | 80 | 80 | 80 |
| Timeout | 300s | 300s | 300s |
| Min Instances | 0 | 0 | 1 |
| Max Instances | 10 | 10 | 20 |

**Purpose:** Agent-to-Agent protocol coordination, routes messages between agents.

#### GitHub Webhook (`gwi-github-webhook`)

| Attribute | Dev | Staging | Production |
|-----------|-----|---------|------------|
| CPU | 1000m | 1000m | 1000m |
| Memory | 512Mi | 512Mi | 512Mi |
| Concurrency | 80 | 80 | 80 |
| Timeout | 300s | 300s | 300s |
| Min Instances | 0 | 0 | 1 |
| Max Instances | 10 | 10 | 20 |

**Security:** HMAC-SHA256 signature validation, replay protection via X-GitHub-Delivery.

#### Worker (`gwi-worker`)

| Attribute | Dev | Staging | Production |
|-----------|-----|---------|------------|
| CPU | 2000m | 2000m | 2000m |
| Memory | 1Gi | 1Gi | 1Gi |
| Concurrency | 1 | 1 | 1 |
| Timeout | 600s | 600s | 600s |
| Min Instances | 0 | 0 | 1 |
| Max Instances | 10 | 10 | 20 |
| CPU Throttling | false | false | false |

**Purpose:** Background job processing, autopilot execution, AI agent orchestration.

### Packages

| Package | Version | Purpose |
|---------|---------|---------|
| `@gwi/core` | 0.1.0 | Storage, billing, security interfaces |
| `@gwi/agents` | 0.1.0 | AI agent implementations |
| `@gwi/engine` | 0.1.0 | Workflow orchestration with hooks |
| `@gwi/integrations` | 0.1.0 | GitHub/GitLab connectors |
| `@gwi/connectors` | 0.1.0 | Airbyte-style data connectors |
| `@gwi/forecasting` | 0.1.0 | TimeGPT integration |
| `@gwi/sdk` | 0.1.0 | TypeScript SDK |

### Storage Backends

| Backend | Usage | Configuration |
|---------|-------|---------------|
| Firestore | Production | `GWI_STORE_BACKEND=firestore` |
| SQLite | Local dev with analytics | `GWI_STORE_BACKEND=sqlite` |
| In-Memory | Fast unit tests | Default for tests |

### Pub/Sub Topics

| Topic | Purpose | Retention |
|-------|---------|-----------|
| `gwi-worker-jobs-{env}` | Worker job queue | 7 days |
| `gwi-worker-jobs-dlq-{env}` | Dead letter queue | 14 days |
| `gwi-run-lifecycle-{env}` | Run lifecycle events | 7 days |
| `gwi-run-lifecycle-dlq-{env}` | Lifecycle DLQ | 14 days |

**Retry Policy:**
- Minimum backoff: 10s
- Maximum backoff: 600s (10 min)
- Max delivery attempts: 5

### GCS Buckets

| Bucket | Purpose | Lifecycle |
|--------|---------|-----------|
| `{project}-run-artifacts` | Run outputs, audit logs | 90 days (artifacts), 365 days (audit) |
| `{project}-adk-staging` | ADK deployment artifacts | 30 days |
| `{project}-adk-docs` | Documentation for Vertex Search | Permanent |

---

## 6. Security Controls

### Authentication & Authorization

| Layer | Mechanism | Details |
|-------|-----------|---------|
| Web UI | Firebase Auth | Email/password, Google OAuth, GitHub OAuth |
| API | JWT tokens | 1-hour expiry, refresh token rotation |
| Service-to-Service | IAM | Cloud Run invoker roles |
| Webhooks | HMAC-SHA256 | Timing-safe comparison |
| CLI | Personal tokens | GitHub token + optional API key |

### Service Accounts

| Account | Purpose | Roles |
|---------|---------|-------|
| `gwi-agent-{env}` | Agent Engine | aiplatform.user, ml.developer, logging.logWriter, cloudtrace.agent |
| `gwi-a2a-{env}` | A2A Gateway | aiplatform.user, logging.logWriter |
| `gwi-github-{env}` | GitHub Webhook | aiplatform.user, logging.logWriter |
| `gwi-api-{env}` | API Service | datastore.user |
| `gwi-worker-{env}` | Worker Service | datastore.user, pubsub.subscriber, pubsub.publisher |
| `gwi-ci` | GitHub Actions | run.admin, aiplatform.admin, storage.admin, artifactregistry.admin |

### Secrets Management

| Secret | Services | Rotation |
|--------|----------|----------|
| `gwi-github-app-private-key` | gateway, webhook, worker, agent_engine | 90 days |
| `gwi-github-webhook-secret` | webhook | 90 days |
| `gwi-anthropic-api-key` | worker, agent_engine | On compromise |
| `gwi-google-ai-api-key` | worker, agent_engine | On compromise |
| `gwi-stripe-secret-key` | api | 90 days |
| `gwi-stripe-webhook-secret` | api | 90 days |

### Threat Model Summary (STRIDE)

| Category | Risk Level | Status |
|----------|------------|--------|
| Spoofing | Medium | Mitigated via Firebase Auth, HMAC |
| Tampering | Medium | Mitigated via hash-bound approvals |
| Repudiation | Low | Mitigated via immutable audit logs |
| Information Disclosure | Medium | Mitigated via encryption, tenant isolation |
| Denial of Service | Medium | Mitigated via rate limiting, Cloud Armor |
| Elevation of Privilege | Low | Mitigated via RBAC, least privilege |

### Approval Gating

Destructive operations require explicit approval:

| Operation | Approval Required |
|-----------|-------------------|
| Read/analyze | No |
| Generate patch | No |
| Post comments | No |
| **Commit changes** | Yes (SHA256-bound) |
| **Push to remote** | Yes (SHA256-bound) |
| **Merge PR** | Yes (SHA256-bound) |

---

## 7. Monitoring and Alerting

### Alert Policies

| Alert | Threshold | Duration | Severity |
|-------|-----------|----------|----------|
| API High Error Rate | >5% 5xx | 60s | Critical |
| Gateway High Error Rate | >5% 5xx | 60s | Critical |
| Webhook High Error Rate | >5% 5xx | 60s | Critical |
| API High Latency | P95 >5000ms | 300s | Warning |
| API Service Unavailable | No requests | 300s | Critical |
| Gateway Uptime Failure | <99% success | 300s | Critical |
| API Uptime Failure | <99% success | 300s | Critical |
| Queue Depth Warning | >100 messages | 300s | Warning |
| Queue Depth Critical | >500 messages | 300s | Critical |
| Queue Age Warning | >10 min oldest | 60s | Warning |
| High Duplicate Rate | >50% | 300s | Warning |

### Uptime Checks

| Service | Endpoint | Period | Timeout |
|---------|----------|--------|---------|
| Gateway | `/health` | 5 min | 10s |
| Webhook | `/health` | 5 min | 10s |
| API | `/health` | 5 min | 10s |
| Worker | `/health` | 5 min | 10s |

### Log-Based Metrics

| Metric | Filter | Purpose |
|--------|--------|---------|
| `gwi-critical-errors-{env}` | `severity >= ERROR` | Track error rate |
| `gwi-auth-failures-{env}` | Auth failure patterns | Security monitoring |
| `gwi-ai-errors-{env}` | AI API errors | AI provider health |
| `gwi-idempotency-duplicates-{env}` | Duplicate detection | Retry pattern analysis |
| `gwi-idempotency-checks-{env}` | Key lookups | System health |
| `gwi-idempotency-cleanup-{env}` | TTL cleanup | Maintenance tracking |

### Dashboards

| Dashboard | Purpose |
|-----------|---------|
| GWI Idempotency Dashboard | Duplicate detection, key management |
| Cloud Run Metrics | Service-level metrics (built-in) |
| Pub/Sub Metrics | Queue depth, latency (built-in) |

### Budget Alerts

| Threshold | Percentage | Action |
|-----------|------------|--------|
| $50/month | 50% | Warning email |
| $80/month | 80% | Elevated warning |
| $100/month | 100% | Budget exceeded |
| $120/month | 120% | Overspend - urgent |

### Notification Channels

Configure via Terraform:

```hcl
variable "alert_email" {
  description = "Email address for alert notifications"
  type        = string
}

variable "alert_notification_channels" {
  description = "Additional notification channel IDs (PagerDuty, Slack)"
  type        = list(string)
  default     = []
}
```

---

## 8. Deployment Operations

### Local Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm run test

# Type check
npm run typecheck

# Run ARV (Agent Readiness Verification)
npm run arv

# Run CLI locally
node apps/cli/dist/index.js --help
```

### Staging Deployment

```bash
# Automatic on push to develop branch
git push origin develop

# Or manual trigger
gh workflow run deploy.yml -f environment=staging
```

### Production Deployment

```bash
# Automatic on push to main branch
git push origin main

# Or via version tag
git tag -a v0.6.0 -m "Release v0.6.0"
git push origin v0.6.0
```

### Manual Infrastructure Updates

```bash
# NEVER run from local machine without CI approval
# Use only for emergency fixes

cd infra

# Initialize
tofu init

# Plan and review
tofu plan -var-file="envs/prod.tfvars" -out=tfplan

# Apply (requires approval)
tofu apply tfplan

# Check drift
tofu plan -var-file="envs/prod.tfvars" -detailed-exitcode
```

### Rollback Procedure

```bash
# 1. Identify previous version
git tag --list 'v*' --sort=-v:refname | head -5

# 2. Trigger deployment with specific version
gh workflow run deploy.yml -f version=v0.5.1 -f environment=production

# 3. Or revert commit and push
git revert HEAD
git push origin main
```

### Health Verification

```bash
# Check all service health
curl -sf https://api.gwi.dev/health | jq .
curl -sf https://gateway.gwi.dev/health | jq .
curl -sf https://webhook.gwi.dev/health | jq .

# Check version
curl -s https://api.gwi.dev/health | jq '.version'

# Run smoke tests
npm run smoke:staging
npm run smoke:production
```

---

## 9. Cost Estimates

### Cloud Run Pricing (us-central1)

- **vCPU**: $0.00002400/vCPU-second
- **Memory**: $0.00000250/GiB-second
- **Requests**: $0.40/million
- **Free tier**: 180,000 vCPU-seconds, 360,000 GiB-seconds/month

### Monthly Cost Estimates

#### Development Environment (min_instances=0)

| Component | Est. Monthly Cost |
|-----------|------------------|
| Cloud Run (pay per use) | $5-15 |
| Firestore | $0-5 |
| Pub/Sub | $0-2 |
| Storage | $1-2 |
| **Total** | **$10-25** |

#### Staging Environment (min_instances=0)

| Component | Est. Monthly Cost |
|-----------|------------------|
| Cloud Run (pay per use) | $15-30 |
| Firestore | $5-10 |
| Pub/Sub | $2-5 |
| Storage | $2-5 |
| **Total** | **$25-50** |

#### Production Environment (min_instances=1)

| Component | Est. Monthly Cost |
|-----------|------------------|
| API (1x always-on) | ~$20 |
| Gateway (1x always-on) | ~$20 |
| Webhook (1x always-on) | ~$20 |
| Worker (1x always-on, 2 vCPU) | ~$40 |
| Firestore | $10-20 |
| Pub/Sub | $5-10 |
| Storage | $5-10 |
| Monitoring/Logging | $5-10 |
| **Baseline Total** | **$100-150** |
| **With usage spikes** | **$150-300** |

#### Optional Components

| Component | Est. Monthly Cost |
|-----------|------------------|
| VPC Connector | $15-25 |
| Cloud Armor | $5-10 |
| Additional regions | 2x baseline |

### AI API Costs (External)

| Provider | Model | Cost |
|----------|-------|------|
| Anthropic | Claude Sonnet | ~$3/M input, $15/M output |
| Anthropic | Claude Opus | ~$15/M input, $75/M output |
| Google | Gemini Flash | ~$0.075/M input, $0.30/M output |

**Note**: AI costs depend heavily on usage patterns and complexity routing.

---

## 10. Operational Commands

### Service Management

```bash
# List Cloud Run services
gcloud run services list --project=git-with-intent --region=us-central1

# Describe service
gcloud run services describe gwi-api-prod --project=git-with-intent --region=us-central1

# Get service URL
gcloud run services describe gwi-api-prod --region=us-central1 --format='value(status.url)'

# Update service (use sparingly - prefer CI/CD)
gcloud run services update gwi-api-prod --region=us-central1 --set-env-vars KEY=value

# View revisions
gcloud run revisions list --service=gwi-api-prod --region=us-central1
```

### Logging

```bash
# All Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision" \
  --project=git-with-intent --limit=100

# Filter by service
gcloud logging read "resource.labels.service_name=gwi-api-prod" \
  --project=git-with-intent --limit=50

# Filter by severity
gcloud logging read "severity>=ERROR" \
  --project=git-with-intent --limit=50

# Filter by trace ID
gcloud logging read "trace=\"projects/git-with-intent/traces/abc123\"" \
  --project=git-with-intent

# Filter by run ID
gcloud logging read "jsonPayload.runId=\"run-789\"" \
  --project=git-with-intent
```

### Pub/Sub Operations

```bash
# List topics
gcloud pubsub topics list --project=git-with-intent

# List subscriptions
gcloud pubsub subscriptions list --project=git-with-intent

# Check subscription stats
gcloud pubsub subscriptions describe gwi-worker-jobs-sub-prod \
  --project=git-with-intent

# Pull from DLQ (for debugging)
gcloud pubsub subscriptions pull gwi-worker-jobs-dlq-sub-prod \
  --project=git-with-intent --limit=10 --auto-ack

# Replay DLQ message
gcloud pubsub topics publish gwi-worker-jobs-prod \
  --message='{"jobId":"...","type":"..."}'
```

### Secrets Management

```bash
# List secrets
gcloud secrets list --project=git-with-intent

# Create secret
gcloud secrets create gwi-new-secret \
  --project=git-with-intent \
  --replication-policy="automatic"

# Add version
echo -n "secret-value" | gcloud secrets versions add gwi-new-secret \
  --project=git-with-intent --data-file=-

# Access secret
gcloud secrets versions access latest --secret=gwi-github-webhook-secret \
  --project=git-with-intent

# Rotate secret (add new, disable old)
gcloud secrets versions add gwi-github-webhook-secret --data-file=new-secret.txt
gcloud secrets versions disable OLD_VERSION --secret=gwi-github-webhook-secret
```

### Monitoring

```bash
# List alert policies
gcloud monitoring policies list --project=git-with-intent

# List uptime checks
gcloud monitoring uptime-check-configs list --project=git-with-intent

# List log-based metrics
gcloud logging metrics list --project=git-with-intent

# Open dashboards
open "https://console.cloud.google.com/monitoring/dashboards?project=git-with-intent"
```

### IAM

```bash
# List service accounts
gcloud iam service-accounts list --project=git-with-intent

# Get IAM policy for service account
gcloud iam service-accounts get-iam-policy \
  gwi-agent-prod@git-with-intent.iam.gserviceaccount.com

# Test IAM permissions
gcloud projects get-iam-policy git-with-intent \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:gwi-worker-prod@"
```

### Emergency Commands

```bash
# Disable service account (compromised)
gcloud iam service-accounts disable \
  compromised-sa@git-with-intent.iam.gserviceaccount.com

# Revoke secret access
gcloud secrets remove-iam-policy-binding gwi-github-webhook-secret \
  --project=git-with-intent \
  --member="serviceAccount:compromised-sa@git-with-intent.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Stop all traffic to service
gcloud run services update gwi-api-prod --region=us-central1 --no-traffic

# Scale to zero
gcloud run services update gwi-api-prod --region=us-central1 \
  --max-instances=0
```

---

## 11. Current State Assessment

### Strengths

| Area | Status | Notes |
|------|--------|-------|
| **Infrastructure as Code** | Strong | OpenTofu fully manages all GCP resources |
| **CI/CD** | Strong | WIF, multi-environment, automated deployments |
| **Security** | Strong | Least privilege, secret rotation, HMAC validation |
| **Monitoring** | Strong | Comprehensive alerts, uptime checks, dashboards |
| **Documentation** | Good | Runbooks, threat model, release process |
| **Testing** | Good | ARV gates, contracts, goldens, smoke tests |
| **Multi-tenant** | Good | Tenant isolation, RBAC framework |

### Gaps and Risks

| Gap | Severity | Impact | Recommendation |
|-----|----------|--------|----------------|
| **No disaster recovery runbook** | High | Extended downtime | Create DR runbook with RTO/RPO |
| **VPC connector disabled** | Medium | No private networking | Enable for production |
| **No SLO documentation** | Medium | Unclear targets | Define SLOs for each service |
| **Budget alerts not enabled** | Medium | Cost overruns | Enable `enable_budget_alerts=true` |
| **No chaos engineering** | Low | Unknown failure modes | Implement fault injection tests |
| **Manual agent deployment** | Low | Inconsistent deploys | Automate ADK deployments in CI |
| **No blue-green deployments** | Low | Risky releases | Configure traffic splitting |

### Technical Debt

| Item | Priority | Effort | Notes |
|------|----------|--------|-------|
| Enable VPC connector | High | 1 day | Security improvement |
| Add readiness vs liveness separation | Medium | 2 days | `/health/ready` vs `/health` |
| Implement circuit breakers | Medium | 3 days | For AI provider calls |
| Add request tracing UI | Low | 1 week | For debugging |
| Implement feature flags | Low | 1 week | For gradual rollouts |

### ARV Gate Status

All 19 ARV gates are implemented and running:

| Gate | Status |
|------|--------|
| Forbidden Patterns | Active |
| SDK Type Validation | Active |
| Contract Tests | Active |
| Golden Tests | Active |
| Smoke Tests | Active |
| Connector Supply Chain | Active |
| Reliability Gate | Active |
| Docs Gate | Active |
| Merge Resolver Gate | Active |
| Registry Integration Gate | Active |
| Metering Integration Gate | Active |
| Observability Gate | Active |
| Security Gate | Active |
| Approval Policy Gate | Active |
| Planner Gate | Active |
| Marketplace Gate | Active |
| OpenAPI Gate | Active |
| Identity Gate | Active |
| GA Readiness Gate | Active |

---

## 12. Recommendations Roadmap

### Immediate (This Week)

1. **Enable budget alerts**
   ```hcl
   enable_budget_alerts = true
   billing_account_id   = "XXXXXX-XXXXXX-XXXXXX"
   alert_email          = "ops@intentsolutions.io"
   ```

2. **Create disaster recovery runbook**
   - Document RTO (4 hours) and RPO (1 hour)
   - Define backup/restore procedures
   - Create incident response playbook

3. **Verify secret rotation schedule**
   - All secrets should rotate every 90 days
   - Set up Secret Manager rotation schedules

### Short-Term (1-2 Weeks)

4. **Enable VPC connector in production**
   ```hcl
   enable_vpc_connector = true
   vpc_egress_setting   = "private-ranges-only"
   ```

5. **Define and document SLOs**
   - API: 99.9% availability, P95 latency <200ms
   - Gateway: 99.9% availability, P95 latency <500ms
   - Worker: 99% job success rate

6. **Set up PagerDuty integration**
   - Critical alerts to on-call rotation
   - Escalation policies for P0/P1

### Medium-Term (1-2 Months)

7. **Implement blue-green deployments**
   - Use Cloud Run traffic splitting
   - Canary releases for major changes

8. **Add circuit breakers**
   - For AI provider calls (Anthropic, Google)
   - For GitHub API calls

9. **Implement feature flags**
   - For gradual feature rollouts
   - A/B testing capability

### Long-Term (Quarterly)

10. **Chaos engineering**
    - Fault injection tests
    - Simulate provider outages

11. **Multi-region deployment**
    - Active-passive or active-active
    - Cross-region failover

12. **SOC 2 Type II certification**
    - Complete compliance evidence
    - Third-party audit

---

## Appendix A: Quick Reference

### Key URLs

| Environment | Service | URL |
|-------------|---------|-----|
| Production | API | https://api.gwi.dev |
| Production | Gateway | https://gateway.gwi.dev |
| Production | Web | https://git-with-intent.web.app |
| Staging | API | https://api-staging.gwi.dev |
| Staging | Web | https://git-with-intent-staging.web.app |

### Key Commands Summary

```bash
# Build & Test
npm run build && npm run typecheck && npm run arv

# Deploy staging
git push origin develop

# Deploy production
git push origin main

# Check service health
curl -sf https://api.gwi.dev/health | jq .

# View logs
gcloud logging read "resource.labels.service_name=gwi-api-prod" --limit=50

# Check alerts
gcloud monitoring policies list --project=git-with-intent
```

### Incident Contacts

| Role | Contact |
|------|---------|
| Security Lead | security@intentsolutions.io |
| On-call | PagerDuty rotation |
| Project Lead | jeremy@intentsolutions.io |

---

## Appendix B: Related Documentation

- [README.md](/README.md) - Project overview
- [CLAUDE.md](/CLAUDE.md) - AI agent instructions
- [CONTRIBUTING.md](/CONTRIBUTING.md) - Development guidelines
- [SECURITY.md](/SECURITY.md) - Security policy
- [Threat Model](./110-DR-TMOD-security-threat-model.md)
- [Observability Runbook](./032-OD-RUNB-observability-operations.md)
- [Security/IAM Runbook](./033-DR-RUNB-security-iam-operations.md)
- [Release Process](./034-DR-CHKL-release-process.md)
- [PubSub DLQ Management](./029-OD-RUNB-pubsub-dlq-management.md)
- [Firebase Hosting Operations](./031-OD-RUNB-firebase-hosting-operations.md)

---

*This document should be reviewed quarterly and updated after any significant architectural changes.*
