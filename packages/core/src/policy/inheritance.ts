/**
 * Policy Inheritance Resolver
 *
 * Epic D: Policy & Audit - Story D1: Policy Definition Schema
 * Task D1.4: Implement policy inheritance
 *
 * Supports policy inheritance hierarchy: global → org → repo → branch
 * with configurable merge strategies (replace, extend, override).
 *
 * @module @gwi/core/policy/inheritance
 */

import {
  type PolicyDocument,
  type PolicyRule,
  type InheritanceMode,
  type PolicyScope,
  PolicyDocument as PolicyDocumentSchema,
} from './schema.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Policy store interface for loading policies
 */
export interface PolicyStore {
  /**
   * Get a policy by ID
   */
  getPolicy(policyId: string): Promise<PolicyDocument | null>;

  /**
   * Get policies for a scope target
   */
  getPoliciesForScope(
    scope: PolicyScope,
    target: string
  ): Promise<PolicyDocument[]>;

  /**
   * Get the policy chain for a target (from most specific to global)
   */
  getPolicyChain(
    org?: string,
    repo?: string,
    branch?: string
  ): Promise<PolicyDocument[]>;
}

/**
 * Resolved policy with inheritance metadata
 */
export interface ResolvedPolicy {
  /** The final merged policy */
  policy: PolicyDocument;
  /** Chain of policies that were merged (from parent to child) */
  chain: PolicyDocument[];
  /** Which rules came from which policy */
  ruleOrigins: Map<string, string>;
  /** Resolution metadata */
  metadata: {
    resolvedAt: Date;
    chainDepth: number;
    totalRulesBeforeMerge: number;
    totalRulesAfterMerge: number;
  };
}

/**
 * Scope hierarchy for inheritance resolution
 */
export const SCOPE_HIERARCHY: PolicyScope[] = ['global', 'org', 'repo', 'branch'];

/**
 * Get scope priority (higher = more specific)
 */
export function getScopePriority(scope: PolicyScope): number {
  return SCOPE_HIERARCHY.indexOf(scope);
}

// =============================================================================
// In-Memory Policy Store
// =============================================================================

/**
 * Simple in-memory policy store for testing and development
 */
export class InMemoryPolicyStore implements PolicyStore {
  private policies: Map<string, PolicyDocument> = new Map();
  private scopeIndex: Map<string, Set<string>> = new Map();

  /**
   * Add a policy to the store
   */
  addPolicy(policy: PolicyDocument): void {
    const id = this.getPolicyId(policy);
    this.policies.set(id, policy);

    // Index by scope
    const scopeKey = `${policy.scope}:${policy.scopeTarget ?? 'default'}`;
    if (!this.scopeIndex.has(scopeKey)) {
      this.scopeIndex.set(scopeKey, new Set());
    }
    this.scopeIndex.get(scopeKey)!.add(id);
  }

  /**
   * Get a policy by ID
   */
  async getPolicy(policyId: string): Promise<PolicyDocument | null> {
    return this.policies.get(policyId) ?? null;
  }

  /**
   * Get policies for a scope target
   */
  async getPoliciesForScope(
    scope: PolicyScope,
    target: string
  ): Promise<PolicyDocument[]> {
    const scopeKey = `${scope}:${target}`;
    const policyIds = this.scopeIndex.get(scopeKey) ?? new Set();
    return Array.from(policyIds)
      .map(id => this.policies.get(id))
      .filter((p): p is PolicyDocument => p !== undefined);
  }

  /**
   * Get the policy chain for a target
   */
  async getPolicyChain(
    org?: string,
    repo?: string,
    branch?: string
  ): Promise<PolicyDocument[]> {
    const chain: PolicyDocument[] = [];

    // Global policies
    const globalPolicies = await this.getPoliciesForScope('global', 'default');
    chain.push(...globalPolicies);

    // Org policies
    if (org) {
      const orgPolicies = await this.getPoliciesForScope('org', org);
      chain.push(...orgPolicies);
    }

    // Repo policies
    if (repo) {
      const repoPolicies = await this.getPoliciesForScope('repo', repo);
      chain.push(...repoPolicies);
    }

    // Branch policies
    if (branch) {
      const branchPolicies = await this.getPoliciesForScope('branch', branch);
      chain.push(...branchPolicies);
    }

    return chain;
  }

  /**
   * Clear all policies
   */
  clear(): void {
    this.policies.clear();
    this.scopeIndex.clear();
  }

  /**
   * Generate a policy ID from the policy
   */
  private getPolicyId(policy: PolicyDocument): string {
    return `${policy.scope}:${policy.scopeTarget ?? 'default'}:${policy.name}`;
  }
}

// =============================================================================
// Policy Inheritance Resolver
// =============================================================================

/**
 * Resolves policy inheritance and merges policies according to inheritance mode
 */
export class PolicyInheritanceResolver {
  constructor(private store: PolicyStore) {}

  /**
   * Resolve the effective policy for a given scope
   */
  async resolve(
    org?: string,
    repo?: string,
    branch?: string
  ): Promise<ResolvedPolicy> {
    // Get the policy chain
    const chain = await this.store.getPolicyChain(org, repo, branch);

    if (chain.length === 0) {
      // Return empty policy
      return {
        policy: this.createEmptyPolicy(),
        chain: [],
        ruleOrigins: new Map(),
        metadata: {
          resolvedAt: new Date(),
          chainDepth: 0,
          totalRulesBeforeMerge: 0,
          totalRulesAfterMerge: 0,
        },
      };
    }

    // Count total rules before merge
    const totalRulesBeforeMerge = chain.reduce((sum, p) => sum + p.rules.length, 0);

    // Merge policies according to inheritance mode
    const { policy, ruleOrigins } = this.mergePolicies(chain);

    return {
      policy,
      chain,
      ruleOrigins,
      metadata: {
        resolvedAt: new Date(),
        chainDepth: chain.length,
        totalRulesBeforeMerge,
        totalRulesAfterMerge: policy.rules.length,
      },
    };
  }

  /**
   * Resolve a specific policy with its parent chain
   */
  async resolvePolicy(policyId: string): Promise<ResolvedPolicy | null> {
    const policy = await this.store.getPolicy(policyId);
    if (!policy) return null;

    // Build the parent chain
    const chain: PolicyDocument[] = [];
    let current: PolicyDocument | null = policy;

    while (current) {
      chain.unshift(current); // Add to front (parent first)
      if (current.parentPolicyId) {
        current = await this.store.getPolicy(current.parentPolicyId);
      } else {
        current = null;
      }
    }

    const totalRulesBeforeMerge = chain.reduce((sum, p) => sum + p.rules.length, 0);
    const { policy: merged, ruleOrigins } = this.mergePolicies(chain);

    return {
      policy: merged,
      chain,
      ruleOrigins,
      metadata: {
        resolvedAt: new Date(),
        chainDepth: chain.length,
        totalRulesBeforeMerge,
        totalRulesAfterMerge: merged.rules.length,
      },
    };
  }

  /**
   * Merge a chain of policies according to their inheritance modes
   */
  private mergePolicies(
    chain: PolicyDocument[]
  ): { policy: PolicyDocument; ruleOrigins: Map<string, string> } {
    if (chain.length === 0) {
      return {
        policy: this.createEmptyPolicy(),
        ruleOrigins: new Map(),
      };
    }

    if (chain.length === 1) {
      const ruleOrigins = new Map<string, string>();
      chain[0].rules.forEach(r => ruleOrigins.set(r.id, chain[0].name));
      return { policy: chain[0], ruleOrigins };
    }

    // Start with the first policy (most general)
    let merged = this.clonePolicy(chain[0]);
    const ruleOrigins = new Map<string, string>();
    merged.rules.forEach(r => ruleOrigins.set(r.id, chain[0].name));

    // Merge each subsequent policy
    for (let i = 1; i < chain.length; i++) {
      const child = chain[i];
      const result = this.mergeTwo(merged, child, child.inheritance);
      merged = result.policy;

      // For 'replace' mode, clear all previous origins
      if (child.inheritance === 'replace') {
        ruleOrigins.clear();
      }

      // Track rule origins
      child.rules.forEach(r => {
        if (result.addedRuleIds.has(r.id) || result.replacedRuleIds.has(r.id)) {
          ruleOrigins.set(r.id, child.name);
        }
      });
    }

    return { policy: merged, ruleOrigins };
  }

  /**
   * Merge two policies according to inheritance mode
   */
  private mergeTwo(
    parent: PolicyDocument,
    child: PolicyDocument,
    mode: InheritanceMode
  ): {
    policy: PolicyDocument;
    addedRuleIds: Set<string>;
    replacedRuleIds: Set<string>;
  } {
    const addedRuleIds = new Set<string>();
    const replacedRuleIds = new Set<string>();

    switch (mode) {
      case 'replace':
        // Child completely replaces parent
        child.rules.forEach(r => addedRuleIds.add(r.id));
        return {
          policy: this.clonePolicy(child),
          addedRuleIds,
          replacedRuleIds,
        };

      case 'extend':
        // Child adds to parent rules (no overrides)
        const extendedRules = [...parent.rules];
        const existingIds = new Set(parent.rules.map(r => r.id));

        for (const rule of child.rules) {
          if (!existingIds.has(rule.id)) {
            extendedRules.push(rule);
            addedRuleIds.add(rule.id);
          }
          // If rule ID exists in parent, keep parent's version (no override)
        }

        return {
          policy: {
            ...child,
            rules: this.sortRulesByPriority(extendedRules),
          },
          addedRuleIds,
          replacedRuleIds,
        };

      case 'override':
      default:
        // Child rules take precedence, parent fills gaps
        const ruleMap = new Map<string, PolicyRule>();

        // Add parent rules first
        for (const rule of parent.rules) {
          ruleMap.set(rule.id, rule);
        }

        // Override with child rules
        for (const rule of child.rules) {
          if (ruleMap.has(rule.id)) {
            replacedRuleIds.add(rule.id);
          } else {
            addedRuleIds.add(rule.id);
          }
          ruleMap.set(rule.id, rule);
        }

        return {
          policy: {
            ...child,
            rules: this.sortRulesByPriority(Array.from(ruleMap.values())),
          },
          addedRuleIds,
          replacedRuleIds,
        };
    }
  }

  /**
   * Sort rules by priority (higher priority first)
   */
  private sortRulesByPriority(rules: PolicyRule[]): PolicyRule[] {
    return [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Create an empty policy document
   */
  private createEmptyPolicy(): PolicyDocument {
    return PolicyDocumentSchema.parse({
      name: 'empty',
      rules: [],
    });
  }

  /**
   * Deep clone a policy document
   */
  private clonePolicy(policy: PolicyDocument): PolicyDocument {
    return JSON.parse(JSON.stringify(policy));
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a policy inheritance resolver with an in-memory store
 */
export function createInheritanceResolver(): {
  resolver: PolicyInheritanceResolver;
  store: InMemoryPolicyStore;
} {
  const store = new InMemoryPolicyStore();
  const resolver = new PolicyInheritanceResolver(store);
  return { resolver, store };
}

/**
 * Check if a scope is more specific than another
 */
export function isScopeMoreSpecific(a: PolicyScope, b: PolicyScope): boolean {
  return getScopePriority(a) > getScopePriority(b);
}

/**
 * Get the parent scope for a given scope
 */
export function getParentScope(scope: PolicyScope): PolicyScope | null {
  const index = SCOPE_HIERARCHY.indexOf(scope);
  if (index <= 0) return null;
  return SCOPE_HIERARCHY[index - 1];
}

/**
 * Validate that a policy's parent is in the correct scope hierarchy
 */
export function validateInheritanceChain(
  child: PolicyDocument,
  parent: PolicyDocument
): { valid: boolean; error?: string } {
  const childPriority = getScopePriority(child.scope);
  const parentPriority = getScopePriority(parent.scope);

  if (childPriority <= parentPriority) {
    return {
      valid: false,
      error: `Child scope '${child.scope}' must be more specific than parent scope '${parent.scope}'`,
    };
  }

  return { valid: true };
}
