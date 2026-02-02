/**
 * Policy Gates for Git With Intent
 *
 * EPIC 025: Regulated Domain Controls
 * Task 025.3: Add policy gates (pre-execution checks)
 *
 * Policy gates are checkpoints that run BEFORE operations execute.
 * They enforce risk tier requirements, approval workflows, and
 * compliance controls.
 *
 * Gate Types:
 *   - RiskTierGate: Checks if operation meets risk tier requirements
 *   - ApprovalGate: Checks if required approvals are present
 *   - SecretScanGate: Scans for secrets before commit/push
 *   - SafetyGate: Prevents dangerous operations without explicit override
 */

import { z } from 'zod';
import {
  type RiskContext,
  type RiskEvaluationResult,
  evaluateRisk,
} from './risk-tiers.js';

// =============================================================================
// Gate Types
// =============================================================================

/**
 * Gate result status
 */
export const GateStatus = z.enum([
  'passed',           // Gate passed, operation can proceed
  'failed',           // Gate failed, operation blocked
  'pending_approval', // Waiting for approval
  'pending_review',   // Waiting for human review
  'bypassed',         // Gate bypassed (with audit)
]);
export type GateStatus = z.infer<typeof GateStatus>;

/**
 * Gate result
 */
export const GateResult = z.object({
  /** Gate identifier */
  gateId: z.string(),
  /** Gate type */
  gateType: z.enum(['risk_tier', 'approval', 'secret_scan', 'safety', 'custom']),
  /** Result status */
  status: GateStatus,
  /** Human-readable message */
  message: z.string(),
  /** Detailed reason (for failures) */
  reason: z.string().optional(),
  /** Required actions to proceed */
  requiredActions: z.array(z.string()).optional(),
  /** Evidence collected */
  evidence: z.record(z.unknown()).optional(),
  /** Gate execution time (ms) */
  durationMs: z.number().int(),
  /** Timestamp */
  timestamp: z.string().datetime(),
});
export type GateResult = z.infer<typeof GateResult>;

/**
 * Combined gate check result
 */
export const PolicyGateCheckResult = z.object({
  /** Overall result */
  passed: z.boolean(),
  /** Individual gate results */
  gates: z.array(GateResult),
  /** First failure (if any) */
  firstFailure: GateResult.optional(),
  /** All required approvals */
  pendingApprovals: z.array(z.string()),
  /** Risk evaluation */
  riskEvaluation: z.custom<RiskEvaluationResult>(),
  /** Total check duration (ms) */
  totalDurationMs: z.number().int(),
  /** Timestamp */
  timestamp: z.string().datetime(),
});
export type PolicyGateCheckResult = z.infer<typeof PolicyGateCheckResult>;

// =============================================================================
// Gate Interface
// =============================================================================

/**
 * Gate interface - all gates must implement this
 */
export interface PolicyGate {
  /** Gate identifier */
  readonly id: string;
  /** Gate type */
  readonly type: GateResult['gateType'];
  /** Gate description */
  readonly description: string;
  /** Check if gate passes */
  check(context: RiskContext, riskEval: RiskEvaluationResult): Promise<GateResult>;
}

// =============================================================================
// Built-in Gates
// =============================================================================

/**
 * Risk Tier Gate - checks if operation meets risk tier requirements
 */
export class RiskTierGate implements PolicyGate {
  readonly id = 'risk-tier-gate';
  readonly type = 'risk_tier' as const;
  readonly description = 'Checks if operation meets risk tier requirements';

  async check(context: RiskContext, riskEval: RiskEvaluationResult): Promise<GateResult> {
    const startTime = Date.now();

    if (!riskEval.allowed) {
      return {
        gateId: this.id,
        gateType: this.type,
        status: 'failed',
        message: `Operation blocked: ${riskEval.reason}`,
        reason: riskEval.reason,
        requiredActions: [
          `Upgrade to risk tier ${riskEval.requiredTier} or higher`,
          'Contact admin to modify tenant policy',
        ],
        evidence: {
          operation: context.operation,
          requiredTier: riskEval.requiredTier,
          effectiveTier: riskEval.effectiveTier,
          policy: context.policy.tenantId,
        },
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      gateId: this.id,
      gateType: this.type,
      status: 'passed',
      message: `Risk tier check passed (${riskEval.effectiveTier} >= ${riskEval.requiredTier})`,
      evidence: {
        operation: context.operation,
        effectiveTier: riskEval.effectiveTier,
        requiredTier: riskEval.requiredTier,
      },
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Approval Gate - checks if required approvals are present
 */
export class ApprovalGate implements PolicyGate {
  readonly id = 'approval-gate';
  readonly type = 'approval' as const;
  readonly description = 'Checks if required approvals are present';

  constructor(
    private readonly getApprovals: (context: RiskContext) => Promise<{
      approved: boolean;
      approvers: string[];
      scopes: string[];
    }>
  ) {}

  async check(context: RiskContext, riskEval: RiskEvaluationResult): Promise<GateResult> {
    const startTime = Date.now();

    // If no approval required, pass
    if (!riskEval.requiresApproval) {
      return {
        gateId: this.id,
        gateType: this.type,
        status: 'passed',
        message: 'No approval required for this operation',
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // Check for approvals
    const approvals = await this.getApprovals(context);

    if (!approvals.approved) {
      return {
        gateId: this.id,
        gateType: this.type,
        status: 'pending_approval',
        message: 'Waiting for approval',
        requiredActions: [
          `Obtain approval with scopes: ${riskEval.approvalScopes.join(', ')}`,
          `Minimum ${context.policy.minApprovers} approver(s) required`,
        ],
        evidence: {
          requiredScopes: riskEval.approvalScopes,
          minApprovers: context.policy.minApprovers,
          currentApprovers: approvals.approvers,
          currentScopes: approvals.scopes,
        },
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // Check if all required scopes are covered
    const missingScopes = riskEval.approvalScopes.filter(
      (s) => !approvals.scopes.includes(s)
    );

    if (missingScopes.length > 0) {
      return {
        gateId: this.id,
        gateType: this.type,
        status: 'pending_approval',
        message: `Missing approval scopes: ${missingScopes.join(', ')}`,
        requiredActions: missingScopes.map((s) => `Obtain approval for scope: ${s}`),
        evidence: {
          requiredScopes: riskEval.approvalScopes,
          approvedScopes: approvals.scopes,
          missingScopes,
        },
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // Check minimum approvers
    if (approvals.approvers.length < context.policy.minApprovers) {
      return {
        gateId: this.id,
        gateType: this.type,
        status: 'pending_approval',
        message: `Need ${context.policy.minApprovers - approvals.approvers.length} more approver(s)`,
        requiredActions: [
          `Obtain ${context.policy.minApprovers - approvals.approvers.length} more approval(s)`,
        ],
        evidence: {
          required: context.policy.minApprovers,
          current: approvals.approvers.length,
          approvers: approvals.approvers,
        },
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      gateId: this.id,
      gateType: this.type,
      status: 'passed',
      message: 'Approval requirements met',
      evidence: {
        approvers: approvals.approvers,
        scopes: approvals.scopes,
      },
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Secret Scan Gate - scans content for secrets before proceeding
 */
export class SecretScanGate implements PolicyGate {
  readonly id = 'secret-scan-gate';
  readonly type = 'secret_scan' as const;
  readonly description = 'Scans content for secrets and credentials';

  constructor(
    private readonly scanForSecrets: (content: string) => Promise<{
      hasSecrets: boolean;
      findings: Array<{ type: string; location: string; redacted: string }>;
    }>
  ) {}

  async check(context: RiskContext, riskEval: RiskEvaluationResult): Promise<GateResult> {
    const startTime = Date.now();

    // Skip if secrets scanning not required
    if (!riskEval.tierConfig.secretsScanning) {
      return {
        gateId: this.id,
        gateType: this.type,
        status: 'passed',
        message: 'Secret scanning not required for this tier',
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // Get content to scan from resource attributes
    const content = (context.resource.attributes?.content as string) || '';
    if (!content) {
      return {
        gateId: this.id,
        gateType: this.type,
        status: 'passed',
        message: 'No content to scan',
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // Scan for secrets
    const scanResult = await this.scanForSecrets(content);

    if (scanResult.hasSecrets) {
      return {
        gateId: this.id,
        gateType: this.type,
        status: 'failed',
        message: `Found ${scanResult.findings.length} potential secret(s)`,
        reason: 'Content contains secrets or credentials that must be removed',
        requiredActions: [
          'Remove secrets from content',
          'Use environment variables or secret manager',
          'Add to .gitignore if appropriate',
        ],
        evidence: {
          findingsCount: scanResult.findings.length,
          findings: scanResult.findings.map((f) => ({
            type: f.type,
            location: f.location,
            // Show redacted version only
            sample: f.redacted,
          })),
        },
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      gateId: this.id,
      gateType: this.type,
      status: 'passed',
      message: 'No secrets detected',
      evidence: {
        contentLength: content.length,
        scannedAt: new Date().toISOString(),
      },
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Safety Gate - prevents dangerous operations without explicit override
 */
export class SafetyGate implements PolicyGate {
  readonly id = 'safety-gate';
  readonly type = 'safety' as const;
  readonly description = 'Prevents dangerous operations without explicit override';

  private readonly dangerousOperations = new Set([
    'force_push',
    'delete_protected_branch',
    'hard_reset',
    'rebase_main',
    'delete_production_data',
    'modify_audit_logs',
  ]);

  constructor(
    private readonly getOverride: (context: RiskContext) => Promise<{
      hasOverride: boolean;
      overrideReason?: string;
      overrideApprover?: string;
    }>
  ) {}

  async check(context: RiskContext, _riskEval: RiskEvaluationResult): Promise<GateResult> {
    const startTime = Date.now();

    // Check if operation is dangerous
    if (!this.dangerousOperations.has(context.operation)) {
      return {
        gateId: this.id,
        gateType: this.type,
        status: 'passed',
        message: 'Operation is not classified as dangerous',
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // Check for override
    const override = await this.getOverride(context);

    if (!override.hasOverride) {
      return {
        gateId: this.id,
        gateType: this.type,
        status: 'failed',
        message: `Dangerous operation '${context.operation}' requires explicit override`,
        reason: 'This operation is classified as dangerous and requires explicit authorization',
        requiredActions: [
          'Provide explicit override with documented reason',
          'Obtain approval from authorized personnel',
          'Confirm you understand the risks',
        ],
        evidence: {
          operation: context.operation,
          classification: 'dangerous',
          overrideRequired: true,
        },
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      gateId: this.id,
      gateType: this.type,
      status: 'bypassed',
      message: `Dangerous operation allowed with override: ${override.overrideReason}`,
      evidence: {
        operation: context.operation,
        overrideReason: override.overrideReason,
        overrideApprover: override.overrideApprover,
        bypassedAt: new Date().toISOString(),
      },
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

// =============================================================================
// Gate Runner
// =============================================================================

/**
 * Policy gate runner - runs all gates for an operation
 */
export class PolicyGateRunner {
  private gates: PolicyGate[] = [];

  constructor(gates?: PolicyGate[]) {
    if (gates) {
      this.gates = gates;
    }
  }

  /**
   * Add a gate
   */
  addGate(gate: PolicyGate): void {
    this.gates.push(gate);
  }

  /**
   * Remove a gate by ID
   */
  removeGate(gateId: string): void {
    this.gates = this.gates.filter((g) => g.id !== gateId);
  }

  /**
   * Run all gates
   */
  async runGates(context: RiskContext): Promise<PolicyGateCheckResult> {
    const startTime = Date.now();
    const results: GateResult[] = [];
    const pendingApprovals: string[] = [];

    // First, evaluate risk
    const riskEvaluation = evaluateRisk(context);

    // Run each gate
    for (const gate of this.gates) {
      try {
        const result = await gate.check(context, riskEvaluation);
        results.push(result);

        // Collect pending approvals
        if (result.status === 'pending_approval') {
          pendingApprovals.push(...(result.requiredActions || []));
        }

        // Stop on first hard failure
        if (result.status === 'failed') {
          break;
        }
      } catch (error) {
        // Gate threw an error - treat as failure
        results.push({
          gateId: gate.id,
          gateType: gate.type,
          status: 'failed',
          message: `Gate error: ${error instanceof Error ? error.message : String(error)}`,
          reason: 'Gate threw an exception during check',
          durationMs: 0,
          timestamp: new Date().toISOString(),
        });
        break;
      }
    }

    // Determine overall pass/fail
    const firstFailure = results.find((r) => r.status === 'failed');
    const hasPendingApproval = results.some((r) => r.status === 'pending_approval');
    const passed = !firstFailure && !hasPendingApproval;

    return {
      passed,
      gates: results,
      firstFailure,
      pendingApprovals: [...new Set(pendingApprovals)],
      riskEvaluation,
      totalDurationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

// =============================================================================
// Correctness Gate (025.6)
// =============================================================================

/**
 * Correctness verification result
 */
export interface CorrectnessResult {
  passed: boolean;
  score: number;
  threshold: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  failures: string[];
}

/**
 * Correctness Gate - verifies LLM output quality meets threshold
 *
 * Uses the existing GradingEngine from packages/core/src/scoring/grading-engine.ts
 * to evaluate output quality before applying changes.
 */
export class CorrectnessGate implements PolicyGate {
  readonly id = 'correctness-gate';
  readonly type = 'custom' as const;
  readonly description = 'Verifies LLM output quality meets correctness threshold';

  constructor(
    private readonly verifyCorrectness: (context: RiskContext) => Promise<CorrectnessResult>,
    private readonly minGrade: 'A' | 'B' | 'C' | 'D' = 'C',
    private readonly minScore: number = 70
  ) {}

  async check(context: RiskContext, _riskEval: RiskEvaluationResult): Promise<GateResult> {
    const startTime = Date.now();

    // Skip if no content to verify
    const content = context.resource.attributes?.llmOutput as string;
    if (!content) {
      return {
        gateId: this.id,
        gateType: this.type,
        status: 'passed',
        message: 'No LLM output to verify',
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // Run correctness verification
    const result = await this.verifyCorrectness(context);

    // Check grade threshold
    const gradeOrder = { A: 4, B: 3, C: 2, D: 1, F: 0 };
    const meetsGrade = gradeOrder[result.grade] >= gradeOrder[this.minGrade];
    const meetsScore = result.score >= this.minScore;

    if (!result.passed || !meetsGrade || !meetsScore) {
      return {
        gateId: this.id,
        gateType: this.type,
        status: 'failed',
        message: `Correctness check failed: Grade ${result.grade} (${result.score.toFixed(1)}), requires ${this.minGrade} (${this.minScore}+)`,
        reason: result.failures.length > 0
          ? result.failures.join('; ')
          : 'Output quality below threshold',
        requiredActions: [
          'Review and improve LLM output quality',
          'Address identified issues before proceeding',
          `Achieve grade ${this.minGrade} or higher (score >= ${this.minScore})`,
        ],
        evidence: {
          grade: result.grade,
          score: result.score,
          threshold: this.minScore,
          minGrade: this.minGrade,
          failures: result.failures,
        },
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      gateId: this.id,
      gateType: this.type,
      status: 'passed',
      message: `Correctness verified: Grade ${result.grade} (${result.score.toFixed(1)})`,
      evidence: {
        grade: result.grade,
        score: result.score,
        threshold: this.minScore,
      },
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Create default gate runner with standard gates
 */
export function createDefaultGateRunner(options: {
  getApprovals: ApprovalGate['check'] extends (
    ctx: RiskContext,
    eval_: RiskEvaluationResult
  ) => Promise<GateResult>
    ? never
    : (ctx: RiskContext) => Promise<{ approved: boolean; approvers: string[]; scopes: string[] }>;
  scanForSecrets: (content: string) => Promise<{
    hasSecrets: boolean;
    findings: Array<{ type: string; location: string; redacted: string }>;
  }>;
  getOverride: (ctx: RiskContext) => Promise<{
    hasOverride: boolean;
    overrideReason?: string;
    overrideApprover?: string;
  }>;
}): PolicyGateRunner {
  const runner = new PolicyGateRunner();

  // Add gates in order of execution
  runner.addGate(new RiskTierGate());
  runner.addGate(new ApprovalGate(options.getApprovals));
  runner.addGate(new SecretScanGate(options.scanForSecrets));
  runner.addGate(new SafetyGate(options.getOverride));

  return runner;
}
