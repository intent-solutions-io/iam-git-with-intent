# 027-DR-ADRC: Staging Cloud Run + Firestore Deployment

**Document ID:** 027-DR-ADRC
**Document Type:** Decision Record - Comprehensive
**Created:** 2025-12-16
**Status:** ACCEPTED
**Author:** Claude Code (Opus 4.5)

---

> **Filing Standard:** This document follows docs-filing v4
> - `027` = chronological sequence number
> - `DR` = Decision Record category
> - `ADRC` = Architecture Decision Record Comprehensive type

---

## Context

Phase 9 establishes the staging deployment infrastructure for Git With Intent. After completing GitHub App integration (Phase 8), we need a cloud environment for testing the full SaaS flow before production release.

## Decision

### D1: Cloud Run for Services

**Decision:** Deploy API and Webhook services to Cloud Run with managed scaling.

**Rationale:**
- Zero-to-scale capability reduces staging costs
- Simple deployment via Docker containers
- Built-in health checks and rolling updates
- Integrates seamlessly with GCP IAM

**Configuration:**
```yaml
API Service:
  Memory: 512Mi
  CPU: 1
  Min Instances: 0
  Max Instances: 3

Webhook Service:
  Memory: 256Mi
  CPU: 1
  Min Instances: 0
  Max Instances: 10
```

### D2: Firestore Security Rules

**Decision:** Implement role-based access control with tenant isolation.

**Helper Functions:**
- `isAuthenticated()` - Basic auth check
- `hasTenantAccess(tenantId)` - Membership verification
- `isTenantAdmin(tenantId)` - Admin role check
- `isTenantOwner(tenantId)` - Owner role check
- `isServiceAccount()` - Cloud Run service identity

**Access Patterns:**
| Collection | Read | Create | Update | Delete |
|------------|------|--------|--------|--------|
| gwi_tenants | Member + SA | SA only | Admin + SA | Owner + SA |
| gwi_runs | Member + SA | SA only | SA only | Admin + SA |
| gwi_users | Self + SA | SA only | Self + SA | SA only |
| gwi_memberships | Self/Admin + SA | Admin + SA | Admin + SA | Owner + SA |
| gwi_installations | SA only | SA only | SA only | SA only |

### D3: Composite Indexes

**Decision:** Pre-create composite indexes for common query patterns.

**Indexes:**
1. `gwi_runs (tenantId ASC, createdAt DESC)` - List runs by tenant
2. `gwi_runs (tenantId ASC, repoId ASC, createdAt DESC)` - List runs by repo
3. `gwi_runs (tenantId ASC, status ASC, createdAt DESC)` - Filter runs by status
4. `gwi_memberships (userId ASC, status ASC)` - User's active memberships
5. `gwi_memberships (tenantId ASC, status ASC)` - Tenant's active members

### D4: Field Overrides

**Decision:** Add single-field indexes for lookup patterns.

- `gwi_tenants.installationId` - Webhook installation lookup
- `gwi_installations.tenantId` - Reverse installation lookup

### D5: Smoke Test Strategy

**Decision:** Create automated smoke tests for deployed services.

**Test Categories:**
1. **API Tests** - Health check, authenticated endpoints
2. **Webhook Tests** - Health check, event acceptance
3. **Firestore Tests** - Connection, write/read cycle, collection listing

### D6: Deployment Script

**Decision:** Shell script for reproducible staging deployments.

**Features:**
- Selective service deployment (`--service=api`)
- Build skip option (`--skip-build`)
- Automatic Firestore rules deployment
- Post-deployment URL output

## Consequences

### Positive
- Reproducible staging environment
- Security rules enforce tenant isolation
- Smoke tests catch deployment issues early
- Zero-cost when not in use (scale to zero)

### Negative
- Cold start latency in staging (~2-5 seconds)
- Requires GCP project setup and IAM configuration
- Firebase CLI needed for Firestore deployments

### Risks
- Service account permissions must be carefully configured
- Index creation can take minutes for large datasets
- Security rule changes require careful testing

## Implementation

### Files Created
- `apps/api/Dockerfile` - API service container
- `apps/github-webhook/Dockerfile` - Webhook service container (updated)
- `firestore.rules` - Security rules
- `firestore.indexes.json` - Composite indexes
- `scripts/cloud-smoke-test.ts` - Automated smoke tests
- `scripts/deploy-staging.sh` - Deployment automation

### NPM Scripts Added
- `npm run smoke:staging` - Run staging smoke tests
- `npm run smoke:production` - Run production smoke tests
- `npm run deploy:staging` - Deploy to staging

## Related Documents

- 022-DR-ADRC-firestore-runtime-stores.md - Firestore schema design
- 025-DR-ADRC-github-app-webhook-tenant-linking.md - Tenant model
- 026-AA-AACR-phase-8-github-app-webhook-tenant-linking.md - Phase 8 completion

---

*intent solutions io - confidential IP*
*Contact: jeremy@intentsolutions.io*
