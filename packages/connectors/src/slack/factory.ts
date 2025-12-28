/**
 * Slack Connector Factory
 *
 * Factory function for creating SlackConnector instances
 * for use with the ConnectorRegistry.
 */

import { SlackConnector } from './slack-connector.js';
import { ConsoleLogger, NoOpMetrics } from '../core/base-connector.js';
import type { ILogger, IMetrics } from '../core/base-connector.js';
import type { ConnectorConfig } from '../interfaces/types.js';
import type { IConnector } from '../interfaces/IConnector.js';
import type { ConnectorFactory } from '../registry/connector-registry.js';

/**
 * Options for creating Slack connector instances
 */
export interface SlackConnectorFactoryOptions {
  logger?: ILogger;
  metrics?: IMetrics;
}

/**
 * Create a Slack connector factory function.
 *
 * @param options - Factory options (logger, metrics)
 * @returns ConnectorFactory function for use with ConnectorRegistry
 *
 * @example
 * ```typescript
 * import { ConnectorRegistry } from '@gwi/connectors';
 * import { createSlackConnectorFactory } from '@gwi/connectors/slack';
 *
 * const registry = new ConnectorRegistry();
 * registry.register('slack', createSlackConnectorFactory());
 * ```
 */
export function createSlackConnectorFactory(
  options: SlackConnectorFactoryOptions = {}
): ConnectorFactory {
  const logger = options.logger || new ConsoleLogger({ service: 'slack-connector' });
  const metrics = options.metrics || new NoOpMetrics();

  return async (config: ConnectorConfig): Promise<IConnector> => {
    const connector = new SlackConnector(logger, metrics);
    await connector.authenticate(config);
    return connector;
  };
}

/**
 * Register the Slack connector with a registry.
 *
 * @param registry - The connector registry to register with
 * @param options - Factory options
 *
 * @example
 * ```typescript
 * import { ConnectorRegistry } from '@gwi/connectors';
 * import { registerSlackConnector } from '@gwi/connectors/slack';
 *
 * const registry = new ConnectorRegistry();
 * registerSlackConnector(registry);
 * ```
 */
export function registerSlackConnector(
  registry: { register: (name: string, factory: ConnectorFactory) => void },
  options: SlackConnectorFactoryOptions = {}
): void {
  registry.register('slack', createSlackConnectorFactory(options));
}
