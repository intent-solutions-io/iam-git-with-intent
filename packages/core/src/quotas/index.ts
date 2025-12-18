/**
 * Quotas & Resource Management Module
 *
 * Phase 45: Resource quotas, limits, and usage tracking.
 * Provides fine-grained control over resource consumption.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Resource types that can be quota-controlled
 */
export type QuotaResourceType =
  | 'runs'
  | 'workflows'
  | 'connectors'
  | 'api_calls'
  | 'storage_bytes'
  | 'compute_minutes'
  | 'concurrent_runs'
  | 'users'
  | 'api_keys'
  | 'webhooks';

/**
 * Quota enforcement level
 */
export type QuotaEnforcement = 'soft' | 'hard' | 'warn';

/**
 * Quota period
 */
export type QuotaPeriod = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'unlimited';

/**
 * Quota definition
 */
export interface QuotaDefinition {
  id: string;
  resourceType: QuotaResourceType;
  limit: number;
  period: QuotaPeriod;
  enforcement: QuotaEnforcement;
  burstLimit?: number; // Temporary burst above limit
  burstDurationMs?: number;
  warningThreshold?: number; // Percentage (0-100)
  enabled: boolean;
}

/**
 * Quota assignment for a tenant
 */
export interface QuotaAssignment {
  id: string;
  tenantId: string;
  quotaId: string;
  customLimit?: number; // Override default limit
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Current quota usage
 */
export interface QuotaUsage {
  tenantId: string;
  resourceType: QuotaResourceType;
  currentUsage: number;
  limit: number;
  period: QuotaPeriod;
  periodStart: Date;
  periodEnd: Date;
  percentUsed: number;
  remaining: number;
  inBurst: boolean;
  burstRemaining?: number;
}

/**
 * Quota check result
 */
export interface QuotaCheckResult {
  allowed: boolean;
  resourceType: QuotaResourceType;
  currentUsage: number;
  limit: number;
  remaining: number;
  enforcement: QuotaEnforcement;
  reason?: string;
  retryAfterMs?: number;
  warnings: string[];
}

/**
 * Usage event for tracking (prefixed to avoid conflict with billing)
 */
export interface QuotaUsageEvent {
  id: string;
  tenantId: string;
  resourceType: QuotaResourceType;
  amount: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Usage summary (prefixed to avoid conflict with billing)
 */
export interface QuotaUsageSummary {
  tenantId: string;
  period: QuotaPeriod;
  periodStart: Date;
  periodEnd: Date;
  byResource: Record<QuotaResourceType, number>;
  peakUsage: Record<QuotaResourceType, { value: number; timestamp: Date }>;
  totalEvents: number;
}

/**
 * Resource allocation
 */
export interface ResourceAllocation {
  id: string;
  tenantId: string;
  resourceType: QuotaResourceType;
  allocated: number;
  reserved: number;
  available: number;
  priority: number;
  expiresAt?: Date;
}

// =============================================================================
// Quota Store Interface
// =============================================================================

/**
 * Store for quota definitions and assignments
 */
export interface QuotaStore {
  createQuota(quota: Omit<QuotaDefinition, 'id'>): Promise<QuotaDefinition>;
  getQuota(id: string): Promise<QuotaDefinition | null>;
  listQuotas(): Promise<QuotaDefinition[]>;
  updateQuota(id: string, updates: Partial<QuotaDefinition>): Promise<QuotaDefinition>;
  deleteQuota(id: string): Promise<void>;

  assignQuota(assignment: Omit<QuotaAssignment, 'id' | 'createdAt' | 'updatedAt'>): Promise<QuotaAssignment>;
  getAssignments(tenantId: string): Promise<QuotaAssignment[]>;
  removeAssignment(id: string): Promise<void>;
}

/**
 * Store for usage tracking
 */
export interface UsageStore {
  recordUsage(event: Omit<QuotaUsageEvent, 'id'>): Promise<QuotaUsageEvent>;
  getUsage(tenantId: string, resourceType: QuotaResourceType, since: Date): Promise<number>;
  getUsageSummary(tenantId: string, period: QuotaPeriod): Promise<QuotaUsageSummary>;
  pruneOldUsage(olderThan: Date): Promise<number>;
}

// =============================================================================
// In-Memory Quota Store
// =============================================================================

/**
 * In-memory quota store for development
 */
export class InMemoryQuotaStore implements QuotaStore {
  private quotas = new Map<string, QuotaDefinition>();
  private assignments = new Map<string, QuotaAssignment>();
  private quotaCounter = 0;
  private assignmentCounter = 0;

  async createQuota(quota: Omit<QuotaDefinition, 'id'>): Promise<QuotaDefinition> {
    const id = `quota_${++this.quotaCounter}`;
    const quotaDefinition: QuotaDefinition = { ...quota, id };
    this.quotas.set(id, quotaDefinition);
    return quotaDefinition;
  }

  async getQuota(id: string): Promise<QuotaDefinition | null> {
    return this.quotas.get(id) || null;
  }

  async listQuotas(): Promise<QuotaDefinition[]> {
    return Array.from(this.quotas.values());
  }

  async updateQuota(id: string, updates: Partial<QuotaDefinition>): Promise<QuotaDefinition> {
    const quota = this.quotas.get(id);
    if (!quota) {
      throw new Error(`Quota ${id} not found`);
    }
    const updated = { ...quota, ...updates, id };
    this.quotas.set(id, updated);
    return updated;
  }

  async deleteQuota(id: string): Promise<void> {
    if (!this.quotas.has(id)) {
      throw new Error(`Quota ${id} not found`);
    }
    this.quotas.delete(id);
  }

  async assignQuota(
    assignment: Omit<QuotaAssignment, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<QuotaAssignment> {
    const id = `assign_${++this.assignmentCounter}`;
    const quotaAssignment: QuotaAssignment = {
      ...assignment,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.assignments.set(id, quotaAssignment);
    return quotaAssignment;
  }

  async getAssignments(tenantId: string): Promise<QuotaAssignment[]> {
    return Array.from(this.assignments.values()).filter((a) => a.tenantId === tenantId);
  }

  async removeAssignment(id: string): Promise<void> {
    if (!this.assignments.has(id)) {
      throw new Error(`Assignment ${id} not found`);
    }
    this.assignments.delete(id);
  }
}

// =============================================================================
// In-Memory Usage Store
// =============================================================================

/**
 * In-memory usage store for development
 */
export class InMemoryUsageStore implements UsageStore {
  private events: QuotaUsageEvent[] = [];
  private eventCounter = 0;

  async recordUsage(event: Omit<QuotaUsageEvent, 'id'>): Promise<QuotaUsageEvent> {
    const id = `usage_${++this.eventCounter}`;
    const usageEvent: QuotaUsageEvent = { ...event, id };
    this.events.push(usageEvent);
    return usageEvent;
  }

  async getUsage(tenantId: string, resourceType: QuotaResourceType, since: Date): Promise<number> {
    return this.events
      .filter(
        (e) =>
          e.tenantId === tenantId &&
          e.resourceType === resourceType &&
          e.timestamp >= since
      )
      .reduce((sum, e) => sum + e.amount, 0);
  }

  async getUsageSummary(tenantId: string, period: QuotaPeriod): Promise<QuotaUsageSummary> {
    const { start, end } = this.getPeriodBounds(period);

    const relevantEvents = this.events.filter(
      (e) => e.tenantId === tenantId && e.timestamp >= start && e.timestamp <= end
    );

    const byResource: Record<QuotaResourceType, number> = {
      runs: 0,
      workflows: 0,
      connectors: 0,
      api_calls: 0,
      storage_bytes: 0,
      compute_minutes: 0,
      concurrent_runs: 0,
      users: 0,
      api_keys: 0,
      webhooks: 0,
    };

    const peakUsage: Record<QuotaResourceType, { value: number; timestamp: Date }> = {} as typeof peakUsage;

    for (const event of relevantEvents) {
      byResource[event.resourceType] = (byResource[event.resourceType] || 0) + event.amount;

      if (!peakUsage[event.resourceType] || event.amount > peakUsage[event.resourceType].value) {
        peakUsage[event.resourceType] = { value: event.amount, timestamp: event.timestamp };
      }
    }

    return {
      tenantId,
      period,
      periodStart: start,
      periodEnd: end,
      byResource,
      peakUsage,
      totalEvents: relevantEvents.length,
    };
  }

  async pruneOldUsage(olderThan: Date): Promise<number> {
    const originalLength = this.events.length;
    this.events = this.events.filter((e) => e.timestamp >= olderThan);
    return originalLength - this.events.length;
  }

  private getPeriodBounds(period: QuotaPeriod): { start: Date; end: Date } {
    const now = new Date();
    const end = now;
    let start: Date;

    switch (period) {
      case 'minute':
        start = new Date(now.getTime() - 60 * 1000);
        break;
      case 'hour':
        start = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'day':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'unlimited':
        start = new Date(0);
        break;
    }

    return { start, end };
  }
}

// =============================================================================
// Quota Manager
// =============================================================================

/**
 * Configuration for Quota Manager
 */
export interface QuotaManagerConfig {
  defaultEnforcement?: QuotaEnforcement;
  warningThreshold?: number;
  enableBurst?: boolean;
}

/**
 * Default quota manager config
 */
export const DEFAULT_QUOTA_CONFIG: QuotaManagerConfig = {
  defaultEnforcement: 'hard',
  warningThreshold: 80,
  enableBurst: true,
};

/**
 * Default quota definitions
 */
export const DEFAULT_QUOTAS: Omit<QuotaDefinition, 'id'>[] = [
  {
    resourceType: 'runs',
    limit: 1000,
    period: 'month',
    enforcement: 'hard',
    warningThreshold: 80,
    enabled: true,
  },
  {
    resourceType: 'concurrent_runs',
    limit: 5,
    period: 'unlimited',
    enforcement: 'hard',
    enabled: true,
  },
  {
    resourceType: 'api_calls',
    limit: 10000,
    period: 'hour',
    enforcement: 'soft',
    burstLimit: 12000,
    burstDurationMs: 60000,
    warningThreshold: 90,
    enabled: true,
  },
  {
    resourceType: 'storage_bytes',
    limit: 10 * 1024 * 1024 * 1024, // 10 GB
    period: 'unlimited',
    enforcement: 'hard',
    warningThreshold: 90,
    enabled: true,
  },
  {
    resourceType: 'users',
    limit: 50,
    period: 'unlimited',
    enforcement: 'hard',
    enabled: true,
  },
  {
    resourceType: 'api_keys',
    limit: 20,
    period: 'unlimited',
    enforcement: 'hard',
    enabled: true,
  },
];

/**
 * Quota Manager - manages resource quotas and usage
 */
export class QuotaManager {
  private quotaStore: QuotaStore;
  private usageStore: UsageStore;
  private config: QuotaManagerConfig;
  private burstState = new Map<string, { startTime: number; used: number }>();

  constructor(
    quotaStore: QuotaStore,
    usageStore: UsageStore,
    config: QuotaManagerConfig = {}
  ) {
    this.quotaStore = quotaStore;
    this.usageStore = usageStore;
    this.config = { ...DEFAULT_QUOTA_CONFIG, ...config };
  }

  /**
   * Check if resource usage is allowed
   */
  async checkQuota(
    tenantId: string,
    resourceType: QuotaResourceType,
    amount: number = 1
  ): Promise<QuotaCheckResult> {
    const warnings: string[] = [];
    const assignments = await this.quotaStore.getAssignments(tenantId);
    const relevantAssignments = assignments.filter((a) => a.enabled);

    // Find quota definition for this resource type
    const quotas = await this.quotaStore.listQuotas();
    const quota = quotas.find((q) => q.resourceType === resourceType && q.enabled);

    if (!quota) {
      // No quota defined - allow
      return {
        allowed: true,
        resourceType,
        currentUsage: 0,
        limit: Infinity,
        remaining: Infinity,
        enforcement: 'soft',
        warnings: [],
      };
    }

    // Get custom limit if assigned
    const assignment = relevantAssignments.find((a) => {
      const assignedQuota = quotas.find((q) => q.id === a.quotaId);
      return assignedQuota?.resourceType === resourceType;
    });
    const limit = assignment?.customLimit ?? quota.limit;

    // Get current usage
    const periodStart = this.getPeriodStart(quota.period);
    const currentUsage = await this.usageStore.getUsage(tenantId, resourceType, periodStart);

    const remaining = limit - currentUsage;
    const percentUsed = (currentUsage / limit) * 100;

    // Check warning threshold
    const warningThreshold = quota.warningThreshold ?? this.config.warningThreshold ?? 80;
    if (percentUsed >= warningThreshold && percentUsed < 100) {
      warnings.push(
        `Quota usage at ${percentUsed.toFixed(1)}% for ${resourceType} (${currentUsage}/${limit})`
      );
    }

    // Check if within limit
    if (currentUsage + amount <= limit) {
      return {
        allowed: true,
        resourceType,
        currentUsage,
        limit,
        remaining: remaining - amount,
        enforcement: quota.enforcement,
        warnings,
      };
    }

    // Check burst allowance
    if (this.config.enableBurst && quota.burstLimit) {
      const burstKey = `${tenantId}:${resourceType}`;
      const burstState = this.burstState.get(burstKey);
      const now = Date.now();

      if (!burstState || now - burstState.startTime > (quota.burstDurationMs ?? 60000)) {
        // Start new burst window
        this.burstState.set(burstKey, { startTime: now, used: amount });
        if (currentUsage + amount <= quota.burstLimit) {
          warnings.push(`Using burst quota for ${resourceType}`);
          return {
            allowed: true,
            resourceType,
            currentUsage,
            limit: quota.burstLimit,
            remaining: quota.burstLimit - currentUsage - amount,
            enforcement: quota.enforcement,
            warnings,
          };
        }
      } else if (burstState.used + amount <= quota.burstLimit - limit) {
        // Within burst window and burst allowance
        burstState.used += amount;
        warnings.push(`Using burst quota for ${resourceType}`);
        return {
          allowed: true,
          resourceType,
          currentUsage,
          limit: quota.burstLimit,
          remaining: quota.burstLimit - currentUsage - amount,
          enforcement: quota.enforcement,
          warnings,
        };
      }
    }

    // Quota exceeded
    const result: QuotaCheckResult = {
      allowed: quota.enforcement !== 'hard',
      resourceType,
      currentUsage,
      limit,
      remaining: Math.max(0, remaining),
      enforcement: quota.enforcement,
      reason: `Quota exceeded for ${resourceType}: ${currentUsage}/${limit}`,
      warnings,
    };

    // Calculate retry time for rate-limited resources
    if (quota.period !== 'unlimited') {
      const periodMs = this.getPeriodMs(quota.period);
      result.retryAfterMs = periodMs - (Date.now() - periodStart.getTime());
    }

    return result;
  }

  /**
   * Record resource usage
   */
  async recordUsage(
    tenantId: string,
    resourceType: QuotaResourceType,
    amount: number = 1,
    metadata?: Record<string, unknown>
  ): Promise<QuotaUsageEvent> {
    return this.usageStore.recordUsage({
      tenantId,
      resourceType,
      amount,
      timestamp: new Date(),
      metadata,
    });
  }

  /**
   * Get current usage for a resource
   */
  async getUsage(tenantId: string, resourceType: QuotaResourceType): Promise<QuotaUsage> {
    const quotas = await this.quotaStore.listQuotas();
    const quota = quotas.find((q) => q.resourceType === resourceType && q.enabled);

    const period = quota?.period ?? 'month';
    const limit = quota?.limit ?? Infinity;
    const periodStart = this.getPeriodStart(period);
    const periodEnd = this.getPeriodEnd(period);

    const currentUsage = await this.usageStore.getUsage(tenantId, resourceType, periodStart);
    const percentUsed = limit === Infinity ? 0 : (currentUsage / limit) * 100;

    return {
      tenantId,
      resourceType,
      currentUsage,
      limit,
      period,
      periodStart,
      periodEnd,
      percentUsed,
      remaining: Math.max(0, limit - currentUsage),
      inBurst: false,
    };
  }

  /**
   * Get usage summary for tenant
   */
  async getUsageSummary(tenantId: string, period: QuotaPeriod = 'month'): Promise<QuotaUsageSummary> {
    return this.usageStore.getUsageSummary(tenantId, period);
  }

  /**
   * Create a new quota definition
   */
  async createQuota(quota: Omit<QuotaDefinition, 'id'>): Promise<QuotaDefinition> {
    return this.quotaStore.createQuota(quota);
  }

  /**
   * Get quota by ID
   */
  async getQuota(id: string): Promise<QuotaDefinition | null> {
    return this.quotaStore.getQuota(id);
  }

  /**
   * List all quotas
   */
  async listQuotas(): Promise<QuotaDefinition[]> {
    return this.quotaStore.listQuotas();
  }

  /**
   * Assign quota to tenant
   */
  async assignQuotaToTenant(
    tenantId: string,
    quotaId: string,
    customLimit?: number
  ): Promise<QuotaAssignment> {
    return this.quotaStore.assignQuota({
      tenantId,
      quotaId,
      customLimit,
      enabled: true,
    });
  }

  /**
   * Get tenant's quota assignments
   */
  async getTenantAssignments(tenantId: string): Promise<QuotaAssignment[]> {
    return this.quotaStore.getAssignments(tenantId);
  }

  /**
   * Initialize default quotas
   */
  async initializeDefaultQuotas(): Promise<QuotaDefinition[]> {
    const created: QuotaDefinition[] = [];
    for (const quota of DEFAULT_QUOTAS) {
      const q = await this.quotaStore.createQuota(quota);
      created.push(q);
    }
    return created;
  }

  /**
   * Prune old usage data
   */
  async pruneOldUsage(olderThanDays: number = 90): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    return this.usageStore.pruneOldUsage(cutoff);
  }

  // -------------------------------------------------------------------------
  // Utility Methods
  // -------------------------------------------------------------------------

  private getPeriodStart(period: QuotaPeriod): Date {
    const now = new Date();

    switch (period) {
      case 'minute':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
      case 'hour':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
      case 'day':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'week': {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(now.setDate(diff));
      }
      case 'month':
        return new Date(now.getFullYear(), now.getMonth(), 1);
      case 'unlimited':
        return new Date(0);
    }
  }

  private getPeriodEnd(period: QuotaPeriod): Date {
    const start = this.getPeriodStart(period);

    switch (period) {
      case 'minute':
        return new Date(start.getTime() + 60 * 1000);
      case 'hour':
        return new Date(start.getTime() + 60 * 60 * 1000);
      case 'day':
        return new Date(start.getTime() + 24 * 60 * 60 * 1000);
      case 'week':
        return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      case 'month': {
        const nextMonth = new Date(start);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        return nextMonth;
      }
      case 'unlimited':
        return new Date(8640000000000000); // Max date
    }
  }

  private getPeriodMs(period: QuotaPeriod): number {
    switch (period) {
      case 'minute':
        return 60 * 1000;
      case 'hour':
        return 60 * 60 * 1000;
      case 'day':
        return 24 * 60 * 60 * 1000;
      case 'week':
        return 7 * 24 * 60 * 60 * 1000;
      case 'month':
        return 30 * 24 * 60 * 60 * 1000;
      case 'unlimited':
        return Infinity;
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a Quota Manager with in-memory stores
 */
export function createQuotaManager(config: QuotaManagerConfig = {}): QuotaManager {
  return new QuotaManager(new InMemoryQuotaStore(), new InMemoryUsageStore(), config);
}

/**
 * Create quota store
 */
export function createQuotaStore(): InMemoryQuotaStore {
  return new InMemoryQuotaStore();
}

/**
 * Create usage store
 */
export function createUsageStore(): InMemoryUsageStore {
  return new InMemoryUsageStore();
}
