/**
 * @gwi/core - Core utilities for Git With Intent
 *
 * This module provides the foundational integrations:
 * - Storage: Pluggable storage backends (SQLite default, Firestore for production)
 * - A2A: Agent-to-Agent protocol types and utilities
 * - Models: Multi-model client abstraction
 *
 * IMPORTANT: AgentFS and Beads are available but OPTIONAL.
 * They are for internal development only - the product runtime
 * works without them using the Storage interfaces.
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

// Optional internal tools (require GWI_USE_AGENTFS=true or GWI_USE_BEADS=true)
export * from './agentfs/index.js';
export * from './beads/index.js';
