/**
 * Redshift warehouse client implementation (STUB)
 */

import { BaseWarehouseClient } from './base-client.js';
import type {
  WarehouseConnectionConfig,
  QueryResult,
  QueryOptions,
  TableSchema,
  TableList,
} from './types.js';

/**
 * Redshift-specific configuration
 */
export interface RedshiftConfig extends WarehouseConnectionConfig {
  type: 'redshift';
  database: string;
  schema: string;
  region: string;
  clusterIdentifier?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  ssl?: boolean;
}

/**
 * Redshift warehouse client (STUB)
 *
 * TODO: Implement using node-postgres (pg) or @aws-sdk/client-redshift-data
 * @see https://www.npmjs.com/package/pg
 * @see https://www.npmjs.com/package/@aws-sdk/client-redshift-data
 *
 * Implementation steps:
 * 1. Choose driver: pg for traditional connections or @aws-sdk/client-redshift-data for serverless
 * 2. Add chosen package to package.json dependencies
 * 3. Create connection pool or AWS SDK client
 * 4. Implement query() method with parameterized query support
 * 5. Implement listTables() using pg_tables system catalog
 * 6. Implement getSchema() using information_schema.columns
 * 7. Implement testConnection() with simple SELECT 1 query
 * 8. Implement close() to drain connection pool or cleanup AWS SDK client
 * 9. Add unit tests with mocked driver
 */
export class RedshiftClient extends BaseWarehouseClient {
  constructor(config: RedshiftConfig) {
    super(config);
  }

  async query(_sql: string, _options?: QueryOptions): Promise<QueryResult> {
    throw new Error(
      'Redshift connector not implemented. TODO: Add pg or @aws-sdk/client-redshift-data and implement query()'
    );
  }

  async listTables(): Promise<TableList> {
    throw new Error(
      'Redshift connector not implemented. TODO: Implement listTables() using pg_tables'
    );
  }

  async getSchema(_dataset: string, _table: string): Promise<TableSchema> {
    throw new Error(
      'Redshift connector not implemented. TODO: Implement getSchema() using information_schema.columns'
    );
  }

  async testConnection(): Promise<boolean> {
    throw new Error(
      'Redshift connector not implemented. TODO: Implement testConnection() with SELECT 1'
    );
  }

  async close(): Promise<void> {
    // TODO: Implement connection pool cleanup when driver is added
    return Promise.resolve();
  }
}
