# AAR: A6.s2 - Concurrency Limit Enforcement

**Date**: 2025-12-19
**Phase**: A6 - Concurrency Caps + Backpressure
**Subtask**: A6.s2 - Enforce limits at dispatcher and worker
**Status**: COMPLETE

## Summary

Implemented per-tenant concurrency limits to prevent resource exhaustion and ensure fair multi-tenant usage. Limits are enforced at all job dispatch points (API and Gateway) before runs are created.

## Changes Made

### 1. Storage Layer (`packages/core/src/storage/`)

**interfaces.ts**:
- Added `countInFlightRuns(tenantId: string): Promise<number>` to TenantStore interface

**firestore-tenant.ts**:
- Implemented `countInFlightRuns()` - counts runs with status 'pending' or 'running'
- Uses parallel Firestore count queries for efficiency

**inmemory.ts**:
- Implemented `countInFlightRuns()` for in-memory testing

### 2. Security Module (`packages/core/src/security/index.ts`)

Added `checkConcurrencyLimit(inFlightRuns: number, planId: PlanId): PlanLimitCheck`:
- Follows same pattern as `checkRunLimit`, `checkRepoLimit`, `checkMemberLimit`
- Returns `{allowed, reason, currentUsage, limit}` structure
- Limits per plan:
  - Free: 1 concurrent run
  - Pro: 5 concurrent runs
  - Enterprise: 20 concurrent runs

### 3. API Enforcement (`apps/api/src/index.ts`)

- Added concurrency check at `POST /tenants/:tenantId/runs` endpoint (line ~1511)
- Returns 429 with `retryAfter: 30` header suggestion
- Logs rejection with `reason: 'PLAN_LIMIT_CONCURRENCY'`

### 4. Gateway Enforcement (`apps/gateway/src/index.ts`)

- Added concurrency check at `POST /a2a/foreman` endpoint (line ~289)
- Same 429 response pattern as API
- Logs rejection for observability

### 5. Tests

**security/__tests__/concurrency-limits.test.ts** (10 tests):
- Tests all plan limits (free, pro, enterprise)
- Tests edge cases (over limit, unknown plan)
- Tests integration with run limits

**storage/__tests__/concurrency-tracking.test.ts** (9 tests):
- Tests countInFlightRuns for pending, running statuses
- Tests that completed/failed/cancelled runs are NOT counted
- Tests tenant isolation
- Tests status transition updates

### 6. Infrastructure Fix

- Renamed `vitest.config.ts` → `vitest.config.mts` to eliminate CJS deprecation warning

## Deferred Items

Documented in `000-docs/137-DR-NOTE-a5-deferred-items.md`:
- A5.s3: Exponential backoff (Pub/Sub native retry sufficient)
- A5.s4: DLQ triage runbook (infra works, runbook is documentation)
- A5.s5: Cloud Tasks throttling (optional, A6 provides per-tenant limits)

## Test Results

```
Test Files  2 passed (2)
     Tests  19 passed (19)
```

Full suite: 23 test tasks passed.

## Verification

```bash
npm run build     # ✅ All 12 packages built
npm run typecheck # ✅ All 16 packages typechecked
npm run test      # ✅ All 23 test tasks passed
```

## API Response Example

When concurrency limit is reached:
```json
{
  "error": "Concurrency limit exceeded",
  "reason": "Concurrent run limit reached (5 concurrent runs on Pro plan). Wait for existing runs to complete.",
  "currentUsage": 5,
  "limit": 5,
  "plan": "pro",
  "retryAfter": 30
}
```

## Next Steps

- A6.s3: Queue depth alarms (Cloud Monitoring alert policies)
- A6.s4: Pause tenant switch (admin emergency brake)

## Files Changed

- `packages/core/src/storage/interfaces.ts`
- `packages/core/src/storage/firestore-tenant.ts`
- `packages/core/src/storage/inmemory.ts`
- `packages/core/src/security/index.ts`
- `apps/api/src/index.ts`
- `apps/gateway/src/index.ts`
- `vitest.config.ts` → `vitest.config.mts`
- NEW: `packages/core/src/security/__tests__/concurrency-limits.test.ts`
- NEW: `packages/core/src/storage/__tests__/concurrency-tracking.test.ts`
- NEW: `000-docs/137-DR-NOTE-a5-deferred-items.md`
