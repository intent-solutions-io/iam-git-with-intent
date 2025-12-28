/**
 * GitLab Connector Factory
 *
 * Factory function for creating GitLabConnector instances
 * for use with the ConnectorRegistry.
 */

import { GitLabConnector } from './gitlab-connector.js';
import { ConsoleLogger, NoOpMetrics } from '../core/base-connector.js';
import type { ILogger, IMetrics } from '../core/base-connector.js';
import type { ConnectorConfig } from '../interfaces/types.js';
import type { IConnector } from '../interfaces/IConnector.js';
import type { ConnectorFactory } from '../registry/connector-registry.js';

/**
 * Options for creating GitLab connector instances
 */
export interface GitLabConnectorFactoryOptions {
  logger?: ILogger;
  metrics?: IMetrics;
}

/**
 * Create a GitLab connector factory function.
 *
 * @param options - Factory options (logger, metrics)
 * @returns ConnectorFactory function for use with ConnectorRegistry
 *
 * @example
 * ```typescript
 * import { ConnectorRegistry } from '@gwi/connectors';
 * import { createGitLabConnectorFactory } from '@gwi/connectors/gitlab';
 *
 * const registry = new ConnectorRegistry();
 * registry.register('gitlab', createGitLabConnectorFactory());
 * ```
 */
export function createGitLabConnectorFactory(
  options: GitLabConnectorFactoryOptions = {}
): ConnectorFactory {
  const logger = options.logger || new ConsoleLogger({ service: 'gitlab-connector' });
  const metrics = options.metrics || new NoOpMetrics();

  return async (config: ConnectorConfig): Promise<IConnector> => {
    const connector = new GitLabConnector(logger, metrics);
    await connector.authenticate(config);
    return connector;
  };
}

/**
 * Register the GitLab connector with a registry.
 *
 * @param registry - The connector registry to register with
 * @param options - Factory options
 *
 * @example
 * ```typescript
 * import { ConnectorRegistry } from '@gwi/connectors';
 * import { registerGitLabConnector } from '@gwi/connectors/gitlab';
 *
 * const registry = new ConnectorRegistry();
 * registerGitLabConnector(registry);
 * ```
 */
export function registerGitLabConnector(
  registry: { register: (name: string, factory: ConnectorFactory) => void },
  options: GitLabConnectorFactoryOptions = {}
): void {
  registry.register('gitlab', createGitLabConnectorFactory(options));
}
