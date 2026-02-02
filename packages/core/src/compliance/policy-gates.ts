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
import {
  scanForSecrets as scanForSecretsImpl,
  type SecretScanResult,
} from '../security/secrets.js';

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
 *
 * Uses existing @gwi/core/security/secrets scanner directly.
 * No callback indirection needed - we have a production scanner.
 */
export class SecretScanGate implements PolicyGate {
  readonly id = 'secret-scan-gate';
  readonly type = 'secret_scan' as const;
  readonly description = 'Scans content for secrets and credentials';

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

    // Use existing security/secrets scanner directly
    const scanResult: SecretScanResult = scanForSecretsImpl(content, {
      includeLineNumbers: true,
    });

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
          summary: scanResult.summary,
          findings: scanResult.findings.map((f) => ({
            type: f.patternName,
            severity: f.severity,
            line: f.line,
            preview: f.preview,
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
 *
 * Note: SecretScanGate uses @gwi/core/security/secrets directly - no callback needed.
 */
export function createDefaultGateRunner(options: {
  getApprovals: (ctx: RiskContext) => Promise<{ approved: boolean; approvers: string[]; scopes: string[] }>;
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
  runner.addGate(new SecretScanGate()); // Uses existing security/secrets scanner
  runner.addGate(new SafetyGate(options.getOverride));

  return runner;
}

// =============================================================================
// Evidence Bundle Generator (025.8)
// =============================================================================

/**
 * Compliance framework for evidence bundle
 */
export type EvidenceFramework = 'SOC2' | 'ISO27001' | 'GDPR' | 'HIPAA' | 'CUSTOM';

/**
 * Evidence artifact type
 */
export const EvidenceArtifactType = z.enum([
  'policy_decision',
  'approval_record',
  'audit_log',
  'gate_result',
  'risk_evaluation',
  'secret_scan',
  'compliance_control',
]);
export type EvidenceArtifactType = z.infer<typeof EvidenceArtifactType>;

/**
 * Evidence artifact with checksum
 */
export const EvidenceArtifact = z.object({
  /** Artifact ID */
  id: z.string(),
  /** Artifact type */
  type: EvidenceArtifactType,
  /** Timestamp when artifact was created */
  timestamp: z.string().datetime(),
  /** Artifact content (JSON-serializable) */
  content: z.unknown(),
  /** SHA-256 hash of JSON-stringified content */
  checksum: z.string(),
  /** Source system/component */
  source: z.string(),
});
export type EvidenceArtifact = z.infer<typeof EvidenceArtifact>;

/**
 * Evidence bundle metadata
 */
export const EvidenceBundleMetadata = z.object({
  /** Bundle ID */
  bundleId: z.string(),
  /** Tenant ID */
  tenantId: z.string(),
  /** Target compliance framework */
  framework: z.enum(['SOC2', 'ISO27001', 'GDPR', 'HIPAA', 'CUSTOM']),
  /** Bundle version */
  version: z.literal(1),
  /** Generation timestamp */
  generatedAt: z.string().datetime(),
  /** Time range covered */
  timeRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  /** Run IDs included (if scoped to runs) */
  runIds: z.array(z.string()).optional(),
  /** Generator info */
  generator: z.object({
    name: z.literal('gwi-evidence-bundle'),
    version: z.string(),
  }),
});
export type EvidenceBundleMetadata = z.infer<typeof EvidenceBundleMetadata>;

/**
 * Complete evidence bundle
 */
export const EvidenceBundle = z.object({
  /** Bundle metadata */
  metadata: EvidenceBundleMetadata,
  /** Artifacts in the bundle */
  artifacts: z.array(EvidenceArtifact),
  /** Summary statistics */
  summary: z.object({
    totalArtifacts: z.number().int(),
    artifactsByType: z.record(z.number().int()),
    approvalsCount: z.number().int(),
    gatesPassed: z.number().int(),
    gatesFailed: z.number().int(),
    secretScansPerformed: z.number().int(),
  }),
  /** Bundle integrity - SHA-256 of all artifact checksums concatenated */
  bundleChecksum: z.string(),
});
export type EvidenceBundle = z.infer<typeof EvidenceBundle>;

/**
 * Calculate SHA-256 hash of content
 */
async function calculateChecksum(content: unknown): Promise<string> {
  const data = JSON.stringify(content, null, 0);
  // Use Web Crypto API for browser/Node.js compatibility
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // In production, crypto.subtle should always be available.
  // Throw an error if it's not, to avoid generating insecure checksums.
  throw new Error('Web Crypto API (crypto.subtle) is not available. Cannot generate secure checksum.');
}

/**
 * Evidence bundle generator
 *
 * Generates downloadable evidence bundles for compliance auditors.
 * Aggregates policy decisions, approvals, audit logs, and gate results
 * with cryptographic checksums for tamper detection.
 */
export class EvidenceBundleGenerator {
  constructor(
    private readonly tenantId: string,
    private readonly gwiVersion: string = '0.6.0'
  ) {}

  /**
   * Create an evidence artifact with checksum
   */
  async createArtifact(
    type: EvidenceArtifactType,
    content: unknown,
    source: string
  ): Promise<EvidenceArtifact> {
    const id = `artifact_${crypto.randomUUID()}`;
    const checksum = await calculateChecksum(content);

    return {
      id,
      type,
      timestamp: new Date().toISOString(),
      content,
      checksum,
      source,
    };
  }

  /**
   * Generate evidence bundle from collected data
   */
  async generateBundle(options: {
    framework: EvidenceFramework;
    timeRange: { start: Date; end: Date };
    runIds?: string[];
    policyDecisions?: Array<{ decision: string; context: unknown; timestamp: Date }>;
    approvals?: Array<{ approver: string; scopes: string[]; runId: string; timestamp: Date }>;
    auditEvents?: Array<{ type: string; actor: string; details: unknown; timestamp: Date }>;
    gateResults?: GateResult[];
    riskEvaluations?: RiskEvaluationResult[];
    secretScans?: Array<{ passed: boolean; findingsCount: number; timestamp: Date }>;
    complianceControls?: Array<{ id: string; status: string; evidence?: string }>;
  }): Promise<EvidenceBundle> {
    const artifacts: EvidenceArtifact[] = [];

    // Add policy decisions
    if (options.policyDecisions) {
      for (const decision of options.policyDecisions) {
        artifacts.push(
          await this.createArtifact('policy_decision', decision, 'policy-engine')
        );
      }
    }

    // Add approvals
    if (options.approvals) {
      for (const approval of options.approvals) {
        artifacts.push(
          await this.createArtifact('approval_record', approval, 'approval-gate')
        );
      }
    }

    // Add audit events
    if (options.auditEvents) {
      for (const event of options.auditEvents) {
        artifacts.push(
          await this.createArtifact('audit_log', event, 'audit-store')
        );
      }
    }

    // Add gate results
    if (options.gateResults) {
      for (const result of options.gateResults) {
        artifacts.push(
          await this.createArtifact('gate_result', result, `gate-${result.gateId}`)
        );
      }
    }

    // Add risk evaluations
    if (options.riskEvaluations) {
      for (const eval_ of options.riskEvaluations) {
        artifacts.push(
          await this.createArtifact('risk_evaluation', eval_, 'risk-engine')
        );
      }
    }

    // Add secret scans
    if (options.secretScans) {
      for (const scan of options.secretScans) {
        artifacts.push(
          await this.createArtifact('secret_scan', scan, 'secret-detector')
        );
      }
    }

    // Add compliance controls
    if (options.complianceControls) {
      for (const control of options.complianceControls) {
        artifacts.push(
          await this.createArtifact('compliance_control', control, 'compliance-manager')
        );
      }
    }

    // Calculate summary
    const artifactsByType: Record<string, number> = {};
    for (const artifact of artifacts) {
      artifactsByType[artifact.type] = (artifactsByType[artifact.type] || 0) + 1;
    }

    const summary = {
      totalArtifacts: artifacts.length,
      artifactsByType,
      approvalsCount: options.approvals?.length || 0,
      gatesPassed: options.gateResults?.filter((g) => g.status === 'passed').length || 0,
      gatesFailed: options.gateResults?.filter((g) => g.status === 'failed').length || 0,
      secretScansPerformed: options.secretScans?.length || 0,
    };

    // Calculate bundle checksum from all artifact checksums
    const allChecksums = artifacts.map((a) => a.checksum).sort().join('');
    const bundleChecksum = await calculateChecksum(allChecksums);

    const metadata: EvidenceBundleMetadata = {
      bundleId: `bundle_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      tenantId: this.tenantId,
      framework: options.framework,
      version: 1,
      generatedAt: new Date().toISOString(),
      timeRange: {
        start: options.timeRange.start.toISOString(),
        end: options.timeRange.end.toISOString(),
      },
      runIds: options.runIds,
      generator: {
        name: 'gwi-evidence-bundle',
        version: this.gwiVersion,
      },
    };

    return {
      metadata,
      artifacts,
      summary,
      bundleChecksum,
    };
  }

  /**
   * Export bundle to SOC2 format (markdown with control mappings)
   */
  bundleToSOC2Markdown(bundle: EvidenceBundle): string {
    const lines: string[] = [
      '# SOC2 Type II Evidence Bundle',
      '',
      '## Bundle Information',
      '',
      `| Property | Value |`,
      `|----------|-------|`,
      `| Bundle ID | ${bundle.metadata.bundleId} |`,
      `| Tenant | ${bundle.metadata.tenantId} |`,
      `| Generated | ${bundle.metadata.generatedAt} |`,
      `| Time Range | ${bundle.metadata.timeRange.start} to ${bundle.metadata.timeRange.end} |`,
      `| Bundle Checksum | \`${bundle.bundleChecksum.substring(0, 16)}...\` |`,
      '',
      '## Summary',
      '',
      `| Metric | Count |`,
      `|--------|-------|`,
      `| Total Artifacts | ${bundle.summary.totalArtifacts} |`,
      `| Approvals | ${bundle.summary.approvalsCount} |`,
      `| Gates Passed | ${bundle.summary.gatesPassed} |`,
      `| Gates Failed | ${bundle.summary.gatesFailed} |`,
      `| Secret Scans | ${bundle.summary.secretScansPerformed} |`,
      '',
      '## SOC2 Trust Services Criteria Mapping',
      '',
      '### CC6.1 - Logical Access Security',
      '',
      'Evidence of logical access controls:',
      '',
    ];

    // Add approval evidence
    const approvals = bundle.artifacts.filter((a) => a.type === 'approval_record');
    if (approvals.length > 0) {
      lines.push('#### Approval Records');
      lines.push('');
      lines.push('| Timestamp | Approver | Scopes | Checksum |');
      lines.push('|-----------|----------|--------|----------|');
      for (const a of approvals.slice(0, 20)) {
        const content = a.content as { approver?: string; scopes?: string[] };
        lines.push(
          `| ${a.timestamp} | ${content.approver || 'N/A'} | ${(content.scopes || []).join(', ')} | \`${a.checksum.substring(0, 8)}\` |`
        );
      }
      if (approvals.length > 20) {
        lines.push(`| ... | ${approvals.length - 20} more records | ... | ... |`);
      }
      lines.push('');
    }

    // Add gate evidence
    const gates = bundle.artifacts.filter((a) => a.type === 'gate_result');
    if (gates.length > 0) {
      lines.push('### CC7.1 - System Operations');
      lines.push('');
      lines.push('Evidence of operational controls:');
      lines.push('');
      lines.push('| Timestamp | Gate | Status | Checksum |');
      lines.push('|-----------|------|--------|----------|');
      for (const g of gates.slice(0, 20)) {
        const content = g.content as { gateId?: string; status?: string };
        const statusIcon = content.status === 'passed' ? '✅' : content.status === 'failed' ? '❌' : '⏳';
        lines.push(
          `| ${g.timestamp} | ${content.gateId || 'N/A'} | ${statusIcon} ${content.status || 'N/A'} | \`${g.checksum.substring(0, 8)}\` |`
        );
      }
      if (gates.length > 20) {
        lines.push(`| ... | ${gates.length - 20} more records | ... | ... |`);
      }
      lines.push('');
    }

    // Add secret scan evidence
    const scans = bundle.artifacts.filter((a) => a.type === 'secret_scan');
    if (scans.length > 0) {
      lines.push('### CC6.7 - Restriction of Access');
      lines.push('');
      lines.push('Evidence of secret detection controls:');
      lines.push('');
      lines.push(`- ${scans.length} secret scans performed`);
      lines.push(`- All scans passed: ${scans.every((s) => (s.content as { passed?: boolean }).passed)}`);
      lines.push('');
    }

    lines.push('## Artifact Integrity');
    lines.push('');
    lines.push('All artifacts include SHA-256 checksums for tamper detection.');
    lines.push(`Bundle integrity checksum: \`${bundle.bundleChecksum}\``);
    lines.push('');
    lines.push('---');
    lines.push(`Generated by GWI Evidence Bundle Generator v${bundle.metadata.generator.version}`);

    return lines.join('\n');
  }

  /**
   * Export bundle to ISO27001 format (markdown with Annex A mappings)
   */
  bundleToISO27001Markdown(bundle: EvidenceBundle): string {
    const lines: string[] = [
      '# ISO 27001 Evidence Bundle',
      '',
      '## Document Control',
      '',
      `| Property | Value |`,
      `|----------|-------|`,
      `| Document ID | ${bundle.metadata.bundleId} |`,
      `| Organization | ${bundle.metadata.tenantId} |`,
      `| Date Generated | ${bundle.metadata.generatedAt} |`,
      `| Audit Period | ${bundle.metadata.timeRange.start} to ${bundle.metadata.timeRange.end} |`,
      `| Integrity Hash | \`${bundle.bundleChecksum}\` |`,
      '',
      '## Annex A Control Mappings',
      '',
      '### A.9 - Access Control',
      '',
      '#### A.9.4.1 - Information Access Restriction',
      '',
      `- Approval records collected: ${bundle.summary.approvalsCount}`,
      `- Access control gates passed: ${bundle.summary.gatesPassed}`,
      `- Access control gates failed: ${bundle.summary.gatesFailed}`,
      '',
      '### A.12 - Operations Security',
      '',
      '#### A.12.4.1 - Event Logging',
      '',
    ];

    const auditLogs = bundle.artifacts.filter((a) => a.type === 'audit_log');
    lines.push(`- Audit events logged: ${auditLogs.length}`);
    lines.push('');

    lines.push('### A.14 - System Development',
    '',
    '#### A.14.2.8 - System Security Testing',
    '');

    lines.push(`- Secret detection scans: ${bundle.summary.secretScansPerformed}`);
    lines.push(`- Policy gate evaluations: ${bundle.summary.gatesPassed + bundle.summary.gatesFailed}`);
    lines.push('');

    lines.push('## Evidence Summary');
    lines.push('');
    lines.push('| Artifact Type | Count |');
    lines.push('|--------------|-------|');
    for (const [type, count] of Object.entries(bundle.summary.artifactsByType)) {
      lines.push(`| ${type} | ${count} |`);
    }
    lines.push('');

    lines.push('## Integrity Verification');
    lines.push('');
    lines.push('Each artifact contains a SHA-256 checksum. The bundle checksum');
    lines.push('is computed from the concatenation of all artifact checksums.');
    lines.push('');
    lines.push('To verify integrity:');
    lines.push('1. Recalculate each artifact checksum from its content');
    lines.push('2. Concatenate all checksums in sorted order');
    lines.push('3. Compare resulting hash with bundle checksum');
    lines.push('');
    lines.push('---');
    lines.push(`Generated by GWI Evidence Bundle Generator v${bundle.metadata.generator.version}`);

    return lines.join('\n');
  }

  /**
   * Export bundle to JSON (for machine processing)
   */
  bundleToJSON(bundle: EvidenceBundle): string {
    return JSON.stringify(bundle, null, 2);
  }
}

/**
 * Create evidence bundle generator
 */
export function createEvidenceBundleGenerator(
  tenantId: string,
  gwiVersion?: string
): EvidenceBundleGenerator {
  return new EvidenceBundleGenerator(tenantId, gwiVersion);
}
