# 013-AA-AACR: Phase 2 After-Action Report - Git With Intent SaaS Core Design

**Document ID:** 013-AA-AACR
**Document Type:** After-Action Completion Report (AAR)
**Created:** 2025-12-15
**Last Updated:** 2025-12-15
**Status:** COMPLETED
**Author:** Jeremy Longshore, Claude Code (Opus 4.5)
**Phase:** Phase 2 - SaaS Core Design

---

> **Filing Standard:** This document follows docs-filing v4 (6767-a-DR-STND-document-filing-system-standard-v4.md)
> - `013` = chronological sequence number
> - `AA` = Administrative category
> - `AACR` = After-Action Completion Report type

---

## 1. Executive Summary

Phase 2 of Git With Intent focused on **SaaS Core Design** - establishing the multi-tenant architecture, API surface, and agent pipeline design for the cloud-hosted version of the product.

**Outcome:** COMPLETED SUCCESSFULLY

All six completion criteria were met:
1. PRD for Git With Intent Cloud v0.1
2. Multi-tenant model ADR
3. API surface ADR for gwi-api
4. Run types and sub-agent pipelines documented
5. SaaS runtime storage decision made (Firestore)
6. Phase 2 AAR (this document)

---

## 2. Phase Objectives and Results

| Objective | Status | Deliverable |
|-----------|--------|-------------|
| Create SaaS PRD | DONE | 009-PM-PRDC-git-with-intent-cloud-saas-v0-1.md |
| Design multi-tenant model | DONE | 010-DR-ADRC-gwi-multi-tenant-model.md |
| Define API surface | DONE | 011-DR-ADRC-gwi-api-surface-v0-1.md |
| Document run types and pipelines | DONE | 012-AT-ARCH-run-types-and-agent-pipeline.md |
| Choose storage backend | DONE | Firestore (documented in ADRs) |
| Add TypeScript interfaces | DONE | packages/core/src/storage/interfaces.ts |
| Create Phase 2 AAR | DONE | This document |

---

## 3. Key Decisions Made

### 3.1 Tenant Model

**Decision:** A Tenant equals a GitHub Organization Installation

- Tenant ID format: `gh-org-{github_org_id}`
- Users authenticate via Firebase Auth with GitHub OAuth
- User-to-tenant relationship managed via Membership collection
- Three tenant roles: owner, admin, member

**Rationale:** Aligns with GitHub's organizational model and simplifies permission mapping.

### 3.2 Storage Backend

**Decision:** Firestore for SaaS runtime storage

- SQLite remains for CLI-only local usage
- Firestore provides natural multi-tenant partitioning
- Subcollection pattern: `tenants/{tenantId}/repos/`, `tenants/{tenantId}/runs/`
- Security rules enforce tenant isolation

**Rationale:** Firestore is the "boring" choice that integrates cleanly with Firebase Auth and provides real-time capabilities for future UI needs.

### 3.3 API Architecture

**Decision:** Three Cloud Run services with clear separation

| Service | Purpose |
|---------|---------|
| gwi-api | REST API for web UI and CLI |
| gwi-webhook | GitHub webhook handler |
| gwi-a2a-gateway | A2A protocol proxy to Agent Engine |

**Rationale:** Follows bobs-brain patterns for Cloud Run gateway architecture.

### 3.4 Run Types

**Decision:** Five run types with specialized agent pipelines

| Run Type | Pipeline |
|----------|----------|
| TRIAGE | Orchestrator → TriageAgent |
| PLAN | Orchestrator → TriageAgent → PlannerAgent |
| RESOLVE | Orchestrator → TriageAgent → PlannerAgent → CoderAgent → ValidatorAgent |
| REVIEW | Orchestrator → ReviewerAgent |
| AUTOPILOT | Full pipeline (all agents) |

**Rationale:** Provides flexibility from lightweight triage to full automation.

### 3.5 Multi-LLM Strategy

**Decision:** Model selection based on task type and complexity

| Task | Default | Escalation |
|------|---------|------------|
| Triage | Gemini Flash | Gemini Pro |
| Planning | Gemini Flash | Claude Sonnet |
| Code | Claude Sonnet | Claude Opus |
| Review | Claude Sonnet | Claude Opus |

**Rationale:** Optimize cost by using cheaper models for routing, reserving premium models for code generation.

---

## 4. Artifacts Produced

### 4.1 Documentation

| Document | Type | Purpose |
|----------|------|---------|
| 009-PM-PRDC-git-with-intent-cloud-saas-v0-1.md | PRD | Product requirements for SaaS offering |
| 010-DR-ADRC-gwi-multi-tenant-model.md | ADR | Multi-tenant data model design |
| 011-DR-ADRC-gwi-api-surface-v0-1.md | ADR | REST API endpoint design |
| 012-AT-ARCH-run-types-and-agent-pipeline.md | ARCH | Run types and agent pipeline details |
| 013-AA-AACR-phase-2-gwi-saas-core-design.md | AAR | This document |

### 4.2 Code

| File | Changes |
|------|---------|
| packages/core/src/storage/interfaces.ts | Added SaaS multi-tenant types: TenantRole, MembershipStatus, PlanTier, RiskMode, Tenant, TenantSettings, TenantRepo, RepoSettings, User, UserPreferences, Membership, SaaSRun, TenantStore, UserStore, MembershipStore |

---

## 5. Patterns Applied

### 5.1 From bobs-brain

- **A2A Protocol:** Agent-to-agent communication pattern for orchestrator → specialists
- **SPIFFE IDs:** Agent identity format (spiffe://gwi.intentsolutions.io/agents/{role})
- **Cloud Run Gateways:** Separate services for API, webhooks, and A2A routing
- **Correlation IDs:** Pipeline-wide request tracing

### 5.2 From docs-filing v4

- Flat 000-docs/ directory with sequential numbering
- Category codes: PM (Product), DR (Documentation), AT (Architecture), AA (Administrative)
- Document type suffixes: PRDC, ADRC, ARCH, AACR

### 5.3 From Runtime vs DevTools Policy

- **Runtime (SaaS):** Firestore, Firebase Auth - no AgentFS/Beads
- **DevTools (Internal):** May use AgentFS/Beads for internal tooling
- Storage interfaces remain backend-agnostic

---

## 6. Integration Points Identified

### 6.1 External

| System | Integration |
|--------|-------------|
| GitHub | App installation, webhooks, API for PR/issue data |
| Firebase Auth | User authentication via GitHub OAuth |
| Vertex AI Agent Engine | Agent runtime for triage/plan/code/review |
| Firestore | Multi-tenant data storage |

### 6.2 Internal

| Component | Dependency |
|-----------|------------|
| gwi-api | Firestore, Firebase Auth, gwi-a2a-gateway |
| gwi-webhook | Firestore, gwi-a2a-gateway |
| gwi-a2a-gateway | Vertex AI Agent Engine |
| Agent Engine | Orchestrator, specialist agents |

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cross-tenant data leak | Low | Critical | Security rules + API validation |
| GitHub rate limiting | Medium | Medium | Backoff strategies, queue management |
| LLM cost overruns | Medium | Medium | Usage limits, model escalation thresholds |
| User adoption friction | Medium | Medium | Simple onboarding, sensible defaults |

---

## 8. Next Phase Preview

**Phase 3: Implementation Scaffolding** (proposed)

1. Create gwi-api Cloud Run service skeleton
2. Create gwi-webhook Cloud Run service skeleton
3. Create gwi-a2a-gateway Cloud Run service skeleton
4. Implement FirestoreRunStore
5. Implement FirestoreTenantStore
6. Set up Firebase project configuration
7. Create GitHub App manifest

---

## 9. Lessons Learned

### What Went Well

1. **bobs-brain patterns provided clear reference** - A2A protocol and Cloud Run gateway patterns transferred cleanly
2. **docs-filing v4 provided structure** - Consistent document naming made organization clear
3. **TypeScript interfaces first** - Defining interfaces before implementation clarified the data model
4. **Subcollection pattern** - Firestore's hierarchical model maps naturally to multi-tenant isolation

### What Could Improve

1. **More detailed error codes** - API surface ADR could benefit from a comprehensive error catalog
2. **Webhook signature verification** - Not yet documented in detail
3. **Rate limiting specifics** - Numbers are placeholder, need production tuning

---

## 10. Completion Checklist

- [x] PRD for Git With Intent Cloud v0.1 exists
- [x] Multi-tenant model ADR exists
- [x] API surface ADR for gwi-api exists
- [x] Run types and sub-agent pipelines documented
- [x] SaaS runtime storage decision made (Firestore)
- [x] TypeScript interfaces added to storage module
- [x] Phase 2 AAR exists (this document)

---

## 11. References

### Phase 2 Documents

- 009-PM-PRDC-git-with-intent-cloud-saas-v0-1.md
- 010-DR-ADRC-gwi-multi-tenant-model.md
- 011-DR-ADRC-gwi-api-surface-v0-1.md
- 012-AT-ARCH-run-types-and-agent-pipeline.md

### External References

- bobs-brain/101-AT-ARCH-agent-engine-topology-and-envs.md
- bobs-brain/102-AT-ARCH-cloud-run-gateways-and-agent-engine-routing.md
- 6767-a-DR-STND-document-filing-system-standard-v4.md

### Phase 1 Documents

- 004-DR-ADRC-runtime-vs-devtools.md
- 006-DR-ADRC-agentfs-beads-internal-devtools-only.md
- 007-DR-ADRC-directory-structure.md
- 008-AA-AACR-phase-1a-internal-devtools-setup.md

---

**Phase Status:** COMPLETED
**Date:** 2025-12-15

---

*intent solutions io — confidential IP*
*Contact: jeremy@intentsolutions.io*
