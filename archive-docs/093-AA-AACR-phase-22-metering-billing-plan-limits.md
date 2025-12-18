# Phase 22: Metering + Billing + Plan Limits

**Document ID**: 093-AA-AACR-phase-22-metering-billing-plan-limits
**Type**: After-Action Completion Report (AACR)
**Phase**: 22
**Status**: COMPLETE
**Date**: 2025-12-17 15:00 CST
**Author**: Claude Code (Bob-style foreman)

## Metadata (Required)

| Field | Value |
|-------|-------|
| Beads (Epic) | `git-with-intent-dum` |
| Beads (Tasks) | `git-with-intent-dum.1` (22.1), `.2` (22.2), `.3` (22.3), `.4` (22.4), `.5` (22.5) |
| AgentFS | Agent ID: `gwi`, Mount: `.agentfs/`, DB: `.agentfs/gwi.db` |
| AgentFS Evidence | Turso sync: `libsql://gwi-agentfs-jeremylongshore.aws-us-east-1.turso.io` |
| Related Issues/PRs | N/A |
| Commit(s) | (uncommitted - Phase 22 implementation) |

---

## Executive Summary

Phase 22 implements a comprehensive metering and billing enforcement system:

- Extended plan entitlements with daily/monthly limits (runs, signals, candidates, PRs, etc.)
- Usage event tracking with append-only ledger storage
- Firestore-backed metering store with daily/monthly aggregates
- Plan limit enforcement utilities with 429/402 response builders
- Stripe webhook handlers for subscription lifecycle events
- ARV metering gate for continuous verification

---

## Scope

### In Scope
- Extended plan limits beyond base `PlanConfig.limits`
- Usage event types for signals, candidates, PRs, notifications
- Metering store interface with Firestore and InMemory implementations
- Enforcement utilities with HTTP response builders
- Stripe webhook handler for subscription events
- Daily/monthly aggregate tracking
- ARV metering integration gate

### Out of Scope
- API/worker endpoint integration (enforcement middleware ready to use)
- Admin UI for usage dashboards
- Usage export/reporting endpoints
- Overage billing (usage-based billing on top of limits)

---

## Deliverables

### 22.1 Entitlements Module

**File Created**: `packages/core/src/billing/entitlements.ts`

| Export | Description |
|--------|-------------|
| `ExtendedPlanLimits` | Type for daily/monthly/concurrent limits |
| `EXTENDED_PLAN_LIMITS` | Limits for free, pro, enterprise plans |
| `MeteredResource` | Union type of all metered resource types |
| `TenantUsageSnapshot` | Current usage state for a tenant |
| `checkEntitlement()` | Check if usage is within limits |
| `getRemainingQuota()` | Get remaining quota for a resource |
| `checkUsageWarning()` | Check if warning threshold hit (80/90/95%) |

Extended limits include:
- Daily: `runsPerDay`, `signalsPerDay`, `candidatesPerDay`, `apiCallsPerDay`, `notificationsPerDay`
- Monthly: `prsPerMonth`, `connectorInstallsPerMonth`, `tokensPerMonth`, `storageBytes`
- Concurrent: `maxConcurrentWebhooks`

### 22.2 Usage Module

**File Created**: `packages/core/src/billing/usage.ts`

| Export | Description |
|--------|-------------|
| `ExtendedUsageEventType` | 30+ event types for metering |
| `ExtendedUsageEvent` | Full usage event record |
| `DailyUsageAggregate` | Daily counters by tenant |
| `MonthlyUsageAggregate` | Monthly counters by tenant |
| `createUsageEvent()` | Factory for creating events |
| `updateDailyAggregate()` | Update aggregate with event |

Event types include: `run_started`, `signal_ingested`, `candidate_generated`, `pr_opened`, `tokens_used`, `notification_sent`, `webhook_received`, etc.

### 22.3 Metering Store

**File Created**: `packages/core/src/storage/firestore-metering.ts`

| Export | Description |
|--------|-------------|
| `MeteringStore` | Interface for metering persistence |
| `FirestoreMeteringStore` | Firestore implementation |
| `InMemoryMeteringStore` | In-memory implementation (dev/test) |
| `getMeteringStore()` | Get singleton based on `GWI_STORE_BACKEND` |

Firestore collections:
- `gwi_usage_events` - Append-only event ledger
- `gwi_usage_daily` - Daily aggregates
- `gwi_usage_monthly` - Monthly aggregates
- `gwi_usage_snapshots` - Current tenant state

### 22.4 Enforcement Module

**File Created**: `packages/core/src/billing/enforcement.ts`

| Export | Description |
|--------|-------------|
| `enforceLimit()` | Check single resource limit |
| `preflightCheck()` | Check multiple resources at once |
| `enforceRunCreation()` | Check run daily/monthly/concurrent limits |
| `build429Response()` | Build rate limit exceeded response |
| `build402Response()` | Build payment required response |
| `addRateLimitHeaders()` | Add X-RateLimit-* headers |

HTTP responses:
- **429 Too Many Requests**: Daily/rate limits (with `Retry-After` header)
- **402 Payment Required**: Monthly/plan limits (with upgrade suggestion)

### 22.5 Stripe Webhook Handler

**File Created**: `packages/core/src/billing/stripe-webhooks.ts`

| Export | Description |
|--------|-------------|
| `StripeWebhookHandler` | Handler class for Stripe events |
| `createStripeWebhookHandler()` | Factory with dependency injection |
| `createStubWebhookDeps()` | Stub dependencies for dev/testing |

Handled events:
- `customer.subscription.created/updated/deleted`
- `customer.subscription.trial_will_end`
- `invoice.paid/payment_failed/finalized`

### 22.6 ARV Gate

**File Created**: `scripts/arv/metering-gate.ts`

**File Modified**: `scripts/arv/run-all.ts` (added gate)

Gate checks (9 total):
1. Entitlements module with plan limits
2. Usage module with event types
3. Enforcement module with limit checking
4. Metering store (Firestore + InMemory)
5. Stripe webhook handler
6. Billing index exports
7. Storage index exports metering
8. Firestore collections defined
9. TypeScript compilation

---

## Technical Decisions

### 1. Daily vs Monthly Limits
**Decision**: Daily limits return 429, monthly limits return 402
**Rationale**: Daily limits are transient (retry later), monthly requires plan change

### 2. Append-Only Event Ledger
**Decision**: Never delete usage events, only mark as invoiced
**Rationale**: Audit trail and billing accuracy

### 3. Snapshot-Based Current State
**Decision**: `gwi_usage_snapshots` stores current counters per tenant
**Rationale**: Fast limit checks without aggregating events every time

### 4. Dependency Injection for Webhooks
**Decision**: `WebhookHandlerDeps` interface for webhook handler
**Rationale**: Allows stubbing for dev/testing without Stripe

### 5. Extended Limits Separate from Base
**Decision**: `EXTENDED_PLAN_LIMITS` separate from `PLAN_CONFIGS.limits`
**Rationale**: Backward compatibility with existing code

---

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `packages/core/src/billing/entitlements.ts` | Plan entitlements and limits |
| `packages/core/src/billing/usage.ts` | Usage event types and aggregates |
| `packages/core/src/billing/enforcement.ts` | Limit enforcement utilities |
| `packages/core/src/billing/stripe-webhooks.ts` | Stripe webhook handlers |
| `packages/core/src/storage/firestore-metering.ts` | Metering store implementations |
| `scripts/arv/metering-gate.ts` | ARV gate for metering |
| `000-docs/093-AA-AACR-phase-22-metering-billing-plan-limits.md` | This document |

### Modified Files
| File | Changes |
|------|---------|
| `packages/core/src/billing/index.ts` | Export new modules |
| `packages/core/src/storage/index.ts` | Export metering store |
| `packages/core/src/storage/firestore-client.ts` | Add metering collections |
| `scripts/arv/run-all.ts` | Add metering gate |

---

## Verification

### Build Status
```
npm run build
 Tasks:    12 successful, 12 total
  Time:    ~22s
```

### Tests
```
npm run test
 Tasks:    23 successful, 23 total
  Time:    ~7s
```

### ARV Gate
```
npx tsx scripts/arv/metering-gate.ts
✅ Entitlements module
✅ Usage module
✅ Enforcement module
✅ Metering store
✅ Stripe webhook handler
✅ Billing index exports
✅ Storage index exports metering
✅ Firestore collections defined
✅ TypeScript compilation
 9 passed, 0 failed
✅ Metering Integration Gate PASSED
```

---

## API Reference

### Check Entitlement
```typescript
import { checkEntitlement } from '@gwi/core';

const result = checkEntitlement('runs_daily', currentUsage, 'pro');
if (!result.allowed) {
  // Return 429 or 402 based on result.httpStatus
}
```

### Enforce Run Creation
```typescript
import { enforceRunCreation, build429Response, build402Response } from '@gwi/core';

const check = enforceRunCreation(usageSnapshot, 'pro');
if (!check.allowed) {
  const response = check.blockingResult.httpStatus === 429
    ? build429Response(check.blockingResult)
    : build402Response(check.blockingResult, 'pro');
  return res.status(response.status).set(response.headers).json(response.body);
}
```

### Record Usage Event
```typescript
import { getMeteringStore, createRunStartedEvent } from '@gwi/core';

const store = getMeteringStore();
const event = createRunStartedEvent(tenantId, runId, userId);
await store.recordEvent(event);
```

### Stripe Webhook
```typescript
import { createStripeWebhookHandler, WebhookHandlerDeps } from '@gwi/core';

const deps: WebhookHandlerDeps = {
  updateTenantSubscription: async (update) => { /* ... */ },
  resetTenantUsage: async (tenantId, type) => { /* ... */ },
  getTenantIdFromCustomer: async (customerId) => { /* ... */ },
  logWebhookEvent: async (...) => { /* ... */ },
};

const handler = createStripeWebhookHandler(deps);
const result = await handler.handleEvent(stripeEvent);
```

---

## Known Limitations

1. **No API Integration Yet**: Enforcement utilities ready but not wired into endpoints
2. **No Usage Dashboard**: Admin UI for viewing usage not included
3. **No Overage Billing**: Only hard limits, no pay-per-use overflow
4. **No Real-Time Websocket Updates**: Usage updates are polling-based

---

## Next Phases / TODOs

1. **API Integration**: Wire enforcement middleware into run creation endpoint
2. **Worker Integration**: Check limits before processing queue items
3. **Usage Dashboard**: Admin UI for viewing tenant usage
4. **Usage Export API**: Endpoint for exporting usage data
5. **Notifications**: Email/Slack alerts on threshold warnings
6. **Rate Limiting Per-Endpoint**: Fine-grained rate limits by endpoint

---

## Metrics

| Metric | Value |
|--------|-------|
| New files created | 6 |
| Files modified | 4 |
| Lines added (estimated) | ~1,800 |
| Build time | 22s |
| Test time | 7s |
| ARV gate checks | 9 |
| All checks passing | Yes |

---

## Conclusion

Phase 22 successfully implements a production-grade metering and billing system:

1. **Extended Entitlements**: Daily/monthly/concurrent limits across all resource types
2. **Usage Tracking**: Append-only event ledger with aggregate rollups
3. **Firestore Storage**: Scalable storage with automatic daily/monthly resets
4. **Enforcement Utilities**: Ready-to-use functions for 429/402 responses
5. **Stripe Integration**: Webhook handlers for subscription lifecycle
6. **ARV Gate**: Continuous verification of metering infrastructure

The system follows "no free vibes" - every billable action can be metered and limited by plan.

**Phase Status**: COMPLETE

---

intent solutions io - confidential IP
Contact: jeremy@intentsolutions.io
