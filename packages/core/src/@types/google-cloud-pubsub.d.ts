/**
 * Type declarations for @google-cloud/pubsub
 *
 * Minimal stubs to satisfy TypeScript compiler.
 * The package is incomplete in node_modules.
 */

declare module '@google-cloud/pubsub' {
  export interface TopicOptions {
    messageOrdering?: boolean;
  }

  export interface PublishOptions {
    orderingKey?: string;
  }

  export interface MessageOptions {
    data: Buffer;
    attributes?: Record<string, string>;
    orderingKey?: string;
  }

  export class Topic {
    publishMessage(message: MessageOptions): Promise<string>;
    publish(data: Buffer, attributes?: Record<string, string>): Promise<string>;
    setPublishOptions(options: PublishOptions): void;
    exists(): Promise<[boolean]>;
    create(): Promise<[Topic, unknown]>;
    flush(): Promise<void>;
  }

  export interface PubSubOptions {
    projectId?: string;
    keyFilename?: string;
    credentials?: {
      client_email?: string;
      private_key?: string;
    };
  }

  export interface SubscriptionOptions {
    flowControl?: {
      maxMessages?: number;
      allowExcessMessages?: boolean;
    };
  }

  export interface Message {
    id: string;
    data: Buffer;
    attributes: Record<string, string>;
    publishTime: Date;
    deliveryAttempt?: number;
    ack(): void;
    nack(): void;
  }

  export class Subscription {
    on(event: 'message', callback: (message: Message) => void): void;
    on(event: 'error', callback: (error: Error) => void): void;
    on(event: 'close', callback: () => void): void;
    close(): Promise<void>;
    removeAllListeners(): void;
  }

  export class PubSub {
    constructor(options?: PubSubOptions);
    topic(name: string, options?: TopicOptions): Topic;
    createTopic(name: string): Promise<[Topic, unknown]>;
    getTopics(): Promise<[Topic[], unknown]>;
    subscription(name: string, options?: SubscriptionOptions): Subscription;
  }
}
