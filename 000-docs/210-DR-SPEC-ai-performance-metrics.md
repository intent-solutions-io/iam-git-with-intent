# AI Workload Performance Metrics Specification

> **Document**: 210-DR-SPEC-ai-performance-metrics
> **Epic**: EPIC 015 - Observability Export + AI Workload Performance Tuning
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Comprehensive metrics specification for AI/LLM workload performance monitoring in GWI. Covers latency tracking (P50/P95/P99), token usage, cost attribution, and model performance comparison.

---

## AI Metrics Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AI WORKLOAD METRICS                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │                    Agent Invocation                           │       │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │       │
│  │  │ Triage  │  │ Coder   │  │Resolver │  │Reviewer │          │       │
│  │  │ Agent   │  │ Agent   │  │ Agent   │  │ Agent   │          │       │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘          │       │
│  │       │            │            │            │                │       │
│  │       └────────────┴─────┬──────┴────────────┘                │       │
│  │                          │                                    │       │
│  │  ┌───────────────────────▼────────────────────────────┐      │       │
│  │  │              LLM Provider Layer                     │      │       │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │      │       │
│  │  │  │Anthropic │  │ Google   │  │ OpenAI   │          │      │       │
│  │  │  │Claude 4  │  │ Gemini   │  │ GPT-4o   │          │      │       │
│  │  │  └──────────┘  └──────────┘  └──────────┘          │      │       │
│  │  └────────────────────────────────────────────────────┘      │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │                    Metrics Collection                         │       │
│  │  • Latency (P50, P95, P99)                                   │       │
│  │  • Token counts (input, output, total)                       │       │
│  │  • Cost per invocation                                       │       │
│  │  • Error rates by model/agent                                │       │
│  │  • Retry counts and backoff durations                        │       │
│  │  • Cache hit rates                                           │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core AI Metrics

### Latency Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `gwi_ai_request_duration_ms` | histogram | agent, model, provider | Total request duration |
| `gwi_ai_time_to_first_token_ms` | histogram | agent, model, provider | Time to first token (streaming) |
| `gwi_ai_thinking_duration_ms` | histogram | agent, model | Extended thinking time (Claude) |
| `gwi_ai_queue_wait_ms` | histogram | agent, model | Time waiting in request queue |

### Token Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `gwi_ai_tokens_input_total` | counter | agent, model, provider | Input tokens consumed |
| `gwi_ai_tokens_output_total` | counter | agent, model, provider | Output tokens generated |
| `gwi_ai_tokens_thinking_total` | counter | agent, model | Thinking tokens (extended thinking) |
| `gwi_ai_tokens_cached_total` | counter | agent, model, provider | Tokens served from cache |
| `gwi_ai_context_utilization` | gauge | agent, model | Context window usage (0-1) |

### Cost Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `gwi_ai_cost_usd` | counter | agent, model, provider, tenant | Cost in USD |
| `gwi_ai_cost_per_run` | histogram | workflow_type | Cost per complete run |
| `gwi_ai_cost_efficiency` | gauge | agent, model | Tokens per dollar |

### Quality Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `gwi_ai_success_rate` | gauge | agent, model | Successful completions ratio |
| `gwi_ai_retry_total` | counter | agent, model, reason | Retry attempts |
| `gwi_ai_fallback_total` | counter | agent, from_model, to_model | Model fallback events |
| `gwi_ai_rate_limit_hits` | counter | provider | Rate limit encounters |

---

## Percentile Tracking Implementation

### Histogram Buckets

```typescript
// AI-optimized latency buckets (milliseconds)
export const AI_LATENCY_BUCKETS = {
  boundaries: [
    100,    // Ultra-fast (cached)
    250,    // Fast tier-1 models
    500,    // Normal tier-1
    1000,   // 1 second
    2500,   // Normal tier-3
    5000,   // 5 seconds
    10000,  // Complex tier-3
    30000,  // Extended thinking
    60000,  // Very complex
    120000, // Maximum timeout
  ],
};

// Token count buckets
export const TOKEN_COUNT_BUCKETS = {
  boundaries: [
    100,    // Small prompt
    500,    // Medium prompt
    1000,   // Large prompt
    2500,   // Very large
    5000,   // Near context limit
    10000,  // Multi-turn
    25000,  // Extended context
    50000,  // Large context models
    100000, // Maximum context
  ],
};
```

### Percentile Calculation

```typescript
interface PercentileMetrics {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  min: number;
  avg: number;
  count: number;
}

/**
 * Calculate percentiles from histogram
 */
export function calculatePercentiles(histogram: Histogram): PercentileMetrics {
  return {
    p50: histogram.getPercentile(50) ?? 0,
    p75: histogram.getPercentile(75) ?? 0,
    p90: histogram.getPercentile(90) ?? 0,
    p95: histogram.getPercentile(95) ?? 0,
    p99: histogram.getPercentile(99) ?? 0,
    max: histogram.getMax(),
    min: histogram.getMin(),
    avg: histogram.getAverage(),
    count: histogram.getCount(),
  };
}
```

---

## Agent-Specific Metrics

### Triage Agent

```typescript
const triageMetrics = {
  // Latency
  gwi_triage_duration_ms: histogram(['complexity_score']),
  gwi_triage_file_analysis_ms: histogram(['file_type']),

  // Accuracy
  gwi_triage_complexity_distribution: histogram([]), // Complexity scores
  gwi_triage_prediction_accuracy: gauge([]),         // Actual vs predicted

  // Efficiency
  gwi_triage_tokens_per_file: histogram([]),
  gwi_triage_cache_hit_rate: gauge([]),
};
```

### Coder Agent

```typescript
const coderMetrics = {
  // Latency
  gwi_coder_duration_ms: histogram(['model', 'task_type']),
  gwi_coder_planning_duration_ms: histogram(['model']),
  gwi_coder_execution_duration_ms: histogram(['model']),

  // Quality
  gwi_coder_first_attempt_success: gauge(['model']),
  gwi_coder_iterations_required: histogram(['model']),
  gwi_coder_lint_errors_generated: counter(['model', 'error_type']),

  // Output
  gwi_coder_lines_generated: counter(['model', 'language']),
  gwi_coder_files_modified: counter(['model']),
};
```

### Resolver Agent

```typescript
const resolverMetrics = {
  // Latency
  gwi_resolver_duration_ms: histogram(['model', 'conflict_type']),
  gwi_resolver_analysis_duration_ms: histogram(['model']),
  gwi_resolver_merge_duration_ms: histogram(['model']),

  // Quality
  gwi_resolver_success_rate: gauge(['model', 'conflict_type']),
  gwi_resolver_manual_intervention_rate: gauge(['conflict_type']),

  // Complexity
  gwi_resolver_conflicts_per_file: histogram([]),
  gwi_resolver_lines_affected: histogram([]),
};
```

### Reviewer Agent

```typescript
const reviewerMetrics = {
  // Latency
  gwi_reviewer_duration_ms: histogram(['model', 'pr_size']),

  // Output quality
  gwi_reviewer_issues_found: counter(['severity', 'category']),
  gwi_reviewer_suggestions_accepted: gauge([]),

  // Coverage
  gwi_reviewer_files_analyzed: histogram([]),
  gwi_reviewer_coverage_ratio: gauge([]),
};
```

---

## Model Performance Comparison

### Per-Model Dashboard Metrics

```typescript
interface ModelPerformanceSnapshot {
  model: string;
  provider: string;

  // Latency
  latency: {
    p50: number;
    p95: number;
    p99: number;
  };

  // Throughput
  throughput: {
    requestsPerSecond: number;
    tokensPerSecond: number;
  };

  // Cost
  cost: {
    perMilTokensInput: number;
    perMilTokensOutput: number;
    avgCostPerRequest: number;
  };

  // Quality
  quality: {
    successRate: number;
    retryRate: number;
    errorRate: number;
  };

  // Usage
  usage: {
    totalRequests: number;
    totalTokens: number;
    avgContextUtilization: number;
  };
}
```

### Model Selection Metrics

```typescript
const modelSelectionMetrics = {
  // Routing decisions
  gwi_model_selected_total: counter(['agent', 'model', 'reason']),
  gwi_model_fallback_total: counter(['from_model', 'to_model', 'reason']),

  // Cost optimization
  gwi_model_cost_savings_usd: counter(['agent']),
  gwi_model_upgrade_total: counter(['from_tier', 'to_tier']),
  gwi_model_downgrade_total: counter(['from_tier', 'to_tier']),
};
```

---

## SLOs for AI Workloads

### Latency SLOs

| SLO | Target | Window | Metric |
|-----|--------|--------|--------|
| Triage P95 | < 5s | 24h | `gwi_triage_duration_ms` |
| Coder P95 | < 30s | 24h | `gwi_coder_duration_ms` |
| Resolver P95 | < 60s | 24h | `gwi_resolver_duration_ms` |
| Reviewer P95 | < 15s | 24h | `gwi_reviewer_duration_ms` |

### Success Rate SLOs

| SLO | Target | Window | Metric |
|-----|--------|--------|--------|
| Agent Success Rate | > 95% | 7d | `gwi_ai_success_rate` |
| First-Attempt Success | > 80% | 7d | `gwi_coder_first_attempt_success` |
| Resolver Success | > 90% | 7d | `gwi_resolver_success_rate` |

### Cost SLOs

| SLO | Target | Window | Metric |
|-----|--------|--------|--------|
| Max Cost per Run | < $1 | per-run | `gwi_ai_cost_per_run` |
| Avg Cost per Run | < $0.25 | 7d avg | `gwi_ai_cost_per_run` |

---

## Recording Rules (Prometheus)

```yaml
# prometheus-rules.yaml
groups:
  - name: gwi_ai_metrics
    interval: 15s
    rules:
      # Latency percentiles
      - record: gwi:ai_latency:p50
        expr: histogram_quantile(0.50, rate(gwi_ai_request_duration_ms_bucket[5m]))

      - record: gwi:ai_latency:p95
        expr: histogram_quantile(0.95, rate(gwi_ai_request_duration_ms_bucket[5m]))

      - record: gwi:ai_latency:p99
        expr: histogram_quantile(0.99, rate(gwi_ai_request_duration_ms_bucket[5m]))

      # Success rate
      - record: gwi:ai_success_rate:5m
        expr: |
          sum(rate(gwi_ai_requests_total{status="success"}[5m]))
          /
          sum(rate(gwi_ai_requests_total[5m]))

      # Cost rate
      - record: gwi:ai_cost_rate:hourly
        expr: sum(increase(gwi_ai_cost_usd[1h]))

      # Token throughput
      - record: gwi:ai_tokens:rate5m
        expr: sum(rate(gwi_ai_tokens_output_total[5m]))

      # Model comparison
      - record: gwi:model_latency:p95_by_model
        expr: |
          histogram_quantile(0.95,
            sum by (model, le) (rate(gwi_ai_request_duration_ms_bucket[5m]))
          )
```

---

## Alerting Rules

```yaml
# alerts.yaml
groups:
  - name: gwi_ai_alerts
    rules:
      - alert: AILatencyHigh
        expr: gwi:ai_latency:p95 > 30000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "AI latency P95 above 30s"
          description: "Agent {{ $labels.agent }} P95 latency is {{ $value }}ms"

      - alert: AISuccessRateLow
        expr: gwi:ai_success_rate:5m < 0.90
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "AI success rate below 90%"

      - alert: AITokenBudgetExceeded
        expr: increase(gwi_ai_tokens_output_total[1h]) > 1000000
        for: 0m
        labels:
          severity: warning
        annotations:
          summary: "High token usage in the last hour"

      - alert: AIProviderErrors
        expr: increase(gwi_ai_retry_total{reason="provider_error"}[5m]) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Multiple provider errors detected"

      - alert: AIRateLimited
        expr: increase(gwi_ai_rate_limit_hits[5m]) > 5
        for: 0m
        labels:
          severity: warning
        annotations:
          summary: "AI provider rate limiting detected"
```

---

## Cost Attribution

### Per-Tenant Cost Tracking

```typescript
interface TenantCostReport {
  tenantId: string;
  period: { start: Date; end: Date };

  // Breakdown by model
  byModel: Record<string, {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    cost: number;
  }>;

  // Breakdown by agent
  byAgent: Record<string, {
    invocations: number;
    avgDuration: number;
    cost: number;
  }>;

  // Totals
  totals: {
    requests: number;
    tokens: number;
    cost: number;
    avgCostPerRun: number;
  };
}
```

### Cost Calculation

```typescript
// Model pricing (per 1M tokens)
const MODEL_PRICING: Record<string, { input: number; output: number; thinking?: number }> = {
  'claude-opus-4': { input: 15.00, output: 75.00, thinking: 15.00 },
  'claude-sonnet-4': { input: 3.00, output: 15.00, thinking: 3.00 },
  'claude-3-5-haiku': { input: 0.80, output: 4.00 },
  'gemini-2.0-flash': { input: 0.075, output: 0.30 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
};

function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  thinkingTokens: number = 0
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;

  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output +
    (thinkingTokens / 1_000_000) * (pricing.thinking ?? 0)
  );
}
```

---

## Implementation Checklist

- [ ] Add AI-specific histogram buckets
- [ ] Implement per-agent metrics
- [ ] Add token tracking middleware
- [ ] Create cost calculation utilities
- [ ] Set up recording rules
- [ ] Configure alerting rules
- [ ] Build Grafana dashboards (see 211-DR-TMPL)
- [ ] Add SLO tracking
- [ ] Implement tenant cost reporting

---

## Related Documentation

- [209-DR-SPEC-observability-export-specification.md](./209-DR-SPEC-observability-export-specification.md)
- [211-DR-TMPL-grafana-dashboards.md](./211-DR-TMPL-grafana-dashboards.md)
- [111-DR-TARG-slo-sla-targets.md](./111-DR-TARG-slo-sla-targets.md)
