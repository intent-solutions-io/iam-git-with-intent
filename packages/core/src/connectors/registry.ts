/**
 * Connector Registry
 *
 * Phase 6: Local filesystem registry for installable connectors.
 *
 * Registry layout:
 *   connectors/
 *     github@1.0.0/
 *       connector.manifest.json
 *       dist/index.js
 *     airbyte@0.1.0/
 *       connector.manifest.json
 *       dist/index.js
 *
 * Hard rules:
 * - Only load connectors with valid manifests
 * - Verify checksum before loading
 * - Run conformance tests on load (optional, controlled by flag)
 *
 * @module @gwi/core/connectors/registry
 */

import { createHash } from 'crypto';
import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import {
  ConnectorManifest,
  parseManifest,
} from './manifest.js';
import type { Connector, ConnectorRegistry } from './types.js';

// =============================================================================
// Registry Types
// =============================================================================

/**
 * Installed connector metadata
 */
export interface InstalledConnector {
  /** Connector ID */
  id: string;

  /** Installed version */
  version: string;

  /** Full path to connector directory */
  path: string;

  /** Parsed manifest */
  manifest: ConnectorManifest;

  /** Whether checksum has been verified */
  checksumVerified: boolean;

  /** Whether conformance tests passed */
  conformancePassed?: boolean;
}

/**
 * Load result
 */
export interface ConnectorLoadResult {
  success: boolean;
  connector?: Connector;
  installed?: InstalledConnector;
  error?: string;
}

/**
 * Registry scan result
 */
export interface RegistryScanResult {
  connectors: InstalledConnector[];
  errors: Array<{ path: string; error: string }>;
}

// =============================================================================
// Checksum Utilities
// =============================================================================

/**
 * Compute SHA256 checksum of a file
 */
export async function computeChecksum(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  const hash = createHash('sha256').update(content).digest('hex');
  return `sha256:${hash}`;
}

/**
 * Verify checksum matches manifest
 */
export async function verifyChecksum(
  connectorPath: string,
  manifest: ConnectorManifest
): Promise<{ valid: boolean; computed: string; expected: string }> {
  const entrypointPath = join(connectorPath, manifest.entrypoint);
  const computed = await computeChecksum(entrypointPath);
  return {
    valid: computed === manifest.checksum,
    computed,
    expected: manifest.checksum,
  };
}

// =============================================================================
// Local Filesystem Registry
// =============================================================================

/**
 * Local filesystem connector registry
 */
export class LocalConnectorRegistry {
  private basePath: string;
  private loadedConnectors = new Map<string, InstalledConnector>();

  constructor(basePath: string = 'connectors') {
    this.basePath = resolve(basePath);
  }

  /**
   * Get the registry base path
   */
  getBasePath(): string {
    return this.basePath;
  }

  /**
   * Check if registry directory exists
   */
  exists(): boolean {
    return existsSync(this.basePath);
  }

  /**
   * Scan registry for installed connectors
   */
  async scan(): Promise<RegistryScanResult> {
    const result: RegistryScanResult = {
      connectors: [],
      errors: [],
    };

    if (!this.exists()) {
      return result;
    }

    const entries = await readdir(this.basePath);

    for (const entry of entries) {
      const entryPath = join(this.basePath, entry);
      const stats = await stat(entryPath);

      if (!stats.isDirectory()) {
        continue;
      }

      // Parse directory name: id@version
      const match = entry.match(/^([a-z][a-z0-9-]*)@(\d+\.\d+\.\d+.*)$/);
      if (!match) {
        result.errors.push({
          path: entryPath,
          error: `Invalid directory name format: ${entry}. Expected: id@version`,
        });
        continue;
      }

      const [, id, version] = match;
      const manifestPath = join(entryPath, 'connector.manifest.json');

      if (!existsSync(manifestPath)) {
        result.errors.push({
          path: entryPath,
          error: 'Missing connector.manifest.json',
        });
        continue;
      }

      try {
        const manifestJson = await readFile(manifestPath, 'utf-8');
        const parseResult = parseManifest(manifestJson);

        if (!parseResult.valid || !parseResult.manifest) {
          result.errors.push({
            path: entryPath,
            error: `Invalid manifest: ${parseResult.errors.join(', ')}`,
          });
          continue;
        }

        const manifest = parseResult.manifest;

        // Verify ID and version match directory name
        if (manifest.id !== id) {
          result.errors.push({
            path: entryPath,
            error: `Manifest ID '${manifest.id}' does not match directory '${id}'`,
          });
          continue;
        }

        if (manifest.version !== version) {
          result.errors.push({
            path: entryPath,
            error: `Manifest version '${manifest.version}' does not match directory '${version}'`,
          });
          continue;
        }

        // Verify entrypoint exists
        const entrypointPath = join(entryPath, manifest.entrypoint);
        if (!existsSync(entrypointPath)) {
          result.errors.push({
            path: entryPath,
            error: `Entrypoint not found: ${manifest.entrypoint}`,
          });
          continue;
        }

        // Verify checksum
        const checksumResult = await verifyChecksum(entryPath, manifest);

        const installed: InstalledConnector = {
          id,
          version,
          path: entryPath,
          manifest,
          checksumVerified: checksumResult.valid,
        };

        if (!checksumResult.valid) {
          result.errors.push({
            path: entryPath,
            error: `Checksum mismatch: expected ${checksumResult.expected}, got ${checksumResult.computed}`,
          });
          // Still include in list but mark as not verified
        }

        result.connectors.push(installed);
        this.loadedConnectors.set(`${id}@${version}`, installed);
      } catch (error) {
        result.errors.push({
          path: entryPath,
          error: `Failed to read manifest: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    return result;
  }

  /**
   * List installed connectors
   */
  async listInstalled(): Promise<InstalledConnector[]> {
    const result = await this.scan();
    return result.connectors;
  }

  /**
   * Get a specific installed connector
   */
  async getInstalled(id: string, version?: string): Promise<InstalledConnector | undefined> {
    const connectors = await this.listInstalled();

    if (version) {
      return connectors.find(c => c.id === id && c.version === version);
    }

    // Return latest version if no version specified
    const matching = connectors
      .filter(c => c.id === id)
      .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));

    return matching[0];
  }

  /**
   * Load a connector module dynamically
   *
   * IMPORTANT: This uses dynamic import and should only load verified connectors.
   */
  async loadConnector(
    id: string,
    version?: string,
    options?: { skipChecksumVerification?: boolean }
  ): Promise<ConnectorLoadResult> {
    const installed = await this.getInstalled(id, version);

    if (!installed) {
      return {
        success: false,
        error: version
          ? `Connector ${id}@${version} not found`
          : `Connector ${id} not found`,
      };
    }

    // Block loading if checksum not verified (unless explicitly skipped)
    if (!installed.checksumVerified && !options?.skipChecksumVerification) {
      return {
        success: false,
        installed,
        error: 'Checksum verification failed. Use skipChecksumVerification to force load.',
      };
    }

    try {
      const entrypointPath = join(installed.path, installed.manifest.entrypoint);
      const module = await import(entrypointPath);

      // Expect the module to export a 'connector' or 'default'
      const connector: Connector = module.connector ?? module.default;

      if (!connector) {
        return {
          success: false,
          installed,
          error: 'Module does not export a connector',
        };
      }

      // Validate connector has required interface
      if (typeof connector.id !== 'string' || typeof connector.getTool !== 'function') {
        return {
          success: false,
          installed,
          error: 'Invalid connector interface: missing id or getTool',
        };
      }

      return {
        success: true,
        connector,
        installed,
      };
    } catch (error) {
      return {
        success: false,
        installed,
        error: `Failed to load connector: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

// =============================================================================
// Registry Integration
// =============================================================================

/**
 * Load connectors from local registry into a ConnectorRegistry
 */
export async function loadConnectorsIntoRegistry(
  localRegistry: LocalConnectorRegistry,
  targetRegistry: ConnectorRegistry,
  options?: {
    skipChecksumVerification?: boolean;
    onError?: (id: string, error: string) => void;
  }
): Promise<{ loaded: string[]; failed: string[] }> {
  const result = { loaded: [] as string[], failed: [] as string[] };

  const installed = await localRegistry.listInstalled();

  for (const conn of installed) {
    // Skip if already registered
    if (targetRegistry.has(conn.id)) {
      continue;
    }

    const loadResult = await localRegistry.loadConnector(
      conn.id,
      conn.version,
      { skipChecksumVerification: options?.skipChecksumVerification }
    );

    if (loadResult.success && loadResult.connector) {
      try {
        targetRegistry.register(loadResult.connector);
        result.loaded.push(`${conn.id}@${conn.version}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.failed.push(`${conn.id}@${conn.version}`);
        options?.onError?.(conn.id, errorMsg);
      }
    } else {
      result.failed.push(`${conn.id}@${conn.version}`);
      options?.onError?.(conn.id, loadResult.error ?? 'Unknown error');
    }
  }

  return result;
}

// =============================================================================
// Global Registry Singleton
// =============================================================================

let globalLocalRegistry: LocalConnectorRegistry | null = null;

/**
 * Get the global local connector registry
 */
export function getLocalConnectorRegistry(): LocalConnectorRegistry {
  if (!globalLocalRegistry) {
    globalLocalRegistry = new LocalConnectorRegistry();
  }
  return globalLocalRegistry;
}

/**
 * Set a custom local connector registry (for testing)
 */
export function setLocalConnectorRegistry(registry: LocalConnectorRegistry): void {
  globalLocalRegistry = registry;
}
