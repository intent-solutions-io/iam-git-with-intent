/**
 * BigQuery warehouse client implementation
 */

import { BigQuery, Dataset, Table, type BigQueryOptions } from '@google-cloud/bigquery';
import { BaseWarehouseClient } from './base-client.js';
import type {
  WarehouseConnectionConfig,
  QueryResult,
  QueryOptions,
  TableSchema,
  TableList,
  ColumnSchema,
  QueryResultRow,
} from './types.js';

/**
 * BigQuery-specific configuration
 */
export interface BigQueryConfig extends WarehouseConnectionConfig {
  type: 'bigquery';
  projectId: string;
  datasetId?: string;
  keyFilename?: string;
  credentials?: {
    client_email?: string;
    private_key?: string;
  };
}

/**
 * BigQuery warehouse client
 */
export class BigQueryClient extends BaseWarehouseClient {
  private client: BigQuery;
  private dataset?: Dataset;

  constructor(config: BigQueryConfig) {
    super(config);

    const bqOptions: BigQueryOptions = {
      projectId: config.projectId,
    };

    if (config.keyFilename) {
      bqOptions.keyFilename = config.keyFilename;
    }

    if (config.credentials) {
      bqOptions.credentials = config.credentials as BigQueryOptions['credentials'];
    }

    this.client = new BigQuery(bqOptions);

    if (config.datasetId) {
      this.dataset = this.client.dataset(config.datasetId);
    }
  }

  /**
   * Execute a SQL query
   */
  async query(sql: string, options?: QueryOptions): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      const queryOptions: {
        query: string;
        params?: unknown[];
        maxResults?: number;
        timeoutMs?: number;
        dryRun?: boolean;
        useLegacySql?: boolean;
      } = {
        query: sql,
        useLegacySql: false,
      };

      // Add named parameters if provided
      if (options?.parameters && options.parameters.length > 0) {
        queryOptions.params = options.parameters.map((p) => p.value);
      }

      if (options?.maxResults) {
        queryOptions.maxResults = options.maxResults;
      }

      if (options?.timeoutMs) {
        queryOptions.timeoutMs = options.timeoutMs;
      }

      if (options?.dryRun) {
        queryOptions.dryRun = options.dryRun;
      }

      const [job] = await this.client.createQueryJob(queryOptions);
      const [rows] = await job.getQueryResults();

      const queryTimeMs = Date.now() - startTime;
      const metadata = job.metadata;
      const bytesProcessed = metadata?.statistics?.totalBytesProcessed
        ? parseInt(metadata.statistics.totalBytesProcessed as string, 10)
        : 0;

      this.updateStats(queryTimeMs, bytesProcessed);

      // Extract schema from metadata
      const schema: ColumnSchema[] | undefined =
        metadata?.configuration?.query?.destinationTable?.schema?.fields?.map(
          (field: {
            name: string;
            type: string;
            mode?: string;
            description?: string;
          }) => ({
            name: field.name,
            type: field.type,
            mode: field.mode as 'NULLABLE' | 'REQUIRED' | 'REPEATED' | undefined,
            description: field.description,
          })
        );

      return {
        rows: rows as QueryResultRow[],
        totalRows: rows.length,
        schema,
        jobId: job.id,
      };
    } catch (error) {
      const queryTimeMs = Date.now() - startTime;
      this.updateStats(queryTimeMs, 0, true);
      throw error;
    }
  }

  /**
   * List all tables in the dataset
   */
  async listTables(): Promise<TableList> {
    if (!this.dataset) {
      throw new Error('No dataset configured for BigQuery client');
    }

    const [tables] = await this.dataset.getTables();

    return {
      tables: tables.map((table: Table) => ({
        tableId: table.id || '',
        datasetId: this.dataset?.id || '',
        projectId: (this.config as BigQueryConfig).projectId,
        description: table.metadata?.description,
        createdAt: table.metadata?.creationTime
          ? new Date(parseInt(table.metadata.creationTime as string, 10))
          : undefined,
        modifiedAt: table.metadata?.lastModifiedTime
          ? new Date(parseInt(table.metadata.lastModifiedTime as string, 10))
          : undefined,
      })),
    };
  }

  /**
   * Get schema for a specific table
   */
  async getSchema(dataset: string, table: string): Promise<TableSchema> {
    const tableRef = this.client.dataset(dataset).table(table);
    const [metadata] = await tableRef.getMetadata();

    const columns: ColumnSchema[] = metadata.schema?.fields?.map(
      (field: {
        name: string;
        type: string;
        mode?: string;
        description?: string;
      }) => ({
        name: field.name,
        type: field.type,
        mode: field.mode as 'NULLABLE' | 'REQUIRED' | 'REPEATED' | undefined,
        description: field.description,
      })
    ) || [];

    return {
      tableName: table,
      columns,
      description: metadata.description,
    };
  }

  /**
   * Test connection to BigQuery
   */
  async testConnection(): Promise<boolean> {
    try {
      const [datasets] = await this.client.getDatasets();
      return datasets.length >= 0; // Connection successful if we can list datasets
    } catch {
      return false;
    }
  }

  /**
   * Close connection (no-op for BigQuery as it's stateless)
   */
  async close(): Promise<void> {
    // BigQuery client doesn't require explicit connection closing
    return Promise.resolve();
  }

  /**
   * Get the underlying BigQuery client for advanced operations
   */
  getClient(): BigQuery {
    return this.client;
  }

  /**
   * Get the configured dataset
   */
  getDataset(): Dataset | undefined {
    return this.dataset;
  }
}
