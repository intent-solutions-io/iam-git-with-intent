# AFTER ACTION REPORT (AAR) — Phase 3: Connector Framework / SDK

> **Document ID**: 057-AA-AACR-phase-3-connector-sdk
> **Category**: AA (After Action) / AACR (After Action Change Report)

---

## Metadata

| Field | Value |
|-------|-------|
| Phase | 3 |
| Sub-Phase(s) | 3.1 (SDK types), 3.2 (invoke pipeline), 3.3 (conformance tests), 3.4 (GitHub SDK connector) |
| Repo/App | git-with-intent |
| Owner | intent solutions io |
| Date/Time (CST) | 2025-12-16 21:50 CST |
| Status | FINAL |
| Related Issues/PRs | N/A |
| Commit(s) | `8bfbf87` |
| Beads | `git-with-intent-0tx` (3.1 SDK types), `git-with-intent-odu` (3.2 invoke), `git-with-intent-g5t` (3.3 conformance), `git-with-intent-dis` (3.4 migrate), `git-with-intent-1oc` (Phase 3 AAR) |
| AgentFS | agent id: `gwi` / mount: `agents/gwi` / db: `.agentfs/gwi.db` |

---

## Executive Summary

- Phase 3 implements the **Connector Framework / SDK** — a unified abstraction for all external integrations
- Created **core SDK types**: `ToolPolicyClass`, `ToolSpec`, `Connector`, `ConnectorRegistry`
- Implemented **unified invoke pipeline** (`invokeTool()`) as single choke point for all tool calls
- Built **conformance test harness** for validating connector implementations
- Migrated **GitHub to SDK** with `GitHubSDKConnector` exposing 9 tools
- **26 new tests** added, all passing
- Build and typecheck pass

---

## What Changed

### New Files Created

1. **`packages/core/src/connectors/types.ts`**
   - `ToolPolicyClass` enum: `READ`, `WRITE_NON_DESTRUCTIVE`, `DESTRUCTIVE`
   - `ToolContext` schema with runId, tenantId, approval, metadata
   - `ToolSpec<TInput, TOutput>` interface with schemas and invoke function
   - `Connector` interface with id, version, tools(), getTool(), healthcheck()
   - `ToolInvocationRequest/Result` schemas
   - `ToolAuditEvent` schema for audit trail
   - `ConnectorRegistry` interface
   - Helper: `defineToolSpec()` for typed tool creation

2. **`packages/core/src/connectors/invoke.ts`**
   - `invokeTool()` — unified pipeline: validate → audit → policy → execute → validate → audit
   - `DefaultConnectorRegistry` — in-memory connector registry
   - `getConnectorRegistry()` / `setConnectorRegistry()` — global singleton
   - Policy gate: blocks DESTRUCTIVE without approval, validates scope

3. **`packages/core/src/connectors/conformance.ts`**
   - `ConformanceTestResult` / `ConformanceReport` types
   - 8 conformance tests:
     - `connector_metadata`: id, version, displayName
     - `tools_have_input_schemas`
     - `tools_have_output_schemas`
     - `tools_have_policy_class`
     - `input_schema_validation`
     - `tool_names_stable`: no duplicates, valid format
     - `get_tool_consistency`
     - `destructive_tools_blocked`
   - `runConformanceTests()` / `assertConformance()`

4. **`packages/core/src/connectors/index.ts`**
   - Re-exports all types, invoke pipeline, and conformance harness

5. **`packages/integrations/src/github/sdk-connector.ts`**
   - `GitHubSDKConnector` implementing `Connector` interface
   - 9 tools:
     - READ: `getIssue`, `getPullRequest`
     - WRITE_NON_DESTRUCTIVE: `postComment`, `createCheckRun`, `manageLabels`
     - DESTRUCTIVE: `createBranch`, `pushCommit`, `createPullRequest`, `updatePullRequest`
   - All tools have Zod input/output schemas

6. **`packages/core/src/connectors/__tests__/connector-sdk.test.ts`**
   - 26 tests covering:
     - Type definitions and defineToolSpec
     - Connector interface
     - Registry operations
     - Invoke pipeline (READ/WRITE/DESTRUCTIVE)
     - Policy enforcement
     - Conformance tests

7. **`packages/core/vitest.config.ts`**
   - Added vitest config for core package tests

### Modified Files

1. **`packages/core/src/index.ts`**
   - Added export for connectors module

2. **`packages/integrations/src/github/index.ts`**
   - Added exports for SDK connector (with renamed schemas to avoid conflicts)

---

## Why

- GitHub should be "just a connector" — no special treatment
- Adding future integrations (Zendesk, Airbyte, etc.) should be mostly wiring + schemas
- All tool invocations need a single choke point for:
  - Schema validation
  - Policy enforcement
  - Audit logging
- Conformance tests ensure connector quality and consistency

---

## Key Design Decisions

### 1. ToolPolicyClass Enum

Three policy levels:
- **READ**: Always allowed, no side effects
- **WRITE_NON_DESTRUCTIVE**: Allowed by default (comments, labels, check-runs)
- **DESTRUCTIVE**: Requires `ApprovalRecord` with matching scope

### 2. Unified Invoke Pipeline

Single `invokeTool()` function enforces:
1. Input schema validation
2. Audit event: `tool_invocation_requested`
3. Policy gate check
4. Tool execution
5. Output schema validation
6. Audit event: `tool_invocation_succeeded/failed`

### 3. Conformance Test Harness

Every connector MUST pass:
- Metadata validation (id, version, displayName)
- All tools have input/output schemas
- All tools have valid policyClass
- Tool names are unique and properly formatted
- getTool() is consistent with tools()
- DESTRUCTIVE tools blocked without approval

### 4. SDK Connector Pattern

`GitHubSDKConnector`:
- Implements `Connector` interface
- Builds all tools in `buildTools()` method
- Uses helper function for type-safe tool creation
- Keeps existing Phase 2 connector for backward compatibility

---

## How to Verify

```bash
# Build
npm run build

# Run Phase 3 tests (26 tests)
npx vitest run packages/core/src/connectors/__tests__/connector-sdk.test.ts

# Run all tests
npm test

# Type check
npm run typecheck
```

---

## Test Results Summary

| Test Suite | Tests | Status |
|------------|-------|--------|
| connector-sdk.test.ts | 26 | PASS |
| **Total** | **26** | **PASS** |

Test categories:
- Connector SDK Types: 3 tests
- DefaultConnectorRegistry: 4 tests
- invokeTool: 10 tests
- Conformance Tests: 9 tests

---

## Risks / Gotchas

1. **Dual connector implementations**: Phase 2 `GitHubConnector` and Phase 3 `GitHubSDKConnector` coexist — existing code continues to work, new code should use SDK connector
2. **Schema export conflicts**: SDK connector schemas have `SDK` prefix to avoid conflicts with Phase 2 schemas
3. **Audit path optional**: `basePath` parameter in `invokeTool()` allows configurable audit location
4. **Registry is in-memory**: No persistence between runs (intentional for Phase 3)

---

## Rollback Plan

1. Remove `packages/core/src/connectors/` directory
2. Remove connector exports from `packages/core/src/index.ts`
3. Remove `packages/integrations/src/github/sdk-connector.ts`
4. Revert `packages/integrations/src/github/index.ts` exports
5. Remove `packages/core/vitest.config.ts`
6. Remove test file
7. Run `npm run build` to verify clean state

---

## Open Questions

- [ ] Should conformance tests run in CI for all connectors?
- [ ] Should we deprecate Phase 2 GitHubConnector in favor of SDK connector?
- [ ] How should connector configuration (API keys, etc.) be injected?

---

## Next Actions

| Action | Owner | Priority |
|--------|-------|----------|
| Phase 4: First connector integration | TBD | HIGH |
| Add more connectors (Zendesk, etc.) | TBD | Medium |
| CI job for conformance tests | TBD | Medium |
| Connector configuration injection pattern | TBD | Low |

---

## Artifacts

| File | Description |
|------|-------------|
| `packages/core/src/connectors/types.ts` | SDK type definitions |
| `packages/core/src/connectors/invoke.ts` | Unified invoke pipeline |
| `packages/core/src/connectors/conformance.ts` | Conformance test harness |
| `packages/core/src/connectors/index.ts` | Module exports |
| `packages/integrations/src/github/sdk-connector.ts` | GitHub SDK connector |
| `packages/core/src/connectors/__tests__/connector-sdk.test.ts` | Test suite (26 tests) |
| `packages/core/vitest.config.ts` | Test configuration |

---

## Dependencies

- `@gwi/core` — Run bundle types, audit log
- `octokit` — GitHub API client
- `zod` — Schema validation

---

*intent solutions io — confidential IP*
*Contact: jeremy@intentsolutions.io*
