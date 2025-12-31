/**
 * Unified warehouse connector with factory
 */

import { BaseWarehouseClient } from './base-client.js';
import { BigQueryClient, type BigQueryConfig } from './bigquery-client.js';
import { SnowflakeClient, type SnowflakeConfig } from './snowflake-client.js';
import { RedshiftClient, type RedshiftConfig } from './redshift-client.js';
import type { WarehouseConnectionConfig } from './types.js';

/**
 * Union type of all warehouse configs
 */
export type AnyWarehouseConfig =
  | BigQueryConfig
  | SnowflakeConfig
  | RedshiftConfig;

/**
 * Create a warehouse connector based on configuration
 *
 * @param config - Warehouse connection configuration
 * @returns Warehouse client instance
 * @throws Error if warehouse type is unsupported
 *
 * @example
 * ```typescript
 * // BigQuery
 * const bqClient = createWarehouseConnector({
 *   type: 'bigquery',
 *   projectId: 'my-project',
 *   datasetId: 'my_dataset',
 * });
 *
 * // Snowflake (when implemented)
 * const sfClient = createWarehouseConnector({
 *   type: 'snowflake',
 *   account: 'my-account',
 *   database: 'my_db',
 *   schema: 'public',
 * });
 *
 * // Redshift (when implemented)
 * const rsClient = createWarehouseConnector({
 *   type: 'redshift',
 *   database: 'my_db',
 *   schema: 'public',
 *   region: 'us-east-1',
 * });
 * ```
 */
export function createWarehouseConnector(
  config: WarehouseConnectionConfig
): BaseWarehouseClient {
  switch (config.type) {
    case 'bigquery':
      return new BigQueryClient(config as BigQueryConfig);
    case 'snowflake':
      return new SnowflakeClient(config as SnowflakeConfig);
    case 'redshift':
      return new RedshiftClient(config as RedshiftConfig);
    default:
      throw new Error(
        `Unsupported warehouse type: ${(config as WarehouseConnectionConfig).type}`
      );
  }
}

/**
 * Check if a warehouse type is supported
 */
export function isWarehouseTypeSupported(type: string): boolean {
  return ['bigquery', 'snowflake', 'redshift'].includes(type);
}

/**
 * Get list of supported warehouse types
 */
export function getSupportedWarehouseTypes(): string[] {
  return ['bigquery', 'snowflake', 'redshift'];
}

/**
 * Get implementation status for a warehouse type
 */
export function getWarehouseImplementationStatus(type: string): {
  supported: boolean;
  implemented: boolean;
  notes?: string;
} {
  switch (type) {
    case 'bigquery':
      return {
        supported: true,
        implemented: true,
        notes: 'Full implementation using @google-cloud/bigquery',
      };
    case 'snowflake':
      return {
        supported: true,
        implemented: false,
        notes: 'TODO: Implement using snowflake-sdk package',
      };
    case 'redshift':
      return {
        supported: true,
        implemented: false,
        notes: 'TODO: Implement using pg or @aws-sdk/client-redshift-data',
      };
    default:
      return {
        supported: false,
        implemented: false,
        notes: `Unknown warehouse type: ${type}`,
      };
  }
}
