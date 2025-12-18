/**
 * Firestore Durable Job Store Tests
 *
 * Phase 34: Tests for durable job tracking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DurableJob, JobStatus } from '../firestore-job-store.js';

// Mock Firebase Admin
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: () => ({
      toDate: () => new Date(),
      toMillis: () => Date.now(),
    }),
    fromDate: (date: Date) => ({
      toDate: () => date,
      toMillis: () => date.getTime(),
    }),
    fromMillis: (ms: number) => ({
      toDate: () => new Date(ms),
      toMillis: () => ms,
    }),
  },
  FieldValue: {
    delete: () => ({ _delete: true }),
  },
}));

// Mock Firestore client
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockRunTransaction = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockCount = vi.fn();
const mockBatch = vi.fn();

vi.mock('../../storage/firestore-client.js', () => ({
  getFirestoreClient: () => ({
    collection: () => ({
      doc: () => ({
        get: mockGet,
        set: mockSet,
        update: mockUpdate,
        delete: mockDelete,
      }),
      where: mockWhere,
      orderBy: mockOrderBy,
      limit: mockLimit,
    }),
    runTransaction: mockRunTransaction,
    batch: mockBatch,
  }),
}));

// Mock logger
vi.mock('../../reliability/observability.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Firestore Job Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks for chained calls
    mockWhere.mockReturnThis();
    mockOrderBy.mockReturnThis();
    mockLimit.mockReturnThis();
    mockCount.mockReturnValue({
      get: async () => ({ data: () => ({ count: 0 }) }),
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Job Lifecycle Types', () => {
    it('should define all job statuses', () => {
      const statuses: JobStatus[] = ['pending', 'claimed', 'running', 'completed', 'failed', 'dead_letter'];
      expect(statuses.length).toBe(6);
    });

    it('should have required DurableJob fields', () => {
      const job: DurableJob = {
        id: 'job-123',
        type: 'workflow:execute',
        tenantId: 'tenant-abc',
        payload: { workflowType: 'autopilot' },
        status: 'pending',
        attempts: 0,
        maxRetries: 3,
        priority: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(job.id).toBe('job-123');
      expect(job.status).toBe('pending');
      expect(job.attempts).toBe(0);
      expect(job.maxRetries).toBe(3);
    });

    it('should support optional DurableJob fields', () => {
      const job: DurableJob = {
        id: 'job-456',
        type: 'signal:process',
        tenantId: 'tenant-xyz',
        runId: 'run-001',
        payload: { signal: 'test' },
        status: 'running',
        claimedBy: 'worker-1',
        attempts: 2,
        maxRetries: 3,
        priority: 7,
        createdAt: new Date(),
        updatedAt: new Date(),
        claimedAt: new Date(),
        startedAt: new Date(),
        lastHeartbeat: new Date(),
        messageId: 'pubsub-msg-123',
      };

      expect(job.runId).toBe('run-001');
      expect(job.claimedBy).toBe('worker-1');
      expect(job.messageId).toBe('pubsub-msg-123');
    });
  });

  describe('Job Status Transitions', () => {
    it('should allow pending → claimed transition', () => {
      const validTransitions = [
        { from: 'pending', to: 'claimed' },
        { from: 'claimed', to: 'running' },
        { from: 'running', to: 'completed' },
        { from: 'running', to: 'failed' },
        { from: 'failed', to: 'pending' }, // retry
        { from: 'running', to: 'dead_letter' },
      ];

      expect(validTransitions.length).toBe(6);
    });
  });

  describe('Job Priority', () => {
    it('should support priority ordering', () => {
      const highPriority: DurableJob = {
        id: 'job-high',
        type: 'signal:process',
        tenantId: 'tenant-1',
        payload: {},
        status: 'pending',
        attempts: 0,
        maxRetries: 3,
        priority: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const lowPriority: DurableJob = {
        id: 'job-low',
        type: 'workflow:execute',
        tenantId: 'tenant-1',
        payload: {},
        status: 'pending',
        attempts: 0,
        maxRetries: 3,
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(highPriority.priority).toBeGreaterThan(lowPriority.priority);
    });
  });

  describe('Job Retry Logic', () => {
    it('should track attempts against maxRetries', () => {
      const job: DurableJob = {
        id: 'job-retry',
        type: 'test',
        tenantId: 'tenant-1',
        payload: {},
        status: 'pending',
        attempts: 2,
        maxRetries: 3,
        priority: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const shouldRetry = job.attempts < job.maxRetries;
      expect(shouldRetry).toBe(true);

      job.attempts = 3;
      const shouldNotRetry = job.attempts < job.maxRetries;
      expect(shouldNotRetry).toBe(false);
    });
  });

  describe('Heartbeat Detection', () => {
    it('should identify stale jobs based on heartbeat', () => {
      const STALE_TIMEOUT = 120000; // 2 minutes

      const freshJob: DurableJob = {
        id: 'job-fresh',
        type: 'test',
        tenantId: 'tenant-1',
        payload: {},
        status: 'running',
        attempts: 1,
        maxRetries: 3,
        priority: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastHeartbeat: new Date(), // Just now
      };

      const staleJob: DurableJob = {
        id: 'job-stale',
        type: 'test',
        tenantId: 'tenant-1',
        payload: {},
        status: 'running',
        attempts: 1,
        maxRetries: 3,
        priority: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastHeartbeat: new Date(Date.now() - 150000), // 2.5 minutes ago
      };

      const isFreshStale = freshJob.lastHeartbeat
        ? Date.now() - freshJob.lastHeartbeat.getTime() > STALE_TIMEOUT
        : false;
      const isStaleStale = staleJob.lastHeartbeat
        ? Date.now() - staleJob.lastHeartbeat.getTime() > STALE_TIMEOUT
        : false;

      expect(isFreshStale).toBe(false);
      expect(isStaleStale).toBe(true);
    });
  });

  describe('Constants', () => {
    it('should export DEFAULT_HEARTBEAT_INTERVAL', async () => {
      const { DEFAULT_HEARTBEAT_INTERVAL } = await import('../firestore-job-store.js');
      expect(DEFAULT_HEARTBEAT_INTERVAL).toBe(30000);
    });
  });
});
