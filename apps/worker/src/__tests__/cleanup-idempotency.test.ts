/**
 * Idempotency Cleanup Endpoint Tests
 *
 * Tests for the /tasks/cleanup-idempotency scheduled task endpoint.
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
  IdempotencyService,
  setIdempotencyService,
} from '@gwi/engine';

// =============================================================================
// Test Setup
// =============================================================================

/**
 * Create a minimal test app with the cleanup endpoint
 */
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Reset idempotency store for each test
  const store = new InMemoryIdempotencyStore();
  setIdempotencyStore(store);

  // Cleanup endpoint (mirrors worker implementation)
  app.post('/tasks/cleanup-idempotency', async (req, res) => {
    const startTime = Date.now();

    try {
      const idempotencyService = getIdempotencyService();
      let totalDeleted = 0;
      let batchCount = 0;
      const maxBatches = 20;

      while (batchCount < maxBatches) {
        const deleted = await idempotencyService.cleanup();
        totalDeleted += deleted;
        batchCount++;

        if (deleted < 500) {
          break;
        }
      }

      const durationMs = Date.now() - startTime;

      return res.json({
        status: 'completed',
        totalDeleted,
        batchCount,
        durationMs,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const durationMs = Date.now() - startTime;

      return res.status(500).json({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs,
      });
    }
  });

  return { app, store };
}

// =============================================================================
// Tests
// =============================================================================

describe('Idempotency Cleanup Endpoint', () => {
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

  it('should return success with zero deleted when no expired records', async () => {
    const response = await request(app)
      .post('/tasks/cleanup-idempotency')
      .set('User-Agent', 'Google-Cloud-Scheduler')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('completed');
    expect(response.body.totalDeleted).toBe(0);
    expect(response.body.batchCount).toBe(1);
    expect(response.body.durationMs).toBeDefined();
    expect(response.body.timestamp).toBeDefined();
  });

  it('should clean up expired records', async () => {
    // Create some records that are expired
    const service = getIdempotencyService();

    // Process a request (creates a record)
    await service.process(
      { source: 'github_webhook', deliveryId: 'test-delivery-1' },
      'test-tenant',
      { action: 'opened' },
      async () => ({ runId: 'run-1', response: { status: 'ok' } })
    );

    // Manually expire the record by modifying the store
    const record = await store.getRecord('github:test-delivery-1');
    if (record) {
      record.expiresAt = new Date(Date.now() - 1000); // Expired 1 second ago
    }

    // Run cleanup
    const response = await request(app)
      .post('/tasks/cleanup-idempotency')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('completed');
    expect(response.body.totalDeleted).toBe(1);
  });

  it('should handle multiple batches', async () => {
    // Create a mock service that returns counts simulating batch processing
    let callCount = 0;
    const mockService = new IdempotencyService();
    const originalCleanup = mockService.cleanup.bind(mockService);

    // Override cleanup to simulate batches
    vi.spyOn(mockService, 'cleanup').mockImplementation(async () => {
      callCount++;
      // First batch returns 500 (full), second returns 50 (partial)
      return callCount === 1 ? 500 : 50;
    });

    setIdempotencyService(mockService);

    const response = await request(app)
      .post('/tasks/cleanup-idempotency')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('completed');
    expect(response.body.totalDeleted).toBe(550);
    expect(response.body.batchCount).toBe(2);
  });

  it('should limit batches to prevent runaway cleanup', async () => {
    // Create a mock service that always returns full batches
    const mockService = new IdempotencyService();
    vi.spyOn(mockService, 'cleanup').mockResolvedValue(500);

    setIdempotencyService(mockService);

    const response = await request(app)
      .post('/tasks/cleanup-idempotency')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('completed');
    expect(response.body.totalDeleted).toBe(10000); // 20 batches * 500
    expect(response.body.batchCount).toBe(20);
  });

  it('should handle errors gracefully', async () => {
    // Create a mock service that throws an error
    const mockService = new IdempotencyService();
    vi.spyOn(mockService, 'cleanup').mockRejectedValue(new Error('Database connection failed'));

    setIdempotencyService(mockService);

    const response = await request(app)
      .post('/tasks/cleanup-idempotency')
      .send({});

    expect(response.status).toBe(500);
    expect(response.body.status).toBe('failed');
    expect(response.body.error).toBe('Database connection failed');
    expect(response.body.durationMs).toBeDefined();
  });
});
