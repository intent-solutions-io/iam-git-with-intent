# 028-AA-AACR: Phase 9 - Staging Cloud Run + Firestore Deployment

**Document ID:** 028-AA-AACR
**Document Type:** After-Action Report - Comprehensive
**Created:** 2025-12-16
**Status:** COMPLETED
**Author:** Claude Code (Opus 4.5)

---

> **Filing Standard:** This document follows docs-filing v4
> - `028` = chronological sequence number
> - `AA` = Administrative category
> - `AACR` = After-Action Comprehensive Report type

---

## Executive Summary

Phase 9 establishes the staging deployment infrastructure for Git With Intent. This includes Cloud Run Dockerfiles for both services, Firestore security rules with tenant isolation, composite indexes for query optimization, and automated smoke tests.

## Objectives Achieved

| Objective | Status |
|-----------|--------|
| Create API Dockerfile with workspace support | DONE |
| Update Webhook Dockerfile for workspace | DONE |
| Create Firestore security rules | DONE |
| Create Firestore composite indexes | DONE |
| Create cloud smoke test script | DONE |
| Create staging deployment script | DONE |
| Add npm scripts for smoke tests | DONE |
| ADR documentation | DONE |

## Implementation Details

### New Files Created

1. **`apps/api/Dockerfile`**
   - Multi-stage build (builder + runner)
   - Workspace-aware npm ci
   - Non-root user execution
   - Health check configured

2. **`firestore.rules`**
   - Role-based access control helpers
   - Tenant isolation enforcement
   - Service account bypass for Cloud Run
   - Subcollection security (repos, steps)

3. **`firestore.indexes.json`**
   - 5 composite indexes for common queries
   - 2 field overrides for lookup patterns

4. **`scripts/cloud-smoke-test.ts`**
   - API health and endpoint tests
   - Webhook health and event tests
   - Firestore connection and CRUD tests
   - Summary with pass/fail reporting

5. **`scripts/deploy-staging.sh`**
   - Docker build and push
   - Cloud Run deployment
   - Firestore rules deployment
   - Selective service deployment

### Modified Files

1. **`apps/github-webhook/Dockerfile`**
   - Updated from simple build to workspace-aware
   - Added @gwi/core dependency resolution
   - Added health check configuration

2. **`package.json`**
   - Added `smoke:staging` script
   - Added `smoke:production` script
   - Added `deploy:staging` script

## Security Model

### Firestore Rules Summary

```
gwi_tenants:
  - Read: Tenant members OR service account
  - Create: Service account only (installation webhook)
  - Update: Tenant admins OR service account
  - Delete: Tenant owner OR service account

gwi_runs:
  - Read: Tenant members OR service account
  - Create/Update: Service account only (engine)
  - Delete: Tenant admins OR service account

gwi_users:
  - Read: Self OR service account
  - Update: Self (except role) OR service account
  - Create/Delete: Service account only

gwi_memberships:
  - Read: Self, tenant admins, OR service account
  - Create/Update: Tenant admins OR service account
  - Delete: Tenant owner OR service account

gwi_installations:
  - All operations: Service account only
```

### Index Strategy

| Collection | Index Fields | Purpose |
|------------|--------------|---------|
| gwi_runs | tenantId, createdAt | List tenant runs |
| gwi_runs | tenantId, repoId, createdAt | List repo runs |
| gwi_runs | tenantId, status, createdAt | Filter by status |
| gwi_memberships | userId, status | User's memberships |
| gwi_memberships | tenantId, status | Tenant's members |

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloud Run (Staging)                      │
├────────────────────────────┬────────────────────────────────┤
│     staging-gwi-api        │     staging-gwi-webhook        │
│     - 512Mi memory         │     - 256Mi memory             │
│     - 0-3 instances        │     - 0-10 instances           │
│     - /health endpoint     │     - /health endpoint         │
└────────────────────────────┴────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Firestore (Native)                       │
│  - Security rules enforce tenant isolation                   │
│  - Composite indexes for query performance                   │
│  - Service account authentication from Cloud Run             │
└─────────────────────────────────────────────────────────────┘
```

## Build Verification

```bash
# All files created successfully
ls -la apps/api/Dockerfile
ls -la apps/github-webhook/Dockerfile
ls -la firestore.rules
ls -la firestore.indexes.json
ls -la scripts/cloud-smoke-test.ts
ls -la scripts/deploy-staging.sh
```

## Files Changed Summary

| File | Type | Purpose |
|------|------|---------|
| apps/api/Dockerfile | NEW | API container build |
| apps/github-webhook/Dockerfile | MODIFIED | Webhook container build |
| firestore.rules | NEW | Security rules |
| firestore.indexes.json | NEW | Composite indexes |
| scripts/cloud-smoke-test.ts | NEW | Smoke tests |
| scripts/deploy-staging.sh | NEW | Deployment script |
| package.json | MODIFIED | NPM scripts |

## Prerequisites for Deployment

1. **GCP Project Setup**
   - Enable Cloud Run API
   - Enable Firestore API
   - Create Artifact Registry repository

2. **Service Accounts**
   - `gwi-api@PROJECT_ID.iam.gserviceaccount.com`
   - `gwi-webhook@PROJECT_ID.iam.gserviceaccount.com`
   - Both need Firestore read/write permissions

3. **Environment Variables**
   - `GCP_PROJECT_ID` - Google Cloud project
   - `GCP_REGION` - Deployment region (default: us-central1)

4. **Firebase CLI**
   - Required for Firestore rules deployment
   - `firebase login` and project association

## Next Steps

1. **Phase 10**: Firebase Hosting + Minimal SaaS UI Shell + Auth Stub
2. **Phase 11**: End-to-end integration testing
3. **Production Deployment**: After staging validation

## Lessons Learned

1. Workspace-aware Dockerfiles require careful layer ordering
2. Firestore security rules need thorough testing before deployment
3. Composite indexes should be deployed before dependent queries run
4. Smoke tests catch deployment issues early

---

*intent solutions io - confidential IP*
*Contact: jeremy@intentsolutions.io*
