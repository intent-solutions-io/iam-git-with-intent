/**
 * Connector Loader
 *
 * Phase 6: Runtime loading of connectors from local registry into global registry.
 *
 * This module provides:
 * - Automatic discovery and loading of installed connectors
 * - Integration with the global ConnectorRegistry
 * - Safety checks (checksum verification, conformance tests)
 *
 * @module @gwi/core/connectors/loader
 */

import { LocalConnectorRegistry, loadConnectorsIntoRegistry } from './registry.js';
import { getConnectorRegistry } from './invoke.js';
import { runConformanceTests } from './conformance.js';
import type { InstalledConnector, ConnectorLoadResult } from './registry.js';

// =============================================================================
// Loader Types
// =============================================================================

/**
 * Loader options
 */
export interface ConnectorLoaderOptions {
  /** Base path for local connector registry (default: 'connectors') */
  registryPath?: string;

  /** Skip checksum verification (not recommended for production) */
  skipChecksumVerification?: boolean;

  /** Run conformance tests before loading (default: true) */
  runConformanceTests?: boolean;

  /** Callback for load errors */
  onError?: (id: string, error: string) => void;

  /** Callback for successful loads */
  onLoad?: (id: string, version: string) => void;
}

/**
 * Loader result
 */
export interface ConnectorLoaderResult {
  /** Total installed connectors found */
  totalFound: number;

  /** Successfully loaded connectors */
  loaded: string[];

  /** Failed to load */
  failed: Array<{ id: string; error: string }>;

  /** Skipped (checksum failed) */
  skipped: Array<{ id: string; reason: string }>;

  /** Conformance test results (if run) */
  conformanceResults?: Map<string, { passed: boolean; failures: string[] }>;
}

// =============================================================================
// Connector Loader
// =============================================================================

/**
 * Load all connectors from local registry into global registry
 *
 * This is the main entry point for loading packaged connectors.
 */
export async function loadAllConnectors(
  options: ConnectorLoaderOptions = {}
): Promise<ConnectorLoaderResult> {
  const {
    registryPath = 'connectors',
    skipChecksumVerification = false,
    runConformanceTests: shouldRunConformance = true,
    onError,
    onLoad,
  } = options;

  const result: ConnectorLoaderResult = {
    totalFound: 0,
    loaded: [],
    failed: [],
    skipped: [],
  };

  const localRegistry = new LocalConnectorRegistry(registryPath);

  if (!localRegistry.exists()) {
    return result;
  }

  // Scan for installed connectors
  const scanResult = await localRegistry.scan();
  result.totalFound = scanResult.connectors.length;

  // Add scan errors to failed
  for (const error of scanResult.errors) {
    result.failed.push({ id: error.path, error: error.error });
  }

  // Skip connectors with failed checksums
  const validConnectors: InstalledConnector[] = [];
  for (const conn of scanResult.connectors) {
    if (!conn.checksumVerified && !skipChecksumVerification) {
      result.skipped.push({
        id: `${conn.id}@${conn.version}`,
        reason: 'Checksum verification failed',
      });
    } else {
      validConnectors.push(conn);
    }
  }

  // Run conformance tests if requested
  if (shouldRunConformance) {
    result.conformanceResults = new Map();

    for (const conn of validConnectors) {
      const loadResult = await localRegistry.loadConnector(
        conn.id,
        conn.version,
        { skipChecksumVerification }
      );

      if (loadResult.success && loadResult.connector) {
        const conformanceResult = await runConformanceTests(loadResult.connector);

        result.conformanceResults.set(`${conn.id}@${conn.version}`, {
          passed: conformanceResult.passed,
          failures: conformanceResult.results
            .filter(t => !t.passed)
            .map(t => t.error ?? t.name),
        });

        if (!conformanceResult.passed) {
          result.skipped.push({
            id: `${conn.id}@${conn.version}`,
            reason: `Conformance tests failed: ${conformanceResult.results.filter(t => !t.passed).map(t => t.name).join(', ')}`,
          });
          continue;
        }
      }
    }
  }

  // Load into global registry
  const globalRegistry = getConnectorRegistry();
  const loadResult = await loadConnectorsIntoRegistry(
    localRegistry,
    globalRegistry,
    {
      skipChecksumVerification,
      onError: (id, error) => {
        result.failed.push({ id, error });
        onError?.(id, error);
      },
    }
  );

  result.loaded = loadResult.loaded;

  // Call onLoad for each successful load
  for (const loaded of loadResult.loaded) {
    const [id, version] = loaded.split('@');
    onLoad?.(id, version);
  }

  return result;
}

/**
 * Load a specific connector by ID
 */
export async function loadConnector(
  id: string,
  version?: string,
  options: ConnectorLoaderOptions = {}
): Promise<ConnectorLoadResult> {
  const {
    registryPath = 'connectors',
    skipChecksumVerification = false,
    runConformanceTests: shouldRunConformance = true,
  } = options;

  const localRegistry = new LocalConnectorRegistry(registryPath);
  const loadResult = await localRegistry.loadConnector(id, version, {
    skipChecksumVerification,
  });

  if (!loadResult.success || !loadResult.connector) {
    return loadResult;
  }

  // Run conformance tests
  if (shouldRunConformance) {
    const conformanceResult = await runConformanceTests(loadResult.connector);
    if (!conformanceResult.passed) {
      return {
        success: false,
        installed: loadResult.installed,
        error: `Conformance tests failed: ${conformanceResult.results.filter(t => !t.passed).map(t => t.name).join(', ')}`,
      };
    }
  }

  // Register in global registry
  const globalRegistry = getConnectorRegistry();
  if (!globalRegistry.has(id)) {
    globalRegistry.register(loadResult.connector);
  }

  return loadResult;
}

/**
 * Unload a connector from the global registry
 *
 * Note: This only removes from registry, doesn't uninstall from filesystem.
 */
export function unloadConnector(id: string): boolean {
  const globalRegistry = getConnectorRegistry();

  // The default registry doesn't support removal, so we check if it exists
  // In a real implementation, we'd have an unregister method
  if (!globalRegistry.has(id)) {
    return false;
  }

  // For now, we can't actually unload from the default registry
  // This would require extending the ConnectorRegistry interface
  console.warn(`[Loader] Connector ${id} cannot be unloaded from default registry`);
  return false;
}

/**
 * Get list of installed connectors without loading them
 */
export async function listInstalledConnectors(
  registryPath: string = 'connectors'
): Promise<InstalledConnector[]> {
  const localRegistry = new LocalConnectorRegistry(registryPath);
  return localRegistry.listInstalled();
}
