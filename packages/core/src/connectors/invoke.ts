/**
 * Unified Tool Invocation Pipeline
 *
 * Phase 3: Single choke point for all tool invocations.
 * Phase 5: Integrated with tenant-aware policy engine.
 *
 * Every connector tool call MUST go through this pipeline.
 *
 * Pipeline steps:
 * 1. Validate input schema
 * 2. Write audit "tool_invocation_requested" (includes tenantId, actorId)
 * 3. Enforce policy gate via PolicyEngine (block DESTRUCTIVE without approval + policy allow)
 * 4. Execute tool
 * 5. Validate output schema
 * 6. Write audit "tool_invocation_succeeded/failed" (includes policyDecision)
 * 7. Return output
 *
 * @module @gwi/core/connectors/invoke
 */

import { createHash } from 'crypto';
import { z } from 'zod';
import {
  type ToolSpec,
  type ToolContext,
  type ToolInvocationRequest,
  type ToolInvocationResult,
  type ToolAuditEvent,
  type ConnectorRegistry,
} from './types.js';
import { appendAudit } from '../run-bundle/audit-log.js';
import {
  type TenantContext,
  type PolicyDecision,
  getPolicyEngine,
  createPolicyRequest,
} from '../tenancy/index.js';

// =============================================================================
// Policy Gate (Phase 5: Tenant-aware policy engine integration)
// =============================================================================

/**
 * Check if a tool invocation is allowed based on policy engine
 *
 * Phase 5: Uses the global PolicyEngine for tenant-aware decisions.
 * Returns both the decision and policy metadata for audit.
 */
function checkPolicyWithEngine(
  tool: ToolSpec,
  connectorId: string,
  ctx: ToolContext,
  tenant?: TenantContext
): PolicyDecision {
  const policyEngine = getPolicyEngine();

  // If no tenant context provided, fall back to simple policy check
  if (!tenant) {
    return checkPolicySimple(tool, ctx);
  }

  // Create policy request from tenant context
  const policyRequest = createPolicyRequest(
    tenant,
    tool.name,
    connectorId,
    tool.policyClass,
    {
      resource: tenant.repo?.fullName,
      hasApproval: !!ctx.approval,
    }
  );

  // Evaluate via policy engine
  const decision = policyEngine.evaluate(policyRequest);

  // Additional approval validation for DESTRUCTIVE operations
  if (tool.policyClass === 'DESTRUCTIVE' && decision.allowed && ctx.approval) {
    // Verify approval run ID matches
    if (ctx.approval.runId !== ctx.runId) {
      return {
        allowed: false,
        reasonCode: 'DENY_APPROVAL_MISMATCH',
        reason: 'Approval is for a different run',
      };
    }

    // Check approval scope covers required operations
    const requiredScope = getRequiredScope(tool.name);
    if (requiredScope && !ctx.approval.scope.includes(requiredScope)) {
      return {
        allowed: false,
        reasonCode: 'DENY_APPROVAL_MISMATCH',
        reason: `Approval does not include required scope '${requiredScope}'`,
      };
    }
  }

  return decision;
}

/**
 * Simple policy check (fallback when no tenant context)
 */
function checkPolicySimple(
  tool: ToolSpec,
  ctx: ToolContext
): PolicyDecision {
  const policyClass = tool.policyClass;

  // READ operations are always allowed
  if (policyClass === 'READ') {
    return {
      allowed: true,
      reasonCode: 'ALLOW_READ_DEFAULT',
      reason: 'Read operations are always allowed',
    };
  }

  // WRITE_NON_DESTRUCTIVE operations are allowed without approval
  if (policyClass === 'WRITE_NON_DESTRUCTIVE') {
    return {
      allowed: true,
      reasonCode: 'ALLOW_POLICY_MATCH',
      reason: 'Non-destructive writes are allowed',
    };
  }

  // DESTRUCTIVE operations require approval
  if (policyClass === 'DESTRUCTIVE') {
    if (!ctx.approval) {
      return {
        allowed: false,
        reasonCode: 'DENY_DESTRUCTIVE_NO_APPROVAL',
        reason: `Destructive operation '${tool.name}' requires approval`,
      };
    }

    // Verify approval run ID matches
    if (ctx.approval.runId !== ctx.runId) {
      return {
        allowed: false,
        reasonCode: 'DENY_APPROVAL_MISMATCH',
        reason: 'Approval is for a different run',
      };
    }

    // Check approval scope covers required operations
    const requiredScope = getRequiredScope(tool.name);
    if (requiredScope && !ctx.approval.scope.includes(requiredScope)) {
      return {
        allowed: false,
        reasonCode: 'DENY_APPROVAL_MISMATCH',
        reason: `Approval does not include required scope '${requiredScope}'`,
      };
    }

    return {
      allowed: true,
      reasonCode: 'ALLOW_POLICY_MATCH',
      reason: 'Operation approved',
    };
  }

  return {
    allowed: false,
    reasonCode: 'DENY_NO_POLICY',
    reason: `Unknown policy class: ${policyClass}`,
  };
}

/**
 * Get required approval scope for a tool
 */
function getRequiredScope(
  toolName: string
): 'commit' | 'push' | 'open_pr' | 'merge' | undefined {
  // Map tool names to required scopes
  const scopeMap: Record<string, 'commit' | 'push' | 'open_pr' | 'merge'> = {
    'github.createBranch': 'push',
    'github.pushCommit': 'push',
    'github.createPullRequest': 'open_pr',
    'github.updatePullRequest': 'open_pr',
    'github.mergePullRequest': 'merge',
  };

  return scopeMap[toolName];
}

/**
 * Hash input for audit purposes (don't store full input)
 */
function hashInput(input: unknown): string {
  const json = JSON.stringify(input);
  return createHash('sha256').update(json).digest('hex').substring(0, 16);
}

// =============================================================================
// Audit Helpers
// =============================================================================

/**
 * Write a tool audit event
 *
 * Phase 5: Extended to include actorId, policyReasonCode, approvalRef
 */
async function writeAuditEvent(
  event: Omit<ToolAuditEvent, 'timestamp'>,
  basePath?: string
): Promise<void> {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    runId: event.runId,
    actor: 'tool' as const,
    actorId: event.actorId ?? event.toolName,
    action: event.type,
    details: {
      tenantId: event.tenantId,
      toolName: event.toolName,
      policyClass: event.policyClass,
      inputHash: event.inputHash,
      policyPassed: event.policyPassed,
      policyReasonCode: event.policyReasonCode,
      approvalRef: event.approvalRef,
      error: event.error,
      durationMs: event.durationMs,
    },
  };

  await appendAudit(event.runId, auditEntry, basePath);
}

// =============================================================================
// Unified Invoke Pipeline
// =============================================================================

/**
 * Invoke a tool through the unified pipeline
 *
 * This is the ONLY way to invoke connector tools.
 * All invocations go through: validate → audit → policy → execute → validate → audit
 *
 * @param registry - Connector registry
 * @param request - Tool invocation request
 * @param basePath - Optional base path for audit logs
 * @returns Tool invocation result
 */
export async function invokeTool(
  registry: ConnectorRegistry,
  request: ToolInvocationRequest,
  basePath?: string
): Promise<ToolInvocationResult> {
  const startTime = Date.now();
  const { runId, tenantId, toolName, input, approval, tenant } = request;

  // Extract actorId from tenant context (Phase 5)
  const actorId = tenant?.actor?.actorId;
  const approvalRef = approval ? `${approval.runId}:${approval.approvedAt}` : undefined;

  // Parse tool name (format: "connector.tool")
  const [connectorId, ...toolParts] = toolName.split('.');
  const toolId = toolParts.join('.');

  if (!connectorId || !toolId) {
    return {
      success: false,
      error: `Invalid tool name format: ${toolName}. Expected 'connector.tool'`,
      errorCode: 'TOOL_NOT_FOUND',
    };
  }

  // Get connector
  const connector = registry.get(connectorId);
  if (!connector) {
    return {
      success: false,
      error: `Connector not found: ${connectorId}`,
      errorCode: 'CONNECTOR_NOT_FOUND',
    };
  }

  // Get tool
  const tool = connector.getTool(toolId);
  if (!tool) {
    return {
      success: false,
      error: `Tool not found: ${toolName}`,
      errorCode: 'TOOL_NOT_FOUND',
    };
  }

  const inputHash = hashInput(input);
  const auditEventIds: string[] = [];

  // Step 1: Write audit "tool_invocation_requested" (Phase 5: includes actorId)
  try {
    await writeAuditEvent(
      {
        type: 'tool_invocation_requested',
        runId,
        tenantId,
        actorId,
        toolName,
        policyClass: tool.policyClass,
        inputHash,
        approvalRef,
      },
      basePath
    );
    auditEventIds.push(`${runId}-requested`);
  } catch {
    // Audit failure should not block invocation, but log it
  }

  // Step 2: Validate input schema
  let validatedInput: unknown;
  try {
    validatedInput = tool.inputSchema.parse(input);

    await writeAuditEvent(
      {
        type: 'tool_invocation_validated',
        runId,
        tenantId,
        actorId,
        toolName,
        policyClass: tool.policyClass,
        inputHash,
        approvalRef,
      },
      basePath
    );
    auditEventIds.push(`${runId}-validated`);
  } catch (error) {
    const errorMessage = error instanceof z.ZodError
      ? `Input validation failed: ${error.errors.map(e => e.message).join(', ')}`
      : `Input validation failed: ${String(error)}`;

    await writeAuditEvent(
      {
        type: 'tool_invocation_failed',
        runId,
        tenantId,
        actorId,
        toolName,
        policyClass: tool.policyClass,
        inputHash,
        error: errorMessage,
        durationMs: Date.now() - startTime,
        approvalRef,
      },
      basePath
    );

    return {
      success: false,
      error: errorMessage,
      errorCode: 'VALIDATION_ERROR',
      auditEventIds,
      durationMs: Date.now() - startTime,
    };
  }

  // Step 3: Enforce policy gate (Phase 5: uses PolicyEngine)
  const ctx: ToolContext = {
    runId,
    tenantId,
    approval,
  };

  const policyDecision = checkPolicyWithEngine(tool, connectorId, ctx, tenant);

  await writeAuditEvent(
    {
      type: 'tool_invocation_policy_checked',
      runId,
      tenantId,
      actorId,
      toolName,
      policyClass: tool.policyClass,
      inputHash,
      policyPassed: policyDecision.allowed,
      policyReasonCode: policyDecision.reasonCode,
      error: policyDecision.allowed ? undefined : policyDecision.reason,
      approvalRef,
    },
    basePath
  );
  auditEventIds.push(`${runId}-policy`);

  if (!policyDecision.allowed) {
    return {
      success: false,
      error: policyDecision.reason,
      errorCode: 'POLICY_DENIED',
      auditEventIds,
      durationMs: Date.now() - startTime,
    };
  }

  // Step 4: Execute tool
  let output: unknown;
  try {
    output = await tool.invoke(ctx, validatedInput);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await writeAuditEvent(
      {
        type: 'tool_invocation_failed',
        runId,
        tenantId,
        actorId,
        toolName,
        policyClass: tool.policyClass,
        inputHash,
        policyReasonCode: policyDecision.reasonCode,
        error: errorMessage,
        durationMs: Date.now() - startTime,
        approvalRef,
      },
      basePath
    );

    return {
      success: false,
      error: errorMessage,
      errorCode: 'EXECUTION_ERROR',
      auditEventIds,
      durationMs: Date.now() - startTime,
    };
  }

  // Step 5: Validate output schema
  let validatedOutput: unknown;
  try {
    validatedOutput = tool.outputSchema.parse(output);
  } catch (error) {
    const errorMessage = error instanceof z.ZodError
      ? `Output validation failed: ${error.errors.map(e => e.message).join(', ')}`
      : `Output validation failed: ${String(error)}`;

    await writeAuditEvent(
      {
        type: 'tool_invocation_failed',
        runId,
        tenantId,
        actorId,
        toolName,
        policyClass: tool.policyClass,
        inputHash,
        policyReasonCode: policyDecision.reasonCode,
        error: errorMessage,
        durationMs: Date.now() - startTime,
        approvalRef,
      },
      basePath
    );

    return {
      success: false,
      error: errorMessage,
      errorCode: 'VALIDATION_ERROR',
      auditEventIds,
      durationMs: Date.now() - startTime,
    };
  }

  // Step 6: Write audit "tool_invocation_succeeded" (Phase 5: includes policyReasonCode)
  await writeAuditEvent(
    {
      type: 'tool_invocation_succeeded',
      runId,
      tenantId,
      actorId,
      toolName,
      policyClass: tool.policyClass,
      inputHash,
      policyReasonCode: policyDecision.reasonCode,
      approvalRef,
      durationMs: Date.now() - startTime,
    },
    basePath
  );
  auditEventIds.push(`${runId}-succeeded`);

  // Step 7: Return output
  return {
    success: true,
    output: validatedOutput,
    auditEventIds,
    durationMs: Date.now() - startTime,
  };
}

// =============================================================================
// Connector Registry Implementation
// =============================================================================

/**
 * Default connector registry implementation
 */
export class DefaultConnectorRegistry implements ConnectorRegistry {
  private connectors = new Map<string, import('./types.js').Connector>();

  register(connector: import('./types.js').Connector): void {
    if (this.connectors.has(connector.id)) {
      throw new Error(`Connector already registered: ${connector.id}`);
    }
    this.connectors.set(connector.id, connector);
  }

  get(id: string): import('./types.js').Connector | undefined {
    return this.connectors.get(id);
  }

  list(): import('./types.js').Connector[] {
    return Array.from(this.connectors.values());
  }

  has(id: string): boolean {
    return this.connectors.has(id);
  }
}

/**
 * Global connector registry singleton
 */
let globalRegistry: ConnectorRegistry | null = null;

/**
 * Get the global connector registry
 */
export function getConnectorRegistry(): ConnectorRegistry {
  if (!globalRegistry) {
    globalRegistry = new DefaultConnectorRegistry();
  }
  return globalRegistry;
}

/**
 * Set a custom connector registry (for testing)
 */
export function setConnectorRegistry(registry: ConnectorRegistry): void {
  globalRegistry = registry;
}
