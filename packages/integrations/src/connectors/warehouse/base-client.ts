/**
 * Base warehouse client abstract class
 */

import type {
  WarehouseConnectionConfig,
  QueryResult,
  QueryOptions,
  TableSchema,
  TableList,
  WarehouseStats,
} from './types.js';

/**
 * Abstract base class for warehouse clients
 * Defines common interface for BigQuery, Snowflake, Redshift
 */
export abstract class BaseWarehouseClient {
  protected config: WarehouseConnectionConfig;
  protected stats: WarehouseStats;

  constructor(config: WarehouseConnectionConfig) {
    this.config = config;
    this.stats = {
      queriesExecuted: 0,
      totalBytesProcessed: 0,
      avgQueryTimeMs: 0,
      errors: 0,
    };
  }

  /**
   * Execute a SQL query
   */
  abstract query(sql: string, options?: QueryOptions): Promise<QueryResult>;

  /**
   * List all tables in the warehouse
   */
  abstract listTables(): Promise<TableList>;

  /**
   * Get schema for a specific table
   */
  abstract getSchema(
    dataset: string,
    table: string
  ): Promise<TableSchema>;

  /**
   * Test connection to warehouse
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Close connection and cleanup resources
   */
  abstract close(): Promise<void>;

  /**
   * Get client statistics
   */
  getStats(): WarehouseStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      queriesExecuted: 0,
      totalBytesProcessed: 0,
      avgQueryTimeMs: 0,
      errors: 0,
    };
  }

  /**
   * Update statistics after query execution
   */
  protected updateStats(
    queryTimeMs: number,
    bytesProcessed: number,
    isError: boolean = false
  ): void {
    if (isError) {
      this.stats.errors += 1;
      return;
    }

    this.stats.queriesExecuted += 1;
    this.stats.totalBytesProcessed += bytesProcessed;

    // Update average query time
    const totalQueries = this.stats.queriesExecuted;
    this.stats.avgQueryTimeMs =
      (this.stats.avgQueryTimeMs * (totalQueries - 1) + queryTimeMs) /
      totalQueries;
  }
}
