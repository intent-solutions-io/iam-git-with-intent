import type { IConnector } from '../interfaces/IConnector.js';
import type {
  ConnectorConfig,
  HealthStatus,
  ConnectorMetadata
} from '../interfaces/types.js';
import type { ILogger, IMetrics } from '../core/base-connector.js';
import { ConsoleLogger, NoOpMetrics } from '../core/base-connector.js';

/**
 * Factory function to create connector instances
 */
export type ConnectorFactory = (config: ConnectorConfig) => IConnector | Promise<IConnector>;

/**
 * Options for getting a connector instance
 */
export interface GetConnectorOptions {
  tenantId?: string;
  config?: Partial<ConnectorConfig>;
  skipHealthCheck?: boolean;
}

/**
 * Tenant configuration store interface
 */
export interface ITenantConfigStore {
  getConfig(tenantId: string, connector: string): Promise<ConnectorConfig>;
  setConfig(tenantId: string, connector: string, config: ConnectorConfig): Promise<void>;
  deleteConfig(tenantId: string, connector: string): Promise<void>;
  listConnectors(tenantId: string): Promise<string[]>;
}

/**
 * In-memory tenant configuration store (for testing/local dev)
 */
export class InMemoryTenantConfigStore implements ITenantConfigStore {
  private configs = new Map<string, Map<string, ConnectorConfig>>();

  async getConfig(tenantId: string, connector: string): Promise<ConnectorConfig> {
    const tenantConfigs = this.configs.get(tenantId);
    if (!tenantConfigs) {
      throw new Error(`No configurations for tenant ${tenantId}`);
    }

    const config = tenantConfigs.get(connector);
    if (!config) {
      throw new Error(`No configuration for ${connector} in tenant ${tenantId}`);
    }

    return config;
  }

  async setConfig(tenantId: string, connector: string, config: ConnectorConfig): Promise<void> {
    if (!this.configs.has(tenantId)) {
      this.configs.set(tenantId, new Map());
    }

    this.configs.get(tenantId)!.set(connector, config);
  }

  async deleteConfig(tenantId: string, connector: string): Promise<void> {
    const tenantConfigs = this.configs.get(tenantId);
    if (tenantConfigs) {
      tenantConfigs.delete(connector);
    }
  }

  async listConnectors(tenantId: string): Promise<string[]> {
    const tenantConfigs = this.configs.get(tenantId);
    return tenantConfigs ? Array.from(tenantConfigs.keys()) : [];
  }
}

/**
 * Health cache entry
 */
interface HealthCacheEntry {
  status: HealthStatus;
  expiresAt: number;
}

/**
 * Connector Registry Interface
 */
export interface IConnectorRegistry {
  register(name: string, factory: ConnectorFactory): void;
  unregister(name: string): void;
  get(name: string, options?: GetConnectorOptions): Promise<IConnector>;
  has(name: string): boolean;
  list(): string[];
  getMetadata(name: string): Promise<ConnectorMetadata>;
  healthCheck(name: string, options?: GetConnectorOptions): Promise<HealthStatus>;
  healthCheckAll(): Promise<Map<string, HealthStatus>>;
  getHealthy(): Promise<string[]>;
  getVersion(name: string): string;
  isCompatible(name: string): Promise<boolean>;
}

/**
 * ConnectorRegistry manages connector lifecycle, health monitoring, and dynamic loading.
 *
 * Features:
 * - Centralized connector discovery and management
 * - Lazy loading with instance caching
 * - Health monitoring with TTL-based caching
 * - Tenant-specific configuration
 * - Version compatibility checking
 */
export class ConnectorRegistry implements IConnectorRegistry {
  private factories = new Map<string, ConnectorFactory>();
  private instances = new Map<string, IConnector>();
  private metadata = new Map<string, ConnectorMetadata>();
  private healthCache = new Map<string, HealthCacheEntry>();

  // Health cache TTL (1 minute)
  private readonly HEALTH_CACHE_TTL_MS = 60 * 1000;

  constructor(
    private tenantConfigStore: ITenantConfigStore = new InMemoryTenantConfigStore(),
    private logger: ILogger = new ConsoleLogger({ service: 'connector-registry' }),
    private metrics: IMetrics = new NoOpMetrics()
  ) {}

  /**
   * Register a connector factory.
   */
  register(name: string, factory: ConnectorFactory): void {
    if (this.factories.has(name)) {
      throw new Error(`Connector ${name} already registered`);
    }

    this.factories.set(name, factory);
    this.logger.info('Connector registered', { connector: name });

    this.metrics.increment('registry.connectors_registered_total', 1, {
      connector: name
    });
  }

  /**
   * Unregister a connector.
   */
  unregister(name: string): void {
    this.factories.delete(name);
    this.instances.delete(name);
    this.metadata.delete(name);
    this.healthCache.delete(name);

    this.logger.info('Connector unregistered', { connector: name });

    this.metrics.increment('registry.connectors_unregistered_total', 1, {
      connector: name
    });
  }

  /**
   * Get a connector instance.
   */
  async get(name: string, options: GetConnectorOptions = {}): Promise<IConnector> {
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Connector ${name} not registered`);
    }

    // Generate cache key
    const cacheKey = this.getCacheKey(name, options.tenantId);

    // Check instance cache
    if (this.instances.has(cacheKey)) {
      this.logger.debug('Returning cached connector instance', {
        connector: name,
        tenantId: options.tenantId
      });
      return this.instances.get(cacheKey)!;
    }

    // Load tenant configuration
    const config = await this.loadConfig(name, options);

    // Create connector instance
    this.logger.debug('Creating new connector instance', {
      connector: name,
      tenantId: options.tenantId
    });

    const connector = await factory(config);

    // Health check (optional)
    if (!options.skipHealthCheck) {
      const health = await connector.healthCheck();
      if (!health.healthy) {
        this.logger.warn('Connector unhealthy', {
          connector: name,
          tenantId: options.tenantId,
          error: health.error
        });
      }
    }

    // Cache instance
    this.instances.set(cacheKey, connector);

    // Cache metadata
    if (!this.metadata.has(name)) {
      this.metadata.set(name, connector.getMetadata());
    }

    this.logger.info('Connector loaded', {
      connector: name,
      tenantId: options.tenantId
    });

    this.metrics.increment('registry.connectors_loaded_total', 1, {
      connector: name
    });

    return connector;
  }

  /**
   * Check if a connector is registered.
   */
  has(name: string): boolean {
    return this.factories.has(name);
  }

  /**
   * List all registered connectors.
   */
  list(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Get metadata for a connector.
   */
  async getMetadata(name: string): Promise<ConnectorMetadata> {
    // Check metadata cache
    if (this.metadata.has(name)) {
      return this.metadata.get(name)!;
    }

    // Load connector to get metadata
    const connector = await this.get(name, { skipHealthCheck: true });
    const metadata = connector.getMetadata();

    this.metadata.set(name, metadata);
    return metadata;
  }

  /**
   * Health check a specific connector.
   */
  async healthCheck(name: string, options: GetConnectorOptions = {}): Promise<HealthStatus> {
    const cacheKey = this.getCacheKey(name, options.tenantId);

    // Check health cache
    const cached = this.healthCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      this.logger.debug('Returning cached health status', {
        connector: name,
        tenantId: options.tenantId
      });
      return cached.status;
    }

    // Perform health check
    const connector = await this.get(name, { ...options, skipHealthCheck: true });
    const status = await connector.healthCheck();

    // Update cache
    this.healthCache.set(cacheKey, {
      status,
      expiresAt: Date.now() + this.HEALTH_CACHE_TTL_MS
    });

    // Record metric
    this.metrics.gauge('registry.connector_health', status.healthy ? 1 : 0, {
      connector: name,
      tenantId: options.tenantId || 'default'
    });

    return status;
  }

  /**
   * Health check all connectors.
   */
  async healthCheckAll(): Promise<Map<string, HealthStatus>> {
    const results = new Map<string, HealthStatus>();

    for (const name of this.list()) {
      try {
        const status = await this.healthCheck(name);
        results.set(name, status);
      } catch (error: any) {
        this.logger.error('Health check failed', {
          connector: name,
          error: error.message
        });

        results.set(name, {
          healthy: false,
          timestamp: new Date().toISOString(),
          connector: name,
          checks: [],
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get all healthy connectors.
   */
  async getHealthy(): Promise<string[]> {
    const health = await this.healthCheckAll();
    const healthy: string[] = [];

    for (const [name, status] of health.entries()) {
      if (status.healthy) {
        healthy.push(name);
      }
    }

    return healthy;
  }

  /**
   * Get connector version.
   */
  getVersion(name: string): string {
    const metadata = this.metadata.get(name);
    if (!metadata) {
      throw new Error(`Connector ${name} not loaded`);
    }
    return metadata.version;
  }

  /**
   * Check if connector version is compatible with framework version.
   */
  async isCompatible(name: string): Promise<boolean> {
    const metadata = await this.getMetadata(name);
    const connectorVersion = metadata.version;
    const frameworkVersion = this.getFrameworkVersion();

    // Simple semver major version check
    const connectorMajor = parseInt(connectorVersion.split('.')[0]);
    const frameworkMajor = parseInt(frameworkVersion.split('.')[0]);

    return connectorMajor === frameworkMajor;
  }

  /**
   * Generate cache key for tenant-specific instances.
   */
  private getCacheKey(name: string, tenantId?: string): string {
    return tenantId ? `${name}:${tenantId}` : name;
  }

  /**
   * Load connector configuration for a tenant.
   */
  private async loadConfig(
    name: string,
    options: GetConnectorOptions
  ): Promise<ConnectorConfig> {
    // Load tenant-specific configuration
    if (options.tenantId) {
      try {
        const tenantConfig = await this.tenantConfigStore.getConfig(
          options.tenantId,
          name
        );

        // Merge with override config
        return {
          ...tenantConfig,
          ...options.config
        };
      } catch (error: any) {
        // If no tenant config found, fall through to default
        this.logger.debug('No tenant config found, using default', {
          connector: name,
          tenantId: options.tenantId,
          error: error.message
        });
      }
    }

    // Use override config or empty config
    if (options.config) {
      return options.config as ConnectorConfig;
    }

    // Return minimal config
    return {
      tenantId: options.tenantId || 'default',
      auth: { type: 'bearer', token: '' }
    };
  }

  /**
   * Get framework version from environment or default.
   */
  private getFrameworkVersion(): string {
    return process.env.GWI_FRAMEWORK_VERSION || '1.0.0';
  }
}
