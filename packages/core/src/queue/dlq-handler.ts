/**
 * Dead Letter Queue Handler
 *
 * B4: Pub/Sub Queue and DLQ Semantics
 *
 * Handles poison message detection, DLQ routing, and backlog management.
 *
 * Design Principles:
 * - Transient errors → nack (retry with backoff)
 * - Permanent errors → route to DLQ immediately
 * - Max retries exceeded → auto-route to DLQ via Pub/Sub policy
 * - Poison messages → detect and quarantine
 *
 * @module @gwi/core/queue/dlq-handler
 */

import { getLogger } from '../reliability/observability.js';

const logger = getLogger('dlq-handler');

// =============================================================================
// Types
// =============================================================================

/**
 * Error classification for retry decisions
 */
export type ErrorClassification = 'transient' | 'permanent' | 'poison';

/**
 * Result of error classification
 */
export interface ClassificationResult {
  /** Error type */
  classification: ErrorClassification;
  /** Whether to retry */
  shouldRetry: boolean;
  /** Reason for classification */
  reason: string;
  /** Suggested action */
  action: 'retry' | 'dlq' | 'discard';
}

/**
 * Poison message record for quarantine
 */
export interface PoisonMessage {
  /** Original message ID */
  messageId: string;
  /** Job ID if available */
  jobId?: string;
  /** Tenant ID if available */
  tenantId?: string;
  /** Run ID if available */
  runId?: string;
  /** Raw message data */
  rawData: string;
  /** Error that caused poisoning */
  error: string;
  /** Error stack trace */
  stack?: string;
  /** Classification result */
  classification: ClassificationResult;
  /** Number of delivery attempts */
  deliveryAttempt: number;
  /** When the message was first received */
  firstReceivedAt: Date;
  /** When the message was quarantined */
  quarantinedAt: Date;
  /** Source subscription */
  subscription: string;
}

/**
 * DLQ handler configuration
 */
export interface DLQHandlerConfig {
  /** Maximum delivery attempts before DLQ (default: 5) */
  maxDeliveryAttempts?: number;
  /** Maximum message age before considered stale (ms, default: 24h) */
  maxMessageAgeMs?: number;
  /** Enable poison message detection (default: true) */
  detectPoisonMessages?: boolean;
  /** Patterns that indicate permanent failures */
  permanentErrorPatterns?: RegExp[];
  /** Patterns that indicate transient failures */
  transientErrorPatterns?: RegExp[];
}

/**
 * DLQ metrics for monitoring
 */
export interface DLQMetrics {
  /** Messages routed to DLQ */
  dlqRoutedCount: number;
  /** Poison messages detected */
  poisonCount: number;
  /** Transient errors (will retry) */
  transientErrorCount: number;
  /** Permanent errors */
  permanentErrorCount: number;
  /** Messages discarded */
  discardedCount: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: Required<DLQHandlerConfig> = {
  maxDeliveryAttempts: 5,
  maxMessageAgeMs: 24 * 60 * 60 * 1000, // 24 hours
  detectPoisonMessages: true,
  permanentErrorPatterns: [
    /invalid.*schema/i,
    /malformed.*json/i,
    /validation.*failed/i,
    /unauthorized/i,
    /forbidden/i,
    /tenant.*not.*found/i,
    /not.*found.*tenant/i,
    /run.*not.*found/i,
    /not.*found.*run/i,
    /invalid.*envelope/i,
    /missing.*required/i,
  ],
  transientErrorPatterns: [
    /timeout/i,
    /connection.*refused/i,
    /network.*error/i,
    /rate.*limit/i,
    /too.*many.*requests/i,
    /service.*unavailable/i,
    /internal.*server.*error/i,
    /econnreset/i,
    /enotfound/i,
    /socket.*hang.*up/i,
  ],
};

// =============================================================================
// DLQ Handler
// =============================================================================

/**
 * Dead Letter Queue Handler
 *
 * Provides intelligent error classification and DLQ routing decisions.
 *
 * Usage:
 * ```typescript
 * const handler = new DLQHandler();
 *
 * try {
 *   await processMessage(message);
 *   message.ack();
 * } catch (error) {
 *   const result = handler.classifyError(error, message.deliveryAttempt);
 *   if (result.shouldRetry) {
 *     message.nack(); // Will retry with backoff
 *   } else {
 *     // Route to DLQ or discard
 *     await handler.handlePoisonMessage(message, error, result);
 *     message.ack(); // Ack to prevent infinite retry
 *   }
 * }
 * ```
 */
export class DLQHandler {
  private config: Required<DLQHandlerConfig>;
  private metrics: DLQMetrics = {
    dlqRoutedCount: 0,
    poisonCount: 0,
    transientErrorCount: 0,
    permanentErrorCount: 0,
    discardedCount: 0,
  };
  private poisonMessages: PoisonMessage[] = [];

  constructor(config: DLQHandlerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Classify an error to determine retry behavior
   */
  classifyError(error: unknown, deliveryAttempt: number): ClassificationResult {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if max attempts exceeded
    if (deliveryAttempt >= this.config.maxDeliveryAttempts) {
      logger.warn('Max delivery attempts exceeded', {
        deliveryAttempt,
        maxAttempts: this.config.maxDeliveryAttempts,
        error: errorMessage,
      });
      return {
        classification: 'poison',
        shouldRetry: false,
        reason: `Max delivery attempts (${this.config.maxDeliveryAttempts}) exceeded`,
        action: 'dlq',
      };
    }

    // Check for permanent error patterns
    for (const pattern of this.config.permanentErrorPatterns) {
      if (pattern.test(errorMessage)) {
        this.metrics.permanentErrorCount++;
        logger.info('Permanent error detected', {
          pattern: pattern.source,
          error: errorMessage,
        });
        return {
          classification: 'permanent',
          shouldRetry: false,
          reason: `Permanent error: ${errorMessage}`,
          action: 'dlq',
        };
      }
    }

    // Check for transient error patterns
    for (const pattern of this.config.transientErrorPatterns) {
      if (pattern.test(errorMessage)) {
        this.metrics.transientErrorCount++;
        logger.info('Transient error detected, will retry', {
          pattern: pattern.source,
          error: errorMessage,
          deliveryAttempt,
        });
        return {
          classification: 'transient',
          shouldRetry: true,
          reason: `Transient error: ${errorMessage}`,
          action: 'retry',
        };
      }
    }

    // Default: treat unknown errors as transient for first few attempts
    if (deliveryAttempt < 3) {
      this.metrics.transientErrorCount++;
      logger.info('Unknown error, treating as transient', {
        error: errorMessage,
        deliveryAttempt,
      });
      return {
        classification: 'transient',
        shouldRetry: true,
        reason: `Unknown error (attempt ${deliveryAttempt}): ${errorMessage}`,
        action: 'retry',
      };
    }

    // After 3 attempts, unknown errors are permanent
    this.metrics.permanentErrorCount++;
    logger.warn('Unknown error after 3 attempts, treating as permanent', {
      error: errorMessage,
      deliveryAttempt,
    });
    return {
      classification: 'permanent',
      shouldRetry: false,
      reason: `Unknown error after ${deliveryAttempt} attempts: ${errorMessage}`,
      action: 'dlq',
    };
  }

  /**
   * Check if a message is a potential poison message
   *
   * Poison messages are messages that consistently fail processing
   * and would cause infinite retry loops.
   */
  isPoisonMessage(rawData: string): { isPosion: boolean; reason?: string } {
    if (!this.config.detectPoisonMessages) {
      return { isPosion: false };
    }

    // Check for empty or whitespace-only data
    if (!rawData || !rawData.trim()) {
      return { isPosion: true, reason: 'Empty message data' };
    }

    // Check for obviously malformed JSON
    try {
      JSON.parse(rawData);
    } catch {
      // Check if it's completely unparseable (not just missing fields)
      if (rawData.length > 0 && !rawData.startsWith('{') && !rawData.startsWith('[')) {
        return { isPosion: true, reason: 'Non-JSON message data' };
      }
    }

    // Check for excessively large messages (>10MB could indicate attack)
    if (rawData.length > 10 * 1024 * 1024) {
      return { isPosion: true, reason: `Message too large: ${rawData.length} bytes` };
    }

    return { isPosion: false };
  }

  /**
   * Record a poison message for quarantine and investigation
   */
  recordPoisonMessage(
    messageId: string,
    rawData: string,
    error: unknown,
    classification: ClassificationResult,
    deliveryAttempt: number,
    subscription: string,
    metadata?: { jobId?: string; tenantId?: string; runId?: string }
  ): PoisonMessage {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    const poisonMessage: PoisonMessage = {
      messageId,
      jobId: metadata?.jobId,
      tenantId: metadata?.tenantId,
      runId: metadata?.runId,
      rawData: rawData.substring(0, 10000), // Truncate for storage
      error: errorMessage,
      stack: errorStack,
      classification,
      deliveryAttempt,
      firstReceivedAt: new Date(), // Ideally from message.publishTime
      quarantinedAt: new Date(),
      subscription,
    };

    this.poisonMessages.push(poisonMessage);
    this.metrics.poisonCount++;
    this.metrics.dlqRoutedCount++;

    logger.error('Poison message quarantined', {
      messageId,
      jobId: metadata?.jobId,
      tenantId: metadata?.tenantId,
      error: errorMessage,
      classification: classification.classification,
      reason: classification.reason,
      deliveryAttempt,
    });

    return poisonMessage;
  }

  /**
   * Get current metrics
   */
  getMetrics(): DLQMetrics {
    return { ...this.metrics };
  }

  /**
   * Get quarantined poison messages
   */
  getPoisonMessages(): PoisonMessage[] {
    return [...this.poisonMessages];
  }

  /**
   * Clear poison messages (after investigation/reprocessing)
   */
  clearPoisonMessages(): void {
    const count = this.poisonMessages.length;
    this.poisonMessages = [];
    logger.info('Poison messages cleared', { count });
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      dlqRoutedCount: 0,
      poisonCount: 0,
      transientErrorCount: 0,
      permanentErrorCount: 0,
      discardedCount: 0,
    };
  }
}

// =============================================================================
// Retry Policy Configuration
// =============================================================================

/**
 * Pub/Sub subscription retry policy
 *
 * These values should match the Terraform configuration in infra/
 */
export const RETRY_POLICY = {
  /** Minimum backoff duration (seconds) */
  minimumBackoff: 10,
  /** Maximum backoff duration (seconds) */
  maximumBackoff: 600, // 10 minutes
  /** Acknowledgement deadline (seconds) */
  ackDeadline: 60,
  /** Maximum delivery attempts before DLQ */
  maxDeliveryAttempts: 5,
  /** Message retention duration (seconds) */
  messageRetention: 604800, // 7 days
} as const;

/**
 * DLQ configuration
 *
 * These values should match the Terraform configuration in infra/
 */
export const DLQ_CONFIG = {
  /** DLQ message retention (seconds) */
  messageRetention: 1209600, // 14 days
  /** DLQ subscription never expires */
  expirationTtl: '', // Never expire
} as const;

// =============================================================================
// Factory
// =============================================================================

let defaultHandler: DLQHandler | null = null;

/**
 * Get the default DLQ handler (singleton)
 */
export function getDefaultDLQHandler(): DLQHandler {
  if (!defaultHandler) {
    defaultHandler = new DLQHandler();
  }
  return defaultHandler;
}

/**
 * Create a new DLQ handler with custom configuration
 */
export function createDLQHandler(config?: DLQHandlerConfig): DLQHandler {
  return new DLQHandler(config);
}

// =============================================================================
// Exports
// =============================================================================

export { DLQHandler as default };
