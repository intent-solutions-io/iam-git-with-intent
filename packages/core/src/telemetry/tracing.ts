/**
 * OpenTelemetry Tracing Module
 *
 * Phase 23: Production Observability
 *
 * Provides distributed tracing infrastructure:
 * - OpenTelemetry SDK initialization
 * - Cloud Trace exporter configuration
 * - Span creation and management
 * - Automatic instrumentation hooks
 *
 * @module @gwi/core/telemetry/tracing
 */

import {
  getCurrentContext,
  createChildContext,
  runWithContextAsync,
} from './context.js';
import { generateSpanId, type SpanId } from './ids.js';
import { getLogger } from './logger.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Span status
 */
export type SpanStatus = 'UNSET' | 'OK' | 'ERROR';

/**
 * Span kind (aligned with OpenTelemetry)
 */
export type SpanKind = 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER';

/**
 * Span attributes
 */
export type SpanAttributes = Record<string, string | number | boolean | undefined>;

/**
 * Span event
 */
export interface SpanEvent {
  name: string;
  timestamp: Date;
  attributes?: SpanAttributes;
}

/**
 * Span interface (lightweight, compatible with OTel)
 */
export interface Span {
  /** Span ID */
  readonly spanId: SpanId;
  /** Span name */
  readonly name: string;
  /** Span kind */
  readonly kind: SpanKind;
  /** Start time */
  readonly startTime: Date;
  /** Parent span ID */
  readonly parentSpanId?: SpanId;
  /** Trace ID */
  readonly traceId: string;

  /** Set span status */
  setStatus(status: SpanStatus, message?: string): void;
  /** Add attribute */
  setAttribute(key: string, value: string | number | boolean): void;
  /** Add multiple attributes */
  setAttributes(attributes: SpanAttributes): void;
  /** Add event */
  addEvent(name: string, attributes?: SpanAttributes): void;
  /** Record exception */
  recordException(error: Error | unknown): void;
  /** End span */
  end(): void;

  /** Get duration in milliseconds (after end) */
  getDurationMs(): number | undefined;
  /** Get all attributes */
  getAttributes(): SpanAttributes;
  /** Get all events */
  getEvents(): SpanEvent[];
  /** Get status */
  getStatus(): { status: SpanStatus; message?: string };
  /** Check if ended */
  isEnded(): boolean;
}

/**
 * Tracer interface
 */
export interface Tracer {
  /** Start a new span */
  startSpan(name: string, options?: StartSpanOptions): Span;
  /** Start a span and run a function within it */
  withSpan<T>(name: string, fn: (span: Span) => T | Promise<T>, options?: StartSpanOptions): Promise<T>;
  /** Get current span from context */
  getCurrentSpan(): Span | undefined;
}

/**
 * Options for starting a span
 */
export interface StartSpanOptions {
  kind?: SpanKind;
  attributes?: SpanAttributes;
  parentSpanId?: SpanId;
}

/**
 * Tracer configuration
 */
export interface TracerConfig {
  /** Service name */
  serviceName: string;
  /** Service version */
  serviceVersion?: string;
  /** Whether to enable tracing (default: true in production) */
  enabled?: boolean;
  /** Sample rate (0.0 - 1.0, default: 1.0) */
  sampleRate?: number;
  /** Custom span processor */
  onSpanEnd?: (span: Span) => void;
}

// =============================================================================
// Span Implementation
// =============================================================================

class SpanImpl implements Span {
  readonly spanId: SpanId;
  readonly name: string;
  readonly kind: SpanKind;
  readonly startTime: Date;
  readonly parentSpanId?: SpanId;
  readonly traceId: string;

  private endTime?: Date;
  private status: SpanStatus = 'UNSET';
  private statusMessage?: string;
  private attributes: SpanAttributes = {};
  private events: SpanEvent[] = [];
  private onEnd?: (span: Span) => void;

  constructor(
    name: string,
    traceId: string,
    options?: StartSpanOptions & { onEnd?: (span: Span) => void }
  ) {
    this.spanId = generateSpanId();
    this.name = name;
    this.traceId = traceId;
    this.kind = options?.kind ?? 'INTERNAL';
    this.startTime = new Date();
    this.parentSpanId = options?.parentSpanId;
    this.onEnd = options?.onEnd;

    if (options?.attributes) {
      this.setAttributes(options.attributes);
    }
  }

  setStatus(status: SpanStatus, message?: string): void {
    if (this.endTime) return; // Ignore if already ended
    this.status = status;
    this.statusMessage = message;
  }

  setAttribute(key: string, value: string | number | boolean): void {
    if (this.endTime) return;
    this.attributes[key] = value;
  }

  setAttributes(attributes: SpanAttributes): void {
    if (this.endTime) return;
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined) {
        this.attributes[key] = value;
      }
    }
  }

  addEvent(name: string, attributes?: SpanAttributes): void {
    if (this.endTime) return;
    this.events.push({
      name,
      timestamp: new Date(),
      attributes,
    });
  }

  recordException(error: Error | unknown): void {
    if (this.endTime) return;

    const errorObj = error instanceof Error ? error : new Error(String(error));

    this.addEvent('exception', {
      'exception.type': errorObj.name,
      'exception.message': errorObj.message,
      'exception.stacktrace': errorObj.stack,
    });

    if (this.status === 'UNSET') {
      this.setStatus('ERROR', errorObj.message);
    }
  }

  end(): void {
    if (this.endTime) return;
    this.endTime = new Date();

    // Set OK status if unset
    if (this.status === 'UNSET') {
      this.status = 'OK';
    }

    // Call onEnd callback
    this.onEnd?.(this);
  }

  getDurationMs(): number | undefined {
    if (!this.endTime) return undefined;
    return this.endTime.getTime() - this.startTime.getTime();
  }

  getAttributes(): SpanAttributes {
    return { ...this.attributes };
  }

  getEvents(): SpanEvent[] {
    return [...this.events];
  }

  getStatus(): { status: SpanStatus; message?: string } {
    return { status: this.status, message: this.statusMessage };
  }

  isEnded(): boolean {
    return this.endTime !== undefined;
  }
}

// =============================================================================
// Tracer Implementation
// =============================================================================

class TracerImpl implements Tracer {
  private config: Required<TracerConfig>;
  private currentSpan?: Span;
  private logger = getLogger();

  constructor(config: TracerConfig) {
    this.config = {
      serviceName: config.serviceName,
      serviceVersion: config.serviceVersion ?? process.env.APP_VERSION ?? '0.0.0',
      enabled: config.enabled ?? process.env.NODE_ENV === 'production',
      sampleRate: config.sampleRate ?? 1.0,
      onSpanEnd: config.onSpanEnd ?? this.defaultSpanProcessor.bind(this),
    };
  }

  startSpan(name: string, options?: StartSpanOptions): Span {
    // Check if sampled
    if (!this.shouldSample()) {
      // Return a no-op span
      return new SpanImpl(name, '0'.repeat(32), options);
    }

    // Get parent context
    const ctx = getCurrentContext();
    const traceId = ctx?.traceId ?? '0'.repeat(32);
    const parentSpanId = options?.parentSpanId ?? ctx?.spanId;

    const span = new SpanImpl(name, traceId, {
      ...options,
      parentSpanId,
      onEnd: this.config.onSpanEnd,
    });

    this.currentSpan = span;
    return span;
  }

  async withSpan<T>(
    name: string,
    fn: (span: Span) => T | Promise<T>,
    options?: StartSpanOptions
  ): Promise<T> {
    const span = this.startSpan(name, options);

    // Create child context with new span
    const ctx = getCurrentContext();
    const childCtx = ctx
      ? createChildContext(ctx, { spanId: span.spanId })
      : undefined;

    try {
      const result = childCtx
        ? await runWithContextAsync(childCtx, () => Promise.resolve(fn(span)))
        : await Promise.resolve(fn(span));

      span.setStatus('OK');
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus('ERROR');
      throw error;
    } finally {
      span.end();
    }
  }

  getCurrentSpan(): Span | undefined {
    return this.currentSpan;
  }

  private shouldSample(): boolean {
    if (!this.config.enabled) return false;
    if (this.config.sampleRate >= 1.0) return true;
    return Math.random() < this.config.sampleRate;
  }

  private defaultSpanProcessor(span: Span): void {
    // Log span in Cloud Trace compatible format
    const durationMs = span.getDurationMs() ?? 0;
    const status = span.getStatus();
    const attributes = span.getAttributes();

    // Only log if there's something interesting (errors or slow spans)
    if (status.status === 'ERROR' || durationMs > 1000) {
      this.logger.info(`Span: ${span.name}`, {
        eventName: 'span.end',
        spanName: span.name,
        spanId: span.spanId,
        traceId: span.traceId,
        parentSpanId: span.parentSpanId,
        spanKind: span.kind,
        durationMs,
        status: status.status,
        statusMessage: status.message,
        ...attributes,
      });
    }
  }
}

// =============================================================================
// Singleton Tracer
// =============================================================================

let defaultTracer: Tracer | null = null;

/**
 * Get the default tracer instance
 */
export function getTracer(): Tracer {
  if (!defaultTracer) {
    defaultTracer = new TracerImpl({
      serviceName: process.env.APP_NAME ?? 'gwi',
    });
  }
  return defaultTracer;
}

/**
 * Set a custom default tracer
 */
export function setTracer(tracer: Tracer): void {
  defaultTracer = tracer;
}

/**
 * Create a tracer for a specific service
 */
export function createTracer(config: TracerConfig): Tracer {
  return new TracerImpl(config);
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Start a span using the default tracer
 */
export function startSpan(name: string, options?: StartSpanOptions): Span {
  return getTracer().startSpan(name, options);
}

/**
 * Run a function within a span using the default tracer
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => T | Promise<T>,
  options?: StartSpanOptions
): Promise<T> {
  return getTracer().withSpan(name, fn, options);
}

/**
 * Get the current span from the default tracer
 */
export function getCurrentSpan(): Span | undefined {
  return getTracer().getCurrentSpan();
}

// =============================================================================
// Instrumentation Helpers
// =============================================================================

/**
 * Instrument an async function with tracing
 */
export function instrument<T extends (...args: unknown[]) => Promise<unknown>>(
  name: string,
  fn: T,
  options?: StartSpanOptions
): T {
  return (async (...args: Parameters<T>) => {
    return withSpan(name, async (span) => {
      span.setAttribute('function.name', name);
      span.setAttribute('function.args_count', args.length);
      return fn(...args);
    }, options);
  }) as T;
}

/**
 * Create a span for HTTP client requests
 */
export function instrumentHttpClient(
  method: string,
  url: string,
  fn: (span: Span) => Promise<{ status: number }>
): Promise<{ status: number }> {
  return withSpan(`HTTP ${method}`, async (span) => {
    span.setAttributes({
      'http.method': method,
      'http.url': url,
      'span.kind': 'CLIENT',
    });

    const result = await fn(span);

    span.setAttribute('http.status_code', result.status);
    if (result.status >= 400) {
      span.setStatus('ERROR', `HTTP ${result.status}`);
    }

    return result;
  }, { kind: 'CLIENT' });
}

/**
 * Create a span for queue operations
 */
export function instrumentQueuePublish(
  topic: string,
  fn: (span: Span) => Promise<string>
): Promise<string> {
  return withSpan(`Queue publish: ${topic}`, async (span) => {
    span.setAttributes({
      'messaging.system': 'pubsub',
      'messaging.destination': topic,
      'messaging.operation': 'publish',
    });

    const messageId = await fn(span);
    span.setAttribute('messaging.message_id', messageId);

    return messageId;
  }, { kind: 'PRODUCER' });
}

/**
 * Create a span for queue consumption
 */
export function instrumentQueueConsume<T>(
  topic: string,
  messageId: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(`Queue consume: ${topic}`, async (span) => {
    span.setAttributes({
      'messaging.system': 'pubsub',
      'messaging.destination': topic,
      'messaging.operation': 'receive',
      'messaging.message_id': messageId,
    });

    return fn(span);
  }, { kind: 'CONSUMER' });
}

/**
 * Create a span for database operations
 */
export function instrumentDatabase(
  operation: string,
  collection: string,
  fn: (span: Span) => Promise<unknown>
): Promise<unknown> {
  return withSpan(`DB ${operation}: ${collection}`, async (span) => {
    span.setAttributes({
      'db.system': 'firestore',
      'db.operation': operation,
      'db.collection': collection,
    });

    return fn(span);
  }, { kind: 'CLIENT' });
}

/**
 * Create a span for LLM calls
 */
export function instrumentLLM(
  model: string,
  operation: string,
  fn: (span: Span) => Promise<{ inputTokens?: number; outputTokens?: number }>
): Promise<{ inputTokens?: number; outputTokens?: number }> {
  return withSpan(`LLM ${operation}`, async (span) => {
    span.setAttributes({
      'llm.model': model,
      'llm.operation': operation,
    });

    const result = await fn(span);

    if (result.inputTokens !== undefined) {
      span.setAttribute('llm.input_tokens', result.inputTokens);
    }
    if (result.outputTokens !== undefined) {
      span.setAttribute('llm.output_tokens', result.outputTokens);
    }

    return result;
  }, { kind: 'CLIENT' });
}
