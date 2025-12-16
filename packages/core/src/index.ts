/**
 * @gwi/core - Core utilities for Git With Intent
 *
 * This module provides the foundational integrations:
 * - Storage: Pluggable storage backends (SQLite default)
 * - A2A: Agent-to-Agent protocol types and utilities
 * - Models: Multi-model client abstraction
 *
 * IMPORTANT: AgentFS and Beads are available but OPTIONAL.
 * They are for internal development only - the product runtime
 * works without them using the Storage interfaces.
 */

// Primary exports - always available
export * from './storage/index.js';
export * from './a2a/index.js';
export * from './models/index.js';
export * from './types.js';

// Optional internal tools (require GWI_USE_AGENTFS=true or GWI_USE_BEADS=true)
export * from './agentfs/index.js';
export * from './beads/index.js';
