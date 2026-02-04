#!/usr/bin/env node
/**
 * GWI Connector Registry Server
 *
 * Phase 10: Hosted registry service for connector distribution.
 * Phase 21: Enhanced with Ed25519 signature verification on publish.
 *
 * Endpoints:
 *   GET  /v1/search?q={query}
 *   GET  /v1/connectors/{id}
 *   GET  /v1/connectors/{id}/{version}
 *   GET  /v1/connectors/{id}/{version}/tarball
 *   GET  /v1/connectors/{id}/{version}/signature
 *   POST /v1/publish (auth required)
 *   GET  /health
 *   GET  /v1/stats (registry statistics)
 *
 * Environment Variables:
 *   REGISTRY_PORT - Server port (default: 3456)
 *   REGISTRY_DATA_DIR - Data storage directory (default: ./data)
 *   REGISTRY_API_KEY - API key for publish operations
 *   REGISTRY_PUBLISHER_ACL - JSON map of keyId -> allowed connector IDs
 *   REGISTRY_TRUSTED_KEYS - JSON array of trusted public keys for signature verification
 *   REGISTRY_REQUIRE_SIGNATURE - Require valid signature on publish (default: true)
 *
 * @module @gwi/registry
 */

import * as http from 'http';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { createHash, verify, createPublicKey } from 'crypto';
import { createLogger } from '@gwi/core';

const logger = createLogger('registry');

// =============================================================================
// Configuration
// =============================================================================

const PORT = parseInt(process.env.REGISTRY_PORT ?? '3456', 10);
const DATA_DIR = process.env.REGISTRY_DATA_DIR ?? './data';
const API_KEY = process.env.REGISTRY_API_KEY ?? '';
const PUBLISHER_ACL = JSON.parse(process.env.REGISTRY_PUBLISHER_ACL ?? '{}') as Record<
  string,
  string[]
>;
// Phase 21: Signature verification config
const REQUIRE_SIGNATURE = process.env.REGISTRY_REQUIRE_SIGNATURE !== 'false';
const TRUSTED_KEYS = JSON.parse(process.env.REGISTRY_TRUSTED_KEYS ?? '[]') as Array<{
  keyId: string;
  publicKey: string;
}>;

// =============================================================================
// Types
// =============================================================================

interface ConnectorMeta {
  id: string;
  version: string;
  manifest: Record<string, unknown>;
  tarballChecksum: string;
  signatureKeyId?: string;
  publishedAt: string;
  downloads: number;
}

interface PublishRequest {
  manifest: Record<string, unknown>;
  tarball: string; // base64 encoded
  signature: {
    version: string;
    keyId: string;
    algorithm: string;
    checksum: string;
    signature: string;
    signedAt: string;
  };
}

interface RegistryIndex {
  connectors: Map<string, ConnectorMeta[]>;
  totalDownloads: number;
}

// =============================================================================
// Ed25519 Signature Verification (Phase 21)
// =============================================================================

/**
 * Convert base64 to bytes
 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Verify Ed25519 signature using Node.js crypto
 */
function verifyEd25519Signature(
  message: string,
  signatureBase64: string,
  publicKeyBase64: string
): boolean {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = base64ToBytes(signatureBase64);
    const publicKeyBytes = base64ToBytes(publicKeyBase64);

    const keyObject = createPublicKey({
      key: Buffer.concat([
        // Ed25519 public key DER prefix
        Buffer.from('302a300506032b6570032100', 'hex'),
        Buffer.from(publicKeyBytes),
      ]),
      format: 'der',
      type: 'spki',
    });

    return verify(null, Buffer.from(messageBytes), keyObject, Buffer.from(signatureBytes));
  } catch (error) {
    logger.error('Signature verification error', { error });
    return false;
  }
}

/**
 * Verify a publish request signature
 */
function verifyPublishSignature(
  signature: PublishRequest['signature'],
  tarballChecksum: string
): { valid: boolean; error?: string } {
  // Find trusted key
  const trustedKey = TRUSTED_KEYS.find((k) => k.keyId === signature.keyId);
  if (!trustedKey) {
    // If no trusted keys configured, allow any signature (dev mode)
    if (TRUSTED_KEYS.length === 0) {
      logger.warn('No trusted keys configured, skipping signature verification');
      return { valid: true };
    }
    return { valid: false, error: `Unknown signing key: ${signature.keyId}` };
  }

  // Verify checksum matches
  if (signature.checksum !== tarballChecksum) {
    return {
      valid: false,
      error: `Checksum mismatch: signature has ${signature.checksum}, tarball is ${tarballChecksum}`,
    };
  }

  // Verify Ed25519 signature
  const isValid = verifyEd25519Signature(
    signature.checksum,
    signature.signature,
    trustedKey.publicKey
  );

  if (!isValid) {
    return { valid: false, error: 'Invalid Ed25519 signature' };
  }

  return { valid: true };
}

// =============================================================================
// Manifest Validation (Phase 21)
// =============================================================================

const REQUIRED_MANIFEST_FIELDS = ['id', 'version', 'displayName', 'capabilities'];

function validateManifest(manifest: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!manifest[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate id format
  if (manifest.id && typeof manifest.id === 'string') {
    if (!/^[a-z][a-z0-9-]*$/.test(manifest.id)) {
      errors.push('Invalid id format: must start with lowercase letter, contain only a-z, 0-9, -');
    }
  }

  // Validate version format (semver)
  if (manifest.version && typeof manifest.version === 'string') {
    if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
      errors.push('Invalid version format: must be semver (e.g., 1.0.0)');
    }
  }

  // Validate capabilities
  if (manifest.capabilities && !Array.isArray(manifest.capabilities)) {
    errors.push('capabilities must be an array');
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// Storage Layer
// =============================================================================

let registryIndex: RegistryIndex = {
  connectors: new Map(),
  totalDownloads: 0,
};

async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
  if (!existsSync(join(DATA_DIR, 'connectors'))) {
    await mkdir(join(DATA_DIR, 'connectors'), { recursive: true });
  }
  if (!existsSync(join(DATA_DIR, 'tarballs'))) {
    await mkdir(join(DATA_DIR, 'tarballs'), { recursive: true });
  }
  if (!existsSync(join(DATA_DIR, 'signatures'))) {
    await mkdir(join(DATA_DIR, 'signatures'), { recursive: true });
  }
}

async function loadIndex(): Promise<void> {
  const indexPath = join(DATA_DIR, 'index.json');
  if (existsSync(indexPath)) {
    const data = await readFile(indexPath, 'utf-8');
    const parsed = JSON.parse(data);
    registryIndex.connectors = new Map(Object.entries(parsed.connectors || {}));
    registryIndex.totalDownloads = parsed.totalDownloads || 0;
  }
}

async function saveIndex(): Promise<void> {
  const indexPath = join(DATA_DIR, 'index.json');
  const data = {
    connectors: Object.fromEntries(registryIndex.connectors),
    totalDownloads: registryIndex.totalDownloads,
  };
  await writeFile(indexPath, JSON.stringify(data, null, 2));
}

// =============================================================================
// Request Handlers
// =============================================================================

async function handleSearch(query: string): Promise<object> {
  const results: object[] = [];

  for (const [id, versions] of registryIndex.connectors) {
    if (versions.length === 0) continue;

    const latest = versions[0];
    const manifest = latest.manifest as Record<string, unknown>;

    // Simple text search
    const searchText =
      `${id} ${manifest.displayName ?? ''} ${manifest.description ?? ''}`.toLowerCase();
    if (query && !searchText.includes(query.toLowerCase())) {
      continue;
    }

    results.push({
      id,
      latestVersion: latest.version,
      displayName: manifest.displayName ?? id,
      description: manifest.description ?? '',
      author: manifest.author ?? 'unknown',
      capabilities: manifest.capabilities ?? [],
      downloads: versions.reduce((sum, v) => sum + v.downloads, 0),
      updatedAt: latest.publishedAt,
    });
  }

  return {
    connectors: results,
    total: results.length,
    page: 1,
    pageSize: 20,
  };
}

async function handleGetConnector(connectorId: string): Promise<object | null> {
  const versions = registryIndex.connectors.get(connectorId);
  if (!versions || versions.length === 0) {
    return null;
  }

  const latest = versions[0];
  const manifest = latest.manifest as Record<string, unknown>;

  return {
    id: connectorId,
    displayName: manifest.displayName ?? connectorId,
    description: manifest.description ?? '',
    author: manifest.author ?? 'unknown',
    capabilities: manifest.capabilities ?? [],
    latestVersion: latest.version,
    versions: versions.map((v) => v.version),
    totalDownloads: versions.reduce((sum, v) => sum + v.downloads, 0),
    createdAt: versions[versions.length - 1].publishedAt,
    updatedAt: latest.publishedAt,
  };
}

async function handleGetVersion(
  connectorId: string,
  version: string
): Promise<object | null> {
  const versions = registryIndex.connectors.get(connectorId);
  if (!versions) return null;

  const meta = versions.find((v) => v.version === version);
  if (!meta) return null;

  return {
    id: connectorId,
    version,
    manifest: meta.manifest,
    tarballUrl: `/v1/connectors/${connectorId}/${version}/tarball`,
    tarballChecksum: meta.tarballChecksum,
    signatureUrl: `/v1/connectors/${connectorId}/${version}/signature`,
    publishedAt: meta.publishedAt,
    downloads: meta.downloads,
  };
}

async function handleGetTarball(
  connectorId: string,
  version: string
): Promise<Buffer | null> {
  const tarballPath = join(DATA_DIR, 'tarballs', `${connectorId}@${version}.tar.gz`);
  if (!existsSync(tarballPath)) {
    return null;
  }

  // Increment download count
  const versions = registryIndex.connectors.get(connectorId);
  const meta = versions?.find((v) => v.version === version);
  if (meta) {
    meta.downloads++;
    registryIndex.totalDownloads++;
    await saveIndex();
  }

  return await readFile(tarballPath);
}

async function handleGetSignature(
  connectorId: string,
  version: string
): Promise<object | null> {
  const sigPath = join(DATA_DIR, 'signatures', `${connectorId}@${version}.json`);
  if (!existsSync(sigPath)) {
    return null;
  }

  const data = await readFile(sigPath, 'utf-8');
  return JSON.parse(data);
}

async function handlePublish(
  body: PublishRequest,
  apiKey: string
): Promise<{ success: boolean; error?: string; version?: string; warnings?: string[] }> {
  const warnings: string[] = [];

  // Validate API key
  if (!API_KEY || apiKey !== API_KEY) {
    return { success: false, error: 'Invalid API key' };
  }

  // Phase 21: Validate manifest with schema
  const manifestValidation = validateManifest(body.manifest);
  if (!manifestValidation.valid) {
    return {
      success: false,
      error: `Invalid manifest: ${manifestValidation.errors.join(', ')}`,
    };
  }

  const manifest = body.manifest;
  const connectorId = manifest.id as string;
  const version = manifest.version as string;

  // Validate signature presence
  const keyId = body.signature?.keyId;
  if (!keyId) {
    if (REQUIRE_SIGNATURE) {
      return { success: false, error: 'Signature required (REGISTRY_REQUIRE_SIGNATURE=true)' };
    }
    warnings.push('No signature provided - connector will not be verified on install');
  }

  // Validate signature keyId against ACL
  if (keyId) {
    const allowedConnectors = PUBLISHER_ACL[keyId];
    if (allowedConnectors && !allowedConnectors.includes(connectorId) && !allowedConnectors.includes('*')) {
      return {
        success: false,
        error: `Key ${keyId} not authorized to publish ${connectorId}`,
      };
    }
  }

  // Decode tarball
  const tarballBuffer = Buffer.from(body.tarball, 'base64');

  // Verify checksum
  const computedChecksum = `sha256:${createHash('sha256').update(tarballBuffer).digest('hex')}`;

  // Phase 21: Verify Ed25519 signature if present
  if (body.signature && REQUIRE_SIGNATURE) {
    if (body.signature.checksum !== computedChecksum) {
      return {
        success: false,
        error: `Checksum mismatch: signature has ${body.signature.checksum}, tarball is ${computedChecksum}`,
      };
    }

    const sigVerification = verifyPublishSignature(body.signature, computedChecksum);
    if (!sigVerification.valid) {
      return { success: false, error: `Signature verification failed: ${sigVerification.error}` };
    }
  }

  // Check if version already exists (immutability enforcement)
  const existingVersions = registryIndex.connectors.get(connectorId) || [];
  if (existingVersions.some((v) => v.version === version)) {
    return { success: false, error: `Version ${version} already exists (immutable - cannot republish)` };
  }

  // Store tarball
  const tarballPath = join(DATA_DIR, 'tarballs', `${connectorId}@${version}.tar.gz`);
  await writeFile(tarballPath, tarballBuffer);

  // Store signature
  if (body.signature) {
    const sigPath = join(DATA_DIR, 'signatures', `${connectorId}@${version}.json`);
    await writeFile(sigPath, JSON.stringify(body.signature, null, 2));
  }

  // Update index
  const meta: ConnectorMeta = {
    id: connectorId,
    version,
    manifest,
    tarballChecksum: computedChecksum,
    signatureKeyId: keyId,
    publishedAt: new Date().toISOString(),
    downloads: 0,
  };

  existingVersions.unshift(meta);
  existingVersions.sort((a, b) =>
    b.version.localeCompare(a.version, undefined, { numeric: true })
  );
  registryIndex.connectors.set(connectorId, existingVersions);
  await saveIndex();

  logger.info('Published connector', { connectorId, version, keyId: keyId || 'none' });

  return { success: true, version, warnings: warnings.length > 0 ? warnings : undefined };
}

// =============================================================================
// Server
// =============================================================================

async function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

async function main(): Promise<void> {
  await ensureDataDir();
  await loadIndex();

  logger.info('Loaded connectors from data directory', { count: registryIndex.connectors.size, dataDir: DATA_DIR });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const path = url.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // Search endpoint
      if (path === '/v1/search' && req.method === 'GET') {
        const query = url.searchParams.get('q') ?? '';
        const result = await handleSearch(query);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      // Publish endpoint
      if (path === '/v1/publish' && req.method === 'POST') {
        const apiKey = req.headers['x-api-key'] as string || '';
        const body = await parseBody(req);
        const data = JSON.parse(body) as PublishRequest;
        const result = await handlePublish(data, apiKey);

        if (result.success) {
          res.writeHead(201, { 'Content-Type': 'application/json' });
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify(result));
        return;
      }

      // Connector info endpoint
      const infoMatch = path.match(/^\/v1\/connectors\/([a-z][a-z0-9-]*)$/);
      if (infoMatch && req.method === 'GET') {
        const [, connectorId] = infoMatch;
        const result = await handleGetConnector(connectorId);
        if (!result) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      // Version info endpoint
      const versionMatch = path.match(
        /^\/v1\/connectors\/([a-z][a-z0-9-]*)\/(\d+\.\d+\.\d+.*)$/
      );
      if (
        versionMatch &&
        !path.includes('/tarball') &&
        !path.includes('/signature') &&
        req.method === 'GET'
      ) {
        const [, connectorId, version] = versionMatch;
        const result = await handleGetVersion(connectorId, version);
        if (!result) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      // Tarball endpoint
      const tarballMatch = path.match(
        /^\/v1\/connectors\/([a-z][a-z0-9-]*)\/(\d+\.\d+\.\d+.*)\/tarball$/
      );
      if (tarballMatch && req.method === 'GET') {
        const [, connectorId, version] = tarballMatch;
        const tarball = await handleGetTarball(connectorId, version);
        if (!tarball) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'application/gzip',
          'Content-Length': tarball.length.toString(),
        });
        res.end(tarball);
        return;
      }

      // Signature endpoint
      const sigMatch = path.match(
        /^\/v1\/connectors\/([a-z][a-z0-9-]*)\/(\d+\.\d+\.\d+.*)\/signature$/
      );
      if (sigMatch && req.method === 'GET') {
        const [, connectorId, version] = sigMatch;
        const signature = await handleGetSignature(connectorId, version);
        if (!signature) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(signature));
        return;
      }

      // Health check
      if (path === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            connectors: registryIndex.connectors.size,
            totalDownloads: registryIndex.totalDownloads,
          })
        );
        return;
      }

      // Phase 21: Stats endpoint
      if (path === '/v1/stats' && req.method === 'GET') {
        const connectorList: Array<{
          id: string;
          versions: number;
          downloads: number;
          latestVersion: string;
        }> = [];

        for (const [id, versions] of registryIndex.connectors) {
          if (versions.length > 0) {
            connectorList.push({
              id,
              versions: versions.length,
              downloads: versions.reduce((sum, v) => sum + v.downloads, 0),
              latestVersion: versions[0].version,
            });
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            totalConnectors: registryIndex.connectors.size,
            totalVersions: connectorList.reduce((sum, c) => sum + c.versions, 0),
            totalDownloads: registryIndex.totalDownloads,
            signatureRequired: REQUIRE_SIGNATURE,
            trustedKeysConfigured: TRUSTED_KEYS.length,
            connectors: connectorList,
          })
        );
        return;
      }

      // Not found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      logger.error('Request error', { error });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  server.listen(PORT, () => {
    logger.info('GWI Connector Registry Server started', {
      phase: 21,
      port: PORT,
      dataDir: DATA_DIR,
      signatureRequired: REQUIRE_SIGNATURE,
      trustedKeysCount: TRUSTED_KEYS.length,
      endpoints: [
        'GET  /v1/search?q={query}',
        'GET  /v1/connectors/{id}',
        'GET  /v1/connectors/{id}/{version}',
        'GET  /v1/connectors/{id}/{version}/tarball',
        'GET  /v1/connectors/{id}/{version}/signature',
        'POST /v1/publish (requires X-API-Key header)',
        'GET  /v1/stats',
        'GET  /health',
      ],
    });
  });
}

main().catch((err) => {
  logger.error('Failed to start server', { error: err });
  process.exit(1);
});
