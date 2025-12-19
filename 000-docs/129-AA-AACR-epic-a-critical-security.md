# AAR: Epic A Critical Security Tasks

> **Phase**: A (Platform Core Runtime)
> **Date**: 2024-12-19
> **Status**: Complete
> **Tasks Completed**: A1, A1.1 (C2), A2, A2.1 (C3)

## Summary

Completed the critical security tasks for Epic A, addressing two Critical-severity gaps identified in the enterprise architecture audit:

- **Critical C2**: Firestore security rules - Now covers all 18+ collections
- **Critical C3**: State machine validation - Now enforced in all Firestore stores

## What Was Completed

### A1: Firestore Data Model

1. **A1.s1: Collections + Document IDs**
   - Documented 18 top-level collections
   - Defined 7 subcollection patterns
   - Standardized document ID patterns (prefixed, timestamped)

2. **A1.s2: Indexes + Query Patterns**
   - Added 16 new composite indexes for Phase 11-22 collections
   - Added collection group indexes for signals, work_items, pr_candidates
   - Added field overrides for deduplication (externalId, dedupeKey)

3. **A1.s3: Schema Documentation**
   - Created `000-docs/128-DR-SCHM-a1-firestore-data-model.md`
   - Full TypeScript interfaces for all 18 document types
   - JSON examples and migration strategy

### A1.1: Firestore Security Rules (Critical C2)

Updated `firestore.rules` to cover ALL collections:

- **Phase 11**: `gwi_approvals`, `gwi_audit_events` (immutable)
- **Phase 12**: `connector_configs` (tenant subcollection)
- **Phase 13**: `instances`, `schedules` (tenant subcollections)
- **Phase 14**: `signals`, `work_items`, `pr_candidates` (tenant subcollections)
- **Phase 16**: `gwi_run_locks`, `gwi_idempotency`, `gwi_checkpoints` (service account only)
- **Phase 22**: `gwi_usage_events` (append-only), `gwi_usage_daily`, `gwi_usage_monthly`, `gwi_usage_snapshots`

### A2: Run State Machine

Verified existing implementation in `packages/core/src/run-bundle/`:
- `types.ts`: RunState enum with 10 states
- `state-machine.ts`: Transition validation with `STATE_TRANSITIONS` map
- Tested with existing test suite

### A2.1: State Machine Validation (Critical C3)

Created new storage-layer validation:

1. **New File**: `packages/core/src/storage/run-status-machine.ts`
   - `RUN_STATUS_TRANSITIONS` map for simpler RunStatus type
   - `validateRunStatusTransition()` function
   - `InvalidRunStatusTransitionError` with descriptive messages
   - Helper functions: `isTerminalRunStatus()`, `isRunInProgress()`, `isRunFinished()`

2. **Updated Stores**:
   - `firestore-run.ts`: Added validation in `updateRunStatus()`
   - `firestore-tenant.ts`: Added validation in `updateRun()`

3. **Tests**: Created `run-status-machine.test.ts` with 16 test cases

## Files Changed

| File | Change |
|------|--------|
| `000-docs/128-DR-SCHM-a1-firestore-data-model.md` | NEW - Schema documentation |
| `firestore.indexes.json` | UPDATED - 16 new indexes |
| `firestore.rules` | UPDATED - Rules for all Phase 11-22 collections |
| `packages/core/src/storage/run-status-machine.ts` | NEW - State machine validation |
| `packages/core/src/storage/firestore-run.ts` | UPDATED - Added validation |
| `packages/core/src/storage/firestore-tenant.ts` | UPDATED - Added validation |
| `packages/core/src/storage/index.ts` | UPDATED - Exported new module |
| `packages/core/src/storage/__tests__/run-status-machine.test.ts` | NEW - 16 tests |

## Test Results

```
 Tasks:    23 successful, 23 total
 Time:    49.341s

Run Status Machine Tests:
 ✓ 16 passed
```

## Gaps Addressed

| Gap ID | Severity | Description | Status |
|--------|----------|-------------|--------|
| C2 | Critical | Missing security rules for Phase 11-22 collections | CLOSED |
| C3 | Critical | State machine validation not enforced in storage | CLOSED |

## Next Steps

Continue with remaining Epic A tasks:
- A3: Agent abstraction layer
- A4: Run execution engine
- A5: Orchestrator pattern

## Evidence

```bash
# Typecheck passes
npm run typecheck
 Tasks:    16 successful, 16 total
 Time:    43.132s

# Tests pass
npm run test
 Tasks:    23 successful, 23 total
 Time:    49.341s
```
