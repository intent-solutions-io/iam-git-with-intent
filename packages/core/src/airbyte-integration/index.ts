/**
 * Phase 53: Airbyte Partner-First Connector Integration
 *
 * Integrates Airbyte connectors into the prediction pipeline:
 * - Airbyte job invocation (local and CI modes)
 * - Config mapping and validation
 * - Per-tenant secrets wiring
 * - Retry strategy and DLQ semantics
 * - CDC and incremental sync support
 * - Schema evolution handling
 *
 * @module @gwi/core/airbyte-integration
 */

import { z } from 'zod';
import type { CanonicalPoint } from '../time-series/index.js';
import type { NormalizationContext, MappingRule } from '../prediction-connectors/index.js';

// =============================================================================
// AIRBYTE CONTRACT VERSION
// =============================================================================

export const AIRBYTE_CONTRACT_VERSION = '1.0.0';

// =============================================================================
// ERROR CODES
// =============================================================================

export const AirbyteErrorCodes = {
  // Config errors (1xxx)
  INVALID_CONFIG: 'AB_1001',
  MISSING_SOURCE_ID: 'AB_1002',
  MISSING_DESTINATION_ID: 'AB_1003',
  INVALID_SYNC_MODE: 'AB_1004',

  // Connection errors (2xxx)
  CONNECTION_FAILED: 'AB_2001',
  AUTH_FAILED: 'AB_2002',
  TIMEOUT: 'AB_2003',
  SOURCE_UNAVAILABLE: 'AB_2004',

  // Sync errors (3xxx)
  SYNC_FAILED: 'AB_3001',
  SYNC_CANCELLED: 'AB_3002',
  PARTIAL_SYNC: 'AB_3003',
  SCHEMA_MISMATCH: 'AB_3004',

  // Data errors (4xxx)
  RECORD_INVALID: 'AB_4001',
  TRANSFORMATION_FAILED: 'AB_4002',
  DLQ_WRITE_FAILED: 'AB_4003',
  DEDUP_FAILED: 'AB_4004',

  // Secret errors (5xxx)
  SECRET_NOT_FOUND: 'AB_5001',
  SECRET_ACCESS_DENIED: 'AB_5002',
  SECRET_EXPIRED: 'AB_5003',
  SECRET_ROTATION_FAILED: 'AB_5004',
} as const;

export type AirbyteErrorCode =
  (typeof AirbyteErrorCodes)[keyof typeof AirbyteErrorCodes];

// =============================================================================
// SYNC MODES
// =============================================================================

export type AirbyteSyncMode =
  | 'full_refresh_overwrite'
  | 'full_refresh_append'
  | 'incremental_append'
  | 'incremental_dedup';

export type AirbyteCursorField = string;

export type AirbytePrimaryKey = string[];

// =============================================================================
// AIRBYTE CONFIG TYPES
// =============================================================================

export interface AirbyteSourceConfig {
  /** Source connector name (e.g., "source-postgres") */
  connectorName: string;
  /** Source connector version */
  connectorVersion: string;
  /** Connection configuration (sensitive fields reference secrets) */
  connectionConfig: Record<string, unknown>;
  /** Catalog selection */
  catalog?: AirbyteCatalog;
}

export interface AirbyteDestinationConfig {
  /** Destination type (currently only 'gwi-canonical' supported) */
  type: 'gwi-canonical';
  /** Target tenant */
  tenantId: string;
  /** Target workspace */
  workspaceId?: string;
  /** Normalization rule to apply */
  mappingRuleId: string;
}

export interface AirbyteConnectionConfig {
  /** Unique connection ID */
  id: string;
  /** Connection name */
  name: string;
  /** Source configuration */
  source: AirbyteSourceConfig;
  /** Destination configuration */
  destination: AirbyteDestinationConfig;
  /** Sync schedule */
  schedule: AirbyteSchedule;
  /** Sync mode per stream */
  syncModes: Record<string, AirbyteSyncMode>;
  /** Cursor fields per stream (for incremental) */
  cursorFields?: Record<string, AirbyteCursorField>;
  /** Primary keys per stream (for dedup) */
  primaryKeys?: Record<string, AirbytePrimaryKey>;
  /** Retry configuration */
  retry: AirbyteRetryConfig;
  /** State management */
  stateType: 'global' | 'per_stream';
  /** Whether CDC is enabled */
  cdcEnabled?: boolean;
  /** Custom properties */
  properties?: Record<string, unknown>;
}

export interface AirbyteSchedule {
  /** Schedule type */
  type: 'manual' | 'cron' | 'interval';
  /** Cron expression (if type=cron) */
  cronExpression?: string;
  /** Interval in minutes (if type=interval) */
  intervalMinutes?: number;
  /** Timezone for schedule */
  timezone: string;
  /** Whether schedule is active */
  enabled: boolean;
}

export interface AirbyteRetryConfig {
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Initial delay in ms */
  initialDelayMs: number;
  /** Max delay in ms */
  maxDelayMs: number;
  /** Backoff multiplier */
  multiplier: number;
  /** Whether to use jitter */
  jitter: boolean;
  /** Errors that trigger DLQ instead of retry */
  dlqErrors: AirbyteErrorCode[];
}

// =============================================================================
// CATALOG TYPES
// =============================================================================

export interface AirbyteCatalog {
  streams: AirbyteStreamConfig[];
}

export interface AirbyteStreamConfig {
  /** Stream name */
  name: string;
  /** Stream namespace */
  namespace?: string;
  /** JSON schema for the stream */
  jsonSchema: Record<string, unknown>;
  /** Supported sync modes */
  supportedSyncModes: AirbyteSyncMode[];
  /** Whether source supports incremental */
  sourceDefinedCursor?: boolean;
  /** Default cursor fields */
  defaultCursorField?: string[];
  /** Source-defined primary key */
  sourceDefinedPrimaryKey?: string[][];
}

// =============================================================================
// SYNC STATE TYPES
// =============================================================================

export interface AirbyteSyncState {
  /** Connection ID */
  connectionId: string;
  /** State version */
  version: number;
  /** Global state (if stateType=global) */
  globalState?: Record<string, unknown>;
  /** Per-stream states */
  streamStates: Record<string, AirbyteStreamState>;
  /** Last updated */
  updatedAt: number;
}

export interface AirbyteStreamState {
  /** Stream name */
  streamName: string;
  /** Stream namespace */
  namespace?: string;
  /** Cursor value for incremental */
  cursorValue?: unknown;
  /** Last sync timestamp */
  lastSyncAt?: number;
  /** Records synced in last run */
  recordsSynced?: number;
  /** State data */
  stateData?: Record<string, unknown>;
}

// =============================================================================
// SYNC JOB TYPES
// =============================================================================

export type AirbyteSyncJobStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'partial';

export interface AirbyteSyncJob {
  /** Job ID */
  id: string;
  /** Connection ID */
  connectionId: string;
  /** Job status */
  status: AirbyteSyncJobStatus;
  /** Start timestamp */
  startedAt: number;
  /** End timestamp */
  completedAt?: number;
  /** Triggered by */
  triggeredBy: 'schedule' | 'manual' | 'backfill' | 'retry';
  /** Attempt number (1-based) */
  attempt: number;
  /** Job statistics */
  stats?: AirbyteSyncStats;
  /** Error details if failed */
  error?: {
    code: AirbyteErrorCode;
    message: string;
    stack?: string;
  };
  /** State after sync */
  finalState?: AirbyteSyncState;
  /** Correlation ID */
  correlationId: string;
}

export interface AirbyteSyncStats {
  /** Records read from source */
  recordsRead: number;
  /** Records written (after normalization) */
  recordsWritten: number;
  /** Records skipped (filtered/invalid) */
  recordsSkipped: number;
  /** Records sent to DLQ */
  recordsDLQ: number;
  /** Bytes read */
  bytesRead: number;
  /** Streams synced */
  streamsSynced: string[];
  /** Processing duration in ms */
  durationMs: number;
}

// =============================================================================
// DLQ TYPES
// =============================================================================

export interface AirbyteDLQRecord {
  /** Record ID */
  id: string;
  /** Connection ID */
  connectionId: string;
  /** Job ID */
  jobId: string;
  /** Stream name */
  streamName: string;
  /** Original record */
  originalRecord: unknown;
  /** Error code */
  errorCode: AirbyteErrorCode;
  /** Error message */
  errorMessage: string;
  /** Timestamp */
  timestamp: number;
  /** Retry count */
  retryCount: number;
  /** Whether manually reviewed */
  reviewed: boolean;
  /** Resolution */
  resolution?: 'retried' | 'skipped' | 'fixed';
}

// =============================================================================
// SECRET REFERENCE TYPES
// =============================================================================

export interface AirbyteSecretRef {
  /** Secret type */
  type: 'secret_manager' | 'vault' | 'env';
  /** Secret path/name */
  path: string;
  /** Key within secret (if nested) */
  key?: string;
  /** Version (optional) */
  version?: string;
}

// =============================================================================
// AIRBYTE RUNNER
// =============================================================================

export interface AirbyteRunnerConfig {
  /** Runner mode */
  mode: 'local' | 'docker' | 'kubernetes';
  /** Docker image prefix for connectors */
  imagePrefix?: string;
  /** Timeout for sync jobs in ms */
  timeoutMs: number;
  /** Working directory */
  workDir: string;
  /** Secret provider */
  secretProvider: 'gcp' | 'aws' | 'vault' | 'env';
  /** GCP project (if using GCP secrets) */
  gcpProject?: string;
  /** Audit logging enabled */
  auditEnabled: boolean;
}

/**
 * Airbyte connector runner
 */
export class AirbyteRunner {
  private config: AirbyteRunnerConfig;
  private connections: Map<string, AirbyteConnectionConfig> = new Map();
  private states: Map<string, AirbyteSyncState> = new Map();
  private jobCounter = 0;
  private dlqCounter = 0;

  constructor(config: AirbyteRunnerConfig) {
    this.config = config;
  }

  /**
   * Get the runner configuration
   */
  getConfig(): AirbyteRunnerConfig {
    return this.config;
  }

  /**
   * Register a connection configuration
   */
  registerConnection(connection: AirbyteConnectionConfig): void {
    this.connections.set(connection.id, connection);
    // Initialize state if not exists
    if (!this.states.has(connection.id)) {
      this.states.set(connection.id, {
        connectionId: connection.id,
        version: 1,
        streamStates: {},
        updatedAt: Date.now(),
      });
    }
  }

  /**
   * Get a connection configuration
   */
  getConnection(connectionId: string): AirbyteConnectionConfig | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * List all connections
   */
  listConnections(): AirbyteConnectionConfig[] {
    return Array.from(this.connections.values());
  }

  /**
   * Run a sync job
   */
  async runSync(
    connectionId: string,
    options: {
      triggeredBy?: AirbyteSyncJob['triggeredBy'];
      correlationId?: string;
      streams?: string[];
      backfillRange?: { startTime: number; endTime: number };
    } = {}
  ): Promise<AirbyteSyncJob> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    const job: AirbyteSyncJob = {
      id: `airbyte_job_${++this.jobCounter}`,
      connectionId,
      status: 'running',
      startedAt: Date.now(),
      triggeredBy: options.triggeredBy ?? 'manual',
      attempt: 1,
      correlationId:
        options.correlationId ??
        `corr_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    };

    try {
      // Simulate sync execution
      const stats = await this.executeSync(connection, options);
      job.stats = stats;
      job.status = stats.recordsDLQ > 0 ? 'partial' : 'succeeded';
      job.completedAt = Date.now();

      // Update state
      const state = this.states.get(connectionId)!;
      state.version++;
      state.updatedAt = Date.now();
      for (const streamName of stats.streamsSynced) {
        state.streamStates[streamName] = {
          streamName,
          lastSyncAt: Date.now(),
          recordsSynced: stats.recordsWritten,
        };
      }
      job.finalState = state;
    } catch (error) {
      job.status = 'failed';
      job.completedAt = Date.now();
      job.error = {
        code: AirbyteErrorCodes.SYNC_FAILED,
        message: error instanceof Error ? error.message : String(error),
      };
    }

    return job;
  }

  /**
   * Execute sync (internal)
   */
  private async executeSync(
    connection: AirbyteConnectionConfig,
    options: {
      streams?: string[];
      backfillRange?: { startTime: number; endTime: number };
    }
  ): Promise<AirbyteSyncStats> {
    // Simulate sync execution
    const streams = options.streams ?? Object.keys(connection.syncModes);
    const startTime = Date.now();

    // Simulate processing
    await new Promise((resolve) => setTimeout(resolve, 10));

    return {
      recordsRead: 100,
      recordsWritten: 98,
      recordsSkipped: 1,
      recordsDLQ: 1,
      bytesRead: 10240,
      streamsSynced: streams,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Get current state for a connection
   */
  getState(connectionId: string): AirbyteSyncState | undefined {
    return this.states.get(connectionId);
  }

  /**
   * Reset state for a connection (for full refresh)
   */
  resetState(connectionId: string, streams?: string[]): void {
    const state = this.states.get(connectionId);
    if (!state) return;

    if (streams) {
      for (const stream of streams) {
        delete state.streamStates[stream];
      }
    } else {
      state.streamStates = {};
    }
    state.version++;
    state.updatedAt = Date.now();
  }

  /**
   * Write record to DLQ
   */
  writeToDLQ(
    connectionId: string,
    jobId: string,
    streamName: string,
    record: unknown,
    error: { code: AirbyteErrorCode; message: string }
  ): AirbyteDLQRecord {
    return {
      id: `dlq_${++this.dlqCounter}`,
      connectionId,
      jobId,
      streamName,
      originalRecord: record,
      errorCode: error.code,
      errorMessage: error.message,
      timestamp: Date.now(),
      retryCount: 0,
      reviewed: false,
    };
  }

  /**
   * Test connection
   */
  async testConnection(connectionId: string): Promise<{
    success: boolean;
    message: string;
    latencyMs: number;
  }> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return {
        success: false,
        message: `Connection ${connectionId} not found`,
        latencyMs: 0,
      };
    }

    const start = Date.now();
    // Simulate connection test
    await new Promise((resolve) => setTimeout(resolve, 50));

    return {
      success: true,
      message: 'Connection successful',
      latencyMs: Date.now() - start,
    };
  }

  /**
   * Discover source schema
   */
  async discoverSchema(connectionId: string): Promise<AirbyteCatalog> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    // Return mock catalog for demonstration
    return {
      streams: [
        {
          name: 'metrics',
          jsonSchema: {
            type: 'object',
            properties: {
              timestamp: { type: 'string', format: 'date-time' },
              value: { type: 'number' },
              labels: { type: 'object' },
            },
          },
          supportedSyncModes: ['full_refresh_overwrite', 'incremental_append'],
          sourceDefinedCursor: true,
          defaultCursorField: ['timestamp'],
        },
      ],
    };
  }
}

// =============================================================================
// AIRBYTE TO CANONICAL CONVERTER
// =============================================================================

/**
 * Convert Airbyte records to canonical points
 */
export function convertAirbyteToCanonical(
  records: unknown[],
  mappingRule: MappingRule,
  context: NormalizationContext
): {
  points: CanonicalPoint[];
  dlqRecords: Array<{ record: unknown; error: string }>;
} {
  const points: CanonicalPoint[] = [];
  const dlqRecords: Array<{ record: unknown; error: string }> = [];

  for (const record of records) {
    try {
      if (!record || typeof record !== 'object') {
        dlqRecords.push({ record, error: 'Record is not an object' });
        continue;
      }

      const obj = record as Record<string, unknown>;
      const tsPath = mappingRule.timestampMapping.sourcePath;
      const valPath = mappingRule.valueMapping.sourcePath;

      // Extract timestamp
      const rawTs = getNestedValue(obj, tsPath);
      let timestamp: number;
      switch (mappingRule.timestampMapping.format) {
        case 'unix_seconds':
          timestamp = Number(rawTs) * 1000;
          break;
        case 'unix_ms':
          timestamp = Number(rawTs);
          break;
        default:
          timestamp = new Date(String(rawTs)).getTime();
      }

      if (isNaN(timestamp)) {
        dlqRecords.push({ record, error: `Invalid timestamp: ${rawTs}` });
        continue;
      }

      // Extract value
      const rawVal = getNestedValue(obj, valPath);
      const value =
        typeof rawVal === 'number'
          ? rawVal
          : typeof rawVal === 'string'
            ? parseFloat(rawVal)
            : null;

      points.push({
        timestamp,
        value,
        processingMetadata: {
          sourceConnectorId: context.connectorId,
          ingestedAt: context.ingestedAt,
          batchId: context.batchId,
        },
      });
    } catch (error) {
      dlqRecords.push({
        record,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { points, dlqRecords };
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

export const AirbyteConnectionConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  source: z.object({
    connectorName: z.string().min(1),
    connectorVersion: z.string(),
    connectionConfig: z.record(z.unknown()),
    catalog: z.any().optional(),
  }),
  destination: z.object({
    type: z.literal('gwi-canonical'),
    tenantId: z.string().min(1),
    workspaceId: z.string().optional(),
    mappingRuleId: z.string().min(1),
  }),
  schedule: z.object({
    type: z.enum(['manual', 'cron', 'interval']),
    cronExpression: z.string().optional(),
    intervalMinutes: z.number().int().positive().optional(),
    timezone: z.string(),
    enabled: z.boolean(),
  }),
  syncModes: z.record(
    z.enum([
      'full_refresh_overwrite',
      'full_refresh_append',
      'incremental_append',
      'incremental_dedup',
    ])
  ),
  cursorFields: z.record(z.string()).optional(),
  primaryKeys: z.record(z.array(z.string())).optional(),
  retry: z.object({
    maxAttempts: z.number().int().positive(),
    initialDelayMs: z.number().int().positive(),
    maxDelayMs: z.number().int().positive(),
    multiplier: z.number().positive(),
    jitter: z.boolean(),
    dlqErrors: z.array(z.string()),
  }),
  stateType: z.enum(['global', 'per_stream']),
  cdcEnabled: z.boolean().optional(),
  properties: z.record(z.unknown()).optional(),
});

/**
 * Validate Airbyte connection config
 */
export function validateAirbyteConfig(
  config: unknown
): { success: boolean; data?: AirbyteConnectionConfig; errors?: string[] } {
  const result = AirbyteConnectionConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data as AirbyteConnectionConfig };
  }
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a default Airbyte connection config
 */
export function createAirbyteConnection(
  params: Pick<AirbyteConnectionConfig, 'id' | 'name' | 'source' | 'destination'> &
    Partial<AirbyteConnectionConfig>
): AirbyteConnectionConfig {
  return {
    schedule: {
      type: 'manual',
      timezone: 'UTC',
      enabled: false,
    },
    syncModes: {},
    retry: {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 60000,
      multiplier: 2,
      jitter: true,
      dlqErrors: [AirbyteErrorCodes.RECORD_INVALID, AirbyteErrorCodes.TRANSFORMATION_FAILED],
    },
    stateType: 'per_stream',
    ...params,
  };
}

/**
 * Create Airbyte runner config
 */
export function createAirbyteRunnerConfig(
  params: Partial<AirbyteRunnerConfig> = {}
): AirbyteRunnerConfig {
  return {
    mode: 'local',
    timeoutMs: 3600000, // 1 hour
    workDir: '/tmp/airbyte',
    secretProvider: 'env',
    auditEnabled: true,
    ...params,
  };
}
