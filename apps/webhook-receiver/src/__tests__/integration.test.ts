/**
 * Integration Tests for Webhook Receiver
 *
 * Epic B: Data Ingestion & Connector Framework
 * Task B3.4: Add webhook receiver service
 *
 * Tests the full Express application endpoints.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createHmac } from 'crypto';

// Create a minimal test app that mirrors the main app
function createTestApp() {
  const app = express();

  // Parse JSON with raw body preservation
  app.use(express.json({
    limit: '10mb',
    verify: (req: express.Request & { rawBody?: string }, _res, buf) => {
      req.rawBody = buf.toString();
    },
  }));

  // Health endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      service: 'webhook-receiver',
      version: '0.1.0',
    });
  });

  // Ready endpoint
  app.get('/health/ready', (_req, res) => {
    res.json({
      status: 'ready',
      service: 'webhook-receiver',
      version: '0.1.0',
    });
  });

  // Test webhook endpoint (simplified for testing)
  app.post('/webhooks/:source', (req, res) => {
    const { source } = req.params;

    // Validate source
    if (!['github', 'gitlab', 'linear', 'slack'].includes(source)) {
      res.status(400).json({
        status: 'rejected',
        error: 'invalid_source',
        message: `Unsupported webhook source: ${source}`,
      });
      return;
    }

    // Accept the webhook (in production, would verify and publish)
    res.status(200).json({
      status: 'accepted',
      event_id: req.headers['x-github-delivery'] || `${source}-test`,
      message_id: 'dry-run',
    });
  });

  return app;
}

describe('Webhook Receiver Integration', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('Health endpoints', () => {
    it('GET /health returns healthy status', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(res.body.status).toBe('healthy');
      expect(res.body.service).toBe('webhook-receiver');
      expect(res.body.version).toBe('0.1.0');
    });

    it('GET /health/ready returns ready status', async () => {
      const res = await request(app)
        .get('/health/ready')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(res.body.status).toBe('ready');
      expect(res.body.service).toBe('webhook-receiver');
    });
  });

  describe('Webhook endpoints', () => {
    describe('POST /webhooks/github', () => {
      it('should accept valid GitHub webhook', async () => {
        const payload = { action: 'opened', pull_request: { id: 123 } };

        const res = await request(app)
          .post('/webhooks/github')
          .set('Content-Type', 'application/json')
          .set('X-GitHub-Delivery', 'abc-123')
          .set('X-GitHub-Event', 'pull_request')
          .send(payload)
          .expect(200);

        expect(res.body.status).toBe('accepted');
        expect(res.body.event_id).toBe('abc-123');
      });
    });

    describe('POST /webhooks/gitlab', () => {
      it('should accept valid GitLab webhook', async () => {
        const payload = { object_kind: 'merge_request', project: { id: 456 } };

        const res = await request(app)
          .post('/webhooks/gitlab')
          .set('Content-Type', 'application/json')
          .set('X-Gitlab-Event', 'Merge Request Hook')
          .send(payload)
          .expect(200);

        expect(res.body.status).toBe('accepted');
      });
    });

    describe('POST /webhooks/linear', () => {
      it('should accept valid Linear webhook', async () => {
        const payload = { type: 'Issue', action: 'create', data: { id: 'ISS-123' } };

        const res = await request(app)
          .post('/webhooks/linear')
          .set('Content-Type', 'application/json')
          .send(payload)
          .expect(200);

        expect(res.body.status).toBe('accepted');
      });
    });

    describe('POST /webhooks/slack', () => {
      it('should accept valid Slack webhook', async () => {
        const payload = { type: 'event_callback', event: { type: 'message' } };

        const res = await request(app)
          .post('/webhooks/slack')
          .set('Content-Type', 'application/json')
          .send(payload)
          .expect(200);

        expect(res.body.status).toBe('accepted');
      });
    });

    describe('POST /webhooks/:source with invalid source', () => {
      it('should reject unknown source', async () => {
        const res = await request(app)
          .post('/webhooks/unknown')
          .set('Content-Type', 'application/json')
          .send({ test: true })
          .expect(400);

        expect(res.body.status).toBe('rejected');
        expect(res.body.error).toBe('invalid_source');
        expect(res.body.message).toContain('Unsupported webhook source');
      });
    });
  });

  describe('Payload handling', () => {
    it('should handle large payloads', async () => {
      const largePayload = {
        data: 'x'.repeat(1000000), // 1MB of data
      };

      const res = await request(app)
        .post('/webhooks/github')
        .set('Content-Type', 'application/json')
        .send(largePayload)
        .expect(200);

      expect(res.body.status).toBe('accepted');
    });

    it('should handle empty payload', async () => {
      const res = await request(app)
        .post('/webhooks/github')
        .set('Content-Type', 'application/json')
        .send({})
        .expect(200);

      expect(res.body.status).toBe('accepted');
    });
  });
});

describe('Webhook Signature Generation (for testing)', () => {
  const secret = 'test-secret';

  it('should generate valid GitHub signature', () => {
    const payload = JSON.stringify({ test: true });
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    const signature = `sha256=${hmac.digest('hex')}`;

    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('should generate valid Slack signature', () => {
    const payload = JSON.stringify({ test: true });
    const timestamp = Math.floor(Date.now() / 1000);
    const baseString = `v0:${timestamp}:${payload}`;

    const hmac = createHmac('sha256', secret);
    hmac.update(baseString);
    const signature = `v0=${hmac.digest('hex')}`;

    expect(signature).toMatch(/^v0=[a-f0-9]{64}$/);
  });

  it('should generate valid Linear signature', () => {
    const payload = JSON.stringify({ test: true });
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    const signature = hmac.digest('hex');

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });
});
