/**
 * Phase 67: Analytics + Reporting
 *
 * Analytics collection and reporting:
 * - Business metrics tracking
 * - Custom reports
 * - AnalyticsDashboards
 * - Data visualization
 *
 * @module @gwi/core/analytics-reporting
 */

import { z } from 'zod';

// =============================================================================
// VERSION
// =============================================================================

export const ANALYTICS_VERSION = '1.0.0';

// =============================================================================
// METRIC TYPES
// =============================================================================

export const AnalyticsMetricTypes = {
  COUNTER: 'counter',
  GAUGE: 'gauge',
  HISTOGRAM: 'histogram',
  SUMMARY: 'summary',
} as const;

export type AnalyticsMetricType = (typeof AnalyticsMetricTypes)[keyof typeof AnalyticsMetricTypes];

export const MetricCategories = {
  BUSINESS: 'business',
  PERFORMANCE: 'performance',
  USAGE: 'usage',
  ERRORS: 'errors',
  FORECASTING: 'forecasting',
  CUSTOM: 'custom',
} as const;

export type MetricCategory = (typeof MetricCategories)[keyof typeof MetricCategories];

// =============================================================================
// TYPES
// =============================================================================

export interface Metric {
  /** Metric name */
  name: string;
  /** Type */
  type: AnalyticsMetricType;
  /** Category */
  category: MetricCategory;
  /** Value */
  value: number;
  /** Timestamp */
  timestamp: number;
  /** Tenant ID */
  tenantId?: string;
  /** Labels/dimensions */
  labels: Record<string, string>;
  /** Unit */
  unit?: string;
}

export interface AnalyticsMetricDefinition {
  /** Metric name */
  name: string;
  /** Type */
  type: AnalyticsMetricType;
  /** Category */
  category: MetricCategory;
  /** Description */
  description: string;
  /** Unit */
  unit?: string;
  /** Default labels */
  defaultLabels?: string[];
}

export interface TimeSeriesData {
  /** Metric name */
  metricName: string;
  /** Time series points */
  points: Array<{
    timestamp: number;
    value: number;
  }>;
  /** Labels */
  labels: Record<string, string>;
  /** Aggregation used */
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count';
}

export interface MetricQuery {
  /** Metric names */
  metricNames: string[];
  /** Start time */
  startTime: number;
  /** End time */
  endTime: number;
  /** Tenant ID */
  tenantId?: string;
  /** Label filters */
  labelFilters?: Record<string, string>;
  /** Aggregation */
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count';
  /** Group by labels */
  groupBy?: string[];
  /** Resolution (seconds) */
  resolution?: number;
}

export interface Report {
  /** Report ID */
  id: string;
  /** Name */
  name: string;
  /** Description */
  description?: string;
  /** Type */
  type: 'scheduled' | 'on_demand' | 'triggered';
  /** Tenant ID */
  tenantId: string;
  /** Template */
  template: ReportTemplate;
  /** Schedule (cron) */
  schedule?: string;
  /** Last run */
  lastRun?: number;
  /** Next run */
  nextRun?: number;
  /** Recipients */
  recipients: string[];
  /** Format */
  format: 'pdf' | 'csv' | 'xlsx' | 'json';
  /** Status */
  status: 'active' | 'paused' | 'draft';
  /** Created at */
  createdAt: number;
  /** Updated at */
  updatedAt: number;
}

export interface ReportTemplate {
  /** Template ID */
  id: string;
  /** Name */
  name: string;
  /** Sections */
  sections: ReportSection[];
  /** Parameters */
  parameters?: ReportParameter[];
}

export interface ReportSection {
  /** Section ID */
  id: string;
  /** Title */
  title: string;
  /** Type */
  type: 'text' | 'chart' | 'table' | 'metric' | 'kpi';
  /** Configuration */
  config: Record<string, unknown>;
}

export interface ReportParameter {
  /** Parameter name */
  name: string;
  /** Label */
  label: string;
  /** Type */
  type: 'date' | 'date_range' | 'select' | 'text' | 'number';
  /** Required */
  required: boolean;
  /** Default value */
  defaultValue?: unknown;
  /** Options (for select) */
  options?: Array<{ value: string; label: string }>;
}

export interface ReportExecution {
  /** Execution ID */
  id: string;
  /** Report ID */
  reportId: string;
  /** Status */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Started at */
  startedAt: number;
  /** Completed at */
  completedAt?: number;
  /** Parameters used */
  parameters?: Record<string, unknown>;
  /** Output URL */
  outputUrl?: string;
  /** Error */
  error?: string;
}

export interface AnalyticsDashboard {
  /** AnalyticsDashboard ID */
  id: string;
  /** Name */
  name: string;
  /** Description */
  description?: string;
  /** Tenant ID */
  tenantId: string;
  /** Widgets */
  widgets: AnalyticsDashboardWidget[];
  /** Layout */
  layout: AnalyticsDashboardLayout;
  /** Refresh interval (seconds) */
  refreshInterval?: number;
  /** Public */
  isPublic: boolean;
  /** Created by */
  createdBy: string;
  /** Created at */
  createdAt: number;
  /** Updated at */
  updatedAt: number;
}

export interface AnalyticsDashboardWidget {
  /** Widget ID */
  id: string;
  /** Title */
  title: string;
  /** Type */
  type: 'line_chart' | 'bar_chart' | 'pie_chart' | 'gauge' | 'metric' | 'table' | 'text';
  /** Query */
  query?: MetricQuery;
  /** Static data */
  data?: unknown;
  /** Position */
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Configuration */
  config?: Record<string, unknown>;
}

export interface AnalyticsDashboardLayout {
  /** Columns */
  columns: number;
  /** Row height */
  rowHeight: number;
}

export interface KPI {
  /** KPI name */
  name: string;
  /** Current value */
  currentValue: number;
  /** Previous value */
  previousValue?: number;
  /** Target value */
  targetValue?: number;
  /** Change percentage */
  changePercentage?: number;
  /** Trend */
  trend: 'up' | 'down' | 'stable';
  /** Unit */
  unit?: string;
  /** Period */
  period: string;
}

// =============================================================================
// ANALYTICS SERVICE
// =============================================================================

/**
 * Analytics and reporting service
 */
export class AnalyticsService {
  private metrics: Metric[] = [];
  private metricDefinitions: Map<string, AnalyticsMetricDefinition> = new Map();
  private reports: Map<string, Report> = new Map();
  private executions: Map<string, ReportExecution[]> = new Map();
  private dashboards: Map<string, AnalyticsDashboard> = new Map();
  private reportCounter = 0;
  private executionCounter = 0;
  private dashboardCounter = 0;

  constructor() {
    this.initializeDefaultMetrics();
  }

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  /**
   * Record a metric
   */
  recordMetric(
    name: string,
    value: number,
    labels: Record<string, string> = {},
    tenantId?: string
  ): Metric {
    const definition = this.metricDefinitions.get(name);
    const metric: Metric = {
      name,
      type: definition?.type ?? 'gauge',
      category: definition?.category ?? 'custom',
      value,
      timestamp: Date.now(),
      tenantId,
      labels,
      unit: definition?.unit,
    };

    this.metrics.push(metric);

    // Keep only last 100k metrics for memory efficiency
    if (this.metrics.length > 100000) {
      this.metrics = this.metrics.slice(-50000);
    }

    return metric;
  }

  /**
   * Increment a counter
   */
  incrementCounter(
    name: string,
    increment: number = 1,
    labels: Record<string, string> = {},
    tenantId?: string
  ): void {
    this.recordMetric(name, increment, labels, tenantId);
  }

  /**
   * Set a gauge value
   */
  setGauge(
    name: string,
    value: number,
    labels: Record<string, string> = {},
    tenantId?: string
  ): void {
    this.recordMetric(name, value, labels, tenantId);
  }

  /**
   * Record a histogram observation
   */
  observeHistogram(
    name: string,
    value: number,
    labels: Record<string, string> = {},
    tenantId?: string
  ): void {
    this.recordMetric(name, value, labels, tenantId);
  }

  /**
   * Query metrics
   */
  queryMetrics(query: MetricQuery): TimeSeriesData[] {
    const filtered = this.metrics.filter(m => {
      if (!query.metricNames.includes(m.name)) return false;
      if (m.timestamp < query.startTime || m.timestamp > query.endTime) return false;
      if (query.tenantId && m.tenantId !== query.tenantId) return false;
      if (query.labelFilters) {
        for (const [key, value] of Object.entries(query.labelFilters)) {
          if (m.labels[key] !== value) return false;
        }
      }
      return true;
    });

    // Group by metric name and labels
    const groups = new Map<string, Metric[]>();
    for (const metric of filtered) {
      const groupKey = query.groupBy
        ? `${metric.name}:${query.groupBy.map(l => metric.labels[l] ?? '').join(':')}`
        : metric.name;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(metric);
    }

    // Build time series
    const result: TimeSeriesData[] = [];
    const resolution = query.resolution ?? 60000; // Default 1 minute

    for (const [groupKey, metrics] of groups) {
      const [metricName] = groupKey.split(':');
      const points: Array<{ timestamp: number; value: number }> = [];

      // Bucket by resolution
      const buckets = new Map<number, number[]>();
      for (const m of metrics) {
        const bucket = Math.floor(m.timestamp / resolution) * resolution;
        if (!buckets.has(bucket)) {
          buckets.set(bucket, []);
        }
        buckets.get(bucket)!.push(m.value);
      }

      // Aggregate buckets
      for (const [timestamp, values] of buckets) {
        let value: number;
        switch (query.aggregation) {
          case 'sum':
            value = values.reduce((a, b) => a + b, 0);
            break;
          case 'min':
            value = Math.min(...values);
            break;
          case 'max':
            value = Math.max(...values);
            break;
          case 'count':
            value = values.length;
            break;
          case 'avg':
          default:
            value = values.reduce((a, b) => a + b, 0) / values.length;
        }
        points.push({ timestamp, value });
      }

      points.sort((a, b) => a.timestamp - b.timestamp);

      const labels: Record<string, string> = {};
      if (metrics.length > 0 && query.groupBy) {
        for (const label of query.groupBy) {
          labels[label] = metrics[0].labels[label] ?? '';
        }
      }

      result.push({
        metricName,
        points,
        labels,
        aggregation: query.aggregation,
      });
    }

    return result;
  }

  /**
   * Get KPIs for a tenant
   */
  getKPIs(tenantId: string, period: string = 'monthly'): KPI[] {
    const now = Date.now();
    const periodMs = period === 'monthly' ? 30 * 24 * 60 * 60 * 1000 :
                     period === 'weekly' ? 7 * 24 * 60 * 60 * 1000 :
                     24 * 60 * 60 * 1000;

    const currentStart = now - periodMs;
    const previousStart = currentStart - periodMs;

    const kpis: KPI[] = [];

    // API Requests
    const apiCurrent = this.sumMetricValue('api_requests', tenantId, currentStart, now);
    const apiPrevious = this.sumMetricValue('api_requests', tenantId, previousStart, currentStart);
    kpis.push(this.buildKPI('API Requests', apiCurrent, apiPrevious, 'requests', period));

    // Forecasts Generated
    const forecastsCurrent = this.sumMetricValue('forecasts_generated', tenantId, currentStart, now);
    const forecastsPrevious = this.sumMetricValue('forecasts_generated', tenantId, previousStart, currentStart);
    kpis.push(this.buildKPI('Forecasts Generated', forecastsCurrent, forecastsPrevious, 'forecasts', period));

    // Active Users
    const usersCurrent = this.countUniqueLabels('user_activity', 'user_id', tenantId, currentStart, now);
    const usersPrevious = this.countUniqueLabels('user_activity', 'user_id', tenantId, previousStart, currentStart);
    kpis.push(this.buildKPI('Active Users', usersCurrent, usersPrevious, 'users', period));

    // Error Rate
    const errorsCurrent = this.sumMetricValue('errors', tenantId, currentStart, now);
    const requestsCurrent = this.sumMetricValue('api_requests', tenantId, currentStart, now);
    const errorRateCurrent = requestsCurrent > 0 ? (errorsCurrent / requestsCurrent) * 100 : 0;
    const errorsPrevious = this.sumMetricValue('errors', tenantId, previousStart, currentStart);
    const requestsPrevious = this.sumMetricValue('api_requests', tenantId, previousStart, currentStart);
    const errorRatePrevious = requestsPrevious > 0 ? (errorsPrevious / requestsPrevious) * 100 : 0;
    kpis.push(this.buildKPI('Error Rate', errorRateCurrent, errorRatePrevious, '%', period, true));

    return kpis;
  }

  private sumMetricValue(name: string, tenantId: string, start: number, end: number): number {
    return this.metrics
      .filter(m => m.name === name && m.tenantId === tenantId && m.timestamp >= start && m.timestamp <= end)
      .reduce((sum, m) => sum + m.value, 0);
  }

  private countUniqueLabels(name: string, label: string, tenantId: string, start: number, end: number): number {
    const values = new Set<string>();
    this.metrics
      .filter(m => m.name === name && m.tenantId === tenantId && m.timestamp >= start && m.timestamp <= end)
      .forEach(m => {
        if (m.labels[label]) {
          values.add(m.labels[label]);
        }
      });
    return values.size;
  }

  private buildKPI(
    name: string,
    current: number,
    previous: number,
    unit: string,
    period: string,
    lowerIsBetter: boolean = false
  ): KPI {
    const change = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    const trend = Math.abs(change) < 1 ? 'stable' :
                  lowerIsBetter ? (change < 0 ? 'up' : 'down') :
                  (change > 0 ? 'up' : 'down');

    return {
      name,
      currentValue: current,
      previousValue: previous,
      changePercentage: change,
      trend,
      unit,
      period,
    };
  }

  /**
   * Register a metric definition
   */
  registerMetric(definition: AnalyticsMetricDefinition): void {
    this.metricDefinitions.set(definition.name, definition);
  }

  /**
   * List metric definitions
   */
  listAnalyticsMetricDefinitions(category?: MetricCategory): AnalyticsMetricDefinition[] {
    const defs = Array.from(this.metricDefinitions.values());
    return category ? defs.filter(d => d.category === category) : defs;
  }

  // ---------------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------------

  /**
   * Create a report
   */
  createReport(
    params: Omit<Report, 'id' | 'lastRun' | 'createdAt' | 'updatedAt'>
  ): Report {
    const report: Report = {
      ...params,
      id: `report_${++this.reportCounter}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.reports.set(report.id, report);
    return report;
  }

  /**
   * Get report by ID
   */
  getReport(reportId: string): Report | undefined {
    return this.reports.get(reportId);
  }

  /**
   * List reports for tenant
   */
  listReports(tenantId: string, type?: Report['type']): Report[] {
    return Array.from(this.reports.values())
      .filter(r => r.tenantId === tenantId && (!type || r.type === type));
  }

  /**
   * Update report
   */
  updateReport(
    reportId: string,
    updates: Partial<Pick<Report, 'name' | 'description' | 'template' | 'schedule' | 'recipients' | 'format' | 'status'>>
  ): Report | undefined {
    const report = this.reports.get(reportId);
    if (!report) return undefined;

    Object.assign(report, updates, { updatedAt: Date.now() });
    return report;
  }

  /**
   * Delete report
   */
  deleteReport(reportId: string): boolean {
    return this.reports.delete(reportId);
  }

  /**
   * Execute a report
   */
  executeReport(
    reportId: string,
    parameters?: Record<string, unknown>
  ): ReportExecution {
    const report = this.reports.get(reportId);
    if (!report) {
      throw new Error('Report not found');
    }

    const execution: ReportExecution = {
      id: `exec_${++this.executionCounter}`,
      reportId,
      status: 'running',
      startedAt: Date.now(),
      parameters,
    };

    if (!this.executions.has(reportId)) {
      this.executions.set(reportId, []);
    }
    this.executions.get(reportId)!.push(execution);

    // Simulate execution (in real implementation, this would be async)
    setTimeout(() => {
      execution.status = 'completed';
      execution.completedAt = Date.now();
      execution.outputUrl = `/reports/${execution.id}.${report.format}`;
    }, 100);

    report.lastRun = Date.now();

    return execution;
  }

  /**
   * Get report executions
   */
  getReportExecutions(reportId: string): ReportExecution[] {
    return this.executions.get(reportId) ?? [];
  }

  // ---------------------------------------------------------------------------
  // AnalyticsDashboards
  // ---------------------------------------------------------------------------

  /**
   * Create a dashboard
   */
  createAnalyticsDashboard(
    params: Omit<AnalyticsDashboard, 'id' | 'createdAt' | 'updatedAt'>
  ): AnalyticsDashboard {
    const dashboard: AnalyticsDashboard = {
      ...params,
      id: `dashboard_${++this.dashboardCounter}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.dashboards.set(dashboard.id, dashboard);
    return dashboard;
  }

  /**
   * Get dashboard by ID
   */
  getAnalyticsDashboard(dashboardId: string): AnalyticsDashboard | undefined {
    return this.dashboards.get(dashboardId);
  }

  /**
   * List dashboards for tenant
   */
  listAnalyticsDashboards(tenantId: string): AnalyticsDashboard[] {
    return Array.from(this.dashboards.values())
      .filter(d => d.tenantId === tenantId);
  }

  /**
   * Update dashboard
   */
  updateAnalyticsDashboard(
    dashboardId: string,
    updates: Partial<Pick<AnalyticsDashboard, 'name' | 'description' | 'widgets' | 'layout' | 'refreshInterval' | 'isPublic'>>
  ): AnalyticsDashboard | undefined {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return undefined;

    Object.assign(dashboard, updates, { updatedAt: Date.now() });
    return dashboard;
  }

  /**
   * Add widget to dashboard
   */
  addWidget(dashboardId: string, widget: AnalyticsDashboardWidget): AnalyticsDashboard | undefined {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return undefined;

    dashboard.widgets.push(widget);
    dashboard.updatedAt = Date.now();
    return dashboard;
  }

  /**
   * Remove widget from dashboard
   */
  removeWidget(dashboardId: string, widgetId: string): AnalyticsDashboard | undefined {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return undefined;

    dashboard.widgets = dashboard.widgets.filter(w => w.id !== widgetId);
    dashboard.updatedAt = Date.now();
    return dashboard;
  }

  /**
   * Delete dashboard
   */
  deleteAnalyticsDashboard(dashboardId: string): boolean {
    return this.dashboards.delete(dashboardId);
  }

  /**
   * Get dashboard data (execute all widget queries)
   */
  getAnalyticsDashboardData(dashboardId: string): Record<string, TimeSeriesData[]> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return {};

    const data: Record<string, TimeSeriesData[]> = {};

    for (const widget of dashboard.widgets) {
      if (widget.query) {
        data[widget.id] = this.queryMetrics(widget.query);
      }
    }

    return data;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private initializeDefaultMetrics(): void {
    const defaultMetrics: AnalyticsMetricDefinition[] = [
      { name: 'api_requests', type: 'counter', category: 'usage', description: 'Total API requests', unit: 'requests' },
      { name: 'api_latency', type: 'histogram', category: 'performance', description: 'API latency', unit: 'ms' },
      { name: 'forecasts_generated', type: 'counter', category: 'forecasting', description: 'Forecasts generated', unit: 'forecasts' },
      { name: 'forecast_accuracy', type: 'gauge', category: 'forecasting', description: 'Forecast accuracy', unit: '%' },
      { name: 'data_points_ingested', type: 'counter', category: 'usage', description: 'Data points ingested', unit: 'points' },
      { name: 'active_connectors', type: 'gauge', category: 'usage', description: 'Active connectors', unit: 'connectors' },
      { name: 'user_activity', type: 'counter', category: 'usage', description: 'User activity events', unit: 'events' },
      { name: 'errors', type: 'counter', category: 'errors', description: 'Error count', unit: 'errors' },
      { name: 'alerts_triggered', type: 'counter', category: 'business', description: 'Alerts triggered', unit: 'alerts' },
      { name: 'storage_used', type: 'gauge', category: 'usage', description: 'Storage used', unit: 'bytes' },
    ];

    for (const def of defaultMetrics) {
      this.metricDefinitions.set(def.name, def);
    }
  }
}

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

export const MetricSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['counter', 'gauge', 'histogram', 'summary']),
  category: z.enum(['business', 'performance', 'usage', 'errors', 'forecasting', 'custom']),
  value: z.number(),
  timestamp: z.number(),
  tenantId: z.string().optional(),
  labels: z.record(z.string()),
  unit: z.string().optional(),
});

export const MetricQuerySchema = z.object({
  metricNames: z.array(z.string()).min(1),
  startTime: z.number(),
  endTime: z.number(),
  tenantId: z.string().optional(),
  labelFilters: z.record(z.string()).optional(),
  aggregation: z.enum(['sum', 'avg', 'min', 'max', 'count']).optional(),
  groupBy: z.array(z.string()).optional(),
  resolution: z.number().positive().optional(),
});

export const AnalyticsDashboardWidgetSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['line_chart', 'bar_chart', 'pie_chart', 'gauge', 'metric', 'table', 'text']),
  query: MetricQuerySchema.optional(),
  data: z.unknown().optional(),
  position: z.object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  config: z.record(z.unknown()).optional(),
});

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create an analytics service
 */
export function createAnalyticsService(): AnalyticsService {
  return new AnalyticsService();
}
