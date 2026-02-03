/**
 * Telemetry Module
 *
 * Phase 23: Production Observability
 *
 * Provides unified telemetry infrastructure:
 * - W3C Trace Context compatible correlation IDs
 * - AsyncLocalStorage-based context propagation
 * - Structured JSON logging with Cloud Logging format
 * - Secret/token redaction
 *
 * @module @gwi/core/telemetry
 */

// =============================================================================
// ID Generation
// =============================================================================

export {
  // Types
  type TraceId,
  type SpanId,
  type RequestId,

  // Generators
  generateTraceId,
  generateSpanId,
  generateRequestId,

  // Validators
  isValidTraceId,
  isValidSpanId,
  isValidRequestId,

  // Parsers
  parseTraceId,
  parseSpanId,
  shortId,

  // URL Builders
  createCloudTraceUrl,
  createLogExplorerUrl,
} from './ids.js';

// =============================================================================
// Context Management
// =============================================================================

export {
  // Types
  type TelemetrySource,
  type Severity,
  type TelemetryContext,
  type PartialTelemetryContext,
  type SerializedContext,

  // Context Access
  getCurrentContext,
  requireContext,
  runWithContext,
  runWithContextAsync,

  // Context Creation
  createContext,
  createChildContext,
  createContextFromRequest,
  createContextFromJob,
  createContextFromWebhook,

  // Serialization
  serializeContext,
  deserializeContext,

  // HTTP Propagation
  createTraceparent,
  createPropagationHeaders,

  // Utilities
  withContext,
  extendContext,
} from './context.js';

// Re-export ActorType with namespaced alias to avoid conflict with tenancy
export { type ActorType as TelemetryActorType } from './context.js';

// =============================================================================
// Structured Logging
// =============================================================================

export {
  // Types
  type LoggerConfig,

  // Singleton Access
  setLogger,
  createLogger,

  // Convenience Functions
  debug,
  info,
  warn,
  error,
} from './logger.js';

// Re-export with namespaced aliases to avoid conflict with reliability/observability
export {
  type LogEntry as TelemetryLogEntry,
  Logger as TelemetryLogger,
  getLogger as getTelemetryLogger,
} from './logger.js';

// =============================================================================
// HTTP Middleware
// =============================================================================

export {
  // Types
  type RequestLike,
  type ResponseLike,
  type NextFunction,
  type TelemetryMiddlewareOptions,
  type HonoContext,

  // Express-style
  createTelemetryMiddleware,

  // Hono-style
  createHonoTelemetryMiddleware,
  getTelemetryContextFromHono,

  // Job/Worker
  wrapJobHandler,

  // Webhook
  wrapWebhookHandler,
} from './middleware.js';

// =============================================================================
// Distributed Tracing
// =============================================================================

export {
  // Types
  type SpanStatus,
  type SpanKind,
  type SpanAttributes,
  type SpanEvent,
  type Span,
  type Tracer,
  type StartSpanOptions,
  type TracerConfig,

  // Singleton Access
  getTracer,
  setTracer,
  createTracer,

  // Convenience Functions
  startSpan,
  withSpan,
  getCurrentSpan,

  // Instrumentation Helpers
  instrument,
  instrumentHttpClient,
  instrumentQueuePublish,
  instrumentQueueConsume,
  instrumentDatabase,
  instrumentLLM,
} from './tracing.js';

// =============================================================================
// Metrics
// =============================================================================

export {
  // Types
  type MetricLabels,
  type HistogramBuckets,
  type MetricDefinition,
  type MetricSnapshot,
  type GWIMetrics,
  type SLODefinition,

  // Metric Classes
  Counter,
  Gauge,
  Histogram,

  // Bucket Configurations
  DEFAULT_LATENCY_BUCKETS,
  DEFAULT_SIZE_BUCKETS,

  // Pre-defined Metrics
  getGWIMetrics,

  // SLO Definitions
  GWI_SLOS,

  // Recording Helpers
  recordHttpMetrics,
  recordRunMetrics,
  recordAgentMetrics,
} from './metrics.js';

// Re-export with namespaced aliases to avoid conflict with reliability
export {
  type MetricType as TelemetryMetricType,
  MetricsRegistry as TelemetryMetricsRegistry,
  getMetricsRegistry as getTelemetryMetricsRegistry,
  setMetricsRegistry as setTelemetryMetricsRegistry,
} from './metrics.js';

// =============================================================================
// SDLC Events (EPIC 002)
// =============================================================================

export {
  // Types
  type SDLCStage,
  type SDLCAction,
  type SDLCEvent,
  type SDLCEventInput,
  type StageTimer,
  type SDLCEventStore,
  type SDLCEventQueryOptions,
  type StageTimingsOptions,
  type StageTimings,
  type SDLCMetrics,
  type DORAMetrics,

  // Schemas
  SDLCStage as SDLCStageEnum,
  SDLCAction as SDLCActionEnum,
  SDLCEventSchema,

  // Event Emission
  emitSDLCEvent,
  onSDLCEvent,

  // Stage Timing
  startStageTimer,
  withStageTracking,

  // Metrics
  getSDLCMetrics,

  // Helpers
  workflowToStage,
  inferStageFromContext,
  calculateDORAMetrics,
} from './sdlc-events.js';

// SDLC Event Storage
export {
  // Stores
  InMemorySDLCEventStore,
  FirestoreSDLCEventStore,

  // Factory
  getSDLCEventStore,
  setSDLCEventStore,
  createSDLCEventStore,
} from './sdlc-event-store.js';
