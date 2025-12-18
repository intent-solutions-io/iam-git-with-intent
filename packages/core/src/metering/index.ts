/**
 * Phase 28: Metering Module
 *
 * Provider-agnostic usage metering and billing.
 *
 * Feature flag: GWI_METERING_ENABLED=1 to enable
 */

// Types and Schema
export {
  UsageCategory,
  TokenUsageSchema,
  MeteringEventSchema,
  UsageAggregateSchema,
  PlanSchema,
  PlanUsageStatusSchema,
  DEFAULT_PLANS,
  validateMeteringEvent,
  validateUsageAggregate,
  getPlanById,
  getPlanByTier,
  type TokenUsage,
  type MeteringEvent,
  type UsageAggregate,
  type Plan,
  type PlanUsageStatus,
} from './types.js';

// Service
export {
  MeteringService,
  InMemoryMeteringStorage,
  getMeteringService,
  resetMeteringService,
  isMeteringEnabled,
  type MeteringConfig,
  type MeteringEventStorage,
} from './service.js';
