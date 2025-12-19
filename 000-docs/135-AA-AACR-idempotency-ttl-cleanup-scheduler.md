# AAR: Idempotency TTL Cleanup Scheduler

> **Phase**: A (Platform Core Runtime)
> **Date**: 2024-12-19
> **Status**: Complete
> **Epic**: Idempotency TTL Cleanup Scheduler

## Summary

Implemented a Cloud Scheduler-triggered cleanup job for expired idempotency records. The scheduler calls the worker service hourly to remove expired records from Firestore, keeping the collection size manageable and maintaining system performance.

## What Was Completed

### 1. Worker Cleanup Endpoint

Added `POST /tasks/cleanup-idempotency` endpoint to the worker service:

```typescript
app.post('/tasks/cleanup-idempotency', async (req, res) => {
  const idempotencyService = getIdempotencyService();
  let totalDeleted = 0;
  let batchCount = 0;
  const maxBatches = 20; // Safety limit

  while (batchCount < maxBatches) {
    const deleted = await idempotencyService.cleanup();
    totalDeleted += deleted;
    batchCount++;

    if (deleted < 500) {
      break; // No more expired records
    }
  }

  return res.json({
    status: 'completed',
    totalDeleted,
    batchCount,
    durationMs,
  });
});
```

### 2. Cloud Scheduler Configuration (OpenTofu)

Created `infra/scheduler.tf` with:

| Resource | Purpose |
|----------|---------|
| `google_service_account.scheduler` | Service account for Cloud Scheduler |
| `google_cloud_run_service_iam_member.scheduler_invoker` | Allow scheduler to invoke worker |
| `google_cloud_scheduler_job.idempotency_cleanup` | Hourly cleanup job |

Schedule: `15 * * * *` (minute 15 of every hour, UTC)

### 3. API Enablement

Added `cloudscheduler.googleapis.com` to enabled APIs in `infra/main.tf`.

### 4. Integration Tests

Created `apps/worker/src/__tests__/cleanup-idempotency.test.ts` with 5 tests:

| Test | Description |
|------|-------------|
| No expired records | Returns success with zero deleted |
| Clean up expired | Successfully removes expired records |
| Multiple batches | Handles batch processing correctly |
| Batch limit | Prevents runaway cleanup (max 20 batches) |
| Error handling | Returns 500 with error details on failure |

## Files Created

| File | Purpose |
|------|---------|
| `infra/scheduler.tf` | Cloud Scheduler configuration |
| `apps/worker/src/__tests__/cleanup-idempotency.test.ts` | Cleanup endpoint tests |
| `000-docs/135-AA-AACR-idempotency-ttl-cleanup-scheduler.md` | This AAR |

## Files Modified

| File | Change |
|------|--------|
| `apps/worker/src/index.ts` | Added cleanup endpoint + import |
| `infra/main.tf` | Added Cloud Scheduler API |

## Architecture

```
Cloud Scheduler (hourly)
    │
    ▼ POST /tasks/cleanup-idempotency
┌─────────────────────────────────┐
│  GWI Worker (Cloud Run)         │
│  ┌─────────────────────────────┐│
│  │ IdempotencyService.cleanup()││
│  └─────────────────────────────┘│
└─────────────────────────────────┘
    │
    ▼ Firestore Query + Batch Delete
┌─────────────────────────────────┐
│  Firestore: gwi_idempotency     │
│  - Query: expiresAt < now       │
│  - Delete: batch of 500         │
└─────────────────────────────────┘
```

## Configuration

### TTL Settings (from A4)

```typescript
const DEFAULT_IDEMPOTENCY_CONFIG = {
  completedTtlMs: 86400000,  // 24 hours for completed records
  failedTtlMs: 3600000,      // 1 hour for failed records
  lockTimeoutMs: 60000,      // 1 minute lock timeout
  maxAttempts: 3,            // Max retry attempts
};
```

### Scheduler Settings

| Setting | Value |
|---------|-------|
| Schedule | Every hour at :15 |
| Time Zone | UTC |
| Retry Count | 3 |
| Min Backoff | 30 seconds |
| Max Backoff | 5 minutes |
| Max Doublings | 2 |

## Security

- OIDC token authentication for Cloud Scheduler → Cloud Run
- User-Agent validation (logs warning for non-scheduler calls)
- Service account with minimal permissions (run.invoker only)

## Observability

### Logs

```json
// Success
{
  "type": "idempotency_cleanup",
  "totalDeleted": 150,
  "batchCount": 1,
  "durationMs": 450
}

// Metrics recorded
gwi_idempotency_ttl_cleanup_total: 150
```

### Monitoring

The cleanup job will appear in Cloud Scheduler logs and can be monitored via:
- Cloud Scheduler job history
- Cloud Run request logs
- Custom log-based metric for cleanup count

## Test Results

```
 Tasks:    23 successful, 23 total
 Tests:    20 passed (20) in worker
 OpenTofu: Success! The configuration is valid.
```

## Next Steps

1. Deploy worker with new endpoint
2. Apply OpenTofu changes to create scheduler
3. Monitor cleanup job execution
4. Add Grafana dashboard for cleanup metrics

## Evidence

```bash
# Build
$ npm run build
Tasks: 12 successful, 12 total

# Tests
$ npm run test
Tasks: 23 successful, 23 total
Tests: 20 passed (worker)

# OpenTofu Validate
$ cd infra && tofu validate
Success! The configuration is valid.
```
