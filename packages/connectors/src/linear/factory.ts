/**
 * Linear Connector Factory
 *
 * Factory function for creating LinearConnector instances
 * for use with the ConnectorRegistry.
 */

import { LinearConnector } from './linear-connector.js';
import { ConsoleLogger, NoOpMetrics } from '../core/base-connector.js';
import type { ILogger, IMetrics } from '../core/base-connector.js';
import type { ConnectorConfig } from '../interfaces/types.js';
import type { IConnector } from '../interfaces/IConnector.js';
import type { ConnectorFactory } from '../registry/connector-registry.js';

/**
 * Options for creating Linear connector instances
 */
export interface LinearConnectorFactoryOptions {
  logger?: ILogger;
  metrics?: IMetrics;
}

/**
 * Create a Linear connector factory function.
 *
 * @param options - Factory options (logger, metrics)
 * @returns ConnectorFactory function for use with ConnectorRegistry
 *
 * @example
 * ```typescript
 * import { ConnectorRegistry } from '@gwi/connectors';
 * import { createLinearConnectorFactory } from '@gwi/connectors/linear';
 *
 * const registry = new ConnectorRegistry();
 * registry.register('linear', createLinearConnectorFactory());
 * ```
 */
export function createLinearConnectorFactory(
  options: LinearConnectorFactoryOptions = {}
): ConnectorFactory {
  const logger = options.logger || new ConsoleLogger({ service: 'linear-connector' });
  const metrics = options.metrics || new NoOpMetrics();

  return async (config: ConnectorConfig): Promise<IConnector> => {
    const connector = new LinearConnector(logger, metrics);
    await connector.authenticate(config);
    return connector;
  };
}

/**
 * Register the Linear connector with a registry.
 *
 * @param registry - The connector registry to register with
 * @param options - Factory options
 *
 * @example
 * ```typescript
 * import { ConnectorRegistry } from '@gwi/connectors';
 * import { registerLinearConnector } from '@gwi/connectors/linear';
 *
 * const registry = new ConnectorRegistry();
 * registerLinearConnector(registry);
 * ```
 */
export function registerLinearConnector(
  registry: { register: (name: string, factory: ConnectorFactory) => void },
  options: LinearConnectorFactoryOptions = {}
): void {
  registry.register('linear', createLinearConnectorFactory(options));
}
