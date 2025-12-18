/**
 * Tests for Phase 67: Analytics + Reporting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AnalyticsService,
  createAnalyticsService,
  ANALYTICS_VERSION,
  AnalyticsMetricTypes,
  MetricCategories,
  type Metric,
  type TimeSeriesData,
  type Report,
  type AnalyticsDashboard,
} from '../index.js';

describe('Analytics + Reporting', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    service = createAnalyticsService();
  });

  describe('Module exports', () => {
    it('should export version constant', () => {
      expect(ANALYTICS_VERSION).toBe('1.0.0');
    });

    it('should export AnalyticsMetricTypes', () => {
      expect(AnalyticsMetricTypes.COUNTER).toBe('counter');
      expect(AnalyticsMetricTypes.GAUGE).toBe('gauge');
      expect(AnalyticsMetricTypes.HISTOGRAM).toBe('histogram');
      expect(AnalyticsMetricTypes.SUMMARY).toBe('summary');
    });

    it('should export MetricCategories', () => {
      expect(MetricCategories.BUSINESS).toBe('business');
      expect(MetricCategories.PERFORMANCE).toBe('performance');
      expect(MetricCategories.USAGE).toBe('usage');
      expect(MetricCategories.ERRORS).toBe('errors');
    });

    it('should export factory function', () => {
      expect(typeof createAnalyticsService).toBe('function');
      const instance = createAnalyticsService();
      expect(instance).toBeInstanceOf(AnalyticsService);
    });
  });

  describe('Metric Recording', () => {
    it('should record a metric', () => {
      const metric = service.recordMetric('test_metric', 42, { env: 'test' });

      expect(metric).toBeDefined();
      expect(metric.name).toBe('test_metric');
      expect(metric.value).toBe(42);
      expect(metric.labels).toEqual({ env: 'test' });
      expect(metric.timestamp).toBeDefined();
    });

    it('should record metric with tenant ID', () => {
      const metric = service.recordMetric('tenant_metric', 100, {}, 'tenant-1');

      expect(metric.tenantId).toBe('tenant-1');
    });

    it('should increment counter', () => {
      service.incrementCounter('request_count', 1, { endpoint: '/api' });
      service.incrementCounter('request_count', 5, { endpoint: '/api' });

      const now = Date.now();
      const result = service.queryMetrics({
        metricNames: ['request_count'],
        startTime: now - 60000,
        endTime: now + 1000,
        aggregation: 'sum',
      });

      expect(result.length).toBeGreaterThan(0);
      const total = result[0].points.reduce((sum, p) => sum + p.value, 0);
      expect(total).toBe(6);
    });

    it('should set gauge value', () => {
      service.setGauge('active_connections', 25, { server: 'srv-1' });

      const now = Date.now();
      const result = service.queryMetrics({
        metricNames: ['active_connections'],
        startTime: now - 60000,
        endTime: now + 1000,
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].points.some(p => p.value === 25)).toBe(true);
    });

    it('should observe histogram value', () => {
      service.observeHistogram('response_time', 150, { endpoint: '/api' });
      service.observeHistogram('response_time', 200, { endpoint: '/api' });
      service.observeHistogram('response_time', 180, { endpoint: '/api' });

      const now = Date.now();
      const result = service.queryMetrics({
        metricNames: ['response_time'],
        startTime: now - 60000,
        endTime: now + 1000,
        aggregation: 'avg',
      });

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Metric Queries', () => {
    beforeEach(() => {
      // Record some test metrics
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        service.recordMetric('test_counter', i, { region: i % 2 === 0 ? 'us' : 'eu' }, 'tenant-1');
      }
    });

    it('should query metrics by name', () => {
      const now = Date.now();
      const result = service.queryMetrics({
        metricNames: ['test_counter'],
        startTime: now - 60000,
        endTime: now + 1000,
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].metricName).toBe('test_counter');
    });

    it('should filter by tenant ID', () => {
      service.recordMetric('tenant_specific', 100, {}, 'tenant-a');
      service.recordMetric('tenant_specific', 200, {}, 'tenant-b');

      const now = Date.now();
      const result = service.queryMetrics({
        metricNames: ['tenant_specific'],
        startTime: now - 60000,
        endTime: now + 1000,
        tenantId: 'tenant-a',
      });

      expect(result.length).toBeGreaterThan(0);
      // Should only have tenant-a metrics
      expect(result[0].points.every(p => p.value === 100)).toBe(true);
    });

    it('should filter by labels', () => {
      const now = Date.now();
      const result = service.queryMetrics({
        metricNames: ['test_counter'],
        startTime: now - 60000,
        endTime: now + 1000,
        labelFilters: { region: 'us' },
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it('should aggregate with sum', () => {
      const now = Date.now();
      const result = service.queryMetrics({
        metricNames: ['test_counter'],
        startTime: now - 60000,
        endTime: now + 1000,
        aggregation: 'sum',
      });

      expect(result[0].aggregation).toBe('sum');
    });

    it('should aggregate with avg', () => {
      const now = Date.now();
      const result = service.queryMetrics({
        metricNames: ['test_counter'],
        startTime: now - 60000,
        endTime: now + 1000,
        aggregation: 'avg',
      });

      expect(result[0].aggregation).toBe('avg');
    });

    it('should aggregate with min/max', () => {
      const now = Date.now();

      const minResult = service.queryMetrics({
        metricNames: ['test_counter'],
        startTime: now - 60000,
        endTime: now + 1000,
        aggregation: 'min',
      });

      const maxResult = service.queryMetrics({
        metricNames: ['test_counter'],
        startTime: now - 60000,
        endTime: now + 1000,
        aggregation: 'max',
      });

      expect(minResult[0].aggregation).toBe('min');
      expect(maxResult[0].aggregation).toBe('max');
    });
  });

  describe('KPIs', () => {
    it('should get KPIs for a tenant', () => {
      // Record some metrics
      service.recordMetric('api_requests', 100, {}, 'tenant-1');
      service.recordMetric('forecasts_generated', 50, {}, 'tenant-1');

      const kpis = service.getKPIs('tenant-1', 'monthly');

      expect(Array.isArray(kpis)).toBe(true);
      expect(kpis.length).toBeGreaterThan(0);

      for (const kpi of kpis) {
        expect(kpi).toHaveProperty('name');
        expect(kpi).toHaveProperty('currentValue');
        expect(kpi).toHaveProperty('trend');
      }
    });

    it('should support different periods', () => {
      const monthly = service.getKPIs('tenant-1', 'monthly');
      const weekly = service.getKPIs('tenant-1', 'weekly');
      const daily = service.getKPIs('tenant-1', 'daily');

      expect(Array.isArray(monthly)).toBe(true);
      expect(Array.isArray(weekly)).toBe(true);
      expect(Array.isArray(daily)).toBe(true);
    });
  });

  describe('Report Management', () => {
    const createTestReport = (overrides = {}) => ({
      tenantId: 'tenant-1',
      name: 'Test Report',
      description: 'Test description',
      type: 'scheduled' as const,
      template: {
        id: 'template-1',
        name: 'Usage Template',
        sections: [{ id: 'section-1', title: 'Usage', type: 'metric' as const, config: {} }],
      },
      recipients: ['user@example.com'],
      format: 'pdf' as const,
      status: 'active' as const,
      ...overrides,
    });

    it('should create a report', () => {
      const report = service.createReport(createTestReport({
        name: 'Monthly Usage Report',
        description: 'Monthly usage statistics',
      }));

      expect(report).toBeDefined();
      expect(report.id).toMatch(/^report_/);
      expect(report.name).toBe('Monthly Usage Report');
      expect(report.tenantId).toBe('tenant-1');
      expect(report.type).toBe('scheduled');
    });

    it('should get a report by ID', () => {
      const created = service.createReport(createTestReport());

      const retrieved = service.getReport(created.id);
      expect(retrieved).toEqual(created);
    });

    it('should list reports for a tenant', () => {
      service.createReport(createTestReport({ name: 'Report 1' }));
      service.createReport(createTestReport({ name: 'Report 2' }));

      const reports = service.listReports('tenant-1');
      expect(reports).toHaveLength(2);
    });

    it('should execute a report', () => {
      const report = service.createReport(createTestReport({ name: 'Execution Test' }));

      const execution = service.executeReport(report.id);

      expect(execution).toBeDefined();
      expect(execution.reportId).toBe(report.id);
      // Execution starts as 'running' and completes asynchronously
      expect(['running', 'completed']).toContain(execution.status);
      expect(execution.startedAt).toBeDefined();
    });

    it('should delete a report', () => {
      const report = service.createReport(createTestReport({ name: 'To Delete' }));

      const deleted = service.deleteReport(report.id);
      expect(deleted).toBe(true);

      const retrieved = service.getReport(report.id);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Dashboard Management', () => {
    const createTestDashboard = (overrides = {}) => ({
      tenantId: 'tenant-1',
      name: 'Test Dashboard',
      description: 'Test description',
      widgets: [],
      layout: { columns: 2, rowHeight: 100 },
      isPublic: false,
      createdBy: 'user@example.com',
      ...overrides,
    });

    it('should create a dashboard', () => {
      const dashboard = service.createAnalyticsDashboard(createTestDashboard({
        name: 'Operations Dashboard',
        description: 'Real-time operations monitoring',
        layout: { columns: 3, rowHeight: 150 },
        refreshInterval: 60000,
      }));

      expect(dashboard).toBeDefined();
      expect(dashboard.id).toMatch(/^dashboard_/);
      expect(dashboard.name).toBe('Operations Dashboard');
      expect(dashboard.tenantId).toBe('tenant-1');
    });

    it('should get a dashboard by ID', () => {
      const created = service.createAnalyticsDashboard(createTestDashboard());

      const retrieved = service.getAnalyticsDashboard(created.id);
      expect(retrieved).toEqual(created);
    });

    it('should list dashboards for a tenant', () => {
      service.createAnalyticsDashboard(createTestDashboard({ name: 'Dashboard 1' }));
      service.createAnalyticsDashboard(createTestDashboard({ name: 'Dashboard 2' }));

      const dashboards = service.listAnalyticsDashboards('tenant-1');
      expect(dashboards).toHaveLength(2);
    });

    it('should add widget to dashboard', () => {
      const dashboard = service.createAnalyticsDashboard(createTestDashboard({ name: 'Widget Test' }));

      const updated = service.addWidget(dashboard.id, {
        id: 'widget-1',
        type: 'line_chart',
        title: 'API Requests',
        config: {
          metricNames: ['api_requests'],
          period: 'hourly',
        },
        position: { x: 0, y: 0, width: 1, height: 1 },
      });

      expect(updated).toBeDefined();
      expect(updated!.widgets).toHaveLength(1);
      expect(updated!.widgets[0].id).toBe('widget-1');
    });

    it('should remove widget from dashboard', () => {
      const dashboard = service.createAnalyticsDashboard(createTestDashboard({
        name: 'Remove Widget Test',
        widgets: [{
          id: 'widget-to-remove',
          type: 'gauge',
          title: 'Test Widget',
          position: { x: 0, y: 0, width: 1, height: 1 },
        }],
      }));

      const updated = service.removeWidget(dashboard.id, 'widget-to-remove');

      expect(updated).toBeDefined();
      expect(updated!.widgets).toHaveLength(0);
    });

    it('should update dashboard', () => {
      const dashboard = service.createAnalyticsDashboard(createTestDashboard({ name: 'Original Name' }));

      const updated = service.updateAnalyticsDashboard(dashboard.id, {
        name: 'Updated Name',
        refreshInterval: 30000,
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Updated Name');
      expect(updated!.refreshInterval).toBe(30000);
    });

    it('should delete dashboard', () => {
      const dashboard = service.createAnalyticsDashboard(createTestDashboard({ name: 'To Delete' }));

      const deleted = service.deleteAnalyticsDashboard(dashboard.id);
      expect(deleted).toBe(true);

      const retrieved = service.getAnalyticsDashboard(dashboard.id);
      expect(retrieved).toBeUndefined();
    });
  });
});
