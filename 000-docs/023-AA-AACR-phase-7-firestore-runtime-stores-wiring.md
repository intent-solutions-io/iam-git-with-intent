# 023-AA-AACR: Phase 7 After-Action Report - Firestore Runtime Stores Wiring

**Document ID:** 023-AA-AACR
**Document Type:** After-Action Completion Report (AAR)
**Created:** 2025-12-15
**Last Updated:** 2025-12-15
**Status:** FINAL
**Author:** Jeremy Longshore, Claude Code (Opus 4.5)
**Phase:** Phase 7 - Firestore Runtime Stores + Engine Wiring + Beads Planning

---

> **Filing Standard:** This document follows docs-filing v4 (6767-a-DR-STND-document-filing-system-standard-v4.md)
> - `023` = chronological sequence number
> - `AA` = Administrative category
> - `AACR` = After-Action Completion Report type

---

## Metadata

| Field | Value |
|-------|-------|
| **Phase** | 7 |
| **Repo/App** | git-with-intent |
| **Owner** | Jeremy Longshore |
| **Date/Time (CST)** | 2025-12-15 CST |
| **Status** | FINAL |
| **Related Issues/PRs** | N/A |
| **Commit(s)** | phase-7-firestore-runtime branch |

---

## Beads / Task IDs Created

| Task ID | Status | Title |
|---------|--------|-------|
| git-with-intent-ydg | open | GWI: Phase 7 – Design Firestore Tenant/Run model |
| git-with-intent-38d | open | GWI: Phase 7 – Implement FirestoreTenantStore + FirestoreRunStore |
| git-with-intent-cw8 | open | GWI: Phase 7 – Wire Firestore stores into engine and gwi-api |
| git-with-intent-cji | open | GWI: Phase 7 – Add Firestore ADR + AAR |

---

## Executive Summary

- **Firestore client module created**: Centralized Firebase Admin SDK initialization
- **FirestoreTenantStore implemented**: Full TenantStore interface for tenants, repos, and runs
- **FirestoreRunStore implemented**: Simpler RunStore for PR-centric tracking
- **Engine updated**: Uses TenantStore from @gwi/core with env-based backend selection
- **gwi-api updated**: Tenant, repo, and settings endpoints now use TenantStore
- **Environment-based selection**: `GWI_STORE_BACKEND=firestore` or `memory` (default)
- **Documentation created**: ADR 022 and this AAR

---

## What Changed

### New Files Created

| File | Purpose |
|------|---------|
| `packages/core/src/storage/firestore-client.ts` | Firestore client singleton, config, utilities |
| `packages/core/src/storage/firestore-tenant.ts` | FirestoreTenantStore implementation |
| `packages/core/src/storage/firestore-run.ts` | FirestoreRunStore implementation |
| `000-docs/022-DR-ADRC-firestore-runtime-stores.md` | Phase 7 ADR |
| `000-docs/023-AA-AACR-phase-7-*.md` | This AAR |

### Files Modified

| File | Changes |
|------|---------|
| `package.json` | Added firebase-admin, better-sqlite3 dependencies |
| `packages/core/src/storage/index.ts` | Added exports, `getTenantStore()`, `getRunStore()`, `getStoreBackend()` |
| `packages/core/src/storage/inmemory.ts` | Removed unused TenantSettings import |
| `packages/core/src/index.ts` | Fixed duplicate export conflict (ConflictInfo, PRMetadata) |
| `packages/engine/src/run/engine.ts` | Uses TenantStore for persistent runs with fallback |
| `apps/api/src/index.ts` | Uses TenantStore for tenant/repo/settings endpoints |
| `apps/api/tsconfig.json` | Fixed module setting for NodeNext |

---

## Why

### Problem

1. **In-memory only**: Previous phases used Maps that lose data on restart
2. **No persistence**: Run history lost between sessions
3. **Single-node limitation**: Can't scale horizontally on Cloud Run
4. **Production blocker**: No way to deploy to production

### Solution

1. Created Firestore-backed implementations of TenantStore and RunStore
2. Added environment-based selection (`GWI_STORE_BACKEND`)
3. Engine uses TenantStore.createRun() for persistent storage
4. API endpoints use TenantStore for CRUD operations
5. Graceful fallback to in-memory if Firestore fails

---

## How to Verify

```bash
# Step 1: Build the packages
npm run build --workspace=@gwi/core
npm run build --workspace=@gwi/engine
npm run build --workspace=@gwi/api

# Step 2: Run with in-memory (default)
npm run dev --workspace=@gwi/api &

# Step 3: Check health shows store backend
curl http://localhost:8080/health | jq
# Should show: "storeBackend": "memory"

# Step 4: Test a run (with debug auth)
curl -X POST http://localhost:8080/tenants/test-tenant/runs \
  -H "Content-Type: application/json" \
  -H "X-Debug-User: test-user" \
  -d '{"repoUrl":"https://github.com/test/repo","runType":"TRIAGE"}'
```

### Expected Output

```json
{
  "status": "healthy",
  "app": "gwi-api",
  "version": "0.1.0",
  "env": "dev",
  "storeBackend": "memory",
  "timestamp": "..."
}
```

---

## Risks / Gotchas

1. **Firebase dependency**: Production now requires firebase-admin package (~53 deps)

2. **GCP project required**: Firestore requires GCP_PROJECT_ID for production

3. **Indexes not deployed**: Firestore composite indexes need manual deployment

4. **Auth still stubbed**: X-Debug-User header for development only

5. **UserStore/MembershipStore not implemented**: Only TenantStore and RunStore have Firestore implementations

---

## Rollback Plan

1. Set `GWI_STORE_BACKEND=memory` (or unset)
2. Remove Firestore files if needed:
   - `packages/core/src/storage/firestore-*.ts`
3. Revert changes to engine.ts and api/index.ts
4. Remove firebase-admin dependency

---

## Open Questions

- [ ] Should we add Firestore emulator integration tests?
- [ ] What Firestore indexes are needed for production queries?
- [ ] Should UserStore and MembershipStore also use Firestore?
- [ ] What's the cost estimate for Firestore reads/writes?

---

## Next Actions

| Action | Owner | Target |
|--------|-------|--------|
| Deploy Firestore indexes | Jeremy | Future |
| Implement Firestore UserStore | Jeremy | Future |
| Add emulator integration tests | Jeremy | Future |
| Wire Firebase Auth to replace debug header | Jeremy | Future |

---

## Evidence Links / Artifacts

### Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `packages/core/src/storage/firestore-client.ts` | created | Firebase client singleton |
| `packages/core/src/storage/firestore-tenant.ts` | created | FirestoreTenantStore |
| `packages/core/src/storage/firestore-run.ts` | created | FirestoreRunStore |
| `packages/core/src/storage/index.ts` | modified | Added exports and getters |
| `packages/engine/src/run/engine.ts` | modified | Uses TenantStore |
| `apps/api/src/index.ts` | modified | Uses TenantStore for endpoints |
| `000-docs/022-DR-ADRC-*.md` | created | Phase 7 ADR |
| `000-docs/023-AA-AACR-*.md` | created | This AAR |

### Commits

| Hash | Message |
|------|---------|
| (pending) | feat: Phase 7 - Firestore runtime stores and engine wiring |

### Build Verification

```
@gwi/core:build: success
@gwi/engine:build: success
@gwi/api:build: success
```

---

## Phase 7 Completion Checklist

- [x] Beads tasks created for Phase 7 planning
- [x] Firestore client module created (`firestore-client.ts`)
- [x] FirestoreTenantStore implemented (`firestore-tenant.ts`)
- [x] FirestoreRunStore implemented (`firestore-run.ts`)
- [x] Storage index exports all new modules
- [x] `getTenantStore()` and `getRunStore()` functions added
- [x] `getStoreBackend()` returns 'memory' or 'firestore'
- [x] Engine uses TenantStore with graceful fallback
- [x] gwi-api uses TenantStore for tenant/repo/settings endpoints
- [x] Health endpoint shows store backend
- [x] Startup log shows store backend
- [x] ADR 022 documents Firestore store design
- [x] This Phase 7 AAR documents all work

---

*intent solutions io - confidential IP*
*Contact: jeremy@intentsolutions.io*
