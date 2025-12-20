# Idempotency Store TTL & Retention Policy

**A4.s3 Implementation**: TTL/retention policy for idempotency records

## Overview

The idempotency store supports configurable Time-To-Live (TTL) policies to automatically clean up expired records. This prevents unbounded growth of idempotency data and ensures efficient resource usage.

## Default Configuration

```typescript
{
  defaultTTLSeconds: 86400,  // 24 hours
  minTTLSeconds: 60,         // 1 minute
  maxTTLSeconds: 604800      // 7 days
}
```

## Usage

### Basic Usage (Default TTL)

```typescript
import { createIdempotencyStore } from '@gwi/core/idempotency';

const store = createIdempotencyStore('memory');

// Creates record with 24-hour TTL (default)
await store.checkAndSet(key, tenantId);
```

### Custom TTL Per Record

```typescript
// Create record with 1-hour TTL
await store.checkAndSet(key, tenantId, 3600);

// Create record with 12-hour TTL
await store.checkAndSet(key, tenantId, 43200);
```

### Custom Store Configuration

```typescript
const store = createIdempotencyStore({
  backend: 'memory',
  ttlConfig: {
    defaultTTLSeconds: 7200,   // 2 hours default
    minTTLSeconds: 300,        // 5 minutes minimum
    maxTTLSeconds: 172800      // 2 days maximum
  }
});
```

## Cleanup Operations

### Manual Cleanup (In-Memory Store)

For in-memory stores, you should run periodic cleanup to prevent memory leaks:

```typescript
// Run cleanup every 5 minutes
setInterval(async () => {
  const result = await store.cleanup();
  console.log(`Cleaned up ${result.deletedCount} expired records`);
}, 5 * 60 * 1000);
```

### Cleanup Result

```typescript
interface CleanupResult {
  deletedCount: number;   // Number of expired records deleted
  scannedCount: number;   // Number of records scanned
  startedAt: Date;        // When cleanup started
  completedAt: Date;      // When cleanup completed
  durationMs: number;     // Duration in milliseconds
}
```

### Batch Size Control

Control how many records are scanned in a single cleanup operation:

```typescript
// Scan and delete up to 1000 records
const result = await store.cleanup(1000);

// Default batch size is 500
const result = await store.cleanup();
```

## Firestore Production Setup

### Automatic TTL Cleanup

Firestore supports automatic TTL deletion via the `expiresAt` field. The field is already configured in the idempotency store.

#### Enable TTL Policy

Run this command once to enable automatic TTL cleanup:

```bash
gcloud firestore fields ttls update expiresAt \
  --collection-group=gwi_idempotency \
  --enable-ttl
```

#### Verify TTL Policy

```bash
gcloud firestore fields ttls list --collection-group=gwi_idempotency
```

Expected output:
```
FIELD       TTL  STATE
expiresAt   ✓    ACTIVE
```

#### Monitor Cleanup

- Firestore TTL cleanup typically runs within 72 hours of expiration
- No manual intervention required
- Monitor in Firestore console or Cloud Logging

### Manual Cleanup (Firestore)

For immediate cleanup needs (e.g., before 72-hour TTL window):

```typescript
const store = createIdempotencyStore('firestore');

// Delete expired records immediately
const result = await store.cleanup(500);
console.log(`Deleted ${result.deletedCount} expired records`);
```

**Note**: Requires composite index on `(expiresAt, __name__)`. Firestore will suggest creating this index if it doesn't exist.

## Best Practices

### Development

- Use in-memory store for testing
- Run cleanup every 5-15 minutes
- Use short TTLs (1-5 minutes) for fast iteration

```typescript
const store = createIdempotencyStore({
  backend: 'memory',
  ttlConfig: {
    defaultTTLSeconds: 300,  // 5 minutes
    minTTLSeconds: 60,       // 1 minute
    maxTTLSeconds: 3600      // 1 hour
  }
});
```

### Production (Firestore)

- Enable Firestore TTL policy (one-time setup)
- Use default 24-hour TTL for most operations
- Override TTL for special cases:
  - Long-running operations: 7 days
  - Temporary operations: 1 hour
  - Critical operations: 24-48 hours

```typescript
const store = createIdempotencyStore({
  backend: 'firestore',
  ttlConfig: {
    defaultTTLSeconds: 86400,  // 24 hours
    minTTLSeconds: 3600,       // 1 hour minimum
    maxTTLSeconds: 604800      // 7 days maximum
  }
});
```

### Production (In-Memory - Not Recommended)

If using in-memory store in production (e.g., stateful service):

- Run cleanup every 5-10 minutes
- Monitor memory usage
- Consider persisting to Firestore instead

```typescript
// Cleanup scheduler
const cleanupInterval = 5 * 60 * 1000; // 5 minutes
setInterval(async () => {
  try {
    const result = await store.cleanup(1000);
    if (result.deletedCount > 0) {
      logger.info('Idempotency cleanup', {
        deleted: result.deletedCount,
        scanned: result.scannedCount,
        durationMs: result.durationMs
      });
    }
  } catch (err) {
    logger.error('Idempotency cleanup failed', err);
  }
}, cleanupInterval);
```

## TTL Validation

All TTL values are automatically normalized to stay within configured bounds:

```typescript
const store = createIdempotencyStore({
  backend: 'memory',
  ttlConfig: {
    defaultTTLSeconds: 3600,
    minTTLSeconds: 60,
    maxTTLSeconds: 86400
  }
});

// TTL of 30 seconds → clamped to 60 seconds (min)
await store.checkAndSet(key, tenantId, 30);

// TTL of 100000 seconds → clamped to 86400 seconds (max)
await store.checkAndSet(key, tenantId, 100000);

// TTL of 1800 seconds → used as-is (within bounds)
await store.checkAndSet(key, tenantId, 1800);
```

## Monitoring

### Cleanup Metrics

Track cleanup operations for observability:

```typescript
const result = await store.cleanup();

// Log metrics
metrics.histogram('idempotency.cleanup.duration', result.durationMs);
metrics.gauge('idempotency.cleanup.deleted', result.deletedCount);
metrics.gauge('idempotency.cleanup.scanned', result.scannedCount);
```

### TTL Configuration

Retrieve current TTL configuration:

```typescript
const config = store.getTTLConfig();
console.log('TTL config:', {
  default: config.defaultTTLSeconds,
  min: config.minTTLSeconds,
  max: config.maxTTLSeconds
});
```

## Testing

See `src/idempotency/__tests__/store.test.ts` for comprehensive test examples:

- TTL configuration
- TTL normalization
- Cleanup operations
- Expiration behavior
- Custom TTL per record

## Migration from Previous Versions

If upgrading from A4.s2 (without TTL policy):

1. **No breaking changes**: Existing code continues to work
2. **Default TTL**: All new records get 24-hour TTL
3. **Cleanup**: Start running periodic cleanup for in-memory stores
4. **Firestore TTL**: Enable TTL policy for automatic cleanup

```typescript
// Before (A4.s2)
const store = createIdempotencyStore('memory');
await store.checkAndSet(key, tenantId);

// After (A4.s3) - Same behavior, now with TTL
const store = createIdempotencyStore('memory');
await store.checkAndSet(key, tenantId); // Gets 24-hour TTL

// Optional: Customize TTL
const store = createIdempotencyStore({
  backend: 'memory',
  ttlConfig: { defaultTTLSeconds: 7200 }
});
```

## Related Documentation

- `store.ts` - Implementation
- `__tests__/store.test.ts` - Test examples
- `key-scheme.ts` - Idempotency key generation
