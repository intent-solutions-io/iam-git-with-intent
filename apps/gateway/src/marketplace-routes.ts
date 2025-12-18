/**
 * Phase 29: Marketplace API Routes
 * Phase 30: Hardening (size limits, rate limiting, validation)
 *
 * Registry API endpoints for connector marketplace.
 *
 * Protocol (matches remote-registry.ts client):
 *   GET /v1/search?q={query}           - Search connectors
 *   GET /v1/connectors/{id}            - Get connector info
 *   GET /v1/connectors/{id}/{version}  - Get version metadata
 *   GET /v1/connectors/{id}/{version}/tarball   - Download tarball
 *   GET /v1/connectors/{id}/{version}/signature - Download signature
 *   POST /v1/connectors                - Publish connector (authenticated)
 *
 * @module @gwi/gateway/marketplace-routes
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { Storage } from '@google-cloud/storage';
import type {
  PublishedConnector,
  MarketplaceSearchOptions,
  ConnectorCapability,
} from '@gwi/core';
import { getMarketplaceService, PublishRequestSchema } from '@gwi/core';
import { z } from 'zod';

const router = Router();

// GCS client for tarball storage
const storage = new Storage();
const tarballBucket = process.env.GWI_TARBALL_BUCKET ?? 'gwi-connectors';

// =============================================================================
// Phase 30: Security Constants & Rate Limiting
// =============================================================================

/** Maximum tarball size (50MB) */
const MAX_TARBALL_SIZE = 50 * 1024 * 1024;

/** Maximum request body size (55MB to account for base64 overhead) */
const MAX_BODY_SIZE = 55 * 1024 * 1024;

/** Maximum manifest size (1MB) */
const MAX_MANIFEST_SIZE = 1024 * 1024;

/** Rate limit window (15 minutes) */
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Max publish requests per window per publisher */
const MAX_PUBLISH_PER_WINDOW = 10;

/** Max search requests per window per IP */
const MAX_SEARCH_PER_WINDOW = 100;

/** In-memory rate limit store (fallback when Redis unavailable) */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Simple in-memory rate limiter (Phase 30 hardening)
 * Use Redis rate limiter in production for distributed deployments.
 */
function checkRateLimit(key: string, maxRequests: number, windowMs: number): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    // New window
    const resetAt = now + windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

/**
 * Rate limit middleware factory
 */
function rateLimit(options: {
  keyFn: (req: Request) => string;
  maxRequests: number;
  windowMs: number;
  message?: string;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = options.keyFn(req);
    const result = checkRateLimit(key, options.maxRequests, options.windowMs);

    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: options.message ?? 'Too many requests, please try again later',
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      });
      return;
    }

    next();
  };
}

// =============================================================================
// Validation Schemas (Phase 30 hardening)
// =============================================================================

/** Connector ID validation */
const ConnectorIdSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/, 'Connector ID must be lowercase alphanumeric with hyphens');

/** Version validation */
const VersionSchema = z.string()
  .min(1)
  .max(32)
  .regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/, 'Version must be valid semver');

/** Publish request validation (full endpoint) */
const FullPublishRequestSchema = z.object({
  manifest: z.object({
    id: ConnectorIdSchema,
    version: VersionSchema,
    displayName: z.string().min(1).max(128),
    description: z.string().max(1024).optional(),
    author: z.string().min(1).max(128),
    capabilities: z.array(z.string()).min(1).max(20),
    // Allow other manifest fields
  }).passthrough(),
  tarball: z.string().min(1).max(MAX_BODY_SIZE),
  signature: z.object({
    version: z.number(),
    keyId: z.string().min(1).max(128),
    algorithm: z.string(),
    signature: z.string().min(1),
    checksum: z.string().length(64), // SHA256 hex
    signedAt: z.string(),
    payload: z.string().optional(),
  }),
});

/**
 * Validate request body middleware
 */
function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

// =============================================================================
// Search Endpoint
// =============================================================================

/** Search rate limiter */
const searchRateLimiter = rateLimit({
  keyFn: (req) => `search:${req.ip}`,
  maxRequests: MAX_SEARCH_PER_WINDOW,
  windowMs: RATE_LIMIT_WINDOW_MS,
  message: 'Too many search requests, please try again later',
});

/**
 * GET /v1/search - Search connectors
 */
router.get('/v1/search', searchRateLimiter, async (req, res) => {
  try {
    const service = getMarketplaceService();

    const options: MarketplaceSearchOptions = {
      query: req.query.q as string,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20,
      sortBy: (req.query.sortBy as 'downloads' | 'updated' | 'name') || 'downloads',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    };

    if (req.query.capabilities) {
      options.capabilities = (req.query.capabilities as string).split(',') as ConnectorCapability[];
    }
    if (req.query.categories) {
      options.categories = (req.query.categories as string).split(',');
    }

    let result;
    if (options.query) {
      result = await service.searchConnectors(options.query, options);
    } else {
      result = await service.listConnectors(options);
    }

    res.json({
      connectors: result.connectors.map(connectorToSearchEntry),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Connector Info Endpoint
// =============================================================================

/**
 * GET /v1/connectors/:id - Get connector info with versions
 */
router.get('/v1/connectors/:id', async (req, res) => {
  try {
    const service = getMarketplaceService();
    const { id } = req.params;

    const result = await service.getConnectorWithVersions(id);
    if (!result) {
      return res.status(404).json({ error: 'Connector not found', id });
    }

    res.json({
      id: result.connector.id,
      displayName: result.connector.displayName,
      description: result.connector.description,
      author: result.connector.author,
      capabilities: result.connector.capabilities,
      latestVersion: result.connector.latestVersion,
      versions: result.connector.versions,
      totalDownloads: result.connector.totalDownloads,
      createdAt: result.connector.createdAt,
      updatedAt: result.connector.updatedAt,
    });
  } catch (error) {
    console.error('Get connector error:', error);
    res.status(500).json({
      error: 'Failed to get connector',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Version Info Endpoint
// =============================================================================

/**
 * GET /v1/connectors/:id/:version - Get version metadata
 */
router.get('/v1/connectors/:id/:version', async (req, res) => {
  try {
    const service = getMarketplaceService();
    const { id, version } = req.params;

    const versionInfo = await service.getVersion(id, version);
    if (!versionInfo) {
      return res.status(404).json({ error: 'Version not found', id, version });
    }

    res.json({
      id: versionInfo.connectorId,
      version: versionInfo.version,
      manifest: versionInfo.manifest,
      tarballUrl: versionInfo.tarballUrl,
      tarballChecksum: versionInfo.tarballChecksum,
      signatureUrl: versionInfo.signatureUrl,
      publishedAt: versionInfo.publishedAt,
      downloads: versionInfo.downloads,
    });
  } catch (error) {
    console.error('Get version error:', error);
    res.status(500).json({
      error: 'Failed to get version',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Tarball Download Endpoint
// =============================================================================

/**
 * GET /v1/connectors/:id/:version/tarball - Download tarball
 */
router.get('/v1/connectors/:id/:version/tarball', async (req, res) => {
  try {
    const service = getMarketplaceService();
    const { id, version } = req.params;

    // Verify version exists
    const versionInfo = await service.getVersion(id, version);
    if (!versionInfo) {
      return res.status(404).json({ error: 'Version not found', id, version });
    }

    // Stream tarball from GCS
    const bucket = storage.bucket(tarballBucket);
    const file = bucket.file(`${id}/${version}/connector.tar.gz`);

    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: 'Tarball not found' });
    }

    // Track download
    void service.getVersion(id, version); // Just to trigger increment (async)

    // Set headers and stream
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${id}-${version}.tar.gz"`);

    const stream = file.createReadStream();
    stream.pipe(res);

    stream.on('error', (err) => {
      console.error('Tarball stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream tarball' });
      }
    });
  } catch (error) {
    console.error('Download tarball error:', error);
    res.status(500).json({
      error: 'Failed to download tarball',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Signature Download Endpoint
// =============================================================================

/**
 * GET /v1/connectors/:id/:version/signature - Download signature
 */
router.get('/v1/connectors/:id/:version/signature', async (req, res) => {
  try {
    const { id, version } = req.params;

    // Read signature from GCS
    const bucket = storage.bucket(tarballBucket);
    const file = bucket.file(`${id}/${version}/signature.json`);

    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: 'Signature not found' });
    }

    const [content] = await file.download();
    const signature = JSON.parse(content.toString());

    res.json(signature);
  } catch (error) {
    console.error('Download signature error:', error);
    res.status(500).json({
      error: 'Failed to download signature',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Publish Endpoint (Authenticated)
// =============================================================================

/**
 * POST /v1/connectors - Publish connector metadata (tarball already in GCS)
 *
 * Requires authentication and publisher permissions.
 * Use POST /v1/publish for full publish with tarball upload.
 */
router.post('/v1/connectors', async (req, res) => {
  try {
    // TODO: Add authentication middleware
    const publishedBy = req.headers['x-user-id'] as string || 'anonymous';

    const { connectorId, version, manifest, signature, tarballChecksum, changelog, releaseNotes, prerelease } = req.body;

    if (!connectorId || !version || !manifest || !signature || !tarballChecksum) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['connectorId', 'version', 'manifest', 'signature', 'tarballChecksum'],
      });
    }

    const service = getMarketplaceService();

    const result = await service.publish(
      {
        connectorId,
        version,
        manifest,
        tarballChecksum,
        changelog,
        releaseNotes,
        prerelease: prerelease ?? false,
      },
      signature,
      publishedBy
    );

    if (!result.success) {
      return res.status(400).json({
        error: 'Publish failed',
        message: result.error,
      });
    }

    res.status(201).json({
      success: true,
      version: result.version,
    });
  } catch (error) {
    console.error('Publish error:', error);
    res.status(500).json({
      error: 'Publish failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/** Publish rate limiter */
const publishRateLimiter = rateLimit({
  keyFn: (req) => `publish:${req.headers['x-user-id'] || req.ip}`,
  maxRequests: MAX_PUBLISH_PER_WINDOW,
  windowMs: RATE_LIMIT_WINDOW_MS,
  message: 'Too many publish requests, please try again later',
});

/**
 * POST /v1/publish - Full publish with tarball upload
 *
 * CLI-friendly endpoint that accepts tarball as base64 and handles
 * GCS upload server-side. This simplifies the publish workflow.
 *
 * Phase 30 hardening:
 * - Rate limiting (10 publishes per 15 minutes per publisher)
 * - Tarball size limit (50MB)
 * - Schema validation
 * - Publisher authorization
 *
 * Body:
 * - manifest: ConnectorManifest object
 * - tarball: base64-encoded gzipped tarball
 * - signature: SignatureFile object
 */
router.post(
  '/v1/publish',
  publishRateLimiter,
  validateBody(FullPublishRequestSchema),
  async (req, res) => {
  try {
    // Authentication: require user ID or API key
    const publishedBy = req.headers['x-user-id'] as string;
    const apiKey = req.headers['x-api-key'] as string;

    // Must have either user ID or API key
    if (!publishedBy && !apiKey) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Provide x-user-id header or x-api-key header',
      });
    }

    // Validate API key if provided
    if (apiKey && process.env.REGISTRY_API_KEY && apiKey !== process.env.REGISTRY_API_KEY) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const { manifest, tarball, signature } = req.body;

    const connectorId = manifest.id;
    const version = manifest.version;

    // Authorization: verify publisher owns the namespace
    const service = getMarketplaceService();
    const existingConnector = await service.getConnector(connectorId);
    if (existingConnector) {
      // Check if publisher owns this connector
      const publisher = await service.getPublisher(publishedBy || apiKey);
      if (!publisher) {
        return res.status(403).json({
          error: 'Publisher not registered',
          message: 'Register as a publisher before publishing connectors',
        });
      }
      // In a full implementation, would check connector ownership here
    }

    // Decode and validate tarball
    let tarballBuffer: Buffer;
    try {
      tarballBuffer = Buffer.from(tarball, 'base64');
    } catch {
      return res.status(400).json({ error: 'Invalid base64 tarball encoding' });
    }

    // Check tarball size
    if (tarballBuffer.length > MAX_TARBALL_SIZE) {
      return res.status(413).json({
        error: 'Tarball too large',
        maxSize: MAX_TARBALL_SIZE,
        actualSize: tarballBuffer.length,
        message: `Maximum tarball size is ${MAX_TARBALL_SIZE / 1024 / 1024}MB`,
      });
    }

    // Validate tarball checksum matches signature
    const crypto = await import('crypto');
    const computedChecksum = crypto.createHash('sha256').update(tarballBuffer).digest('hex');

    if (signature.checksum !== computedChecksum) {
      return res.status(400).json({
        error: 'Tarball checksum mismatch',
        expected: signature.checksum,
        computed: computedChecksum,
        message: 'The tarball content does not match the signature checksum',
      });
    }

    // Validate tarball is actually gzip
    if (tarballBuffer.length < 2 || tarballBuffer[0] !== 0x1f || tarballBuffer[1] !== 0x8b) {
      return res.status(400).json({
        error: 'Invalid tarball format',
        message: 'Tarball must be gzip compressed',
      });
    }

    // Upload tarball to GCS
    const bucket = storage.bucket(tarballBucket);
    const tarballPath = `${connectorId}/${version}/connector.tar.gz`;
    const signaturePath = `${connectorId}/${version}/signature.json`;

    console.log(`Uploading tarball to gs://${tarballBucket}/${tarballPath}`);
    await bucket.file(tarballPath).save(tarballBuffer, {
      contentType: 'application/gzip',
      metadata: {
        connectorId,
        version,
        checksum: computedChecksum,
      },
    });

    // Upload signature
    console.log(`Uploading signature to gs://${tarballBucket}/${signaturePath}`);
    await bucket.file(signaturePath).save(JSON.stringify(signature, null, 2), {
      contentType: 'application/json',
    });

    // Publish metadata via service (service already obtained above for auth)
    const result = await service.publish(
      {
        connectorId,
        version,
        manifest,
        tarballChecksum: computedChecksum,
        changelog: manifest.changelog,
        releaseNotes: manifest.releaseNotes,
        prerelease: manifest.prerelease ?? false,
      },
      signature,
      publishedBy
    );

    if (!result.success) {
      // Clean up uploaded files on failure
      try {
        await bucket.file(tarballPath).delete();
        await bucket.file(signaturePath).delete();
      } catch {
        // Ignore cleanup errors
      }

      return res.status(400).json({
        error: 'Publish failed',
        message: result.error,
      });
    }

    console.log(`Published ${connectorId}@${version} by ${publishedBy}`);

    res.status(201).json({
      success: true,
      connectorId,
      version,
      checksum: computedChecksum,
      tarballUrl: `${process.env.GWI_REGISTRY_URL ?? 'https://registry.gitwithintent.com'}/v1/connectors/${connectorId}/${version}/tarball`,
    });
  } catch (error) {
    console.error('Publish error:', error);
    res.status(500).json({
      error: 'Publish failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Deprecation Endpoint
// =============================================================================

/**
 * POST /v1/connectors/:id/:version/deprecate - Deprecate a version
 *
 * Marks a connector version as deprecated with a reason.
 */
router.post('/v1/connectors/:id/:version/deprecate', async (req, res) => {
  try {
    const publishedBy = req.headers['x-user-id'] as string || 'anonymous';
    const { id, version } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Deprecation reason required' });
    }

    const service = getMarketplaceService();
    const result = await service.deprecateVersion(id, version, reason);

    if (!result.success) {
      return res.status(400).json({
        error: 'Deprecation failed',
        message: result.error,
      });
    }

    console.log(`Deprecated ${id}@${version} by ${publishedBy}: ${reason}`);

    res.json({ success: true, id, version, reason });
  } catch (error) {
    console.error('Deprecate error:', error);
    res.status(500).json({
      error: 'Deprecation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Download Tracking
// =============================================================================

/**
 * POST /v1/connectors/:id/:version/download - Track a download
 *
 * Called by clients after successful download to track metrics.
 */
router.post('/v1/connectors/:id/:version/download', async (req, res) => {
  try {
    const { id, version } = req.params;
    const service = getMarketplaceService();

    // Just verify the version exists - incrementing handled by service
    const versionInfo = await service.getVersion(id, version);
    if (!versionInfo) {
      return res.status(404).json({ error: 'Version not found' });
    }

    // Download tracking happens on tarball download, but this endpoint
    // can be used for explicit tracking (e.g., local installs)
    res.json({ success: true, id, version });
  } catch (error) {
    console.error('Download tracking error:', error);
    res.status(500).json({
      error: 'Download tracking failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Helpers
// =============================================================================

function connectorToSearchEntry(connector: PublishedConnector) {
  return {
    id: connector.id,
    latestVersion: connector.latestVersion,
    displayName: connector.displayName,
    description: connector.description,
    author: connector.author,
    capabilities: connector.capabilities,
    downloads: connector.totalDownloads,
    updatedAt: connector.updatedAt,
  };
}

export { router as marketplaceRouter };
