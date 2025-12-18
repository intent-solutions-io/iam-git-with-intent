/**
 * Execution Gate
 *
 * Phase 25: Approval Commands + Policy-as-Code Enforcement
 *
 * Integrates policy evaluation into the execution pipeline.
 * Blocks execution unless policy returns ALLOW.
 *
 * @module @gwi/core/policy/gate
 */

import {
  type PolicyContext,
  type PolicyResult,
  type PolicyAction,
  type PolicyActor,
  type PolicyResource,
  createEnvironmentContext,
} from './types.js';
import { evaluatePolicy, getPolicyEngine } from './engine.js';
import { DEFAULT_POLICIES, registerDefaultPolicies } from './policies.js';
import type { SignedApproval, ApprovalScope } from '../approvals/types.js';
import { emitAuditEvent, type SecurityAuditActor } from '../security/audit/index.js';
import { getCurrentContext, createLogger } from '../telemetry/index.js';

const logger = createLogger('policy-gate');

// =============================================================================
// Gate Types
// =============================================================================

/**
 * Gate check result
 */
export interface GateCheckResult {
  /** Whether execution is allowed */
  allowed: boolean;

  /** Policy result details */
  policyResult: PolicyResult;

  /** Human-readable message for PR comment */
  message: string;

  /** Structured denial reason (for API response) */
  denialReason?: {
    code: string;
    message: string;
    requirements?: PolicyResult['missingRequirements'];
  };
}

/**
 * Gate check input
 */
export interface GateCheckInput {
  /** Tenant ID */
  tenantId: string;

  /** Action being performed */
  action: PolicyAction;

  /** Actor performing the action */
  actor: {
    id: string;
    type: 'user' | 'service' | 'webhook';
    role: 'VIEWER' | 'DEVELOPER' | 'ADMIN' | 'OWNER';
    email?: string;
  };

  /** Resource being acted upon */
  resource: {
    type: 'candidate' | 'run' | 'pr' | 'repo' | 'tenant';
    id: string;
    repo?: string;
    isProtectedBranch?: boolean;
    isProduction?: boolean;
  };

  /** Existing approvals */
  approvals: SignedApproval[];

  /** Required scopes for this action */
  requiredScopes: ApprovalScope[];

  /** Plan/intent document (if available) */
  plan?: {
    hash: string;
    content?: string;
  };

  /** Patch details (if available) */
  patch?: {
    hash: string;
    content?: string;
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
  };
}

// =============================================================================
// Initialization
// =============================================================================

let initialized = false;

/**
 * Initialize the policy gate with default policies
 */
export function initializePolicyGate(): void {
  if (initialized) {
    return;
  }

  const engine = getPolicyEngine();
  registerDefaultPolicies(engine);
  initialized = true;

  logger.info('Policy gate initialized', {
    policiesLoaded: DEFAULT_POLICIES.length,
    policyIds: DEFAULT_POLICIES.map((p) => p.id),
  });
}

// =============================================================================
// Gate Check
// =============================================================================

/**
 * Check if an action is allowed by policy
 *
 * This is the main entry point for the execution gate.
 *
 * @param input - Gate check input
 * @returns Gate check result
 */
export async function checkGate(input: GateCheckInput): Promise<GateCheckResult> {
  // Ensure initialized
  initializePolicyGate();

  // Build policy context
  const context: PolicyContext = {
    tenantId: input.tenantId,
    action: input.action,
    actor: input.actor as PolicyActor,
    resource: input.resource as PolicyResource,
    environment: createEnvironmentContext(),
    approvals: input.approvals,
    requiredScopes: input.requiredScopes,
    plan: input.plan,
    patch: input.patch,
  };

  // Evaluate policy
  const policyResult = evaluatePolicy(context);

  // Log the evaluation
  logger.debug('Policy evaluation complete', {
    action: input.action,
    decision: policyResult.decision,
    policiesEvaluated: policyResult.policiesEvaluated,
    durationMs: policyResult.durationMs,
  });

  // Emit audit event
  const telemetryCtx = getCurrentContext();
  await emitAuditEvent({
    eventType:
      policyResult.decision === 'ALLOW'
        ? 'rbac.check.allowed'
        : 'rbac.check.denied',
    outcome: policyResult.decision === 'ALLOW' ? 'success' : 'denied',
    tenantId: input.tenantId,
    actor: {
      type: input.actor.type === 'user' ? 'user' : 'service',
      id: input.actor.id,
      email: input.actor.email,
    } as SecurityAuditActor,
    resource: {
      type: input.resource.type,
      id: input.resource.id,
    },
    data: {
      action: input.action,
      decision: policyResult.decision,
      policiesEvaluated: policyResult.policiesEvaluated,
      reasons: policyResult.reasons.map((r) => r.message),
    },
    traceId: telemetryCtx?.traceId,
    requestId: telemetryCtx?.requestId,
  });

  // Build result
  if (policyResult.decision === 'ALLOW') {
    return {
      allowed: true,
      policyResult,
      message: 'Policy check passed',
    };
  }

  // Build denial message
  const denialMessage = buildDenialMessage(policyResult);

  return {
    allowed: false,
    policyResult,
    message: denialMessage,
    denialReason: {
      code: policyResult.decision === 'DENY' ? 'POLICY_DENIED' : 'APPROVALS_REQUIRED',
      message: policyResult.reasons[0]?.message || 'Policy check failed',
      requirements: policyResult.missingRequirements,
    },
  };
}

/**
 * Build human-readable denial message for PR comment
 */
function buildDenialMessage(result: PolicyResult): string {
  const lines: string[] = [];

  if (result.decision === 'DENY') {
    lines.push('**Policy Denied**');
    lines.push('');
    lines.push('This action cannot proceed due to policy restrictions:');
    lines.push('');

    for (const reason of result.reasons) {
      lines.push(`- ${reason.message}`);
      if (reason.resolution) {
        lines.push(`  - *Resolution*: ${reason.resolution}`);
      }
    }
  } else if (result.decision === 'REQUIRE_MORE_APPROVALS') {
    lines.push('**Additional Approvals Required**');
    lines.push('');

    if (result.missingRequirements) {
      if (result.missingRequirements.approvalsNeeded > 0) {
        lines.push(
          `- Need ${result.missingRequirements.approvalsNeeded} more approval(s)`
        );
      }

      if (result.missingRequirements.missingScopes.length > 0) {
        lines.push(
          `- Missing scopes: ${result.missingRequirements.missingScopes.join(', ')}`
        );
      }
    }

    lines.push('');
    lines.push('Use `/gwi approve <target>` to provide approval.');
  }

  return lines.join('\n');
}

// =============================================================================
// Guard Function
// =============================================================================

/**
 * Guard function that throws if policy denies
 *
 * Use this as a simple guard in execution paths.
 *
 * @throws Error if policy denies execution
 */
export async function requirePolicyApproval(
  input: GateCheckInput
): Promise<void> {
  const result = await checkGate(input);

  if (!result.allowed) {
    const error = new PolicyDeniedError(
      result.denialReason?.message || 'Policy check failed',
      result
    );
    throw error;
  }
}

/**
 * Custom error for policy denial
 */
export class PolicyDeniedError extends Error {
  public readonly code: string;
  public readonly gateResult: GateCheckResult;

  constructor(message: string, gateResult: GateCheckResult) {
    super(message);
    this.name = 'PolicyDeniedError';
    this.code = gateResult.denialReason?.code || 'POLICY_DENIED';
    this.gateResult = gateResult;
  }

  /**
   * Format for PR comment
   */
  toMarkdown(): string {
    return this.gateResult.message;
  }
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Create Express middleware for policy enforcement
 */
export function createPolicyMiddleware(
  getContext: (req: unknown) => GateCheckInput | null
) {
  return async (
    req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } },
    next: (err?: Error) => void
  ) => {
    const context = getContext(req);

    if (!context) {
      // No policy context - skip check
      next();
      return;
    }

    try {
      const result = await checkGate(context);

      if (!result.allowed) {
        res.status(403).json({
          error: 'Policy denied',
          code: result.denialReason?.code,
          message: result.denialReason?.message,
          requirements: result.denialReason?.requirements,
        });
        return;
      }

      next();
    } catch (error) {
      next(error as Error);
    }
  };
}
