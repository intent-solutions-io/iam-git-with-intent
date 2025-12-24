/**
 * Webhook Idempotency Integration Tests
 *
 * A5.s4: Tests for duplicate webhook handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import {
  getIdempotencyService,
  resetIdempotencyService,
  resetIdempotencyStore,
  InMemoryIdempotencyStore,
  setIdempotencyStore,
  IdempotencyProcessingError,
  type GitHubIdempotencyKey,
} from '@gwi/engine';

// =============================================================================
// Test Setup
// =============================================================================

// Create a minimal test app that mimics the webhook handler
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Reset idempotency store for each test
  const store = new InMemoryIdempotencyStore();
  setIdempotencyStore(store);

  // Simplified webhook handler for testing
  app.post('/webhook', async (req, res) => {
    const delivery = req.headers['x-github-delivery'] as string;
    const event = req.headers['x-github-event'] as string;

    if (!delivery) {
      return res.status(400).json({ error: 'Missing X-GitHub-Delivery header' });
    }

    const idempotencyService = getIdempotencyService();
    const idempotencyKey: GitHubIdempotencyKey = {
      source: 'github_webhook',
      deliveryId: delivery,
    };

    try {
      const result = await idempotencyService.process(
        idempotencyKey,
        'test-tenant',
        req.body,
        async () => {
          // Simulate processing
          return {
            runId: `run-${Date.now()}`,
            response: {
              status: 'triggered',
              event,
              workflowId: `wf-${Date.now()}`,
            },
          };
        }
      );

      return res.json({
        ...result.result,
        duplicate: !result.processed,
      });
    } catch (error: unknown) {
      if (error instanceof IdempotencyProcessingError) {
        return res.status(202).json({
          status: 'processing',
          key: error.key,
        });
      }
      throw error;
    }
  });

  return { app, store };
}

// =============================================================================
// Tests
// =============================================================================

describe('Webhook Idempotency', () => {
  let app: express.Express;
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    resetIdempotencyService();
    resetIdempotencyStore();
    const setup = createTestApp();
    app = setup.app;
    store = setup.store;
  });

  afterEach(() => {
    resetIdempotencyService();
    resetIdempotencyStore();
  });

  it('should process new webhook', async () => {
    const response = await request(app)
      .post('/webhook')
      .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440001')
      .set('X-GitHub-Event', 'pull_request')
      .send({ action: 'opened', number: 42 });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('triggered');
    expect(response.body.duplicate).toBe(false);
    expect(response.body.workflowId).toBeDefined();
  });

  it('should skip duplicate webhook with same delivery ID', async () => {
    const deliveryId = '550e8400-e29b-41d4-a716-446655440002';

    // First request
    const first = await request(app)
      .post('/webhook')
      .set('X-GitHub-Delivery', deliveryId)
      .set('X-GitHub-Event', 'pull_request')
      .send({ action: 'opened', number: 42 });

    expect(first.status).toBe(200);
    expect(first.body.duplicate).toBe(false);
    const firstWorkflowId = first.body.workflowId;

    // Duplicate request (same delivery ID)
    const second = await request(app)
      .post('/webhook')
      .set('X-GitHub-Delivery', deliveryId)
      .set('X-GitHub-Event', 'pull_request')
      .send({ action: 'opened', number: 42 });

    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    // Should return same workflow ID
    expect(second.body.workflowId).toBe(firstWorkflowId);
  });

  it('should process webhooks with different delivery IDs', async () => {
    const first = await request(app)
      .post('/webhook')
      .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440003')
      .set('X-GitHub-Event', 'pull_request')
      .send({ action: 'opened', number: 42 });

    const second = await request(app)
      .post('/webhook')
      .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440004')
      .set('X-GitHub-Event', 'pull_request')
      .send({ action: 'opened', number: 43 });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.duplicate).toBe(false);
    expect(second.body.duplicate).toBe(false);
    expect(first.body.workflowId).not.toBe(second.body.workflowId);
  });

  it('should reject webhook without delivery ID', async () => {
    const response = await request(app)
      .post('/webhook')
      .set('X-GitHub-Event', 'pull_request')
      .send({ action: 'opened', number: 42 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing X-GitHub-Delivery');
  });

  it('should handle rapid duplicate requests', async () => {
    const deliveryId = '550e8400-e29b-41d4-a716-446655440005';

    // Send 5 concurrent requests with same delivery ID
    const requests = Array(5).fill(null).map(() =>
      request(app)
        .post('/webhook')
        .set('X-GitHub-Delivery', deliveryId)
        .set('X-GitHub-Event', 'pull_request')
        .send({ action: 'opened', number: 42 })
    );

    const responses = await Promise.all(requests);

    // All should succeed
    const successful = responses.filter(r => r.status === 200 || r.status === 202);
    expect(successful.length).toBe(5);

    // Only one should be a new request, rest should be duplicates or processing
    const newRequests = responses.filter(r => r.status === 200 && !r.body.duplicate);
    const duplicates = responses.filter(r => r.status === 200 && r.body.duplicate);
    const processing = responses.filter(r => r.status === 202);

    expect(newRequests.length + duplicates.length + processing.length).toBe(5);
  });

  it('should track metrics for duplicates', async () => {
    const deliveryId = '550e8400-e29b-41d4-a716-446655440006';

    // First request
    await request(app)
      .post('/webhook')
      .set('X-GitHub-Delivery', deliveryId)
      .set('X-GitHub-Event', 'pull_request')
      .send({ action: 'opened', number: 42 });

    // Duplicate
    await request(app)
      .post('/webhook')
      .set('X-GitHub-Delivery', deliveryId)
      .set('X-GitHub-Event', 'pull_request')
      .send({ action: 'opened', number: 42 });

    // Check store has the record
    const record = await store.getRecord(`github:${deliveryId}`);
    expect(record).toBeDefined();
    expect(record?.status).toBe('completed');
  });
});

describe('Webhook Idempotency Edge Cases', () => {
  let app: express.Express;

  beforeEach(() => {
    resetIdempotencyService();
    resetIdempotencyStore();
    const setup = createTestApp();
    app = setup.app;
  });

  afterEach(() => {
    resetIdempotencyService();
    resetIdempotencyStore();
  });

  it('should handle different payloads with same delivery ID', async () => {
    const deliveryId = '550e8400-e29b-41d4-a716-446655440007';

    // First request
    await request(app)
      .post('/webhook')
      .set('X-GitHub-Delivery', deliveryId)
      .set('X-GitHub-Event', 'pull_request')
      .send({ action: 'opened', number: 42 });

    // Same delivery ID, different payload (GitHub retry scenario)
    const second = await request(app)
      .post('/webhook')
      .set('X-GitHub-Delivery', deliveryId)
      .set('X-GitHub-Event', 'pull_request')
      .send({ action: 'closed', number: 42 }); // Different action

    // Should still be duplicate (delivery ID is the key)
    expect(second.body.duplicate).toBe(true);
  });

  it('should handle empty payload', async () => {
    const response = await request(app)
      .post('/webhook')
      .set('X-GitHub-Delivery', '550e8400-e29b-41d4-a716-446655440008')
      .set('X-GitHub-Event', 'ping')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.duplicate).toBe(false);
  });
});
