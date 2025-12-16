# 019-AA-AACR: Phase 5 After-Action Report - gwi-api and A2A Gateway Skeleton

**Document ID:** 019-AA-AACR
**Document Type:** After-Action Completion Report (AAR)
**Created:** 2025-12-15
**Last Updated:** 2025-12-15
**Status:** FINAL
**Author:** Jeremy Longshore, Claude Code (Opus 4.5)
**Phase:** Phase 5 - Agent Engine + A2A Gateway Skeleton + gwi-api Service Foundations

---

> **Filing Standard:** This document follows docs-filing v4 (6767-a-DR-STND-document-filing-system-standard-v4.md)
> - `019` = chronological sequence number
> - `AA` = Administrative category
> - `AACR` = After-Action Completion Report type

---

## Metadata

| Field | Value |
|-------|-------|
| **Phase** | 5 |
| **Repo/App** | git-with-intent |
| **Owner** | Jeremy Longshore |
| **Date/Time (CST)** | 2025-12-15 CST |
| **Status** | FINAL |
| **Related Issues/PRs** | N/A |
| **Commit(s)** | phase-5-api-and-gateway-skeleton branch |

---

## Beads / Task IDs Touched

**Beads Status:** Not yet active in this session

| Task ID | Status | Title |
|---------|--------|-------|
| N/A | - | Phase 5 was scaffolding focused |

---

## Executive Summary

- **Scaffolded gwi-api service** (`apps/api`) with Cloud Run–ready Express server and multi-tenant stub endpoints
- **Updated gwi-gateway service** (`apps/gateway`) with dedicated `/a2a/foreman` endpoint that uses local engine
- **Extended packages/engine** with `RunRequest`, `RunResult`, and `Engine` interface
- **Added in-memory store implementations** to `packages/core` for development/testing
- **Created ADR 018** documenting the API and gateway skeleton architecture
- **Maintained hook integration** - Engine calls `buildDefaultHookRunner()` on each run
- **AgentFS/Beads remain internal-only** - Not required for services to function

---

## What Changed

### New Files Created

| File | Purpose |
|------|---------|
| `packages/engine/src/run/types.ts` | RunRequest, RunResult, Engine interface definitions |
| `packages/engine/src/run/engine.ts` | Engine implementation with hook integration |
| `packages/engine/src/run/index.ts` | Run module exports |
| `packages/core/src/storage/inmemory.ts` | In-memory implementations of RunStore, TenantStore, UserStore, MembershipStore |
| `apps/api/package.json` | gwi-api package definition |
| `apps/api/tsconfig.json` | TypeScript configuration |
| `apps/api/src/index.ts` | Multi-tenant API service with stub endpoints |
| `000-docs/018-DR-ADRC-gwi-api-and-gateway-skeleton.md` | ADR for services architecture |
| `000-docs/019-AA-AACR-phase-5-*.md` | This AAR |

### Files Modified

| File | Changes |
|------|---------|
| `packages/engine/src/index.ts` | Added run module export |
| `packages/core/src/storage/index.ts` | Added in-memory store exports |
| `apps/gateway/src/index.ts` | Added `/a2a/foreman` endpoint with local engine integration |
| `apps/gateway/package.json` | Added `@gwi/engine` dependency |

---

## Why

### Problem

Phase 2 designed the multi-tenant SaaS model and API surface, but there were no actual services to handle requests. We needed:

1. A SaaS API for web dashboard and external integrations
2. An A2A gateway for routing to Vertex AI Agent Engine
3. A shared engine interface that both could call
4. Temporary storage for development before Firestore is wired

### Solution

1. **Scaffold gwi-api** with multi-tenant endpoints that call the shared engine
2. **Extend gwi-gateway** with a foreman endpoint that can use local or Agent Engine
3. **Define Engine interface** with `startRun`, `getRun`, `cancelRun`, `listRuns`
4. **Create in-memory stores** as temporary implementations
5. **Maintain hook integration** so AgentFS/Beads work when enabled

---

## How to Verify

```bash
# Step 1: Check new files exist
ls apps/api/src/index.ts
ls packages/engine/src/run/

# Step 2: Check in-memory stores
ls packages/core/src/storage/inmemory.ts

# Step 3: Verify gateway has foreman endpoint
grep -A 5 "POST /a2a/foreman" apps/gateway/src/index.ts

# Step 4: Check ADR exists
ls 000-docs/018-DR-ADRC-gwi-api-and-gateway-skeleton.md

# Step 5: Verify engine exports run module
grep "run/index" packages/engine/src/index.ts
```

---

## Risks / Gotchas

1. **In-memory storage**: All data is lost on restart. This is intentional for Phase 5 - Firestore will be wired in Phase 6.

2. **Stub authentication**: Uses `X-Debug-User` header. Not secure - Firebase Auth will be added in Phase 6.

3. **No real agent execution**: Engine just returns "started" status. Actual agent orchestration comes in Phase 7.

4. **TypeScript compilation**: The run module imports from `@gwi/core` which may need path resolution depending on build order.

---

## Rollback Plan

1. Delete new files in `packages/engine/src/run/`
2. Delete `packages/core/src/storage/inmemory.ts`
3. Delete or revert `apps/api/` to empty state
4. Revert changes to `apps/gateway/src/index.ts` and `package.json`
5. Revert exports in `packages/engine/src/index.ts` and `packages/core/src/storage/index.ts`
6. Delete ADR 018 and AAR 019

---

## Open Questions

- [ ] Should we add request rate limiting before Phase 6?
- [ ] How should we handle long-running runs (timeout, retry)?
- [ ] Should the gateway support batch run requests?

---

## Next Actions

| Action | Owner | Due |
|--------|-------|-----|
| Wire Firestore-backed stores | Jeremy | Phase 6 |
| Add Firebase Auth verification | Jeremy | Phase 6 |
| Implement GitHub webhook handler | Jeremy | Phase 6 |
| Wire Vertex AI Agent Engine calls | Jeremy | Phase 7 |
| Add real agent orchestration | Jeremy | Phase 7 |

---

## Evidence Links / Artifacts

### Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `packages/engine/src/run/*` | created | Engine interface and implementation |
| `packages/core/src/storage/inmemory.ts` | created | In-memory store implementations |
| `apps/api/*` | created | Multi-tenant SaaS API service |
| `apps/gateway/src/index.ts` | modified | Added foreman endpoint |
| `000-docs/018-DR-ADRC-*.md` | created | Services architecture ADR |
| `000-docs/019-AA-AACR-*.md` | created | This AAR |

### Commits

| Hash | Message |
|------|---------|
| (pending) | feat: Phase 5 - gwi-api and A2A gateway skeleton |

### AgentFS Snapshots

**AgentFS Status:** Not yet initialized (services scaffold phase)

### External References

- Phase 2 ADR (010): GWI Multi-Tenant Model
- Phase 2 ADR (011): GWI API Surface v0.1
- Phase 3 ADR (014): Agent Hook System Policy

---

## Phase Completion Checklist

- [x] `apps/api` exists with stub endpoints (health, tenants, runs)
- [x] `apps/api` calls shared engine on `POST /tenants/:tenantId/runs`
- [x] `apps/gateway` exposes:
  - [x] `GET /health`
  - [x] `GET /.well-known/agent.json`
  - [x] `POST /a2a/foreman` (uses local engine)
- [x] `packages/engine` defines:
  - [x] `EngineRunType`, `RunRequest`, `RunResult`
  - [x] `Engine` interface
  - [x] `createEngine()` with placeholder behavior
  - [x] Integration with `buildDefaultHookRunner()`
- [x] `packages/core` contains:
  - [x] `InMemoryRunStore`
  - [x] `InMemoryTenantStore`
  - [x] `InMemoryUserStore`
  - [x] `InMemoryMembershipStore`
- [x] ADR 018 documents services architecture
- [x] Phase 5 AAR created (this document)
- [x] All work on dedicated branch (`phase-5-api-and-gateway-skeleton`)

---

## Technical Details

### Engine Interface

```typescript
interface Engine {
  startRun(request: RunRequest): Promise<RunResult>;
  getRun(tenantId: string, runId: string): Promise<RunResult | null>;
  cancelRun(tenantId: string, runId: string): Promise<boolean>;
  listRuns(tenantId: string, limit?: number): Promise<RunResult[]>;
}
```

### RunRequest Shape

```typescript
interface RunRequest {
  tenantId: string;
  repoUrl: string;
  prNumber?: number;
  issueNumber?: number;
  runType: 'TRIAGE' | 'PLAN' | 'RESOLVE' | 'REVIEW' | 'AUTOPILOT';
  trigger: 'api' | 'webhook' | 'cli' | 'scheduled';
  riskMode?: 'comment_only' | 'suggest_patch' | 'auto_patch' | 'auto_push';
  metadata?: Record<string, unknown>;
}
```

### gwi-api Endpoints (Phase 5 Status)

| Endpoint | Status |
|----------|--------|
| `GET /health` | ✅ Working |
| `GET /me` | ✅ Stub (returns debug user) |
| `GET /tenants` | ❌ 501 Not Implemented |
| `GET /tenants/:tenantId` | ❌ 501 Not Implemented |
| `GET /tenants/:tenantId/repos` | ❌ 501 Not Implemented |
| `POST /tenants/:tenantId/repos:connect` | ❌ 501 Not Implemented |
| `GET /tenants/:tenantId/runs` | ✅ Working (in-memory) |
| `POST /tenants/:tenantId/runs` | ✅ Working (in-memory) |
| `GET /tenants/:tenantId/runs/:runId` | ✅ Working (in-memory) |
| `POST /tenants/:tenantId/settings` | ❌ 501 Not Implemented |

---

*intent solutions io — confidential IP*
*Contact: jeremy@intentsolutions.io*
