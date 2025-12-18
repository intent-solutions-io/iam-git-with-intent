/**
 * Metrics Module
 *
 * Phase 23: Production Observability
 *
 * Provides application metrics infrastructure:
 * - Counter, Gauge, Histogram types
 * - Cloud Monitoring compatible format
 * - SLO tracking (latency, availability)
 * - Pre-defined operational metrics
 *
 * @module @gwi/core/telemetry/metrics
 */

import { getCurrentContext } from './context.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Metric labels (dimensions)
 */
export type MetricLabels = Record<string, string>;

/**
 * Metric types
 */
export type MetricType = 'counter' | 'gauge' | 'histogram';

/**
 * Histogram bucket configuration
 */
export interface HistogramBuckets {
  /** Bucket boundaries in ascending order */
  boundaries: number[];
}

/**
 * Metric definition
 */
export interface MetricDefinition {
  /** Metric name */
  name: string;
  /** Description */
  description: string;
  /** Metric type */
  type: MetricType;
  /** Unit (e.g., 'ms', 'bytes', '1') */
  unit: string;
  /** Label keys */
  labelKeys: string[];
  /** Histogram buckets (if type is histogram) */
  buckets?: HistogramBuckets;
}

/**
 * Metric value snapshot
 */
export interface MetricSnapshot {
  name: string;
  type: MetricType;
  value: number;
  labels: MetricLabels;
  timestamp: Date;
  buckets?: { boundary: number; count: number }[];
}

// =============================================================================
// Counter
// =============================================================================

/**
 * Counter metric (monotonically increasing)
 */
export class Counter {
  private value = 0;
  private labelValues: Map<string, number> = new Map();

  constructor(
    readonly name: string,
    readonly description: string,
    readonly labelKeys: string[] = []
  ) {}

  /**
   * Increment counter by 1
   */
  inc(labels?: MetricLabels): void {
    this.add(1, labels);
  }

  /**
   * Add value to counter
   */
  add(value: number, labels?: MetricLabels): void {
    if (value < 0) {
      throw new Error('Counter can only be incremented');
    }

    const key = this.getKey(labels);
    const current = this.labelValues.get(key) ?? 0;
    this.labelValues.set(key, current + value);
    this.value += value;
  }

  /**
   * Get current value
   */
  get(labels?: MetricLabels): number {
    if (labels) {
      return this.labelValues.get(this.getKey(labels)) ?? 0;
    }
    return this.value;
  }

  /**
   * Get all snapshots
   */
  getSnapshots(): MetricSnapshot[] {
    const snapshots: MetricSnapshot[] = [];
    const now = new Date();

    for (const [key, value] of this.labelValues) {
      const labels = this.parseKey(key);
      snapshots.push({
        name: this.name,
        type: 'counter',
        value,
        labels,
        timestamp: now,
      });
    }

    return snapshots;
  }

  private getKey(labels?: MetricLabels): string {
    if (!labels) return '';
    return this.labelKeys.map((k) => labels[k] ?? '').join('|');
  }

  private parseKey(key: string): MetricLabels {
    const values = key.split('|');
    const labels: MetricLabels = {};
    this.labelKeys.forEach((k, i) => {
      labels[k] = values[i] ?? '';
    });
    return labels;
  }
}

// =============================================================================
// Gauge
// =============================================================================

/**
 * Gauge metric (can go up or down)
 */
export class Gauge {
  private value = 0;
  private labelValues: Map<string, number> = new Map();

  constructor(
    readonly name: string,
    readonly description: string,
    readonly labelKeys: string[] = []
  ) {}

  /**
   * Set gauge value
   */
  set(value: number, labels?: MetricLabels): void {
    const key = this.getKey(labels);
    this.labelValues.set(key, value);
    this.value = value;
  }

  /**
   * Increment gauge
   */
  inc(labels?: MetricLabels): void {
    this.add(1, labels);
  }

  /**
   * Decrement gauge
   */
  dec(labels?: MetricLabels): void {
    this.add(-1, labels);
  }

  /**
   * Add value to gauge
   */
  add(value: number, labels?: MetricLabels): void {
    const key = this.getKey(labels);
    const current = this.labelValues.get(key) ?? 0;
    this.labelValues.set(key, current + value);
    this.value = current + value;
  }

  /**
   * Get current value
   */
  get(labels?: MetricLabels): number {
    if (labels) {
      return this.labelValues.get(this.getKey(labels)) ?? 0;
    }
    return this.value;
  }

  /**
   * Get all snapshots
   */
  getSnapshots(): MetricSnapshot[] {
    const snapshots: MetricSnapshot[] = [];
    const now = new Date();

    for (const [key, value] of this.labelValues) {
      const labels = this.parseKey(key);
      snapshots.push({
        name: this.name,
        type: 'gauge',
        value,
        labels,
        timestamp: now,
      });
    }

    return snapshots;
  }

  private getKey(labels?: MetricLabels): string {
    if (!labels) return '';
    return this.labelKeys.map((k) => labels[k] ?? '').join('|');
  }

  private parseKey(key: string): MetricLabels {
    const values = key.split('|');
    const labels: MetricLabels = {};
    this.labelKeys.forEach((k, i) => {
      labels[k] = values[i] ?? '';
    });
    return labels;
  }
}

// =============================================================================
// Histogram
// =============================================================================

/**
 * Default latency buckets (in milliseconds)
 */
export const DEFAULT_LATENCY_BUCKETS: HistogramBuckets = {
  boundaries: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
};

/**
 * Default size buckets (in bytes)
 */
export const DEFAULT_SIZE_BUCKETS: HistogramBuckets = {
  boundaries: [100, 1000, 10000, 100000, 1000000, 10000000],
};

/**
 * Histogram metric (for distributions)
 */
export class Histogram {
  private buckets: HistogramBuckets;
  private labelBuckets: Map<string, { counts: number[]; sum: number; count: number }> = new Map();

  constructor(
    readonly name: string,
    readonly description: string,
    readonly labelKeys: string[] = [],
    buckets?: HistogramBuckets
  ) {
    this.buckets = buckets ?? DEFAULT_LATENCY_BUCKETS;
  }

  /**
   * Observe a value
   */
  observe(value: number, labels?: MetricLabels): void {
    const key = this.getKey(labels);
    let data = this.labelBuckets.get(key);

    if (!data) {
      data = {
        counts: new Array(this.buckets.boundaries.length + 1).fill(0),
        sum: 0,
        count: 0,
      };
      this.labelBuckets.set(key, data);
    }

    // Find bucket and increment
    let bucketIndex = this.buckets.boundaries.length;
    for (let i = 0; i < this.buckets.boundaries.length; i++) {
      if (value <= this.buckets.boundaries[i]) {
        bucketIndex = i;
        break;
      }
    }

    data.counts[bucketIndex]++;
    data.sum += value;
    data.count++;
  }

  /**
   * Start a timer that returns duration when stopped
   */
  startTimer(labels?: MetricLabels): () => number {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.observe(duration, labels);
      return duration;
    };
  }

  /**
   * Get percentile value (approximate)
   */
  getPercentile(percentile: number, labels?: MetricLabels): number | undefined {
    const key = this.getKey(labels);
    const data = this.labelBuckets.get(key);
    if (!data || data.count === 0) return undefined;

    const targetCount = (percentile / 100) * data.count;
    let cumulativeCount = 0;

    for (let i = 0; i < data.counts.length; i++) {
      cumulativeCount += data.counts[i];
      if (cumulativeCount >= targetCount) {
        if (i === 0) return this.buckets.boundaries[0] / 2;
        if (i >= this.buckets.boundaries.length) return this.buckets.boundaries[this.buckets.boundaries.length - 1];
        return (this.buckets.boundaries[i - 1] + this.buckets.boundaries[i]) / 2;
      }
    }

    return undefined;
  }

  /**
   * Get all snapshots
   */
  getSnapshots(): MetricSnapshot[] {
    const snapshots: MetricSnapshot[] = [];
    const now = new Date();

    for (const [key, data] of this.labelBuckets) {
      const labels = this.parseKey(key);
      const buckets = this.buckets.boundaries.map((boundary, i) => ({
        boundary,
        count: data.counts[i],
      }));

      snapshots.push({
        name: this.name,
        type: 'histogram',
        value: data.sum / data.count, // Average
        labels: { ...labels, stat: 'avg' },
        timestamp: now,
        buckets,
      });

      // Also emit count and sum
      snapshots.push({
        name: `${this.name}_count`,
        type: 'counter',
        value: data.count,
        labels,
        timestamp: now,
      });

      snapshots.push({
        name: `${this.name}_sum`,
        type: 'counter',
        value: data.sum,
        labels,
        timestamp: now,
      });
    }

    return snapshots;
  }

  private getKey(labels?: MetricLabels): string {
    if (!labels) return '';
    return this.labelKeys.map((k) => labels[k] ?? '').join('|');
  }

  private parseKey(key: string): MetricLabels {
    const values = key.split('|');
    const labels: MetricLabels = {};
    this.labelKeys.forEach((k, i) => {
      labels[k] = values[i] ?? '';
    });
    return labels;
  }
}

// =============================================================================
// Metrics Registry
// =============================================================================

/**
 * Metrics registry for collecting all metrics
 */
export class MetricsRegistry {
  private metrics: Map<string, Counter | Gauge | Histogram> = new Map();

  /**
   * Create or get a counter
   */
  counter(name: string, description: string, labelKeys: string[] = []): Counter {
    const existing = this.metrics.get(name);
    if (existing) {
      if (!(existing instanceof Counter)) {
        throw new Error(`Metric ${name} already registered as ${existing.constructor.name}`);
      }
      return existing;
    }

    const counter = new Counter(name, description, labelKeys);
    this.metrics.set(name, counter);
    return counter;
  }

  /**
   * Create or get a gauge
   */
  gauge(name: string, description: string, labelKeys: string[] = []): Gauge {
    const existing = this.metrics.get(name);
    if (existing) {
      if (!(existing instanceof Gauge)) {
        throw new Error(`Metric ${name} already registered as ${existing.constructor.name}`);
      }
      return existing;
    }

    const gauge = new Gauge(name, description, labelKeys);
    this.metrics.set(name, gauge);
    return gauge;
  }

  /**
   * Create or get a histogram
   */
  histogram(
    name: string,
    description: string,
    labelKeys: string[] = [],
    buckets?: HistogramBuckets
  ): Histogram {
    const existing = this.metrics.get(name);
    if (existing) {
      if (!(existing instanceof Histogram)) {
        throw new Error(`Metric ${name} already registered as ${existing.constructor.name}`);
      }
      return existing;
    }

    const histogram = new Histogram(name, description, labelKeys, buckets);
    this.metrics.set(name, histogram);
    return histogram;
  }

  /**
   * Get all metric snapshots
   */
  getAllSnapshots(): MetricSnapshot[] {
    const snapshots: MetricSnapshot[] = [];

    for (const metric of this.metrics.values()) {
      snapshots.push(...metric.getSnapshots());
    }

    return snapshots;
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheus(): string {
    const lines: string[] = [];

    for (const metric of this.metrics.values()) {
      lines.push(`# HELP ${metric.name} ${metric.description}`);

      if (metric instanceof Counter) {
        lines.push(`# TYPE ${metric.name} counter`);
      } else if (metric instanceof Gauge) {
        lines.push(`# TYPE ${metric.name} gauge`);
      } else if (metric instanceof Histogram) {
        lines.push(`# TYPE ${metric.name} histogram`);
      }

      for (const snapshot of metric.getSnapshots()) {
        const labelStr = Object.entries(snapshot.labels)
          .filter(([, v]) => v !== '')
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');

        const metricName = labelStr ? `${snapshot.name}{${labelStr}}` : snapshot.name;
        lines.push(`${metricName} ${snapshot.value}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }
}

// =============================================================================
// Default Registry and Pre-defined Metrics
// =============================================================================

let defaultRegistry: MetricsRegistry | null = null;

/**
 * Get the default metrics registry
 */
export function getMetricsRegistry(): MetricsRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new MetricsRegistry();
  }
  return defaultRegistry;
}

/**
 * Set a custom default registry
 */
export function setMetricsRegistry(registry: MetricsRegistry): void {
  defaultRegistry = registry;
}

// =============================================================================
// Pre-defined GWI Metrics
// =============================================================================

/**
 * GWI operational metrics
 */
export interface GWIMetrics {
  // Request metrics
  httpRequestsTotal: Counter;
  httpRequestDuration: Histogram;
  httpRequestSize: Histogram;
  httpResponseSize: Histogram;

  // Run metrics
  runsStarted: Counter;
  runsCompleted: Counter;
  runsFailed: Counter;
  runDuration: Histogram;
  runsActive: Gauge;

  // Agent metrics
  agentInvocations: Counter;
  agentDuration: Histogram;
  agentTokensUsed: Counter;
  agentErrors: Counter;

  // Queue metrics
  queueMessagesPublished: Counter;
  queueMessagesConsumed: Counter;
  queueMessagesDLQ: Counter;
  queueProcessingDuration: Histogram;

  // Webhook metrics
  webhooksReceived: Counter;
  webhooksProcessed: Counter;
  webhooksFailed: Counter;
  webhookDuration: Histogram;

  // Storage metrics
  storageOperations: Counter;
  storageDuration: Histogram;
  storageErrors: Counter;

  // Connector metrics
  connectorInvocations: Counter;
  connectorDuration: Histogram;
  connectorErrors: Counter;

  // Plan limit metrics
  planLimitChecks: Counter;
  planLimitExceeded: Counter;
}

let gwiMetrics: GWIMetrics | null = null;

/**
 * Get pre-defined GWI metrics
 */
export function getGWIMetrics(): GWIMetrics {
  if (gwiMetrics) return gwiMetrics;

  const registry = getMetricsRegistry();

  gwiMetrics = {
    // Request metrics
    httpRequestsTotal: registry.counter(
      'gwi_http_requests_total',
      'Total HTTP requests',
      ['method', 'path', 'status']
    ),
    httpRequestDuration: registry.histogram(
      'gwi_http_request_duration_ms',
      'HTTP request duration in milliseconds',
      ['method', 'path']
    ),
    httpRequestSize: registry.histogram(
      'gwi_http_request_size_bytes',
      'HTTP request body size',
      ['method', 'path'],
      DEFAULT_SIZE_BUCKETS
    ),
    httpResponseSize: registry.histogram(
      'gwi_http_response_size_bytes',
      'HTTP response body size',
      ['method', 'path'],
      DEFAULT_SIZE_BUCKETS
    ),

    // Run metrics
    runsStarted: registry.counter(
      'gwi_runs_started_total',
      'Total runs started',
      ['tenant_id', 'workflow_type']
    ),
    runsCompleted: registry.counter(
      'gwi_runs_completed_total',
      'Total runs completed successfully',
      ['tenant_id', 'workflow_type']
    ),
    runsFailed: registry.counter(
      'gwi_runs_failed_total',
      'Total runs failed',
      ['tenant_id', 'workflow_type', 'error_type']
    ),
    runDuration: registry.histogram(
      'gwi_run_duration_ms',
      'Run duration in milliseconds',
      ['tenant_id', 'workflow_type']
    ),
    runsActive: registry.gauge(
      'gwi_runs_active',
      'Currently active runs',
      ['tenant_id']
    ),

    // Agent metrics
    agentInvocations: registry.counter(
      'gwi_agent_invocations_total',
      'Total agent invocations',
      ['agent_type', 'model']
    ),
    agentDuration: registry.histogram(
      'gwi_agent_duration_ms',
      'Agent invocation duration',
      ['agent_type', 'model']
    ),
    agentTokensUsed: registry.counter(
      'gwi_agent_tokens_total',
      'Total tokens used by agents',
      ['agent_type', 'model', 'token_type']
    ),
    agentErrors: registry.counter(
      'gwi_agent_errors_total',
      'Agent errors',
      ['agent_type', 'error_type']
    ),

    // Queue metrics
    queueMessagesPublished: registry.counter(
      'gwi_queue_messages_published_total',
      'Messages published to queue',
      ['topic']
    ),
    queueMessagesConsumed: registry.counter(
      'gwi_queue_messages_consumed_total',
      'Messages consumed from queue',
      ['topic']
    ),
    queueMessagesDLQ: registry.counter(
      'gwi_queue_messages_dlq_total',
      'Messages sent to DLQ',
      ['topic', 'reason']
    ),
    queueProcessingDuration: registry.histogram(
      'gwi_queue_processing_duration_ms',
      'Queue message processing duration',
      ['topic']
    ),

    // Webhook metrics
    webhooksReceived: registry.counter(
      'gwi_webhooks_received_total',
      'Webhooks received',
      ['event_type']
    ),
    webhooksProcessed: registry.counter(
      'gwi_webhooks_processed_total',
      'Webhooks processed successfully',
      ['event_type']
    ),
    webhooksFailed: registry.counter(
      'gwi_webhooks_failed_total',
      'Webhooks failed',
      ['event_type', 'error_type']
    ),
    webhookDuration: registry.histogram(
      'gwi_webhook_duration_ms',
      'Webhook processing duration',
      ['event_type']
    ),

    // Storage metrics
    storageOperations: registry.counter(
      'gwi_storage_operations_total',
      'Storage operations',
      ['operation', 'collection']
    ),
    storageDuration: registry.histogram(
      'gwi_storage_duration_ms',
      'Storage operation duration',
      ['operation', 'collection']
    ),
    storageErrors: registry.counter(
      'gwi_storage_errors_total',
      'Storage errors',
      ['operation', 'collection', 'error_type']
    ),

    // Connector metrics
    connectorInvocations: registry.counter(
      'gwi_connector_invocations_total',
      'Connector invocations',
      ['connector_id', 'tool']
    ),
    connectorDuration: registry.histogram(
      'gwi_connector_duration_ms',
      'Connector invocation duration',
      ['connector_id', 'tool']
    ),
    connectorErrors: registry.counter(
      'gwi_connector_errors_total',
      'Connector errors',
      ['connector_id', 'tool', 'error_type']
    ),

    // Plan limit metrics
    planLimitChecks: registry.counter(
      'gwi_plan_limit_checks_total',
      'Plan limit checks',
      ['resource', 'plan']
    ),
    planLimitExceeded: registry.counter(
      'gwi_plan_limit_exceeded_total',
      'Plan limits exceeded',
      ['resource', 'plan']
    ),
  };

  return gwiMetrics;
}

// =============================================================================
// SLO Definitions
// =============================================================================

/**
 * SLO definition
 */
export interface SLODefinition {
  /** SLO name */
  name: string;
  /** Description */
  description: string;
  /** Target (0.0 - 1.0) */
  target: number;
  /** Window in hours */
  windowHours: number;
  /** Metric to evaluate */
  metric: string;
  /** Evaluation type */
  type: 'availability' | 'latency' | 'error_rate';
  /** Threshold (for latency SLOs) */
  threshold?: number;
}

/**
 * Pre-defined GWI SLOs
 */
export const GWI_SLOS: SLODefinition[] = [
  {
    name: 'api_availability',
    description: 'API availability (non-5xx responses)',
    target: 0.999, // 99.9%
    windowHours: 720, // 30 days
    metric: 'gwi_http_requests_total',
    type: 'availability',
  },
  {
    name: 'api_latency_p95',
    description: 'API latency P95 under 500ms',
    target: 0.95, // 95% of requests
    windowHours: 24, // 24 hours
    metric: 'gwi_http_request_duration_ms',
    type: 'latency',
    threshold: 500,
  },
  {
    name: 'api_latency_p99',
    description: 'API latency P99 under 2000ms',
    target: 0.99, // 99% of requests
    windowHours: 24, // 24 hours
    metric: 'gwi_http_request_duration_ms',
    type: 'latency',
    threshold: 2000,
  },
  {
    name: 'run_success_rate',
    description: 'Run success rate',
    target: 0.95, // 95%
    windowHours: 168, // 7 days
    metric: 'gwi_runs_completed_total',
    type: 'availability',
  },
  {
    name: 'webhook_processing_success',
    description: 'Webhook processing success rate',
    target: 0.999, // 99.9%
    windowHours: 24, // 24 hours
    metric: 'gwi_webhooks_processed_total',
    type: 'availability',
  },
  {
    name: 'agent_latency_p95',
    description: 'Agent invocation P95 under 30s',
    target: 0.95, // 95%
    windowHours: 24, // 24 hours
    metric: 'gwi_agent_duration_ms',
    type: 'latency',
    threshold: 30000,
  },
];

// =============================================================================
// Metrics Middleware Helper
// =============================================================================

/**
 * Record HTTP request metrics
 */
export function recordHttpMetrics(
  method: string,
  path: string,
  status: number,
  durationMs: number,
  requestSize?: number,
  responseSize?: number
): void {
  const metrics = getGWIMetrics();

  metrics.httpRequestsTotal.inc({ method, path, status: String(status) });
  metrics.httpRequestDuration.observe(durationMs, { method, path });

  if (requestSize !== undefined) {
    metrics.httpRequestSize.observe(requestSize, { method, path });
  }
  if (responseSize !== undefined) {
    metrics.httpResponseSize.observe(responseSize, { method, path });
  }
}

/**
 * Record run metrics
 */
export function recordRunMetrics(
  event: 'started' | 'completed' | 'failed',
  workflowType: string,
  durationMs?: number,
  errorType?: string
): void {
  const metrics = getGWIMetrics();
  const ctx = getCurrentContext();
  const tenantId = ctx?.tenantId ?? 'unknown';

  switch (event) {
    case 'started':
      metrics.runsStarted.inc({ tenant_id: tenantId, workflow_type: workflowType });
      metrics.runsActive.inc({ tenant_id: tenantId });
      break;
    case 'completed':
      metrics.runsCompleted.inc({ tenant_id: tenantId, workflow_type: workflowType });
      metrics.runsActive.dec({ tenant_id: tenantId });
      if (durationMs !== undefined) {
        metrics.runDuration.observe(durationMs, { tenant_id: tenantId, workflow_type: workflowType });
      }
      break;
    case 'failed':
      metrics.runsFailed.inc({
        tenant_id: tenantId,
        workflow_type: workflowType,
        error_type: errorType ?? 'unknown',
      });
      metrics.runsActive.dec({ tenant_id: tenantId });
      if (durationMs !== undefined) {
        metrics.runDuration.observe(durationMs, { tenant_id: tenantId, workflow_type: workflowType });
      }
      break;
  }
}

/**
 * Record agent metrics
 */
export function recordAgentMetrics(
  agentType: string,
  model: string,
  durationMs: number,
  inputTokens?: number,
  outputTokens?: number,
  error?: string
): void {
  const metrics = getGWIMetrics();

  metrics.agentInvocations.inc({ agent_type: agentType, model });
  metrics.agentDuration.observe(durationMs, { agent_type: agentType, model });

  if (inputTokens !== undefined) {
    metrics.agentTokensUsed.add(inputTokens, { agent_type: agentType, model, token_type: 'input' });
  }
  if (outputTokens !== undefined) {
    metrics.agentTokensUsed.add(outputTokens, { agent_type: agentType, model, token_type: 'output' });
  }
  if (error) {
    metrics.agentErrors.inc({ agent_type: agentType, error_type: error });
  }
}
