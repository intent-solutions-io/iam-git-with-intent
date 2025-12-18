# ADR-103: Phase 30 Reliability & Scaling

| Field | Value |
|-------|-------|
| Status | Accepted |
| Date | 2025-12-17 |
| Author | Claude Opus 4.5 |
| Phase | Phase 30: Reliability & Scaling |
| Supersedes | ADR-101 (Phase 29 gaps addressed) |

## Context

Phase 29 (Marketplace Integration) shipped with several gaps identified in the ADR-101 review:
1. Pending install requests stored in-memory (lost on restart)
2. Publisher key registry existed but lacked revocation model
3. Publish endpoint lacked hardening (rate limits, size limits, validation)

Additionally, for production readiness, we needed:
4. Distributed rate limiting for multi-instance deployments
5. Retry logic with exponential backoff and circuit breakers
6. Load testing framework with performance budgets

## Decision

### Phase 29 Fixups

**1. Persistent Install Requests**
- Added `PendingInstallRequestSchema` to marketplace types
- Added `install_requests` Firestore collection
- Implemented idempotency via SHA256 hash of `tenantId:connectorId:version`
- Updated `InstallPipeline` to use Firestore-backed storage

**2. Publisher Key Registry + Revocation**
- Added `PublisherSchema` with `publicKeys` and `revokedKeys` arrays
- Added `PublisherKeySchema` with `keyId`, `publicKey`, `expiresAt` fields
- Implemented `verifySignatureWithRegistry()` that checks revocation
- Added `revokePublisherKey()` method

**3. Publish Endpoint Hardening**
- `MAX_TARBALL_SIZE`: 50MB
- `MAX_BODY_SIZE`: 55MB (base64 overhead)
- `MAX_MANIFEST_SIZE`: 1MB
- Rate limiting: 10 publishes/15min, 100 searches/15min
- Gzip format validation
- Publisher authentication via signature verification
- Zod schema validation for all request fields

### Phase 30 Additions

**4. Redis Rate Limiting**
- Created `RedisRateLimitStore` with sliding window algorithm
- Lua scripts for atomic operations
- Graceful fallback to in-memory when Redis unavailable
- `createRateLimitStore()` factory with `REDIS_URL` detection
- Added marketplace-specific rate limits:
  - `marketplace:publish`: 10/15min
  - `marketplace:search`: 100/15min
  - `marketplace:download`: 50/15min
  - `marketplace:install`: 30/15min

**5. Retry & Circuit Breaker**
- `retry()` - throws on final failure
- `retryWithResult()` - never throws, returns detailed result
- Exponential backoff with configurable jitter
- `RETRY_PRESETS`: fast, standard, patient, aggressive
- `CircuitBreaker` class with closed/open/half-open states
- `ResilientExecutor` combining retry + circuit breaker
- Global registry for named circuit breakers

**6. Load Testing**
- Created `scripts/arv/load-test.ts`
- Performance budgets:
  - DEFAULT: P50<100ms, P95<500ms, P99<1000ms, <1% errors, >100 req/s
  - RELAXED: P50<200ms, P95<1000ms, P99<2000ms, <5% errors, >50 req/s
- Test scenarios: rate limiting, retry, circuit breaker, idempotency, locking, contention

## Alternatives Considered

### Redis vs Memorystore
- Chose Redis for familiarity and existing GCP Memorystore support
- Firestore-based rate limiting considered but ruled out due to latency

### External Rate Limiter (e.g., kong, envoy)
- Chose in-app rate limiting for simplicity
- Can add external limiter later as reverse proxy

### Token Bucket vs Sliding Window
- Chose sliding window for better burst handling
- Token bucket simpler but allows larger bursts

## Consequences

### Positive
- Install requests survive restarts (Firestore-backed)
- Publisher keys can be revoked without re-publishing
- Protection against abuse (rate limits, size limits)
- Retry logic handles transient failures automatically
- Circuit breaker prevents cascading failures
- Load tests provide regression detection

### Negative
- Redis dependency for distributed rate limiting (optional)
- Additional complexity in error handling
- Performance overhead from retry delays

### Neutral
- In-memory fallback means single-instance behavior without Redis
- Circuit breaker adds learning curve

## Technical Details

### Files Changed
```
packages/core/src/marketplace/types.ts      - Schema additions
packages/core/src/marketplace/storage.ts   - Install request storage
packages/core/src/marketplace/service.ts   - Publisher registry
packages/core/src/marketplace/install-pipeline.ts - Idempotent requests
packages/core/src/ratelimit/redis-store.ts - Redis rate limiter
packages/core/src/ratelimit/index.ts       - Marketplace rate limits
packages/core/src/reliability/retry.ts     - Retry + circuit breaker
packages/core/src/reliability/index.ts     - Exports
apps/gateway/src/marketplace-routes.ts     - Endpoint hardening
scripts/arv/reliability-gate.ts            - Gate updates
scripts/arv/load-test.ts                   - Load test framework
```

### Environment Variables
```bash
REDIS_URL=redis://...  # Optional, enables distributed rate limiting
```

## References
- ADR-101: Phase 29 Marketplace Integration
- AAR-102: Phase 29 After-Action Report (gaps identified)
