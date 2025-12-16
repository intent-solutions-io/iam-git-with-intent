# 003-AA-AUDT: Git With Intent - DevOps Operations Playbook

**Document ID:** 003-AA-AUDT
**Document Type:** After-Action Report / Audit
**Created:** 2025-12-15
**Last Updated:** 2025-12-15
**Author:** Claude Code (Opus 4.5)
**Status:** ACTIVE (INTERNAL OPS DOCUMENT)
**Version:** 1.2.0

> **Filing Standard:** This document follows docs-filing v4 (6767-a-DR-STND-document-filing-system-standard-v4.md)

---

> **IMPORTANT: INTERNAL OPERATIONS DOCUMENT**
>
> This playbook documents the **internal DevOps infrastructure** used by the Git With Intent team.
> It is NOT a guide for end users of the product.
>
> **Key clarifications:**
> - **AgentFS and Beads** described here are for **internal ops/experimentation only**
> - They are **NOT required** for end-user installations of Git With Intent
> - The public CLI (`gwi`) works with standard SQLite storage out of the box
> - The A2A Gateway and Agent Engine infrastructure are for our **hosted service**, not self-hosted users
>
> For user documentation, see the main README.md and CLAUDE.md.
>
> See also: `004-DR-ADRC-runtime-vs-devtools.md` for the architectural decision separating runtime from dev tools.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Component Inventory](#3-component-inventory)
4. [Infrastructure Configuration](#4-infrastructure-configuration)
5. [CI/CD Pipeline](#5-cicd-pipeline)
6. [Agent System Architecture](#6-agent-system-architecture)
7. [Deployment Procedures](#7-deployment-procedures)
8. [Operational Runbook](#8-operational-runbook)
9. [Monitoring and Observability](#9-monitoring-and-observability)
10. [Security Configuration](#10-security-configuration)
11. [Disaster Recovery](#11-disaster-recovery)
12. [Troubleshooting Guide](#12-troubleshooting-guide)
13. [Configuration Reference](#13-configuration-reference)
14. [Appendices](#14-appendices)

---

## 1. Executive Summary

### 1.1 Project Overview

**Git With Intent (GWI)** is an AI-powered DevOps automation platform designed to automate PR conflict resolution, issue-to-code workflows, and code review processes. The platform uses a multi-agent architecture built on Google Cloud's Vertex AI Agent Engine with A2A (Agent-to-Agent) protocol for inter-agent communication.

**Mission Statement:** "Git with purpose. Ship with confidence."

### 1.2 Production Status

| Component | Status | URL |
|-----------|--------|-----|
| A2A Gateway | DEPLOYED | https://gwi-gateway-498232460936.us-central1.run.app |
| GitHub Webhook | DEPLOYED | https://gwi-github-webhook-498232460936.us-central1.run.app |
| Agent Cards | DEPLOYED | https://gwi-gateway-498232460936.us-central1.run.app/.well-known/agent.json |
| CLI (gwi) | BUILT | Local installation |
| Agent Engine | PENDING | Terraform deployment |

### 1.3 Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Language | TypeScript (Node.js 20+) | Primary development |
| Monorepo | npm workspaces + Turbo | Build orchestration |
| Agents | Vertex AI Agent Engine | Agent runtime |
| Gateway | Cloud Run | A2A protocol proxy |
| Container Registry | Artifact Registry | Docker images |
| State Management | AgentFS (Turso SQLite) | Agent state persistence |
| Task Tracking | Beads | Issue/task coordination |
| CI/CD | GitHub Actions | Build and deployment |
| IaC | Terraform | Infrastructure |
| Models | Gemini Flash + Claude Sonnet/Opus | AI reasoning |

### 1.4 Hard Mode Compliance (INTERNAL OPS ONLY)

> **Note:** Hard Mode rules apply to our **internal DevOps environment** and hosted infrastructure.
> They are NOT requirements for end users of the Git With Intent CLI.
> Public distributions work with standard SQLite storage without AgentFS or Beads.

The **internal ops environment** adheres to "Hard Mode" architecture rules (R1-R8):

| Rule | Description | Scope | Status |
|------|-------------|-------|--------|
| R1 | AgentFS MAY be used for internal agent state | Internal ops | OPTIONAL |
| R2 | Agent Engine for hosted service | Hosted only | COMPLIANT |
| R3 | Cloud Run gateways = proxy only | Hosted only | COMPLIANT |
| R4 | CI-only deployments | Internal | COMPLIANT |
| R5 | Beads for internal task tracking | Internal only | OPTIONAL |
| R6 | Single docs folder (000-docs/) | All | COMPLIANT |
| R7 | SPIFFE IDs for hosted agents | Hosted only | COMPLIANT |
| R8 | Hard Mode violations block CI | Opt-in | OPTIONAL |

---

## 2. System Architecture Overview

### 2.1 High-Level Architecture

```
                                    GitHub Events
                                         |
                                         v
                           +------------------------+
                           |   GitHub Webhook       |
                           |   (Cloud Run)          |
                           +------------------------+
                                         |
                                         v
+-------------+          +------------------------+          +------------------+
|   CLI       |--------->|   A2A Gateway          |<-------->|  External        |
|   (gwi)     |          |   (Cloud Run)          |          |  Clients         |
+-------------+          +------------------------+          +------------------+
                                         |
                    A2A Protocol (REST)  |
                                         v
+------------------------------------------------------------------------+
|                      Vertex AI Agent Engine                             |
|                                                                         |
|   +---------------+  +---------------+  +---------------+  +---------+  |
|   | Orchestrator  |  |   Triage      |  |   Resolver    |  | Reviewer|  |
|   | (Router)      |  |   (Gemini)    |  |   (Claude)    |  | (Claude)|  |
|   +---------------+  +---------------+  +---------------+  +---------+  |
|                                                                         |
+------------------------------------------------------------------------+
                                         |
                                         v
                           +------------------------+
                           |      AgentFS           |
                           |   (Turso SQLite)       |
                           +------------------------+
```

### 2.2 Request Flow

1. **External Trigger**: GitHub webhook or CLI command initiates request
2. **Gateway Routing**: A2A Gateway validates and routes to Orchestrator
3. **Workflow Orchestration**: Orchestrator determines workflow and routes to agents
4. **Agent Processing**: Triage -> Resolver -> Reviewer pipeline
5. **State Persistence**: AgentFS records all state changes
6. **Response**: Results returned through gateway

### 2.3 Network Architecture

```
                    Internet
                        |
                        v
              +------------------+
              |   Cloud Armor    |  (Future: WAF)
              +------------------+
                        |
                        v
              +------------------+
              |   Cloud Load     |
              |   Balancer       |
              +------------------+
                   /          \
                  v            v
    +---------------+    +------------------+
    | gwi-gateway   |    | gwi-github-      |
    | :8080         |    | webhook :8080    |
    +---------------+    +------------------+
           |                     |
           +----------+----------+
                      |
                      v
           +------------------+
           | Vertex AI        |
           | Agent Engine     |
           | (us-central1)    |
           +------------------+
```

---

## 3. Component Inventory

### 3.1 Applications (apps/)

| App | Path | Port | Description |
|-----|------|------|-------------|
| gateway | `apps/gateway/` | 8080 | A2A protocol gateway, proxies to Agent Engine |
| github-webhook | `apps/github-webhook/` | 8080 | GitHub webhook handler |
| cli | `apps/cli/` | N/A | CLI tool (gwi) |
| api | `apps/api/` | 8080 | REST API gateway (scaffolded) |

#### Gateway Application

**Location:** `apps/gateway/src/index.ts`

**Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/.well-known/agent.json` | GET | A2A AgentCard discovery |
| `/a2a/:agent` | POST | A2A message routing |
| `/api/workflows` | POST | Start new workflow |

**Environment Variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| PROJECT_ID | Yes | GCP project ID |
| LOCATION | Yes | GCP region (us-central1) |
| ORCHESTRATOR_ENGINE_ID | Yes | Orchestrator Agent Engine ID |
| TRIAGE_ENGINE_ID | Yes | Triage Agent Engine ID |
| RESOLVER_ENGINE_ID | Yes | Resolver Agent Engine ID |
| REVIEWER_ENGINE_ID | Yes | Reviewer Agent Engine ID |
| APP_NAME | No | Application name |
| APP_VERSION | No | Application version |
| AGENT_SPIFFE_ID | No | SPIFFE ID base |
| DEPLOYMENT_ENV | No | Environment (dev/prod) |
| PORT | No | Server port (default: 8080) |

#### GitHub Webhook Application

**Location:** `apps/github-webhook/src/index.ts`

**Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/webhook` | POST | GitHub webhook receiver |

**Supported Events:**

| Event | Actions | Workflow |
|-------|---------|----------|
| `pull_request` | opened, synchronize, reopened | pr-resolve (if conflicts) |
| `issue_comment` | created | /gwi commands |
| `issues` | opened, labeled | issue-to-code (gwi-auto-code label) |
| `push` | * | Not yet implemented |

**Commands:**

| Command | Scope | Description |
|---------|-------|-------------|
| `/gwi resolve` | PR | Trigger PR conflict resolution |
| `/gwi review` | PR | Trigger PR review |

### 3.2 Packages (packages/)

| Package | Path | Description |
|---------|------|-------------|
| @gwi/core | `packages/core/` | Core utilities (AgentFS, Beads, A2A, Models) |
| @gwi/agents | `packages/agents/` | Agent implementations |
| @gwi/integrations | `packages/integrations/` | GitHub, GitLab integrations |

#### @gwi/core Package

**Modules:**

| Module | Exports | Purpose |
|--------|---------|---------|
| agentfs | openAgentFS, AgentFS | Agent state management |
| beads | BeadsClient, createBead | Task tracking |
| a2a | A2AMessage, A2AResponse | Protocol types |
| models | createModelClient, MODELS | Multi-model abstraction |
| types | PRMetadata, ConflictInfo, etc. | Shared types |

#### @gwi/agents Package

**Agents:**

| Agent | Class | Model | Purpose |
|-------|-------|-------|---------|
| Orchestrator | OrchestratorAgent | Gemini Flash | Workflow routing |
| Triage | TriageAgent | Gemini Flash | Complexity scoring |
| Resolver | ResolverAgent | Claude Sonnet/Opus | Conflict resolution |
| Reviewer | ReviewerAgent | Claude Sonnet | Validation |

### 3.3 Agent Cards

**Location:** `agents/cards/`

| Card | SPIFFE ID | Model |
|------|-----------|-------|
| orchestrator.json | spiffe://intent.solutions/agent/gwi/orchestrator | gemini-2.0-flash |
| triage.json | spiffe://intent.solutions/agent/gwi/triage | gemini-2.0-flash |
| resolver.json | spiffe://intent.solutions/agent/gwi/resolver | claude-sonnet-4 |
| reviewer.json | spiffe://intent.solutions/agent/gwi/reviewer | claude-sonnet-4 |

---

## 4. Infrastructure Configuration

### 4.1 Terraform Structure

```
infra/terraform/
├── main.tf              # Main configuration, APIs, locals
├── provider.tf          # Google provider (separate file)
├── variables.tf         # Variable definitions
├── outputs.tf           # Output values
├── agent_engine.tf      # Vertex AI Reasoning Engines
├── cloud_run.tf         # Cloud Run services
├── iam.tf               # Service accounts and IAM
├── storage.tf           # GCS buckets
├── knowledge_hub.tf     # Knowledge store (RAG)
├── envs/
│   ├── dev.tfvars       # Dev environment
│   └── prod.tfvars      # Production environment
├── modules/
│   └── slack_bob_gateway/  # Slack integration module
└── terraform.tfvars.example  # Example configuration
```

### 4.2 Required GCP APIs

| API | Purpose |
|-----|---------|
| aiplatform.googleapis.com | Vertex AI Agent Engine |
| run.googleapis.com | Cloud Run |
| cloudbuild.googleapis.com | Cloud Build |
| secretmanager.googleapis.com | Secrets |
| cloudtrace.googleapis.com | Tracing |
| monitoring.googleapis.com | Monitoring |
| logging.googleapis.com | Logging |
| iam.googleapis.com | IAM |
| cloudresourcemanager.googleapis.com | Resource Manager |
| artifactregistry.googleapis.com | Artifact Registry |

### 4.3 Service Accounts

| Account | Purpose | Roles |
|---------|---------|-------|
| gwi-agent-{env} | Agent Engine | aiplatform.user, ml.developer, logging.logWriter, cloudtrace.agent, secretmanager.secretAccessor |
| gwi-a2a-{env} | A2A Gateway | aiplatform.user, logging.logWriter |
| gwi-github-{env} | GitHub Webhook | aiplatform.user, secretmanager.secretAccessor |
| gwi-ci | GitHub Actions | run.admin, aiplatform.admin, storage.admin, artifactregistry.admin |

### 4.4 Environment Variables by Service

#### Dev Environment (`envs/dev.tfvars`)

```hcl
project_id  = "git-with-intent-dev"
region      = "us-central1"
environment = "dev"
app_name    = "git-with-intent"
app_version = "0.1.0"

# Scaling
gateway_max_instances = 5

# Models
triage_model          = "gemini-2.0-flash"
resolver_model        = "claude-sonnet-4-20250514"
resolver_complex_model = "claude-opus-4-20250514"
reviewer_model        = "claude-sonnet-4-20250514"

# Networking
allow_public_access = true

# Telemetry
enable_telemetry = true
```

#### Production Environment (`envs/prod.tfvars`)

```hcl
project_id  = "git-with-intent-prod"
region      = "us-central1"
environment = "prod"
app_name    = "git-with-intent"
app_version = "0.1.0"

# Scaling (higher for production)
gateway_max_instances = 20

# Models
triage_model          = "gemini-2.0-flash"
resolver_model        = "claude-sonnet-4-20250514"
resolver_complex_model = "claude-opus-4-20250514"
reviewer_model        = "claude-sonnet-4-20250514"

# Networking (restricted in prod)
allow_public_access = false

# Telemetry
enable_telemetry = true
```

### 4.5 Cloud Run Configuration

| Setting | Gateway | Webhook |
|---------|---------|---------|
| CPU | 1000m | 1000m |
| Memory | 512Mi | 512Mi |
| Concurrency | 80 | 80 |
| Timeout | 300s | 300s |
| Min Instances | 0 | 0 |
| Max Instances | Variable (5/20) | Variable (5/20) |
| CPU Throttling | Enabled | Enabled |

### 4.6 Agent Engine Configuration

| Agent | Display Name | Project |
|-------|--------------|---------|
| Orchestrator | {app}-{env}-orchestrator | var.project_id |
| Triage | {app}-{env}-triage | var.project_id |
| Resolver | {app}-{env}-resolver | var.project_id |
| Reviewer | {app}-{env}-reviewer | var.project_id |

---

## 5. CI/CD Pipeline

### 5.1 Pipeline Overview

**File:** `.github/workflows/ci.yml`

```
                    Push/PR
                       |
                       v
               +---------------+
               |   Hard Mode   |
               |   Check       |
               +---------------+
                       |
                       v
               +---------------+
               |   ARV Check   |
               +---------------+
                       |
                       v
               +---------------+
               |   Build &     |
               |   Test        |
               +---------------+
                       |
                       v (push only)
               +---------------+
               |   Build       |
               |   Images      |
               +---------------+
                   /       \
                  v         v
         +----------+   +----------+
         | Deploy   |   | Deploy   |
         | Dev      |   | Prod     |
         | (develop)|   | (main)   |
         +----------+   +----------+
```

### 5.2 Jobs Detail

#### Hard Mode Check

**Script:** `scripts/ci/check_nodrift.sh`

| Check | Rule | Description |
|-------|------|-------------|
| R1 | In-memory state | No Map/state in agent code |
| R3 | Gateway imports | No @gwi/agents in gateways |
| R4 | Manual deploys | No gcloud deploy outside CI |
| R4 | Credentials | No key files in repo |
| R5 | TODO files | No markdown TODO files |
| R8 | .env files | No committed .env |

#### ARV Check (Agent Readiness Verification)

**Script:** `scripts/ci/check_arv.sh`

| Check | Rule | Description |
|-------|------|-------------|
| ARV-1 | AgentFS | All agents initialize AgentFS |
| ARV-2 | A2A | All agents have message handlers |
| ARV-3 | SPIFFE | SPIFFE IDs configured |
| ARV-4 | Model | Model configuration present |
| ARV-5 | Errors | Error handling implemented |
| ARV-6 | Audit | Audit logging present |

#### Build & Test

```yaml
steps:
  - npm ci
  - npm run typecheck
  - npm run build
  - npm run test
  - Upload artifacts (packages/*/dist, apps/*/dist)
```

#### Build Docker Images

**Requires:** Build & Test success, push event

```yaml
steps:
  - Authenticate to GCP (WIF)
  - Configure Docker for Artifact Registry
  - Build/push gateway:$SHA, gateway:latest
  - Build/push github-webhook:$SHA, github-webhook:latest
```

#### Deploy Dev/Prod

**Requires:** Build Images success, branch match

```yaml
steps:
  - Authenticate to GCP (WIF)
  - terraform init -backend-config="bucket=$TF_STATE_BUCKET"
  - terraform apply -auto-approve -var="environment={dev|prod}"
  - Deploy agents to Agent Engine
```

### 5.3 GitHub Actions Variables

| Variable | Description |
|----------|-------------|
| GCP_PROJECT_ID | GCP project ID |
| WIF_PROVIDER | Workload Identity provider |
| WIF_SERVICE_ACCOUNT | WIF service account |
| TF_STATE_BUCKET | Terraform state bucket |

### 5.4 Workload Identity Federation

**Pool:** `{app}-github-pool`
**Provider:** `github`

```hcl
attribute_mapping = {
  "google.subject"       = "assertion.sub"
  "attribute.actor"      = "assertion.actor"
  "attribute.repository" = "assertion.repository"
}
```

---

## 6. Agent System Architecture

### 6.1 Agent Lifecycle

```
                    +------------+
                    |  Created   |
                    +------------+
                          |
                          v
                    +------------+
                    | Initialize |
                    | (AgentFS)  |
                    +------------+
                          |
                          v
                    +------------+
        +---------->|   Idle     |<----------+
        |           +------------+           |
        |                 |                  |
        |                 v                  |
        |           +------------+           |
        |           | Process    |           |
        |           | Message    |           |
        |           +------------+           |
        |                 |                  |
        |                 v                  |
        |           +------------+           |
        +-----------| Save State |-----------+
                    +------------+
                          |
                          v
                    +------------+
                    |  Shutdown  |
                    +------------+
```

### 6.2 Workflow Definitions

| Workflow | Steps | Trigger |
|----------|-------|---------|
| pr-resolve | triage -> resolver -> reviewer | PR with conflicts |
| issue-to-code | triage -> coder -> reviewer -> test | Issue with gwi-auto-code label |
| pr-review | reviewer | /gwi review command |
| test-gen | test | Manual |
| docs-update | docs | Manual |

### 6.3 Agent Communication (A2A Protocol)

**Message Structure:**

```typescript
interface A2AMessage {
  id: string;           // Unique message ID
  from: string;         // Sender SPIFFE ID
  to: string;           // Recipient SPIFFE ID
  type: 'task' | 'response' | 'heartbeat' | 'error';
  payload: Record<string, unknown>;
  timestamp: number;
  correlationId?: string;  // For response correlation
}
```

**SPIFFE ID Format:**

```
spiffe://intent.solutions/agent/gwi/{agent-name}
```

### 6.4 Model Selection Strategy

| Agent | Default Model | Complex Model | Selection Criteria |
|-------|---------------|---------------|-------------------|
| Orchestrator | gemini-2.0-flash | N/A | Always default |
| Triage | gemini-2.0-flash | N/A | Always default |
| Resolver | claude-sonnet-4 | claude-opus-4 | Complexity > 4 |
| Reviewer | claude-sonnet-4 | N/A | Always default |

### 6.5 State Management (AgentFS)

**Per-Agent State:**

| Agent | KV Keys | Purpose |
|-------|---------|---------|
| Orchestrator | active_workflows, agent_registry | Workflow tracking |
| Triage | triage_history | Learning history |
| Resolver | resolution_history, patterns | Resolution patterns |
| Reviewer | review_history | Review patterns |

**AgentFS Operations:**

```typescript
// Initialize
const agentfs = await AgentFS.open({ id: 'agent-name' });

// State operations
await agentfs.kv.set('key', value);
const state = await agentfs.kv.get('key');

// Audit trail
await agentfs.tools.record('tool_name', startTime, endTime, input, output);
```

---

## 7. Deployment Procedures

### 7.1 Prerequisites

#### GCP Project Setup

```bash
# Create project
gcloud projects create git-with-intent-dev

# Link billing
gcloud billing projects link git-with-intent-dev \
  --billing-account=YOUR_BILLING_ACCOUNT

# Enable APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --project=git-with-intent-dev
```

#### Artifact Registry Setup

```bash
# Create repository
gcloud artifacts repositories create gwi \
  --repository-format=docker \
  --location=us-central1 \
  --project=git-with-intent-dev

# Authenticate Docker
gcloud auth configure-docker us-central1-docker.pkg.dev
```

### 7.2 Manual Deployment (Emergency Only)

**Warning:** Manual deployments violate R4. Use only for emergencies.

```bash
# Build images
cd apps/gateway
docker build -t us-central1-docker.pkg.dev/git-with-intent-dev/gwi/gateway:manual .
docker push us-central1-docker.pkg.dev/git-with-intent-dev/gwi/gateway:manual

# Deploy to Cloud Run
gcloud run deploy gwi-gateway \
  --image=us-central1-docker.pkg.dev/git-with-intent-dev/gwi/gateway:manual \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated
```

### 7.3 Terraform Deployment

```bash
# Initialize
cd infra/terraform
terraform init -backend-config="bucket=gwi-terraform-state"

# Plan (dev)
terraform plan -var-file="envs/dev.tfvars"

# Apply (dev)
terraform apply -var-file="envs/dev.tfvars"

# Plan (prod)
terraform plan -var-file="envs/prod.tfvars"

# Apply (prod)
terraform apply -var-file="envs/prod.tfvars"
```

### 7.4 CI/CD Deployment

**Dev Deployment:**
1. Push to `develop` branch
2. CI runs Hard Mode + ARV checks
3. Build & Test
4. Build Docker images
5. Terraform apply (dev)

**Production Deployment:**
1. Create PR from `develop` to `main`
2. CI runs checks
3. Merge PR
4. CI deploys to production

### 7.5 Rollback Procedures

#### Cloud Run Rollback

```bash
# List revisions
gcloud run revisions list --service=gwi-gateway --region=us-central1

# Rollback to specific revision
gcloud run services update-traffic gwi-gateway \
  --to-revisions=gwi-gateway-00001-abc=100 \
  --region=us-central1
```

#### Terraform Rollback

```bash
# Check state
terraform show

# Rollback to previous state
git revert HEAD
git push origin main
# CI will redeploy previous version
```

---

## 8. Operational Runbook

### 8.1 Daily Operations Checklist

- [ ] Check service health endpoints
- [ ] Review Cloud Logging for errors
- [ ] Check Agent Engine metrics
- [ ] Review GitHub webhook delivery status
- [ ] Verify CI pipeline status

### 8.2 Health Check Commands

```bash
# Gateway health
curl https://gwi-gateway-498232460936.us-central1.run.app/health

# GitHub webhook health
curl https://gwi-github-webhook-498232460936.us-central1.run.app/health

# Agent discovery
curl https://gwi-gateway-498232460936.us-central1.run.app/.well-known/agent.json
```

### 8.3 Log Queries

#### Cloud Run Logs

```bash
# Gateway logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=gwi-gateway" \
  --limit=100 \
  --format=json

# Webhook logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=gwi-github-webhook" \
  --limit=100 \
  --format=json
```

#### Error Filtering

```bash
# All errors
gcloud logging read 'severity>=ERROR' --limit=50

# Specific service errors
gcloud logging read 'resource.labels.service_name="gwi-gateway" AND severity>=ERROR' --limit=50
```

### 8.4 CLI Operations

```bash
# Check installation
gwi --version

# Check agent status
gwi status

# Analyze PR conflicts
gwi diff https://github.com/org/repo/pull/123

# Resolve conflicts (dry run)
gwi resolve https://github.com/org/repo/pull/123 --dry-run

# Full resolution
gwi resolve https://github.com/org/repo/pull/123
```

### 8.5 Secret Management

```bash
# Create webhook secret
echo -n "your-webhook-secret" | gcloud secrets create gwi-github-webhook-secret \
  --data-file=- \
  --project=git-with-intent-dev

# Update secret version
echo -n "new-secret-value" | gcloud secrets versions add gwi-github-webhook-secret \
  --data-file=- \
  --project=git-with-intent-dev

# Access secret
gcloud secrets versions access latest \
  --secret=gwi-github-webhook-secret \
  --project=git-with-intent-dev
```

---

## 9. Monitoring and Observability

### 9.1 Cloud Monitoring Metrics

| Metric | Service | Alert Threshold |
|--------|---------|-----------------|
| Request latency | Cloud Run | p99 > 5s |
| Error rate | Cloud Run | > 1% |
| Instance count | Cloud Run | > 80% max |
| Memory utilization | Cloud Run | > 90% |
| Agent Engine latency | Vertex AI | p99 > 30s |

### 9.2 Cloud Logging

**Log Types:**

| Type | Description | Filter |
|------|-------------|--------|
| startup | Service startup | `jsonPayload.type="startup"` |
| a2a_request | A2A message processed | `jsonPayload.type="a2a_request"` |
| a2a_error | A2A processing error | `jsonPayload.type="a2a_error"` |
| webhook_processed | Webhook handled | `jsonPayload.type="webhook_processed"` |
| webhook_error | Webhook error | `jsonPayload.type="webhook_error"` |
| workflow_start | Workflow initiated | `jsonPayload.type="workflow_start"` |

### 9.3 Structured Logging Format

```json
{
  "type": "a2a_request",
  "agent": "resolver",
  "messageId": "msg-1234",
  "messageType": "task",
  "from": "spiffe://intent.solutions/gateway",
  "durationMs": 1250,
  "status": "success"
}
```

### 9.4 Cloud Trace Integration

All Cloud Run services have Cloud Trace enabled via service account permissions. Trace IDs are automatically propagated through A2A messages.

### 9.5 Custom Dashboards

**Recommended Dashboard Panels:**

1. Request Rate (requests/minute)
2. Error Rate (%)
3. Latency Distribution (p50, p95, p99)
4. Active Instances
5. Memory Usage
6. Agent Engine Query Count
7. Workflow Success Rate
8. Webhook Processing Rate

---

## 10. Security Configuration

### 10.1 Authentication

| Component | Method |
|-----------|--------|
| Cloud Run (dev) | Public (allow_public_access=true) |
| Cloud Run (prod) | IAM (allow_public_access=false) |
| GitHub Webhook | HMAC-SHA256 signature verification |
| Agent Engine | IAM service account |
| CI/CD | Workload Identity Federation |

### 10.2 Network Security

**Production:**
- `allow_public_access = false`
- IAM authentication required
- Service-to-service communication via IAM

**Development:**
- `allow_public_access = true`
- Webhook signature still validated
- Suitable for testing

### 10.3 Secrets

| Secret | Purpose | Location |
|--------|---------|----------|
| GitHub Webhook Secret | Validate webhook signatures | Secret Manager |
| GitHub Private Key | App authentication | Secret Manager |
| API Keys | Model access | Environment variables |

### 10.4 IAM Best Practices

1. **Least Privilege:** Each service account has minimal required permissions
2. **Service Account Isolation:** Separate accounts for each component
3. **Workload Identity:** No service account keys, only WIF for CI/CD
4. **Audit Logging:** All IAM actions logged

### 10.5 Vulnerability Scanning

The Reviewer Agent performs security scanning:

| Pattern | Type | Severity |
|---------|------|----------|
| Hardcoded passwords | Credential | Critical |
| API keys in code | Credential | Critical |
| eval() usage | Code execution | High |
| innerHTML assignment | XSS | Medium |
| SQL in templates | Injection | High |

---

## 11. Disaster Recovery

### 11.1 Backup Strategy

| Component | Backup Method | Frequency |
|-----------|---------------|-----------|
| Terraform State | GCS versioned bucket | Every apply |
| Secrets | Secret Manager versioning | Every change |
| Agent State | AgentFS (Turso) | Continuous |
| Source Code | GitHub | Every push |

### 11.2 Recovery Time Objectives

| Scenario | RTO | RPO |
|----------|-----|-----|
| Cloud Run failure | 5 minutes | 0 |
| Agent Engine failure | 15 minutes | 0 |
| Complete region failure | 1 hour | 0 |
| Data corruption | 30 minutes | Last backup |

### 11.3 Disaster Recovery Procedures

#### Cloud Run Service Down

```bash
# Check status
gcloud run services describe gwi-gateway --region=us-central1

# Force new deployment
gcloud run services update gwi-gateway \
  --region=us-central1 \
  --update-env-vars="FORCE_RESTART=$(date +%s)"
```

#### Agent Engine Failure

```bash
# Re-deploy via Terraform
cd infra/terraform
terraform apply -var-file="envs/prod.tfvars" -target=google_vertex_ai_reasoning_engine.orchestrator

# Verify
gcloud ai reasoning-engines list --region=us-central1
```

#### Complete Rebuild

```bash
# 1. Recreate GCP project resources
terraform init -backend-config="bucket=gwi-terraform-state"
terraform apply -var-file="envs/prod.tfvars"

# 2. Trigger CI/CD rebuild
git commit --allow-empty -m "Force rebuild"
git push origin main

# 3. Verify health
curl https://gwi-gateway-*.run.app/health
```

### 11.4 Backup Restoration

```bash
# Terraform state restoration
gsutil ls gs://gwi-terraform-state/terraform/state/

# Restore from specific version
gsutil cp gs://gwi-terraform-state/terraform/state/default.tfstate#1234 ./terraform.tfstate
terraform apply
```

---

## 12. Troubleshooting Guide

### 12.1 Common Issues

#### Issue: Gateway returns 500

**Symptoms:** A2A requests return 500 Internal Server Error

**Diagnosis:**
```bash
# Check logs
gcloud logging read 'resource.labels.service_name="gwi-gateway" AND severity>=ERROR' --limit=10

# Common causes:
# 1. Agent Engine not responding
# 2. Invalid Agent Engine ID
# 3. Service account permissions
```

**Resolution:**
```bash
# Verify Agent Engine
gcloud ai reasoning-engines describe ENGINE_ID --region=us-central1

# Check service account
gcloud iam service-accounts get-iam-policy gwi-a2a-dev@project.iam.gserviceaccount.com
```

#### Issue: Webhook signature validation fails

**Symptoms:** GitHub webhooks return 401

**Diagnosis:**
```bash
# Check secret exists
gcloud secrets versions list gwi-github-webhook-secret

# Verify environment variable
gcloud run services describe gwi-github-webhook --region=us-central1 --format=json | jq '.spec.template.spec.containers[0].env'
```

**Resolution:**
1. Verify secret matches GitHub App settings
2. Rotate secret if compromised
3. Update Secret Manager

#### Issue: CI Hard Mode check fails

**Symptoms:** CI blocks with Hard Mode violations

**Diagnosis:**
```bash
# Run locally
bash scripts/ci/check_nodrift.sh
```

**Resolution:** Fix the violation according to the rule:
- R1: Move state to AgentFS
- R3: Remove agent imports from gateway
- R4: Remove manual deploy scripts
- R5: Use Beads instead of TODO.md
- R8: Remove .env from git

#### Issue: Agent returns low confidence

**Symptoms:** Reviewer escalates with confidence < 70%

**Diagnosis:**
```bash
# Check agent logs
gcloud logging read 'jsonPayload.type="a2a_request" AND jsonPayload.agent="reviewer"' --limit=10
```

**Resolution:**
1. Review the conflict complexity
2. Check if human review is appropriate
3. Consider upgrading to Opus model

### 12.2 Debug Commands

```bash
# Cloud Run instance logs
gcloud run services logs read gwi-gateway --region=us-central1 --limit=50

# Real-time log streaming
gcloud beta run services logs tail gwi-gateway --region=us-central1

# Agent Engine debugging
gcloud ai reasoning-engines describe ENGINE_ID --region=us-central1 --format=yaml

# Terraform state inspection
terraform state list
terraform state show google_cloud_run_service.a2a_gateway
```

### 12.3 Support Escalation

| Level | Contact | Response Time |
|-------|---------|---------------|
| L1 | DevOps on-call | 15 minutes |
| L2 | Platform team | 1 hour |
| L3 | GCP Support | Per SLA |

---

## 13. Configuration Reference

### 13.1 Environment Variables Reference

| Variable | Service | Required | Default | Description |
|----------|---------|----------|---------|-------------|
| PROJECT_ID | All | Yes | - | GCP project ID |
| LOCATION | Gateway | Yes | us-central1 | GCP region |
| ORCHESTRATOR_ENGINE_ID | Gateway | Yes | - | Agent Engine ID |
| TRIAGE_ENGINE_ID | Gateway | Yes | - | Agent Engine ID |
| RESOLVER_ENGINE_ID | Gateway | Yes | - | Agent Engine ID |
| REVIEWER_ENGINE_ID | Gateway | Yes | - | Agent Engine ID |
| GITHUB_WEBHOOK_SECRET | Webhook | Yes | - | Webhook validation secret |
| DEPLOYMENT_ENV | All | No | dev | Environment name |
| PORT | All | No | 8080 | Server port |
| APP_NAME | Gateway | No | git-with-intent | Application name |
| APP_VERSION | Gateway | No | 0.1.0 | Version string |
| AGENT_SPIFFE_ID | Gateway | No | spiffe://intent.solutions/agent/gwi | SPIFFE ID base |

### 13.2 Terraform Variables Reference

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| project_id | string | Yes | - | GCP project ID |
| region | string | No | us-central1 | GCP region |
| environment | string | Yes | - | dev/staging/prod |
| app_name | string | No | git-with-intent | Application name |
| app_version | string | No | 0.1.0 | Version |
| a2a_gateway_image | string | Yes | - | Gateway Docker image |
| github_webhook_image | string | Yes | - | Webhook Docker image |
| gateway_max_instances | number | No | 10 | Max Cloud Run instances |
| triage_model | string | No | gemini-2.0-flash | Triage model |
| resolver_model | string | No | claude-sonnet-4-20250514 | Resolver model |
| resolver_complex_model | string | No | claude-opus-4-20250514 | Complex resolver |
| reviewer_model | string | No | claude-sonnet-4-20250514 | Reviewer model |
| allow_public_access | bool | No | false | Public Cloud Run access |
| enable_telemetry | bool | No | true | Enable tracing/monitoring |
| labels | map(string) | No | {} | Resource labels |
| github_app_id | string | No | "" | GitHub App ID |
| github_webhook_secret_id | string | No | gwi-github-webhook-secret | Secret ID |
| agent_spiffe_id | string | No | spiffe://intent.solutions/agent/gwi | SPIFFE base |

### 13.3 CLI Configuration

```bash
# Required environment variables
export ANTHROPIC_API_KEY=sk-ant-...
export GOOGLE_AI_API_KEY=...
export GITHUB_TOKEN=ghp_...

# Optional
export GITHUB_APP_ID=...
export GITHUB_APP_PRIVATE_KEY=...
export AGENT_MAIL_URL=http://localhost:8765
export LOG_LEVEL=debug
```

---

## 14. Appendices

### 14.1 Repository Structure

```
git-with-intent/
├── .github/
│   └── workflows/
│       └── ci.yml                 # CI/CD pipeline
├── .husky/                        # Git hooks
├── 000-docs/                      # Documentation (6767 standard)
├── agents/
│   └── cards/                     # Agent card definitions
│       ├── orchestrator.json
│       ├── triage.json
│       ├── resolver.json
│       └── reviewer.json
├── apps/
│   ├── api/                       # REST API (scaffolded)
│   ├── cli/                       # CLI tool (gwi)
│   ├── gateway/                   # A2A Gateway
│   └── github-webhook/            # GitHub webhook handler
├── docs/
│   └── vision/                    # Architecture docs
├── infra/
│   ├── cloudbuild/                # Cloud Build configs
│   └── terraform/                 # IaC
│       ├── envs/
│       │   ├── dev.tfvars
│       │   └── prod.tfvars
│       ├── modules/
│       ├── *.tf
│       └── terraform.tfvars.example
├── packages/
│   ├── agents/                    # @gwi/agents
│   ├── core/                      # @gwi/core
│   └── integrations/              # @gwi/integrations
├── scripts/
│   └── ci/
│       ├── check_arv.sh           # ARV validation
│       └── check_nodrift.sh       # Hard Mode checks
├── .beads/                        # Beads database
├── CLAUDE.md                      # AI assistant instructions
├── README.md                      # Project readme
├── package.json                   # Root package.json
├── tsconfig.json                  # TypeScript config
└── turbo.json                     # Turborepo config
```

### 14.2 Live Endpoints

| Endpoint | URL | Purpose |
|----------|-----|---------|
| Gateway Health | https://gwi-gateway-498232460936.us-central1.run.app/health | Health check |
| Agent Card | https://gwi-gateway-498232460936.us-central1.run.app/.well-known/agent.json | A2A discovery |
| Webhook Health | https://gwi-github-webhook-498232460936.us-central1.run.app/health | Health check |
| Webhook | https://gwi-github-webhook-498232460936.us-central1.run.app/webhook | GitHub events |

### 14.3 Model Specifications

| Model | Provider | Use Case | Max Tokens |
|-------|----------|----------|------------|
| gemini-2.0-flash | Google | Fast routing, triage | 2048 |
| claude-sonnet-4-20250514 | Anthropic | Resolution, review | 8192 |
| claude-opus-4-20250514 | Anthropic | Complex resolution | 16384 |

### 14.4 Useful Commands Quick Reference

```bash
# Build
npm run build

# Test
npm run test

# Type check
npm run typecheck

# CI checks (local)
bash scripts/ci/check_nodrift.sh
bash scripts/ci/check_arv.sh

# Terraform
terraform plan -var-file="envs/dev.tfvars"
terraform apply -var-file="envs/dev.tfvars"

# Docker
docker build -t gateway apps/gateway/
docker build -t webhook apps/github-webhook/

# GCP
gcloud run services list
gcloud ai reasoning-engines list --region=us-central1
gcloud secrets list

# CLI
gwi --help
gwi status
gwi resolve <pr-url> --dry-run
```

### 14.5 Contact Information

| Role | Contact | Responsibility |
|------|---------|----------------|
| Platform Owner | jeremy@intentsolutions.io | Overall platform |
| DevOps | devops@intentsolutions.io | Operations |
| Support | support@intentsolutions.io | User issues |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-15 | Claude Code (Opus 4.5) | Initial comprehensive playbook |
| 1.1.0 | 2025-12-15 | Claude Code (Opus 4.5) | Added internal ops disclaimer, marked AgentFS/Beads as optional |
| 1.2.0 | 2025-12-15 | Claude Code (Opus 4.5) | Added docs-filing v4 compliance, updated footer |

---

**Generated with Claude Code (claude.ai/code)**

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>

---

*intent solutions io — confidential IP*
*Contact: jeremy@intentsolutions.io*
