# Git With Intent: Production Baseline Audit
*Generated: 2026-01-29*
*Version: v0.5.1 (commit 085c4f9)*
*Purpose: Pre-production readiness assessment for Google Cloud deployment*

---

## Executive Summary

Git With Intent has a solid foundation but is **NOT production-ready**. Key gaps:

| Area | Status | Blocking Issues |
|------|--------|-----------------|
| Firebase Hosting | **NOT DEPLOYED** | No deploy workflow, no WIF for Firebase |
| Cloud Run Reliability | Partial | Orchestrator state is in-memory (will lose on restart) |
| Observability | Defined in IaC | Not deployed, no actionable alerts |
| Security/IAM | Partial | WIF configured for Cloud Run, missing for Firebase |
| Repo Governance | Good | Templates exist, changelog current |

**Immediate blockers for production:**
1. Web dashboard not deployed to Firebase Hosting
2. Orchestrator state not persisted (runs will be "stuck" on restart)
3. No monitoring dashboards or alerts in production

---

## 1. Repository Facts

### Git State
- **Current Branch:** main
- **Latest Tag:** v0.5.1
- **Recent Commits:** Clean (lint fix, docs audit)
- **Working Tree:** Clean

### Structure

| Directory | Count | Purpose |
|-----------|-------|---------|
| apps/ | 8 | cli, api, gateway, github-webhook, webhook-receiver, worker, registry, web |
| packages/ | 7 | agents, connectors, core, engine, forecasting, integrations, sdk |
| infra/ | 16 files | OpenTofu IaC for GCP |
| .github/workflows/ | 14 | CI/CD pipelines |
| scripts/arv/ | 21 | Agent Readiness Verification gates |

### GitHub Actions Workflows

| Workflow | Purpose | Status |
|----------|---------|--------|
| ci.yml | Build, test, typecheck | Working |
| deploy.yml | Cloud Run deployment | Missing Firebase Hosting |
| arv.yml | ARV gates | Working |
| release.yml | Release automation | Working |
| tofu-plan.yml | Infrastructure plan | Available |
| tofu-apply.yml | Infrastructure apply | Available |

---

## 2. Baseline Checks

### Typecheck
```
✅ PASS - 19/19 packages successful
```

### Lint
```
❌ FAIL - @gwi/core has 9 errors, 58 warnings

Errors:
- prefer-const violations (7 fixable)
- unused variables (2): chain, contextHash in crypto-chain.ts
```

### Tests
```
✅ PASS - 29/29 test suites pass
- ~1700 tests total
- Some packages have no test files (gateway, sdk)
```

### ARV Gates
```
✅ PASS (when run standalone)
- 21 gate scripts in scripts/arv/
- Includes: security, identity, reliability, observability gates
```

---

## 3. Deployment State

### Firebase Hosting
```
❌ NOT DEPLOYED

- firebase.json exists with hosting config
- Site target: "git-with-intent"
- Public dir: apps/web/dist (exists, has build output)
- NO GitHub Actions workflow for Firebase deploy
- NO Workload Identity Federation for firebase-tools
```

### Cloud Run (defined in infra/cloud_run.tf)
```
⚠️ DEFINED BUT NEEDS VERIFICATION

Services defined:
- gwi-api
- gwi-gateway
- gwi-github-webhook
- gwi-webhook-receiver
- gwi-worker

Config gaps:
- Health endpoints: Need verification
- Concurrency/instances: Defined in IaC
- Timeouts: Need review
```

### Firestore
```
✅ CONFIGURED

- firestore.rules: Production-ready multi-tenant RBAC
- firestore.indexes.json: Exists
- Collections: gwi_memberships, runs, approvals, audit_logs
```

### Infrastructure (OpenTofu)
```
✅ WELL-STRUCTURED

Files:
- cloud_run.tf (26KB) - Service definitions
- monitoring.tf (48KB) - Dashboards, alerts
- iam.tf (12KB) - Service accounts, WIF
- storage.tf (12KB) - GCS buckets, Firestore
- network.tf (10KB) - VPC, networking
```

---

## 4. Critical Gaps

### Gap 1: Firebase Hosting Not Deployed
**Impact:** Web dashboard unreachable
**Current State:**
- firebase.json configured
- apps/web/dist built
- No deploy workflow
- No WIF for firebase-tools

**Required:**
- Add Firebase Hosting deploy job to deploy.yml
- Configure WIF for Firebase (different from Cloud Run WIF)
- Set up staging/production sites

### Gap 2: Orchestrator State In-Memory
**Impact:** Runs will be "stuck running" after Cloud Run restarts
**Current State:**
- packages/engine manages run orchestration
- State appears to be in-memory
- No Firestore persistence for run lifecycle

**Required:**
- Persist run state to Firestore
- Implement recovery on startup
- Add idempotency keys

### Gap 3: Monitoring Not Active
**Impact:** Blind to production issues
**Current State:**
- infra/monitoring.tf has 48KB of dashboard/alert definitions
- Not deployed (infra not applied)
- No log-based metrics active

**Required:**
- Deploy OpenTofu infrastructure
- Verify dashboards created
- Test alert policies

### Gap 4: Lint Errors Blocking CI
**Impact:** PRs may fail CI
**Current State:**
- 9 errors in @gwi/core (prefer-const, unused vars)
- 58 warnings (any types)

**Required:**
- Fix 9 errors (quick, fixable with --fix)
- Address unused variables in crypto-chain.ts

---

## 5. What's Working

| Component | Status | Evidence |
|-----------|--------|----------|
| CLI (gwi) | ✅ Working | All commands functional |
| Multi-agent routing | ✅ Working | Complexity-based model selection |
| Approval gating | ✅ Working | SHA-256 hash binding enforced |
| Test suite | ✅ Working | ~1700 tests pass |
| ARV gates | ✅ Working | 21 verification gates |
| Firestore rules | ✅ Ready | Multi-tenant RBAC |
| OpenTofu IaC | ✅ Ready | 16 files, well-structured |
| GitHub Actions CI | ✅ Working | Build, test, typecheck |
| WIF for Cloud Run | ✅ Configured | In deploy.yml |

---

## 6. Recommended Epic Structure

Based on this audit, the following epics are needed:

### Epic A: Firebase Hosting Deployment (Staging/Prod) via WIF
- Configure WIF for Firebase
- Add deploy workflow
- Set up staging + production sites
- Document rollback procedure

### Epic B: Cloud Run Reliability + Durable Orchestration State
- Persist run state to Firestore
- Implement recovery on restart
- Add health endpoints
- Configure DLQ for Pub/Sub

### Epic C: Observability (Cloud Logging + Cloud Monitoring + Alerts)
- Deploy monitoring.tf
- Add correlation IDs to logs
- Create log-based metrics
- Configure alert policies with runbooks

### Epic D: Security/IAM/Secrets + ARV Gates
- Verify secrets in Secret Manager
- Audit IAM least privilege
- Ensure ARV blocks merges

### Epic E: Repo Governance + Release Hygiene
- Backfill changelog
- Verify templates
- Document release process

---

## 7. Immediate Actions

| Priority | Action | Owner | Blocks |
|----------|--------|-------|--------|
| P0 | Fix 9 lint errors in @gwi/core | DevOps | All PRs |
| P0 | Configure WIF for Firebase | Platform | Epic A |
| P1 | Persist orchestrator state | Platform | Epic B |
| P1 | Deploy monitoring.tf | SRE | Epic C |
| P2 | Add Firebase deploy to workflow | DevOps | Epic A |

---

## Appendix: File Inventory

### Infrastructure Files (infra/)
```
agent_engine.tf      13KB  Vertex AI Agent Engine
artifact_registry.tf  3KB  Docker registry
cloud_run.tf         26KB  Cloud Run services
iam.tf               12KB  IAM + WIF
main.tf               2KB  Provider config
monitoring.tf        48KB  Dashboards, alerts
network.tf           10KB  VPC, networking
scheduler.tf          3KB  Cloud Scheduler
service_auth.tf      11KB  Service-to-service auth
service_topology.tf  11KB  Service mesh
storage.tf           12KB  GCS + Firestore
variables.tf          9KB  Input variables
webhook_receiver.tf  14KB  Webhook receiver
```

### ARV Gates (scripts/arv/)
```
approval-policy-gate.ts     connector-supply-chain.ts
docs-gate.ts                forbidden-patterns.ts
forensics-gate.ts           ga-readiness-gate.ts
identity-gate.ts            load-test.ts
marketplace-gate.ts         merge-resolver-gate.ts
metering-gate.ts            observability-gate.ts
openapi-gate.ts             planner-gate.ts
registry-gate.ts            reliability-gate.ts
run-all.ts                  security-gate.ts
smoke-test.ts               update-goldens.ts
```

---

*Document Status: Complete*
*Next: Create Beads epics and tasks with dependency blocks*
