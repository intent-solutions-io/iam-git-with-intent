/**
 * Git With Intent - Agent Execution Engine
 *
 * This package provides the core execution engine for the Git With Intent
 * multi-agent pipeline. It includes:
 *
 * - Hook system for agent lifecycle events
 * - Run management (start, query, cancel)
 * - Configuration management
 * - Agent orchestration (future phases)
 *
 * @module @gwi/engine
 */

// Re-export hooks module
export * from './hooks/index.js';

// Re-export run module
export * from './run/index.js';
