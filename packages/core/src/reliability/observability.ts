/**
 * Observability Primitives
 *
 * Phase 7: Structured logging, tracing, and metrics interfaces.
 *
 * Hard rules:
 * - All logs are JSON structured
 * - Trace correlation via runId
 * - Metrics interface is pluggable (no cloud wiring required)
 * - Minimal overhead for disabled features
 *
 * @module @gwi/core/reliability/observability
 */

// =============================================================================
// Log Types
// =============================================================================

/**
 * Log levels
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/**
 * Structured log entry
 */
export interface LogEntry {
  /** Log level */
  level: LogLevel;

  /** Log message */
  message: string;

  /** ISO timestamp */
  timestamp: string;

  /** Run ID for correlation */
  runId?: string;

  /** Tenant ID for multi-tenant context */
  tenantId?: string;

  /** Step ID within run */
  stepId?: string;

  /** Agent/component name */
  component?: string;

  /** Additional structured data */
  data?: Record<string, unknown>;

  /** Error details if applicable */
  error?: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
  };

  /** Duration in milliseconds (for timed operations) */
  durationMs?: number;
}

// =============================================================================
// Logger
// =============================================================================

/**
 * Structured JSON logger
 */
export class Logger {
  private component: string;
  private context: Record<string, unknown>;

  constructor(component: string, context?: Record<string, unknown>) {
    this.component = component;
    this.context = context ?? {};
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: Record<string, unknown>): Logger {
    return new Logger(this.component, {
      ...this.context,
      ...additionalContext,
    });
  }

  /**
   * Log at DEBUG level
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('DEBUG', message, data);
  }

  /**
   * Log at INFO level
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('INFO', message, data);
  }

  /**
   * Log at WARN level
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('WARN', message, data);
  }

  /**
   * Log at ERROR level
   */
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorData: LogEntry['error'] | undefined = error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          code: (error as any).code,
          stack: error.stack,
        }
      : error
        ? { name: 'Error', message: String(error) }
        : undefined;

    this.log('ERROR', message, data, errorData);
  }

  /**
   * Log with timing
   */
  timed<T>(
    level: LogLevel,
    message: string,
    fn: () => T | Promise<T>,
    data?: Record<string, unknown>
  ): T | Promise<T> {
    const start = Date.now();
    const result = fn();

    if (result instanceof Promise) {
      return result.finally(() => {
        const durationMs = Date.now() - start;
        this.log(level, message, { ...data, durationMs });
      });
    }

    const durationMs = Date.now() - start;
    this.log(level, message, { ...data, durationMs });
    return result;
  }

  /**
   * Core log method
   */
  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: LogEntry['error']
  ): void {
    // Get trace context
    const trace = getTraceContext();

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      component: this.component,
      runId: trace?.runId ?? this.context.runId as string | undefined,
      tenantId: trace?.tenantId ?? this.context.tenantId as string | undefined,
      stepId: trace?.stepId ?? this.context.stepId as string | undefined,
      data: { ...this.context, ...data },
      error,
    };

    // Clean up undefined fields
    const cleaned = Object.fromEntries(
      Object.entries(entry).filter(([, v]) => v !== undefined)
    );

    // Output as JSON
    const output = JSON.stringify(cleaned);

    switch (level) {
      case 'DEBUG':
        if (process.env.GWI_DEBUG === 'true' || process.env.DEBUG) {
          console.debug(output);
        }
        break;
      case 'INFO':
        console.info(output);
        break;
      case 'WARN':
        console.warn(output);
        break;
      case 'ERROR':
        console.error(output);
        break;
    }
  }
}

// =============================================================================
// Logger Factory
// =============================================================================

const loggers = new Map<string, Logger>();

/**
 * Get or create a logger for a component
 */
export function getLogger(component: string, context?: Record<string, unknown>): Logger {
  const key = context ? `${component}:${JSON.stringify(context)}` : component;

  if (!loggers.has(key)) {
    loggers.set(key, new Logger(component, context));
  }

  return loggers.get(key)!;
}

// =============================================================================
// Trace Context
// =============================================================================

/**
 * Trace context for correlation
 */
export interface TraceContext {
  /** Run ID as the primary correlation ID */
  runId: string;

  /** Tenant ID for multi-tenant context */
  tenantId?: string;

  /** Current step ID */
  stepId?: string;

  /** Parent span ID (for distributed tracing) */
  parentSpanId?: string;

  /** Current span ID */
  spanId?: string;

  /** When the trace started */
  startedAt: Date;
}

// AsyncLocalStorage for trace context propagation
let traceStorage: { run: <T>(store: TraceContext, fn: () => T) => T; getStore: () => TraceContext | undefined } | null = null;

// Try to import AsyncLocalStorage (Node.js 16+)
try {
  const { AsyncLocalStorage } = await import('node:async_hooks');
  traceStorage = new AsyncLocalStorage<TraceContext>();
} catch {
  // Fallback for environments without AsyncLocalStorage
  let currentTrace: TraceContext | undefined;
  traceStorage = {
    run: <T>(store: TraceContext, fn: () => T) => {
      const prev = currentTrace;
      currentTrace = store;
      try {
        return fn();
      } finally {
        currentTrace = prev;
      }
    },
    getStore: () => currentTrace,
  };
}

/**
 * Create a new trace context
 */
export function createTraceContext(runId: string, options?: Partial<TraceContext>): TraceContext {
  return {
    runId,
    tenantId: options?.tenantId,
    stepId: options?.stepId,
    parentSpanId: options?.parentSpanId,
    spanId: generateSpanId(),
    startedAt: new Date(),
  };
}

/**
 * Get the current trace context
 */
export function getTraceContext(): TraceContext | undefined {
  return traceStorage?.getStore();
}

/**
 * Set trace context and run a function
 */
export function setTraceContext<T>(ctx: TraceContext, fn: () => T): T {
  return traceStorage!.run(ctx, fn);
}

/**
 * Generate a span ID
 */
function generateSpanId(): string {
  return Math.random().toString(36).substring(2, 10) +
         Math.random().toString(36).substring(2, 10);
}

// =============================================================================
// Metrics
// =============================================================================

/**
 * Metric types
 */
export type MetricType = 'counter' | 'gauge' | 'histogram' | 'timer';

/**
 * Metric value
 */
export interface MetricValue {
  name: string;
  type: MetricType;
  value: number;
  labels?: Record<string, string>;
  timestamp: Date;
}

/**
 * Metrics registry interface
 *
 * Implementations can use:
 * - In-memory (for testing)
 * - Prometheus
 * - CloudWatch
 * - Datadog
 */
export interface MetricsRegistry {
  /**
   * Increment a counter
   */
  increment(name: string, labels?: Record<string, string>, value?: number): void;

  /**
   * Set a gauge value
   */
  gauge(name: string, value: number, labels?: Record<string, string>): void;

  /**
   * Record a histogram value
   */
  histogram(name: string, value: number, labels?: Record<string, string>): void;

  /**
   * Record a timer value (duration in ms)
   */
  timer(name: string, durationMs: number, labels?: Record<string, string>): void;

  /**
   * Start a timer and return a function to stop it
   */
  startTimer(name: string, labels?: Record<string, string>): () => void;

  /**
   * Get all recorded metrics (for testing/debugging)
   */
  getMetrics(): MetricValue[];

  /**
   * Reset all metrics (for testing)
   */
  reset(): void;
}

// =============================================================================
// Default Metrics Implementation
// =============================================================================

/**
 * In-memory metrics registry
 *
 * Useful for:
 * - Testing
 * - Development
 * - When no external metrics system is configured
 */
export class DefaultMetricsRegistry implements MetricsRegistry {
  private metrics: MetricValue[] = [];
  private counters = new Map<string, number>();

  increment(name: string, labels?: Record<string, string>, value: number = 1): void {
    const key = this.makeKey(name, labels);
    const current = this.counters.get(key) ?? 0;
    this.counters.set(key, current + value);

    this.metrics.push({
      name,
      type: 'counter',
      value: current + value,
      labels,
      timestamp: new Date(),
    });
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    this.metrics.push({
      name,
      type: 'gauge',
      value,
      labels,
      timestamp: new Date(),
    });
  }

  histogram(name: string, value: number, labels?: Record<string, string>): void {
    this.metrics.push({
      name,
      type: 'histogram',
      value,
      labels,
      timestamp: new Date(),
    });
  }

  timer(name: string, durationMs: number, labels?: Record<string, string>): void {
    this.metrics.push({
      name,
      type: 'timer',
      value: durationMs,
      labels,
      timestamp: new Date(),
    });
  }

  startTimer(name: string, labels?: Record<string, string>): () => void {
    const start = Date.now();
    return () => {
      this.timer(name, Date.now() - start, labels);
    };
  }

  getMetrics(): MetricValue[] {
    return [...this.metrics];
  }

  reset(): void {
    this.metrics = [];
    this.counters.clear();
  }

  private makeKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    const sorted = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
    return `${name}:${sorted.map(([k, v]) => `${k}=${v}`).join(',')}`;
  }
}

// =============================================================================
// Metrics Singleton
// =============================================================================

let globalMetricsRegistry: MetricsRegistry | null = null;

/**
 * Get the global metrics registry
 */
export function getMetricsRegistry(): MetricsRegistry {
  if (!globalMetricsRegistry) {
    globalMetricsRegistry = new DefaultMetricsRegistry();
  }
  return globalMetricsRegistry;
}

/**
 * Set a custom metrics registry
 */
export function setMetricsRegistry(registry: MetricsRegistry): void {
  globalMetricsRegistry = registry;
}
