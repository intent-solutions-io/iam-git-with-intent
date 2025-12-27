/**
 * Quota Integration Examples
 *
 * Epic E: RBAC & Governance
 *
 * This file demonstrates how to use quota middleware in Express applications.
 * These examples show best practices for quota enforcement across different
 * resource types and use cases.
 *
 * NOTE: These are illustrative examples. In production code, extend the
 * Express Request interface to include the custom properties used here.
 *
 * @module @gwi/core/quotas/examples
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import type { QuotaManager } from './index.js';
import { enforceQuota, checkQuota } from './middleware.js';

// Extend Request interface for examples
interface QuotaExampleRequest extends Request {
  context?: {
    tenantId?: string;
  };
  quotaUsageAmount?: number;
  quotaMetadata?: Record<string, unknown>;
}

// =============================================================================
// Example 1: Enforce Run Quota on Workflow Creation
// =============================================================================

/**
 * Example: Enforce run quota when creating a new workflow run
 *
 * Use case:
 * - User triggers a new workflow run via POST /runs
 * - Before creating the run, check if tenant has quota available
 * - If quota exceeded (hard enforcement), return 429 with Retry-After
 * - If quota passes, create run and record usage
 *
 * Enforcement: HARD (block if quota exceeded)
 */
export function exampleRunQuota(quotaManager: QuotaManager): Router {
  const router = Router();

  router.post(
    '/runs',
    // Enforce run quota before proceeding
    enforceQuota(quotaManager, {
      resourceType: 'runs',
    }) as any,
    async (req: QuotaExampleRequest, res: Response) => {
      // If we get here, quota check passed and usage was recorded
      const run = {
        id: 'run_123',
        status: 'running',
        tenantId: req.context?.tenantId,
      };

      res.json(run);
    }
  );

  return router;
}

// =============================================================================
// Example 2: Enforce API Calls Quota on All Routes
// =============================================================================

/**
 * Example: Enforce API calls quota globally
 *
 * Use case:
 * - Every API request counts toward api_calls quota
 * - Apply middleware to all routes under /api
 * - Soft enforcement: log warnings but don't block
 *
 * Enforcement: SOFT (warn but allow)
 */
export function exampleApiCallsQuota(quotaManager: QuotaManager): Router {
  const router = Router();

  // Apply to all routes
  router.use(
    enforceQuota(quotaManager, {
      resourceType: 'api_calls',
    }) as any
  );

  router.get('/tenants', async (_req: Request, res: Response) => {
    res.json({ tenants: [] });
  });

  router.get('/runs', async (_req: Request, res: Response) => {
    res.json({ runs: [] });
  });

  return router;
}

// =============================================================================
// Example 3: Enforce Storage Quota on File Uploads
// =============================================================================

/**
 * Example: Enforce storage quota based on file size
 *
 * Use case:
 * - User uploads a file via POST /uploads
 * - Extract file size from request
 * - Check if adding this file would exceed storage quota
 * - If yes, return 429
 * - If no, allow upload and record storage usage
 *
 * Enforcement: HARD (block if quota exceeded)
 */
export function exampleStorageQuota(quotaManager: QuotaManager): Router {
  const router = Router();

  router.post(
    '/uploads',
    // Custom middleware to extract file size
    (req: Request, _res: Response, next: NextFunction) => {
      // In real implementation, use multer or similar
      const fileSize = parseInt(req.headers['content-length'] || '0', 10);

      // Store file size for quota check
      (req as any).quotaUsageAmount = fileSize;

      // Store metadata for audit trail
      (req as any).quotaMetadata = {
        fileName: req.headers['x-file-name'],
        fileType: req.headers['content-type'],
      };

      next();
    },
    // Enforce storage quota
    enforceQuota(quotaManager, {
      resourceType: 'storage_bytes',
      getUsageAmount: (req) => (req as any).quotaUsageAmount || 0,
      getMetadata: (req) => (req as any).quotaMetadata,
    }) as any,
    async (req: Request, res: Response) => {
      // If we get here, storage quota check passed
      const upload = {
        id: 'upload_123',
        size: (req as any).quotaUsageAmount,
        tenantId: (req as any).context?.tenantId,
      };

      res.json(upload);
    }
  );

  return router;
}

// =============================================================================
// Example 4: Check Concurrent Runs Quota
// =============================================================================

/**
 * Example: Check concurrent runs quota before starting a run
 *
 * Use case:
 * - User wants to start a new run
 * - Check if tenant already has max concurrent runs
 * - If yes, return 429 with message to wait
 * - If no, allow run creation
 *
 * Note: We use checkQuota here instead of enforceQuota because
 * concurrent_runs is a gauge (current active count), not a counter.
 *
 * Enforcement: HARD (block if limit reached)
 */
export function exampleConcurrentRunsQuota(quotaManager: QuotaManager): Router {
  const router = Router();

  router.post(
    '/runs',
    // Check quota but don't record usage yet
    checkQuota(quotaManager, {
      resourceType: 'concurrent_runs',
    }) as any,
    async (req: QuotaExampleRequest, res: Response) => {
      // Start the run
      const run = {
        id: 'run_123',
        status: 'running',
        tenantId: req.context?.tenantId,
      };

      // Manually record concurrent run increment
      if (req.context?.tenantId) {
        await quotaManager.recordUsage(
          req.context.tenantId,
          'concurrent_runs',
          1,
          { runId: run.id }
        );
      }

      res.json(run);
    }
  );

  // When run completes, decrement concurrent runs
  router.post('/runs/:runId/complete', async (req: QuotaExampleRequest, res: Response) => {
    const { runId } = req.params;

    // Decrement concurrent runs (negative usage)
    if (req.context?.tenantId) {
      await quotaManager.recordUsage(
        req.context.tenantId,
        'concurrent_runs',
        -1,
        { runId }
      );
    }

    res.json({ status: 'completed' });
  });

  return router;
}

// =============================================================================
// Example 5: Batch Operations with Custom Usage Amount
// =============================================================================

/**
 * Example: Batch operations where usage depends on batch size
 *
 * Use case:
 * - User submits batch of items to process
 * - Each item counts toward quota
 * - Check quota for entire batch before processing
 * - If quota exceeded, return 429
 * - If passes, process batch and record usage
 *
 * Enforcement: HARD (block if quota would be exceeded)
 */
export function exampleBatchQuota(quotaManager: QuotaManager): Router {
  const router = Router();

  router.post(
    '/batch',
    // Custom middleware to extract batch size
    (req: QuotaExampleRequest, _res: Response, next: NextFunction) => {
      const items = req.body.items || [];
      (req as any).quotaUsageAmount = items.length;
      (req as any).quotaMetadata = {
        batchId: `batch_${Date.now()}`,
        itemCount: items.length,
      };
      next();
    },
    // Enforce quota based on batch size
    enforceQuota(quotaManager, {
      resourceType: 'api_calls',
      getUsageAmount: (req) => (req as any).quotaUsageAmount || 0,
      getMetadata: (req) => (req as any).quotaMetadata,
    }) as any,
    async (req: QuotaExampleRequest, res: Response) => {
      const items = req.body.items || [];

      // Process batch
      const results = items.map((item: unknown) => ({
        item,
        status: 'processed',
      }));

      res.json({ results });
    }
  );

  return router;
}

// =============================================================================
// Example 6: Read-Only Operations (Check but Don't Record)
// =============================================================================

/**
 * Example: Check quota on read operations without recording usage
 *
 * Use case:
 * - User wants to list runs (read-only operation)
 * - Check if tenant has quota available (warn if low)
 * - Don't increment quota for read operations
 * - Useful for displaying quota warnings in UI
 *
 * Enforcement: WARN (check and log, but don't block or record)
 */
export function exampleReadOnlyQuota(quotaManager: QuotaManager): Router {
  const router = Router();

  router.get(
    '/runs',
    // Check quota but don't record usage
    checkQuota(quotaManager, {
      resourceType: 'runs',
    }) as any,
    async (_req: QuotaExampleRequest, res: Response) => {
      // Return runs list
      res.json({
        runs: [],
        // Include quota info in response for UI
        _quota: {
          message: 'Quota information available in response headers',
        },
      });
    }
  );

  return router;
}

// =============================================================================
// Example 7: Manual Usage Recording
// =============================================================================

/**
 * Example: Record usage after operation completes (not before)
 *
 * Use case:
 * - Operation might fail, so we don't want to charge quota upfront
 * - Complete the operation first
 * - If successful, record usage
 * - If failed, don't record usage
 *
 * Useful for compute_minutes or other pay-for-success scenarios
 */
export function exampleManualUsageRecording(quotaManager: QuotaManager): Router {
  const router = Router();

  router.post('/analyze', async (req: QuotaExampleRequest, res: Response) => {
    const startTime = Date.now();
    const tenantId = req.context?.tenantId;

    try {
      // Perform analysis (might fail)
      const result = { analysis: 'completed' };

      // Only record usage if successful
      if (tenantId) {
        const durationMs = Date.now() - startTime;
        const computeMinutes = durationMs / 60000;

        await quotaManager.recordUsage(tenantId, 'compute_minutes', computeMinutes, {
          operation: 'analyze',
          durationMs,
        });
      }

      res.json(result);
    } catch (err) {
      // Don't record usage on failure
      res.status(500).json({ error: 'AnalysisFailed' });
    }
  });

  return router;
}

// =============================================================================
// Example 8: Multi-Tenant with Custom Tenant Extraction
// =============================================================================

/**
 * Example: Custom tenant ID extraction for multi-tenant apps
 *
 * Use case:
 * - Tenant ID might be in different places (header, path, query)
 * - Provide custom extraction function
 * - Enforce quota based on extracted tenant
 */
export function exampleCustomTenantExtraction(quotaManager: QuotaManager): Router {
  const router = Router();

  router.post(
    '/orgs/:orgId/runs',
    enforceQuota(quotaManager, {
      resourceType: 'runs',
      // Extract tenant from path param instead of context
      getTenantId: (req) => (req as any).params.orgId,
    }) as any,
    async (req: QuotaExampleRequest, res: Response) => {
      const { orgId } = req.params;

      const run = {
        id: 'run_123',
        orgId,
        status: 'running',
      };

      res.json(run);
    }
  );

  return router;
}

// =============================================================================
// Best Practices Summary
// =============================================================================

/**
 * BEST PRACTICES:
 *
 * 1. **Choose the Right Enforcement Level**
 *    - HARD: Block requests that exceed quota (billing, security)
 *    - SOFT: Warn but allow (graceful degradation)
 *    - WARN: Log only (monitoring, testing)
 *
 * 2. **Use Appropriate Resource Types**
 *    - Counters: runs, api_calls, workflows (increment only)
 *    - Gauges: concurrent_runs, storage_bytes (can increment/decrement)
 *    - Compute: compute_minutes (fractional amounts)
 *
 * 3. **Set Retry-After Headers**
 *    - For time-based quotas (hour, day, month)
 *    - Clients can use this to implement exponential backoff
 *
 * 4. **Record Usage Metadata**
 *    - Include operation details for audit trail
 *    - Helps debug quota issues
 *    - Useful for cost attribution
 *
 * 5. **Handle Edge Cases**
 *    - What if tenant context is missing? (skip quota check)
 *    - What if quota store is down? (fail open vs fail closed)
 *    - What about service accounts? (exempt from quotas)
 *
 * 6. **Monitor Quota Health**
 *    - Alert when tenants approach limits
 *    - Track quota rejection rates
 *    - Identify tenants needing quota increases
 *
 * 7. **Burst Allowance**
 *    - Allow temporary bursts above limit
 *    - Useful for spiky workloads
 *    - Configure burstLimit and burstDurationMs
 *
 * 8. **Testing**
 *    - Test quota enforcement in integration tests
 *    - Verify Retry-After headers are correct
 *    - Test soft vs hard enforcement behaviors
 */
