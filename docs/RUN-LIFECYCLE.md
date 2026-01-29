# Git With Intent: Run Lifecycle State Model
*Task: B1 (bd-8d1.1)*
*Generated: 2026-01-29*
*Status: Production Specification*

---

## Executive Summary

This document specifies the run lifecycle state model for Git With Intent. It defines:
- All valid run states and their meanings
- State transition rules (validated by state machine)
- Idempotency key schemes for all event sources
- Deduplication logic for preventing duplicate runs
- Recovery semantics for durable orchestration

**Key Implementation Files:**
- `packages/engine/src/run/state-machine.ts` - State transition validation
- `packages/engine/src/run/types.ts` - Engine run types
- `packages/engine/src/idempotency/types.ts` - Idempotency key schemes
- `packages/core/src/storage/interfaces.ts` - Persistence contracts

---

## 1. Run States

### 1.1 State Definitions

| State | Description | Terminal? | Can Resume? |
|-------|-------------|-----------|-------------|
| `pending` | Run created but not yet started | No | N/A |
| `running` | Actively executing steps | No | N/A |
| `awaiting_approval` | Paused at approval gate, waiting for user | No | Yes |
| `waiting_external` | Paused waiting for external event/webhook | No | Yes |
| `completed` | All steps finished successfully | Yes | No |
| `failed` | Run failed due to error | Yes | No |
| `cancelled` | Run was cancelled by user/system | Yes | No |

### 1.2 State Diagram

```
                        ┌─────────┐
                        │ pending │ (initial state)
                        └────┬────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          v                  v                  v
     ┌─────────┐        ┌─────────┐        ┌────────┐
     │cancelled│        │ running │        │ failed │
     └─────────┘        └────┬────┘        └────────┘
      (terminal)             │              (terminal)
                   ┌─────────┼─────────┐
                   │         │         │
                   v         v         v
          ┌────────────────┐ │  ┌─────────────────┐
          │awaiting_approval│ │  │waiting_external │
          └───────┬────────┘ │  └────────┬────────┘
                  │          │           │
                  └─────┬────┴───────────┘
                        │
                   ┌────┼────┐
                   │    │    │
                   v    v    v
            ┌──────────┐ ┌─────────┐ ┌────────┐
            │completed │ │cancelled│ │ failed │
            └──────────┘ └─────────┘ └────────┘
             (terminal)   (terminal)  (terminal)
```

---

## 2. State Transitions

### 2.1 Valid Transitions

| From State | Valid Next States | Notes |
|------------|-------------------|-------|
| `pending` | `running`, `cancelled`, `failed` | Initial transitions |
| `running` | `completed`, `failed`, `cancelled`, `awaiting_approval`, `waiting_external` | Active execution |
| `awaiting_approval` | `running`, `completed`, `failed`, `cancelled` | Resume, approve, reject, cancel |
| `waiting_external` | `running`, `completed`, `failed`, `cancelled` | Resume on event, complete, fail, cancel |
| `completed` | (none) | Terminal |
| `failed` | (none) | Terminal |
| `cancelled` | (none) | Terminal |

### 2.2 Transition Context

Every state transition should capture audit context:

```typescript
interface TransitionContext {
  runId?: string;
  userId?: string;
  initiator?: 'user' | 'system' | 'timeout' | 'policy' | 'webhook' | 'approval';
  timestamp?: Date;
  metadata?: Record<string, unknown>;

  // For awaiting_approval transitions
  approval?: {
    action: string;
    requestedBy?: string;
    decision?: 'approved' | 'rejected';
    decidedAt?: Date;
    decidedBy?: string;
    reason?: string;
  };

  // For waiting_external transitions
  externalEvent?: {
    eventType: string;
    source?: string;
    eventId?: string;
    expectedAt?: Date;
    timeoutMs?: number;
  };
}
```

### 2.3 Terminal State Rules

1. **No outbound transitions** from terminal states
2. **Immutable once terminal** - Run record should not be modified after reaching terminal state (except for metadata updates)
3. **Compensation log captured** - For cancelled runs, record compensation actions taken
4. **Duration calculated** - `completedAt` and `durationMs` set on terminal transition

---

## 3. Idempotency Key Schemes

### 3.1 Key Format by Source

| Event Source | Key Format | Example |
|--------------|------------|---------|
| GitHub Webhook | `github:{delivery_id}` | `github:12345678-1234-1234-1234-123456789012` |
| API Call | `api:{client_id}:{request_id}` | `api:cli-abc123:req-550e8400-e29b-41d4-a716-446655440000` |
| Slack Command | `slack:{team_id}:{trigger_id}` | `slack:T12345678:1234567890.123456` |
| Scheduler | `scheduler:{schedule_id}:{execution_time}` | `scheduler:daily-cleanup:2024-12-19T00:00:00Z` |

### 3.2 Key Extraction

**GitHub Webhooks:**
- Use `X-GitHub-Delivery` header (UUID)
- Guaranteed unique per webhook delivery
- Handles retries transparently

**API Calls:**
- Client provides `X-Request-ID` or `X-Idempotency-Key` header
- Combined with authenticated client ID
- Client responsible for generating unique request IDs

**Slack Commands:**
- Use Slack's `trigger_id` (unique per interaction)
- Combined with `team_id` for cross-workspace isolation
- Trigger ID valid for 30 minutes

**Scheduler:**
- Use schedule ID + truncated execution time
- Execution time truncated to schedule granularity
- Prevents duplicate runs for same scheduled slot

### 3.3 Idempotency Record

```typescript
interface IdempotencyRecord {
  key: string;                    // Composite key
  source: EventSource;            // github_webhook | api | slack | scheduler
  tenantId: string;               // Tenant isolation
  runId?: string;                 // Created run ID (if any)
  status: 'processing' | 'completed' | 'failed';
  requestHash: string;            // Hash of request payload
  response?: unknown;             // Cached response for duplicates
  error?: string;                 // Error message if failed
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;                // TTL for cleanup
  lockExpiresAt?: Date;           // Distributed lock expiration
  attempts: number;               // Processing attempt count
}
```

---

## 4. Deduplication Logic

### 4.1 Check-and-Set Flow

```
1. Generate idempotency key from request
2. Check if key exists in store:
   - NEW: Create record with status='processing', proceed
   - DUPLICATE (completed): Return cached response
   - DUPLICATE (processing): Return 202 Accepted or wait
   - DUPLICATE (failed): May retry if attempts < maxAttempts
3. Execute request logic
4. On success: Update record to status='completed', cache response
5. On failure: Update record to status='failed', store error
```

### 4.2 Deduplication by Source

**GitHub Webhooks:**
- Primary dedupe: `X-GitHub-Delivery` header
- Secondary dedupe: Same PR + same event type within 5 seconds
- Rationale: GitHub may retry failed deliveries

**API Calls:**
- Primary dedupe: Client-provided idempotency key
- No automatic dedupe without key
- Rationale: Client controls retry behavior

**Slack Commands:**
- Primary dedupe: `trigger_id` (expires in 30 mins)
- Rationale: Slack doesn't retry, but user might click multiple times

**Scheduler:**
- Primary dedupe: Schedule ID + execution slot
- Rationale: Scheduler runs exactly-once per slot

### 4.3 TTL Configuration

| Status | TTL | Rationale |
|--------|-----|-----------|
| `completed` | 24 hours | Long enough for retries to return cached response |
| `failed` | 1 hour | Allow retry after transient failures |
| `processing` lock | 5 minutes | Dead process detection |

---

## 5. Recovery Semantics

### 5.1 Run Recovery on Service Restart

When a Cloud Run instance restarts:

1. **Query for non-terminal runs** owned by this instance
2. **For each `running` run:**
   - Check last checkpoint
   - If checkpoint is resumable: Resume from checkpoint
   - If not: Transition to `failed` with recovery error
3. **For each `awaiting_approval` run:**
   - No action needed (waiting for user)
   - Continue to poll/wait for approval
4. **For each `waiting_external` run:**
   - Check if timeout has passed
   - If timed out: Transition to `failed`
   - If not: Continue waiting

### 5.2 Checkpoint Schema

```typescript
interface StepCheckpoint {
  stepId: string;
  agent: string;
  status: StepStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
  timestamp: Date;
  resumable: boolean;          // Can skip on resume
  idempotent: boolean;         // Can safely replay
  tokensUsed?: { input: number; output: number };
  durationMs?: number;
}
```

### 5.3 Resume Decision Tree

```
Is step marked resumable?
├── Yes: Skip step, use cached output
└── No: Is step idempotent?
    ├── Yes: Replay step safely
    └── No: Fail run (cannot safely resume)
```

### 5.4 Orphaned Run Detection

Runs can become "orphaned" if:
- Cloud Run instance crashes mid-execution
- Network partition during processing
- Out-of-memory kill

**Detection Strategy:**
1. Each run has `lastHeartbeatAt` timestamp
2. Running instances update heartbeat every 30 seconds
3. Runs with stale heartbeat (> 5 minutes) are orphaned
4. Orphan recovery:
   - If checkpointed: Resume from checkpoint
   - If not: Transition to `failed` with orphan error

---

## 6. Firestore Schema (for B2 implementation)

### 6.1 Collections

```
gwi_runs/{runId}                    # Run documents
gwi_runs/{runId}/steps/{stepId}     # Step subcollection
gwi_runs/{runId}/checkpoints/{cpId} # Checkpoint subcollection
gwi_idempotency/{key}               # Idempotency records
```

### 6.2 Run Document

```typescript
// Firestore: gwi_runs/{runId}
{
  id: string;
  schemaVersion: number;
  tenantId: string;
  repoId: string;
  prId: string;
  prUrl: string;
  type: RunType;
  status: RunStatus;
  currentStep?: string;

  // Trigger context
  trigger: {
    source: 'ui' | 'cli' | 'webhook' | 'scheduled' | 'api';
    userId?: string;
    webhookEventId?: string;
  };

  // Execution metadata
  idempotencyKey?: string;
  a2aCorrelationId?: string;
  lastHeartbeatAt?: Timestamp;

  // Results
  result?: unknown;
  error?: string;

  // Cancellation
  cancellation?: RunCancellation;
  compensationLog?: CompensationLogEntry[];

  // Resume support
  resumedFrom?: string;
  resumeCount?: number;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
  durationMs?: number;
}
```

### 6.3 Indexes

```yaml
# Required composite indexes
- collectionGroup: gwi_runs
  fields:
    - fieldPath: tenantId
    - fieldPath: status
    - fieldPath: createdAt
      order: DESCENDING

- collectionGroup: gwi_runs
  fields:
    - fieldPath: tenantId
    - fieldPath: repoId
    - fieldPath: createdAt
      order: DESCENDING

- collectionGroup: gwi_runs
  fields:
    - fieldPath: status
    - fieldPath: lastHeartbeatAt
      order: ASCENDING

- collectionGroup: gwi_idempotency
  fields:
    - fieldPath: status
    - fieldPath: expiresAt
      order: ASCENDING
```

---

## 7. Observability

### 7.1 Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `gwi_run_transitions_total` | Counter | `from_state`, `to_state`, `tenant_id` | State transition count |
| `gwi_run_duration_seconds` | Histogram | `type`, `status`, `tenant_id` | Run duration by outcome |
| `gwi_run_active_gauge` | Gauge | `status`, `tenant_id` | Current active runs by status |
| `gwi_idempotency_hits_total` | Counter | `source`, `result` | Idempotency cache hits/misses |

### 7.2 Log Events

```jsonl
{"event": "run_created", "runId": "...", "type": "autopilot", "idempotencyKey": "..."}
{"event": "run_transition", "runId": "...", "from": "pending", "to": "running", "initiator": "system"}
{"event": "run_checkpoint", "runId": "...", "stepId": "...", "resumable": true}
{"event": "run_completed", "runId": "...", "durationMs": 12345, "status": "completed"}
{"event": "idempotency_hit", "key": "github:...", "cachedRunId": "..."}
{"event": "orphan_detected", "runId": "...", "lastHeartbeat": "..."}
```

---

## 8. Implementation Checklist

### B1: This Document (Complete)
- [x] Define all run states
- [x] Document state transitions
- [x] Specify idempotency key schemes
- [x] Define deduplication logic
- [x] Document recovery semantics
- [x] Specify Firestore schema

### B2: Firestore Persistence (Next)
- [ ] Implement `FirestoreRunStore` matching this spec
- [ ] Add heartbeat mechanism
- [ ] Implement orphan detection
- [ ] Add state transition validation
- [ ] Create Firestore indexes

### B3: Run Resume Logic
- [ ] Implement checkpoint persistence
- [ ] Add resume decision logic
- [ ] Handle idempotent vs non-idempotent steps
- [ ] Add resume count tracking

---

## Appendix: Error Codes

| Code | Meaning |
|------|---------|
| `RUN_INVALID_TRANSITION` | Attempted invalid state transition |
| `RUN_TERMINAL_STATE` | Attempted to modify run in terminal state |
| `RUN_ORPHANED` | Run detected as orphaned (stale heartbeat) |
| `RUN_RESUME_FAILED` | Could not resume from checkpoint |
| `IDEMPOTENCY_CONFLICT` | Request conflicts with in-flight request |
| `IDEMPOTENCY_EXPIRED` | Idempotency record has expired |

---

*Document created as part of Epic B: Cloud Run Reliability + Durable Orchestration State*
