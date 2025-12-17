/**
 * Approval Verifier
 *
 * Verifies that operations have valid approval before execution.
 */

import { createHash } from 'node:crypto';
import type { ApprovalRecord, ApprovalScope } from '../run-bundle/types.js';
import type {
  GatedOperation,
  OperationRequest,
  ApprovalCheckResult,
} from './types.js';
import { OPERATION_SCOPE_MAP, DENIAL_REASONS } from './types.js';

// =============================================================================
// Patch Hashing
// =============================================================================

/**
 * Compute SHA256 hash of patch content
 */
export function computePatchHash(patchContent: string): string {
  return createHash('sha256').update(patchContent, 'utf8').digest('hex');
}

/**
 * Verify patch hash matches
 */
export function verifyPatchHash(
  patchContent: string,
  expectedHash: string
): boolean {
  const actualHash = computePatchHash(patchContent);
  return actualHash === expectedHash;
}

// =============================================================================
// Approval Verification
// =============================================================================

/**
 * Check if an operation is approved
 *
 * @param request - The operation request
 * @param approval - The approval record (if any)
 * @param patchContent - The patch content (for hash verification)
 * @returns Approval check result
 */
export function checkApproval(
  request: OperationRequest,
  approval: ApprovalRecord | null | undefined,
  patchContent?: string
): ApprovalCheckResult {
  // No approval record
  if (!approval) {
    return {
      approved: false,
      reason: DENIAL_REASONS.NO_APPROVAL,
    };
  }

  // Run ID mismatch
  if (approval.runId !== request.runId) {
    return {
      approved: false,
      reason: DENIAL_REASONS.RUN_ID_MISMATCH,
    };
  }

  // Check scope
  const requiredScope = OPERATION_SCOPE_MAP[request.operation];
  if (!approval.scope.includes(requiredScope)) {
    return {
      approved: false,
      reason: `${DENIAL_REASONS.SCOPE_MISSING}: requires '${requiredScope}'`,
    };
  }

  // Check patch hash if operation involves commits
  const patchOperations: GatedOperation[] = ['git_commit', 'file_write'];
  if (patchOperations.includes(request.operation)) {
    if (request.patchHash && request.patchHash !== approval.patchHash) {
      return {
        approved: false,
        reason: DENIAL_REASONS.PATCH_MISMATCH,
      };
    }
    // If we have patch content, verify against approval hash
    if (patchContent) {
      const actualHash = computePatchHash(patchContent);
      if (actualHash !== approval.patchHash) {
        return {
          approved: false,
          reason: DENIAL_REASONS.PATCH_MISMATCH,
        };
      }
    }
  }

  // All checks passed
  return {
    approved: true,
    reason: 'Approval verified',
    approval,
  };
}

/**
 * Check if an approval record authorizes a specific scope
 */
export function hasScope(
  approval: ApprovalRecord,
  scope: ApprovalScope
): boolean {
  return approval.scope.includes(scope);
}

/**
 * Check if an approval record authorizes an operation
 */
export function canPerformOperation(
  approval: ApprovalRecord,
  operation: GatedOperation
): boolean {
  const requiredScope = OPERATION_SCOPE_MAP[operation];
  return hasScope(approval, requiredScope);
}

// =============================================================================
// Approval Creation Helpers
// =============================================================================

/**
 * Create an approval record
 *
 * @param runId - The run ID
 * @param approvedBy - Who approved (user ID, email, etc.)
 * @param scope - What is approved
 * @param patchHash - Hash of the patch being approved
 * @param comment - Optional approval comment
 */
export function createApprovalRecord(
  runId: string,
  approvedBy: string,
  scope: ApprovalScope[],
  patchHash: string,
  comment?: string
): ApprovalRecord {
  return {
    runId,
    approvedAt: new Date().toISOString(),
    approvedBy,
    scope,
    patchHash,
    comment,
  };
}

/**
 * Create an approval record from patch content
 */
export function createApprovalFromPatch(
  runId: string,
  approvedBy: string,
  scope: ApprovalScope[],
  patchContent: string,
  comment?: string
): ApprovalRecord {
  const patchHash = computePatchHash(patchContent);
  return createApprovalRecord(runId, approvedBy, scope, patchHash, comment);
}

// =============================================================================
// Operation Guards
// =============================================================================

/**
 * Result of attempting a gated operation
 */
export interface GatedOperationResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  denialReason?: string;
}

/**
 * Execute a gated operation only if approved
 *
 * @param request - The operation request
 * @param approval - The approval record
 * @param patchContent - The patch content (for verification)
 * @param execute - The function to execute if approved
 * @returns Result of the operation
 */
export async function executeIfApproved<T>(
  request: OperationRequest,
  approval: ApprovalRecord | null | undefined,
  patchContent: string | undefined,
  execute: () => Promise<T>
): Promise<GatedOperationResult<T>> {
  const check = checkApproval(request, approval, patchContent);

  if (!check.approved) {
    return {
      success: false,
      denialReason: check.reason,
    };
  }

  try {
    const result = await execute();
    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
