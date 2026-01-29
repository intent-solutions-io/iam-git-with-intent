# Git With Intent: Secrets Inventory & Secret Manager Integration
*Task: D1 (bd-t3l.1)*
*Generated: 2026-01-29*
*Status: Production Reference*

---

## Executive Summary

This document inventories all secrets used by Git With Intent and documents how they are accessed via Google Cloud Secret Manager in production.

**Key Findings:**
- 14 distinct secrets identified across the system
- Secret Manager integration already implemented in `apps/webhook-receiver/src/secrets.ts`
- OpenTofu IAM bindings properly configured for least-privilege access
- No hardcoded secrets found in codebase

---

## 1. Secrets Inventory

### 1.1 AI Provider Secrets

| Secret Name | Environment Variable | Secret Manager ID | Used By | Required |
|-------------|---------------------|-------------------|---------|----------|
| Anthropic API Key | `ANTHROPIC_API_KEY` | `gwi-anthropic-api-key` | agents, planner | Yes (one of) |
| Google AI API Key | `GOOGLE_AI_API_KEY` | `gwi-google-ai-api-key` | agents, planner | Yes (one of) |
| Nixtla/TimeGPT Key | `NIXTLA_API_KEY` | `gwi-nixtla-api-key` | forecasting | Optional |

### 1.2 GitHub Integration Secrets

| Secret Name | Environment Variable | Secret Manager ID | Used By | Required |
|-------------|---------------------|-------------------|---------|----------|
| GitHub App Private Key | `GITHUB_APP_PRIVATE_KEY` | `gwi-github-app-private-key` | gateway, webhook | Yes |
| GitHub Webhook Secret | `GITHUB_WEBHOOK_SECRET` | `gwi-github-webhook-secret` | github-webhook | Yes |
| GitHub Token (CI) | `GITHUB_TOKEN` | (GitHub Actions built-in) | CI/CD | Yes |

### 1.3 Billing Secrets (Stripe)

| Secret Name | Environment Variable | Secret Manager ID | Used By | Required |
|-------------|---------------------|-------------------|---------|----------|
| Stripe Secret Key | `STRIPE_SECRET_KEY` | `gwi-stripe-secret-key` | api | Conditional |
| Stripe Webhook Secret | `STRIPE_WEBHOOK_SECRET` | `gwi-stripe-webhook-secret` | api | Conditional |

### 1.4 Webhook Provider Secrets

| Secret Name | Environment Variable | Secret Manager ID | Used By | Required |
|-------------|---------------------|-------------------|---------|----------|
| GitLab Webhook Secret | `GWI_WEBHOOK_SECRET_GITLAB` | `gwi-webhook-secret-gitlab` | webhook-receiver | Optional |
| Linear Webhook Secret | `GWI_WEBHOOK_SECRET_LINEAR` | `gwi-webhook-secret-linear` | webhook-receiver | Optional |
| Slack Webhook Secret | `GWI_WEBHOOK_SECRET_SLACK` | `gwi-webhook-secret-slack` | webhook-receiver | Optional |

### 1.5 Publishing Secrets

| Secret Name | Environment Variable | Secret Manager ID | Used By | Required |
|-------------|---------------------|-------------------|---------|----------|
| NPM Token | `NPM_TOKEN` | (GitHub Secrets) | CI/CD release | Optional |

### 1.6 Firebase/Web Secrets

| Secret Name | Environment Variable | Secret Manager ID | Used By | Required |
|-------------|---------------------|-------------------|---------|----------|
| Firebase API Key | `VITE_FIREBASE_API_KEY` | (public, in .env) | web | Yes |
| Firebase Auth Domain | `VITE_FIREBASE_AUTH_DOMAIN` | (public, in .env) | web | Yes |
| Firebase Project ID | `VITE_FIREBASE_PROJECT_ID` | (public, in .env) | web | Yes |

**Note:** Firebase web config is intentionally public (client-side). Security is enforced via Firestore rules.

---

## 2. Secret Manager IAM Bindings

The following IAM bindings are configured in `infra/iam.tf`:

### 2.1 Per-Service Secret Access

| Service Account | Secrets Accessible | Justification |
|-----------------|-------------------|---------------|
| `gwi-gateway@` | `gwi-github-app-private-key` | GitHub API calls |
| `gwi-github-webhook@` | `gwi-github-app-private-key`, `gwi-github-webhook-secret` | Webhook validation |
| `gwi-api@` | `gwi-stripe-secret-key`, `gwi-stripe-webhook-secret` | Billing operations |
| `gwi-worker@` | `gwi-github-app-private-key` | Background GitHub operations |
| `gwi-webhook-receiver@` | `gwi-webhook-secret-*` | Multi-provider webhook validation |

### 2.2 IAM Role

All secret access uses `roles/secretmanager.secretAccessor` (read-only).

---

## 3. Secret Manager Integration Pattern

### 3.1 Implementation (apps/webhook-receiver/src/secrets.ts)

```typescript
// Production: Uses GCP Secret Manager
// Development: Falls back to environment variables

export function createSecretManager(): ISecretManager {
  const projectId = process.env.GCP_PROJECT_ID;
  const isProduction = process.env.DEPLOYMENT_ENV === 'prod';

  if (isProduction && projectId) {
    return new GCPSecretManager(projectId);
  }

  return new EnvSecretManager();
}
```

### 3.2 Naming Convention

| Context | Format | Example |
|---------|--------|---------|
| Environment Variable | `GWI_WEBHOOK_SECRET_GITHUB` | `GWI_WEBHOOK_SECRET_GITHUB=abc123` |
| Secret Manager ID | `gwi-webhook-secret-github` | `projects/gwi/secrets/gwi-webhook-secret-github` |

### 3.3 Access Pattern

```typescript
// Get secret for webhook validation
const secret = await secretManager.getSecret(tenantId, 'webhook-secret-github');
// In prod: fetches from projects/gwi/secrets/gwi-webhook-secret-github/versions/latest
// In dev: reads from process.env.GWI_WEBHOOK_SECRET_GITHUB
```

---

## 4. GitHub Actions Secrets

| Secret | Workflow | Purpose |
|--------|----------|---------|
| `GITHUB_TOKEN` | All | GitHub API access (built-in) |
| `ANTHROPIC_API_KEY` | auto-fix.yml | AI-powered fixes |
| `GOOGLE_AI_API_KEY` | auto-fix.yml | AI-powered fixes |
| `NPM_TOKEN` | release.yml | Package publishing |

**WIF Secrets (via Workload Identity Federation):**
- `WIF_PROVIDER` - Workload Identity Pool Provider
- `WIF_SERVICE_ACCOUNT` - Service account for deployments

---

## 5. Secret Lifecycle

### 5.1 Creation (Manual via gcloud)

Secrets are created manually or via gcloud CLI, not Terraform:

```bash
# Create secret
gcloud secrets create gwi-github-webhook-secret \
  --project=git-with-intent \
  --replication-policy=automatic

# Add version
echo -n "your-webhook-secret" | \
  gcloud secrets versions add gwi-github-webhook-secret \
  --project=git-with-intent \
  --data-file=-
```

### 5.2 Rotation

| Secret Type | Rotation Frequency | Procedure |
|-------------|-------------------|-----------|
| GitHub Webhook | On compromise | Regenerate in GitHub, update Secret Manager |
| Stripe Keys | On compromise | Rotate in Stripe Dashboard, update Secret Manager |
| AI API Keys | Annually | Generate new key, update Secret Manager, revoke old |

### 5.3 Access Audit

```bash
# View secret access logs
gcloud logging read \
  'resource.type="audited_resource" AND
   protoPayload.serviceName="secretmanager.googleapis.com"' \
  --project=git-with-intent \
  --limit=50
```

---

## 6. Local Development

### 6.1 Setup

Create `.env.local` (gitignored):

```bash
# AI Providers (at least one required)
ANTHROPIC_API_KEY=<your-anthropic-key>
GOOGLE_AI_API_KEY=<your-google-ai-key>

# GitHub (for local testing)
GITHUB_TOKEN=<your-github-token>
GWI_WEBHOOK_SECRET_GITHUB=<your-webhook-secret>

# Optional
STRIPE_SECRET_KEY=<your-stripe-key>
STRIPE_WEBHOOK_SECRET=<your-stripe-webhook-secret>
```

### 6.2 Verification

```bash
# Check required secrets are set
node -e "console.log('ANTHROPIC:', !!process.env.ANTHROPIC_API_KEY)"
node -e "console.log('GOOGLE_AI:', !!process.env.GOOGLE_AI_API_KEY)"
```

---

## 7. Security Controls

### 7.1 Preventive Controls

- [x] No secrets in source code (grep verified)
- [x] `.env*` in `.gitignore` (except `.env.example`)
- [x] Secret Manager for production
- [x] Least-privilege IAM bindings
- [x] Pre-commit secret scanning (via husky hooks)

### 7.2 Detective Controls

- [x] Cloud Audit Logs for secret access
- [x] GitHub secret scanning enabled
- [ ] TODO: Alert on unusual secret access patterns

### 7.3 Verification Commands

```bash
# Check no secrets in repo
git secrets --scan 2>/dev/null || \
  grep -rE "(sk-ant-|AIza[A-Za-z0-9]{35}|ghp_[A-Za-z0-9]{36})" --include="*.ts" .

# Verify .env files are gitignored
git check-ignore .env .env.local .env.production
```

---

## 8. Action Items

| Priority | Action | Status |
|----------|--------|--------|
| P0 | Verify all Secret Manager secrets exist | TODO |
| P0 | Test secret access from Cloud Run services | TODO |
| P1 | Add missing secrets to Secret Manager | TODO |
| P1 | Document secret rotation runbook | TODO |
| P2 | Set up secret access alerting | TODO |

---

## Appendix: Environment Variables Reference

### Required for Production

```bash
# Infrastructure
GCP_PROJECT_ID=git-with-intent
DEPLOYMENT_ENV=prod

# AI (at least one)
# Accessed via Secret Manager in production
```

### Optional Configuration

```bash
# Logging
LOG_LEVEL=INFO
APP_VERSION=0.5.1
APP_NAME=gwi

# Feature Flags
GWI_PLANNER_ENABLED=1
GWI_FORENSICS_ENABLED=0
GWI_METERING_ENABLED=1

# Storage
GWI_STORE_BACKEND=firestore
```

---

*Document created as part of Epic D: Security/IAM/Secrets + ARV Gates*
