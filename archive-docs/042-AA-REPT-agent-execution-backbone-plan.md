# Agent Execution Backbone Implementation Plan

**Document ID**: 042-AA-REPT
**Date**: 2025-12-16
**Author**: Claude Code
**Status**: Implementation Plan

---

## Executive Summary

This document outlines the implementation plan for the "Agent Execution Backbone" - a core infrastructure layer that makes GWI workflows deterministic, auditable, and safe.

## Current State Analysis

### Existing Components

| Component | Location | Purpose |
|-----------|----------|---------|
| CLI Commands | `apps/cli/src/commands/` | User-facing commands (workflow.ts, triage.ts, etc.) |
| Engine | `packages/engine/src/run/` | Run management with TenantStore |
| GitHub Client | `packages/integrations/src/github/` | Octokit wrapper for GitHub API |
| Storage | `packages/core/src/storage/` | Firestore and in-memory backends |
| Agents | `packages/agents/src/` | Triage, Resolver, Reviewer, Coder, Orchestrator |
| Core Types | `packages/core/src/types.ts` | Basic TypeScript types |

### Identified Gaps

1. **No local artifact bundles**: Runs are stored in Firestore/memory, not as inspectable files
2. **No state machine**: Run states exist but no explicit transitions or validation
3. **No schema validation**: Agent outputs are not validated against Zod schemas
4. **No deterministic scoring**: Complexity uses LLM which can vary between runs
5. **No approval gating**: GitHub write operations have no explicit approval requirement
6. **No audit log**: No append-only log of all run events

---

## Implementation Plan

### Phase 1: Run Model + Artifact Bundle

**New Files:**
- `packages/core/src/run-bundle/index.ts` - Main exports
- `packages/core/src/run-bundle/types.ts` - Type definitions
- `packages/core/src/run-bundle/run-context.ts` - RunContext creation
- `packages/core/src/run-bundle/state-machine.ts` - State machine implementation
- `packages/core/src/run-bundle/artifact-writer.ts` - File writing utilities
- `packages/core/src/run-bundle/audit-log.ts` - Append-only audit log
- `packages/core/src/run-bundle/__tests__/run-bundle.test.ts` - Unit tests

**State Machine States:**
```
queued → triaged → planned → resolving → review → awaiting_approval → applying → done
                                                                    ↘ aborted
                                                                    ↘ failed
```

**Artifact Bundle Structure:**
```
.gwi/runs/<runId>/
├── run.json          # RunContext
├── triage.json       # TriageResult
├── plan.md           # Human-readable plan
├── plan.json         # Structured plan (optional)
├── patch.diff        # The actual changes
├── resolve.json      # Resolution metadata
├── review.json       # ReviewResult
├── approval.json     # Approval record (if approved)
└── audit.log         # JSON Lines audit trail
```

### Phase 2: Tool Contracts + Schemas

**New Files:**
- `packages/core/src/run-bundle/schemas/index.ts` - All schema exports
- `packages/core/src/run-bundle/schemas/triage.ts` - TriageResult schema
- `packages/core/src/run-bundle/schemas/plan.ts` - PlanResult schema
- `packages/core/src/run-bundle/schemas/resolve.ts` - ResolveResult schema
- `packages/core/src/run-bundle/schemas/review.ts` - ReviewResult schema
- `packages/core/src/run-bundle/schemas/__tests__/schemas.test.ts` - Schema tests

**Schema Contracts:**
- All agent step outputs validated with Zod
- Invalid results mark run as failed
- Schema errors written to audit.log

### Phase 3: Deterministic Complexity Scoring

**New Files:**
- `packages/core/src/scoring/index.ts` - Main exports
- `packages/core/src/scoring/baseline-scorer.ts` - Deterministic scorer
- `packages/core/src/scoring/features.ts` - Feature extraction
- `packages/core/src/scoring/rubric.ts` - Scoring rubric (code + docs)
- `packages/core/src/scoring/__tests__/scorer.test.ts` - Unit tests
- `packages/core/src/scoring/__tests__/fixtures/` - Golden test fixtures
- `docs/complexity-rubric.md` - Documentation

**Scoring Algorithm:**
```
baselineScore = function(features) // Deterministic, 1-10
llmAdjustment = LLM(context) // -2 to +2, with reasons from enum
finalScore = clamp(baselineScore + llmAdjustment, 1, 10)
```

### Phase 4: GitHub Capabilities + Approval Gating

**New Files:**
- `packages/integrations/src/github/capabilities.ts` - Capability definitions
- `packages/integrations/src/github/approval.ts` - Approval gating logic
- `packages/integrations/src/github/__tests__/approval.test.ts` - Tests

**Capability Matrix:**
| Action | Requires Approval |
|--------|-------------------|
| Read PR metadata | No |
| Read PR diff/files | No |
| Post comment | No |
| Apply labels | No |
| Create check-run | No |
| Commit changes | **Yes** |
| Push branch | **Yes** |
| Open/Update PR | **Yes** |

**Approval Record:**
```json
{
  "runId": "...",
  "approvedAt": "2025-12-16T...",
  "approvedBy": "user@example.com",
  "scope": ["commit", "push"],
  "patchHash": "sha256:..."
}
```

### Phase 5: Wire into CLI

**Modified Files:**
- `apps/cli/src/commands/workflow.ts` - Create run bundles
- `packages/engine/src/run/engine.ts` - Write artifacts after each step

**Integration Points:**
1. `workflow start` → creates `.gwi/runs/<runId>/run.json`
2. After triage → writes `triage.json`, appends audit
3. After resolve → writes `patch.diff`, appends audit
4. After review → writes `review.json`, appends audit
5. `workflow approve` → writes `approval.json` with patch hash
6. `workflow apply` → verifies approval, applies patch

### Phase 6: Documentation

**New/Updated Files:**
- `docs/run-artifacts.md` - Artifact bundle documentation
- `docs/complexity-rubric.md` - Scoring documentation
- `docs/github-capabilities.md` - Approval requirements
- `README.md` - Brief mention of new features

---

## Commit Plan

1. **Commit 1: Run model + artifact bundle**
   - RunContext, state machine, artifact writer, audit log
   - Unit tests for directory creation, audit append, artifact read/write

2. **Commit 2: Schemas + validation**
   - Zod schemas for all agent step outputs
   - Schema validation tests

3. **Commit 3: Complexity scorer + fixtures**
   - Deterministic baseline scorer
   - 5+ golden test fixtures
   - Rubric documentation

4. **Commit 4: GitHub capabilities + approval gating**
   - Capability wrapper
   - Approval record handling
   - Patch hash verification tests

5. **Commit 5: CLI wiring**
   - Integration with workflow commands
   - End-to-end artifact creation

6. **Commit 6: Docs + cleanup**
   - All documentation
   - Any final test fixes

---

## Test Plan

| Test Category | Files | Coverage |
|---------------|-------|----------|
| Run Bundle | `run-bundle/__tests__/run-bundle.test.ts` | Directory creation, audit append, artifact read/write |
| Schemas | `schemas/__tests__/schemas.test.ts` | Valid fixtures pass, invalid fail |
| Scorer | `scoring/__tests__/scorer.test.ts` | Golden tests, bounds checking |
| Approval | `github/__tests__/approval.test.ts` | Gating blocks, hash verification |

---

## Success Criteria

- [ ] A full run produces a complete `.gwi/runs/<runId>/` bundle
- [ ] Complexity baseline is deterministic across runs (golden tests)
- [ ] Destructive GitHub actions blocked without valid approval
- [ ] All agent outputs validated against Zod schemas
- [ ] Documentation explains the system

---

## Timeline

Proceeding directly to implementation.
