# 112-DR-RUNB: Disaster Recovery Runbook

**Document ID**: 112-DR-RUNB
**Category**: DR (Disaster Recovery)
**Type**: RUNB (Runbook)
**Version**: 1.0
**Last Updated**: 2026-02-16
**Owner**: Platform Engineering

---

## 1. Recovery Objectives

| Metric | Target | Notes |
|--------|--------|-------|
| **RPO (Recovery Point Objective)** | 24h (Firestore), 1h (GCS) | Firestore daily exports; GCS versioning + soft delete |
| **RTO (Recovery Time Objective)** | 4h | Full service restoration from backups |
| **MTTR (Mean Time to Repair)** | 2h | Median incident resolution |

---

## 2. Firestore Backup & Restore

### 2.1 Automated Backups

Daily Firestore exports are scheduled via Cloud Scheduler to a dedicated GCS bucket.

- **Bucket**: `{project_id}-firestore-backups`
- **Schedule**: Daily at 02:00 UTC
- **Retention**: 90 days (lifecycle policy)
- **Service Account**: `gwi-firestore-backup@{project_id}.iam.gserviceaccount.com`

### 2.2 Manual Export

```bash
# Export all collections
gcloud firestore export gs://${PROJECT_ID}-firestore-backups/manual/$(date +%Y%m%d-%H%M%S) \
  --project=${PROJECT_ID}

# Export specific collections
gcloud firestore export gs://${PROJECT_ID}-firestore-backups/manual/$(date +%Y%m%d-%H%M%S) \
  --collection-ids=tenants,runs,signals,workItems,prCandidates \
  --project=${PROJECT_ID}
```

### 2.3 Restore from Backup

```bash
# List available backups
gsutil ls gs://${PROJECT_ID}-firestore-backups/scheduled/

# Restore from a specific backup
gcloud firestore import gs://${PROJECT_ID}-firestore-backups/scheduled/2026-02-15T02:00:00Z \
  --project=${PROJECT_ID}

# Restore specific collections only
gcloud firestore import gs://${PROJECT_ID}-firestore-backups/scheduled/2026-02-15T02:00:00Z \
  --collection-ids=runs,workItems \
  --project=${PROJECT_ID}
```

**Warning**: Firestore import merges data; it does not overwrite. Delete collections first if a clean restore is needed.

---

## 3. GCS Bucket Recovery

### 3.1 Run Artifacts Bucket

- **Bucket**: `{project_id}-run-artifacts`
- **Versioning**: Enabled (previous versions retained)
- **Soft Delete**: 7-day retention

```bash
# List object versions
gsutil ls -la gs://${PROJECT_ID}-run-artifacts/{tenantId}/{repoId}/{runId}/

# Restore a previous version
gsutil cp gs://${PROJECT_ID}-run-artifacts/{path}#<generation> gs://${PROJECT_ID}-run-artifacts/{path}

# Recover soft-deleted object
gsutil ls -la --include-deleted gs://${PROJECT_ID}-run-artifacts/{path}
gsutil cp gs://${PROJECT_ID}-run-artifacts/{path}#<deleted-generation> gs://${PROJECT_ID}-run-artifacts/{path}
```

### 3.2 ADK Staging Bucket

- **Bucket**: `{project_id}-adk-staging`
- **Versioning**: Enabled
- **Lifecycle**: 30-day auto-delete (deployment artifacts only)

Recovery is low priority since deployment artifacts can be regenerated from source.

---

## 4. Cloud Run Service Recovery

### 4.1 Service Inventory

| Service | Region | Min Instances | Image Source |
|---------|--------|---------------|--------------|
| gwi-api | us-central1 | 0 | Artifact Registry |
| gwi-gateway | us-central1 | 1 | Artifact Registry |
| gwi-github-webhook | us-central1 | 0 | Artifact Registry |
| gwi-worker | us-central1 | 0 | Artifact Registry |

### 4.2 Redeploy from Artifact Registry

```bash
# List available images
gcloud artifacts docker images list \
  us-central1-docker.pkg.dev/${PROJECT_ID}/gwi-docker/ \
  --include-tags

# Redeploy a specific service to last known good image
gcloud run deploy gwi-api \
  --image=us-central1-docker.pkg.dev/${PROJECT_ID}/gwi-docker/api:${KNOWN_GOOD_SHA} \
  --region=us-central1 \
  --project=${PROJECT_ID}
```

### 4.3 Full Redeploy via OpenTofu

```bash
cd infra
tofu init
tofu apply -var-file=envs/prod.tfvars \
  -var="gwi_api_image=${REGISTRY}/${PROJECT_ID}/gwi-docker/api:${SHA}" \
  -var="a2a_gateway_image=${REGISTRY}/${PROJECT_ID}/gwi-docker/gateway:${SHA}" \
  -var="github_webhook_image=${REGISTRY}/${PROJECT_ID}/gwi-docker/github-webhook:${SHA}" \
  -var="gwi_worker_image=${REGISTRY}/${PROJECT_ID}/gwi-docker/worker:${SHA}"
```

---

## 5. GitHub Actions Recovery

### 5.1 Workflow Files

All workflow definitions are version-controlled in `.github/workflows/`. Recovery is automatic via `git checkout`.

### 5.2 GitHub App Credentials

- **Location**: Google Secret Manager (`github-app-id`, `github-private-key`)
- **Rotation**: See Section 6

### 5.3 Workload Identity Federation

WIF configuration is managed by OpenTofu (`infra/wif.tf`). Recovery:

```bash
cd infra && tofu apply -var-file=envs/prod.tfvars -target=google_iam_workload_identity_pool.github
```

---

## 6. Secrets Rotation

| Secret | Location | Rotation Procedure |
|--------|----------|-------------------|
| GitHub App Private Key | Secret Manager | Generate new key in GitHub App settings, update Secret Manager, redeploy services |
| Anthropic API Key | Secret Manager | Regenerate in Anthropic Console, update Secret Manager |
| Google AI API Key | Secret Manager | Regenerate in Google AI Studio, update Secret Manager |
| OpenAI API Key | Secret Manager | Regenerate in OpenAI Dashboard, update Secret Manager |

```bash
# Update a secret in Secret Manager
echo -n "new-secret-value" | gcloud secrets versions add ${SECRET_NAME} \
  --data-file=- --project=${PROJECT_ID}

# Redeploy services to pick up new secret versions
# (Cloud Run services reference "latest" version)
gcloud run services update gwi-api --region=us-central1 --project=${PROJECT_ID}
gcloud run services update gwi-worker --region=us-central1 --project=${PROJECT_ID}
```

---

## 7. Communication Plan

### 7.1 Incident Severity Levels

| Level | Description | Response Time | Notification |
|-------|-------------|---------------|--------------|
| P1 | Service fully down | 15 min | Slack #incidents + email |
| P2 | Degraded (partial outage) | 30 min | Slack #incidents |
| P3 | Non-critical issue | 4h | Slack #ops |
| P4 | Cosmetic / low impact | Next business day | Jira ticket |

### 7.2 Escalation Path

1. On-call engineer acknowledges in Slack
2. If no ack within 15 min (P1) / 30 min (P2): escalate to engineering lead
3. If no resolution within RTO: escalate to CTO

---

## 8. Post-Incident Review Template

```markdown
## Post-Incident Review: [INCIDENT-ID]

**Date**: YYYY-MM-DD
**Duration**: X hours Y minutes
**Severity**: P1/P2/P3/P4
**Author**: [Name]

### Summary
[One paragraph description of what happened]

### Timeline
- HH:MM UTC - [Event]
- HH:MM UTC - [Event]

### Root Cause
[What caused the incident]

### Impact
- Users affected: N
- Runs interrupted: N
- Data loss: None / [describe]

### What Went Well
- [Item]

### What Could Be Improved
- [Item]

### Action Items
| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| [Action] | [Name] | YYYY-MM-DD | Open |
```

---

## 9. Testing the DR Plan

### 9.1 Quarterly DR Drill

1. Export Firestore to backup bucket (verify export completes)
2. Restore to a test project (verify data integrity)
3. Redeploy Cloud Run services from Artifact Registry (verify health checks pass)
4. Rotate one non-production secret (verify service picks up new value)

### 9.2 Verification Commands

```bash
# Verify Firestore backup exists
gsutil ls gs://${PROJECT_ID}-firestore-backups/scheduled/ | tail -5

# Verify Cloud Run services are healthy
for svc in gwi-api gwi-gateway gwi-github-webhook gwi-worker; do
  URL=$(gcloud run services describe $svc --region=us-central1 --format='value(status.url)' 2>/dev/null)
  if [ -n "$URL" ]; then
    echo "$svc: $(curl -s -o /dev/null -w '%{http_code}' $URL/health)"
  fi
done

# Verify GCS bucket versioning
gsutil versioning get gs://${PROJECT_ID}-run-artifacts
gsutil versioning get gs://${PROJECT_ID}-firestore-backups
```
