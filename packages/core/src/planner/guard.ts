/**
 * Phase 26: PlanGuard
 *
 * Safety bouncer for generated plans. Validates:
 * 1. Schema compliance (via PatchPlanSchema)
 * 2. Security rules (no path traversal, shell injection)
 * 3. Policy compliance (Phase 25 integration)
 * 4. Risk thresholds
 *
 * CRITICAL: No plan should execute without passing PlanGuard.
 */

import type { PatchPlan, PatchRiskLevel as PatchRiskLevelType } from './types.js';
import {
  validatePatchPlan,
  validatePatchPlanSecurity,
} from './types.js';
import { checkGate, type GateCheckInput } from '../policy/gate.js';
import type { SignedApproval } from '../approvals/types.js';
import { emitAuditEvent } from '../security/audit/index.js';
import { getCurrentContext, createLogger } from '../telemetry/index.js';

const logger = createLogger('plan-guard');

// =============================================================================
// Configuration
// =============================================================================

/**
 * PlanGuard configuration
 */
export interface PlanGuardConfig {
  /** Maximum allowed risk level */
  maxRiskLevel: PatchRiskLevelType;

  /** Maximum number of files that can be modified */
  maxFiles: number;

  /** Maximum number of steps in a plan */
  maxSteps: number;

  /** Whether to enforce policy checks */
  enforcePolicyChecks: boolean;

  /** Blocked file patterns (regex strings) */
  blockedFilePatterns: string[];

  /** Required test types for certain risk levels */
  requireTestsForRiskLevel: PatchRiskLevelType;

  /** Whether to emit audit events */
  emitAuditEvents: boolean;
}

/**
 * Default configuration - secure by default
 */
const DEFAULT_CONFIG: PlanGuardConfig = {
  maxRiskLevel: 'high', // Block critical by default
  maxFiles: 50, // Reasonable limit
  maxSteps: 20, // Reasonable limit
  enforcePolicyChecks: true,
  blockedFilePatterns: [
    '^\\.env', // .env files
    '.*\\.pem$', // Private keys
    '.*\\.key$', // Key files
    '.*credentials.*', // Credential files
    '.*secret.*', // Secret files
    '^node_modules/', // node_modules
    '^\\.git/', // .git directory
  ],
  requireTestsForRiskLevel: 'medium', // Require tests for medium+ risk
  emitAuditEvents: true,
};

// =============================================================================
// Result Types
// =============================================================================

/**
 * Violation found by PlanGuard
 */
export interface PlanGuardViolation {
  /** Violation category */
  category:
    | 'schema'
    | 'security'
    | 'policy'
    | 'risk'
    | 'limits'
    | 'blocked_file'
    | 'missing_tests';

  /** Violation severity */
  severity: 'error' | 'warning';

  /** Human-readable message */
  message: string;

  /** Affected file path (if applicable) */
  file?: string;

  /** Affected step (if applicable) */
  step?: number;
}

/**
 * PlanGuard result
 */
export interface PlanGuardResult {
  /** Whether the plan passed all checks */
  allowed: boolean;

  /** Violations found */
  violations: PlanGuardViolation[];

  /** Warnings (non-blocking) */
  warnings: PlanGuardViolation[];

  /** Duration in milliseconds */
  durationMs: number;

  /** Policy check result (if performed) */
  policyCheckResult?: {
    allowed: boolean;
    message: string;
  };
}

// =============================================================================
// PlanGuard
// =============================================================================

/**
 * PlanGuard - Safety bouncer for plans
 */
export class PlanGuard {
  private config: PlanGuardConfig;
  private blockedPatterns: RegExp[];

  constructor(config?: Partial<PlanGuardConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.blockedPatterns = this.config.blockedFilePatterns.map(
      (p) => new RegExp(p, 'i')
    );
  }

  /**
   * Check a plan against all safety rules
   */
  async check(
    plan: PatchPlan,
    context?: {
      tenantId?: string;
      actorId?: string;
      actorRole?: 'VIEWER' | 'DEVELOPER' | 'ADMIN' | 'OWNER';
      approvals?: SignedApproval[];
    }
  ): Promise<PlanGuardResult> {
    const startTime = Date.now();
    const violations: PlanGuardViolation[] = [];
    const warnings: PlanGuardViolation[] = [];

    // 1. Schema validation
    const schemaResult = validatePatchPlan(plan);
    if (!schemaResult.valid) {
      for (const msg of schemaResult.errorMessages || []) {
        violations.push({
          category: 'schema',
          severity: 'error',
          message: msg,
        });
      }
    }

    // 2. Security validation
    const securityResult = validatePatchPlanSecurity(plan);
    if (!securityResult.secure) {
      for (const violation of securityResult.violations) {
        violations.push({
          category: 'security',
          severity: 'error',
          message: violation,
        });
      }
    }

    // 3. Risk level check
    const riskViolation = this.checkRiskLevel(plan);
    if (riskViolation) {
      violations.push(riskViolation);
    }

    // 4. Limits check
    const limitViolations = this.checkLimits(plan);
    violations.push(...limitViolations);

    // 5. Blocked files check
    const blockedFileViolations = this.checkBlockedFiles(plan);
    violations.push(...blockedFileViolations);

    // 6. Test requirements check
    const testViolation = this.checkTestRequirements(plan);
    if (testViolation) {
      if (testViolation.severity === 'warning') {
        warnings.push(testViolation);
      } else {
        violations.push(testViolation);
      }
    }

    // 7. Policy check (Phase 25 integration)
    let policyCheckResult:
      | { allowed: boolean; message: string }
      | undefined;

    if (
      this.config.enforcePolicyChecks &&
      context?.tenantId &&
      context?.actorId
    ) {
      policyCheckResult = await this.checkPolicy(plan, context);
      if (!policyCheckResult.allowed) {
        violations.push({
          category: 'policy',
          severity: 'error',
          message: policyCheckResult.message,
        });
      }
    }

    // Calculate result
    const allowed = violations.length === 0;
    const durationMs = Date.now() - startTime;

    // Log result
    logger.info('Plan guard check complete', {
      planId: plan.plan_id,
      allowed,
      violationCount: violations.length,
      warningCount: warnings.length,
      durationMs,
    });

    // Emit audit event
    if (this.config.emitAuditEvents) {
      await this.emitAuditEvent(plan, allowed, violations, context);
    }

    return {
      allowed,
      violations,
      warnings,
      durationMs,
      policyCheckResult,
    };
  }

  /**
   * Check if risk level is acceptable
   */
  private checkRiskLevel(plan: PatchPlan): PlanGuardViolation | null {
    const riskOrder: PatchRiskLevelType[] = ['low', 'medium', 'high', 'critical'];
    const planRiskIndex = riskOrder.indexOf(plan.risk.overall);
    const maxRiskIndex = riskOrder.indexOf(this.config.maxRiskLevel);

    if (planRiskIndex > maxRiskIndex) {
      return {
        category: 'risk',
        severity: 'error',
        message: `Plan risk level "${plan.risk.overall}" exceeds maximum allowed "${this.config.maxRiskLevel}"`,
      };
    }

    return null;
  }

  /**
   * Check resource limits
   */
  private checkLimits(plan: PatchPlan): PlanGuardViolation[] {
    const violations: PlanGuardViolation[] = [];

    if (plan.files.length > this.config.maxFiles) {
      violations.push({
        category: 'limits',
        severity: 'error',
        message: `Plan affects ${plan.files.length} files, exceeding limit of ${this.config.maxFiles}`,
      });
    }

    if (plan.steps.length > this.config.maxSteps) {
      violations.push({
        category: 'limits',
        severity: 'error',
        message: `Plan has ${plan.steps.length} steps, exceeding limit of ${this.config.maxSteps}`,
      });
    }

    return violations;
  }

  /**
   * Check for blocked file patterns
   */
  private checkBlockedFiles(plan: PatchPlan): PlanGuardViolation[] {
    const violations: PlanGuardViolation[] = [];

    for (const file of plan.files) {
      for (const pattern of this.blockedPatterns) {
        if (pattern.test(file.path)) {
          violations.push({
            category: 'blocked_file',
            severity: 'error',
            message: `File "${file.path}" matches blocked pattern`,
            file: file.path,
          });
          break;
        }
      }
    }

    return violations;
  }

  /**
   * Check test requirements based on risk level
   */
  private checkTestRequirements(plan: PatchPlan): PlanGuardViolation | null {
    const riskOrder: PatchRiskLevelType[] = ['low', 'medium', 'high', 'critical'];
    const planRiskIndex = riskOrder.indexOf(plan.risk.overall);
    const requiredRiskIndex = riskOrder.indexOf(
      this.config.requireTestsForRiskLevel
    );

    if (planRiskIndex >= requiredRiskIndex && plan.tests.length === 0) {
      return {
        category: 'missing_tests',
        severity: planRiskIndex >= 2 ? 'error' : 'warning', // Error for high+
        message: `Plan has "${plan.risk.overall}" risk but no tests defined`,
      };
    }

    return null;
  }

  /**
   * Check policy compliance (Phase 25 integration)
   */
  private async checkPolicy(
    plan: PatchPlan,
    context: {
      tenantId?: string;
      actorId?: string;
      actorRole?: 'VIEWER' | 'DEVELOPER' | 'ADMIN' | 'OWNER';
      approvals?: SignedApproval[];
    }
  ): Promise<{ allowed: boolean; message: string }> {
    if (!context.tenantId || !context.actorId) {
      return { allowed: true, message: 'No context for policy check' };
    }

    const gateInput: GateCheckInput = {
      tenantId: context.tenantId,
      action: 'candidate.execute',
      actor: {
        id: context.actorId,
        type: 'user',
        role: context.actorRole || 'DEVELOPER',
      },
      resource: {
        type: 'candidate',
        id: plan.plan_id,
        isProtectedBranch: false, // Could be enhanced
        isProduction: plan.risk.overall === 'critical',
      },
      approvals: context.approvals || [],
      requiredScopes: ['commit'],
      plan: {
        hash: plan.intent_hash || '',
        content: plan.intent_summary,
      },
      patch: {
        hash: '',
        filesChanged: plan.files.length,
        linesAdded: plan.files.reduce(
          (sum, f) => sum + (f.estimated_lines || 0),
          0
        ),
        linesRemoved: 0,
      },
    };

    try {
      const result = await checkGate(gateInput);
      return {
        allowed: result.allowed,
        message: result.message,
      };
    } catch (error) {
      logger.error('Policy check failed', { error });
      return {
        allowed: false,
        message: `Policy check error: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Emit audit event for plan guard check
   *
   * Uses 'candidate.generated' / 'candidate.rejected' event types
   * as they best match the semantic meaning of plan guard checks.
   */
  private async emitAuditEvent(
    plan: PatchPlan,
    allowed: boolean,
    violations: PlanGuardViolation[],
    context?: { tenantId?: string; actorId?: string }
  ): Promise<void> {
    try {
      const telemetryCtx = getCurrentContext();
      await emitAuditEvent({
        // Use candidate events since plan guard evaluates candidates
        eventType: allowed
          ? 'candidate.generated'
          : 'candidate.rejected',
        outcome: allowed ? 'success' : 'denied',
        tenantId: context?.tenantId || 'unknown',
        actor: {
          type: 'service',
          id: 'plan-guard',
        },
        resource: {
          type: 'candidate',
          id: plan.plan_id,
        },
        data: {
          source: 'plan-guard',
          provider: plan.provider,
          model: plan.model,
          riskLevel: plan.risk.overall,
          fileCount: plan.files.length,
          stepCount: plan.steps.length,
          violationCount: violations.length,
          violations: violations.map((v) => ({
            category: v.category,
            message: v.message,
          })),
        },
        traceId: plan.trace_id || telemetryCtx?.traceId,
        requestId: plan.request_id || telemetryCtx?.requestId,
      });
    } catch (error) {
      logger.error('Failed to emit audit event', { error });
    }
  }

  /**
   * Check if PlanGuard is enabled via feature flag
   */
  static isEnabled(): boolean {
    // Always enabled when planner is enabled
    return process.env.GWI_PLANNER_ENABLED === '1';
  }
}

// =============================================================================
// Singleton
// =============================================================================

let planGuardInstance: PlanGuard | null = null;

/**
 * Get the singleton PlanGuard instance
 */
export function getPlanGuard(config?: Partial<PlanGuardConfig>): PlanGuard {
  if (!planGuardInstance || config) {
    planGuardInstance = new PlanGuard(config);
  }
  return planGuardInstance;
}
