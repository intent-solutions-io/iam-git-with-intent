/**
 * A2A Protocol Contracts for Git With Intent
 *
 * EPIC 024: IAM Department Architecture Port
 *
 * Defines the inter-agent communication contracts for the SWE pipeline pattern.
 * These contracts enable the Foreman to coordinate specialist agents through
 * strongly-typed message payloads.
 *
 * Pipeline Stages:
 *   audit → issues → plans → fixes → qa → docs
 *
 * @module @gwi/core/a2a/contracts
 */

import { z } from 'zod';

// =============================================================================
// Risk Tiers (EPIC 025)
// =============================================================================

/**
 * Risk tier levels for regulated domain controls
 *
 * R0: Unrestricted - Local dev, read-only operations
 * R1: Tool Allowlist - Production file reads, approved tools only
 * R2: Approval Required - Code modifications, PRs, human approval + SHA binding
 * R3: Secrets Detection - Credential access, secret scanning + redaction
 * R4: Immutable Audit - All production ops, tamper-evident logging
 */
export const RiskTier = z.enum(['R0', 'R1', 'R2', 'R3', 'R4']);
export type RiskTier = z.infer<typeof RiskTier>;

/**
 * Risk tier metadata
 */
export const RiskTierMetadata: Record<
  RiskTier,
  {
    name: string;
    description: string;
    requiresApproval: boolean;
    requiresAudit: boolean;
    secretsScanning: boolean;
    tamperEvident: boolean;
  }
> = {
  R0: {
    name: 'Unrestricted',
    description: 'Local development, read-only operations',
    requiresApproval: false,
    requiresAudit: false,
    secretsScanning: false,
    tamperEvident: false,
  },
  R1: {
    name: 'Tool Allowlist',
    description: 'Production file reads, approved tools only',
    requiresApproval: false,
    requiresAudit: true,
    secretsScanning: false,
    tamperEvident: false,
  },
  R2: {
    name: 'Approval Required',
    description: 'Code modifications, PRs require human approval with SHA binding',
    requiresApproval: true,
    requiresAudit: true,
    secretsScanning: false,
    tamperEvident: false,
  },
  R3: {
    name: 'Secrets Detection',
    description: 'Credential access with secret scanning and redaction',
    requiresApproval: true,
    requiresAudit: true,
    secretsScanning: true,
    tamperEvident: false,
  },
  R4: {
    name: 'Immutable Audit',
    description: 'All production operations with tamper-evident logging',
    requiresApproval: true,
    requiresAudit: true,
    secretsScanning: true,
    tamperEvident: true,
  },
};

// =============================================================================
// Pipeline Stage Types
// =============================================================================

/**
 * SWE Pipeline stages
 */
export const PipelineStage = z.enum([
  'audit',    // Scan codebase for issues
  'issues',   // Generate issue specifications
  'plans',    // Create fix plans
  'fixes',    // Implement fixes
  'qa',       // Quality assurance and testing
  'docs',     // Documentation updates
]);
export type PipelineStage = z.infer<typeof PipelineStage>;

/**
 * Pipeline stage status
 */
export const StageStatus = z.enum([
  'pending',
  'in_progress',
  'completed',
  'failed',
  'skipped',
  'blocked',
  'waiting_approval',
]);
export type StageStatus = z.infer<typeof StageStatus>;

// =============================================================================
// Issue Specification Contract
// =============================================================================

/**
 * Issue severity levels for pipeline issues
 */
export const PipelineIssueSeverity = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type PipelineIssueSeverity = z.infer<typeof PipelineIssueSeverity>;

/**
 * Issue category
 */
export const IssueCategory = z.enum([
  'security',
  'performance',
  'reliability',
  'maintainability',
  'documentation',
  'testing',
  'compliance',
  'accessibility',
  'deprecation',
  'style',
]);
export type IssueCategory = z.infer<typeof IssueCategory>;

/**
 * Issue specification - output from audit stage
 */
export const IssueSpec = z.object({
  /** Unique issue ID */
  id: z.string(),
  /** Issue title */
  title: z.string(),
  /** Detailed description */
  description: z.string(),
  /** Severity level */
  severity: PipelineIssueSeverity,
  /** Category */
  category: IssueCategory,
  /** Affected files */
  files: z.array(
    z.object({
      path: z.string(),
      lineStart: z.number().int().optional(),
      lineEnd: z.number().int().optional(),
      snippet: z.string().optional(),
    })
  ),
  /** Suggested fix approach */
  suggestedFix: z.string().optional(),
  /** Related issues (dependencies) */
  relatedIssues: z.array(z.string()).optional(),
  /** Tags for filtering */
  tags: z.array(z.string()).optional(),
  /** Confidence score (0-1) */
  confidence: z.number().min(0).max(1).optional(),
  /** Source of the issue (agent, tool, rule) */
  source: z.string().optional(),
  /** Rule ID if from linter/scanner */
  ruleId: z.string().optional(),
  /** Estimated effort (T-shirt sizing) */
  effort: z.enum(['xs', 's', 'm', 'l', 'xl']).optional(),
  /** Risk tier required for fix */
  riskTier: RiskTier.optional(),
});
export type IssueSpec = z.infer<typeof IssueSpec>;

// =============================================================================
// Fix Plan Contract
// =============================================================================

/**
 * File operation type
 */
export const FileOperation = z.enum(['create', 'modify', 'delete', 'rename', 'move']);
export type FileOperation = z.infer<typeof FileOperation>;

/**
 * Planned file change
 */
export const PlannedChange = z.object({
  /** Operation type */
  operation: FileOperation,
  /** Target file path */
  path: z.string(),
  /** New path (for rename/move) */
  newPath: z.string().optional(),
  /** Description of change */
  description: z.string(),
  /** Expected diff (if available) */
  expectedDiff: z.string().optional(),
  /** Dependencies on other changes */
  dependsOn: z.array(z.string()).optional(),
});
export type PlannedChange = z.infer<typeof PlannedChange>;

/**
 * Fix plan - output from plans stage
 */
export const FixPlan = z.object({
  /** Unique plan ID */
  id: z.string(),
  /** Issue being fixed */
  issueId: z.string(),
  /** Plan title */
  title: z.string(),
  /** Detailed approach */
  approach: z.string(),
  /** Planned changes */
  changes: z.array(PlannedChange),
  /** Test strategy */
  testStrategy: z.string().optional(),
  /** Rollback strategy */
  rollbackStrategy: z.string().optional(),
  /** Risk assessment */
  riskAssessment: z
    .object({
      level: z.enum(['low', 'medium', 'high', 'critical']),
      factors: z.array(z.string()),
      mitigations: z.array(z.string()),
    })
    .optional(),
  /** Estimated tokens for implementation */
  estimatedTokens: z.number().int().optional(),
  /** Model recommendation */
  recommendedModel: z.string().optional(),
  /** Risk tier for execution */
  riskTier: RiskTier,
});
export type FixPlan = z.infer<typeof FixPlan>;

// =============================================================================
// Fix Result Contract
// =============================================================================

/**
 * Applied file change
 */
export const AppliedChange = z.object({
  /** Operation performed */
  operation: FileOperation,
  /** File path */
  path: z.string(),
  /** New path (for rename/move) */
  newPath: z.string().optional(),
  /** Actual diff applied */
  diff: z.string().optional(),
  /** Success status */
  success: z.boolean(),
  /** Error message if failed */
  error: z.string().optional(),
  /** SHA256 of file before change */
  beforeChecksum: z.string().optional(),
  /** SHA256 of file after change */
  afterChecksum: z.string().optional(),
});
export type AppliedChange = z.infer<typeof AppliedChange>;

/**
 * Fix result - output from fixes stage
 */
export const FixResult = z.object({
  /** Unique result ID */
  id: z.string(),
  /** Plan that was executed */
  planId: z.string(),
  /** Issue that was fixed */
  issueId: z.string(),
  /** Applied changes */
  changes: z.array(AppliedChange),
  /** Overall success */
  success: z.boolean(),
  /** Error message if failed */
  error: z.string().optional(),
  /** Tokens used */
  tokensUsed: z
    .object({
      input: z.number().int(),
      output: z.number().int(),
    })
    .optional(),
  /** Model used */
  modelUsed: z.string().optional(),
  /** Commit SHA (if committed) */
  commitSha: z.string().optional(),
  /** Branch name */
  branch: z.string().optional(),
});
export type FixResult = z.infer<typeof FixResult>;

// =============================================================================
// QA Verdict Contract
// =============================================================================

/**
 * Test result status
 */
export const TestStatus = z.enum(['passed', 'failed', 'skipped', 'error']);
export type TestStatus = z.infer<typeof TestStatus>;

/**
 * Individual test result in QA pipeline
 */
export const PipelineTestResult = z.object({
  /** Test name */
  name: z.string(),
  /** Test file */
  file: z.string().optional(),
  /** Status */
  status: TestStatus,
  /** Duration in ms */
  durationMs: z.number().int().optional(),
  /** Error message if failed */
  error: z.string().optional(),
  /** Stack trace if available */
  stack: z.string().optional(),
});
export type PipelineTestResult = z.infer<typeof PipelineTestResult>;

/**
 * Code quality check
 */
export const QualityCheck = z.object({
  /** Check name */
  name: z.string(),
  /** Check category */
  category: z.enum(['lint', 'type', 'style', 'security', 'coverage', 'build']),
  /** Passed */
  passed: z.boolean(),
  /** Issues found */
  issues: z
    .array(
      z.object({
        file: z.string(),
        line: z.number().int().optional(),
        message: z.string(),
        severity: PipelineIssueSeverity,
      })
    )
    .optional(),
  /** Score (0-100) if applicable */
  score: z.number().min(0).max(100).optional(),
});
export type QualityCheck = z.infer<typeof QualityCheck>;

/**
 * QA verdict - output from qa stage
 */
export const QAVerdict = z.object({
  /** Unique verdict ID */
  id: z.string(),
  /** Fix result being verified */
  fixResultId: z.string(),
  /** Issue being verified */
  issueId: z.string(),
  /** Overall verdict */
  verdict: z.enum(['approved', 'rejected', 'needs_review']),
  /** Confidence score (0-1) */
  confidence: z.number().min(0).max(1),
  /** Reasoning */
  reasoning: z.string(),
  /** Test results */
  testResults: z
    .object({
      total: z.number().int(),
      passed: z.number().int(),
      failed: z.number().int(),
      skipped: z.number().int(),
      results: z.array(PipelineTestResult).optional(),
    })
    .optional(),
  /** Quality checks */
  qualityChecks: z.array(QualityCheck).optional(),
  /** Code review notes */
  reviewNotes: z.array(z.string()).optional(),
  /** Suggested improvements */
  suggestions: z.array(z.string()).optional(),
  /** Risk tier achieved */
  riskTier: RiskTier,
  /** Human review required */
  requiresHumanReview: z.boolean(),
});
export type QAVerdict = z.infer<typeof QAVerdict>;

// =============================================================================
// Documentation Update Contract
// =============================================================================

/**
 * Documentation type
 */
export const DocType = z.enum([
  'readme',
  'changelog',
  'api',
  'guide',
  'reference',
  'architecture',
  'decision_record',
  'runbook',
]);
export type DocType = z.infer<typeof DocType>;

/**
 * Documentation update - output from docs stage
 */
export const DocUpdate = z.object({
  /** Unique update ID */
  id: z.string(),
  /** Related issue ID */
  issueId: z.string().optional(),
  /** Related fix result ID */
  fixResultId: z.string().optional(),
  /** Document type */
  docType: DocType,
  /** File path */
  path: z.string(),
  /** Operation */
  operation: z.enum(['create', 'update', 'delete']),
  /** Title/summary */
  title: z.string(),
  /** Content (if create/update) */
  content: z.string().optional(),
  /** Diff (if update) */
  diff: z.string().optional(),
  /** Changelog entry */
  changelogEntry: z.string().optional(),
});
export type DocUpdate = z.infer<typeof DocUpdate>;

// =============================================================================
// Pipeline Request/Response Contracts
// =============================================================================

/**
 * Pipeline request - initiates a SWE pipeline run
 */
export const PipelineRequest = z.object({
  /** Unique pipeline run ID */
  pipelineId: z.string(),
  /** Tenant ID */
  tenantId: z.string(),
  /** Repository URL or path */
  repo: z.string(),
  /** Branch name */
  branch: z.string().optional(),
  /** Pipeline type */
  type: z.enum([
    'full_audit',        // Run all stages
    'targeted_fix',      // Fix specific issues
    'security_scan',     // Security-focused audit
    'docs_refresh',      // Documentation only
    'test_coverage',     // Testing focus
    'migration',         // Code migration
  ]),
  /** Target files/directories (optional filter) */
  targets: z.array(z.string()).optional(),
  /** Specific issue IDs to process */
  issueIds: z.array(z.string()).optional(),
  /** Risk tier limit */
  maxRiskTier: RiskTier.default('R2'),
  /** Auto-approve up to this tier */
  autoApproveTier: RiskTier.default('R1'),
  /** Model preferences */
  modelPreferences: z
    .object({
      audit: z.string().optional(),
      planning: z.string().optional(),
      coding: z.string().optional(),
      review: z.string().optional(),
    })
    .optional(),
  /** Token budget */
  tokenBudget: z.number().int().optional(),
  /** Cost budget (USD) */
  costBudget: z.number().optional(),
  /** Timeout (ms) */
  timeoutMs: z.number().int().optional(),
  /** Additional context */
  context: z.record(z.unknown()).optional(),
  /** Correlation ID for tracing */
  correlationId: z.string().optional(),
});
export type PipelineRequest = z.infer<typeof PipelineRequest>;

/**
 * Pipeline stage result
 */
export const PipelineStageResult = z.object({
  /** Stage name */
  stage: PipelineStage,
  /** Status */
  status: StageStatus,
  /** Started at */
  startedAt: z.string().datetime().optional(),
  /** Completed at */
  completedAt: z.string().datetime().optional(),
  /** Duration (ms) */
  durationMs: z.number().int().optional(),
  /** Output data */
  output: z.unknown().optional(),
  /** Error if failed */
  error: z.string().optional(),
  /** Tokens used */
  tokensUsed: z
    .object({
      input: z.number().int(),
      output: z.number().int(),
    })
    .optional(),
});
export type PipelineStageResult = z.infer<typeof PipelineStageResult>;

/**
 * Pipeline response - result of a SWE pipeline run
 */
export const PipelineResponse = z.object({
  /** Pipeline run ID */
  pipelineId: z.string(),
  /** Overall status */
  status: z.enum(['completed', 'failed', 'partial', 'cancelled', 'timeout']),
  /** Stage results */
  stages: z.array(PipelineStageResult),
  /** Issues found */
  issues: z.array(IssueSpec).optional(),
  /** Plans created */
  plans: z.array(FixPlan).optional(),
  /** Fixes applied */
  fixes: z.array(FixResult).optional(),
  /** QA verdicts */
  verdicts: z.array(QAVerdict).optional(),
  /** Doc updates */
  docs: z.array(DocUpdate).optional(),
  /** Summary */
  summary: z.object({
    totalIssues: z.number().int(),
    issuesFixed: z.number().int(),
    issuesFailed: z.number().int(),
    issuesSkipped: z.number().int(),
    testsRun: z.number().int().optional(),
    testsPassed: z.number().int().optional(),
    docsUpdated: z.number().int().optional(),
  }),
  /** Total tokens used */
  totalTokens: z.object({
    input: z.number().int(),
    output: z.number().int(),
  }),
  /** Total cost (USD) */
  totalCost: z.number().optional(),
  /** Total duration (ms) */
  totalDurationMs: z.number().int(),
  /** Error message if failed */
  error: z.string().optional(),
  /** Artifacts */
  artifacts: z
    .object({
      patchFile: z.string().optional(),
      reportFile: z.string().optional(),
      logsFile: z.string().optional(),
    })
    .optional(),
});
export type PipelineResponse = z.infer<typeof PipelineResponse>;

// =============================================================================
// Agent Task Contracts (A2A Payloads)
// =============================================================================

/**
 * Audit task request
 */
export const AuditTaskRequest = z.object({
  taskType: z.literal('audit'),
  repo: z.string(),
  branch: z.string().optional(),
  targets: z.array(z.string()).optional(),
  categories: z.array(IssueCategory).optional(),
  riskTier: RiskTier.default('R1'),
});
export type AuditTaskRequest = z.infer<typeof AuditTaskRequest>;

/**
 * Audit task response
 */
export const AuditTaskResponse = z.object({
  success: z.boolean(),
  issues: z.array(IssueSpec),
  filesScanned: z.number().int(),
  durationMs: z.number().int(),
  tokensUsed: z.object({
    input: z.number().int(),
    output: z.number().int(),
  }).optional(),
});
export type AuditTaskResponse = z.infer<typeof AuditTaskResponse>;

/**
 * Plan task request
 */
export const PlanTaskRequest = z.object({
  taskType: z.literal('plan'),
  issue: IssueSpec,
  repoContext: z.object({
    primaryLanguage: z.string().optional(),
    frameworks: z.array(z.string()).optional(),
    patterns: z.array(z.string()).optional(),
    relevantFiles: z.array(z.object({
      path: z.string(),
      content: z.string(),
    })).optional(),
  }).optional(),
  riskTier: RiskTier.default('R1'),
});
export type PlanTaskRequest = z.infer<typeof PlanTaskRequest>;

/**
 * Plan task response
 */
export const PlanTaskResponse = z.object({
  success: z.boolean(),
  plan: FixPlan.optional(),
  error: z.string().optional(),
  tokensUsed: z.object({
    input: z.number().int(),
    output: z.number().int(),
  }).optional(),
});
export type PlanTaskResponse = z.infer<typeof PlanTaskResponse>;

/**
 * Fix task request
 */
export const FixTaskRequest = z.object({
  taskType: z.literal('fix'),
  plan: FixPlan,
  issue: IssueSpec,
  riskTier: RiskTier,
  dryRun: z.boolean().default(false),
});
export type FixTaskRequest = z.infer<typeof FixTaskRequest>;

/**
 * Fix task response
 */
export const FixTaskResponse = z.object({
  success: z.boolean(),
  result: FixResult.optional(),
  error: z.string().optional(),
  tokensUsed: z.object({
    input: z.number().int(),
    output: z.number().int(),
  }).optional(),
});
export type FixTaskResponse = z.infer<typeof FixTaskResponse>;

/**
 * QA task request
 */
export const QATaskRequest = z.object({
  taskType: z.literal('qa'),
  fixResult: FixResult,
  issue: IssueSpec,
  plan: FixPlan,
  runTests: z.boolean().default(true),
  runLint: z.boolean().default(true),
  runTypeCheck: z.boolean().default(true),
  riskTier: RiskTier,
});
export type QATaskRequest = z.infer<typeof QATaskRequest>;

/**
 * QA task response
 */
export const QATaskResponse = z.object({
  success: z.boolean(),
  verdict: QAVerdict.optional(),
  error: z.string().optional(),
  tokensUsed: z.object({
    input: z.number().int(),
    output: z.number().int(),
  }).optional(),
});
export type QATaskResponse = z.infer<typeof QATaskResponse>;

/**
 * Docs task request
 */
export const DocsTaskRequest = z.object({
  taskType: z.literal('docs'),
  issues: z.array(IssueSpec).optional(),
  fixes: z.array(FixResult).optional(),
  docTypes: z.array(DocType).optional(),
  riskTier: RiskTier.default('R1'),
});
export type DocsTaskRequest = z.infer<typeof DocsTaskRequest>;

/**
 * Docs task response
 */
export const DocsTaskResponse = z.object({
  success: z.boolean(),
  updates: z.array(DocUpdate),
  error: z.string().optional(),
  tokensUsed: z.object({
    input: z.number().int(),
    output: z.number().int(),
  }).optional(),
});
export type DocsTaskResponse = z.infer<typeof DocsTaskResponse>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate a pipeline request
 */
export function validatePipelineRequest(data: unknown): PipelineRequest {
  return PipelineRequest.parse(data);
}

/**
 * Validate an issue spec
 */
export function validateIssueSpec(data: unknown): IssueSpec {
  return IssueSpec.parse(data);
}

/**
 * Validate a QA verdict
 */
export function validateQAVerdict(data: unknown): QAVerdict {
  return QAVerdict.parse(data);
}

/**
 * Get risk tier requirements
 */
export function getRiskTierRequirements(tier: RiskTier): typeof RiskTierMetadata[RiskTier] {
  return RiskTierMetadata[tier];
}

/**
 * Check if a risk tier meets requirements
 */
export function meetsRiskTier(actual: RiskTier, required: RiskTier): boolean {
  const tiers: RiskTier[] = ['R0', 'R1', 'R2', 'R3', 'R4'];
  return tiers.indexOf(actual) >= tiers.indexOf(required);
}
