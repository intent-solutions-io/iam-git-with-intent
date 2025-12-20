# Secret Rotation Runbook

> **Document**: 147-DR-RNBK-secret-rotation-runbook.md
> **Created**: 2025-12-19
> **Epic**: A9 (Secrets Model)
> **Status**: Active

## 1. Overview

This runbook provides step-by-step procedures for rotating all secrets used by Git With Intent (GWI). All secrets are stored in Google Cloud Secret Manager and referenced by Cloud Run services.

### 1.1 Secret Inventory

| Secret ID | Description | Consumers | Rotation Period |
|-----------|-------------|-----------|-----------------|
| `gwi-github-app-private-key` | GitHub App authentication | gateway, worker, github-webhook | 90 days |
| `gwi-github-webhook-secret` | Webhook HMAC validation | github-webhook | 180 days |
| `gwi-anthropic-api-key` | Anthropic Claude API | worker | 90 days |
| `gwi-google-ai-api-key` | Google AI Gemini API | worker | 90 days |
| `gwi-stripe-secret-key` | Stripe billing API | api | 90 days |
| `gwi-stripe-webhook-secret` | Stripe webhook validation | api | 180 days |

### 1.2 Pre-Rotation Checklist

Before rotating any secret:

- [ ] Notify on-call team of planned rotation
- [ ] Verify current secret version is accessible: `gcloud secrets versions list SECRET_ID`
- [ ] Check service health before rotation
- [ ] Have rollback plan ready (keep old version enabled temporarily)
- [ ] Schedule rotation during low-traffic period if possible

---

## 2. GitHub App Private Key

### 2.1 Prerequisites
- GitHub organization admin access
- Access to GitHub App settings
- `gcloud` CLI with Secret Manager permissions

### 2.2 Rotation Procedure

**Step 1: Generate new private key in GitHub**
```bash
# Navigate to: https://github.com/organizations/YOUR_ORG/settings/apps/YOUR_APP
# Click "Generate a private key" button
# Save the downloaded .pem file securely
```

**Step 2: Verify the new key format**
```bash
# The key should be a valid PEM-formatted RSA private key
# (starts and ends with standard PEM delimiters)

head -1 /path/to/new-key.pem
tail -1 /path/to/new-key.pem
```

**Step 3: Add new version to Secret Manager**
```bash
# Add new version (keeps old version active)
gcloud secrets versions add gwi-github-app-private-key \
  --data-file=/path/to/new-key.pem \
  --project=YOUR_PROJECT_ID

# Note the new version number from output
```

**Step 4: Verify new version is accessible**
```bash
gcloud secrets versions access latest \
  --secret=gwi-github-app-private-key \
  --project=YOUR_PROJECT_ID | head -1
```

**Step 5: Deploy services to pick up new secret**
```bash
# Cloud Run services using secret_key_ref automatically use "latest"
# Force new revision to ensure fresh secret fetch

# Gateway service
gcloud run services update gwi-a2a-gateway-prod \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID \
  --update-labels=rotation-date=$(date +%Y%m%d)

# Worker service
gcloud run services update gwi-worker-prod \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID \
  --update-labels=rotation-date=$(date +%Y%m%d)

# GitHub webhook service
gcloud run services update gwi-github-webhook-prod \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID \
  --update-labels=rotation-date=$(date +%Y%m%d)
```

**Step 6: Verify services are healthy**
```bash
# Check each service health endpoint
curl -s https://gwi-a2a-gateway-prod-HASH.run.app/health
curl -s https://gwi-worker-prod-HASH.run.app/health
curl -s https://gwi-github-webhook-prod-HASH.run.app/health

# Run smoke tests
npm run smoke:production
```

**Step 7: Disable old version after verification**
```bash
# List versions to find old one
gcloud secrets versions list gwi-github-app-private-key \
  --project=YOUR_PROJECT_ID

# Disable old version (can still be re-enabled if needed)
gcloud secrets versions disable OLD_VERSION \
  --secret=gwi-github-app-private-key \
  --project=YOUR_PROJECT_ID
```

**Step 8: Delete old key from GitHub (after 24h monitoring)**
```bash
# Navigate to GitHub App settings
# Delete the old private key
# This is irreversible - only do after confirming new key works
```

### 2.3 Rollback Procedure

If issues occur after rotation:

```bash
# Re-enable old version
gcloud secrets versions enable OLD_VERSION \
  --secret=gwi-github-app-private-key \
  --project=YOUR_PROJECT_ID

# Force services to use old version by specifying version number
# (Requires OpenTofu change to pin version - emergency only)

# Alternatively, redeploy services to refresh cache
gcloud run services update SERVICE_NAME \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID \
  --clear-labels
```

### 2.4 Verification Steps

```bash
# Test GitHub API access with new key
# This should return 200 with installation data
curl -H "Authorization: Bearer $(npm run --silent github:token)" \
  https://api.github.com/app/installations

# Test webhook signature validation
# Trigger a test webhook from GitHub App settings
```

---

## 3. GitHub Webhook Secret

### 3.1 Prerequisites
- GitHub organization admin or repository admin access
- Access to webhook settings

### 3.2 Rotation Procedure

**Step 1: Generate new webhook secret**
```bash
# Generate a secure random secret
NEW_SECRET=$(openssl rand -hex 32)
echo "New secret generated (save securely): $NEW_SECRET"
```

**Step 2: Update Secret Manager first**
```bash
# Add new version
echo -n "$NEW_SECRET" | gcloud secrets versions add gwi-github-webhook-secret \
  --data-file=- \
  --project=YOUR_PROJECT_ID
```

**Step 3: Deploy webhook service to pick up new secret**
```bash
gcloud run services update gwi-github-webhook-prod \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID \
  --update-labels=rotation-date=$(date +%Y%m%d)
```

**Step 4: Update GitHub webhook configuration**
```bash
# Navigate to: https://github.com/YOUR_ORG/YOUR_REPO/settings/hooks
# Or for org-level: https://github.com/organizations/YOUR_ORG/settings/hooks

# Edit the webhook
# Update the "Secret" field with $NEW_SECRET
# Save changes
```

**Step 5: Verify webhook delivery**
```bash
# Trigger a test event from GitHub webhook settings
# Check webhook service logs for successful validation

gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="gwi-github-webhook-prod"' \
  --limit=20 \
  --project=YOUR_PROJECT_ID
```

**Step 6: Disable old version**
```bash
gcloud secrets versions disable OLD_VERSION \
  --secret=gwi-github-webhook-secret \
  --project=YOUR_PROJECT_ID
```

### 3.3 Rollback Procedure

```bash
# Re-enable old secret version
gcloud secrets versions enable OLD_VERSION \
  --secret=gwi-github-webhook-secret \
  --project=YOUR_PROJECT_ID

# Redeploy service
gcloud run services update gwi-github-webhook-prod \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID \
  --clear-labels

# Revert GitHub webhook secret to old value
# (Must have saved old value)
```

### 3.4 Important Note

GitHub webhook secret rotation requires updating both Secret Manager AND GitHub webhook settings. There will be a brief window where signature validation may fail. To minimize impact:

1. Update Secret Manager and deploy service FIRST
2. Update GitHub immediately after (within seconds)
3. Schedule during low-traffic period

---

## 4. Anthropic API Key

### 4.1 Prerequisites
- Anthropic Console access (console.anthropic.com)
- Account owner or key management permissions

### 4.2 Rotation Procedure

**Step 1: Generate new API key in Anthropic Console**
```bash
# Navigate to: https://console.anthropic.com/settings/keys
# Click "Create Key"
# Name it: "gwi-production-YYYYMMDD"
# Copy the key immediately (only shown once)
```

**Step 2: Update Secret Manager**
```bash
echo -n "sk-ant-YOUR_NEW_KEY" | gcloud secrets versions add gwi-anthropic-api-key \
  --data-file=- \
  --project=YOUR_PROJECT_ID
```

**Step 3: Deploy worker service**
```bash
gcloud run services update gwi-worker-prod \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID \
  --update-labels=rotation-date=$(date +%Y%m%d)
```

**Step 4: Verify API access**
```bash
# Test API call with new key (from worker logs or manual test)
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="gwi-worker-prod" AND textPayload=~"anthropic"' \
  --limit=20 \
  --project=YOUR_PROJECT_ID
```

**Step 5: Delete old key from Anthropic Console**
```bash
# Navigate to: https://console.anthropic.com/settings/keys
# Delete the old key
# Only after 24h verification period
```

**Step 6: Disable old Secret Manager version**
```bash
gcloud secrets versions disable OLD_VERSION \
  --secret=gwi-anthropic-api-key \
  --project=YOUR_PROJECT_ID
```

### 4.3 Rollback Procedure

```bash
# Re-enable old version
gcloud secrets versions enable OLD_VERSION \
  --secret=gwi-anthropic-api-key \
  --project=YOUR_PROJECT_ID

# Redeploy worker
gcloud run services update gwi-worker-prod \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID \
  --clear-labels

# If old Anthropic key was deleted, must create new one
```

---

## 5. Google AI API Key

### 5.1 Prerequisites
- Google Cloud Console access
- API key management permissions

### 5.2 Rotation Procedure

**Step 1: Create new API key**
```bash
# Navigate to: https://console.cloud.google.com/apis/credentials
# Click "Create Credentials" > "API Key"
# Restrict key to "Generative Language API" only
# Add application restrictions if applicable
```

**Step 2: Update Secret Manager**
```bash
echo -n "YOUR_NEW_GOOGLE_AI_KEY" | gcloud secrets versions add gwi-google-ai-api-key \
  --data-file=- \
  --project=YOUR_PROJECT_ID
```

**Step 3: Deploy worker service**
```bash
gcloud run services update gwi-worker-prod \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID \
  --update-labels=rotation-date=$(date +%Y%m%d)
```

**Step 4: Verify API access**
```bash
# Check worker logs for successful Gemini API calls
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="gwi-worker-prod" AND textPayload=~"gemini"' \
  --limit=20 \
  --project=YOUR_PROJECT_ID
```

**Step 5: Delete old API key**
```bash
# Navigate to: https://console.cloud.google.com/apis/credentials
# Delete the old API key
# Only after 24h verification period
```

**Step 6: Disable old Secret Manager version**
```bash
gcloud secrets versions disable OLD_VERSION \
  --secret=gwi-google-ai-api-key \
  --project=YOUR_PROJECT_ID
```

### 5.3 Rollback Procedure

```bash
# Re-enable old version
gcloud secrets versions enable OLD_VERSION \
  --secret=gwi-google-ai-api-key \
  --project=YOUR_PROJECT_ID

# Redeploy worker
gcloud run services update gwi-worker-prod \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID \
  --clear-labels
```

---

## 6. Stripe Secret Key

### 6.1 Prerequisites
- Stripe Dashboard access (dashboard.stripe.com)
- Account owner or developer permissions

### 6.2 Rotation Procedure

**Step 1: Generate new Stripe key (rolling keys)**
```bash
# Navigate to: https://dashboard.stripe.com/apikeys
# Click "Roll key" next to the secret key
# This creates a new key while keeping old one active for 24h
# Copy the new key
```

**Step 2: Update Secret Manager**
```bash
echo -n "sk_live_YOUR_NEW_KEY" | gcloud secrets versions add gwi-stripe-secret-key \
  --data-file=- \
  --project=YOUR_PROJECT_ID
```

**Step 3: Deploy API service**
```bash
gcloud run services update gwi-api-prod \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID \
  --update-labels=rotation-date=$(date +%Y%m%d)
```

**Step 4: Verify Stripe connectivity**
```bash
# Test Stripe API access
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="gwi-api-prod" AND textPayload=~"stripe"' \
  --limit=20 \
  --project=YOUR_PROJECT_ID
```

**Step 5: Complete key roll in Stripe**
```bash
# After 24h, navigate to Stripe Dashboard
# The rolled key process auto-completes
# Or manually expire old key if confident
```

**Step 6: Disable old Secret Manager version**
```bash
gcloud secrets versions disable OLD_VERSION \
  --secret=gwi-stripe-secret-key \
  --project=YOUR_PROJECT_ID
```

### 6.3 Rollback Procedure

Stripe's rolling keys feature allows both keys to work for 24 hours. If issues occur:

```bash
# Re-enable old Secret Manager version
gcloud secrets versions enable OLD_VERSION \
  --secret=gwi-stripe-secret-key \
  --project=YOUR_PROJECT_ID

# Redeploy API service
gcloud run services update gwi-api-prod \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID \
  --clear-labels

# Cancel the roll in Stripe Dashboard if within 24h window
```

---

## 7. Stripe Webhook Secret

### 7.1 Prerequisites
- Stripe Dashboard access
- Webhook endpoint already configured

### 7.2 Rotation Procedure

**Step 1: Generate new webhook secret in Stripe**
```bash
# Navigate to: https://dashboard.stripe.com/webhooks
# Click on your webhook endpoint
# Click "Reveal" next to Signing secret
# Click "Roll secret" to generate new one
# Both secrets are valid for 24h during transition
# Copy the new secret (whsec_...)
```

**Step 2: Update Secret Manager**
```bash
echo -n "whsec_YOUR_NEW_SECRET" | gcloud secrets versions add gwi-stripe-webhook-secret \
  --data-file=- \
  --project=YOUR_PROJECT_ID
```

**Step 3: Deploy API service**
```bash
gcloud run services update gwi-api-prod \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID \
  --update-labels=rotation-date=$(date +%Y%m%d)
```

**Step 4: Verify webhook delivery**
```bash
# Send a test webhook from Stripe Dashboard
# Check webhook endpoint for successful signature validation
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="gwi-api-prod" AND textPayload=~"webhook"' \
  --limit=20 \
  --project=YOUR_PROJECT_ID
```

**Step 5: Complete roll in Stripe (after 24h)**
```bash
# Old secret automatically expires
# Or manually expire from Stripe Dashboard
```

**Step 6: Disable old Secret Manager version**
```bash
gcloud secrets versions disable OLD_VERSION \
  --secret=gwi-stripe-webhook-secret \
  --project=YOUR_PROJECT_ID
```

### 7.3 Rollback Procedure

```bash
# Re-enable old Secret Manager version
gcloud secrets versions enable OLD_VERSION \
  --secret=gwi-stripe-webhook-secret \
  --project=YOUR_PROJECT_ID

# Redeploy API service
gcloud run services update gwi-api-prod \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID \
  --clear-labels
```

---

## 8. Rotation Schedule

### 8.1 Recommended Schedule

| Secret | Frequency | Best Time | Notes |
|--------|-----------|-----------|-------|
| GitHub App Private Key | 90 days | Weekend, low traffic | Coordinate with GitHub App settings |
| GitHub Webhook Secret | 180 days | Weekday, business hours | Brief validation gap possible |
| Anthropic API Key | 90 days | Anytime | No coordination needed |
| Google AI API Key | 90 days | Anytime | No coordination needed |
| Stripe Secret Key | 90 days | Weekday | Use Stripe rolling keys |
| Stripe Webhook Secret | 180 days | Weekday | Use Stripe rolling secrets |

### 8.2 Automated Rotation Reminders

Set up Cloud Scheduler to send rotation reminders:

```bash
# Create Pub/Sub topic for rotation reminders
gcloud pubsub topics create secret-rotation-reminders \
  --project=YOUR_PROJECT_ID

# Create scheduler job (runs monthly on the 1st)
gcloud scheduler jobs create pubsub secret-rotation-check \
  --schedule="0 9 1 * *" \
  --topic=secret-rotation-reminders \
  --message-body='{"action":"check-rotation-status"}' \
  --time-zone="America/Chicago" \
  --project=YOUR_PROJECT_ID
```

### 8.3 Monitoring Secret Age

Use this script to check secret ages:

```bash
#!/bin/bash
# check-secret-ages.sh

PROJECT_ID="YOUR_PROJECT_ID"
SECRETS=(
  "gwi-github-app-private-key:90"
  "gwi-github-webhook-secret:180"
  "gwi-anthropic-api-key:90"
  "gwi-google-ai-api-key:90"
  "gwi-stripe-secret-key:90"
  "gwi-stripe-webhook-secret:180"
)

echo "Secret Rotation Status Report"
echo "=============================="
echo ""

for entry in "${SECRETS[@]}"; do
  SECRET_ID="${entry%%:*}"
  MAX_DAYS="${entry##*:}"

  # Get latest version creation time
  CREATE_TIME=$(gcloud secrets versions list "$SECRET_ID" \
    --project="$PROJECT_ID" \
    --filter="state=ENABLED" \
    --sort-by="~createTime" \
    --limit=1 \
    --format="value(createTime)" 2>/dev/null)

  if [ -z "$CREATE_TIME" ]; then
    echo "$SECRET_ID: NOT FOUND or NO ENABLED VERSION"
    continue
  fi

  # Calculate age in days
  CREATE_EPOCH=$(date -d "$CREATE_TIME" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "${CREATE_TIME%.*}" +%s 2>/dev/null)
  NOW_EPOCH=$(date +%s)
  AGE_DAYS=$(( (NOW_EPOCH - CREATE_EPOCH) / 86400 ))

  if [ "$AGE_DAYS" -gt "$MAX_DAYS" ]; then
    echo "$SECRET_ID: NEEDS ROTATION ($AGE_DAYS days old, max $MAX_DAYS)"
  else
    REMAINING=$((MAX_DAYS - AGE_DAYS))
    echo "$SECRET_ID: OK ($AGE_DAYS days old, $REMAINING days until rotation)"
  fi
done
```

---

## 9. Emergency Rotation (Compromise Response)

If a secret is compromised, follow this expedited process:

### 9.1 Immediate Actions (First 15 minutes)

1. **Alert the team** - Page on-call and security
2. **Revoke at source immediately**:
   - GitHub: Delete private key in App settings
   - Anthropic: Delete API key in Console
   - Google AI: Delete API key in Cloud Console
   - Stripe: Immediately expire key (no grace period)

3. **Generate new secret** following standard procedures above

4. **Update Secret Manager**:
```bash
gcloud secrets versions add SECRET_ID \
  --data-file=new-secret-file \
  --project=YOUR_PROJECT_ID
```

5. **Force service restart**:
```bash
# All affected services
gcloud run services update SERVICE_NAME \
  --region=us-central1 \
  --project=YOUR_PROJECT_ID \
  --update-labels=emergency-rotation=$(date +%Y%m%d%H%M%S)
```

### 9.2 Post-Incident Actions

1. Audit logs for unauthorized access
2. Review IAM permissions
3. Document in incident report
4. Update rotation schedule if needed

---

## 10. Smoke Tests

Verify secrets are accessible after any rotation:

```bash
# Run from CI or locally with proper credentials
npm run test:secrets:smoke

# Or manually check secret access
gcloud secrets versions access latest --secret=SECRET_ID --project=YOUR_PROJECT_ID | head -c 10
```

See `packages/core/src/secrets/__tests__/smoke.test.ts` for automated smoke tests.

---

## 11. Contacts

| Role | Contact | When to Engage |
|------|---------|----------------|
| On-call Engineer | PagerDuty | Any rotation issues |
| Security Team | security@example.com | Compromise suspected |
| DevOps Lead | devops@example.com | Infrastructure changes |

---

## 12. Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-12-19 | Claude Code | Initial runbook for A9.s3 |
