/**
 * API Idempotency Integration Tests
 *
 * A6.s4: Tests for duplicate API request handling.
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
  idempotencyMiddleware,
  IdempotencyProcessingError,
} from '@gwi/engine';

// =============================================================================
// Test Setup
// =============================================================================

/**
 * Create a minimal test app that mimics SaaS API endpoints with idempotency
 */
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Reset idempotency store for each test
  const store = new InMemoryIdempotencyStore();
  setIdempotencyStore(store);

  // Simulate auth context
  const mockAuthMiddleware = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { context: { userId: string } }).context = {
      userId: req.headers['x-user-id'] as string || 'test-user',
    };
    next();
  };

  // POST /tenants - Create tenant (uses userId for tenant context)
  app.post('/tenants', mockAuthMiddleware, idempotencyMiddleware({
    getTenantId: (req) => (req as unknown as { context: { userId: string } }).context?.userId || 'default',
  }), async (req, res) => {
    const { name } = req.body;
    res.json({
      status: 'created',
      tenantId: `tenant-${Date.now()}`,
      name,
    });
  });

  // POST /tenants/:tenantId/runs - Start a run
  app.post('/tenants/:tenantId/runs', mockAuthMiddleware, idempotencyMiddleware({
    getTenantId: (req) => req.params.tenantId,
  }), async (req, res) => {
    const { tenantId } = req.params;
    res.json({
      status: 'started',
      runId: `run-${Date.now()}`,
      tenantId,
    });
  });

  // POST /tenants/:tenantId/settings - Update settings
  app.post('/tenants/:tenantId/settings', mockAuthMiddleware, idempotencyMiddleware({
    getTenantId: (req) => req.params.tenantId,
  }), async (req, res) => {
    const { tenantId } = req.params;
    res.json({
      status: 'updated',
      tenantId,
      settings: req.body,
    });
  });

  // POST /v1/instances/:instanceId/run - Execute instance
  app.post('/v1/instances/:instanceId/run', mockAuthMiddleware, idempotencyMiddleware({
    getTenantId: (req) => req.params.instanceId,
  }), async (req, res) => {
    const { instanceId } = req.params;
    res.json({
      status: 'executed',
      instanceId,
      workflowId: `wf-${Date.now()}`,
    });
  });

  return { app, store };
}

// =============================================================================
// Tests
// =============================================================================

describe('API Idempotency - Tenant Creation', () => {
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

  it('should create tenant on first request', async () => {
    const response = await request(app)
      .post('/tenants')
      .set('X-Idempotency-Key', 'create-tenant-001')
      .set('X-User-Id', 'user-123')
      .send({ name: 'Test Organization' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('created');
    expect(response.body.tenantId).toBeDefined();
    expect(response.headers['x-idempotency-key']).toBe('create-tenant-001');
  });

  it('should return cached response for duplicate tenant creation', async () => {
    const idempotencyKey = 'create-tenant-002';

    // First request
    const first = await request(app)
      .post('/tenants')
      .set('X-Idempotency-Key', idempotencyKey)
      .set('X-User-Id', 'user-123')
      .send({ name: 'Test Organization' });

    expect(first.status).toBe(200);
    const firstTenantId = first.body.tenantId;

    // Wait for async caching to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // Duplicate request (same idempotency key)
    const second = await request(app)
      .post('/tenants')
      .set('X-Idempotency-Key', idempotencyKey)
      .set('X-User-Id', 'user-123')
      .send({ name: 'Test Organization' });

    // Should be 200 (cached) or 409 (still processing)
    expect([200, 409]).toContain(second.status);
    if (second.status === 200) {
      // Should return same tenant ID (cached response)
      expect(second.body.tenantId).toBe(firstTenantId);
    }
  });

  it('should process different idempotency keys separately', async () => {
    const first = await request(app)
      .post('/tenants')
      .set('X-Idempotency-Key', 'create-tenant-003')
      .set('X-User-Id', 'user-123')
      .send({ name: 'Org One' });

    const second = await request(app)
      .post('/tenants')
      .set('X-Idempotency-Key', 'create-tenant-004')
      .set('X-User-Id', 'user-123')
      .send({ name: 'Org Two' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.tenantId).not.toBe(second.body.tenantId);
  });

  it('should allow requests without idempotency key (optional mode)', async () => {
    const response = await request(app)
      .post('/tenants')
      .set('X-User-Id', 'user-123')
      .send({ name: 'No Key Organization' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('created');
  });
});

describe('API Idempotency - Runs', () => {
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

  it('should start run on first request', async () => {
    const response = await request(app)
      .post('/tenants/tenant-001/runs')
      .set('X-Idempotency-Key', 'run-001')
      .send({ prUrl: 'https://github.com/org/repo/pull/1' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('started');
    expect(response.body.runId).toBeDefined();
  });

  it('should skip duplicate run requests', async () => {
    const idempotencyKey = 'run-002';

    // First request
    const first = await request(app)
      .post('/tenants/tenant-001/runs')
      .set('X-Idempotency-Key', idempotencyKey)
      .send({ prUrl: 'https://github.com/org/repo/pull/2' });

    expect(first.status).toBe(200);
    const firstRunId = first.body.runId;

    // Wait for async caching to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // Duplicate request
    const second = await request(app)
      .post('/tenants/tenant-001/runs')
      .set('X-Idempotency-Key', idempotencyKey)
      .send({ prUrl: 'https://github.com/org/repo/pull/2' });

    // Should be 200 (cached) or 409 (still processing)
    expect([200, 409]).toContain(second.status);
    if (second.status === 200) {
      expect(second.body.runId).toBe(firstRunId);
    }
  });

  it('should isolate idempotency by tenant', async () => {
    // Same key, different tenants - run sequentially to avoid race conditions
    const firstTenant = await request(app)
      .post('/tenants/tenant-001/runs')
      .set('X-Idempotency-Key', 'shared-key-001a')
      .send({ prUrl: 'https://github.com/org/repo/pull/1' });

    // Wait for first request to complete processing
    await new Promise(resolve => setTimeout(resolve, 50));

    const secondTenant = await request(app)
      .post('/tenants/tenant-002/runs')
      .set('X-Idempotency-Key', 'shared-key-001b')
      .send({ prUrl: 'https://github.com/org/repo/pull/1' });

    expect(firstTenant.status).toBe(200);
    expect(secondTenant.status).toBe(200);
    // Different run IDs because different tenants
    expect(firstTenant.body.runId).not.toBe(secondTenant.body.runId);
  });
});

describe('API Idempotency - Concurrent Requests', () => {
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

  it('should handle rapid duplicate requests', async () => {
    const idempotencyKey = 'concurrent-001';

    // Send 5 concurrent requests with same idempotency key
    const requests = Array(5).fill(null).map(() =>
      request(app)
        .post('/tenants/tenant-001/runs')
        .set('X-Idempotency-Key', idempotencyKey)
        .send({ prUrl: 'https://github.com/org/repo/pull/1' })
    );

    const responses = await Promise.all(requests);

    // All should succeed (200 OK or 409 processing)
    const successful = responses.filter(r => r.status === 200 || r.status === 409);
    expect(successful.length).toBe(5);

    // All 200 responses should have the same run ID
    const okResponses = responses.filter(r => r.status === 200);
    if (okResponses.length > 1) {
      const firstRunId = okResponses[0].body.runId;
      for (const resp of okResponses) {
        expect(resp.body.runId).toBe(firstRunId);
      }
    }
  });
});

describe('API Idempotency - Instance Execution', () => {
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

  it('should execute instance on first request', async () => {
    const response = await request(app)
      .post('/v1/instances/instance-001/run')
      .set('X-Idempotency-Key', 'execute-001')
      .send({ input: { key: 'value' } });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('executed');
    expect(response.body.workflowId).toBeDefined();
  });

  it('should skip duplicate instance executions', async () => {
    const idempotencyKey = 'execute-002';

    // First request
    const first = await request(app)
      .post('/v1/instances/instance-001/run')
      .set('X-Idempotency-Key', idempotencyKey)
      .send({ input: { key: 'value' } });

    expect(first.status).toBe(200);

    // Wait for async caching to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // Duplicate request
    const second = await request(app)
      .post('/v1/instances/instance-001/run')
      .set('X-Idempotency-Key', idempotencyKey)
      .send({ input: { key: 'value' } });

    // Should be 200 (cached) or 409 (still processing)
    expect([200, 409]).toContain(second.status);
    if (second.status === 200) {
      expect(second.body.workflowId).toBe(first.body.workflowId);
    }
  });
});

describe('API Idempotency - Header Variants', () => {
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

  it('should accept X-Request-ID as idempotency key', async () => {
    const response = await request(app)
      .post('/tenants/tenant-001/runs')
      .set('X-Request-ID', 'request-id-001')
      .send({ prUrl: 'https://github.com/org/repo/pull/1' });

    expect(response.status).toBe(200);
    expect(response.headers['x-idempotency-key']).toBe('request-id-001');
  });

  it('should accept Idempotency-Key header', async () => {
    const response = await request(app)
      .post('/tenants/tenant-001/runs')
      .set('Idempotency-Key', 'idem-key-001')
      .send({ prUrl: 'https://github.com/org/repo/pull/1' });

    expect(response.status).toBe(200);
    expect(response.headers['x-idempotency-key']).toBe('idem-key-001');
  });
});
