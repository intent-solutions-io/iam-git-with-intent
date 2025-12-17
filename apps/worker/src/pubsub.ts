/**
 * Pub/Sub Message Broker Abstraction
 *
 * Phase 16: Unified interface for message consumption with dev fallback.
 *
 * Features:
 * - Google Cloud Pub/Sub integration
 * - In-memory fallback for development
 * - Push and pull mode support
 * - Message acknowledgement handling
 *
 * @module @gwi/worker/pubsub
 */

import type { WorkerJob } from './processor.js';
import { getLogger } from '@gwi/core';

// =============================================================================
// Types
// =============================================================================

/**
 * Message from the broker
 */
export interface BrokerMessage {
  /** Unique message ID */
  id: string;

  /** Decoded job data */
  data: WorkerJob;

  /** Message attributes */
  attributes: Record<string, string>;

  /** When the message was published */
  publishTime: Date;
}

/**
 * Message handler callback
 */
export type MessageHandler = (message: BrokerMessage) => Promise<boolean>;

/**
 * Broker configuration
 */
export interface BrokerConfig {
  /** GCP project ID */
  projectId: string;

  /** Pub/Sub subscription ID */
  subscriptionId: string;

  /** Pub/Sub topic ID (for publishing) */
  topicId: string;

  /** Use pull mode instead of push */
  pullMode: boolean;

  /** Max messages to pull at once */
  maxMessages: number;
}

/**
 * Message broker interface
 */
export interface MessageBroker {
  /** Check if connected */
  isConnected(): boolean;

  /** Start pulling messages (pull mode only) */
  startPulling(handler: MessageHandler): Promise<void>;

  /** Stop pulling messages */
  stop(): Promise<void>;

  /** Publish a job to the topic */
  publish(job: WorkerJob): Promise<string>;
}

// =============================================================================
// Google Cloud Pub/Sub Implementation
// =============================================================================

/**
 * Google Cloud Pub/Sub message broker
 */
class PubSubBroker implements MessageBroker {
  private config: BrokerConfig;
  private logger = getLogger('pubsub');
  private connected = false;
  private subscription: unknown = null;
  private pubsub: unknown = null;

  constructor(config: BrokerConfig) {
    this.config = config;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async startPulling(handler: MessageHandler): Promise<void> {
    if (!this.config.projectId) {
      this.logger.warn('No project ID configured, using in-memory fallback');
      return;
    }

    try {
      // Dynamic import to avoid requiring @google-cloud/pubsub when not in GCP
      const { PubSub } = await import('@google-cloud/pubsub');
      this.pubsub = new PubSub({ projectId: this.config.projectId });

      const subscription = (this.pubsub as InstanceType<typeof PubSub>).subscription(
        this.config.subscriptionId,
        {
          flowControl: {
            maxMessages: this.config.maxMessages,
          },
        }
      );

      this.subscription = subscription;

      subscription.on('message', async (message: {
        id: string;
        data: Buffer;
        attributes: Record<string, string>;
        publishTime: Date;
        ack: () => void;
        nack: () => void;
      }) => {
        try {
          const jobData = JSON.parse(message.data.toString()) as WorkerJob;

          const brokerMessage: BrokerMessage = {
            id: message.id,
            data: jobData,
            attributes: message.attributes,
            publishTime: message.publishTime,
          };

          const success = await handler(brokerMessage);

          if (success) {
            message.ack();
          } else {
            message.nack();
          }
        } catch (error) {
          this.logger.error('Failed to process message', {
            messageId: message.id,
            error: error instanceof Error ? error.message : String(error),
          });
          message.nack();
        }
      });

      subscription.on('error', (error: Error) => {
        this.logger.error('Subscription error', { error: error.message });
        this.connected = false;
      });

      this.connected = true;
      this.logger.info('Started pulling messages', {
        subscription: this.config.subscriptionId,
        maxMessages: this.config.maxMessages,
      });
    } catch (error) {
      this.logger.error('Failed to start pulling', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.subscription) {
      try {
        await (this.subscription as { close(): Promise<void> }).close();
      } catch (error) {
        this.logger.warn('Error closing subscription', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      this.subscription = null;
    }
    this.connected = false;
    this.logger.info('Stopped pulling messages');
  }

  async publish(job: WorkerJob): Promise<string> {
    if (!this.pubsub) {
      throw new Error('Pub/Sub not initialized');
    }

    try {
      const { PubSub } = await import('@google-cloud/pubsub');
      const topic = (this.pubsub as InstanceType<typeof PubSub>).topic(this.config.topicId);

      const messageId = await topic.publishMessage({
        data: Buffer.from(JSON.stringify(job)),
        attributes: {
          type: job.type,
          tenantId: job.tenantId,
        },
      });

      this.logger.info('Published message', {
        messageId,
        type: job.type,
        tenantId: job.tenantId,
      });

      return messageId;
    } catch (error) {
      this.logger.error('Failed to publish message', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

// =============================================================================
// In-Memory Implementation (Dev Fallback)
// =============================================================================

/**
 * In-memory message broker for development and testing
 */
class InMemoryBroker implements MessageBroker {
  private logger = getLogger('inmemory-broker');
  private queue: BrokerMessage[] = [];
  private handler: MessageHandler | null = null;
  private processing = false;
  private connected = false;
  private messageCounter = 0;

  isConnected(): boolean {
    return this.connected;
  }

  async startPulling(handler: MessageHandler): Promise<void> {
    this.handler = handler;
    this.connected = true;
    this.processing = true;

    this.logger.info('In-memory broker started (dev mode)');

    // Process queue in background
    this.processQueue();
  }

  async stop(): Promise<void> {
    this.processing = false;
    this.connected = false;
    this.handler = null;
    this.logger.info('In-memory broker stopped');
  }

  async publish(job: WorkerJob): Promise<string> {
    const messageId = `inmem-${++this.messageCounter}-${Date.now()}`;

    const message: BrokerMessage = {
      id: messageId,
      data: job,
      attributes: {
        type: job.type,
        tenantId: job.tenantId,
      },
      publishTime: new Date(),
    };

    this.queue.push(message);
    this.logger.info('Queued message', { messageId, type: job.type });

    // Trigger processing
    if (this.processing) {
      setImmediate(() => this.processQueue());
    }

    return messageId;
  }

  private async processQueue(): Promise<void> {
    while (this.processing && this.queue.length > 0 && this.handler) {
      const message = this.queue.shift();
      if (!message) continue;

      try {
        const success = await this.handler(message);
        if (!success) {
          // Re-queue failed messages
          this.queue.push(message);
        }
      } catch (error) {
        this.logger.error('Failed to process queued message', {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Re-queue on error
        this.queue.push(message);
      }

      // Small delay between messages
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Get queue length (for testing)
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Clear queue (for testing)
   */
  clearQueue(): void {
    this.queue = [];
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a message broker based on configuration
 *
 * Uses Pub/Sub when project ID is set, otherwise uses in-memory fallback.
 */
export function createMessageBroker(config: BrokerConfig): MessageBroker {
  const logger = getLogger('broker-factory');

  if (config.projectId) {
    logger.info('Using Google Cloud Pub/Sub broker', {
      projectId: config.projectId,
      subscriptionId: config.subscriptionId,
    });
    return new PubSubBroker(config);
  }

  logger.info('Using in-memory broker (dev mode)');
  return new InMemoryBroker();
}

/**
 * Get the in-memory broker for testing
 *
 * Only returns the broker if it's actually in-memory.
 */
export function getInMemoryBroker(broker: MessageBroker): InMemoryBroker | null {
  if (broker instanceof InMemoryBroker) {
    return broker;
  }
  return null;
}
