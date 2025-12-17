# Phase 4: CoderAgent File I/O + Issue-to-Code Workflow

**Document ID**: 038-AA-REPT
**Date**: 2025-12-16 16:50 CST
**Author**: Claude Code (Opus 4.5)
**Status**: COMPLETE

---

## 1. Overview

### Goal

Transform the CoderAgent skeleton into a real, file-writing agent that produces concrete code artifacts in a safe sandbox, and expose a usable **issue-to-code** workflow through the engine and CLI.

### Scope

- Create a sandboxed workspace for generated code artifacts
- Implement CoderAgent file I/O against the sandbox
- Expose issue-to-code workflow via Engine + CLI
- Add tests and documentation

### Out of Scope

- Real LLM integration (will use mocks in tests)
- Production GitHub network calls in automated tests
- Persistent storage of generated artifacts beyond workspace

---

## 2. Before Status

| Check | Result |
|-------|--------|
| Build | ✅ PASS (10 packages) |
| Test | ✅ PASS (20 tests: 14 agents, 6 API) |
| Typecheck | ✅ PASS |
| Working Tree | ✅ CLEAN (after baseline commit 4799598) |

---

## 3. Implementation Log

### Task A: Safe Workspace Sandbox

**Status**: ✅ COMPLETE

- [x] Create `workspace/` directory at repo root
- [x] Add to `.gitignore`
- [x] Add `workspace/README.md` explaining purpose
- [x] Create `packages/core/src/workspace.ts` with path helpers
- [x] Export from `@gwi/core`

**Files Created/Modified**:
- `workspace/` (directory)
- `workspace/README.md`
- `packages/core/src/workspace.ts`
- `packages/core/src/index.ts` (export added)
- `.gitignore` (workspace/ added)

### Task B: CoderAgent File I/O

**Status**: ✅ COMPLETE

- [x] Inspect existing CoderAgent skeleton
- [x] Define input/output types (`CoderRunInput`, `CoderRunOutput`)
- [x] Implement file-writing logic using workspace helpers
- [x] Add `generateCodeWithArtifacts()` method
- [x] Added `formatPlan()` and `formatPatch()` helpers

**Files Modified**:
- `packages/agents/src/coder/index.ts`

### Task C: Issue-to-Code Workflow

**Status**: ✅ COMPLETE

- [x] Create engine entrypoint `runIssueToCodeFromGithubUrl`
- [x] Implement `parseGitHubIssueUrl` helper
- [x] Wire CLI `issue-to-code` command
- [x] Implement dry-run mode
- [x] Print human-readable output with colors

**Files Created/Modified**:
- `packages/engine/src/run/issue-to-code.ts` (new)
- `packages/engine/src/run/index.ts` (export added)
- `apps/cli/src/commands/issue-to-code.ts` (new)
- `apps/cli/src/index.ts` (command registration)

### Task D: Tests

**Status**: ✅ COMPLETE

- [x] CoderAgent unit tests (6 tests)
- [x] Engine workflow tests (10 tests)
- [x] URL parsing tests

**Files Created**:
- `packages/agents/src/coder/__tests__/coder.test.ts`
- `packages/engine/src/run/__tests__/issue-to-code.test.ts`

---

## 4. Sandbox Workspace Design

```
workspace/                    # Git-ignored ephemeral directory
├── README.md                 # Explains purpose
└── runs/                     # Per-run subdirectories
    └── run-<id>/
        ├── plan.md           # LLM-generated change plan
        └── patch-001.txt     # Proposed code changes
```

**Key API**:
```typescript
// packages/core/src/workspace.ts
export interface WorkspacePaths {
  root: string;
  runsDir: string;
}

export function getWorkspacePaths(): WorkspacePaths;
export function getRunWorkspaceDir(runId: string): string;
export function getRunArtifactPaths(runId: string): { planPath: string; patchDir: string };
export function getPatchFilePath(runId: string, index: number): string;
```

---

## 5. Operator Quick Check

```bash
cd /home/jeremy/000-projects/git-with-intent

# Verify baseline
npm run build
npm test
npm run typecheck

# Issue-to-code demo (dry-run mode)
node apps/cli/dist/index.js issue-to-code https://github.com/owner/repo/issues/123 --dry-run

# Shorthand format also works
node apps/cli/dist/index.js issue-to-code owner/repo#123 --dry-run

# Inspect artifacts
ls workspace/runs
ls workspace/runs/<run-id>
cat workspace/runs/<run-id>/plan.md
```

**Sample Output**:
```
✔ Issue-to-code workflow completed

============================================================
  Issue-to-Code Summary
============================================================

Issue:        test/repo#1
Run ID:       run-mj968ulc-2m9ydg
Complexity:   5/10 (Medium)
Confidence:   100%
Files:        0 generated

Triage Summary:
Dry run - using default complexity: 5

Artifacts:
Workspace:    workspace/runs/run-mj968ulc-2m9ydg
Plan:         workspace/runs/run-mj968ulc-2m9ydg/plan.md
Patches:
  - workspace/runs/run-mj968ulc-2m9ydg/patch-001.txt
```

---

## 6. After Status

| Check | Result |
|-------|--------|
| Build | ✅ PASS (10 packages) |
| Test | ✅ PASS (36 tests: 20 agents, 10 engine, 6 API) |
| Typecheck | ✅ PASS |
| Working Tree | Pending commit |

---

## 7. Decisions & Tradeoffs

1. **Dry-run as default for testing**: Created a dry-run mode that creates mock artifacts without calling LLMs, making it easy to test the workflow end-to-end.

2. **Sanitized runIds**: The `getRunWorkspaceDir` function sanitizes runIds to prevent path traversal attacks by replacing non-alphanumeric characters with underscores.

3. **Patch format**: Used a simple human-readable format for patch files rather than unified diff format, as the focus is on showing what code would be generated rather than being directly applicable via `git apply`.

4. **GitHub issue fetching**: Currently uses mock issues even in non-dry-run mode. Real fetching via `@gwi/integrations` is a TODO for a future phase.

5. **Workspace location**: Uses `workspace/` at repo root by default, configurable via `GWI_WORKSPACE_ROOT` environment variable.

---

## 8. Test Coverage Summary

| Package | Test File | Tests |
|---------|-----------|-------|
| @gwi/agents | `coder/__tests__/coder.test.ts` | 6 |
| @gwi/agents | `triage/__tests__/triage.test.ts` | 8 |
| @gwi/agents | `orchestrator/__tests__/orchestrator.test.ts` | 6 |
| @gwi/engine | `run/__tests__/issue-to-code.test.ts` | 10 |
| @gwi/api | `__tests__/workflow.e2e.test.ts` | 6 |
| **Total** | | **36 tests** |

---

## 9. Next Steps / TODOs

1. ~~Complete Task A (sandbox workspace)~~ ✅
2. ~~Complete Task B (CoderAgent file I/O)~~ ✅
3. ~~Complete Task C (CLI integration)~~ ✅
4. ~~Complete Task D (tests)~~ ✅
5. Integrate real GitHub issue fetching via `@gwi/integrations`
6. Add CLI tests (currently minimal due to ora spinner complexity)
7. Consider unified diff format for patches in future phases
8. Add rate limiting for LLM calls

---

## 10. Files Changed Summary

### New Files (7)
- `workspace/README.md`
- `packages/core/src/workspace.ts`
- `packages/engine/src/run/issue-to-code.ts`
- `packages/engine/src/run/__tests__/issue-to-code.test.ts`
- `packages/agents/src/coder/__tests__/coder.test.ts`
- `apps/cli/src/commands/issue-to-code.ts`

### Modified Files (5)
- `.gitignore`
- `packages/core/src/index.ts`
- `packages/agents/src/coder/index.ts`
- `packages/engine/src/run/index.ts`
- `apps/cli/src/index.ts`

---

*Phase 4 Complete. Ready for commit.*
