/**
 * Connector SDK
 *
 * Phase 3: Unified connector framework for building integrations.
 * Phase 6: Extended with manifest schema and local registry.
 *
 * This module provides the core abstractions for:
 * - Defining tools with typed schemas
 * - Policy-based authorization (READ/WRITE_NON_DESTRUCTIVE/DESTRUCTIVE)
 * - Unified invocation pipeline with audit logging
 * - Conformance testing for connector validation
 * - Connector packaging and versioning (Phase 6)
 * - Local filesystem registry (Phase 6)
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

// Manifest schema (Phase 6)
export {
  ConnectorCapability,
  type ConnectorCapability as ConnectorCapabilityType,
  ManifestToolDef,
  type ManifestToolDef as ManifestToolDefType,
  ConnectorManifest,
  type ConnectorManifest as ConnectorManifestType,
  type ManifestValidationResult,
  validateManifest,
  parseManifest,
  getFullToolName,
  buildPolicyClassMap,
  createTestManifest,
} from './manifest.js';

// Local registry (Phase 6)
export {
  type InstalledConnector,
  type ConnectorLoadResult,
  type RegistryScanResult,
  computeChecksum,
  verifyChecksum,
  LocalConnectorRegistry,
  loadConnectorsIntoRegistry,
  getLocalConnectorRegistry,
  setLocalConnectorRegistry,
} from './registry.js';

// Connector loader (Phase 6)
export {
  type ConnectorLoaderOptions,
  type ConnectorLoaderResult,
  loadAllConnectors,
  loadConnector,
  unloadConnector,
  listInstalledConnectors,
} from './loader.js';
