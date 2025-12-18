# Disaster Recovery Runbook

> **Document**: 112-DR-RUNB-disaster-recovery-runbook.md
> **Created**: 2025-12-18 02:35 CST
> **Phase**: 32 (GA Readiness)
> **Status**: Living document

## 1. Overview

This runbook covers disaster recovery procedures for Git With Intent (GWI).

### 1.1 Recovery Objectives

| Metric | Target |
|--------|--------|
| RTO (Recovery Time) | 30 minutes (typical), 4 hours (max) |
| RPO (Recovery Point) | 1 hour (Firestore), 0 (audit logs) |

### 1.2 DR Scenarios

1. **Single Service Failure** - Cloud Run service crashes
2. **Regional Outage** - us-central1 unavailable
3. **Data Corruption** - Firestore data corrupted
4. **Secret Compromise** - API keys/secrets exposed
5. **Full Disaster** - Complete infrastructure loss

## 2. Runbook: Single Service Failure

**Symptoms**: Service returning 5xx, health check failures

### 2.1 Diagnosis
```bash
# Check service status
gcloud run services describe gwi-api-prod --region us-central1 --format="value(status.conditions)"

# Check recent logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=gwi-api-prod" --limit 50
```

### 2.2 Recovery Steps
1. **Auto-recovery**: Cloud Run auto-restarts failed instances
2. **Manual restart**: If stuck, deploy new revision
   ```bash
   gcloud run services update gwi-api-prod --region us-central1 --no-traffic
   gcloud run services update-traffic gwi-api-prod --region us-central1 --to-latest
   ```
3. **Rollback**: If new code is bad
   ```bash
   gcloud run services update-traffic gwi-api-prod --region us-central1 --to-revisions=PREVIOUS_REVISION=100
   ```

### 2.3 Post-Incident
- [ ] Create incident report
- [ ] Update status page
- [ ] Root cause analysis

## 3. Runbook: Regional Outage

**Symptoms**: All services in us-central1 unavailable

### 3.1 Diagnosis
```bash
# Check GCP status page
# https://status.cloud.google.com/

# Check if other regions affected
gcloud compute regions list --filter="status=UP"
```

### 3.2 Recovery Steps (Manual Failover)

**Note**: Multi-region not yet implemented. This is the manual procedure.

1. **Update DNS** (if using custom domain)
   ```bash
   # Point to backup region endpoint
   gcloud dns record-sets update api.gitwithintent.dev --type=A --zone=gwi-zone --rrdatas=BACKUP_IP
   ```

2. **Deploy to backup region**
   ```bash
   # From local or CI
   cd infra/terraform
   terraform workspace select prod-backup
   terraform apply -var="region=us-east1"
   ```

3. **Verify backup deployment**
   ```bash
   curl https://gwi-api-prod-us-east1.run.app/health
   ```

### 3.3 Failback
Once primary region is restored:
1. Verify primary region services healthy
2. Update DNS back to primary
3. Destroy backup region resources (cost savings)

## 4. Runbook: Data Corruption

**Symptoms**: Incorrect data, missing records, application errors

### 4.1 Diagnosis
```bash
# Check Firestore for anomalies
gcloud firestore export gs://gwi-backup-bucket/diagnostic-$(date +%Y%m%d)

# Review audit logs for unauthorized changes
gcloud logging read 'resource.type="firestore_database" AND protoPayload.methodName=~"Write|Delete"' --limit 100
```

### 4.2 Recovery Steps

1. **Stop writes** (if ongoing corruption)
   - Disable webhook endpoint
   - Set API to read-only mode (feature flag)

2. **Identify corruption scope**
   - Which collections affected?
   - What time range?

3. **Restore from backup**
   ```bash
   # List available backups
   gsutil ls gs://gwi-backup-bucket/

   # Restore to temp database for verification
   gcloud firestore import gs://gwi-backup-bucket/backup-YYYYMMDD --collection-ids=affected_collection

   # After verification, restore to production
   ```

4. **Verify data integrity**
   - Run consistency checks
   - Verify recent transactions

### 4.3 Post-Incident
- [ ] Identify root cause
- [ ] Implement prevention measures
- [ ] Review backup frequency

## 5. Runbook: Secret Compromise

**Symptoms**: Unauthorized access, suspicious activity, leaked credentials

### 5.1 Immediate Actions (First 15 minutes)

1. **Rotate compromised secrets**
   ```bash
   # GitHub App private key
   # Go to GitHub App settings → Generate new private key
   # Update in Secret Manager
   gcloud secrets versions add gwi-github-private-key --data-file=new-key.pem

   # API keys
   gcloud secrets versions add gwi-api-key --data-file=new-api-key.txt
   ```

2. **Revoke old secrets**
   ```bash
   # Disable old secret versions
   gcloud secrets versions disable gwi-github-private-key --version=OLD_VERSION
   ```

3. **Deploy with new secrets**
   ```bash
   # Trigger new Cloud Run deployment
   gcloud run services update gwi-api-prod --region us-central1 --update-secrets=...
   ```

### 5.2 Investigation

1. **Audit log review**
   ```bash
   gcloud logging read 'resource.type="secretmanager.googleapis.com"' --limit 100
   ```

2. **Access review**
   - Check IAM permissions
   - Review service account usage

### 5.3 Post-Incident
- [ ] Full secret rotation
- [ ] Security audit
- [ ] Update rotation schedule

## 6. Runbook: Full Disaster

**Symptoms**: Complete infrastructure loss (fire/flood/attack)

### 6.1 Prerequisites
- Terraform state in GCS (cross-region backup)
- Code in GitHub (offsite)
- Secrets documented in secure location

### 6.2 Full Rebuild

1. **Verify backups accessible**
   ```bash
   # Terraform state
   gsutil ls gs://gwi-terraform-state/

   # Firestore backups
   gsutil ls gs://gwi-backup-bucket/
   ```

2. **Rebuild infrastructure**
   ```bash
   cd infra/terraform
   terraform init -backend-config="bucket=gwi-terraform-state"
   terraform apply -var="environment=prod"
   ```

3. **Restore data**
   ```bash
   gcloud firestore import gs://gwi-backup-bucket/latest/
   ```

4. **Verify services**
   ```bash
   npm run smoke:production
   ```

5. **Update DNS** (if needed)

## 7. DR Rehearsal Schedule

| Scenario | Frequency | Last Rehearsal | Next Due |
|----------|-----------|----------------|----------|
| Service rollback | Monthly | - | 2026-01-18 |
| Backup restore | Quarterly | - | 2026-03-18 |
| Regional failover | Annually | - | 2026-12-18 |
| Full rebuild | Annually | - | 2026-12-18 |

## 8. Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| On-call engineer | PagerDuty | - |
| Engineering lead | [email] | After 30min |
| Security | [email] | Secret compromise |
| Executive | [email] | SEV1 > 1 hour |

## 9. Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-12-18 | Claude Code | Initial DR runbook for GA |
