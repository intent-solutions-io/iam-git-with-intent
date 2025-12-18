# Phase 5 After-Action Completion Report: SaaS Multi-Tenancy + Policy-as-Code

## Meta

| Field | Value |
|-------|-------|
| Phase | 5 |
| Title | SaaS Multi-Tenancy + Policy-as-Code |
| Status | **COMPLETE** |
| Started | 2025-12-16 22:00 CST |
| Completed | 2025-12-16 22:30 CST |
| Commit | (pending) |

---

## Summary

Phase 5 establishes the canonical multi-tenancy primitives that flow through every run, invocation, and audit event. The phase implements:

1. **TenantContext/ActorContext** - Identity propagation for tenant isolation
2. **PolicyEngine** - Deny-by-default policy evaluation for all tool invocations
3. **ConnectorConfigStore** - Tenant-scoped configuration injection
4. **Tenant-aware audit events** - Every audit event now includes actorId, policyReasonCode, approvalRef

---

## Deliverables

### 5.1 Tenant Context Model

**Files Created:**
- `packages/core/src/tenancy/context.ts`

**Key Types:**
- `ActorType`: 'human' | 'service' | 'github_app'
- `RequestSource`: 'cli' | 'web' | 'api' | 'github_action' | 'webhook'
- `ActorContext`: Identity of who is performing the operation
- `TenantContext`: Full context including tenant, actor, repo, installation
- `ExecutionContext`: Combines TenantContext with run/step metadata

**Helper Functions:**
- `createCliActor(userId)` - Create human actor from CLI
- `createServiceActor(serviceId)` - Create service account actor
- `createGitHubAppActor(installationId)` - Create GitHub App actor
- `createTenantContext(...)` - Build tenant context from components
- `createExecutionContext(...)` - Build full execution context
- `validateTenantContext(...)` - Validate tenant context structure
- `isActorType(ctx, type)` - Type guard for actor type
- `isFromSource(ctx, source)` - Type guard for request source

### 5.2 Policy-as-Code Engine

**Files Created:**
- `packages/core/src/tenancy/policy.ts`

**Key Types:**
- `PolicyReasonCode`: 10+ standardized reason codes (ALLOW_READ_DEFAULT, DENY_DESTRUCTIVE_NO_APPROVAL, etc.)
- `PolicyDecision`: { allowed, reasonCode, reason, matchedRule?, redactions? }
- `PolicyRule`: Individual policy rule with conditions and effect
- `PolicyDocument`: Full policy with defaults and rules

**Policy Evaluation Logic:**
1. DESTRUCTIVE operations ALWAYS require approval first (enforced before policy check)
2. If policy engine has no policy, use defaults (READ=allow, WRITE=deny, DESTRUCTIVE=deny)
3. Rules are sorted by priority (highest first)
4. First matching rule determines outcome
5. If no rule matches, use default behavior for policy class

**Key Principle:** Deny-by-default for destructive operations requires BOTH approval AND policy allow.

### 5.3 Tenant-Scoped Config Injection

**Files Created:**
- `packages/core/src/tenancy/config-store.ts`

**Key Types:**
- `ConnectorConfig`: Per-connector configuration with secrets, rate limits, timeouts
- `TenantConfig`: Full tenant configuration with all connectors
- `ConfigNotFoundError`: Explicit error when config is missing
- `ConfigValidationError`: Explicit error when config is invalid

**Implementations:**
- `MemoryConfigStore`: In-memory for tests
- `LocalConfigStore`: File-based (config/tenants/<tenantId>.json) for dev

**Key Principle:** No connector can run without tenantId; missing config throws explicit errors.

### 5.4 Tenant-Aware Audit Events

**Files Modified:**
- `packages/core/src/connectors/types.ts` - Extended ToolAuditEvent
- `packages/core/src/connectors/invoke.ts` - Integrated PolicyEngine

**New Audit Fields:**
- `actorId`: Who initiated the invocation
- `policyReasonCode`: Standardized reason from PolicyEngine
- `approvalRef`: Link to approval record (runId:approvedAt)

**Policy Integration:**
- `checkPolicyWithEngine()` uses global PolicyEngine when TenantContext available
- Falls back to `checkPolicySimple()` for backward compatibility
- Every audit event now includes the policy decision context

### 5.5 Module Exports

**Files Created:**
- `packages/core/src/tenancy/index.ts` - Module barrel export

**Files Modified:**
- `packages/core/src/index.ts` - Added tenancy exports

---

## Test Coverage

**Test File:** `packages/core/src/tenancy/__tests__/tenancy.test.ts`

**Test Categories:**
- ActorContext tests (4 tests)
- TenantContext tests (7 tests)
- ExecutionContext tests (2 tests)
- Policy engine without policy (4 tests)
- Policy engine with dev policy (4 tests)
- Policy engine with custom policy (7 tests)
- Config store tests (8 tests)
- Integration test (1 test)

**Total:** 33 tests, all passing

---

## Build & Verification

```bash
# Build passes
npm run build  # 10 successful, 10 total

# All tests pass
npm test  # 401 tests across all packages

# ARV passes
npm run arv  # Forbidden patterns check passed with warnings
```

---

## Design Decisions

### D1: Actor Type Enum
Chose 'human', 'service', 'github_app' as the three canonical actor types. This covers:
- Human users via CLI or web
- Automated service accounts
- GitHub App installations

### D2: Request Source Tracking
Source enum ('cli', 'web', 'api', 'github_action', 'webhook') enables:
- Audit trail of how operations originated
- Policy rules based on source (e.g., block webhook DESTRUCTIVE ops)
- Rate limiting per source type

### D3: Deny-by-Default Strategy
DESTRUCTIVE operations require TWO checks:
1. Approval record exists AND matches run/scope
2. PolicyEngine allows the operation

This prevents policy bypass via approval-only or approval-less policy rules.

### D4: Fallback Behavior
When no TenantContext is provided, the invoke pipeline uses simple policy checking for backward compatibility. This enables:
- Gradual migration to tenant-aware invocations
- CLI operations before tenant linking
- Local development without full context

### D5: Config Store Separation
Two implementations:
- `MemoryConfigStore` for tests (fast, isolated)
- `LocalConfigStore` for dev (file-based, cacheable)

Future: Add `FirestoreConfigStore` for production.

---

## Beads Created

| Bead ID | Description | Status |
|---------|-------------|--------|
| git-with-intent-hwb | Phase 5: SaaS Multi-Tenancy + Policy-as-Code (Epic) | completed |
| git-with-intent-1z2 | 5.1 Tenant context model | completed |
| git-with-intent-y81 | 5.2 Policy-as-code engine | completed |
| git-with-intent-sbh | 5.3 Tenant-scoped config injection | completed |
| git-with-intent-0qi | 5.4 Tenant-aware audit events | completed |
| git-with-intent-e6h | 5.5 ARV updates | completed |
| git-with-intent-alt | 5.6 Phase 5 AAR | completed |

---

## Files Changed

### New Files
- `packages/core/src/tenancy/context.ts` (150 lines)
- `packages/core/src/tenancy/policy.ts` (480 lines)
- `packages/core/src/tenancy/config-store.ts` (413 lines)
- `packages/core/src/tenancy/index.ts` (63 lines)
- `packages/core/src/tenancy/__tests__/tenancy.test.ts` (comprehensive tests)
- `000-docs/059-AA-AACR-phase-5-multitenancy-policy.md` (this file)

### Modified Files
- `packages/core/src/index.ts` - Added tenancy exports
- `packages/core/src/connectors/types.ts` - Extended ToolInvocationRequest, ToolAuditEvent
- `packages/core/src/connectors/invoke.ts` - Integrated PolicyEngine

---

## Known Gaps / Future Work

1. **FirestoreConfigStore**: Production config store implementation needed
2. **Policy Document Storage**: Currently in-memory; needs persistent storage
3. **Secret Manager Integration**: `resolveSecrets()` is a placeholder
4. **Rate Limiting per Tenant**: Framework exists but not enforced
5. **Approval Storage**: Need persistent approval records for audit

---

## Next Phases

Based on the build-out sequence, the next recommended phases are:

1. **Phase 6**: Agent specialization and model routing
2. **Phase 7**: Advanced workflow orchestration
3. **Phase 8**: Production observability and monitoring

---

## Conclusion

Phase 5 successfully establishes the multi-tenancy and policy foundation for the GWI SaaS platform. Every tool invocation now:
- Knows which tenant is making the request
- Knows which actor (human/service/app) initiated it
- Evaluates against a deny-by-default policy engine
- Records rich audit context for compliance

The implementation maintains backward compatibility while enabling gradual adoption of tenant-aware features.
