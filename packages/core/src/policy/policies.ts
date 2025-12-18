/**
 * Default Policies
 *
 * Phase 25: Approval Commands + Policy-as-Code Enforcement
 *
 * Built-in policy definitions for common security requirements.
 *
 * @module @gwi/core/policy/policies
 */

import type { Policy, PolicyContext } from './types.js';
import { createPolicy } from './engine.js';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Count unique approvers
 */
function countUniqueApprovers(context: PolicyContext): number {
  const approvers = new Set(
    context.approvals
      .filter((a) => a.decision === 'approved')
      .map((a) => a.approver.id)
  );
  return approvers.size;
}

/**
 * Check if actor has required role
 */
function hasRole(
  context: PolicyContext,
  requiredRole: 'VIEWER' | 'DEVELOPER' | 'ADMIN' | 'OWNER'
): boolean {
  const roleHierarchy = { VIEWER: 0, DEVELOPER: 1, ADMIN: 2, OWNER: 3 };
  return roleHierarchy[context.actor.role] >= roleHierarchy[requiredRole];
}

/**
 * Check if all required scopes are approved
 */
function hasAllScopes(context: PolicyContext): boolean {
  const approvedScopes = new Set(
    context.approvals
      .filter((a) => a.decision === 'approved')
      .flatMap((a) => a.scopesApproved)
  );

  return context.requiredScopes.every((s) => approvedScopes.has(s));
}

// =============================================================================
// Policy: Require Approval for Execution
// =============================================================================

export const requireApprovalPolicy: Policy = createPolicy()
  .id('require-approval')
  .name('Require Approval for Execution')
  .description('All candidate executions require at least one approval')
  .priority('critical')
  .actions(['candidate.execute'])
  .when(() => true) // Always applies
  .evaluate((ctx) => {
    const approvalCount = countUniqueApprovers(ctx);
    if (approvalCount === 0) {
      return 'REQUIRE_MORE_APPROVALS';
    }
    if (!hasAllScopes(ctx)) {
      return 'REQUIRE_MORE_APPROVALS';
    }
    return 'ALLOW';
  })
  .denyMessage(() => 'Execution requires approval')
  .resolutionMessage(() => 'Use `/gwi approve <candidate-id>` to approve')
  .build();

// =============================================================================
// Policy: Destructive Actions Require Owner
// =============================================================================

export const destructiveActionsOwnerPolicy: Policy = createPolicy()
  .id('destructive-requires-owner')
  .name('Destructive Actions Require Owner')
  .description('Tenant deletion and critical operations require OWNER role')
  .priority('critical')
  .actions(['tenant.delete', 'billing.update'])
  .when(() => true)
  .evaluate((ctx) => {
    if (!hasRole(ctx, 'OWNER')) {
      return 'DENY';
    }
    return 'ALLOW';
  })
  .denyMessage((ctx) => `Action "${ctx.action}" requires OWNER role`)
  .resolutionMessage(() => 'Contact a tenant OWNER to perform this action')
  .build();

// =============================================================================
// Policy: Protected Branch Requires Two Approvals
// =============================================================================

export const protectedBranchPolicy: Policy = createPolicy()
  .id('protected-branch-two-approvals')
  .name('Protected Branch Requires Two Approvals')
  .description('Merges to protected branches require 2 different approvers')
  .priority('high')
  .actions(['pr.merge', 'git.push'])
  .when((ctx) => ctx.resource.isProtectedBranch === true)
  .evaluate((ctx) => {
    const approvalCount = countUniqueApprovers(ctx);
    if (approvalCount < 2) {
      return 'REQUIRE_MORE_APPROVALS';
    }
    return 'ALLOW';
  })
  .denyMessage((ctx) => {
    const count = countUniqueApprovers(ctx);
    return `Protected branch requires 2 approvals, currently has ${count}`;
  })
  .resolutionMessage(() => 'Get approval from another team member')
  .build();

// =============================================================================
// Policy: Production Deploy Requires Admin + Business Hours
// =============================================================================

export const productionDeployPolicy: Policy = createPolicy()
  .id('production-deploy-admin-business-hours')
  .name('Production Deploy Requires Admin and Business Hours')
  .description('Production deployments require ADMIN role during business hours')
  .priority('high')
  .actions(['deploy.production'])
  .when((ctx) => ctx.resource.isProduction === true)
  .evaluate((ctx) => {
    // Must be ADMIN or higher
    if (!hasRole(ctx, 'ADMIN')) {
      return 'DENY';
    }

    // Must be business hours
    if (!ctx.environment.isBusinessHours) {
      return 'DENY';
    }

    // Must have approval
    if (countUniqueApprovers(ctx) === 0) {
      return 'REQUIRE_MORE_APPROVALS';
    }

    return 'ALLOW';
  })
  .denyMessage((ctx) => {
    if (!hasRole(ctx, 'ADMIN')) {
      return 'Production deployments require ADMIN role';
    }
    if (!ctx.environment.isBusinessHours) {
      return 'Production deployments are only allowed during business hours (Mon-Fri 9am-5pm)';
    }
    return 'Production deployment requires approval';
  })
  .resolutionMessage((ctx) => {
    if (!hasRole(ctx, 'ADMIN')) {
      return 'Contact an ADMIN to perform the deployment';
    }
    if (!ctx.environment.isBusinessHours) {
      return 'Schedule deployment during business hours or get emergency approval';
    }
    return 'Get approval from a team member';
  })
  .build();

// =============================================================================
// Policy: Member Removal Requires Admin
// =============================================================================

export const memberRemovalPolicy: Policy = createPolicy()
  .id('member-removal-admin')
  .name('Member Removal Requires Admin')
  .description('Removing team members requires ADMIN role')
  .priority('high')
  .actions(['member.remove'])
  .when(() => true)
  .evaluate((ctx) => {
    if (!hasRole(ctx, 'ADMIN')) {
      return 'DENY';
    }
    return 'ALLOW';
  })
  .denyMessage(() => 'Removing members requires ADMIN role')
  .resolutionMessage(() => 'Contact an ADMIN to remove team members')
  .build();

// =============================================================================
// Policy: Large Patch Requires Review
// =============================================================================

export const largePatchReviewPolicy: Policy = createPolicy()
  .id('large-patch-review')
  .name('Large Patches Require Review')
  .description('Patches changing >500 lines require explicit approval')
  .priority('normal')
  .actions(['candidate.execute', 'git.push'])
  .when((ctx) => {
    const totalChanges =
      (ctx.patch?.linesAdded || 0) + (ctx.patch?.linesRemoved || 0);
    return totalChanges > 500;
  })
  .evaluate((ctx) => {
    if (countUniqueApprovers(ctx) === 0) {
      return 'REQUIRE_MORE_APPROVALS';
    }
    return 'ALLOW';
  })
  .denyMessage((ctx) => {
    const totalChanges =
      (ctx.patch?.linesAdded || 0) + (ctx.patch?.linesRemoved || 0);
    return `Large patch (${totalChanges} lines changed) requires explicit approval`;
  })
  .resolutionMessage(() => 'Review the changes and use `/gwi approve` to confirm')
  .build();

// =============================================================================
// Policy: Self-Approval Prohibited
// =============================================================================

export const noSelfApprovalPolicy: Policy = createPolicy()
  .id('no-self-approval')
  .name('Self-Approval Prohibited')
  .description('Users cannot approve their own candidates')
  .priority('critical')
  .actions(['candidate.execute'])
  .when(() => true)
  .evaluate((ctx) => {
    // Check if all approvals are from the same person as the actor
    const validApprovals = ctx.approvals.filter(
      (a) =>
        a.decision === 'approved' &&
        a.approver.id !== ctx.actor.id
    );

    if (ctx.approvals.length > 0 && validApprovals.length === 0) {
      return 'REQUIRE_MORE_APPROVALS';
    }

    return 'ALLOW';
  })
  .denyMessage(() => 'Self-approval is not allowed')
  .resolutionMessage(() => 'Request approval from a different team member')
  .build();

// =============================================================================
// Default Policy Set
// =============================================================================

export const DEFAULT_POLICIES: Policy[] = [
  requireApprovalPolicy,
  destructiveActionsOwnerPolicy,
  protectedBranchPolicy,
  productionDeployPolicy,
  memberRemovalPolicy,
  largePatchReviewPolicy,
  noSelfApprovalPolicy,
];

/**
 * Register all default policies with the engine
 */
export function registerDefaultPolicies(
  engine: { registerPolicy: (policy: Policy) => void }
): void {
  for (const policy of DEFAULT_POLICIES) {
    engine.registerPolicy(policy);
  }
}
