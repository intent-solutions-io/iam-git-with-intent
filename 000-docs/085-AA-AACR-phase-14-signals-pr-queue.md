# Phase 14: Signals → PR Queue AAR

**Document ID**: 085-AA-AACR-phase-14-signals-pr-queue
**Phase**: 14
**Date**: 2025-12-17
**Status**: Complete

---

## 1. Summary

Phase 14 implements the "Signals → PR Queue" wedge - a signal ingestion pipeline that:
- Receives signals from GitHub webhooks, scheduled tasks, and manual input
- Normalizes signals into work items with deterministic scoring
- Deduplicates signals using tenant-scoped dedupe keys
- Ranks work items in a prioritized queue
- Generates PR candidates with risk assessment and approval gating
- Emits Intent Receipts for audit trail

## 2. Deliverables

### 2.1 Core Types (`packages/core/src/storage/interfaces.ts`)

| Type | Purpose |
|------|---------|
| `Signal` | Raw inbound event with source, payload, context |
| `SignalSource` | Enum: github_issue, github_pr, github_comment, webhook, scheduled, manual, api |
| `SignalContext` | Normalized context: repo, resourceType, resourceNumber, title, labels, actor |
| `WorkItem` | Normalized work item with score, dedupe key, evidence |
| `WorkItemType` | Enum: issue_to_code, pr_review, pr_resolve, docs_update, test_gen, custom |
| `ScoreBreakdown` | Explainable score with base, modifiers, final, explanation |
| `PRCandidate` | Generated implementation plan awaiting approval |
| `CandidateRisk` | Risk assessment with level, score, factors, mitigations |
| `CandidateIntentReceipt` | Audit trail for proposed changes |

### 2.2 Signals Module (`packages/core/src/signals/index.ts`)

| Function | Purpose |
|----------|---------|
| `extractGitHubContext()` | Parse GitHub webhook payload into SignalContext |
| `getSignalSourceFromEvent()` | Map GitHub event type to SignalSource |
| `calculateScore()` | Deterministic scoring with explainability |
| `generateDedupeKey()` | Generate tenant-scoped dedupe key |
| `inferWorkItemType()` | Infer work type from signal source and labels |
| `SignalProcessor` | Class to process signals into work items |
| `createCandidateIntentReceipt()` | Generate Intent Receipt for audit |
| `assessCandidateRisk()` | Assess risk for PR candidate |

### 2.3 Storage Implementations (`packages/core/src/storage/inmemory.ts`)

| Store | Status |
|-------|--------|
| `InMemorySignalStore` | Complete - implements SignalStore interface |
| `InMemoryWorkItemStore` | Complete - implements WorkItemStore interface |
| `InMemoryPRCandidateStore` | Complete - implements PRCandidateStore interface |

### 2.4 API Endpoints (`apps/api/src/index.ts`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/tenants/:tenantId/signals` | POST | Create new signal |
| `/v1/tenants/:tenantId/signals` | GET | List signals |
| `/v1/tenants/:tenantId/signals/process` | POST | Process pending signals |
| `/v1/tenants/:tenantId/queue` | GET | List work items (sorted by score) |
| `/v1/tenants/:tenantId/queue/:itemId` | GET | Get work item details |
| `/v1/tenants/:tenantId/queue/:itemId` | PATCH | Update work item |
| `/v1/tenants/:tenantId/queue/:itemId/dismiss` | POST | Dismiss work item |
| `/v1/tenants/:tenantId/queue/:itemId/candidate` | POST | Generate PR candidate |
| `/v1/tenants/:tenantId/candidates` | GET | List PR candidates |
| `/v1/candidates/:candidateId` | GET | Get candidate details |
| `/v1/candidates/:candidateId/approve` | POST | Approve or reject candidate |

### 2.5 UI Pages (`apps/web/src/pages/`)

| Page | Route | Purpose |
|------|-------|---------|
| `Queue.tsx` | `/queue` | Work item queue list with score badges |
| `QueueDetail.tsx` | `/queue/:itemId` | Work item details with score breakdown |
| `Candidates.tsx` | `/candidates` | PR candidate list |
| `CandidateDetail.tsx` | `/candidates/:candidateId` | Candidate with plan, risk, approval flow |

### 2.6 Tests (`packages/core/src/signals/__tests__/signals.test.ts`)

| Test Suite | Tests |
|------------|-------|
| calculateScore | 12 tests - determinism, range, base scores, modifiers |
| generateDedupeKey | 6 tests - determinism, tenant isolation, uniqueness |
| inferWorkItemType | 6 tests - type inference from source and labels |
| getSignalSourceFromEvent | 5 tests - GitHub event mapping |
| extractGitHubContext | 4 tests - payload extraction |
| createCandidateIntentReceipt | 4 tests - receipt generation |
| assessCandidateRisk | 7 tests - risk assessment |

**Total**: 47 tests passing

## 3. Scoring System

### 3.1 Base Scores by Source

| Source | Base Score |
|--------|------------|
| manual | 70 |
| github_pr | 60 |
| api | 55 |
| github_issue | 50 |
| scheduled | 45 |
| webhook | 40 |
| github_comment | 30 |

### 3.2 Score Modifiers

| Modifier | Impact | Condition |
|----------|--------|-----------|
| urgent_label | +25 | Has urgent label (configurable) |
| security_keyword | +20 | Title contains "security" or "vulnerability" |
| priority_label | +15 | Has priority label (configurable) |
| critical_keyword | +15 | Title contains "breaking" or "critical" |
| bug_label | +10 | Has "bug" label |
| work_type | ±10 | Adjustment based on WorkItemType |
| feature_label | +5 | Has "enhancement" or "feature" label |
| docs_keyword | -5 | Title contains "docs" or "documentation" |
| low_priority_label | -20 | Has low priority label (configurable) |

### 3.3 Final Score

```
finalScore = clamp(baseScore + Σ(modifiers), 0, 100)
```

Every score includes an explanation string for transparency.

## 4. Risk Assessment

| Risk Level | Conditions | Required Approvals |
|------------|------------|-------------------|
| Low | < 5 files, complexity < 3, no sensitive files | 0 |
| Medium | 5-10 files OR complexity 3 | 1 |
| High | > 10 files OR auth/security files OR complexity 4 | 1 |
| Critical | Infrastructure files OR complexity 5 | 2 |

Risk factors detected:
- `large_change`: > 10 affected files
- `moderate_change`: 5-10 affected files
- `high_complexity`: Complexity score >= 4
- `moderate_complexity`: Complexity score == 3
- `security_files`: Changes auth/security/credential files
- `config_files`: Changes .json, .yaml, .yml, .env files

## 5. Intent Receipts

Every PR candidate generates an Intent Receipt containing:
- **intent**: Human-readable description of proposed action
- **changeSummary**: Plan summary
- **actor**: Who/what proposed the change
- **when**: Timestamp
- **scope**: Repository and resource identifier
- **policyApproval**: Approval status
- **evidence**: Score and scoring explanation

## 6. Architecture Decisions

### 6.1 In-Memory Stores (Temporary)

Phase 14 uses in-memory stores for:
- Rapid development iteration
- No Firestore setup required for testing
- Future: Replace with Firestore implementations

### 6.2 Tenant-Scoped Deduplication

Dedupe keys include tenant ID to prevent cross-tenant collisions:
```
{tenantId}:{repo}:{resourceType}:{resourceNumber}:{titleHash}
```

### 6.3 Label Processing Requires Policy

Label-based modifiers only apply when `tenantPolicy` is passed. This allows tenants to configure their own priority/urgent labels.

## 7. Known Limitations

| Limitation | Severity | Mitigation |
|------------|----------|------------|
| In-memory stores lose data on restart | High | Implement Firestore stores |
| No webhook validation | Medium | Add signature verification |
| No rate limiting on signal ingestion | Medium | Add rate limiting middleware |
| Candidate generation is stubbed | Medium | Connect to actual agent execution |

## 8. Files Changed

### New Files
- `packages/core/src/signals/index.ts`
- `packages/core/src/signals/__tests__/signals.test.ts`
- `apps/web/src/pages/Queue.tsx`
- `apps/web/src/pages/QueueDetail.tsx`
- `apps/web/src/pages/Candidates.tsx`
- `apps/web/src/pages/CandidateDetail.tsx`

### Modified Files
- `packages/core/src/storage/interfaces.ts` - Added Phase 14 types
- `packages/core/src/storage/inmemory.ts` - Added store implementations
- `packages/core/src/storage/index.ts` - Added exports and singletons
- `packages/core/src/index.ts` - Added signals export
- `apps/api/src/index.ts` - Added API endpoints
- `apps/web/src/App.tsx` - Added routes

## 9. Verification

```bash
# Build
npm run build  # ✓ Passes

# Tests
npm run test   # ✓ 378 tests passing

# Type check
npm run typecheck  # ✓ Passes
```

## 10. Next Phases / TODOs

1. **Firestore Implementation**: Replace in-memory stores with Firestore
2. **Webhook Validation**: Add GitHub webhook signature verification
3. **Rate Limiting**: Add rate limiting for signal ingestion
4. **Agent Integration**: Connect candidate generation to actual agent execution
5. **Real-time Updates**: Add WebSocket support for queue updates
6. **Batch Processing**: Add scheduled job for processing accumulated signals

---

**Phase 14 Complete**
