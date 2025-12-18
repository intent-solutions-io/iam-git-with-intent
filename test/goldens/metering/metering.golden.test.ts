/**
 * Phase 28: Metering Golden Tests
 *
 * Deterministic tests for MeteringEvent schema validation,
 * MeteringService, and plan limits.
 *
 * NO LIVE LLM CALLS - uses frozen fixtures only.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MeteringEventSchema,
  UsageAggregateSchema,
  PlanSchema,
  validateMeteringEvent,
  validateUsageAggregate,
  getPlanById,
  getPlanByTier,
  DEFAULT_PLANS,
  MeteringService,
  InMemoryMeteringStorage,
  isMeteringEnabled,
  type MeteringEvent,
  type UsageAggregate,
} from '@gwi/core';
import { randomUUID } from 'node:crypto';

// =============================================================================
// MeteringEvent Schema Validation
// =============================================================================

describe('MeteringEvent Schema Validation', () => {
  describe('Valid Events', () => {
    it('should validate a complete LLM metering event', () => {
      const event: MeteringEvent = {
        id: randomUUID(),
        tenant_id: 'tenant-123',
        user_id: 'user-456',
        run_id: 'run-789',
        workflow_id: 'workflow-abc',
        ts: new Date().toISOString(),
        category: 'llm',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        tokens: {
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
        },
        latency_ms: 500,
        cost_usd_estimate: 0.0015,
        request_id: 'req-xyz',
        metadata: { intent: 'code_review' },
      };

      const result = validateMeteringEvent(event);
      expect(result.valid).toBe(true);
      expect(result.event).toBeDefined();
    });

    it('should validate minimal LLM event', () => {
      const event = {
        id: randomUUID(),
        tenant_id: 'tenant-123',
        ts: new Date().toISOString(),
        category: 'llm',
        provider: 'openai',
        model: 'gpt-4-turbo',
      };

      const result = validateMeteringEvent(event);
      expect(result.valid).toBe(true);
    });

    it('should validate tool usage event', () => {
      const event = {
        id: randomUUID(),
        tenant_id: 'tenant-123',
        ts: new Date().toISOString(),
        category: 'tool',
        provider: 'gwi',
        model: 'file_search',
        latency_ms: 50,
      };

      const result = validateMeteringEvent(event);
      expect(result.valid).toBe(true);
    });

    it('should accept any provider string (provider-agnostic)', () => {
      const providers = ['anthropic', 'openai', 'google', 'ollama', 'vllm', 'lm-studio', 'custom-provider'];

      for (const provider of providers) {
        const event = {
          id: randomUUID(),
          tenant_id: 'tenant-123',
          ts: new Date().toISOString(),
          category: 'llm',
          provider,
          model: 'some-model',
        };

        const result = validateMeteringEvent(event);
        expect(result.valid).toBe(true);
      }
    });

    it('should accept any model string (model-agnostic)', () => {
      const models = ['claude-3-opus', 'gpt-4-turbo', 'gemini-2.0-flash', 'llama3:70b', 'mixtral-8x7b', 'my-custom-model'];

      for (const model of models) {
        const event = {
          id: randomUUID(),
          tenant_id: 'tenant-123',
          ts: new Date().toISOString(),
          category: 'llm',
          provider: 'custom',
          model,
        };

        const result = validateMeteringEvent(event);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('Invalid Events', () => {
    it('should reject event without tenant_id', () => {
      const event = {
        id: randomUUID(),
        ts: new Date().toISOString(),
        category: 'llm',
        provider: 'anthropic',
        model: 'claude-3',
      };

      const result = validateMeteringEvent(event);
      expect(result.valid).toBe(false);
    });

    it('should reject event with invalid category', () => {
      const event = {
        id: randomUUID(),
        tenant_id: 'tenant-123',
        ts: new Date().toISOString(),
        category: 'invalid_category',
        provider: 'anthropic',
        model: 'claude-3',
      };

      const result = validateMeteringEvent(event);
      expect(result.valid).toBe(false);
    });

    it('should reject event with invalid id', () => {
      const event = {
        id: 'not-a-uuid',
        tenant_id: 'tenant-123',
        ts: new Date().toISOString(),
        category: 'llm',
        provider: 'anthropic',
        model: 'claude-3',
      };

      const result = validateMeteringEvent(event);
      expect(result.valid).toBe(false);
    });

    it('should reject event with negative tokens', () => {
      const event = {
        id: randomUUID(),
        tenant_id: 'tenant-123',
        ts: new Date().toISOString(),
        category: 'llm',
        provider: 'anthropic',
        model: 'claude-3',
        tokens: {
          input_tokens: -100,
          output_tokens: 50,
        },
      };

      const result = validateMeteringEvent(event);
      expect(result.valid).toBe(false);
    });
  });
});

// =============================================================================
// MeteringService
// =============================================================================

describe('MeteringService', () => {
  let service: MeteringService;
  let storage: InMemoryMeteringStorage;

  beforeEach(() => {
    storage = new InMemoryMeteringStorage();
    service = new MeteringService({ storage });
  });

  describe('Event Recording', () => {
    it('should record LLM usage event', async () => {
      const event = await service.recordLLMUsage({
        tenantId: 'tenant-123',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        tokens: {
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
        },
        latencyMs: 500,
      });

      expect(event.id).toBeDefined();
      expect(event.tenant_id).toBe('tenant-123');
      expect(event.category).toBe('llm');
      expect(event.provider).toBe('anthropic');
      expect(event.model).toBe('claude-sonnet-4-20250514');

      const events = storage.getAllEvents();
      expect(events.length).toBe(1);
    });

    it('should record tool usage event', async () => {
      const event = await service.recordToolUsage({
        tenantId: 'tenant-123',
        toolName: 'file_search',
        latencyMs: 50,
      });

      expect(event.category).toBe('tool');
      expect(event.model).toBe('file_search');
    });

    it('should record run event', async () => {
      const event = await service.recordRunEvent({
        tenantId: 'tenant-123',
        runId: 'run-456',
        runType: 'AUTOPILOT',
        status: 'completed',
        durationMs: 30000,
      });

      expect(event.category).toBe('compute');
      expect(event.run_id).toBe('run-456');
    });
  });

  describe('Aggregation', () => {
    it('should compute aggregate for billing period', async () => {
      const tenantId = 'tenant-agg-test';
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      // Record some events
      await service.recordLLMUsage({
        tenantId,
        runId: 'run-1',
        provider: 'anthropic',
        model: 'claude-3',
        tokens: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
        latencyMs: 500,
        costUsdEstimate: 0.001,
      });

      await service.recordLLMUsage({
        tenantId,
        runId: 'run-1',
        provider: 'anthropic',
        model: 'claude-3',
        tokens: { input_tokens: 200, output_tokens: 100, total_tokens: 300 },
        latencyMs: 800,
        costUsdEstimate: 0.002,
      });

      await service.recordLLMUsage({
        tenantId,
        runId: 'run-2',
        provider: 'openai',
        model: 'gpt-4',
        tokens: { input_tokens: 150, output_tokens: 75, total_tokens: 225 },
        latencyMs: 600,
        costUsdEstimate: 0.003,
      });

      // Compute aggregate
      const aggregate = await service.computeAggregate(tenantId, periodStart, periodEnd);

      expect(aggregate.tenant_id).toBe(tenantId);
      expect(aggregate.total_llm_calls).toBe(3);
      expect(aggregate.total_runs).toBe(2);
      expect(aggregate.total_tokens.total).toBe(675);
      expect(aggregate.total_latency_ms).toBe(1900);
      expect(aggregate.total_cost_usd).toBeCloseTo(0.006);

      // Check provider breakdown
      expect(aggregate.by_provider['anthropic'].calls).toBe(2);
      expect(aggregate.by_provider['openai'].calls).toBe(1);

      // Check model breakdown
      expect(aggregate.by_model['claude-3'].calls).toBe(2);
      expect(aggregate.by_model['gpt-4'].calls).toBe(1);
    });
  });

  describe('Plan Limits', () => {
    it('should get plan by ID', () => {
      const plan = getPlanById('starter');
      expect(plan).toBeDefined();
      expect(plan?.name).toBe('Starter');
      expect(plan?.tier).toBe('starter');
    });

    it('should get plan by tier', () => {
      const plan = getPlanByTier('professional');
      expect(plan).toBeDefined();
      expect(plan?.name).toBe('Professional');
    });

    it('should return undefined for unknown plan', () => {
      const plan = getPlanById('nonexistent');
      expect(plan).toBeUndefined();
    });

    it('should get plan usage status', async () => {
      const tenantId = 'tenant-limits';
      service.setTenantPlan(tenantId, 'starter');

      // Record usage
      await service.recordLLMUsage({
        tenantId,
        runId: 'run-1',
        provider: 'anthropic',
        model: 'claude-3',
        tokens: { total_tokens: 100000 },
      });

      const status = await service.getPlanUsageStatus(tenantId);

      expect(status.plan.id).toBe('starter');
      expect(status.token_usage_percent).toBeGreaterThan(0);
      expect(status.run_usage_percent).toBeGreaterThan(0);
      expect(status.tokens_remaining).toBeLessThan(500000);
      expect(status.period_resets_at).toBeDefined();
    });

    it('should detect soft limit', async () => {
      const tenantId = 'tenant-soft-limit';
      service.setTenantPlan(tenantId, 'free'); // 50k token limit

      // Record usage near limit
      await service.recordLLMUsage({
        tenantId,
        runId: 'run-1',
        provider: 'anthropic',
        model: 'claude-3',
        tokens: { total_tokens: 45000 }, // 90% of 50k
      });

      const status = await service.getPlanUsageStatus(tenantId);
      expect(status.soft_limit_reached).toBe(true);
      expect(status.hard_limit_reached).toBe(false);
    });

    it('should detect hard limit', async () => {
      const tenantId = 'tenant-hard-limit';
      service.setTenantPlan(tenantId, 'free'); // 50k token limit

      // Record usage over limit
      await service.recordLLMUsage({
        tenantId,
        runId: 'run-1',
        provider: 'anthropic',
        model: 'claude-3',
        tokens: { total_tokens: 55000 }, // 110% of 50k
      });

      const status = await service.getPlanUsageStatus(tenantId);
      expect(status.hard_limit_reached).toBe(true);
    });

    it('should check limits before allowing action', async () => {
      const tenantId = 'tenant-check';
      service.setTenantPlan(tenantId, 'free');

      // Record usage to exceed limit FIRST (before any aggregate is computed)
      await service.recordLLMUsage({
        tenantId,
        runId: 'run-1',
        provider: 'anthropic',
        model: 'claude-3',
        tokens: { total_tokens: 55000 },
      });

      // Should be blocked because limit exceeded
      const result = await service.checkLimits(tenantId);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Plan limit reached');
    });

    it('should allow action when under limit', async () => {
      const tenantId = 'tenant-under-limit';
      service.setTenantPlan(tenantId, 'starter'); // 500k token limit

      // Record usage well under limit
      await service.recordLLMUsage({
        tenantId,
        runId: 'run-1',
        provider: 'anthropic',
        model: 'claude-3',
        tokens: { total_tokens: 10000 },
      });

      const result = await service.checkLimits(tenantId);
      expect(result.allowed).toBe(true);
    });
  });
});

// =============================================================================
// UsageAggregate Schema
// =============================================================================

describe('UsageAggregate Schema', () => {
  it('should validate a complete aggregate', () => {
    const aggregate: UsageAggregate = {
      tenant_id: 'tenant-123',
      period_start: '2025-01-01T00:00:00.000Z',
      period_end: '2025-01-31T23:59:59.999Z',
      total_runs: 50,
      total_llm_calls: 200,
      total_tokens: { input: 100000, output: 50000, total: 150000 },
      total_latency_ms: 100000,
      total_cost_usd: 15.50,
      by_provider: {
        'anthropic': { calls: 150, tokens: 100000, cost_usd: 10.00 },
        'openai': { calls: 50, tokens: 50000, cost_usd: 5.50 },
      },
      by_model: {
        'claude-3': { calls: 150, tokens: 100000, cost_usd: 10.00 },
        'gpt-4': { calls: 50, tokens: 50000, cost_usd: 5.50 },
      },
      updated_at: new Date().toISOString(),
    };

    const result = validateUsageAggregate(aggregate);
    expect(result.valid).toBe(true);
  });
});

// =============================================================================
// Plan Schema
// =============================================================================

describe('Plan Schema', () => {
  it('should have all default plans defined', () => {
    expect(DEFAULT_PLANS.length).toBe(4);
    expect(DEFAULT_PLANS.map(p => p.tier)).toEqual(['free', 'starter', 'professional', 'enterprise']);
  });

  it('should validate default plans', () => {
    for (const plan of DEFAULT_PLANS) {
      const result = PlanSchema.safeParse(plan);
      expect(result.success).toBe(true);
    }
  });

  it('should have increasing limits by tier', () => {
    const free = getPlanByTier('free')!;
    const starter = getPlanByTier('starter')!;
    const professional = getPlanByTier('professional')!;
    const enterprise = getPlanByTier('enterprise')!;

    expect(starter.token_limit).toBeGreaterThan(free.token_limit);
    expect(professional.token_limit).toBeGreaterThan(starter.token_limit);
    expect(enterprise.token_limit).toBeGreaterThan(professional.token_limit);
  });
});
