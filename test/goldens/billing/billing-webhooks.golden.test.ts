/**
 * Phase 28: Billing & Stripe Webhook Golden Tests
 *
 * Deterministic tests for:
 * - StripeWebhookHandler event processing
 * - MeteringBridge plan synchronization
 * - Billing state management
 *
 * NO LIVE STRIPE CALLS - uses mock events only.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Stripe from 'stripe';
import {
  StripeWebhookHandler,
  createStripeWebhookHandler,
  createStubWebhookDeps,
  type WebhookHandlerDeps,
  type SubscriptionStateUpdate,
  InMemoryBillingStateStorage,
  MeteringBridge,
  resetMeteringBridge,
} from '@gwi/core';
import {
  MeteringService,
  InMemoryMeteringStorage,
  resetMeteringService,
} from '@gwi/core';

// =============================================================================
// Test Fixtures - Mock Stripe Events
// =============================================================================

function createMockStripeEvent(
  type: string,
  data: Record<string, unknown>,
  previousAttributes?: Record<string, unknown>
): Stripe.Event {
  return {
    id: `evt_test_${Date.now()}`,
    object: 'event',
    api_version: '2024-12-18.acacia',
    created: Math.floor(Date.now() / 1000),
    type: type as Stripe.Event.Type,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: {
      object: data,
      previous_attributes: previousAttributes,
    },
  } as unknown as Stripe.Event;
}

function createMockSubscription(overrides: Partial<Stripe.Subscription> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: 'sub_test_123',
    object: 'subscription',
    customer: 'cus_test_456',
    status: 'active',
    current_period_start: now,
    current_period_end: now + 30 * 24 * 60 * 60, // 30 days
    cancel_at_period_end: false,
    trial_end: null,
    items: {
      data: [
        {
          id: 'si_test',
          price: {
            id: 'price_pro_monthly',
            metadata: { planId: 'pro' },
          },
        },
      ],
    },
    metadata: { planId: 'pro' },
    ...overrides,
  };
}

function createMockInvoice(overrides: Partial<Stripe.Invoice> = {}): Record<string, unknown> {
  return {
    id: 'inv_test_789',
    object: 'invoice',
    customer: 'cus_test_456',
    subscription: 'sub_test_123',
    status: 'paid',
    amount_paid: 2900,
    total: 2900,
    currency: 'usd',
    hosted_invoice_url: 'https://invoice.stripe.com/test',
    attempt_count: 1,
    next_payment_attempt: null,
    ...overrides,
  };
}

// =============================================================================
// StripeWebhookHandler Tests
// =============================================================================

describe('StripeWebhookHandler', () => {
  let handler: StripeWebhookHandler;
  let capturedUpdates: SubscriptionStateUpdate[];
  let capturedResets: Array<{ tenantId: string; resetType: string }>;
  let capturedLogs: Array<{ eventId: string; eventType: string; tenantId: string | null }>;

  beforeEach(() => {
    capturedUpdates = [];
    capturedResets = [];
    capturedLogs = [];

    const deps: WebhookHandlerDeps = {
      updateTenantSubscription: async (update) => {
        capturedUpdates.push(update);
      },
      resetTenantUsage: async (tenantId, resetType) => {
        capturedResets.push({ tenantId, resetType });
      },
      getTenantIdFromCustomer: async (customerId) => {
        // Map test customer to test tenant
        if (customerId === 'cus_test_456') return 'tenant_test_001';
        return null;
      },
      logWebhookEvent: async (eventId, eventType, tenantId, _result) => {
        capturedLogs.push({ eventId, eventType, tenantId });
      },
    };

    handler = createStripeWebhookHandler(deps);
  });

  describe('Subscription Events', () => {
    it('should handle subscription.created event', async () => {
      const event = createMockStripeEvent(
        'customer.subscription.created',
        createMockSubscription()
      );

      const result = await handler.handleEvent(event);

      expect(result.success).toBe(true);
      expect(result.action).toBe('subscription_created');
      expect(result.tenantId).toBe('tenant_test_001');
      expect(capturedUpdates.length).toBe(1);
      expect(capturedUpdates[0].planId).toBe('pro');
      expect(capturedUpdates[0].status).toBe('active');
    });

    it('should handle subscription.updated event', async () => {
      const event = createMockStripeEvent(
        'customer.subscription.updated',
        createMockSubscription({ status: 'active' }),
        { status: 'trialing' }
      );

      const result = await handler.handleEvent(event);

      expect(result.success).toBe(true);
      expect(result.action).toBe('subscription_updated');
      expect(capturedUpdates.length).toBe(1);
    });

    it('should reset usage on billing period change', async () => {
      const event = createMockStripeEvent(
        'customer.subscription.updated',
        createMockSubscription({ status: 'active' }),
        { current_period_start: 12345, current_period_end: 67890 }
      );

      const result = await handler.handleEvent(event);

      expect(result.success).toBe(true);
      expect(capturedResets.length).toBe(1);
      expect(capturedResets[0].tenantId).toBe('tenant_test_001');
      expect(capturedResets[0].resetType).toBe('monthly');
    });

    it('should handle subscription.deleted event', async () => {
      const event = createMockStripeEvent(
        'customer.subscription.deleted',
        createMockSubscription({ status: 'canceled' })
      );

      const result = await handler.handleEvent(event);

      expect(result.success).toBe(true);
      expect(result.action).toBe('subscription_deleted');
      expect(capturedUpdates.length).toBe(1);
      expect(capturedUpdates[0].planId).toBe('free'); // Downgraded
      expect(capturedUpdates[0].status).toBe('expired');
    });

    it('should handle trial_will_end event', async () => {
      const trialEnd = Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60; // 3 days
      const event = createMockStripeEvent(
        'customer.subscription.trial_will_end',
        createMockSubscription({ status: 'trialing', trial_end: trialEnd })
      );

      const result = await handler.handleEvent(event);

      expect(result.success).toBe(true);
      expect(result.action).toBe('trial_will_end');
      expect(result.details?.daysRemaining).toBe(3);
    });

    it('should fail gracefully when tenant not found', async () => {
      const event = createMockStripeEvent(
        'customer.subscription.created',
        createMockSubscription({ customer: 'cus_unknown' })
      );

      const result = await handler.handleEvent(event);

      expect(result.success).toBe(false);
      expect(result.action).toBe('subscription_created');
      expect(result.error).toContain('Could not determine tenant ID');
    });
  });

  describe('Invoice Events', () => {
    it('should handle invoice.paid event', async () => {
      const event = createMockStripeEvent(
        'invoice.paid',
        createMockInvoice()
      );

      const result = await handler.handleEvent(event);

      expect(result.success).toBe(true);
      expect(result.action).toBe('invoice_paid');
      expect(result.details?.amountPaid).toBe(2900);
    });

    it('should handle invoice.payment_failed event', async () => {
      const event = createMockStripeEvent(
        'invoice.payment_failed',
        createMockInvoice({
          status: 'open',
          attempt_count: 2,
          next_payment_attempt: Math.floor(Date.now() / 1000) + 86400,
        })
      );

      const result = await handler.handleEvent(event);

      expect(result.success).toBe(true);
      expect(result.action).toBe('invoice_payment_failed');
      expect(result.details?.attemptCount).toBe(2);
    });

    it('should handle invoice.finalized event', async () => {
      const event = createMockStripeEvent(
        'invoice.finalized',
        createMockInvoice({
          status: 'open',
          hosted_invoice_url: 'https://invoice.stripe.com/i/test',
        })
      );

      const result = await handler.handleEvent(event);

      expect(result.success).toBe(true);
      expect(result.action).toBe('invoice_finalized');
      expect(result.details?.invoiceUrl).toBeDefined();
    });
  });

  describe('Event Logging', () => {
    it('should log all processed events', async () => {
      const event = createMockStripeEvent(
        'customer.subscription.created',
        createMockSubscription()
      );

      await handler.handleEvent(event);

      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0].eventType).toBe('customer.subscription.created');
      expect(capturedLogs[0].tenantId).toBe('tenant_test_001');
    });

    it('should handle unknown event types gracefully', async () => {
      const event = createMockStripeEvent(
        'unknown.event.type',
        { foo: 'bar' }
      );

      const result = await handler.handleEvent(event);

      expect(result.success).toBe(true);
      expect(result.action).toBe('ignored');
      expect(result.details?.reason).toContain('Unhandled event type');
    });
  });
});

// =============================================================================
// MeteringBridge Tests
// =============================================================================

describe('MeteringBridge', () => {
  let bridge: MeteringBridge;
  let billingStorage: InMemoryBillingStateStorage;
  let meteringService: MeteringService;
  let meteringStorage: InMemoryMeteringStorage;

  beforeEach(() => {
    resetMeteringBridge();
    resetMeteringService();

    billingStorage = new InMemoryBillingStateStorage();
    meteringStorage = new InMemoryMeteringStorage();
    meteringService = new MeteringService({ storage: meteringStorage });
    bridge = new MeteringBridge(billingStorage, meteringService);
  });

  afterEach(() => {
    resetMeteringBridge();
    resetMeteringService();
  });

  describe('Subscription Sync', () => {
    it('should sync subscription to billing state', async () => {
      const update: SubscriptionStateUpdate = {
        tenantId: 'tenant_001',
        planId: 'pro',
        status: 'active',
        externalSubscriptionId: 'sub_123',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      };

      await bridge.syncSubscriptionToMeteringPlan(update);

      const state = await bridge.getTenantBillingState('tenant_001');
      expect(state).toBeDefined();
      expect(state?.planId).toBe('pro');
      expect(state?.status).toBe('active');
      expect(state?.stripeSubscriptionId).toBe('sub_123');
    });

    it('should map pro plan to professional metering plan', async () => {
      // Manually set the env flag for this test
      const originalEnv = process.env.GWI_METERING_ENABLED;
      process.env.GWI_METERING_ENABLED = '1';

      try {
        const update: SubscriptionStateUpdate = {
          tenantId: 'tenant_002',
          planId: 'pro',
          status: 'active',
          externalSubscriptionId: 'sub_456',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: false,
        };

        await bridge.syncSubscriptionToMeteringPlan(update);

        // The metering plan should be mapped from 'pro' to 'professional'
        const meteringPlan = meteringService.getTenantPlan('tenant_002');
        expect(meteringPlan.tier).toBe('professional');
      } finally {
        // Restore original env
        if (originalEnv === undefined) {
          delete process.env.GWI_METERING_ENABLED;
        } else {
          process.env.GWI_METERING_ENABLED = originalEnv;
        }
      }
    });

    it('should downgrade to free on subscription deleted', async () => {
      // First create active subscription
      await bridge.syncSubscriptionToMeteringPlan({
        tenantId: 'tenant_003',
        planId: 'pro',
        status: 'active',
        externalSubscriptionId: 'sub_789',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      });

      // Then delete/expire it
      await bridge.syncSubscriptionToMeteringPlan({
        tenantId: 'tenant_003',
        planId: 'free',
        status: 'expired',
        externalSubscriptionId: 'sub_789',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
      });

      const state = await bridge.getTenantBillingState('tenant_003');
      expect(state?.status).toBe('expired');
      expect(state?.planId).toBe('free');
    });
  });

  describe('Customer Linking', () => {
    it('should link Stripe customer to tenant', async () => {
      await bridge.linkStripeCustomer('cus_abc123', 'tenant_linked');

      const deps = bridge.createWebhookDeps();
      const foundTenant = await deps.getTenantIdFromCustomer('cus_abc123');
      expect(foundTenant).toBe('tenant_linked');
    });

    it('should return null for unknown customer', async () => {
      const deps = bridge.createWebhookDeps();
      const foundTenant = await deps.getTenantIdFromCustomer('cus_unknown');
      expect(foundTenant).toBeNull();
    });
  });

  describe('Active Subscription Check', () => {
    it('should detect active subscription', async () => {
      await bridge.syncSubscriptionToMeteringPlan({
        tenantId: 'tenant_active',
        planId: 'pro',
        status: 'active',
        externalSubscriptionId: 'sub_active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      });

      const hasActive = await bridge.hasActiveSubscription('tenant_active');
      expect(hasActive).toBe(true);
    });

    it('should detect trialing as active', async () => {
      await bridge.syncSubscriptionToMeteringPlan({
        tenantId: 'tenant_trial',
        planId: 'pro',
        status: 'trialing',
        externalSubscriptionId: 'sub_trial',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      });

      const hasActive = await bridge.hasActiveSubscription('tenant_trial');
      expect(hasActive).toBe(true);
    });

    it('should detect canceled as inactive', async () => {
      await bridge.syncSubscriptionToMeteringPlan({
        tenantId: 'tenant_canceled',
        planId: 'free',
        status: 'canceled',
        externalSubscriptionId: 'sub_canceled',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: true,
      });

      const hasActive = await bridge.hasActiveSubscription('tenant_canceled');
      expect(hasActive).toBe(false);
    });

    it('should return false for unknown tenant', async () => {
      const hasActive = await bridge.hasActiveSubscription('tenant_unknown');
      expect(hasActive).toBe(false);
    });
  });

  describe('Webhook Deps Factory', () => {
    it('should create valid webhook deps', async () => {
      const deps = bridge.createWebhookDeps();

      expect(deps.updateTenantSubscription).toBeDefined();
      expect(deps.resetTenantUsage).toBeDefined();
      expect(deps.getTenantIdFromCustomer).toBeDefined();
      expect(deps.logWebhookEvent).toBeDefined();
    });

    it('should log webhook events through deps', async () => {
      const deps = bridge.createWebhookDeps();

      await deps.logWebhookEvent('evt_test', 'subscription.created', 'tenant_001', {
        success: true,
        action: 'subscription_created',
      });

      const logs = billingStorage.getWebhookLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].eventType).toBe('subscription.created');
    });
  });
});

// =============================================================================
// Stub Dependencies Tests
// =============================================================================

describe('createStubWebhookDeps', () => {
  it('should create valid stub deps for development', async () => {
    const deps = createStubWebhookDeps();

    // All functions should be callable without errors
    await deps.updateTenantSubscription({
      tenantId: 'test',
      planId: 'pro',
      status: 'active',
      externalSubscriptionId: 'sub_test',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
    });

    await deps.resetTenantUsage('test', 'monthly');
    const tenantId = await deps.getTenantIdFromCustomer('cus_test');
    await deps.logWebhookEvent('evt_test', 'test', 'test', { success: true, action: 'test' });

    // Stub returns tenant ID derived from customer ID
    expect(tenantId).toContain('tenant_');
  });
});
