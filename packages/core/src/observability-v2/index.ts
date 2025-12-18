/**
 * Observability v2 Module
 *
 * Phase 46: Enhanced monitoring, distributed tracing, and alerting.
 * Provides comprehensive observability for production systems.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Metric types (prefixed to avoid conflict with reliability and telemetry)
 */
export type ObsMetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

/**
 * Alert severity
 */
export type AlertSeverity = 'critical' | 'error' | 'warning' | 'info';

/**
 * Alert status
 */
export type AlertStatus = 'firing' | 'pending' | 'resolved' | 'silenced';

/**
 * Trace status
 */
export type TraceStatus = 'ok' | 'error' | 'timeout' | 'cancelled';

/**
 * Metric definition (prefixed to avoid conflict with telemetry)
 */
export interface ObsMetricDefinition {
  name: string;
  type: ObsMetricType;
  description: string;
  unit?: string;
  labels: string[];
  buckets?: number[]; // For histograms
}

/**
 * Metric data point
 */
export interface MetricDataPoint {
  name: string;
  type: ObsMetricType;
  value: number;
  labels: Record<string, string>;
  timestamp: Date;
}

/**
 * Span context for distributed tracing
 */
export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

/**
 * Trace span
 */
export interface TraceSpan {
  context: SpanContext;
  name: string;
  service: string;
  operation: string;
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
  status: TraceStatus;
  tags: Record<string, string | number | boolean>;
  logs: Array<{ timestamp: Date; message: string; level: string }>;
  links?: SpanContext[];
}

/**
 * Full trace
 */
export interface Trace {
  traceId: string;
  rootSpan: TraceSpan;
  spans: TraceSpan[];
  durationMs: number;
  service: string;
  status: TraceStatus;
  startTime: Date;
  endTime?: Date;
}

/**
 * Alert rule
 */
export interface AlertRule {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  query: string;
  threshold: number;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne';
  duration: number; // Seconds before firing
  labels: Record<string, string>;
  annotations: Record<string, string>;
  enabled: boolean;
  silenceUntil?: Date;
}

/**
 * Active alert
 */
export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  status: AlertStatus;
  value: number;
  threshold: number;
  message: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: Date;
  endsAt?: Date;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

/**
 * Dashboard panel
 */
export interface DashboardPanel {
  id: string;
  title: string;
  type: 'graph' | 'stat' | 'table' | 'heatmap' | 'gauge';
  query: string;
  width: number;
  height: number;
  position: { x: number; y: number };
  options?: Record<string, unknown>;
}

/**
 * Dashboard definition
 */
export interface Dashboard {
  id: string;
  name: string;
  description: string;
  panels: DashboardPanel[];
  variables: Record<string, string[]>;
  refreshInterval: number; // Seconds
  timeRange: { from: string; to: string };
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * SLI (Service Level Indicator)
 */
export interface SLI {
  id: string;
  name: string;
  description: string;
  query: string;
  goodQuery: string;
  totalQuery: string;
  type: 'availability' | 'latency' | 'throughput' | 'error_rate';
}

/**
 * SLO (Service Level Objective)
 */
export interface SLO {
  id: string;
  name: string;
  description: string;
  sliId: string;
  target: number; // 0-100 percentage
  window: '7d' | '28d' | '30d' | '90d';
  errorBudgetPolicy: 'burn_rate' | 'error_budget';
  alertRules: string[];
  createdAt: Date;
}

/**
 * SLO status
 */
export interface SLOStatus {
  sloId: string;
  sloName: string;
  target: number;
  current: number;
  errorBudget: number;
  errorBudgetRemaining: number;
  burnRate: number;
  status: 'met' | 'at_risk' | 'breached';
  window: string;
  calculatedAt: Date;
}

// =============================================================================
// Store Interfaces
// =============================================================================

/**
 * Metrics store
 */
export interface MetricsStore {
  record(dataPoint: MetricDataPoint): Promise<void>;
  query(name: string, labels?: Record<string, string>, since?: Date): Promise<MetricDataPoint[]>;
  aggregate(name: string, aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count', since: Date): Promise<number>;
}

/**
 * Trace store
 */
export interface TraceStore {
  startSpan(span: Omit<TraceSpan, 'context' | 'logs'>): Promise<TraceSpan>;
  endSpan(spanId: string, status: TraceStatus, error?: string): Promise<TraceSpan>;
  getTrace(traceId: string): Promise<Trace | null>;
  searchTraces(query: { service?: string; operation?: string; minDuration?: number; since?: Date }): Promise<Trace[]>;
}

/**
 * Alert store
 */
export interface AlertStore {
  createRule(rule: Omit<AlertRule, 'id'>): Promise<AlertRule>;
  getRule(id: string): Promise<AlertRule | null>;
  listRules(): Promise<AlertRule[]>;
  updateRule(id: string, updates: Partial<AlertRule>): Promise<AlertRule>;
  deleteRule(id: string): Promise<void>;

  fireAlert(ruleId: string, value: number, message: string): Promise<Alert>;
  resolveAlert(alertId: string): Promise<Alert>;
  acknowledgeAlert(alertId: string, userId: string): Promise<Alert>;
  getActiveAlerts(): Promise<Alert[]>;
}

// =============================================================================
// In-Memory Stores
// =============================================================================

/**
 * In-memory metrics store
 */
export class InMemoryMetricsStore implements MetricsStore {
  private dataPoints: MetricDataPoint[] = [];

  async record(dataPoint: MetricDataPoint): Promise<void> {
    this.dataPoints.push(dataPoint);

    // Keep only last 10000 points
    if (this.dataPoints.length > 10000) {
      this.dataPoints = this.dataPoints.slice(-10000);
    }
  }

  async query(
    name: string,
    labels?: Record<string, string>,
    since?: Date
  ): Promise<MetricDataPoint[]> {
    return this.dataPoints.filter((dp) => {
      if (dp.name !== name) return false;
      if (since && dp.timestamp < since) return false;
      if (labels) {
        for (const [key, value] of Object.entries(labels)) {
          if (dp.labels[key] !== value) return false;
        }
      }
      return true;
    });
  }

  async aggregate(
    name: string,
    aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count',
    since: Date
  ): Promise<number> {
    const points = await this.query(name, undefined, since);
    if (points.length === 0) return 0;

    const values = points.map((p) => p.value);

    switch (aggregation) {
      case 'sum':
        return values.reduce((a, b) => a + b, 0);
      case 'avg':
        return values.reduce((a, b) => a + b, 0) / values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      case 'count':
        return values.length;
    }
  }
}

/**
 * In-memory trace store
 */
export class InMemoryTraceStore implements TraceStore {
  private spans = new Map<string, TraceSpan>();
  private traces = new Map<string, Trace>();

  async startSpan(span: Omit<TraceSpan, 'context' | 'logs'>): Promise<TraceSpan> {
    const traceId = span.tags.traceId?.toString() || this.generateId();
    const spanId = this.generateId();
    const parentSpanId = span.tags.parentSpanId?.toString();

    const traceSpan: TraceSpan = {
      ...span,
      context: {
        traceId,
        spanId,
        parentSpanId,
        sampled: true,
      },
      logs: [],
    };

    this.spans.set(spanId, traceSpan);

    // Create or update trace
    let trace = this.traces.get(traceId);
    if (!trace) {
      trace = {
        traceId,
        rootSpan: traceSpan,
        spans: [traceSpan],
        durationMs: 0,
        service: span.service,
        status: 'ok',
        startTime: span.startTime,
      };
    } else {
      trace.spans.push(traceSpan);
      if (!parentSpanId) {
        trace.rootSpan = traceSpan;
      }
    }
    this.traces.set(traceId, trace);

    return traceSpan;
  }

  async endSpan(spanId: string, status: TraceStatus, error?: string): Promise<TraceSpan> {
    const span = this.spans.get(spanId);
    if (!span) {
      throw new Error(`Span ${spanId} not found`);
    }

    span.endTime = new Date();
    span.durationMs = span.endTime.getTime() - span.startTime.getTime();
    span.status = status;

    if (error) {
      span.logs.push({
        timestamp: new Date(),
        message: error,
        level: 'error',
      });
    }

    // Update trace
    const trace = this.traces.get(span.context.traceId);
    if (trace) {
      trace.endTime = span.endTime;
      trace.durationMs = Math.max(trace.durationMs, span.durationMs);
      if (status === 'error') {
        trace.status = 'error';
      }
    }

    return span;
  }

  async getTrace(traceId: string): Promise<Trace | null> {
    return this.traces.get(traceId) || null;
  }

  async searchTraces(query: {
    service?: string;
    operation?: string;
    minDuration?: number;
    since?: Date;
  }): Promise<Trace[]> {
    return Array.from(this.traces.values()).filter((trace) => {
      if (query.service && trace.service !== query.service) return false;
      if (query.operation && !trace.spans.some((s) => s.operation === query.operation)) return false;
      if (query.minDuration && trace.durationMs < query.minDuration) return false;
      if (query.since && trace.startTime < query.since) return false;
      return true;
    });
  }

  private generateId(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * In-memory alert store
 */
export class InMemoryAlertStore implements AlertStore {
  private rules = new Map<string, AlertRule>();
  private alerts = new Map<string, Alert>();
  private ruleCounter = 0;
  private alertCounter = 0;

  async createRule(rule: Omit<AlertRule, 'id'>): Promise<AlertRule> {
    const id = `rule_${++this.ruleCounter}`;
    const alertRule: AlertRule = { ...rule, id };
    this.rules.set(id, alertRule);
    return alertRule;
  }

  async getRule(id: string): Promise<AlertRule | null> {
    return this.rules.get(id) || null;
  }

  async listRules(): Promise<AlertRule[]> {
    return Array.from(this.rules.values());
  }

  async updateRule(id: string, updates: Partial<AlertRule>): Promise<AlertRule> {
    const rule = this.rules.get(id);
    if (!rule) throw new Error(`Rule ${id} not found`);
    const updated = { ...rule, ...updates, id };
    this.rules.set(id, updated);
    return updated;
  }

  async deleteRule(id: string): Promise<void> {
    if (!this.rules.has(id)) throw new Error(`Rule ${id} not found`);
    this.rules.delete(id);
  }

  async fireAlert(ruleId: string, value: number, message: string): Promise<Alert> {
    const rule = this.rules.get(ruleId);
    if (!rule) throw new Error(`Rule ${ruleId} not found`);

    const id = `alert_${++this.alertCounter}`;
    const alert: Alert = {
      id,
      ruleId,
      ruleName: rule.name,
      severity: rule.severity,
      status: 'firing',
      value,
      threshold: rule.threshold,
      message,
      labels: rule.labels,
      annotations: rule.annotations,
      startsAt: new Date(),
    };

    this.alerts.set(id, alert);
    return alert;
  }

  async resolveAlert(alertId: string): Promise<Alert> {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);

    alert.status = 'resolved';
    alert.endsAt = new Date();
    return alert;
  }

  async acknowledgeAlert(alertId: string, userId: string): Promise<Alert> {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);

    alert.acknowledgedBy = userId;
    alert.acknowledgedAt = new Date();
    return alert;
  }

  async getActiveAlerts(): Promise<Alert[]> {
    return Array.from(this.alerts.values()).filter(
      (a) => a.status === 'firing' || a.status === 'pending'
    );
  }
}

// =============================================================================
// Observability Manager
// =============================================================================

/**
 * Configuration for Observability Manager
 */
export interface ObservabilityConfig {
  serviceName: string;
  environment: string;
  version: string;
  sampleRate?: number;
  enableTracing?: boolean;
  enableMetrics?: boolean;
  enableAlerting?: boolean;
}

/**
 * Default observability config
 */
export const DEFAULT_OBSERVABILITY_CONFIG: ObservabilityConfig = {
  serviceName: 'gwi',
  environment: 'development',
  version: '1.0.0',
  sampleRate: 1.0,
  enableTracing: true,
  enableMetrics: true,
  enableAlerting: true,
};

/**
 * Observability Manager - manages metrics, traces, and alerts
 */
export class ObservabilityManager {
  private metricsStore: MetricsStore;
  private traceStore: TraceStore;
  private alertStore: AlertStore;
  private config: ObservabilityConfig;
  private slos = new Map<string, SLO>();
  private slis = new Map<string, SLI>();
  private dashboards = new Map<string, Dashboard>();
  private sloCounter = 0;
  private sliCounter = 0;
  private dashboardCounter = 0;

  constructor(
    metricsStore: MetricsStore,
    traceStore: TraceStore,
    alertStore: AlertStore,
    config: ObservabilityConfig = DEFAULT_OBSERVABILITY_CONFIG
  ) {
    this.metricsStore = metricsStore;
    this.traceStore = traceStore;
    this.alertStore = alertStore;
    this.config = { ...DEFAULT_OBSERVABILITY_CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // Metrics
  // -------------------------------------------------------------------------

  /**
   * Record a counter metric
   */
  async incrementCounter(
    name: string,
    labels: Record<string, string> = {},
    value: number = 1
  ): Promise<void> {
    if (!this.config.enableMetrics) return;

    await this.metricsStore.record({
      name,
      type: 'counter',
      value,
      labels: { ...labels, service: this.config.serviceName },
      timestamp: new Date(),
    });
  }

  /**
   * Record a gauge metric
   */
  async setGauge(name: string, value: number, labels: Record<string, string> = {}): Promise<void> {
    if (!this.config.enableMetrics) return;

    await this.metricsStore.record({
      name,
      type: 'gauge',
      value,
      labels: { ...labels, service: this.config.serviceName },
      timestamp: new Date(),
    });
  }

  /**
   * Record a histogram observation
   */
  async observeHistogram(
    name: string,
    value: number,
    labels: Record<string, string> = {}
  ): Promise<void> {
    if (!this.config.enableMetrics) return;

    await this.metricsStore.record({
      name,
      type: 'histogram',
      value,
      labels: { ...labels, service: this.config.serviceName },
      timestamp: new Date(),
    });
  }

  /**
   * Query metrics
   */
  async queryMetrics(
    name: string,
    labels?: Record<string, string>,
    since?: Date
  ): Promise<MetricDataPoint[]> {
    return this.metricsStore.query(name, labels, since);
  }

  // -------------------------------------------------------------------------
  // Tracing
  // -------------------------------------------------------------------------

  /**
   * Start a new trace span
   */
  async startSpan(
    name: string,
    operation: string,
    parentContext?: SpanContext,
    tags: Record<string, string | number | boolean> = {}
  ): Promise<TraceSpan> {
    if (!this.config.enableTracing) {
      // Return dummy span
      return {
        context: { traceId: 'disabled', spanId: 'disabled', sampled: false },
        name,
        service: this.config.serviceName,
        operation,
        startTime: new Date(),
        status: 'ok',
        tags: {},
        logs: [],
      };
    }

    // Check sample rate
    if (Math.random() > (this.config.sampleRate ?? 1.0)) {
      return {
        context: { traceId: 'unsampled', spanId: 'unsampled', sampled: false },
        name,
        service: this.config.serviceName,
        operation,
        startTime: new Date(),
        status: 'ok',
        tags: {},
        logs: [],
      };
    }

    return this.traceStore.startSpan({
      name,
      service: this.config.serviceName,
      operation,
      startTime: new Date(),
      status: 'ok',
      tags: {
        ...tags,
        environment: this.config.environment,
        version: this.config.version,
        ...(parentContext ? { traceId: parentContext.traceId, parentSpanId: parentContext.spanId } : {}),
      },
    });
  }

  /**
   * End a trace span
   */
  async endSpan(span: TraceSpan, status: TraceStatus = 'ok', error?: string): Promise<TraceSpan> {
    if (!span.context.sampled) return span;
    return this.traceStore.endSpan(span.context.spanId, status, error);
  }

  /**
   * Get a trace by ID
   */
  async getTrace(traceId: string): Promise<Trace | null> {
    return this.traceStore.getTrace(traceId);
  }

  /**
   * Search traces
   */
  async searchTraces(query: {
    service?: string;
    operation?: string;
    minDuration?: number;
    since?: Date;
  }): Promise<Trace[]> {
    return this.traceStore.searchTraces(query);
  }

  // -------------------------------------------------------------------------
  // Alerting
  // -------------------------------------------------------------------------

  /**
   * Create an alert rule
   */
  async createAlertRule(rule: Omit<AlertRule, 'id'>): Promise<AlertRule> {
    return this.alertStore.createRule(rule);
  }

  /**
   * Get alert rule
   */
  async getAlertRule(id: string): Promise<AlertRule | null> {
    return this.alertStore.getRule(id);
  }

  /**
   * List alert rules
   */
  async listAlertRules(): Promise<AlertRule[]> {
    return this.alertStore.listRules();
  }

  /**
   * Fire an alert
   */
  async fireAlert(ruleId: string, value: number, message: string): Promise<Alert> {
    return this.alertStore.fireAlert(ruleId, value, message);
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string): Promise<Alert> {
    return this.alertStore.resolveAlert(alertId);
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<Alert> {
    return this.alertStore.acknowledgeAlert(alertId, userId);
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(): Promise<Alert[]> {
    return this.alertStore.getActiveAlerts();
  }

  // -------------------------------------------------------------------------
  // SLI/SLO
  // -------------------------------------------------------------------------

  /**
   * Create an SLI
   */
  async createSLI(sli: Omit<SLI, 'id'>): Promise<SLI> {
    const id = `sli_${++this.sliCounter}`;
    const indicator: SLI = { ...sli, id };
    this.slis.set(id, indicator);
    return indicator;
  }

  /**
   * Create an SLO
   */
  async createSLO(slo: Omit<SLO, 'id' | 'createdAt'>): Promise<SLO> {
    const id = `slo_${++this.sloCounter}`;
    const objective: SLO = { ...slo, id, createdAt: new Date() };
    this.slos.set(id, objective);
    return objective;
  }

  /**
   * Get SLO status
   */
  async getSLOStatus(sloId: string): Promise<SLOStatus | null> {
    const slo = this.slos.get(sloId);
    if (!slo) return null;

    // Simplified calculation
    const current = 99.5; // Would be calculated from SLI
    const errorBudget = 100 - slo.target;
    const errorBudgetUsed = 100 - current;
    const errorBudgetRemaining = Math.max(0, errorBudget - errorBudgetUsed);
    const burnRate = errorBudgetUsed / errorBudget;

    let status: SLOStatus['status'];
    if (current >= slo.target) {
      status = 'met';
    } else if (errorBudgetRemaining > 0) {
      status = 'at_risk';
    } else {
      status = 'breached';
    }

    return {
      sloId,
      sloName: slo.name,
      target: slo.target,
      current,
      errorBudget,
      errorBudgetRemaining,
      burnRate,
      status,
      window: slo.window,
      calculatedAt: new Date(),
    };
  }

  /**
   * List SLOs
   */
  async listSLOs(): Promise<SLO[]> {
    return Array.from(this.slos.values());
  }

  // -------------------------------------------------------------------------
  // Dashboards
  // -------------------------------------------------------------------------

  /**
   * Create a dashboard
   */
  async createDashboard(dashboard: Omit<Dashboard, 'id' | 'createdAt' | 'updatedAt'>): Promise<Dashboard> {
    const id = `dashboard_${++this.dashboardCounter}`;
    const dash: Dashboard = {
      ...dashboard,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.dashboards.set(id, dash);
    return dash;
  }

  /**
   * Get dashboard
   */
  async getDashboard(id: string): Promise<Dashboard | null> {
    return this.dashboards.get(id) || null;
  }

  /**
   * List dashboards
   */
  async listDashboards(): Promise<Dashboard[]> {
    return Array.from(this.dashboards.values());
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an Observability Manager with in-memory stores
 */
export function createObservabilityManager(
  config: Partial<ObservabilityConfig> = {}
): ObservabilityManager {
  return new ObservabilityManager(
    new InMemoryMetricsStore(),
    new InMemoryTraceStore(),
    new InMemoryAlertStore(),
    { ...DEFAULT_OBSERVABILITY_CONFIG, ...config }
  );
}

/**
 * Create metrics store
 */
export function createMetricsStore(): InMemoryMetricsStore {
  return new InMemoryMetricsStore();
}

/**
 * Create trace store
 */
export function createTraceStore(): InMemoryTraceStore {
  return new InMemoryTraceStore();
}

/**
 * Create alert store
 */
export function createAlertStore(): InMemoryAlertStore {
  return new InMemoryAlertStore();
}
