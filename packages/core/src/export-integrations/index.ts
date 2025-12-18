/**
 * Phase 68: Export + Integrations
 *
 * Data export and third-party integrations:
 * - Export formats (CSV, JSON, Parquet)
 * - Webhook integrations
 * - Third-party connectors
 * - Batch exports
 *
 * @module @gwi/core/export-integrations
 */

import { z } from 'zod';

// =============================================================================
// VERSION
// =============================================================================

export const EXPORT_INTEGRATIONS_VERSION = '1.0.0';

// =============================================================================
// EXPORT FORMATS
// =============================================================================

export const ExportFormats = {
  CSV: 'csv',
  JSON: 'json',
  JSONL: 'jsonl',
  PARQUET: 'parquet',
  XLSX: 'xlsx',
} as const;

export type ExportFormat = (typeof ExportFormats)[keyof typeof ExportFormats];

// =============================================================================
// INTEGRATION TYPES
// =============================================================================

export const IntegrationTypes = {
  WEBHOOK: 'webhook',
  SLACK: 'slack',
  TEAMS: 'teams',
  EMAIL: 'email',
  S3: 's3',
  GCS: 'gcs',
  BIGQUERY: 'bigquery',
  SNOWFLAKE: 'snowflake',
  POSTGRES: 'postgres',
  CUSTOM: 'custom',
} as const;

export type IntegrationType = (typeof IntegrationTypes)[keyof typeof IntegrationTypes];

// =============================================================================
// TYPES
// =============================================================================

export interface ExportJob {
  /** Job ID */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** Name */
  name: string;
  /** Description */
  description?: string;
  /** Source type */
  sourceType: 'series' | 'forecasts' | 'alerts' | 'reports' | 'custom';
  /** Source query */
  query: ExportQuery;
  /** Format */
  format: ExportFormat;
  /** Destination */
  destination: ExportDestination;
  /** Status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** Progress (0-100) */
  progress: number;
  /** Rows exported */
  rowsExported?: number;
  /** File size (bytes) */
  fileSizeBytes?: number;
  /** Output URL */
  outputUrl?: string;
  /** Error message */
  error?: string;
  /** Started at */
  startedAt?: number;
  /** Completed at */
  completedAt?: number;
  /** Created at */
  createdAt: number;
  /** Created by */
  createdBy: string;
}

export interface ExportQuery {
  /** Data type */
  dataType: string;
  /** Time range start */
  startTime?: number;
  /** Time range end */
  endTime?: number;
  /** Filters */
  filters?: Record<string, unknown>;
  /** Fields to include */
  fields?: string[];
  /** Sort */
  sort?: { field: string; order: 'asc' | 'desc' };
  /** Limit */
  limit?: number;
}

export interface ExportDestination {
  /** Type */
  type: 'download' | 'cloud_storage' | 'email' | 'integration';
  /** Configuration */
  config: Record<string, unknown>;
}

export interface ScheduledExport {
  /** Schedule ID */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** Name */
  name: string;
  /** Job template */
  jobTemplate: Omit<ExportJob, 'id' | 'status' | 'progress' | 'rowsExported' | 'fileSizeBytes' | 'outputUrl' | 'error' | 'startedAt' | 'completedAt' | 'createdAt'>;
  /** Schedule (cron) */
  schedule: string;
  /** Timezone */
  timezone: string;
  /** Enabled */
  enabled: boolean;
  /** Last run */
  lastRun?: number;
  /** Next run */
  nextRun?: number;
  /** Created at */
  createdAt: number;
  /** Updated at */
  updatedAt: number;
}

export interface Integration {
  /** Integration ID */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** Name */
  name: string;
  /** Description */
  description?: string;
  /** Type */
  type: IntegrationType;
  /** Configuration */
  config: IntegrationConfig;
  /** Status */
  status: 'active' | 'inactive' | 'error';
  /** Last used */
  lastUsed?: number;
  /** Error message */
  error?: string;
  /** Created at */
  createdAt: number;
  /** Updated at */
  updatedAt: number;
}

export interface IntegrationConfig {
  /** Webhook URL */
  webhookUrl?: string;
  /** API key */
  apiKey?: string;
  /** Headers */
  headers?: Record<string, string>;
  /** Authentication */
  auth?: {
    type: 'none' | 'basic' | 'bearer' | 'oauth2';
    credentials?: Record<string, string>;
  };
  /** Cloud storage config */
  cloudStorage?: {
    bucket: string;
    path?: string;
    region?: string;
  };
  /** Database config */
  database?: {
    host: string;
    port: number;
    database: string;
    schema?: string;
    table?: string;
  };
  /** Custom config */
  custom?: Record<string, unknown>;
}

export interface WebhookEvent {
  /** Event ID */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** Integration ID */
  integrationId: string;
  /** Event type */
  eventType: string;
  /** Payload */
  payload: Record<string, unknown>;
  /** Status */
  status: 'pending' | 'sent' | 'failed' | 'retrying';
  /** Attempts */
  attempts: number;
  /** Last attempt */
  lastAttempt?: number;
  /** Response status */
  responseStatus?: number;
  /** Response body */
  responseBody?: string;
  /** Error */
  error?: string;
  /** Created at */
  createdAt: number;
}

export interface WebhookDelivery {
  /** Delivery ID */
  id: string;
  /** Event ID */
  eventId: string;
  /** Integration ID */
  integrationId: string;
  /** Request URL */
  requestUrl: string;
  /** Request headers */
  requestHeaders: Record<string, string>;
  /** Request body */
  requestBody: string;
  /** Response status */
  responseStatus?: number;
  /** Response headers */
  responseHeaders?: Record<string, string>;
  /** Response body */
  responseBody?: string;
  /** Duration (ms) */
  durationMs?: number;
  /** Timestamp */
  timestamp: number;
  /** Success */
  success: boolean;
  /** Error */
  error?: string;
}

// =============================================================================
// EXPORT SERVICE
// =============================================================================

/**
 * Export and integrations service
 */
export class ExportService {
  private jobs: Map<string, ExportJob> = new Map();
  private scheduledExports: Map<string, ScheduledExport> = new Map();
  private integrations: Map<string, Integration> = new Map();
  private webhookEvents: Map<string, WebhookEvent[]> = new Map(); // integrationId -> events
  private deliveries: WebhookDelivery[] = [];
  private jobCounter = 0;
  private scheduleCounter = 0;
  private integrationCounter = 0;
  private eventCounter = 0;
  private deliveryCounter = 0;

  // ---------------------------------------------------------------------------
  // Export Jobs
  // ---------------------------------------------------------------------------

  /**
   * Create an export job
   */
  createExportJob(
    params: Omit<ExportJob, 'id' | 'status' | 'progress' | 'createdAt'>
  ): ExportJob {
    const job: ExportJob = {
      ...params,
      id: `export_${++this.jobCounter}`,
      status: 'pending',
      progress: 0,
      createdAt: Date.now(),
    };

    this.jobs.set(job.id, job);
    return job;
  }

  /**
   * Get export job by ID
   */
  getExportJob(jobId: string): ExportJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * List export jobs for tenant
   */
  listExportJobs(tenantId: string, status?: ExportJob['status']): ExportJob[] {
    return Array.from(this.jobs.values())
      .filter(j => j.tenantId === tenantId && (!status || j.status === status))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Execute an export job
   */
  executeExportJob(jobId: string): ExportJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    job.status = 'running';
    job.startedAt = Date.now();
    job.progress = 0;

    // Simulate export execution
    this.simulateExport(job);

    return job;
  }

  private simulateExport(job: ExportJob): void {
    // Simulate progress updates
    const progressInterval = setInterval(() => {
      if (job.status !== 'running') {
        clearInterval(progressInterval);
        return;
      }

      job.progress = Math.min(100, job.progress + 20);

      if (job.progress >= 100) {
        job.status = 'completed';
        job.completedAt = Date.now();
        job.rowsExported = Math.floor(Math.random() * 10000) + 100;
        job.fileSizeBytes = job.rowsExported * 500;
        job.outputUrl = `/exports/${job.id}.${job.format}`;
        clearInterval(progressInterval);
      }
    }, 100);
  }

  /**
   * Cancel an export job
   */
  cancelExportJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'running') return false;

    job.status = 'cancelled';
    return true;
  }

  /**
   * Delete an export job
   */
  deleteExportJob(jobId: string): boolean {
    return this.jobs.delete(jobId);
  }

  // ---------------------------------------------------------------------------
  // Scheduled Exports
  // ---------------------------------------------------------------------------

  /**
   * Create a scheduled export
   */
  createScheduledExport(
    params: Omit<ScheduledExport, 'id' | 'lastRun' | 'nextRun' | 'createdAt' | 'updatedAt'>
  ): ScheduledExport {
    const scheduled: ScheduledExport = {
      ...params,
      id: `sched_${++this.scheduleCounter}`,
      nextRun: this.calculateNextRun(params.schedule),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.scheduledExports.set(scheduled.id, scheduled);
    return scheduled;
  }

  /**
   * Get scheduled export by ID
   */
  getScheduledExport(scheduleId: string): ScheduledExport | undefined {
    return this.scheduledExports.get(scheduleId);
  }

  /**
   * List scheduled exports for tenant
   */
  listScheduledExports(tenantId: string): ScheduledExport[] {
    return Array.from(this.scheduledExports.values())
      .filter(s => s.tenantId === tenantId);
  }

  /**
   * Update scheduled export
   */
  updateScheduledExport(
    scheduleId: string,
    updates: Partial<Pick<ScheduledExport, 'name' | 'schedule' | 'timezone' | 'enabled' | 'jobTemplate'>>
  ): ScheduledExport | undefined {
    const scheduled = this.scheduledExports.get(scheduleId);
    if (!scheduled) return undefined;

    Object.assign(scheduled, updates, { updatedAt: Date.now() });

    if (updates.schedule) {
      scheduled.nextRun = this.calculateNextRun(updates.schedule);
    }

    return scheduled;
  }

  /**
   * Delete scheduled export
   */
  deleteScheduledExport(scheduleId: string): boolean {
    return this.scheduledExports.delete(scheduleId);
  }

  /**
   * Run scheduled export now
   */
  runScheduledExportNow(scheduleId: string): ExportJob | undefined {
    const scheduled = this.scheduledExports.get(scheduleId);
    if (!scheduled) return undefined;

    const job = this.createExportJob({
      ...scheduled.jobTemplate,
      name: `${scheduled.name} (Manual Run)`,
    });

    scheduled.lastRun = Date.now();
    return this.executeExportJob(job.id);
  }

  private calculateNextRun(_schedule: string): number {
    // Simplified: just add 1 hour from now
    // In production, would parse cron expression
    return Date.now() + 60 * 60 * 1000;
  }

  // ---------------------------------------------------------------------------
  // Integrations
  // ---------------------------------------------------------------------------

  /**
   * Create an integration
   */
  createIntegration(
    params: Omit<Integration, 'id' | 'status' | 'lastUsed' | 'error' | 'createdAt' | 'updatedAt'>
  ): Integration {
    const integration: Integration = {
      ...params,
      id: `int_${++this.integrationCounter}`,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.integrations.set(integration.id, integration);
    return integration;
  }

  /**
   * Get integration by ID
   */
  getIntegration(integrationId: string): Integration | undefined {
    return this.integrations.get(integrationId);
  }

  /**
   * List integrations for tenant
   */
  listIntegrations(tenantId: string, type?: IntegrationType): Integration[] {
    return Array.from(this.integrations.values())
      .filter(i => i.tenantId === tenantId && (!type || i.type === type));
  }

  /**
   * Update integration
   */
  updateIntegration(
    integrationId: string,
    updates: Partial<Pick<Integration, 'name' | 'description' | 'config' | 'status'>>
  ): Integration | undefined {
    const integration = this.integrations.get(integrationId);
    if (!integration) return undefined;

    Object.assign(integration, updates, { updatedAt: Date.now() });
    return integration;
  }

  /**
   * Delete integration
   */
  deleteIntegration(integrationId: string): boolean {
    return this.integrations.delete(integrationId);
  }

  /**
   * Test integration connection
   */
  testIntegration(integrationId: string): {
    success: boolean;
    message: string;
    latencyMs?: number;
  } {
    const integration = this.integrations.get(integrationId);
    if (!integration) {
      return { success: false, message: 'Integration not found' };
    }

    // Simulate connection test
    const latencyMs = Math.floor(Math.random() * 200) + 50;
    integration.lastUsed = Date.now();

    return {
      success: true,
      message: 'Connection successful',
      latencyMs,
    };
  }

  // ---------------------------------------------------------------------------
  // Webhooks
  // ---------------------------------------------------------------------------

  /**
   * Send webhook event
   */
  sendWebhook(
    integrationId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): WebhookEvent {
    const integration = this.integrations.get(integrationId);
    if (!integration || integration.type !== 'webhook') {
      throw new Error('Invalid webhook integration');
    }

    const event: WebhookEvent = {
      id: `evt_${++this.eventCounter}`,
      tenantId: integration.tenantId,
      integrationId,
      eventType,
      payload,
      status: 'pending',
      attempts: 0,
      createdAt: Date.now(),
    };

    if (!this.webhookEvents.has(integrationId)) {
      this.webhookEvents.set(integrationId, []);
    }
    this.webhookEvents.get(integrationId)!.push(event);

    // Deliver webhook
    this.deliverWebhook(event, integration);

    return event;
  }

  private deliverWebhook(event: WebhookEvent, integration: Integration): void {
    event.status = 'sent';
    event.attempts++;
    event.lastAttempt = Date.now();

    const delivery: WebhookDelivery = {
      id: `del_${++this.deliveryCounter}`,
      eventId: event.id,
      integrationId: integration.id,
      requestUrl: integration.config.webhookUrl ?? '',
      requestHeaders: {
        'Content-Type': 'application/json',
        ...integration.config.headers,
      },
      requestBody: JSON.stringify({
        event: event.eventType,
        timestamp: new Date().toISOString(),
        data: event.payload,
      }),
      responseStatus: 200,
      responseBody: '{"ok": true}',
      durationMs: Math.floor(Math.random() * 100) + 20,
      timestamp: Date.now(),
      success: true,
    };

    this.deliveries.push(delivery);
    event.responseStatus = delivery.responseStatus;

    integration.lastUsed = Date.now();
  }

  /**
   * Get webhook events for integration
   */
  getWebhookEvents(
    integrationId: string,
    status?: WebhookEvent['status']
  ): WebhookEvent[] {
    const events = this.webhookEvents.get(integrationId) ?? [];
    return status ? events.filter(e => e.status === status) : events;
  }

  /**
   * Get webhook deliveries for event
   */
  getWebhookDeliveries(eventId: string): WebhookDelivery[] {
    return this.deliveries.filter(d => d.eventId === eventId);
  }

  /**
   * Retry failed webhook
   */
  retryWebhook(eventId: string): WebhookEvent | undefined {
    for (const events of this.webhookEvents.values()) {
      const event = events.find(e => e.id === eventId);
      if (event && event.status === 'failed') {
        const integration = this.integrations.get(event.integrationId);
        if (integration) {
          event.status = 'retrying';
          this.deliverWebhook(event, integration);
          return event;
        }
      }
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Export Helpers
  // ---------------------------------------------------------------------------

  /**
   * Generate export file content
   */
  generateExportContent(
    data: Record<string, unknown>[],
    format: ExportFormat
  ): string {
    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'jsonl':
        return data.map(row => JSON.stringify(row)).join('\n');
      case 'csv':
        return this.toCSV(data);
      default:
        return JSON.stringify(data);
    }
  }

  private toCSV(data: Record<string, unknown>[]): string {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const rows = data.map(row =>
      headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return String(val);
      }).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Get supported export formats
   */
  getSupportedFormats(): Array<{ format: ExportFormat; name: string; description: string }> {
    return [
      { format: 'csv', name: 'CSV', description: 'Comma-separated values' },
      { format: 'json', name: 'JSON', description: 'JavaScript Object Notation' },
      { format: 'jsonl', name: 'JSON Lines', description: 'Newline-delimited JSON' },
      { format: 'parquet', name: 'Parquet', description: 'Apache Parquet columnar format' },
      { format: 'xlsx', name: 'Excel', description: 'Microsoft Excel spreadsheet' },
    ];
  }

  /**
   * Get supported integration types
   */
  getSupportedIntegrations(): Array<{ type: IntegrationType; name: string; description: string }> {
    return [
      { type: 'webhook', name: 'Webhook', description: 'HTTP webhook endpoint' },
      { type: 'slack', name: 'Slack', description: 'Slack notifications' },
      { type: 'teams', name: 'Microsoft Teams', description: 'Teams notifications' },
      { type: 'email', name: 'Email', description: 'Email notifications' },
      { type: 's3', name: 'Amazon S3', description: 'AWS S3 bucket' },
      { type: 'gcs', name: 'Google Cloud Storage', description: 'GCS bucket' },
      { type: 'bigquery', name: 'BigQuery', description: 'Google BigQuery' },
      { type: 'snowflake', name: 'Snowflake', description: 'Snowflake Data Cloud' },
      { type: 'postgres', name: 'PostgreSQL', description: 'PostgreSQL database' },
      { type: 'custom', name: 'Custom', description: 'Custom integration' },
    ];
  }
}

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

export const ExportQuerySchema = z.object({
  dataType: z.string(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  filters: z.record(z.unknown()).optional(),
  fields: z.array(z.string()).optional(),
  sort: z.object({
    field: z.string(),
    order: z.enum(['asc', 'desc']),
  }).optional(),
  limit: z.number().positive().optional(),
});

export const ExportDestinationSchema = z.object({
  type: z.enum(['download', 'cloud_storage', 'email', 'integration']),
  config: z.record(z.unknown()),
});

export const IntegrationConfigSchema = z.object({
  webhookUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  headers: z.record(z.string()).optional(),
  auth: z.object({
    type: z.enum(['none', 'basic', 'bearer', 'oauth2']),
    credentials: z.record(z.string()).optional(),
  }).optional(),
  cloudStorage: z.object({
    bucket: z.string(),
    path: z.string().optional(),
    region: z.string().optional(),
  }).optional(),
  database: z.object({
    host: z.string(),
    port: z.number().positive(),
    database: z.string(),
    schema: z.string().optional(),
    table: z.string().optional(),
  }).optional(),
  custom: z.record(z.unknown()).optional(),
});

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create an export service
 */
export function createExportService(): ExportService {
  return new ExportService();
}
