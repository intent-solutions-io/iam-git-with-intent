# AAR: A5.s1 - Job Envelope Schema Implementation

**Date**: 2025-12-19
**Epic**: A5 (Worker Infrastructure)
**Subtask**: A5.s1 - Define Job envelope schema for queue messages
**Status**: COMPLETE
**Bead**: git-with-intent-lky (closed)

## Objective

Create Zod schema for queue job messages used with Pub/Sub, providing type-safe job envelopes with:
- Full validation for job identification, execution context, and scheduling
- Discriminated union types for type-safe payloads
- Retry tracking and distributed tracing support
- Helper functions for creating, parsing, and validating jobs

## Changes Delivered

### 1. Job Envelope Schema (`packages/core/src/queue/job-envelope.ts`)

**Core Schema Features**:
- Job identification: `jobId`, `tenantId`, `runId`, optional `stepId`
- Execution context: `attempt`, `maxRetries`, `traceId`, optional `spanId`
- Scheduling: `priority`, `orderingKey`, `deadline`, `delayUntil`
- Payload: `type`, `payload` (type-specific)
- Metadata: `createdAt`, `source`, optional `idempotencyKey`
- Retry tracking: `previousAttempts[]` with error history

**Job Types Defined**:
- `run.start` - Start a new run (with PR URL, initiatedBy)
- `run.resume` - Resume a paused run (with fromStepId, reason)
- `step.execute` - Execute a specific step (with agentId, input, dependencies)
- `step.retry` - Retry a failed step (with originalError, retryStrategy)
- `cleanup.run` - Cleanup after run completion (with status, artifacts)
- `notification.send` - Send notifications (with recipientId, channel, template)

**Discriminated Union**:
- `TypedJobEnvelope` discriminated union for type-safe payload access
- Each job type has specific payload schema validation
- Type narrowing works correctly in TypeScript

**Helper Functions**:
- `createJobEnvelope()` - Create with defaults
- `parseJobEnvelope()` - Parse and validate (throwing)
- `validateJobEnvelope()` - Validate without throwing
- `parseTypedJobEnvelope()` - Parse with type discrimination
- `validateTypedJobEnvelope()` - Validate typed envelope
- `createPreviousAttempt()` - Create retry record
- `addRetryAttempt()` - Add retry to envelope
- `isRetryExceeded()` - Check if max retries exceeded
- `isDeadlineExpired()` - Check deadline
- `shouldDelay()` - Check if delayed
- `getRemainingDelay()` - Calculate remaining delay

### 2. Comprehensive Tests (`packages/core/src/queue/__tests__/job-envelope.test.ts`)

**Test Coverage** (42 tests, all passing):
- Basic validation (required fields, optional fields, invalid inputs)
- Job priority and type validation
- ISO datetime validation
- Typed job envelope validation for all 6 job types
- Discriminated union type narrowing
- Helper function tests (create, parse, validate, retry, deadline, delay)
- Edge cases and error handling

### 3. Exports

**Added to** `packages/core/src/queue/index.ts`:
- All schemas: `JobEnvelope`, `JobPriority`, `JobType`, etc.
- All typed job schemas: `RunStartJob`, `StepExecuteJob`, etc.
- All payload schemas: `RunStartPayload`, `StepExecutePayload`, etc.
- All helper functions

**Already exported** from `packages/core/src/index.ts` via:
```typescript
export * from './queue/index.js';
```

### 4. Incidental Fix

Fixed pre-existing TypeScript error in `packages/core/src/idempotency/store.ts`:
- Changed import of `Timestamp` from firestore-client.ts to direct import from firebase-admin/firestore
- Issue: firestore-client.ts didn't re-export Timestamp type

## Test Results

```bash
# Core package type check
npx tsc --noEmit  # PASS (no errors)

# Job envelope tests
npm test -- job-envelope
# Test Files: 1 passed (1)
# Tests: 42 passed (42)
# Duration: 569ms

# Full core package tests
npm test
# Test Files: 65 passed | 1 skipped (66)
# Tests: 2122 passed | 47 skipped (2169)
# Duration: 12.06s
```

## Architecture Decisions

1. **Zod for Validation**: Consistent with existing codebase patterns (run-bundle schemas)
2. **Discriminated Union**: Provides type-safe payload access based on job type
3. **ISO Datetime Strings**: Uses `.datetime()` validation for timestamps
4. **Extensible Design**: Easy to add new job types by extending the JobType enum
5. **Helper Functions**: Reduce boilerplate and enforce consistency

## Integration Points

- Compatible with existing `QueueJob` interface in queue/index.ts
- Uses telemetry IDs from `telemetry/ids.ts` for tracing
- Ready for Pub/Sub message payload serialization
- Supports idempotency keys for deduplication

## Key Files

- `/packages/core/src/queue/job-envelope.ts` (371 lines)
- `/packages/core/src/queue/__tests__/job-envelope.test.ts` (543 lines)
- `/packages/core/src/queue/index.ts` (updated exports)
- `/packages/core/src/idempotency/store.ts` (import fix)

## Risk Assessment

**Risk Level**: LOW

- Well-tested schema with 42 passing tests
- No breaking changes to existing queue interface
- Type-safe design prevents runtime errors
- Follows established patterns in codebase

## Next Steps (Epic A5)

From the requirements, the remaining A5 subtasks are:
- A5.s2 - Implement PubSub publisher wrapper
- A5.s3 - Create worker consumer scaffold
- A5.s4 - Add job retry with exponential backoff
- A5.s5 - Integrate with Firestore job store for durability

## Lessons Learned

1. **Import Consistency**: Check that types used across modules are properly exported
2. **Linter Awareness**: Linter (ESLint/TypeScript) can auto-remove unused imports, ensure they're actually needed
3. **Pre-existing Errors**: Always check for pre-existing build errors before starting work
4. **Test-Driven Development**: Writing tests alongside schema helped catch edge cases early

## Evidence

```bash
# Bead closed
✓ Closed git-with-intent-lky: A5.s1 completed...

# Tests passing
Test Files  1 passed (1)
     Tests  42 passed (42)

# Type check clean
npx tsc --noEmit  # 0 errors
```

---

**AAR Complete** - A5.s1 successfully delivered job envelope schema with full Zod validation and comprehensive test coverage.
