# A5 Deferred Items - Tech Debt Tracker

**Created**: 2025-12-19
**Status**: DEFERRED (not blocking)
**Epic**: A - Platform Core Runtime

## Context

A5 (Queue Abstraction) core functionality is complete and deployed. The following subtasks are deferred per CTO prioritization - production safety (A6 concurrency caps) takes precedence over polish and documentation.

## Deferred Items

### A5.s3: Exponential Backoff Policy
**Issue ID**: `git-with-intent-os3`
**Priority**: P3 (Low)
**Reason Deferred**: Pub/Sub has native retry with backoff. Current `maxRetries` field works. Explicit 10s/60s/300s backoff is optimization, not requirement.
**Trigger to Revisit**: If we see retry storms or need finer control over retry timing.
**Estimated Effort**: 2-4 hours

### A5.s4: DLQ Triage Runbook
**Issue ID**: `git-with-intent-bmv`
**Priority**: P3 (Low)
**Reason Deferred**: DLQ infrastructure is deployed (`gwi-worker-dlq` topic + subscription). Engineers can manually query. Runbook is documentation, not functionality.
**Trigger to Revisit**: First real DLQ incident, or SRE onboarding.
**Estimated Effort**: 1-2 hours
**Location when written**: `000-docs/NNN-DR-RUNB-dlq-triage.md`

### A5.s5: Cloud Tasks Per-Tenant Throttling
**Issue ID**: `git-with-intent-ukd`
**Priority**: P4 (Backlog)
**Reason Deferred**: Explicitly marked "optional" in original spec. A6 concurrency caps provide tenant-level limits. Cloud Tasks adds per-tenant rate limiting which is a refinement.
**Trigger to Revisit**: Customer request for guaranteed rate limits, or if Pub/Sub throughput becomes problematic.
**Estimated Effort**: 1-2 days

## Current A5 State (What Works)

- `QueueJob` interface with full envelope (tenantId, runId, metadata)
- Pub/Sub publisher (`@gwi/core/queue`)
- Pub/Sub subscriber (`apps/worker/src/pubsub.ts`)
- Firestore durable job store with lifecycle tracking
- Infrastructure: `gwi-worker-jobs` topic, `gwi-worker-dlq` topic, push subscription
- Worker processor with idempotency and locking

## Related

- A6: Concurrency Caps (IN PROGRESS - higher priority)
- A4: Idempotency Layer (COMPLETE)
