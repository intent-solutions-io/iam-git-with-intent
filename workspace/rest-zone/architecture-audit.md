# Git With Intent - Enterprise Architecture Audit

**Date:** 2025-12-19
**Auditors:** Security, Infrastructure, Backend specialists (subagents)
**Scope:** Full codebase analysis against enterprise platform requirements

---

## Executive Summary

The Git With Intent codebase at v0.2.0 demonstrates **strong architectural foundations** with excellent multi-tenant isolation and well-designed interfaces. However, **15 critical/high-severity gaps** require remediation before enterprise production readiness.

---

## 1. Critical Findings (P0 - Block Production)

| ID | Gap | Location | Impact |
|----|-----|----------|--------|
| C1 | **JWT/Auth validation missing** | `apps/gateway/src/index.ts:214` | Gateway trusts request body tenantId without caller validation |
| C2 | **Firestore security rules missing** | No `firestore.rules` in infra | No server-side tenant isolation enforcement |
| C3 | **State machine validation missing** | `packages/engine/src/run/engine.ts` | Invalid state transitions allowed (completed→running) |

---

## 2. High-Severity Findings (P1 - Week 1-2)

### Security

| ID | Gap | Location | Status |
|----|-----|----------|--------|
| H1 | Replay protection | `apps/github-webhook` | No X-GitHub-Delivery tracking |
| H2 | Rate limiting not applied | `apps/gateway`, `apps/api` | Middleware exists but not wired |
| H3 | RBAC not enforced | Gateway routes | No `expressRequirePermission` on endpoints |
| H4 | WIF over-permissioned | `infra/iam.tf:93-115` | `run.admin`, `storage.admin` too broad |

### Operations

| ID | Gap | Location | Status |
|----|-----|----------|--------|
| H5 | Pub/Sub DLQ not configured | `infra/cloud_run.tf` | Dead letter topic exists, no retry policy |
| H6 | Metrics in-memory only | `packages/core/observability.ts` | No Cloud Monitoring export |
| H7 | No alerting hooks | `packages/core` | Error thresholds not implemented |
| H8 | Checkpointing missing | `packages/engine` | Long runs lost on Cloud Run restart |

### Infrastructure

| ID | Gap | Location | Status |
|----|-----|----------|--------|
| H9 | Single region deployment | `infra/*.tf` | No multi-region DR capability |
| H10 | No VPC/network security | All Cloud Run services | Public ingress, no Cloud Armor |
| H11 | Budget alerts disabled | `infra/monitoring.tf` | `enable_budget_alerts = false` |

### Data

| ID | Gap | Location | Status |
|----|-----|----------|--------|
| H12 | GCS artifact storage | `packages/engine` | Forensic bundles saved to local filesystem only |
| H13 | Missing Firestore indexes | `firestore.indexes.json` | Jobs collection indexes not defined |

---

## 3. Medium-Severity Findings (P2 - Month 1)

| ID | Gap | Location | Recommendation |
|----|-----|----------|----------------|
| M1 | Schema versioning | Firestore docs | Add `schemaVersion` field to all documents |
| M2 | No Cloud Scheduler | `infra/` | Add for stale run cleanup, DLQ processing |
| M3 | No Cloud Tasks | `infra/` | Required for per-tenant rate limiting |
| M4 | WIF branch restriction | `infra/iam.tf:138` | Add `assertion.ref == 'refs/heads/main'` |
| M5 | No monitoring dashboard | `infra/monitoring.tf` | Add `google_monitoring_dashboard` |
| M6 | Signature bypass in dev | `apps/github-webhook` | Webhook secret not enforced |
| M7 | No circuit breakers | External API calls | Add failure threshold protection |
| M8 | No batch operations | Firestore utils | Inefficient bulk updates |

---

## 4. What EXISTS (Production Ready)

| Component | Status | Evidence |
|-----------|--------|----------|
| Multi-tenant Firestore isolation | EXCELLENT | All queries scoped by tenantId, ownership verified |
| Firestore transactions | GOOD | Used for job claims, atomic updates |
| Audit logging | GOOD | Immutable event store with hash chaining |
| Structured JSON logging | GOOD | Trace correlation with runId/tenantId/stepId |
| Idempotency layer | GOOD | Key-based with TTL and retry logic |
| HMAC webhook verification | GOOD | Timing-safe comparison implemented |
| Secret Manager integration | GOOD | Full provider with rotation procedures |
| RBAC model | GOOD | Role hierarchy and permission matrix defined |
| WIF for GitHub Actions | GOOD | Org-scoped attribute conditions |
| Service account separation | GOOD | Per-service accounts with targeted roles |
| Pub/Sub job queue | GOOD | Ordering support, job metadata |
| Durable job tracking | GOOD | Firestore-backed with heartbeat |
| Approval system types | PARTIAL | Interfaces defined, enforcement missing |
| Budget alert configuration | PARTIAL | Defined but disabled |
| Uptime checks | GOOD | All 4 services monitored |

---

## 5. Gap to Epic/Task Mapping

| Gap ID | Existing Epic | Existing Task | Action |
|--------|---------------|---------------|--------|
| C1 | A | A10 | Enhance: Add Firebase Auth middleware |
| C2 | A | A1 | Add: Create firestore.rules |
| C3 | A | A2 | Enhance: Add state transition validation |
| H1 | B | B3 | Covered: Replay defense task exists |
| H2 | A | A6 | Enhance: Wire rate limiting middleware |
| H3 | A | A10 | Enhance: Apply RBAC to all routes |
| H4 | H | H2 | Covered: WIF hardening task exists |
| H5 | A | A5 | Enhance: Configure DLQ retry policy |
| H6 | H | H3 | Covered: Observability baseline task |
| H7 | A | A12 | Enhance: Add alerting hooks |
| H8 | C | C2 | NEW TASK: Add run checkpointing |
| H9 | H | H4 | Covered: DR plan task exists |
| H10 | H | NEW | NEW TASK: Add VPC/Cloud Armor |
| H11 | H | H6 | Covered: Cost controls task exists |
| H12 | A | A8 | Covered: Artifact model task exists |
| H13 | A | A1 | Enhance: Add job collection indexes |

---

## 6. New Tasks to Add

Based on gaps not covered by existing tasks:

1. **A1.1** - Create firestore.rules for tenant isolation
2. **A2.1** - Implement state machine transition validation
3. **C2.1** - Add run state checkpointing to Firestore
4. **H1.1** - Add VPC with Serverless VPC Access
5. **H1.2** - Configure Cloud Armor WAF
6. **H2.1** - Add WIF branch restriction
7. **M2.1** - Add Cloud Scheduler for periodic tasks
8. **M3.1** - Add Cloud Tasks for rate-limited work

---

## 7. Implementation Priority

### Week 1 (CRITICAL)
1. C1: Firebase Auth middleware in gateway
2. C2: Firestore security rules
3. C3: State machine validation

### Week 2 (HIGH Security)
4. H1: Replay attack protection
5. H2: Wire rate limiting
6. H3: RBAC on all endpoints

### Week 3 (HIGH Ops)
7. H5: DLQ retry policy
8. H6: Metrics export to Cloud Monitoring
9. H7: Alerting hooks
10. H8: Run checkpointing

### Week 4 (HIGH Infra)
11. H4: Reduce CI service account permissions
12. H10: VPC + Cloud Armor
13. H11: Enable budget alerts

---

## 8. Cost Impact

| Remediation | Estimated Monthly Cost |
|-------------|------------------------|
| Cloud Armor (WAF) | $5 + $0.75/M requests |
| Cloud Tasks | $0.40/M operations |
| Cloud Scheduler | $0.10/job/month |
| Multi-region (future) | +50-100% |
| **Total Additional** | **~$20-50/month at current scale** |

---

## 9. Evidence Artifacts

All audit evidence stored in:
- Security audit: Agent ID `acd6684`
- Infrastructure audit: Agent ID `aaa72f2`
- Backend audit: Agent ID `abcd124`

---

## 10. Approval

This audit identifies the gaps between current implementation and enterprise requirements. Remediation should follow the priority order above, with Critical items blocking any production launch.

**Next Step:** Create additional beads for new tasks identified, update dependencies.
