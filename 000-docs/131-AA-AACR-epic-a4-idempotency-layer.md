# AAR: A4 Idempotency Layer

> **Phase**: A (Platform Core Runtime)
> **Date**: 2024-12-19
> **Status**: Complete
> **Epic**: A4 - Idempotency Layer for All Event Sources

## Summary

Implemented a comprehensive idempotency layer to prevent duplicate processing of events from all sources (GitHub webhooks, API calls, Slack commands, scheduled events). Uses Firestore transactions for atomic check-and-set operations with TTL-based cleanup.

## What Was Completed

### A4.s1: Idempotency Key Schemes Per Source

Defined structured key schemes for each event source:

| Source | Key Format | Example |
|--------|------------|---------|
| GitHub Webhook | `github:{delivery_id}` | `github:550e8400-e29b-41d4-a716-446655440000` |
| API Call | `api:{client_id}:{request_id}` | `api:cli-abc123:req-xyz789` |
| Slack Command | `slack:{team_id}:{trigger_id}` | `slack:T12345678:1234567890.123456` |
| Scheduler | `scheduler:{schedule_id}:{execution_time}` | `scheduler:daily-cleanup:2024-12-19T00:00:00Z` |

Key features:
- Zod schema validation for each key type
- `generateIdempotencyKey()` for creating composite keys
- `parseIdempotencyKey()` for parsing keys back to components
- `hashRequestPayload()` for consistent payload hashing

### A4.s2: Check-and-Set with Firestore Transactions

Implemented atomic check-and-set using Firestore transactions:

```typescript
// Usage example
const result = await store.checkAndSet(
  { source: 'github_webhook', deliveryId: 'abc123' },
  'tenant-123',
  webhookPayload
);

if (result.status === 'new') {
  // Process the request
} else if (result.status === 'duplicate') {
  // Return cached response
} else if (result.status === 'processing') {
  // Another instance is handling it
}
```

Features:
- Distributed locking with configurable timeout
- Lock recovery for crashed processes
- Max attempts limit to prevent infinite retries
- Thread-safe concurrent access

### A4.s3: TTL/Retention Policy

Implemented TTL-based retention with configurable expiration:

| Record Status | Default TTL | Purpose |
|--------------|-------------|---------|
| Completed | 24 hours | Cache successful responses |
| Failed | 1 hour | Allow retries after cooling off |
| Processing Lock | 5 minutes | Prevent stuck locks |

Features:
- Automatic cleanup via `cleanupExpired()`
- Per-status TTL configuration
- Lock expiration and recovery

### A4.s4: Replay Safety Tests

Created comprehensive test suite (36 tests) covering:

- Key generation and parsing
- Duplicate detection
- Concurrent request handling
- Lock expiration and recovery
- Max attempts enforcement
- Handler failure handling
- Multi-source scenarios

### A4.s5: Observability Counters

Implemented metrics collection for monitoring:

```typescript
const metrics = getIdempotencyMetrics();
metrics.recordCheck('github_webhook', 'duplicate');
metrics.recordCompleted();
metrics.recordFailed();
metrics.recordTtlCleanup(42);

// Export to Prometheus
console.log(metrics.toPrometheusFormat());
```

Metrics tracked:
- `gwi_idempotency_checks_total` - Total checks
- `gwi_idempotency_new_total` - New requests
- `gwi_idempotency_duplicates_skipped_total` - Duplicates
- `gwi_idempotency_conflicts_total` - Processing conflicts
- `gwi_idempotency_lock_recoveries_total` - Recovered locks
- `gwi_idempotency_completed_total` - Completed requests
- `gwi_idempotency_failed_total` - Failed requests
- `gwi_idempotency_ttl_cleanups_total` - TTL cleanups
- Per-source breakdowns

## Files Created

| File | Purpose |
|------|---------|
| `packages/engine/src/idempotency/types.ts` | Key schemes, records, config |
| `packages/engine/src/idempotency/store.ts` | InMemory + Firestore stores |
| `packages/engine/src/idempotency/metrics.ts` | Observability counters |
| `packages/engine/src/idempotency/service.ts` | High-level service API |
| `packages/engine/src/idempotency/index.ts` | Module exports |
| `packages/engine/src/idempotency/__tests__/idempotency.test.ts` | 36 test cases |

## Files Modified

| File | Change |
|------|--------|
| `packages/engine/src/index.ts` | Added idempotency exports |

## Key Types

```typescript
// Idempotency key for GitHub webhooks
interface GitHubIdempotencyKey {
  source: 'github_webhook';
  deliveryId: string; // UUID from X-GitHub-Delivery header
}

// Idempotency record stored in Firestore
interface IdempotencyRecord {
  key: string;
  source: EventSource;
  tenantId: string;
  runId?: string;
  status: 'processing' | 'completed' | 'failed';
  requestHash: string;
  response?: unknown;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  lockExpiresAt?: Date;
  attempts: number;
}

// Service API
interface IdempotencyProcessResult<T> {
  processed: boolean;  // true if we processed, false if duplicate
  result: T;           // Response (from processing or cache)
  runId?: string;      // Run ID if created
  key: string;         // Idempotency key used
}
```

## Usage Example

```typescript
import { getIdempotencyService } from '@gwi/engine';

const service = getIdempotencyService();

// In a webhook handler:
app.post('/webhook/github', async (req, res) => {
  const result = await service.process(
    {
      source: 'github_webhook',
      deliveryId: req.headers['x-github-delivery'],
    },
    tenantId,
    req.body,
    async () => {
      const run = await engine.startRun(req.body);
      return { runId: run.id, response: { status: 'started' } };
    }
  );

  if (!result.processed) {
    console.log('Duplicate webhook, returning cached result');
  }

  res.json(result.result);
});
```

## Test Results

```
 RUN  v2.1.9

 ✓ src/idempotency/__tests__/idempotency.test.ts (36 tests) 216ms
 ✓ src/step-contract/__tests__/step-contract.test.ts (28 tests) 53ms
 ✓ src/run/__tests__/autopilot-executor.test.ts (17 tests) 12ms
 ✓ src/run/__tests__/issue-to-code.test.ts (10 tests) 69ms

 Test Files  4 passed (4)
      Tests  91 passed (91)
```

## Integration Points

The idempotency layer integrates with:

1. **GitHub Webhook Handler** - Uses `X-GitHub-Delivery` header
2. **API Gateway** - Uses `X-Idempotency-Key` or `X-Request-ID` header
3. **Slack Integration** - Uses `trigger_id` from slash commands
4. **Cloud Scheduler** - Uses schedule ID + execution time
5. **Metrics/Monitoring** - Exports Prometheus metrics

## Security Considerations

- Keys are tenant-scoped to prevent cross-tenant collisions
- Firestore rules restrict access to service accounts only
- Request payloads are hashed, not stored in full
- TTL ensures data is cleaned up automatically

## Next Steps

- A5: Integrate idempotency into webhook handlers
- A6: Add idempotency to API gateway middleware
- Configure Cloud Scheduler for TTL cleanup job

## Evidence

```bash
# Build passes
npm run build
 Tasks:    12 successful, 12 total

# Tests pass
npm run test
 Tests  91 passed (91)
```
