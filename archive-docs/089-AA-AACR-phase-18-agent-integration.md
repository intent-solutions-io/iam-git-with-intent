# Phase 18: Agent Integration (Candidate → Real Implementation)

**Document ID**: 089-AA-AACR-phase-18-agent-integration
**Type**: After-Action Completion Report (AACR)
**Phase**: 18
**Status**: COMPLETE
**Date**: 2025-12-17 11:58 CST
**Author**: Claude Code (Bob-style foreman)

## Metadata (Required)

| Field | Value |
|-------|-------|
| Beads (Epic) | `git-with-intent-pxa` |
| Beads (Tasks) | `git-with-intent-pxa.1` (18.1), `git-with-intent-pxa.2` (18.2), `git-with-intent-pxa.3` (18.3), `git-with-intent-pxa.4` (18.4), `git-with-intent-pxa.5` (18.5) |
| AgentFS | Agent ID: `gwi`, Mount: `.agentfs/`, DB: `.agentfs/gwi.db` |
| AgentFS Evidence | Turso sync: `libsql://gwi-agentfs-jeremylongshore.aws-us-east-1.turso.io` |

---

## Executive Summary

Phase 18 completes the agent integration layer, connecting PR candidates from Phase 14 to real implementation through the worker handlers from Phase 17. This phase introduces a pluggable agent adapter pattern, approval-gated execution, and standardized Intent Receipt formatting for PR comments.

---

## Scope

### In Scope
- Agent adapter interface and contract (AgentAdapter)
- StubAgentAdapter for deterministic dev/test output
- Agent adapter registry with environment-based selection
- Candidate→Agent job handler wiring in worker
- Approval and policy gating using STEP_CLASS_SCOPES
- Intent Receipt PR comment formatting utilities
- Comprehensive test suite for agent module

### Out of Scope
- Production agent implementations (VertexAgentAdapter, ExternalAgentAdapter)
- Actual GitHub PR creation (stub produces mock PRs)
- Real LLM calls for code generation
- Rate limiting at agent level
- Agent metrics/telemetry

---

## Deliverables

### 18.1 Agent Adapter + Contract

**Files**:
- `packages/core/src/agents/types.ts` - Type definitions
- `packages/core/src/agents/stub-adapter.ts` - StubAgentAdapter
- `packages/core/src/agents/index.ts` - Module exports and registry

| Component | Description |
|-----------|-------------|
| `AgentStepClass` | Enum: `read_only`, `informational`, `additive`, `destructive` |
| `STEP_CLASS_SCOPES` | Maps step classes to approval scopes |
| `ImplementationPlan` | Zod schema for agent-generated plans |
| `ExecutionResult` | Zod schema for execution outcomes |
| `AgentAdapter` | Interface: `planCandidate()`, `executePlan()`, `healthCheck()`, `getCapabilities()` |
| `StubAgentAdapter` | Deterministic adapter for dev/tests |
| `AgentAdapterRegistry` | Singleton registry with environment-based selection |

### 18.2 Candidate→Agent Job Handler Wiring

**File**: `apps/worker/src/handlers/index.ts`

Enhanced `handleCandidateGenerate` handler:

| Feature | Description |
|---------|-------------|
| Work item loading | Fetches work item by ID |
| Candidate loading | Optionally loads existing candidate |
| Agent planning | Calls `planCandidate()` to generate implementation plan |
| Approval validation | Checks required scopes vs approved scopes |
| Plan execution | Calls `executePlan()` with approved scopes |
| Status updates | Updates candidate and work item status |
| Error handling | Updates candidate to 'failed' on errors |

### 18.3 Approval + Policy Gating Integration

**Files**:
- `apps/worker/src/handlers/index.ts` - Helper functions

| Function | Description |
|----------|-------------|
| `calculateRequiredScopes()` | Derives scopes from plan step policy classes |
| `validateApprovals()` | Checks if all required scopes are approved |

Approval Flow:
1. Plan generated with steps containing `policyClass` annotations
2. Required scopes calculated from `STEP_CLASS_SCOPES` mapping
3. If missing scopes → return `awaiting_approval` status
4. If all scopes approved → proceed to execution

### 18.4 Intent Receipt + PR Comment Standard

**File**: `packages/core/src/agents/intent-receipt.ts`

| Function | Description |
|----------|-------------|
| `formatIntentReceiptAsComment()` | Full markdown PR comment with 5W details |
| `formatMinimalIntentReceipt()` | Concise version for quick operations |
| `formatPlanReviewComment()` | Plan review with approval checkboxes |
| `formatSuccessComment()` | Success message with PR URL |
| `formatFailureComment()` | Error message with details |

Output formats:
- `markdown`: GitHub-compatible markdown
- `plainText`: Plain text for logs
- `json`: Structured data for APIs

### 18.5 Tests + ARV Updates

**File**: `packages/core/src/agents/__tests__/agents.test.ts`

| Test Suite | Tests |
|------------|-------|
| Agent Registry | 4 tests |
| StubAgentAdapter | 7 tests |
| Policy Class Mapping | 4 tests |
| Intent Receipt Formatting | 6 tests |
| Convenience Functions | 3 tests |
| **Total** | **24 tests** |

---

## Technical Decisions

### 1. AgentStepClass vs ToolPolicyClass
**Decision**: Created new `AgentStepClass` enum instead of reusing `ToolPolicyClass` from connectors
**Rationale**: Different semantics - connectors use `READ`, `WRITE_NON_DESTRUCTIVE`, `DESTRUCTIVE`; agents need `read_only`, `informational`, `additive`, `destructive` for finer granularity

### 2. Stub Adapter as Default
**Decision**: StubAgentAdapter registered automatically in registry
**Rationale**: Enables local development without external dependencies; same code paths for dev/prod

### 3. Approval Scopes from Steps
**Decision**: Calculate required scopes dynamically from plan steps
**Rationale**: Plans can vary in complexity; some may only need `commit`, others need full `commit`+`push`+`open_pr`

### 4. Intent Receipt Separation
**Decision**: Created separate `intent-receipt.ts` module for formatting
**Rationale**: Clear separation of concerns; easier to customize output formats

---

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `packages/core/src/agents/types.ts` | Agent type definitions and contracts |
| `packages/core/src/agents/stub-adapter.ts` | Stub adapter implementation |
| `packages/core/src/agents/index.ts` | Module exports and registry |
| `packages/core/src/agents/intent-receipt.ts` | Intent Receipt formatting |
| `packages/core/src/agents/__tests__/agents.test.ts` | Test suite |
| `000-docs/089-AA-AACR-phase-18-agent-integration.md` | This document |

### Modified Files
| File | Changes |
|------|---------|
| `packages/core/src/index.ts` | Added agents module export |
| `apps/worker/src/handlers/index.ts` | Enhanced candidate handler with agent integration |

---

## Verification

### Build Status
```
npm run build
 Tasks:    12 successful, 12 total
  Time:    3.225s
```

### Type Check
```
npm run typecheck
 Tasks:    16 successful, 16 total
  Time:    ~4s
```

### Tests
```
npm run test
 Tasks:    23 successful, 23 total
 Tests:    424+ passed (24 new agent tests)
  Time:    6.763s
```

---

## API Reference

### Agent Usage

```typescript
import {
  getAgentAdapter,
  planCandidate,
  executePlan,
  healthCheckAgent,
  type PlanInput,
  type ExecuteInput,
} from '@gwi/core';

// Plan a candidate
const plan = await planCandidate({
  tenantId: 'tenant-1',
  workItem,
  repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
});

// Execute with approvals
const result = await executePlan({
  tenantId: 'tenant-1',
  plan,
  approvedScopes: ['commit', 'push', 'open_pr'],
  repo: { owner: 'test', name: 'repo', fullName: 'test/repo', defaultBranch: 'main' },
});

// Format result as PR comment
import { formatIntentReceiptAsComment } from '@gwi/core';
const comment = formatIntentReceiptAsComment(result.intentReceipt);
console.log(comment.markdown);
```

### Custom Adapter Registration

```typescript
import { registerAgentAdapter } from '@gwi/core';

registerAgentAdapter({
  name: 'vertex',
  version: '1.0.0',
  async planCandidate(input) { /* ... */ },
  async executePlan(input) { /* ... */ },
  async healthCheck() { return { healthy: true }; },
  getCapabilities() { return { /* ... */ }; },
});

// Set as default via environment
process.env.GWI_AGENT_ADAPTER = 'vertex';
```

---

## Known Limitations

1. **Stub Adapter Only**: No real code generation - produces deterministic mock output
2. **No GitHub Integration**: Stub doesn't create actual PRs
3. **Plan/Risk Updates**: PRCandidateStore interface doesn't support updating plan/risk (logged only)
4. **Single Adapter**: Only one adapter active at a time (no multi-agent orchestration)

---

## Next Phases / TODOs

1. **VertexAgentAdapter**: Production adapter using Vertex AI
2. **ExternalAgentAdapter**: Adapter for external agent APIs (bobs-brain pattern)
3. **GitHub PR Creation**: Real PR creation in execution flow
4. **PRCandidateStore Expansion**: Add plan/risk update support to interface
5. **Agent Metrics**: Add telemetry for planning/execution times
6. **Rate Limiting**: Per-tenant rate limits on agent operations

---

## Metrics

| Metric | Value |
|--------|-------|
| New files created | 6 |
| Files modified | 2 |
| Lines added (estimated) | ~1200 |
| Build time | 3.2s |
| Test time | 6.8s |
| New tests added | 24 |
| All tests passing | Yes (424+ tests) |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Worker Handler                            │
│                    (candidate:generate)                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Adapter Registry                        │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐    │
│  │ StubAdapter │  │ VertexAdapter│  │ ExternalAdapter     │    │
│  │ (default)   │  │ (future)     │  │ (future)            │    │
│  └─────────────┘  └──────────────┘  └─────────────────────┘    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                   ┌────────┴────────┐
                   ▼                 ▼
          ┌───────────────┐  ┌──────────────────┐
          │ planCandidate │  │   executePlan    │
          │               │  │                  │
          │ Returns:      │  │ Returns:         │
          │ - Steps       │  │ - Branch name    │
          │ - Risk        │  │ - Commits        │
          │ - Scopes      │  │ - PR URL         │
          │ - Confidence  │  │ - Intent Receipt │
          └───────────────┘  └──────────────────┘
                                      │
                                      ▼
                         ┌────────────────────────┐
                         │ formatIntentReceipt    │
                         │ AsComment()            │
                         │                        │
                         │ Output: markdown/json  │
                         └────────────────────────┘
```

---

## Conclusion

Phase 18 successfully bridges the gap between PR candidates and actual implementation through a pluggable agent adapter pattern:

1. **Pluggable Architecture**: AgentAdapter interface allows swapping implementations
2. **Policy-Based Gating**: Approval scopes derived from step policy classes
3. **Standardized Output**: Intent Receipt formatting for consistent PR comments
4. **Test Coverage**: 24 new tests covering all agent functionality

The system is now ready for production agent implementations (Vertex AI, external APIs) while maintaining full backward compatibility with the stub adapter for development.

**Phase Status**: COMPLETE

---

*Generated by: Claude Code (Bob-style foreman)*
*Template version: 2.0 (Beads + AgentFS metadata required)*
*This document follows 000-docs filing convention (flat, no nesting)*
