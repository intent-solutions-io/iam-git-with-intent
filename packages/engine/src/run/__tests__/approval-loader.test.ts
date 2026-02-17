/**
 * Tests for approval-loader module
 *
 * Tests loading signed approvals from `.gwi/approvals/` directory
 * and checking approval coverage for required scopes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadSignedApprovalsForRun, checkApprovalCoverage } from '../approval-loader.js';
import type { SignedApproval } from '@gwi/core';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

import { readdir, readFile } from 'fs/promises';

const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);

/**
 * Create a valid SignedApproval fixture for testing
 */
function createApprovalFixture(overrides: Partial<SignedApproval> = {}): SignedApproval {
  return {
    approvalId: crypto.randomUUID(),
    tenantId: 'test-tenant',
    approver: {
      type: 'user',
      id: 'user-1',
      displayName: 'Test User',
    },
    approverRole: 'ADMIN',
    decision: 'approved',
    scopesApproved: ['commit', 'push'],
    targetType: 'run',
    target: {
      runId: 'run-123',
    },
    intentHash: 'abc123hash',
    source: 'cli',
    signature: 'sig-placeholder',
    signingKeyId: 'key-1',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('loadSignedApprovalsForRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return empty array when approvals directory does not exist', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT'));

    const result = await loadSignedApprovalsForRun('run-123', '/fake/repo');
    expect(result).toEqual([]);
  });

  it('should return empty array when directory is empty', async () => {
    mockReaddir.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result = await loadSignedApprovalsForRun('run-123', '/fake/repo');
    expect(result).toEqual([]);
  });

  it('should load and filter approvals matching run ID', async () => {
    const approval1 = createApprovalFixture({ target: { runId: 'run-123' } });
    const approval2 = createApprovalFixture({ target: { runId: 'run-other' } });

    mockReaddir.mockResolvedValue(
      ['approval1.json', 'approval2.json'] as unknown as Awaited<ReturnType<typeof readdir>>
    );
    mockReadFile.mockImplementation((path) => {
      const p = String(path);
      if (p.includes('approval1')) return Promise.resolve(JSON.stringify(approval1));
      if (p.includes('approval2')) return Promise.resolve(JSON.stringify(approval2));
      return Promise.reject(new Error('not found'));
    });

    const result = await loadSignedApprovalsForRun('run-123', '/fake/repo');
    expect(result).toHaveLength(1);
    expect(result[0].target.runId).toBe('run-123');
  });

  it('should filter out denied approvals', async () => {
    const denied = createApprovalFixture({
      target: { runId: 'run-123' },
      decision: 'denied',
      scopesApproved: [],
    });

    mockReaddir.mockResolvedValue(
      ['denied.json'] as unknown as Awaited<ReturnType<typeof readdir>>
    );
    mockReadFile.mockResolvedValue(JSON.stringify(denied));

    const result = await loadSignedApprovalsForRun('run-123', '/fake/repo');
    expect(result).toEqual([]);
  });

  it('should skip non-JSON files', async () => {
    mockReaddir.mockResolvedValue(
      ['readme.md', 'notes.txt'] as unknown as Awaited<ReturnType<typeof readdir>>
    );

    const result = await loadSignedApprovalsForRun('run-123', '/fake/repo');
    expect(result).toEqual([]);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('should skip malformed JSON files gracefully', async () => {
    mockReaddir.mockResolvedValue(
      ['bad.json'] as unknown as Awaited<ReturnType<typeof readdir>>
    );
    mockReadFile.mockResolvedValue('not valid json {{{');

    const result = await loadSignedApprovalsForRun('run-123', '/fake/repo');
    expect(result).toEqual([]);
  });

  it('should skip files that fail schema validation', async () => {
    mockReaddir.mockResolvedValue(
      ['invalid.json'] as unknown as Awaited<ReturnType<typeof readdir>>
    );
    mockReadFile.mockResolvedValue(JSON.stringify({ foo: 'bar' }));

    const result = await loadSignedApprovalsForRun('run-123', '/fake/repo');
    expect(result).toEqual([]);
  });
});

describe('checkApprovalCoverage', () => {
  it('should report covered when all scopes are approved', () => {
    const approvals = [
      createApprovalFixture({ scopesApproved: ['commit', 'push', 'open_pr'] }),
    ];

    const result = checkApprovalCoverage(approvals, ['commit', 'push']);
    expect(result.covered).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('should report missing scopes', () => {
    const approvals = [
      createApprovalFixture({ scopesApproved: ['commit'] }),
    ];

    const result = checkApprovalCoverage(approvals, ['commit', 'push', 'open_pr']);
    expect(result.covered).toBe(false);
    expect(result.missing).toEqual(['push', 'open_pr']);
  });

  it('should combine scopes from multiple approvals', () => {
    const approvals = [
      createApprovalFixture({ scopesApproved: ['commit'] }),
      createApprovalFixture({ scopesApproved: ['push', 'open_pr'] }),
    ];

    const result = checkApprovalCoverage(approvals, ['commit', 'push', 'open_pr']);
    expect(result.covered).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('should report all scopes missing when no approvals', () => {
    const result = checkApprovalCoverage([], ['commit', 'push']);
    expect(result.covered).toBe(false);
    expect(result.missing).toEqual(['commit', 'push']);
  });
});
