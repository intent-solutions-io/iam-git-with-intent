# AAR: A11 - Cost Metering Primitives

**Date**: 2025-12-19
**Phase**: A11 - Cost Metering
**Status**: COMPLETE

## Summary

Verified comprehensive cost metering infrastructure already existed from Phase 28. Added dashboard endpoints for usage visibility and budget guardrails integration with the API layer.

## Pre-Existing Infrastructure (Phase 28)

The following was already implemented in `packages/core/src/metering/`:

- **MeteringService** - Core metering with LLM tracking, run tracking, aggregation
- **FirestoreMeteringEventStorage** - Production storage for metering events
- **InMemoryMeteringStorage** - Development/testing storage
- **MeteringBridge** - Stripe billing integration

### Existing Features

| Feature | Implementation |
|---------|----------------|
| LLM token tracking | `recordLLMUsage()` with provider/model/tokens/cost |
| Per-run tracking | `recordRunEvent()` with runId linking |
| Per-tenant rollups | `computeAggregate()` / `getCurrentAggregate()` |
| Budget enforcement | `checkLimits()` with soft/hard thresholds |
| Plan management | `DEFAULT_PLANS` with Free/Starter/Pro/Enterprise |

## Components Added

### A11.s4: Dashboard Endpoints

Added three usage API endpoints:

```typescript
// GET /tenants/:tenantId/usage
// Returns plan limits, current usage, and remaining capacity
{
  plan: { id, name, tier },
  usage: {
    tokens: { used, limit, remaining, percent },
    runs: { used, limit, remaining, percent }
  },
  limits: { softLimitReached, hardLimitReached },
  periodResetsAt: ISO8601
}

// GET /tenants/:tenantId/usage/aggregate
// Returns breakdown by provider, model, and time period
{
  tenantId,
  period: { start, end },
  summary: { totalRuns, totalLlmCalls, totalTokens, totalLatencyMs, totalCostUsd },
  byProvider: { [provider]: { calls, tokens, cost_usd } },
  byModel: { [model]: { calls, tokens, cost_usd } }
}

// GET /tenants/:tenantId/usage/check
// Budget guardrails - check if tenant can proceed
{
  allowed: boolean,
  reason?: string,
  usage: { tokens: { percent, remaining }, runs: { percent, remaining } },
  limits: { softLimitReached, hardLimitReached }
}
```

### A11.s5: Budget Guardrails Integration

The `/usage/check` endpoint provides a pre-flight check for run creation:
- Returns `allowed: false` when hard limits reached
- Provides upgrade messaging in `reason` field
- Includes current usage metrics for UI display

## Files Changed

### API (`apps/api/`)
- `src/index.ts` - Added 3 usage endpoints

### Core Package (`packages/core/`)
- `src/metering/__tests__/metering.test.ts` - 31 unit tests (NEW)

## Plan Limits

| Plan | Token Limit | Run Limit | Rate Limit |
|------|-------------|-----------|------------|
| Free | 50,000 | 10 | 10 rpm |
| Starter | 500,000 | 100 | 30 rpm |
| Professional | 2,000,000 | 500 | 60 rpm |
| Enterprise | 10,000,000 | 2,000 | 120 rpm |

## Test Results

```
Test Files  1 passed (1)
     Tests  31 passed (31)
```

Tests cover:
- Schema validation (MeteringEvent, UsageAggregate, Plan)
- LLM usage tracking (A11.s1)
- Per-run tracking (A11.s2)
- Aggregation by tenant (A11.s3)
- Budget guardrails (A11.s5)
- Plan management
- In-memory storage operations

## API Endpoint Permissions

| Endpoint | Required Permission |
|----------|---------------------|
| `GET /tenants/:tenantId/usage` | `tenant:read` |
| `GET /tenants/:tenantId/usage/aggregate` | `tenant:read` |
| `GET /tenants/:tenantId/usage/check` | `run:create` |

## Usage Example

```typescript
import { getMeteringService, isMeteringEnabled } from '@gwi/core';

// Record LLM usage
const metering = getMeteringService();
await metering.recordLLMUsage({
  tenantId: 'tenant-123',
  runId: 'run-456',
  provider: 'anthropic',
  model: 'claude-3-sonnet',
  tokens: { input_tokens: 100, output_tokens: 200, total_tokens: 300 },
  latencyMs: 500,
  costUsdEstimate: 0.003,
});

// Check limits before run
const { allowed, reason } = await metering.checkLimits('tenant-123');
if (!allowed) {
  throw new Error(reason); // "Plan limit reached. Upgrade to continue."
}

// Get usage status
const status = await metering.getPlanUsageStatus('tenant-123');
console.log(`Token usage: ${status.token_usage_percent}%`);
```

## Next Steps

- A12: SLO definitions + perf tests
