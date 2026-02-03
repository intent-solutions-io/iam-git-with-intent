# GWI Agent Department Architecture

**Document ID:** 200-DR-ARCH-agent-department-architecture
**Status:** Active
**Created:** 2026-02-02
**Purpose:** Define the complete multi-agent architecture for Git With Intent

---

## I. Executive Summary

Git With Intent implements a **three-tier multi-agent architecture** inspired by the Bob's Brain IAM Department pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│                     EXTERNAL INTERFACES                          │
│  Slack │ GitHub │ CLI │ MCP (Copilot/Cursor/Claude) │ Web UI   │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    TIER 1: GATEWAYS (Cloud Run)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ A2A      │  │ GitHub   │  │ Worker   │  │ MCP Server       │ │
│  │ Gateway  │  │ Webhook  │  │ Service  │  │ (AI Assistants)  │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘ │
└───────┼─────────────┼────────────┼──────────────────┼───────────┘
        │             │            │                  │
┌───────▼─────────────▼────────────▼──────────────────▼───────────┐
│                    TIER 2: ORCHESTRATION                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   OrchestratorAgent                         ││
│  │  • Routes workflows (pr-resolve, issue-to-code, review)     ││
│  │  • Manages agent registry                                   ││
│  │  • Handles escalations                                      ││
│  └──────────────────────────┬──────────────────────────────────┘│
│                             │                                    │
│  ┌──────────────────────────▼──────────────────────────────────┐│
│  │                    ForemanAgent (SWE Pipeline)              ││
│  │  audit → issues → plans → fixes → qa → docs                 ││
│  └──────────────────────────┬──────────────────────────────────┘│
└─────────────────────────────┼───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                    TIER 3: SPECIALISTS                           │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ Triage     │  │ Coder      │  │ Resolver   │  │ Reviewer   │ │
│  │ Agent      │  │ Agent      │  │ Agent      │  │ Agent      │ │
│  │ (Flash)    │  │ (Sonnet)   │  │ (Sonnet/   │  │ (Flash 2.5)│ │
│  │            │  │            │  │  Opus)     │  │            │ │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## II. Agent Team

### Tier 1: Gateways (Cloud Run - REST Proxies Only)

| Service | Purpose | Port | Endpoint |
|---------|---------|------|----------|
| **A2A Gateway** | Agent-to-Agent protocol endpoint | 8080 | `/v1/agents/{agent}/tasks` |
| **GitHub Webhook** | PR/Issue event handler | 8080 | `/webhooks/github` |
| **Worker Service** | Async job processing | 8080 | Pub/Sub push |
| **MCP Server** | AI assistant integration | 8080 | `/mcp` (JSON-RPC) |

**Hard Mode R3 Compliance:** Gateways do NOT import `Runner` or run agents locally. They proxy to Agent Engine via REST API.

### Tier 2: Orchestration

| Agent | SPIFFE ID | Model | Purpose |
|-------|-----------|-------|---------|
| **OrchestratorAgent** | `spiffe://intent.solutions/agent/orchestrator` | Gemini Flash | Route workflows, manage registry |
| **ForemanAgent** | `spiffe://intent.solutions/agent/foreman` | Gemini Flash | SWE pipeline coordination |

### Tier 3: Specialists

| Agent | SPIFFE ID | Model | Purpose | Pipeline Stage |
|-------|-----------|-------|---------|----------------|
| **TriageAgent** | `spiffe://intent.solutions/agent/triage` | Gemini Flash | Complexity scoring, routing | audit, issues |
| **CoderAgent** | `spiffe://intent.solutions/agent/coder` | Claude Sonnet | Code generation, planning | plans, fixes, docs |
| **ResolverAgent** | `spiffe://intent.solutions/agent/resolver` | Claude Sonnet/Opus | Merge conflict resolution | fixes (conflicts) |
| **ReviewerAgent** | `spiffe://intent.solutions/agent/reviewer` | Gemini Flash 2.5 | QA, code review | qa |

---

## III. SWE Pipeline (Foreman-Coordinated)

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  AUDIT  │───▶│ ISSUES  │───▶│  PLANS  │───▶│  FIXES  │───▶│   QA    │───▶│  DOCS   │
│ Triage  │    │ Triage  │    │  Coder  │    │  Coder  │    │Reviewer │    │  Coder  │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
     │              │              │              │              │              │
     ▼              ▼              ▼              ▼              ▼              ▼
  IssueSpec[]   IssueSpec[]    FixPlan[]    FixResult[]   QAVerdict[]   DocUpdate[]
```

### Pipeline Types

| Type | Stages Run | Use Case |
|------|------------|----------|
| `full_audit` | All 6 stages | Complete codebase improvement |
| `targeted_fix` | plans→fixes→qa→docs | Fix specific issues |
| `security_scan` | audit→issues | Security-only scan |
| `docs_refresh` | docs only | Update documentation |
| `test_coverage` | audit→issues→plans→fixes→qa | Improve test coverage |
| `migration` | All 6 stages | Code migrations |

---

## IV. Risk Tiers (R0-R4)

| Tier | Name | Description | Requires |
|------|------|-------------|----------|
| **R0** | Unrestricted | Local dev, read-only | Nothing |
| **R1** | Tool Allowlist | Production reads | Audit logging |
| **R2** | Approval Required | Code modifications | Human approval + SHA binding |
| **R3** | Secrets Detection | Credential access | Secret scanning + redaction |
| **R4** | Immutable Audit | Production ops | Tamper-evident logging |

---

## V. A2A Protocol

### Message Structure

```typescript
interface A2AMessage<TPayload> {
  id: string;                    // Unique message ID
  from: string;                  // Sender SPIFFE ID
  to: string;                    // Receiver SPIFFE ID
  type: MessageType;             // task_request | task_response | ...
  payload: TPayload;             // Type-specific payload
  timestamp: number;             // Unix timestamp (ms)
  correlationId?: string;        // Request/response linking
  priority: 'low' | 'normal' | 'high' | 'critical';
  traceId?: string;              // Distributed tracing
}
```

### Contract Types

| Contract | Created By | Consumed By | Purpose |
|----------|------------|-------------|---------|
| `IssueSpec` | Triage | Coder, Foreman | Issue definition |
| `FixPlan` | Coder | Coder, Reviewer | Implementation plan |
| `FixResult` | Coder | Reviewer, Foreman | Applied changes |
| `QAVerdict` | Reviewer | Foreman, Docs | Quality assessment |
| `DocUpdate` | Coder | Foreman | Documentation changes |

---

## VI. Deployment Architecture

### Infrastructure Stack

| Component | Technology | Management |
|-----------|------------|------------|
| **Compute** | Cloud Run | OpenTofu |
| **Agents** | Vertex AI Agent Engine | ADK CLI |
| **Storage** | Firestore, GCS | OpenTofu |
| **Queues** | Pub/Sub | OpenTofu |
| **Secrets** | Secret Manager | Manual |
| **Monitoring** | Cloud Monitoring | OpenTofu |

### Deployment Flow (Hard Mode R4)

```
GitHub Actions + WIF
        │
        ▼
┌───────────────────┐
│ 1. OpenTofu Plan  │─────▶ Review infrastructure changes
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 2. OpenTofu Apply │─────▶ Deploy supporting infra
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 3. ADK Deploy     │─────▶ Deploy agents to Agent Engine
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 4. Update tfvars  │─────▶ Capture Engine IDs
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 5. OpenTofu Apply │─────▶ Wire Cloud Run → Agent Engine
└───────────────────┘
```

---

## VII. MCP Server Integration

The MCP Server enables AI coding assistants (Copilot, Cursor, Windsurf) to use GWI:

### Tools Exposed

| Tool | Description |
|------|-------------|
| `gwi_triage` | PR complexity analysis |
| `gwi_resolve` | Semantic conflict resolution |
| `gwi_review` | AI code review |
| `gwi_issue_to_code` | Issue → PR generation |
| `gwi_pipeline` | Full SWE audit |
| `gwi_status` | Run status queries |
| `gwi_approve` | Approval gating |

### Configuration (VS Code / Cursor / Windsurf)

```json
{
  "mcpServers": {
    "gwi": {
      "url": "https://gwi-mcp-server-xxx.run.app/mcp",
      "transport": "http"
    }
  }
}
```

---

## VIII. Observability

### Telemetry

- **Traces**: W3C Trace Context, Cloud Trace export
- **Metrics**: Prometheus format, Cloud Monitoring export
- **Logs**: Structured JSON, Cloud Logging

### Key Metrics

| Metric | SLO | Alert Threshold |
|--------|-----|-----------------|
| API Availability | 99.9% | < 99.5% |
| API Latency P95 | < 500ms | > 800ms |
| Run Success Rate | 95% | < 90% |
| Agent Latency P95 | < 30s | > 45s |

### Dashboards

- SDLC Stage Timings
- Provider Usage (tokens, cost)
- Error Rates by Agent
- Approval Queue Depth

---

## IX. Security

### Authentication

- **External**: OAuth 2.0 / GitHub App
- **Service-to-Service**: IAM + Workload Identity
- **Agent-to-Agent**: SPIFFE ID verification

### Authorization

- RBAC with 5 approval scopes: `commit`, `push`, `open_pr`, `merge`, `deploy`
- Risk tier enforcement (R0-R4)
- Ed25519 signed approvals with SHA binding

### Secrets

- All API keys in Secret Manager
- No keys in code or environment
- Automatic redaction in logs/forensics

---

## X. File Structure

```
git-with-intent/
├── packages/
│   ├── agents/
│   │   └── src/
│   │       ├── base/agent.ts        # BaseAgent class
│   │       ├── orchestrator/        # Workflow routing
│   │       ├── foreman/             # SWE pipeline
│   │       ├── triage/              # Complexity scoring
│   │       ├── coder/               # Code generation
│   │       ├── resolver/            # Conflict resolution
│   │       └── reviewer/            # QA verification
│   └── core/
│       └── src/
│           └── a2a/
│               ├── index.ts         # A2A message types
│               └── contracts.ts     # Pipeline contracts
├── apps/
│   ├── gateway/                     # A2A Gateway (Cloud Run)
│   ├── github-webhook/              # GitHub events (Cloud Run)
│   ├── worker/                      # Async jobs (Cloud Run)
│   └── mcp-server/                  # AI assistant integration
├── infra/
│   ├── cloud_run.tf                 # Gateway services
│   ├── agent_engine.tf              # Agent Engine docs
│   └── iam.tf                       # Service accounts
└── 000-docs/
    ├── 200-DR-ARCH-*.md             # Architecture docs
    └── 6767-DR-STND-*.md            # Standards (portable)
```

---

## XI. Hard Mode Rules Compliance

| Rule | Description | GWI Status |
|------|-------------|------------|
| R1 | ADK-Only Implementation | ✅ Compliant (BaseAgent) |
| R2 | Agent Engine Runtime | ✅ Configured |
| R3 | Gateway Separation | ✅ Cloud Run proxies |
| R4 | CI-Only Deployments | ✅ GitHub Actions + WIF |
| R5 | Dual Memory Wiring | ⚠️ TODO (Session + Memory Bank) |
| R6 | Single Docs Folder | ✅ 000-docs/ |
| R7 | SPIFFE ID Propagation | ✅ All agents have IDs |
| R8 | Drift Detection | ✅ ARV gates |

---

## XII. Related Documentation

- `110-DR-TMOD-security-threat-model.md` - Security threats
- `111-DR-TARG-slo-sla-targets.md` - SLO definitions
- `112-DR-RUNB-disaster-recovery-runbook.md` - DR procedures
- `infra/README.md` - Infrastructure setup
- `packages/core/src/a2a/contracts.ts` - Contract definitions

---

**Last Updated:** 2026-02-02
**Version:** 1.0.0
