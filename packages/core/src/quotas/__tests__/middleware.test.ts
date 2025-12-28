/**
 * Quota Middleware Tests
 *
 * Epic E: RBAC & Governance
 *
 * Comprehensive test suite for quota enforcement middleware.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  enforceQuota,
  checkQuota,
  recordQuotaUsage,
  quotaErrorHandler,
  QuotaExceededError,
  type QuotaRequest,
  type QuotaResponse,
  type QuotaNext,
} from '../middleware.js';
import {
  createQuotaManager,
  type QuotaManager,
  type QuotaDefinition,
} from '../index.js';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create mock Express request
 */
function createMockRequest(overrides?: Partial<QuotaRequest>): QuotaRequest {
  return {
    context: {
      tenantId: 'tenant_123',
      userId: 'user_123',
    },
    quotaUsageAmount: 1,
    quotaMetadata: {},
    ...overrides,
  };
}

/**
 * Create mock Express response
 */
function createMockResponse(): QuotaResponse & {
  statusCode?: number;
  jsonData?: unknown;
  headers?: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    jsonData: undefined as unknown,
    headers,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.jsonData = data;
    },
    set(header: string, value: string) {
      this.headers[header] = value;
    },
  };
  return res;
}

/**
 * Create mock next function
 */
function createMockNext(): QuotaNext & { called: boolean; error?: Error } {
  const next = Object.assign(
    (err?: Error) => {
      next.called = true;
      if (err) {
        next.error = err;
      }
    },
    { called: false, error: undefined as Error | undefined }
  );
  return next;
}

// =============================================================================
// Test Suite
// =============================================================================

describe('Quota Middleware', () => {
  let quotaManager: QuotaManager;
  let quota: QuotaDefinition;

  beforeEach(async () => {
    // Create fresh quota manager for each test
    quotaManager = createQuotaManager();

    // Create default quota
    quota = await quotaManager.createQuota({
      resourceType: 'api_calls',
      limit: 100,
      period: 'hour',
      enforcement: 'hard',
      burstLimit: 120,
      burstDurationMs: 60000,
      warningThreshold: 80,
      enabled: true,
    });

    // Assign quota to test tenant
    await quotaManager.assignQuotaToTenant('tenant_123', quota.id);
  });

  // ---------------------------------------------------------------------------
  // enforceQuota Tests
  // ---------------------------------------------------------------------------

  describe('enforceQuota', () => {
    it('should allow request when quota is available', async () => {
      const middleware = enforceQuota(quotaManager, {
        resourceType: 'api_calls',
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(next.called).toBe(true);
      expect(next.error).toBeUndefined();
      expect(res.statusCode).toBe(200);
    });

    it('should block request when hard quota exceeded', async () => {
      // Record 120 API calls to exceed burst limit (100 + 20% burst = 120)
      for (let i = 0; i < 120; i++) {
        await quotaManager.recordUsage('tenant_123', 'api_calls', 1);
      }

      const middleware = enforceQuota(quotaManager, {
        resourceType: 'api_calls',
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(next.called).toBe(false);
      expect(res.statusCode).toBe(429);
      expect(res.jsonData).toMatchObject({
        error: 'QuotaExceeded',
        resourceType: 'api_calls',
        currentUsage: 120,
        limit: 100,
      });
    });

    it('should set Retry-After header when quota exceeded', async () => {
      // Record 120 API calls to exceed burst limit
      for (let i = 0; i < 120; i++) {
        await quotaManager.recordUsage('tenant_123', 'api_calls', 1);
      }

      const middleware = enforceQuota(quotaManager, {
        resourceType: 'api_calls',
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(res.headers['Retry-After']).toBeDefined();
      expect(parseInt(res.headers['Retry-After'], 10)).toBeGreaterThan(0);
    });

    it('should allow burst usage within burst limit', async () => {
      // Record 100 API calls (at limit)
      for (let i = 0; i < 100; i++) {
        await quotaManager.recordUsage('tenant_123', 'api_calls', 1);
      }

      const middleware = enforceQuota(quotaManager, {
        resourceType: 'api_calls',
      });

      // Should allow up to 120 with burst
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      // Should still allow (within burst limit of 120)
      expect(next.called).toBe(true);
    });

    it('should record usage after successful request', async () => {
      const middleware = enforceQuota(quotaManager, {
        resourceType: 'api_calls',
        recordUsage: true,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      // Call res.json to trigger usage recording
      res.json({ success: true });

      // Wait for async usage recording
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check usage was recorded
      const usage = await quotaManager.getUsage('tenant_123', 'api_calls');
      expect(usage.currentUsage).toBeGreaterThan(0);
    });

    it('should use custom usage amount', async () => {
      const middleware = enforceQuota(quotaManager, {
        resourceType: 'api_calls',
        getUsageAmount: (req) => req.quotaUsageAmount || 1,
      });

      const req = createMockRequest({ quotaUsageAmount: 5 });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(next.called).toBe(true);
    });

    it('should skip quota check when no tenant context', async () => {
      const middleware = enforceQuota(quotaManager, {
        resourceType: 'api_calls',
      });

      const req = createMockRequest({ context: undefined });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(next.called).toBe(true);
      expect(res.statusCode).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // Soft Enforcement Tests
  // ---------------------------------------------------------------------------

  describe('Soft Enforcement', () => {
    beforeEach(async () => {
      // Create soft quota
      const softQuota = await quotaManager.createQuota({
        resourceType: 'runs',
        limit: 10,
        period: 'day',
        enforcement: 'soft',
        warningThreshold: 80,
        enabled: true,
      });

      await quotaManager.assignQuotaToTenant('tenant_123', softQuota.id);
    });

    it('should allow request when soft quota exceeded', async () => {
      // Record 10 runs to hit limit
      for (let i = 0; i < 10; i++) {
        await quotaManager.recordUsage('tenant_123', 'runs', 1);
      }

      const middleware = enforceQuota(quotaManager, {
        resourceType: 'runs',
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      // Should allow despite exceeding quota
      expect(next.called).toBe(true);
      expect(res.statusCode).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // Warn Enforcement Tests
  // ---------------------------------------------------------------------------

  describe('Warn Enforcement', () => {
    beforeEach(async () => {
      // Create warn quota
      const warnQuota = await quotaManager.createQuota({
        resourceType: 'workflows',
        limit: 5,
        period: 'week',
        enforcement: 'warn',
        warningThreshold: 80,
        enabled: true,
      });

      await quotaManager.assignQuotaToTenant('tenant_123', warnQuota.id);
    });

    it('should allow request when warn quota exceeded', async () => {
      // Record 5 workflows to hit limit
      for (let i = 0; i < 5; i++) {
        await quotaManager.recordUsage('tenant_123', 'workflows', 1);
      }

      const middleware = enforceQuota(quotaManager, {
        resourceType: 'workflows',
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      // Should allow despite exceeding quota
      expect(next.called).toBe(true);
      expect(res.statusCode).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // Warning Threshold Tests
  // ---------------------------------------------------------------------------

  describe('Warning Threshold', () => {
    it('should log warning when approaching quota limit', async () => {
      // Record 85 API calls (85% of 100)
      for (let i = 0; i < 85; i++) {
        await quotaManager.recordUsage('tenant_123', 'api_calls', 1);
      }

      const middleware = enforceQuota(quotaManager, {
        resourceType: 'api_calls',
        logWarnings: true,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      // Should still allow but log warning
      expect(next.called).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // checkQuota Tests
  // ---------------------------------------------------------------------------

  describe('checkQuota', () => {
    it('should check quota without recording usage', async () => {
      const middleware = checkQuota(quotaManager, {
        resourceType: 'api_calls',
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(next.called).toBe(true);

      // Verify no usage was recorded
      const usage = await quotaManager.getUsage('tenant_123', 'api_calls');
      expect(usage.currentUsage).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // recordQuotaUsage Tests
  // ---------------------------------------------------------------------------

  describe('recordQuotaUsage', () => {
    it('should record usage without checking quota', async () => {
      const middleware = recordQuotaUsage(quotaManager, {
        resourceType: 'api_calls',
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(next.called).toBe(true);

      // Wait for async recording
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify usage was recorded
      const usage = await quotaManager.getUsage('tenant_123', 'api_calls');
      expect(usage.currentUsage).toBeGreaterThan(0);
    });

    it('should record usage with metadata', async () => {
      const middleware = recordQuotaUsage(quotaManager, {
        resourceType: 'api_calls',
        getMetadata: (req) => req.quotaMetadata,
      });

      const req = createMockRequest({
        quotaMetadata: { endpoint: '/test', method: 'POST' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(next.called).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // quotaErrorHandler Tests
  // ---------------------------------------------------------------------------

  describe('quotaErrorHandler', () => {
    it('should handle QuotaExceededError', () => {
      const handler = quotaErrorHandler();

      const err = new QuotaExceededError('api_calls', 100, 100, 3600000, 'hard');
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      handler(err, req, res, next);

      expect(res.statusCode).toBe(429);
      expect(res.jsonData).toMatchObject({
        error: 'QuotaExceeded',
        resourceType: 'api_calls',
        currentUsage: 100,
        limit: 100,
      });
      expect(res.headers['Retry-After']).toBeDefined();
    });

    it('should pass through non-quota errors', () => {
      const handler = quotaErrorHandler();

      const err = new Error('Some other error');
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      handler(err, req, res, next);

      expect(next.called).toBe(true);
      expect(next.error).toBe(err);
    });
  });

  // ---------------------------------------------------------------------------
  // Custom Tenant Extraction Tests
  // ---------------------------------------------------------------------------

  describe('Custom Tenant Extraction', () => {
    it('should use custom getTenantId function', async () => {
      const middleware = enforceQuota(quotaManager, {
        resourceType: 'api_calls',
        getTenantId: (req) => 'custom_tenant',
      });

      // Assign quota to custom tenant
      await quotaManager.assignQuotaToTenant('custom_tenant', quota.id);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      expect(next.called).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Burst Allowance Tests
  // ---------------------------------------------------------------------------

  describe('Burst Allowance', () => {
    it('should allow burst usage within burst window', async () => {
      // Record 100 calls (at limit)
      for (let i = 0; i < 100; i++) {
        await quotaManager.recordUsage('tenant_123', 'api_calls', 1);
      }

      const middleware = enforceQuota(quotaManager, {
        resourceType: 'api_calls',
      });

      // Try to make 10 more calls (within burst of 120)
      for (let i = 0; i < 10; i++) {
        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        await middleware(req, res, next);

        // Should allow within burst
        expect(next.called).toBe(true);
      }
    });

    it('should block when burst limit exceeded', async () => {
      // Record 120 calls (at burst limit)
      for (let i = 0; i < 120; i++) {
        await quotaManager.recordUsage('tenant_123', 'api_calls', 1);
      }

      const middleware = enforceQuota(quotaManager, {
        resourceType: 'api_calls',
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      // Should block (exceeded burst)
      expect(next.called).toBe(false);
      expect(res.statusCode).toBe(429);
    });
  });

  // ---------------------------------------------------------------------------
  // Error Handling Tests
  // ---------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should fail open on quota check error', async () => {
      // Create middleware with broken quota manager
      const brokenManager = {
        checkQuota: vi.fn().mockRejectedValue(new Error('Database error')),
      } as unknown as QuotaManager;

      const middleware = enforceQuota(brokenManager, {
        resourceType: 'api_calls',
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await middleware(req, res, next);

      // Should allow request despite error (fail open)
      expect(next.called).toBe(true);
    });
  });
});
