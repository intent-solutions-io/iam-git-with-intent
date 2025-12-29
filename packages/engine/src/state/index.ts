/**
 * Step State Module
 *
 * C2: Persistent step state management for Cloud Run resilience.
 * Provides storage interfaces and implementations for step execution state.
 *
 * This module provides:
 * - Step state types and schemas (types.ts)
 * - Store interface definition (step-state-store.ts)
 * - In-memory implementation for testing (memory-step-state.ts)
 * - Firestore implementation for production (firestore-step-state.ts)
 *
 * @module @gwi/engine/state
 */

// Type exports
export * from './types.js';

// Store interface exports
export * from './step-state-store.js';

// Implementation exports
export * from './memory-step-state.js';
export * from './firestore-step-state.js';
