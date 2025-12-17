/**
 * Queue Module Tests
 *
 * Phase 17: Tests for job queue abstraction
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createJobQueue,
  getJobQueue,
  resetJobQueue,
  setJobQueue,
  getInMemoryQueue,
  enqueueJob,
  createWorkflowJob,
  createSignalJob,
  createCandidateJob,
  type QueueJob,
  type JobQueue,
  InMemoryJobQueue,
} from '../index.js';

describe('Queue Module', () => {
  beforeEach(() => {
    resetJobQueue();
  });

  afterEach(() => {
    resetJobQueue();
  });

  describe('createJobQueue', () => {
    it('should create in-memory queue when no project ID', () => {
      const queue = createJobQueue({
        projectId: '',
        topicId: 'test-topic',
      });

      expect(queue.isConnected()).toBe(true);
    });

    it('should create PubSub queue with project ID', () => {
      const queue = createJobQueue({
        projectId: 'test-project',
        topicId: 'test-topic',
      });

      // PubSub queue starts disconnected (lazy connect)
      expect(queue.isConnected()).toBe(false);
    });
  });

  describe('getJobQueue', () => {
    it('should return singleton instance', () => {
      const queue1 = getJobQueue();
      const queue2 = getJobQueue();

      expect(queue1).toBe(queue2);
    });

    it('should create in-memory queue by default', () => {
      const queue = getJobQueue();
      expect(getInMemoryQueue()).not.toBeNull();
    });
  });

  describe('InMemoryJobQueue', () => {
    let queue: JobQueue;

    beforeEach(() => {
      queue = createJobQueue({
        projectId: '',
        topicId: 'test-topic',
      });
    });

    it('should publish job successfully', async () => {
      const job: QueueJob = {
        type: 'test:job',
        tenantId: 'tenant-1',
        payload: { key: 'value' },
      };

      const result = await queue.publish(job);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeTruthy();
      expect(result.messageId).toMatch(/^inmem-/);
    });

    it('should auto-generate job ID if not provided', async () => {
      const job: QueueJob = {
        type: 'test:job',
        tenantId: 'tenant-1',
        payload: {},
      };

      await queue.publish(job);

      // Cast to InMemoryJobQueue to access test methods
      const inmemQueue = queue as unknown as InMemoryJobQueue;

      const jobs = inmemQueue.getQueuedJobs();
      expect(jobs.length).toBe(1);
      expect(jobs[0].id).toMatch(/^job-/);
    });

    it('should preserve job ID if provided', async () => {
      const job: QueueJob = {
        id: 'custom-job-id',
        type: 'test:job',
        tenantId: 'tenant-1',
        payload: {},
      };

      await queue.publish(job);

      const inmemQueue = queue as unknown as InMemoryJobQueue;
      const jobs = inmemQueue.getQueuedJobs();
      expect(jobs[0].id).toBe('custom-job-id');
    });

    it('should publish batch of jobs', async () => {
      const jobs: QueueJob[] = [
        { type: 'job:1', tenantId: 'tenant-1', payload: {} },
        { type: 'job:2', tenantId: 'tenant-1', payload: {} },
        { type: 'job:3', tenantId: 'tenant-1', payload: {} },
      ];

      const results = await queue.publishBatch(jobs);

      expect(results.length).toBe(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should track queue length', async () => {
      const inmemQueue = queue as unknown as InMemoryJobQueue;

      expect(inmemQueue.getQueueLength()).toBe(0);

      await queue.publish({ type: 'test', tenantId: 't1', payload: {} });
      await queue.publish({ type: 'test', tenantId: 't1', payload: {} });

      expect(inmemQueue.getQueueLength()).toBe(2);
    });

    it('should clear queue', async () => {
      const inmemQueue = queue as unknown as InMemoryJobQueue;

      await queue.publish({ type: 'test', tenantId: 't1', payload: {} });
      await queue.publish({ type: 'test', tenantId: 't1', payload: {} });

      expect(inmemQueue.getQueueLength()).toBe(2);

      inmemQueue.clearQueue();

      expect(inmemQueue.getQueueLength()).toBe(0);
    });

    it('should pop job from queue', async () => {
      const inmemQueue = queue as unknown as InMemoryJobQueue;

      await queue.publish({ type: 'first', tenantId: 't1', payload: {} });
      await queue.publish({ type: 'second', tenantId: 't1', payload: {} });

      const first = inmemQueue.popJob();
      expect(first?.type).toBe('first');

      const second = inmemQueue.popJob();
      expect(second?.type).toBe('second');

      const third = inmemQueue.popJob();
      expect(third).toBeUndefined();
    });

    it('should close cleanly', async () => {
      // The in-memory queue is always "connected" in the sense that
      // it can always accept messages. Close just clears state.
      await queue.close();
      // After close, we expect the queue to be empty
      const inmemQueue = queue as unknown as InMemoryJobQueue;
      expect(inmemQueue.getQueueLength()).toBe(0);
    });
  });

  describe('setJobQueue', () => {
    it('should allow setting custom queue', async () => {
      const customQueue = createJobQueue({
        projectId: '',
        topicId: 'custom',
      });

      setJobQueue(customQueue);

      const retrievedQueue = getJobQueue();
      expect(retrievedQueue).toBe(customQueue);
    });
  });

  describe('enqueueJob', () => {
    it('should publish to default queue', async () => {
      const result = await enqueueJob({
        type: 'test:job',
        tenantId: 'tenant-1',
        payload: { test: true },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Job Factories', () => {
    describe('createWorkflowJob', () => {
      it('should create workflow execution job', () => {
        const job = createWorkflowJob(
          'tenant-123',
          'run-456',
          'pr-resolve',
          { pr: { number: 42 } }
        );

        expect(job.type).toBe('workflow:execute');
        expect(job.tenantId).toBe('tenant-123');
        expect(job.runId).toBe('run-456');
        expect(job.payload.workflowType).toBe('pr-resolve');
        expect(job.payload.pr).toEqual({ number: 42 });
        expect(job.metadata?.maxRetries).toBe(3);
        expect(job.metadata?.priority).toBe(5);
      });

      it('should accept custom priority and deadline', () => {
        const deadline = Date.now() + 60000;
        const job = createWorkflowJob(
          'tenant-123',
          'run-456',
          'pr-triage',
          {},
          { priority: 10, deadline }
        );

        expect(job.metadata?.priority).toBe(10);
        expect(job.metadata?.deadline).toBe(deadline);
      });
    });

    describe('createSignalJob', () => {
      it('should create signal processing job', () => {
        const job = createSignalJob(
          'tenant-123',
          'signal-789',
          'pr_opened',
          { pr: { url: 'https://github.com/test/repo/pull/1' } }
        );

        expect(job.type).toBe('signal:process');
        expect(job.tenantId).toBe('tenant-123');
        expect(job.payload.signalId).toBe('signal-789');
        expect(job.payload.signalType).toBe('pr_opened');
        expect(job.payload.pr).toEqual({ url: 'https://github.com/test/repo/pull/1' });
        expect(job.metadata?.priority).toBe(7); // Higher priority for signals
      });
    });

    describe('createCandidateJob', () => {
      it('should create PR candidate generation job', () => {
        const job = createCandidateJob(
          'tenant-123',
          'run-456',
          'workitem-001',
          { issue: { title: 'Add feature X' } }
        );

        expect(job.type).toBe('candidate:generate');
        expect(job.tenantId).toBe('tenant-123');
        expect(job.runId).toBe('run-456');
        expect(job.payload.workItemId).toBe('workitem-001');
        expect(job.payload.issue).toEqual({ title: 'Add feature X' });
      });
    });
  });
});
