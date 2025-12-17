# Phase 16: Worker Execution + Durable Reliability

**Document ID**: 087-AA-AACR-phase-16-worker-reliability
**Type**: After-Action Completion Report (AACR)
**Phase**: 16
**Status**: COMPLETE
**Date**: 2025-12-17 10:45 CST
**Author**: Claude Code (Bob-style foreman)

## Metadata (Required)

| Field | Value |
|-------|-------|
| Beads (Epic) | `git-with-intent-ssd` |
| Beads (Tasks) | `git-with-intent-ssd.1` (16.1), `git-with-intent-ssd.2` (16.2), `git-with-intent-ssd.3` (16.3), `git-with-intent-ssd.4` (16.4), `git-with-intent-ssd.5` (16.5), `git-with-intent-ssd.6` (16.6), `git-with-intent-ssd.7` (16.7) |
| AgentFS | Agent ID: `gwi`, Mount: `.agentfs/`, DB: `.agentfs/gwi.db` |
| AgentFS Evidence | Turso sync: `libsql://gwi-agentfs-jeremylongshore.aws-us-east-1.turso.io` |

---

## Executive Summary

Phase 16 implements the production worker infrastructure for durable, reliable background job processing. This includes distributed locking with Firestore transactions, idempotency for deduplication, checkpoint-based resume/replay, a Pub/Sub-backed worker service, and complete Cloud Run deployment wiring.

---

## Scope

### In Scope
- Firestore distributed locking with transaction-based atomicity
- Firestore idempotency store with TTL and run-scoped queries
- Firestore checkpoint manager for resume/replay
- Worker service app (`apps/worker`) with Express
- Job processor with reliability guarantees
- Pub/Sub abstraction with GCP integration + in-memory dev fallback
- Terraform wiring for Cloud Run worker + Pub/Sub topic/subscription
- Environment-aware store initialization

### Out of Scope
- Redis-backed rate limiting (future)
- DLQ (Dead Letter Queue) configuration
- Worker metrics/monitoring dashboards
- Multi-region deployment

---

## Deliverables

### 16.1 Firestore Distributed Locking

**File**: `packages/core/src/reliability/firestore-locking.ts`

| Feature | Description |
|---------|-------------|
| Transaction-based atomicity | Uses Firestore transactions for lock acquisition |
| TTL auto-expiration | Expired locks are automatically cleaned up |
| Fencing tokens | Incrementing tokens for safe lock extension |
| Lock extend | Extend TTL without re-acquisition |
| Force release | Admin operation for stuck locks |

### 16.2 Firestore Idempotency Store

**File**: `packages/core/src/reliability/firestore-idempotency.ts`

| Feature | Description |
|---------|-------------|
| Atomic creation | Transaction-based record creation |
| TTL expiration | 24-hour default with configurable TTL |
| Run-scoped queries | List all idempotency records for a run |
| Status tracking | pending/completed/failed states |
| Result caching | Cached results for completed operations |

### 16.3 Firestore Checkpoint Manager

**File**: `packages/core/src/reliability/firestore-checkpoint.ts`

| Feature | Description |
|---------|-------------|
| Durable persistence | Checkpoints survive restarts |
| Artifact serialization | JSON with 1MB size limit |
| Tenant-scoped queries | List checkpoints by tenant |
| Status filtering | Query by run status |
| Optimistic concurrency | Version field for safe updates |

### 16.4 Worker Service

**Files**:
- `apps/worker/src/index.ts` - Express app with health checks
- `apps/worker/src/processor.ts` - Job processor with reliability
- `apps/worker/package.json` - Dependencies and scripts
- `apps/worker/tsconfig.json` - TypeScript configuration

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness probe |
| `GET /ready` | Readiness probe |
| `POST /push` | Pub/Sub push messages |
| `GET /stats` | Worker statistics |
| `POST /process` | Manual job trigger (dev only) |

### 16.5 Pub/Sub Abstraction

**File**: `apps/worker/src/pubsub.ts`

| Implementation | Use Case |
|----------------|----------|
| `PubSubBroker` | GCP Pub/Sub for production |
| `InMemoryBroker` | Development and testing |

Features:
- Push and pull mode support
- Message acknowledgement handling
- Dynamic import for optional Pub/Sub dependency
- Queue inspection for testing

### 16.6 Cloud Run Deployment Wiring

**Files**:
- `infra/terraform/cloud_run.tf` - Worker service, topic, subscription
- `infra/terraform/variables.tf` - Worker configuration variables

| Resource | Purpose |
|----------|---------|
| `google_service_account.gwi_worker` | Worker service account |
| `google_cloud_run_service.gwi_worker` | Worker Cloud Run service |
| `google_pubsub_topic.gwi_worker_jobs` | Job queue topic |
| `google_pubsub_subscription.gwi_worker_push` | Push subscription to Cloud Run |

IAM Permissions:
- `roles/datastore.user` - Firestore access
- `roles/pubsub.subscriber` - Message consumption
- `roles/pubsub.publisher` - Re-queueing
- `roles/run.invoker` - Pub/Sub to invoke Cloud Run

---

## Technical Decisions

### 1. Firestore for Distributed Primitives
**Decision**: Use Firestore transactions for locks, idempotency, and checkpoints
**Rationale**: Already using Firestore; transactions provide ACID guarantees; no additional infrastructure

### 2. Push Mode for Cloud Run Worker
**Decision**: Use Pub/Sub push subscriptions to Cloud Run
**Rationale**: Better scaling behavior; Cloud Run handles concurrency; simpler deployment

### 3. In-Memory Dev Fallback
**Decision**: Use in-memory broker when `GCP_PROJECT_ID` is not set
**Rationale**: Enables local development without GCP; fast feedback loop

### 4. Container Concurrency of 1
**Decision**: Default worker concurrency is 1 job per container
**Rationale**: Simplifies lock management; avoids resource contention; more predictable scaling

---

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `packages/core/src/reliability/firestore-locking.ts` | Distributed lock manager |
| `packages/core/src/reliability/firestore-idempotency.ts` | Idempotency store |
| `packages/core/src/reliability/firestore-checkpoint.ts` | Checkpoint manager |
| `apps/worker/src/index.ts` | Worker service entry |
| `apps/worker/src/processor.ts` | Job processor |
| `apps/worker/src/pubsub.ts` | Pub/Sub abstraction |
| `apps/worker/package.json` | Package configuration |
| `apps/worker/tsconfig.json` | TypeScript configuration |

### Modified Files
| File | Changes |
|------|---------|
| `packages/core/src/reliability/index.ts` | Added Firestore exports, environment-aware getters |
| `packages/core/src/storage/firestore-client.ts` | Added Phase 16 collection constants |
| `infra/terraform/cloud_run.tf` | Added worker service, topic, subscription |
| `infra/terraform/variables.tf` | Added worker configuration variables |
| `000-docs/086-AA-AACR-phase-15-firestore-persistence.md` | Fixed metadata compliance |

---

## Verification

### Build Status
```
npm run build
 Tasks:    12 successful, 12 total
  Time:    4.487s
```

### Type Check
```
npm run typecheck
 Tasks:    16 successful, 16 total
  Time:    10.991s
```

### Tests
```
npm run test
 Tasks:    23 successful, 23 total
 Tests:    533 passed
  Time:    4.955s
```

---

## API Reference

### Reliability Store Initialization

```typescript
import {
  initializeReliabilityStores,
  getDistributedLockManager,
  getDistributedIdempotencyStore,
  getFirestoreCheckpointManager,
} from '@gwi/core';

// Initialize based on GWI_STORE_BACKEND environment variable
initializeReliabilityStores();

// Get stores (auto-initializes if needed)
const lockManager = getDistributedLockManager();
const idempotencyStore = getDistributedIdempotencyStore();
const checkpointManager = getFirestoreCheckpointManager();
```

### Worker Job Format

```typescript
interface WorkerJob {
  id?: string;
  type: string;           // Job type (determines handler)
  tenantId: string;       // Tenant scope
  runId?: string;         // Associated run (for locking)
  payload: Record<string, unknown>;
  metadata?: {
    maxRetries?: number;
    retryCount?: number;
    priority?: number;
    deadline?: number;
  };
}
```

### Terraform Variables

```hcl
variable "gwi_worker_image" {
  description = "Docker image for GWI Worker service"
  default     = ""
}

variable "gwi_worker_max_instances" {
  description = "Max Cloud Run instances for Worker"
  default     = 10
}

variable "gwi_worker_concurrency" {
  description = "Container concurrency for Worker"
  default     = 1
}

variable "gwi_worker_topic" {
  description = "Pub/Sub topic name for worker jobs"
  default     = "gwi-worker-jobs"
}

variable "gwi_worker_subscription" {
  description = "Pub/Sub subscription name for worker"
  default     = "gwi-worker-push-sub"
}
```

---

## Known Limitations

1. **In-Memory Reliability in Dev**: Lock/idempotency stores use in-memory when not in Firestore mode
2. **No DLQ**: Failed messages retry indefinitely (per Pub/Sub subscription settings)
3. **Single Concurrency Default**: Horizontal scaling requires more containers
4. **Artifact Size Limit**: Checkpoint artifacts truncated at 1MB

---

## Next Phases / TODOs

1. **Worker Job Handlers**: Implement actual workflow execution handlers
2. **DLQ Configuration**: Add dead letter queue for failed messages
3. **Metrics & Dashboards**: Add Cloud Monitoring dashboards for worker
4. **Multi-Region**: Deploy workers in multiple regions
5. **Redis Rate Limiting**: Implement distributed rate limiting for horizontal scaling

---

## Metrics

| Metric | Value |
|--------|-------|
| New files created | 8 |
| Files modified | 5 |
| Lines added (estimated) | ~2,000 |
| Build time | 4.5s |
| Typecheck time | 11s |
| Test time | 5s |
| All tests passing | Yes (533 tests) |

---

## Artifacts

| Artifact | Location |
|----------|----------|
| Build log | npm run build (12 packages) |
| Test report | npm run test (533 tests passed) |
| Typecheck | npm run typecheck (16 tasks passed) |

---

## Conclusion

Phase 16 successfully implements the production worker infrastructure with full reliability guarantees. The worker service can now process background jobs with distributed locking (preventing concurrent mutation), idempotency (preventing duplicate processing), and checkpoints (enabling resume/replay). The Terraform configuration provides complete deployment wiring with Pub/Sub integration.

**Phase Status**: COMPLETE

---

*Generated by: Claude Code (Bob-style foreman)*
*Template version: 2.0 (Beads + AgentFS metadata required)*
*This document follows 000-docs filing convention (flat, no nesting)*
