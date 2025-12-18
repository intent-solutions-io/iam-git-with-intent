/**
 * Capabilities Tests
 *
 * Tests for approval-gated GitHub operations.
 */

import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';

import {
  computePatchHash,
  verifyPatchHash,
  checkApproval,
  hasScope,
  canPerformOperation,
  createApprovalRecord,
  createApprovalFromPatch,
  executeIfApproved,
} from '../approval-verifier.js';

import {
  OPERATION_SCOPE_MAP,
  DENIAL_REASONS,
  MODE_CAPABILITIES,
} from '../types.js';

import type { ApprovalRecord } from '../../run-bundle/types.js';
import type { OperationRequest } from '../types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_RUN_ID = '12345678-1234-1234-1234-123456789012';
const TEST_PATCH = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 export function hello() {
+  console.log('hello');
   return 'hello';
 }`;

const TEST_PATCH_HASH = createHash('sha256').update(TEST_PATCH, 'utf8').digest('hex');

function createTestApproval(overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    runId: TEST_RUN_ID,
    approvedAt: new Date().toISOString(),
    approvedBy: 'test-user@example.com',
    scope: ['commit', 'push'],
    patchHash: TEST_PATCH_HASH,
    ...overrides,
  };
}

function createTestRequest(overrides: Partial<OperationRequest> = {}): OperationRequest {
  return {
    runId: TEST_RUN_ID,
    operation: 'git_commit',
    targetRepo: { owner: 'test-owner', name: 'test-repo' },
    description: 'Test commit operation',
    ...overrides,
  };
}

// =============================================================================
// Patch Hashing Tests
// =============================================================================

describe('Patch Hashing', () => {
  describe('computePatchHash', () => {
    it('computes SHA256 hash of patch content', () => {
      const hash = computePatchHash(TEST_PATCH);
      expect(hash).toBe(TEST_PATCH_HASH);
      expect(hash).toHaveLength(64); // SHA256 hex is 64 chars
    });

    it('produces different hashes for different content', () => {
      const hash1 = computePatchHash('content 1');
      const hash2 = computePatchHash('content 2');
      expect(hash1).not.toBe(hash2);
    });

    it('is deterministic - same input produces same output', () => {
      const results = Array.from({ length: 5 }, () => computePatchHash(TEST_PATCH));
      expect(new Set(results).size).toBe(1);
    });
  });

  describe('verifyPatchHash', () => {
    it('returns true for matching hash', () => {
      expect(verifyPatchHash(TEST_PATCH, TEST_PATCH_HASH)).toBe(true);
    });

    it('returns false for non-matching hash', () => {
      expect(verifyPatchHash(TEST_PATCH, 'wrong-hash')).toBe(false);
    });

    it('returns false for modified content', () => {
      const modified = TEST_PATCH + '\n// extra line';
      expect(verifyPatchHash(modified, TEST_PATCH_HASH)).toBe(false);
    });
  });
});

// =============================================================================
// Approval Verification Tests
// =============================================================================

describe('Approval Verification', () => {
  describe('checkApproval', () => {
    it('approves when all checks pass', () => {
      const request = createTestRequest();
      const approval = createTestApproval();

      const result = checkApproval(request, approval, TEST_PATCH);

      expect(result.approved).toBe(true);
      expect(result.reason).toBe('Approval verified');
      expect(result.approval).toEqual(approval);
    });

    it('denies when no approval record', () => {
      const request = createTestRequest();

      const result = checkApproval(request, null);

      expect(result.approved).toBe(false);
      expect(result.reason).toBe(DENIAL_REASONS.NO_APPROVAL);
    });

    it('denies when run ID does not match', () => {
      const request = createTestRequest();
      const approval = createTestApproval({ runId: 'different-run-id' });

      const result = checkApproval(request, approval);

      expect(result.approved).toBe(false);
      expect(result.reason).toBe(DENIAL_REASONS.RUN_ID_MISMATCH);
    });

    it('denies when required scope is missing', () => {
      const request = createTestRequest({ operation: 'pr_merge' });
      const approval = createTestApproval({ scope: ['commit', 'push'] }); // No 'merge'

      const result = checkApproval(request, approval);

      expect(result.approved).toBe(false);
      expect(result.reason).toContain(DENIAL_REASONS.SCOPE_MISSING);
      expect(result.reason).toContain('merge');
    });

    it('denies when patch hash does not match (via request.patchHash)', () => {
      const request = createTestRequest({ patchHash: 'wrong-hash' });
      const approval = createTestApproval();

      const result = checkApproval(request, approval);

      expect(result.approved).toBe(false);
      expect(result.reason).toBe(DENIAL_REASONS.PATCH_MISMATCH);
    });

    it('denies when patch content hash does not match', () => {
      const request = createTestRequest();
      const approval = createTestApproval();
      const modifiedPatch = TEST_PATCH + '\n// unauthorized change';

      const result = checkApproval(request, approval, modifiedPatch);

      expect(result.approved).toBe(false);
      expect(result.reason).toBe(DENIAL_REASONS.PATCH_MISMATCH);
    });

    it('approves read operations without patch verification', () => {
      const request = createTestRequest({ operation: 'git_push' });
      const approval = createTestApproval({ scope: ['push'] });

      const result = checkApproval(request, approval);

      expect(result.approved).toBe(true);
    });
  });

  describe('hasScope', () => {
    it('returns true when scope is present', () => {
      const approval = createTestApproval({ scope: ['commit', 'push', 'open_pr'] });

      expect(hasScope(approval, 'commit')).toBe(true);
      expect(hasScope(approval, 'push')).toBe(true);
      expect(hasScope(approval, 'open_pr')).toBe(true);
    });

    it('returns false when scope is missing', () => {
      const approval = createTestApproval({ scope: ['commit'] });

      expect(hasScope(approval, 'push')).toBe(false);
      expect(hasScope(approval, 'merge')).toBe(false);
    });
  });

  describe('canPerformOperation', () => {
    it('allows operations with matching scope', () => {
      const approval = createTestApproval({ scope: ['commit', 'push', 'open_pr'] });

      expect(canPerformOperation(approval, 'git_commit')).toBe(true);
      expect(canPerformOperation(approval, 'git_push')).toBe(true);
      expect(canPerformOperation(approval, 'pr_create')).toBe(true);
      expect(canPerformOperation(approval, 'pr_update')).toBe(true);
    });

    it('denies operations without matching scope', () => {
      const approval = createTestApproval({ scope: ['commit'] });

      expect(canPerformOperation(approval, 'git_push')).toBe(false);
      expect(canPerformOperation(approval, 'pr_merge')).toBe(false);
    });
  });
});

// =============================================================================
// Approval Creation Tests
// =============================================================================

describe('Approval Creation', () => {
  describe('createApprovalRecord', () => {
    it('creates a valid approval record', () => {
      const approval = createApprovalRecord(
        TEST_RUN_ID,
        'approver@example.com',
        ['commit', 'push'],
        TEST_PATCH_HASH,
        'LGTM'
      );

      expect(approval.runId).toBe(TEST_RUN_ID);
      expect(approval.approvedBy).toBe('approver@example.com');
      expect(approval.scope).toEqual(['commit', 'push']);
      expect(approval.patchHash).toBe(TEST_PATCH_HASH);
      expect(approval.comment).toBe('LGTM');
      expect(approval.approvedAt).toBeDefined();
    });

    it('creates approval without comment', () => {
      const approval = createApprovalRecord(
        TEST_RUN_ID,
        'approver@example.com',
        ['commit'],
        TEST_PATCH_HASH
      );

      expect(approval.comment).toBeUndefined();
    });
  });

  describe('createApprovalFromPatch', () => {
    it('computes hash from patch content', () => {
      const approval = createApprovalFromPatch(
        TEST_RUN_ID,
        'approver@example.com',
        ['commit', 'push'],
        TEST_PATCH
      );

      expect(approval.patchHash).toBe(TEST_PATCH_HASH);
    });

    it('allows verifying the approval with original patch', () => {
      const approval = createApprovalFromPatch(
        TEST_RUN_ID,
        'approver@example.com',
        ['commit'],
        TEST_PATCH
      );

      expect(verifyPatchHash(TEST_PATCH, approval.patchHash)).toBe(true);
    });
  });
});

// =============================================================================
// Operation Guards Tests
// =============================================================================

describe('Operation Guards', () => {
  describe('executeIfApproved', () => {
    it('executes operation when approved', async () => {
      const request = createTestRequest();
      const approval = createTestApproval();
      const execute = vi.fn().mockResolvedValue('success');

      const result = await executeIfApproved(request, approval, TEST_PATCH, execute);

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('does not execute when denied', async () => {
      const request = createTestRequest();
      const approval = null; // No approval
      const execute = vi.fn().mockResolvedValue('success');

      const result = await executeIfApproved(request, approval, TEST_PATCH, execute);

      expect(result.success).toBe(false);
      expect(result.denialReason).toBe(DENIAL_REASONS.NO_APPROVAL);
      expect(execute).not.toHaveBeenCalled();
    });

    it('captures errors from execution', async () => {
      const request = createTestRequest();
      const approval = createTestApproval();
      const execute = vi.fn().mockRejectedValue(new Error('Git error'));

      const result = await executeIfApproved(request, approval, TEST_PATCH, execute);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Git error');
    });

    it('handles non-Error throws', async () => {
      const request = createTestRequest();
      const approval = createTestApproval();
      const execute = vi.fn().mockRejectedValue('string error');

      const result = await executeIfApproved(request, approval, TEST_PATCH, execute);

      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
    });
  });
});

// =============================================================================
// Operation Scope Map Tests
// =============================================================================

describe('Operation Scope Map', () => {
  it('maps all gated operations to scopes', () => {
    expect(OPERATION_SCOPE_MAP.git_commit).toBe('commit');
    expect(OPERATION_SCOPE_MAP.git_push).toBe('push');
    expect(OPERATION_SCOPE_MAP.pr_create).toBe('open_pr');
    expect(OPERATION_SCOPE_MAP.pr_update).toBe('push');
    expect(OPERATION_SCOPE_MAP.pr_merge).toBe('merge');
    expect(OPERATION_SCOPE_MAP.branch_delete).toBe('push');
    expect(OPERATION_SCOPE_MAP.file_write).toBe('commit');
  });
});

// =============================================================================
// Mode Capabilities Tests
// =============================================================================

describe('Mode Capabilities', () => {
  it('comment-only mode allows no gated operations', () => {
    const mode = MODE_CAPABILITIES['comment-only'];
    expect(mode.allowed).toEqual([]);
    expect(mode.requiresApproval).toEqual([]);
  });

  it('patch-only mode allows no gated operations', () => {
    const mode = MODE_CAPABILITIES['patch-only'];
    expect(mode.allowed).toEqual([]);
    expect(mode.requiresApproval).toEqual([]);
  });

  it('commit-after-approval mode requires approval for write operations', () => {
    const mode = MODE_CAPABILITIES['commit-after-approval'];
    expect(mode.allowed).toContain('git_commit');
    expect(mode.allowed).toContain('git_push');
    expect(mode.allowed).toContain('pr_create');
    expect(mode.requiresApproval).toContain('git_commit');
    expect(mode.requiresApproval).toContain('git_push');
  });
});
