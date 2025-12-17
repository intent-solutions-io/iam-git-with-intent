/**
 * Registry Federation Configuration
 *
 * Phase 21: Multi-registry federation for connector distribution.
 *
 * Supports:
 * - Multiple registries with priority ordering
 * - Trust levels (official, community, enterprise, local)
 * - Per-registry key trust policies
 * - Federated search across registries
 *
 * @module @gwi/core/connectors/federation
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import {
  RemoteRegistryClient,
  createRemoteRegistry,
  type ConnectorInfo,
  type RegistrySearchResult,
} from './remote-registry.js';
import { loadTrustedKeys, type TrustedKeysConfig } from './signature.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Trust level for a registry
 */
export type RegistryTrustLevel = 'official' | 'community' | 'enterprise' | 'local';

/**
 * Registry configuration entry
 */
export interface RegistryConfig {
  /** Unique identifier for this registry */
  id: string;
  /** Display name */
  name: string;
  /** Registry URL (https://registry.example.com) */
  url: string;
  /** Trust level affects signature requirements */
  trustLevel: RegistryTrustLevel;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Whether this registry is enabled */
  enabled: boolean;
  /** Optional API key for authenticated access */
  apiKey?: string;
  /** Only accept connectors signed by these key IDs (empty = all trusted keys) */
  allowedKeyIds?: string[];
  /** Description */
  description?: string;
  /** When this registry was added */
  addedAt: string;
}

/**
 * Federation configuration
 */
export interface FederationConfig {
  version: '1.0';
  /** Default registry ID to use when not specified */
  defaultRegistry: string;
  /** Ordered list of registries */
  registries: RegistryConfig[];
  /** Global settings */
  settings: {
    /** Whether to allow unsigned connectors (NOT RECOMMENDED) */
    allowUnsigned: boolean;
    /** Search across all registries by default */
    federatedSearch: boolean;
    /** Cache duration in seconds for registry responses */
    cacheTtl: number;
  };
}

/**
 * Federated search result
 */
export interface FederatedSearchResult {
  results: Array<{
    registryId: string;
    registryName: string;
    connector: RegistrySearchResult['connectors'][0];
  }>;
  total: number;
  registriesSearched: number;
  errors: Array<{
    registryId: string;
    error: string;
  }>;
}

/**
 * Federated connector lookup result
 */
export interface FederatedLookupResult {
  found: boolean;
  registryId?: string;
  registryUrl?: string;
  connector?: ConnectorInfo;
  error?: string;
}

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Get default federation configuration
 */
export function getDefaultFederationConfig(): FederationConfig {
  return {
    version: '1.0',
    defaultRegistry: 'gwi-official',
    registries: [
      {
        id: 'gwi-official',
        name: 'GWI Official Registry',
        url: process.env.GWI_REGISTRY_URL ?? 'https://registry.gwi.dev',
        trustLevel: 'official',
        priority: 0,
        enabled: true,
        allowedKeyIds: ['gwi-official-2025'],
        description: 'Official Git With Intent connector registry',
        addedAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'gwi-community',
        name: 'GWI Community Registry',
        url: 'https://community-registry.gwi.dev',
        trustLevel: 'community',
        priority: 10,
        enabled: false, // Disabled by default until community registry exists
        description: 'Community-contributed connectors (use with caution)',
        addedAt: '2025-01-01T00:00:00Z',
      },
    ],
    settings: {
      allowUnsigned: false,
      federatedSearch: true,
      cacheTtl: 300, // 5 minutes
    },
  };
}

// =============================================================================
// Configuration Management
// =============================================================================

/**
 * Get the federation config file path
 */
export function getFederationConfigPath(): string {
  return process.env.GWI_FEDERATION_CONFIG ?? join(homedir(), '.gwi', 'federation.json');
}

/**
 * Load federation configuration
 */
export async function loadFederationConfig(configPath?: string): Promise<FederationConfig> {
  const path = configPath ?? getFederationConfigPath();

  if (!existsSync(path)) {
    return getDefaultFederationConfig();
  }

  try {
    const content = await readFile(path, 'utf-8');
    const config = JSON.parse(content) as FederationConfig;

    // Merge with defaults (ensure new fields exist)
    const defaults = getDefaultFederationConfig();
    return {
      ...defaults,
      ...config,
      settings: {
        ...defaults.settings,
        ...config.settings,
      },
    };
  } catch (error) {
    throw new Error(
      `Failed to load federation config: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Save federation configuration
 */
export async function saveFederationConfig(
  config: FederationConfig,
  configPath?: string
): Promise<void> {
  const path = configPath ?? getFederationConfigPath();

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2));
}

/**
 * Add a registry to federation config
 */
export async function addRegistry(
  registry: Omit<RegistryConfig, 'addedAt'>,
  configPath?: string
): Promise<void> {
  const config = await loadFederationConfig(configPath);

  // Check for duplicate
  if (config.registries.some((r) => r.id === registry.id)) {
    throw new Error(`Registry with ID '${registry.id}' already exists`);
  }

  config.registries.push({
    ...registry,
    addedAt: new Date().toISOString(),
  });

  // Sort by priority
  config.registries.sort((a, b) => a.priority - b.priority);

  await saveFederationConfig(config, configPath);
}

/**
 * Remove a registry from federation config
 */
export async function removeRegistry(registryId: string, configPath?: string): Promise<boolean> {
  const config = await loadFederationConfig(configPath);

  const index = config.registries.findIndex((r) => r.id === registryId);
  if (index === -1) {
    return false;
  }

  // Don't allow removing the default registry
  if (config.defaultRegistry === registryId) {
    throw new Error(`Cannot remove default registry: ${registryId}`);
  }

  config.registries.splice(index, 1);
  await saveFederationConfig(config, configPath);
  return true;
}

/**
 * Enable or disable a registry
 */
export async function setRegistryEnabled(
  registryId: string,
  enabled: boolean,
  configPath?: string
): Promise<void> {
  const config = await loadFederationConfig(configPath);

  const registry = config.registries.find((r) => r.id === registryId);
  if (!registry) {
    throw new Error(`Registry not found: ${registryId}`);
  }

  registry.enabled = enabled;
  await saveFederationConfig(config, configPath);
}

/**
 * Set the default registry
 */
export async function setDefaultRegistry(registryId: string, configPath?: string): Promise<void> {
  const config = await loadFederationConfig(configPath);

  if (!config.registries.some((r) => r.id === registryId)) {
    throw new Error(`Registry not found: ${registryId}`);
  }

  config.defaultRegistry = registryId;
  await saveFederationConfig(config, configPath);
}

/**
 * List all registries
 */
export async function listRegistries(configPath?: string): Promise<RegistryConfig[]> {
  const config = await loadFederationConfig(configPath);
  return config.registries;
}

// =============================================================================
// Federated Operations
// =============================================================================

/**
 * Create a federated registry client that searches across all enabled registries
 */
export class FederatedRegistryClient {
  private clients: Map<string, RemoteRegistryClient> = new Map();
  private config: FederationConfig;
  private _trustedKeys: TrustedKeysConfig | null = null;

  constructor(config: FederationConfig) {
    this.config = config;

    // Create clients for enabled registries
    for (const registry of config.registries.filter((r) => r.enabled)) {
      this.clients.set(registry.id, createRemoteRegistry(registry.url));
    }
  }

  /**
   * Load trusted keys for signature validation
   */
  async loadTrustedKeys(): Promise<void> {
    this._trustedKeys = await loadTrustedKeys();
  }

  /**
   * Get loaded trusted keys
   */
  getTrustedKeys(): TrustedKeysConfig | null {
    return this._trustedKeys;
  }

  /**
   * Get enabled registries in priority order
   */
  getEnabledRegistries(): RegistryConfig[] {
    return this.config.registries
      .filter((r) => r.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Search across all enabled registries
   */
  async search(query: string): Promise<FederatedSearchResult> {
    const results: FederatedSearchResult['results'] = [];
    const errors: FederatedSearchResult['errors'] = [];

    const registries = this.getEnabledRegistries();

    await Promise.all(
      registries.map(async (registry) => {
        const client = this.clients.get(registry.id);
        if (!client) return;

        try {
          const result = await client.search(query);
          for (const connector of result.connectors) {
            results.push({
              registryId: registry.id,
              registryName: registry.name,
              connector,
            });
          }
        } catch (error) {
          errors.push({
            registryId: registry.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );

    // Sort by priority (registries with lower priority numbers first)
    results.sort((a, b) => {
      const regA = this.config.registries.find((r) => r.id === a.registryId);
      const regB = this.config.registries.find((r) => r.id === b.registryId);
      return (regA?.priority ?? 999) - (regB?.priority ?? 999);
    });

    return {
      results,
      total: results.length,
      registriesSearched: registries.length,
      errors,
    };
  }

  /**
   * Find a connector across all enabled registries
   */
  async lookup(connectorId: string): Promise<FederatedLookupResult> {
    const registries = this.getEnabledRegistries();

    for (const registry of registries) {
      const client = this.clients.get(registry.id);
      if (!client) continue;

      try {
        const connector = await client.getInfo(connectorId);
        return {
          found: true,
          registryId: registry.id,
          registryUrl: registry.url,
          connector,
        };
      } catch {
        // Try next registry
        continue;
      }
    }

    return {
      found: false,
      error: `Connector '${connectorId}' not found in any enabled registry`,
    };
  }

  /**
   * Get the client for a specific registry
   */
  getClient(registryId: string): RemoteRegistryClient | undefined {
    return this.clients.get(registryId);
  }

  /**
   * Get the registry config by ID
   */
  getRegistry(registryId: string): RegistryConfig | undefined {
    return this.config.registries.find((r) => r.id === registryId);
  }

  /**
   * Check if a key ID is allowed for a registry
   */
  isKeyAllowed(registryId: string, keyId: string): boolean {
    const registry = this.getRegistry(registryId);
    if (!registry) return false;

    // If no allowedKeyIds specified, allow all trusted keys
    if (!registry.allowedKeyIds || registry.allowedKeyIds.length === 0) {
      return true;
    }

    return registry.allowedKeyIds.includes(keyId);
  }
}

/**
 * Create a federated registry client with current configuration
 */
export async function createFederatedRegistry(
  configPath?: string
): Promise<FederatedRegistryClient> {
  const config = await loadFederationConfig(configPath);
  const client = new FederatedRegistryClient(config);
  await client.loadTrustedKeys();
  return client;
}
