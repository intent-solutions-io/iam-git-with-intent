# Git With Intent - Infrastructure (OpenTofu)

Infrastructure as Code for Git With Intent using OpenTofu (open-source Terraform alternative).

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
```

## State Management

- **Backend**: GCS bucket `git-with-intent-tofu-state`
- **Prefix**: `opentofu/state`
- **Versioning**: Enabled for rollback protection

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

- CI runs `tofu plan` on every PR
- Scheduled nightly drift checks against production
- Drift detection opens GitHub issue automatically

## Resources Managed

- **Cloud Run**: API, Gateway, Webhook, Worker services
- **Artifact Registry**: Docker image repository
- **Secret Manager**: API keys, webhook secrets
- **IAM**: Service accounts, WIF configuration
- **Monitoring**: Dashboards, alerts, uptime checks
- **Budgets**: Cost alerts and caps

## Migration from Terraform

This project migrated from Terraform to OpenTofu in December 2025.
OpenTofu is fully compatible with Terraform HCL syntax.

```bash
# Terraform commands map directly to OpenTofu:
# terraform init  → tofu init
# terraform plan  → tofu plan
# terraform apply → tofu apply
```

### State Migration Strategy

**Approach: GREENFIELD DEPLOYMENT**

Pre-existing GCP resources (deployed manually or via legacy scripts) use different naming:
- Legacy: `gwi-gateway`, `gwi-github-webhook`
- OpenTofu: `git-with-intent-a2a-gateway-{env}`, `git-with-intent-github-webhook-{env}`

Rather than import these mismatched resources, we opted for a clean greenfield deployment:
- OpenTofu manages all resources it creates
- Legacy resources can be deprecated/deleted manually
- Clean state with no import complexity
- `tofu plan` shows: **47 to add, 0 to change, 0 to destroy**

---

intent solutions io
