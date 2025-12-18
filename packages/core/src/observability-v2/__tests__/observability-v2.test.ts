/**
 * Observability v2 Tests
 *
 * Phase 46: Tests for enhanced monitoring, distributed tracing, and alerting.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryMetricsStore,
  InMemoryTraceStore,
  InMemoryAlertStore,
  ObservabilityManager,
  createObservabilityManager,
  DEFAULT_OBSERVABILITY_CONFIG,
} from '../index.js';

// =============================================================================
// InMemoryMetricsStore Tests
// =============================================================================

describe('InMemoryMetricsStore', () => {
  let store: InMemoryMetricsStore;

  beforeEach(() => {
    store = new InMemoryMetricsStore();
  });

  describe('record()', () => {
    it('should record metric data point', async () => {
      await store.record({
        name: 'http_requests_total',
        type: 'counter',
        value: 1,
        labels: { method: 'GET', path: '/api/health' },
        timestamp: new Date(),
      });

      const points = await store.query('http_requests_total');
      expect(points).toHaveLength(1);
    });
  });

  describe('query()', () => {
    beforeEach(async () => {
      await store.record({
        name: 'http_requests_total',
        type: 'counter',
        value: 1,
        labels: { method: 'GET', path: '/api/health' },
        timestamp: new Date(),
      });

      await store.record({
        name: 'http_requests_total',
        type: 'counter',
        value: 1,
        labels: { method: 'POST', path: '/api/runs' },
        timestamp: new Date(),
      });

      await store.record({
        name: 'http_latency_ms',
        type: 'histogram',
        value: 45,
        labels: { method: 'GET' },
        timestamp: new Date(),
      });
    });

    it('should query by name', async () => {
      const points = await store.query('http_requests_total');
      expect(points).toHaveLength(2);
    });

    it('should filter by labels', async () => {
      const points = await store.query('http_requests_total', { method: 'GET' });
      expect(points).toHaveLength(1);
      expect(points[0].labels.path).toBe('/api/health');
    });

    it('should filter by time', async () => {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const points = await store.query('http_requests_total', undefined, hourAgo);
      expect(points).toHaveLength(2);
    });
  });

  describe('aggregate()', () => {
    beforeEach(async () => {
      const now = new Date();
      await store.record({ name: 'requests', type: 'counter', value: 10, labels: {}, timestamp: now });
      await store.record({ name: 'requests', type: 'counter', value: 20, labels: {}, timestamp: now });
      await store.record({ name: 'requests', type: 'counter', value: 30, labels: {}, timestamp: now });
    });

    it('should calculate sum', async () => {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const sum = await store.aggregate('requests', 'sum', hourAgo);
      expect(sum).toBe(60);
    });

    it('should calculate avg', async () => {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const avg = await store.aggregate('requests', 'avg', hourAgo);
      expect(avg).toBe(20);
    });

    it('should calculate min', async () => {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const min = await store.aggregate('requests', 'min', hourAgo);
      expect(min).toBe(10);
    });

    it('should calculate max', async () => {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const max = await store.aggregate('requests', 'max', hourAgo);
      expect(max).toBe(30);
    });

    it('should calculate count', async () => {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const count = await store.aggregate('requests', 'count', hourAgo);
      expect(count).toBe(3);
    });
  });
});

// =============================================================================
// InMemoryTraceStore Tests
// =============================================================================

describe('InMemoryTraceStore', () => {
  let store: InMemoryTraceStore;

  beforeEach(() => {
    store = new InMemoryTraceStore();
  });

  describe('startSpan()', () => {
    it('should start a new span', async () => {
      const span = await store.startSpan({
        name: 'http-request',
        service: 'api',
        operation: 'GET /health',
        startTime: new Date(),
        status: 'ok',
        tags: {},
      });

      expect(span.context.traceId).toBeDefined();
      expect(span.context.spanId).toBeDefined();
      expect(span.context.sampled).toBe(true);
    });

    it('should create trace for new span', async () => {
      const span = await store.startSpan({
        name: 'root-span',
        service: 'api',
        operation: 'process',
        startTime: new Date(),
        status: 'ok',
        tags: {},
      });

      const trace = await store.getTrace(span.context.traceId);
      expect(trace).not.toBeNull();
      expect(trace!.spans).toHaveLength(1);
    });
  });

  describe('endSpan()', () => {
    it('should end span with duration', async () => {
      const span = await store.startSpan({
        name: 'test-span',
        service: 'api',
        operation: 'test',
        startTime: new Date(),
        status: 'ok',
        tags: {},
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const ended = await store.endSpan(span.context.spanId, 'ok');

      expect(ended.endTime).toBeDefined();
      expect(ended.durationMs).toBeGreaterThan(0);
      expect(ended.status).toBe('ok');
    });

    it('should record error', async () => {
      const span = await store.startSpan({
        name: 'test-span',
        service: 'api',
        operation: 'test',
        startTime: new Date(),
        status: 'ok',
        tags: {},
      });

      const ended = await store.endSpan(span.context.spanId, 'error', 'Something went wrong');

      expect(ended.status).toBe('error');
      expect(ended.logs.length).toBe(1);
      expect(ended.logs[0].message).toBe('Something went wrong');
    });
  });

  describe('searchTraces()', () => {
    beforeEach(async () => {
      const span1 = await store.startSpan({
        name: 'span1',
        service: 'api',
        operation: 'GET /health',
        startTime: new Date(),
        status: 'ok',
        tags: {},
      });
      await store.endSpan(span1.context.spanId, 'ok');

      const span2 = await store.startSpan({
        name: 'span2',
        service: 'worker',
        operation: 'process-job',
        startTime: new Date(),
        status: 'ok',
        tags: {},
      });
      await store.endSpan(span2.context.spanId, 'ok');
    });

    it('should search by service', async () => {
      const traces = await store.searchTraces({ service: 'api' });
      expect(traces).toHaveLength(1);
    });

    it('should search by operation', async () => {
      const traces = await store.searchTraces({ operation: 'process-job' });
      expect(traces).toHaveLength(1);
    });
  });
});

// =============================================================================
// InMemoryAlertStore Tests
// =============================================================================

describe('InMemoryAlertStore', () => {
  let store: InMemoryAlertStore;

  beforeEach(() => {
    store = new InMemoryAlertStore();
  });

  describe('createRule()', () => {
    it('should create alert rule', async () => {
      const rule = await store.createRule({
        name: 'High Error Rate',
        description: 'Error rate exceeds threshold',
        severity: 'critical',
        query: 'error_rate > 0.05',
        threshold: 0.05,
        operator: 'gt',
        duration: 300,
        labels: { team: 'platform' },
        annotations: { summary: 'High error rate detected' },
        enabled: true,
      });

      expect(rule.id).toMatch(/^rule_/);
      expect(rule.name).toBe('High Error Rate');
    });
  });

  describe('fireAlert()', () => {
    it('should fire alert from rule', async () => {
      const rule = await store.createRule({
        name: 'High Error Rate',
        description: 'Error rate exceeds threshold',
        severity: 'critical',
        query: 'error_rate > 0.05',
        threshold: 0.05,
        operator: 'gt',
        duration: 300,
        labels: {},
        annotations: {},
        enabled: true,
      });

      const alert = await store.fireAlert(rule.id, 0.08, 'Error rate at 8%');

      expect(alert.id).toMatch(/^alert_/);
      expect(alert.status).toBe('firing');
      expect(alert.value).toBe(0.08);
    });
  });

  describe('resolveAlert()', () => {
    it('should resolve alert', async () => {
      const rule = await store.createRule({
        name: 'Test Rule',
        description: 'Test',
        severity: 'warning',
        query: 'test > 1',
        threshold: 1,
        operator: 'gt',
        duration: 60,
        labels: {},
        annotations: {},
        enabled: true,
      });

      const alert = await store.fireAlert(rule.id, 2, 'Test alert');
      const resolved = await store.resolveAlert(alert.id);

      expect(resolved.status).toBe('resolved');
      expect(resolved.endsAt).toBeDefined();
    });
  });

  describe('acknowledgeAlert()', () => {
    it('should acknowledge alert', async () => {
      const rule = await store.createRule({
        name: 'Test Rule',
        description: 'Test',
        severity: 'warning',
        query: 'test > 1',
        threshold: 1,
        operator: 'gt',
        duration: 60,
        labels: {},
        annotations: {},
        enabled: true,
      });

      const alert = await store.fireAlert(rule.id, 2, 'Test alert');
      const acked = await store.acknowledgeAlert(alert.id, 'user-1');

      expect(acked.acknowledgedBy).toBe('user-1');
      expect(acked.acknowledgedAt).toBeDefined();
    });
  });

  describe('getActiveAlerts()', () => {
    it('should get active alerts', async () => {
      const rule = await store.createRule({
        name: 'Test Rule',
        description: 'Test',
        severity: 'warning',
        query: 'test > 1',
        threshold: 1,
        operator: 'gt',
        duration: 60,
        labels: {},
        annotations: {},
        enabled: true,
      });

      await store.fireAlert(rule.id, 2, 'Alert 1');
      const alert2 = await store.fireAlert(rule.id, 3, 'Alert 2');
      await store.resolveAlert(alert2.id);

      const active = await store.getActiveAlerts();
      expect(active).toHaveLength(1);
    });
  });
});

// =============================================================================
// ObservabilityManager Tests
// =============================================================================

describe('ObservabilityManager', () => {
  let manager: ObservabilityManager;

  beforeEach(() => {
    manager = createObservabilityManager({ serviceName: 'test-service' });
  });

  describe('Metrics', () => {
    it('should increment counter', async () => {
      await manager.incrementCounter('requests_total', { method: 'GET' });
      await manager.incrementCounter('requests_total', { method: 'GET' });

      const points = await manager.queryMetrics('requests_total');
      expect(points).toHaveLength(2);
    });

    it('should set gauge', async () => {
      await manager.setGauge('active_connections', 42);

      const points = await manager.queryMetrics('active_connections');
      expect(points).toHaveLength(1);
      expect(points[0].value).toBe(42);
    });

    it('should observe histogram', async () => {
      await manager.observeHistogram('request_latency_ms', 45);
      await manager.observeHistogram('request_latency_ms', 55);

      const points = await manager.queryMetrics('request_latency_ms');
      expect(points).toHaveLength(2);
    });
  });

  describe('Tracing', () => {
    it('should start and end span', async () => {
      const span = await manager.startSpan('test-span', 'test-operation');
      expect(span.context.sampled).toBe(true);

      const ended = await manager.endSpan(span, 'ok');
      expect(ended.status).toBe('ok');
    });

    it('should get trace', async () => {
      const span = await manager.startSpan('root-span', 'process');
      await manager.endSpan(span, 'ok');

      const trace = await manager.getTrace(span.context.traceId);
      expect(trace).not.toBeNull();
    });

    it('should search traces', async () => {
      const span = await manager.startSpan('api-span', 'GET /health');
      await manager.endSpan(span, 'ok');

      const traces = await manager.searchTraces({ service: 'test-service' });
      expect(traces.length).toBeGreaterThan(0);
    });
  });

  describe('Alerting', () => {
    it('should create and fire alert', async () => {
      const rule = await manager.createAlertRule({
        name: 'Test Alert',
        description: 'Test',
        severity: 'warning',
        query: 'test > 1',
        threshold: 1,
        operator: 'gt',
        duration: 60,
        labels: {},
        annotations: {},
        enabled: true,
      });

      const alert = await manager.fireAlert(rule.id, 2, 'Test fired');
      expect(alert.status).toBe('firing');
    });

    it('should resolve alert', async () => {
      const rule = await manager.createAlertRule({
        name: 'Test',
        description: 'Test',
        severity: 'info',
        query: 'x > 0',
        threshold: 0,
        operator: 'gt',
        duration: 0,
        labels: {},
        annotations: {},
        enabled: true,
      });

      const alert = await manager.fireAlert(rule.id, 1, 'Fired');
      const resolved = await manager.resolveAlert(alert.id);
      expect(resolved.status).toBe('resolved');
    });

    it('should get active alerts', async () => {
      const rule = await manager.createAlertRule({
        name: 'Test',
        description: 'Test',
        severity: 'info',
        query: 'x > 0',
        threshold: 0,
        operator: 'gt',
        duration: 0,
        labels: {},
        annotations: {},
        enabled: true,
      });

      await manager.fireAlert(rule.id, 1, 'Fired');
      const active = await manager.getActiveAlerts();
      expect(active.length).toBeGreaterThan(0);
    });
  });

  describe('SLI/SLO', () => {
    it('should create SLI', async () => {
      const sli = await manager.createSLI({
        name: 'API Availability',
        description: 'Percentage of successful requests',
        query: 'http_requests_success / http_requests_total',
        goodQuery: 'http_requests_success',
        totalQuery: 'http_requests_total',
        type: 'availability',
      });

      expect(sli.id).toMatch(/^sli_/);
    });

    it('should create SLO', async () => {
      const sli = await manager.createSLI({
        name: 'API Availability',
        description: 'Test',
        query: 'success / total',
        goodQuery: 'success',
        totalQuery: 'total',
        type: 'availability',
      });

      const slo = await manager.createSLO({
        name: '99.9% Availability',
        description: 'API must be 99.9% available',
        sliId: sli.id,
        target: 99.9,
        window: '30d',
        errorBudgetPolicy: 'burn_rate',
        alertRules: [],
      });

      expect(slo.id).toMatch(/^slo_/);
      expect(slo.target).toBe(99.9);
    });

    it('should get SLO status', async () => {
      const sli = await manager.createSLI({
        name: 'Test SLI',
        description: 'Test',
        query: 'test',
        goodQuery: 'good',
        totalQuery: 'total',
        type: 'availability',
      });

      const slo = await manager.createSLO({
        name: 'Test SLO',
        description: 'Test',
        sliId: sli.id,
        target: 99.5,
        window: '30d',
        errorBudgetPolicy: 'burn_rate',
        alertRules: [],
      });

      const status = await manager.getSLOStatus(slo.id);
      expect(status).not.toBeNull();
      expect(status!.target).toBe(99.5);
      expect(status!.status).toBeDefined();
    });
  });

  describe('Dashboards', () => {
    it('should create dashboard', async () => {
      const dashboard = await manager.createDashboard({
        name: 'API Overview',
        description: 'API metrics overview',
        panels: [
          {
            id: 'panel-1',
            title: 'Request Rate',
            type: 'graph',
            query: 'rate(requests_total[5m])',
            width: 12,
            height: 8,
            position: { x: 0, y: 0 },
          },
        ],
        variables: { environment: ['prod', 'staging'] },
        refreshInterval: 30,
        timeRange: { from: 'now-1h', to: 'now' },
        tags: ['api', 'overview'],
      });

      expect(dashboard.id).toMatch(/^dashboard_/);
      expect(dashboard.panels).toHaveLength(1);
    });

    it('should list dashboards', async () => {
      await manager.createDashboard({
        name: 'Dashboard 1',
        description: 'Test',
        panels: [],
        variables: {},
        refreshInterval: 30,
        timeRange: { from: 'now-1h', to: 'now' },
        tags: [],
      });

      await manager.createDashboard({
        name: 'Dashboard 2',
        description: 'Test',
        panels: [],
        variables: {},
        refreshInterval: 30,
        timeRange: { from: 'now-1h', to: 'now' },
        tags: [],
      });

      const dashboards = await manager.listDashboards();
      expect(dashboards).toHaveLength(2);
    });
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('Constants', () => {
  it('should have default observability config', () => {
    expect(DEFAULT_OBSERVABILITY_CONFIG.serviceName).toBe('gwi');
    expect(DEFAULT_OBSERVABILITY_CONFIG.sampleRate).toBe(1.0);
    expect(DEFAULT_OBSERVABILITY_CONFIG.enableTracing).toBe(true);
    expect(DEFAULT_OBSERVABILITY_CONFIG.enableMetrics).toBe(true);
    expect(DEFAULT_OBSERVABILITY_CONFIG.enableAlerting).toBe(true);
  });
});
