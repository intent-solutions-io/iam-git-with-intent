import type { ILogger, IMetrics } from '../core/base-connector.js';
import { FivetranConnector } from './fivetran-connector.js';

/**
 * Factory function to create a Fivetran connector
 *
 * @param logger - Optional logger instance
 * @param metrics - Optional metrics instance
 * @returns Configured Fivetran connector instance
 *
 * @example
 * ```typescript
 * const connector = createFivetranConnector();
 *
 * await connector.authenticate({
 *   tenantId: 'my-tenant',
 *   auth: {
 *     type: 'basic',
 *     apiKey: 'your-api-key',
 *     apiSecret: 'your-api-secret'
 *   }
 * });
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
  logger?: ILogger,
  metrics?: IMetrics
): FivetranConnector {
  const connector = new FivetranConnector(logger, metrics);
  return connector;
}
