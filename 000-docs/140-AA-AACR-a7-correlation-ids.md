# AAR: A7 - Correlation IDs + Structured Logging

**Date**: 2025-12-19
**Phase**: A7 - Correlation IDs + Structured Logging
**Status**: COMPLETE

## Summary

Enhanced request logging in API and Gateway services to include W3C Trace Context compatible trace IDs. The telemetry infrastructure (`@gwi/core/telemetry`) was already comprehensive; this phase wired it into the HTTP services.

## Pre-Existing Infrastructure

The following was already implemented in `packages/core/src/telemetry/`:

- **context.ts**: TelemetryContext with traceId, spanId, tenantId, runId, etc.
- **ids.ts**: W3C Trace Context compatible ID generation (32-char traceId, 16-char spanId)
- **logger.ts**: Structured Logger with Cloud Logging format, secret redaction
- **middleware.ts**: Express/Hono middleware for telemetry context propagation

## Changes Made

### API Service (`apps/api/src/index.ts`)

- Added `generateTraceId` import from `@gwi/core`
- Enhanced request logging middleware (lines ~295-364):
  - Extracts trace ID from W3C `traceparent` header
  - Generates new trace ID if none provided
  - Adds `X-Trace-ID` and `X-Request-ID` response headers
  - Logs with `logging.googleapis.com/trace` for Cloud Trace correlation
  - Logs with `logging.googleapis.com/spanId` for span linkage

### Gateway Service (`apps/gateway/src/index.ts`)

- Added `generateTraceId` import from `@gwi/core`
- Added request logging middleware (lines ~68-116):
  - Same trace ID extraction/generation as API
  - Same Cloud Logging format for consistency
  - Stores traceId/requestId on request for downstream handlers

## Log Format Example

```json
{
  "severity": "INFO",
  "type": "http_request",
  "message": "POST /tenants/abc/runs 200 150ms",
  "logging.googleapis.com/trace": "projects/my-project/traces/abc123def456...",
  "logging.googleapis.com/spanId": "req-123456789012",
  "requestId": "req-1703019600-x7k9",
  "traceId": "abc123def456789012345678901234567",
  "method": "POST",
  "path": "/tenants/abc/runs",
  "statusCode": 200,
  "durationMs": 150,
  "tenantId": "abc",
  "userId": "user-123",
  "timestamp": "2025-12-19T15:00:00.000Z"
}
```

## Cloud Logging Integration

With `logging.googleapis.com/trace` field:
- Logs are automatically linked in Cloud Logging
- Click on trace ID → see all related logs
- Trace spans show request flow across services

## A7 Subtasks Status

| Subtask | Description | Status |
|---------|-------------|--------|
| A7.s1 | traceId/runId/stepId fields | ✅ Pre-existing in TelemetryContext |
| A7.s2 | Logger wrapper with auto-inject | ✅ Pre-existing Logger class |
| A7.s3 | Request logging middleware | ✅ Wired into API/Gateway |
| A7.s4 | Cloud Logging JSON structure | ✅ Pre-existing with googleapis format |
| A7.s5 | Sampling rules | Deferred (severity filter exists) |

## Test Results

```
Build: 12/12 packages successful
```

## Files Changed

- `apps/api/src/index.ts` - Added trace ID to request logging
- `apps/gateway/src/index.ts` - Added trace ID middleware

## Next Steps

- A8: Artifact model (GCS) for run outputs
- A9: Secrets model (Secret Manager)
