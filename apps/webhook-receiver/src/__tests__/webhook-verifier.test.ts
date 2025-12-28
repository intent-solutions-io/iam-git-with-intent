/**
 * Webhook Verifier Tests
 *
 * Epic B: Data Ingestion & Connector Framework
 * Task B3.4: Add webhook receiver service
 *
 * Tests HMAC signature verification for all supported sources.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'crypto';
import { WebhookVerifier, extractEventId, extractEventType, extractSignature } from '../webhook/WebhookVerifier.js';
import type { WebhookEvent, ISecretManager, ILogger } from '../types.js';

// Mock logger
const mockLogger: ILogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

// Mock secret manager
class MockSecretManager implements ISecretManager {
  private secrets: Map<string, string> = new Map();

  setSecret(tenantId: string, key: string, value: string): void {
    this.secrets.set(`${tenantId}:${key}`, value);
  }

  async getSecret(tenantId: string, key: string): Promise<string | null> {
    return this.secrets.get(`${tenantId}:${key}`) || null;
  }
}

describe('WebhookVerifier', () => {
  let verifier: WebhookVerifier;
  let secretManager: MockSecretManager;
  const tenantId = 'test-tenant';

  beforeEach(() => {
    secretManager = new MockSecretManager();
    verifier = new WebhookVerifier(secretManager, mockLogger);
    vi.clearAllMocks();
  });

  describe('GitHub verification', () => {
    const secret = 'github-webhook-secret-12345';

    beforeEach(() => {
      secretManager.setSecret(tenantId, 'webhook-secret-github', secret);
    });

    it('should verify valid GitHub signature', async () => {
      const payload = JSON.stringify({ action: 'opened', pull_request: { id: 1 } });
      const hmac = createHmac('sha256', secret);
      hmac.update(payload);
      const signature = `sha256=${hmac.digest('hex')}`;

      const event: WebhookEvent = {
        id: 'gh-123',
        source: 'github',
        type: 'pull_request',
        timestamp: new Date().toISOString(),
        payload: JSON.parse(payload),
        signature,
      };

      const result = await verifier.verify(event, tenantId, payload);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject missing signature', async () => {
      const event: WebhookEvent = {
        id: 'gh-123',
        source: 'github',
        type: 'pull_request',
        timestamp: new Date().toISOString(),
        payload: {},
        signature: undefined,
      };

      const result = await verifier.verify(event, tenantId, '{}');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing');
    });

    it('should reject invalid signature format', async () => {
      const event: WebhookEvent = {
        id: 'gh-123',
        source: 'github',
        type: 'pull_request',
        timestamp: new Date().toISOString(),
        payload: {},
        signature: 'invalid-signature',
      };

      const result = await verifier.verify(event, tenantId, '{}');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid signature format');
    });

    it('should reject wrong signature', async () => {
      const event: WebhookEvent = {
        id: 'gh-123',
        source: 'github',
        type: 'pull_request',
        timestamp: new Date().toISOString(),
        payload: {},
        signature: 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
      };

      const result = await verifier.verify(event, tenantId, '{}');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('failed');
    });
  });

  describe('GitLab verification', () => {
    const secret = 'gitlab-token-secret';

    beforeEach(() => {
      secretManager.setSecret(tenantId, 'webhook-secret-gitlab', secret);
    });

    it('should verify valid GitLab token', async () => {
      const event: WebhookEvent = {
        id: 'gl-123',
        source: 'gitlab',
        type: 'merge_request',
        timestamp: new Date().toISOString(),
        payload: {},
        signature: secret,
      };

      const result = await verifier.verify(event, tenantId, '{}');
      expect(result.valid).toBe(true);
    });

    it('should reject wrong token', async () => {
      const event: WebhookEvent = {
        id: 'gl-123',
        source: 'gitlab',
        type: 'merge_request',
        timestamp: new Date().toISOString(),
        payload: {},
        signature: 'wrong-token',
      };

      const result = await verifier.verify(event, tenantId, '{}');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('failed');
    });
  });

  describe('Linear verification', () => {
    const secret = 'linear-webhook-secret';

    beforeEach(() => {
      secretManager.setSecret(tenantId, 'webhook-secret-linear', secret);
    });

    it('should verify valid Linear signature', async () => {
      const payload = JSON.stringify({ type: 'Issue', action: 'create' });
      const hmac = createHmac('sha256', secret);
      hmac.update(payload);
      const signature = hmac.digest('hex');

      const event: WebhookEvent = {
        id: 'ln-123',
        source: 'linear',
        type: 'Issue',
        timestamp: new Date().toISOString(),
        payload: JSON.parse(payload),
        signature,
      };

      const result = await verifier.verify(event, tenantId, payload);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid Linear signature', async () => {
      const event: WebhookEvent = {
        id: 'ln-123',
        source: 'linear',
        type: 'Issue',
        timestamp: new Date().toISOString(),
        payload: {},
        signature: '0000000000000000000000000000000000000000000000000000000000000000',
      };

      const result = await verifier.verify(event, tenantId, '{}');
      expect(result.valid).toBe(false);
    });
  });

  describe('Slack verification', () => {
    const secret = 'slack-signing-secret';

    beforeEach(() => {
      secretManager.setSecret(tenantId, 'webhook-secret-slack', secret);
    });

    it('should verify valid Slack signature', async () => {
      const payload = JSON.stringify({ type: 'event_callback' });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const baseString = `v0:${timestamp}:${payload}`;
      const hmac = createHmac('sha256', secret);
      hmac.update(baseString);
      const signature = `v0=${hmac.digest('hex')}`;

      const event: WebhookEvent = {
        id: 'sl-123',
        source: 'slack',
        type: 'event_callback',
        timestamp: new Date().toISOString(),
        payload: JSON.parse(payload),
        signature,
        headers: {
          'x-slack-request-timestamp': timestamp,
        },
      };

      const result = await verifier.verify(event, tenantId, payload);
      expect(result.valid).toBe(true);
    });

    it('should reject old Slack timestamp (replay attack)', async () => {
      const payload = JSON.stringify({ type: 'event_callback' });
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString(); // 400 seconds old
      const baseString = `v0:${oldTimestamp}:${payload}`;
      const hmac = createHmac('sha256', secret);
      hmac.update(baseString);
      const signature = `v0=${hmac.digest('hex')}`;

      const event: WebhookEvent = {
        id: 'sl-123',
        source: 'slack',
        type: 'event_callback',
        timestamp: new Date().toISOString(),
        payload: JSON.parse(payload),
        signature,
        headers: {
          'x-slack-request-timestamp': oldTimestamp,
        },
      };

      const result = await verifier.verify(event, tenantId, payload);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too old');
    });

    it('should reject missing timestamp', async () => {
      const event: WebhookEvent = {
        id: 'sl-123',
        source: 'slack',
        type: 'event_callback',
        timestamp: new Date().toISOString(),
        payload: {},
        signature: 'v0=abc123',
        headers: {},
      };

      const result = await verifier.verify(event, tenantId, '{}');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('timestamp');
    });
  });

  describe('Secret not found', () => {
    it('should reject when secret not configured', async () => {
      const event: WebhookEvent = {
        id: 'test-123',
        source: 'github',
        type: 'push',
        timestamp: new Date().toISOString(),
        payload: {},
        signature: 'sha256=abc123',
      };

      const result = await verifier.verify(event, 'unknown-tenant', '{}');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not configured');
    });
  });
});

describe('Header extraction', () => {
  describe('extractEventId', () => {
    it('should extract GitHub delivery ID', () => {
      const headers = { 'x-github-delivery': 'abc-123' };
      expect(extractEventId(headers, 'github')).toBe('abc-123');
    });

    it('should extract GitLab event UUID', () => {
      const headers = { 'x-gitlab-event-uuid': 'uuid-456' };
      expect(extractEventId(headers, 'gitlab')).toBe('uuid-456');
    });

    it('should generate fallback ID', () => {
      const headers = {};
      const id = extractEventId(headers, 'github');
      expect(id).toMatch(/^gh-\d+$/);
    });
  });

  describe('extractEventType', () => {
    it('should extract GitHub event type', () => {
      const headers = { 'x-github-event': 'pull_request' };
      expect(extractEventType(headers, 'github')).toBe('pull_request');
    });

    it('should extract GitLab event type', () => {
      const headers = { 'x-gitlab-event': 'Merge Request Hook' };
      expect(extractEventType(headers, 'gitlab')).toBe('Merge Request Hook');
    });

    it('should extract Linear event type from payload', () => {
      const headers = {};
      const payload = { type: 'Issue' };
      expect(extractEventType(headers, 'linear', payload)).toBe('Issue');
    });

    it('should extract Slack event type from payload', () => {
      const headers = {};
      const payload = { type: 'event_callback' };
      expect(extractEventType(headers, 'slack', payload)).toBe('event_callback');
    });
  });

  describe('extractSignature', () => {
    it('should extract GitHub signature', () => {
      const headers = { 'x-hub-signature-256': 'sha256=abc' };
      expect(extractSignature(headers, 'github')).toBe('sha256=abc');
    });

    it('should extract GitLab token', () => {
      const headers = { 'x-gitlab-token': 'my-token' };
      expect(extractSignature(headers, 'gitlab')).toBe('my-token');
    });

    it('should extract Linear signature', () => {
      const headers = { 'linear-signature': 'hex-sig' };
      expect(extractSignature(headers, 'linear')).toBe('hex-sig');
    });

    it('should extract Slack signature', () => {
      const headers = { 'x-slack-signature': 'v0=abc' };
      expect(extractSignature(headers, 'slack')).toBe('v0=abc');
    });

    it('should return undefined for missing signature', () => {
      expect(extractSignature({}, 'github')).toBeUndefined();
    });
  });
});
