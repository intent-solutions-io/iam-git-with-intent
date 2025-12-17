/**
 * Capabilities Module
 *
 * Provides approval-gated access control for GitHub operations.
 *
 * Key concepts:
 * - GatedOperation: Operations that require approval (commit, push, etc.)
 * - SafeOperation: Read-only operations that don't require approval
 * - ApprovalRecord: Proof of approval with patch hash, scope, etc.
 *
 * Usage:
 * ```typescript
 * import {
 *   checkApproval,
 *   computePatchHash,
 *   createApprovalFromPatch,
 *   executeIfApproved,
 * } from '@gwi/core';
 *
 * // Before committing, verify approval
 * const check = checkApproval(request, approval, patchContent);
 * if (!check.approved) {
 *   throw new Error(check.reason);
 * }
 * ```
 *
 * @module @gwi/core/capabilities
 */

// Types
export {
  GatedOperation,
  SafeOperation,
  OperationRequest,
  ApprovalCheckResult,
  OPERATION_SCOPE_MAP,
  DENIAL_REASONS,
  MODE_CAPABILITIES,
} from './types.js';

// Approval verification
export {
  computePatchHash,
  verifyPatchHash,
  checkApproval,
  hasScope,
  canPerformOperation,
  createApprovalRecord,
  createApprovalFromPatch,
  executeIfApproved,
  type GatedOperationResult,
} from './approval-verifier.js';
