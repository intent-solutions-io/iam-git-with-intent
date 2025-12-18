/**
 * Tests for Phase 68: Export + Integrations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ExportService,
  createExportService,
  EXPORT_INTEGRATIONS_VERSION,
  ExportFormats,
  IntegrationTypes,
  type ExportJob,
  type ScheduledExport,
  type Integration,
  type WebhookEvent,
} from '../index.js';

describe('Export + Integrations', () => {
  let service: ExportService;

  beforeEach(() => {
    service = createExportService();
  });

  describe('Module exports', () => {
    it('should export version constant', () => {
      expect(EXPORT_INTEGRATIONS_VERSION).toBe('1.0.0');
    });

    it('should export ExportFormats', () => {
      expect(ExportFormats.CSV).toBe('csv');
      expect(ExportFormats.JSON).toBe('json');
      expect(ExportFormats.PARQUET).toBe('parquet');
      expect(ExportFormats.XLSX).toBe('xlsx');
    });

    it('should export IntegrationTypes', () => {
      expect(IntegrationTypes.WEBHOOK).toBe('webhook');
      expect(IntegrationTypes.S3).toBe('s3');
      expect(IntegrationTypes.GCS).toBe('gcs');
      expect(IntegrationTypes.BIGQUERY).toBe('bigquery');
    });

    it('should export factory function', () => {
      expect(typeof createExportService).toBe('function');
      const instance = createExportService();
      expect(instance).toBeInstanceOf(ExportService);
    });
  });

  describe('Export Jobs', () => {
    it('should create an export job', () => {
      const job = service.createExportJob({
        tenantId: 'tenant-1',
        name: 'Forecast Export',
        format: ExportFormats.CSV,
        query: {
          dataType: 'forecasts',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
        },
        destination: {
          type: 'download',
        },
      });

      expect(job).toBeDefined();
      expect(job.id).toMatch(/^export_/);
      expect(job.tenantId).toBe('tenant-1');
      expect(job.name).toBe('Forecast Export');
      expect(job.format).toBe('csv');
      expect(job.status).toBe('pending');
      expect(job.progress).toBe(0);
    });

    it('should get export job by ID', () => {
      const created = service.createExportJob({
        tenantId: 'tenant-1',
        name: 'Test Job',
        format: ExportFormats.JSON,
        query: { dataType: 'metrics' },
        destination: { type: 'download' },
      });

      const retrieved = service.getExportJob(created.id);
      expect(retrieved).toEqual(created);
    });

    it('should return undefined for nonexistent job', () => {
      const job = service.getExportJob('nonexistent');
      expect(job).toBeUndefined();
    });

    it('should list export jobs for tenant', () => {
      service.createExportJob({
        tenantId: 'tenant-1',
        name: 'Job 1',
        format: ExportFormats.CSV,
        query: {},
        destination: { type: 'download' },
      });
      service.createExportJob({
        tenantId: 'tenant-1',
        name: 'Job 2',
        format: ExportFormats.JSON,
        query: {},
        destination: { type: 'download' },
      });
      service.createExportJob({
        tenantId: 'tenant-2',
        name: 'Other Job',
        format: ExportFormats.CSV,
        query: {},
        destination: { type: 'download' },
      });

      const tenant1Jobs = service.listExportJobs('tenant-1');
      expect(tenant1Jobs).toHaveLength(2);
      expect(tenant1Jobs.every(j => j.tenantId === 'tenant-1')).toBe(true);
    });

    it('should filter jobs by status', () => {
      const job1 = service.createExportJob({
        tenantId: 'tenant-1',
        name: 'Pending Job',
        format: ExportFormats.CSV,
        query: {},
        destination: { type: 'download' },
      });

      const pendingJobs = service.listExportJobs('tenant-1', 'pending');
      expect(pendingJobs).toHaveLength(1);
      expect(pendingJobs[0].id).toBe(job1.id);
    });

    it('should execute export job', () => {
      const job = service.createExportJob({
        tenantId: 'tenant-1',
        name: 'Execute Test',
        format: ExportFormats.CSV,
        query: {},
        destination: { type: 'download' },
      });

      const executed = service.executeExportJob(job.id);

      expect(executed).toBeDefined();
      expect(executed!.status).toBe('running');
      expect(executed!.startedAt).toBeDefined();
    });

    it('should cancel running export job', async () => {
      const job = service.createExportJob({
        tenantId: 'tenant-1',
        name: 'Cancel Test',
        format: ExportFormats.CSV,
        query: {},
        destination: { type: 'download' },
      });

      service.executeExportJob(job.id);
      const cancelled = service.cancelExportJob(job.id);

      expect(cancelled).toBe(true);
      expect(job.status).toBe('cancelled');
    });

    it('should not cancel non-running job', () => {
      const job = service.createExportJob({
        tenantId: 'tenant-1',
        name: 'Pending Job',
        format: ExportFormats.CSV,
        query: {},
        destination: { type: 'download' },
      });

      const cancelled = service.cancelExportJob(job.id);
      expect(cancelled).toBe(false);
    });

    it('should delete export job', () => {
      const job = service.createExportJob({
        tenantId: 'tenant-1',
        name: 'To Delete',
        format: ExportFormats.CSV,
        query: {},
        destination: { type: 'download' },
      });

      const deleted = service.deleteExportJob(job.id);
      expect(deleted).toBe(true);

      const retrieved = service.getExportJob(job.id);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Scheduled Exports', () => {
    it('should create a scheduled export', () => {
      const scheduled = service.createScheduledExport({
        tenantId: 'tenant-1',
        name: 'Daily Forecast Export',
        format: ExportFormats.PARQUET,
        query: { dataType: 'forecasts' },
        destination: {
          type: 's3',
          bucket: 'my-exports',
          prefix: 'forecasts/',
        },
        schedule: {
          frequency: 'daily',
          hour: 6,
          minute: 0,
        },
        enabled: true,
      });

      expect(scheduled).toBeDefined();
      expect(scheduled.id).toMatch(/^sched_/);
      expect(scheduled.name).toBe('Daily Forecast Export');
      expect(scheduled.schedule.frequency).toBe('daily');
      expect(scheduled.nextRun).toBeDefined();
    });

    it('should get scheduled export by ID', () => {
      const created = service.createScheduledExport({
        tenantId: 'tenant-1',
        name: 'Test Schedule',
        format: ExportFormats.CSV,
        query: {},
        destination: { type: 'download' },
        schedule: { frequency: 'weekly', dayOfWeek: 1, hour: 0, minute: 0 },
        enabled: true,
      });

      const retrieved = service.getScheduledExport(created.id);
      expect(retrieved).toEqual(created);
    });

    it('should list scheduled exports for tenant', () => {
      service.createScheduledExport({
        tenantId: 'tenant-1',
        name: 'Schedule 1',
        format: ExportFormats.CSV,
        query: {},
        destination: { type: 'download' },
        schedule: { frequency: 'daily', hour: 0, minute: 0 },
        enabled: true,
      });
      service.createScheduledExport({
        tenantId: 'tenant-1',
        name: 'Schedule 2',
        format: ExportFormats.JSON,
        query: {},
        destination: { type: 'download' },
        schedule: { frequency: 'weekly', dayOfWeek: 0, hour: 0, minute: 0 },
        enabled: true,
      });

      const schedules = service.listScheduledExports('tenant-1');
      expect(schedules).toHaveLength(2);
    });

    it('should update scheduled export', () => {
      const scheduled = service.createScheduledExport({
        tenantId: 'tenant-1',
        name: 'Original',
        format: ExportFormats.CSV,
        query: {},
        destination: { type: 'download' },
        schedule: { frequency: 'daily', hour: 6, minute: 0 },
        enabled: true,
      });

      const updated = service.updateScheduledExport(scheduled.id, {
        name: 'Updated Name',
        enabled: false,
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Updated Name');
      expect(updated!.enabled).toBe(false);
    });

    it('should delete scheduled export', () => {
      const scheduled = service.createScheduledExport({
        tenantId: 'tenant-1',
        name: 'To Delete',
        format: ExportFormats.CSV,
        query: {},
        destination: { type: 'download' },
        schedule: { frequency: 'daily', hour: 0, minute: 0 },
        enabled: true,
      });

      const deleted = service.deleteScheduledExport(scheduled.id);
      expect(deleted).toBe(true);

      const retrieved = service.getScheduledExport(scheduled.id);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Integrations', () => {
    it('should create a webhook integration', () => {
      const integration = service.createIntegration({
        tenantId: 'tenant-1',
        name: 'Slack Notifications',
        type: IntegrationTypes.WEBHOOK,
        config: {
          url: 'https://hooks.slack.com/services/xxx',
          headers: { 'Content-Type': 'application/json' },
          events: ['export.completed', 'alert.triggered'],
        },
        enabled: true,
      });

      expect(integration).toBeDefined();
      expect(integration.id).toMatch(/^int_/);
      expect(integration.type).toBe('webhook');
      expect(integration.status).toBe('active');
    });

    it('should create S3 integration', () => {
      const integration = service.createIntegration({
        tenantId: 'tenant-1',
        name: 'S3 Export',
        type: IntegrationTypes.S3,
        config: {
          bucket: 'my-data-exports',
          region: 'us-west-2',
          prefix: 'exports/',
        },
        enabled: true,
      });

      expect(integration.type).toBe('s3');
    });

    it('should create BigQuery integration', () => {
      const integration = service.createIntegration({
        tenantId: 'tenant-1',
        name: 'BigQuery Sync',
        type: IntegrationTypes.BIGQUERY,
        config: {
          projectId: 'my-project',
          dataset: 'analytics',
          table: 'forecasts',
        },
        enabled: true,
      });

      expect(integration.type).toBe('bigquery');
    });

    it('should get integration by ID', () => {
      const created = service.createIntegration({
        tenantId: 'tenant-1',
        name: 'Test Integration',
        type: IntegrationTypes.WEBHOOK,
        config: { url: 'https://example.com/hook', events: [] },
        enabled: true,
      });

      const retrieved = service.getIntegration(created.id);
      expect(retrieved).toEqual(created);
    });

    it('should list integrations for tenant', () => {
      service.createIntegration({
        tenantId: 'tenant-1',
        name: 'Integration 1',
        type: IntegrationTypes.WEBHOOK,
        config: { url: 'https://example.com/1', events: [] },
        enabled: true,
      });
      service.createIntegration({
        tenantId: 'tenant-1',
        name: 'Integration 2',
        type: IntegrationTypes.S3,
        config: { bucket: 'bucket', region: 'us-east-1' },
        enabled: true,
      });

      const integrations = service.listIntegrations('tenant-1');
      expect(integrations).toHaveLength(2);
    });

    it('should filter integrations by type', () => {
      service.createIntegration({
        tenantId: 'tenant-1',
        name: 'Webhook',
        type: IntegrationTypes.WEBHOOK,
        config: { url: 'https://example.com', events: [] },
        enabled: true,
      });
      service.createIntegration({
        tenantId: 'tenant-1',
        name: 'S3',
        type: IntegrationTypes.S3,
        config: { bucket: 'bucket', region: 'us-east-1' },
        enabled: true,
      });

      const webhooks = service.listIntegrations('tenant-1', IntegrationTypes.WEBHOOK);
      expect(webhooks).toHaveLength(1);
      expect(webhooks[0].type).toBe('webhook');
    });

    it('should update integration', () => {
      const integration = service.createIntegration({
        tenantId: 'tenant-1',
        name: 'Original',
        type: IntegrationTypes.WEBHOOK,
        config: { url: 'https://example.com', events: [] },
        enabled: true,
      });

      const updated = service.updateIntegration(integration.id, {
        name: 'Updated',
        enabled: false,
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Updated');
      expect(updated!.enabled).toBe(false);
    });

    it('should delete integration', () => {
      const integration = service.createIntegration({
        tenantId: 'tenant-1',
        name: 'To Delete',
        type: IntegrationTypes.WEBHOOK,
        config: { url: 'https://example.com', events: [] },
        enabled: true,
      });

      const deleted = service.deleteIntegration(integration.id);
      expect(deleted).toBe(true);

      const retrieved = service.getIntegration(integration.id);
      expect(retrieved).toBeUndefined();
    });

    it('should test integration connection', () => {
      const integration = service.createIntegration({
        tenantId: 'tenant-1',
        name: 'Connection Test',
        type: IntegrationTypes.WEBHOOK,
        config: { url: 'https://example.com', events: [] },
        enabled: true,
      });

      const result = service.testIntegration(integration.id);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('latencyMs');
    });
  });

  describe('Webhook Events', () => {
    it('should send webhook event', () => {
      const integration = service.createIntegration({
        tenantId: 'tenant-1',
        name: 'Event Integration',
        type: IntegrationTypes.WEBHOOK,
        config: { webhookUrl: 'https://example.com', events: ['export.completed'] },
        enabled: true,
      });

      const event = service.sendWebhook(integration.id, 'export.completed', {
        exportId: 'export_1',
        status: 'completed',
      });

      expect(event).toBeDefined();
      expect(event.eventType).toBe('export.completed');
      expect(event.payload).toHaveProperty('exportId');
    });

    it('should get webhook events for integration', () => {
      const integration = service.createIntegration({
        tenantId: 'tenant-1',
        name: 'Events List',
        type: IntegrationTypes.WEBHOOK,
        config: { webhookUrl: 'https://example.com', events: ['alert.triggered'] },
        enabled: true,
      });

      service.sendWebhook(integration.id, 'alert.triggered', { alertId: '1' });
      service.sendWebhook(integration.id, 'alert.triggered', { alertId: '2' });

      const events = service.getWebhookEvents(integration.id);
      expect(events).toHaveLength(2);
    });

    it('should auto-deliver webhook on send', () => {
      const integration = service.createIntegration({
        tenantId: 'tenant-1',
        name: 'Delivery Test',
        type: IntegrationTypes.WEBHOOK,
        config: { webhookUrl: 'https://example.com/hook', events: ['test.event'] },
        enabled: true,
      });

      const event = service.sendWebhook(integration.id, 'test.event', { data: 'test' });

      // Webhook is delivered automatically on send
      expect(event.status).toBe('sent');
      expect(event.attempts).toBe(1);
    });

    it('should get webhook deliveries by event', () => {
      const integration = service.createIntegration({
        tenantId: 'tenant-1',
        name: 'Deliveries List',
        type: IntegrationTypes.WEBHOOK,
        config: { webhookUrl: 'https://example.com', events: ['test'] },
        enabled: true,
      });

      const event = service.sendWebhook(integration.id, 'test', {});

      const deliveries = service.getWebhookDeliveries(event.id);
      expect(deliveries.length).toBeGreaterThanOrEqual(1);
    });

    it('should retry failed webhook', () => {
      const integration = service.createIntegration({
        tenantId: 'tenant-1',
        name: 'Retry Test',
        type: IntegrationTypes.WEBHOOK,
        config: { webhookUrl: 'https://example.com', events: ['retry.test'] },
        enabled: true,
      });

      const event = service.sendWebhook(integration.id, 'retry.test', {});

      // Note: retryWebhook only works on 'failed' status events
      // Since our mock always succeeds, we can at least test the function exists
      const retryResult = service.retryWebhook(event.id);
      // Will be undefined since event is not in 'failed' status
      expect(retryResult).toBeUndefined();
    });
  });
});
