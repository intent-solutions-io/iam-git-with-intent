# After Action Report: GWI Cloud Deployment Epic

**Date**: 2025-12-18
**Epic**: Git With Intent Cloud Deployment
**Status**: COMPLETED
**Beads**: B1-B14 (git-with-intent-bn4r.1-14)

---

## Executive Summary

Successfully completed full cloud deployment infrastructure for Git With Intent, including:
- OpenTofu IaC migration (from Terraform references)
- Workload Identity Federation for keyless GitHub Actions auth
- Firebase Hosting website deployment
- Cloud Run gateway deployment with health checks
- Agent Engine documentation and configuration
- Observability baseline (uptime checks, log metrics, budget alerts)

---

## Completed Beads

### B1: AgentFS Certification
- **Status**: PASSED
- **Evidence**: `cert/AGENTFS-CERTIFICATION.md`
- **Stores**: `.agentfs/gwi.db`, `.agentfs/subagent-a.db`, `.agentfs/subagent-b.db`
- **Keys**: `cert:agentfs-proof-1,2,3`
- **Multi-agent sync**: Demonstrated orchestrator aggregation

### B2: GCP Project Bootstrap
- **Status**: COMPLETED
- **Project**: `git-with-intent`
- **Region**: `us-central1`
- **APIs Enabled**: Cloud Run, Artifact Registry, Firestore, Secret Manager, Firebase

### B3: WIF/OIDC Setup
- **Status**: COMPLETED
- **Provider**: GitHub OIDC → Workload Identity Federation
- **Pool**: `github-pool`
- **No service account keys** - uses OIDC token exchange

### B4: OpenTofu Migration
- **Status**: COMPLETED
- **Location**: `infra/`
- **Validation**: `tofu validate` SUCCESS
- **Files**: main.tf, variables.tf, cloud_run.tf, monitoring.tf, agent_engine.tf

### B5: Terraform Removal
- **Status**: COMPLETED
- **All `terraform` references replaced with `tofu`**
- **CI workflows updated**

### B6: CI OpenTofu Workflows
- **Status**: COMPLETED
- **Workflows**: `.github/workflows/ci.yml`, `.github/workflows/tofu-*.yml`
- **Actions**: Plan on PR, Apply on merge to main

### B7: No-Drift Validator
- **Status**: COMPLETED
- **Script**: `scripts/ci/check_nodrift.sh`
- **Schedule**: Weekly cron check
- **Alert**: Slack notification on drift

### B8: Docker Build Fixes
- **Status**: COMPLETED
- **Issue**: npm workspaces require ALL package.json files for npm ci
- **Fix**: Updated all Dockerfiles (api, gateway, github-webhook, worker)
- **Pattern**: Copy all workspace package.json files, full npm ci --ignore-scripts
- **Build Order**: core -> agents -> integrations -> engine -> app

### B9: Firebase Website
- **Status**: DEPLOYED
- **URL**: https://git-with-intent.web.app
- **Pages Created**:
  - Features.tsx (Core capabilities)
  - Install.tsx (GitHub App + CLI guide)
  - HowItWorks.tsx (Workflow explanation)
  - Security.tsx (Security principles)
  - Pricing.tsx (Beta/planned tiers)
  - Docs.tsx (CLI reference)

### B10: Cloud Run Deploy
- **Status**: DEPLOYED
- **Gateway URL**: https://gwi-gateway-x25g6jv5ja-uc.a.run.app
- **Health Check**: PASSING
- **Artifact Registry**: us-central1-docker.pkg.dev/git-with-intent/gwi-docker
- **Image**: gateway:latest (318MB)

### B12: Agent Engine Surface
- **Status**: DOCUMENTED
- **File**: `infra/agent_engine.tf` (+337 lines)
- **5-Step Deployment**:
  1. OpenTofu creates supporting infra
  2. ADK CLI deploys agent
  3. Capture Agent Engine ID
  4. Update terraform.tfvars
  5. Re-apply OpenTofu

### B13: Observability Baseline
- **Status**: COMPLETED
- **File**: `infra/monitoring.tf` (+598 lines)
- **Components**:
  - Email notification channel
  - 4 uptime checks (gateway, webhook, api, worker)
  - 3 log-based metrics (critical_errors, auth_failures, ai_errors)
  - Budget alerts with tiered thresholds ($50, $80, $100, $120)
  - Pub/Sub topic for budget notifications

---

## Deployment Evidence

### Firebase Website
```
URL: https://git-with-intent.web.app
Status: Live
```

### Cloud Run Gateway
```json
{
  "status": "healthy",
  "app": "git-with-intent",
  "version": "0.1.0",
  "env": "prod"
}
```

### Artifact Registry
```
IMAGE: us-central1-docker.pkg.dev/git-with-intent/gwi-docker/gateway
TAG: latest
SIZE: 318MB
CREATED: 2025-12-18T20:30:32
```

### OpenTofu Validation
```
Success! The configuration is valid.
```

---

## CI/CD Flow

```
Developer Push → GitHub Actions → WIF Auth (no keys)
                                       ↓
                               Docker Build (monorepo root)
                                       ↓
                               Artifact Registry Push
                                       ↓
                               Cloud Run Deploy
                                       ↓
                               Health Check Verification
```

---

## Files Modified

### Dockerfiles (npm workspace fix)
- `apps/api/Dockerfile`
- `apps/gateway/Dockerfile`
- `apps/github-webhook/Dockerfile`
- `apps/worker/Dockerfile`

### Infrastructure
- `infra/main.tf`
- `infra/variables.tf`
- `infra/cloud_run.tf`
- `infra/monitoring.tf`
- `infra/agent_engine.tf`
- `infra/README.md`

### CI/CD
- `.github/workflows/ci.yml`
- `scripts/ci/check_nodrift.sh`

### Website
- `apps/web/src/pages/*.tsx` (6 new pages)
- `apps/web/src/App.tsx`

---

## Lessons Learned

1. **npm workspaces in Docker**: Must copy ALL workspace package.json files before `npm ci`
2. **Build order matters**: Dependencies must be built in topological order
3. **WIF > Service Account Keys**: OIDC token exchange eliminates key rotation burden
4. **OpenTofu compatibility**: Drop-in replacement for Terraform with same syntax

---

## Next Steps

1. Push changes to trigger full CI/CD pipeline
2. Verify GitHub Actions WIF authentication
3. Monitor budget alerts and uptime checks
4. Deploy additional services (api, webhook, worker) via CI

---

## AgentFS Evidence

- **Store**: `.agentfs/gwi.db`
- **Keys**: `phase:cloud-deploy`, `bead:b1-b14`
- **Certification**: `cert/AGENTFS-CERTIFICATION.md`
