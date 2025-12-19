/**
 * Metering Service Tests (A11)
 *
 * Tests for cost metering primitives including:
 * - LLM usage tracking (A11.s1)
 * - Per-run totals (A11.s2)
 * - Per-tenant rollups (A11.s3)
 * - Budget guardrails (A11.s5)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MeteringService,
  InMemoryMeteringStorage,
  MeteringEventSchema,
  UsageAggregateSchema,
  PlanSchema,
  DEFAULT_PLANS,
  validateMeteringEvent,
  validateUsageAggregate,
  getPlanById,
  getPlanByTier,
} from '../index.js';

// =============================================================================
// Schema Validation Tests
// =============================================================================

describe('Metering Schema Validation', () => {
  describe('MeteringEventSchema', () => {
    it('validates a valid LLM usage event', () => {
      const event = {
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        tenant_id: 'tenant-123',
        ts: new Date().toISOString(),
        category: 'llm',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        tokens: {
          input_tokens: 100,
          output_tokens: 200,
          total_tokens: 300,
        },
        cost_usd_estimate: 0.003,
      };

      const result = MeteringEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('validates event with OpenAI token naming', () => {
      const event = {
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d480',
        tenant_id: 'tenant-123',
        ts: new Date().toISOString(),
        category: 'llm',
        provider: 'openai',
        model: 'gpt-4',
        tokens: {
          prompt_tokens: 100,
          completion_tokens: 200,
        },
      };

      const result = MeteringEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('rejects event with missing required fields', () => {
      const event = {
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d481',
        // missing tenant_id
        ts: new Date().toISOString(),
        category: 'llm',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
      };

      const result = MeteringEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });
  });

  describe('UsageAggregateSchema', () => {
    it('validates a valid aggregate', () => {
      const aggregate = {
        tenant_id: 'tenant-123',
        period_start: new Date().toISOString(),
        period_end: new Date().toISOString(),
        total_runs: 10,
        total_llm_calls: 50,
        total_tokens: { input: 1000, output: 2000, total: 3000 },
        total_latency_ms: 5000,
        total_cost_usd: 0.15,
        by_provider: {
          anthropic: { calls: 30, tokens: 2000, cost_usd: 0.10 },
          openai: { calls: 20, tokens: 1000, cost_usd: 0.05 },
        },
        by_model: {
          'claude-3-sonnet': { calls: 30, tokens: 2000, cost_usd: 0.10 },
        },
        updated_at: new Date().toISOString(),
      };

      const result = UsageAggregateSchema.safeParse(aggregate);
      expect(result.success).toBe(true);
    });
  });

  describe('PlanSchema', () => {
    it('validates all default plans', () => {
      for (const plan of DEFAULT_PLANS) {
        const result = PlanSchema.safeParse(plan);
        expect(result.success).toBe(true);
      }
    });

    it('has four plan tiers', () => {
      expect(DEFAULT_PLANS).toHaveLength(4);
      expect(DEFAULT_PLANS.map((p) => p.tier)).toEqual([
        'free',
        'starter',
        'professional',
        'enterprise',
      ]);
    });
  });
});

// =============================================================================
// Validation Helper Tests
// =============================================================================

describe('Validation Helpers', () => {
  describe('validateMeteringEvent', () => {
    it('returns valid: true for valid events', () => {
      const event = {
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d482',
        tenant_id: 'tenant-123',
        ts: new Date().toISOString(),
        category: 'llm',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
      };

      const result = validateMeteringEvent(event);
      expect(result.valid).toBe(true);
      expect(result.event).toBeDefined();
    });

    it('returns errors for invalid events', () => {
      const event = {
        id: 'not-a-uuid',
        tenant_id: 'tenant-123',
        ts: new Date().toISOString(),
        category: 'llm',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
      };

      const result = validateMeteringEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('validateUsageAggregate', () => {
    it('returns valid: true for valid aggregates', () => {
      const aggregate = {
        tenant_id: 'tenant-123',
        period_start: new Date().toISOString(),
        period_end: new Date().toISOString(),
        total_runs: 0,
        total_llm_calls: 0,
        total_tokens: { input: 0, output: 0, total: 0 },
        total_latency_ms: 0,
        total_cost_usd: 0,
        by_provider: {},
        by_model: {},
        updated_at: new Date().toISOString(),
      };

      const result = validateUsageAggregate(aggregate);
      expect(result.valid).toBe(true);
    });
  });

  describe('Plan lookup helpers', () => {
    it('getPlanById finds plans by ID', () => {
      expect(getPlanById('free')).toBeDefined();
      expect(getPlanById('free')?.tier).toBe('free');
      expect(getPlanById('professional')?.tier).toBe('professional');
      expect(getPlanById('nonexistent')).toBeUndefined();
    });

    it('getPlanByTier finds plans by tier', () => {
      expect(getPlanByTier('free')).toBeDefined();
      expect(getPlanByTier('enterprise')?.name).toBe('Enterprise');
    });
  });
});

// =============================================================================
// MeteringService Tests
// =============================================================================

describe('MeteringService', () => {
  let service: MeteringService;
  let storage: InMemoryMeteringStorage;

  beforeEach(() => {
    storage = new InMemoryMeteringStorage();
    service = new MeteringService({ storage });
  });

  describe('recordLLMUsage (A11.s1)', () => {
    it('records LLM usage with tokens', async () => {
      const event = await service.recordLLMUsage({
        tenantId: 'tenant-123',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        tokens: {
          input_tokens: 100,
          output_tokens: 200,
          total_tokens: 300,
        },
        latencyMs: 500,
        costUsdEstimate: 0.003,
      });

      expect(event.id).toBeDefined();
      expect(event.tenant_id).toBe('tenant-123');
      expect(event.category).toBe('llm');
      expect(event.tokens?.total_tokens).toBe(300);

      const allEvents = storage.getAllEvents();
      expect(allEvents).toHaveLength(1);
    });

    it('records LLM usage with run ID', async () => {
      const event = await service.recordLLMUsage({
        tenantId: 'tenant-123',
        runId: 'run-456',
        provider: 'openai',
        model: 'gpt-4',
        tokens: { prompt_tokens: 50, completion_tokens: 100 },
      });

      expect(event.run_id).toBe('run-456');
    });

    it('records LLM usage with user ID', async () => {
      const event = await service.recordLLMUsage({
        tenantId: 'tenant-123',
        userId: 'user-789',
        provider: 'google',
        model: 'gemini-pro',
      });

      expect(event.user_id).toBe('user-789');
    });
  });

  describe('recordRunEvent (A11.s2)', () => {
    it('records run start event', async () => {
      const event = await service.recordRunEvent({
        tenantId: 'tenant-123',
        runId: 'run-456',
        runType: 'triage',
        status: 'started',
      });

      expect(event.category).toBe('compute');
      expect(event.run_id).toBe('run-456');
      expect(event.metadata?.status).toBe('started');
    });

    it('records run completion with duration', async () => {
      const event = await service.recordRunEvent({
        tenantId: 'tenant-123',
        runId: 'run-456',
        runType: 'autopilot',
        status: 'completed',
        durationMs: 30000,
      });

      expect(event.latency_ms).toBe(30000);
      expect(event.metadata?.status).toBe('completed');
    });
  });

  describe('computeAggregate (A11.s3)', () => {
    it('computes aggregate from events', async () => {
      // Record some events
      await service.recordLLMUsage({
        tenantId: 'tenant-123',
        runId: 'run-1',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        tokens: { input_tokens: 100, output_tokens: 200, total_tokens: 300 },
        latencyMs: 500,
        costUsdEstimate: 0.003,
      });

      await service.recordLLMUsage({
        tenantId: 'tenant-123',
        runId: 'run-1',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        tokens: { input_tokens: 50, output_tokens: 150, total_tokens: 200 },
        latencyMs: 300,
        costUsdEstimate: 0.002,
      });

      await service.recordLLMUsage({
        tenantId: 'tenant-123',
        runId: 'run-2',
        provider: 'openai',
        model: 'gpt-4',
        tokens: { prompt_tokens: 200, completion_tokens: 300, total_tokens: 500 },
        latencyMs: 1000,
        costUsdEstimate: 0.01,
      });

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const aggregate = await service.computeAggregate('tenant-123', periodStart, periodEnd);

      expect(aggregate.tenant_id).toBe('tenant-123');
      expect(aggregate.total_runs).toBe(2); // 2 unique run IDs
      expect(aggregate.total_llm_calls).toBe(3);
      expect(aggregate.total_tokens.total).toBe(1000); // 300 + 200 + 500
      expect(aggregate.total_latency_ms).toBe(1800); // 500 + 300 + 1000
      expect(aggregate.total_cost_usd).toBeCloseTo(0.015, 4);
    });

    it('aggregates by provider', async () => {
      await service.recordLLMUsage({
        tenantId: 'tenant-123',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        tokens: { total_tokens: 100 },
        costUsdEstimate: 0.001,
      });

      await service.recordLLMUsage({
        tenantId: 'tenant-123',
        provider: 'openai',
        model: 'gpt-4',
        tokens: { total_tokens: 200 },
        costUsdEstimate: 0.002,
      });

      const aggregate = await service.getCurrentAggregate('tenant-123');

      expect(aggregate.by_provider).toHaveProperty('anthropic');
      expect(aggregate.by_provider).toHaveProperty('openai');
      expect(aggregate.by_provider.anthropic.calls).toBe(1);
      expect(aggregate.by_provider.openai.calls).toBe(1);
    });

    it('aggregates by model', async () => {
      await service.recordLLMUsage({
        tenantId: 'tenant-123',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        tokens: { total_tokens: 100 },
      });

      await service.recordLLMUsage({
        tenantId: 'tenant-123',
        provider: 'anthropic',
        model: 'claude-3-opus',
        tokens: { total_tokens: 200 },
      });

      const aggregate = await service.getCurrentAggregate('tenant-123');

      expect(aggregate.by_model).toHaveProperty('claude-3-sonnet');
      expect(aggregate.by_model).toHaveProperty('claude-3-opus');
    });
  });

  describe('Plan Management', () => {
    it('sets and gets tenant plan', () => {
      service.setTenantPlan('tenant-123', 'professional');
      const plan = service.getTenantPlan('tenant-123');

      expect(plan.id).toBe('professional');
      expect(plan.tier).toBe('professional');
    });

    it('defaults to free plan', () => {
      const plan = service.getTenantPlan('new-tenant');
      expect(plan.id).toBe('free');
    });
  });

  describe('getPlanUsageStatus', () => {
    it('returns usage status with percentages', async () => {
      service.setTenantPlan('tenant-123', 'free');

      // Record some usage
      await service.recordLLMUsage({
        tenantId: 'tenant-123',
        runId: 'run-1',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        tokens: { total_tokens: 25000 }, // 50% of free plan's 50k
      });

      const status = await service.getPlanUsageStatus('tenant-123');

      expect(status.plan.id).toBe('free');
      expect(status.token_usage_percent).toBe(50);
      expect(status.tokens_remaining).toBe(25000);
      expect(status.runs_remaining).toBe(9); // 10 - 1
    });

    it('detects soft limit reached at 80%', async () => {
      service.setTenantPlan('tenant-123', 'free');

      // Record 80%+ usage
      await service.recordLLMUsage({
        tenantId: 'tenant-123',
        runId: 'run-1',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        tokens: { total_tokens: 42000 }, // 84% of 50k
      });

      const status = await service.getPlanUsageStatus('tenant-123');

      expect(status.soft_limit_reached).toBe(true);
      expect(status.hard_limit_reached).toBe(false);
    });

    it('detects hard limit reached at 100%', async () => {
      service.setTenantPlan('tenant-123', 'free');

      // Record 100%+ usage
      await service.recordLLMUsage({
        tenantId: 'tenant-123',
        runId: 'run-1',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        tokens: { total_tokens: 55000 }, // 110% of 50k
      });

      const status = await service.getPlanUsageStatus('tenant-123');

      expect(status.hard_limit_reached).toBe(true);
      expect(status.token_usage_percent).toBe(100); // Capped at 100
    });
  });

  describe('checkLimits (A11.s5 Budget Guardrails)', () => {
    it('allows when under limits', async () => {
      service.setTenantPlan('tenant-123', 'professional');

      const result = await service.checkLimits('tenant-123');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('blocks when at hard limit', async () => {
      service.setTenantPlan('tenant-123', 'free');

      // Exceed token limit
      await service.recordLLMUsage({
        tenantId: 'tenant-123',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        tokens: { total_tokens: 60000 }, // Over 50k limit
      });

      const result = await service.checkLimits('tenant-123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Plan limit reached');
      expect(result.reason).toContain('Upgrade');
    });

    it('blocks when run limit exceeded', async () => {
      service.setTenantPlan('tenant-123', 'free'); // 10 run limit

      // Record 11 runs
      for (let i = 0; i < 11; i++) {
        await service.recordLLMUsage({
          tenantId: 'tenant-123',
          runId: `run-${i}`,
          provider: 'anthropic',
          model: 'claude-3-sonnet',
          tokens: { total_tokens: 100 },
        });
      }

      const result = await service.checkLimits('tenant-123');

      expect(result.allowed).toBe(false);
      expect(result.status.hard_limit_reached).toBe(true);
    });
  });
});

// =============================================================================
// InMemoryMeteringStorage Tests
// =============================================================================

describe('InMemoryMeteringStorage', () => {
  let storage: InMemoryMeteringStorage;

  beforeEach(() => {
    storage = new InMemoryMeteringStorage();
  });

  it('records and retrieves events', async () => {
    const event = {
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d483',
      tenant_id: 'tenant-123',
      ts: new Date().toISOString(),
      category: 'llm' as const,
      provider: 'anthropic',
      model: 'claude-3-sonnet',
    };

    await storage.recordEvent(event);

    const events = await storage.getEvents(
      'tenant-123',
      new Date(Date.now() - 60000),
      new Date(Date.now() + 60000)
    );

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(event.id);
  });

  it('filters events by tenant', async () => {
    const event1 = {
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d484',
      tenant_id: 'tenant-a',
      ts: new Date().toISOString(),
      category: 'llm' as const,
      provider: 'anthropic',
      model: 'claude-3-sonnet',
    };

    const event2 = {
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d485',
      tenant_id: 'tenant-b',
      ts: new Date().toISOString(),
      category: 'llm' as const,
      provider: 'anthropic',
      model: 'claude-3-sonnet',
    };

    await storage.recordEvent(event1);
    await storage.recordEvent(event2);

    const eventsA = await storage.getEvents(
      'tenant-a',
      new Date(Date.now() - 60000),
      new Date(Date.now() + 60000)
    );

    expect(eventsA).toHaveLength(1);
    expect(eventsA[0].tenant_id).toBe('tenant-a');
  });

  it('saves and retrieves aggregates', async () => {
    const aggregate = {
      tenant_id: 'tenant-123',
      period_start: new Date().toISOString(),
      period_end: new Date().toISOString(),
      total_runs: 5,
      total_llm_calls: 25,
      total_tokens: { input: 500, output: 1000, total: 1500 },
      total_latency_ms: 10000,
      total_cost_usd: 0.05,
      by_provider: {},
      by_model: {},
      updated_at: new Date().toISOString(),
    };

    await storage.saveAggregate(aggregate);

    const retrieved = await storage.getAggregate(
      'tenant-123',
      new Date(aggregate.period_start),
      new Date(aggregate.period_end)
    );

    expect(retrieved).toEqual(aggregate);
  });

  it('clears all data', async () => {
    await storage.recordEvent({
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d486',
      tenant_id: 'tenant-123',
      ts: new Date().toISOString(),
      category: 'llm' as const,
      provider: 'anthropic',
      model: 'claude-3-sonnet',
    });

    storage.clear();

    const events = storage.getAllEvents();
    expect(events).toHaveLength(0);
  });
});
