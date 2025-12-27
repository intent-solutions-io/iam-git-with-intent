/**
 * Tenant Lifecycle Management Service
 *
 * Epic E: RBAC & Governance
 *
 * Provides comprehensive tenant lifecycle operations including:
 * - Tenant creation with validation
 * - State transitions (active, suspended, deleted)
 * - Plan management (upgrades/downgrades)
 * - Status tracking and state machine enforcement
 *
 * @module @gwi/core/tenants/lifecycle
 */

import { z } from 'zod';
import type {
  Tenant,
  TenantStatus,
  PlanTier,
  TenantStore,
  AuditStore,
  MembershipStore,
} from '../storage/interfaces.js';
import { createLogger } from '../telemetry/index.js';

// =============================================================================
// Schemas and Validation
// =============================================================================

/**
 * Valid state transitions for tenant status
 */
const STATE_TRANSITIONS: Record<TenantStatus, TenantStatus[]> = {
  active: ['suspended', 'paused', 'deactivated'],
  suspended: ['active', 'deactivated'],
  paused: ['active', 'deactivated'],
  deactivated: ['active'], // Can reactivate a deactivated tenant
};

/**
 * Tenant creation parameters schema
 */
export const CreateTenantParamsSchema = z.object({
  githubOrgId: z.number().int().positive(),
  githubOrgLogin: z.string().min(1),
  displayName: z.string().min(1).max(100),
  installationId: z.number().int().positive(),
  installedBy: z.string().min(1), // userId
  plan: z.enum(['free', 'team', 'pro', 'enterprise']).default('free'),
});

export type CreateTenantParams = z.infer<typeof CreateTenantParamsSchema>;

/**
 * Plan update parameters schema
 */
export const UpdatePlanParamsSchema = z.object({
  newPlan: z.enum(['free', 'team', 'pro', 'enterprise']),
  reason: z.string().optional(),
});

export type UpdatePlanParams = z.infer<typeof UpdatePlanParamsSchema>;

/**
 * Suspension parameters schema
 */
export const SuspendTenantParamsSchema = z.object({
  reason: z.string().min(1).max(500),
  suspendedBy: z.string().min(1), // userId or 'system'
});

export type SuspendTenantParams = z.infer<typeof SuspendTenantParamsSchema>;

// =============================================================================
// Plan Limits Configuration
// =============================================================================

/**
 * Default plan limits by tier
 */
export const PLAN_LIMITS: Record<PlanTier, { runsPerMonth: number; reposMax: number; membersMax: number }> = {
  free: {
    runsPerMonth: 100,
    reposMax: 3,
    membersMax: 5,
  },
  team: {
    runsPerMonth: 1000,
    reposMax: 10,
    membersMax: 15,
  },
  pro: {
    runsPerMonth: 5000,
    reposMax: 50,
    membersMax: 50,
  },
  enterprise: {
    runsPerMonth: 50000,
    reposMax: 500,
    membersMax: 500,
  },
};

// =============================================================================
// Tenant Lifecycle Service
// =============================================================================

const logger = createLogger('tenant-lifecycle');

/**
 * Configuration for tenant lifecycle service
 */
export interface TenantLifecycleConfig {
  /** Enable audit event creation */
  enableAudit?: boolean;
  /** Enable automatic plan enforcement */
  enforceQuotas?: boolean;
}

/**
 * Tenant lifecycle service for managing tenant state and operations
 */
export class TenantLifecycleService {
  private tenantStore: TenantStore;
  private auditStore?: AuditStore;
  private membershipStore?: MembershipStore;
  private config: TenantLifecycleConfig;

  constructor(
    tenantStore: TenantStore,
    auditStore?: AuditStore,
    membershipStore?: MembershipStore,
    config: TenantLifecycleConfig = {}
  ) {
    this.tenantStore = tenantStore;
    this.auditStore = auditStore;
    this.membershipStore = membershipStore;
    this.config = {
      enableAudit: config.enableAudit ?? true,
      enforceQuotas: config.enforceQuotas ?? true,
    };
  }

  /**
   * Create a new tenant with validation
   */
  async createTenant(params: CreateTenantParams): Promise<Tenant> {
    // Validate params
    const validated = CreateTenantParamsSchema.parse(params);

    logger.info('Creating new tenant', {
      eventName: 'tenant.create.start',
      githubOrgId: validated.githubOrgId,
      githubOrgLogin: validated.githubOrgLogin,
      plan: validated.plan,
    });

    // Generate tenant ID
    const tenantId = `gh-org-${validated.githubOrgId}`;

    // Check if tenant already exists
    const existing = await this.tenantStore.getTenant(tenantId);
    if (existing) {
      logger.warn('Tenant already exists', {
        eventName: 'tenant.create.duplicate',
        tenantId,
      });
      throw new Error(`Tenant ${tenantId} already exists`);
    }

    // Get plan limits
    const planLimits = PLAN_LIMITS[validated.plan];

    // Create tenant
    const tenant = await this.tenantStore.createTenant({
      id: tenantId,
      githubOrgId: validated.githubOrgId,
      githubOrgLogin: validated.githubOrgLogin,
      displayName: validated.displayName,
      installationId: validated.installationId,
      installedAt: new Date(),
      installedBy: validated.installedBy,
      status: 'active',
      plan: validated.plan,
      planLimits,
      settings: {
        defaultRiskMode: 'comment_only',
        defaultTriageModel: 'gemini-flash',
        defaultCodeModel: 'claude-sonnet',
        complexityThreshold: 3,
        autoRunOnConflict: false,
        autoRunOnPrOpen: false,
      },
      runsThisMonth: 0,
    });

    // Create audit event
    if (this.config.enableAudit && this.auditStore) {
      await this.createAuditEvent(tenant.id, 'tenant_created', {
        plan: validated.plan,
        installedBy: validated.installedBy,
        githubOrgLogin: validated.githubOrgLogin,
      });
    }

    logger.info('Tenant created successfully', {
      eventName: 'tenant.create.success',
      tenantId: tenant.id,
      plan: tenant.plan,
    });

    return tenant;
  }

  /**
   * Activate a suspended or paused tenant
   */
  async activateTenant(tenantId: string, activatedBy: string): Promise<Tenant> {
    const tenant = await this.getTenantOrThrow(tenantId);

    logger.info('Activating tenant', {
      eventName: 'tenant.activate.start',
      tenantId,
      currentStatus: tenant.status,
    });

    // Validate state transition
    this.validateStateTransition(tenant.status, 'active');

    // Update tenant status
    const updated = await this.tenantStore.updateTenant(tenantId, {
      status: 'active',
      updatedAt: new Date(),
    });

    // Create audit event
    if (this.config.enableAudit && this.auditStore) {
      await this.createAuditEvent(tenantId, 'tenant_activated', {
        activatedBy,
        previousStatus: tenant.status,
      });
    }

    logger.info('Tenant activated successfully', {
      eventName: 'tenant.activate.success',
      tenantId,
    });

    return updated;
  }

  /**
   * Suspend a tenant (preserves data)
   */
  async suspendTenant(tenantId: string, params: SuspendTenantParams): Promise<Tenant> {
    const validated = SuspendTenantParamsSchema.parse(params);
    const tenant = await this.getTenantOrThrow(tenantId);

    logger.info('Suspending tenant', {
      eventName: 'tenant.suspend.start',
      tenantId,
      reason: validated.reason,
      suspendedBy: validated.suspendedBy,
    });

    // Validate state transition
    this.validateStateTransition(tenant.status, 'suspended');

    // Update tenant status
    const updated = await this.tenantStore.updateTenant(tenantId, {
      status: 'suspended',
      updatedAt: new Date(),
    });

    // Create audit event
    if (this.config.enableAudit && this.auditStore) {
      await this.createAuditEvent(tenantId, 'tenant_suspended', {
        suspendedBy: validated.suspendedBy,
        reason: validated.reason,
        previousStatus: tenant.status,
      });
    }

    logger.info('Tenant suspended successfully', {
      eventName: 'tenant.suspend.success',
      tenantId,
    });

    return updated;
  }

  /**
   * Pause a tenant (temporary hold, preserves data)
   */
  async pauseTenant(tenantId: string, pausedBy: string, reason?: string): Promise<Tenant> {
    const tenant = await this.getTenantOrThrow(tenantId);

    logger.info('Pausing tenant', {
      eventName: 'tenant.pause.start',
      tenantId,
      pausedBy,
    });

    // Validate state transition
    this.validateStateTransition(tenant.status, 'paused');

    // Update tenant status
    const updated = await this.tenantStore.updateTenant(tenantId, {
      status: 'paused',
      updatedAt: new Date(),
    });

    // Create audit event
    if (this.config.enableAudit && this.auditStore) {
      await this.createAuditEvent(tenantId, 'tenant_paused', {
        pausedBy,
        reason,
        previousStatus: tenant.status,
      });
    }

    logger.info('Tenant paused successfully', {
      eventName: 'tenant.pause.success',
      tenantId,
    });

    return updated;
  }

  /**
   * Soft delete a tenant (marks as deleted, data can be recovered)
   */
  async deleteTenant(tenantId: string, deletedBy: string, reason?: string): Promise<Tenant> {
    const tenant = await this.getTenantOrThrow(tenantId);

    logger.info('Soft deleting tenant', {
      eventName: 'tenant.delete.start',
      tenantId,
      deletedBy,
    });

    // Validate state transition
    this.validateStateTransition(tenant.status, 'deactivated');

    // Update tenant status
    const updated = await this.tenantStore.updateTenant(tenantId, {
      status: 'deactivated',
      updatedAt: new Date(),
    });

    // Create audit event
    if (this.config.enableAudit && this.auditStore) {
      await this.createAuditEvent(tenantId, 'tenant_deleted', {
        deletedBy,
        reason,
        previousStatus: tenant.status,
        recoverable: true,
      });
    }

    logger.info('Tenant soft deleted successfully', {
      eventName: 'tenant.delete.success',
      tenantId,
    });

    return updated;
  }

  /**
   * Permanently delete a tenant and all associated data (IRREVERSIBLE)
   */
  async hardDeleteTenant(tenantId: string, deletedBy: string, confirmationToken: string): Promise<void> {
    const tenant = await this.getTenantOrThrow(tenantId);

    logger.warn('Hard deleting tenant - IRREVERSIBLE', {
      eventName: 'tenant.hard_delete.start',
      tenantId,
      deletedBy,
    });

    // Require confirmation token matching tenant ID
    if (confirmationToken !== tenantId) {
      throw new Error('Invalid confirmation token. Cannot hard delete tenant.');
    }

    // Create final audit event before deletion
    if (this.config.enableAudit && this.auditStore) {
      await this.createAuditEvent(tenantId, 'tenant_hard_deleted', {
        deletedBy,
        previousStatus: tenant.status,
        recoverable: false,
        warning: 'IRREVERSIBLE_DELETION',
      });
    }

    // Delete from store (implementation should cascade to related data)
    await this.tenantStore.deleteTenant(tenantId);

    logger.warn('Tenant permanently deleted', {
      eventName: 'tenant.hard_delete.success',
      tenantId,
      deletedBy,
    });
  }

  /**
   * Update tenant plan (upgrade or downgrade)
   */
  async updateTenantPlan(tenantId: string, params: UpdatePlanParams, updatedBy: string): Promise<Tenant> {
    const validated = UpdatePlanParamsSchema.parse(params);
    const tenant = await this.getTenantOrThrow(tenantId);

    logger.info('Updating tenant plan', {
      eventName: 'tenant.plan.update.start',
      tenantId,
      currentPlan: tenant.plan,
      newPlan: validated.newPlan,
    });

    // Check if plan is actually changing
    if (tenant.plan === validated.newPlan) {
      logger.info('Plan unchanged, skipping update', {
        eventName: 'tenant.plan.update.noop',
        tenantId,
        plan: validated.newPlan,
      });
      return tenant;
    }

    // Get new plan limits
    const newPlanLimits = PLAN_LIMITS[validated.newPlan];

    // Validate downgrade constraints
    if (this.config.enforceQuotas && this.isPlanDowngrade(tenant.plan, validated.newPlan)) {
      await this.validateDowngradeConstraints(tenant, newPlanLimits);
    }

    // Update tenant
    const updated = await this.tenantStore.updateTenant(tenantId, {
      plan: validated.newPlan,
      planLimits: newPlanLimits,
      updatedAt: new Date(),
    });

    // Create audit event
    if (this.config.enableAudit && this.auditStore) {
      await this.createAuditEvent(tenantId, 'tenant_plan_updated', {
        updatedBy,
        previousPlan: tenant.plan,
        newPlan: validated.newPlan,
        reason: validated.reason,
        isUpgrade: !this.isPlanDowngrade(tenant.plan, validated.newPlan),
      });
    }

    logger.info('Tenant plan updated successfully', {
      eventName: 'tenant.plan.update.success',
      tenantId,
      newPlan: validated.newPlan,
    });

    return updated;
  }

  /**
   * Get detailed tenant status
   */
  async getTenantStatus(tenantId: string): Promise<TenantStatusReport> {
    const tenant = await this.getTenantOrThrow(tenantId);

    // Get member count if membership store available
    let memberCount = 0;
    if (this.membershipStore) {
      const members = await this.membershipStore.listTenantMembers(tenantId);
      memberCount = members.filter((m) => m.status === 'active').length;
    }

    // Get repo count
    const repos = await this.tenantStore.listRepos(tenantId);
    const activeRepoCount = repos.filter((r) => r.enabled).length;

    // Calculate quota usage percentages
    const quotaUsage = {
      runs: (tenant.runsThisMonth / tenant.planLimits.runsPerMonth) * 100,
      repos: (activeRepoCount / tenant.planLimits.reposMax) * 100,
      members: (memberCount / tenant.planLimits.membersMax) * 100,
    };

    return {
      tenantId: tenant.id,
      status: tenant.status,
      plan: tenant.plan,
      limits: tenant.planLimits,
      usage: {
        runsThisMonth: tenant.runsThisMonth,
        activeRepos: activeRepoCount,
        activeMembers: memberCount,
      },
      quotaUsage,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      lastRunAt: tenant.lastRunAt,
    };
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Get tenant or throw error if not found
   */
  private async getTenantOrThrow(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantStore.getTenant(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }
    return tenant;
  }

  /**
   * Validate state transition is allowed
   */
  private validateStateTransition(currentStatus: TenantStatus, newStatus: TenantStatus): void {
    const allowedTransitions = STATE_TRANSITIONS[currentStatus];
    if (!allowedTransitions?.includes(newStatus)) {
      throw new Error(
        `Invalid state transition from ${currentStatus} to ${newStatus}. Allowed: ${allowedTransitions?.join(', ') || 'none'}`
      );
    }
  }

  /**
   * Check if plan change is a downgrade
   */
  private isPlanDowngrade(currentPlan: PlanTier, newPlan: PlanTier): boolean {
    const planOrder: Record<PlanTier, number> = {
      free: 0,
      team: 1,
      pro: 2,
      enterprise: 3,
    };
    return planOrder[newPlan] < planOrder[currentPlan];
  }

  /**
   * Validate that downgrade is possible given current usage
   */
  private async validateDowngradeConstraints(
    tenant: Tenant,
    newLimits: { runsPerMonth: number; reposMax: number; membersMax: number }
  ): Promise<void> {
    const errors: string[] = [];

    // Check repo count
    const repos = await this.tenantStore.listRepos(tenant.id);
    const activeRepoCount = repos.filter((r) => r.enabled).length;
    if (activeRepoCount > newLimits.reposMax) {
      errors.push(
        `Cannot downgrade: ${activeRepoCount} active repos exceeds limit of ${newLimits.reposMax}`
      );
    }

    // Check member count
    if (this.membershipStore) {
      const members = await this.membershipStore.listTenantMembers(tenant.id);
      const activeMemberCount = members.filter((m) => m.status === 'active').length;
      if (activeMemberCount > newLimits.membersMax) {
        errors.push(
          `Cannot downgrade: ${activeMemberCount} active members exceeds limit of ${newLimits.membersMax}`
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(`Plan downgrade validation failed:\n${errors.join('\n')}`);
    }
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
      runId: 'system', // Lifecycle events are not tied to specific runs
      tenantId,
      eventType: eventType as any,
      timestamp: new Date(),
      actor: details.updatedBy as string || details.suspendedBy as string || details.deletedBy as string || 'system',
      details,
    });
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Tenant status report
 */
export interface TenantStatusReport {
  tenantId: string;
  status: TenantStatus;
  plan: PlanTier;
  limits: {
    runsPerMonth: number;
    reposMax: number;
    membersMax: number;
  };
  usage: {
    runsThisMonth: number;
    activeRepos: number;
    activeMembers: number;
  };
  quotaUsage: {
    runs: number;
    repos: number;
    members: number;
  };
  createdAt: Date;
  updatedAt: Date;
  lastRunAt?: Date;
}

/**
 * Factory function to create tenant lifecycle service
 */
export function createTenantLifecycleService(
  tenantStore: TenantStore,
  auditStore?: AuditStore,
  membershipStore?: MembershipStore,
  config?: TenantLifecycleConfig
): TenantLifecycleService {
  return new TenantLifecycleService(tenantStore, auditStore, membershipStore, config);
}
