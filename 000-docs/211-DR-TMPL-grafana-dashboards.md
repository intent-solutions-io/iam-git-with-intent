# Grafana Dashboard Templates

> **Document**: 211-DR-TMPL-grafana-dashboards
> **Epic**: EPIC 015 - Observability Export + AI Workload Performance Tuning
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Pre-built Grafana dashboard templates for GWI observability. Includes AI performance, system health, and cost tracking dashboards.

---

## Dashboard Index

| Dashboard | Purpose | Audience |
|-----------|---------|----------|
| GWI Overview | High-level system health | All |
| AI Performance | LLM latency, tokens, costs | Engineering |
| Agent Deep-Dive | Per-agent metrics | Engineering |
| Cost Analytics | Usage and cost tracking | Finance/Ops |
| SLO Dashboard | SLI/SLO burn rate | SRE |

---

## 1. GWI Overview Dashboard

### Panel Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        GWI SYSTEM OVERVIEW                               │
├─────────────────┬─────────────────┬─────────────────┬───────────────────┤
│   Request Rate  │   Error Rate    │   Latency P95   │  Active Runs      │
│      (stat)     │     (stat)      │     (stat)      │    (stat)         │
├─────────────────┴─────────────────┴─────────────────┴───────────────────┤
│                                                                          │
│                       Request Rate Over Time                             │
│                        (time series graph)                               │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                       Latency Distribution                               │
│                         (heatmap)                                        │
│                                                                          │
├─────────────────────────────────┬───────────────────────────────────────┤
│      Service Health             │        Run Status                      │
│        (table)                  │        (pie chart)                     │
├─────────────────────────────────┴───────────────────────────────────────┤
│                                                                          │
│                       Error Rate by Service                              │
│                        (time series)                                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### JSON Definition

```json
{
  "dashboard": {
    "title": "GWI Overview",
    "uid": "gwi-overview",
    "tags": ["gwi", "overview"],
    "timezone": "browser",
    "refresh": "30s",
    "time": {
      "from": "now-6h",
      "to": "now"
    },
    "panels": [
      {
        "title": "Request Rate",
        "type": "stat",
        "gridPos": { "x": 0, "y": 0, "w": 6, "h": 4 },
        "targets": [
          {
            "expr": "sum(rate(gwi_http_requests_total[5m]))",
            "legendFormat": "req/s"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "reqps",
            "thresholds": {
              "mode": "absolute",
              "steps": [
                { "color": "green", "value": null },
                { "color": "yellow", "value": 100 },
                { "color": "red", "value": 500 }
              ]
            }
          }
        }
      },
      {
        "title": "Error Rate",
        "type": "stat",
        "gridPos": { "x": 6, "y": 0, "w": 6, "h": 4 },
        "targets": [
          {
            "expr": "sum(rate(gwi_http_requests_total{status=~\"5..\"}[5m])) / sum(rate(gwi_http_requests_total[5m])) * 100",
            "legendFormat": "errors"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "thresholds": {
              "mode": "absolute",
              "steps": [
                { "color": "green", "value": null },
                { "color": "yellow", "value": 1 },
                { "color": "red", "value": 5 }
              ]
            }
          }
        }
      },
      {
        "title": "Latency P95",
        "type": "stat",
        "gridPos": { "x": 12, "y": 0, "w": 6, "h": 4 },
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(gwi_http_request_duration_ms_bucket[5m])) by (le))",
            "legendFormat": "P95"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "ms",
            "thresholds": {
              "mode": "absolute",
              "steps": [
                { "color": "green", "value": null },
                { "color": "yellow", "value": 500 },
                { "color": "red", "value": 2000 }
              ]
            }
          }
        }
      },
      {
        "title": "Active Runs",
        "type": "stat",
        "gridPos": { "x": 18, "y": 0, "w": 6, "h": 4 },
        "targets": [
          {
            "expr": "sum(gwi_runs_active)",
            "legendFormat": "runs"
          }
        ]
      },
      {
        "title": "Request Rate Over Time",
        "type": "timeseries",
        "gridPos": { "x": 0, "y": 4, "w": 24, "h": 8 },
        "targets": [
          {
            "expr": "sum(rate(gwi_http_requests_total[5m])) by (method)",
            "legendFormat": "{{method}}"
          }
        ]
      },
      {
        "title": "Latency Heatmap",
        "type": "heatmap",
        "gridPos": { "x": 0, "y": 12, "w": 24, "h": 8 },
        "targets": [
          {
            "expr": "sum(increase(gwi_http_request_duration_ms_bucket[5m])) by (le)",
            "format": "heatmap",
            "legendFormat": "{{le}}"
          }
        ]
      }
    ]
  }
}
```

---

## 2. AI Performance Dashboard

### Panel Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      AI PERFORMANCE METRICS                              │
├─────────────────┬─────────────────┬─────────────────┬───────────────────┤
│  AI Requests/s  │  Success Rate   │  Tokens/min     │  Cost (hourly)    │
│     (stat)      │    (gauge)      │    (stat)       │    (stat)         │
├─────────────────┴─────────────────┴─────────────────┴───────────────────┤
│                                                                          │
│                    AI Latency by Model (P50/P95/P99)                     │
│                         (time series)                                    │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                      Token Usage by Agent                                │
│                        (stacked bar)                                     │
│                                                                          │
├─────────────────────────────────┬───────────────────────────────────────┤
│    Model Comparison Table       │    Error Distribution                  │
│         (table)                 │       (pie chart)                      │
├─────────────────────────────────┴───────────────────────────────────────┤
│                                                                          │
│                      Cost Trend Over Time                                │
│                        (time series)                                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Panels

#### AI Latency Percentiles

```json
{
  "title": "AI Latency by Model",
  "type": "timeseries",
  "targets": [
    {
      "expr": "histogram_quantile(0.50, sum(rate(gwi_ai_request_duration_ms_bucket[5m])) by (model, le))",
      "legendFormat": "{{model}} P50"
    },
    {
      "expr": "histogram_quantile(0.95, sum(rate(gwi_ai_request_duration_ms_bucket[5m])) by (model, le))",
      "legendFormat": "{{model}} P95"
    },
    {
      "expr": "histogram_quantile(0.99, sum(rate(gwi_ai_request_duration_ms_bucket[5m])) by (model, le))",
      "legendFormat": "{{model}} P99"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "unit": "ms",
      "custom": {
        "drawStyle": "line",
        "lineWidth": 2
      }
    }
  }
}
```

#### Token Usage by Agent

```json
{
  "title": "Token Usage by Agent",
  "type": "timeseries",
  "targets": [
    {
      "expr": "sum(rate(gwi_ai_tokens_input_total[5m])) by (agent)",
      "legendFormat": "{{agent}} input"
    },
    {
      "expr": "sum(rate(gwi_ai_tokens_output_total[5m])) by (agent)",
      "legendFormat": "{{agent}} output"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "unit": "none",
      "custom": {
        "drawStyle": "bars",
        "stacking": { "mode": "normal" }
      }
    }
  }
}
```

#### Model Comparison Table

```json
{
  "title": "Model Performance Comparison",
  "type": "table",
  "targets": [
    {
      "expr": "histogram_quantile(0.95, sum(rate(gwi_ai_request_duration_ms_bucket[1h])) by (model, le))",
      "legendFormat": "{{model}}",
      "instant": true,
      "format": "table"
    }
  ],
  "transformations": [
    {
      "id": "organize",
      "options": {
        "renameByName": {
          "Value": "P95 Latency (ms)"
        }
      }
    }
  ],
  "fieldConfig": {
    "overrides": [
      {
        "matcher": { "id": "byName", "options": "P95 Latency (ms)" },
        "properties": [
          { "id": "unit", "value": "ms" },
          { "id": "decimals", "value": 0 }
        ]
      }
    ]
  }
}
```

---

## 3. Agent Deep-Dive Dashboard

### Variables

```json
{
  "templating": {
    "list": [
      {
        "name": "agent",
        "type": "query",
        "query": "label_values(gwi_agent_invocations_total, agent_type)",
        "current": { "text": "All", "value": "$__all" },
        "includeAll": true
      },
      {
        "name": "model",
        "type": "query",
        "query": "label_values(gwi_agent_invocations_total, model)",
        "current": { "text": "All", "value": "$__all" },
        "includeAll": true
      }
    ]
  }
}
```

### Panels

#### Agent Invocation Rate

```json
{
  "title": "Invocations by Agent",
  "type": "timeseries",
  "targets": [
    {
      "expr": "sum(rate(gwi_agent_invocations_total{agent_type=~\"$agent\"}[5m])) by (agent_type)",
      "legendFormat": "{{agent_type}}"
    }
  ]
}
```

#### Agent Success Rate

```json
{
  "title": "Success Rate by Agent",
  "type": "gauge",
  "targets": [
    {
      "expr": "1 - (sum(rate(gwi_agent_errors_total{agent_type=~\"$agent\"}[1h])) / sum(rate(gwi_agent_invocations_total{agent_type=~\"$agent\"}[1h])))",
      "legendFormat": "{{agent_type}}"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "unit": "percentunit",
      "min": 0,
      "max": 1,
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "red", "value": null },
          { "color": "yellow", "value": 0.9 },
          { "color": "green", "value": 0.95 }
        ]
      }
    }
  }
}
```

#### Agent Latency Distribution

```json
{
  "title": "Latency Distribution (${agent})",
  "type": "histogram",
  "targets": [
    {
      "expr": "sum(increase(gwi_agent_duration_ms_bucket{agent_type=~\"$agent\"}[1h])) by (le)",
      "legendFormat": "{{le}}"
    }
  ]
}
```

---

## 4. Cost Analytics Dashboard

### Panels

#### Hourly Cost Trend

```json
{
  "title": "Hourly AI Cost",
  "type": "timeseries",
  "targets": [
    {
      "expr": "sum(increase(gwi_ai_cost_usd[1h])) by (model)",
      "legendFormat": "{{model}}"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "unit": "currencyUSD",
      "custom": {
        "drawStyle": "bars",
        "stacking": { "mode": "normal" }
      }
    }
  }
}
```

#### Cost per Run Distribution

```json
{
  "title": "Cost per Run",
  "type": "histogram",
  "targets": [
    {
      "expr": "sum(increase(gwi_ai_cost_per_run_bucket[24h])) by (le)",
      "legendFormat": "{{le}}"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "unit": "currencyUSD"
    }
  }
}
```

#### Cost by Tenant (Top 10)

```json
{
  "title": "Top 10 Tenants by Cost",
  "type": "bargauge",
  "targets": [
    {
      "expr": "topk(10, sum(increase(gwi_ai_cost_usd[24h])) by (tenant))",
      "legendFormat": "{{tenant}}"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "unit": "currencyUSD"
    }
  }
}
```

#### Token Efficiency

```json
{
  "title": "Token Efficiency (tokens per $)",
  "type": "stat",
  "targets": [
    {
      "expr": "sum(rate(gwi_ai_tokens_output_total[1h])) / sum(rate(gwi_ai_cost_usd[1h]))",
      "legendFormat": "tokens/$"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "unit": "short",
      "decimals": 0
    }
  }
}
```

---

## 5. SLO Dashboard

### SLO Panels

#### Availability SLO

```json
{
  "title": "API Availability (Target: 99.9%)",
  "type": "gauge",
  "targets": [
    {
      "expr": "1 - (sum(rate(gwi_http_requests_total{status=~\"5..\"}[30d])) / sum(rate(gwi_http_requests_total[30d])))",
      "legendFormat": "Availability"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "unit": "percentunit",
      "min": 0.99,
      "max": 1,
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "red", "value": null },
          { "color": "yellow", "value": 0.995 },
          { "color": "green", "value": 0.999 }
        ]
      }
    }
  }
}
```

#### Latency SLO Burn Rate

```json
{
  "title": "Latency SLO Burn Rate",
  "type": "timeseries",
  "targets": [
    {
      "expr": "sum(rate(gwi_http_request_duration_ms_bucket{le=\"500\"}[1h])) / sum(rate(gwi_http_request_duration_ms_count[1h]))",
      "legendFormat": "< 500ms"
    },
    {
      "expr": "0.95",
      "legendFormat": "Target (95%)"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "unit": "percentunit"
    }
  }
}
```

#### Error Budget Remaining

```json
{
  "title": "Error Budget Remaining",
  "type": "stat",
  "targets": [
    {
      "expr": "(0.001 - (1 - sum(rate(gwi_http_requests_total{status!~\"5..\"}[30d])) / sum(rate(gwi_http_requests_total[30d])))) / 0.001 * 100",
      "legendFormat": "Budget"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "unit": "percent",
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "red", "value": null },
          { "color": "yellow", "value": 25 },
          { "color": "green", "value": 50 }
        ]
      }
    }
  }
}
```

---

## Installation

### Import via Grafana UI

1. Navigate to Dashboards → Import
2. Paste JSON or upload file
3. Select Prometheus data source
4. Click Import

### Import via API

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GRAFANA_API_KEY" \
  -d @dashboard.json \
  https://grafana.example.com/api/dashboards/db
```

### Provisioning

```yaml
# grafana/provisioning/dashboards/gwi.yaml
apiVersion: 1
providers:
  - name: 'gwi'
    orgId: 1
    folder: 'GWI'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    options:
      path: /var/lib/grafana/dashboards/gwi
```

---

## Alert Integration

### Link Alerts to Panels

```json
{
  "alert": {
    "alertRuleTags": {},
    "conditions": [
      {
        "evaluator": {
          "params": [0.95],
          "type": "lt"
        },
        "operator": {
          "type": "and"
        },
        "query": {
          "params": ["A", "5m", "now"]
        },
        "reducer": {
          "params": [],
          "type": "avg"
        },
        "type": "query"
      }
    ],
    "executionErrorState": "alerting",
    "for": "5m",
    "frequency": "1m",
    "handler": 1,
    "name": "AI Success Rate Alert",
    "noDataState": "no_data",
    "notifications": [
      { "uid": "slack-notifications" }
    ]
  }
}
```

---

## Related Documentation

- [209-DR-SPEC-observability-export-specification.md](./209-DR-SPEC-observability-export-specification.md)
- [210-DR-SPEC-ai-performance-metrics.md](./210-DR-SPEC-ai-performance-metrics.md)
- [032-OD-RUNB-observability-operations.md](./032-OD-RUNB-observability-operations.md)
