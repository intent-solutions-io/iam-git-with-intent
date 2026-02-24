# 247-CC-FORN: Agent SPIFFE, A2A & Completeness Gap Analysis

**Category:** CC (Code Change) — FORN (Forensics)
**Date:** 2026-02-23
**Status:** Active
**Scope:** All 8 agents, A2A protocol, SPIFFE identity, gateway

---

## Section A: SPIFFE Identity Gap

### What SPIFFE Is

SPIFFE (Secure Production Identity Framework for Everyone) is a CNCF graduated
standard for workload identity. It provides:

- **SPIFFE ID**: A URI (`spiffe://trust-domain/path`) that uniquely identifies a workload
- **SVID**: A short-lived X.509 or JWT certificate proving the workload holds that identity
- **SPIRE**: A runtime that issues SVIDs after workload attestation (verifying the workload is what it claims)
- **Trust domain**: A namespace backed by a certificate authority

### What gwi Implements vs the Spec

| Aspect | SPIFFE Spec | gwi Implementation |
|--------|-------------|-------------------|
| **ID format** | `spiffe://trust-domain/path` | `spiffe://intent.solutions/agent/{name}` — correct format |
| **Verification** | X.509-SVID or JWT-SVID via SPIRE | None — string concatenation only |
| **Trust domain** | Backed by a CA with workload attestation | `intent.solutions` is just a string literal |
| **mTLS** | Mutual TLS between workloads using SVIDs | No TLS between agents (in-process calls) |
| **Per-instance ID** | Each replica gets a unique identity | All instances share the same static ID |
| **Vertex AI** | `principal://agents.global.org-{ORG}.system.id.goog/...` | Gateway has a static `spiffeId` env var, no IAM binding |

### What gwi Gets Right

1. URI format is spec-compliant (`spiffe://intent.solutions/agent/{name}`)
2. Trust domain `intent.solutions` follows naming conventions
3. Agent path structure `/agent/{name}` is clean and extensible
4. A2A messages carry `from`/`to` identity fields for future verification
5. `AgentId` is a branded TypeScript type preventing accidental string usage
6. `createAgentId()` centralizes ID creation in `BaseAgent`

### What's Missing

1. **No identity verification** — agents self-assert identity with no cryptographic proof
2. **No Vertex AI Agent Identity integration** — gateway doesn't bind to Agent Engine's SPIFFE-based IAM (`principal://agents.global.org-{ORG}.system.id.goog/...`)
3. **No per-instance identity** — cannot audit which replica acted on a request
4. **No certificate-based auth** — A2A messages are trusted implicitly
5. **No token/session binding** — SPIFFE IDs are not bound to request contexts

### Recommendation

- **Phase 1 (current)**: Naming convention only. Sufficient for single-process, development-mode execution. No action needed beyond ensuring all agents carry the annotation (see Section D).
- **Phase 2**: Integrate with Vertex AI Agent Identity for production deployments on Agent Engine. This gives real x509 SVIDs and IAM bindings without running SPIRE ourselves.
- **Phase 3**: Add message signing to A2A protocol using Vertex AI-issued JWT-SVIDs.

### References

- [SPIFFE Concepts](https://spiffe.io/docs/latest/spiffe-about/spiffe-concepts/)
- [SPIFFE ID Specification](https://spiffe.io/docs/latest/spiffe-about/spiffe-concepts/#spiffe-id)
- [Vertex AI Agent Identity](https://docs.cloud.google.com/agent-builder/agent-engine/agent-identity)
- [Solo.io: SPIFFE for Agent Identity](https://www.solo.io/blog/agent-identity-and-access-management---can-spiffe-work)
- [HashiCorp: SPIFFE for Agentic AI](https://www.hashicorp.com/en/blog/spiffe-securing-the-identity-of-agentic-ai-and-non-human-actors)

---

## Section B: Agent Inventory & Completeness

### Agent Summary (8 agents)

| # | Agent | SPIFFE ID | LoC | Tests | Token Tracking | Status |
|---|-------|-----------|-----|-------|----------------|--------|
| 1 | Orchestrator | `spiffe://intent.solutions/agent/orchestrator` | 738 | Yes (orchestrator.test.ts) | Stubbed | Production |
| 2 | Foreman | `spiffe://intent.solutions/agent/foreman` | 642 | **None** | Stubbed | Production |
| 3 | Triage | `spiffe://intent.solutions/agent/triage` | 609 | Yes (triage.test.ts) | Stubbed | Production |
| 4 | Coder | `spiffe://intent.solutions/agent/coder` | 686 | Yes (3 test files) | Stubbed | Production |
| 5 | Resolver | `spiffe://intent.solutions/agent/resolver` | 393 | Yes (resolver.test.ts) | Stubbed | Production |
| 6 | Reviewer | `spiffe://intent.solutions/agent/reviewer` | 1246 | Yes (reviewer.test.ts) | Stubbed | Production |
| 7 | Slop Detector | `spiffe://intent.solutions/agent/slop-detector` | 600 | Yes (slop-detector.test.ts) | Stubbed | Production |
| 8 | Infra | `spiffe://intent.solutions/agent/infra` | 832 | **None** | Stubbed | Simulated |

**Total agent code:** ~5,746 LoC across 8 agents + 314 LoC base class.

### Gaps

#### Untested Agents

- **Foreman** (`packages/agents/src/foreman/index.ts`): No `__tests__/` directory exists. The foreman coordinates the 6-stage SWE pipeline (audit → issues → plans → fixes → qa → docs) and is critical for systematic codebase improvements. No test coverage.
- **Infra** (`packages/agents/src/infra/index.ts`): Has `__tests__/` directory but **no test files** inside it. The infra agent's sandbox execution is entirely simulated (comments say "In production, this would..."). No test coverage.

#### Token Tracking

All 8 agents return `tokensUsed: { input: 0, output: 0 }` from their operations. Token tracking is stubbed with comments like "Enhancement: Track from response". This means:
- No cost attribution per agent
- No usage monitoring or alerting
- No billing accuracy for SaaS tier

---

## Section C: A2A Protocol Status

### Core Protocol

- **Location:** `packages/core/src/a2a/index.ts` (277 LoC)
- **Status:** Fully implemented
- **Message types:** 8 types (task_request, task_response, status_update, escalation, claim_work, release_work, query, notification)
- **Priority levels:** 4 levels (low, normal, high, critical)
- **Message structure:** Typed `A2AMessage<TPayload>` with `from`/`to` AgentId fields, correlation IDs, timestamps

### SWE Pipeline Contracts

- **Location:** `packages/core/src/a2a/contracts.ts` (772 LoC)
- **Status:** Complete with Zod validation
- **Pipeline stages:** audit → issues → plans → fixes → qa → docs
- **Risk tiers:** Defined with appropriate controls

### Gateway

- **Location:** `apps/gateway/src/index.ts`
- **Dual-mode routing:**
  - Production: Proxy to Vertex AI Agent Engine via REST
  - Development: Call local engine directly
- **AgentCard discovery:** Served at `/.well-known/agent.json`
- **SPIFFE usage:** Static `spiffeId` from env var, used in A2A message routing

### What's Working

1. Core A2A message protocol with typed payloads
2. Dual-mode gateway (local + Vertex AI Agent Engine)
3. AgentCard discovery endpoint
4. SWE pipeline contracts with Zod validation
5. Correlation IDs for request/response tracking
6. Priority-based message routing

### What's Missing

1. **Message authentication** — no signing or verification of A2A messages. Any component can forge `from` field.
2. **Per-instance routing** — messages are routed to agent types, not specific instances. Cannot target a specific replica.
3. **Vertex AI Agent Identity binding** — gateway doesn't leverage Agent Engine's native SPIFFE support for IAM-based auth.
4. **Message replay protection** — no nonces or expiry on messages.
5. **Rate limiting per agent** — no per-agent throughput controls in the A2A layer.

---

## Section D: Prioritized Remediation Roadmap

### P0: Critical (Do Now)

#### D1. Add SPIFFE ID annotations to 6 agent files
- **Files:** triage, coder, resolver, reviewer, slop-detector, infra
- **Why:** R7 drift gate fires warnings for agent files missing `spiffe://intent.solutions/agent/` literal
- **Effort:** 10 minutes
- **Risk:** Zero — comment-only change
- **Status:** Addressed in this commit

#### D2. Add tests for Foreman agent
- **Why:** Foreman coordinates the entire SWE pipeline; zero test coverage is unacceptable for a critical path agent
- **Effort:** 1-2 days
- **Tests needed:** Pipeline stage transitions, error handling, risk tier controls, agent delegation

#### D3. Add tests for Infra agent
- **Why:** Infra agent handles sandbox execution and IaC generation; no tests despite having a `__tests__/` directory
- **Effort:** 1 day
- **Tests needed:** Plan generation, sandbox type selection, IaC output, approval token validation

### P1: High (Next Sprint)

#### D4. Integrate Vertex AI Agent Identity in gateway
- **Why:** Vertex AI Agent Engine natively provides SPIFFE-based identity with x509 certificates and IAM bindings. gwi's gateway already proxies to Agent Engine but ignores this capability.
- **Effort:** 3-5 days
- **Approach:** Use Agent Engine's `principal://` URIs for service-to-service auth; map to gwi's `spiffe://intent.solutions/agent/*` namespace
- **Benefit:** Real identity verification for production without running SPIRE

#### D5. Implement token tracking across all agents
- **Why:** All 8 agents stub `tokensUsed: { input: 0, output: 0 }`. No cost attribution, usage monitoring, or billing accuracy.
- **Effort:** 2-3 days
- **Approach:** Extract token counts from LLM provider responses in `ModelSelector.chat()`; propagate through agent return types

### P2: Medium (This Quarter)

#### D6. Add message signing to A2A protocol
- **Why:** A2A messages are trusted implicitly; any agent can claim any identity
- **Effort:** 1 week
- **Approach:** JWT-SVID signing using Vertex AI-issued credentials; verify `from` field against signed token
- **Prerequisite:** D4 (Vertex AI Agent Identity)

#### D7. Message replay protection
- **Why:** No nonces or expiry on A2A messages
- **Effort:** 2 days
- **Approach:** Add `nonce` and `expiresAt` fields to `A2AMessage`; reject replays

### P3: Low (Future)

#### D8. Per-instance identity for compliance/audit
- **Why:** All replicas share the same SPIFFE ID; cannot distinguish which instance acted
- **Effort:** 1 week
- **Approach:** Append instance ID to SPIFFE path: `spiffe://intent.solutions/agent/{name}/{instance-id}`
- **Prerequisite:** D4, D6

#### D9. Per-agent rate limiting in A2A layer
- **Why:** No throughput controls per agent type
- **Effort:** 2-3 days
- **Approach:** Token bucket per agent ID in gateway

---

## Appendix: Key File Reference

| File | Role | LoC |
|------|------|-----|
| `packages/core/src/a2a/index.ts` | A2A protocol core types and helpers | 277 |
| `packages/core/src/a2a/contracts.ts` | SWE pipeline contracts with Zod | 772 |
| `packages/core/src/types.ts:9` | `AgentId` branded type definition | — |
| `packages/agents/src/base/agent.ts` | `BaseAgent` class with `createAgentId()` | 314 |
| `apps/gateway/src/index.ts` | A2A gateway + Vertex AI proxy | — |
| `scripts/arv/drift-gate.ts:286-304` | R7 SPIFFE identity check | — |
