/**
 * GitHub Connector Factory
 *
 * Factory function for creating GitHubConnector instances
 * for use with the ConnectorRegistry.
 */

import { GitHubConnector } from './github-connector.js';
import { ConsoleLogger, NoOpMetrics } from '../core/base-connector.js';
import type { ILogger, IMetrics } from '../core/base-connector.js';
import type { ConnectorConfig } from '../interfaces/types.js';
import type { IConnector } from '../interfaces/IConnector.js';
import type { ConnectorFactory } from '../registry/connector-registry.js';

/**
 * Options for creating GitHub connector instances
 */
export interface GitHubConnectorFactoryOptions {
  logger?: ILogger;
  metrics?: IMetrics;
}

/**
 * Create a GitHub connector factory function.
 *
 * @param options - Factory options (logger, metrics)
 * @returns ConnectorFactory function for use with ConnectorRegistry
 *
 * @example
 * ```typescript
 * import { ConnectorRegistry } from '@gwi/connectors';
 * import { createGitHubConnectorFactory } from '@gwi/connectors/github';
 *
 * const registry = new ConnectorRegistry();
 * registry.register('github', createGitHubConnectorFactory());
 * ```
 */
export function createGitHubConnectorFactory(
  options: GitHubConnectorFactoryOptions = {}
): ConnectorFactory {
  const logger = options.logger || new ConsoleLogger({ service: 'github-connector' });
  const metrics = options.metrics || new NoOpMetrics();

  return async (config: ConnectorConfig): Promise<IConnector> => {
    const connector = new GitHubConnector(logger, metrics);
    await connector.authenticate(config);
    return connector;
  };
}

/**
 * Register the GitHub connector with a registry.
 *
 * @param registry - The connector registry to register with
 * @param options - Factory options
 *
 * @example
 * ```typescript
 * import { ConnectorRegistry } from '@gwi/connectors';
 * import { registerGitHubConnector } from '@gwi/connectors/github';
 *
 * const registry = new ConnectorRegistry();
 * registerGitHubConnector(registry);
 * ```
 */
export function registerGitHubConnector(
  registry: { register: (name: string, factory: ConnectorFactory) => void },
  options: GitHubConnectorFactoryOptions = {}
): void {
  registry.register('github', createGitHubConnectorFactory(options));
}
