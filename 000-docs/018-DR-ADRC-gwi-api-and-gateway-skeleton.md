# 018-DR-ADRC: gwi-api and A2A Gateway Skeleton

**Document ID:** 018-DR-ADRC
**Document Type:** Architecture Decision Record (ADR)
**Created:** 2025-12-15
**Last Updated:** 2025-12-15
**Status:** ACCEPTED
**Author:** Jeremy Longshore, Claude Code (Opus 4.5)
**Applies To:** git-with-intent repository

---

> **Filing Standard:** This document follows docs-filing v4 (6767-a-DR-STND-document-filing-system-standard-v4.md)
> - `018` = chronological sequence number
> - `DR` = Documentation & Reference category
> - `ADRC` = Architecture Decision type

---

## Context

Git With Intent needs two primary server-side entrypoints:

1. **gwi-api**: A multi-tenant SaaS API for the web dashboard and external integrations
2. **gwi-gateway**: An A2A (Agent-to-Agent) gateway for routing to Vertex AI Agent Engine

Phase 2 designed the multi-tenant model and API surface. Phase 5 implements the skeleton services that will eventually handle production traffic.

### Requirements

- Cloud Run–ready (containerized, stateless, env-configurable)
- Multi-tenant isolation via tenant IDs
- Integration with the shared engine (from `packages/engine`)
- Hook system integration (AgentFS/Beads remain internal-only)
- Graceful degradation (local engine when Agent Engine not configured)

---

## Decision

**Create two distinct services in `apps/` that share the common engine:**

```
apps/
├── api/          # gwi-api - SaaS API for dashboard/external use
└── gateway/      # gwi-gateway - A2A gateway for agent routing
```

Both services:
1. Are standalone Express applications
2. Call `createEngine()` from `@gwi/engine`
3. Support the same `RunRequest` contract
4. Use in-memory stores (temporary) until Firestore is wired

---

## Architecture

```
                              ┌─────────────────────────┐
                              │    Firebase Auth        │
                              │    (Future Phase)       │
                              └───────────┬─────────────┘
                                          │
           ┌──────────────────────────────┼──────────────────────────────┐
           │                              │                              │
           ▼                              ▼                              ▼
┌─────────────────────┐      ┌─────────────────────┐      ┌─────────────────────┐
│     Web Dashboard   │      │   GitHub Webhooks   │      │    CLI / API        │
│     (Future)        │      │   (apps/webhook)    │      │    Integrations     │
└─────────┬───────────┘      └─────────┬───────────┘      └─────────┬───────────┘
          │                            │                            │
          └────────────┬───────────────┴────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              apps/api (gwi-api)                              │
│                                                                              │
│  GET  /health                          - Health check                        │
│  GET  /me                              - Current user info                   │
│  GET  /tenants                         - List user's tenants                 │
│  GET  /tenants/:tenantId               - Get tenant details                  │
│  GET  /tenants/:tenantId/repos         - List connected repos                │
│  POST /tenants/:tenantId/repos:connect - Connect a repo                      │
│  GET  /tenants/:tenantId/runs          - List runs                           │
│  POST /tenants/:tenantId/runs          - Start a new run ─────────┐         │
│  GET  /tenants/:tenantId/runs/:runId   - Get run status           │         │
│  POST /tenants/:tenantId/settings      - Update settings          │         │
└───────────────────────────────────────────────────────────────────┼─────────┘
                                                                    │
                       ┌────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                            packages/engine                                    │
│                                                                              │
│  createEngine() → Engine                                                     │
│    - startRun(RunRequest) → RunResult                                        │
│    - getRun(tenantId, runId) → RunResult                                     │
│    - cancelRun(tenantId, runId) → boolean                                    │
│    - listRuns(tenantId, limit) → RunResult[]                                 │
│                                                                              │
│  Integrates with:                                                            │
│    - Hook system (AgentFS/Beads when enabled)                                │
│    - In-memory stores (temporary)                                            │
│    - Future: Firestore TenantStore, RunStore                                 │
└───────────────────────────────────────────────────────────────────┬──────────┘
                                                                    │
                       ┌────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          apps/gateway (gwi-gateway)                          │
│                                                                              │
│  GET  /health                 - Health check                                 │
│  GET  /.well-known/agent.json - AgentCard discovery                          │
│  POST /a2a/foreman            - Main foreman endpoint ◀── Uses Engine        │
│  POST /a2a/:agent             - Route to specific agent (Vertex AI)          │
│  POST /api/workflows          - Start workflow via orchestrator              │
│                                                                              │
│  Mode Selection:                                                             │
│    - No ORCHESTRATOR_ENGINE_ID → Local engine (development)                  │
│    - With ENGINE_IDs → Proxy to Vertex AI Agent Engine (production)          │
└───────────────────────────────────────────────────────────────────┬──────────┘
                                                                    │
                                                                    ▼
                                                     ┌─────────────────────────┐
                                                     │  Vertex AI Agent Engine │
                                                     │  (Future Phase)         │
                                                     │                         │
                                                     │  - Foreman (Orchestrator)│
                                                     │  - Triage Agent         │
                                                     │  - Planner Agent        │
                                                     │  - Coder Agent          │
                                                     │  - Reviewer Agent       │
                                                     └─────────────────────────┘
```

---

## Implementation Details

### gwi-api Endpoints

| Endpoint | Status | Description |
|----------|--------|-------------|
| `GET /health` | Implemented | Health check |
| `GET /me` | Stub | Returns user ID from debug header |
| `GET /tenants` | 501 | Awaiting Firestore |
| `GET /tenants/:tenantId` | 501 | Awaiting Firestore |
| `GET /tenants/:tenantId/repos` | 501 | Awaiting Firestore |
| `POST /tenants/:tenantId/repos:connect` | 501 | Awaiting Firestore |
| `GET /tenants/:tenantId/runs` | Implemented | Uses local engine |
| `POST /tenants/:tenantId/runs` | Implemented | Starts run via engine |
| `GET /tenants/:tenantId/runs/:runId` | Implemented | Gets run status |
| `POST /tenants/:tenantId/settings` | 501 | Awaiting Firestore |

### gwi-gateway Endpoints

| Endpoint | Status | Description |
|----------|--------|-------------|
| `GET /health` | Implemented | Health check |
| `GET /.well-known/agent.json` | Implemented | AgentCard discovery |
| `POST /a2a/foreman` | Implemented | Routes to local engine or Agent Engine |
| `POST /a2a/:agent` | Implemented | Proxy to Vertex AI Agent Engine |
| `POST /api/workflows` | Implemented | Start workflow via orchestrator |

### Authentication (Stubbed)

For Phase 5, authentication uses a debug header:

```http
X-Debug-User: user-123
```

In a later phase, this will be replaced with Firebase Auth token verification.

### Engine Integration

Both services create an engine instance via:

```typescript
import { createEngine } from '@gwi/engine';

const engine = await createEngine({ debug: true });
const result = await engine.startRun({
  tenantId: 'tenant-123',
  repoUrl: 'https://github.com/owner/repo',
  runType: 'RESOLVE',
  prNumber: 42,
  trigger: 'api',
});
```

---

## Consequences

### Positive

- **Clear separation**: API for SaaS, gateway for A2A routing
- **Shared engine**: Both services use the same execution contract
- **Cloud Run ready**: Stateless, env-configurable, containerizable
- **Graceful development**: Local engine works without Vertex AI
- **Hook integration**: Engine calls hooks when configured

### Negative

- **In-memory storage**: Data lost on restart (temporary)
- **No real auth**: Development-only debug header
- **Stubs**: Many endpoints return 501 until Firestore is wired

### What's NOT Implemented (Future Phases)

| Feature | Target Phase |
|---------|--------------|
| Firebase Auth | Phase 6 |
| Firestore-backed stores | Phase 6 |
| GitHub webhook processing | Phase 6 |
| Vertex AI Agent Engine calls | Phase 7 |
| Real agent orchestration | Phase 7 |

---

## References

- **010-DR-ADRC**: GWI Multi-Tenant Model
- **011-DR-ADRC**: GWI API Surface v0.1
- **012-AT-ARCH**: Run Types and Agent Pipeline
- **014-DR-ADRC**: Agent Hook System Policy

---

**Decision:** ACCEPTED
**Date:** 2025-12-15

---

*intent solutions io — confidential IP*
*Contact: jeremy@intentsolutions.io*
