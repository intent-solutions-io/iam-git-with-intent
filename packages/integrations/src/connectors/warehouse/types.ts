/**
 * Types for warehouse connector operations
 */

/**
 * Supported warehouse types
 */
export type WarehouseType = 'bigquery' | 'snowflake' | 'redshift';

/**
 * Generic warehouse connection configuration
 */
export interface WarehouseConnectionConfig {
  type: WarehouseType;
  projectId?: string; // For BigQuery
  datasetId?: string; // For BigQuery
  account?: string; // For Snowflake
  database?: string; // For Snowflake/Redshift
  schema?: string; // For Snowflake/Redshift
  region?: string; // For Redshift
  credentials?: unknown; // Provider-specific credentials
}

/**
 * Column metadata
 */
export interface ColumnSchema {
  name: string;
  type: string;
  mode?: 'NULLABLE' | 'REQUIRED' | 'REPEATED';
  description?: string;
}

/**
 * Table schema metadata
 */
export interface TableSchema {
  tableName: string;
  columns: ColumnSchema[];
  description?: string;
}

/**
 * Table reference
 */
export interface TableReference {
  dataset: string;
  table: string;
  project?: string;
}

/**
 * Query parameter for parameterized queries
 */
export interface QueryParameter {
  name: string;
  type: 'STRING' | 'INT64' | 'FLOAT64' | 'BOOL' | 'TIMESTAMP' | 'DATE';
  value: string | number | boolean | Date;
}

/**
 * Query options
 */
export interface QueryOptions {
  parameters?: QueryParameter[];
  maxResults?: number;
  timeoutMs?: number;
  dryRun?: boolean;
}

/**
 * Query result row (generic key-value pairs)
 */
export type QueryResultRow = Record<string, unknown>;

/**
 * Query execution result
 */
export interface QueryResult {
  rows: QueryResultRow[];
  totalRows: number;
  schema?: ColumnSchema[];
  jobId?: string;
}

/**
 * Table listing result
 */
export interface TableList {
  tables: Array<{
    tableId: string;
    datasetId: string;
    projectId?: string;
    description?: string;
    createdAt?: Date;
    modifiedAt?: Date;
  }>;
}

/**
 * Warehouse client statistics
 */
export interface WarehouseStats {
  queriesExecuted: number;
  totalBytesProcessed: number;
  avgQueryTimeMs: number;
  errors: number;
}
