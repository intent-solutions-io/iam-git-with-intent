import type { ILogger, IMetrics } from '../core/base-connector.js';
import { FivetranConnector } from './fivetran-connector.js';
import type { FivetranConnectorConfig } from './types.js';

/**
 * Factory function to create a Fivetran connector
 *
 * @param config - Fivetran connector configuration
 * @param logger - Optional logger instance
 * @param metrics - Optional metrics instance
 * @returns Configured Fivetran connector instance
 *
 * @example
 * ```typescript
 * const connector = createFivetranConnector({
 *   tenantId: 'my-tenant',
 *   auth: {
 *     type: 'basic',
 *     apiKey: 'your-api-key',
 *     apiSecret: 'your-api-secret'
 *   }
 * });
 *
 * await connector.authenticate(config);
 * const status = await connector.healthCheck();
 *
 * // Trigger a sync
 * await connector.triggerSync('connector-id');
 *
 * // Get sync status
 * const syncStatus = await connector.getSyncStatus('connector-id');
 * ```
 */
export function createFivetranConnector(
  _config: FivetranConnectorConfig,
  logger?: ILogger,
  metrics?: IMetrics
): FivetranConnector {
  const connector = new FivetranConnector(logger, metrics);
  // Note: authenticate() must be called separately with the config
  return connector;
}
