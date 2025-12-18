/**
 * Phase 28: Metering Types
 *
 * Provider-agnostic usage metering types.
 * Supports any LLM provider (Anthropic, OpenAI, Google, Ollama, vLLM, etc.)
 */

import { z } from 'zod';

// =============================================================================
// Usage Event Categories
// =============================================================================

/**
 * Usage event categories
 */
export const UsageCategory = z.enum([
  'llm',        // LLM API calls
  'tool',       // Tool invocations
  'storage',    // Storage operations
  'compute',    // Compute operations
  'other',      // Other billable events
]);
export type UsageCategory = z.infer<typeof UsageCategory>;

// =============================================================================
// Usage Event Schema
// =============================================================================

/**
 * Token usage schema (flexible for any provider)
 */
export const TokenUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
  total_tokens: z.number().int().nonnegative().optional(),
  // Some providers use these names instead
  prompt_tokens: z.number().int().nonnegative().optional(),
  completion_tokens: z.number().int().nonnegative().optional(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/**
 * Metering event schema - provider agnostic
 * (Named MeteringEvent to avoid collision with billing.UsageEvent)
 */
export const MeteringEventSchema = z.object({
  /** Event ID */
  id: z.string().uuid(),

  /** Tenant ID */
  tenant_id: z.string().min(1),

  /** User ID (optional, for user-level tracking) */
  user_id: z.string().optional(),

  /** Run ID (optional, links to ForensicBundle) */
  run_id: z.string().optional(),

  /** Workflow ID (optional) */
  workflow_id: z.string().optional(),

  /** Timestamp */
  ts: z.string().datetime(),

  /** Category of usage */
  category: UsageCategory,

  /** Provider name (freeform string - any provider) */
  provider: z.string(),

  /** Model name (freeform string - any model) */
  model: z.string(),

  /** Token counts */
  tokens: TokenUsageSchema.optional(),

  /** Latency in milliseconds */
  latency_ms: z.number().int().nonnegative().optional(),

  /** Cost estimate in USD (may be 0 or undefined initially) */
  cost_usd_estimate: z.number().nonnegative().optional(),

  /** Request ID from provider */
  request_id: z.string().optional(),

  /** Custom metadata */
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type MeteringEvent = z.infer<typeof MeteringEventSchema>;

// =============================================================================
// Usage Aggregation
// =============================================================================

/**
 * Aggregated usage for a billing period
 */
export const UsageAggregateSchema = z.object({
  /** Tenant ID */
  tenant_id: z.string().min(1),

  /** Period start (ISO timestamp) */
  period_start: z.string().datetime(),

  /** Period end (ISO timestamp) */
  period_end: z.string().datetime(),

  /** Total runs in period */
  total_runs: z.number().int().nonnegative(),

  /** Total LLM calls */
  total_llm_calls: z.number().int().nonnegative(),

  /** Total tokens */
  total_tokens: z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),

  /** Total latency in ms */
  total_latency_ms: z.number().int().nonnegative(),

  /** Estimated cost in USD */
  total_cost_usd: z.number().nonnegative(),

  /** Breakdown by provider */
  by_provider: z.record(z.string(), z.object({
    calls: z.number().int().nonnegative(),
    tokens: z.number().int().nonnegative(),
    cost_usd: z.number().nonnegative(),
  })),

  /** Breakdown by model */
  by_model: z.record(z.string(), z.object({
    calls: z.number().int().nonnegative(),
    tokens: z.number().int().nonnegative(),
    cost_usd: z.number().nonnegative(),
  })),

  /** Updated timestamp */
  updated_at: z.string().datetime(),
});
export type UsageAggregate = z.infer<typeof UsageAggregateSchema>;

// =============================================================================
// Plan Limits
// =============================================================================

/**
 * Plan definition
 */
export const PlanSchema = z.object({
  /** Plan ID */
  id: z.string().min(1),

  /** Plan name */
  name: z.string().min(1),

  /** Plan tier */
  tier: z.enum(['free', 'starter', 'professional', 'enterprise']),

  /** Monthly price in USD (0 for free) */
  price_usd: z.number().nonnegative(),

  /** Stripe price ID (for paid plans) */
  stripe_price_id: z.string().optional(),

  /** Token limit per month */
  token_limit: z.number().int().nonnegative(),

  /** Run limit per month */
  run_limit: z.number().int().nonnegative(),

  /** API rate limit (requests per minute) */
  rate_limit_rpm: z.number().int().positive(),

  /** Features included */
  features: z.array(z.string()),

  /** Whether this plan is active */
  active: z.boolean().default(true),
});
export type Plan = z.infer<typeof PlanSchema>;

/**
 * Plan usage status
 */
export const PlanUsageStatusSchema = z.object({
  /** Current plan */
  plan: PlanSchema,

  /** Token usage percentage (0-100) */
  token_usage_percent: z.number().min(0).max(100),

  /** Run usage percentage (0-100) */
  run_usage_percent: z.number().min(0).max(100),

  /** Whether soft limit reached (80%) */
  soft_limit_reached: z.boolean(),

  /** Whether hard limit reached (100%) */
  hard_limit_reached: z.boolean(),

  /** Tokens remaining */
  tokens_remaining: z.number().int(),

  /** Runs remaining */
  runs_remaining: z.number().int(),

  /** Period reset date */
  period_resets_at: z.string().datetime(),
});
export type PlanUsageStatus = z.infer<typeof PlanUsageStatusSchema>;

// =============================================================================
// Default Plans
// =============================================================================

export const DEFAULT_PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    tier: 'free',
    price_usd: 0,
    token_limit: 50000,
    run_limit: 10,
    rate_limit_rpm: 10,
    features: ['Basic PR review', 'Limited triage'],
    active: true,
  },
  {
    id: 'starter',
    name: 'Starter',
    tier: 'starter',
    price_usd: 29,
    stripe_price_id: 'price_starter_monthly',
    token_limit: 500000,
    run_limit: 100,
    rate_limit_rpm: 30,
    features: ['Full PR review', 'Triage', 'Basic autopilot'],
    active: true,
  },
  {
    id: 'professional',
    name: 'Professional',
    tier: 'professional',
    price_usd: 99,
    stripe_price_id: 'price_professional_monthly',
    token_limit: 2000000,
    run_limit: 500,
    rate_limit_rpm: 60,
    features: ['Full PR review', 'Triage', 'Autopilot', 'Custom policies', 'Priority support'],
    active: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tier: 'enterprise',
    price_usd: 499,
    stripe_price_id: 'price_enterprise_monthly',
    token_limit: 10000000,
    run_limit: 2000,
    rate_limit_rpm: 120,
    features: ['Unlimited features', 'Custom integrations', 'SLA', 'Dedicated support', 'Audit logs'],
    active: true,
  },
];

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate a metering event
 */
export function validateMeteringEvent(data: unknown): {
  valid: boolean;
  event?: MeteringEvent;
  errors?: string[];
} {
  const result = MeteringEventSchema.safeParse(data);
  if (result.success) {
    return { valid: true, event: result.data };
  }
  return {
    valid: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  };
}

/**
 * Validate a usage aggregate
 */
export function validateUsageAggregate(data: unknown): {
  valid: boolean;
  aggregate?: UsageAggregate;
  errors?: string[];
} {
  const result = UsageAggregateSchema.safeParse(data);
  if (result.success) {
    return { valid: true, aggregate: result.data };
  }
  return {
    valid: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  };
}

/**
 * Get plan by ID
 */
export function getPlanById(planId: string): Plan | undefined {
  return DEFAULT_PLANS.find(p => p.id === planId);
}

/**
 * Get plan by tier
 */
export function getPlanByTier(tier: Plan['tier']): Plan | undefined {
  return DEFAULT_PLANS.find(p => p.tier === tier);
}
