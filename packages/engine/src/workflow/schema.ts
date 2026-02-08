/**
 * Workflow Definition Schema
 *
 * C1: DAG-based workflow definitions with Zod validation.
 * Defines the structure for multi-step workflows where steps
 * can have dependencies and run in parallel when possible.
 *
 * @module @gwi/engine/workflow/schema
 */

import { z } from 'zod';

// =============================================================================
// Step Types
// =============================================================================

/**
 * Available step types in a workflow.
 * Aligns with StepInput.stepType from step-contract.
 */
export const WorkflowStepType = z.enum([
  'triage',
  'plan',
  'code',
  'resolve',
  'review',
  'apply',
  'sandbox',
  'custom',
]);

export type WorkflowStepType = z.infer<typeof WorkflowStepType>;

/**
 * Step execution strategy
 */
export const StepExecutionStrategy = z.enum([
  'sequential',  // Run after dependencies complete
  'parallel',    // Run in parallel with siblings (no mutual dependencies)
  'conditional', // Run only if condition is met
]);

export type StepExecutionStrategy = z.infer<typeof StepExecutionStrategy>;

// =============================================================================
// Step Configuration
// =============================================================================

/**
 * Retry configuration for a step
 */
export const StepRetryConfig = z.object({
  /** Maximum number of retry attempts */
  maxAttempts: z.number().int().min(0).max(10).default(3),

  /** Initial delay between retries in milliseconds */
  initialDelayMs: z.number().int().min(100).max(60000).default(1000),

  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: z.number().min(1).max(5).default(2),

  /** Maximum delay between retries in milliseconds */
  maxDelayMs: z.number().int().min(1000).max(300000).default(30000),

  /** Result codes that should trigger a retry */
  retryOn: z.array(z.enum(['retryable'])).default(['retryable']),
});

export type StepRetryConfig = z.infer<typeof StepRetryConfig>;

/**
 * Timeout configuration for a step
 */
export const StepTimeoutConfig = z.object({
  /** Step execution timeout in milliseconds */
  executionMs: z.number().int().min(1000).max(3600000).default(300000), // 5 min default

  /** Timeout for waiting on approvals in milliseconds */
  approvalMs: z.number().int().min(1000).max(86400000).optional(), // Up to 24 hours
});

export type StepTimeoutConfig = z.infer<typeof StepTimeoutConfig>;

/**
 * Model configuration for AI-powered steps
 */
export const StepModelConfig = z.object({
  /** Model identifier */
  model: z.string(),

  /** Provider (anthropic, google, openai) */
  provider: z.enum(['anthropic', 'google', 'openai']),

  /** Temperature for generation */
  temperature: z.number().min(0).max(2).optional(),

  /** Maximum tokens to generate */
  maxTokens: z.number().int().positive().optional(),
});

export type StepModelConfig = z.infer<typeof StepModelConfig>;

/**
 * Sandbox configuration for sandbox steps
 */
export const SandboxStepConfig = z.object({
  /** Sandbox type */
  sandboxType: z.enum(['docker', 'kvm', 'deno-isolate']).default('docker'),

  /** Base image for Docker/KVM */
  baseImage: z.string().optional(),

  /** Working directory inside sandbox */
  workDir: z.string().default('/workspace'),

  /** Whether to snapshot before execution */
  snapshot: z.boolean().default(true),

  /** Resource limits */
  resources: z.object({
    /** Memory limit (e.g., "512m", "2g") */
    memory: z.string().optional(),

    /** CPU limit (e.g., "0.5", "2") */
    cpu: z.string().optional(),

    /** Disk limit (e.g., "1g", "10g") */
    disk: z.string().optional(),

    /** Network access mode */
    network: z.enum(['none', 'host', 'bridge']).default('none'),
  }).optional(),

  /** Files to mount into sandbox */
  mounts: z.array(z.object({
    /** Host path (or artifact reference) */
    source: z.string(),

    /** Path inside sandbox */
    target: z.string(),

    /** Read-only mount */
    readonly: z.boolean().default(true),
  })).optional(),

  /** Environment variables */
  env: z.record(z.string(), z.string()).optional(),

  /** Commands to execute in sandbox */
  commands: z.array(z.string()).optional(),

  /** Timeout for sandbox operations in milliseconds */
  sandboxTimeoutMs: z.number().int().min(1000).max(3600000).default(300000),

  /** IaC export format (terraform, pulumi, etc.) */
  exportFormat: z.enum(['terraform', 'opentofu', 'pulumi', 'ansible', 'cloudformation']).optional(),

  /** Whether this step requires root access (KVM only) */
  requiresRoot: z.boolean().default(false),

  /** Deno permissions (for deno-isolate type) */
  denoPermissions: z.object({
    allowNet: z.union([z.boolean(), z.array(z.string())]).optional(),
    allowRead: z.union([z.boolean(), z.array(z.string())]).optional(),
    allowWrite: z.union([z.boolean(), z.array(z.string())]).optional(),
    allowEnv: z.union([z.boolean(), z.array(z.string())]).optional(),
    allowRun: z.union([z.boolean(), z.array(z.string())]).optional(),
  }).optional(),
});

export type SandboxStepConfig = z.infer<typeof SandboxStepConfig>;

// =============================================================================
// Step Conditions
// =============================================================================

/**
 * Condition operators for conditional execution
 */
export const ConditionOperator = z.enum([
  'eq',       // equals
  'neq',      // not equals
  'gt',       // greater than
  'gte',      // greater than or equal
  'lt',       // less than
  'lte',      // less than or equal
  'in',       // value in array
  'not_in',   // value not in array
  'contains', // string/array contains
  'matches',  // regex match
  'exists',   // field exists and is truthy
]);

export type ConditionOperator = z.infer<typeof ConditionOperator>;

/**
 * Single condition for conditional execution
 */
export const StepCondition = z.object({
  /** Field to evaluate (dot notation for nested, e.g., "previousOutput.score") */
  field: z.string(),

  /** Comparison operator */
  operator: ConditionOperator,

  /** Value to compare against */
  value: z.unknown(),
});

export type StepCondition = z.infer<typeof StepCondition>;

/**
 * Condition group type interface (defined first for recursive typing)
 */
export interface ConditionGroupType {
  logic: 'and' | 'or';
  conditions: (z.infer<typeof StepCondition> | ConditionGroupType)[];
}

/**
 * Condition group with logical operators
 */
export const ConditionGroup: z.ZodType<ConditionGroupType, z.ZodTypeDef, ConditionGroupType> = z.lazy(() =>
  z.object({
    logic: z.enum(['and', 'or']),
    conditions: z.array(z.union([StepCondition, ConditionGroup])),
  }) as unknown as z.ZodType<ConditionGroupType, z.ZodTypeDef, ConditionGroupType>
);

// =============================================================================
// Step Dependencies
// =============================================================================

/**
 * Dependency specification for a step
 */
export const StepDependency = z.object({
  /** ID of the step this depends on */
  stepId: z.string().min(1).max(64),

  /** Required result codes for this dependency to be satisfied */
  requiredResults: z.array(z.enum(['ok', 'skipped'])).default(['ok']),

  /** Whether to pass output from this step */
  passOutput: z.boolean().default(true),

  /** Optional mapping of output fields */
  outputMapping: z.record(z.string(), z.string()).optional(),
});

export type StepDependency = z.infer<typeof StepDependency>;

// =============================================================================
// Workflow Step
// =============================================================================

/**
 * Input specification for a step
 */
export const StepInputSpec = z.object({
  /** Static parameters passed to the step */
  params: z.record(z.unknown()).optional(),

  /** Fields to extract from previous step outputs */
  fromPreviousSteps: z.record(z.string(), z.string()).optional(),

  /** Fields to extract from workflow context */
  fromContext: z.array(z.string()).optional(),
});

export type StepInputSpec = z.infer<typeof StepInputSpec>;

/**
 * Output specification for a step
 */
export const StepOutputSpec = z.object({
  /** Fields to extract and pass to dependent steps */
  extract: z.array(z.string()).optional(),

  /** Fields to store in workflow artifacts */
  artifacts: z.array(z.string()).optional(),

  /** Field to use as step summary */
  summaryField: z.string().optional(),
});

export type StepOutputSpec = z.infer<typeof StepOutputSpec>;

/**
 * A single step in a workflow
 */
export const WorkflowStep = z.object({
  /** Unique step identifier within the workflow */
  id: z.string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, 'Step ID must start with a letter and contain only alphanumeric, underscore, or hyphen'),

  /** Human-readable step name */
  name: z.string().min(1).max(128),

  /** Step description */
  description: z.string().max(1024).optional(),

  /** Step type */
  type: WorkflowStepType,

  /** Execution strategy */
  strategy: StepExecutionStrategy.default('sequential'),

  /** Dependencies on other steps (by step ID) */
  dependsOn: z.array(z.union([
    z.string(), // Simple string for basic dependency
    StepDependency, // Full dependency spec
  ])).default([]),

  /** Condition for conditional execution */
  condition: z.union([StepCondition, ConditionGroup]).optional(),

  /** Input specification */
  input: StepInputSpec.optional(),

  /** Output specification */
  output: StepOutputSpec.optional(),

  /** Model configuration (for AI-powered steps) */
  model: StepModelConfig.optional(),

  /** Sandbox configuration (for type: sandbox) */
  sandbox: SandboxStepConfig.optional(),

  /** Retry configuration */
  retry: StepRetryConfig.optional(),

  /** Timeout configuration */
  timeout: StepTimeoutConfig.optional(),

  /** Whether this step requires approval before execution */
  requiresApproval: z.boolean().default(false),

  /** Labels for categorization */
  labels: z.array(z.string()).default([]),

  /** Whether to continue workflow on step failure */
  continueOnFailure: z.boolean().default(false),

  /** Custom step handler (for type: custom) */
  handler: z.string().optional(),
});

export type WorkflowStep = z.infer<typeof WorkflowStep>;

// =============================================================================
// Workflow Metadata
// =============================================================================

/**
 * Workflow metadata
 */
export const WorkflowMetadata = z.object({
  /** Workflow author */
  author: z.string().optional(),

  /** Workflow version (semver) */
  version: z.string()
    .regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/, 'Version must be valid semver')
    .optional(),

  /** Creation timestamp (ISO 8601) */
  createdAt: z.string().datetime().optional(),

  /** Last modified timestamp (ISO 8601) */
  updatedAt: z.string().datetime().optional(),

  /** Tags for categorization */
  tags: z.array(z.string()).default([]),

  /** Source file path (for YAML-defined workflows) */
  source: z.string().optional(),
});

export type WorkflowMetadata = z.infer<typeof WorkflowMetadata>;

// =============================================================================
// Workflow Triggers
// =============================================================================

/**
 * Trigger types for workflow execution
 */
export const WorkflowTriggerType = z.enum([
  'manual',    // Manual trigger via CLI/API
  'webhook',   // GitHub webhook event
  'schedule',  // Scheduled execution
  'event',     // Internal event
]);

export type WorkflowTriggerType = z.infer<typeof WorkflowTriggerType>;

/**
 * Workflow trigger configuration
 */
export const WorkflowTrigger = z.object({
  /** Trigger type */
  type: WorkflowTriggerType,

  /** Events that trigger this workflow (for webhook/event types) */
  events: z.array(z.string()).optional(),

  /** Cron expression (for schedule type) */
  cron: z.string().optional(),

  /** Filter conditions for trigger */
  filters: z.record(z.unknown()).optional(),
});

export type WorkflowTrigger = z.infer<typeof WorkflowTrigger>;

// =============================================================================
// Workflow Definition
// =============================================================================

/**
 * Default configurations for all steps in a workflow
 */
export const WorkflowDefaults = z.object({
  /** Default retry configuration */
  retry: StepRetryConfig.optional(),

  /** Default timeout configuration */
  timeout: StepTimeoutConfig.optional(),

  /** Default model configuration */
  model: StepModelConfig.optional(),

  /** Default continue on failure */
  continueOnFailure: z.boolean().optional(),
});

export type WorkflowDefaults = z.infer<typeof WorkflowDefaults>;

/**
 * Complete workflow definition
 *
 * A workflow is a DAG (Directed Acyclic Graph) of steps where:
 * - Steps can depend on other steps
 * - Steps with no dependencies run first
 * - Steps with satisfied dependencies can run in parallel
 * - The workflow completes when all steps complete
 *
 * @example
 * ```yaml
 * id: pr-autopilot
 * name: PR Autopilot Workflow
 * description: Full automated PR handling
 * steps:
 *   - id: triage
 *     name: Triage PR
 *     type: triage
 *   - id: plan
 *     name: Create Plan
 *     type: plan
 *     dependsOn: [triage]
 *   - id: resolve
 *     name: Resolve Conflicts
 *     type: resolve
 *     dependsOn: [plan]
 *   - id: review
 *     name: Generate Review
 *     type: review
 *     dependsOn: [resolve]
 * ```
 */
export const WorkflowDefinition = z.object({
  /** Unique workflow identifier */
  id: z.string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, 'Workflow ID must start with a letter and contain only alphanumeric, underscore, or hyphen'),

  /** Human-readable workflow name */
  name: z.string().min(1).max(128),

  /** Workflow description */
  description: z.string().max(2048).optional(),

  /** Workflow metadata */
  metadata: WorkflowMetadata.optional(),

  /** Workflow triggers */
  triggers: z.array(WorkflowTrigger).default([]),

  /** Default configurations for steps */
  defaults: WorkflowDefaults.optional(),

  /** Workflow steps (DAG nodes) */
  steps: z.array(WorkflowStep).min(1),

  /** Entry point step ID (defaults to first step with no dependencies) */
  entryPoint: z.string().optional(),

  /** Whether workflow is enabled */
  enabled: z.boolean().default(true),

  /** Maximum parallel steps */
  maxParallelSteps: z.number().int().min(1).max(20).default(5),

  /** Global workflow timeout in milliseconds */
  timeoutMs: z.number().int().min(1000).max(86400000).optional(), // Up to 24 hours
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinition>;

// =============================================================================
// Workflow Instance (Runtime State)
// =============================================================================

/**
 * Step execution state
 */
export const StepExecutionState = z.enum([
  'pending',    // Not yet started
  'waiting',    // Waiting for dependencies
  'ready',      // Dependencies satisfied, ready to run
  'running',    // Currently executing
  'completed',  // Successfully completed
  'failed',     // Failed execution
  'skipped',    // Skipped (condition not met or continueOnFailure)
  'cancelled',  // Cancelled
  'blocked',    // Waiting for approval
]);

export type StepExecutionState = z.infer<typeof StepExecutionState>;

/**
 * Runtime state for a single step
 */
export const StepInstanceState = z.object({
  /** Step ID from workflow definition */
  stepId: z.string(),

  /** Current execution state */
  state: StepExecutionState,

  /** Attempt number (0-indexed) */
  attempt: z.number().int().nonnegative().default(0),

  /** When the step started */
  startedAt: z.string().datetime().optional(),

  /** When the step completed */
  completedAt: z.string().datetime().optional(),

  /** Step output (if completed) */
  output: z.unknown().optional(),

  /** Error message (if failed) */
  error: z.string().optional(),

  /** Result code from step execution */
  resultCode: z.enum(['ok', 'retryable', 'fatal', 'blocked', 'skipped']).optional(),
});

export type StepInstanceState = z.infer<typeof StepInstanceState>;

/**
 * Workflow execution state
 */
export const WorkflowExecutionState = z.enum([
  'pending',    // Not yet started
  'running',    // Currently executing
  'completed',  // All steps completed successfully
  'failed',     // One or more steps failed
  'cancelled',  // Workflow was cancelled
  'paused',     // Paused (waiting for approval)
]);

export type WorkflowExecutionState = z.infer<typeof WorkflowExecutionState>;

/**
 * Runtime instance of a workflow execution
 */
export const WorkflowInstance = z.object({
  /** Unique instance ID */
  instanceId: z.string().uuid(),

  /** Workflow definition ID */
  workflowId: z.string(),

  /** Run ID (links to engine run) */
  runId: z.string().uuid(),

  /** Tenant ID */
  tenantId: z.string(),

  /** Current workflow state */
  state: WorkflowExecutionState,

  /** State of each step */
  steps: z.record(z.string(), StepInstanceState),

  /** Workflow context (shared data between steps) */
  context: z.record(z.unknown()).default({}),

  /** When the workflow started */
  startedAt: z.string().datetime(),

  /** When the workflow completed */
  completedAt: z.string().datetime().optional(),

  /** Workflow output */
  output: z.unknown().optional(),

  /** Error message (if failed) */
  error: z.string().optional(),
});

export type WorkflowInstance = z.infer<typeof WorkflowInstance>;

// =============================================================================
// Helper Constants
// =============================================================================

/**
 * Terminal step states (no further transitions)
 */
export const TERMINAL_STEP_STATES: ReadonlySet<StepExecutionState> = new Set<StepExecutionState>([
  'completed',
  'failed',
  'skipped',
  'cancelled',
]);

/**
 * Terminal workflow states (no further transitions)
 */
export const TERMINAL_WORKFLOW_STATES: ReadonlySet<WorkflowExecutionState> = new Set<WorkflowExecutionState>([
  'completed',
  'failed',
  'cancelled',
]);

/**
 * States that indicate a step can be executed
 */
export const EXECUTABLE_STEP_STATES: ReadonlySet<StepExecutionState> = new Set<StepExecutionState>([
  'ready',
]);
