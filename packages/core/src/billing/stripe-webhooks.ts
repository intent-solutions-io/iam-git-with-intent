/**
 * Stripe Webhook Handlers for Git With Intent
 *
 * Phase 22: Metering + Billing + Plan Limits
 *
 * Handles Stripe webhook events to:
 * - Update subscription status
 * - Sync plan changes
 * - Reset usage on subscription changes
 * - Handle payment failures
 *
 * @module @gwi/core/billing/stripe-webhooks
 */

import Stripe from 'stripe';
import { type PlanId } from '../security/index.js';
import { type SubscriptionStatus } from './index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Webhook event types we handle
 */
export type StripeWebhookEventType =
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'customer.subscription.trial_will_end'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'invoice.finalized'
  | 'payment_intent.succeeded'
  | 'payment_intent.payment_failed';

/**
 * Webhook handler context
 */
export interface WebhookHandlerContext {
  /** Stripe event */
  event: Stripe.Event;
  /** Tenant ID (from customer metadata) */
  tenantId?: string;
  /** Customer ID */
  customerId: string;
}

/**
 * Webhook handler result
 */
export interface WebhookHandlerResult {
  success: boolean;
  action: string;
  tenantId?: string;
  details?: Record<string, unknown>;
  error?: string;
}

/**
 * Subscription state update
 */
export interface SubscriptionStateUpdate {
  tenantId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  externalSubscriptionId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date;
}

/**
 * Dependencies for webhook handlers
 */
export interface WebhookHandlerDeps {
  /** Update tenant subscription state */
  updateTenantSubscription: (update: SubscriptionStateUpdate) => Promise<void>;
  /** Reset usage for a tenant (on new billing period) */
  resetTenantUsage: (tenantId: string, resetType: 'monthly') => Promise<void>;
  /** Get tenant ID from Stripe customer ID */
  getTenantIdFromCustomer: (customerId: string) => Promise<string | null>;
  /** Log webhook event */
  logWebhookEvent: (
    eventId: string,
    eventType: string,
    tenantId: string | null,
    result: WebhookHandlerResult
  ) => Promise<void>;
}

// =============================================================================
// Webhook Handler Class
// =============================================================================

/**
 * Stripe webhook handler
 */
export class StripeWebhookHandler {
  private deps: WebhookHandlerDeps;

  constructor(deps: WebhookHandlerDeps) {
    this.deps = deps;
  }

  /**
   * Handle a Stripe webhook event
   */
  async handleEvent(event: Stripe.Event): Promise<WebhookHandlerResult> {
    const eventType = event.type as StripeWebhookEventType;

    // Get tenant ID from customer if available
    const customerId = this.extractCustomerId(event);
    let tenantId: string | null = null;

    if (customerId) {
      tenantId = await this.deps.getTenantIdFromCustomer(customerId);
    }

    let result: WebhookHandlerResult;

    try {
      switch (eventType) {
        case 'customer.subscription.created':
          result = await this.handleSubscriptionCreated(event, tenantId);
          break;

        case 'customer.subscription.updated':
          result = await this.handleSubscriptionUpdated(event, tenantId);
          break;

        case 'customer.subscription.deleted':
          result = await this.handleSubscriptionDeleted(event, tenantId);
          break;

        case 'customer.subscription.trial_will_end':
          result = await this.handleTrialWillEnd(event, tenantId);
          break;

        case 'invoice.paid':
          result = await this.handleInvoicePaid(event, tenantId);
          break;

        case 'invoice.payment_failed':
          result = await this.handleInvoicePaymentFailed(event, tenantId);
          break;

        case 'invoice.finalized':
          result = await this.handleInvoiceFinalized(event, tenantId);
          break;

        default:
          result = {
            success: true,
            action: 'ignored',
            tenantId: tenantId ?? undefined,
            details: { reason: `Unhandled event type: ${event.type}` },
          };
      }
    } catch (error) {
      result = {
        success: false,
        action: 'error',
        tenantId: tenantId ?? undefined,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Log the webhook event
    await this.deps.logWebhookEvent(event.id, event.type, tenantId, result);

    return result;
  }

  // ===========================================================================
  // Subscription Event Handlers
  // ===========================================================================

  private async handleSubscriptionCreated(
    event: Stripe.Event,
    tenantId: string | null
  ): Promise<WebhookHandlerResult> {
    const subscription = event.data.object as Stripe.Subscription;

    if (!tenantId) {
      return {
        success: false,
        action: 'subscription_created',
        error: 'Could not determine tenant ID from customer',
      };
    }

    const update = this.extractSubscriptionUpdate(subscription, tenantId);
    await this.deps.updateTenantSubscription(update);

    return {
      success: true,
      action: 'subscription_created',
      tenantId,
      details: {
        subscriptionId: subscription.id,
        planId: update.planId,
        status: update.status,
      },
    };
  }

  private async handleSubscriptionUpdated(
    event: Stripe.Event,
    tenantId: string | null
  ): Promise<WebhookHandlerResult> {
    const subscription = event.data.object as Stripe.Subscription;
    const previousAttributes = event.data.previous_attributes as Record<string, unknown> | undefined;

    if (!tenantId) {
      return {
        success: false,
        action: 'subscription_updated',
        error: 'Could not determine tenant ID from customer',
      };
    }

    const update = this.extractSubscriptionUpdate(subscription, tenantId);
    await this.deps.updateTenantSubscription(update);

    // Check if billing period changed (invoice paid, new period)
    const periodChanged =
      previousAttributes?.current_period_start !== undefined ||
      previousAttributes?.current_period_end !== undefined;

    // Reset monthly usage if new billing period started
    if (periodChanged && subscription.status === 'active') {
      await this.deps.resetTenantUsage(tenantId, 'monthly');
    }

    return {
      success: true,
      action: 'subscription_updated',
      tenantId,
      details: {
        subscriptionId: subscription.id,
        planId: update.planId,
        status: update.status,
        periodChanged,
      },
    };
  }

  private async handleSubscriptionDeleted(
    event: Stripe.Event,
    tenantId: string | null
  ): Promise<WebhookHandlerResult> {
    const subscription = event.data.object as Stripe.Subscription;

    if (!tenantId) {
      return {
        success: false,
        action: 'subscription_deleted',
        error: 'Could not determine tenant ID from customer',
      };
    }

    // Update to canceled/expired status
    const update: SubscriptionStateUpdate = {
      tenantId,
      planId: 'free', // Downgrade to free
      status: 'expired',
      externalSubscriptionId: subscription.id,
      currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
      currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
      cancelAtPeriodEnd: false,
    };

    await this.deps.updateTenantSubscription(update);

    return {
      success: true,
      action: 'subscription_deleted',
      tenantId,
      details: {
        subscriptionId: subscription.id,
        downgradedTo: 'free',
      },
    };
  }

  private async handleTrialWillEnd(
    event: Stripe.Event,
    tenantId: string | null
  ): Promise<WebhookHandlerResult> {
    const subscription = event.data.object as Stripe.Subscription;

    // This is informational - could trigger email notification
    // The actual trial end is handled by subscription.updated

    return {
      success: true,
      action: 'trial_will_end',
      tenantId: tenantId ?? undefined,
      details: {
        subscriptionId: subscription.id,
        trialEnd: (subscription as any).trial_end
          ? new Date((subscription as any).trial_end * 1000).toISOString()
          : null,
        daysRemaining: 3, // Stripe sends this 3 days before
      },
    };
  }

  // ===========================================================================
  // Invoice Event Handlers
  // ===========================================================================

  private async handleInvoicePaid(
    event: Stripe.Event,
    tenantId: string | null
  ): Promise<WebhookHandlerResult> {
    const invoice = event.data.object as Stripe.Invoice;

    // Invoice paid typically means new billing period
    // The subscription.updated event handles the period change

    return {
      success: true,
      action: 'invoice_paid',
      tenantId: tenantId ?? undefined,
      details: {
        invoiceId: invoice.id,
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
      },
    };
  }

  private async handleInvoicePaymentFailed(
    event: Stripe.Event,
    tenantId: string | null
  ): Promise<WebhookHandlerResult> {
    const invoice = event.data.object as Stripe.Invoice;

    if (!tenantId) {
      return {
        success: false,
        action: 'invoice_payment_failed',
        error: 'Could not determine tenant ID from customer',
      };
    }

    // Update subscription status to past_due
    // Stripe will automatically update subscription status
    // but we can proactively handle it here

    return {
      success: true,
      action: 'invoice_payment_failed',
      tenantId,
      details: {
        invoiceId: invoice.id,
        attemptCount: invoice.attempt_count,
        nextPaymentAttempt: (invoice as any).next_payment_attempt
          ? new Date((invoice as any).next_payment_attempt * 1000).toISOString()
          : null,
      },
    };
  }

  private async handleInvoiceFinalized(
    event: Stripe.Event,
    tenantId: string | null
  ): Promise<WebhookHandlerResult> {
    const invoice = event.data.object as Stripe.Invoice;

    return {
      success: true,
      action: 'invoice_finalized',
      tenantId: tenantId ?? undefined,
      details: {
        invoiceId: invoice.id,
        invoiceUrl: invoice.hosted_invoice_url,
        total: invoice.total,
      },
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private extractCustomerId(event: Stripe.Event): string | null {
    const obj = event.data.object as unknown as Record<string, unknown>;

    // Direct customer field
    if (typeof obj.customer === 'string') {
      return obj.customer;
    }

    // Customer object
    if (obj.customer && typeof obj.customer === 'object' && 'id' in (obj.customer as Record<string, unknown>)) {
      return (obj.customer as { id: string }).id;
    }

    return null;
  }

  private extractSubscriptionUpdate(
    subscription: Stripe.Subscription,
    tenantId: string
  ): SubscriptionStateUpdate {
    const sub = subscription as any; // Handle Stripe API version differences

    // Extract plan ID from metadata or price metadata
    let planId: PlanId = 'free';
    if (subscription.metadata?.planId) {
      planId = subscription.metadata.planId as PlanId;
    } else if (sub.items?.data?.[0]?.price?.metadata?.planId) {
      planId = sub.items.data[0].price.metadata.planId as PlanId;
    }

    // Map Stripe status to our status
    const status = this.mapSubscriptionStatus(subscription.status);

    return {
      tenantId,
      planId,
      status,
      externalSubscriptionId: subscription.id,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : undefined,
    };
  }

  private mapSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
    switch (status) {
      case 'active':
        return 'active';
      case 'trialing':
        return 'trialing';
      case 'past_due':
        return 'past_due';
      case 'canceled':
        return 'canceled';
      case 'unpaid':
        return 'past_due';
      case 'incomplete':
      case 'incomplete_expired':
        return 'expired';
      case 'paused':
        return 'paused';
      default:
        return 'expired';
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a Stripe webhook handler with dependencies
 */
export function createStripeWebhookHandler(deps: WebhookHandlerDeps): StripeWebhookHandler {
  return new StripeWebhookHandler(deps);
}

// =============================================================================
// Stub Implementation (for development without Stripe)
// =============================================================================

/**
 * Create stub dependencies for development/testing
 */
export function createStubWebhookDeps(): WebhookHandlerDeps {
  return {
    updateTenantSubscription: async (update) => {
      console.log('[Stub] updateTenantSubscription:', update);
    },
    resetTenantUsage: async (tenantId, resetType) => {
      console.log(`[Stub] resetTenantUsage: ${tenantId} (${resetType})`);
    },
    getTenantIdFromCustomer: async (customerId) => {
      console.log(`[Stub] getTenantIdFromCustomer: ${customerId}`);
      // In development, could return a test tenant ID
      return `tenant_${customerId.slice(-8)}`;
    },
    logWebhookEvent: async (eventId, eventType, tenantId, result) => {
      console.log('[Stub] logWebhookEvent:', { eventId, eventType, tenantId, result });
    },
  };
}
