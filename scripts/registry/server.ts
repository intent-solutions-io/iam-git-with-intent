#!/usr/bin/env npx tsx
/**
 * Local Development Registry Server
 *
 * Phase 9: Serves connectors from local registry-data/ for development.
 *
 * Usage:
 *   npx tsx scripts/registry/server.ts
 *   npm run registry:dev
 *
 * Endpoints:
 *   GET /v1/search?q={query}
 *   GET /v1/connectors/{id}
 *   GET /v1/connectors/{id}/{version}
 *   GET /v1/connectors/{id}/{version}/tarball
 *   GET /v1/connectors/{id}/{version}/signature
 *
 * @module scripts/registry/server
 */

import http from 'http';
import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_DATA = join(__dirname, '..', '..', 'connectors');
const PORT = parseInt(process.env.REGISTRY_PORT ?? '3456', 10);

// =============================================================================
// Types
// =============================================================================

interface ConnectorMeta {
  id: string;
  version: string;
  manifest: Record<string, unknown>;
  tarballChecksum: string;
}

// =============================================================================
// Data Loading
// =============================================================================

async function loadConnectors(): Promise<Map<string, ConnectorMeta[]>> {
  const connectors = new Map<string, ConnectorMeta[]>();

  if (!existsSync(REGISTRY_DATA)) {
    console.warn(`Registry data not found: ${REGISTRY_DATA}`);
    return connectors;
  }

  const entries = await readdir(REGISTRY_DATA);

  for (const entry of entries) {
    const match = entry.match(/^([a-z][a-z0-9-]*)@(\d+\.\d+\.\d+.*)$/);
    if (!match) continue;

    const [, id, version] = match;
    const entryPath = join(REGISTRY_DATA, entry);
    const stats = await stat(entryPath);

    if (!stats.isDirectory()) continue;

    const manifestPath = join(entryPath, 'connector.manifest.json');
    if (!existsSync(manifestPath)) continue;

    try {
      const manifestJson = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestJson);

      // Create a mock tarball checksum
      const tarballChecksum = `sha256:${createHash('sha256').update(entry).digest('hex')}`;

      const meta: ConnectorMeta = {
        id,
        version,
        manifest,
        tarballChecksum,
      };

      if (!connectors.has(id)) {
        connectors.set(id, []);
      }
      connectors.get(id)!.push(meta);
    } catch (err) {
      console.error(`Failed to load ${entry}:`, err);
    }
  }

  // Sort versions descending
  for (const [, versions] of connectors) {
    versions.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  }

  return connectors;
}

// =============================================================================
// Request Handlers
// =============================================================================

async function handleSearch(
  query: string,
  connectors: Map<string, ConnectorMeta[]>
): Promise<object> {
  const results: object[] = [];

  for (const [id, versions] of connectors) {
    const latest = versions[0];
    const manifest = latest.manifest as Record<string, unknown>;

    // Simple text search
    const searchText = `${id} ${manifest.displayName ?? ''} ${manifest.description ?? ''}`.toLowerCase();
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
      downloads: Math.floor(Math.random() * 10000),
      updatedAt: new Date().toISOString(),
    });
  }

  return {
    connectors: results,
    total: results.length,
    page: 1,
    pageSize: 20,
  };
}

async function handleGetConnector(
  connectorId: string,
  connectors: Map<string, ConnectorMeta[]>
): Promise<object | null> {
  const versions = connectors.get(connectorId);
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
    totalDownloads: Math.floor(Math.random() * 10000),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function handleGetVersion(
  connectorId: string,
  version: string,
  connectors: Map<string, ConnectorMeta[]>
): Promise<object | null> {
  const versions = connectors.get(connectorId);
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
    publishedAt: new Date().toISOString(),
    downloads: Math.floor(Math.random() * 1000),
  };
}

async function handleGetTarball(
  connectorId: string,
  version: string
): Promise<Buffer | null> {
  const connectorPath = join(REGISTRY_DATA, `${connectorId}@${version}`);
  if (!existsSync(connectorPath)) return null;

  // Create a simple tar archive from the connector directory
  const files = await collectFiles(connectorPath);
  const tarBuffer = createSimpleTar(files);
  return gzipSync(tarBuffer, { level: 9 });
}

async function handleGetSignature(
  connectorId: string,
  version: string,
  tarballChecksum: string
): Promise<object> {
  // Return a mock signature for development
  return {
    version: '1.0',
    keyId: 'gwi-dev-local',
    algorithm: 'ed25519',
    checksum: tarballChecksum,
    signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    signedAt: new Date().toISOString(),
  };
}

// =============================================================================
// Tar Utilities
// =============================================================================

interface FileEntry {
  name: string;
  content: Buffer;
  isDirectory: boolean;
}

async function collectFiles(dir: string, prefix = ''): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  const items = await readdir(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const relativePath = prefix ? `${prefix}/${item}` : item;
    const stats = await stat(fullPath);

    if (stats.isDirectory()) {
      entries.push({ name: relativePath + '/', content: Buffer.alloc(0), isDirectory: true });
      entries.push(...(await collectFiles(fullPath, relativePath)));
    } else {
      const content = await readFile(fullPath);
      entries.push({ name: relativePath, content, isDirectory: false });
    }
  }

  return entries;
}

function createSimpleTar(entries: FileEntry[]): Buffer {
  const blocks: Buffer[] = [];

  // Sort entries alphabetically
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const header = Buffer.alloc(512);

    // Name
    header.write(entry.name, 0, 100, 'utf-8');

    // Mode
    header.write(entry.isDirectory ? '0000755 ' : '0000644 ', 100, 8, 'utf-8');

    // UID, GID
    header.write('0000000 ', 108, 8, 'utf-8');
    header.write('0000000 ', 116, 8, 'utf-8');

    // Size
    const size = entry.content.length.toString(8).padStart(11, '0');
    header.write(size + ' ', 124, 12, 'utf-8');

    // Mtime
    header.write('00000000000 ', 136, 12, 'utf-8');

    // Checksum placeholder
    header.write('        ', 148, 8, 'utf-8');

    // Type flag
    header[156] = entry.isDirectory ? 53 : 48;

    // Magic
    header.write('ustar ', 257, 6, 'utf-8');

    // Calculate checksum
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      checksum += header[i];
    }
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf-8');

    blocks.push(header);

    if (!entry.isDirectory && entry.content.length > 0) {
      blocks.push(entry.content);
      const padding = 512 - (entry.content.length % 512);
      if (padding < 512) {
        blocks.push(Buffer.alloc(padding));
      }
    }
  }

  // End blocks
  blocks.push(Buffer.alloc(512));
  blocks.push(Buffer.alloc(512));

  return Buffer.concat(blocks);
}

// =============================================================================
// Server
// =============================================================================

async function main(): Promise<void> {
  const connectors = await loadConnectors();
  console.log(`Loaded ${connectors.size} connector(s) from ${REGISTRY_DATA}`);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const path = url.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // Search endpoint
      if (path === '/v1/search') {
        const query = url.searchParams.get('q') ?? '';
        const result = await handleSearch(query, connectors);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      // Connector info endpoint
      const infoMatch = path.match(/^\/v1\/connectors\/([a-z][a-z0-9-]*)$/);
      if (infoMatch) {
        const [, connectorId] = infoMatch;
        const result = await handleGetConnector(connectorId, connectors);
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
      const versionMatch = path.match(/^\/v1\/connectors\/([a-z][a-z0-9-]*)\/(\d+\.\d+\.\d+.*)$/);
      if (versionMatch && !path.includes('/tarball') && !path.includes('/signature')) {
        const [, connectorId, version] = versionMatch;
        const result = await handleGetVersion(connectorId, version, connectors);
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
      const tarballMatch = path.match(/^\/v1\/connectors\/([a-z][a-z0-9-]*)\/(\d+\.\d+\.\d+.*)\/tarball$/);
      if (tarballMatch) {
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
      const sigMatch = path.match(/^\/v1\/connectors\/([a-z][a-z0-9-]*)\/(\d+\.\d+\.\d+.*)\/signature$/);
      if (sigMatch) {
        const [, connectorId, version] = sigMatch;
        const versions = connectors.get(connectorId);
        const meta = versions?.find((v) => v.version === version);
        if (!meta) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        const signature = await handleGetSignature(connectorId, version, meta.tarballChecksum);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(signature));
        return;
      }

      // Health check
      if (path === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', connectors: connectors.size }));
        return;
      }

      // Not found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      console.error('Request error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  server.listen(PORT, () => {
    console.log(`\nGWI Local Registry Server`);
    console.log(`========================`);
    console.log(`Listening on http://localhost:${PORT}`);
    console.log(`\nEndpoints:`);
    console.log(`  GET /v1/search?q={query}`);
    console.log(`  GET /v1/connectors/{id}`);
    console.log(`  GET /v1/connectors/{id}/{version}`);
    console.log(`  GET /v1/connectors/{id}/{version}/tarball`);
    console.log(`  GET /v1/connectors/{id}/{version}/signature`);
    console.log(`  GET /health`);
    console.log(`\nPress Ctrl+C to stop\n`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
