/**
 * Connector Installer
 *
 * Phase 9: Install, uninstall, and manage connectors from remote registries.
 *
 * Features:
 * - Download and verify connectors
 * - Signature verification
 * - Install receipts for tracking
 * - Cache management
 * - Version pinning support
 *
 * @module @gwi/core/connectors/installer
 */

import { readFile, writeFile, mkdir, rm, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { createRemoteRegistry } from './remote-registry.js';
import { extractTarball, computeTarballChecksum } from './tarball.js';
import { verifySignature, loadTrustedKeys, type TrustedKeysConfig } from './signature.js';
import { computeChecksum } from './registry.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Install receipt stored with installed connectors
 */
export interface InstallReceipt {
  version: '1.0';
  connectorId: string;
  connectorVersion: string;
  installedAt: string;
  installedFrom: 'registry' | 'local' | 'tarball';
  registryUrl?: string;
  tarballChecksum: string;
  entrypointChecksum: string;
  signatureVerified: boolean;
  signatureKeyId?: string;
}

/**
 * Install options
 */
export interface InstallOptions {
  registryUrl?: string;
  skipSignature?: boolean;
  force?: boolean;
  trustedKeys?: TrustedKeysConfig;
}

/**
 * Install result
 */
export interface InstallResult {
  success: boolean;
  connectorId: string;
  version: string;
  installPath?: string;
  receipt?: InstallReceipt;
  error?: string;
}

/**
 * Uninstall result
 */
export interface UninstallResult {
  success: boolean;
  connectorId: string;
  version: string;
  error?: string;
}

/**
 * Cache entry
 */
export interface CacheEntry {
  connectorId: string;
  version: string;
  tarballPath: string;
  cachedAt: string;
  expiresAt: string;
  size: number;
}

// =============================================================================
// Paths
// =============================================================================

/**
 * Get GWI data directory
 */
export function getGwiDataDir(): string {
  return process.env.GWI_DATA_DIR ?? join(homedir(), '.gwi');
}

/**
 * Get connector install directory
 */
export function getConnectorInstallDir(): string {
  return join(getGwiDataDir(), 'connectors');
}

/**
 * Get cache directory
 */
export function getCacheDir(): string {
  return join(getGwiDataDir(), 'cache', 'registry');
}

/**
 * Get path for an installed connector
 */
export function getConnectorPath(connectorId: string, version: string): string {
  return join(getConnectorInstallDir(), `${connectorId}@${version}`);
}

// =============================================================================
// Connector Installer
// =============================================================================

/**
 * Install a connector from a remote registry
 */
export async function installConnector(
  connectorId: string,
  version: string,
  options?: InstallOptions
): Promise<InstallResult> {
  const registry = createRemoteRegistry(options?.registryUrl);

  try {
    // Resolve 'latest' to actual version
    const resolvedVersion = await registry.resolveVersion(connectorId, version);

    // Check if already installed
    const installPath = getConnectorPath(connectorId, resolvedVersion);
    if (existsSync(installPath) && !options?.force) {
      return {
        success: false,
        connectorId,
        version: resolvedVersion,
        error: `Connector ${connectorId}@${resolvedVersion} is already installed. Use --force to reinstall.`,
      };
    }

    // Get version metadata
    const versionInfo = await registry.getVersion(connectorId, resolvedVersion);

    // Download tarball
    const tarball = await registry.downloadTarball(connectorId, resolvedVersion);

    // Verify tarball checksum
    const tarballChecksum = computeTarballChecksum(tarball);
    if (tarballChecksum !== versionInfo.tarballChecksum) {
      return {
        success: false,
        connectorId,
        version: resolvedVersion,
        error: `Tarball checksum mismatch: expected ${versionInfo.tarballChecksum}, got ${tarballChecksum}`,
      };
    }

    // Download and verify signature
    let signatureVerified = false;
    let signatureKeyId: string | undefined;

    if (!options?.skipSignature) {
      try {
        const signature = await registry.downloadSignature(connectorId, resolvedVersion);
        const trustedKeys = options?.trustedKeys ?? (await loadTrustedKeys());
        const verifyResult = await verifySignature(tarballChecksum, signature, trustedKeys);

        if (!verifyResult.valid) {
          return {
            success: false,
            connectorId,
            version: resolvedVersion,
            error: `Signature verification failed: ${verifyResult.message ?? verifyResult.error}`,
          };
        }

        signatureVerified = true;
        signatureKeyId = verifyResult.keyId;
      } catch (error) {
        return {
          success: false,
          connectorId,
          version: resolvedVersion,
          error: `Failed to verify signature: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    // Extract to install directory
    if (existsSync(installPath)) {
      await rm(installPath, { recursive: true });
    }
    await mkdir(installPath, { recursive: true });
    await extractTarball(tarball, installPath);

    // Compute entrypoint checksum
    const entrypointPath = join(installPath, versionInfo.manifest.entrypoint);
    const entrypointChecksum = await computeChecksum(entrypointPath);

    // Create install receipt
    const receipt: InstallReceipt = {
      version: '1.0',
      connectorId,
      connectorVersion: resolvedVersion,
      installedAt: new Date().toISOString(),
      installedFrom: 'registry',
      registryUrl: registry.getBaseUrl(),
      tarballChecksum,
      entrypointChecksum,
      signatureVerified,
      signatureKeyId,
    };

    // Write receipt
    const receiptPath = join(installPath, 'install-receipt.json');
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2));

    return {
      success: true,
      connectorId,
      version: resolvedVersion,
      installPath,
      receipt,
    };
  } catch (error) {
    return {
      success: false,
      connectorId,
      version,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Uninstall a connector
 */
export async function uninstallConnector(
  connectorId: string,
  version: string
): Promise<UninstallResult> {
  const installPath = getConnectorPath(connectorId, version);

  if (!existsSync(installPath)) {
    return {
      success: false,
      connectorId,
      version,
      error: `Connector ${connectorId}@${version} is not installed`,
    };
  }

  try {
    await rm(installPath, { recursive: true });
    return {
      success: true,
      connectorId,
      version,
    };
  } catch (error) {
    return {
      success: false,
      connectorId,
      version,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * List installed connectors
 */
export async function listInstalledConnectors(): Promise<
  Array<{ id: string; version: string; receipt?: InstallReceipt }>
> {
  const installDir = getConnectorInstallDir();

  if (!existsSync(installDir)) {
    return [];
  }

  const entries = await readdir(installDir);
  const result: Array<{ id: string; version: string; receipt?: InstallReceipt }> = [];

  for (const entry of entries) {
    const match = entry.match(/^([a-z][a-z0-9-]*)@(\d+\.\d+\.\d+.*)$/);
    if (!match) continue;

    const [, id, version] = match;
    const entryPath = join(installDir, entry);
    const stats = await stat(entryPath);

    if (!stats.isDirectory()) continue;

    // Try to read receipt
    let receipt: InstallReceipt | undefined;
    const receiptPath = join(entryPath, 'install-receipt.json');
    if (existsSync(receiptPath)) {
      try {
        const content = await readFile(receiptPath, 'utf-8');
        receipt = JSON.parse(content) as InstallReceipt;
      } catch {
        // Ignore parse errors
      }
    }

    result.push({ id, version, receipt });
  }

  return result;
}

/**
 * Get install receipt for a connector
 */
export async function getInstallReceipt(
  connectorId: string,
  version: string
): Promise<InstallReceipt | undefined> {
  const installPath = getConnectorPath(connectorId, version);
  const receiptPath = join(installPath, 'install-receipt.json');

  if (!existsSync(receiptPath)) {
    return undefined;
  }

  try {
    const content = await readFile(receiptPath, 'utf-8');
    return JSON.parse(content) as InstallReceipt;
  } catch {
    return undefined;
  }
}

// =============================================================================
// Cache Management
// =============================================================================

/**
 * Cache a tarball
 */
export async function cacheTarball(
  connectorId: string,
  version: string,
  tarball: Buffer,
  ttlSeconds: number = 86400
): Promise<CacheEntry> {
  const cacheDir = getCacheDir();
  const connectorCacheDir = join(cacheDir, connectorId);

  await mkdir(connectorCacheDir, { recursive: true });

  const tarballPath = join(connectorCacheDir, `${version}.tar.gz`);
  await writeFile(tarballPath, tarball);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const entry: CacheEntry = {
    connectorId,
    version,
    tarballPath,
    cachedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    size: tarball.length,
  };

  const metaPath = join(connectorCacheDir, `${version}.meta.json`);
  await writeFile(metaPath, JSON.stringify(entry, null, 2));

  return entry;
}

/**
 * Get cached tarball
 */
export async function getCachedTarball(
  connectorId: string,
  version: string
): Promise<{ tarball: Buffer; entry: CacheEntry } | undefined> {
  const cacheDir = getCacheDir();
  const metaPath = join(cacheDir, connectorId, `${version}.meta.json`);

  if (!existsSync(metaPath)) {
    return undefined;
  }

  try {
    const content = await readFile(metaPath, 'utf-8');
    const entry = JSON.parse(content) as CacheEntry;

    // Check expiration
    const expiresAt = new Date(entry.expiresAt);
    if (expiresAt < new Date()) {
      // Expired, remove cache entry
      await rm(metaPath, { force: true });
      await rm(entry.tarballPath, { force: true });
      return undefined;
    }

    // Read tarball
    const tarball = await readFile(entry.tarballPath);
    return { tarball, entry };
  } catch {
    return undefined;
  }
}

/**
 * Clear all cached tarballs
 */
export async function clearCache(): Promise<number> {
  const cacheDir = getCacheDir();

  if (!existsSync(cacheDir)) {
    return 0;
  }

  let count = 0;
  const entries = await readdir(cacheDir);

  for (const entry of entries) {
    const entryPath = join(cacheDir, entry);
    const stats = await stat(entryPath);

    if (stats.isDirectory()) {
      const files = await readdir(entryPath);
      count += files.filter((f) => f.endsWith('.tar.gz')).length;
      await rm(entryPath, { recursive: true });
    }
  }

  return count;
}

// =============================================================================
// Version Pinning
// =============================================================================

/**
 * Pin a connector to a specific version
 */
export async function pinConnectorVersion(
  connectorId: string,
  version: string
): Promise<void> {
  const pinsPath = join(getGwiDataDir(), 'connector-pins.json');

  let pins: Record<string, string> = {};
  if (existsSync(pinsPath)) {
    const content = await readFile(pinsPath, 'utf-8');
    const data = JSON.parse(content);
    pins = data.pins ?? {};
  }

  pins[connectorId] = version;

  await mkdir(dirname(pinsPath), { recursive: true });
  await writeFile(pinsPath, JSON.stringify({ version: '1.0', pins }, null, 2));
}

/**
 * Get pinned version for a connector
 */
export async function getPinnedVersion(connectorId: string): Promise<string | undefined> {
  const pinsPath = join(getGwiDataDir(), 'connector-pins.json');

  if (!existsSync(pinsPath)) {
    return undefined;
  }

  try {
    const content = await readFile(pinsPath, 'utf-8');
    const data = JSON.parse(content);
    return data.pins?.[connectorId];
  } catch {
    return undefined;
  }
}

/**
 * Remove version pin for a connector
 */
export async function unpinConnectorVersion(connectorId: string): Promise<boolean> {
  const pinsPath = join(getGwiDataDir(), 'connector-pins.json');

  if (!existsSync(pinsPath)) {
    return false;
  }

  try {
    const content = await readFile(pinsPath, 'utf-8');
    const data = JSON.parse(content);

    if (!data.pins?.[connectorId]) {
      return false;
    }

    delete data.pins[connectorId];
    await writeFile(pinsPath, JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}
