/**
 * Tenant-Scoped Connector Configuration Store
 *
 * Phase 5: Configuration injection pattern for multi-tenant connectors.
 *
 * Config sources:
 * - LocalConfigStore: File-based (config/tenants/<tenantId>.json) for dev
 * - MemoryConfigStore: In-memory for tests
 *
 * Hard rules:
 * - Secrets are NEVER stored in code (use placeholders like ${SECRET_NAME})
 * - Config lookup is required; missing config throws explicit errors
 * - No connector can run without tenantId
 *
 * @module @gwi/core/tenancy/config-store
 */

import { z } from 'zod';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Connector configuration schema
 *
 * Each connector defines its own config shape.
 * This is the base structure that wraps connector-specific config.
 */
export const ConnectorConfig = z.object({
  /** Connector ID */
  connectorId: z.string(),

  /** Whether this connector is enabled for the tenant */
  enabled: z.boolean().default(true),

  /** Connector-specific configuration */
  config: z.record(z.unknown()),

  /** Secret references (resolved at runtime) */
  secrets: z.record(z.string()).optional(),

  /** Rate limiting configuration */
  rateLimit: z.object({
    requestsPerMinute: z.number().optional(),
    requestsPerHour: z.number().optional(),
  }).optional(),

  /** Timeout configuration */
  timeout: z.object({
    connectMs: z.number().default(5000),
    readMs: z.number().default(30000),
  }).optional(),
});

export type ConnectorConfig = z.infer<typeof ConnectorConfig>;

/**
 * Tenant configuration containing all connector configs
 */
export const TenantConfig = z.object({
  /** Tenant ID */
  tenantId: z.string(),

  /** Display name */
  displayName: z.string().optional(),

  /** Tenant tier (affects limits/features) */
  tier: z.enum(['free', 'pro', 'enterprise']).default('free'),

  /** Connector configurations */
  connectors: z.record(ConnectorConfig),

  /** Global tenant settings */
  settings: z.object({
    /** Maximum concurrent runs */
    maxConcurrentRuns: z.number().default(5),

    /** Maximum run duration in seconds */
    maxRunDurationSeconds: z.number().default(3600),

    /** Audit log retention days */
    auditRetentionDays: z.number().default(90),
  }).optional(),
});

export type TenantConfig = z.infer<typeof TenantConfig>;

// =============================================================================
// Config Store Interface
// =============================================================================

/**
 * Error thrown when config is missing
 */
export class ConfigNotFoundError extends Error {
  constructor(
    public readonly tenantId: string,
    public readonly connectorId?: string
  ) {
    super(
      connectorId
        ? `Configuration not found for connector '${connectorId}' in tenant '${tenantId}'`
        : `Configuration not found for tenant '${tenantId}'`
    );
    this.name = 'ConfigNotFoundError';
  }
}

/**
 * Error thrown when config is invalid
 */
export class ConfigValidationError extends Error {
  constructor(
    public readonly tenantId: string,
    public readonly connectorId: string | undefined,
    public readonly errors: string[]
  ) {
    super(
      `Invalid configuration for ${connectorId ? `connector '${connectorId}' in ` : ''}tenant '${tenantId}': ${errors.join(', ')}`
    );
    this.name = 'ConfigValidationError';
  }
}

/**
 * Connector configuration store interface
 */
export interface ConnectorConfigStore {
  /**
   * Get configuration for a specific connector
   *
   * @throws ConfigNotFoundError if config doesn't exist
   */
  getConfig(tenantId: string, connectorId: string): Promise<ConnectorConfig>;

  /**
   * Get full tenant configuration
   *
   * @throws ConfigNotFoundError if tenant config doesn't exist
   */
  getTenantConfig(tenantId: string): Promise<TenantConfig>;

  /**
   * Check if a connector is enabled for a tenant
   */
  isConnectorEnabled(tenantId: string, connectorId: string): Promise<boolean>;

  /**
   * List all connector IDs configured for a tenant
   */
  listConnectors(tenantId: string): Promise<string[]>;
}

// =============================================================================
// Memory Config Store (for testing)
// =============================================================================

/**
 * In-memory configuration store for testing
 */
export class MemoryConfigStore implements ConnectorConfigStore {
  private configs = new Map<string, TenantConfig>();

  /**
   * Add a tenant configuration
   */
  addTenantConfig(config: TenantConfig): void {
    this.configs.set(config.tenantId, TenantConfig.parse(config));
  }

  /**
   * Add a connector configuration to a tenant
   */
  addConnectorConfig(tenantId: string, connectorConfig: ConnectorConfig): void {
    const tenantConfig = this.configs.get(tenantId);
    if (!tenantConfig) {
      // Create minimal tenant config
      this.configs.set(tenantId, TenantConfig.parse({
        tenantId,
        connectors: {
          [connectorConfig.connectorId]: connectorConfig,
        },
      }));
    } else {
      tenantConfig.connectors[connectorConfig.connectorId] = ConnectorConfig.parse(connectorConfig);
    }
  }

  async getConfig(tenantId: string, connectorId: string): Promise<ConnectorConfig> {
    const tenantConfig = this.configs.get(tenantId);
    if (!tenantConfig) {
      throw new ConfigNotFoundError(tenantId, connectorId);
    }

    const connectorConfig = tenantConfig.connectors[connectorId];
    if (!connectorConfig) {
      throw new ConfigNotFoundError(tenantId, connectorId);
    }

    return connectorConfig;
  }

  async getTenantConfig(tenantId: string): Promise<TenantConfig> {
    const config = this.configs.get(tenantId);
    if (!config) {
      throw new ConfigNotFoundError(tenantId);
    }
    return config;
  }

  async isConnectorEnabled(tenantId: string, connectorId: string): Promise<boolean> {
    try {
      const config = await this.getConfig(tenantId, connectorId);
      return config.enabled;
    } catch {
      return false;
    }
  }

  async listConnectors(tenantId: string): Promise<string[]> {
    const config = this.configs.get(tenantId);
    if (!config) {
      return [];
    }
    return Object.keys(config.connectors);
  }

  /**
   * Clear all configurations (for test cleanup)
   */
  clear(): void {
    this.configs.clear();
  }
}

// =============================================================================
// Local File Config Store (for development)
// =============================================================================

/**
 * File-based configuration store for development
 *
 * Reads from: config/tenants/<tenantId>.json
 */
export class LocalConfigStore implements ConnectorConfigStore {
  private basePath: string;
  private cache = new Map<string, { config: TenantConfig; loadedAt: number }>();
  private cacheMaxAgeMs: number;

  constructor(options?: { basePath?: string; cacheMaxAgeMs?: number }) {
    this.basePath = options?.basePath ?? 'config/tenants';
    this.cacheMaxAgeMs = options?.cacheMaxAgeMs ?? 60000; // 1 minute default cache
  }

  private getConfigPath(tenantId: string): string {
    return join(this.basePath, `${tenantId}.json`);
  }

  async getConfig(tenantId: string, connectorId: string): Promise<ConnectorConfig> {
    const tenantConfig = await this.getTenantConfig(tenantId);
    const connectorConfig = tenantConfig.connectors[connectorId];

    if (!connectorConfig) {
      throw new ConfigNotFoundError(tenantId, connectorId);
    }

    return connectorConfig;
  }

  async getTenantConfig(tenantId: string): Promise<TenantConfig> {
    // Check cache
    const cached = this.cache.get(tenantId);
    if (cached && Date.now() - cached.loadedAt < this.cacheMaxAgeMs) {
      return cached.config;
    }

    // Load from file
    const configPath = this.getConfigPath(tenantId);

    if (!existsSync(configPath)) {
      throw new ConfigNotFoundError(tenantId);
    }

    try {
      const content = await readFile(configPath, 'utf-8');
      const raw = JSON.parse(content);
      const config = TenantConfig.parse(raw);

      // Cache it
      this.cache.set(tenantId, { config, loadedAt: Date.now() });

      return config;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ConfigValidationError(
          tenantId,
          undefined,
          error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        );
      }
      throw error;
    }
  }

  async isConnectorEnabled(tenantId: string, connectorId: string): Promise<boolean> {
    try {
      const config = await this.getConfig(tenantId, connectorId);
      return config.enabled;
    } catch {
      return false;
    }
  }

  async listConnectors(tenantId: string): Promise<string[]> {
    try {
      const config = await this.getTenantConfig(tenantId);
      return Object.keys(config.connectors);
    } catch {
      return [];
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// =============================================================================
// Global Config Store
// =============================================================================

let globalConfigStore: ConnectorConfigStore | null = null;

/**
 * Get the global config store
 */
export function getConfigStore(): ConnectorConfigStore {
  if (!globalConfigStore) {
    // Default to local file store
    globalConfigStore = new LocalConfigStore();
  }
  return globalConfigStore;
}

/**
 * Set a custom config store (for testing)
 */
export function setConfigStore(store: ConnectorConfigStore): void {
  globalConfigStore = store;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Resolve secret references in config
 *
 * Replaces ${SECRET_NAME} with actual values from environment or secret store.
 * This is a placeholder - in production, integrate with Secret Manager.
 */
export function resolveSecrets(
  config: ConnectorConfig,
  secretResolver?: (name: string) => string | undefined
): ConnectorConfig {
  const resolver = secretResolver ?? ((name: string) => process.env[name]);
  const resolved = { ...config, config: { ...config.config } };

  if (config.secrets) {
    for (const [key, secretRef] of Object.entries(config.secrets)) {
      // secretRef format: ${SECRET_NAME} or just SECRET_NAME
      const secretName = secretRef.replace(/^\$\{(.+)\}$/, '$1');
      const value = resolver(secretName);

      if (value) {
        (resolved.config as Record<string, unknown>)[key] = value;
      }
    }
  }

  return resolved;
}

/**
 * Create a test tenant configuration
 */
export function createTestTenantConfig(
  tenantId: string,
  connectors: Record<string, Partial<ConnectorConfig>>
): TenantConfig {
  const connectorConfigs: Record<string, ConnectorConfig> = {};

  for (const [id, partial] of Object.entries(connectors)) {
    connectorConfigs[id] = ConnectorConfig.parse({
      connectorId: id,
      enabled: true,
      config: {},
      ...partial,
    });
  }

  return TenantConfig.parse({
    tenantId,
    connectors: connectorConfigs,
  });
}
