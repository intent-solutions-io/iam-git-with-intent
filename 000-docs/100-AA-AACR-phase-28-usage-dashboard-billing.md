# After-Action Report: Phase 28 - Usage Dashboard + Billing UX

| Attribute | Value |
|-----------|-------|
| Document ID | 100-AA-AACR-phase-28-usage-dashboard-billing |
| Date | 2025-12-17 21:30 CST |
| Phase | Phase 28: Usage Dashboard + Billing UX |
| Status | COMPLETE |
| Beads Epic | git-with-intent-36a |
| AgentFS Sync | Yes |

---

## Executive Summary

Phase 28 delivered a complete usage metering and billing UX layer for Git With Intent. The implementation includes a **provider-agnostic metering system** that tracks LLM usage from any provider (Anthropic, OpenAI, Google, Ollama, vLLM, etc.), a **Stripe billing integration bridge**, and a **tenant admin dashboard** for monitoring usage and managing subscriptions.

Key achievements:
- **Provider-agnostic MeteringEvent schema** - tracks tokens, latency, cost from any LLM provider
- **MeteringService** with plan limits and soft/hard threshold detection
- **MeteringBridge** syncs Stripe subscription events to metering plan limits
- **Usage Dashboard UI** with plan info, usage bars, breakdowns, invoice history
- **Upgrade Flow UX** with plan selection, billing interval toggle, Stripe checkout
- **48 passing golden tests** covering metering, billing webhooks, and forensics
- **16 ARV gate checks** validating Phase 22 + 28 infrastructure

---

## Deliverables

### 1. Provider-Agnostic Metering Module

**Files:**
- `packages/core/src/metering/types.ts` - MeteringEventSchema, UsageAggregateSchema, PlanSchema
- `packages/core/src/metering/service.ts` - MeteringService, InMemoryMeteringStorage
- `packages/core/src/metering/index.ts` - Module exports

**Key Design Decisions:**
- **Provider-agnostic strings**: `provider: z.string()` and `model: z.string()` accept any value
- **Flexible token schema**: Supports `input_tokens/output_tokens` OR `prompt_tokens/completion_tokens`
- **Feature-flagged**: `GWI_METERING_ENABLED=1` to enable
- **Plan limits**: Soft (80%) and hard (100%) thresholds with configurable percentages

**Plan Tiers:**
| Plan | Token Limit | Run Limit | Price |
|------|-------------|-----------|-------|
| Free | 50K | 10 | $0 |
| Starter | 500K | 100 | $29 |
| Professional | 2M | 500 | $99 |
| Enterprise | 10M | 2000 | $499 |

### 2. Billing-Metering Bridge

**Files:**
- `packages/core/src/billing/metering-bridge.ts` - MeteringBridge, TenantBillingState
- `packages/core/src/billing/index.ts` - Updated exports

**Features:**
- Syncs Stripe subscription events to metering plan limits
- Maps billing `PlanId` (pro) to metering tier (professional)
- Stores per-tenant billing state (stripe_customer_id, subscription_id, status)
- Creates webhook deps factory for StripeWebhookHandler integration

### 3. Usage Dashboard UI

**Files:**
- `apps/web/src/pages/Usage.tsx` - Dashboard page
- `apps/web/src/lib/api.ts` - API client additions

**Components:**
- `PlanInfoCard` - Current plan, usage bars, reset date
- `UsageSummaryCard` - Runs, LLM calls, tokens, estimated cost
- `UsageBreakdown` - By provider and model breakdown
- `InvoiceHistoryTable` - Invoice history with status badges

**API Functions:**
- `getUsage(tenantId)` - Fetch usage aggregate + plan status
- `listInvoices(tenantId)` - Fetch invoice history
- `createBillingPortalSession(tenantId)` - Open Stripe billing portal

### 4. Upgrade Flow UX

**Files:**
- `apps/web/src/pages/Upgrade.tsx` - Plan selection page
- `apps/web/src/App.tsx` - Route configuration
- `apps/web/src/components/Layout.tsx` - Navigation link

**Features:**
- Plan cards for Free, Starter, Professional, Enterprise
- Monthly/yearly billing toggle (17% yearly discount)
- Current plan indicator
- Stripe checkout integration via `createCheckoutSession()`
- Success/canceled states with appropriate messaging

### 5. Golden Tests

**Files:**
- `test/goldens/metering/metering.golden.test.ts` - 25 tests
- `test/goldens/billing/billing-webhooks.golden.test.ts` - 23 tests

**Coverage:**
- MeteringEvent schema validation (valid/invalid cases)
- Provider-agnostic acceptance (any provider/model string)
- MeteringService event recording and aggregation
- Plan limit detection (soft/hard limits)
- StripeWebhookHandler event processing
- MeteringBridge subscription sync
- Customer-tenant linking

### 6. ARV Gate Updates

**Files:**
- `scripts/arv/metering-gate.ts` - Updated with 8 Phase 28 checks

**Checks (16 total):**
1-8. Phase 22 billing/metering infrastructure
9. MeteringEvent schema (provider-agnostic)
10. MeteringService with checkLimits
11. MeteringBridge Stripe sync
12. Metering module exports
13. Usage dashboard UI components
14. Upgrade flow UI features
15. Routes configured (/usage, /upgrade)
16. TypeScript compilation

---

## Beads Tracking

| Bead ID | Description | Status |
|---------|-------------|--------|
| git-with-intent-36a | Phase 28 Epic | Open |
| git-with-intent-apw | MeteringEvent schema | Closed |
| git-with-intent-5fo | Aggregation + plan limits | Closed |
| git-with-intent-2p4 | Stripe integration | Closed |
| git-with-intent-fxs | Usage dashboard UI | Closed |
| git-with-intent-888 | Upgrade flow UX | Closed |
| git-with-intent-u8o | ARV gates | Closed |
| git-with-intent-bc3 | Docs (this AAR) | Closing |

---

## Technical Notes

### Provider-Agnostic Design

The metering system accepts any LLM provider/model string:
```typescript
const event = await service.recordLLMUsage({
  tenantId: 'tenant-123',
  provider: 'ollama',        // Any provider
  model: 'llama3:70b',       // Any model
  tokens: { total_tokens: 1000 },
});
```

This enables tracking for:
- Anthropic (Claude)
- OpenAI (GPT-4)
- Google (Gemini)
- Ollama (local models)
- vLLM (self-hosted)
- Custom providers

### Feature Flag

Metering is opt-in via feature flag:
```bash
GWI_METERING_ENABLED=1
```

When disabled, `isMeteringEnabled()` returns false and metering operations are skipped.

### Plan Limit Enforcement

The `checkLimits()` function returns:
```typescript
interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  status: PlanUsageStatus;
}
```

This can be called before expensive operations to enforce plan limits.

---

## Dependencies

### Phase 27 Fixups (Completed)

Before starting Phase 28, completed Phase 27 fixups:
- Wired ForensicCollector into engine.ts `startRun()`
- Added 11 forensics wiring golden tests
- Closed Phase 27 beads

### New Dependencies

- No new npm dependencies (Stripe SDK already present from Phase 15)

---

## Verification

### Build

```bash
npm run build
# 12 packages built successfully
```

### Tests

```bash
npx vitest run test/goldens/
# 150 tests pass (scoring, forensics, planner, metering, billing)
```

### ARV Gate

```bash
npx tsx scripts/arv/metering-gate.ts
# 16/16 checks pass
```

---

## Commits

1. `37ccc2c` - phase28(metering): add MeteringEvent schema + aggregation + plan limits
2. `c75a226` - phase28(billing): add Stripe→Metering bridge + golden tests
3. `05461e8` - phase28(ui): add usage dashboard + billing API client
4. `a335a44` - phase28(ui): add plan upgrade page with Stripe checkout
5. `07590ca` - phase28(arv): update metering gate with Phase 28 checks

---

## Known Limitations

1. **No real-time usage updates** - Dashboard shows current period aggregate, not live updates
2. **No usage notifications** - Soft/hard limit warnings not emailed yet
3. **Mock data fallback** - UI shows mock data when API not available
4. **No Firestore metering storage** - Phase 28 uses InMemory; Firestore implementation pending

---

## Next Steps

1. **Phase 29**: Firestore metering storage implementation
2. **Phase 30**: Usage notification system (email when approaching limits)
3. **Phase 31**: Real-time usage WebSocket updates
4. **Backlog**: Usage analytics and reporting

---

## Appendix: Golden Test Summary

| Test File | Tests | Coverage |
|-----------|-------|----------|
| metering.golden.test.ts | 25 | Schema validation, service, aggregation, limits |
| billing-webhooks.golden.test.ts | 23 | Webhook handler, bridge sync, customer linking |
| forensics-wiring.golden.test.ts | 11 | Forensics integration (Phase 27 fixup) |

**Total Phase 28 Tests:** 48 (plus 11 Phase 27 fixup tests)

---

*Document generated: 2025-12-17 21:30 CST*
*Beads Epic: git-with-intent-36a*
*AgentFS Mount: .agentfs/ (synced)*
