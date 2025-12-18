/**
 * Telemetry ID Generation Module
 *
 * Phase 23: Production Observability
 *
 * Generates W3C Trace Context compatible IDs:
 * - Trace ID: 32 hex characters (128-bit)
 * - Span ID: 16 hex characters (64-bit)
 *
 * @module @gwi/core/telemetry/ids
 */

import { randomBytes } from 'crypto';

// =============================================================================
// Branded Types for Type Safety
// =============================================================================

/**
 * W3C Trace Context trace ID (32 hex characters)
 */
export type TraceId = string & { readonly __brand: 'TraceId' };

/**
 * W3C Trace Context span ID (16 hex characters)
 */
export type SpanId = string & { readonly __brand: 'SpanId' };

/**
 * Request ID (can be UUID or custom format)
 */
export type RequestId = string & { readonly __brand: 'RequestId' };

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generate a W3C Trace Context compliant trace ID (128-bit, 32 hex chars)
 */
export function generateTraceId(): TraceId {
  return randomBytes(16).toString('hex') as TraceId;
}

/**
 * Generate a W3C Trace Context compliant span ID (64-bit, 16 hex chars)
 */
export function generateSpanId(): SpanId {
  return randomBytes(8).toString('hex') as SpanId;
}

/**
 * Generate a request ID (UUID v4 format)
 */
export function generateRequestId(): RequestId {
  const bytes = randomBytes(16);
  // Set version (4) and variant (10xx) bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as RequestId;
}

// =============================================================================
// ID Validation
// =============================================================================

/**
 * Check if a string is a valid trace ID
 */
export function isValidTraceId(id: string): id is TraceId {
  return /^[0-9a-f]{32}$/i.test(id);
}

/**
 * Check if a string is a valid span ID
 */
export function isValidSpanId(id: string): id is SpanId {
  return /^[0-9a-f]{16}$/i.test(id);
}

/**
 * Check if a string is a valid request ID (UUID format)
 */
export function isValidRequestId(id: string): id is RequestId {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

// =============================================================================
// ID Parsing/Conversion
// =============================================================================

/**
 * Parse a trace ID from a string, returning undefined if invalid
 */
export function parseTraceId(id: string | undefined | null): TraceId | undefined {
  if (!id) return undefined;
  const normalized = id.toLowerCase();
  return isValidTraceId(normalized) ? normalized as TraceId : undefined;
}

/**
 * Parse a span ID from a string, returning undefined if invalid
 */
export function parseSpanId(id: string | undefined | null): SpanId | undefined {
  if (!id) return undefined;
  const normalized = id.toLowerCase();
  return isValidSpanId(normalized) ? normalized as SpanId : undefined;
}

/**
 * Create a short ID for display (first 8 chars)
 */
export function shortId(id: TraceId | SpanId | string): string {
  return id.slice(0, 8);
}

// =============================================================================
// ID Linking (for logs)
// =============================================================================

/**
 * Create a linkable trace URL for Cloud Trace
 * Format: https://console.cloud.google.com/traces/list?project=PROJECT&tid=TRACE_ID
 */
export function createCloudTraceUrl(projectId: string, traceId: TraceId): string {
  return `https://console.cloud.google.com/traces/list?project=${projectId}&tid=${traceId}`;
}

/**
 * Create a GCP Log Explorer URL for a trace
 */
export function createLogExplorerUrl(projectId: string, traceId: TraceId): string {
  const filter = encodeURIComponent(`trace="projects/${projectId}/traces/${traceId}"`);
  return `https://console.cloud.google.com/logs/query?project=${projectId}&query=${filter}`;
}
