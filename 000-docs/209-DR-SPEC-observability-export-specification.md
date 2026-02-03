# Observability Export Specification

> **Document**: 209-DR-SPEC-observability-export-specification
> **Epic**: EPIC 015 - Observability Export + AI Workload Performance Tuning
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Specification for exporting GWI metrics to external observability platforms. Supports Prometheus, Datadog, and OpenTelemetry standards.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    GWI OBSERVABILITY EXPORT                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │   API       │    │  Gateway    │    │   Worker    │                  │
│  │  Service    │    │  Service    │    │  Service    │                  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                  │
│         │                  │                  │                          │
│         └────────────┬─────┴─────┬────────────┘                          │
│                      │           │                                       │
│         ┌────────────▼───────────▼────────────┐                         │
│         │      Internal Metrics Registry       │                         │
│         │  - Counters, Gauges, Histograms     │                         │
│         │  - AI/Agent specific metrics        │                         │
│         └────────────────┬─────────────────────┘                         │
│                          │                                               │
│    ┌─────────────────────┼──────────────────────┐                       │
│    │                     │                      │                       │
│    ▼                     ▼                      ▼                       │
│ ┌──────────┐      ┌──────────────┐      ┌───────────────┐              │
│ │Prometheus│      │   Datadog    │      │ OpenTelemetry │              │
│ │ Exporter │      │   Exporter   │      │   Exporter    │              │
│ │ /metrics │      │   DogStatsD  │      │    OTLP       │              │
│ └────┬─────┘      └──────┬───────┘      └───────┬───────┘              │
│      │                   │                      │                       │
└──────┼───────────────────┼──────────────────────┼───────────────────────┘
       │                   │                      │
       ▼                   ▼                      ▼
  ┌─────────┐        ┌──────────┐         ┌────────────┐
  │Prometheus│       │ Datadog  │         │   OTLP     │
  │  Server  │       │  Agent   │         │ Collector  │
  └─────────┘        └──────────┘         └────────────┘
```

---

## Prometheus Export

### Endpoint Configuration

```typescript
// packages/core/src/telemetry/exporters/prometheus.ts

import { MetricsRegistry, getMetricsRegistry } from '../metrics.js';

/**
 * Prometheus exporter options
 */
export interface PrometheusExporterOptions {
  /** Path for metrics endpoint (default: /metrics) */
  path?: string;
  /** Include default Node.js metrics */
  includeDefaultMetrics?: boolean;
  /** Prefix for all metric names */
  prefix?: string;
  /** Additional labels for all metrics */
  defaultLabels?: Record<string, string>;
}

/**
 * Express middleware for Prometheus metrics
 */
export function prometheusMiddleware(options: PrometheusExporterOptions = {}) {
  const { path = '/metrics', prefix = 'gwi_' } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path !== path) {
      return next();
    }

    const registry = getMetricsRegistry();
    const output = registry.exportPrometheus();

    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(output);
  };
}
```

### Metric Naming Convention

| GWI Metric | Prometheus Name | Type |
|------------|-----------------|------|
| `httpRequestsTotal` | `gwi_http_requests_total` | counter |
| `httpRequestDuration` | `gwi_http_request_duration_ms` | histogram |
| `agentInvocations` | `gwi_agent_invocations_total` | counter |
| `agentDuration` | `gwi_agent_duration_ms` | histogram |
| `agentTokensUsed` | `gwi_agent_tokens_total` | counter |
| `runsStarted` | `gwi_runs_started_total` | counter |
| `runsCompleted` | `gwi_runs_completed_total` | counter |
| `runsFailed` | `gwi_runs_failed_total` | counter |
| `runDuration` | `gwi_run_duration_ms` | histogram |

### Scrape Configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'gwi-api'
    scrape_interval: 15s
    static_configs:
      - targets: ['gwi-api:8080']
    metrics_path: /metrics
    scheme: https
    tls_config:
      insecure_skip_verify: false

  - job_name: 'gwi-gateway'
    scrape_interval: 15s
    static_configs:
      - targets: ['gwi-gateway:8080']
    metrics_path: /metrics

  - job_name: 'gwi-worker'
    scrape_interval: 15s
    static_configs:
      - targets: ['gwi-worker:8080']
    metrics_path: /metrics
```

### Cloud Run Scraping

For Cloud Run services, use push-based metrics via the OpenMetrics endpoint:

```yaml
# Cloud Run service.yaml
spec:
  template:
    metadata:
      annotations:
        run.googleapis.com/startup-cpu-boost: "true"
    spec:
      containers:
        - name: gwi-api
          ports:
            - containerPort: 8080
          env:
            - name: METRICS_ENABLED
              value: "true"
            - name: METRICS_PATH
              value: "/metrics"
```

---

## Datadog Export

### DogStatsD Configuration

```typescript
// packages/core/src/telemetry/exporters/datadog.ts

import StatsD from 'hot-shots';

export interface DatadogExporterOptions {
  /** DogStatsD host (default: localhost) */
  host?: string;
  /** DogStatsD port (default: 8125) */
  port?: number;
  /** Global tags for all metrics */
  globalTags?: string[];
  /** Metric prefix */
  prefix?: string;
  /** Enable buffering */
  bufferFlushInterval?: number;
}

export class DatadogExporter {
  private client: StatsD;

  constructor(options: DatadogExporterOptions = {}) {
    this.client = new StatsD({
      host: options.host ?? process.env.DD_AGENT_HOST ?? 'localhost',
      port: options.port ?? 8125,
      prefix: options.prefix ?? 'gwi.',
      globalTags: [
        `env:${process.env.GWI_ENV ?? 'development'}`,
        `service:gwi`,
        `version:${process.env.GWI_VERSION ?? 'unknown'}`,
        ...(options.globalTags ?? []),
      ],
      bufferFlushInterval: options.bufferFlushInterval ?? 1000,
    });
  }

  increment(name: string, value: number = 1, tags?: string[]): void {
    this.client.increment(name, value, tags);
  }

  gauge(name: string, value: number, tags?: string[]): void {
    this.client.gauge(name, value, tags);
  }

  histogram(name: string, value: number, tags?: string[]): void {
    this.client.histogram(name, value, tags);
  }

  distribution(name: string, value: number, tags?: string[]): void {
    this.client.distribution(name, value, tags);
  }

  timing(name: string, value: number, tags?: string[]): void {
    this.client.timing(name, value, tags);
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.client.close(() => resolve());
    });
  }
}
```

### Datadog Agent Configuration

```yaml
# datadog.yaml
api_key: ${DD_API_KEY}
site: datadoghq.com

logs_enabled: true
apm_config:
  enabled: true
  apm_non_local_traffic: true

dogstatsd_port: 8125
dogstatsd_non_local_traffic: true

process_config:
  enabled: true

# GWI-specific tags
tags:
  - service:gwi
  - team:engineering
```

### Metric Mapping

| GWI Metric | Datadog Metric | Type |
|------------|----------------|------|
| `httpRequestsTotal` | `gwi.http.requests` | count |
| `httpRequestDuration` | `gwi.http.request.duration` | distribution |
| `agentInvocations` | `gwi.agent.invocations` | count |
| `agentDuration` | `gwi.agent.duration` | distribution |
| `agentTokensUsed` | `gwi.agent.tokens` | count |
| `runsStarted` | `gwi.runs.started` | count |
| `runDuration` | `gwi.runs.duration` | distribution |

### Datadog Integration

```typescript
// Environment variables for Datadog
export const DATADOG_CONFIG = {
  DD_AGENT_HOST: process.env.DD_AGENT_HOST ?? 'localhost',
  DD_TRACE_AGENT_PORT: process.env.DD_TRACE_AGENT_PORT ?? '8126',
  DD_DOGSTATSD_PORT: process.env.DD_DOGSTATSD_PORT ?? '8125',
  DD_SERVICE: 'gwi',
  DD_ENV: process.env.GWI_ENV ?? 'development',
  DD_VERSION: process.env.GWI_VERSION ?? '0.6.0',
  DD_TRACE_SAMPLE_RATE: process.env.DD_TRACE_SAMPLE_RATE ?? '1.0',
  DD_LOGS_INJECTION: 'true',
  DD_RUNTIME_METRICS_ENABLED: 'true',
};
```

---

## OpenTelemetry Export

### OTLP Configuration

```typescript
// packages/core/src/telemetry/exporters/otel.ts

import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import {
  NodeTracerProvider,
  BatchSpanProcessor,
} from '@opentelemetry/sdk-trace-node';

export interface OTelExporterOptions {
  /** OTLP endpoint URL */
  endpoint?: string;
  /** Service name */
  serviceName?: string;
  /** Service version */
  serviceVersion?: string;
  /** Export interval in ms */
  exportInterval?: number;
  /** Additional resource attributes */
  resourceAttributes?: Record<string, string>;
}

export function initializeOTel(options: OTelExporterOptions = {}): void {
  const {
    endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318',
    serviceName = 'gwi',
    serviceVersion = process.env.GWI_VERSION ?? '0.6.0',
    exportInterval = 60000,
    resourceAttributes = {},
  } = options;

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.GWI_ENV ?? 'development',
    ...resourceAttributes,
  });

  // Traces
  const traceExporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
  });

  const tracerProvider = new NodeTracerProvider({ resource });
  tracerProvider.addSpanProcessor(new BatchSpanProcessor(traceExporter));
  tracerProvider.register();

  // Metrics
  const metricExporter = new OTLPMetricExporter({
    url: `${endpoint}/v1/metrics`,
  });

  const meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: exportInterval,
      }),
    ],
  });

  // Register globally
  metrics.setGlobalMeterProvider(meterProvider);
}
```

### Trace Context Propagation

```typescript
// packages/core/src/telemetry/trace-propagation.ts

import { context, trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';

/**
 * Create a traced function wrapper
 */
export function traced<T extends (...args: any[]) => any>(
  name: string,
  fn: T,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
  }
): T {
  const tracer = trace.getTracer('gwi');

  return ((...args: Parameters<T>): ReturnType<T> => {
    return tracer.startActiveSpan(
      name,
      { kind: options?.kind ?? SpanKind.INTERNAL },
      (span) => {
        if (options?.attributes) {
          span.setAttributes(options.attributes);
        }

        try {
          const result = fn(...args);

          if (result instanceof Promise) {
            return result
              .then((value) => {
                span.setStatus({ code: SpanStatusCode.OK });
                span.end();
                return value;
              })
              .catch((error) => {
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error.message,
                });
                span.recordException(error);
                span.end();
                throw error;
              }) as ReturnType<T>;
          }

          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return result;
        } catch (error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (error as Error).message,
          });
          span.recordException(error as Error);
          span.end();
          throw error;
        }
      }
    );
  }) as T;
}
```

### Collector Configuration

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 10s
    send_batch_size: 1024

  memory_limiter:
    check_interval: 1s
    limit_mib: 1000
    spike_limit_mib: 200

  attributes:
    actions:
      - key: service.name
        value: gwi
        action: upsert

exporters:
  # Export to multiple backends
  prometheus:
    endpoint: "0.0.0.0:8889"
    namespace: gwi

  datadog:
    api:
      key: ${DD_API_KEY}
      site: datadoghq.com

  googlecloud:
    project: ${GCP_PROJECT_ID}
    metric:
      prefix: custom.googleapis.com/gwi

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [datadog, googlecloud]

    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus, datadog, googlecloud]
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GWI_METRICS_ENABLED` | `true` | Enable metrics collection |
| `GWI_METRICS_EXPORTER` | `prometheus` | Exporter type (prometheus, datadog, otel) |
| `GWI_METRICS_ENDPOINT` | `/metrics` | Prometheus endpoint path |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP collector endpoint |
| `DD_AGENT_HOST` | `localhost` | Datadog agent host |
| `DD_DOGSTATSD_PORT` | `8125` | DogStatsD port |
| `DD_API_KEY` | - | Datadog API key |

---

## Exporter Selection

```typescript
// packages/core/src/telemetry/exporter-factory.ts

export type ExporterType = 'prometheus' | 'datadog' | 'otel' | 'none';

export function createExporter(type: ExporterType): MetricsExporter | null {
  switch (type) {
    case 'prometheus':
      return new PrometheusExporter();

    case 'datadog':
      return new DatadogExporter({
        host: process.env.DD_AGENT_HOST,
        port: parseInt(process.env.DD_DOGSTATSD_PORT ?? '8125'),
      });

    case 'otel':
      initializeOTel();
      return new OTelExporter();

    case 'none':
    default:
      return null;
  }
}

// Auto-detect exporter from environment
export function autoDetectExporter(): ExporterType {
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return 'otel';
  }
  if (process.env.DD_AGENT_HOST || process.env.DD_API_KEY) {
    return 'datadog';
  }
  if (process.env.GWI_METRICS_ENABLED !== 'false') {
    return 'prometheus';
  }
  return 'none';
}
```

---

## Health Check Integration

All exporters expose health status:

```typescript
interface ExporterHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastExport?: Date;
  errorCount: number;
  metricsExported: number;
}

// GET /health includes exporter status
{
  "status": "healthy",
  "components": [
    {
      "name": "metrics-exporter",
      "status": "healthy",
      "details": {
        "type": "prometheus",
        "metricsExported": 1234,
        "lastExport": "2026-02-03T10:00:00Z"
      }
    }
  ]
}
```

---

## Related Documentation

- [032-OD-RUNB-observability-operations.md](./032-OD-RUNB-observability-operations.md)
- [210-DR-SPEC-ai-performance-metrics.md](./210-DR-SPEC-ai-performance-metrics.md)
- [211-DR-TMPL-grafana-dashboards.md](./211-DR-TMPL-grafana-dashboards.md)
