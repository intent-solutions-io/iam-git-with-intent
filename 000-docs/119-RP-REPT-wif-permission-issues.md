# WIF Permission Fix + Public Access - After Action Report

**Date**: 2025-12-19
**Beads**: git-with-intent-e03s, git-with-intent-n0yz
**Status**: COMPLETED

---

## Summary

1. Fixed GitHub Actions OpenTofu apply failures (WIF permissions)
2. Fixed ESM `require()` bug in packages/core
3. Enabled public access for Cloud Run services

---

## Part 1: WIF Permissions for CI Service Account

### Audit Results (Run 20358463871)

| Category | Permission Denied | TF Resource | Solution |
|----------|-------------------|-------------|----------|
| Project IAM | `resourcemanager.projects.setIamPolicy` | `google_project_iam_member.*` | `roles/resourcemanager.projectIamAdmin` |
| Log Metrics | `logging.logMetrics.create` | `google_logging_metric.*` | `roles/logging.configWriter` |
| Service Account | `iam.serviceaccounts.actAs` | `google_cloud_run_service.*` | `roles/iam.serviceAccountUser` |

### Commands Executed

```bash
# 1. Grant project IAM admin (for setIamPolicy)
gcloud projects add-iam-policy-binding git-with-intent \
  --member="serviceAccount:git-with-intent-ci@git-with-intent.iam.gserviceaccount.com" \
  --role="roles/resourcemanager.projectIamAdmin"

# 2. Grant log config writer (least privilege for log metrics)
gcloud projects add-iam-policy-binding git-with-intent \
  --member="serviceAccount:git-with-intent-ci@git-with-intent.iam.gserviceaccount.com" \
  --role="roles/logging.configWriter"

# 3. Grant service account user (for actAs on Cloud Run deploys)
gcloud projects add-iam-policy-binding git-with-intent \
  --member="serviceAccount:git-with-intent-ci@git-with-intent.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

---

## Part 2: ESM Bug Fix

### Problem
```
ReferenceError: require is not defined in ES module scope
const { FirestoreSignalStore } = require('./firestore-signal.js');
```

### Solution
Replaced 8 `require()` calls with static ESM imports in:
- `packages/core/src/storage/index.ts` (7 calls)
- `packages/core/src/metering/service.ts` (1 call)

### Commits
- `d8f64c1` - fix(core): replace require() with static imports for ESM compatibility
- `cfc9118` - fix(core): make forecasting test robust for fast execution

---

## Part 3: Cloud Run Public Access

### Problem Analysis

**Initial State (before fix):**
```bash
$ curl https://git-with-intent-api-prod-x25g6jv5ja-uc.a.run.app/health
# HTTP 403 Forbidden - Cloud Run IAM rejects unauthenticated request

$ gcloud run services get-iam-policy git-with-intent-api-prod --region=us-central1
etag: ACAB
# Empty policy = no allUsers binding
```

**Auth Type:** Cloud Run platform-level IAM invoker auth (NOT application-level)

### Decision: Public Access Mode (Option A)

**Justification:**
- GitHub webhooks require unauthenticated access (GitHub can't get Cloud Run IAM tokens)
- A2A Gateway must be callable by external agents for A2A protocol
- API health endpoints need to be reachable; actual operations protected by Firebase Auth at application level

### Implementation

Changed `infra/envs/prod.tfvars`:
```hcl
# Before
allow_public_access = false

# After
allow_public_access = true
```

This creates `allUsers -> roles/run.invoker` bindings via OpenTofu.

### Final IAM Policies (after fix)

```
=== git-with-intent-api-prod ===
bindings:
- members:
  - allUsers
  role: roles/run.invoker
etag: BwZGRrKSxJQ=
version: 1

=== git-with-intent-a2a-gateway-prod ===
bindings:
- members:
  - allUsers
  role: roles/run.invoker
etag: BwZGRrKXEAo=
version: 1

=== git-with-intent-github-webhook-prod ===
bindings:
- members:
  - allUsers
  role: roles/run.invoker
etag: BwZGRrKRAFE=
version: 1
```

---

## Part 4: Smoke Test Evidence

### Unauthenticated Curl Tests (after public access enabled)

**API Health:**
```bash
$ curl -s https://git-with-intent-api-prod-x25g6jv5ja-uc.a.run.app/health
{"status":"healthy","app":"git-with-intent-api","version":"0.1.0","env":"prod","storeBackend":"firestore","timestamp":"2025-12-19T04:43:57.909Z"}
```

**Gateway Health:**
```bash
$ curl -s https://git-with-intent-a2a-gateway-prod-x25g6jv5ja-uc.a.run.app/health
{"status":"healthy","app":"git-with-intent","version":"0.1.0","env":"prod","timestamp":1766119445045}
```

**Webhook Health:**
```bash
$ curl -s https://git-with-intent-github-webhook-prod-x25g6jv5ja-uc.a.run.app/health
{"status":"healthy","service":"github-webhook","version":"0.2.0","env":"prod","timestamp":1766119452465}
```

**A2A Agent Card:**
```bash
$ curl -s https://git-with-intent-a2a-gateway-prod-x25g6jv5ja-uc.a.run.app/.well-known/agent.json
{
  "id": "spiffe://intent.solutions/agent/gwi",
  "name": "Git With Intent Gateway",
  "version": "0.1.0",
  "capabilities": ["pr-resolution", "issue-to-code", "code-review", "conflict-analysis"],
  "agents": [
    {"name": "orchestrator", "endpoint": "/a2a/orchestrator"},
    {"name": "triage", "endpoint": "/a2a/triage"},
    {"name": "resolver", "endpoint": "/a2a/resolver"},
    {"name": "reviewer", "endpoint": "/a2a/reviewer"}
  ]
}
```

### Summary Table

| Service | Endpoint | Unauthenticated | Response |
|---------|----------|-----------------|----------|
| API | `/health` | ✅ HTTP 200 | `{"status":"healthy","storeBackend":"firestore"}` |
| Gateway | `/health` | ✅ HTTP 200 | `{"status":"healthy","env":"prod"}` |
| Webhook | `/health` | ✅ HTTP 200 | `{"status":"healthy","service":"github-webhook"}` |
| Gateway | `/.well-known/agent.json` | ✅ HTTP 200 | A2A Agent Card |

---

## CI Run Evidence

| Run ID | Workflow | Status | Link |
|--------|----------|--------|------|
| 20359045576 | CI/CD (ESM fix) | ✅ Success | [View](https://github.com/intent-solutions-io/git-with-intent/actions/runs/20359045576) |
| 20360039515 | OpenTofu Apply (public access) | ✅ Success | [View](https://github.com/intent-solutions-io/git-with-intent/actions/runs/20360039515) |

---

## Security Notes

1. **`roles/resourcemanager.projectIamAdmin`** on CI SA is powerful. Consider foundation/app split.
2. **`roles/logging.configWriter`** is least-privilege for log metrics.
3. **Public Cloud Run services** rely on application-level auth (Firebase Auth) for protected operations.

---

## Beads

| Bead ID | Title | Status |
|---------|-------|--------|
| git-with-intent-e03s | Fix: WIF CI SA permissions | CLOSED |
| git-with-intent-n0yz | Fix ESM require bug | CLOSED |
