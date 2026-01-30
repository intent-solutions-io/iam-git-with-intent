# Observability Operations Runbook

**Epic C: Observability (Cloud Logging + Cloud Monitoring + Alerts + Runbooks)**
**Version:** 1.0.0
**Last Updated:** 2026-01-30

## Overview

This document covers the complete observability infrastructure for Git With Intent, including:
- Structured JSON logging with correlation IDs
- Log-based metrics for critical error patterns
- Cloud Monitoring dashboards
- Alert policies with notification channels
- Uptime checks for all services

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     GWI Observability Stack                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   API       │    │  Gateway    │    │   Worker    │         │
│  │  Service    │    │  Service    │    │  Service    │         │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│         │                  │                  │                 │
│         └────────────┬─────┴─────┬────────────┘                 │
│                      │           │                              │
│         ┌────────────▼───────────▼────────────┐                │
│         │     Structured JSON Logging          │                │
│         │  (Cloud Logging compatible format)   │                │
│         └────────────────┬─────────────────────┘                │
│                          │                                      │
│         ┌────────────────▼─────────────────────┐                │
│         │          Cloud Logging               │                │
│         │  - Log-based metrics                 │                │
│         │  - Error pattern detection           │                │
│         │  - Audit trail storage               │                │
│         └────────────────┬─────────────────────┘                │
│                          │                                      │
│         ┌────────────────▼─────────────────────┐                │
│         │        Cloud Monitoring              │                │
│         │  - Dashboards                        │                │
│         │  - Alert policies                    │                │
│         │  - Uptime checks                     │                │
│         └────────────────┬─────────────────────┘                │
│                          │                                      │
│         ┌────────────────▼─────────────────────┐                │
│         │       Notification Channels          │                │
│         │  - Email alerts                      │                │
│         │  - PagerDuty (optional)              │                │
│         │  - Slack (optional)                  │                │
│         └──────────────────────────────────────┘                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Structured Logging (C1)

### Implementation

Located in: `packages/core/src/telemetry/logger.ts`

Features:
- Cloud Logging compatible JSON format
- Automatic telemetry context injection
- Secret/token redaction
- Trace correlation with Cloud Trace

### Log Entry Format

```json
{
  "severity": "INFO",
  "message": "Request completed",
  "timestamp": "2026-01-30T10:00:00.000Z",
  "logging.googleapis.com/labels": {
    "service": "gwi-api",
    "version": "0.5.1",
    "environment": "production"
  },
  "logging.googleapis.com/trace": "projects/git-with-intent/traces/abc123",
  "logging.googleapis.com/spanId": "def456",
  "tenantId": "tenant-123",
  "runId": "run-789",
  "requestId": "req-xyz",
  "httpRequest": {
    "requestMethod": "POST",
    "requestUrl": "/api/v1/runs",
    "status": 200,
    "latency": "0.234s"
  }
}
```

### Correlation IDs

| Field | Purpose | Source |
|-------|---------|--------|
| `traceId` | Distributed tracing | Cloud Trace or generated |
| `spanId` | Span within trace | Generated per request |
| `requestId` | Request identification | X-Request-ID header or generated |
| `runId` | GWI run identification | Run state machine |
| `tenantId` | Multi-tenant isolation | Auth context |
| `workItemId` | Work item tracking | Queue processing |

### Usage

```typescript
import { createLogger, Logger } from '@gwi/core';

const logger = createLogger('my-service');

// Basic logging
logger.info('Operation started', { operationId: '123' });
logger.error('Operation failed', error, { operationId: '123' });

// Specialized methods
logger.requestStart('POST', '/api/runs');
logger.requestEnd('POST', '/api/runs', 200, 234);
logger.jobStart('triage', 'job-123');
logger.jobEnd('triage', 'job-123', true, 1500);
logger.webhookReceived('push', 'delivery-456');
```

## Log-Based Metrics (C2)

### Critical Errors Metric

**Resource:** `google_logging_metric.critical_errors`

```hcl
filter = "severity >= ERROR AND resource.type = \"cloud_run_revision\""
```

Captures all ERROR and above log entries from Cloud Run services.

### Auth Failures Metric

**Resource:** `google_logging_metric.auth_failures`

```hcl
filter = "jsonPayload.eventName =~ \"auth.failure|auth.unauthorized|webhook.verify.failure\""
```

Tracks authentication and authorization failures.

### AI Errors Metric

**Resource:** `google_logging_metric.ai_errors`

```hcl
filter = "jsonPayload.eventName =~ \"ai.error|llm.error|agent.error\""
```

Monitors AI/LLM provider failures.

### Idempotency Metrics

| Metric | Purpose |
|--------|---------|
| `idempotency_duplicates` | Tracks duplicate request detection |
| `idempotency_checks` | Total idempotency key lookups |
| `idempotency_cleanup` | Expired entry cleanup operations |

## Dashboards (C3)

### Idempotency Dashboard

**Resource:** `google_monitoring_dashboard.idempotency`

**URL:** [Cloud Monitoring Console](https://console.cloud.google.com/monitoring/dashboards)

Widgets:
1. **Duplicate Detection Rate** - Ratio of duplicates to total checks
2. **Idempotency Checks** - Total check volume over time
3. **Key Expiration** - Cleanup job effectiveness
4. **Latency by Operation** - Performance tracking

### Accessing Dashboards

```bash
# List all dashboards
gcloud monitoring dashboards list --project=git-with-intent

# Open in browser
open "https://console.cloud.google.com/monitoring/dashboards?project=git-with-intent"
```

## Alert Policies (C4)

### Error Rate Alerts

| Service | Threshold | Window | Severity |
|---------|-----------|--------|----------|
| API | 5% error rate | 5 min | Critical |
| Gateway | 5% error rate | 5 min | Critical |
| Webhook | 5% error rate | 5 min | Warning |

### Latency Alerts

| Service | Threshold | Percentile | Window |
|---------|-----------|------------|--------|
| API | 5000ms | P95 | 5 min |

### Availability Alerts

| Check | Alert When | Duration |
|-------|------------|----------|
| Gateway Uptime | < 99% success | 5 min |
| API Uptime | < 99% success | 5 min |
| Webhook Uptime | < 99% success | 5 min |
| Worker Uptime | < 99% success | 5 min |

### Queue Alerts

| Condition | Threshold | Severity |
|-----------|-----------|----------|
| Queue Depth | > 100 | Warning |
| Queue Depth | > 500 | Critical |
| Message Age | > 10 min | Warning |

### Duplicate Rate Alert

Triggers when idempotency duplicate rate exceeds 10% in 5 minutes.

### Notification Channels

Configure via Terraform variable:
```hcl
variable "alert_email" {
  description = "Email address for alert notifications"
  type        = string
}
```

Or add custom channels:
```hcl
variable "alert_notification_channels" {
  description = "Additional notification channel IDs"
  type        = list(string)
  default     = []
}
```

## Uptime Checks (C5)

### Configured Checks

| Service | Endpoint | Period | Timeout |
|---------|----------|--------|---------|
| Gateway | `/health` | 5 min | 10s |
| Webhook | `/health` | 5 min | 10s |
| API | `/health` | 5 min | 10s |
| Worker | `/health` | 5 min | 10s |

### Health Check Response Format

```json
{
  "status": "healthy",
  "checks": {
    "database": "ok",
    "queue": "ok",
    "pubsub": "ok"
  },
  "uptime": 3600,
  "version": "0.5.1"
}
```

### Configuring Uptime Checks

```hcl
variable "uptime_check_period" {
  description = "Check period in seconds (60, 300, 600, or 900)"
  type        = number
  default     = 300
}

variable "uptime_check_timeout" {
  description = "Check timeout in seconds"
  type        = number
  default     = 10
}
```

## Operations

### Viewing Logs

```bash
# All Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision" \
  --project=git-with-intent \
  --limit=100

# Filter by service
gcloud logging read "resource.labels.service_name=gwi-api" \
  --project=git-with-intent \
  --limit=50

# Filter by severity
gcloud logging read "severity>=ERROR" \
  --project=git-with-intent \
  --limit=50

# Filter by trace
gcloud logging read "trace=\"projects/git-with-intent/traces/abc123\"" \
  --project=git-with-intent

# Filter by run ID
gcloud logging read "jsonPayload.runId=\"run-789\"" \
  --project=git-with-intent
```

### Viewing Metrics

```bash
# List log-based metrics
gcloud logging metrics list --project=git-with-intent

# Describe metric
gcloud logging metrics describe critical_errors --project=git-with-intent
```

### Managing Alerts

```bash
# List alert policies
gcloud alpha monitoring policies list --project=git-with-intent

# List notification channels
gcloud alpha monitoring channels list --project=git-with-intent

# Create incident from CLI (for testing)
gcloud alpha monitoring policies conditions list \
  --policy=POLICY_ID \
  --project=git-with-intent
```

### Checking Uptime

```bash
# List uptime checks
gcloud monitoring uptime-check-configs list --project=git-with-intent

# Check uptime status
open "https://console.cloud.google.com/monitoring/uptime?project=git-with-intent"
```

## Incident Response

### When Alert Fires

1. **Acknowledge** the alert in Cloud Monitoring
2. **Check logs** for the affected service
3. **Identify** the root cause using correlation IDs
4. **Mitigate** using appropriate runbook
5. **Resolve** and update incident status
6. **Post-mortem** if P1 or P2 severity

### Common Issues

#### High Error Rate

```bash
# Check recent errors
gcloud logging read \
  "severity>=ERROR AND resource.labels.service_name=gwi-api" \
  --project=git-with-intent \
  --limit=20 \
  --format="table(timestamp,jsonPayload.message,jsonPayload.error.message)"
```

#### Uptime Check Failure

1. Check Cloud Run service status
2. Verify health endpoint responds
3. Check for deployment in progress
4. Review container logs for startup errors

#### Queue Depth High

1. Check worker service health
2. Verify Pub/Sub subscription is active
3. Check for poison messages in DLQ
4. Scale worker if needed

## Infrastructure Reference

### Terraform Resources

| Resource | Purpose | File |
|----------|---------|------|
| `google_monitoring_notification_channel.email` | Email alerts | monitoring.tf |
| `google_monitoring_alert_policy.*` | Alert definitions | monitoring.tf |
| `google_monitoring_uptime_check_config.*` | Uptime checks | monitoring.tf |
| `google_logging_metric.*` | Log-based metrics | monitoring.tf |
| `google_monitoring_dashboard.*` | Dashboards | monitoring.tf |

### Key Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `enable_alerts` | `true` | Enable/disable alerting |
| `error_rate_threshold` | `5` | Error rate % threshold |
| `latency_threshold_ms` | `5000` | P95 latency threshold |
| `alert_email` | `""` | Alert email address |
| `uptime_check_period` | `300` | Check interval (seconds) |
| `queue_depth_threshold` | `100` | Warning threshold |
| `queue_depth_critical_threshold` | `500` | Critical threshold |

### Deployment

```bash
# Apply monitoring changes
cd infra
tofu plan -var-file=envs/prod.tfvars
tofu apply -var-file=envs/prod.tfvars
```

## Related Documentation

- [Health Endpoints](./packages/core/src/health/README.md)
- [Disaster Recovery Runbook](./000-docs/112-DR-RUNB-disaster-recovery-runbook.md)
- [PubSub DLQ Management](./000-docs/029-OD-RUNB-pubsub-dlq-management.md)
- [Firebase Hosting Operations](./000-docs/031-OD-RUNB-firebase-hosting-operations.md)
