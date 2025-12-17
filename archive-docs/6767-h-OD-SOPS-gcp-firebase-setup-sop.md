# GCP/FIREBASE SETUP SOP (Standard Operating Procedure)

**Document ID:** 6767-h
**Purpose:** Universal cloud infrastructure setup procedure for Intent Solutions projects
**Status:** Production Standard
**Last Updated:** 2025-12-15
**Applies To:** All GCP/Firebase deployments in intent-solutions-io

---

## 1. GCP Project Naming Rules

### 1.1 Hard Rules (Non-Negotiable)

| Rule | Rationale |
|------|-----------|
| **No numbers in project IDs** | Cleaner URLs, easier to remember, consistent branding |
| **Name as close to project name as feasible** | Discoverability, reduces cognitive load |
| **Lowercase with hyphens only** | GCP naming requirements |
| **Max 30 characters** | GCP limit |

### 1.2 Naming Pattern

```
<project-name>[-<env>]

Examples:
- intentvision          (single project, all environments)
- intentvision-dev      (if separate dev project needed)
- intentvision-prod     (if separate prod project needed)
```

### 1.3 What NOT to Do

```
❌ intentvision-123456    (no random numbers)
❌ iv-prod-2025          (no years/dates)
❌ intent_vision         (no underscores)
❌ IntentVision          (no uppercase)
```

---

## 2. One-Project Default

### 2.1 Default Assumption

**One GCP project per Intent Solutions application** unless explicitly instructed otherwise.

### 2.2 When One Project Works

- Development, staging, production in same project
- Environment isolation via naming conventions
- Resource tagging for cost tracking
- Simpler IAM management

### 2.3 When to Split Projects

Only split into multiple projects if:
- Regulatory/compliance requires hard isolation
- Cost allocation must be at project level
- Different teams need fully separate IAM
- Explicit instruction from project owner

---

## 3. Environment Strategy (Within One Project)

### 3.1 Environment Naming

```
Resources follow: <project>-<resource>-<env>

Examples:
- intentvision-api-dev
- intentvision-api-staging
- intentvision-api-prod
- intentvision-db-dev
- intentvision-scheduler-prod
```

### 3.2 Environment Labels

All resources must have:

```yaml
labels:
  project: intentvision
  environment: dev | staging | prod
  managed-by: terraform | manual
```

### 3.3 Environment-Specific Configs

| Aspect | Dev | Staging | Prod |
|--------|-----|---------|------|
| Min instances | 0 | 1 | 2+ |
| Scaling | Aggressive down | Moderate | Conservative |
| Logging level | DEBUG | INFO | INFO |
| Alerting | Slack only | Slack + email | PagerDuty |
| Data | Synthetic/masked | Anonymized prod | Real |

---

## 4. Identity & Deploy Posture

### 4.1 Workload Identity Federation (WIF)

**Default:** GitHub Actions authenticate to GCP via WIF. No long-lived service account keys.

```yaml
# GitHub Actions setup
- uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: 'projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider'
    service_account: 'github-deploy@PROJECT_ID.iam.gserviceaccount.com'
```

### 4.2 Service Account Strategy

| Account | Purpose | Permissions |
|---------|---------|-------------|
| `github-deploy@` | CI/CD deployments | Cloud Run Admin, Secret Accessor |
| `app-runtime@` | Application workloads | Minimal per-service |
| `terraform@` | Infrastructure management | Project Editor (limited) |

### 4.3 Key Management Rules

| Rule | Enforcement |
|------|-------------|
| No downloaded keys | Use WIF or impersonation |
| No keys in repos | Secret scanning blocks |
| Rotate if leaked | Immediate revocation |
| Prefer WIF always | Keys only for legacy systems |

---

## 5. Baseline Services Checklist

### 5.1 Compute & Runtime

| Service | Purpose | Default Config |
|---------|---------|----------------|
| **Cloud Run** | API services, workers | Gen2, min 0 (dev), min 1 (prod) |
| **Cloud Scheduler** | Cron jobs | Per-environment schedules |
| **Cloud Tasks** | Async job queue | Default queue per service |

### 5.2 Data & Storage

| Service | Purpose | Default Config |
|---------|---------|----------------|
| **BigQuery** | Analytics, metrics | Per-environment datasets |
| **Firestore** | User data, real-time | Native mode, per-env collections |
| **Cloud Storage** | Blobs, exports | Regional, standard class |

### 5.3 Messaging & Events

| Service | Purpose | Default Config |
|---------|---------|----------------|
| **Pub/Sub** | Event bus | Topic per domain event |
| **Eventarc** | Event routing | Cloud Run triggers |

### 5.4 Security & Secrets

| Service | Purpose | Default Config |
|---------|---------|----------------|
| **Secret Manager** | Credentials, API keys | Per-environment versions |
| **Cloud Armor** | WAF, DDoS protection | Prod only (cost) |
| **VPC** | Network isolation | Default VPC acceptable for most |

### 5.5 Observability

| Service | Purpose | Default Config |
|---------|---------|----------------|
| **Cloud Logging** | Structured logs | 30-day retention (default) |
| **Cloud Monitoring** | Metrics, dashboards | Per-service dashboards |
| **Cloud Trace** | Distributed tracing | Sample 1% prod, 100% dev |
| **Error Reporting** | Exception tracking | Auto-enabled |

### 5.6 Firebase Services

| Service | Purpose | Default Config |
|---------|---------|----------------|
| **Firebase Hosting** | Static assets, CDN | Per-environment sites |
| **Firebase Auth** | User authentication | Email + Google OAuth minimum |
| **Firestore** | (same as above) | Linked to GCP project |

---

## 6. Multi-Agent Structure (bobs-brain Default)

### 6.1 Default Assumption

Projects following this SOP use the **bobs-brain multi-agent structure**:
- **Foreman agent** orchestrates work
- **Specialist agents** handle domain-specific tasks
- **Customization allowed** while preserving core patterns

Reference: https://github.com/intent-solutions-io/bobs-brain.git

### 6.2 Customization Guidelines

| Can Customize | Cannot Change |
|---------------|---------------|
| Number of specialists | Foreman/specialist pattern |
| Agent technologies | Task ID traceability |
| Communication protocols | AAR evidence requirements |
| Scaling strategies | Doc filing standards |

---

## 7. Beads + AAR Integration

### 7.1 Task ID Discipline

Every GCP resource change must:
1. Be associated with a Task ID (Beads or interim)
2. Reference the Task ID in Terraform commit messages
3. Appear in the phase AAR

### 7.2 Evidence in AARs

Cloud-related AARs must include:

```markdown
## Evidence Links / Artifacts

### GCP Resources Created/Modified

| Resource | Type | Environment | Task ID |
|----------|------|-------------|---------|
| intentvision-api | Cloud Run | prod | bd-xxxx |
| intentvision-metrics | BigQuery Dataset | all | bd-yyyy |

### Terraform State

| Workspace | State Location | Last Apply |
|-----------|----------------|------------|
| prod | gs://intentvision-terraform/prod | 2025-12-15 |
```

---

## 8. Setup Procedure

### 8.1 New Project Checklist

```bash
# 1. Create GCP project (if new)
gcloud projects create <project-name> --organization=<ORG_ID>

# 2. Enable required APIs
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  bigquery.googleapis.com \
  pubsub.googleapis.com \
  cloudscheduler.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  cloudtrace.googleapis.com \
  firestore.googleapis.com

# 3. Set up WIF for GitHub Actions
# (Follow docs/identity-setup.md or GCP console)

# 4. Create baseline Terraform
# (See infrastructure/terraform/ in project repo)

# 5. Initialize Firebase
firebase projects:addfirebase <project-name>
```

### 8.2 Verification Checklist

- [ ] Project ID follows naming rules (no numbers, matches project name)
- [ ] WIF configured for GitHub Actions
- [ ] No service account keys downloaded
- [ ] Baseline APIs enabled
- [ ] Labels applied to all resources
- [ ] Environments clearly separated

---

## 9. Quick Reference

### Naming Cheatsheet

```
Project:    intentvision
Cloud Run:  intentvision-api-{dev|staging|prod}
BigQuery:   intentvision_metrics_{dev|staging|prod}
Pub/Sub:    intentvision-events-{dev|staging|prod}
Secrets:    intentvision-{secret-name}-{dev|staging|prod}
Storage:    intentvision-assets-{dev|staging|prod}
```

### Environment Commands

```bash
# Switch environment context
gcloud config set project intentvision
export ENV=dev  # or staging, prod

# Deploy to specific environment
gcloud run deploy intentvision-api-$ENV ...
```

---

## References

- 6767-a: Document Filing System Standard
- 6767-b: AAR Template
- 6767-f: Work Tracking Standard
- 6767-g: Beads + AgentFS Complementary Systems
- bobs-brain: https://github.com/intent-solutions-io/bobs-brain.git

---

**GCP/FIREBASE SETUP SOP — Intent Solutions Standard**
*One project. No numbers. Clear environments. Traceable changes.*
