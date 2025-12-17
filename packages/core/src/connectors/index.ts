/**
 * Connector SDK
 *
 * Phase 3: Unified connector framework for building integrations.
 *
 * This module provides the core abstractions for:
 * - Defining tools with typed schemas
 * - Policy-based authorization (READ/WRITE_NON_DESTRUCTIVE/DESTRUCTIVE)
 * - Unified invocation pipeline with audit logging
 * - Conformance testing for connector validation
 *
 * @module @gwi/core/connectors
 */

// Types and interfaces
export {
  type ToolPolicyClass,
  ToolPolicyClass as ToolPolicyClassSchema,
  type ToolContext,
  ToolContext as ToolContextSchema,
  type ToolSpec,
  type Connector,
  type ToolInvocationRequest,
  ToolInvocationRequest as ToolInvocationRequestSchema,
  type ToolInvocationResult,
  ToolInvocationResult as ToolInvocationResultSchema,
  type ToolAuditEvent,
  ToolAuditEvent as ToolAuditEventSchema,
  type ConnectorRegistry,
  type ToolInput,
  type ToolOutput,
  defineToolSpec,
} from './types.js';

// Invocation pipeline
export {
  invokeTool,
  DefaultConnectorRegistry,
  getConnectorRegistry,
  setConnectorRegistry,
} from './invoke.js';

// Conformance testing
export {
  type ConformanceTestResult,
  type ConformanceReport,
  runConformanceTests,
  assertConformance,
} from './conformance.js';
