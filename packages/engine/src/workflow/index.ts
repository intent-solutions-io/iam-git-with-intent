/**
 * Workflow Module
 *
 * C1: DAG-based workflow definitions with Zod validation and YAML parsing.
 *
 * This module provides:
 * - Workflow definition schemas (schema.ts)
 * - DAG validation (validation.ts)
 * - YAML/JSON parsing (parser.ts)
 * - Graph operations (graph.ts)
 *
 * @module @gwi/engine/workflow
 */

// Schema exports - Zod schemas and types for workflow definitions
export * from './schema.js';

// Validation exports - DAG validation and error handling
export * from './validation.js';

// Parser exports - YAML/JSON parsing with validation
export * from './parser.js';

// Graph exports - DAG operations for execution planning
export * from './graph.js';
