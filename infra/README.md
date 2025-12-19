# Git With Intent - Infrastructure (OpenTofu)

Infrastructure as Code for Git With Intent using OpenTofu.

## Quick Start

```bash
# Install OpenTofu (if not installed)
# See: https://opentofu.org/docs/intro/install/

# Initialize
cd infra
tofu init

# Validate
tofu fmt -check -recursive
tofu validate

# Plan (dev environment)
tofu plan -var-file=envs/dev.tfvars

# Apply (dev environment)
tofu apply -var-file=envs/dev.tfvars
```

## Architecture

```
Firebase Hosting (web docs)
        │
        ▼
Cloud Run Services:
├── gwi-api (REST API)
├── gwi-gateway (A2A Gateway)
├── gwi-webhook (GitHub Webhook)
└── gwi-worker (Background jobs)
        │
        ▼
Vertex AI Agent Engine (agent runtime)
├── Orchestrator (Gemini Flash)
├── Triage Agent (Gemini Flash)
├── Resolver Agent (Claude Sonnet/Opus)
└── Reviewer Agent (Claude Sonnet)
```

### Agent Engine Deployment Model

Git With Intent uses **Vertex AI Agent Engine** as the runtime for all AI agents. Agent Engine is NOT managed by OpenTofu due to lack of provider support (as of December 2025). Instead, agents are deployed via:

1. ADK CLI (Agent Development Kit)
2. gcloud command-line tool
3. Vertex AI Console

OpenTofu manages all supporting infrastructure (IAM, storage, Cloud Run gateways, Pub/Sub, etc.), while Agent Engine instances are deployed separately and referenced by their Engine IDs.

## State Management

### Backend Configuration

- **Backend Type**: GCS (Google Cloud Storage)
- **Bucket Name**: `git-with-intent-tofu-state`
- **Prefix**: `opentofu/state`
- **Versioning**: Enabled for rollback protection
- **Locking**: Automatic via GCS (prevents concurrent modifications)

### State Strategy

1. **Remote State Storage**
   - All state is stored remotely in GCS bucket
   - State files are NEVER committed to git
   - Each environment uses the same bucket with different prefixes (if multi-env sharing)
   - Enables team collaboration and CI/CD automation

2. **State File Security**
   - Bucket access restricted to authorized service accounts
   - Encryption at rest enabled by default (Google-managed keys)
   - Versioning enabled for state recovery
   - Object lifecycle: Retain all versions indefinitely

3. **State Locking**
   - GCS backend provides automatic locking
   - Prevents concurrent `tofu apply` operations
   - Lock timeout: Default (no override needed)
   - Manual unlock: `tofu force-unlock <LOCK_ID>` (emergency only)

4. **State File Isolation**
   - Production/staging/dev use separate GCP projects
   - State prefix pattern: `opentofu/state/default.tfstate`
   - No workspace-based isolation (project isolation preferred)

5. **Bootstrap Process**
   - State bucket must be created manually or via bootstrap script
   - Manual creation:
     ```bash
     gsutil mb -p <project-id> -l us-central1 gs://git-with-intent-tofu-state
     gsutil versioning set on gs://git-with-intent-tofu-state
     ```

6. **State Recovery**
   - List versions: `gsutil ls -la gs://git-with-intent-tofu-state/opentofu/state/`
   - Restore version: `gsutil cp gs://...#<generation> gs://.../default.tfstate`
   - Always backup before major changes: `tofu state pull > backup-$(date +%Y%m%d).tfstate`

7. **State Migration**
   - Migrated from Terraform to OpenTofu (100% compatible)
   - State format unchanged (Terraform <-> OpenTofu compatible)
   - No manual migration needed for state files

## Environments

| Environment | File | Usage |
|------------|------|-------|
| dev | `envs/dev.tfvars` | Local development |
| staging | `envs/staging.tfvars` | Pre-production testing |
| prod | `envs/prod.tfvars` | Production |

## CI/CD

GitHub Actions workflows use Workload Identity Federation (WIF) for authentication.
No service account keys are stored in secrets.

```yaml
- uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: 'projects/498232460936/locations/global/workloadIdentityPools/github-pool/providers/github-provider'
    service_account: 'gwi-deployer@git-with-intent.iam.gserviceaccount.com'
```

## Commands

```bash
# Format check (CI)
tofu fmt -check -recursive

# Validate
tofu validate

# Plan
tofu plan -var-file=envs/<env>.tfvars -out=tfplan

# Apply
tofu apply tfplan

# Drift check (scheduled)
tofu plan -var-file=envs/prod.tfvars -detailed-exitcode
# Exit code 2 = drift detected
```

## No-Drift Policy

**Objective**: Ensure infrastructure state matches code at all times. All changes must go through OpenTofu + CI/CD.

**Detection**:
- CI runs `tofu plan` on every PR (immediate feedback)
- Scheduled weekly drift checks against production (Sunday midnight UTC)
- Drift detection automatically opens GitHub issue with detailed summary

**Resolution**:
- Drift must be resolved within 24 hours
- Either apply OpenTofu to align infrastructure OR update code to match desired state
- Manual GCP console changes are NOT permitted

**Workflow**: `.github/workflows/drift-detection.yml`
- Runs: `tofu plan -detailed-exitcode -var-file=envs/prod.tfvars`
- Exit code 0: No drift (silent pass)
- Exit code 2: Drift detected (creates GitHub issue with add/change/destroy counts)
- Exit code 1: Plan error (workflow fails)

## Resources Managed

### Managed by OpenTofu

- **Cloud Run**: API, Gateway, Webhook, Worker services
- **Artifact Registry**: Docker image repository
- **Storage**: ADK staging bucket, documentation bucket
- **IAM**: Service accounts, WIF configuration
- **Pub/Sub**: Worker job queue, dead letter queue
- **Monitoring**: Dashboards, alerts, uptime checks
- **Budgets**: Cost alerts and caps

### NOT Managed by OpenTofu

- **Vertex AI Agent Engine**: Deployed via ADK CLI or gcloud
- **Secret Manager Secrets**: Created manually (API keys, tokens)

See `agent_engine.tf` for detailed Agent Engine deployment instructions.

## OpenTofu Notes

OpenTofu uses HCL syntax (same as Terraform). All `*.tf` files are valid OpenTofu configurations.

### State Management History

**Approach: GREENFIELD DEPLOYMENT**

Pre-existing GCP resources (deployed manually or via legacy scripts) use different naming:
- Legacy: `gwi-gateway`, `gwi-github-webhook`
- OpenTofu: `git-with-intent-a2a-gateway-{env}`, `git-with-intent-github-webhook-{env}`

Rather than import these mismatched resources, we opted for a clean greenfield deployment:
- OpenTofu manages all resources it creates
- Legacy resources can be deprecated/deleted manually
- Clean state with no import complexity
- `tofu plan` shows: **47 to add, 0 to change, 0 to destroy**

## Vertex AI Agent Engine

### Overview

Vertex AI Agent Engine is the runtime environment for all GWI agents. It provides:
- Managed execution of AI agents with built-in scaling
- Direct integration with Vertex AI models (Gemini, Claude via Model Garden)
- REST API for synchronous and asynchronous invocations
- Automatic logging and tracing integration

### Deployment Process

Agent Engine deployment is a **two-phase process**:

#### Phase 1: Deploy Supporting Infrastructure (OpenTofu)

```bash
cd infra
tofu init
tofu plan -var-file=envs/dev.tfvars
tofu apply -var-file=envs/dev.tfvars
```

This creates:
- Service accounts with proper IAM roles
- ADK staging bucket (`{project-id}-adk-staging`)
- Cloud Run gateways (API, Gateway, Webhook, Worker)
- Pub/Sub topics and subscriptions
- Monitoring and alerting policies

#### Phase 2: Deploy Agent Instances (ADK CLI)

```bash
# Orchestrator
adk deploy agent_engine \
  --project=git-with-intent \
  --region=us-central1 \
  --staging_bucket=gs://git-with-intent-adk-staging \
  --service_account=git-with-intent-agent-dev@git-with-intent.iam.gserviceaccount.com \
  --display_name=gwi-orchestrator-dev \
  --agent=orchestrator

# Triage
adk deploy agent_engine \
  --project=git-with-intent \
  --region=us-central1 \
  --staging_bucket=gs://git-with-intent-adk-staging \
  --service_account=git-with-intent-agent-dev@git-with-intent.iam.gserviceaccount.com \
  --display_name=gwi-triage-dev \
  --agent=triage

# Resolver
adk deploy agent_engine \
  --project=git-with-intent \
  --region=us-central1 \
  --staging_bucket=gs://git-with-intent-adk-staging \
  --service_account=git-with-intent-agent-dev@git-with-intent.iam.gserviceaccount.com \
  --display_name=gwi-resolver-dev \
  --agent=resolver

# Reviewer
adk deploy agent_engine \
  --project=git-with-intent \
  --region=us-central1 \
  --staging_bucket=gs://git-with-intent-adk-staging \
  --service_account=git-with-intent-agent-dev@git-with-intent.iam.gserviceaccount.com \
  --display_name=gwi-reviewer-dev \
  --agent=reviewer
```

#### Phase 3: Update OpenTofu with Engine IDs

Capture the Engine IDs from deployment output and add to `envs/dev.tfvars`:

```hcl
orchestrator_engine_id = "projects/git-with-intent/locations/us-central1/reasoningEngines/1234567890123456789"
triage_engine_id       = "projects/git-with-intent/locations/us-central1/reasoningEngines/2345678901234567890"
resolver_engine_id     = "projects/git-with-intent/locations/us-central1/reasoningEngines/3456789012345678901"
reviewer_engine_id     = "projects/git-with-intent/locations/us-central1/reasoningEngines/4567890123456789012"
```

Re-apply OpenTofu to inject Engine IDs into Cloud Run services:

```bash
tofu apply -var-file=envs/dev.tfvars
```

### Manual Operations

List deployed agents:
```bash
gcloud ai reasoning-engines list --project=git-with-intent --region=us-central1
```

Get agent details:
```bash
gcloud ai reasoning-engines describe {ENGINE_ID} --project=git-with-intent --region=us-central1
```

Test an agent:
```bash
gcloud ai reasoning-engines query {ENGINE_ID} \
  --project=git-with-intent \
  --region=us-central1 \
  --input='{"message": "test"}'
```

Delete an agent:
```bash
gcloud ai reasoning-engines delete {ENGINE_ID} --project=git-with-intent --region=us-central1
```

### Required Secrets

Agent Engine requires API keys stored in Secret Manager (manual creation):

```bash
# Anthropic API Key (Claude models)
echo -n "sk-ant-..." | gcloud secrets create gwi-anthropic-api-key \
  --project=git-with-intent \
  --replication-policy=automatic \
  --data-file=-

# Google AI API Key (Gemini models)
echo -n "..." | gcloud secrets create gwi-google-ai-api-key \
  --project=git-with-intent \
  --replication-policy=automatic \
  --data-file=-

# GitHub Token
echo -n "ghp_..." | gcloud secrets create gwi-github-token \
  --project=git-with-intent \
  --replication-policy=automatic \
  --data-file=-
```

### Monitoring

Agent Engine operations are observable via:

1. **Cloud Logging**: Agent invocation logs, errors, stack traces
2. **Cloud Trace**: Distributed tracing across API → Gateway → Agent Engine
3. **Cloud Monitoring**: Error rate, latency, and availability alerts (see `monitoring.tf`)
4. **Pub/Sub Metrics**: Worker queue depth, DLQ size, message delivery rates

Dashboard: https://console.cloud.google.com/monitoring

## Observability & Alerting (B13)

Comprehensive observability is configured in `monitoring.tf`. This section describes alert thresholds, notification channels, and budget monitoring.

### Alert Thresholds

| Alert Type | Threshold | Severity | Description |
|------------|-----------|----------|-------------|
| Error Rate | > 5% 5xx responses | Critical | Cloud Run services returning server errors |
| Latency | > 5000ms P95 | Warning | High response times affecting user experience |
| Uptime | Failing for 5 min | Critical | Health check failures from multiple regions |
| Critical Errors | > 10/min | Critical | Error-level log entries spiking |
| Budget Warning | $50 (50%) | Warning | Halfway to monthly budget |
| Budget Elevated | $80 (80%) | Warning | Approaching budget limit |
| Budget Critical | $100 (100%) | Critical | Monthly budget exceeded |
| Budget Overspend | $120 (120%) | Critical | Significant overspend |

### Uptime Checks

External HTTP health checks monitor all Cloud Run services:

| Service | Endpoint | Check Period | Timeout |
|---------|----------|--------------|---------|
| A2A Gateway | `/health` | 5 minutes | 10s |
| GitHub Webhook | `/health` | 5 minutes | 10s |
| GWI API | `/health` | 5 minutes | 10s |
| GWI Worker | `/health` | 5 minutes | 10s |

Checks run from multiple global regions and alert if health checks fail from multiple locations.

### Log-Based Metrics

Custom metrics extracted from Cloud Run logs:

| Metric | Description | Filter |
|--------|-------------|--------|
| `gwi-critical-errors-{env}` | Error/Fatal level logs | `severity >= ERROR` |
| `gwi-auth-failures-{env}` | Authentication failures | 401/403 responses |
| `gwi-ai-errors-{env}` | AI/LLM API errors | Anthropic/Vertex AI failures |

### Notification Channels

Configure notification channels in your tfvars file:

```hcl
# Email notifications (recommended)
alert_email = "alerts@example.com"

# Additional channels (optional)
alert_notification_channels = [
  "projects/PROJECT/notificationChannels/CHANNEL_ID"
]
```

**To add Slack/PagerDuty notifications:**

1. Create notification channel in GCP Console:
   - Go to Monitoring > Alerting > Edit Notification Channels
   - Add Slack, PagerDuty, or other channel
   - Copy the channel ID

2. Add to tfvars:
   ```hcl
   alert_notification_channels = [
     "projects/git-with-intent/notificationChannels/123456789"
   ]
   ```

### Budget Configuration

**Prerequisites:**
- Billing account ID (format: `XXXXXX-XXXXXX-XXXXXX`)
- Billing Account Viewer role on the billing account

**Enable budget alerts:**

```hcl
# Required
enable_budget_alerts = true
billing_account_id   = "012345-ABCDEF-012345"

# Optional (defaults shown)
monthly_budget_amount     = 100   # Total budget in USD
budget_warning_threshold  = 0.5   # Alert at 50% ($50)
alert_email              = "billing@example.com"
```

**Budget alert thresholds (with $100 default budget):**
- $50 (50%): Early warning
- $80 (80%): Elevated warning
- $100 (100%): Budget reached
- $120 (120%): Overspend alert
- 100% forecasted: Proactive alert based on spending trend

Budget alerts are sent to:
- Email notification channel (if configured)
- Pub/Sub topic `gwi-budget-alerts-{env}` (for programmatic handling)

### Disable Monitoring

To disable all monitoring resources:

```hcl
enable_alerts        = false
enable_budget_alerts = false
```

### View Alerts in Console

| Resource | Console Link |
|----------|--------------|
| Alert Policies | https://console.cloud.google.com/monitoring/alerting |
| Uptime Checks | https://console.cloud.google.com/monitoring/uptime |
| Log-Based Metrics | https://console.cloud.google.com/logs/metrics |
| Budgets | https://console.cloud.google.com/billing |
| Dashboards | https://console.cloud.google.com/monitoring/dashboards |

### Reference Documentation

- Comprehensive deployment guide: `agent_engine.tf`
- Vertex AI Agent Engine docs: https://cloud.google.com/vertex-ai/docs/reasoning-engine
- ADK documentation: https://cloud.google.com/vertex-ai/docs/adk
- Agent Engine Context: `../archive-docs/044-DR-GUID-agent-engine-context.md`
- Compliance Checklist: `../archive-docs/045-DR-CHKL-agent-engine-compliance.md`

---

intent solutions io
