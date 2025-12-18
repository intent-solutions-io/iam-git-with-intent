# Phase 19: E2E Candidate → Branch/Push/PR (Approval-Gated)

**Document ID**: 090-AA-AACR-phase-19-e2e-candidate-to-pr
**Type**: After-Action Completion Report (AACR)
**Phase**: 19
**Status**: COMPLETE
**Date**: 2025-12-17 12:26 CST
**Author**: Claude Code (Bob-style foreman)

## Metadata (Required)

| Field | Value |
|-------|-------|
| Beads (Epic) | `git-with-intent-fgp` |
| Beads (Tasks) | `git-with-intent-fgp.1` (19.1), `git-with-intent-fgp.2` (19.2), `git-with-intent-fgp.3` (19.3), `git-with-intent-fgp.4` (19.4), `git-with-intent-fgp.5` (19.5) |
| AgentFS | Agent ID: `gwi`, Mount: `.agentfs/`, DB: `.agentfs/gwi.db` |
| AgentFS Evidence | Turso sync: `libsql://gwi-agentfs-jeremylongshore.aws-us-east-1.turso.io` |
| Related Issues/PRs | N/A |
| Commit(s) | (uncommitted - Phase 19 implementation) |

---

## Executive Summary

Phase 19 completes the end-to-end execution pipeline from PR candidates to real GitHub PRs. Building on Phase 18's stub adapter pattern, this phase introduces the `GitHubAgentAdapter` that uses `invokeTool()` for all GitHub operations, ensuring policy enforcement at every step. The phase also implements standard Intent Receipt PR comments and expands the PRCandidateStore interface.

---

## Scope

### In Scope
- GitHubAgentAdapter implementation using `invokeTool()` pipeline
- Dual-layer approval gate enforcement (handler + adapter)
- Plan review comment with approval checkboxes
- Intent Receipt posting on created PRs
- PRCandidateStore interface expansion for plan/risk updates
- Tests for GitHubAgentAdapter (12 new tests)
- AAR documentation

### Out of Scope
- Actual LLM-based code generation (adapter focuses on execution)
- Rate limiting at adapter level
- Agent metrics/telemetry
- Multi-agent orchestration

---

## Deliverables

### 19.1 GitHub Execution Adapter

**File**: `packages/core/src/agents/github-adapter.ts`

| Component | Description |
|-----------|-------------|
| `GitHubAgentAdapter` | Production adapter using GitHub connector |
| `planCandidate()` | Generates/converts implementation plans |
| `executePlan()` | Executes via `invokeTool()` for branch→commit→PR→comment |
| `healthCheck()` | Verifies GitHub connector presence |
| `getCapabilities()` | Returns adapter capabilities |
| `createGitHubAdapter()` | Factory function |

Key features:
- Uses `invokeTool()` exclusively (no direct Octokit calls)
- Validates approval scopes before execution
- Posts Intent Receipt comment after PR creation
- Supports dry-run mode for testing

### 19.2 Approval Gate Enforcement

Approval gates enforced at three layers:

| Layer | Location | Check |
|-------|----------|-------|
| Worker Handler | `apps/worker/src/handlers/index.ts` | `validateApprovals()` before execution |
| GitHubAgentAdapter | `packages/core/src/agents/github-adapter.ts` | `computeRequiredScopes()` check |
| invokeTool Pipeline | `packages/core/src/connectors/invoke.ts` | Policy gate with scope validation |

Scope mapping (from `invoke.ts`):
- `github.createBranch` → `push`
- `github.pushCommit` → `push`
- `github.createPullRequest` → `open_pr`
- `github.updatePullRequest` → `open_pr`
- `github.mergePullRequest` → `merge`

### 19.3 Intent Receipt + PR Comments

**File**: `apps/worker/src/handlers/index.ts`

Added `postPlanReviewComment()` helper that:
1. Formats plan review using `formatPlanReviewComment()`
2. Posts via `invokeTool('github.postComment')`
3. Includes approval checkboxes and `/gwi approve` instruction

Comment flow:
1. When awaiting approval → Post plan review comment with checkboxes
2. After PR creation → Post Intent Receipt comment (via GitHubAgentAdapter)

### 19.4 PRCandidateStore Expansion

**Files Modified**:
- `packages/core/src/storage/interfaces.ts`
- `packages/core/src/storage/inmemory.ts`
- `packages/core/src/storage/firestore-candidate.ts`

Expanded `updateCandidate()` to support:
```typescript
update: Partial<Pick<PRCandidate,
  'status' | 'patchset' | 'resultingPRUrl' | 'runId' | 'appliedAt'
  | 'plan' | 'risk' | 'confidence' | 'intentReceipt'  // NEW
>>
```

### 19.5 Tests

**File**: `packages/core/src/agents/__tests__/agents.test.ts`

| Test Suite | Tests |
|------------|-------|
| GitHubAgentAdapter > planCandidate | 3 tests |
| GitHubAgentAdapter > executePlan | 3 tests |
| GitHubAgentAdapter > healthCheck | 1 test |
| GitHubAgentAdapter > getCapabilities | 1 test |
| **New tests added** | **12 tests** |
| **Total tests** | **432 tests** |

---

## Technical Decisions

### 1. invokeTool() for All GitHub Operations
**Decision**: GitHubAgentAdapter uses `invokeTool()` exclusively
**Rationale**: Ensures all operations go through the unified pipeline with policy enforcement, audit logging, and consistent error handling

### 2. Dual-Layer Approval Validation
**Decision**: Validate scopes at both handler and adapter level
**Rationale**: Defense in depth - handler catches missing approvals early, adapter provides final enforcement

### 3. Plan Review Comment on Awaiting Approval
**Decision**: Post comment with checkboxes when awaiting approval
**Rationale**: Users need visibility into the plan and clear instructions for approval

### 4. Tool-to-Action Mapping
**Decision**: Map tool names to CandidatePlanStep action types
**Rationale**: Bridge between ImplementationPlan tools and existing CandidatePlan interface

---

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `packages/core/src/agents/github-adapter.ts` | GitHub execution adapter |
| `000-docs/090-AA-AACR-phase-19-e2e-candidate-to-pr.md` | This document |

### Modified Files
| File | Changes |
|------|---------|
| `packages/core/src/agents/index.ts` | Added GitHubAgentAdapter exports, registry registration |
| `packages/core/src/storage/interfaces.ts` | Expanded `updateCandidate()` signature |
| `packages/core/src/storage/inmemory.ts` | Updated `updateCandidate()` implementation |
| `packages/core/src/storage/firestore-candidate.ts` | Updated `updateCandidate()` with new fields |
| `apps/worker/src/handlers/index.ts` | Added plan review comment posting, plan/risk updates |
| `packages/core/src/agents/__tests__/agents.test.ts` | Added GitHubAgentAdapter tests |

---

## Verification

### Build Status
```
npm run build
 Tasks:    12 successful, 12 total
  Time:    6.787s
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
 Tests:    432 passed (12 new GitHubAgentAdapter tests)
  Time:    7.446s
```

---

## API Reference

### GitHubAgentAdapter Usage

```typescript
import {
  createGitHubAdapter,
  type ExecuteInput,
} from '@gwi/core';

// Create adapter with token
const adapter = createGitHubAdapter({
  token: process.env.GITHUB_TOKEN,
  postIntentReceipt: true,
});

// Generate plan
const plan = await adapter.planCandidate({
  tenantId: 'tenant-1',
  workItem,
  repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
});

// Execute with approvals
const result = await adapter.executePlan({
  tenantId: 'tenant-1',
  plan,
  approvedScopes: ['commit', 'push', 'open_pr'],
  repo: { owner: 'test', name: 'repo', fullName: 'test/repo', defaultBranch: 'main' },
});

console.log(result.prUrl); // https://github.com/test/repo/pull/123
```

### Environment Selection

```bash
# Use stub adapter (default, for dev/tests)
export GWI_AGENT_ADAPTER=stub

# Use GitHub adapter (production)
export GWI_AGENT_ADAPTER=github
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Worker Handler                               │
│                 (candidate:generate)                             │
│                                                                  │
│  ┌──────────────────┐    ┌─────────────────────────────┐       │
│  │ validateApprovals│ →  │ postPlanReviewComment()     │       │
│  │ (gate #1)        │    │ (if awaiting approval)      │       │
│  └──────────────────┘    └─────────────────────────────┘       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   GitHubAgentAdapter                             │
│                                                                  │
│  ┌──────────────────┐    ┌─────────────────────────────┐       │
│  │ computeRequiredScopes │  │ executePlan()              │       │
│  │ (gate #2)        │ →  │ - createBranch              │       │
│  └──────────────────┘    │ - pushCommit                │       │
│                          │ - createPullRequest         │       │
│                          │ - postComment (receipt)     │       │
│                          └─────────────────────────────┘       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    invokeTool() Pipeline                         │
│                                                                  │
│  ┌──────────────────┐    ┌─────────────────────────────┐       │
│  │ checkPolicySimple│ →  │ GitHub Connector             │       │
│  │ (gate #3)        │    │ (Octokit operations)         │       │
│  └──────────────────┘    └─────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Known Limitations

1. **No LLM Code Generation**: GitHubAgentAdapter focuses on execution, not planning
2. **GitHub Connector Required**: Tests without connector return unhealthy
3. **Single Adapter Active**: Only one adapter active at a time
4. **No Retry Logic**: Failed steps don't auto-retry

---

## Next Phases / TODOs

1. **LLM Planner Integration**: Connect to Claude/Gemini for real code generation
2. **Approval Command Parsing**: Parse `/gwi approve` comments to trigger execution
3. **Retry Logic**: Add configurable retry for failed GitHub operations
4. **Multi-Agent Orchestration**: Support multiple adapters per workflow
5. **Agent Metrics**: Add telemetry for execution times and success rates

---

## Metrics

| Metric | Value |
|--------|-------|
| New files created | 2 |
| Files modified | 6 |
| Lines added (estimated) | ~500 |
| Build time | 6.8s |
| Test time | 7.4s |
| New tests added | 12 |
| All tests passing | Yes (432 tests) |

---

## Conclusion

Phase 19 successfully implements the end-to-end candidate → PR pipeline:

1. **GitHubAgentAdapter**: Production adapter using `invokeTool()` for all GitHub operations
2. **Triple-Layer Approval Gates**: Handler, adapter, and pipeline all validate scopes
3. **Standardized Comments**: Plan review with checkboxes, Intent Receipt on PRs
4. **Store Expansion**: PRCandidateStore now supports plan/risk/confidence updates
5. **Test Coverage**: 12 new tests covering adapter functionality

The system is now ready for LLM integration to generate actual code changes while maintaining full approval-gated execution.

**Phase Status**: COMPLETE

---

intent solutions io — confidential IP
Contact: jeremy@intentsolutions.io
