# 022-DR-ADRC: Firestore Runtime Stores

**Document ID:** 022-DR-ADRC
**Document Type:** Architecture Decision Record (ADR)
**Created:** 2025-12-15
**Last Updated:** 2025-12-15
**Status:** ACCEPTED
**Author:** Jeremy Longshore, Claude Code (Opus 4.5)
**Applies To:** git-with-intent repository

---

> **Filing Standard:** This document follows docs-filing v4 (6767-a-DR-STND-document-filing-system-standard-v4.md)
> - `022` = chronological sequence number
> - `DR` = Documentation & Reference category
> - `ADRC` = Architecture Decision type

---

## Context

Previous phases used in-memory stores for tenant, repo, and run data. This was fine for development but:

1. **Data loss on restart**: All runs, tenants, and repos lost when service restarts
2. **No persistence**: Cannot track run history across sessions
3. **Single-node only**: In-memory maps don't work across multiple Cloud Run instances
4. **No production viability**: Cannot deploy to production without persistent storage

### Problem

The engine and API needed persistent storage for:
- Tenant configurations (GitHub org installations)
- Connected repositories within tenants
- Run history and status
- Multi-instance deployments on Cloud Run

---

## Decision

**Implement Firestore-backed stores for TenantStore and RunStore, selectable via environment variable.**

### Environment Variable

```bash
# Use Firestore (production)
export GWI_STORE_BACKEND=firestore
export GCP_PROJECT_ID=your-project-id

# Use in-memory (development, default)
export GWI_STORE_BACKEND=memory
# or unset GWI_STORE_BACKEND
```

### Store Selection

```typescript
import { getTenantStore, getRunStore, getStoreBackend } from '@gwi/core';

const backend = getStoreBackend();  // 'memory' or 'firestore'
const tenantStore = getTenantStore();  // Returns singleton
const runStore = getRunStore();  // Returns singleton
```

---

## Implementation Details

### Firestore Collection Structure

```
gwi_tenants/{tenantId}
  - id, githubOrgId, githubOrgLogin, displayName
  - installationId, installedAt, installedBy
  - plan, planLimits, settings
  - runsThisMonth, lastRunAt
  - createdAt, updatedAt
  └── repos/{repoId}
        - id, tenantId, githubRepoId, githubFullName
        - displayName, enabled, settings
        - totalRuns, successfulRuns, failedRuns
        - addedAt, updatedAt

gwi_runs/{runId}
  - id, tenantId, repoId
  - prId, prUrl, type, status
  - currentStep, steps[], result, error
  - trigger, a2aCorrelationId, tokensUsed
  - createdAt, updatedAt, completedAt, durationMs
  └── steps/{stepId}  (subcollection)
```

### Files Created

| File | Purpose |
|------|---------|
| `packages/core/src/storage/firestore-client.ts` | Firestore client singleton, config, utilities |
| `packages/core/src/storage/firestore-tenant.ts` | FirestoreTenantStore implementation |
| `packages/core/src/storage/firestore-run.ts` | FirestoreRunStore implementation |

### Files Modified

| File | Changes |
|------|---------|
| `packages/core/src/storage/index.ts` | Added exports, `getTenantStore()`, `getRunStore()`, `getStoreBackend()` |
| `packages/engine/src/run/engine.ts` | Uses TenantStore for persistent runs |
| `apps/api/src/index.ts` | Uses TenantStore for tenant/repo/settings endpoints |

---

## Store Interface

### TenantStore Methods Used

```typescript
interface TenantStore {
  // Tenant CRUD
  createTenant(tenant): Promise<Tenant>;
  getTenant(tenantId): Promise<Tenant | null>;
  updateTenant(tenantId, update): Promise<Tenant>;
  deleteTenant(tenantId): Promise<void>;

  // Repo management
  addRepo(tenantId, repo): Promise<TenantRepo>;
  getRepo(tenantId, repoId): Promise<TenantRepo | null>;
  listRepos(tenantId, filter?): Promise<TenantRepo[]>;
  updateRepo(tenantId, repoId, update): Promise<TenantRepo>;
  removeRepo(tenantId, repoId): Promise<void>;

  // Run management (scoped to tenant)
  createRun(tenantId, run): Promise<SaaSRun>;
  getRun(tenantId, runId): Promise<SaaSRun | null>;
  listRuns(tenantId, filter?): Promise<SaaSRun[]>;
  updateRun(tenantId, runId, update): Promise<SaaSRun>;
}
```

---

## Configuration

### Required Environment Variables (Firestore)

```bash
# Required
GWI_STORE_BACKEND=firestore
GCP_PROJECT_ID=your-gcp-project

# Optional (uses Application Default Credentials if not set)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Optional (for local development with emulator)
GWI_FIRESTORE_EMULATOR_HOST=localhost:8080
```

### Required Environment Variables (In-Memory)

```bash
# None required - this is the default
# Optionally explicit:
GWI_STORE_BACKEND=memory
```

---

## Consequences

### Positive

- **Persistent storage**: Data survives restarts
- **Multi-instance ready**: Cloud Run can scale horizontally
- **Firestore benefits**: Real-time updates, automatic scaling, global distribution
- **Backward compatible**: Default to in-memory for development
- **Graceful fallback**: Engine falls back to in-memory if Firestore fails

### Negative

- **Firebase dependency**: Adds firebase-admin SDK to production dependencies
- **GCP requirement**: Production requires Google Cloud project
- **Cost**: Firestore has read/write costs (minimal for expected usage)

### What's NOT Implemented

| Feature | Status |
|---------|--------|
| UserStore (Firestore) | Uses in-memory only |
| MembershipStore (Firestore) | Uses in-memory only |
| Firestore indexes | Need to be deployed manually |
| Emulator integration tests | Not included |

---

## Verification

### Check Store Backend

```bash
# Start API and check health
curl http://localhost:8080/health | jq '.storeBackend'
# Should return "memory" or "firestore"
```

### Test with In-Memory (Default)

```bash
# Start API (uses in-memory by default)
npm run dev --workspace=@gwi/api

# Create a run
curl -X POST http://localhost:8080/tenants/test-tenant/runs \
  -H "Content-Type: application/json" \
  -H "X-Debug-User: test-user" \
  -d '{"repoUrl":"https://github.com/test/repo","runType":"TRIAGE"}'
```

### Test with Firestore

```bash
# Set environment
export GWI_STORE_BACKEND=firestore
export GCP_PROJECT_ID=your-project

# Start API
npm run dev --workspace=@gwi/api

# Verify in Firestore console: gwi_tenants, gwi_runs collections
```

---

## References

- **Phase 6 (AgentFS/Beads):** `000-docs/020-DR-ADRC-gwi-live-agentfs-and-beads-config.md`
- **Storage Interfaces:** `packages/core/src/storage/interfaces.ts`
- **In-Memory Stores:** `packages/core/src/storage/inmemory.ts`
- **Firebase Admin SDK:** https://firebase.google.com/docs/admin/setup

---

**Decision:** ACCEPTED
**Date:** 2025-12-15

---

*intent solutions io - confidential IP*
*Contact: jeremy@intentsolutions.io*
