/**
 * Billing Module for Git With Intent
 *
 * Phase 15: Launch Prep - Billing, payments, and usage tracking
 *
 * This module provides:
 * - Subscription management (plans, trials, upgrades/downgrades)
 * - Payment processing interfaces (Stripe-ready)
 * - Invoice and payment history
 * - Usage event tracking for metering
 * - Billing storage interface
 *
 * @module @gwi/core/billing
 */

import { PlanId, PlanConfig, getPlanConfig } from '../security/index.js';

// =============================================================================
// Subscription Types
// =============================================================================

/**
 * Subscription status
 */
export type SubscriptionStatus =
  | 'active'           // Currently active and paid
  | 'trialing'         // In free trial period
  | 'past_due'         // Payment failed, grace period
  | 'canceled'         // Canceled by user, access until period end
  | 'expired'          // Subscription has ended
  | 'paused';          // Temporarily paused (enterprise feature)

/**
 * Billing interval
 */
export type BillingInterval = 'monthly' | 'yearly';

/**
 * Subscription record for a tenant
 */
export interface Subscription {
  /** Unique subscription ID */
  id: string;

  /** Tenant this subscription belongs to */
  tenantId: string;

  /** Current plan */
  planId: PlanId;

  /** Subscription status */
  status: SubscriptionStatus;

  /** Billing interval */
  interval: BillingInterval;

  /** Price in cents (may differ from plan price for discounts) */
  priceInCents: number;

  /** Currency code (ISO 4217) */
  currency: string;

  /** Current billing period start */
  currentPeriodStart: Date;

  /** Current billing period end */
  currentPeriodEnd: Date;

  /** Trial end date (if applicable) */
  trialEnd?: Date;

  /** Whether subscription will cancel at period end */
  cancelAtPeriodEnd: boolean;

  /** When subscription was canceled (if applicable) */
  canceledAt?: Date;

  /** External payment provider subscription ID (e.g., Stripe sub_xxx) */
  externalId?: string;

  /** External payment provider customer ID */
  externalCustomerId?: string;

  /** Coupon/discount code applied */
  discountCode?: string;

  /** Discount percentage (0-100) */
  discountPercent?: number;

  /** Metadata for custom fields */
  metadata?: Record<string, string>;

  /** Created timestamp */
  createdAt: Date;

  /** Last updated timestamp */
  updatedAt: Date;
}

/**
 * Subscription creation parameters
 */
export interface CreateSubscriptionParams {
  tenantId: string;
  planId: PlanId;
  interval: BillingInterval;
  trialDays?: number;
  discountCode?: string;
  paymentMethodId?: string;
  externalCustomerId?: string;
}

/**
 * Subscription update parameters
 */
export interface UpdateSubscriptionParams {
  planId?: PlanId;
  interval?: BillingInterval;
  cancelAtPeriodEnd?: boolean;
  discountCode?: string;
}

// =============================================================================
// Payment Method Types
// =============================================================================

/**
 * Payment method type
 */
export type PaymentMethodType = 'card' | 'bank_account' | 'paypal';

/**
 * Payment method status
 */
export type PaymentMethodStatus = 'active' | 'expired' | 'failed';

/**
 * Payment method record
 */
export interface PaymentMethod {
  /** Unique payment method ID */
  id: string;

  /** Tenant this payment method belongs to */
  tenantId: string;

  /** Payment method type */
  type: PaymentMethodType;

  /** Status */
  status: PaymentMethodStatus;

  /** Whether this is the default payment method */
  isDefault: boolean;

  /** Card details (if type is 'card') */
  card?: {
    brand: string;         // visa, mastercard, amex, etc.
    last4: string;         // Last 4 digits
    expMonth: number;      // 1-12
    expYear: number;       // Full year (2025)
    funding: string;       // credit, debit, prepaid
  };

  /** Bank account details (if type is 'bank_account') */
  bankAccount?: {
    bankName: string;
    last4: string;
    accountType: 'checking' | 'savings';
  };

  /** External payment provider payment method ID */
  externalId?: string;

  /** Billing address */
  billingAddress?: BillingAddress;

  /** Created timestamp */
  createdAt: Date;

  /** Last updated timestamp */
  updatedAt: Date;
}

/**
 * Billing address
 */
export interface BillingAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string; // ISO 3166-1 alpha-2
}

// =============================================================================
// Invoice Types
// =============================================================================

/**
 * Invoice status
 */
export type InvoiceStatus =
  | 'draft'            // Being prepared
  | 'open'             // Awaiting payment
  | 'paid'             // Successfully paid
  | 'void'             // Voided/canceled
  | 'uncollectible';   // Payment failed permanently

/**
 * Invoice record
 */
export interface Invoice {
  /** Unique invoice ID */
  id: string;

  /** Tenant this invoice belongs to */
  tenantId: string;

  /** Subscription this invoice is for */
  subscriptionId: string;

  /** Invoice number (human readable, e.g., INV-2025-0001) */
  number: string;

  /** Invoice status */
  status: InvoiceStatus;

  /** Currency code */
  currency: string;

  /** Subtotal in cents (before tax/discounts) */
  subtotalInCents: number;

  /** Discount amount in cents */
  discountInCents: number;

  /** Tax amount in cents */
  taxInCents: number;

  /** Total amount in cents */
  totalInCents: number;

  /** Amount paid in cents */
  amountPaidInCents: number;

  /** Amount remaining in cents */
  amountRemainingInCents: number;

  /** Line items */
  lineItems: InvoiceLineItem[];

  /** Billing period start */
  periodStart: Date;

  /** Billing period end */
  periodEnd: Date;

  /** When invoice was issued */
  issuedAt: Date;

  /** Due date */
  dueDate: Date;

  /** When invoice was paid */
  paidAt?: Date;

  /** External payment provider invoice ID */
  externalId?: string;

  /** URL to hosted invoice page */
  hostedInvoiceUrl?: string;

  /** URL to download PDF */
  invoicePdfUrl?: string;

  /** Billing address snapshot */
  billingAddress?: BillingAddress;

  /** Created timestamp */
  createdAt: Date;

  /** Last updated timestamp */
  updatedAt: Date;
}

/**
 * Invoice line item
 */
export interface InvoiceLineItem {
  /** Description */
  description: string;

  /** Quantity */
  quantity: number;

  /** Unit price in cents */
  unitPriceInCents: number;

  /** Total in cents */
  totalInCents: number;

  /** Whether this is a proration */
  proration: boolean;

  /** Related plan ID */
  planId?: PlanId;

  /** Usage period for metered items */
  usagePeriod?: {
    start: Date;
    end: Date;
  };
}

// =============================================================================
// Usage Event Types
// =============================================================================

/**
 * Usage event type for metering
 */
export type UsageEventType =
  | 'run_started'          // Agent run started
  | 'run_completed'        // Agent run completed
  | 'run_failed'           // Agent run failed
  | 'tokens_used'          // LLM tokens consumed
  | 'api_call'             // API call made
  | 'storage_used';        // Storage bytes used

/**
 * Usage event for tracking billable usage
 */
export interface UsageEvent {
  /** Unique event ID */
  id: string;

  /** Tenant ID */
  tenantId: string;

  /** Event type */
  type: UsageEventType;

  /** Quantity (runs, tokens, bytes, etc.) */
  quantity: number;

  /** Unit of measurement */
  unit: string;

  /** Related resource ID (run ID, etc.) */
  resourceId?: string;

  /** Event timestamp */
  timestamp: Date;

  /** Billing period this event belongs to */
  billingPeriod: string; // YYYY-MM format

  /** Whether this event has been invoiced */
  invoiced: boolean;

  /** Invoice ID if invoiced */
  invoiceId?: string;

  /** Additional metadata */
  metadata?: Record<string, string | number>;
}

/**
 * Usage summary for a billing period
 */
export interface UsageSummary {
  tenantId: string;
  billingPeriod: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  totalTokens: number;
  totalApiCalls: number;
  totalStorageBytes: number;
  lastUpdated: Date;
}

// =============================================================================
// Billing Store Interface
// =============================================================================

/**
 * Billing store interface for persistence
 */
export interface BillingStore {
  // Subscription operations
  createSubscription(params: CreateSubscriptionParams): Promise<Subscription>;
  getSubscription(id: string): Promise<Subscription | null>;
  getSubscriptionByTenant(tenantId: string): Promise<Subscription | null>;
  updateSubscription(id: string, params: UpdateSubscriptionParams): Promise<Subscription>;
  cancelSubscription(id: string, immediate?: boolean): Promise<Subscription>;
  listSubscriptions(filter?: SubscriptionFilter): Promise<Subscription[]>;

  // Payment method operations
  addPaymentMethod(tenantId: string, method: Omit<PaymentMethod, 'id' | 'createdAt' | 'updatedAt'>): Promise<PaymentMethod>;
  getPaymentMethod(id: string): Promise<PaymentMethod | null>;
  getDefaultPaymentMethod(tenantId: string): Promise<PaymentMethod | null>;
  listPaymentMethods(tenantId: string): Promise<PaymentMethod[]>;
  setDefaultPaymentMethod(tenantId: string, paymentMethodId: string): Promise<void>;
  removePaymentMethod(id: string): Promise<void>;

  // Invoice operations
  createInvoice(invoice: Omit<Invoice, 'id' | 'number' | 'createdAt' | 'updatedAt'>): Promise<Invoice>;
  getInvoice(id: string): Promise<Invoice | null>;
  listInvoices(tenantId: string, filter?: InvoiceFilter): Promise<Invoice[]>;
  updateInvoiceStatus(id: string, status: InvoiceStatus, paidAt?: Date): Promise<Invoice>;

  // Usage event operations
  recordUsageEvent(event: Omit<UsageEvent, 'id'>): Promise<UsageEvent>;
  getUsageEvents(tenantId: string, billingPeriod: string): Promise<UsageEvent[]>;
  getUsageSummary(tenantId: string, billingPeriod: string): Promise<UsageSummary | null>;
  markEventsAsInvoiced(eventIds: string[], invoiceId: string): Promise<void>;
}

/**
 * Subscription filter options
 */
export interface SubscriptionFilter {
  status?: SubscriptionStatus;
  planId?: PlanId;
  limit?: number;
  offset?: number;
}

/**
 * Invoice filter options
 */
export interface InvoiceFilter {
  status?: InvoiceStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// =============================================================================
// Billing Helper Functions
// =============================================================================

/**
 * Calculate prorated amount for plan change
 */
export function calculateProration(
  currentPlan: PlanConfig,
  newPlan: PlanConfig,
  daysRemaining: number,
  totalDaysInPeriod: number,
  interval: BillingInterval
): {
  creditAmount: number;   // Credit for unused current plan
  chargeAmount: number;   // Charge for new plan (prorated)
  netAmount: number;      // Net charge (positive) or credit (negative)
} {
  const currentPrice = interval === 'yearly'
    ? currentPlan.priceMonthly * 10  // 2 months free for yearly
    : currentPlan.priceMonthly;

  const newPrice = interval === 'yearly'
    ? newPlan.priceMonthly * 10
    : newPlan.priceMonthly;

  const dailyCurrentRate = currentPrice / totalDaysInPeriod;
  const dailyNewRate = newPrice / totalDaysInPeriod;

  const creditAmount = Math.round(dailyCurrentRate * daysRemaining);
  const chargeAmount = Math.round(dailyNewRate * daysRemaining);
  const netAmount = chargeAmount - creditAmount;

  return {
    creditAmount,
    chargeAmount,
    netAmount,
  };
}

/**
 * Calculate yearly discount savings
 */
export function calculateYearlyDiscount(planId: PlanId): {
  monthlyTotal: number;
  yearlyTotal: number;
  savings: number;
  savingsPercent: number;
} {
  const config = getPlanConfig(planId);
  const monthlyTotal = config.priceMonthly * 12;
  const yearlyTotal = config.priceMonthly * 10; // 2 months free

  return {
    monthlyTotal,
    yearlyTotal,
    savings: monthlyTotal - yearlyTotal,
    savingsPercent: Math.round((2 / 12) * 100), // ~17%
  };
}

/**
 * Get current billing period (YYYY-MM format)
 */
export function getCurrentBillingPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Check if subscription is in grace period after payment failure
 */
export function isInGracePeriod(subscription: Subscription): boolean {
  if (subscription.status !== 'past_due') return false;

  const gracePeriodDays = 7;
  const gracePeriodEnd = new Date(subscription.currentPeriodEnd);
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);

  return new Date() < gracePeriodEnd;
}

/**
 * Check if subscription has active access (paid, trial, or grace period)
 */
export function hasActiveAccess(subscription: Subscription): boolean {
  if (subscription.status === 'active' || subscription.status === 'trialing') {
    return true;
  }

  if (subscription.status === 'past_due' && isInGracePeriod(subscription)) {
    return true;
  }

  if (subscription.status === 'canceled') {
    // Still has access until period end
    return new Date() < subscription.currentPeriodEnd;
  }

  return false;
}

/**
 * Generate invoice number
 */
export function generateInvoiceNumber(_tenantId: string, sequence: number): string {
  const year = new Date().getFullYear();
  const seq = String(sequence).padStart(4, '0');
  return `INV-${year}-${seq}`;
}

/**
 * Format amount in cents to display string
 */
export function formatAmount(cents: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

// =============================================================================
// Webhook Event Types (for Stripe/payment provider integration)
// =============================================================================

/**
 * Billing webhook event types
 */
export type BillingWebhookEvent =
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.deleted'
  | 'subscription.trial_will_end'
  | 'invoice.created'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'invoice.finalized'
  | 'payment_method.attached'
  | 'payment_method.detached'
  | 'payment_method.updated'
  | 'customer.created'
  | 'customer.updated';

/**
 * Webhook event payload
 */
export interface BillingWebhookPayload {
  id: string;
  type: BillingWebhookEvent;
  data: {
    object: Record<string, unknown>;
    previousAttributes?: Record<string, unknown>;
  };
  created: number;  // Unix timestamp
  livemode: boolean;
}

/**
 * Webhook handler interface
 */
export interface BillingWebhookHandler {
  handleWebhook(payload: BillingWebhookPayload): Promise<void>;
}

// =============================================================================
// Payment Provider Interface (for Stripe/Paddle abstraction)
// =============================================================================

/**
 * Payment provider interface for abstraction over Stripe/Paddle/etc.
 */
export interface PaymentProvider {
  /** Provider name */
  readonly name: string;

  // Customer operations
  createCustomer(tenantId: string, email: string, name?: string): Promise<string>; // Returns external customer ID
  getCustomer(externalCustomerId: string): Promise<{ id: string; email: string; name?: string } | null>;
  updateCustomer(externalCustomerId: string, updates: { email?: string; name?: string }): Promise<void>;

  // Subscription operations
  createSubscription(
    customerId: string,
    planId: PlanId,
    interval: BillingInterval,
    options?: {
      trialDays?: number;
      paymentMethodId?: string;
      couponCode?: string;
    }
  ): Promise<{ subscriptionId: string; clientSecret?: string }>;
  cancelSubscription(subscriptionId: string, immediate?: boolean): Promise<void>;
  updateSubscription(subscriptionId: string, planId: PlanId): Promise<void>;
  getSubscription(subscriptionId: string): Promise<{
    id: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  } | null>;

  // Payment method operations
  attachPaymentMethod(customerId: string, paymentMethodId: string): Promise<void>;
  detachPaymentMethod(paymentMethodId: string): Promise<void>;
  setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void>;

  // Invoice operations
  getInvoice(invoiceId: string): Promise<Invoice | null>;
  payInvoice(invoiceId: string): Promise<boolean>;

  // Webhook signature verification
  verifyWebhookSignature(payload: string, signature: string): boolean;
}

// =============================================================================
// In-Memory Billing Store (for development/testing)
// =============================================================================

/**
 * In-memory billing store implementation for development/testing
 */
export class InMemoryBillingStore implements BillingStore {
  private subscriptions = new Map<string, Subscription>();
  private paymentMethods = new Map<string, PaymentMethod>();
  private invoices = new Map<string, Invoice>();
  private usageEvents = new Map<string, UsageEvent>();
  private invoiceSequence = 1;

  async createSubscription(params: CreateSubscriptionParams): Promise<Subscription> {
    const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + (params.interval === 'yearly' ? 12 : 1));

    const config = getPlanConfig(params.planId);
    const price = params.interval === 'yearly'
      ? config.priceMonthly * 10
      : config.priceMonthly;

    const subscription: Subscription = {
      id,
      tenantId: params.tenantId,
      planId: params.planId,
      status: params.trialDays ? 'trialing' : 'active',
      interval: params.interval,
      priceInCents: price,
      currency: 'USD',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      trialEnd: params.trialDays
        ? new Date(now.getTime() + params.trialDays * 24 * 60 * 60 * 1000)
        : undefined,
      cancelAtPeriodEnd: false,
      discountCode: params.discountCode,
      externalCustomerId: params.externalCustomerId,
      createdAt: now,
      updatedAt: now,
    };

    this.subscriptions.set(id, subscription);
    return subscription;
  }

  async getSubscription(id: string): Promise<Subscription | null> {
    return this.subscriptions.get(id) ?? null;
  }

  async getSubscriptionByTenant(tenantId: string): Promise<Subscription | null> {
    for (const sub of this.subscriptions.values()) {
      if (sub.tenantId === tenantId) return sub;
    }
    return null;
  }

  async updateSubscription(id: string, params: UpdateSubscriptionParams): Promise<Subscription> {
    const sub = this.subscriptions.get(id);
    if (!sub) throw new Error(`Subscription ${id} not found`);

    if (params.planId) {
      sub.planId = params.planId;
      const config = getPlanConfig(params.planId);
      sub.priceInCents = sub.interval === 'yearly'
        ? config.priceMonthly * 10
        : config.priceMonthly;
    }
    if (params.interval) sub.interval = params.interval;
    if (params.cancelAtPeriodEnd !== undefined) sub.cancelAtPeriodEnd = params.cancelAtPeriodEnd;
    if (params.discountCode) sub.discountCode = params.discountCode;
    sub.updatedAt = new Date();

    this.subscriptions.set(id, sub);
    return sub;
  }

  async cancelSubscription(id: string, immediate?: boolean): Promise<Subscription> {
    const sub = this.subscriptions.get(id);
    if (!sub) throw new Error(`Subscription ${id} not found`);

    sub.canceledAt = new Date();
    if (immediate) {
      sub.status = 'canceled';
    } else {
      sub.cancelAtPeriodEnd = true;
    }
    sub.updatedAt = new Date();

    this.subscriptions.set(id, sub);
    return sub;
  }

  async listSubscriptions(filter?: SubscriptionFilter): Promise<Subscription[]> {
    let subs = Array.from(this.subscriptions.values());

    if (filter?.status) {
      subs = subs.filter(s => s.status === filter.status);
    }
    if (filter?.planId) {
      subs = subs.filter(s => s.planId === filter.planId);
    }

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 100;
    return subs.slice(offset, offset + limit);
  }

  async addPaymentMethod(
    tenantId: string,
    method: Omit<PaymentMethod, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<PaymentMethod> {
    const id = `pm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    const paymentMethod: PaymentMethod = {
      ...method,
      id,
      tenantId,
      createdAt: now,
      updatedAt: now,
    };

    this.paymentMethods.set(id, paymentMethod);
    return paymentMethod;
  }

  async getPaymentMethod(id: string): Promise<PaymentMethod | null> {
    return this.paymentMethods.get(id) ?? null;
  }

  async getDefaultPaymentMethod(tenantId: string): Promise<PaymentMethod | null> {
    for (const pm of this.paymentMethods.values()) {
      if (pm.tenantId === tenantId && pm.isDefault) return pm;
    }
    return null;
  }

  async listPaymentMethods(tenantId: string): Promise<PaymentMethod[]> {
    return Array.from(this.paymentMethods.values())
      .filter(pm => pm.tenantId === tenantId);
  }

  async setDefaultPaymentMethod(tenantId: string, paymentMethodId: string): Promise<void> {
    for (const pm of this.paymentMethods.values()) {
      if (pm.tenantId === tenantId) {
        pm.isDefault = pm.id === paymentMethodId;
        pm.updatedAt = new Date();
      }
    }
  }

  async removePaymentMethod(id: string): Promise<void> {
    this.paymentMethods.delete(id);
  }

  async createInvoice(
    invoice: Omit<Invoice, 'id' | 'number' | 'createdAt' | 'updatedAt'>
  ): Promise<Invoice> {
    const id = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const number = generateInvoiceNumber(invoice.tenantId, this.invoiceSequence++);

    const newInvoice: Invoice = {
      ...invoice,
      id,
      number,
      createdAt: now,
      updatedAt: now,
    };

    this.invoices.set(id, newInvoice);
    return newInvoice;
  }

  async getInvoice(id: string): Promise<Invoice | null> {
    return this.invoices.get(id) ?? null;
  }

  async listInvoices(tenantId: string, filter?: InvoiceFilter): Promise<Invoice[]> {
    let invs = Array.from(this.invoices.values())
      .filter(i => i.tenantId === tenantId);

    if (filter?.status) {
      invs = invs.filter(i => i.status === filter.status);
    }
    if (filter?.startDate) {
      invs = invs.filter(i => i.issuedAt >= filter.startDate!);
    }
    if (filter?.endDate) {
      invs = invs.filter(i => i.issuedAt <= filter.endDate!);
    }

    invs.sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 100;
    return invs.slice(offset, offset + limit);
  }

  async updateInvoiceStatus(id: string, status: InvoiceStatus, paidAt?: Date): Promise<Invoice> {
    const inv = this.invoices.get(id);
    if (!inv) throw new Error(`Invoice ${id} not found`);

    inv.status = status;
    if (paidAt) inv.paidAt = paidAt;
    if (status === 'paid') {
      inv.amountPaidInCents = inv.totalInCents;
      inv.amountRemainingInCents = 0;
    }
    inv.updatedAt = new Date();

    this.invoices.set(id, inv);
    return inv;
  }

  async recordUsageEvent(event: Omit<UsageEvent, 'id'>): Promise<UsageEvent> {
    const id = `ue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const usageEvent: UsageEvent = {
      ...event,
      id,
    };

    this.usageEvents.set(id, usageEvent);
    return usageEvent;
  }

  async getUsageEvents(tenantId: string, billingPeriod: string): Promise<UsageEvent[]> {
    return Array.from(this.usageEvents.values())
      .filter(e => e.tenantId === tenantId && e.billingPeriod === billingPeriod);
  }

  async getUsageSummary(tenantId: string, billingPeriod: string): Promise<UsageSummary | null> {
    const events = await this.getUsageEvents(tenantId, billingPeriod);
    if (events.length === 0) return null;

    const summary: UsageSummary = {
      tenantId,
      billingPeriod,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      totalTokens: 0,
      totalApiCalls: 0,
      totalStorageBytes: 0,
      lastUpdated: new Date(),
    };

    for (const event of events) {
      switch (event.type) {
        case 'run_started':
          summary.totalRuns += event.quantity;
          break;
        case 'run_completed':
          summary.successfulRuns += event.quantity;
          break;
        case 'run_failed':
          summary.failedRuns += event.quantity;
          break;
        case 'tokens_used':
          summary.totalTokens += event.quantity;
          break;
        case 'api_call':
          summary.totalApiCalls += event.quantity;
          break;
        case 'storage_used':
          summary.totalStorageBytes += event.quantity;
          break;
      }
    }

    return summary;
  }

  async markEventsAsInvoiced(eventIds: string[], invoiceId: string): Promise<void> {
    for (const id of eventIds) {
      const event = this.usageEvents.get(id);
      if (event) {
        event.invoiced = true;
        event.invoiceId = invoiceId;
      }
    }
  }
}

// =============================================================================
// Singleton Billing Store
// =============================================================================

let billingStore: BillingStore | null = null;

/**
 * Get the billing store singleton
 */
export function getBillingStore(): BillingStore {
  if (!billingStore) {
    // Default to in-memory for development
    billingStore = new InMemoryBillingStore();
  }
  return billingStore;
}

/**
 * Set a custom billing store (for Firestore, etc.)
 */
export function setBillingStore(store: BillingStore): void {
  billingStore = store;
}

// =============================================================================
// Stripe Provider Export
// =============================================================================

export {
  StripePaymentProvider,
  createStripeProvider,
  createStripeProviderWithConfig,
  getStripeConfigFromEnv,
  type StripeProviderConfig,
} from './stripe.js';
