/**
 * Phase 29: Marketplace API Routes
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

import { Router } from 'express';
import { Storage } from '@google-cloud/storage';
import type {
  PublishedConnector,
  MarketplaceSearchOptions,
  ConnectorCapability,
} from '@gwi/core';
import { getMarketplaceService } from '@gwi/core';

const router = Router();

// GCS client for tarball storage
const storage = new Storage();
const tarballBucket = process.env.GWI_TARBALL_BUCKET ?? 'gwi-connectors';

// =============================================================================
// Search Endpoint
// =============================================================================

/**
 * GET /v1/search - Search connectors
 */
router.get('/v1/search', async (req, res) => {
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
 * POST /v1/connectors - Publish a connector version
 *
 * Requires authentication and publisher permissions.
 * Expects multipart form data with:
 * - manifest: JSON manifest
 * - signature: Signature JSON
 * - tarball: gzipped tarball file
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
