/**
 * Autopilot Handler Tests
 *
 * Phase 36: Unit tests for the autopilot job handler.
 *
 * Tests:
 * - Payload validation
 * - GitHub App token generation
 * - Job state management
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WorkerJob, JobContext, JobResult } from '../../processor.js';

// Mock dependencies before importing handler
vi.mock('@gwi/core', () => ({
  getTenantStore: vi.fn(() => ({
    getTenant: vi.fn(),
  })),
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  getFirestoreJobStore: vi.fn(() => ({
    heartbeat: vi.fn().mockResolvedValue(true),
    completeJob: vi.fn().mockResolvedValue(true),
    failJob: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock('@gwi/engine', () => ({
  AutopilotExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      success: true,
      runId: 'test-run-123',
      tenantId: 'tenant-abc',
      issue: { number: 42, url: 'https://github.com/owner/repo/issues/42' },
      phases: {
        analyze: { completed: true, durationMs: 1000 },
        plan: { completed: true, durationMs: 2000 },
        apply: { completed: true, filesModified: 2, filesCreated: 1, durationMs: 500 },
        test: { completed: true, passed: true, durationMs: 5000 },
        pr: { completed: true, prNumber: 123, prUrl: 'https://github.com/owner/repo/pull/123', durationMs: 300 },
      },
      totalDurationMs: 8800,
    }),
  })),
}));

vi.mock('@octokit/auth-app', () => ({
  createAppAuth: vi.fn(() => vi.fn().mockResolvedValue({ token: 'ghs_mock_token_123' })),
}));

// Import after mocks are set up
import { handleAutopilotExecute, handleAutopilotPlan, type AutopilotJobPayload } from '../autopilot.js';
import { getTenantStore, getFirestoreJobStore } from '@gwi/core';
import { AutopilotExecutor } from '@gwi/engine';

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockContext = (): JobContext => ({
  messageId: 'msg-123',
  lockHolderId: 'worker-1',
  checkpointManager: {
    getCheckpoint: vi.fn(),
    saveCheckpoint: vi.fn(),
    deleteCheckpoint: vi.fn(),
    listCheckpoints: vi.fn(),
  } as any,
  extendLock: vi.fn().mockResolvedValue(true),
  log: vi.fn(),
});

const createValidPayload = (): AutopilotJobPayload => ({
  issue: {
    url: 'https://github.com/owner/repo/issues/42',
    number: 42,
    title: 'Add new feature',
    body: 'Please implement this feature',
    author: 'developer',
    labels: ['gwi:autopilot', 'enhancement'],
  },
  repo: {
    owner: 'owner',
    name: 'repo',
    fullName: 'owner/repo',
    defaultBranch: 'main',
  },
  installationId: 12345678,
  triggerLabel: 'gwi:autopilot',
  dryRun: false,
  skipTests: false,
  draft: true,
});

const createValidJob = (payload: AutopilotJobPayload): WorkerJob => ({
  id: 'job-abc123',
  type: 'autopilot:execute',
  tenantId: 'tenant-abc',
  runId: 'run-xyz789',
  payload: payload as unknown as Record<string, unknown>,
});

// =============================================================================
// Tests
// =============================================================================

describe('Autopilot Handler', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.GITHUB_APP_ID = '123456';
    process.env.GITHUB_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('handleAutopilotExecute', () => {
    describe('Payload Validation', () => {
      it('should reject missing issue in payload', async () => {
        const context = createMockContext();
        const job: WorkerJob = {
          id: 'job-1',
          type: 'autopilot:execute',
          tenantId: 'tenant-1',
          payload: {
            repo: { owner: 'owner', name: 'repo', fullName: 'owner/repo' },
            installationId: 123,
          },
        };

        const result = await handleAutopilotExecute(job, context);

        expect(result.status).toBe('failed');
        expect(result.error).toContain('missing issue');
      });

      it('should reject missing repo in payload', async () => {
        const context = createMockContext();
        const job: WorkerJob = {
          id: 'job-1',
          type: 'autopilot:execute',
          tenantId: 'tenant-1',
          payload: {
            issue: { number: 1, title: 'Test', body: null, url: 'https://github.com/o/r/issues/1', author: 'dev', labels: [] },
            installationId: 123,
          },
        };

        const result = await handleAutopilotExecute(job, context);

        expect(result.status).toBe('failed');
        expect(result.error).toContain('missing');
      });

      it('should reject missing installationId in payload', async () => {
        const context = createMockContext();
        const job: WorkerJob = {
          id: 'job-1',
          type: 'autopilot:execute',
          tenantId: 'tenant-1',
          payload: {
            issue: { number: 1, title: 'Test', body: null, url: 'https://github.com/o/r/issues/1', author: 'dev', labels: [] },
            repo: { owner: 'owner', name: 'repo', fullName: 'owner/repo' },
          },
        };

        const result = await handleAutopilotExecute(job, context);

        expect(result.status).toBe('failed');
        expect(result.error).toContain('missing');
      });
    });

    describe('Tenant Validation', () => {
      it('should reject non-existent tenant', async () => {
        const context = createMockContext();
        const payload = createValidPayload();
        const job = createValidJob(payload);

        // Mock tenant not found
        (getTenantStore as any).mockReturnValue({
          getTenant: vi.fn().mockResolvedValue(null),
        });

        const result = await handleAutopilotExecute(job, context);

        expect(result.status).toBe('failed');
        expect(result.error).toContain('Tenant not found');
      });

      it('should reject inactive tenant', async () => {
        const context = createMockContext();
        const payload = createValidPayload();
        const job = createValidJob(payload);

        // Mock inactive tenant
        (getTenantStore as any).mockReturnValue({
          getTenant: vi.fn().mockResolvedValue({
            id: 'tenant-abc',
            status: 'suspended',
          }),
        });

        const result = await handleAutopilotExecute(job, context);

        expect(result.status).toBe('failed');
        expect(result.error).toContain('not active');
      });
    });

    describe('GitHub App Credentials', () => {
      it('should fail when GITHUB_APP_ID is not set', async () => {
        delete process.env.GITHUB_APP_ID;

        const context = createMockContext();
        const payload = createValidPayload();
        const job = createValidJob(payload);

        // Mock active tenant
        (getTenantStore as any).mockReturnValue({
          getTenant: vi.fn().mockResolvedValue({ id: 'tenant-abc', status: 'active' }),
        });

        const result = await handleAutopilotExecute(job, context);

        expect(result.status).toBe('failed');
        expect(result.error).toContain('GitHub App credentials not configured');
      });

      it('should fail when GITHUB_PRIVATE_KEY is not set', async () => {
        delete process.env.GITHUB_PRIVATE_KEY;

        const context = createMockContext();
        const payload = createValidPayload();
        const job = createValidJob(payload);

        // Mock active tenant
        (getTenantStore as any).mockReturnValue({
          getTenant: vi.fn().mockResolvedValue({ id: 'tenant-abc', status: 'active' }),
        });

        const result = await handleAutopilotExecute(job, context);

        expect(result.status).toBe('failed');
        expect(result.error).toContain('GitHub App credentials not configured');
      });
    });

    describe('Successful Execution', () => {
      it('should execute autopilot successfully', async () => {
        const context = createMockContext();
        const payload = createValidPayload();
        const job = createValidJob(payload);

        // Mock active tenant
        (getTenantStore as any).mockReturnValue({
          getTenant: vi.fn().mockResolvedValue({ id: 'tenant-abc', status: 'active' }),
        });

        const result = await handleAutopilotExecute(job, context);

        expect(result.status).toBe('completed');
        expect(result.output).toBeDefined();
        expect((result.output as any).prNumber).toBe(123);
        expect((result.output as any).prUrl).toBe('https://github.com/owner/repo/pull/123');
      });

      it('should extend lock for long-running execution', async () => {
        const context = createMockContext();
        const payload = createValidPayload();
        const job = createValidJob(payload);

        // Mock active tenant
        (getTenantStore as any).mockReturnValue({
          getTenant: vi.fn().mockResolvedValue({ id: 'tenant-abc', status: 'active' }),
        });

        await handleAutopilotExecute(job, context);

        expect(context.extendLock).toHaveBeenCalledWith(600000);
      });

      it('should send heartbeat when job has ID', async () => {
        const context = createMockContext();
        const payload = createValidPayload();
        const job = createValidJob(payload);

        // Mock active tenant
        (getTenantStore as any).mockReturnValue({
          getTenant: vi.fn().mockResolvedValue({ id: 'tenant-abc', status: 'active' }),
        });

        const mockJobStore = {
          heartbeat: vi.fn().mockResolvedValue(true),
          completeJob: vi.fn().mockResolvedValue(true),
          failJob: vi.fn().mockResolvedValue(true),
        };
        (getFirestoreJobStore as any).mockReturnValue(mockJobStore);

        await handleAutopilotExecute(job, context);

        expect(mockJobStore.heartbeat).toHaveBeenCalledWith('job-abc123', expect.any(String));
      });

      it('should complete job in Firestore on success', async () => {
        const context = createMockContext();
        const payload = createValidPayload();
        const job = createValidJob(payload);

        // Mock active tenant
        (getTenantStore as any).mockReturnValue({
          getTenant: vi.fn().mockResolvedValue({ id: 'tenant-abc', status: 'active' }),
        });

        const mockJobStore = {
          heartbeat: vi.fn().mockResolvedValue(true),
          completeJob: vi.fn().mockResolvedValue(true),
          failJob: vi.fn().mockResolvedValue(true),
        };
        (getFirestoreJobStore as any).mockReturnValue(mockJobStore);

        await handleAutopilotExecute(job, context);

        expect(mockJobStore.completeJob).toHaveBeenCalled();
        expect(mockJobStore.failJob).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      it('should handle executor errors gracefully', async () => {
        const context = createMockContext();
        const payload = createValidPayload();
        const job = createValidJob(payload);

        // Mock active tenant
        (getTenantStore as any).mockReturnValue({
          getTenant: vi.fn().mockResolvedValue({ id: 'tenant-abc', status: 'active' }),
        });

        // Mock executor to throw
        (AutopilotExecutor as any).mockImplementation(() => ({
          execute: vi.fn().mockRejectedValue(new Error('Executor failed')),
        }));

        const mockJobStore = {
          heartbeat: vi.fn().mockResolvedValue(true),
          completeJob: vi.fn().mockResolvedValue(true),
          failJob: vi.fn().mockResolvedValue(true),
        };
        (getFirestoreJobStore as any).mockReturnValue(mockJobStore);

        const result = await handleAutopilotExecute(job, context);

        expect(result.status).toBe('failed');
        expect(result.error).toBe('Executor failed');
        expect(mockJobStore.failJob).toHaveBeenCalled();
      });

      it('should handle failed autopilot result', async () => {
        const context = createMockContext();
        const payload = createValidPayload();
        const job = createValidJob(payload);

        // Mock active tenant
        (getTenantStore as any).mockReturnValue({
          getTenant: vi.fn().mockResolvedValue({ id: 'tenant-abc', status: 'active' }),
        });

        // Mock executor to return failure
        (AutopilotExecutor as any).mockImplementation(() => ({
          execute: vi.fn().mockResolvedValue({
            success: false,
            runId: 'test-run-123',
            tenantId: 'tenant-abc',
            issue: { number: 42, url: 'https://github.com/owner/repo/issues/42' },
            phases: {
              analyze: { completed: true },
              plan: { completed: false, error: 'Plan generation failed' },
              apply: { completed: false, filesModified: 0, filesCreated: 0 },
              test: { completed: false },
              pr: { completed: false },
            },
            error: 'Plan generation failed',
          }),
        }));

        const mockJobStore = {
          heartbeat: vi.fn().mockResolvedValue(true),
          completeJob: vi.fn().mockResolvedValue(true),
          failJob: vi.fn().mockResolvedValue(true),
        };
        (getFirestoreJobStore as any).mockReturnValue(mockJobStore);

        const result = await handleAutopilotExecute(job, context);

        expect(result.status).toBe('failed');
        expect(result.error).toBe('Plan generation failed');
        expect(mockJobStore.failJob).toHaveBeenCalled();
      });
    });
  });

  describe('handleAutopilotPlan', () => {
    it('should force dry run mode', async () => {
      const context = createMockContext();
      const payload = createValidPayload();
      payload.dryRun = false; // Explicitly set to false
      const job = createValidJob(payload);

      // Mock active tenant
      (getTenantStore as any).mockReturnValue({
        getTenant: vi.fn().mockResolvedValue({ id: 'tenant-abc', status: 'active' }),
      });

      await handleAutopilotPlan(job, context);

      // Verify dryRun was set to true in the payload
      expect(job.payload.dryRun).toBe(true);
    });

    it('should reject invalid payload', async () => {
      const context = createMockContext();
      const job: WorkerJob = {
        id: 'job-1',
        type: 'autopilot:plan',
        tenantId: 'tenant-1',
        payload: {
          // Missing required fields
        },
      };

      const result = await handleAutopilotPlan(job, context);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Invalid autopilot payload');
    });
  });
});
