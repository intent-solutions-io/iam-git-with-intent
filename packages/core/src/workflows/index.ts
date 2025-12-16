/**
 * Workflow Types and Contracts for Git With Intent
 *
 * Phase 13: Full Multi-Agent Workflow definitions.
 *
 * Workflows define the sequence of agents that execute to complete
 * a specific task. Each workflow has:
 * - Input contract (what data is needed to start)
 * - Output contract (what result is produced)
 * - Step definitions (which agents run in what order)
 *
 * @module @gwi/core/workflows
 */

import type { ComplexityScore, ResolutionResult, ReviewResult, PRMetadata, ConflictInfo } from '../types.js';
import type { Role } from '../security/index.js';

// =============================================================================
// Workflow Types
// =============================================================================

/**
 * Supported workflow types
 */
export type WorkflowType =
  | 'issue-to-code'    // Create code from issue description
  | 'pr-resolve'       // Resolve PR merge conflicts
  | 'pr-review'        // Review PR code changes
  | 'test-gen'         // Generate tests for code
  | 'docs-update';     // Update documentation

/**
 * Workflow execution status
 */
export type WorkflowStatus =
  | 'pending'          // Queued, not started
  | 'running'          // Currently executing
  | 'waiting_approval' // Paused for human approval
  | 'completed'        // Successfully finished
  | 'failed'           // Failed with error
  | 'cancelled'        // Manually cancelled
  | 'escalated';       // Escalated to human

/**
 * Workflow step execution status
 * (Named WorkflowStepStatus to avoid conflict with storage StepStatus)
 */
export type WorkflowStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

// =============================================================================
// GitHub/Issue Types
// =============================================================================

/**
 * GitHub issue metadata
 */
export interface IssueMetadata {
  url: string;
  number: number;
  title: string;
  body: string;
  author: string;
  labels: string[];
  assignees: string[];
  milestone?: string;
  repo: {
    owner: string;
    name: string;
    fullName: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Code generation result from Coder agent
 */
export interface CodeGenerationResult {
  files: Array<{
    path: string;
    content: string;
    action: 'create' | 'modify' | 'delete';
    explanation: string;
  }>;
  summary: string;
  confidence: number; // 0-100
  testsIncluded: boolean;
  estimatedComplexity: ComplexityScore;
}

// =============================================================================
// Workflow Input Contracts
// =============================================================================

/**
 * Input for Issue-to-Code workflow
 */
export interface IssueToCodeInput {
  /** GitHub issue metadata */
  issue: IssueMetadata;
  /** Target branch for changes */
  targetBranch: string;
  /** Additional context from repo */
  repoContext?: {
    primaryLanguage?: string;
    frameworks?: string[];
    existingPatterns?: string[];
  };
  /** User preferences */
  preferences?: {
    includeTests?: boolean;
    codeStyle?: string;
    maxFilesToCreate?: number;
  };
}

/**
 * Input for PR Resolve workflow
 */
export interface PRResolveInput {
  /** PR metadata */
  pr: PRMetadata;
  /** Conflicts to resolve */
  conflicts: ConflictInfo[];
  /** Auto-merge if all resolutions pass review */
  autoMerge?: boolean;
  /** Risk mode for applying changes */
  riskMode?: 'comment_only' | 'suggest_patch' | 'auto_patch' | 'auto_push';
}

/**
 * Input for PR Review workflow
 */
export interface PRReviewInput {
  /** PR metadata */
  pr: PRMetadata;
  /** Files changed in the PR */
  changedFiles: Array<{
    path: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;
  /** Review focus areas */
  focusAreas?: ('security' | 'performance' | 'logic' | 'style' | 'tests')[];
  /** Existing comments to consider */
  existingComments?: Array<{
    path: string;
    line: number;
    body: string;
    author: string;
  }>;
}

/**
 * Input for Test Generation workflow
 */
export interface TestGenInput {
  /** Files to generate tests for */
  files: Array<{
    path: string;
    content: string;
    language: string;
  }>;
  /** Testing framework to use */
  framework?: string;
  /** Coverage target percentage */
  coverageTarget?: number;
}

/**
 * Input for Docs Update workflow
 */
export interface DocsUpdateInput {
  /** Files that changed */
  changedFiles: Array<{
    path: string;
    changeType: 'added' | 'modified' | 'deleted';
  }>;
  /** Existing documentation to update */
  existingDocs?: Array<{
    path: string;
    content: string;
  }>;
  /** Documentation style guide */
  styleGuide?: string;
}

/**
 * Union type for all workflow inputs
 */
export type WorkflowInput =
  | { type: 'issue-to-code'; data: IssueToCodeInput }
  | { type: 'pr-resolve'; data: PRResolveInput }
  | { type: 'pr-review'; data: PRReviewInput }
  | { type: 'test-gen'; data: TestGenInput }
  | { type: 'docs-update'; data: DocsUpdateInput };

// =============================================================================
// Workflow Output Contracts
// =============================================================================

/**
 * Output from Issue-to-Code workflow
 */
export interface IssueToCodeOutput {
  /** Whether the workflow succeeded */
  success: boolean;
  /** Generated code */
  code?: CodeGenerationResult;
  /** PR created (if any) */
  pullRequest?: {
    url: string;
    number: number;
    title: string;
    branch: string;
  };
  /** Review results */
  review?: ReviewResult;
  /** Explanation of what was done */
  summary: string;
  /** Escalation info if needed */
  escalation?: {
    reason: string;
    suggestedActions: string[];
  };
}

/**
 * Output from PR Resolve workflow
 */
export interface PRResolveOutput {
  /** Whether all conflicts were resolved */
  success: boolean;
  /** Resolution results per file */
  resolutions: ResolutionResult[];
  /** Overall review of resolutions */
  review?: ReviewResult;
  /** Whether PR was merged */
  merged: boolean;
  /** Summary of what was done */
  summary: string;
  /** Files that need human attention */
  needsHumanReview?: string[];
  /** Escalation info if needed */
  escalation?: {
    reason: string;
    suggestedActions: string[];
  };
}

/**
 * Output from PR Review workflow
 */
export interface PRReviewOutput {
  /** Whether review is positive */
  approved: boolean;
  /** Review result */
  review: ReviewResult & {
    /** Inline comments to post */
    comments: Array<{
      path: string;
      line: number;
      body: string;
      severity: 'info' | 'warning' | 'error';
    }>;
    /** Summary comment */
    summaryComment: string;
  };
  /** Security findings */
  securityFindings?: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    file: string;
    line?: number;
    cwe?: string;
  }>;
  /** Performance concerns */
  performanceConcerns?: Array<{
    description: string;
    file: string;
    suggestion: string;
  }>;
}

/**
 * Output from Test Generation workflow
 */
export interface TestGenOutput {
  /** Generated test files */
  testFiles: Array<{
    path: string;
    content: string;
    testCount: number;
  }>;
  /** Estimated coverage increase */
  estimatedCoverageIncrease: number;
  /** Summary */
  summary: string;
}

/**
 * Output from Docs Update workflow
 */
export interface DocsUpdateOutput {
  /** Updated documentation files */
  updates: Array<{
    path: string;
    content: string;
    changeType: 'create' | 'update';
  }>;
  /** Summary of changes */
  summary: string;
}

/**
 * Union type for all workflow outputs
 */
export type WorkflowOutput =
  | { type: 'issue-to-code'; data: IssueToCodeOutput }
  | { type: 'pr-resolve'; data: PRResolveOutput }
  | { type: 'pr-review'; data: PRReviewOutput }
  | { type: 'test-gen'; data: TestGenOutput }
  | { type: 'docs-update'; data: DocsUpdateOutput };

// =============================================================================
// Workflow Step Definitions
// =============================================================================

/**
 * A single step in a workflow
 */
export interface WorkflowStep {
  /** Step identifier */
  id: string;
  /** Agent to execute this step */
  agent: string;
  /** Step status */
  status: WorkflowStepStatus;
  /** Input data for this step */
  input?: unknown;
  /** Output from this step */
  output?: unknown;
  /** Error if failed */
  error?: string;
  /** Execution timestamps */
  startedAt?: Date;
  completedAt?: Date;
  /** Execution duration */
  durationMs?: number;
  /** Tokens consumed */
  tokensUsed?: {
    input: number;
    output: number;
  };
}

/**
 * Workflow execution instance
 */
export interface WorkflowExecution {
  /** Unique workflow ID */
  id: string;
  /** Workflow type */
  type: WorkflowType;
  /** Current status */
  status: WorkflowStatus;
  /** Tenant context */
  tenantId: string;
  /** User who triggered */
  triggeredBy: string;
  /** Trigger source */
  triggerSource: 'api' | 'webhook' | 'schedule' | 'cli';
  /** Workflow steps */
  steps: WorkflowStep[];
  /** Input data */
  input: unknown;
  /** Output data (when complete) */
  output?: unknown;
  /** Error message if failed */
  error?: string;
  /** A2A correlation ID */
  correlationId: string;
  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  /** Total duration */
  durationMs?: number;
  /** Total tokens used */
  totalTokensUsed?: {
    input: number;
    output: number;
  };
}

// =============================================================================
// Workflow Definitions
// =============================================================================

/**
 * Static workflow definitions - which agents run for each workflow
 */
export const WORKFLOW_DEFINITIONS: Record<WorkflowType, string[]> = {
  'issue-to-code': ['triage', 'coder', 'reviewer'],
  'pr-resolve': ['triage', 'resolver', 'reviewer'],
  'pr-review': ['reviewer'],
  'test-gen': ['triage', 'coder'],
  'docs-update': ['coder'],
};

/**
 * Get the agents required for a workflow
 */
export function getWorkflowAgents(type: WorkflowType): string[] {
  return WORKFLOW_DEFINITIONS[type] ?? [];
}

/**
 * Check if a workflow requires approval before completion
 */
export function workflowRequiresApproval(type: WorkflowType): boolean {
  // PR resolve and issue-to-code require approval before pushing
  return type === 'pr-resolve' || type === 'issue-to-code';
}

/**
 * Get the minimum role required to trigger a workflow
 */
export function getWorkflowRequiredRole(type: WorkflowType): Role {
  switch (type) {
    case 'issue-to-code':
    case 'pr-resolve':
      return 'DEVELOPER'; // Can create/modify code
    case 'pr-review':
    case 'test-gen':
    case 'docs-update':
      return 'VIEWER'; // Read-only analysis
    default:
      return 'DEVELOPER';
  }
}

// =============================================================================
// Workflow Event Types (for hooks/logging)
// =============================================================================

/**
 * Workflow lifecycle events
 */
export type WorkflowEvent =
  | { type: 'workflow_started'; workflowId: string; workflowType: WorkflowType }
  | { type: 'step_started'; workflowId: string; stepId: string; agent: string }
  | { type: 'step_completed'; workflowId: string; stepId: string; agent: string; durationMs: number }
  | { type: 'step_failed'; workflowId: string; stepId: string; agent: string; error: string }
  | { type: 'workflow_completed'; workflowId: string; success: boolean; durationMs: number }
  | { type: 'workflow_failed'; workflowId: string; error: string }
  | { type: 'workflow_escalated'; workflowId: string; reason: string }
  | { type: 'approval_requested'; workflowId: string; stepId: string }
  | { type: 'approval_received'; workflowId: string; stepId: string; approved: boolean };

/**
 * Create a workflow event for logging
 *
 * @example
 * createWorkflowEvent('workflow_started', { workflowId: 'wf-123', workflowType: 'pr-resolve' })
 */
export function createWorkflowEvent(
  event: WorkflowEvent
): WorkflowEvent {
  return event;
}
