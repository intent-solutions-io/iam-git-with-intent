/**
 * Telemetry Context Module
 *
 * Phase 23: Production Observability
 *
 * Defines the telemetry context structure that flows through all services.
 * This provides consistent correlation across:
 * - HTTP requests → worker jobs
 * - Webhook events → signal processing → queue handling
 * - API calls → connector invocations
 *
 * @module @gwi/core/telemetry/context
 */

import { AsyncLocalStorage } from 'async_hooks';
import { generateTraceId, generateSpanId, type TraceId, type SpanId } from './ids.js';

// =============================================================================
// Telemetry Context Types
// =============================================================================

/**
 * Source of the telemetry event
 */
export type TelemetrySource = 'api' | 'worker' | 'webhook' | 'cli' | 'scheduler' | 'internal';

/**
 * Actor type that triggered the action
 */
export type ActorType = 'user' | 'scheduler' | 'webhook' | 'worker' | 'system';

/**
 * Severity levels (aligned with Cloud Logging)
 */
export type Severity = 'DEBUG' | 'INFO' | 'NOTICE' | 'WARNING' | 'ERROR' | 'CRITICAL' | 'ALERT' | 'EMERGENCY';

/**
 * Core telemetry context that flows through the system
 *
 * This is the "contract" - every log/trace/metric should include these fields
 * where applicable.
 */
export interface TelemetryContext {
  // === Distributed Tracing ===
  /** W3C Trace Context trace ID (32 hex chars) */
  traceId: TraceId;
  /** W3C Trace Context span ID (16 hex chars) */
  spanId: SpanId;
  /** Parent span ID if this is a child span */
  parentSpanId?: SpanId;

  // === Multi-Tenant ===
  /** Tenant ID for isolation */
  tenantId?: string;

  // === Resource Identifiers ===
  /** Run ID for agent pipeline execution */
  runId?: string;
  /** Work item ID from queue */
  workItemId?: string;
  /** PR Candidate ID */
  candidateId?: string;
  /** Workflow template ID */
  workflowTemplateId?: string;
  /** Workflow instance ID */
  instanceId?: string;
  /** Signal ID that triggered processing */
  signalId?: string;

  // === Actor Information ===
  /** Actor who triggered this action */
  actor?: {
    type: ActorType;
    id?: string;
    email?: string;
  };

  // === Intent Receipt (5W) ===
  /** Intent receipt ID linking to formal request */
  intentReceiptId?: string;

  // === Source Metadata ===
  /** Service that generated this telemetry */
  source: TelemetrySource;
  /** Service version */
  serviceVersion?: string;
  /** Environment (dev, staging, prod) */
  environment?: string;

  // === Event Classification ===
  /** Event name for categorization */
  eventName?: string;
  /** Severity level */
  severity?: Severity;

  // === Request Metadata ===
  /** HTTP request ID */
  requestId?: string;
  /** HTTP method */
  httpMethod?: string;
  /** HTTP path (sanitized) */
  httpPath?: string;
  /** User agent */
  userAgent?: string;

  // === Timing ===
  /** Timestamp when context was created */
  timestamp: Date;
}

/**
 * Partial context for creating/extending contexts
 */
export type PartialTelemetryContext = Partial<TelemetryContext>;

// =============================================================================
// Async Local Storage for Context Propagation
// =============================================================================

/**
 * Async local storage for propagating telemetry context
 */
const telemetryStorage = new AsyncLocalStorage<TelemetryContext>();

/**
 * Get the current telemetry context from async local storage
 */
export function getCurrentContext(): TelemetryContext | undefined {
  return telemetryStorage.getStore();
}

/**
 * Get the current telemetry context, throwing if not set
 */
export function requireContext(): TelemetryContext {
  const ctx = getCurrentContext();
  if (!ctx) {
    throw new Error('Telemetry context not initialized. Use runWithContext() or withContext()');
  }
  return ctx;
}

/**
 * Run a function with a telemetry context
 */
export function runWithContext<T>(ctx: TelemetryContext, fn: () => T): T {
  return telemetryStorage.run(ctx, fn);
}

/**
 * Run an async function with a telemetry context
 */
export async function runWithContextAsync<T>(ctx: TelemetryContext, fn: () => Promise<T>): Promise<T> {
  return telemetryStorage.run(ctx, fn);
}

// =============================================================================
// Context Creation and Management
// =============================================================================

/**
 * Create a new root telemetry context
 */
export function createContext(
  source: TelemetrySource,
  overrides?: PartialTelemetryContext
): TelemetryContext {
  return {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    source,
    timestamp: new Date(),
    environment: process.env.DEPLOYMENT_ENV || process.env.NODE_ENV || 'dev',
    serviceVersion: process.env.APP_VERSION || '0.0.0',
    ...overrides,
  };
}

/**
 * Create a child context (new span under same trace)
 */
export function createChildContext(
  parent: TelemetryContext,
  overrides?: PartialTelemetryContext
): TelemetryContext {
  return {
    ...parent,
    spanId: generateSpanId(),
    parentSpanId: parent.spanId,
    timestamp: new Date(),
    ...overrides,
  };
}

/**
 * Create a context from an HTTP request
 */
export function createContextFromRequest(
  req: {
    headers?: Record<string, string | string[] | undefined>;
    method?: string;
    path?: string;
    url?: string;
  },
  source: TelemetrySource = 'api'
): TelemetryContext {
  const headers = req.headers || {};

  // Extract W3C Trace Context headers
  const traceparent = getHeader(headers, 'traceparent');
  const traceId = parseTraceparentTraceId(traceparent) || generateTraceId();
  const parentSpanId = parseTraceparentSpanId(traceparent);

  // Extract custom headers
  const tenantId = getHeader(headers, 'x-tenant-id');
  const requestId = getHeader(headers, 'x-request-id');
  const userAgent = getHeader(headers, 'user-agent');

  return createContext(source, {
    traceId,
    parentSpanId,
    tenantId,
    requestId: requestId || generateSpanId(),
    httpMethod: req.method,
    httpPath: sanitizePath(req.path || req.url || '/'),
    userAgent,
  });
}

/**
 * Create a context from a queue job message
 */
export function createContextFromJob(
  job: {
    traceId?: string;
    spanId?: string;
    tenantId?: string;
    runId?: string;
    workItemId?: string;
    candidateId?: string;
    metadata?: Record<string, unknown>;
  },
  source: TelemetrySource = 'worker'
): TelemetryContext {
  return createContext(source, {
    traceId: (job.traceId as TraceId) || generateTraceId(),
    parentSpanId: job.spanId as SpanId,
    tenantId: job.tenantId,
    runId: job.runId,
    workItemId: job.workItemId,
    candidateId: job.candidateId,
  });
}

/**
 * Create a context from a webhook event
 */
export function createContextFromWebhook(
  event: {
    headers?: Record<string, string | string[] | undefined>;
    eventType?: string;
    deliveryId?: string;
  },
  source: TelemetrySource = 'webhook'
): TelemetryContext {
  const headers = event.headers || {};
  const deliveryId = getHeader(headers, 'x-github-delivery') || event.deliveryId;

  return createContext(source, {
    requestId: deliveryId,
    eventName: event.eventType,
  });
}

// =============================================================================
// Context Serialization (for queue propagation)
// =============================================================================

/**
 * Serializable context for passing through queues/messages
 */
export interface SerializedContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  tenantId?: string;
  runId?: string;
  workItemId?: string;
  candidateId?: string;
  workflowTemplateId?: string;
  instanceId?: string;
  signalId?: string;
  intentReceiptId?: string;
  source: string;
  actor?: {
    type: string;
    id?: string;
  };
}

/**
 * Serialize context for queue message metadata
 */
export function serializeContext(ctx: TelemetryContext): SerializedContext {
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: ctx.parentSpanId,
    tenantId: ctx.tenantId,
    runId: ctx.runId,
    workItemId: ctx.workItemId,
    candidateId: ctx.candidateId,
    workflowTemplateId: ctx.workflowTemplateId,
    instanceId: ctx.instanceId,
    signalId: ctx.signalId,
    intentReceiptId: ctx.intentReceiptId,
    source: ctx.source,
    actor: ctx.actor ? { type: ctx.actor.type, id: ctx.actor.id } : undefined,
  };
}

/**
 * Deserialize context from queue message metadata
 */
export function deserializeContext(
  data: SerializedContext,
  source: TelemetrySource = 'worker'
): TelemetryContext {
  return createContext(source, {
    traceId: data.traceId as TraceId,
    parentSpanId: data.spanId as SpanId, // Parent is the span that enqueued
    tenantId: data.tenantId,
    runId: data.runId,
    workItemId: data.workItemId,
    candidateId: data.candidateId,
    workflowTemplateId: data.workflowTemplateId,
    instanceId: data.instanceId,
    signalId: data.signalId,
    intentReceiptId: data.intentReceiptId,
    actor: data.actor as TelemetryContext['actor'],
  });
}

// =============================================================================
// HTTP Header Propagation
// =============================================================================

/**
 * Create W3C Trace Context traceparent header value
 */
export function createTraceparent(ctx: TelemetryContext): string {
  // Format: version-traceId-spanId-flags
  // version=00, flags=01 (sampled)
  return `00-${ctx.traceId}-${ctx.spanId}-01`;
}

/**
 * Create headers for outgoing HTTP requests
 */
export function createPropagationHeaders(ctx: TelemetryContext): Record<string, string> {
  const headers: Record<string, string> = {
    traceparent: createTraceparent(ctx),
  };

  if (ctx.tenantId) {
    headers['x-tenant-id'] = ctx.tenantId;
  }
  if (ctx.requestId) {
    headers['x-request-id'] = ctx.requestId;
  }

  return headers;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get a single header value from headers object
 */
function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const value = headers[name] || headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Parse trace ID from W3C traceparent header
 */
function parseTraceparentTraceId(traceparent: string | undefined): TraceId | undefined {
  if (!traceparent) return undefined;
  const parts = traceparent.split('-');
  if (parts.length >= 3 && parts[1].length === 32) {
    return parts[1] as TraceId;
  }
  return undefined;
}

/**
 * Parse span ID from W3C traceparent header
 */
function parseTraceparentSpanId(traceparent: string | undefined): SpanId | undefined {
  if (!traceparent) return undefined;
  const parts = traceparent.split('-');
  if (parts.length >= 4 && parts[2].length === 16) {
    return parts[2] as SpanId;
  }
  return undefined;
}

/**
 * Sanitize path to remove sensitive data
 */
function sanitizePath(path: string): string {
  // Remove query parameters
  const pathOnly = path.split('?')[0];
  // Replace UUIDs and IDs with placeholders
  return pathOnly
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/[0-9]+(?=\/|$)/g, '/:id');
}

// =============================================================================
// Context Decorators/Wrappers
// =============================================================================

/**
 * Higher-order function to wrap async functions with telemetry context
 */
export function withContext<T extends (...args: unknown[]) => Promise<unknown>>(
  ctx: TelemetryContext,
  fn: T
): T {
  return (async (...args: Parameters<T>) => {
    return runWithContextAsync(ctx, () => fn(...args));
  }) as T;
}

/**
 * Extend the current context with additional fields
 */
export function extendContext(updates: PartialTelemetryContext): TelemetryContext | undefined {
  const current = getCurrentContext();
  if (!current) return undefined;
  return { ...current, ...updates };
}
