/**
 * Connector SDK Types
 *
 * Phase 3: Defines the core contracts for building connectors.
 * Phase 5: Extended with tenant-aware policy integration.
 *
 * After this phase, adding new connectors (Zendesk, Airbyte, etc.)
 * is mostly wiring + schemas, not new architecture.
 *
 * @module @gwi/core/connectors
 */

import { z } from 'zod';
import { TenantContext as TenantContextSchema } from '../tenancy/context.js';

// =============================================================================
// Tool Policy Classification
// =============================================================================

/**
 * Policy classification for tool operations.
 *
 * Determines what level of authorization is required:
 * - READ: No authorization needed, read-only operations
 * - WRITE_NON_DESTRUCTIVE: Allowed by default (comments, labels, check-runs)
 * - DESTRUCTIVE: Requires explicit approval (branch creation, push, PR create)
 */
export const ToolPolicyClass = z.enum([
  'READ',
  'WRITE_NON_DESTRUCTIVE',
  'DESTRUCTIVE',
]);

export type ToolPolicyClass = z.infer<typeof ToolPolicyClass>;

// =============================================================================
// Tool Invocation Context
// =============================================================================

/**
 * Context provided to tool invocations
 */
export const ToolContext = z.object({
  /** Run ID for audit trail */
  runId: z.string().uuid(),

  /** Tenant ID for multi-tenant isolation */
  tenantId: z.string(),

  /** Approval record (required for DESTRUCTIVE operations) */
  approval: z.object({
    runId: z.string().uuid(),
    approvedAt: z.string().datetime(),
    approvedBy: z.string(),
    scope: z.array(z.enum(['commit', 'push', 'open_pr', 'merge'])),
    patchHash: z.string(),
    comment: z.string().optional(),
  }).optional(),

  /** Additional metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type ToolContext = z.infer<typeof ToolContext>;

// =============================================================================
// Tool Specification
// =============================================================================

/**
 * Tool specification - defines a single operation a connector can perform.
 *
 * Every tool must have:
 * - name: Unique identifier within the connector
 * - description: Human-readable description
 * - inputSchema: Zod schema for input validation
 * - outputSchema: Zod schema for output validation
 * - policyClass: Authorization level required
 * - invoke: The actual implementation
 */
export interface ToolSpec<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput extends z.ZodTypeAny = z.ZodTypeAny,
> {
  /** Unique tool name within the connector (e.g., "github.createComment") */
  name: string;

  /** Human-readable description */
  description: string;

  /** Zod schema for input validation */
  inputSchema: TInput;

  /** Zod schema for output validation */
  outputSchema: TOutput;

  /** Policy classification */
  policyClass: ToolPolicyClass;

  /**
   * Execute the tool operation
   *
   * @param ctx - Tool invocation context
   * @param input - Validated input
   * @returns Promise resolving to validated output
   */
  invoke: (ctx: ToolContext, input: z.infer<TInput>) => Promise<z.infer<TOutput>>;
}

// =============================================================================
// Connector Interface
// =============================================================================

/**
 * Connector - a collection of tools for a specific integration.
 *
 * Examples:
 * - GitHubConnector: github.createComment, github.createBranch, etc.
 * - ZendeskConnector: zendesk.createTicket, zendesk.updateTicket, etc.
 * - AirbyteConnector: airbyte.sync, airbyte.checkStatus, etc.
 */
export interface Connector {
  /** Unique connector identifier (e.g., "github", "zendesk") */
  id: string;

  /** Semantic version */
  version: string;

  /** Human-readable name */
  displayName: string;

  /** Get all tools provided by this connector */
  tools(): ToolSpec[];

  /** Get a specific tool by name */
  getTool(name: string): ToolSpec | undefined;

  /**
   * Optional health check
   * @returns true if the connector is healthy
   */
  healthcheck?(): Promise<boolean>;
}

// =============================================================================
// Tool Invocation Request/Response
// =============================================================================

/**
 * Request to invoke a tool
 *
 * Phase 5: Extended with optional TenantContext for policy engine integration.
 */
export const ToolInvocationRequest = z.object({
  /** Run ID for audit trail */
  runId: z.string().uuid(),

  /** Tenant ID for multi-tenant isolation */
  tenantId: z.string(),

  /** Full tool name (connector.toolName, e.g., "github.createComment") */
  toolName: z.string(),

  /** Tool input (validated against tool's inputSchema) */
  input: z.unknown(),

  /** Approval record (required for DESTRUCTIVE operations) */
  approval: z.object({
    runId: z.string().uuid(),
    approvedAt: z.string().datetime(),
    approvedBy: z.string(),
    scope: z.array(z.enum(['commit', 'push', 'open_pr', 'merge'])),
    patchHash: z.string(),
    comment: z.string().optional(),
  }).optional(),

  /** Tenant context (Phase 5: for policy engine evaluation) */
  tenant: TenantContextSchema.optional(),
});

export type ToolInvocationRequest = z.infer<typeof ToolInvocationRequest>;

/**
 * Result of a tool invocation
 */
export const ToolInvocationResult = z.object({
  /** Whether the invocation succeeded */
  success: z.boolean(),

  /** Tool output (validated against tool's outputSchema) */
  output: z.unknown().optional(),

  /** Error message if failed */
  error: z.string().optional(),

  /** Error code for programmatic handling */
  errorCode: z.enum([
    'VALIDATION_ERROR',
    'POLICY_DENIED',
    'EXECUTION_ERROR',
    'TOOL_NOT_FOUND',
    'CONNECTOR_NOT_FOUND',
  ]).optional(),

  /** Audit event IDs generated during invocation */
  auditEventIds: z.array(z.string()).optional(),

  /** Duration in milliseconds */
  durationMs: z.number().optional(),
});

export type ToolInvocationResult = z.infer<typeof ToolInvocationResult>;

// =============================================================================
// Audit Event Types for Tool Invocations
// =============================================================================

/**
 * Audit event for tool invocations
 *
 * Phase 5: Extended with tenant-aware fields (actorId, policyReasonCode, approvalRef)
 */
export const ToolAuditEvent = z.object({
  /** Event type */
  type: z.enum([
    'tool_invocation_requested',
    'tool_invocation_validated',
    'tool_invocation_policy_checked',
    'tool_invocation_succeeded',
    'tool_invocation_failed',
  ]),

  /** Timestamp */
  timestamp: z.string().datetime(),

  /** Run ID */
  runId: z.string().uuid(),

  /** Tenant ID */
  tenantId: z.string(),

  /** Actor ID (Phase 5: who initiated this invocation) */
  actorId: z.string().optional(),

  /** Tool name */
  toolName: z.string(),

  /** Policy class */
  policyClass: ToolPolicyClass,

  /** Input hash (for audit, not full input) */
  inputHash: z.string().optional(),

  /** Whether policy check passed */
  policyPassed: z.boolean().optional(),

  /** Policy reason code (Phase 5: standardized reason from PolicyEngine) */
  policyReasonCode: z.string().optional(),

  /** Error message if failed */
  error: z.string().optional(),

  /** Duration in milliseconds */
  durationMs: z.number().optional(),

  /** Approval reference (Phase 5: if present, links to approval record) */
  approvalRef: z.string().optional(),
});

export type ToolAuditEvent = z.infer<typeof ToolAuditEvent>;

// =============================================================================
// Connector Registry Interface
// =============================================================================

/**
 * Registry for managing connectors
 */
export interface ConnectorRegistry {
  /** Register a connector */
  register(connector: Connector): void;

  /** Get a connector by ID */
  get(id: string): Connector | undefined;

  /** Get all registered connectors */
  list(): Connector[];

  /** Check if a connector is registered */
  has(id: string): boolean;
}

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Extract input type from a ToolSpec
 */
export type ToolInput<T extends ToolSpec> = z.infer<T['inputSchema']>;

/**
 * Extract output type from a ToolSpec
 */
export type ToolOutput<T extends ToolSpec> = z.infer<T['outputSchema']>;

/**
 * Create a typed tool spec helper
 */
export function defineToolSpec<
  TInput extends z.ZodTypeAny,
  TOutput extends z.ZodTypeAny,
>(spec: ToolSpec<TInput, TOutput>): ToolSpec<TInput, TOutput> {
  return spec;
}
