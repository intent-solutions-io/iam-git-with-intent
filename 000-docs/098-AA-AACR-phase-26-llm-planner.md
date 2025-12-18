# 098-AA-AACR: Phase 26 - LLM Planner Integration

**Document ID**: 098-AA-AACR-phase-26-llm-planner
**Phase**: 26
**Date**: 2025-12-17 19:45 CST (America/Chicago)
**Author**: Claude Code (Opus 4.5)

---

## Metadata (Required)

| Field | Value |
|-------|-------|
| Beads (Epic) | `git-with-intent-au0` |
| Beads (Tasks) | `git-with-intent-ch6` (schema), `git-with-intent-8sf` (service), `git-with-intent-ogz` (guard), `git-with-intent-2c2` (CLI), `git-with-intent-3x0` (tests), `git-with-intent-xdh` (ARV), `git-with-intent-yn0` (docs) |
| AgentFS | Agent ID: `gwi`, Mount: `.agentfs/`, DB: `.agentfs/gwi.db` |
| AgentFS Evidence | Turso sync: `libsql://gwi-agentfs-jeremylongshore.aws-us-east-1.turso.io` |
| Related Issues/PRs | N/A |
| Commit(s) | uncommitted - Phase 26 implementation |

---

## 1. Summary

Phase 26 implemented LLM Planner Integration for Git With Intent:

- **PatchPlan Schema**: Zod-validated JSON contract with security rules (no path traversal, no absolute paths)
- **PlannerService**: Orchestrator with provider abstraction, caching, retries, and fallback
- **Provider Interface**: Gemini and Claude implementations with configurable models
- **PlanGuard**: Policy-aware safety bouncer integrating with Phase 25 approval system
- **CLI Commands**: `gwi planner generate|validate|status` behind feature flag
- **Golden Tests**: 28 deterministic tests with frozen fixtures (no live API calls)
- **ARV Gate**: 8-point verification for planner infrastructure

All DoD criteria met. Build passes (12/12 packages). Planner Gate passes (8/8 checks). Golden tests pass (28/28).

---

## 2. What Was Done

### 2.1 PatchPlan Schema

**File**: `packages/core/src/planner/types.ts`

Created comprehensive Zod schema with:

- **SafeFilePath**: Prevents path traversal (`..`), absolute paths (`/`), null bytes
- **PatchFileEntry**: path, action (create/modify/delete/rename), reason, language
- **PatchStepEntry**: order, name, description, files, prompt, risk, dependencies
- **PatchTestEntry**: name, type, command, validates, must_pass_before/after
- **PatchRiskAssessment**: overall level, confidence, individual risks, approval requirements
- **PlanPolicyContext**: Phase 25 integration (allowed, required_scopes, approval_ids)
- **RollbackPlan**: automatic flag, steps, estimated time
- **PatchPlanSchema**: Complete contract with validation helpers

### 2.2 Security Validation

**File**: `packages/core/src/planner/types.ts`

`validatePatchPlanSecurity()` checks for:

- Variable interpolation in paths (`${...}`)
- Backtick execution in paths
- Command substitution (`$(...)`)
- Chained destructive commands (`;rm -rf`)
- Pipe to shell patterns
- Dangerous test commands
- Secrets in prompts (API keys, tokens, passwords)

### 2.3 PlannerService

**File**: `packages/core/src/planner/service.ts`

Orchestrator with:

- **Provider Selection**: Configurable primary/fallback providers
- **Retry Logic**: Configurable max retries with delay
- **Caching**: Optional plan caching with TTL
- **Validation**: Automatic schema + security validation
- **Feature Flag**: `GWI_PLANNER_ENABLED=1` to enable
- **Environment Config**: `GWI_PLANNER_PROVIDER`, `GWI_PLANNER_MODEL`

### 2.4 Provider Implementations

**File**: `packages/core/src/planner/providers.ts`

- **PlannerProviderInterface**: `plan(input): Promise<PatchPlan>`, `isAvailable()`, `getModel()`
- **GeminiPlannerProvider**: Uses `@google/generative-ai`, JSON mode output
- **ClaudePlannerProvider**: Uses `@anthropic-ai/sdk`, extracts JSON from response
- **createPlannerProvider()**: Factory function

### 2.5 PlanGuard

**File**: `packages/core/src/planner/guard.ts`

Safety bouncer with configurable checks:

- **Risk Level**: Block plans exceeding max risk (default: high)
- **File Limits**: Max files (default: 50), max steps (default: 20)
- **Blocked Files**: `.env`, `.pem`, `.key`, credentials, secrets, node_modules, .git
- **Test Requirements**: Require tests for medium+ risk plans
- **Policy Integration**: Phase 25 `checkGate()` integration
- **Audit Events**: Emits `candidate.generated` / `candidate.rejected` events

### 2.6 CLI Commands

**File**: `apps/cli/src/commands/planner.ts`

Three commands behind feature flag:

```bash
# Generate a PatchPlan from intent
gwi planner generate "Add user authentication" --provider gemini

# Validate an existing plan file
gwi planner validate plan.json --max-risk high

# Show planner status and configuration
gwi planner status
```

### 2.7 Golden Tests

**File**: `test/goldens/planner/patch-plan.golden.test.ts`

28 deterministic tests covering:

- Schema validation (valid/invalid plans)
- Security violations (path traversal, absolute paths)
- PlanGuard checks (risk levels, limits, blocked files, test requirements)

**Fixtures**:
- `valid-plan.json`: Complete valid authentication module plan
- `invalid-plan-path-traversal.json`: Path traversal attack
- `invalid-plan-absolute-path.json`: Absolute path attack
- `high-risk-plan.json`: Critical infrastructure change

### 2.8 ARV Gate

**File**: `scripts/arv/planner-gate.ts`

8 verification checks:
1. PatchPlan schema with Zod validation
2. PlannerService with provider abstraction
3. Gemini + Claude provider implementations
4. PlanGuard safety checks
5. Module exports
6. CLI integration with feature flag
7. Golden tests with fixtures
8. Core module export

---

## 3. Files Changed

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/planner/types.ts` | PatchPlan schema + validation |
| `packages/core/src/planner/service.ts` | PlannerService orchestrator |
| `packages/core/src/planner/providers.ts` | Gemini/Claude providers |
| `packages/core/src/planner/guard.ts` | PlanGuard safety bouncer |
| `packages/core/src/planner/index.ts` | Module exports |
| `apps/cli/src/commands/planner.ts` | CLI commands |
| `test/goldens/planner/patch-plan.golden.test.ts` | Golden tests |
| `test/goldens/planner/fixtures/*.json` | Test fixtures (4 files) |
| `scripts/arv/planner-gate.ts` | ARV verification |

### Modified Files

| File | Changes |
|------|---------|
| `packages/core/src/index.ts` | Added planner exports |
| `apps/cli/src/index.ts` | Added planner command group |
| `scripts/arv/run-all.ts` | Added planner gate |

---

## 4. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI / API Request                        │
│               "gwi planner generate <intent>"               │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Feature Flag Check                       │
│                 GWI_PLANNER_ENABLED=1                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    PlannerService                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Provider   │  │   Cache     │  │  Retry/Fallback     │ │
│  │  Selection  │  │  (optional) │  │  Logic              │ │
│  └──────┬──────┘  └─────────────┘  └─────────────────────┘ │
└─────────┼───────────────────────────────────────────────────┘
          │
    ┌─────┴─────┐
    │           │
    ▼           ▼
┌───────┐   ┌───────┐
│Gemini │   │Claude │
│Provider   │Provider
└───┬───┘   └───┬───┘
    │           │
    └─────┬─────┘
          │
          ▼ PatchPlan JSON
┌─────────────────────────────────────────────────────────────┐
│                  PatchPlanSchema.parse()                    │
│           Zod Validation + SafeFilePath Rules               │
└─────────────────────────┬───────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│              validatePatchPlanSecurity()                    │
│       Shell injection, secrets detection, etc.              │
└─────────────────────────┬───────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                      PlanGuard                              │
│  ┌─────────┐ ┌───────────┐ ┌────────────┐ ┌─────────────┐  │
│  │ Risk    │ │ File      │ │ Blocked    │ │ Policy      │  │
│  │ Level   │ │ Limits    │ │ Files      │ │ (Phase 25)  │  │
│  └─────────┘ └───────────┘ └────────────┘ └─────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
        ┌─────────┐             ┌───────────┐
        │ ALLOWED │             │  BLOCKED  │
        │         │             │ violations│
        └────┬────┘             └─────┬─────┘
             │                        │
             ▼                        ▼
     Return PatchPlan          Return Errors
```

---

## 5. Feature Flag Configuration

```bash
# Enable planner (required)
export GWI_PLANNER_ENABLED=1

# Optional: Set provider (default: gemini)
export GWI_PLANNER_PROVIDER=gemini  # or claude

# Optional: Set specific model
export GWI_PLANNER_MODEL=gemini-2.0-flash

# API keys (provider-specific)
export GOOGLE_AI_API_KEY=...       # For Gemini
export ANTHROPIC_API_KEY=...       # For Claude
```

---

## 6. Verification Commands

```bash
# Build all packages
npm run build

# Run planner ARV gate
npx tsx scripts/arv/planner-gate.ts

# Run golden tests
npx vitest run test/goldens/planner/

# Type check
npm run typecheck
```

**Results**:
- Build: 12/12 packages successful
- Planner Gate: 8/8 checks passed
- Golden Tests: 28/28 tests passed

---

## 7. Architecture Decisions

### 7.1 Zod vs AJV for Validation

**Decision**: Use Zod instead of AJV.

**Rationale**:
- Zod already established in codebase (29 files using it)
- Type inference from schema definitions
- Fluent refinement API for security rules
- No additional dependency

### 7.2 Provider Abstraction

**Decision**: Interface-based provider abstraction with factory.

**Rationale**:
- Easy to add new providers (OpenAI, local models)
- Consistent API across providers
- Testable in isolation
- Dynamic imports to avoid loading unused SDKs

### 7.3 Feature Flag Gating

**Decision**: All planner functionality behind `GWI_PLANNER_ENABLED=1`.

**Rationale**:
- Phase 26 is new, untested in production
- Easy to disable if issues arise
- Clear opt-in behavior
- No impact on existing workflows

### 7.4 PlanGuard Integration with Phase 25

**Decision**: PlanGuard calls `checkGate()` from Phase 25 policy system.

**Rationale**:
- Reuses existing policy infrastructure
- Consistent approval requirements
- Audit trail via existing events
- No duplicate policy logic

---

## 8. What's Next

### 8.1 Immediate Follow-ups (P1)

1. **Integration Tests**: Test planner with real LLM calls in CI
2. **Coder Agent Integration**: Wire PatchPlan output to coder agent
3. **Workflow Integration**: Add planner step to issue-to-code workflow

### 8.2 Future Enhancements (P2)

1. **Plan Persistence**: Store plans in Firestore for history/audit
2. **Plan Diffing**: Compare plans for same intent over time
3. **Plan Templates**: Pre-defined plan templates for common tasks
4. **Cost Estimation**: Estimate token costs before execution

---

## 9. Lessons Learned

### 9.1 Type Aliasing for Exports

**Issue**: Zod schema inference types conflict with `type` keyword exports.

**Resolution**: Use aliased type exports:
```typescript
type PatchPlan = z.infer<typeof PatchPlanSchema>;
type PatchRiskLevel = z.infer<typeof PatchRiskLevel>;
// NOT: export type { PatchRiskLevel }
// YES: export type PatchRiskLevel
```

### 9.2 Audit Event Type Reuse

**Issue**: Phase 26 needs new audit event types, but adding them requires Phase 24 changes.

**Resolution**: Reuse semantically similar existing events (`candidate.generated` / `candidate.rejected`).

---

## 10. Metrics

| Metric | Value |
|--------|-------|
| Files Created | 9 |
| Files Modified | 3 |
| Lines of Code | ~1,600 |
| Golden Tests | 28 |
| Test Fixtures | 4 |
| ARV Checks | 8 |
| Build Time | ~23s |
| Test Duration | 3.78s |

---

## 11. References

- [Phase 25 AAR](097-AA-AACR-phase-25-approval-policy.md)
- [Planner Module](../packages/core/src/planner/)
- [Golden Tests](../test/goldens/planner/)
- [ARV Gate](../scripts/arv/planner-gate.ts)

---

*Phase 26 Complete. LLM Planner Integration with PatchPlan schema, PlanGuard, and CLI commands implemented.*

---

intent solutions io — confidential IP
Contact: jeremy@intentsolutions.io
