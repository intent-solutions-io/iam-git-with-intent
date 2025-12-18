/**
 * Airbyte SDK Connector
 *
 * Phase 4: First non-DevOps connector using the SDK framework.
 * Provides tools for monitoring Airbyte sync status and managing connections.
 *
 * API Reference: https://reference.airbyte.com/reference/start
 *
 * This connector is designed to be mockable for testing.
 * Real API calls can be wired in by providing an AirbyteClient implementation.
 *
 * @module @gwi/integrations/airbyte/connector
 */

import { z } from 'zod';
import {
  type Connector,
  type ToolSpec,
  type ToolContext,
  type ToolPolicyClass,
} from '@gwi/core';

// =============================================================================
// Airbyte API Types
// =============================================================================

/**
 * Airbyte connection status enum
 */
export const ConnectionStatus = z.enum([
  'active',
  'inactive',
  'deprecated',
]);

export type ConnectionStatus = z.infer<typeof ConnectionStatus>;

/**
 * Airbyte job status enum
 */
export const JobStatus = z.enum([
  'pending',
  'running',
  'incomplete',
  'failed',
  'succeeded',
  'cancelled',
]);

export type JobStatus = z.infer<typeof JobStatus>;

/**
 * Airbyte job type enum
 */
export const JobType = z.enum([
  'sync',
  'reset',
  'refresh',
  'clear',
]);

export type JobType = z.infer<typeof JobType>;

// =============================================================================
// Tool Input/Output Schemas
// =============================================================================

// List Connections
const ListConnectionsInput = z.object({
  workspaceId: z.string().uuid().describe('Airbyte workspace ID'),
  includeDeleted: z.boolean().optional().describe('Include deleted connections'),
});

const ConnectionSummary = z.object({
  connectionId: z.string().uuid(),
  name: z.string(),
  sourceId: z.string().uuid(),
  destinationId: z.string().uuid(),
  status: ConnectionStatus,
  scheduleType: z.enum(['manual', 'scheduled', 'cron']).nullable(),
});

const ListConnectionsOutput = z.object({
  connections: z.array(ConnectionSummary),
  totalCount: z.number(),
});

// Get Connection
const GetConnectionInput = z.object({
  connectionId: z.string().uuid().describe('Airbyte connection ID'),
});

const GetConnectionOutput = z.object({
  connectionId: z.string().uuid(),
  name: z.string(),
  sourceId: z.string().uuid(),
  sourceName: z.string(),
  destinationId: z.string().uuid(),
  destinationName: z.string(),
  status: ConnectionStatus,
  scheduleType: z.enum(['manual', 'scheduled', 'cron']).nullable(),
  scheduleData: z.object({
    cronExpression: z.string().optional(),
    basicSchedule: z.object({
      timeUnit: z.enum(['minutes', 'hours', 'days', 'weeks', 'months']),
      units: z.number(),
    }).optional(),
  }).nullable(),
  createdAt: z.string().datetime(),
  lastSyncAt: z.string().datetime().nullable(),
});

// Get Sync Status
const GetSyncStatusInput = z.object({
  connectionId: z.string().uuid().describe('Airbyte connection ID'),
});

const GetSyncStatusOutput = z.object({
  connectionId: z.string().uuid(),
  lastJobId: z.string().nullable(),
  lastJobStatus: JobStatus.nullable(),
  lastJobType: JobType.nullable(),
  lastSyncStartedAt: z.string().datetime().nullable(),
  lastSyncCompletedAt: z.string().datetime().nullable(),
  recordsSynced: z.number().nullable(),
  bytesSynced: z.number().nullable(),
  isRunning: z.boolean(),
  hasError: z.boolean(),
  errorMessage: z.string().nullable(),
});

// List Jobs
const ListJobsInput = z.object({
  connectionId: z.string().uuid().describe('Airbyte connection ID'),
  limit: z.number().min(1).max(100).optional().describe('Max jobs to return'),
  status: JobStatus.optional().describe('Filter by status'),
});

const JobSummary = z.object({
  jobId: z.string(),
  jobType: JobType,
  status: JobStatus,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  recordsSynced: z.number().nullable(),
  bytesSynced: z.number().nullable(),
});

const ListJobsOutput = z.object({
  jobs: z.array(JobSummary),
  totalCount: z.number(),
});

// Trigger Sync (DESTRUCTIVE)
const TriggerSyncInput = z.object({
  connectionId: z.string().uuid().describe('Airbyte connection ID'),
  jobType: z.enum(['sync', 'reset', 'refresh', 'clear']).optional().default('sync'),
});

const TriggerSyncOutput = z.object({
  jobId: z.string(),
  status: JobStatus,
  message: z.string(),
});

// Cancel Job (DESTRUCTIVE)
const CancelJobInput = z.object({
  jobId: z.string().describe('Airbyte job ID to cancel'),
});

const CancelJobOutput = z.object({
  jobId: z.string(),
  status: JobStatus,
  message: z.string(),
});

// =============================================================================
// Airbyte Client Interface (for mocking)
// =============================================================================

/**
 * Airbyte API client interface
 *
 * Implement this interface to provide real API calls or mocks.
 */
export interface AirbyteClient {
  listConnections(workspaceId: string, includeDeleted?: boolean): Promise<z.infer<typeof ListConnectionsOutput>>;
  getConnection(connectionId: string): Promise<z.infer<typeof GetConnectionOutput>>;
  getSyncStatus(connectionId: string): Promise<z.infer<typeof GetSyncStatusOutput>>;
  listJobs(connectionId: string, limit?: number, status?: JobStatus): Promise<z.infer<typeof ListJobsOutput>>;
  triggerSync(connectionId: string, jobType?: z.infer<typeof JobType>): Promise<z.infer<typeof TriggerSyncOutput>>;
  cancelJob(jobId: string): Promise<z.infer<typeof CancelJobOutput>>;
}

/**
 * Mock Airbyte client for testing
 */
export class MockAirbyteClient implements AirbyteClient {
  private connections: Map<string, z.infer<typeof GetConnectionOutput>> = new Map();
  private jobs: Map<string, z.infer<typeof JobSummary>[]> = new Map();
  private syncStatus: Map<string, z.infer<typeof GetSyncStatusOutput>> = new Map();

  constructor() {
    // Set up default mock data
    this.setupDefaultMockData();
  }

  private setupDefaultMockData(): void {
    const now = new Date().toISOString();
    const hourAgo = new Date(Date.now() - 3600000).toISOString();

    // Mock connection 1: Healthy
    const conn1Id = '11111111-1111-1111-1111-111111111111';
    this.connections.set(conn1Id, {
      connectionId: conn1Id,
      name: 'Postgres to Snowflake',
      sourceId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      sourceName: 'Production Postgres',
      destinationId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      destinationName: 'Analytics Snowflake',
      status: 'active',
      scheduleType: 'scheduled',
      scheduleData: {
        basicSchedule: { timeUnit: 'hours', units: 1 },
      },
      createdAt: '2024-01-01T00:00:00Z',
      lastSyncAt: hourAgo,
    });

    this.syncStatus.set(conn1Id, {
      connectionId: conn1Id,
      lastJobId: 'job-001',
      lastJobStatus: 'succeeded',
      lastJobType: 'sync',
      lastSyncStartedAt: hourAgo,
      lastSyncCompletedAt: now,
      recordsSynced: 15000,
      bytesSynced: 5242880,
      isRunning: false,
      hasError: false,
      errorMessage: null,
    });

    this.jobs.set(conn1Id, [
      {
        jobId: 'job-001',
        jobType: 'sync',
        status: 'succeeded',
        startedAt: hourAgo,
        completedAt: now,
        recordsSynced: 15000,
        bytesSynced: 5242880,
      },
    ]);

    // Mock connection 2: Failed
    const conn2Id = '22222222-2222-2222-2222-222222222222';
    this.connections.set(conn2Id, {
      connectionId: conn2Id,
      name: 'Stripe to BigQuery',
      sourceId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      sourceName: 'Stripe API',
      destinationId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      destinationName: 'Analytics BigQuery',
      status: 'active',
      scheduleType: 'cron',
      scheduleData: {
        cronExpression: '0 0 * * *',
      },
      createdAt: '2024-02-15T00:00:00Z',
      lastSyncAt: hourAgo,
    });

    this.syncStatus.set(conn2Id, {
      connectionId: conn2Id,
      lastJobId: 'job-002',
      lastJobStatus: 'failed',
      lastJobType: 'sync',
      lastSyncStartedAt: hourAgo,
      lastSyncCompletedAt: now,
      recordsSynced: null,
      bytesSynced: null,
      isRunning: false,
      hasError: true,
      errorMessage: 'Connection timeout: Unable to reach Stripe API after 3 retries',
    });

    this.jobs.set(conn2Id, [
      {
        jobId: 'job-002',
        jobType: 'sync',
        status: 'failed',
        startedAt: hourAgo,
        completedAt: now,
        recordsSynced: null,
        bytesSynced: null,
      },
    ]);
  }

  async listConnections(_workspaceId: string, _includeDeleted?: boolean): Promise<z.infer<typeof ListConnectionsOutput>> {
    const connections = Array.from(this.connections.values()).map(c => ({
      connectionId: c.connectionId,
      name: c.name,
      sourceId: c.sourceId,
      destinationId: c.destinationId,
      status: c.status,
      scheduleType: c.scheduleType,
    }));

    return {
      connections,
      totalCount: connections.length,
    };
  }

  async getConnection(connectionId: string): Promise<z.infer<typeof GetConnectionOutput>> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }
    return connection;
  }

  async getSyncStatus(connectionId: string): Promise<z.infer<typeof GetSyncStatusOutput>> {
    const status = this.syncStatus.get(connectionId);
    if (!status) {
      throw new Error(`Connection not found: ${connectionId}`);
    }
    return status;
  }

  async listJobs(connectionId: string, limit = 10, status?: JobStatus): Promise<z.infer<typeof ListJobsOutput>> {
    let jobs = this.jobs.get(connectionId) ?? [];
    if (status) {
      jobs = jobs.filter(j => j.status === status);
    }
    jobs = jobs.slice(0, limit);
    return {
      jobs,
      totalCount: jobs.length,
    };
  }

  async triggerSync(connectionId: string, jobType: z.infer<typeof JobType> = 'sync'): Promise<z.infer<typeof TriggerSyncOutput>> {
    if (!this.connections.has(connectionId)) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    const jobId = `job-${Date.now()}`;
    const newJob: z.infer<typeof JobSummary> = {
      jobId,
      jobType,
      status: 'pending',
      startedAt: new Date().toISOString(),
      completedAt: null,
      recordsSynced: null,
      bytesSynced: null,
    };

    const existing = this.jobs.get(connectionId) ?? [];
    this.jobs.set(connectionId, [newJob, ...existing]);

    // Update sync status
    const currentStatus = this.syncStatus.get(connectionId);
    if (currentStatus) {
      this.syncStatus.set(connectionId, {
        ...currentStatus,
        lastJobId: jobId,
        lastJobStatus: 'pending',
        lastJobType: jobType,
        isRunning: true,
        hasError: false,
        errorMessage: null,
      });
    }

    return {
      jobId,
      status: 'pending',
      message: `${jobType} job triggered successfully`,
    };
  }

  async cancelJob(jobId: string): Promise<z.infer<typeof CancelJobOutput>> {
    // Find and cancel the job
    for (const [connId, jobs] of this.jobs.entries()) {
      const job = jobs.find(j => j.jobId === jobId);
      if (job) {
        job.status = 'cancelled';
        job.completedAt = new Date().toISOString();

        // Update sync status
        const status = this.syncStatus.get(connId);
        if (status && status.lastJobId === jobId) {
          this.syncStatus.set(connId, {
            ...status,
            lastJobStatus: 'cancelled',
            isRunning: false,
          });
        }

        return {
          jobId,
          status: 'cancelled',
          message: 'Job cancelled successfully',
        };
      }
    }

    throw new Error(`Job not found: ${jobId}`);
  }

  // Test helpers
  addConnection(connection: z.infer<typeof GetConnectionOutput>): void {
    this.connections.set(connection.connectionId, connection);
  }

  setSyncStatus(connectionId: string, status: z.infer<typeof GetSyncStatusOutput>): void {
    this.syncStatus.set(connectionId, status);
  }

  addJob(connectionId: string, job: z.infer<typeof JobSummary>): void {
    const existing = this.jobs.get(connectionId) ?? [];
    this.jobs.set(connectionId, [job, ...existing]);
  }
}

// =============================================================================
// Airbyte SDK Connector Implementation
// =============================================================================

/**
 * Airbyte SDK Connector configuration
 */
export interface AirbyteConnectorConfig {
  client?: AirbyteClient;
  apiUrl?: string;
  apiToken?: string;
}

/**
 * SDK-compliant Airbyte connector
 *
 * Implements the Connector interface from @gwi/core.
 */
export class AirbyteConnector implements Connector {
  readonly id = 'airbyte';
  readonly version = '1.0.0';
  readonly displayName = 'Airbyte';

  private client: AirbyteClient;
  private _tools: ToolSpec[];

  constructor(config?: AirbyteConnectorConfig) {
    // Use provided client or create mock (real client would be wired here)
    this.client = config?.client ?? new MockAirbyteClient();
    this._tools = this.buildTools();
  }

  tools(): ToolSpec[] {
    return this._tools;
  }

  getTool(name: string): ToolSpec | undefined {
    return this._tools.find(t => t.name === name);
  }

  async healthcheck(): Promise<boolean> {
    try {
      // Try to list connections as health check
      await this.client.listConnections('00000000-0000-0000-0000-000000000000');
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Tool Definitions
  // ===========================================================================

  private buildTools(): ToolSpec[] {
    const client = this.client;

    // Helper to create a tool spec with proper typing
    const tool = <TIn extends z.ZodTypeAny, TOut extends z.ZodTypeAny>(
      spec: {
        name: string;
        description: string;
        inputSchema: TIn;
        outputSchema: TOut;
        policyClass: ToolPolicyClass;
        invoke: (ctx: ToolContext, input: z.infer<TIn>) => Promise<z.infer<TOut>>;
      }
    ): ToolSpec => spec as ToolSpec;

    return [
      // READ operations
      tool({
        name: 'listConnections',
        description: 'List all Airbyte connections in a workspace',
        inputSchema: ListConnectionsInput,
        outputSchema: ListConnectionsOutput,
        policyClass: 'READ',
        invoke: async (_ctx, input) => {
          return client.listConnections(input.workspaceId, input.includeDeleted);
        },
      }),

      tool({
        name: 'getConnection',
        description: 'Get details of a specific Airbyte connection',
        inputSchema: GetConnectionInput,
        outputSchema: GetConnectionOutput,
        policyClass: 'READ',
        invoke: async (_ctx, input) => {
          return client.getConnection(input.connectionId);
        },
      }),

      tool({
        name: 'getSyncStatus',
        description: 'Get the current sync status of an Airbyte connection',
        inputSchema: GetSyncStatusInput,
        outputSchema: GetSyncStatusOutput,
        policyClass: 'READ',
        invoke: async (_ctx, input) => {
          return client.getSyncStatus(input.connectionId);
        },
      }),

      tool({
        name: 'listJobs',
        description: 'List recent jobs for an Airbyte connection',
        inputSchema: ListJobsInput,
        outputSchema: ListJobsOutput,
        policyClass: 'READ',
        invoke: async (_ctx, input) => {
          return client.listJobs(input.connectionId, input.limit, input.status);
        },
      }),

      // DESTRUCTIVE operations (require approval)
      tool({
        name: 'triggerSync',
        description: 'Trigger a new sync job for an Airbyte connection (requires approval)',
        inputSchema: TriggerSyncInput,
        outputSchema: TriggerSyncOutput,
        policyClass: 'DESTRUCTIVE',
        invoke: async (_ctx, input) => {
          return client.triggerSync(input.connectionId, input.jobType);
        },
      }),

      tool({
        name: 'cancelJob',
        description: 'Cancel a running Airbyte job (requires approval)',
        inputSchema: CancelJobInput,
        outputSchema: CancelJobOutput,
        policyClass: 'DESTRUCTIVE',
        invoke: async (_ctx, input) => {
          return client.cancelJob(input.jobId);
        },
      }),
    ];
  }
}

/**
 * Create an Airbyte connector instance
 */
export function createAirbyteConnector(config?: AirbyteConnectorConfig): AirbyteConnector {
  return new AirbyteConnector(config);
}

// Export schemas for external use
export {
  ListConnectionsInput,
  ListConnectionsOutput,
  GetConnectionInput,
  GetConnectionOutput,
  GetSyncStatusInput,
  GetSyncStatusOutput,
  ListJobsInput,
  ListJobsOutput,
  TriggerSyncInput,
  TriggerSyncOutput,
  CancelJobInput,
  CancelJobOutput,
  ConnectionSummary,
  JobSummary,
};
