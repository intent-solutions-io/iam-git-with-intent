/**
 * Job Envelope Schema Tests
 *
 * Tests for job envelope validation, type discrimination, and helper functions.
 */

import { describe, it, expect } from 'vitest';
import {
  JobEnvelope,
  JobPriority,
  JobType,
  TypedJobEnvelope,
  RunStartJob,
  RunResumeJob,
  StepExecuteJob,
  StepRetryJob,
  CleanupRunJob,
  NotificationSendJob,
  createJobEnvelope,
  parseJobEnvelope,
  validateJobEnvelope,
  parseTypedJobEnvelope,
  validateTypedJobEnvelope,
  createPreviousAttempt,
  addRetryAttempt,
  isRetryExceeded,
  isDeadlineExpired,
  shouldDelay,
  getRemainingDelay,
} from '../job-envelope.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const baseJobEnvelope = {
  jobId: 'job-123',
  tenantId: 'tenant-456',
  runId: 'run-789',
  attempt: 1,
  maxRetries: 3,
  traceId: 'trace-abc',
  priority: 'normal' as const,
  type: 'run.start' as const,
  payload: {},
  createdAt: '2025-01-01T00:00:00Z',
  source: 'api',
};

describe('JobEnvelope Schema', () => {
  describe('Basic Validation', () => {
    it('should validate a minimal valid job envelope', () => {
      const result = JobEnvelope.safeParse(baseJobEnvelope);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.jobId).toBe('job-123');
        expect(result.data.attempt).toBe(1);
      }
    });

    it('should validate a complete job envelope with all optional fields', () => {
      const completeJob = {
        ...baseJobEnvelope,
        stepId: 'step-001',
        spanId: 'span-def',
        orderingKey: 'run-789',
        deadline: '2025-01-02T00:00:00Z',
        delayUntil: '2025-01-01T01:00:00Z',
        idempotencyKey: 'idempotent-key',
        previousAttempts: [
          {
            attempt: 1,
            error: 'Network timeout',
            timestamp: '2025-01-01T00:00:00Z',
          },
        ],
      };

      const result = JobEnvelope.safeParse(completeJob);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stepId).toBe('step-001');
        expect(result.data.previousAttempts).toHaveLength(1);
      }
    });

    it('should reject job envelope with missing required fields', () => {
      const invalidJob = {
        jobId: 'job-123',
        // Missing tenantId, runId, attempt, etc.
      };

      const result = JobEnvelope.safeParse(invalidJob);
      expect(result.success).toBe(false);
    });

    it('should reject job envelope with invalid attempt (< 1)', () => {
      const invalidJob = {
        ...baseJobEnvelope,
        attempt: 0,
      };

      const result = JobEnvelope.safeParse(invalidJob);
      expect(result.success).toBe(false);
    });

    it('should reject job envelope with invalid maxRetries (< 0)', () => {
      const invalidJob = {
        ...baseJobEnvelope,
        maxRetries: -1,
      };

      const result = JobEnvelope.safeParse(invalidJob);
      expect(result.success).toBe(false);
    });

    it('should validate all job priorities', () => {
      const priorities: JobPriority[] = ['high', 'normal', 'low'];

      priorities.forEach((priority) => {
        const job = { ...baseJobEnvelope, priority };
        const result = JobEnvelope.safeParse(job);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid job priority', () => {
      const invalidJob = {
        ...baseJobEnvelope,
        priority: 'critical',
      };

      const result = JobEnvelope.safeParse(invalidJob);
      expect(result.success).toBe(false);
    });

    it('should validate all job types', () => {
      const types: JobType[] = [
        'run.start',
        'run.resume',
        'step.execute',
        'step.retry',
        'cleanup.run',
        'notification.send',
      ];

      types.forEach((type) => {
        const job = { ...baseJobEnvelope, type };
        const result = JobEnvelope.safeParse(job);
        expect(result.success).toBe(true);
      });
    });

    it('should validate ISO datetime strings', () => {
      const job = {
        ...baseJobEnvelope,
        createdAt: '2025-01-01T00:00:00Z',
        deadline: '2025-01-02T00:00:00Z',
        delayUntil: '2025-01-01T01:00:00.123Z',
      };

      const result = JobEnvelope.safeParse(job);
      expect(result.success).toBe(true);
    });

    it('should reject invalid datetime strings', () => {
      const invalidJob = {
        ...baseJobEnvelope,
        createdAt: 'not-a-date',
      };

      const result = JobEnvelope.safeParse(invalidJob);
      expect(result.success).toBe(false);
    });
  });

  describe('Typed Job Envelopes', () => {
    it('should validate RunStartJob with correct payload', () => {
      const job = {
        ...baseJobEnvelope,
        type: 'run.start' as const,
        payload: {
          prUrl: 'https://github.com/owner/repo/pull/123',
          initiatedBy: 'user-456',
          config: { debug: true },
        },
      };

      const result = RunStartJob.safeParse(job);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.payload.prUrl).toContain('/pull/');
      }
    });

    it('should validate RunResumeJob with correct payload', () => {
      const job = {
        ...baseJobEnvelope,
        type: 'run.resume' as const,
        payload: {
          fromStepId: 'step-002',
          reason: 'Manual resume after fix',
        },
      };

      const result = RunResumeJob.safeParse(job);
      expect(result.success).toBe(true);
    });

    it('should validate StepExecuteJob with correct payload', () => {
      const job = {
        ...baseJobEnvelope,
        type: 'step.execute' as const,
        payload: {
          agentId: 'coder',
          input: { files: ['src/index.ts'] },
          dependencies: ['step-001'],
        },
      };

      const result = StepExecuteJob.safeParse(job);
      expect(result.success).toBe(true);
    });

    it('should validate StepRetryJob with correct payload', () => {
      const job = {
        ...baseJobEnvelope,
        type: 'step.retry' as const,
        payload: {
          originalError: 'API rate limit exceeded',
          retryStrategy: 'exponential' as const,
        },
      };

      const result = StepRetryJob.safeParse(job);
      expect(result.success).toBe(true);
    });

    it('should validate CleanupRunJob with correct payload', () => {
      const job = {
        ...baseJobEnvelope,
        type: 'cleanup.run' as const,
        payload: {
          status: 'completed' as const,
          artifacts: ['artifact-1', 'artifact-2'],
          retainLogs: true,
        },
      };

      const result = CleanupRunJob.safeParse(job);
      expect(result.success).toBe(true);
    });

    it('should validate NotificationSendJob with correct payload', () => {
      const job = {
        ...baseJobEnvelope,
        type: 'notification.send' as const,
        payload: {
          recipientId: 'user-789',
          channel: 'email' as const,
          template: 'run-complete',
          data: { runId: 'run-789', status: 'success' },
        },
      };

      const result = NotificationSendJob.safeParse(job);
      expect(result.success).toBe(true);
    });

    it('should reject typed job with mismatched type and payload', () => {
      const job = {
        ...baseJobEnvelope,
        type: 'run.start' as const,
        payload: {
          // Wrong payload - should be RunStartPayload
          status: 'completed',
        },
      };

      const result = RunStartJob.safeParse(job);
      expect(result.success).toBe(false);
    });
  });

  describe('Discriminated Union', () => {
    it('should parse typed job envelope and discriminate by type', () => {
      const runStartJob = {
        ...baseJobEnvelope,
        type: 'run.start' as const,
        payload: {
          prUrl: 'https://github.com/owner/repo/pull/123',
          initiatedBy: 'user-456',
        },
      };

      const result = TypedJobEnvelope.safeParse(runStartJob);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('run.start');
        // Type narrowing works
        if (result.data.type === 'run.start') {
          expect(result.data.payload.prUrl).toContain('/pull/');
        }
      }
    });

    it('should validate multiple job types through discriminated union', () => {
      const jobs = [
        {
          ...baseJobEnvelope,
          type: 'run.start' as const,
          payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
        },
        {
          ...baseJobEnvelope,
          type: 'step.execute' as const,
          payload: { agentId: 'coder', input: {} },
        },
        {
          ...baseJobEnvelope,
          type: 'cleanup.run' as const,
          payload: { status: 'completed' as const },
        },
      ];

      jobs.forEach((job) => {
        const result = TypedJobEnvelope.safeParse(job);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Helper Functions', () => {
    describe('createJobEnvelope', () => {
      it('should create a job envelope with defaults', () => {
        const envelope = createJobEnvelope({
          jobId: 'job-001',
          tenantId: 'tenant-001',
          runId: 'run-001',
          type: 'run.start',
          payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
          traceId: 'trace-001',
          source: 'webhook',
        });

        expect(envelope.attempt).toBe(1);
        expect(envelope.maxRetries).toBe(3);
        expect(envelope.priority).toBe('normal');
        expect(envelope.createdAt).toBeTruthy();
      });

      it('should create a job envelope with custom options', () => {
        const envelope = createJobEnvelope({
          jobId: 'job-002',
          tenantId: 'tenant-001',
          runId: 'run-001',
          stepId: 'step-001',
          type: 'step.execute',
          payload: { agentId: 'coder', input: {} },
          traceId: 'trace-002',
          spanId: 'span-002',
          source: 'api',
          priority: 'high',
          orderingKey: 'run-001',
          deadline: '2025-01-02T00:00:00Z',
          idempotencyKey: 'idem-key',
        });

        expect(envelope.priority).toBe('high');
        expect(envelope.stepId).toBe('step-001');
        expect(envelope.spanId).toBe('span-002');
        expect(envelope.orderingKey).toBe('run-001');
        expect(envelope.deadline).toBe('2025-01-02T00:00:00Z');
        expect(envelope.idempotencyKey).toBe('idem-key');
      });
    });

    describe('parseJobEnvelope', () => {
      it('should parse valid job envelope', () => {
        const envelope = parseJobEnvelope(baseJobEnvelope);
        expect(envelope.jobId).toBe('job-123');
      });

      it('should throw on invalid job envelope', () => {
        expect(() => parseJobEnvelope({ invalid: 'data' })).toThrow();
      });
    });

    describe('validateJobEnvelope', () => {
      it('should return success for valid envelope', () => {
        const result = validateJobEnvelope(baseJobEnvelope);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.jobId).toBe('job-123');
        }
      });

      it('should return error for invalid envelope', () => {
        const result = validateJobEnvelope({ invalid: 'data' });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });
    });

    describe('parseTypedJobEnvelope', () => {
      it('should parse valid typed job envelope', () => {
        const job = {
          ...baseJobEnvelope,
          type: 'run.start' as const,
          payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
        };

        const envelope = parseTypedJobEnvelope(job);
        expect(envelope.type).toBe('run.start');
      });

      it('should throw on invalid typed envelope', () => {
        const job = {
          ...baseJobEnvelope,
          type: 'run.start' as const,
          payload: { invalid: 'payload' },
        };

        expect(() => parseTypedJobEnvelope(job)).toThrow();
      });
    });

    describe('validateTypedJobEnvelope', () => {
      it('should return success for valid typed envelope', () => {
        const job = {
          ...baseJobEnvelope,
          type: 'run.start' as const,
          payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
        };

        const result = validateTypedJobEnvelope(job);
        expect(result.success).toBe(true);
      });

      it('should return error for invalid typed envelope', () => {
        const job = {
          ...baseJobEnvelope,
          type: 'run.start' as const,
          payload: { invalid: 'payload' },
        };

        const result = validateTypedJobEnvelope(job);
        expect(result.success).toBe(false);
      });
    });

    describe('Retry Helpers', () => {
      it('should create previous attempt record', () => {
        const attempt = createPreviousAttempt(1, 'Network error');
        expect(attempt.attempt).toBe(1);
        expect(attempt.error).toBe('Network error');
        expect(attempt.timestamp).toBeTruthy();
      });

      it('should add retry attempt to envelope', () => {
        const envelope = createJobEnvelope({
          jobId: 'job-001',
          tenantId: 'tenant-001',
          runId: 'run-001',
          type: 'run.start',
          payload: {},
          traceId: 'trace-001',
          source: 'api',
        });

        const retried = addRetryAttempt(envelope, 'Timeout');
        expect(retried.attempt).toBe(2);
        expect(retried.previousAttempts).toHaveLength(1);
        expect(retried.previousAttempts![0].error).toBe('Timeout');
      });

      it('should track multiple retry attempts', () => {
        let envelope = createJobEnvelope({
          jobId: 'job-001',
          tenantId: 'tenant-001',
          runId: 'run-001',
          type: 'run.start',
          payload: {},
          traceId: 'trace-001',
          source: 'api',
        });

        envelope = addRetryAttempt(envelope, 'Error 1');
        envelope = addRetryAttempt(envelope, 'Error 2');
        envelope = addRetryAttempt(envelope, 'Error 3');

        expect(envelope.attempt).toBe(4);
        expect(envelope.previousAttempts).toHaveLength(3);
      });

      it('should check if retry is exceeded', () => {
        const envelope1 = { ...baseJobEnvelope, attempt: 3, maxRetries: 3 };
        expect(isRetryExceeded(envelope1)).toBe(false);

        const envelope2 = { ...baseJobEnvelope, attempt: 4, maxRetries: 3 };
        expect(isRetryExceeded(envelope2)).toBe(true);

        const envelope3 = { ...baseJobEnvelope, attempt: 5, maxRetries: 3 };
        expect(isRetryExceeded(envelope3)).toBe(true);
      });
    });

    describe('Deadline Helpers', () => {
      it('should detect expired deadline', () => {
        const pastDeadline = new Date(Date.now() - 1000).toISOString();
        const envelope = { ...baseJobEnvelope, deadline: pastDeadline };
        expect(isDeadlineExpired(envelope)).toBe(true);
      });

      it('should detect non-expired deadline', () => {
        const futureDeadline = new Date(Date.now() + 10000).toISOString();
        const envelope = { ...baseJobEnvelope, deadline: futureDeadline };
        expect(isDeadlineExpired(envelope)).toBe(false);
      });

      it('should return false when no deadline set', () => {
        expect(isDeadlineExpired(baseJobEnvelope)).toBe(false);
      });
    });

    describe('Delay Helpers', () => {
      it('should detect job that should be delayed', () => {
        const futureTime = new Date(Date.now() + 10000).toISOString();
        const envelope = { ...baseJobEnvelope, delayUntil: futureTime };
        expect(shouldDelay(envelope)).toBe(true);
      });

      it('should detect job that should not be delayed', () => {
        const pastTime = new Date(Date.now() - 1000).toISOString();
        const envelope = { ...baseJobEnvelope, delayUntil: pastTime };
        expect(shouldDelay(envelope)).toBe(false);
      });

      it('should return false when no delay set', () => {
        expect(shouldDelay(baseJobEnvelope)).toBe(false);
      });

      it('should calculate remaining delay', () => {
        const futureTime = new Date(Date.now() + 5000).toISOString();
        const envelope = { ...baseJobEnvelope, delayUntil: futureTime };
        const remaining = getRemainingDelay(envelope);
        expect(remaining).toBeGreaterThan(0);
        expect(remaining).toBeLessThanOrEqual(5000);
      });

      it('should return 0 for expired delay', () => {
        const pastTime = new Date(Date.now() - 1000).toISOString();
        const envelope = { ...baseJobEnvelope, delayUntil: pastTime };
        expect(getRemainingDelay(envelope)).toBe(0);
      });

      it('should return 0 when no delay set', () => {
        expect(getRemainingDelay(baseJobEnvelope)).toBe(0);
      });
    });
  });
});
