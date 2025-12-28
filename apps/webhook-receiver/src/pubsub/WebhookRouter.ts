/**
 * Webhook Router - Pub/Sub Publishing
 *
 * Epic B: Data Ingestion & Connector Framework
 * Task B3.4: Add webhook receiver service
 *
 * Routes webhook events to the appropriate Pub/Sub topic based on source.
 * Supports message ordering and deduplication via event IDs.
 *
 * @module @gwi/webhook-receiver/pubsub
 */

import { PubSub, Topic } from '@google-cloud/pubsub';
import type { WebhookEvent, ILogger, WebhookSource } from '../types.js';

/**
 * Topic configuration for each webhook source
 */
export interface TopicConfig {
  /** Topic name (without project prefix) */
  name: string;
  /** Enable message ordering */
  enableOrdering: boolean;
}

/**
 * Default topic configuration
 */
export const DEFAULT_TOPIC_CONFIG: Record<WebhookSource, TopicConfig> = {
  github: {
    name: 'github-webhooks',
    enableOrdering: true,
  },
  gitlab: {
    name: 'gitlab-webhooks',
    enableOrdering: true,
  },
  linear: {
    name: 'linear-webhooks',
    enableOrdering: true,
  },
  slack: {
    name: 'slack-webhooks',
    enableOrdering: true,
  },
};

/**
 * Published message result
 */
export interface PublishResult {
  /** Pub/Sub message ID */
  messageId: string;
  /** Topic name */
  topic: string;
}

/**
 * Webhook Router
 *
 * Routes incoming webhook events to appropriate Pub/Sub topics
 * for async processing by workers.
 */
export class WebhookRouter {
  private readonly topics: Map<WebhookSource, Topic> = new Map();
  private readonly topicConfig: Record<WebhookSource, TopicConfig>;

  constructor(
    private readonly pubsub: PubSub,
    private readonly logger: ILogger,
    private readonly topicPrefix: string = 'gwi',
    topicConfig?: Partial<Record<WebhookSource, TopicConfig>>
  ) {
    this.topicConfig = {
      ...DEFAULT_TOPIC_CONFIG,
      ...topicConfig,
    };

    // Initialize topics
    this.initializeTopics();
  }

  /**
   * Initialize Pub/Sub topic references
   */
  private initializeTopics(): void {
    const sources: WebhookSource[] = ['github', 'gitlab', 'linear', 'slack'];

    for (const source of sources) {
      const config = this.topicConfig[source];
      const topicName = `${this.topicPrefix}-${config.name}`;
      const topic = this.pubsub.topic(topicName, {
        messageOrdering: config.enableOrdering,
      });

      this.topics.set(source, topic);

      this.logger.debug('Initialized topic', {
        source,
        topicName,
        enableOrdering: config.enableOrdering,
      });
    }
  }

  /**
   * Route a webhook event to the appropriate Pub/Sub topic
   *
   * @param event - Webhook event to route
   * @param tenantId - Tenant ID for ordering
   * @returns Publish result with message ID
   */
  async route(event: WebhookEvent, tenantId: string): Promise<PublishResult> {
    const topic = this.topics.get(event.source);

    if (!topic) {
      throw new Error(`No topic configured for source: ${event.source}`);
    }

    const config = this.topicConfig[event.source];
    const topicName = `${this.topicPrefix}-${config.name}`;

    // Prepare message attributes for filtering and routing
    const attributes: Record<string, string> = {
      eventId: event.id,
      eventType: event.type,
      source: event.source,
      tenantId,
      timestamp: event.timestamp,
    };

    // Prepare message data
    const messageData = Buffer.from(JSON.stringify({
      ...event,
      tenantId,
      routedAt: new Date().toISOString(),
    }));

    // Publish with ordering key for message ordering
    const orderingKey = config.enableOrdering
      ? `${tenantId}-${event.source}`
      : undefined;

    try {
      const messageId = await topic.publishMessage({
        data: messageData,
        attributes,
        orderingKey,
      });

      this.logger.info('Webhook routed to Pub/Sub', {
        source: event.source,
        eventId: event.id,
        eventType: event.type,
        tenantId,
        messageId,
        topic: topicName,
        orderingKey,
      });

      return {
        messageId,
        topic: topicName,
      };
    } catch (error) {
      this.logger.error('Failed to publish to Pub/Sub', {
        source: event.source,
        eventId: event.id,
        tenantId,
        topic: topicName,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Check if a topic exists and is ready
   */
  async checkTopicHealth(source: WebhookSource): Promise<boolean> {
    const topic = this.topics.get(source);

    if (!topic) {
      return false;
    }

    try {
      const [exists] = await topic.exists();
      return exists;
    } catch {
      return false;
    }
  }

  /**
   * Check health of all topics
   */
  async checkAllTopicsHealth(): Promise<Record<WebhookSource, boolean>> {
    const sources: WebhookSource[] = ['github', 'gitlab', 'linear', 'slack'];
    const results: Record<string, boolean> = {};

    await Promise.all(
      sources.map(async (source) => {
        results[source] = await this.checkTopicHealth(source);
      })
    );

    return results as Record<WebhookSource, boolean>;
  }

  /**
   * Get topic name for a source
   */
  getTopicName(source: WebhookSource): string {
    const config = this.topicConfig[source];
    return `${this.topicPrefix}-${config.name}`;
  }
}

/**
 * Create a webhook router with default configuration
 */
export function createWebhookRouter(
  projectId: string,
  logger: ILogger,
  topicPrefix?: string
): WebhookRouter {
  const pubsub = new PubSub({ projectId });
  return new WebhookRouter(pubsub, logger, topicPrefix);
}
