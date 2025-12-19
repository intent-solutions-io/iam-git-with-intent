# AAR: Idempotency Dashboard Metrics

> **Phase**: A (Platform Core Runtime)
> **Date**: 2024-12-19
> **Status**: Complete
> **Epic**: Dashboard Metrics for Duplicate Rate Monitoring

## Summary

Added comprehensive dashboard metrics for monitoring the idempotency layer. This includes:
- JSON and Prometheus-format metrics endpoints in API and Gateway services
- Log-based metrics for duplicate detection in Cloud Monitoring
- A dedicated Cloud Monitoring dashboard for idempotency observability
- Alert for high duplicate rates

## What Was Completed

### 1. Metrics Endpoints

Added `/metrics` and `/metrics/prometheus` endpoints to API and Gateway services:

**JSON Metrics (/metrics)**:
```json
{
  "idempotency": {
    "checksTotal": 150,
    "newRequests": 140,
    "duplicatesSkipped": 10,
    "duplicateRate": "6.67%",
    "processingConflicts": 0,
    "lockRecoveries": 0,
    "completedTotal": 140,
    "failedTotal": 0,
    "ttlCleanups": 0,
    "bySource": {
      "github_webhook": { "checks": 50, "new": 48, "duplicates": 2 },
      "api": { "checks": 100, "new": 92, "duplicates": 8 }
    }
  }
}
```

**Prometheus Format (/metrics/prometheus)**:
```
gwi_idempotency_checks_total{service="gwi",component="idempotency"} 150
gwi_idempotency_duplicates_skipped_total{service="gwi",component="idempotency"} 10
gwi_idempotency_checks_by_source{service="gwi",component="idempotency",source="github_webhook"} 50
gwi_idempotency_duplicates_by_source{service="gwi",component="idempotency",source="api"} 8
```

### 2. Log-Based Metrics (OpenTofu)

| Metric | Description |
|--------|-------------|
| `gwi-idempotency-duplicates-{env}` | Count of duplicate requests detected |
| `gwi-idempotency-checks-{env}` | Total idempotency checks performed |
| `gwi-idempotency-cleanup-{env}` | Records cleaned by TTL job |

### 3. Cloud Monitoring Dashboard

Created a mosaic-layout dashboard with:

| Widget | Type | Description |
|--------|------|-------------|
| Duplicate Rate | Scorecard | Real-time duplicate rate with thresholds (yellow: 10%, red: 50%) |
| Idempotency Checks | Scorecard | Total checks in last hour |
| Records Cleaned | Scorecard | TTL cleanup count in last 24 hours |
| Duplicates Over Time | Line Chart | 5-minute resolution, by service |
| Checks Over Time | Stacked Area | 5-minute resolution, by service |
| Duplicates by Service | Stacked Bar | Hourly breakdown by service |
| TTL Cleanup History | Line Chart | Hourly cleanup counts |

### 4. High Duplicate Rate Alert

Added alert policy that triggers when duplicate rate exceeds 50% for 5 minutes.

## Files Modified

| File | Change |
|------|--------|
| `apps/api/src/index.ts` | Added idempotency metrics to `/metrics`, added `/metrics/prometheus` |
| `apps/gateway/src/index.ts` | Added `/metrics` and `/metrics/prometheus` endpoints |
| `infra/monitoring.tf` | Added log-based metrics, dashboard, and alert policy |

## Metrics Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloud Monitoring                              │
├─────────────────────────────────────────────────────────────────┤
│  Dashboard: GWI Idempotency Dashboard                           │
│  ├─ Duplicate Rate (scorecard)                                  │
│  ├─ Checks Count (scorecard)                                    │
│  ├─ Cleanup Count (scorecard)                                   │
│  ├─ Duplicates Over Time (line chart)                           │
│  ├─ Checks Over Time (stacked area)                             │
│  ├─ Duplicates by Service (stacked bar)                         │
│  └─ TTL Cleanup History (line chart)                            │
├─────────────────────────────────────────────────────────────────┤
│  Log-Based Metrics:                                             │
│  ├─ gwi-idempotency-duplicates-{env}                           │
│  ├─ gwi-idempotency-checks-{env}                               │
│  └─ gwi-idempotency-cleanup-{env}                              │
├─────────────────────────────────────────────────────────────────┤
│  Alert: High Duplicate Rate (> 50% for 5 min)                   │
└─────────────────────────────────────────────────────────────────┘
          ▲                    ▲                    ▲
          │ Logs               │ Logs               │ Logs
┌─────────┴───────┐  ┌─────────┴───────┐  ┌────────┴────────┐
│   GWI API       │  │   GWI Gateway   │  │   GWI Worker    │
│   /metrics      │  │   /metrics      │  │   /tasks/...    │
│   /metrics/prom │  │   /metrics/prom │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Key Metrics

| Metric | Purpose | Alert Threshold |
|--------|---------|-----------------|
| `duplicateRate` | Percentage of requests that are duplicates | 50% |
| `checksTotal` | Total idempotency checks | - |
| `newRequests` | Requests that proceeded normally | - |
| `duplicatesSkipped` | Duplicate requests returned from cache | - |
| `processingConflicts` | Requests that hit a processing lock | - |
| `ttlCleanups` | Records cleaned up by scheduler | - |

## Usage

### Accessing Metrics

```bash
# JSON format
curl https://gwi-api-xxx.run.app/metrics

# Prometheus format (for scraping)
curl https://gwi-api-xxx.run.app/metrics/prometheus
```

### Dashboard Access

After deployment, access the dashboard at:
```
https://console.cloud.google.com/monitoring/dashboards?project=git-with-intent
```

Look for: "GWI Idempotency Dashboard (prod)"

## Test Results

```
Build:    12 successful
Tests:    23 successful
OpenTofu: Valid
```

## Next Steps

1. Deploy updated services with metrics endpoints
2. Apply OpenTofu changes for log-based metrics and dashboard
3. Configure Prometheus scraper if using Grafana
4. Set up additional alert policies as needed

## Evidence

```bash
# Build
$ npm run build
Tasks: 12 successful, 12 total

# Tests
$ npm run test
Tasks: 23 successful, 23 total

# OpenTofu Validate
$ cd infra && tofu validate
Success! The configuration is valid.
```
