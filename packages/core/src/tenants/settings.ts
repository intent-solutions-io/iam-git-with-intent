/**
 * Tenant Settings Management Service
 *
 * Epic E: RBAC & Governance
 *
 * Provides tenant settings management including:
 * - Get/update tenant settings
 * - Settings validation with Zod schemas
 * - Default settings management
 * - Notification preferences
 * - Webhook configuration
 * - Data retention policies
 *
 * @module @gwi/core/tenants/settings
 */

import { z } from 'zod';
import type { TenantStore, TenantSettings, RiskMode, AuditStore } from '../storage/interfaces.js';
import { createLogger } from '../telemetry/index.js';

// =============================================================================
// Settings Schemas
// =============================================================================

/**
 * Risk mode schema
 */
const RiskModeSchema = z.enum(['comment_only', 'suggest_patch', 'auto_patch', 'auto_push']);

/**
 * Core tenant settings schema
 */
export const TenantSettingsSchema = z.object({
  defaultRiskMode: RiskModeSchema,
  defaultTriageModel: z.string().min(1),
  defaultCodeModel: z.string().min(1),
  complexityThreshold: z.number().int().min(1).max(5),
  autoRunOnConflict: z.boolean(),
  autoRunOnPrOpen: z.boolean(),
});

/**
 * Extended tenant settings with preferences
 */
export const ExtendedTenantSettingsSchema = TenantSettingsSchema.extend({
  notifications: z.object({
    email: z.object({
      enabled: z.boolean(),
      runCompleted: z.boolean(),
      runFailed: z.boolean(),
      approvalRequired: z.boolean(),
      weeklyDigest: z.boolean(),
    }),
    slack: z.object({
      enabled: z.boolean(),
      webhookUrl: z.string().url().optional(),
      runCompleted: z.boolean(),
      runFailed: z.boolean(),
      approvalRequired: z.boolean(),
    }),
  }).optional(),
  webhooks: z.object({
    onRunComplete: z.string().url().optional(),
    onRunFailed: z.string().url().optional(),
    onApprovalRequired: z.string().url().optional(),
    secret: z.string().optional(),
  }).optional(),
  dataRetention: z.object({
    runArtifactsDays: z.number().int().min(7).max(365),
    auditLogsDays: z.number().int().min(30).max(730),
    completedRunsDays: z.number().int().min(30).max(365),
  }).optional(),
});

export type ExtendedTenantSettings = z.infer<typeof ExtendedTenantSettingsSchema>;

/**
 * Partial settings update schema (all fields optional)
 */
export const UpdateTenantSettingsSchema = TenantSettingsSchema.partial();

export type UpdateTenantSettingsParams = z.infer<typeof UpdateTenantSettingsSchema>;

// =============================================================================
// Default Settings
// =============================================================================

/**
 * Default tenant settings by plan tier
 */
export const DEFAULT_SETTINGS: Record<string, ExtendedTenantSettings> = {
  free: {
    defaultRiskMode: 'comment_only',
    defaultTriageModel: 'gemini-flash',
    defaultCodeModel: 'claude-sonnet',
    complexityThreshold: 3,
    autoRunOnConflict: false,
    autoRunOnPrOpen: false,
    notifications: {
      email: {
        enabled: true,
        runCompleted: true,
        runFailed: true,
        approvalRequired: true,
        weeklyDigest: false,
      },
      slack: {
        enabled: false,
        runCompleted: false,
        runFailed: false,
        approvalRequired: false,
      },
    },
    dataRetention: {
      runArtifactsDays: 30,
      auditLogsDays: 90,
      completedRunsDays: 60,
    },
  },
  team: {
    defaultRiskMode: 'suggest_patch',
    defaultTriageModel: 'gemini-flash',
    defaultCodeModel: 'claude-sonnet',
    complexityThreshold: 3,
    autoRunOnConflict: true,
    autoRunOnPrOpen: false,
    notifications: {
      email: {
        enabled: true,
        runCompleted: true,
        runFailed: true,
        approvalRequired: true,
        weeklyDigest: true,
      },
      slack: {
        enabled: false,
        runCompleted: true,
        runFailed: true,
        approvalRequired: true,
      },
    },
    dataRetention: {
      runArtifactsDays: 90,
      auditLogsDays: 180,
      completedRunsDays: 90,
    },
  },
  pro: {
    defaultRiskMode: 'auto_patch',
    defaultTriageModel: 'gemini-flash',
    defaultCodeModel: 'claude-sonnet',
    complexityThreshold: 4,
    autoRunOnConflict: true,
    autoRunOnPrOpen: true,
    notifications: {
      email: {
        enabled: true,
        runCompleted: true,
        runFailed: true,
        approvalRequired: true,
        weeklyDigest: true,
      },
      slack: {
        enabled: false,
        runCompleted: true,
        runFailed: true,
        approvalRequired: true,
      },
    },
    dataRetention: {
      runArtifactsDays: 180,
      auditLogsDays: 365,
      completedRunsDays: 180,
    },
  },
  enterprise: {
    defaultRiskMode: 'auto_patch',
    defaultTriageModel: 'gemini-flash',
    defaultCodeModel: 'claude-opus',
    complexityThreshold: 5,
    autoRunOnConflict: true,
    autoRunOnPrOpen: true,
    notifications: {
      email: {
        enabled: true,
        runCompleted: true,
        runFailed: true,
        approvalRequired: true,
        weeklyDigest: true,
      },
      slack: {
        enabled: false,
        runCompleted: true,
        runFailed: true,
        approvalRequired: true,
      },
    },
    dataRetention: {
      runArtifactsDays: 365,
      auditLogsDays: 730,
      completedRunsDays: 365,
    },
  },
};

/**
 * Get default settings for a plan tier
 */
export function getDefaultSettings(plan: string): ExtendedTenantSettings {
  return DEFAULT_SETTINGS[plan] || DEFAULT_SETTINGS.free;
}

// =============================================================================
// Tenant Settings Service
// =============================================================================

const logger = createLogger('tenant-settings');

/**
 * Configuration for tenant settings service
 */
export interface TenantSettingsConfig {
  /** Enable audit event creation */
  enableAudit?: boolean;
  /** Validate webhook URLs on update */
  validateWebhooks?: boolean;
}

/**
 * Tenant settings service for managing tenant configuration
 */
export class TenantSettingsService {
  private tenantStore: TenantStore;
  private auditStore?: AuditStore;
  private config: TenantSettingsConfig;

  constructor(
    tenantStore: TenantStore,
    auditStore?: AuditStore,
    config: TenantSettingsConfig = {}
  ) {
    this.tenantStore = tenantStore;
    this.auditStore = auditStore;
    this.config = {
      enableAudit: config.enableAudit ?? true,
      validateWebhooks: config.validateWebhooks ?? false,
    };
  }

  /**
   * Get tenant settings
   */
  async getTenantSettings(tenantId: string): Promise<ExtendedTenantSettings> {
    const tenant = await this.getTenantOrThrow(tenantId);

    logger.debug('Getting tenant settings', {
      eventName: 'settings.get',
      tenantId,
    });

    // Merge with extended default settings based on plan
    const defaults = getDefaultSettings(tenant.plan);
    const extended: ExtendedTenantSettings = {
      ...defaults,
      ...tenant.settings,
    };

    return extended;
  }

  /**
   * Update tenant settings
   */
  async updateTenantSettings(
    tenantId: string,
    updates: UpdateTenantSettingsParams,
    updatedBy: string
  ): Promise<TenantSettings> {
    const validated = UpdateTenantSettingsSchema.parse(updates);
    const tenant = await this.getTenantOrThrow(tenantId);

    logger.info('Updating tenant settings', {
      eventName: 'settings.update.start',
      tenantId,
      updatedFields: Object.keys(validated),
    });

    // Merge with existing settings
    const updatedSettings: TenantSettings = {
      ...tenant.settings,
      ...validated,
    };

    // Validate complete settings
    TenantSettingsSchema.parse(updatedSettings);

    // Update tenant
    const updated = await this.tenantStore.updateTenant(tenantId, {
      settings: updatedSettings,
      updatedAt: new Date(),
    });

    // Create audit event
    if (this.config.enableAudit && this.auditStore) {
      await this.createAuditEvent(tenantId, 'settings_updated', {
        updatedBy,
        changes: validated,
        previousSettings: tenant.settings,
      });
    }

    logger.info('Tenant settings updated successfully', {
      eventName: 'settings.update.success',
      tenantId,
    });

    return updated.settings;
  }

  /**
   * Update extended settings (notifications, webhooks, retention)
   */
  async updateExtendedSettings(
    tenantId: string,
    updates: Partial<ExtendedTenantSettings>,
    updatedBy: string
  ): Promise<ExtendedTenantSettings> {
    const tenant = await this.getTenantOrThrow(tenantId);
    const current = await this.getTenantSettings(tenantId);

    logger.info('Updating extended tenant settings', {
      eventName: 'settings.extended.update.start',
      tenantId,
      updatedFields: Object.keys(updates),
    });

    // Validate webhook URLs if provided
    if (this.config.validateWebhooks && updates.webhooks) {
      await this.validateWebhookUrls(updates.webhooks);
    }

    // Merge updates
    const updatedExtended: ExtendedTenantSettings = {
      ...current,
      ...updates,
      notifications: updates.notifications
        ? { ...current.notifications, ...updates.notifications }
        : current.notifications,
      webhooks: updates.webhooks
        ? { ...current.webhooks, ...updates.webhooks }
        : current.webhooks,
      dataRetention: updates.dataRetention
        ? { ...current.dataRetention, ...updates.dataRetention }
        : current.dataRetention,
    };

    // Validate complete extended settings
    ExtendedTenantSettingsSchema.parse(updatedExtended);

    // Extract core settings for storage
    const coreSettings: TenantSettings = {
      defaultRiskMode: updatedExtended.defaultRiskMode,
      defaultTriageModel: updatedExtended.defaultTriageModel,
      defaultCodeModel: updatedExtended.defaultCodeModel,
      complexityThreshold: updatedExtended.complexityThreshold,
      autoRunOnConflict: updatedExtended.autoRunOnConflict,
      autoRunOnPrOpen: updatedExtended.autoRunOnPrOpen,
    };

    // Update tenant
    await this.tenantStore.updateTenant(tenantId, {
      settings: coreSettings,
      updatedAt: new Date(),
    });

    // Create audit event
    if (this.config.enableAudit && this.auditStore) {
      await this.createAuditEvent(tenantId, 'settings_extended_updated', {
        updatedBy,
        changes: updates,
      });
    }

    logger.info('Extended tenant settings updated successfully', {
      eventName: 'settings.extended.update.success',
      tenantId,
    });

    return updatedExtended;
  }

  /**
   * Reset tenant settings to defaults (based on current plan)
   */
  async resetTenantSettings(tenantId: string, resetBy: string): Promise<TenantSettings> {
    const tenant = await this.getTenantOrThrow(tenantId);

    logger.info('Resetting tenant settings to defaults', {
      eventName: 'settings.reset.start',
      tenantId,
      plan: tenant.plan,
    });

    const defaults = getDefaultSettings(tenant.plan);
    const defaultSettings: TenantSettings = {
      defaultRiskMode: defaults.defaultRiskMode,
      defaultTriageModel: defaults.defaultTriageModel,
      defaultCodeModel: defaults.defaultCodeModel,
      complexityThreshold: defaults.complexityThreshold,
      autoRunOnConflict: defaults.autoRunOnConflict,
      autoRunOnPrOpen: defaults.autoRunOnPrOpen,
    };

    // Update tenant
    const updated = await this.tenantStore.updateTenant(tenantId, {
      settings: defaultSettings,
      updatedAt: new Date(),
    });

    // Create audit event
    if (this.config.enableAudit && this.auditStore) {
      await this.createAuditEvent(tenantId, 'settings_reset', {
        resetBy,
        previousSettings: tenant.settings,
        plan: tenant.plan,
      });
    }

    logger.info('Tenant settings reset successfully', {
      eventName: 'settings.reset.success',
      tenantId,
    });

    return updated.settings;
  }

  /**
   * Get notification preferences
   */
  async getNotificationPreferences(tenantId: string): Promise<NonNullable<ExtendedTenantSettings['notifications']>> {
    const settings = await this.getTenantSettings(tenantId);
    return settings.notifications || getDefaultSettings('free').notifications!;
  }

  /**
   * Get webhook configuration
   */
  async getWebhookConfig(tenantId: string): Promise<NonNullable<ExtendedTenantSettings['webhooks']>> {
    const settings = await this.getTenantSettings(tenantId);
    return settings.webhooks || {};
  }

  /**
   * Get data retention policies
   */
  async getDataRetentionPolicies(tenantId: string): Promise<NonNullable<ExtendedTenantSettings['dataRetention']>> {
    const settings = await this.getTenantSettings(tenantId);
    return settings.dataRetention || getDefaultSettings('free').dataRetention!;
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Get tenant or throw error if not found
   */
  private async getTenantOrThrow(tenantId: string) {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }
    return tenant;
  }

  /**
   * Validate webhook URLs are reachable
   */
  private async validateWebhookUrls(
    webhooks: Partial<NonNullable<ExtendedTenantSettings['webhooks']>>
  ): Promise<void> {
    const urls = [
      webhooks.onRunComplete,
      webhooks.onRunFailed,
      webhooks.onApprovalRequired,
    ].filter(Boolean) as string[];

    for (const url of urls) {
      try {
        new URL(url); // Validate URL format
      } catch {
        throw new Error(`Invalid webhook URL: ${url}`);
      }
    }

    // Could add actual HTTP ping validation here if needed
    logger.debug('Webhook URLs validated', {
      eventName: 'settings.webhooks.validated',
      urlCount: urls.length,
    });
  }

  /**
   * Create audit event
   */
  private async createAuditEvent(
    tenantId: string,
    eventType: string,
    details: Record<string, unknown>
  ): Promise<void> {
    if (!this.auditStore) return;

    await this.auditStore.createEvent({
      runId: 'system', // Settings events are not tied to specific runs
      tenantId,
      eventType: eventType as any,
      timestamp: new Date(),
      actor: details.updatedBy as string || details.resetBy as string || 'system',
      details,
    });
  }
}

/**
 * Factory function to create tenant settings service
 */
export function createTenantSettingsService(
  tenantStore: TenantStore,
  auditStore?: AuditStore,
  config?: TenantSettingsConfig
): TenantSettingsService {
  return new TenantSettingsService(tenantStore, auditStore, config);
}
