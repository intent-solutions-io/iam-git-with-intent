/**
 * Stripe Payment Provider for Git With Intent
 *
 * Phase 15: Production payment processing via Stripe
 *
 * Implements PaymentProvider interface for:
 * - Customer management
 * - Subscription lifecycle
 * - Payment method handling
 * - Webhook verification
 *
 * @module @gwi/core/billing/stripe
 */

import Stripe from 'stripe';
import type {
  PaymentProvider,
  Invoice,
  BillingInterval,
} from './index.js';
import type { PlanId } from '../security/index.js';

/**
 * Stripe price IDs for each plan/interval combination
 * These should be created in Stripe Dashboard and stored in env vars
 */
interface StripePriceConfig {
  free: { monthly: string; yearly: string };
  pro: { monthly: string; yearly: string };
  enterprise: { monthly: string; yearly: string };
}

/**
 * Stripe provider configuration
 */
export interface StripeProviderConfig {
  /** Stripe secret key */
  secretKey: string;
  /** Webhook signing secret */
  webhookSecret: string;
  /** Price IDs for each plan */
  priceIds: StripePriceConfig;
  /** API version */
  apiVersion?: string;
}

/**
 * Get Stripe config from environment
 */
export function getStripeConfigFromEnv(): StripeProviderConfig {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY environment variable is required');
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET environment variable is required');
  }

  // Price IDs from environment (or defaults for testing)
  const priceIds: StripePriceConfig = {
    free: {
      monthly: process.env.STRIPE_PRICE_FREE_MONTHLY || 'price_free_monthly',
      yearly: process.env.STRIPE_PRICE_FREE_YEARLY || 'price_free_yearly',
    },
    pro: {
      monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || 'price_pro_monthly',
      yearly: process.env.STRIPE_PRICE_PRO_YEARLY || 'price_pro_yearly',
    },
    enterprise: {
      monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || 'price_enterprise_monthly',
      yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY || 'price_enterprise_yearly',
    },
  };

  return {
    secretKey,
    webhookSecret,
    priceIds,
  };
}

/**
 * Stripe Payment Provider Implementation
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';
  private stripe: Stripe;
  private config: StripeProviderConfig;

  constructor(config: StripeProviderConfig) {
    this.config = config;
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
      typescript: true,
    });
  }

  /**
   * Create a Stripe customer for a tenant
   */
  async createCustomer(tenantId: string, email: string, name?: string): Promise<string> {
    const customer = await this.stripe.customers.create({
      email,
      name,
      metadata: {
        tenantId,
        platform: 'git-with-intent',
      },
    });

    return customer.id;
  }

  /**
   * Get customer details
   */
  async getCustomer(externalCustomerId: string): Promise<{ id: string; email: string; name?: string } | null> {
    try {
      const customer = await this.stripe.customers.retrieve(externalCustomerId);

      if (customer.deleted) {
        return null;
      }

      return {
        id: customer.id,
        email: customer.email || '',
        name: customer.name || undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Update customer details
   */
  async updateCustomer(externalCustomerId: string, updates: { email?: string; name?: string }): Promise<void> {
    await this.stripe.customers.update(externalCustomerId, {
      email: updates.email,
      name: updates.name,
    });
  }

  /**
   * Create a subscription
   */
  async createSubscription(
    customerId: string,
    planId: PlanId,
    interval: BillingInterval,
    options?: {
      trialDays?: number;
      paymentMethodId?: string;
      couponCode?: string;
    }
  ): Promise<{ subscriptionId: string; clientSecret?: string }> {
    const priceId = this.getPriceId(planId, interval);

    // Build subscription params
    const params: Stripe.SubscriptionCreateParams = {
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        planId,
        interval,
        platform: 'git-with-intent',
      },
    };

    // Add trial if specified
    if (options?.trialDays && options.trialDays > 0) {
      params.trial_period_days = options.trialDays;
    }

    // Add payment method if specified
    if (options?.paymentMethodId) {
      params.default_payment_method = options.paymentMethodId;
    }

    // Add coupon if specified
    if (options?.couponCode) {
      params.discounts = [{ coupon: options.couponCode }];
    }

    const subscription = await this.stripe.subscriptions.create(params);

    // Get client secret for frontend to complete payment
    let clientSecret: string | undefined;
    const invoice = (subscription as any).latest_invoice;
    if (invoice && typeof invoice !== 'string') {
      const paymentIntent = invoice.payment_intent;
      if (paymentIntent && typeof paymentIntent !== 'string') {
        clientSecret = paymentIntent.client_secret || undefined;
      }
    }

    return {
      subscriptionId: subscription.id,
      clientSecret,
    };
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string, immediate?: boolean): Promise<void> {
    if (immediate) {
      await this.stripe.subscriptions.cancel(subscriptionId);
    } else {
      await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }
  }

  /**
   * Update subscription plan
   */
  async updateSubscription(subscriptionId: string, planId: PlanId): Promise<void> {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    const currentInterval = subscription.items.data[0]?.price.recurring?.interval;
    const interval: BillingInterval = currentInterval === 'year' ? 'yearly' : 'monthly';

    const newPriceId = this.getPriceId(planId, interval);

    await this.stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newPriceId,
        },
      ],
      proration_behavior: 'create_prorations',
      metadata: {
        planId,
      },
    });
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string): Promise<{
    id: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  } | null> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      const sub = subscription as any;

      return {
        id: sub.id,
        status: sub.status,
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      };
    } catch {
      return null;
    }
  }

  /**
   * Attach a payment method to a customer
   */
  async attachPaymentMethod(customerId: string, paymentMethodId: string): Promise<void> {
    await this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
  }

  /**
   * Detach a payment method
   */
  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    await this.stripe.paymentMethods.detach(paymentMethodId);
  }

  /**
   * Set default payment method for customer
   */
  async setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void> {
    await this.stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
  }

  /**
   * Get invoice details
   */
  async getInvoice(invoiceId: string): Promise<Invoice | null> {
    try {
      const stripeInvoice = await this.stripe.invoices.retrieve(invoiceId);
      return this.mapStripeInvoice(stripeInvoice);
    } catch {
      return null;
    }
  }

  /**
   * Pay an invoice
   */
  async payInvoice(invoiceId: string): Promise<boolean> {
    try {
      const invoice = await this.stripe.invoices.pay(invoiceId);
      return invoice.status === 'paid';
    } catch {
      return false;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      this.stripe.webhooks.constructEvent(payload, signature, this.config.webhookSecret);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse webhook event
   */
  parseWebhookEvent(payload: string, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, this.config.webhookSecret);
  }

  /**
   * Create a checkout session for new subscriptions
   */
  async createCheckoutSession(
    customerId: string,
    planId: PlanId,
    interval: BillingInterval,
    options: {
      successUrl: string;
      cancelUrl: string;
      trialDays?: number;
    }
  ): Promise<{ sessionId: string; url: string }> {
    const priceId = this.getPriceId(planId, interval);

    const params: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: options.successUrl,
      cancel_url: options.cancelUrl,
      metadata: {
        planId,
        interval,
        platform: 'git-with-intent',
      },
    };

    if (options.trialDays && options.trialDays > 0) {
      params.subscription_data = {
        trial_period_days: options.trialDays,
      };
    }

    const session = await this.stripe.checkout.sessions.create(params);

    return {
      sessionId: session.id,
      url: session.url || '',
    };
  }

  /**
   * Create a billing portal session
   */
  async createBillingPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  /**
   * List customer's payment methods
   */
  async listPaymentMethods(customerId: string): Promise<Array<{
    id: string;
    type: string;
    card?: {
      brand: string;
      last4: string;
      expMonth: number;
      expYear: number;
    };
  }>> {
    const methods = await this.stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });

    return methods.data.map((pm) => ({
      id: pm.id,
      type: pm.type,
      card: pm.card
        ? {
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year,
          }
        : undefined,
    }));
  }

  /**
   * Get price ID for plan/interval
   */
  private getPriceId(planId: PlanId, interval: BillingInterval): string {
    const intervalKey = interval === 'yearly' ? 'yearly' : 'monthly';
    return this.config.priceIds[planId][intervalKey];
  }

  /**
   * Map Stripe invoice to our Invoice type
   */
  private mapStripeInvoice(stripeInvoice: Stripe.Invoice): Invoice {
    const inv = stripeInvoice as any; // Use any to handle Stripe API version differences
    const subscription = inv.subscription;
    const subscriptionId = typeof subscription === 'string' ? subscription : subscription?.id || '';

    return {
      id: stripeInvoice.id,
      tenantId: (stripeInvoice.metadata?.tenantId as string) || '',
      subscriptionId,
      number: stripeInvoice.number || `INV-${stripeInvoice.id}`,
      status: this.mapInvoiceStatus(stripeInvoice.status),
      currency: stripeInvoice.currency.toUpperCase(),
      subtotalInCents: stripeInvoice.subtotal || 0,
      discountInCents: stripeInvoice.total_discount_amounts?.reduce((sum, d) => sum + d.amount, 0) || 0,
      taxInCents: inv.tax || 0,
      totalInCents: stripeInvoice.total || 0,
      amountPaidInCents: stripeInvoice.amount_paid || 0,
      amountRemainingInCents: stripeInvoice.amount_remaining || 0,
      lineItems: (stripeInvoice.lines?.data || []).map((line: any) => ({
        description: line.description || '',
        quantity: line.quantity || 1,
        unitPriceInCents: line.unit_amount || line.amount || 0,
        totalInCents: line.amount || 0,
        proration: line.proration || false,
      })),
      periodStart: new Date((stripeInvoice.period_start || Date.now() / 1000) * 1000),
      periodEnd: new Date((stripeInvoice.period_end || Date.now() / 1000) * 1000),
      issuedAt: new Date((stripeInvoice.created || Date.now() / 1000) * 1000),
      dueDate: new Date((stripeInvoice.due_date || stripeInvoice.created || Date.now() / 1000) * 1000),
      paidAt: stripeInvoice.status_transitions?.paid_at
        ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
        : undefined,
      externalId: stripeInvoice.id,
      hostedInvoiceUrl: stripeInvoice.hosted_invoice_url || undefined,
      invoicePdfUrl: stripeInvoice.invoice_pdf || undefined,
      createdAt: new Date((stripeInvoice.created || Date.now() / 1000) * 1000),
      updatedAt: new Date(),
    };
  }

  /**
   * Map Stripe invoice status to our status
   */
  private mapInvoiceStatus(status: Stripe.Invoice.Status | null): Invoice['status'] {
    switch (status) {
      case 'draft':
        return 'draft';
      case 'open':
        return 'open';
      case 'paid':
        return 'paid';
      case 'void':
        return 'void';
      case 'uncollectible':
        return 'uncollectible';
      default:
        return 'draft';
    }
  }
}

/**
 * Create Stripe provider from environment
 */
export function createStripeProvider(): StripePaymentProvider {
  const config = getStripeConfigFromEnv();
  return new StripePaymentProvider(config);
}

/**
 * Create Stripe provider with explicit config
 */
export function createStripeProviderWithConfig(config: StripeProviderConfig): StripePaymentProvider {
  return new StripePaymentProvider(config);
}
