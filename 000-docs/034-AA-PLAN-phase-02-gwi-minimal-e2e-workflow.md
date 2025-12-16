# Phase 2 Plan: Minimal E2E Workflow

**Document ID:** 034-AA-PLAN
**Date:** 2025-12-16
**Author:** Claude Code (gwi-foreman)
**Status:** PLAN

---

## Executive Summary

This document describes the plan to get ONE clean, reliable end-to-end workflow working in Git With Intent. Based on discovery analysis, we will implement the `issue-to-code` workflow as the canonical minimal path.

---

## Workflow Choice: `issue-to-code`

**Why `issue-to-code` over `pr-resolve`:**

1. **Simpler Input Requirements**: Only needs issue metadata, not actual PR diff/conflicts
2. **Self-Contained**: Doesn't require GitHub API calls to fetch PR conflicts
3. **Testable Without External Dependencies**: Can run with mock issue data
4. **Closer to Working**: Coder agent already expects `IssueMetadata`

---

## Current Architecture (Discovery Findings)

### What Works

1. **API Endpoint**: `POST /tenants/:tenantId/workflows` exists and calls orchestrator
2. **Orchestrator**: Routes to agents via `OrchestratorAgent.startWorkflow()`
3. **Agent Implementations**: Triage, Coder, Reviewer all have LLM integration
4. **Model Clients**: Anthropic and Google clients working
5. **Build**: All 10 packages compile successfully

### What's Broken

1. **Input Mismatch**: Triage agent expects `PRMetadata` with conflicts, but `issue-to-code` needs `IssueMetadata`
2. **Data Flow**: Orchestrator passes raw `lastResult` between agents without transformation
3. **Reviewer Mismatch**: Expects `ResolutionResult` (for conflicts), not `CodeGenerationResult`

---

## Intended Flow (Canonical)

```
                                  issue-to-code workflow

HTTP Request                      Agent Chain                       Result
─────────────────────────────────────────────────────────────────────────────
POST /tenants/:tenantId/workflows
  {
    "workflowType": "issue-to-code",
    "input": {
      "issue": { ... },           ┌──────────────┐
      "targetBranch": "main"      │              │
    }                             │   TRIAGE     │──> complexity: 5
  }                               │  (Gemini)    │    routeDecision: agent-resolve
                                  │              │
                                  └──────┬───────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │              │
                                  │    CODER     │──> files: [...]
                                  │  (Claude)    │    summary: "..."
                                  │              │    confidence: 85
                                  └──────┬───────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │              │
                                  │   REVIEWER   │──> approved: true
                                  │  (Claude)    │    confidence: 90
                                  │              │
                                  └──────┬───────┘
                                         │
                                         ▼
Response 202:                     Return to API
  {
    "workflowId": "wf-xxx",
    "status": "completed",
    "result": { ... }
  }
```

---

## Code Changes Required

### 1. Modify TriageAgent for Issue Support

**File**: `packages/agents/src/triage/index.ts`

**Change**: Add `triageIssue()` method alongside existing `triage()` for PR

```typescript
// New method for issue triage
async triageIssue(issue: IssueMetadata): Promise<TriageOutput> {
  // Analyze issue complexity, not PR conflicts
  // Return routeDecision based on issue scope
}
```

### 2. Add Input Adapters in Orchestrator

**File**: `packages/agents/src/orchestrator/index.ts`

**Change**: Transform data between agents based on workflow type

```typescript
private adaptInputForAgent(
  agentName: string,
  previousResult: unknown,
  workflowType: WorkflowType,
  originalInput: unknown
): unknown {
  // For issue-to-code:
  // - Triage gets: { issue, workflowType }
  // - Coder gets: { issue, complexity, repoContext }
  // - Reviewer gets: { code, issue } (not conflict resolution)
}
```

### 3. Add Code Review Mode to ReviewerAgent

**File**: `packages/agents/src/reviewer/index.ts`

**Change**: Support reviewing generated code, not just conflict resolutions

```typescript
// New method for code review
async reviewCode(
  code: CodeGenerationResult,
  context: { issue: IssueMetadata }
): Promise<ReviewerOutput> {
  // Check: syntax, security, completeness vs issue requirements
}
```

### 4. Add Tests

**New Files**:
- `packages/agents/src/orchestrator/__tests__/orchestrator.test.ts`
- `packages/agents/src/triage/__tests__/triage.test.ts`
- `apps/api/src/__tests__/workflow.e2e.test.ts`

### 5. Update Package Scripts

**File**: `package.json` (root)

Ensure `npm run dev`, `npm test` work correctly.

---

## Files to Touch

| File | Action | Purpose |
|------|--------|---------|
| `packages/agents/src/triage/index.ts` | Modify | Add issue triage method |
| `packages/agents/src/orchestrator/index.ts` | Modify | Add input adapters |
| `packages/agents/src/reviewer/index.ts` | Modify | Add code review mode |
| `packages/core/src/workflows/index.ts` | Verify | Ensure IssueMetadata export |
| `packages/agents/src/orchestrator/__tests__/orchestrator.test.ts` | Create | Unit tests |
| `packages/agents/src/triage/__tests__/triage.test.ts` | Create | Unit tests |
| `apps/api/src/__tests__/workflow.e2e.test.ts` | Create | Integration test |
| `000-docs/035-AA-REPT-phase-02-*.md` | Create | AAR |

---

## Verification Commands

After implementation, these should all pass:

```bash
# Build
npm run build

# Tests
npm test

# Start dev server
npm run dev

# Manual test (with API running)
curl -X POST http://localhost:8080/tenants/dev-tenant/workflows \
  -H 'Content-Type: application/json' \
  -H 'X-Debug-User: dev-user' \
  -d '{
    "workflowType": "issue-to-code",
    "input": {
      "issue": {
        "url": "https://github.com/example/repo/issues/1",
        "number": 1,
        "title": "Add healthcheck endpoint",
        "body": "Create GET /healthz that returns status: ok",
        "author": "dev",
        "labels": ["enhancement"],
        "assignees": [],
        "repo": {
          "owner": "example",
          "name": "repo",
          "fullName": "example/repo"
        },
        "createdAt": "2025-12-16T00:00:00Z",
        "updatedAt": "2025-12-16T00:00:00Z"
      },
      "targetBranch": "main"
    }
  }'
```

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| LLM calls fail (no API key) | Mock mode for tests, skip LLM in CI |
| AgentFS not available | Mock already implemented, graceful fallback |
| Type mismatches | Add explicit type guards and validation |
| Test flakiness | Use deterministic mock responses |

---

## Out of Scope (Phase 2)

- PR resolve workflow (Phase 3)
- GitHub API integration for fetching real issues
- Firestore persistence for workflows
- UI for workflow status
- Production deployment

---

## Success Criteria

1. `npm run build` passes
2. `npm test` passes with 5+ tests
3. `curl` command returns 202 with workflow result
4. Workflow executes: Triage -> Coder -> Reviewer
5. AAR documents changes and known gaps
