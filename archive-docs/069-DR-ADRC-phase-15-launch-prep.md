# ADR-015: Launch Prep - Pricing, Billing, and GA Controls

**Status:** In Progress
**Date:** 2025-12-16
**Phase:** 15
**Author:** Claude (AI Assistant) with Jeremy

## Context

Phase 14 delivered developer experience improvements (CLI, plugins, SDK, OpenAPI). Phase 15 prepares Git With Intent for commercial launch with:

1. **Pricing Tiers**: Defined plan limits and features
2. **Billing Infrastructure**: Subscription, invoice, and payment method management
3. **Usage Metering**: Track runs, tokens, API calls for billing
4. **GA Controls**: Feature flags, killswitches, beta program management

## Decision

### 1. Pricing Model (Already Implemented in Phase 11)

Three tiers with clear differentiation:

| Plan | Price | Runs/mo | Repos | Members | Key Features |
|------|-------|---------|-------|---------|--------------|
| Free | $0 | 50 | 3 | 3 | API access |
| Pro | $49 | 500 | 20 | 15 | Multi-model, analytics, webhooks, auto-push |
| Enterprise | $299 | 10,000 | 200 | 100 | SSO, priority queue, support SLA |

Plan limits enforced via `checkRunLimit()`, `checkRepoLimit()`, `checkMemberLimit()` in `@gwi/core/security`.

### 2. Billing Module Architecture

Created `@gwi/core/billing` module with:

**Core Types:**
- `Subscription`: Active, trialing, past_due, canceled, expired, paused
- `Invoice`: Draft, open, paid, void, uncollectible
- `PaymentMethod`: Card, bank account, PayPal support
- `UsageEvent`: Run started/completed, tokens used, API calls

**Storage Interface:**
```typescript
interface BillingStore {
  // Subscription CRUD
  createSubscription(params): Promise<Subscription>;
  getSubscriptionByTenant(tenantId): Promise<Subscription | null>;
  updateSubscription(id, params): Promise<Subscription>;
  cancelSubscription(id, immediate?): Promise<Subscription>;

  // Payment methods
  addPaymentMethod(tenantId, method): Promise<PaymentMethod>;
  setDefaultPaymentMethod(tenantId, pmId): Promise<void>;

  // Invoices
  createInvoice(invoice): Promise<Invoice>;
  listInvoices(tenantId, filter?): Promise<Invoice[]>;

  // Usage metering
  recordUsageEvent(event): Promise<UsageEvent>;
  getUsageSummary(tenantId, billingPeriod): Promise<UsageSummary>;
}
```

**Payment Provider Abstraction:**
```typescript
interface PaymentProvider {
  readonly name: string;
  createCustomer(tenantId, email, name?): Promise<string>;
  createSubscription(customerId, planId, interval, options?): Promise<{...}>;
  cancelSubscription(subscriptionId, immediate?): Promise<void>;
  attachPaymentMethod(customerId, pmId): Promise<void>;
  verifyWebhookSignature(payload, signature): boolean;
}
```

### 3. Billing Intervals and Discounts

- **Monthly**: Standard pricing
- **Yearly**: 2 months free (~17% discount)
- **Proration**: Calculated for mid-cycle plan changes

### 4. Beta Program Controls (From Phase 12)

```typescript
interface BetaConfig {
  enabled: boolean;
  accessMode: 'open' | 'invite_only' | 'closed';
  validInviteCodes?: string[];  // GWIBETA2025, EARLYBIRD, FOUNDER50
  maxBetaUsers: number;         // 500
  betaEndsAt?: Date;
}
```

### 5. Feature Flags Architecture

Per-plan feature gates:
- `multi-model`: Use Claude Opus for complex tasks
- `priority-queue`: Priority run execution
- `advanced-analytics`: Detailed run analytics
- `custom-webhooks`: Custom webhook integrations
- `sso`: SSO/SAML authentication
- `audit-logs`: Full audit logging
- `api-access`: API access for integrations
- `auto-push`: Auto-push resolved changes
- `support-priority`: Priority support

Enforcement via `planHasFeature(planId, feature)`.

## Consequences

### Positive

1. **Clear Value Ladder**: Free → Pro → Enterprise progression
2. **Flexible Billing**: Monthly/yearly, discounts, prorations
3. **Payment Agnostic**: Provider interface supports Stripe, Paddle, etc.
4. **Usage Visibility**: Metering enables accurate billing
5. **Beta Control**: Can gate features and manage rollout

### Negative

1. **No Stripe Integration Yet**: PaymentProvider is an interface, not implementation
2. **No Billing UI**: Web app lacks billing/invoice pages
3. **Manual Enforcement**: Plan limits checked but not automatically upgraded

### Neutral

1. **InMemory Default**: Development uses in-memory store; production needs Firestore
2. **Webhook Handling**: Types defined but handlers not implemented

## Implementation

### Files Created

| File | Purpose |
|------|---------|
| `packages/core/src/billing/index.ts` | Complete billing module (~700 lines) |
| `docs/phase-15-adr.md` | This document |
| `docs/phase-15-aar.md` | After-action report |

### Files Modified

| File | Changes |
|------|---------|
| `packages/core/src/index.ts` | Export billing module |

## What Remains (Phase 15 TODO)

1. **Stripe Integration**: Implement `StripePaymentProvider`
2. **Billing API Endpoints**: `/billing/*`, `/subscriptions/*`
3. **Billing UI Pages**: Invoices, payment methods, upgrade flow
4. **Usage Metering Integration**: Hook into workflow execution
5. **Webhook Handlers**: Stripe webhook processing
6. **Rate Limiting Middleware**: Token bucket or sliding window
7. **OpenTelemetry**: Distributed tracing for observability

## Technical Debt

1. **BillingStore is interface only**: Need Firestore implementation
2. **No metering hooks**: Usage events not recorded during runs
3. **No subscription lifecycle**: Trial end, payment retry not automated

## References

- [Phase 11 Security ADR](./phase-11-adr.md) - Plan limits foundation
- [Phase 12 Beta ADR](./phase-12-adr.md) - Beta program setup
- [Stripe Billing Docs](https://stripe.com/docs/billing)
