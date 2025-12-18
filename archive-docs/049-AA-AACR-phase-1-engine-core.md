# Phase 1 AAR: Engine Core Substrate

> **Timestamp**: 2025-12-16 19:45 CST
> **Branch**: phase-8-github-app-and-webhook
> **Author**: Claude Code
> **Duration**: ~45 minutes

---

## Summary

Phase 1 focused on establishing the engine core substrate for GWI's agent execution pipeline. The primary outcome was **removing AgentFS from all runtime code paths** while preserving the existing run bundle infrastructure.

---

## What Was Done

### 1. Verified Existing Run Bundle Infrastructure

Found that the run bundle system already exists and is complete:

- `packages/core/src/run-bundle/types.ts` - RunState enum, STATE_TRANSITIONS
- `packages/core/src/run-bundle/state-machine.ts` - validateTransition, isValidTransition
- `packages/core/src/run-bundle/audit-log.ts` - JSONL append-only audit
- `packages/core/src/run-bundle/artifact-writer.ts` - writeArtifact, readArtifact
- `packages/core/src/run-bundle/run-context.ts` - createRun, transitionState
- `packages/core/src/run-bundle/schemas/` - Triage, Plan, Resolve, Review schemas

### 2. Added PublishResult Schema

Created `packages/core/src/run-bundle/schemas/publish.ts`:
- PublishAction enum: commit, push, create_pr, update_pr, comment
- PublishStatus enum: success, partial, failed, skipped, pending
- CommitDetails, PushDetails, PrDetails, CommentDetails schemas
- Approval binding fields (approvalId, approvedBy, approvedAt)
- Error handling fields (error, errorDetails)
- Comprehensive validation helpers

Added 13 new tests in schemas.test.ts for PublishResult validation.

### 3. Removed AgentFS from Runtime Code

**CRITICAL CHANGE**: Removed all AgentFS references from runtime code paths.

| Area | Change |
|------|--------|
| `packages/core/src/agentfs/` | Deleted entirely |
| `packages/core/src/beads/` | Deleted entirely |
| `packages/core/src/index.ts` | Removed agentfs/beads exports |
| `packages/core/package.json` | Removed agentfs peer dep |
| `packages/agents/src/base/agent.ts` | Replaced AgentFS with in-memory state |
| `packages/engine/src/hooks/` | Removed AgentFS hook configuration |
| Storage interfaces | Removed agentfs storage type |
| All agent files | Updated comments to remove AgentFS mentions |

### 4. Refactored BaseAgent

The BaseAgent class now uses simple in-memory state:
- `_state: InMemoryState = { kv: new Map(), auditLog: [] }`
- `SimpleAuditLogger` class replaces AgentFS audit logger
- `saveState()`/`loadState()` now use in-memory Map
- No external dependencies required

### 5. Updated Vitest Config

- Extended test include pattern: `['test/**/*.test.ts', 'packages/**/__tests__/*.test.ts']`
- Now discovers and runs tests in both locations

---

## Files Modified

| File | Action |
|------|--------|
| `packages/core/src/agentfs/` | DELETED |
| `packages/core/src/beads/` | DELETED |
| `packages/core/src/index.ts` | Edited - removed exports |
| `packages/core/package.json` | Edited - removed deps |
| `packages/core/src/storage/index.ts` | Edited - removed agentfs backend |
| `packages/core/src/storage/interfaces.ts` | Edited - removed agentfs type |
| `packages/agents/src/base/agent.ts` | Rewritten - in-memory state |
| `packages/agents/src/index.ts` | Edited - updated comment |
| `packages/agents/src/triage/index.ts` | Edited - updated comments |
| `packages/agents/src/reviewer/index.ts` | Edited - updated comments |
| `packages/agents/src/resolver/index.ts` | Edited - updated comments |
| `packages/agents/src/coder/index.ts` | Edited - updated comments |
| `packages/agents/src/orchestrator/index.ts` | Edited - updated comments |
| `packages/engine/src/hooks/config.ts` | Edited - removed AgentFS config |
| `packages/engine/src/hooks/types.ts` | Edited - removed AgentFS options |
| `packages/engine/src/hooks/index.ts` | Edited - removed AgentFS exports |
| `packages/core/src/run-bundle/schemas/publish.ts` | CREATED |
| `packages/core/src/run-bundle/schemas/index.ts` | Edited - added export |
| `packages/core/src/run-bundle/schemas/__tests__/schemas.test.ts` | Edited - added tests |
| `vitest.config.ts` | Edited - extended include |
| Multiple test files | Edited - removed AgentFS mocks |

---

## Test Results

```
Test Files  12 passed (12)
     Tests  262 passed (262)
```

All ARV checks pass:
- Contracts: 14 tests
- Goldens: 24 tests
- Schema tests: 46 tests
- Agent tests: 43 tests

---

## Key Decisions

### 1. In-Memory State for Agents

**Decision**: Use simple in-memory Maps instead of AgentFS for agent state.

**Rationale**:
- Users of GWI do NOT need AgentFS installed
- State is ephemeral (resets on restart) - this is acceptable
- For persistence, use Storage interfaces (Firestore in production)
- Simpler codebase with fewer dependencies

### 2. Remove AgentFS Entirely from packages/

**Decision**: Delete agentfs/ and beads/ directories, not just hide them.

**Rationale**:
- Users should never see or be confused by AgentFS
- Clear separation: internal tools live in `internal/`, not `packages/`
- Reduces bundle size and confusion

### 3. Beads Configuration Kept

**Decision**: Kept BeadsHookConfig types but removed AgentFSConfig.

**Rationale**:
- Beads is still used for internal development task tracking
- The types are needed for internal hooks (in `internal/` directory)
- But no runtime code references them

---

## Known Gaps

1. **RunIndexStore not implemented** - The interface was planned but not needed since run state is tracked in Firestore via the existing TenantStore/RunStore interfaces.

2. **Agent state is ephemeral** - If Cloud Run restarts mid-workflow, in-memory state is lost. This is a known gap documented in the baseline checkpoint.

---

## Next Steps

1. **Phase 2**: Add rate limiting and quotas
2. **Phase 3**: Implement persistent orchestrator step tracking
3. **Phase 4**: Add more comprehensive test coverage

---

## Verification Commands

```bash
# Build all packages
npm run build

# Run tests
npx vitest run

# ARV checks
npm run arv

# Check no AgentFS references remain
grep -r "agentfs\|AgentFS" packages/
```

---

## Conclusion

Phase 1 successfully established the engine core substrate by:
1. Verifying the existing run bundle infrastructure is complete
2. Adding the PublishResult schema
3. Removing all AgentFS dependencies from runtime code
4. Ensuring users never need to install or interact with AgentFS

The codebase is now cleaner, simpler, and focused on the user experience.
