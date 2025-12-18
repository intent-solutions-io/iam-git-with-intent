/**
 * Policy-as-Code Engine
 *
 * Phase 5: Deny-by-default policy engine for multi-tenant operations.
 *
 * Policy evaluation:
 * - READ: allowed by default (configurable)
 * - WRITE_NON_DESTRUCTIVE: allowed by policy
 * - DESTRUCTIVE: requires BOTH approval record AND policy allow
 *
 * @module @gwi/core/tenancy/policy
 */

import { z } from 'zod';
import type { TenantContext } from './context.js';
import type { ToolPolicyClass } from '../connectors/types.js';

// =============================================================================
// Policy Decision Types
// =============================================================================

/**
 * Standard reason codes for policy decisions
 */
export const PolicyReasonCode = z.enum([
  // Allow reasons
  'ALLOW_READ_DEFAULT',           // READ operations allowed by default
  'ALLOW_POLICY_MATCH',           // Policy explicitly allows
  'ALLOW_ADMIN',                  // Admin actor bypass

  // Deny reasons
  'DENY_NO_POLICY',               // No policy defined for this operation
  'DENY_POLICY_MISMATCH',         // Policy does not allow this operation
  'DENY_ACTOR_NOT_ALLOWED',       // Actor not in allowed list
  'DENY_TENANT_NOT_ALLOWED',      // Tenant not in allowed list
  'DENY_RESOURCE_NOT_ALLOWED',    // Resource not in allowed scope
  'DENY_DESTRUCTIVE_NO_APPROVAL', // DESTRUCTIVE requires approval
  'DENY_APPROVAL_MISMATCH',       // Approval doesn't match operation
  'DENY_DISABLED',                // Operation explicitly disabled
]);

export type PolicyReasonCode = z.infer<typeof PolicyReasonCode>;

/**
 * Policy decision result
 */
export const PolicyDecision = z.object({
  /** Whether the operation is allowed */
  allowed: z.boolean(),

  /** Reason code for the decision */
  reasonCode: PolicyReasonCode,

  /** Human-readable reason */
  reason: z.string(),

  /** Fields to redact from logs/responses (optional) */
  redactions: z.array(z.string()).optional(),

  /** Policy rule that matched (optional) */
  matchedRule: z.string().optional(),
});

export type PolicyDecision = z.infer<typeof PolicyDecision>;

// =============================================================================
// Policy Rule Types
// =============================================================================

/**
 * Policy rule definition
 */
export const PolicyRule = z.object({
  /** Rule ID for matching/debugging */
  id: z.string(),

  /** Rule description */
  description: z.string().optional(),

  /** Effect: allow or deny */
  effect: z.enum(['allow', 'deny']),

  /** Priority (higher = evaluated first) */
  priority: z.number().default(0),

  /** Conditions for this rule */
  conditions: z.object({
    /** Tenant IDs this rule applies to (empty = all) */
    tenants: z.array(z.string()).optional(),

    /** Actor IDs this rule applies to (empty = all) */
    actors: z.array(z.string()).optional(),

    /** Actor types this rule applies to (empty = all) */
    actorTypes: z.array(z.enum(['human', 'service', 'github_app'])).optional(),

    /** Sources this rule applies to (empty = all) */
    sources: z.array(z.enum(['cli', 'web', 'api', 'github_action', 'webhook'])).optional(),

    /** Connector IDs this rule applies to (empty = all) */
    connectors: z.array(z.string()).optional(),

    /** Tool names (with wildcards) this rule applies to (empty = all) */
    tools: z.array(z.string()).optional(),

    /** Policy classes this rule applies to (empty = all) */
    policyClasses: z.array(z.enum(['READ', 'WRITE_NON_DESTRUCTIVE', 'DESTRUCTIVE'])).optional(),

    /** Resource patterns (repo, connection, etc.) */
    resources: z.array(z.string()).optional(),
  }).optional(),
});

export type PolicyRule = z.infer<typeof PolicyRule>;

/**
 * Full policy document
 */
export const PolicyDocument = z.object({
  /** Policy version */
  version: z.string().default('1.0'),

  /** Policy name */
  name: z.string(),

  /** Policy description */
  description: z.string().optional(),

  /** Default behavior for READ operations */
  defaultReadBehavior: z.enum(['allow', 'deny']).default('allow'),

  /** Default behavior for WRITE_NON_DESTRUCTIVE operations */
  defaultWriteBehavior: z.enum(['allow', 'deny']).default('deny'),

  /** Default behavior for DESTRUCTIVE operations (always deny without rule) */
  defaultDestructiveBehavior: z.literal('deny').default('deny'),

  /** Policy rules */
  rules: z.array(PolicyRule),
});

export type PolicyDocument = z.infer<typeof PolicyDocument>;

// =============================================================================
// Policy Request
// =============================================================================

/**
 * Policy evaluation request
 */
export const PolicyRequest = z.object({
  /** Tenant context */
  tenant: z.object({
    tenantId: z.string(),
    actor: z.object({
      actorId: z.string(),
      actorType: z.enum(['human', 'service', 'github_app']),
      source: z.enum(['cli', 'web', 'api', 'github_action', 'webhook']),
    }),
    orgId: z.string().optional(),
    repo: z.object({
      owner: z.string(),
      name: z.string(),
      fullName: z.string(),
    }).optional(),
    installationId: z.string().optional(),
  }),

  /** Tool being invoked */
  toolName: z.string(),

  /** Connector ID */
  connectorId: z.string(),

  /** Policy class of the tool */
  policyClass: z.enum(['READ', 'WRITE_NON_DESTRUCTIVE', 'DESTRUCTIVE']),

  /** Resource being accessed (repo, connection, etc.) */
  resource: z.string().optional(),

  /** Whether an approval record exists */
  hasApproval: z.boolean().default(false),
});

export type PolicyRequest = z.infer<typeof PolicyRequest>;

// =============================================================================
// Policy Engine
// =============================================================================

/**
 * Policy engine interface
 */
export interface PolicyEngine {
  /**
   * Evaluate a policy request
   */
  evaluate(request: PolicyRequest): PolicyDecision;

  /**
   * Load a policy document
   */
  loadPolicy(policy: PolicyDocument): void;

  /**
   * Get the current policy
   */
  getPolicy(): PolicyDocument | undefined;
}

/**
 * In-memory policy engine implementation
 */
export class InMemoryPolicyEngine implements PolicyEngine {
  private policy?: PolicyDocument;

  constructor(policy?: PolicyDocument) {
    this.policy = policy;
  }

  loadPolicy(policy: PolicyDocument): void {
    this.policy = PolicyDocument.parse(policy);
  }

  getPolicy(): PolicyDocument | undefined {
    return this.policy;
  }

  evaluate(request: PolicyRequest): PolicyDecision {
    const req = PolicyRequest.parse(request);

    // DESTRUCTIVE always requires approval first
    if (req.policyClass === 'DESTRUCTIVE' && !req.hasApproval) {
      return {
        allowed: false,
        reasonCode: 'DENY_DESTRUCTIVE_NO_APPROVAL',
        reason: `Destructive operation '${req.toolName}' requires approval`,
      };
    }

    // If no policy loaded, use defaults
    if (!this.policy) {
      return this.evaluateDefaults(req);
    }

    // Sort rules by priority (highest first)
    const sortedRules = [...this.policy.rules].sort((a, b) => b.priority - a.priority);

    // Find first matching rule
    for (const rule of sortedRules) {
      if (this.ruleMatches(rule, req)) {
        if (rule.effect === 'allow') {
          return {
            allowed: true,
            reasonCode: 'ALLOW_POLICY_MATCH',
            reason: `Allowed by policy rule '${rule.id}'`,
            matchedRule: rule.id,
          };
        } else {
          return {
            allowed: false,
            reasonCode: 'DENY_POLICY_MISMATCH',
            reason: `Denied by policy rule '${rule.id}': ${rule.description ?? 'no description'}`,
            matchedRule: rule.id,
          };
        }
      }
    }

    // No rule matched, use defaults
    return this.evaluateDefaults(req);
  }

  private evaluateDefaults(req: PolicyRequest): PolicyDecision {
    const policy = this.policy;

    if (req.policyClass === 'READ') {
      const defaultBehavior = policy?.defaultReadBehavior ?? 'allow';
      if (defaultBehavior === 'allow') {
        return {
          allowed: true,
          reasonCode: 'ALLOW_READ_DEFAULT',
          reason: 'READ operations allowed by default',
        };
      }
    }

    if (req.policyClass === 'WRITE_NON_DESTRUCTIVE') {
      const defaultBehavior = policy?.defaultWriteBehavior ?? 'deny';
      if (defaultBehavior === 'allow') {
        return {
          allowed: true,
          reasonCode: 'ALLOW_POLICY_MATCH',
          reason: 'WRITE_NON_DESTRUCTIVE allowed by default policy',
        };
      }
    }

    // Default deny for everything else
    return {
      allowed: false,
      reasonCode: 'DENY_NO_POLICY',
      reason: `No policy rule allows '${req.toolName}' for actor '${req.tenant.actor.actorId}'`,
    };
  }

  private ruleMatches(rule: PolicyRule, req: PolicyRequest): boolean {
    const conditions = rule.conditions;

    if (!conditions) {
      return true; // No conditions = matches all
    }

    // Check tenant
    if (conditions.tenants?.length && !conditions.tenants.includes(req.tenant.tenantId)) {
      return false;
    }

    // Check actor
    if (conditions.actors?.length && !conditions.actors.includes(req.tenant.actor.actorId)) {
      return false;
    }

    // Check actor type
    if (conditions.actorTypes?.length && !conditions.actorTypes.includes(req.tenant.actor.actorType)) {
      return false;
    }

    // Check source
    if (conditions.sources?.length && !conditions.sources.includes(req.tenant.actor.source)) {
      return false;
    }

    // Check connector
    if (conditions.connectors?.length && !conditions.connectors.includes(req.connectorId)) {
      return false;
    }

    // Check tool (with wildcard support)
    if (conditions.tools?.length) {
      const toolMatches = conditions.tools.some(pattern => {
        if (pattern === '*') return true;
        if (pattern.endsWith('.*')) {
          const prefix = pattern.slice(0, -2);
          return req.toolName.startsWith(prefix + '.');
        }
        return pattern === req.toolName;
      });
      if (!toolMatches) return false;
    }

    // Check policy class
    if (conditions.policyClasses?.length && !conditions.policyClasses.includes(req.policyClass)) {
      return false;
    }

    // Check resource
    if (conditions.resources?.length && req.resource) {
      const resourceMatches = conditions.resources.some(pattern => {
        if (pattern === '*') return true;
        if (pattern.endsWith('/*')) {
          const prefix = pattern.slice(0, -2);
          return req.resource!.startsWith(prefix + '/');
        }
        return pattern === req.resource;
      });
      if (!resourceMatches) return false;
    }

    return true;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a default policy that allows READ and requires explicit rules for writes
 */
export function createDefaultPolicy(name: string = 'default'): PolicyDocument {
  return PolicyDocument.parse({
    version: '1.0',
    name,
    description: 'Default policy: READ allowed, writes require explicit rules',
    defaultReadBehavior: 'allow',
    defaultWriteBehavior: 'deny',
    defaultDestructiveBehavior: 'deny',
    rules: [],
  });
}

/**
 * Create a permissive dev policy
 */
export function createDevPolicy(): PolicyDocument {
  return PolicyDocument.parse({
    version: '1.0',
    name: 'dev-policy',
    description: 'Development policy: allows most operations for testing',
    defaultReadBehavior: 'allow',
    defaultWriteBehavior: 'allow',
    defaultDestructiveBehavior: 'deny',
    rules: [
      {
        id: 'allow-all-non-destructive',
        description: 'Allow all non-destructive operations in dev',
        effect: 'allow',
        priority: 100,
        conditions: {
          policyClasses: ['READ', 'WRITE_NON_DESTRUCTIVE'],
        },
      },
      {
        id: 'allow-destructive-with-approval',
        description: 'Allow destructive operations when approval exists',
        effect: 'allow',
        priority: 50,
        conditions: {
          policyClasses: ['DESTRUCTIVE'],
        },
      },
    ],
  });
}

/**
 * Create a policy request from execution context
 */
export function createPolicyRequest(
  tenant: TenantContext,
  toolName: string,
  connectorId: string,
  policyClass: ToolPolicyClass,
  options?: {
    resource?: string;
    hasApproval?: boolean;
  }
): PolicyRequest {
  return PolicyRequest.parse({
    tenant: {
      tenantId: tenant.tenantId,
      actor: {
        actorId: tenant.actor.actorId,
        actorType: tenant.actor.actorType,
        source: tenant.actor.source,
      },
      orgId: tenant.orgId,
      repo: tenant.repo,
      installationId: tenant.installationId,
    },
    toolName,
    connectorId,
    policyClass,
    resource: options?.resource,
    hasApproval: options?.hasApproval ?? false,
  });
}

/**
 * Global policy engine singleton
 */
let globalPolicyEngine: PolicyEngine | null = null;

/**
 * Get the global policy engine
 */
export function getPolicyEngine(): PolicyEngine {
  if (!globalPolicyEngine) {
    globalPolicyEngine = new InMemoryPolicyEngine();
  }
  return globalPolicyEngine;
}

/**
 * Set a custom policy engine (for testing)
 */
export function setPolicyEngine(engine: PolicyEngine): void {
  globalPolicyEngine = engine;
}
