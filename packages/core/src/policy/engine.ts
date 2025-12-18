/**
 * Policy Engine
 *
 * Phase 25: Approval Commands + Policy-as-Code Enforcement
 *
 * Deterministic policy evaluation engine.
 * Policies are pure functions - no side effects.
 *
 * @module @gwi/core/policy/engine
 */

import {
  type Policy,
  type PolicySet,
  type PolicyContext,
  type PolicyResult,
  type PolicyDecision,
  type PolicyReason,
  PRIORITY_ORDER,
} from './types.js';

// =============================================================================
// Policy Engine
// =============================================================================

/**
 * Policy Engine
 *
 * Evaluates policies deterministically against a context.
 */
export class PolicyEngine {
  private policies: Policy[] = [];
  private policySets: PolicySet[] = [];

  /**
   * Register a policy
   */
  registerPolicy(policy: Policy): void {
    // Check for duplicate ID
    if (this.policies.some((p) => p.id === policy.id)) {
      throw new Error(`Policy with ID "${policy.id}" already registered`);
    }
    this.policies.push(policy);
    this.sortPolicies();
  }

  /**
   * Register a policy set
   */
  registerPolicySet(policySet: PolicySet): void {
    this.policySets.push(policySet);
    for (const policy of policySet.policies) {
      if (!this.policies.some((p) => p.id === policy.id)) {
        this.policies.push(policy);
      }
    }
    this.sortPolicies();
  }

  /**
   * Unregister a policy
   */
  unregisterPolicy(policyId: string): void {
    this.policies = this.policies.filter((p) => p.id !== policyId);
  }

  /**
   * Get all registered policies
   */
  getPolicies(): Policy[] {
    return [...this.policies];
  }

  /**
   * Sort policies by priority
   */
  private sortPolicies(): void {
    this.policies.sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    );
  }

  /**
   * Evaluate all applicable policies
   *
   * @param context - Policy evaluation context
   * @returns Policy result
   */
  evaluate(context: PolicyContext): PolicyResult {
    const startTime = Date.now();
    const reasons: PolicyReason[] = [];
    const policiesEvaluated: string[] = [];

    let finalDecision: PolicyDecision = 'ALLOW';
    let missingRequirements: PolicyResult['missingRequirements'];

    // Evaluate each policy in priority order
    for (const policy of this.policies) {
      // Skip disabled policies
      if (!policy.enabled) {
        continue;
      }

      // Check if policy applies to this action
      if (
        policy.actions !== '*' &&
        !policy.actions.includes(context.action)
      ) {
        continue;
      }

      // Check if condition triggers
      if (!policy.condition(context)) {
        continue;
      }

      policiesEvaluated.push(policy.id);

      // Evaluate the policy
      const decision = policy.evaluate(context);

      // Record reason
      if (decision === 'DENY') {
        reasons.push({
          policyId: policy.id,
          message: policy.denyMessage(context),
          resolution: policy.resolutionMessage?.(context),
        });

        // DENY is final - stop evaluation
        finalDecision = 'DENY';
        break;
      }

      if (decision === 'REQUIRE_MORE_APPROVALS') {
        reasons.push({
          policyId: policy.id,
          message: policy.denyMessage(context),
          resolution: policy.resolutionMessage?.(context),
        });

        // Track missing requirements
        finalDecision = 'REQUIRE_MORE_APPROVALS';
        // Don't break - continue to gather all requirements
      }
    }

    // Calculate missing requirements if needed
    if (finalDecision === 'REQUIRE_MORE_APPROVALS') {
      missingRequirements = this.calculateMissingRequirements(context);
    }

    const durationMs = Date.now() - startTime;

    return {
      decision: finalDecision,
      reasons,
      policiesEvaluated,
      missingRequirements,
      evaluatedAt: new Date(),
      durationMs,
    };
  }

  /**
   * Calculate missing requirements for approval
   */
  private calculateMissingRequirements(
    context: PolicyContext
  ): PolicyResult['missingRequirements'] {
    const currentApprovals = context.approvals.filter(
      (a) => a.decision === 'approved'
    );

    // Count approvals by unique approver
    const uniqueApprovers = new Set(
      currentApprovals.map((a) => a.approver.id)
    );

    // Gather all approved scopes
    const approvedScopes = new Set(
      currentApprovals.flatMap((a) => a.scopesApproved)
    );

    // Find missing scopes
    const missingScopes = context.requiredScopes.filter(
      (s) => !approvedScopes.has(s)
    );

    // Default: require at least 1 approval
    // Protected branches: require 2 approvals
    const requiredApprovals = context.resource.isProtectedBranch ? 2 : 1;
    const approvalsNeeded = Math.max(
      0,
      requiredApprovals - uniqueApprovers.size
    );

    return {
      approvalsNeeded,
      missingScopes,
    };
  }
}

// =============================================================================
// Singleton
// =============================================================================

let engineInstance: PolicyEngine | null = null;

/**
 * Get the policy engine instance
 */
export function getPolicyEngine(): PolicyEngine {
  if (!engineInstance) {
    engineInstance = new PolicyEngine();
  }
  return engineInstance;
}

/**
 * Reset the policy engine (for testing)
 */
export function resetPolicyEngine(): void {
  engineInstance = null;
}

// =============================================================================
// Evaluation Function (Main Entry Point)
// =============================================================================

/**
 * Evaluate a policy context
 *
 * This is the main entry point for policy evaluation.
 *
 * @example
 * ```typescript
 * import { evaluatePolicy } from '@gwi/core';
 *
 * const result = evaluatePolicy({
 *   tenantId: 'tenant-123',
 *   action: 'pr.merge',
 *   actor: { id: 'user-456', type: 'user', role: 'DEVELOPER' },
 *   resource: { type: 'pr', id: '789', isProtectedBranch: true },
 *   environment: createEnvironmentContext(),
 *   approvals: [],
 *   requiredScopes: ['merge'],
 * });
 *
 * if (result.decision !== 'ALLOW') {
 *   // Block execution
 * }
 * ```
 */
export function evaluatePolicy(context: PolicyContext): PolicyResult {
  const engine = getPolicyEngine();
  return engine.evaluate(context);
}

// =============================================================================
// Policy Builder
// =============================================================================

/**
 * Policy builder for fluent API
 */
export class PolicyBuilder {
  private policy: Partial<Policy> = {
    enabled: true,
    priority: 'normal',
    actions: '*',
    condition: () => true,
  };

  id(id: string): this {
    this.policy.id = id;
    return this;
  }

  name(name: string): this {
    this.policy.name = name;
    return this;
  }

  description(description: string): this {
    this.policy.description = description;
    return this;
  }

  priority(priority: Policy['priority']): this {
    this.policy.priority = priority;
    return this;
  }

  actions(actions: Policy['actions']): this {
    this.policy.actions = actions;
    return this;
  }

  when(condition: Policy['condition']): this {
    this.policy.condition = condition;
    return this;
  }

  evaluate(evaluate: Policy['evaluate']): this {
    this.policy.evaluate = evaluate;
    return this;
  }

  denyMessage(fn: Policy['denyMessage']): this {
    this.policy.denyMessage = fn;
    return this;
  }

  resolutionMessage(fn: Policy['resolutionMessage']): this {
    this.policy.resolutionMessage = fn;
    return this;
  }

  enabled(enabled: boolean): this {
    this.policy.enabled = enabled;
    return this;
  }

  build(): Policy {
    // Validate required fields
    if (!this.policy.id) throw new Error('Policy ID is required');
    if (!this.policy.name) throw new Error('Policy name is required');
    if (!this.policy.description) throw new Error('Policy description is required');
    if (!this.policy.evaluate) throw new Error('Policy evaluate function is required');
    if (!this.policy.denyMessage) throw new Error('Policy denyMessage is required');

    return this.policy as Policy;
  }
}

/**
 * Create a new policy builder
 */
export function createPolicy(): PolicyBuilder {
  return new PolicyBuilder();
}
