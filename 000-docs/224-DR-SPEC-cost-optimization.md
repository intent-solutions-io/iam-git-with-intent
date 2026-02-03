# Cost Optimization & Budget Alerts Specification

> **Document**: 224-DR-SPEC-cost-optimization
> **Epic**: EPIC 013 - Cost Optimization + Budget Alerts
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Cost visibility and control are critical for sustainable AI operations. This spec defines cost tracking, budget alerts, and optimization strategies for GWI.

---

## Cost Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COST TRACKING ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       COST SOURCES                                   │    │
│  ├─────────────┬─────────────┬─────────────┬─────────────┬─────────────┤    │
│  │   AI/LLM    │   Cloud     │   Storage   │   Network   │   Compute   │    │
│  │   Tokens    │    Run      │  Firestore  │   Egress    │   Workers   │    │
│  └──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┘    │
│         │             │             │             │             │           │
│         ▼             ▼             ▼             ▼             ▼           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    COST AGGREGATION LAYER                           │    │
│  │  • Per-run attribution                                              │    │
│  │  • Per-tenant rollup                                                │    │
│  │  • Per-agent breakdown                                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      BUDGET ENFORCEMENT                             │    │
│  │  • Real-time tracking                                               │    │
│  │  • Alert thresholds (50%, 80%, 90%, 100%)                          │    │
│  │  • Automatic throttling                                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Cost Categories

### 1. AI/LLM Costs

| Provider | Model | Input Cost | Output Cost | Unit |
|----------|-------|------------|-------------|------|
| Anthropic | claude-opus-4 | $15.00 | $75.00 | 1M tokens |
| Anthropic | claude-sonnet-4 | $3.00 | $15.00 | 1M tokens |
| Anthropic | claude-3-5-haiku | $0.25 | $1.25 | 1M tokens |
| OpenAI | gpt-4o | $2.50 | $10.00 | 1M tokens |
| OpenAI | gpt-4o-mini | $0.15 | $0.60 | 1M tokens |
| Google | gemini-2.0-flash | $0.075 | $0.30 | 1M tokens |
| Google | gemini-1.5-pro | $1.25 | $5.00 | 1M tokens |

### 2. GCP Infrastructure Costs

| Service | Resource | Cost | Unit |
|---------|----------|------|------|
| Cloud Run | CPU | $0.00002400 | vCPU-second |
| Cloud Run | Memory | $0.00000250 | GiB-second |
| Firestore | Reads | $0.06 | 100K ops |
| Firestore | Writes | $0.18 | 100K ops |
| Firestore | Storage | $0.18 | GiB/month |
| Pub/Sub | Messages | $0.04 | 1M messages |
| Cloud Storage | Storage | $0.020 | GiB/month |
| Cloud Storage | Operations | $0.005 | 10K ops |

---

## Cost Tracking

### Per-Run Cost Attribution

```typescript
// packages/core/src/billing/cost-tracker.ts

interface RunCost {
  run_id: string;
  tenant_id: string;
  timestamp: Date;

  // AI costs
  ai_costs: {
    provider: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    input_cost_usd: number;
    output_cost_usd: number;
    total_cost_usd: number;
  }[];

  // Infrastructure costs
  infra_costs: {
    service: string;
    resource: string;
    quantity: number;
    unit: string;
    cost_usd: number;
  }[];

  // Totals
  total_ai_cost_usd: number;
  total_infra_cost_usd: number;
  total_cost_usd: number;
}

class CostTracker {
  async trackAICost(
    runId: string,
    tenantId: string,
    usage: LLMUsage
  ): Promise<void> {
    const pricing = await this.getPricing(usage.provider, usage.model);

    const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPer1M;
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPer1M;

    await this.store.recordCost({
      run_id: runId,
      tenant_id: tenantId,
      type: 'ai',
      provider: usage.provider,
      model: usage.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      input_cost_usd: inputCost,
      output_cost_usd: outputCost,
      total_cost_usd: inputCost + outputCost,
      timestamp: new Date(),
    });

    // Check budget
    await this.checkBudget(tenantId, inputCost + outputCost);
  }

  async getRunCost(runId: string): Promise<RunCost> {
    const costs = await this.store.getCostsByRun(runId);
    return this.aggregateCosts(costs);
  }

  async getTenantCosts(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<TenantCostReport> {
    const costs = await this.store.getCostsByTenant(tenantId, startDate, endDate);
    return this.generateReport(costs);
  }
}
```

### Cost Metrics Export

```typescript
// packages/core/src/billing/cost-metrics.ts

// Prometheus metrics for cost tracking
const aiCostTotal = new Counter({
  name: 'gwi_ai_cost_usd_total',
  help: 'Total AI cost in USD',
  labelNames: ['tenant_id', 'provider', 'model', 'agent'],
});

const aiTokensTotal = new Counter({
  name: 'gwi_ai_tokens_total',
  help: 'Total AI tokens used',
  labelNames: ['tenant_id', 'provider', 'model', 'direction'], // input/output
});

const infraCostTotal = new Counter({
  name: 'gwi_infra_cost_usd_total',
  help: 'Total infrastructure cost in USD',
  labelNames: ['tenant_id', 'service', 'resource'],
});

const budgetUtilization = new Gauge({
  name: 'gwi_budget_utilization_ratio',
  help: 'Current budget utilization (0-1)',
  labelNames: ['tenant_id', 'budget_type'],
});
```

---

## Budget Management

### Budget Configuration

```typescript
// packages/core/src/billing/budget.ts

interface Budget {
  id: string;
  tenant_id: string;
  name: string;

  // Limits
  amount_usd: number;
  period: 'daily' | 'weekly' | 'monthly';

  // Scope
  scope: {
    type: 'all' | 'ai' | 'infra' | 'agent';
    filter?: {
      providers?: string[];
      models?: string[];
      agents?: string[];
      services?: string[];
    };
  };

  // Alerts
  alerts: {
    threshold_percent: number;
    channels: ('email' | 'slack' | 'pagerduty')[];
    recipients?: string[];
  }[];

  // Actions
  actions: {
    threshold_percent: number;
    action: 'alert' | 'throttle' | 'block';
  }[];

  // Status
  current_spend_usd: number;
  utilization_percent: number;
  status: 'ok' | 'warning' | 'critical' | 'exceeded';
}
```

### Budget Enforcement

```typescript
// packages/core/src/billing/budget-enforcer.ts

class BudgetEnforcer {
  async checkBudget(tenantId: string, additionalCost: number): Promise<BudgetCheckResult> {
    const budgets = await this.store.getActiveBudgets(tenantId);

    for (const budget of budgets) {
      const currentSpend = await this.getCurrentSpend(budget);
      const projectedSpend = currentSpend + additionalCost;
      const projectedUtilization = (projectedSpend / budget.amount_usd) * 100;

      // Check thresholds
      for (const action of budget.actions) {
        if (projectedUtilization >= action.threshold_percent) {
          switch (action.action) {
            case 'alert':
              await this.sendAlert(budget, projectedUtilization);
              break;
            case 'throttle':
              await this.applyThrottle(tenantId);
              break;
            case 'block':
              return {
                allowed: false,
                reason: `Budget exceeded: ${budget.name} at ${projectedUtilization.toFixed(1)}%`,
              };
          }
        }
      }
    }

    return { allowed: true };
  }

  private async sendAlert(budget: Budget, utilization: number): Promise<void> {
    const alert = {
      budget_id: budget.id,
      budget_name: budget.name,
      tenant_id: budget.tenant_id,
      utilization_percent: utilization,
      current_spend_usd: budget.current_spend_usd,
      limit_usd: budget.amount_usd,
      timestamp: new Date(),
    };

    for (const channel of budget.alerts[0]?.channels || []) {
      await this.notificationService.send(channel, {
        type: 'budget_alert',
        severity: utilization >= 100 ? 'critical' : 'warning',
        data: alert,
      });
    }
  }
}
```

---

## Alert Configuration

### Alert Thresholds

```yaml
# config/budget-alerts.yml
default_thresholds:
  - percent: 50
    action: alert
    severity: info
    channels: [slack]

  - percent: 80
    action: alert
    severity: warning
    channels: [slack, email]

  - percent: 90
    action: throttle
    severity: high
    channels: [slack, email, pagerduty]
    throttle_config:
      rate_limit_percent: 50

  - percent: 100
    action: block
    severity: critical
    channels: [slack, email, pagerduty]
```

### Alert Templates

```typescript
// Slack alert template
const budgetAlertSlack = {
  warning: (data: BudgetAlert) => ({
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '⚠️ Budget Warning' },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Budget:*\n${data.budget_name}` },
          { type: 'mrkdwn', text: `*Usage:*\n${data.utilization_percent.toFixed(1)}%` },
          { type: 'mrkdwn', text: `*Spent:*\n$${data.current_spend_usd.toFixed(2)}` },
          { type: 'mrkdwn', text: `*Limit:*\n$${data.limit_usd.toFixed(2)}` },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Dashboard' },
            url: `https://app.gwi.dev/billing/${data.tenant_id}`,
          },
        ],
      },
    ],
  }),

  critical: (data: BudgetAlert) => ({
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🚨 Budget Exceeded!' },
      },
      // ... similar structure with urgency
    ],
  }),
};
```

---

## Cost Optimization Strategies

### 1. Model Selection Policy

```typescript
// packages/core/src/llm/cost-aware-selector.ts

class CostAwareModelSelector {
  selectModel(task: Task, budget: Budget): ModelSelection {
    const remainingBudget = budget.amount_usd - budget.current_spend_usd;
    const estimatedTokens = this.estimateTokens(task);

    // Tier 1: Fast & cheap (< $0.01 estimated)
    if (estimatedTokens < 1000 && task.complexity <= 3) {
      return {
        model: 'gemini-2.0-flash',
        reason: 'Low complexity, fast model sufficient',
      };
    }

    // Tier 2: Balanced (< $0.10 estimated)
    if (task.complexity <= 6) {
      return {
        model: 'claude-sonnet-4',
        reason: 'Medium complexity, balanced cost/quality',
      };
    }

    // Tier 3: Premium (budget permitting)
    const premiumCost = this.estimateCost('claude-opus-4', estimatedTokens);
    if (premiumCost < remainingBudget * 0.1) {
      return {
        model: 'claude-opus-4',
        reason: 'High complexity, premium model needed',
      };
    }

    // Fallback: Best available within budget
    return this.selectBestWithinBudget(task, remainingBudget);
  }
}
```

### 2. Token Optimization

```typescript
// packages/core/src/llm/token-optimizer.ts

class TokenOptimizer {
  optimizePrompt(prompt: string, maxTokens: number): OptimizedPrompt {
    // Remove redundant whitespace
    let optimized = prompt.replace(/\s+/g, ' ').trim();

    // Truncate context if too long
    const tokens = this.countTokens(optimized);
    if (tokens > maxTokens) {
      optimized = this.truncateToTokens(optimized, maxTokens);
    }

    // Use abbreviations for common patterns
    optimized = this.abbreviateCommonPatterns(optimized);

    return {
      original: prompt,
      optimized,
      originalTokens: this.countTokens(prompt),
      optimizedTokens: this.countTokens(optimized),
      savingsPercent: this.calculateSavings(prompt, optimized),
    };
  }

  // Cache common responses
  async getCachedOrCompute(
    prompt: string,
    compute: () => Promise<string>
  ): Promise<CachedResult> {
    const hash = this.hashPrompt(prompt);
    const cached = await this.cache.get(hash);

    if (cached) {
      return { result: cached, fromCache: true, tokensSaved: this.countTokens(prompt) };
    }

    const result = await compute();
    await this.cache.set(hash, result, { ttl: 3600 });
    return { result, fromCache: false, tokensSaved: 0 };
  }
}
```

### 3. Batch Processing

```typescript
// packages/core/src/billing/batch-optimizer.ts

class BatchOptimizer {
  async processBatch(items: WorkItem[]): Promise<BatchResult> {
    // Group similar items
    const grouped = this.groupBySimilarity(items);

    // Process groups in parallel with shared context
    const results = await Promise.all(
      grouped.map(async (group) => {
        // Single context load for all items in group
        const context = await this.loadSharedContext(group);

        // Process with batched API call
        return this.processBatchedCall(group, context);
      })
    );

    return {
      items: results.flat(),
      tokensUsed: this.calculateTotalTokens(results),
      tokensSaved: this.calculateTokenSavings(items, results),
      costSavings: this.calculateCostSavings(items, results),
    };
  }
}
```

---

## Cost Dashboard

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ COST DASHBOARD - February 2026                                                ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ MONTHLY SUMMARY                                                               ║
║   Total Spend:     $1,247.83                                                  ║
║   Budget:          $2,000.00                                                  ║
║   Utilization:     62.4%        [████████████░░░░░░░░]                        ║
║   Projected:       $1,876.45 (within budget)                                  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ COST BREAKDOWN BY CATEGORY                                                    ║
║   AI/LLM:          $987.23  (79.1%)  [████████████████░░░░]                   ║
║   Cloud Run:       $156.42  (12.5%)  [███░░░░░░░░░░░░░░░░░]                   ║
║   Firestore:       $78.91   (6.3%)   [██░░░░░░░░░░░░░░░░░░]                   ║
║   Other:           $25.27   (2.0%)   [█░░░░░░░░░░░░░░░░░░░]                   ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ TOP COST DRIVERS (AI)                                                         ║
║   1. claude-opus-4    $542.18  (54.9%)  - 127 runs                            ║
║   2. claude-sonnet-4  $312.45  (31.6%)  - 892 runs                            ║
║   3. gpt-4o           $89.21   (9.0%)   - 234 runs                            ║
║   4. gemini-flash     $43.39   (4.4%)   - 1,456 runs                          ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ COST BY AGENT                                                                 ║
║   Coder:      $623.45  │  Resolver:  $234.12  │  Triage:   $89.23             ║
║   Reviewer:   $40.43   │  Other:     $0.00                                    ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ DAILY TREND (Last 7 Days)                                                     ║
║   Mon   Tue   Wed   Thu   Fri   Sat   Sun                                     ║
║   $42   $67   $58   $89   $45   $12   $34   ← Today                           ║
║    █     █     █     █     █     █     █                                      ║
║    █     █     █     █     █     ░     █                                      ║
║    █     █     █     █     █     ░     ░                                      ║
║    █     █     █     █     ░     ░     ░                                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## BigQuery Cost Analysis

```sql
-- Monthly cost breakdown by tenant and category
SELECT
  tenant_id,
  DATE_TRUNC(timestamp, MONTH) as month,
  cost_category,
  SUM(cost_usd) as total_cost,
  COUNT(DISTINCT run_id) as run_count,
  AVG(cost_usd) as avg_cost_per_run
FROM `gwi.billing.costs`
WHERE timestamp >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
GROUP BY tenant_id, month, cost_category
ORDER BY month DESC, total_cost DESC;

-- Cost efficiency by model
SELECT
  model,
  COUNT(*) as usage_count,
  SUM(input_tokens + output_tokens) as total_tokens,
  SUM(cost_usd) as total_cost,
  AVG(cost_usd / (input_tokens + output_tokens) * 1000) as cost_per_1k_tokens,
  AVG(
    CASE
      WHEN task_complexity <= 3 THEN 1
      WHEN task_complexity <= 6 THEN 2
      ELSE 3
    END
  ) as avg_complexity_tier
FROM `gwi.billing.ai_usage`
WHERE timestamp >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY model
ORDER BY total_cost DESC;

-- Budget alert history
SELECT
  budget_id,
  budget_name,
  tenant_id,
  alert_type,
  utilization_percent,
  action_taken,
  timestamp
FROM `gwi.billing.budget_alerts`
WHERE timestamp >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
ORDER BY timestamp DESC
LIMIT 100;
```

---

## API Endpoints

### Cost API

```typescript
// GET /api/v1/billing/costs
interface GetCostsRequest {
  tenant_id: string;
  start_date: string;
  end_date: string;
  group_by?: 'day' | 'week' | 'month';
  category?: 'ai' | 'infra' | 'all';
}

interface GetCostsResponse {
  total_cost_usd: number;
  breakdown: {
    period: string;
    ai_cost_usd: number;
    infra_cost_usd: number;
    total_cost_usd: number;
  }[];
}

// GET /api/v1/billing/budgets
interface Budget {
  id: string;
  name: string;
  amount_usd: number;
  period: string;
  current_spend_usd: number;
  utilization_percent: number;
  status: string;
}

// POST /api/v1/billing/budgets
interface CreateBudgetRequest {
  name: string;
  amount_usd: number;
  period: 'daily' | 'weekly' | 'monthly';
  alerts: AlertConfig[];
}

// GET /api/v1/billing/runs/:runId/cost
interface RunCostResponse {
  run_id: string;
  ai_costs: AICost[];
  infra_costs: InfraCost[];
  total_cost_usd: number;
}
```

---

## Related Documentation

- [225-DR-TMPL-budget-policy.md](./225-DR-TMPL-budget-policy.md)
- [210-DR-SPEC-ai-performance-metrics.md](./210-DR-SPEC-ai-performance-metrics.md)
