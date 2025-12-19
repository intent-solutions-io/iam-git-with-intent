# WIF Permission Fix - After Action Report

**Date**: 2025-12-19
**Bead**: git-with-intent-e03s
**Status**: COMPLETED (IAM permissions fixed; separate app bug remains)
**Option Used**: B (quick fix with least-privilege roles)

---

## Summary

Fixed GitHub Actions OpenTofu apply failures for service account:
`git-with-intent-ci@git-with-intent.iam.gserviceaccount.com`

---

## Audit Results (Run 20358463871)

| Category | Permission Denied | TF Resource | Solution |
|----------|-------------------|-------------|----------|
| Project IAM | `resourcemanager.projects.setIamPolicy` | `google_project_iam_member.*` | `roles/resourcemanager.projectIamAdmin` |
| Log Metrics | `logging.logMetrics.create` | `google_logging_metric.*` | `roles/logging.configWriter` |
| Service Account | `iam.serviceaccounts.actAs` | `google_cloud_run_service.*` | `roles/iam.serviceAccountUser` |

---

## Commands Executed

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

## Final CI Service Account Roles

```
roles/aiplatform.admin
roles/artifactregistry.admin
roles/cloudbuild.builds.builder
roles/firebase.admin
roles/iam.serviceAccountAdmin
roles/iam.serviceAccountUser        # NEW - for actAs
roles/iam.workloadIdentityPoolAdmin
roles/logging.configWriter          # NEW - for log metrics (least privilege)
roles/monitoring.admin
roles/pubsub.admin
roles/resourcemanager.projectIamAdmin # NEW - for setIamPolicy
roles/run.admin
roles/secretmanager.secretAccessor
roles/serviceusage.serviceUsageAdmin
roles/storage.admin
```

---

## Evidence

### CI Run 20358654303 (After Fix)

**Successfully Created Resources:**
- `google_cloud_run_service.a2a_gateway` ✓
- `google_cloud_run_service.github_webhook` ✓
- `google_monitoring_uptime_check_config.gateway_uptime` ✓
- `google_monitoring_uptime_check_config.webhook_uptime` ✓
- `google_monitoring_alert_policy.gateway_uptime_alert` ✓
- `google_logging_metric.critical_errors` ✓
- `google_logging_metric.auth_failures` ✓
- `google_logging_metric.ai_errors` ✓
- All `google_project_iam_member.*` bindings ✓

**Link**: https://github.com/intent-solutions-io/git-with-intent/actions/runs/20358654303

### Remaining Issue (Not IAM Related)

`google_cloud_run_service.gwi_api` fails to start due to application bug:
```
ReferenceError: require is not defined in ES module scope
const { FirestoreSignalStore } = require('./firestore-signal.js');
```
This is an ESM/CJS bundling issue in `packages/core/dist/storage/index.js`, not a permissions issue.

---

## Security Notes

1. **`roles/resourcemanager.projectIamAdmin`** is powerful (includes `setIamPolicy`). Consider:
   - Moving IAM-managing resources to a separate "foundation" module with manual approval
   - Using conditions to limit scope

2. **`roles/logging.configWriter`** is least-privilege for log metrics (vs `roles/logging.admin`)

3. **`roles/iam.serviceAccountUser`** allows "acting as" any SA in the project. Could be scoped with conditions.

---

## Beads Evidence

| Bead ID | Title | Status |
|---------|-------|--------|
| git-with-intent-e03s | Fix: WIF CI SA permissions for OpenTofu apply | CLOSED |
| git-with-intent-8ykd | Audit: identify failing resources | CLOSED |
| git-with-intent-jb0u | Implement: least-privilege roles | CLOSED |
| git-with-intent-6y0b | Verify: rerun workflow | CLOSED |
| git-with-intent-k6y2 | Document: update AAR | CLOSING |

---

## Next Steps

1. Fix the ESM/CJS bug in `packages/core/src/storage/index.js`
2. Consider Option A (foundation/app split) for better security posture
3. Re-run CI to get fully green pipeline
