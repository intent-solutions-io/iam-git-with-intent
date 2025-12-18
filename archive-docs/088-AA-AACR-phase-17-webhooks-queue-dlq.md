# Phase 17: Webhooks + Queue + DLQ + Worker Handlers

**Document ID**: 088-AA-AACR-phase-17-webhooks-queue-dlq
**Type**: After-Action Completion Report (AACR)
**Phase**: 17
**Status**: COMPLETE
**Date**: 2025-12-17 11:05 CST
**Author**: Claude Code (Bob-style foreman)

## Metadata (Required)

| Field | Value |
|-------|-------|
| Beads (Epic) | `git-with-intent-ejw` |
| Beads (Tasks) | `git-with-intent-ejw.1` (17.1), `git-with-intent-ejw.2` (17.2), `git-with-intent-ejw.3` (17.3), `git-with-intent-ejw.4` (17.4), `git-with-intent-ejw.5` (17.5), `git-with-intent-ejw.6` (17.6) |
| AgentFS | Agent ID: `gwi`, Mount: `.agentfs/`, DB: `.agentfs/gwi.db` |
| AgentFS Evidence | Turso sync: `libsql://gwi-agentfs-jeremylongshore.aws-us-east-1.turso.io` |

---

## Executive Summary

Phase 17 completes the production webhook-to-worker pipeline with verified signature checking, job queue abstraction, Dead Letter Queue (DLQ) configuration, and production-ready workflow handlers. This phase bridges the gap between GitHub webhook ingress and durable background job processing.

---

## Scope

### In Scope
- Webhook signature verification wiring (using centralized `@gwi/core` security)
- Job queue abstraction (`@gwi/core/queue`) with Pub/Sub and in-memory implementations
- Worker handlers for workflow execution, signal processing, and candidate generation
- Terraform DLQ configuration for failed message handling
- Queue module tests
- Environment-aware queue initialization

### Out of Scope
- Worker scaling policies
- Metrics/alerting dashboards
- Multi-region DLQ replication
- Message replay tooling

---

## Deliverables

### 17.1 Webhook Ingress Verification Wiring

**File**: `apps/github-webhook/src/index.ts`

| Feature | Description |
|---------|-------------|
| Centralized verification | Replaced local `verifySignature` with `verifyGitHubWebhookSignature` from `@gwi/core` |
| Enhanced logging | Added signature type and detailed error logging |
| Backward compatibility | Works with both sha1 and sha256 signatures |

### 17.2 Queue Publish Abstraction + API Enqueue

**File**: `packages/core/src/queue/index.ts`

| Feature | Description |
|---------|-------------|
| `PubSubJobQueue` | Google Cloud Pub/Sub implementation with lazy connection |
| `InMemoryJobQueue` | Development fallback with queue inspection |
| Job factories | `createWorkflowJob`, `createSignalJob`, `createCandidateJob` |
| Singleton access | `getJobQueue()` with environment-aware initialization |
| Batch publishing | `publishBatch()` for multiple jobs |

### 17.3 Worker Handlers + Reliability Hooks

**File**: `apps/worker/src/handlers/index.ts`

| Handler | Purpose |
|---------|---------|
| `workflow:execute` | Executes GWI workflows (triage, resolve, review, autopilot) |
| `signal:process` | Processes lightweight PR/issue signals |
| `candidate:generate` | Generates PR candidates from work items |
| `health:check` | Health check job for testing |

Features:
- Engine integration for workflow execution
- Tenant validation before processing
- Checkpoint resume capability
- Lock extension for long-running jobs

### 17.4 DLQ Terraform + Local Simulation

**Files**:
- `infra/terraform/cloud_run.tf` - DLQ topic, subscription, dead_letter_policy
- `infra/terraform/variables.tf` - `gwi_worker_max_delivery_attempts`

| Resource | Purpose |
|----------|---------|
| `google_pubsub_topic.gwi_worker_dlq` | Dead letter topic for failed messages |
| `google_pubsub_subscription.gwi_worker_dlq_sub` | Pull subscription for DLQ investigation |
| `dead_letter_policy` on push subscription | Routes failed messages after max attempts |

Configuration:
- 5 max delivery attempts (configurable)
- 14-day DLQ message retention
- Pull mode for manual investigation

### 17.5 Queue Module Tests

**File**: `packages/core/src/queue/__tests__/queue.test.ts`

| Test Suite | Tests |
|------------|-------|
| createJobQueue | 2 tests |
| getJobQueue | 2 tests |
| InMemoryJobQueue | 8 tests |
| setJobQueue | 1 test |
| enqueueJob | 1 test |
| Job Factories | 4 tests |
| **Total** | **18 tests** |

---

## Technical Decisions

### 1. Centralized Webhook Verification
**Decision**: Use `verifyGitHubWebhookSignature` from `@gwi/core` instead of local implementation
**Rationale**: Single source of truth for security-critical code; easier to audit and update

### 2. QueuePublishResult Naming
**Decision**: Renamed from `PublishResult` to `QueuePublishResult`
**Rationale**: Avoided name collision with `run-bundle/index.js` exports

### 3. Environment-Aware Queue
**Decision**: Queue auto-selects Pub/Sub (with GCP_PROJECT_ID) or in-memory (without)
**Rationale**: Enables local development without GCP; same code path for dev/prod

### 4. Configurable DLQ Attempts
**Decision**: Made max delivery attempts configurable via Terraform variable
**Rationale**: Different environments may need different retry policies

---

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `packages/core/src/queue/index.ts` | Job queue abstraction |
| `packages/core/src/queue/__tests__/queue.test.ts` | Queue module tests |
| `apps/worker/src/handlers/index.ts` | Production job handlers |

### Modified Files
| File | Changes |
|------|---------|
| `apps/github-webhook/src/index.ts` | Integrated centralized webhook verification, USE_JOB_QUEUE config |
| `apps/worker/src/index.ts` | Registered production handlers |
| `packages/core/src/index.ts` | Added queue module export |
| `infra/terraform/cloud_run.tf` | Added DLQ topic, subscription, dead_letter_policy |
| `infra/terraform/variables.tf` | Added `gwi_worker_max_delivery_attempts` |

---

## Verification

### Build Status
```
npm run build
 Tasks:    12 successful, 12 total
  Time:    4.747s
```

### Type Check
```
npm run typecheck
 Tasks:    16 successful, 16 total
  Time:    10.523s
```

### Tests
```
npm run test
 Tasks:    23 successful, 23 total
 Tests:    396+ passed (18 new queue tests)
  Time:    23.283s
```

---

## API Reference

### Queue Usage

```typescript
import {
  enqueueJob,
  createWorkflowJob,
  createSignalJob,
  getJobQueue,
  type QueueJob,
} from '@gwi/core';

// Enqueue a workflow execution job
const job = createWorkflowJob(tenantId, runId, 'pr-resolve', {
  pr: { number: 42, url: 'https://github.com/...' }
});
const result = await enqueueJob(job);

// Direct queue access
const queue = getJobQueue();
await queue.publish(job);
```

### Webhook Queue Mode

```bash
# Enable queue mode in github-webhook
export USE_JOB_QUEUE=true
```

### Terraform Variables

```hcl
variable "gwi_worker_max_delivery_attempts" {
  description = "Maximum delivery attempts before sending to DLQ"
  default     = 5
}
```

---

## Known Limitations

1. **In-Memory Queue**: Does not persist across restarts in dev mode
2. **DLQ is Pull-Only**: Manual investigation required for failed messages
3. **No Message Replay**: DLQ messages must be manually republished
4. **Single-Tenant Handlers**: Handlers process one tenant at a time

---

## Next Phases / TODOs

1. **DLQ Dashboard**: Add Cloud Monitoring alerts for DLQ message count
2. **Message Replay Tool**: CLI tool to republish DLQ messages
3. **Worker Metrics**: Add Prometheus metrics for job processing
4. **Rate Limiting Integration**: Apply rate limits at queue publish time
5. **Dead Letter Analysis**: Automatic categorization of DLQ failures

---

## Metrics

| Metric | Value |
|--------|-------|
| New files created | 3 |
| Files modified | 5 |
| Lines added (estimated) | ~800 |
| Build time | 4.7s |
| Typecheck time | 10.5s |
| Test time | 23s |
| New tests added | 18 |
| All tests passing | Yes (396+ tests) |

---

## Artifacts

| Artifact | Location |
|----------|----------|
| Build log | npm run build (12 packages) |
| Test report | npm run test (23 tasks, 396+ tests) |
| Typecheck | npm run typecheck (16 tasks passed) |

---

## Conclusion

Phase 17 successfully completes the webhook-to-worker pipeline with production-ready reliability:

1. **Verified Ingress**: Webhook signatures are verified using centralized security code
2. **Queue Abstraction**: Jobs can be published to Pub/Sub or in-memory queue
3. **Production Handlers**: Workflow execution, signals, and candidates have handlers
4. **DLQ Safety Net**: Failed messages are captured for investigation

The system now supports durable, reliable background job processing with proper failure handling.

**Phase Status**: COMPLETE

---

*Generated by: Claude Code (Bob-style foreman)*
*Template version: 2.0 (Beads + AgentFS metadata required)*
*This document follows 000-docs filing convention (flat, no nesting)*
