/**
 * Pub/Sub Publisher/Subscriber Abstraction
 *
 * Epic A5.s2: Queue abstraction layer for publishing and consuming job envelopes.
 *
 * Features:
 * - Type-safe job envelope publishing to Pub/Sub topics
 * - Subscriber with proper message acknowledgment (ack/nack)
 * - Support for both real Pub/Sub (production) and in-memory (testing)
 * - Message attributes for routing and filtering
 * - Retry tracking and error handling
 * - Graceful shutdown handling
 *
 * @module @gwi/core/queue/pubsub-client
 */

import type { Message, PubSub, Subscription, Topic } from '@google-cloud/pubsub';
import { getLogger } from '../reliability/observability.js';
import {
  type JobEnvelope,
  validateJobEnvelope,
} from './job-envelope.js';

// =============================================================================
// Core Types
// =============================================================================

/**
 * Pub/Sub client configuration
 */
export interface PubSubConfig {
  /** GCP project ID */
  projectId: string;
  /** Topic ID for publishing */
  topicId: string;
  /** Subscription ID for consuming (optional, only for subscribers) */
  subscriptionId?: string;
  /** Enable message ordering */
  enableOrdering?: boolean;
  /** Max concurrent messages for subscriber */
  maxConcurrentMessages?: number;
}

/**
 * Published message result
 */
export interface QueuePublishResult {
  /** Pub/Sub message ID */
  messageId: string;
  /** Whether publish succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Message handler function
 */
export type MessageHandler = (envelope: JobEnvelope, message: ReceivedMessage) => Promise<void>;

/**
 * Received message wrapper
 */
export interface ReceivedMessage {
  /** Message ID */
  id: string;
  /** Message attributes */
  attributes: Record<string, string>;
  /** Message data (already parsed) */
  data: JobEnvelope;
  /** Acknowledge the message (success) */
  ack: () => void;
  /** Negative acknowledge (failure, will retry) */
  nack: () => void;
  /** Message publish time */
  publishTime: Date;
  /** Delivery attempt count */
  deliveryAttempt: number;
}

// =============================================================================
// Queue Client Interface
// =============================================================================

/**
 * Queue client interface for both publishers and subscribers
 */
export interface QueueClient {
  /**
   * Check if client is connected
   */
  isConnected(): boolean;

  /**
   * Close the client and clean up resources
   */
  close(): Promise<void>;
}

/**
 * Publisher interface for sending messages
 */
export interface QueuePublisher extends QueueClient {
  /**
   * Publish a single job envelope to the topic
   */
  publish(envelope: JobEnvelope): Promise<QueuePublishResult>;

  /**
   * Publish multiple job envelopes in a batch
   */
  publishBatch(envelopes: JobEnvelope[]): Promise<QueuePublishResult[]>;
}

/**
 * Subscriber interface for receiving messages
 */
export interface QueueSubscriber extends QueueClient {
  /**
   * Start listening for messages
   */
  start(handler: MessageHandler): Promise<void>;

  /**
   * Stop listening for messages
   */
  stop(): Promise<void>;

  /**
   * Check if subscriber is running
   */
  isRunning(): boolean;
}

// =============================================================================
// Pub/Sub Publisher Implementation
// =============================================================================

/**
 * Google Cloud Pub/Sub publisher
 */
export class PubSubPublisher implements QueuePublisher {
  private config: PubSubConfig;
  private logger = getLogger('pubsub-publisher');
  private connected = false;
  private pubsub: PubSub | null = null;
  private topic: Topic | null = null;

  constructor(config: PubSubConfig) {
    this.config = config;
  }

  /**
   * Ensure connection to Pub/Sub
   */
  private async ensureConnected(): Promise<void> {
    if (this.connected && this.topic) return;

    try {
      const { PubSub } = await import('@google-cloud/pubsub');
      this.pubsub = new PubSub({ projectId: this.config.projectId });
      // Note: Message ordering must be enabled on the topic via gcloud/console
      this.topic = this.pubsub.topic(this.config.topicId);
      this.connected = true;
      this.logger.info('Publisher connected to Pub/Sub', {
        projectId: this.config.projectId,
        topicId: this.config.topicId,
      });
    } catch (error) {
      this.logger.error('Failed to connect publisher', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async publish(envelope: JobEnvelope): Promise<QueuePublishResult> {
    await this.ensureConnected();

    // Validate envelope before publishing
    const validation = validateJobEnvelope(envelope);
    if (!validation.success) {
      const errorMsg = `Invalid job envelope: ${validation.error.message}`;
      this.logger.error('Job envelope validation failed', {
        jobId: (envelope as { jobId?: string }).jobId,
        errors: validation.error.errors,
      });
      return {
        messageId: '',
        success: false,
        error: errorMsg,
      };
    }

    try {
      // Build message attributes for routing
      const attributes: Record<string, string> = {
        jobId: envelope.jobId,
        tenantId: envelope.tenantId,
        runId: envelope.runId,
        type: envelope.type,
        priority: envelope.priority,
        attempt: String(envelope.attempt),
        traceId: envelope.traceId,
      };

      if (envelope.stepId) {
        attributes.stepId = envelope.stepId;
      }
      if (envelope.spanId) {
        attributes.spanId = envelope.spanId;
      }
      if (envelope.source) {
        attributes.source = envelope.source;
      }

      const messageOptions: {
        data: Buffer;
        attributes: Record<string, string>;
        orderingKey?: string;
      } = {
        data: Buffer.from(JSON.stringify(envelope)),
        attributes,
      };

      // Add ordering key if specified and ordering is enabled
      if (envelope.orderingKey && this.config.enableOrdering) {
        messageOptions.orderingKey = envelope.orderingKey;
      }

      const messageId = await this.topic!.publishMessage(messageOptions);

      this.logger.info('Job published', {
        messageId,
        jobId: envelope.jobId,
        type: envelope.type,
        tenantId: envelope.tenantId,
        runId: envelope.runId,
      });

      return {
        messageId,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to publish job', {
        jobId: envelope.jobId,
        type: envelope.type,
        error: errorMessage,
      });

      return {
        messageId: '',
        success: false,
        error: errorMessage,
      };
    }
  }

  async publishBatch(envelopes: JobEnvelope[]): Promise<QueuePublishResult[]> {
    // Pub/Sub batching is automatic, but we process in parallel
    const results = await Promise.all(envelopes.map((env) => this.publish(env)));
    return results;
  }

  async close(): Promise<void> {
    if (this.topic) {
      await this.topic.flush();
    }
    this.connected = false;
    this.topic = null;
    this.pubsub = null;
    this.logger.info('Publisher connection closed');
  }
}

// =============================================================================
// Pub/Sub Subscriber Implementation
// =============================================================================

/**
 * Google Cloud Pub/Sub subscriber
 */
export class PubSubSubscriber implements QueueSubscriber {
  private config: PubSubConfig;
  private logger = getLogger('pubsub-subscriber');
  private connected = false;
  private running = false;
  private pubsub: PubSub | null = null;
  private subscription: Subscription | null = null;
  private messageHandler: MessageHandler | null = null;

  constructor(config: PubSubConfig) {
    if (!config.subscriptionId) {
      throw new Error('subscriptionId is required for PubSubSubscriber');
    }
    this.config = config;
  }

  /**
   * Ensure connection to Pub/Sub
   */
  private async ensureConnected(): Promise<void> {
    if (this.connected && this.subscription) return;

    try {
      const { PubSub } = await import('@google-cloud/pubsub');
      this.pubsub = new PubSub({ projectId: this.config.projectId });
      this.subscription = this.pubsub.subscription(this.config.subscriptionId!, {
        flowControl: {
          maxMessages: this.config.maxConcurrentMessages ?? 10,
        },
      });
      this.connected = true;
      this.logger.info('Subscriber connected to Pub/Sub', {
        projectId: this.config.projectId,
        subscriptionId: this.config.subscriptionId,
      });
    } catch (error) {
      this.logger.error('Failed to connect subscriber', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  isRunning(): boolean {
    return this.running;
  }

  async start(handler: MessageHandler): Promise<void> {
    if (this.running) {
      this.logger.warn('Subscriber already running');
      return;
    }

    await this.ensureConnected();
    this.messageHandler = handler;

    // Set up message handler
    this.subscription!.on('message', async (message: Message) => {
      await this.handleMessage(message);
    });

    // Set up error handler
    this.subscription!.on('error', (error: Error) => {
      this.logger.error('Subscription error', {
        error: error.message,
        subscriptionId: this.config.subscriptionId,
      });
    });

    this.running = true;
    this.logger.info('Subscriber started', {
      subscriptionId: this.config.subscriptionId,
      maxConcurrent: this.config.maxConcurrentMessages ?? 10,
    });
  }

  /**
   * Handle a received message
   */
  private async handleMessage(message: Message): Promise<void> {
    const startTime = Date.now();
    const messageId = message.id;

    try {
      // Parse message data
      const rawData = message.data.toString('utf-8');
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(rawData);
      } catch (parseError) {
        this.logger.error('Failed to parse message JSON', {
          messageId,
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
        message.nack(); // Nack malformed messages
        return;
      }

      // Validate job envelope
      const validation = validateJobEnvelope(parsedData);
      if (!validation.success) {
        this.logger.error('Invalid job envelope received', {
          messageId,
          errors: validation.error.errors,
        });
        message.nack(); // Nack invalid envelopes
        return;
      }

      const envelope = validation.data;
      const deliveryAttempt = message.deliveryAttempt ?? 1;

      this.logger.info('Processing message', {
        messageId,
        jobId: envelope.jobId,
        type: envelope.type,
        tenantId: envelope.tenantId,
        deliveryAttempt,
      });

      // Create wrapped message
      const wrappedMessage: ReceivedMessage = {
        id: messageId,
        attributes: message.attributes,
        data: envelope,
        ack: () => message.ack(),
        nack: () => message.nack(),
        publishTime: new Date(message.publishTime),
        deliveryAttempt,
      };

      // Call user handler
      if (this.messageHandler) {
        await this.messageHandler(envelope, wrappedMessage);
      }

      const duration = Date.now() - startTime;
      this.logger.info('Message processed successfully', {
        messageId,
        jobId: envelope.jobId,
        durationMs: duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Error processing message', {
        messageId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: duration,
      });
      // Note: Handler is responsible for calling ack/nack
      // If handler throws without ack/nack, message will be retried
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      this.logger.warn('Subscriber not running');
      return;
    }

    if (this.subscription) {
      this.subscription.removeAllListeners();
    }

    this.running = false;
    this.messageHandler = null;
    this.logger.info('Subscriber stopped');
  }

  async close(): Promise<void> {
    await this.stop();
    this.connected = false;
    this.subscription = null;
    this.pubsub = null;
    this.logger.info('Subscriber connection closed');
  }
}

// =============================================================================
// In-Memory Implementations (for testing)
// =============================================================================

/**
 * In-memory publisher for testing
 */
export class InMemoryPublisher implements QueuePublisher {
  private logger = getLogger('inmem-publisher');
  private messageQueue: JobEnvelope[] = [];
  private messageCounter = 0;

  isConnected(): boolean {
    return true;
  }

  async publish(envelope: JobEnvelope): Promise<QueuePublishResult> {
    // Validate envelope
    const validation = validateJobEnvelope(envelope);
    if (!validation.success) {
      const errorMsg = `Invalid job envelope: ${validation.error.message}`;
      this.logger.error('Job envelope validation failed', {
        jobId: (envelope as { jobId?: string }).jobId,
        errors: validation.error.errors,
      });
      return {
        messageId: '',
        success: false,
        error: errorMsg,
      };
    }

    const messageId = `inmem-${++this.messageCounter}-${Date.now()}`;
    this.messageQueue.push(envelope);

    this.logger.info('Job published (in-memory)', {
      messageId,
      jobId: envelope.jobId,
      type: envelope.type,
      queueLength: this.messageQueue.length,
    });

    return {
      messageId,
      success: true,
    };
  }

  async publishBatch(envelopes: JobEnvelope[]): Promise<QueuePublishResult[]> {
    return Promise.all(envelopes.map((env) => this.publish(env)));
  }

  async close(): Promise<void> {
    this.messageQueue = [];
    this.logger.info('In-memory publisher closed');
  }

  // Testing utilities

  /**
   * Get all queued messages
   */
  getMessages(): JobEnvelope[] {
    return [...this.messageQueue];
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.messageQueue.length;
  }

  /**
   * Clear the queue
   */
  clearQueue(): void {
    this.messageQueue = [];
  }

  /**
   * Pop next message from queue
   */
  popMessage(): JobEnvelope | undefined {
    return this.messageQueue.shift();
  }
}

/**
 * In-memory subscriber for testing
 */
export class InMemorySubscriber implements QueueSubscriber {
  private logger = getLogger('inmem-subscriber');
  private running = false;
  private handler: MessageHandler | null = null;
  private publisher: InMemoryPublisher | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private messageCounter = 0;

  constructor(publisher: InMemoryPublisher) {
    this.publisher = publisher;
  }

  isConnected(): boolean {
    return true;
  }

  isRunning(): boolean {
    return this.running;
  }

  async start(handler: MessageHandler): Promise<void> {
    if (this.running) {
      this.logger.warn('Subscriber already running');
      return;
    }

    this.handler = handler;
    this.running = true;

    // Poll for messages every 100ms
    this.pollInterval = setInterval(async () => {
      if (!this.running || !this.handler || !this.publisher) return;

      const envelope = this.publisher.popMessage();
      if (!envelope) return;

      const messageId = `inmem-${++this.messageCounter}-${Date.now()}`;
      let acked = false;
      let nacked = false;

      const wrappedMessage: ReceivedMessage = {
        id: messageId,
        attributes: {
          jobId: envelope.jobId,
          tenantId: envelope.tenantId,
          runId: envelope.runId,
          type: envelope.type,
        },
        data: envelope,
        ack: () => {
          acked = true;
          this.logger.info('Message acked', { messageId, jobId: envelope.jobId });
        },
        nack: () => {
          nacked = true;
          this.logger.info('Message nacked', { messageId, jobId: envelope.jobId });
          // Re-queue the message for retry
          this.publisher?.publish(envelope);
        },
        publishTime: new Date(),
        deliveryAttempt: envelope.attempt,
      };

      try {
        await this.handler(envelope, wrappedMessage);
        // Auto-ack if handler didn't ack/nack
        if (!acked && !nacked) {
          wrappedMessage.ack();
        }
      } catch (error) {
        this.logger.error('Handler error', {
          messageId,
          jobId: envelope.jobId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Auto-nack on error if not already acked/nacked
        if (!acked && !nacked) {
          wrappedMessage.nack();
        }
      }
    }, 100);

    this.logger.info('In-memory subscriber started');
  }

  async stop(): Promise<void> {
    if (!this.running) {
      this.logger.warn('Subscriber not running');
      return;
    }

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    this.running = false;
    this.handler = null;
    this.logger.info('In-memory subscriber stopped');
  }

  async close(): Promise<void> {
    await this.stop();
    this.publisher = null;
    this.logger.info('In-memory subscriber closed');
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a publisher based on configuration
 */
export function createPublisher(config: PubSubConfig): QueuePublisher {
  const logger = getLogger('publisher-factory');

  if (config.projectId) {
    logger.info('Creating Pub/Sub publisher', {
      projectId: config.projectId,
      topicId: config.topicId,
    });
    return new PubSubPublisher(config);
  }

  logger.info('Creating in-memory publisher (dev mode)');
  return new InMemoryPublisher();
}

/**
 * Create a subscriber based on configuration
 */
export function createSubscriber(config: PubSubConfig, publisher?: InMemoryPublisher): QueueSubscriber {
  const logger = getLogger('subscriber-factory');

  if (config.projectId && config.subscriptionId) {
    logger.info('Creating Pub/Sub subscriber', {
      projectId: config.projectId,
      subscriptionId: config.subscriptionId,
    });
    return new PubSubSubscriber(config);
  }

  if (!publisher) {
    throw new Error('In-memory subscriber requires a publisher instance');
  }

  logger.info('Creating in-memory subscriber (dev mode)');
  return new InMemorySubscriber(publisher);
}
