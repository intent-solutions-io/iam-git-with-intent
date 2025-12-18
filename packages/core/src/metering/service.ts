/**
 * Phase 28: Metering Service
 *
 * Handles usage event recording and aggregation.
 * Provider-agnostic - works with any LLM provider.
 */

import { randomUUID } from 'node:crypto';
import type {
  MeteringEvent,
  UsageAggregate,
  Plan,
  PlanUsageStatus,
  TokenUsage,
} from './types.js';
import { DEFAULT_PLANS, getPlanById } from './types.js';

// =============================================================================
// Types
// =============================================================================

export interface MeteringConfig {
  /** Storage backend for events */
  storage?: MeteringEventStorage;
  /** Enable debug logging */
  debug?: boolean;
  /** Soft limit threshold (default 80%) */
  softLimitThreshold?: number;
  /** Hard limit threshold (default 100%) */
  hardLimitThreshold?: number;
}

export interface MeteringEventStorage {
  /** Record a metering event */
  recordEvent(event: MeteringEvent): Promise<void>;
  /** Get events for a tenant in a time range */
  getEvents(tenantId: string, start: Date, end: Date): Promise<MeteringEvent[]>;
  /** Get aggregate for a tenant in a time range */
  getAggregate(tenantId: string, start: Date, end: Date): Promise<UsageAggregate | null>;
  /** Save/update aggregate */
  saveAggregate(aggregate: UsageAggregate): Promise<void>;
}

// =============================================================================
// In-Memory Storage (Development)
// =============================================================================

/**
 * In-memory storage for development/testing
 */
export class InMemoryMeteringStorage implements MeteringEventStorage {
  private events: MeteringEvent[] = [];
  private aggregates: Map<string, UsageAggregate> = new Map();

  async recordEvent(event: MeteringEvent): Promise<void> {
    this.events.push(event);
  }

  async getEvents(tenantId: string, start: Date, end: Date): Promise<MeteringEvent[]> {
    return this.events.filter(e => {
      const ts = new Date(e.ts);
      return e.tenant_id === tenantId && ts >= start && ts <= end;
    });
  }

  async getAggregate(tenantId: string, start: Date, end: Date): Promise<UsageAggregate | null> {
    const key = `${tenantId}:${start.toISOString()}:${end.toISOString()}`;
    return this.aggregates.get(key) || null;
  }

  async saveAggregate(aggregate: UsageAggregate): Promise<void> {
    const key = `${aggregate.tenant_id}:${aggregate.period_start}:${aggregate.period_end}`;
    this.aggregates.set(key, aggregate);
  }

  // Test helpers
  clear(): void {
    this.events = [];
    this.aggregates.clear();
  }

  getAllEvents(): MeteringEvent[] {
    return [...this.events];
  }
}

// =============================================================================
// Metering Service
// =============================================================================

/**
 * Metering service for recording and aggregating usage
 */
export class MeteringService {
  private config: Required<MeteringConfig>;
  private storage: MeteringEventStorage;
  private tenantPlans: Map<string, string> = new Map(); // tenantId -> planId

  constructor(config?: MeteringConfig) {
    this.config = {
      storage: config?.storage || new InMemoryMeteringStorage(),
      debug: config?.debug ?? false,
      softLimitThreshold: config?.softLimitThreshold ?? 0.8,
      hardLimitThreshold: config?.hardLimitThreshold ?? 1.0,
    };
    this.storage = this.config.storage;
  }

  // ===========================================================================
  // Event Recording
  // ===========================================================================

  /**
   * Record an LLM usage event (provider-agnostic)
   */
  async recordLLMUsage(params: {
    tenantId: string;
    userId?: string;
    runId?: string;
    workflowId?: string;
    provider: string;
    model: string;
    tokens?: TokenUsage;
    latencyMs?: number;
    costUsdEstimate?: number;
    requestId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<MeteringEvent> {
    const event: MeteringEvent = {
      id: randomUUID(),
      tenant_id: params.tenantId,
      user_id: params.userId,
      run_id: params.runId,
      workflow_id: params.workflowId,
      ts: new Date().toISOString(),
      category: 'llm',
      provider: params.provider,
      model: params.model,
      tokens: params.tokens,
      latency_ms: params.latencyMs,
      cost_usd_estimate: params.costUsdEstimate,
      request_id: params.requestId,
      metadata: params.metadata,
    };

    await this.storage.recordEvent(event);

    if (this.config.debug) {
      console.log(`[Metering] Recorded LLM usage: ${params.provider}/${params.model}`);
    }

    return event;
  }

  /**
   * Record a tool usage event
   */
  async recordToolUsage(params: {
    tenantId: string;
    userId?: string;
    runId?: string;
    toolName: string;
    latencyMs?: number;
    metadata?: Record<string, unknown>;
  }): Promise<MeteringEvent> {
    const event: MeteringEvent = {
      id: randomUUID(),
      tenant_id: params.tenantId,
      user_id: params.userId,
      run_id: params.runId,
      ts: new Date().toISOString(),
      category: 'tool',
      provider: 'gwi',
      model: params.toolName,
      latency_ms: params.latencyMs,
      metadata: params.metadata,
    };

    await this.storage.recordEvent(event);

    if (this.config.debug) {
      console.log(`[Metering] Recorded tool usage: ${params.toolName}`);
    }

    return event;
  }

  /**
   * Record a run event (simplified)
   */
  async recordRunEvent(params: {
    tenantId: string;
    userId?: string;
    runId: string;
    runType: string;
    status: 'started' | 'completed' | 'failed';
    durationMs?: number;
    metadata?: Record<string, unknown>;
  }): Promise<MeteringEvent> {
    const event: MeteringEvent = {
      id: randomUUID(),
      tenant_id: params.tenantId,
      user_id: params.userId,
      run_id: params.runId,
      ts: new Date().toISOString(),
      category: 'compute',
      provider: 'gwi',
      model: params.runType,
      latency_ms: params.durationMs,
      metadata: {
        ...params.metadata,
        status: params.status,
      },
    };

    await this.storage.recordEvent(event);

    if (this.config.debug) {
      console.log(`[Metering] Recorded run event: ${params.runType} (${params.status})`);
    }

    return event;
  }

  // ===========================================================================
  // Aggregation
  // ===========================================================================

  /**
   * Compute aggregate for a tenant in a billing period
   */
  async computeAggregate(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<UsageAggregate> {
    const events = await this.storage.getEvents(tenantId, periodStart, periodEnd);

    const aggregate: UsageAggregate = {
      tenant_id: tenantId,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      total_runs: 0,
      total_llm_calls: 0,
      total_tokens: { input: 0, output: 0, total: 0 },
      total_latency_ms: 0,
      total_cost_usd: 0,
      by_provider: {},
      by_model: {},
      updated_at: new Date().toISOString(),
    };

    const seenRuns = new Set<string>();

    for (const event of events) {
      // Count runs
      if (event.run_id && !seenRuns.has(event.run_id)) {
        seenRuns.add(event.run_id);
        aggregate.total_runs++;
      }

      // Count LLM calls
      if (event.category === 'llm') {
        aggregate.total_llm_calls++;

        // Aggregate tokens
        if (event.tokens) {
          const input = event.tokens.input_tokens || event.tokens.prompt_tokens || 0;
          const output = event.tokens.output_tokens || event.tokens.completion_tokens || 0;
          const total = event.tokens.total_tokens || (input + output);

          aggregate.total_tokens.input += input;
          aggregate.total_tokens.output += output;
          aggregate.total_tokens.total += total;
        }

        // Aggregate latency
        if (event.latency_ms) {
          aggregate.total_latency_ms += event.latency_ms;
        }

        // Aggregate cost
        if (event.cost_usd_estimate) {
          aggregate.total_cost_usd += event.cost_usd_estimate;
        }

        // By provider
        if (!aggregate.by_provider[event.provider]) {
          aggregate.by_provider[event.provider] = { calls: 0, tokens: 0, cost_usd: 0 };
        }
        aggregate.by_provider[event.provider].calls++;
        if (event.tokens) {
          aggregate.by_provider[event.provider].tokens += event.tokens.total_tokens || 0;
        }
        if (event.cost_usd_estimate) {
          aggregate.by_provider[event.provider].cost_usd += event.cost_usd_estimate;
        }

        // By model
        if (!aggregate.by_model[event.model]) {
          aggregate.by_model[event.model] = { calls: 0, tokens: 0, cost_usd: 0 };
        }
        aggregate.by_model[event.model].calls++;
        if (event.tokens) {
          aggregate.by_model[event.model].tokens += event.tokens.total_tokens || 0;
        }
        if (event.cost_usd_estimate) {
          aggregate.by_model[event.model].cost_usd += event.cost_usd_estimate;
        }
      }
    }

    // Save aggregate
    await this.storage.saveAggregate(aggregate);

    return aggregate;
  }

  /**
   * Get aggregate for current billing period
   */
  async getCurrentAggregate(tenantId: string): Promise<UsageAggregate> {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Try to get cached aggregate
    let aggregate = await this.storage.getAggregate(tenantId, periodStart, periodEnd);

    // If no aggregate or stale, recompute
    if (!aggregate) {
      aggregate = await this.computeAggregate(tenantId, periodStart, periodEnd);
    }

    return aggregate;
  }

  // ===========================================================================
  // Plan Management
  // ===========================================================================

  /**
   * Set tenant's plan
   */
  setTenantPlan(tenantId: string, planId: string): void {
    this.tenantPlans.set(tenantId, planId);
  }

  /**
   * Get tenant's plan
   */
  getTenantPlan(tenantId: string): Plan {
    const planId = this.tenantPlans.get(tenantId) || 'free';
    return getPlanById(planId) || DEFAULT_PLANS[0];
  }

  /**
   * Get plan usage status for a tenant
   */
  async getPlanUsageStatus(tenantId: string): Promise<PlanUsageStatus> {
    const plan = this.getTenantPlan(tenantId);
    const aggregate = await this.getCurrentAggregate(tenantId);

    const tokenUsagePercent = plan.token_limit > 0
      ? (aggregate.total_tokens.total / plan.token_limit) * 100
      : 0;

    const runUsagePercent = plan.run_limit > 0
      ? (aggregate.total_runs / plan.run_limit) * 100
      : 0;

    const softLimitReached =
      tokenUsagePercent >= this.config.softLimitThreshold * 100 ||
      runUsagePercent >= this.config.softLimitThreshold * 100;

    const hardLimitReached =
      tokenUsagePercent >= this.config.hardLimitThreshold * 100 ||
      runUsagePercent >= this.config.hardLimitThreshold * 100;

    // Calculate period reset
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    return {
      plan,
      token_usage_percent: Math.min(tokenUsagePercent, 100),
      run_usage_percent: Math.min(runUsagePercent, 100),
      soft_limit_reached: softLimitReached,
      hard_limit_reached: hardLimitReached,
      tokens_remaining: Math.max(0, plan.token_limit - aggregate.total_tokens.total),
      runs_remaining: Math.max(0, plan.run_limit - aggregate.total_runs),
      period_resets_at: nextMonth.toISOString(),
    };
  }

  /**
   * Check if tenant can proceed (not at hard limit)
   */
  async checkLimits(tenantId: string): Promise<{
    allowed: boolean;
    reason?: string;
    status: PlanUsageStatus;
  }> {
    const status = await this.getPlanUsageStatus(tenantId);

    if (status.hard_limit_reached) {
      return {
        allowed: false,
        reason: `Plan limit reached. Upgrade to continue. (${status.plan.name} plan: ${status.plan.token_limit} tokens, ${status.plan.run_limit} runs)`,
        status,
      };
    }

    return {
      allowed: true,
      status,
    };
  }
}

// =============================================================================
// Singleton
// =============================================================================

let defaultMeteringService: MeteringService | null = null;

/**
 * Get the default metering service instance
 */
export function getMeteringService(): MeteringService {
  if (!defaultMeteringService) {
    defaultMeteringService = new MeteringService();
  }
  return defaultMeteringService;
}

/**
 * Reset the metering service (for testing)
 */
export function resetMeteringService(): void {
  defaultMeteringService = null;
}

/**
 * Check if metering is enabled
 */
export function isMeteringEnabled(): boolean {
  return process.env.GWI_METERING_ENABLED === '1' || process.env.GWI_METERING_ENABLED === 'true';
}
