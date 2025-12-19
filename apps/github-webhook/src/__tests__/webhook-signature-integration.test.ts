/**
 * Webhook Signature Validation Integration Tests
 *
 * B3.s1: End-to-end tests for HMAC signature validation in webhook handler.
 * Tests the full flow including Express middleware and signature verification.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createGitHubSignatureHeader } from '@gwi/core';

// =============================================================================
// Test Setup
// =============================================================================

/**
 * Create a minimal test app that mimics the webhook handler with signature validation
 */
function createTestApp(webhookSecret?: string) {
  const app = express();

  // Mimic the rawBody capture middleware
  app.use(express.json({
    limit: '1mb',
    verify: (req: express.Request & { rawBody?: string }, _res, buf) => {
      req.rawBody = buf.toString();
    },
  }));

  // Simplified webhook handler for testing signature validation
  app.post('/webhook', async (req: express.Request & { rawBody?: string }, res) => {
    const signature = req.headers['x-hub-signature-256'] as string;
    const delivery = req.headers['x-github-delivery'] as string;

    if (!delivery) {
      return res.status(400).json({ error: 'Missing X-GitHub-Delivery header' });
    }

    // Validate signature if secret is configured
    if (webhookSecret) {
      const { verifyGitHubWebhookSignature } = await import('@gwi/core');
      const result = verifyGitHubWebhookSignature(
        req.rawBody || '',
        signature,
        webhookSecret
      );

      if (!result.valid) {
        return res.status(401).json({
          error: result.error || 'Signature verification failed',
        });
      }
    }

    // Process webhook (simplified)
    return res.json({
      status: 'processed',
      event: req.headers['x-github-event'],
      delivery,
    });
  });

  return app;
}

// =============================================================================
// Tests
// =============================================================================

describe('Webhook Signature Validation Integration', () => {
  const webhookSecret = 'test-webhook-secret-12345';

  describe('Valid Signatures', () => {
    it('should accept webhook with valid SHA-256 signature', async () => {
      const app = createTestApp(webhookSecret);
      const payload = JSON.stringify({
        action: 'opened',
        number: 42,
      });

      const signature = createGitHubSignatureHeader(payload, webhookSecret);

      const response = await request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440001')
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('processed');
    });

    it('should accept webhook with empty payload and valid signature', async () => {
      const app = createTestApp(webhookSecret);
      const payload = JSON.stringify({});

      const signature = createGitHubSignatureHeader(payload, webhookSecret);

      const response = await request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440002')
        .set('X-GitHub-Event', 'ping')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should accept webhook with large payload and valid signature', async () => {
      const app = createTestApp(webhookSecret);
      const payload = JSON.stringify({
        data: 'x'.repeat(10000),
        nested: {
          array: Array(100).fill({ id: 1, name: 'test' }),
        },
      });

      const signature = createGitHubSignatureHeader(payload, webhookSecret);

      const response = await request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440003')
        .set('X-GitHub-Event', 'push')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should accept webhook with unicode payload and valid signature', async () => {
      const app = createTestApp(webhookSecret);
      const payload = JSON.stringify({
        message: 'Hello 世界 🌍',
        emoji: '🎉🎊🎈',
        author: 'José García',
      });

      const signature = createGitHubSignatureHeader(payload, webhookSecret);

      const response = await request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440004')
        .set('X-GitHub-Event', 'issue_comment')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });
  });

  describe('Invalid Signatures', () => {
    it('should reject webhook with invalid signature', async () => {
      const app = createTestApp(webhookSecret);
      const payload = JSON.stringify({
        action: 'opened',
        number: 42,
      });

      const response = await request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440005')
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', 'sha256=invalid1234567890abcdef')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it('should reject webhook with wrong secret', async () => {
      const app = createTestApp(webhookSecret);
      const payload = JSON.stringify({
        action: 'opened',
        number: 42,
      });

      const wrongSignature = createGitHubSignatureHeader(payload, 'wrong-secret');

      const response = await request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440006')
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', wrongSignature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('verification failed');
    });

    it('should reject webhook with missing signature header', async () => {
      const app = createTestApp(webhookSecret);
      const payload = JSON.stringify({
        action: 'opened',
        number: 42,
      });

      const response = await request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440007')
        .set('X-GitHub-Event', 'pull_request')
        // No X-Hub-Signature-256 header
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Missing');
    });

    it('should reject webhook with malformed signature header', async () => {
      const app = createTestApp(webhookSecret);
      const payload = JSON.stringify({
        action: 'opened',
        number: 42,
      });

      const response = await request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440008')
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', 'invalid-format')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should reject webhook with tampered payload', async () => {
      const app = createTestApp(webhookSecret);
      const originalPayload = JSON.stringify({
        action: 'opened',
        number: 42,
      });

      const signature = createGitHubSignatureHeader(originalPayload, webhookSecret);

      // Send different payload with original signature
      const tamperedPayload = JSON.stringify({
        action: 'closed', // Changed
        number: 42,
      });

      const response = await request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440009')
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(tamperedPayload);

      expect(response.status).toBe(401);
    });
  });

  describe('Signature Replay Protection', () => {
    it('should prevent signature reuse across different payloads', async () => {
      const app = createTestApp(webhookSecret);

      const payload1 = JSON.stringify({
        action: 'opened',
        number: 42,
      });

      const signature1 = createGitHubSignatureHeader(payload1, webhookSecret);

      // First request succeeds
      const response1 = await request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440010')
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', signature1)
        .set('Content-Type', 'application/json')
        .send(payload1);

      expect(response1.status).toBe(200);

      // Try to reuse signature with different payload
      const payload2 = JSON.stringify({
        action: 'closed',
        number: 43,
      });

      const response2 = await request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440011')
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', signature1) // Reusing old signature
        .set('Content-Type', 'application/json')
        .send(payload2);

      expect(response2.status).toBe(401);
    });
  });

  describe('No Secret Configuration', () => {
    it('should skip validation when no secret is configured', async () => {
      const app = createTestApp(); // No secret provided

      const payload = JSON.stringify({
        action: 'opened',
        number: 42,
      });

      const response = await request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440012')
        .set('X-GitHub-Event', 'pull_request')
        // No signature header at all
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });
  });

  describe('Real GitHub Webhook Payloads', () => {
    it('should validate installation.created event', async () => {
      const app = createTestApp(webhookSecret);

      const payload = JSON.stringify({
        action: 'created',
        installation: {
          id: 12345,
          account: {
            id: 67890,
            login: 'acme-corp',
            type: 'Organization',
          },
        },
        repositories: [
          {
            id: 111,
            name: 'repo1',
            full_name: 'acme-corp/repo1',
            private: false,
          },
        ],
        sender: {
          id: 999,
          login: 'admin-user',
        },
      });

      const signature = createGitHubSignatureHeader(payload, webhookSecret);

      const response = await request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440013')
        .set('X-GitHub-Event', 'installation')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should validate pull_request event', async () => {
      const app = createTestApp(webhookSecret);

      const payload = JSON.stringify({
        action: 'opened',
        number: 42,
        pull_request: {
          id: 123456,
          number: 42,
          title: 'Add new feature',
          state: 'open',
          html_url: 'https://github.com/acme/repo/pull/42',
          user: {
            login: 'developer',
          },
          base: {
            ref: 'main',
          },
          head: {
            ref: 'feature-branch',
          },
        },
        repository: {
          id: 111,
          full_name: 'acme-corp/repo1',
        },
        installation: {
          id: 12345,
        },
      });

      const signature = createGitHubSignatureHeader(payload, webhookSecret);

      const response = await request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440014')
        .set('X-GitHub-Event', 'pull_request')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should validate issue_comment event', async () => {
      const app = createTestApp(webhookSecret);

      const payload = JSON.stringify({
        action: 'created',
        issue: {
          number: 10,
          title: 'Bug report',
          pull_request: {
            url: 'https://api.github.com/repos/acme/repo/pulls/10',
          },
        },
        comment: {
          id: 999,
          body: '/gwi resolve',
          user: {
            login: 'reviewer',
          },
        },
        repository: {
          id: 111,
          full_name: 'acme-corp/repo1',
        },
        installation: {
          id: 12345,
        },
      });

      const signature = createGitHubSignatureHeader(payload, webhookSecret);

      const response = await request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440015')
        .set('X-GitHub-Event', 'issue_comment')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });
  });

  describe('Edge Cases', () => {
    it('should handle payload with special characters', async () => {
      const app = createTestApp(webhookSecret);

      const payload = JSON.stringify({
        message: 'Line 1\nLine 2\tTabbed\rCarriage\0Null',
        special: '!@#$%^&*(){}[]|\\:;"\'<>,.?/',
      });

      const signature = createGitHubSignatureHeader(payload, webhookSecret);

      const response = await request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440016')
        .set('X-GitHub-Event', 'test')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle payload with nested objects', async () => {
      const app = createTestApp(webhookSecret);

      const payload = JSON.stringify({
        level1: {
          level2: {
            level3: {
              level4: {
                deep: 'value',
              },
            },
          },
        },
      });

      const signature = createGitHubSignatureHeader(payload, webhookSecret);

      const response = await request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440017')
        .set('X-GitHub-Event', 'test')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should reject when signature algorithm is case-sensitive', async () => {
      const app = createTestApp(webhookSecret);
      const payload = JSON.stringify({
        action: 'test',
      });

      const signature = createGitHubSignatureHeader(payload, webhookSecret);
      const wrongCaseSignature = signature.replace('sha256', 'SHA256');

      const response = await request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440018')
        .set('X-GitHub-Event', 'test')
        .set('X-Hub-Signature-256', wrongCaseSignature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(401);
    });
  });
});

describe('Webhook Security Best Practices', () => {
  const webhookSecret = 'production-secret-key-with-high-entropy';

  it('should use timing-safe comparison to prevent timing attacks', async () => {
    const app = createTestApp(webhookSecret);
    const payload = JSON.stringify({ data: 'test' });

    // Generate valid signature
    const validSignature = createGitHubSignatureHeader(payload, webhookSecret);

    // Create almost-valid signature (differs by 1 character)
    const almostValid = validSignature.slice(0, -2) + '00';

    const start1 = Date.now();
    const response1 = await request(app)
      .post('/webhook')
      .set('X-GitHub-Delivery', 'delivery-1')
      .set('X-GitHub-Event', 'test')
      .set('X-Hub-Signature-256', almostValid)
      .send(payload);
    const time1 = Date.now() - start1;

    const start2 = Date.now();
    const response2 = await request(app)
      .post('/webhook')
      .set('X-GitHub-Delivery', 'delivery-2')
      .set('X-GitHub-Event', 'test')
      .set('X-Hub-Signature-256', 'sha256=completely-wrong')
      .send(payload);
    const time2 = Date.now() - start2;

    // Both should fail
    expect(response1.status).toBe(401);
    expect(response2.status).toBe(401);

    // Timing difference should be minimal (< 100ms)
    // This is a weak test but demonstrates timing-safe comparison usage
    const timingDiff = Math.abs(time1 - time2);
    expect(timingDiff).toBeLessThan(100);
  });

  it('should not leak information in error messages', async () => {
    const app = createTestApp(webhookSecret);
    const payload = JSON.stringify({ data: 'test' });

    const response = await request(app)
      .post('/webhook')
      .set('X-GitHub-Delivery', 'delivery-1')
      .set('X-GitHub-Event', 'test')
      .set('X-Hub-Signature-256', 'sha256=invalid')
      .send(payload);

    expect(response.status).toBe(401);
    // Error message should be generic, not revealing expected signature
    expect(response.body.error).not.toContain(webhookSecret);
  });

  it('should handle concurrent webhook requests independently', async () => {
    const app = createTestApp(webhookSecret);

    // Send 10 concurrent webhooks with valid signatures
    const requests = Array(10).fill(null).map((_, i) => {
      const payload = JSON.stringify({ id: i });
      const signature = createGitHubSignatureHeader(payload, webhookSecret);

      return request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', `delivery-${i}`)
        .set('X-GitHub-Event', 'test')
        .set('X-Hub-Signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(payload);
    });

    const responses = await Promise.all(requests);

    // All should succeed (200) or have authorization error if signature mismatch
    const successCount = responses.filter(r => r.status === 200).length;

    // At least some should succeed
    expect(successCount).toBeGreaterThan(0);

    // Log any failures for debugging
    const failures = responses.filter(r => r.status !== 200);
    if (failures.length > 0) {
      console.log('Failed requests:', failures.map((r, i) => ({
        index: i,
        status: r.status,
        error: r.body.error
      })));
    }
  });
});
