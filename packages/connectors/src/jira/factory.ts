/**
 * Jira Connector Factory
 *
 * Factory function for creating JiraConnector instances
 * for use with the ConnectorRegistry.
 */

import { JiraConnector } from './jira-connector.js';
import { ConsoleLogger, NoOpMetrics } from '../core/base-connector.js';
import type { ILogger, IMetrics } from '../core/base-connector.js';
import type { ConnectorConfig } from '../interfaces/types.js';
import type { IConnector } from '../interfaces/IConnector.js';
import type { ConnectorFactory } from '../registry/connector-registry.js';

/**
 * Options for creating Jira connector instances
 */
export interface JiraConnectorFactoryOptions {
  logger?: ILogger;
  metrics?: IMetrics;
}

/**
 * Create a Jira connector factory function.
 *
 * @param options - Factory options (logger, metrics)
 * @returns ConnectorFactory function for use with ConnectorRegistry
 *
 * @example
 * ```typescript
 * import { ConnectorRegistry } from '@gwi/connectors';
 * import { createJiraConnectorFactory } from '@gwi/connectors/jira';
 *
 * const registry = new ConnectorRegistry();
 * registry.register('jira', createJiraConnectorFactory());
 * ```
 */
export function createJiraConnectorFactory(
  options: JiraConnectorFactoryOptions = {}
): ConnectorFactory {
  const logger = options.logger || new ConsoleLogger({ service: 'jira-connector' });
  const metrics = options.metrics || new NoOpMetrics();

  return async (config: ConnectorConfig): Promise<IConnector> => {
    const connector = new JiraConnector(logger, metrics);
    await connector.authenticate(config);
    return connector;
  };
}

/**
 * Register the Jira connector with a registry.
 *
 * @param registry - The connector registry to register with
 * @param options - Factory options
 *
 * @example
 * ```typescript
 * import { ConnectorRegistry } from '@gwi/connectors';
 * import { registerJiraConnector } from '@gwi/connectors/jira';
 *
 * const registry = new ConnectorRegistry();
 * registerJiraConnector(registry);
 * ```
 */
export function registerJiraConnector(
  registry: { register: (name: string, factory: ConnectorFactory) => void },
  options: JiraConnectorFactoryOptions = {}
): void {
  registry.register('jira', createJiraConnectorFactory(options));
}
