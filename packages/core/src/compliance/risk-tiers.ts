/**
 * Risk Tier Enforcement for Git With Intent
 *
 * EPIC 025: Regulated Domain Controls
 * Task 025.1: Define risk tier schema and policy configuration
 *
 * Implements the 5-level risk tier system (R0-R4) for controlling
 * what operations are allowed based on risk level.
 *
 * Risk Tiers:
 *   R0: Unrestricted - Local dev, read-only
 *   R1: Tool Allowlist - Production reads, approved tools only
 *   R2: Approval Required - Code modifications, human approval + SHA binding
 *   R3: Secrets Detection - Credential access, secret scanning + redaction
 *   R4: Immutable Audit - All production ops, tamper-evident logging
 */

import { z } from 'zod';

// Import RiskTier from a2a contracts (canonical source)
// We need both the value (Zod schema) and type for use in this module
import { RiskTier } from '../a2a/contracts.js';
export type { RiskTier } from '../a2a/contracts.js';

/**
 * Risk tier numeric values for comparison
 */
export const RISK_TIER_LEVELS: Record<RiskTier, number> = {
  R0: 0,
  R1: 1,
  R2: 2,
  R3: 3,
  R4: 4,
};

/**
 * Risk tier metadata
 */
export interface RiskTierConfig {
  tier: RiskTier;
  name: string;
  description: string;
  requiresApproval: boolean;
  requiresAudit: boolean;
  secretsScanning: boolean;
  tamperEvident: boolean;
  allowedTools: string[] | 'all';
  blockedOperations: string[];
}

/**
 * Default risk tier configurations
 */
export const RISK_TIER_CONFIGS: Record<RiskTier, RiskTierConfig> = {
  R0: {
    tier: 'R0',
    name: 'Unrestricted',
    description: 'Local development, read-only operations',
    requiresApproval: false,
    requiresAudit: false,
    secretsScanning: false,
    tamperEvident: false,
    allowedTools: 'all',
    blockedOperations: [],
  },
  R1: {
    tier: 'R1',
    name: 'Tool Allowlist',
    description: 'Production file reads, approved tools only',
    requiresApproval: false,
    requiresAudit: true,
    secretsScanning: false,
    tamperEvident: false,
    allowedTools: [
      'read_file',
      'list_directory',
      'search_code',
      'get_file_info',
      'git_status',
      'git_log',
      'git_diff',
    ],
    blockedOperations: ['write_file', 'delete_file', 'git_push', 'git_commit'],
  },
  R2: {
    tier: 'R2',
    name: 'Approval Required',
    description: 'Code modifications, PRs require human approval with SHA binding',
    requiresApproval: true,
    requiresAudit: true,
    secretsScanning: false,
    tamperEvident: false,
    allowedTools: 'all',
    blockedOperations: ['force_push', 'delete_branch', 'merge_without_review'],
  },
  R3: {
    tier: 'R3',
    name: 'Secrets Detection',
    description: 'Credential access with secret scanning and redaction',
    requiresApproval: true,
    requiresAudit: true,
    secretsScanning: true,
    tamperEvident: false,
    allowedTools: 'all',
    blockedOperations: ['expose_secrets', 'log_credentials', 'commit_secrets'],
  },
  R4: {
    tier: 'R4',
    name: 'Immutable Audit',
    description: 'All production operations with tamper-evident logging',
    requiresApproval: true,
    requiresAudit: true,
    secretsScanning: true,
    tamperEvident: true,
    allowedTools: 'all',
    blockedOperations: ['delete_audit_logs', 'modify_audit_logs', 'bypass_logging'],
  },
};

// =============================================================================
// Operation Risk Classifications
// =============================================================================

/**
 * Operation categories
 */
export const OperationCategory = z.enum([
  'read',
  'write',
  'delete',
  'execute',
  'approve',
  'deploy',
  'admin',
]);
export type OperationCategory = z.infer<typeof OperationCategory>;

/**
 * Operation risk classification
 */
export const OperationRisk = z.object({
  operation: z.string(),
  category: OperationCategory,
  minimumTier: RiskTier,
  description: z.string(),
  requiresApprovalScopes: z.array(z.string()).optional(),
  auditFields: z.array(z.string()).optional(),
});
export type OperationRisk = z.infer<typeof OperationRisk>;

/**
 * Default operation risk classifications
 */
export const OPERATION_RISKS: OperationRisk[] = [
  // Read operations (R0+)
  { operation: 'read_file', category: 'read', minimumTier: 'R0', description: 'Read file contents' },
  { operation: 'list_directory', category: 'read', minimumTier: 'R0', description: 'List directory contents' },
  { operation: 'search_code', category: 'read', minimumTier: 'R0', description: 'Search codebase' },
  { operation: 'git_status', category: 'read', minimumTier: 'R0', description: 'Check git status' },
  { operation: 'git_log', category: 'read', minimumTier: 'R0', description: 'View git history' },
  { operation: 'git_diff', category: 'read', minimumTier: 'R0', description: 'View git diff' },

  // Write operations (R1+)
  { operation: 'write_file', category: 'write', minimumTier: 'R1', description: 'Write file contents' },
  { operation: 'create_file', category: 'write', minimumTier: 'R1', description: 'Create new file' },
  { operation: 'edit_file', category: 'write', minimumTier: 'R1', description: 'Edit existing file' },
  { operation: 'git_add', category: 'write', minimumTier: 'R1', description: 'Stage changes' },

  // Commit operations (R2+)
  {
    operation: 'git_commit',
    category: 'write',
    minimumTier: 'R2',
    description: 'Commit changes',
    requiresApprovalScopes: ['commit'],
    auditFields: ['commit_sha', 'commit_message', 'files_changed'],
  },
  {
    operation: 'git_push',
    category: 'write',
    minimumTier: 'R2',
    description: 'Push to remote',
    requiresApprovalScopes: ['push'],
    auditFields: ['branch', 'commit_range', 'remote'],
  },
  {
    operation: 'open_pr',
    category: 'write',
    minimumTier: 'R2',
    description: 'Open pull request',
    requiresApprovalScopes: ['open_pr'],
    auditFields: ['pr_number', 'base_branch', 'head_branch', 'title'],
  },

  // Merge operations (R2+)
  {
    operation: 'merge_pr',
    category: 'write',
    minimumTier: 'R2',
    description: 'Merge pull request',
    requiresApprovalScopes: ['merge'],
    auditFields: ['pr_number', 'merge_commit', 'merge_method'],
  },

  // Delete operations (R2+)
  {
    operation: 'delete_file',
    category: 'delete',
    minimumTier: 'R2',
    description: 'Delete file',
    requiresApprovalScopes: ['commit'],
    auditFields: ['file_path', 'file_hash'],
  },
  {
    operation: 'delete_branch',
    category: 'delete',
    minimumTier: 'R2',
    description: 'Delete branch',
    requiresApprovalScopes: ['push'],
    auditFields: ['branch_name', 'last_commit'],
  },

  // Credential operations (R3+)
  {
    operation: 'access_secret',
    category: 'read',
    minimumTier: 'R3',
    description: 'Access secret/credential',
    auditFields: ['secret_name', 'accessor', 'purpose'],
  },
  {
    operation: 'rotate_secret',
    category: 'admin',
    minimumTier: 'R3',
    description: 'Rotate secret/credential',
    requiresApprovalScopes: ['deploy'],
    auditFields: ['secret_name', 'rotation_id'],
  },

  // Deploy operations (R3+)
  {
    operation: 'deploy',
    category: 'deploy',
    minimumTier: 'R3',
    description: 'Deploy to environment',
    requiresApprovalScopes: ['deploy'],
    auditFields: ['environment', 'version', 'deployment_id', 'artifacts'],
  },

  // Dangerous operations (R4)
  {
    operation: 'force_push',
    category: 'write',
    minimumTier: 'R4',
    description: 'Force push (rewrite history)',
    requiresApprovalScopes: ['push'],
    auditFields: ['branch', 'old_commit', 'new_commit', 'commits_removed'],
  },
  {
    operation: 'delete_protected_branch',
    category: 'delete',
    minimumTier: 'R4',
    description: 'Delete protected branch',
    requiresApprovalScopes: ['push', 'merge'],
    auditFields: ['branch_name', 'protection_rules'],
  },
  {
    operation: 'modify_audit_logs',
    category: 'admin',
    minimumTier: 'R4',
    description: 'Modify audit logs (should be blocked)',
    auditFields: ['attempted_modification'],
  },
];

// =============================================================================
// Policy Configuration
// =============================================================================

/**
 * Tenant risk policy
 */
export const TenantRiskPolicy = z.object({
  /** Tenant ID */
  tenantId: z.string(),
  /** Maximum allowed risk tier */
  maxRiskTier: RiskTier,
  /** Auto-approve up to this tier (no human approval needed) */
  autoApproveTier: RiskTier,
  /** Custom operation overrides */
  operationOverrides: z.record(z.string(), RiskTier).optional(),
  /** Allowed tools (if R1+) */
  allowedTools: z.array(z.string()).optional(),
  /** Blocked operations (always blocked regardless of tier) */
  blockedOperations: z.array(z.string()).optional(),
  /** Required approvers for R2+ */
  requiredApprovers: z.array(z.string()).optional(),
  /** Minimum approvers for R2+ */
  minApprovers: z.number().int().min(1).default(1),
  /** Audit retention days */
  auditRetentionDays: z.number().int().min(30).default(90),
  /** Enable tamper-evident logging */
  tamperEvidentLogging: z.boolean().default(false),
});
export type TenantRiskPolicy = z.infer<typeof TenantRiskPolicy>;

/**
 * Default tenant risk policy
 */
export const DEFAULT_TENANT_POLICY: TenantRiskPolicy = {
  tenantId: 'default',
  maxRiskTier: 'R2',
  autoApproveTier: 'R1',
  minApprovers: 1,
  auditRetentionDays: 90,
  tamperEvidentLogging: false,
};

// =============================================================================
// Risk Tier Utilities
// =============================================================================

/**
 * Check if an operation meets the required risk tier (internal function)
 * Note: Not exported to avoid conflict with a2a/contracts.meetsRiskTier
 * Use meetsRiskTier from '@gwi/core' a2a module for external use
 */
function meetsRiskTier(actualTier: RiskTier, requiredTier: RiskTier): boolean {
  return RISK_TIER_LEVELS[actualTier] >= RISK_TIER_LEVELS[requiredTier];
}

/**
 * Get the minimum risk tier for an operation
 */
export function getOperationRiskTier(operation: string): RiskTier {
  const opRisk = OPERATION_RISKS.find((r) => r.operation === operation);
  return opRisk?.minimumTier ?? 'R2'; // Default to R2 for unknown operations
}

/**
 * Check if an operation is allowed under a policy
 */
export function isOperationAllowed(
  operation: string,
  policy: TenantRiskPolicy,
  currentTier: RiskTier
): { allowed: boolean; reason?: string; requiresApproval?: boolean } {
  // Check if explicitly blocked
  if (policy.blockedOperations?.includes(operation)) {
    return { allowed: false, reason: `Operation '${operation}' is blocked by policy` };
  }

  // Get operation risk
  const opRisk = OPERATION_RISKS.find((r) => r.operation === operation);
  const requiredTier = policy.operationOverrides?.[operation] ?? opRisk?.minimumTier ?? 'R2';

  // Check if current tier meets requirement
  if (!meetsRiskTier(currentTier, requiredTier)) {
    return {
      allowed: false,
      reason: `Operation '${operation}' requires risk tier ${requiredTier}, but current tier is ${currentTier}`,
    };
  }

  // Check if exceeds max allowed tier
  if (!meetsRiskTier(policy.maxRiskTier, requiredTier)) {
    return {
      allowed: false,
      reason: `Operation '${operation}' requires risk tier ${requiredTier}, but tenant max is ${policy.maxRiskTier}`,
    };
  }

  // Check if tool is allowed (for R1)
  const tierConfig = RISK_TIER_CONFIGS[currentTier];
  if (tierConfig.allowedTools !== 'all' && !tierConfig.allowedTools.includes(operation)) {
    return {
      allowed: false,
      reason: `Operation '${operation}' is not in the allowed tools list for tier ${currentTier}`,
    };
  }

  // Check if approval is required
  const requiresApproval = !meetsRiskTier(policy.autoApproveTier, requiredTier);

  return { allowed: true, requiresApproval };
}

/**
 * Get required approval scopes for an operation
 */
export function getRequiredApprovalScopes(operation: string): string[] {
  const opRisk = OPERATION_RISKS.find((r) => r.operation === operation);
  return opRisk?.requiresApprovalScopes ?? [];
}

/**
 * Get audit fields for an operation
 */
export function getAuditFields(operation: string): string[] {
  const opRisk = OPERATION_RISKS.find((r) => r.operation === operation);
  return opRisk?.auditFields ?? [];
}

/**
 * Get risk tier config
 */
export function getRiskTierConfig(tier: RiskTier): RiskTierConfig {
  return RISK_TIER_CONFIGS[tier];
}

/**
 * Validate a tenant risk policy
 */
export function validateTenantPolicy(policy: unknown): TenantRiskPolicy {
  return TenantRiskPolicy.parse(policy);
}

// =============================================================================
// Risk Context
// =============================================================================

/**
 * Risk context for an operation
 */
export const RiskContext = z.object({
  /** Current operation */
  operation: z.string(),
  /** Effective risk tier */
  effectiveTier: RiskTier,
  /** Tenant policy */
  policy: TenantRiskPolicy,
  /** Actor performing the operation */
  actor: z.object({
    id: z.string(),
    type: z.enum(['user', 'service', 'agent']),
    roles: z.array(z.string()),
  }),
  /** Resource being operated on */
  resource: z.object({
    type: z.string(),
    id: z.string(),
    attributes: z.record(z.unknown()).optional(),
  }),
  /** Request metadata */
  request: z.object({
    id: z.string(),
    timestamp: z.string().datetime(),
    traceId: z.string().optional(),
    correlationId: z.string().optional(),
  }),
});
export type RiskContext = z.infer<typeof RiskContext>;

/**
 * Risk evaluation result
 */
export const RiskEvaluationResult = z.object({
  /** Whether the operation is allowed */
  allowed: z.boolean(),
  /** Denial reason if not allowed */
  reason: z.string().optional(),
  /** Required risk tier */
  requiredTier: RiskTier,
  /** Current effective tier */
  effectiveTier: RiskTier,
  /** Whether approval is required */
  requiresApproval: z.boolean(),
  /** Required approval scopes */
  approvalScopes: z.array(z.string()),
  /** Fields to include in audit */
  auditFields: z.array(z.string()),
  /** Tier config applied */
  tierConfig: z.object({
    secretsScanning: z.boolean(),
    tamperEvident: z.boolean(),
  }),
  /** Evaluation timestamp */
  evaluatedAt: z.string().datetime(),
});
export type RiskEvaluationResult = z.infer<typeof RiskEvaluationResult>;

/**
 * Evaluate risk for an operation
 */
export function evaluateRisk(context: RiskContext): RiskEvaluationResult {
  const { operation, effectiveTier, policy } = context;
  const allowanceCheck = isOperationAllowed(operation, policy, effectiveTier);
  const requiredTier = getOperationRiskTier(operation);
  const tierConfig = getRiskTierConfig(effectiveTier);

  return {
    allowed: allowanceCheck.allowed,
    reason: allowanceCheck.reason,
    requiredTier,
    effectiveTier,
    requiresApproval: allowanceCheck.requiresApproval ?? false,
    approvalScopes: getRequiredApprovalScopes(operation),
    auditFields: getAuditFields(operation),
    tierConfig: {
      secretsScanning: tierConfig.secretsScanning,
      tamperEvident: tierConfig.tamperEvident,
    },
    evaluatedAt: new Date().toISOString(),
  };
}
