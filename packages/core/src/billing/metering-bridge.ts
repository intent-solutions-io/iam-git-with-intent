/**
 * Phase 28: Billing-Metering Bridge
 *
 * Connects Stripe subscription events to the MeteringService
 * for plan limit synchronization.
 *
 * @module @gwi/core/billing/metering-bridge
 */

import type { WebhookHandlerDeps, SubscriptionStateUpdate } from './stripe-webhooks.js';
import { MeteringService, getMeteringService, isMeteringEnabled } from '../metering/index.js';
import { createLogger } from '../telemetry/index.js';

const logger = createLogger('billing:metering-bridge');

// =============================================================================
// Types
// =============================================================================

/**
 * Billing state stored per tenant
 */
export interface TenantBillingState {
  tenantId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  planId: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'paused';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date;
  updatedAt: Date;
}

/**
 * Billing state storage interface
 */
export interface BillingStateStorage {
  getTenantBillingState(tenantId: string): Promise<TenantBillingState | null>;
  setTenantBillingState(state: TenantBillingState): Promise<void>;
  getTenantIdByStripeCustomer(customerId: string): Promise<string | null>;
  setStripeCustomerMapping(customerId: string, tenantId: string): Promise<void>;
}

/**
 * Webhook event log entry
 */
export interface WebhookEventLog {
  eventId: string;
  eventType: string;
  tenantId: string | null;
  success: boolean;
  action: string;
  error?: string;
  timestamp: Date;
}

// =============================================================================
// In-Memory Storage (Development)
// =============================================================================

/**
 * In-memory billing state storage for development/testing
 */
export class InMemoryBillingStateStorage implements BillingStateStorage {
  private billingStates = new Map<string, TenantBillingState>();
  private customerToTenant = new Map<string, string>();
  private webhookLogs: WebhookEventLog[] = [];

  async getTenantBillingState(tenantId: string): Promise<TenantBillingState | null> {
    return this.billingStates.get(tenantId) || null;
  }

  async setTenantBillingState(state: TenantBillingState): Promise<void> {
    this.billingStates.set(state.tenantId, state);
  }

  async getTenantIdByStripeCustomer(customerId: string): Promise<string | null> {
    return this.customerToTenant.get(customerId) || null;
  }

  async setStripeCustomerMapping(customerId: string, tenantId: string): Promise<void> {
    this.customerToTenant.set(customerId, tenantId);
  }

  // Test helpers
  getAllBillingStates(): TenantBillingState[] {
    return Array.from(this.billingStates.values());
  }

  getWebhookLogs(): WebhookEventLog[] {
    return [...this.webhookLogs];
  }

  logWebhookEvent(log: WebhookEventLog): void {
    this.webhookLogs.push(log);
  }

  clear(): void {
    this.billingStates.clear();
    this.customerToTenant.clear();
    this.webhookLogs = [];
  }
}

// =============================================================================
// Metering Bridge
// =============================================================================

/**
 * Bridge that connects Stripe webhooks to metering service
 */
export class MeteringBridge {
  private storage: BillingStateStorage;
  private meteringService: MeteringService;

  constructor(storage: BillingStateStorage, meteringService?: MeteringService) {
    this.storage = storage;
    this.meteringService = meteringService || getMeteringService();
  }

  /**
   * Create webhook handler dependencies that sync to metering
   */
  createWebhookDeps(): WebhookHandlerDeps {
    return {
      updateTenantSubscription: async (update: SubscriptionStateUpdate) => {
        await this.syncSubscriptionToMeteringPlan(update);
      },

      resetTenantUsage: async (tenantId: string, resetType: 'monthly') => {
        // In metering, usage is computed from events - no explicit reset needed
        // The aggregate is recomputed for each new billing period
        if (isMeteringEnabled()) {
          logger.debug('Usage reset triggered', { tenantId, resetType });
        }
      },

      getTenantIdFromCustomer: async (customerId: string) => {
        return this.storage.getTenantIdByStripeCustomer(customerId);
      },

      logWebhookEvent: async (eventId, eventType, tenantId, result) => {
        const log: WebhookEventLog = {
          eventId,
          eventType,
          tenantId,
          success: result.success,
          action: result.action,
          error: result.error,
          timestamp: new Date(),
        };

        // If storage supports logging, use it
        if ('logWebhookEvent' in this.storage) {
          (this.storage as InMemoryBillingStateStorage).logWebhookEvent(log);
        }

        logger.info('Webhook processed', { eventType, action: result.action, tenantId: tenantId || 'unknown' });
      },
    };
  }

  /**
   * Sync Stripe subscription state to metering plan limits
   */
  async syncSubscriptionToMeteringPlan(update: SubscriptionStateUpdate): Promise<void> {
    // Store billing state
    const billingState: TenantBillingState = {
      tenantId: update.tenantId,
      stripeSubscriptionId: update.externalSubscriptionId,
      planId: update.planId,
      status: update.status,
      currentPeriodStart: update.currentPeriodStart,
      currentPeriodEnd: update.currentPeriodEnd,
      cancelAtPeriodEnd: update.cancelAtPeriodEnd,
      trialEnd: update.trialEnd,
      updatedAt: new Date(),
    };

    await this.storage.setTenantBillingState(billingState);

    // Sync to metering service
    if (isMeteringEnabled()) {
      // Map PlanId to metering plan ID
      // The plan IDs should match between billing and metering
      const meteringPlanId = this.mapPlanIdToMeteringPlan(update.planId);
      this.meteringService.setTenantPlan(update.tenantId, meteringPlanId);

      logger.info('Synced tenant to plan', { tenantId: update.tenantId, meteringPlanId });
    }
  }

  /**
   * Link a Stripe customer to a tenant
   */
  async linkStripeCustomer(customerId: string, tenantId: string): Promise<void> {
    await this.storage.setStripeCustomerMapping(customerId, tenantId);

    // Update billing state with customer ID
    const existing = await this.storage.getTenantBillingState(tenantId);
    if (existing) {
      existing.stripeCustomerId = customerId;
      existing.updatedAt = new Date();
      await this.storage.setTenantBillingState(existing);
    }
  }

  /**
   * Get tenant's billing state
   */
  async getTenantBillingState(tenantId: string): Promise<TenantBillingState | null> {
    return this.storage.getTenantBillingState(tenantId);
  }

  /**
   * Check if tenant has active subscription
   */
  async hasActiveSubscription(tenantId: string): Promise<boolean> {
    const state = await this.storage.getTenantBillingState(tenantId);
    if (!state) return false;

    return state.status === 'active' || state.status === 'trialing';
  }

  /**
   * Map billing plan ID to metering plan ID
   * Handles any differences in naming conventions
   */
  private mapPlanIdToMeteringPlan(planId: string): string {
    // Mapping from security/PlanId to metering plan IDs
    const planMapping: Record<string, string> = {
      'free': 'free',
      'pro': 'professional',
      'enterprise': 'enterprise',
      // Direct mappings for metering plan IDs
      'starter': 'starter',
      'professional': 'professional',
    };

    return planMapping[planId] || 'free';
  }
}

// =============================================================================
// Singleton
// =============================================================================

let defaultBridge: MeteringBridge | null = null;
let defaultStorage: BillingStateStorage | null = null;

/**
 * Get or create the default metering bridge
 */
export function getMeteringBridge(): MeteringBridge {
  if (!defaultBridge) {
    defaultBridge = new MeteringBridge(getBillingStateStorage());
  }
  return defaultBridge;
}

/**
 * Get or create the default billing state storage
 */
export function getBillingStateStorage(): BillingStateStorage {
  if (!defaultStorage) {
    defaultStorage = new InMemoryBillingStateStorage();
  }
  return defaultStorage;
}

/**
 * Set a custom billing state storage
 */
export function setBillingStateStorage(storage: BillingStateStorage): void {
  defaultStorage = storage;
  // Reset bridge to use new storage
  defaultBridge = null;
}

/**
 * Reset for testing
 */
export function resetMeteringBridge(): void {
  defaultBridge = null;
  defaultStorage = null;
}
