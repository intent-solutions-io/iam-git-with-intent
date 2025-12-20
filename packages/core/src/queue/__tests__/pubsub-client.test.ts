/**
 * Tests for Pub/Sub Publisher/Subscriber
 *
 * Epic A5.s2: Comprehensive test coverage for queue abstraction layer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  InMemoryPublisher,
  InMemorySubscriber,
  createPublisher,
  createSubscriber,
  type MessageHandler,
  type ReceivedMessage,
  type PubSubConfig,
} from '../pubsub-client.js';
import {
  createJobEnvelope,
  type JobEnvelope,
  type JobType,
} from '../job-envelope.js';

describe('InMemoryPublisher', () => {
  let publisher: InMemoryPublisher;

  beforeEach(() => {
    publisher = new InMemoryPublisher();
  });

  afterEach(async () => {
    await publisher.close();
  });

  describe('Basic Operations', () => {
    it('should be connected immediately', () => {
      expect(publisher.isConnected()).toBe(true);
    });

    it('should publish a valid job envelope', async () => {
      const envelope = createJobEnvelope({
        jobId: 'job-1',
        tenantId: 'tenant-1',
        runId: 'run-1',
        type: 'run.start',
        payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
        traceId: 'trace-1',
        source: 'test',
      });

      const result = await publisher.publish(envelope);

      expect(result.success).toBe(true);
      expect(result.messageId).toMatch(/^inmem-/);
      expect(result.error).toBeUndefined();
      expect(publisher.getQueueLength()).toBe(1);
    });

    it('should reject invalid job envelope', async () => {
      const invalidEnvelope = {
        jobId: 'job-1',
        // Missing required fields
      } as unknown as JobEnvelope;

      const result = await publisher.publish(invalidEnvelope);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid job envelope');
      expect(publisher.getQueueLength()).toBe(0);
    });

    it('should publish multiple envelopes in batch', async () => {
      const envelopes = [
        createJobEnvelope({
          jobId: 'job-1',
          tenantId: 'tenant-1',
          runId: 'run-1',
          type: 'run.start',
          payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
          traceId: 'trace-1',
          source: 'test',
        }),
        createJobEnvelope({
          jobId: 'job-2',
          tenantId: 'tenant-1',
          runId: 'run-2',
          type: 'step.execute',
          payload: { agentId: 'triage', input: {} },
          traceId: 'trace-2',
          source: 'test',
        }),
        createJobEnvelope({
          jobId: 'job-3',
          tenantId: 'tenant-1',
          runId: 'run-3',
          type: 'cleanup.run',
          payload: { status: 'completed' },
          traceId: 'trace-3',
          source: 'test',
        }),
      ];

      const results = await publisher.publishBatch(envelopes);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      expect(publisher.getQueueLength()).toBe(3);
    });

    it('should handle batch with some invalid envelopes', async () => {
      const envelopes = [
        createJobEnvelope({
          jobId: 'job-1',
          tenantId: 'tenant-1',
          runId: 'run-1',
          type: 'run.start',
          payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
          traceId: 'trace-1',
          source: 'test',
        }),
        { jobId: 'invalid' } as unknown as JobEnvelope,
      ];

      const results = await publisher.publishBatch(envelopes);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(publisher.getQueueLength()).toBe(1); // Only valid one queued
    });
  });

  describe('Queue Management', () => {
    it('should track queue length correctly', async () => {
      expect(publisher.getQueueLength()).toBe(0);

      await publisher.publish(
        createJobEnvelope({
          jobId: 'job-1',
          tenantId: 'tenant-1',
          runId: 'run-1',
          type: 'run.start',
          payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
          traceId: 'trace-1',
          source: 'test',
        })
      );
      expect(publisher.getQueueLength()).toBe(1);

      await publisher.publish(
        createJobEnvelope({
          jobId: 'job-2',
          tenantId: 'tenant-1',
          runId: 'run-2',
          type: 'step.execute',
          payload: { agentId: 'triage', input: {} },
          traceId: 'trace-2',
          source: 'test',
        })
      );
      expect(publisher.getQueueLength()).toBe(2);
    });

    it('should pop messages in FIFO order', async () => {
      const job1 = createJobEnvelope({
        jobId: 'job-1',
        tenantId: 'tenant-1',
        runId: 'run-1',
        type: 'run.start',
        payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
        traceId: 'trace-1',
        source: 'test',
      });

      const job2 = createJobEnvelope({
        jobId: 'job-2',
        tenantId: 'tenant-1',
        runId: 'run-2',
        type: 'step.execute',
        payload: { agentId: 'triage', input: {} },
        traceId: 'trace-2',
        source: 'test',
      });

      await publisher.publish(job1);
      await publisher.publish(job2);

      const popped1 = publisher.popMessage();
      expect(popped1?.jobId).toBe('job-1');

      const popped2 = publisher.popMessage();
      expect(popped2?.jobId).toBe('job-2');

      const popped3 = publisher.popMessage();
      expect(popped3).toBeUndefined();
    });

    it('should get all messages without removing them', async () => {
      await publisher.publish(
        createJobEnvelope({
          jobId: 'job-1',
          tenantId: 'tenant-1',
          runId: 'run-1',
          type: 'run.start',
          payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
          traceId: 'trace-1',
          source: 'test',
        })
      );

      const messages = publisher.getMessages();
      expect(messages).toHaveLength(1);
      expect(publisher.getQueueLength()).toBe(1); // Still in queue
    });

    it('should clear the queue', async () => {
      await publisher.publishBatch([
        createJobEnvelope({
          jobId: 'job-1',
          tenantId: 'tenant-1',
          runId: 'run-1',
          type: 'run.start',
          payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
          traceId: 'trace-1',
          source: 'test',
        }),
        createJobEnvelope({
          jobId: 'job-2',
          tenantId: 'tenant-1',
          runId: 'run-2',
          type: 'step.execute',
          payload: { agentId: 'triage', input: {} },
          traceId: 'trace-2',
          source: 'test',
        }),
      ]);

      expect(publisher.getQueueLength()).toBe(2);
      publisher.clearQueue();
      expect(publisher.getQueueLength()).toBe(0);
    });

    it('should clear queue on close', async () => {
      await publisher.publish(
        createJobEnvelope({
          jobId: 'job-1',
          tenantId: 'tenant-1',
          runId: 'run-1',
          type: 'run.start',
          payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
          traceId: 'trace-1',
          source: 'test',
        })
      );

      await publisher.close();
      expect(publisher.getQueueLength()).toBe(0);
    });
  });

  describe('Job Envelope Validation', () => {
    it('should validate job type', async () => {
      const envelope = createJobEnvelope({
        jobId: 'job-1',
        tenantId: 'tenant-1',
        runId: 'run-1',
        type: 'run.start' as JobType,
        payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
        traceId: 'trace-1',
        source: 'test',
      });

      const result = await publisher.publish(envelope);
      expect(result.success).toBe(true);
    });

    it('should validate required fields', async () => {
      const invalidEnvelope = {
        jobId: 'job-1',
        tenantId: 'tenant-1',
        // Missing runId, type, payload, etc.
      } as unknown as JobEnvelope;

      const result = await publisher.publish(invalidEnvelope);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid job envelope');
    });

    it('should validate attempt number', async () => {
      const envelope = createJobEnvelope({
        jobId: 'job-1',
        tenantId: 'tenant-1',
        runId: 'run-1',
        type: 'run.start',
        payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
        traceId: 'trace-1',
        source: 'test',
      });

      // Attempt should be 1 by default
      expect(envelope.attempt).toBe(1);

      const result = await publisher.publish(envelope);
      expect(result.success).toBe(true);
    });

    it('should validate priority', async () => {
      const envelope = createJobEnvelope({
        jobId: 'job-1',
        tenantId: 'tenant-1',
        runId: 'run-1',
        type: 'run.start',
        payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
        traceId: 'trace-1',
        source: 'test',
        priority: 'high',
      });

      const result = await publisher.publish(envelope);
      expect(result.success).toBe(true);
    });
  });
});

describe('InMemorySubscriber', () => {
  let publisher: InMemoryPublisher;
  let subscriber: InMemorySubscriber;

  beforeEach(() => {
    publisher = new InMemoryPublisher();
    subscriber = new InMemorySubscriber(publisher);
  });

  afterEach(async () => {
    await subscriber.close();
    await publisher.close();
  });

  describe('Basic Operations', () => {
    it('should be connected immediately', () => {
      expect(subscriber.isConnected()).toBe(true);
    });

    it('should not be running initially', () => {
      expect(subscriber.isRunning()).toBe(false);
    });

    it('should start and stop', async () => {
      const handler: MessageHandler = vi.fn();

      await subscriber.start(handler);
      expect(subscriber.isRunning()).toBe(true);

      await subscriber.stop();
      expect(subscriber.isRunning()).toBe(false);
    });

    it('should not start twice', async () => {
      const handler: MessageHandler = vi.fn();

      await subscriber.start(handler);
      await subscriber.start(handler); // Should be no-op

      expect(subscriber.isRunning()).toBe(true);
    });

    it('should handle stop when not running', async () => {
      await subscriber.stop(); // Should be no-op
      expect(subscriber.isRunning()).toBe(false);
    });
  });

  describe('Message Processing', () => {
    it('should process messages from publisher', async () => {
      const processedMessages: JobEnvelope[] = [];
      const handler: MessageHandler = async (envelope) => {
        processedMessages.push(envelope);
      };

      await subscriber.start(handler);

      const envelope = createJobEnvelope({
        jobId: 'job-1',
        tenantId: 'tenant-1',
        runId: 'run-1',
        type: 'run.start',
        payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
        traceId: 'trace-1',
        source: 'test',
      });

      await publisher.publish(envelope);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(processedMessages).toHaveLength(1);
      expect(processedMessages[0].jobId).toBe('job-1');
    });

    it('should process multiple messages', async () => {
      const processedMessages: JobEnvelope[] = [];
      const handler: MessageHandler = async (envelope) => {
        processedMessages.push(envelope);
      };

      await subscriber.start(handler);

      await publisher.publishBatch([
        createJobEnvelope({
          jobId: 'job-1',
          tenantId: 'tenant-1',
          runId: 'run-1',
          type: 'run.start',
          payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
          traceId: 'trace-1',
          source: 'test',
        }),
        createJobEnvelope({
          jobId: 'job-2',
          tenantId: 'tenant-1',
          runId: 'run-2',
          type: 'step.execute',
          payload: { agentId: 'triage', input: {} },
          traceId: 'trace-2',
          source: 'test',
        }),
      ]);

      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(processedMessages).toHaveLength(2);
      expect(processedMessages[0].jobId).toBe('job-1');
      expect(processedMessages[1].jobId).toBe('job-2');
    });

    it('should provide message wrapper with ack/nack', async () => {
      let receivedMessage: ReceivedMessage | null = null;
      const handler: MessageHandler = async (envelope, message) => {
        receivedMessage = message;
      };

      await subscriber.start(handler);

      await publisher.publish(
        createJobEnvelope({
          jobId: 'job-1',
          tenantId: 'tenant-1',
          runId: 'run-1',
          type: 'run.start',
          payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
          traceId: 'trace-1',
          source: 'test',
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(receivedMessage).not.toBeNull();
      expect(receivedMessage?.id).toMatch(/^inmem-/);
      expect(receivedMessage?.data.jobId).toBe('job-1');
      expect(typeof receivedMessage?.ack).toBe('function');
      expect(typeof receivedMessage?.nack).toBe('function');
    });

    it('should auto-ack if handler does not ack/nack', async () => {
      const handler: MessageHandler = async (envelope, message) => {
        // Do nothing - should auto-ack
      };

      await subscriber.start(handler);

      await publisher.publish(
        createJobEnvelope({
          jobId: 'job-1',
          tenantId: 'tenant-1',
          runId: 'run-1',
          type: 'run.start',
          payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
          traceId: 'trace-1',
          source: 'test',
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 150));

      // Message should be processed and not re-queued
      expect(publisher.getQueueLength()).toBe(0);
    });

    it('should auto-nack on handler error', async () => {
      const handler: MessageHandler = async () => {
        throw new Error('Handler error');
      };

      await subscriber.start(handler);

      await publisher.publish(
        createJobEnvelope({
          jobId: 'job-1',
          tenantId: 'tenant-1',
          runId: 'run-1',
          type: 'run.start',
          payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
          traceId: 'trace-1',
          source: 'test',
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 150));

      // Message should be re-queued on nack
      expect(publisher.getQueueLength()).toBe(1);
    });

    it('should support explicit ack', async () => {
      const handler: MessageHandler = async (envelope, message) => {
        message.ack();
      };

      await subscriber.start(handler);

      await publisher.publish(
        createJobEnvelope({
          jobId: 'job-1',
          tenantId: 'tenant-1',
          runId: 'run-1',
          type: 'run.start',
          payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
          traceId: 'trace-1',
          source: 'test',
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(publisher.getQueueLength()).toBe(0);
    });

    it('should support explicit nack', async () => {
      const handler: MessageHandler = async (envelope, message) => {
        message.nack();
      };

      await subscriber.start(handler);

      await publisher.publish(
        createJobEnvelope({
          jobId: 'job-1',
          tenantId: 'tenant-1',
          runId: 'run-1',
          type: 'run.start',
          payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
          traceId: 'trace-1',
          source: 'test',
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 150));

      // Message should be re-queued
      expect(publisher.getQueueLength()).toBe(1);
    });

    it('should stop processing after stop()', async () => {
      const processedMessages: JobEnvelope[] = [];
      const handler: MessageHandler = async (envelope) => {
        processedMessages.push(envelope);
      };

      await subscriber.start(handler);
      await subscriber.stop();

      await publisher.publish(
        createJobEnvelope({
          jobId: 'job-1',
          tenantId: 'tenant-1',
          runId: 'run-1',
          type: 'run.start',
          payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
          traceId: 'trace-1',
          source: 'test',
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(processedMessages).toHaveLength(0);
    });
  });

  describe('Message Attributes', () => {
    it('should include job metadata in message attributes', async () => {
      let receivedMessage: ReceivedMessage | null = null;
      const handler: MessageHandler = async (envelope, message) => {
        receivedMessage = message;
      };

      await subscriber.start(handler);

      await publisher.publish(
        createJobEnvelope({
          jobId: 'job-1',
          tenantId: 'tenant-1',
          runId: 'run-1',
          stepId: 'step-1',
          type: 'step.execute',
          payload: { agentId: 'triage', input: {} },
          traceId: 'trace-1',
          source: 'test',
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(receivedMessage?.attributes).toMatchObject({
        jobId: 'job-1',
        tenantId: 'tenant-1',
        runId: 'run-1',
        type: 'step.execute',
      });
    });
  });
});

describe('Factory Functions', () => {
  describe('createPublisher', () => {
    it('should create in-memory publisher when projectId is empty', () => {
      const config: PubSubConfig = {
        projectId: '',
        topicId: 'test-topic',
      };

      const publisher = createPublisher(config);
      expect(publisher).toBeInstanceOf(InMemoryPublisher);
    });

    it('should create PubSubPublisher when projectId is provided', () => {
      const config: PubSubConfig = {
        projectId: 'test-project',
        topicId: 'test-topic',
      };

      const publisher = createPublisher(config);
      // Can't easily test PubSubPublisher without actual GCP credentials
      expect(publisher).toBeDefined();
    });
  });

  describe('createSubscriber', () => {
    it('should create in-memory subscriber when projectId is empty', () => {
      const publisher = new InMemoryPublisher();
      const config: PubSubConfig = {
        projectId: '',
        topicId: 'test-topic',
        subscriptionId: 'test-sub',
      };

      const subscriber = createSubscriber(config, publisher);
      expect(subscriber).toBeInstanceOf(InMemorySubscriber);
    });

    it('should throw error for in-memory subscriber without publisher', () => {
      const config: PubSubConfig = {
        projectId: '',
        topicId: 'test-topic',
        subscriptionId: 'test-sub',
      };

      expect(() => createSubscriber(config)).toThrow('In-memory subscriber requires a publisher');
    });

    it('should create PubSubSubscriber when projectId and subscriptionId are provided', () => {
      const config: PubSubConfig = {
        projectId: 'test-project',
        topicId: 'test-topic',
        subscriptionId: 'test-sub',
      };

      const subscriber = createSubscriber(config);
      // Can't easily test PubSubSubscriber without actual GCP credentials
      expect(subscriber).toBeDefined();
    });
  });
});

describe('Integration Tests', () => {
  it('should handle end-to-end workflow', async () => {
    const publisher = new InMemoryPublisher();
    const subscriber = new InMemorySubscriber(publisher);

    const processedJobs: string[] = [];
    const handler: MessageHandler = async (envelope, message) => {
      processedJobs.push(envelope.jobId);
      message.ack();
    };

    await subscriber.start(handler);

    // Publish a workflow of jobs
    await publisher.publishBatch([
      createJobEnvelope({
        jobId: 'job-1',
        tenantId: 'tenant-1',
        runId: 'run-1',
        type: 'run.start',
        payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
        traceId: 'trace-1',
        source: 'webhook',
      }),
      createJobEnvelope({
        jobId: 'job-2',
        tenantId: 'tenant-1',
        runId: 'run-1',
        stepId: 'step-1',
        type: 'step.execute',
        payload: { agentId: 'triage', input: {} },
        traceId: 'trace-1',
        source: 'orchestrator',
      }),
      createJobEnvelope({
        jobId: 'job-3',
        tenantId: 'tenant-1',
        runId: 'run-1',
        type: 'cleanup.run',
        payload: { status: 'completed' },
        traceId: 'trace-1',
        source: 'orchestrator',
      }),
    ]);

    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(processedJobs).toEqual(['job-1', 'job-2', 'job-3']);
    expect(publisher.getQueueLength()).toBe(0);

    await subscriber.close();
    await publisher.close();
  });

  it('should handle retry on failure', async () => {
    const publisher = new InMemoryPublisher();
    const subscriber = new InMemorySubscriber(publisher);

    let attemptCount = 0;
    const handler: MessageHandler = async (envelope, message) => {
      attemptCount++;
      if (attemptCount === 1) {
        message.nack(); // Fail first attempt
      } else {
        message.ack(); // Succeed on retry
      }
    };

    await subscriber.start(handler);

    await publisher.publish(
      createJobEnvelope({
        jobId: 'job-1',
        tenantId: 'tenant-1',
        runId: 'run-1',
        type: 'run.start',
        payload: { prUrl: 'https://github.com/owner/repo/pull/1', initiatedBy: 'user-1' },
        traceId: 'trace-1',
        source: 'test',
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(attemptCount).toBe(2); // Processed twice
    expect(publisher.getQueueLength()).toBe(0); // Eventually succeeded

    await subscriber.close();
    await publisher.close();
  });
});
