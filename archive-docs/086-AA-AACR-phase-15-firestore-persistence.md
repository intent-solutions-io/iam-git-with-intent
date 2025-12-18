# Phase 15: Firestore Persistence + Webhook Security + Rate Limiting

**Document ID**: 086-AA-AACR-phase-15-firestore-persistence
**Type**: After-Action Completion Report (AACR)
**Phase**: 15
**Status**: COMPLETE
**Date**: 2025-12-17 10:08 CST
**Author**: Claude Code (Bob-style foreman)

## Metadata (Required)

| Field | Value |
|-------|-------|
| Beads (Epic) | `git-with-intent-apa` |
| Beads (Tasks) | `git-with-intent-apa.1` (15.2), `git-with-intent-apa.2` (15.3), `git-with-intent-apa.3` (15.4), `git-with-intent-apa.4` (15.5) |
| AgentFS | Agent ID: `gwi`, Mount: `.agentfs/`, DB: `.agentfs/gwi.db` |
| AgentFS Evidence | Turso sync: `libsql://gwi-agentfs-jeremylongshore.aws-us-east-1.turso.io` |

---

## Executive Summary

Phase 15 implements production persistence, webhook security, and rate limiting - transforming the Phase 13-14 in-memory stores into production-ready Firestore implementations with proper security controls.

---

## Scope

### In Scope
- Firestore store implementations for Phase 13 (instances, schedules)
- Firestore store implementations for Phase 14 (signals, work items, PR candidates)
- GitHub webhook HMAC SHA-256 signature verification
- Stripe webhook signature verification
- Generic HMAC signature utilities
- Tenant-scoped sliding window rate limiting
- Express middleware for rate limiting
- Updated store getters to support Firestore backend

### Out of Scope
- Firestore indices deployment (manual Terraform task)
- Webhook endpoint integration (existing handlers)
- Load testing for rate limits
- Redis-backed rate limiting for horizontal scaling

---

## Deliverables

### 15.1 Docs Placement Verification
**Status**: Already compliant - no `docs/` folder exists, all docs in flat `000-docs/`

### 15.2 Firestore Stores: Instances & Schedules (Phase 13)

**Files**:
- `packages/core/src/storage/firestore-instance.ts`
- `packages/core/src/storage/firestore-schedule.ts`

| Store | Collection Path | Key Features |
|-------|-----------------|--------------|
| FirestoreInstanceStore | `gwi_tenants/{tenantId}/instances` | Tenant-scoped, template ref tracking, run count |
| FirestoreScheduleStore | `gwi_tenants/{tenantId}/schedules` | Cron scheduling, due schedule queries |

### 15.3 Firestore Stores: Signals, Work Items, Candidates (Phase 14)

**Files**:
- `packages/core/src/storage/firestore-signal.ts`
- `packages/core/src/storage/firestore-workitem.ts`
- `packages/core/src/storage/firestore-candidate.ts`

| Store | Collection Path | Key Features |
|-------|-----------------|--------------|
| FirestoreSignalStore | `gwi_tenants/{tenantId}/signals` | External ID deduplication, status filtering |
| FirestoreWorkItemStore | `gwi_tenants/{tenantId}/work_items` | Dedupe key indexing, score-based sorting |
| FirestorePRCandidateStore | `gwi_tenants/{tenantId}/pr_candidates` | Approval tracking, work item linking |

### 15.4 Webhook Signature Verification

**File**: `packages/core/src/security/index.ts` (extended)

| Function | Purpose |
|----------|---------|
| `verifyGitHubWebhookSignature()` | Verify GitHub `X-Hub-Signature-256` header |
| `verifyStripeWebhookSignature()` | Verify Stripe `Stripe-Signature` header |
| `verifyHmacSignature()` | Generic HMAC verification |
| `createHmacSignature()` | Create signatures for outgoing webhooks |
| `createGitHubSignatureHeader()` | Create GitHub-style signature header |

Features:
- Timing-safe comparison to prevent timing attacks
- Support for both SHA-256 and SHA-1 (legacy)
- Stripe timestamp tolerance checking
- Proper error messages for debugging

### 15.5 Rate Limiting Middleware

**File**: `packages/core/src/ratelimit/index.ts`

| Component | Purpose |
|-----------|---------|
| `RateLimitConfig` | Configuration interface for limits |
| `DEFAULT_RATE_LIMITS` | Pre-configured limits by action |
| `InMemoryRateLimitStore` | Sliding window implementation |
| `RateLimiter` | Main rate limiting class |
| `rateLimit()` | Express middleware factory |
| `methodBasedRateLimit()` | Different limits for read/write |

Default Rate Limits:
| Action | Limit | Window |
|--------|-------|--------|
| signal:create | 100/min | 60s |
| api:read | 300/min | 60s |
| api:write | 60/min | 60s |
| run:create | 10/min | 60s |
| candidate:generate | 5/min | 60s |
| webhook:github | 200/min | 60s |
| auth:login | 10/15min | 900s |

---

## Technical Decisions

### 1. Tenant-Scoped Subcollections
**Decision**: Store Phase 13-15 data as subcollections under tenant documents
**Rationale**: Automatic tenant isolation, efficient queries, aligns with Phase 12 pattern

### 2. Sliding Window Rate Limiting
**Decision**: Use sliding window algorithm instead of fixed window
**Rationale**: Prevents burst attacks at window boundaries, more fair distribution

### 3. In-Memory Rate Limit Store (Default)
**Decision**: Use in-memory store as default, Firestore planned for horizontal scaling
**Rationale**: Simpler implementation, sufficient for single-instance deployments

### 4. Timing-Safe Signature Verification
**Decision**: Use `timingSafeEqual` for all signature comparisons
**Rationale**: Prevents timing attacks that could leak secret information

---

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `packages/core/src/storage/firestore-instance.ts` | Firestore InstanceStore |
| `packages/core/src/storage/firestore-schedule.ts` | Firestore ScheduleStore |
| `packages/core/src/storage/firestore-signal.ts` | Firestore SignalStore |
| `packages/core/src/storage/firestore-workitem.ts` | Firestore WorkItemStore |
| `packages/core/src/storage/firestore-candidate.ts` | Firestore PRCandidateStore |
| `packages/core/src/ratelimit/index.ts` | Rate limiting module |

### Modified Files
| File | Changes |
|------|---------|
| `packages/core/src/storage/firestore-client.ts` | Added COLLECTIONS for Phase 13-15 |
| `packages/core/src/storage/index.ts` | Added exports and store getters for new stores |
| `packages/core/src/security/index.ts` | Added webhook verification functions |
| `packages/core/src/index.ts` | Added ratelimit export |

---

## Verification

### Build Status
```
npm run build
 Tasks:    11 successful, 11 total
  Time:    20.385s
```

### Type Check
```
npm run typecheck
 Tasks:    15 successful, 15 total
  Time:    12.306s
```

### Tests
```
npm run test
 Tasks:    21 successful, 21 total
  Time:    9.311s
```

---

## API Reference

### Store Getters (Environment-Aware)

```typescript
import {
  getInstanceStore,    // Phase 13
  getScheduleStore,    // Phase 13
  getSignalStore,      // Phase 14
  getWorkItemStore,    // Phase 14
  getPRCandidateStore, // Phase 14
} from '@gwi/core';

// Uses Firestore when GWI_STORE_BACKEND=firestore
// Uses in-memory otherwise
const signalStore = getSignalStore();
```

### Webhook Verification

```typescript
import {
  verifyGitHubWebhookSignature,
  verifyStripeWebhookSignature,
} from '@gwi/core';

// GitHub webhook verification
const result = verifyGitHubWebhookSignature(
  rawBody,
  req.headers['x-hub-signature-256'],
  process.env.GITHUB_WEBHOOK_SECRET
);

if (!result.valid) {
  return res.status(401).json({ error: result.error });
}
```

### Rate Limiting Middleware

```typescript
import { rateLimit } from '@gwi/core';

// Apply rate limiting to signal endpoint
app.post(
  '/v1/tenants/:tenantId/signals',
  rateLimit({ action: 'signal:create' }),
  signalHandler
);
```

---

## Known Limitations

1. **In-Memory Rate Limiting**: Default rate limiter doesn't persist across restarts
2. **Cross-Instance Rate Limits**: In-memory store doesn't share state across instances
3. **Firestore Query Costs**: Some operations query across all tenants (getInstance by ID)
4. **No Redis Support Yet**: Horizontal scaling requires Redis-backed rate limiter

---

## Next Phases / TODOs

1. **Firestore Indices**: Deploy composite indices for Phase 13-15 collections
2. **Redis Rate Limiting**: Implement distributed rate limiting for scaling
3. **Webhook Integration**: Wire verification into existing webhook handlers
4. **Rate Limit Dashboards**: Add monitoring for rate limit violations
5. **Load Testing**: Validate rate limits under production load

---

## Metrics

| Metric | Value |
|--------|-------|
| New files created | 6 |
| Files modified | 4 |
| Lines added (estimated) | ~1,500 |
| Build time | 20s |
| All tests passing | Yes |

---

## Artifacts

| Artifact | Location |
|----------|----------|
| Build log | npm run build (passed) |
| Test report | npm run test (21 tasks passed) |
| Typecheck | npm run typecheck (15 tasks passed) |

---

## Conclusion

Phase 15 successfully productionizes the Phase 13-14 data layer with Firestore persistence, adds essential webhook security with HMAC verification, and implements tenant-scoped rate limiting. The codebase is now equipped for production deployment with proper data persistence and security controls.

**Phase Status**: COMPLETE

---

*Generated by: Claude Code (Bob-style foreman)*
*Template version: 2.0 (Beads + AgentFS metadata required)*
*This document follows 000-docs filing convention (flat, no nesting)*
