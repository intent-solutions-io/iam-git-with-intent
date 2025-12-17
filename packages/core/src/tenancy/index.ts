/**
 * Multi-Tenancy Module
 *
 * Phase 5: Core primitives for multi-tenant SaaS operations.
 *
 * This module provides:
 * - TenantContext/ActorContext for identity propagation
 * - PolicyEngine for policy-as-code decisions
 * - ConnectorConfigStore for tenant-scoped configuration
 *
 * @module @gwi/core/tenancy
 */

// Context types and helpers
export {
  ActorType,
  RequestSource,
  ActorContext,
  TenantContext,
  ExecutionContext,
  createCliActor,
  createServiceActor,
  createGitHubAppActor,
  createTenantContext,
  createExecutionContext,
  validateTenantContext,
  isActorType,
  isFromSource,
} from './context.js';

// Policy engine
export {
  PolicyReasonCode,
  PolicyDecision,
  PolicyRule,
  PolicyDocument,
  PolicyRequest,
  InMemoryPolicyEngine,
  createDefaultPolicy,
  createDevPolicy,
  createPolicyRequest,
  getPolicyEngine,
  setPolicyEngine,
} from './policy.js';

export type { PolicyEngine } from './policy.js';

// Config store
export {
  ConnectorConfig,
  TenantConfig,
  ConfigNotFoundError,
  ConfigValidationError,
  MemoryConfigStore,
  LocalConfigStore,
  getConfigStore,
  setConfigStore,
  resolveSecrets,
  createTestTenantConfig,
} from './config-store.js';

export type { ConnectorConfigStore } from './config-store.js';
