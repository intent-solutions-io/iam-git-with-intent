# Firebase Hosting Operations Runbook

**Epic A: Firebase Hosting Deployment (Staging/Prod) via WIF**
**Version:** 1.0.0
**Last Updated:** 2026-01-29

## Overview

This document covers Firebase Hosting deployment for the GWI web dashboard, including:
- Project structure and hosting targets
- Deployment procedures
- Rollback procedures
- Troubleshooting

## Project Structure

### Firebase Project
- **Project ID:** `git-with-intent`
- **Hosting Sites:**
  - `git-with-intent` - Production (https://git-with-intent.web.app)
  - `git-with-intent-staging` - Staging (https://git-with-intent-staging.web.app)

### Deploy Targets

| Target | Site | URL | Branch |
|--------|------|-----|--------|
| `production` | git-with-intent | https://git-with-intent.web.app | `main` |
| `staging` | git-with-intent-staging | https://git-with-intent-staging.web.app | `develop` |

## Deployment

### Automatic Deployment

Deployments trigger automatically via GitHub Actions:

| Event | Environment |
|-------|-------------|
| Push to `main` | Production |
| Push to `develop` | Staging |
| Version tag `v*` | Production |
| Manual dispatch | Selected environment |

### Manual Deployment

```bash
# Build the web app
npm run build --workspace=@gwi/web

# Deploy to staging
firebase deploy --only hosting:staging

# Deploy to production
firebase deploy --only hosting:production
```

### Deployment Verification

After deployment, verify:

1. **Health check:** Visit the hosting URL
2. **Console check:** No JavaScript errors
3. **API connectivity:** Dashboard loads data

## Rollback Procedures

### Option 1: Firebase Console Rollback (Recommended)

1. Go to [Firebase Console](https://console.firebase.google.com/project/git-with-intent/hosting)
2. Select the hosting site (production or staging)
3. Click "Release history"
4. Find the previous working release
5. Click the "..." menu → "Rollback"
6. Confirm rollback

### Option 2: CLI Rollback

```bash
# List recent releases
firebase hosting:releases:list --site=git-with-intent

# Rollback to a specific version
firebase hosting:rollback --site=git-with-intent
```

### Option 3: Git-based Rollback

```bash
# Find the last working commit
git log --oneline apps/web/

# Checkout and deploy
git checkout <commit-sha> -- apps/web/
npm run build --workspace=@gwi/web
firebase deploy --only hosting:production
```

### Rollback Verification

After rollback:

1. Clear browser cache
2. Verify site loads correctly
3. Check API connectivity
4. Monitor error rates for 15 minutes

## IAM & Permissions

### Workload Identity Federation

The GitHub Actions workflow uses WIF to authenticate:

- **Provider:** `projects/PROJECT_NUM/locations/global/workloadIdentityPools/github-pool/providers/github`
- **Service Account:** `github-actions@git-with-intent.iam.gserviceaccount.com`

### Required IAM Roles

| Role | Purpose |
|------|---------|
| `roles/firebasehosting.admin` | Deploy to Firebase Hosting |
| `roles/iam.serviceAccountTokenCreator` | Generate access tokens via WIF |

### Manual Permission Grant

```bash
# Grant Firebase Hosting Admin role
gcloud projects add-iam-policy-binding git-with-intent \
  --member="serviceAccount:github-actions@git-with-intent.iam.gserviceaccount.com" \
  --role="roles/firebasehosting.admin"
```

## Environment Configuration

### Build-time Variables

| Variable | Description | Staging | Production |
|----------|-------------|---------|------------|
| `VITE_API_URL` | API endpoint | `https://api-staging.gwi.dev` | `https://api.gwi.dev` |
| `VITE_GATEWAY_URL` | Gateway endpoint | `https://gateway-staging.gwi.dev` | `https://gateway.gwi.dev` |
| `VITE_ENVIRONMENT` | Environment name | `staging` | `production` |

### GitHub Secrets/Variables Required

| Name | Type | Description |
|------|------|-------------|
| `WIF_PROVIDER` | Variable | WIF provider resource name |
| `WIF_SERVICE_ACCOUNT` | Variable | Service account email |
| `PROD_API_URL` | Variable | Production API URL |
| `STAGING_API_URL` | Variable | Staging API URL |
| `PROD_GATEWAY_URL` | Variable | Production Gateway URL |
| `STAGING_GATEWAY_URL` | Variable | Staging Gateway URL |

## Troubleshooting

### Deployment Fails

```
Error: HTTP Error: 403, The caller does not have permission
```

**Solution:** Verify WIF configuration and IAM roles.

### Site Not Updating

1. Check for CDN caching (wait 5-10 minutes)
2. Force cache clear: `firebase hosting:disable --site=<site> && firebase deploy`
3. Verify correct target in `.firebaserc`

### Build Fails

```
Error: Cannot find module '@gwi/core'
```

**Solution:** Ensure dependencies are built first:
```bash
npm run build --workspace=@gwi/core
npm run build --workspace=@gwi/web
```

## Monitoring

### Firebase Hosting Metrics

Monitor via [Firebase Console](https://console.firebase.google.com/project/git-with-intent/hosting):
- Bandwidth usage
- Request count
- Error rates

### Alerts

Configure alerts in Google Cloud Monitoring for:
- 5xx error rate > 1%
- Latency P95 > 2s

## References

- [Firebase Hosting Docs](https://firebase.google.com/docs/hosting)
- [GitHub Actions WIF](https://github.com/google-github-actions/auth)
- [Deploy Workflow](.github/workflows/deploy.yml)
