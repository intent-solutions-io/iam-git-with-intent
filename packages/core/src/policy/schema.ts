/**
 * Policy Schema Definitions
 *
 * Epic D: Policy & Audit - Story D1: Policy Definition Schema
 *
 * Comprehensive Zod schemas for policy rules that govern agent behavior.
 * Supports:
 * - Rule types: allow, deny, require-approval, notify, log-only
 * - Conditions: complexity, file patterns, author roles, time windows
 * - Inheritance: org → repo → branch
 * - Audit integration with Context Graph
 *
 * @module @gwi/core/policy/schema
 */

import { z } from 'zod';

// =============================================================================
// Base Types
// =============================================================================

/**
 * Policy version for schema migration
 */
export const PolicyVersion = z.enum(['1.0', '1.1', '2.0']);
export type PolicyVersion = z.infer<typeof PolicyVersion>;

/**
 * Policy scope levels (inheritance hierarchy)
 */
export const PolicyScope = z.enum(['global', 'org', 'repo', 'branch']);
export type PolicyScope = z.infer<typeof PolicyScope>;

/**
 * Actor types that can trigger policies
 */
export const ActorType = z.enum([
  'human',
  'agent',        // AI agent (triage, coder, resolver, reviewer)
  'service',      // Service account
  'github_app',   // GitHub App installation
  'api_key',      // API key access
]);
export type ActorType = z.infer<typeof ActorType>;

/**
 * Agent types for agent-specific policies
 */
export const AgentType = z.enum([
  'triage',
  'coder',
  'resolver',
  'reviewer',
  'orchestrator',
]);
export type AgentType = z.infer<typeof AgentType>;

/**
 * Action sources
 */
export const ActionSource = z.enum([
  'cli',
  'web',
  'api',
  'webhook',
  'github_action',
  'scheduled',
]);
export type ActionSource = z.infer<typeof ActionSource>;

// =============================================================================
// Condition Operators
// =============================================================================

/**
 * Comparison operators for conditions
 */
export const ComparisonOperator = z.enum([
  'eq',       // equals
  'ne',       // not equals
  'gt',       // greater than
  'gte',      // greater than or equal
  'lt',       // less than
  'lte',      // less than or equal
  'in',       // in array
  'nin',      // not in array
  'contains', // string contains
  'matches',  // regex matches
  'glob',     // glob pattern matches
  'exists',   // field exists
]);
export type ComparisonOperator = z.infer<typeof ComparisonOperator>;

/**
 * Logical operators for combining conditions
 */
export const LogicalOperator = z.enum(['and', 'or', 'not']);
export type LogicalOperator = z.infer<typeof LogicalOperator>;

// =============================================================================
// Policy Conditions
// =============================================================================

/**
 * Base condition with field, operator, value
 */
export const BaseCondition = z.object({
  field: z.string().min(1),
  operator: ComparisonOperator,
  value: z.unknown(),
});
export type BaseCondition = z.infer<typeof BaseCondition>;

/**
 * Complexity condition - triggers based on PR/issue complexity score
 */
export const ComplexityCondition = z.object({
  type: z.literal('complexity'),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq']),
  threshold: z.number().min(0).max(10),
});
export type ComplexityCondition = z.infer<typeof ComplexityCondition>;

/**
 * File pattern condition - matches file paths
 */
export const FilePatternCondition = z.object({
  type: z.literal('file_pattern'),
  patterns: z.array(z.string()).min(1),
  matchType: z.enum(['include', 'exclude']).default('include'),
});
export type FilePatternCondition = z.infer<typeof FilePatternCondition>;

/**
 * Author condition - matches by author identity
 */
export const AuthorCondition = z.object({
  type: z.literal('author'),
  authors: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional(),
  teams: z.array(z.string()).optional(),
});
export type AuthorCondition = z.infer<typeof AuthorCondition>;

/**
 * Time window condition - active during specific times
 */
export const TimeWindowCondition = z.object({
  type: z.literal('time_window'),
  timezone: z.string().default('UTC'),
  windows: z.array(z.object({
    days: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).optional(),
    startHour: z.number().min(0).max(23).optional(),
    endHour: z.number().min(0).max(23).optional(),
  })).min(1),
  matchType: z.enum(['during', 'outside']).default('during'),
});
export type TimeWindowCondition = z.infer<typeof TimeWindowCondition>;

/**
 * Repository condition - matches repositories
 */
export const RepositoryCondition = z.object({
  type: z.literal('repository'),
  repos: z.array(z.string()).optional(),        // exact matches
  patterns: z.array(z.string()).optional(),      // glob patterns
  visibility: z.enum(['public', 'private', 'all']).optional(),
});
export type RepositoryCondition = z.infer<typeof RepositoryCondition>;

/**
 * Branch condition - matches branches
 */
export const BranchCondition = z.object({
  type: z.literal('branch'),
  branches: z.array(z.string()).optional(),      // exact matches
  patterns: z.array(z.string()).optional(),      // glob patterns (e.g., 'feature/*')
  protected: z.boolean().optional(),             // only protected branches
});
export type BranchCondition = z.infer<typeof BranchCondition>;

/**
 * Label condition - matches by labels
 */
export const LabelCondition = z.object({
  type: z.literal('label'),
  labels: z.array(z.string()).min(1),
  matchType: z.enum(['any', 'all', 'none']).default('any'),
});
export type LabelCondition = z.infer<typeof LabelCondition>;

/**
 * Agent condition - matches by agent type
 */
export const AgentCondition = z.object({
  type: z.literal('agent'),
  agents: z.array(AgentType).min(1),
  confidence: z.object({
    operator: z.enum(['gt', 'gte', 'lt', 'lte']),
    threshold: z.number().min(0).max(1),
  }).optional(),
});
export type AgentCondition = z.infer<typeof AgentCondition>;

/**
 * Custom field condition - for extensibility
 */
export const CustomCondition = z.object({
  type: z.literal('custom'),
  field: z.string().min(1),
  operator: ComparisonOperator,
  value: z.unknown(),
});
export type CustomCondition = z.infer<typeof CustomCondition>;

/**
 * Union of all condition types
 */
export const PolicyCondition = z.discriminatedUnion('type', [
  ComplexityCondition,
  FilePatternCondition,
  AuthorCondition,
  TimeWindowCondition,
  RepositoryCondition,
  BranchCondition,
  LabelCondition,
  AgentCondition,
  CustomCondition,
]);
export type PolicyCondition = z.infer<typeof PolicyCondition>;

/**
 * Base condition group type (non-recursive for simpler typing)
 * For deeply nested conditions, use multiple condition groups at rule level.
 */
const BaseConditionGroup = z.object({
  operator: LogicalOperator,
  conditions: z.array(PolicyCondition).min(1),
});

/**
 * Logical condition group - combines conditions with AND/OR/NOT
 * Supports one level of nesting (groups within a group).
 */
export const ConditionGroup = z.object({
  operator: LogicalOperator,
  conditions: z.array(z.union([PolicyCondition, BaseConditionGroup])).min(1),
});
export type ConditionGroup = z.infer<typeof ConditionGroup>;

// =============================================================================
// Policy Actions
// =============================================================================

/**
 * Action effect types
 */
export const ActionEffect = z.enum([
  'allow',            // Allow the operation
  'deny',             // Deny the operation
  'require_approval', // Require human approval
  'notify',           // Notify but don't block
  'log_only',         // Log to audit trail only
  'warn',             // Warn but allow
]);
export type ActionEffect = z.infer<typeof ActionEffect>;

/**
 * Approval configuration for require_approval action
 */
export const ApprovalConfig = z.object({
  /** Minimum number of approvers required */
  minApprovers: z.number().min(1).default(1),
  /** Required roles for approvers */
  requiredRoles: z.array(z.string()).optional(),
  /** Required teams for approvers */
  requiredTeams: z.array(z.string()).optional(),
  /** Timeout in hours before auto-deny */
  timeoutHours: z.number().min(1).max(168).optional(), // max 1 week
  /** Allow self-approval */
  allowSelfApproval: z.boolean().default(false),
  /** Escalation path if timeout */
  escalateTo: z.array(z.string()).optional(),
});
export type ApprovalConfig = z.infer<typeof ApprovalConfig>;

/**
 * Notification configuration
 */
export const NotificationConfig = z.object({
  /** Notification channels */
  channels: z.array(z.enum(['email', 'slack', 'webhook', 'github_comment'])).min(1),
  /** Recipients (user IDs, team IDs, or channel names) */
  recipients: z.array(z.string()).optional(),
  /** Message template (supports variables) */
  template: z.string().optional(),
  /** Severity level for the notification */
  severity: z.enum(['info', 'warning', 'error', 'critical']).default('info'),
});
export type NotificationConfig = z.infer<typeof NotificationConfig>;

/**
 * Policy action definition
 */
export const PolicyAction = z.object({
  /** Action effect */
  effect: ActionEffect,
  /** Human-readable reason for the action */
  reason: z.string().optional(),
  /** Approval config (required if effect is require_approval) */
  approval: ApprovalConfig.optional(),
  /** Notification config */
  notification: NotificationConfig.optional(),
  /** Audit metadata to include */
  auditMetadata: z.record(z.string(), z.unknown()).optional(),
  /** Continue to next rule after this action */
  continueOnMatch: z.boolean().default(false),
});
export type PolicyAction = z.infer<typeof PolicyAction>;

// =============================================================================
// Policy Rules
// =============================================================================

/**
 * Policy rule definition
 */
export const PolicyRule = z.object({
  /** Unique rule ID */
  id: z.string().regex(/^[a-z0-9-]+$/i, 'Rule ID must be alphanumeric with hyphens'),
  /** Rule name for display */
  name: z.string().min(1).max(100),
  /** Rule description */
  description: z.string().optional(),
  /** Whether the rule is enabled */
  enabled: z.boolean().default(true),
  /** Priority (higher = evaluated first) */
  priority: z.number().default(0),
  /** Conditions that must be met (ANDed by default) */
  conditions: z.array(PolicyCondition).optional(),
  /** Complex condition logic */
  conditionLogic: ConditionGroup.optional(),
  /** Action to take when conditions match */
  action: PolicyAction,
  /** Tags for categorization */
  tags: z.array(z.string()).optional(),
  /** Metadata for extensibility */
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type PolicyRule = z.infer<typeof PolicyRule>;

// =============================================================================
// Policy Document
// =============================================================================

/**
 * Policy inheritance mode
 */
export const InheritanceMode = z.enum([
  'replace',   // Child completely replaces parent
  'extend',    // Child adds to parent rules
  'override',  // Child rules take precedence, parent fills gaps
]);
export type InheritanceMode = z.infer<typeof InheritanceMode>;

/**
 * Policy document metadata
 */
export const PolicyMetadata = z.object({
  /** Creation timestamp */
  createdAt: z.date().optional(),
  /** Last update timestamp */
  updatedAt: z.date().optional(),
  /** Created by user ID */
  createdBy: z.string().optional(),
  /** Last updated by user ID */
  updatedBy: z.string().optional(),
  /** Policy revision number */
  revision: z.number().default(1),
  /** Change history */
  changelog: z.array(z.object({
    revision: z.number(),
    timestamp: z.date(),
    userId: z.string(),
    description: z.string(),
  })).optional(),
});
export type PolicyMetadata = z.infer<typeof PolicyMetadata>;

/**
 * Complete policy document
 */
export const PolicyDocument = z.object({
  /** Schema version */
  version: PolicyVersion.default('2.0'),
  /** Policy name */
  name: z.string().min(1).max(100),
  /** Policy description */
  description: z.string().optional(),
  /** Policy scope */
  scope: PolicyScope.default('repo'),
  /** Scope target (org name, repo name, or branch pattern) */
  scopeTarget: z.string().optional(),
  /** How to handle inheritance */
  inheritance: InheritanceMode.default('override'),
  /** Parent policy ID (for inheritance) */
  parentPolicyId: z.string().optional(),
  /** Default action when no rules match */
  defaultAction: PolicyAction.default({
    effect: 'deny',
    reason: 'No matching policy rule',
  }),
  /** Policy rules */
  rules: z.array(PolicyRule),
  /** Policy-level variables for rule conditions */
  variables: z.record(z.string(), z.unknown()).optional(),
  /** Metadata */
  metadata: PolicyMetadata.optional(),
});
export type PolicyDocument = z.infer<typeof PolicyDocument>;

// =============================================================================
// Policy Set (Multiple Policies)
// =============================================================================

/**
 * Policy set for managing multiple policies
 */
export const PolicySet = z.object({
  /** Set ID */
  id: z.string(),
  /** Set name */
  name: z.string(),
  /** Description */
  description: z.string().optional(),
  /** Policies in evaluation order */
  policies: z.array(PolicyDocument),
  /** Whether to stop on first match */
  stopOnFirstMatch: z.boolean().default(true),
  /** Metadata */
  metadata: PolicyMetadata.optional(),
});
export type PolicySet = z.infer<typeof PolicySet>;

// =============================================================================
// Policy Evaluation Types
// =============================================================================

/**
 * Policy evaluation request
 */
export const PolicyEvaluationRequest = z.object({
  /** Actor making the request */
  actor: z.object({
    id: z.string(),
    type: ActorType,
    roles: z.array(z.string()).optional(),
    teams: z.array(z.string()).optional(),
  }),
  /** Action being performed */
  action: z.object({
    name: z.string(),
    agentType: AgentType.optional(),
    confidence: z.number().min(0).max(1).optional(),
  }),
  /** Resource being accessed */
  resource: z.object({
    type: z.string(),
    repo: z.object({
      owner: z.string(),
      name: z.string(),
    }).optional(),
    branch: z.string().optional(),
    files: z.array(z.string()).optional(),
    labels: z.array(z.string()).optional(),
    complexity: z.number().optional(),
  }),
  /** Request context */
  context: z.object({
    source: ActionSource,
    timestamp: z.date().default(() => new Date()),
    requestId: z.string().optional(),
    traceId: z.string().optional(),
  }),
  /** Whether approval exists */
  hasApproval: z.boolean().default(false),
  /** Custom attributes for evaluation */
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type PolicyEvaluationRequest = z.infer<typeof PolicyEvaluationRequest>;

/**
 * Policy evaluation result
 */
export const PolicyEvaluationResult = z.object({
  /** Whether the action is allowed */
  allowed: z.boolean(),
  /** The effect that was applied */
  effect: ActionEffect,
  /** Reason for the decision */
  reason: z.string(),
  /** Rule that matched (if any) */
  matchedRule: z.object({
    id: z.string(),
    name: z.string(),
    policyId: z.string().optional(),
  }).optional(),
  /** Required actions (e.g., approval required) */
  requiredActions: z.array(z.object({
    type: z.enum(['approval', 'notification', 'review']),
    config: z.unknown(),
  })).optional(),
  /** Audit trail entry ID */
  auditEntryId: z.string().optional(),
  /** Evaluation metadata */
  metadata: z.object({
    evaluatedAt: z.date(),
    evaluationTimeMs: z.number(),
    rulesEvaluated: z.number(),
    policiesEvaluated: z.number(),
  }).optional(),
});
export type PolicyEvaluationResult = z.infer<typeof PolicyEvaluationResult>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate a policy document
 */
export function validatePolicyDocument(doc: unknown): PolicyDocument {
  return PolicyDocument.parse(doc);
}

/**
 * Validate a policy rule
 */
export function validatePolicyRule(rule: unknown): PolicyRule {
  return PolicyRule.parse(rule);
}

/**
 * Validate an evaluation request
 */
export function validateEvaluationRequest(req: unknown): PolicyEvaluationRequest {
  return PolicyEvaluationRequest.parse(req);
}

/**
 * Check if a policy document is valid (returns boolean)
 */
export function isPolicyDocumentValid(doc: unknown): boolean {
  return PolicyDocument.safeParse(doc).success;
}

/**
 * Get validation errors for a policy document
 */
export function getPolicyValidationErrors(doc: unknown): string[] {
  const result = PolicyDocument.safeParse(doc);
  if (result.success) return [];
  return result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
}
