/**
 * Warehouse connector module
 *
 * Direct connection to BigQuery/Snowflake/Redshift where ETL tools land data.
 * Query normalized tables with parameterized queries and schema introspection.
 */

// Types
export type {
  WarehouseType,
  WarehouseConnectionConfig,
  ColumnSchema,
  TableSchema,
  TableReference,
  QueryParameter,
  QueryOptions,
  QueryResultRow,
  QueryResult,
  TableList,
  WarehouseStats,
} from './types.js';

// Base client
export { BaseWarehouseClient } from './base-client.js';

// Implementations
export { BigQueryClient, type BigQueryConfig } from './bigquery-client.js';
export { SnowflakeClient, type SnowflakeConfig } from './snowflake-client.js';
export { RedshiftClient, type RedshiftConfig } from './redshift-client.js';

// Factory and utilities
export {
  createWarehouseConnector,
  isWarehouseTypeSupported,
  getSupportedWarehouseTypes,
  getWarehouseImplementationStatus,
  type AnyWarehouseConfig,
} from './connector.js';
