/**
 * Webhook Signature Verifier
 *
 * Epic B: Data Ingestion & Connector Framework
 * Task B3.4: Add webhook receiver service
 *
 * Implements HMAC signature verification for:
 * - GitHub (X-Hub-Signature-256)
 * - GitLab (X-Gitlab-Token)
 * - Linear (Linear-Signature)
 * - Slack (X-Slack-Signature with timestamp)
 *
 * @module @gwi/webhook-receiver/webhook
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type {
  WebhookEvent,
  SignatureVerificationResult,
  ISecretManager,
  ILogger,
} from '../types.js';

/**
 * Webhook signature verifier
 *
 * Verifies HMAC signatures for multiple webhook sources using
 * timing-safe comparison to prevent timing attacks.
 */
export class WebhookVerifier {
  constructor(
    private readonly secretManager: ISecretManager,
    private readonly logger: ILogger
  ) {}

  /**
   * Verify webhook signature based on source
   *
   * @param event - Webhook event with signature and payload
   * @param tenantId - Tenant ID for secret lookup
   * @param rawBody - Raw request body for signature verification
   * @returns Verification result
   */
  async verify(
    event: WebhookEvent,
    tenantId: string,
    rawBody: string
  ): Promise<SignatureVerificationResult> {
    // Get webhook secret for tenant and source
    const secretKey = `webhook-secret-${event.source}`;
    const secret = await this.secretManager.getSecret(tenantId, secretKey);

    if (!secret) {
      this.logger.warn('Webhook secret not found', {
        tenantId,
        source: event.source,
        secretKey,
      });
      return {
        valid: false,
        error: 'Webhook secret not configured',
      };
    }

    switch (event.source) {
      case 'github':
        return this.verifyGitHub(event, secret, rawBody);
      case 'gitlab':
        return this.verifyGitLab(event, secret);
      case 'linear':
        return this.verifyLinear(event, secret, rawBody);
      case 'slack':
        return this.verifySlack(event, secret, rawBody);
      default:
        return {
          valid: false,
          error: `Unsupported webhook source: ${event.source}`,
        };
    }
  }

  /**
   * Verify GitHub webhook signature (HMAC-SHA256)
   *
   * GitHub sends: X-Hub-Signature-256: sha256=<hex>
   */
  private verifyGitHub(
    event: WebhookEvent,
    secret: string,
    rawBody: string
  ): SignatureVerificationResult {
    const signature = event.signature;

    if (!signature) {
      return {
        valid: false,
        error: 'Missing X-Hub-Signature-256 header',
      };
    }

    if (!signature.startsWith('sha256=')) {
      return {
        valid: false,
        error: 'Invalid signature format (expected sha256=...)',
      };
    }

    const receivedSignature = signature.substring(7); // Remove 'sha256='
    const hmac = createHmac('sha256', secret);
    hmac.update(rawBody);
    const expectedSignature = hmac.digest('hex');

    return this.timingSafeCompare(receivedSignature, expectedSignature);
  }

  /**
   * Verify GitLab webhook token (static token comparison)
   *
   * GitLab sends: X-Gitlab-Token: <token>
   * Note: GitLab uses a static token, not HMAC
   */
  private verifyGitLab(
    event: WebhookEvent,
    secret: string
  ): SignatureVerificationResult {
    const token = event.signature;

    if (!token) {
      return {
        valid: false,
        error: 'Missing X-Gitlab-Token header',
      };
    }

    // GitLab uses static token comparison
    if (token !== secret) {
      return {
        valid: false,
        error: 'Token verification failed',
      };
    }

    return { valid: true };
  }

  /**
   * Verify Linear webhook signature (HMAC-SHA256)
   *
   * Linear sends: Linear-Signature: <hex>
   */
  private verifyLinear(
    event: WebhookEvent,
    secret: string,
    rawBody: string
  ): SignatureVerificationResult {
    const signature = event.signature;

    if (!signature) {
      return {
        valid: false,
        error: 'Missing Linear-Signature header',
      };
    }

    const hmac = createHmac('sha256', secret);
    hmac.update(rawBody);
    const expectedSignature = hmac.digest('hex');

    return this.timingSafeCompare(signature, expectedSignature);
  }

  /**
   * Verify Slack webhook signature (HMAC-SHA256 with timestamp)
   *
   * Slack sends:
   * - X-Slack-Signature: v0=<hex>
   * - X-Slack-Request-Timestamp: <unix-seconds>
   *
   * Signature is computed over: v0:timestamp:body
   * Also checks timestamp to prevent replay attacks (5 minute window)
   */
  private verifySlack(
    event: WebhookEvent,
    secret: string,
    rawBody: string
  ): SignatureVerificationResult {
    const signature = event.signature;
    const timestamp = event.headers?.['x-slack-request-timestamp'];

    if (!signature) {
      return {
        valid: false,
        error: 'Missing X-Slack-Signature header',
      };
    }

    if (!timestamp) {
      return {
        valid: false,
        error: 'Missing X-Slack-Request-Timestamp header',
      };
    }

    // Prevent replay attacks (reject if >5 minutes old)
    const timestampInt = parseInt(timestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    const maxAge = 60 * 5; // 5 minutes

    if (Math.abs(currentTime - timestampInt) > maxAge) {
      return {
        valid: false,
        error: `Webhook timestamp too old (${Math.abs(currentTime - timestampInt)}s > ${maxAge}s)`,
      };
    }

    // Slack signature format: v0=<hex>
    if (!signature.startsWith('v0=')) {
      return {
        valid: false,
        error: 'Invalid signature format (expected v0=...)',
      };
    }

    const receivedSignature = signature.substring(3); // Remove 'v0='

    // Compute expected signature
    const baseString = `v0:${timestamp}:${rawBody}`;
    const hmac = createHmac('sha256', secret);
    hmac.update(baseString);
    const expectedSignature = hmac.digest('hex');

    return this.timingSafeCompare(receivedSignature, expectedSignature);
  }

  /**
   * Timing-safe string comparison
   *
   * Uses constant-time comparison to prevent timing attacks
   */
  private timingSafeCompare(
    received: string,
    expected: string
  ): SignatureVerificationResult {
    try {
      const receivedBuffer = Buffer.from(received, 'hex');
      const expectedBuffer = Buffer.from(expected, 'hex');

      if (receivedBuffer.length !== expectedBuffer.length) {
        return {
          valid: false,
          error: 'Signature length mismatch',
        };
      }

      const isValid = timingSafeEqual(receivedBuffer, expectedBuffer);

      return {
        valid: isValid,
        error: isValid ? undefined : 'Signature verification failed',
      };
    } catch {
      return {
        valid: false,
        error: 'Invalid signature encoding',
      };
    }
  }
}

/**
 * Extract event ID from request headers based on source
 */
export function extractEventId(
  headers: Record<string, string | string[] | undefined>,
  source: string
): string {
  const getHeader = (name: string): string =>
    (Array.isArray(headers[name]) ? headers[name][0] : headers[name]) as string || '';

  switch (source) {
    case 'github':
      return getHeader('x-github-delivery') || `gh-${Date.now()}`;
    case 'gitlab':
      return getHeader('x-gitlab-event-uuid') || `gl-${Date.now()}`;
    case 'linear':
      // Linear includes event ID in payload
      return `ln-${Date.now()}`;
    case 'slack':
      return getHeader('x-slack-request-timestamp') || `sl-${Date.now()}`;
    default:
      return `wh-${Date.now()}`;
  }
}

/**
 * Extract event type from request headers based on source
 */
export function extractEventType(
  headers: Record<string, string | string[] | undefined>,
  source: string,
  payload?: unknown
): string {
  const getHeader = (name: string): string =>
    (Array.isArray(headers[name]) ? headers[name][0] : headers[name]) as string || '';

  switch (source) {
    case 'github':
      return getHeader('x-github-event') || 'unknown';
    case 'gitlab':
      return getHeader('x-gitlab-event') || 'unknown';
    case 'linear':
      // Linear sends event type in payload
      return (payload as Record<string, unknown>)?.type as string || 'unknown';
    case 'slack':
      // Slack sends event type in payload
      return (payload as Record<string, unknown>)?.type as string || 'unknown';
    default:
      return 'unknown';
  }
}

/**
 * Extract signature from request headers based on source
 */
export function extractSignature(
  headers: Record<string, string | string[] | undefined>,
  source: string
): string | undefined {
  const getHeader = (name: string): string | undefined => {
    const val = headers[name];
    return Array.isArray(val) ? val[0] : val;
  };

  switch (source) {
    case 'github':
      return getHeader('x-hub-signature-256');
    case 'gitlab':
      return getHeader('x-gitlab-token');
    case 'linear':
      return getHeader('linear-signature');
    case 'slack':
      return getHeader('x-slack-signature');
    default:
      return undefined;
  }
}
