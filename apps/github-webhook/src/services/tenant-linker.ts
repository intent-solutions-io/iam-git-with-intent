/**
 * Tenant Linker Service
 *
 * Maps GitHub webhook events to tenants in Firestore.
 * Handles tenant and repo lookup for all webhook event types.
 *
 * Phase 8: GitHub App + Webhook Integration
 *
 * @module @gwi/github-webhook/services
 */

import type {
  Tenant,
  TenantRepo,
  TenantStore,
  SaaSRun,
  RunType,
} from '@gwi/core';
import { getTenantStore } from '@gwi/core';

// =============================================================================
// Types
// =============================================================================

/**
 * GitHub webhook context extracted from any webhook event
 */
export interface WebhookContext {
  /** GitHub App installation ID */
  installationId: number;
  /** Repository info */
  repository?: {
    id: number;
    fullName: string;
    owner: string;
    name: string;
    private: boolean;
  };
  /** Sender info */
  sender?: {
    id: number;
    login: string;
  };
  /** Event type */
  event: string;
  /** Event action (if applicable) */
  action?: string;
  /** Delivery ID from GitHub */
  deliveryId: string;
}

/**
 * Resolved tenant context for processing webhooks
 */
export interface TenantContext {
  /** Tenant data from Firestore */
  tenant: Tenant;
  /** Repo data from Firestore (if applicable) */
  repo?: TenantRepo;
  /** Whether the repo is enabled for processing */
  repoEnabled: boolean;
  /** Whether we're within plan limits */
  withinLimits: boolean;
  /** Reason if not within limits */
  limitReason?: string;
}

/**
 * Run trigger info
 */
export interface RunTrigger {
  source: 'webhook';
  webhookEventId: string;
  userId?: string;
  commandText?: string;
}

// =============================================================================
// Tenant Linker
// =============================================================================

/**
 * TenantLinker - Maps webhooks to tenants
 */
export class TenantLinker {
  private store: TenantStore;

  // Cache for installation -> tenant mapping
  // In production, this would use Redis or Firestore index
  private installationCache = new Map<number, string>();

  constructor(store?: TenantStore) {
    this.store = store ?? getTenantStore();
  }

  /**
   * Extract webhook context from raw payload
   */
  extractContext(
    event: string,
    payload: Record<string, unknown>,
    deliveryId: string
  ): WebhookContext {
    const installation = payload.installation as Record<string, unknown> | undefined;
    const repository = payload.repository as Record<string, unknown> | undefined;
    const sender = payload.sender as Record<string, unknown> | undefined;

    const context: WebhookContext = {
      installationId: (installation?.id as number) || 0,
      event,
      action: payload.action as string | undefined,
      deliveryId,
    };

    if (repository) {
      const fullName = repository.full_name as string;
      const [owner, name] = fullName.split('/');
      context.repository = {
        id: repository.id as number,
        fullName,
        owner,
        name,
        private: repository.private as boolean,
      };
    }

    if (sender) {
      context.sender = {
        id: sender.id as number,
        login: sender.login as string,
      };
    }

    return context;
  }

  /**
   * Resolve tenant context from webhook context
   */
  async resolveTenant(ctx: WebhookContext): Promise<TenantContext | null> {
    // Try to find tenant by installation ID
    const tenantId = await this.findTenantByInstallation(ctx.installationId);
    if (!tenantId) {
      console.log(JSON.stringify({
        type: 'tenant_not_found',
        installationId: ctx.installationId,
        event: ctx.event,
        deliveryId: ctx.deliveryId,
      }));
      return null;
    }

    // Get tenant data
    const tenant = await this.store.getTenant(tenantId);
    if (!tenant) {
      console.log(JSON.stringify({
        type: 'tenant_data_missing',
        tenantId,
        installationId: ctx.installationId,
      }));
      return null;
    }

    // Check if tenant is active (has valid installation)
    if (tenant.installationId !== ctx.installationId) {
      console.log(JSON.stringify({
        type: 'installation_mismatch',
        tenantId,
        expected: tenant.installationId,
        received: ctx.installationId,
      }));
      return null;
    }

    // Get repo if applicable
    let repo: TenantRepo | undefined;
    let repoEnabled = true;

    if (ctx.repository) {
      const repoId = `gh-repo-${ctx.repository.id}`;
      const foundRepo = await this.store.getRepo(tenantId, repoId);

      if (foundRepo) {
        repo = foundRepo;
        repoEnabled = foundRepo.enabled;
      } else {
        // Repo not in our store - might be new or not tracked
        repoEnabled = false;
      }
    }

    // Check plan limits
    const { withinLimits, reason } = this.checkPlanLimits(tenant);

    return {
      tenant,
      repo,
      repoEnabled,
      withinLimits,
      limitReason: reason,
    };
  }

  /**
   * Find tenant ID by installation ID
   *
   * Uses cache for performance, falls back to convention-based lookup.
   */
  private async findTenantByInstallation(installationId: number): Promise<string | null> {
    // Check cache first
    const cached = this.installationCache.get(installationId);
    if (cached) {
      return cached;
    }

    // For Phase 8, we use a convention-based approach:
    // The tenant ID pattern is: gh-{type}-{account_id}
    //
    // In production, we would:
    // 1. Maintain an installations collection in Firestore
    // 2. Or add a secondary index on installationId
    //
    // For now, installation events populate the cache.

    console.warn(
      `[TenantLinker] Cache miss for installation ${installationId}. ` +
      'Ensure installation events are processed first.'
    );

    return null;
  }

  /**
   * Register installation -> tenant mapping
   *
   * Called when processing installation events.
   */
  registerInstallation(installationId: number, tenantId: string): void {
    this.installationCache.set(installationId, tenantId);
  }

  /**
   * Remove installation -> tenant mapping
   *
   * Called when processing installation.deleted events.
   */
  unregisterInstallation(installationId: number): void {
    this.installationCache.delete(installationId);
  }

  /**
   * Check if tenant is within plan limits
   */
  private checkPlanLimits(tenant: Tenant): { withinLimits: boolean; reason?: string } {
    // Check monthly runs
    if (tenant.runsThisMonth >= tenant.planLimits.runsPerMonth) {
      return {
        withinLimits: false,
        reason: `Monthly run limit reached (${tenant.planLimits.runsPerMonth} runs)`,
      };
    }

    return { withinLimits: true };
  }

  /**
   * Create a run for a webhook event
   */
  async createRun(
    tenantContext: TenantContext,
    runType: RunType,
    webhookContext: WebhookContext,
    prInfo: { number: number; url: string }
  ): Promise<SaaSRun> {
    const { tenant, repo } = tenantContext;

    if (!repo) {
      throw new Error('Cannot create run without repo context');
    }

    const trigger: RunTrigger = {
      source: 'webhook',
      webhookEventId: webhookContext.deliveryId,
      userId: webhookContext.sender?.login,
    };

    const run: Omit<SaaSRun, 'id' | 'createdAt' | 'updatedAt'> = {
      tenantId: tenant.id,
      repoId: repo.id,
      prId: `pr-${prInfo.number}`,
      prUrl: prInfo.url,
      type: runType,
      status: 'pending',
      steps: [],
      trigger: {
        source: trigger.source,
        webhookEventId: trigger.webhookEventId,
        userId: trigger.userId,
      },
    };

    const created = await this.store.createRun(tenant.id, run);

    // Update tenant run count
    await this.store.updateTenant(tenant.id, {
      runsThisMonth: tenant.runsThisMonth + 1,
      lastRunAt: new Date(),
    });

    // Update repo stats
    await this.store.updateRepo(tenant.id, repo.id, {
      totalRuns: repo.totalRuns + 1,
      lastRunId: created.id,
    });

    console.log(JSON.stringify({
      type: 'run_created',
      tenantId: tenant.id,
      repoId: repo.id,
      runId: created.id,
      runType,
      trigger: 'webhook',
      deliveryId: webhookContext.deliveryId,
    }));

    return created;
  }

  /**
   * Get repo settings with tenant defaults as fallback
   */
  getEffectiveSettings(
    tenantContext: TenantContext
  ): {
    riskMode: string;
    autoTriage: boolean;
    autoReview: boolean;
    autoResolve: boolean;
  } {
    const { tenant, repo } = tenantContext;
    const tenantSettings = tenant.settings;
    const repoSettings = repo?.settings;

    return {
      riskMode: repoSettings?.riskModeOverride ?? tenantSettings.defaultRiskMode,
      autoTriage: repoSettings?.autoTriage ?? tenantSettings.autoRunOnPrOpen,
      autoReview: repoSettings?.autoReview ?? false,
      autoResolve: repoSettings?.autoResolve ?? tenantSettings.autoRunOnConflict,
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: TenantLinker | null = null;

/**
 * Get the singleton TenantLinker instance
 */
export function getTenantLinker(store?: TenantStore): TenantLinker {
  if (!instance) {
    instance = new TenantLinker(store);
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetTenantLinker(): void {
  instance = null;
}
