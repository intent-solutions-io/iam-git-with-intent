/**
 * @gwi/core - Core utilities for Git With Intent
 *
 * This module provides the foundational integrations:
 * - Storage: Pluggable storage backends (SQLite default, Firestore for production)
 * - A2A: Agent-to-Agent protocol types and utilities
 * - Models: Multi-model client abstraction
 */

// Storage exports (primary source for storage types)
export * from './storage/index.js';

// A2A exports
export * from './a2a/index.js';

// Model exports
export * from './models/index.js';

// Type exports (exclude ConflictInfo and PRMetadata which are in storage/interfaces)
export type {
  AgentId,
  ModelProvider,
  ModelConfig,
  ComplexityScore,
  RouteDecision,
  ResolutionResult,
  ReviewResult,
} from './types.js';

// Security exports (Phase 11: Production-ready RBAC and plan enforcement)
export * from './security/index.js';

// Workflow exports (Phase 13: Multi-agent workflow definitions)
export * from './workflows/index.js';

// Plugin system exports (Phase 14: Extensibility)
export * from './plugins/index.js';

// Billing exports (Phase 15: Launch Prep)
export * from './billing/index.js';

// Workspace exports (Phase 4: Sandboxed workspace for code generation)
export * from './workspace.js';

// Run Bundle exports (Phase 17: Agent Execution Backbone)
export * from './run-bundle/index.js';

// Scoring exports (Phase 17: Deterministic complexity scoring)
export * from './scoring/index.js';

// Capabilities exports (Phase 17: Approval-gated GitHub operations)
export * from './capabilities/index.js';

// Connector SDK exports (Phase 3: Unified connector framework)
export * from './connectors/index.js';

// Multi-tenancy exports (Phase 5: SaaS multi-tenancy + policy-as-code)
export * from './tenancy/index.js';
