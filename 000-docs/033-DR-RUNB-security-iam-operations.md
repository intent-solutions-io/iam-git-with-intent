# Security, IAM & Secrets Operations Runbook

**Epic D: Security/IAM/Secrets + ARV Gates**
**Version:** 1.0.0
**Last Updated:** 2026-01-30

## Overview

This document covers the security infrastructure for Git With Intent, including:
- D1: Secrets inventory and Secret Manager configuration
- D2: IAM least privilege enforcement
- D3: Webhook signature validation with replay protection
- D4: ARV gates blocking merges in CI

## Secrets Management (D1)

### Secret Inventory

| Secret ID | Purpose | Services |
|-----------|---------|----------|
| `gwi-github-app-private-key` | GitHub App authentication | gateway, webhook, worker, agent_engine |
| `gwi-github-webhook-secret` | Webhook signature validation | webhook |
| `gwi-anthropic-api-key` | Claude API access | worker, agent_engine |
| `gwi-google-ai-api-key` | Gemini API access | worker, agent_engine |
| `gwi-stripe-secret-key` | Stripe billing operations | api |
| `gwi-stripe-webhook-secret` | Stripe webhook validation | api |

### Secret Access Matrix

| Service Account | Secrets Accessible |
|-----------------|-------------------|
| `gwi-agent-{env}` | anthropic-api-key, google-ai-api-key, github-app-private-key |
| `gwi-a2a-{env}` | github-app-private-key |
| `gwi-github-{env}` | github-app-private-key, github-webhook-secret |
| `gwi-worker-{env}` | github-app-private-key, anthropic-api-key, google-ai-api-key |
| `gwi-api-{env}` | stripe-secret-key, stripe-webhook-secret |

### Managing Secrets

```bash
# Create a secret
gcloud secrets create gwi-new-secret \
  --project=git-with-intent \
  --replication-policy="automatic"

# Add secret version
echo -n "secret-value" | gcloud secrets versions add gwi-new-secret \
  --project=git-with-intent \
  --data-file=-

# Grant access (should be done via Terraform)
gcloud secrets add-iam-policy-binding gwi-new-secret \
  --project=git-with-intent \
  --member="serviceAccount:gwi-worker-prod@git-with-intent.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Rotating Secrets

1. Create new secret version
2. Update services to use new version (via restart or config update)
3. Verify services are healthy
4. Disable old version
5. Delete old version after grace period

```bash
# Add new version
gcloud secrets versions add gwi-github-webhook-secret \
  --project=git-with-intent \
  --data-file=new-secret.txt

# Disable old version
gcloud secrets versions disable 1 \
  --secret=gwi-github-webhook-secret \
  --project=git-with-intent

# Delete old version (after verification)
gcloud secrets versions destroy 1 \
  --secret=gwi-github-webhook-secret \
  --project=git-with-intent
```

## IAM Least Privilege (D2)

### Service Account Architecture

Located in: `infra/iam.tf`

```
Service Accounts:
├── gwi-agent-{env}    # Agent Engine operations
├── gwi-a2a-{env}      # A2A Gateway
├── gwi-github-{env}   # GitHub webhook handler
├── gwi-ci             # GitHub Actions CI/CD
├── gwi-api-{env}      # API service (conditional)
└── gwi-worker-{env}   # Worker service (conditional)
```

### Role Assignments

| Service Account | Roles |
|-----------------|-------|
| agent_engine | aiplatform.user, ml.developer, logging.logWriter, cloudtrace.agent |
| a2a_gateway | aiplatform.user, logging.logWriter |
| github_webhook | aiplatform.user, logging.logWriter |
| github_actions | run.admin, aiplatform.admin, storage.admin, artifactregistry.admin |

### Workload Identity Federation

GitHub Actions uses WIF for keyless authentication:

```hcl
# Pool configured for intent-solutions-io organization
attribute_condition = "assertion.repository_owner == 'intent-solutions-io'"

# Service account binding scoped to specific repository
member = "principalSet://iam.googleapis.com/${pool}/attribute.repository/intent-solutions-io/git-with-intent"
```

### Auditing IAM

```bash
# List all service accounts
gcloud iam service-accounts list --project=git-with-intent

# Get IAM policy for a service account
gcloud iam service-accounts get-iam-policy \
  gwi-agent-prod@git-with-intent.iam.gserviceaccount.com

# List secret access bindings
gcloud secrets get-iam-policy gwi-github-webhook-secret \
  --project=git-with-intent
```

## Webhook Security (D3)

### Signature Validation

Located in: `packages/core/src/security/`

**Algorithm:** HMAC-SHA256 with timing-safe comparison

```typescript
import { verifyGitHubWebhookSignature } from '@gwi/core';

const result = verifyGitHubWebhookSignature(
  rawBody,
  req.headers['x-hub-signature-256'],
  webhookSecret
);

if (!result.valid) {
  return res.status(401).json({ error: result.error });
}
```

### Replay Protection

**Mechanism:** Idempotency via X-GitHub-Delivery header

Located in: `apps/github-webhook/src/index.ts`

1. Every GitHub webhook includes unique `X-GitHub-Delivery` header
2. Webhook handler uses this as idempotency key
3. Duplicate deliveries are rejected with 409 Conflict
4. Keys expire after configured TTL (default: 24 hours)

### Security Properties

| Property | Implementation |
|----------|----------------|
| Timing-safe comparison | `crypto.timingSafeEqual()` |
| Signature algorithm | SHA-256 (SHA-1 legacy support) |
| Replay protection | Delivery ID tracking |
| Secret leakage prevention | Error messages don't reveal secret |
| Unicode handling | Proper encoding for all payloads |

### Verifying Webhook Security

```bash
# Test webhook signature validation
curl -X POST https://webhook.gwi.dev/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: ping" \
  -H "X-GitHub-Delivery: test-123" \
  -H "X-Hub-Signature-256: sha256=invalid" \
  -d '{"action":"ping"}'

# Should return 401 Unauthorized
```

## ARV Gates in CI (D4)

### Quality Gate Pipeline

Located in: `.github/workflows/ci.yml`

```
quality-checks → build → build-images → deploy-*
       ↑
   ARV Check
```

**Blocking:** PRs cannot merge if ARV fails.

### ARV Checks

| Check | Description | Blocks Merge? |
|-------|-------------|---------------|
| Agent run method | Verifies async run/processTask exists | No (warning) |
| Error handling | Checks for try/catch blocks | No (warning) |
| Model configuration | Verifies model config present | No (warning) |
| SPIFFE ID (hard mode) | Checks for SPIFFE identity | No |
| Audit logging (hard mode) | Verifies audit calls | No |

### Running ARV Locally

```bash
# Standard mode
npm run arv

# Or directly
./scripts/ci/check_arv.sh

# Hard mode (full checks)
HARD_MODE=true ./scripts/ci/check_arv.sh
```

### ARV Gate Files

| Gate | Purpose |
|------|---------|
| `scripts/arv/security-gate.ts` | Security validation |
| `scripts/arv/identity-gate.ts` | Identity/auth checks |
| `scripts/arv/reliability-gate.ts` | Reliability patterns |
| `scripts/arv/observability-gate.ts` | Logging/tracing |
| `scripts/arv/planner-gate.ts` | Plan validation |
| `scripts/arv/openapi-gate.ts` | API schema validation |
| `scripts/arv/connector-supply-chain.ts` | Connector trust |
| `scripts/arv/marketplace-gate.ts` | Marketplace validation |
| `scripts/arv/merge-resolver-gate.ts` | Merge resolution |
| `scripts/arv/forensics-gate.ts` | Audit trail checks |
| `scripts/arv/ga-readiness-gate.ts` | GA readiness |

## Operations

### Investigating Security Issues

```bash
# Check for auth failures in logs
gcloud logging read \
  'jsonPayload.eventName=~"auth.failure|webhook.verify.failure"' \
  --project=git-with-intent \
  --limit=50

# Check IAM audit logs
gcloud logging read \
  'protoPayload.serviceName="iam.googleapis.com"' \
  --project=git-with-intent \
  --limit=20
```

### Emergency: Revoke Access

```bash
# Remove service account from secret
gcloud secrets remove-iam-policy-binding gwi-github-webhook-secret \
  --project=git-with-intent \
  --member="serviceAccount:compromised-sa@git-with-intent.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Disable service account
gcloud iam service-accounts disable \
  compromised-sa@git-with-intent.iam.gserviceaccount.com
```

### Emergency: Rotate Compromised Secret

```bash
# 1. Add new version
gcloud secrets versions add gwi-compromised-secret \
  --project=git-with-intent \
  --data-file=new-secret.txt

# 2. Restart affected services
gcloud run services update gwi-webhook \
  --region=us-central1 \
  --no-traffic

# 3. Disable old version immediately
gcloud secrets versions disable OLD_VERSION \
  --secret=gwi-compromised-secret \
  --project=git-with-intent
```

## Terraform Reference

### Enable Secret Bindings

```hcl
variable "enable_secret_bindings" {
  description = "Enable per-secret IAM bindings (requires secrets to exist)"
  type        = bool
  default     = false
}
```

Set to `true` after secrets are created:
```bash
cd infra
tofu apply -var="enable_secret_bindings=true" -var-file=envs/prod.tfvars
```

### Enable Stripe Integration

```hcl
variable "enable_stripe" {
  description = "Enable Stripe billing integration"
  type        = bool
  default     = false
}
```

## Related Documentation

- [Secrets Inventory](./000-docs/XXX-secrets-inventory.md) - PR #47
- [Threat Model](./000-docs/110-DR-TMOD-security-threat-model.md)
- [Observability Runbook](./000-docs/032-OD-RUNB-observability-operations.md)
