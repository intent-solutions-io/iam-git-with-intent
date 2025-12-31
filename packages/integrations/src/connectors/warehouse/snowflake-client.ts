/**
 * Snowflake warehouse client implementation (STUB)
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
 * Snowflake-specific configuration
 */
export interface SnowflakeConfig extends WarehouseConnectionConfig {
  type: 'snowflake';
  account: string;
  database: string;
  schema: string;
  warehouse?: string;
  role?: string;
  username?: string;
  password?: string;
  authenticator?: string;
}

/**
 * Snowflake warehouse client (STUB)
 *
 * TODO: Implement using snowflake-sdk package
 * @see https://www.npmjs.com/package/snowflake-sdk
 *
 * Implementation steps:
 * 1. Add snowflake-sdk to package.json dependencies
 * 2. Import snowflake-sdk and create connection
 * 3. Implement query() method with parameterized query support
 * 4. Implement listTables() using SHOW TABLES command
 * 5. Implement getSchema() using DESCRIBE TABLE command
 * 6. Implement testConnection() with simple SELECT 1 query
 * 7. Implement close() to properly close connection
 * 8. Add unit tests with mocked snowflake-sdk
 */
export class SnowflakeClient extends BaseWarehouseClient {
  constructor(config: SnowflakeConfig) {
    super(config);
  }

  async query(_sql: string, _options?: QueryOptions): Promise<QueryResult> {
    throw new Error(
      'Snowflake connector not implemented. TODO: Add snowflake-sdk dependency and implement query()'
    );
  }

  async listTables(): Promise<TableList> {
    throw new Error(
      'Snowflake connector not implemented. TODO: Implement listTables() using SHOW TABLES'
    );
  }

  async getSchema(_dataset: string, _table: string): Promise<TableSchema> {
    throw new Error(
      'Snowflake connector not implemented. TODO: Implement getSchema() using DESCRIBE TABLE'
    );
  }

  async testConnection(): Promise<boolean> {
    throw new Error(
      'Snowflake connector not implemented. TODO: Implement testConnection() with SELECT 1'
    );
  }

  async close(): Promise<void> {
    // TODO: Implement connection cleanup when snowflake-sdk is added
    return Promise.resolve();
  }
}
