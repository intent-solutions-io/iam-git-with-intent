/**
 * Webhook Receiver Types
 *
 * Epic B: Data Ingestion & Connector Framework
 * Task B3.4: Add webhook receiver service
 *
 * @module @gwi/webhook-receiver/types
 */

import { z } from 'zod';

// =============================================================================
// Webhook Sources
// =============================================================================

/**
 * Supported webhook sources
 */
export const WebhookSourceSchema = z.enum(['github', 'gitlab', 'linear', 'slack']);
export type WebhookSource = z.infer<typeof WebhookSourceSchema>;

// =============================================================================
// Webhook Event
// =============================================================================

/**
 * Normalized webhook event structure
 */
export const WebhookEventSchema = z.object({
  /** Unique event ID (from source) */
  id: z.string(),

  /** Webhook source */
  source: WebhookSourceSchema,

  /** Event type (e.g., 'pull_request', 'issue', 'merge_request') */
  type: z.string(),

  /** ISO timestamp of when the event was received */
  timestamp: z.string().datetime(),

  /** Raw payload from the webhook */
  payload: z.unknown(),

  /** Signature from the source (for verification) */
  signature: z.string().optional(),

  /** Raw headers from the request */
  headers: z.record(z.string()).optional(),

  /** Tenant ID (if known) */
  tenantId: z.string().optional(),
});

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

// =============================================================================
// Webhook Response
// =============================================================================

/**
 * Webhook processing response
 */
export const WebhookResponseSchema = z.object({
  /** Processing status */
  status: z.enum(['accepted', 'rejected', 'error']),

  /** Event ID for tracking */
  event_id: z.string().optional(),

  /** Pub/Sub message ID (if published) */
  message_id: z.string().optional(),

  /** Error type (if rejected/error) */
  error: z.string().optional(),

  /** Human-readable message */
  message: z.string().optional(),

  /** Retry-After header value (for rate limiting) */
  retry_after: z.number().optional(),
});

export type WebhookResponse = z.infer<typeof WebhookResponseSchema>;

// =============================================================================
// Rate Limit Error
// =============================================================================

/**
 * Rate limit error with retry information
 */
export class RateLimitError extends Error {
  public readonly retryAfter: number;
  public readonly source: string;

  constructor(message: string, source: string, retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
    this.source = source;
    this.retryAfter = retryAfter;
  }
}

// =============================================================================
// Signature Verification Result
// =============================================================================

/**
 * Result of signature verification
 */
export interface SignatureVerificationResult {
  /** Whether the signature is valid */
  valid: boolean;

  /** Error message if invalid */
  error?: string;
}

// =============================================================================
// Secret Manager Interface
// =============================================================================

/**
 * Interface for retrieving webhook secrets
 */
export interface ISecretManager {
  /**
   * Get webhook secret for a tenant and source
   *
   * @param tenantId - Tenant ID
   * @param secretKey - Secret key (e.g., 'webhook-secret-github')
   * @returns Secret value or null if not found
   */
  getSecret(tenantId: string, secretKey: string): Promise<string | null>;
}

// =============================================================================
// Logger Interface
// =============================================================================

/**
 * Structured logger interface
 */
export interface ILogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

// =============================================================================
// Webhook Receiver Config
// =============================================================================

/**
 * Configuration for the webhook receiver
 */
export interface WebhookReceiverConfig {
  /** GCP project ID */
  projectId: string;

  /** Environment (dev, staging, prod) */
  environment: string;

  /** Port to listen on */
  port: number;

  /** Rate limit: max webhooks per minute per tenant */
  rateLimitPerMinute: number;

  /** Enable signature verification */
  requireSignature: boolean;

  /** Pub/Sub topic prefix */
  topicPrefix: string;

  /** Enable idempotency checks */
  enableIdempotency: boolean;

  /** Idempotency TTL in seconds */
  idempotencyTtlSeconds: number;
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: WebhookReceiverConfig = {
  projectId: process.env.GCP_PROJECT_ID || '',
  environment: process.env.DEPLOYMENT_ENV || 'dev',
  port: parseInt(process.env.PORT || '8080', 10),
  rateLimitPerMinute: 100,
  requireSignature: process.env.DEPLOYMENT_ENV === 'prod',
  topicPrefix: 'gwi',
  enableIdempotency: true,
  idempotencyTtlSeconds: 7 * 24 * 60 * 60, // 7 days
};
