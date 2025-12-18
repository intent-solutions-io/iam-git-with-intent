# ADR-105: Phase 30.1 OpenAPI, Firestore Rate Limiting, and Metrics Export

| Field | Value |
|-------|-------|
| Status | Accepted |
| Date | 2025-12-17 |
| Author | Claude Opus 4.5 |
| Phase | Phase 30.1: Close Reliability Gaps |
| Supersedes | ADR-103 (extends with gap closures) |

## Context

Phase 30 (Reliability & Scaling) identified three gaps in AAR-104:

1. **Gap 1**: Marketplace endpoints lack OpenAPI specification
2. **Gap 2**: No Firestore alternative to Redis rate limiting (serverless-unfriendly)
3. **Gap 3**: No metrics export for rate limits and circuit breaker state

This ADR documents the decisions made to close these gaps.

## Decision

### 1. OpenAPI 3.1 Specification

**Decision**: Create comprehensive OpenAPI 3.1 spec at `apps/gateway/openapi.yaml`

**Implementation**:
- Full documentation of all 10 marketplace endpoints
- Request/response schemas with validation rules
- Security schemes (x-user-id, x-api-key headers)
- Rate limit headers documented in responses
- Serve spec at GET /v1/openapi (YAML default, JSON via Accept header)

**Rationale**:
- OpenAPI 3.1 for JSON Schema compatibility
- Self-documenting API aids integration
- Enables SDK generation and client tooling
- ARV gate ensures spec stays in sync

### 2. FirestoreRateLimitStore

**Decision**: Create serverless-friendly Firestore-backed rate limiter

**Implementation**:
- `FirestoreRateLimitStore` class in `packages/core/src/ratelimit/firestore-store.ts`
- Sliding window algorithm using Firestore transactions
- Automatic fallback to in-memory when Firestore unavailable
- Updated `createRateLimitStore()` factory with fallback chain: Redis → Firestore → In-memory

**Document Structure**:
```typescript
interface RateLimitDocument {
  requests: number[];     // Timestamps in window
  updatedAt: number;      // Last update time
  expiresAt: number;      // TTL field for cleanup
}
```

**Trade-offs**:
| Aspect | Redis | Firestore |
|--------|-------|-----------|
| Latency | ~5ms | ~50-100ms |
| Throughput | High | Medium |
| Infrastructure | Memorystore VPC | None (built-in) |
| Cost | VPC connector | Per-operation |
| Best for | High-traffic APIs | Serverless, low-medium traffic |

### 3. Prometheus Metrics Export

**Decision**: Add GET /v1/ops/metrics endpoint with Prometheus text format

**Implementation**:
- Protected by `GWI_METRICS_ENABLED=true` environment variable
- Rate limit counters: `gwi_ratelimit_allowed_total`, `gwi_ratelimit_rejected_total`
- Circuit breaker gauges: `gwi_circuit_breaker_state`, `gwi_circuit_breaker_failures`
- Info metric: `gwi_info{version,env}`

**Circuit Breaker State Encoding**:
- 0 = closed (healthy)
- 1 = open (tripped)
- 2 = half-open (testing recovery)

**Rationale**:
- Prometheus format is industry standard
- Easy integration with Cloud Monitoring
- Enables alerting on circuit breaker state changes

## Alternatives Considered

### OpenAPI Version
- **3.0 vs 3.1**: Chose 3.1 for native JSON Schema support
- **Swagger UI**: Deferred to future phase

### Rate Limiting Backend
- **Firestore TTL Policy**: Considered but would require Cloud Scheduler for cleanup
- **Cloud Tasks**: Too complex for rate limiting use case
- **Redis Cluster**: Overkill for current scale

### Metrics Format
- **OpenMetrics**: Chosen Prometheus for wider tooling support
- **StatsD**: Less structured than Prometheus
- **Custom JSON**: Would require custom dashboards

## Consequences

### Positive
- API is self-documenting and discoverable
- Serverless deployments can rate limit without VPC
- Operational visibility into reliability primitives
- SDK generation possible from OpenAPI spec

### Negative
- Firestore rate limiting adds ~50ms latency vs Redis
- Additional complexity in fallback chain
- Metrics endpoint increases attack surface (protected by env var)

### Neutral
- OpenAPI spec requires maintenance as API evolves
- Metrics collection has minimal performance overhead

## Technical Details

### Files Created
```
apps/gateway/openapi.yaml                        # OpenAPI 3.1 spec
apps/gateway/src/marketplace-routes.ts           # Updated with openapi + metrics
packages/core/src/ratelimit/firestore-store.ts   # Firestore rate limiter
scripts/arv/openapi-gate.ts                      # OpenAPI validation
```

### Files Modified
```
packages/core/src/ratelimit/index.ts             # Export Firestore store
packages/core/src/ratelimit/redis-store.ts       # Updated factory
packages/core/src/reliability/retry.ts           # getAllCircuitBreakerStats
packages/core/src/reliability/index.ts           # Export stats function
apps/gateway/package.json                        # Added js-yaml dependency
package.json                                     # Added js-yaml devDependency
scripts/arv/run-all.ts                           # Added OpenAPI + Marketplace gates
```

### Environment Variables
```bash
GWI_METRICS_ENABLED=true   # Enable /v1/ops/metrics endpoint
REDIS_URL=redis://...      # Optional, enables Redis rate limiting
```

## References

- ADR-103: Phase 30 Reliability & Scaling
- AAR-104: Phase 30 After-Action Report (gaps identified)
- OpenAPI 3.1 Specification: https://spec.openapis.org/oas/v3.1.0
- Prometheus Text Format: https://prometheus.io/docs/instrumenting/exposition_formats/
