/**
 * Parallel Step Executor Types
 *
 * Defines types for concurrent execution of workflow steps with DAG-based scheduling.
 *
 * @module @gwi/engine/executor
 */

/**
 * Step execution state
 */
export type StepExecutionStatus =
  | 'pending'    // Not yet started
  | 'running'    // Currently executing
  | 'completed'  // Successfully finished
  | 'failed'     // Failed with error
  | 'skipped'    // Skipped due to conditional logic or failed dependencies
  | 'cancelled'; // Cancelled by user or system

/**
 * Step retry configuration
 */
export interface StepRetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial backoff delay in milliseconds */
  initialDelayMs: number;
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Maximum backoff delay in milliseconds */
  maxDelayMs: number;
  /** Errors that should not trigger retry */
  nonRetryableErrors?: string[];
}

/**
 * Step definition in a workflow DAG
 */
export interface StepDefinition {
  /** Unique step identifier */
  id: string;
  /** Agent or function to execute */
  agent: string;
  /** Human-readable step name */
  name: string;
  /** Step dependencies (IDs of steps that must complete first) */
  dependencies: string[];
  /** Input data for this step (can reference outputs of dependencies) */
  input?: Record<string, unknown>;
  /** Retry configuration */
  retry?: StepRetryConfig;
  /** Step priority (higher = runs first when multiple steps are ready) */
  priority?: number;
  /** Conditional execution predicate */
  condition?: string; // e.g., "previous.status === 'completed'"
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Workflow definition with DAG structure
 */
export interface WorkflowDefinition {
  /** Workflow ID */
  id: string;
  /** Workflow type */
  type: string;
  /** Workflow name */
  name: string;
  /** Steps in DAG order */
  steps: StepDefinition[];
  /** Maximum parallel steps to execute simultaneously */
  maxParallelSteps: number;
  /** Global timeout for entire workflow */
  workflowTimeoutMs?: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Step execution result
 */
export interface StepExecution {
  /** Step ID */
  stepId: string;
  /** Current status */
  status: StepExecutionStatus;
  /** Output data from step */
  output?: unknown;
  /** Error if failed */
  error?: Error;
  /** Start timestamp */
  startedAt?: Date;
  /** Completion timestamp */
  completedAt?: Date;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Number of retry attempts */
  retryAttempts: number;
  /** Tokens consumed (if AI agent) */
  tokensUsed?: {
    input: number;
    output: number;
  };
}

/**
 * Execution plan resolved from DAG
 */
export interface ExecutionPlan {
  /** Workflow ID */
  workflowId: string;
  /** Total number of steps */
  totalSteps: number;
  /** Execution levels (steps grouped by dependency depth) */
  levels: string[][]; // Each level can execute in parallel
  /** Step definitions by ID */
  stepDefinitions: Map<string, StepDefinition>;
  /** Dependency graph: step ID → dependencies */
  dependencyGraph: Map<string, Set<string>>;
  /** Reverse dependency graph: step ID → dependents */
  dependentGraph: Map<string, Set<string>>;
}

/**
 * Execution context shared across steps
 */
export interface ExecutionContext {
  /** Workflow ID */
  workflowId: string;
  /** Tenant ID */
  tenantId: string;
  /** User who triggered workflow */
  userId: string;
  /** A2A correlation ID */
  correlationId: string;
  /** Cancellation signal */
  abortSignal?: AbortSignal;
  /** Step outputs (for data flow between steps) */
  stepOutputs: Map<string, unknown>;
  /** Global workflow input */
  workflowInput: unknown;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Executor configuration
 */
export interface ExecutorConfig {
  /** Maximum parallel steps (overrides workflow definition) */
  maxParallelSteps?: number;
  /** Default retry configuration */
  defaultRetry?: StepRetryConfig;
  /** Step timeout in milliseconds */
  defaultStepTimeoutMs?: number;
  /** Workflow timeout in milliseconds */
  defaultWorkflowTimeoutMs?: number;
  /** Callback for step state changes */
  onStepStateChange?: (stepId: string, status: StepExecutionStatus, execution: StepExecution) => void;
  /** Callback for workflow progress */
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Final workflow execution result
 */
export interface ExecutionResult {
  /** Workflow ID */
  workflowId: string;
  /** Overall success status */
  success: boolean;
  /** Step executions by ID */
  stepExecutions: Map<string, StepExecution>;
  /** Workflow output (output of final step) */
  output?: unknown;
  /** Error if workflow failed */
  error?: Error;
  /** Start timestamp */
  startedAt: Date;
  /** Completion timestamp */
  completedAt: Date;
  /** Total duration */
  durationMs: number;
  /** Total tokens consumed across all steps */
  totalTokensUsed?: {
    input: number;
    output: number;
  };
  /** Summary statistics */
  stats: {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;
    cancelledSteps: number;
    totalRetries: number;
  };
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: StepRetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 30000,
  nonRetryableErrors: [
    'AuthenticationError',
    'AuthorizationError',
    'ValidationError',
    'InvalidInputError',
  ],
};

/**
 * Default executor configuration
 */
export const DEFAULT_EXECUTOR_CONFIG: ExecutorConfig = {
  maxParallelSteps: 5,
  defaultRetry: DEFAULT_RETRY_CONFIG,
  defaultStepTimeoutMs: 300000, // 5 minutes
  defaultWorkflowTimeoutMs: 1800000, // 30 minutes
};
