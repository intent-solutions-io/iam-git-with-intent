/**
 * Phase 27: Forensics Types
 *
 * Type definitions for the ForensicBundle contract used for replay and audit.
 * All forensic data must be redacted before storage to prevent secrets leakage.
 */

import { z } from 'zod';

// =============================================================================
// Redaction Configuration
// =============================================================================

/**
 * Fields that should be redacted (replaced with placeholder)
 */
export const RedactionField = z.enum([
  'api_key',
  'secret',
  'password',
  'token',
  'credential',
  'private_key',
  'pii_email',
  'pii_phone',
  'pii_ssn',
  'pii_name',
  'env_var',
  'custom',
]);
export type RedactionField = z.infer<typeof RedactionField>;

/**
 * Redaction rule configuration
 */
export const RedactionRule = z.object({
  /** Field type to redact */
  field: RedactionField,
  /** Pattern to match (regex string) */
  pattern: z.string(),
  /** Replacement string (default: [REDACTED]) */
  replacement: z.string().default('[REDACTED]'),
  /** Whether this rule is enabled */
  enabled: z.boolean().default(true),
  /** Description of what this rule catches */
  description: z.string().optional(),
});
export type RedactionRule = z.infer<typeof RedactionRule>;

/**
 * Redaction configuration
 */
export const RedactionConfig = z.object({
  /** Rules to apply */
  rules: z.array(RedactionRule),
  /** Whether to redact API keys */
  redactApiKeys: z.boolean().default(true),
  /** Whether to redact secrets (passwords, tokens) */
  redactSecrets: z.boolean().default(true),
  /** Whether to redact PII */
  redactPii: z.boolean().default(false),
  /** Whether to redact environment variables */
  redactEnvVars: z.boolean().default(true),
  /** Custom patterns to redact */
  customPatterns: z.array(z.string()).default([]),
});
export type RedactionConfig = z.infer<typeof RedactionConfig>;

// =============================================================================
// Event Types
// =============================================================================

/**
 * Event type enum
 */
export const ForensicEventType = z.enum([
  // Run lifecycle
  'run.started',
  'run.completed',
  'run.failed',
  'run.timeout',

  // Step lifecycle
  'step.started',
  'step.completed',
  'step.failed',
  'step.skipped',

  // Tool invocations
  'tool.invoked',
  'tool.completed',
  'tool.failed',
  'tool.timeout',

  // LLM calls
  'llm.request',
  'llm.response',
  'llm.error',
  'llm.token_limit',

  // Policy decisions
  'policy.check',
  'policy.approved',
  'policy.denied',
  'policy.escalated',

  // Approval workflow
  'approval.requested',
  'approval.granted',
  'approval.denied',
  'approval.expired',

  // Error/DLQ
  'error.unhandled',
  'error.retry',
  'dlq.enqueued',
  'dlq.replayed',
]);
export type ForensicEventType = z.infer<typeof ForensicEventType>;

/**
 * Base event structure
 */
export const ForensicEventBase = z.object({
  /** Unique event ID */
  event_id: z.string().uuid(),
  /** Event type */
  type: ForensicEventType,
  /** ISO 8601 timestamp */
  timestamp: z.string().datetime(),
  /** Sequence number within the run */
  sequence: z.number().int().nonnegative(),
  /** Duration in milliseconds (for completed events) */
  duration_ms: z.number().int().nonnegative().optional(),
  /** Parent event ID (for nested events) */
  parent_id: z.string().uuid().optional(),
  /** Correlation ID for distributed tracing */
  correlation_id: z.string().optional(),
  /** Span ID for OpenTelemetry */
  span_id: z.string().optional(),
  /** Additional metadata */
  metadata: z.record(z.unknown()).optional(),
});
export type ForensicEventBase = z.infer<typeof ForensicEventBase>;

// =============================================================================
// Specialized Event Types
// =============================================================================

/**
 * Run lifecycle event
 */
export const RunLifecycleEvent = ForensicEventBase.extend({
  type: z.enum(['run.started', 'run.completed', 'run.failed', 'run.timeout']),
  data: z.object({
    run_id: z.string(),
    tenant_id: z.string(),
    workflow_id: z.string().optional(),
    input: z.record(z.unknown()).optional(),
    output: z.record(z.unknown()).optional(),
    error: z
      .object({
        name: z.string(),
        message: z.string(),
        stack: z.string().optional(),
      })
      .optional(),
    exit_code: z.number().int().optional(),
    agent_id: z.string().optional(),
    model: z.string().optional(),
  }),
});
export type RunLifecycleEvent = z.infer<typeof RunLifecycleEvent>;

/**
 * Step lifecycle event
 */
export const StepLifecycleEvent = ForensicEventBase.extend({
  type: z.enum(['step.started', 'step.completed', 'step.failed', 'step.skipped']),
  data: z.object({
    step_id: z.string(),
    step_name: z.string(),
    step_index: z.number().int().nonnegative(),
    input: z.record(z.unknown()).optional(),
    output: z.record(z.unknown()).optional(),
    error: z
      .object({
        name: z.string(),
        message: z.string(),
        stack: z.string().optional(),
      })
      .optional(),
    skip_reason: z.string().optional(),
  }),
});
export type StepLifecycleEvent = z.infer<typeof StepLifecycleEvent>;

/**
 * Tool invocation event
 */
export const ToolInvocationEvent = ForensicEventBase.extend({
  type: z.enum(['tool.invoked', 'tool.completed', 'tool.failed', 'tool.timeout']),
  data: z.object({
    tool_name: z.string(),
    tool_id: z.string(),
    input: z.record(z.unknown()).optional(),
    output: z.record(z.unknown()).optional(),
    error: z
      .object({
        name: z.string(),
        message: z.string(),
        stack: z.string().optional(),
      })
      .optional(),
    timeout_ms: z.number().int().optional(),
    retry_count: z.number().int().nonnegative().optional(),
  }),
});
export type ToolInvocationEvent = z.infer<typeof ToolInvocationEvent>;

/**
 * LLM request/response event
 */
export const LLMEvent = ForensicEventBase.extend({
  type: z.enum(['llm.request', 'llm.response', 'llm.error', 'llm.token_limit']),
  data: z.object({
    provider: z.string(),
    model: z.string(),
    request_id: z.string().optional(),
    /** Prompt (redacted) */
    prompt: z.string().optional(),
    /** System prompt (redacted) */
    system: z.string().optional(),
    /** Response text (redacted) */
    response: z.string().optional(),
    /** Token usage */
    usage: z
      .object({
        prompt_tokens: z.number().int().nonnegative(),
        completion_tokens: z.number().int().nonnegative(),
        total_tokens: z.number().int().nonnegative(),
      })
      .optional(),
    /** Latency in milliseconds */
    latency_ms: z.number().int().nonnegative().optional(),
    /** Error if failed */
    error: z
      .object({
        name: z.string(),
        message: z.string(),
        code: z.string().optional(),
      })
      .optional(),
    /** Temperature used */
    temperature: z.number().optional(),
    /** Max tokens requested */
    max_tokens: z.number().int().optional(),
    /** Finish reason */
    finish_reason: z.string().optional(),
  }),
});
export type LLMEvent = z.infer<typeof LLMEvent>;

/**
 * Policy decision event
 */
export const PolicyEvent = ForensicEventBase.extend({
  type: z.enum(['policy.check', 'policy.approved', 'policy.denied', 'policy.escalated']),
  data: z.object({
    policy_id: z.string(),
    policy_name: z.string().optional(),
    gate_id: z.string().optional(),
    action: z.string(),
    resource: z.string().optional(),
    decision: z.enum(['allow', 'deny', 'escalate', 'pending']),
    reason: z.string().optional(),
    required_scopes: z.array(z.string()).optional(),
    granted_scopes: z.array(z.string()).optional(),
    approval_id: z.string().optional(),
    expires_at: z.string().datetime().optional(),
  }),
});
export type PolicyEvent = z.infer<typeof PolicyEvent>;

/**
 * Approval workflow event
 */
export const ApprovalEvent = ForensicEventBase.extend({
  type: z.enum([
    'approval.requested',
    'approval.granted',
    'approval.denied',
    'approval.expired',
  ]),
  data: z.object({
    approval_id: z.string(),
    requester_id: z.string(),
    approver_id: z.string().optional(),
    scope: z.string(),
    reason: z.string().optional(),
    expires_at: z.string().datetime().optional(),
    granted_at: z.string().datetime().optional(),
    denied_at: z.string().datetime().optional(),
  }),
});
export type ApprovalEvent = z.infer<typeof ApprovalEvent>;

/**
 * Error/DLQ event
 */
export const ErrorEvent = ForensicEventBase.extend({
  type: z.enum(['error.unhandled', 'error.retry', 'dlq.enqueued', 'dlq.replayed']),
  data: z.object({
    error_id: z.string(),
    error: z.object({
      name: z.string(),
      message: z.string(),
      stack: z.string().optional(),
      code: z.string().optional(),
    }),
    retry_count: z.number().int().nonnegative().optional(),
    max_retries: z.number().int().optional(),
    next_retry_at: z.string().datetime().optional(),
    dlq_id: z.string().optional(),
    original_event_id: z.string().optional(),
    replayed_at: z.string().datetime().optional(),
  }),
});
export type ErrorEvent = z.infer<typeof ErrorEvent>;

/**
 * Union of all event types
 */
export const ForensicEvent = z.discriminatedUnion('type', [
  // Run lifecycle - need individual schemas
  ForensicEventBase.extend({
    type: z.literal('run.started'),
    data: RunLifecycleEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('run.completed'),
    data: RunLifecycleEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('run.failed'),
    data: RunLifecycleEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('run.timeout'),
    data: RunLifecycleEvent.shape.data,
  }),

  // Step lifecycle
  ForensicEventBase.extend({
    type: z.literal('step.started'),
    data: StepLifecycleEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('step.completed'),
    data: StepLifecycleEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('step.failed'),
    data: StepLifecycleEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('step.skipped'),
    data: StepLifecycleEvent.shape.data,
  }),

  // Tool invocations
  ForensicEventBase.extend({
    type: z.literal('tool.invoked'),
    data: ToolInvocationEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('tool.completed'),
    data: ToolInvocationEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('tool.failed'),
    data: ToolInvocationEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('tool.timeout'),
    data: ToolInvocationEvent.shape.data,
  }),

  // LLM calls
  ForensicEventBase.extend({
    type: z.literal('llm.request'),
    data: LLMEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('llm.response'),
    data: LLMEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('llm.error'),
    data: LLMEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('llm.token_limit'),
    data: LLMEvent.shape.data,
  }),

  // Policy decisions
  ForensicEventBase.extend({
    type: z.literal('policy.check'),
    data: PolicyEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('policy.approved'),
    data: PolicyEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('policy.denied'),
    data: PolicyEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('policy.escalated'),
    data: PolicyEvent.shape.data,
  }),

  // Approval workflow
  ForensicEventBase.extend({
    type: z.literal('approval.requested'),
    data: ApprovalEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('approval.granted'),
    data: ApprovalEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('approval.denied'),
    data: ApprovalEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('approval.expired'),
    data: ApprovalEvent.shape.data,
  }),

  // Error/DLQ
  ForensicEventBase.extend({
    type: z.literal('error.unhandled'),
    data: ErrorEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('error.retry'),
    data: ErrorEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('dlq.enqueued'),
    data: ErrorEvent.shape.data,
  }),
  ForensicEventBase.extend({
    type: z.literal('dlq.replayed'),
    data: ErrorEvent.shape.data,
  }),
]);
export type ForensicEvent = z.infer<typeof ForensicEvent>;

// =============================================================================
// ForensicBundle Schema
// =============================================================================

/**
 * Replay status
 */
export const ReplayStatus = z.enum([
  'not_replayed',
  'replay_pending',
  'replaying',
  'replay_succeeded',
  'replay_failed',
  'replay_diff_detected',
]);
export type ReplayStatus = z.infer<typeof ReplayStatus>;

/**
 * ForensicBundle - Complete audit record for a run
 */
export const ForensicBundleSchema = z.object({
  /** Bundle format version */
  version: z.literal(1),

  /** Unique bundle ID */
  bundle_id: z.string().uuid(),

  /** Run ID this bundle is for */
  run_id: z.string(),

  /** Tenant ID */
  tenant_id: z.string(),

  /** Workflow ID (if applicable) */
  workflow_id: z.string().optional(),

  /** ISO 8601 timestamp when bundle was created */
  created_at: z.string().datetime(),

  /** ISO 8601 timestamp when run started */
  run_started_at: z.string().datetime(),

  /** ISO 8601 timestamp when run completed/failed */
  run_ended_at: z.string().datetime().optional(),

  /** Run duration in milliseconds */
  run_duration_ms: z.number().int().nonnegative().optional(),

  /** Final run status */
  run_status: z.enum(['running', 'completed', 'failed', 'timeout', 'cancelled']),

  /** Agent ID that executed the run */
  agent_id: z.string().optional(),

  /** Model used for the run */
  model: z.string().optional(),

  /** Original input (redacted) */
  input: z.record(z.unknown()).optional(),

  /** Final output (redacted) */
  output: z.record(z.unknown()).optional(),

  /** Error if failed */
  error: z
    .object({
      name: z.string(),
      message: z.string(),
      stack: z.string().optional(),
      code: z.string().optional(),
    })
    .optional(),

  /** All events in chronological order */
  events: z.array(ForensicEvent),

  /** Event counts by type */
  event_counts: z.record(z.number().int().nonnegative()),

  /** Total token usage across all LLM calls */
  total_tokens: z
    .object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
      total_tokens: z.number().int().nonnegative(),
    })
    .optional(),

  /** Total LLM latency in milliseconds */
  total_llm_latency_ms: z.number().int().nonnegative().optional(),

  /** Policy decisions summary */
  policy_summary: z
    .object({
      total_checks: z.number().int().nonnegative(),
      approved: z.number().int().nonnegative(),
      denied: z.number().int().nonnegative(),
      escalated: z.number().int().nonnegative(),
    })
    .optional(),

  /** Redaction info */
  redaction: z.object({
    /** Whether redaction was applied */
    applied: z.boolean(),
    /** Fields that were redacted */
    fields_redacted: z.array(z.string()),
    /** Number of redactions applied */
    redaction_count: z.number().int().nonnegative(),
    /** Config used for redaction */
    config: RedactionConfig.optional(),
  }),

  /** Replay status */
  replay_status: ReplayStatus.default('not_replayed'),

  /** Replay attempts */
  replay_attempts: z.number().int().nonnegative().default(0),

  /** Last replay timestamp */
  last_replay_at: z.string().datetime().optional(),

  /** Replay diff if detected */
  replay_diff: z
    .object({
      differences: z.array(
        z.object({
          path: z.string(),
          original: z.unknown(),
          replayed: z.unknown(),
        })
      ),
      diff_count: z.number().int().nonnegative(),
    })
    .optional(),

  /** Checksum for integrity verification */
  checksum: z.string().optional(),

  /** Additional metadata */
  metadata: z.record(z.unknown()).optional(),
});
export type ForensicBundle = z.infer<typeof ForensicBundleSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validation result
 */
export interface ForensicBundleValidationResult {
  valid: boolean;
  bundle?: ForensicBundle;
  errors?: z.ZodError;
  errorMessages?: string[];
}

/**
 * Validate a ForensicBundle
 */
export function validateForensicBundle(data: unknown): ForensicBundleValidationResult {
  const result = ForensicBundleSchema.safeParse(data);
  if (result.success) {
    return { valid: true, bundle: result.data };
  }
  return {
    valid: false,
    errors: result.error,
    errorMessages: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}

/**
 * Parse a ForensicBundle (throws on invalid)
 */
export function parseForensicBundle(data: unknown): ForensicBundle {
  return ForensicBundleSchema.parse(data);
}

/**
 * Safe parse a ForensicBundle
 */
export function safeParseForensicBundle(data: unknown): ForensicBundle | null {
  const result = ForensicBundleSchema.safeParse(data);
  return result.success ? result.data : null;
}
