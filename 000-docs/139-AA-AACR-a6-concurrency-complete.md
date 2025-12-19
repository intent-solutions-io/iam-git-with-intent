# AAR: A6 - Concurrency Caps + Backpressure Complete

**Date**: 2025-12-19
**Phase**: A6 - Concurrency Caps + Backpressure
**Status**: COMPLETE

## Summary

Implemented comprehensive concurrency control and backpressure mechanisms for multi-tenant safety, including per-plan limits, queue depth monitoring, and emergency pause capability.

## Completed Subtasks

### A6.s2: Enforce Limits at Dispatcher and Worker (COMPLETE)

**Storage Layer**:
- Added `countInFlightRuns(tenantId)` to TenantStore interface
- Implemented in Firestore (parallel count queries for pending + running)
- Implemented in InMemory for testing

**Security Module**:
- Added `checkConcurrencyLimit(inFlightRuns, planId)` function
- Plan limits: Free=1, Pro=5, Enterprise=20 concurrent runs

**Enforcement**:
- API: `POST /tenants/:tenantId/runs` returns 429 when at limit
- Gateway: `POST /a2a/foreman` returns 429 when at limit
- Response includes `retryAfter: 30` suggestion

### A6.s3: Queue Depth Alarms (COMPLETE)

**Terraform Alert Policies** (`infra/monitoring.tf`):
- `queue_depth_warning`: Alert when >100 undelivered messages (5min sustained)
- `queue_depth_critical`: Alert when >500 undelivered messages (5min sustained)
- `queue_age_warning`: Alert when oldest message >10 minutes

**Variables**:
- `queue_depth_threshold` (default: 100)
- `queue_depth_critical_threshold` (default: 500)

**Documentation**: Each alert includes runbook with investigation steps and gcloud commands.

### A6.s4: Pause Tenant Switch (COMPLETE)

**TenantStatus Update**:
- Added `'paused'` to TenantStatus type
- Paused tenants return 503 (Service Unavailable) vs 403 for suspended

**API Endpoints**:
- `POST /tenants/:tenantId/pause` - Pause tenant (ADMIN+)
- `POST /tenants/:tenantId/resume` - Resume tenant (ADMIN+)
- Both require `settings:update` permission

**Behavior**:
- Paused: 503 with `retryAfter: 60` and helpful message
- Suspended/Deactivated: 403 with "contact support" message

## Files Changed

### A6.s2
- `packages/core/src/storage/interfaces.ts` - countInFlightRuns interface
- `packages/core/src/storage/firestore-tenant.ts` - Firestore implementation
- `packages/core/src/storage/inmemory.ts` - InMemory implementation
- `packages/core/src/security/index.ts` - checkConcurrencyLimit function
- `apps/api/src/index.ts` - Enforcement at run creation
- `apps/gateway/src/index.ts` - Enforcement at foreman endpoint

### A6.s3
- `infra/monitoring.tf` - Alert policies and variables

### A6.s4
- `packages/core/src/storage/interfaces.ts` - Added 'paused' status
- `apps/api/src/index.ts` - Pause/resume endpoints + status handling
- `apps/gateway/src/index.ts` - Paused status handling

### Tests
- `packages/core/src/security/__tests__/concurrency-limits.test.ts` (10 tests)
- `packages/core/src/storage/__tests__/concurrency-tracking.test.ts` (9 tests)

### Infrastructure Fix
- `vitest.config.ts` → `vitest.config.mts` (eliminated CJS deprecation warning)

## Test Results

```
Test Files  2 passed (2) [new A6 tests]
     Tests  19 passed (19)

Full suite: 23 test tasks passed
```

## Terraform Validation

```bash
cd infra && tofu validate
# Success! The configuration is valid.
```

## API Examples

### Concurrency Limit Rejection
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

### Paused Tenant Rejection
```json
{
  "error": "Tenant is temporarily paused",
  "status": "paused",
  "message": "Run processing is temporarily suspended. Try again later.",
  "retryAfter": 60
}
```

### Pause Tenant
```bash
curl -X POST /tenants/{id}/pause \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"reason": "queue_backlog"}'
```

### Resume Tenant
```bash
curl -X POST /tenants/{id}/resume \
  -H "Authorization: Bearer $TOKEN"
```

## Deferred Work

See `000-docs/137-DR-NOTE-a5-deferred-items.md`:
- A5.s3: Exponential backoff (Pub/Sub native retry sufficient)
- A5.s4: DLQ triage runbook (infra works)
- A5.s5: Cloud Tasks throttling (A6 provides limits)

## Next Epic

**Epic A remaining tasks**:
- A7: Correlation IDs + structured logging
- A8: Artifact model (GCS)
- A9: Secrets model (Secret Manager)
- A10: Multi-tenant authorization middleware
- A11: Cost metering primitives
- A12: SLO definitions + perf tests

**Recommendation**: Continue with A7 (Correlation IDs) as it improves debuggability for all subsequent work.
