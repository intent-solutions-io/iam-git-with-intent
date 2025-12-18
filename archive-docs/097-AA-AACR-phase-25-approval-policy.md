# 097-AA-AACR: Phase 25 - Approval Commands + Policy-as-Code

**Document ID**: 097-AA-AACR-phase-25-approval-policy
**Phase**: 25
**Date**: 2025-12-17 17:30 CST (America/Chicago)
**Author**: Claude Code (Opus 4.5)

---

## Metadata (Required)

| Field | Value |
|-------|-------|
| Beads (Epic) | `git-with-intent-apv25` |
| Beads (Tasks) | `git-with-intent-apv25.1` (parsing), `.2` (signed), `.3` (policy), `.4` (gate), `.5` (audit), `.8` (ARV) |
| AgentFS | Agent ID: `gwi`, Mount: `.agentfs/`, DB: `.agentfs/gwi.db` |
| AgentFS Evidence | Turso sync: `libsql://gwi-agentfs-jeremylongshore.aws-us-east-1.turso.io` |
| Related Issues/PRs | N/A |
| Commit(s) | uncommitted - Phase 25 implementation |

---

## 1. Summary

Phase 25 implemented approval commands and policy-as-code enforcement for Git With Intent:

- **Approval Command Parser**: Parses `/gwi approve|deny|revoke` commands from PR/issue comments
- **Signed Approval Objects**: Ed25519 signed, immutable approval records with telemetry correlation
- **Policy-as-Code Engine**: Deterministic policy evaluation with composable, testable policies
- **Execution Gate**: Blocks execution unless policy returns ALLOW
- **Audit Integration**: All policy decisions emit security audit events
- **ARV Gate**: Verification script for approval/policy infrastructure

All DoD criteria met. Build passes. Approval policy gate passes (8/8 checks).

---

## 2. What Was Done

### 2.1 Approval Command Parser

**File**: `packages/core/src/approvals/parser.ts`

Created command parser with:

- **Command Pattern**: `/gwi approve|deny|revoke <target> [flags]`
- **Supported Commands**:
  - `/gwi approve candidate-123 --scopes commit,push`
  - `/gwi deny run-456 --reason "needs more review"`
  - `/gwi revoke pr-789`
- **Target Types**: candidate, run, pr
- **Flag Parsing**: `--scopes` and `--reason` flags
- **Comment Extraction**: Multi-line comment scanning
- **Validation**: Command and target validation

### 2.2 Approval Types

**File**: `packages/core/src/approvals/types.ts`

Defined comprehensive approval types:

- **ApprovalScope**: commit, push, open_pr, merge, deploy
- **ApprovalCommandAction**: approve, deny, revoke
- **ApprovalCommandSource**: pr_comment, issue_comment, review_comment, cli, api
- **ApproverIdentity**: type, id, displayName, email, githubUsername, organization
- **SignedApproval**: Complete immutable record with:
  - approvalId (UUID)
  - approver + approverRole
  - scopesApproved[]
  - target identifiers
  - intentHash + patchHash
  - Ed25519 signature
  - signingKeyId
  - Phase 23 telemetry correlation (traceId, requestId)
  - createdAt, expiresAt

### 2.3 Signature Module

**File**: `packages/core/src/approvals/signature.ts`

Implemented cryptographic signing:

- **Key Generation**: `generateSigningKeyPair()` using Ed25519
- **Payload Canonicalization**: Deterministic JSON serialization
- **Signing**: `signPayload()` with private key
- **Verification**: `verifyApprovalSignature()` with public key
- **Key Store**: Interface + InMemoryKeyStore implementation
- **Hash Functions**: `computeIntentHash()`, `computePatchHash()`

### 2.4 Policy Engine

**File**: `packages/core/src/policy/engine.ts`

Created deterministic policy engine:

- **PolicyEngine Class**: Register/evaluate policies
- **Priority-Based Evaluation**: critical > high > normal > low
- **Decision Types**: ALLOW, DENY, REQUIRE_MORE_APPROVALS
- **PolicyBuilder**: Fluent API for policy creation
- **Singleton Access**: `getPolicyEngine()`, `evaluatePolicy()`

### 2.5 Default Policies

**File**: `packages/core/src/policy/policies.ts`

Implemented 7 default policies:

1. **requireApprovalPolicy**: All executions require approval
2. **destructiveActionsOwnerPolicy**: Tenant delete/billing require OWNER
3. **protectedBranchPolicy**: Protected branches require 2 approvals
4. **productionDeployPolicy**: Production deploy requires ADMIN + business hours
5. **memberRemovalPolicy**: Member removal requires ADMIN
6. **largePatchReviewPolicy**: >500 line patches require review
7. **noSelfApprovalPolicy**: Self-approval prohibited

### 2.6 Execution Gate

**File**: `packages/core/src/policy/gate.ts`

Integrated policy into execution:

- **checkGate()**: Main entry point for policy checks
- **requirePolicyApproval()**: Guard function that throws on denial
- **PolicyDeniedError**: Custom error with markdown formatting
- **Audit Emission**: All decisions emit security audit events
- **Telemetry Correlation**: Attaches Phase 23 context

### 2.7 ARV Gate

**File**: `scripts/arv/approval-policy-gate.ts`

Created verification script with 8 checks:

1. Approval parser exists with command handling
2. Ed25519 signed approvals implemented
3. Policy engine with evaluatePolicy
4. Execution gate blocks without approval
5. Audit events emitted with telemetry
6. Default policies present
7. Approval types complete
8. Module exports correct

---

## 3. Files Changed

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/approvals/types.ts` | Approval type definitions |
| `packages/core/src/approvals/parser.ts` | Command parsing |
| `packages/core/src/approvals/signature.ts` | Ed25519 signing |
| `packages/core/src/approvals/index.ts` | Module exports |
| `packages/core/src/policy/types.ts` | Policy type definitions |
| `packages/core/src/policy/engine.ts` | Policy evaluation engine |
| `packages/core/src/policy/policies.ts` | Default policies |
| `packages/core/src/policy/gate.ts` | Execution gate |
| `packages/core/src/policy/index.ts` | Module exports |
| `scripts/arv/approval-policy-gate.ts` | ARV verification |
| `apps/cli/src/commands/approval.ts` | CLI approval commands |

### Modified Files

| File | Changes |
|------|---------|
| `packages/core/src/index.ts` | Added approvals + policy exports |
| `scripts/arv/run-all.ts` | Added approval policy gate |
| `apps/cli/src/index.ts` | Added approval command group |

### Test Files

| File | Tests |
|------|-------|
| `test/contracts/approval-policy.test.ts` | 34 tests covering parser, signatures, policies, gate |

---

## 4. Approval Flow Diagram

```
┌─────────────────┐
│  PR Comment     │
│  /gwi approve   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Parser         │
│  parseCommand() │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Signature      │
│  createSigned() │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Store          │
│  (append-only)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Policy Engine  │
│  evaluatePolicy │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌───────────────┐
│ ALLOW │ │ DENY/REQUIRE  │
└───┬───┘ └───────┬───────┘
    │             │
    ▼             ▼
┌───────────┐ ┌───────────────┐
│ Execute   │ │ Block + Audit │
└───────────┘ └───────────────┘
```

---

## 5. Policy Examples

### Example 1: Protected Branch

```typescript
const result = evaluatePolicy({
  action: 'pr.merge',
  resource: { type: 'pr', id: '123', isProtectedBranch: true },
  approvals: [singleApproval],
  // ...
});
// result.decision === 'REQUIRE_MORE_APPROVALS'
// (needs 2 approvals for protected branch)
```

### Example 2: Destructive Action

```typescript
const result = evaluatePolicy({
  action: 'tenant.delete',
  actor: { role: 'ADMIN' }, // Not OWNER
  // ...
});
// result.decision === 'DENY'
// (requires OWNER role)
```

### Example 3: Self-Approval

```typescript
const result = evaluatePolicy({
  action: 'candidate.execute',
  actor: { id: 'user-123' },
  approvals: [{ approver: { id: 'user-123' } }], // Same user
  // ...
});
// result.decision === 'REQUIRE_MORE_APPROVALS'
// (self-approval prohibited)
```

---

## 6. Verification Commands

```bash
# Build all packages
npm run build

# Run approval policy gate
npx tsx scripts/arv/approval-policy-gate.ts

# Type check
npm run typecheck
```

**Results:**
- Build: 12/12 packages successful
- Approval Policy Gate: 8/8 checks passed

---

## 7. Architecture Decisions

### 7.1 Ed25519 for Signatures

**Decision**: Use Ed25519 for approval signatures.

**Rationale**:
- Fast signature generation/verification
- Small key/signature sizes
- Strong security guarantees
- Native Node.js crypto support

### 7.2 Deterministic Policy Evaluation

**Decision**: Policies are pure functions with no side effects.

**Rationale**:
- Reproducible results
- Testable in isolation
- No hidden state
- Cacheable

### 7.3 Separate from Existing Approval System

**Decision**: Created new `approvals/` module separate from `capabilities/approval-verifier.ts`.

**Rationale**:
- Existing system is run-bundle focused
- New system adds signing, commands, policies
- Can migrate gradually
- No breaking changes

### 7.4 Policy Priority Ordering

**Decision**: Evaluate policies in priority order (critical → low).

**Rationale**:
- Critical policies (security) always checked first
- DENY at any point stops evaluation
- Efficient for common cases

---

## 8. What's Next

### 8.1 Remaining Phase 25 Items

1. ~~**CLI Commands**: `gwi approval approve`, `gwi approval deny`, `gwi approval list`~~ ✓ DONE
2. ~~**Unit Tests**: Parser, signature, policy evaluation~~ ✓ DONE (34 tests)
3. **Golden Tests**: Multi-approval scenarios (P2)
4. **E2E Test**: Full candidate → approval → execution flow (P2)

### 8.2 CLI Commands Implemented

```bash
# Approve a target with Ed25519 signed approval
gwi approval approve <target> --scopes commit,push

# Deny with required reason
gwi approval deny <target> --reason "needs more review"

# Revoke existing approval
gwi approval revoke <target>

# List approvals for target
gwi approval list <target>

# Check policy evaluation
gwi approval check <target> --action candidate.execute
```

Target formats: `run-<id>`, `candidate-<id>`, `pr-<number>`, or raw UUID.

### 8.3 Future Enhancements (P2)

1. **Approval Store**: Firestore-backed approval persistence
2. **Webhook Integration**: Parse commands from GitHub webhook events
3. **Key Rotation**: Automatic signing key rotation
4. **Policy Versioning**: Track policy changes over time

---

## 9. Lessons Learned

### 9.1 Export Naming Conflicts

**Issue**: Many type names conflicted with existing exports (PolicyDecision, ApprovalScope, etc.)

**Resolution**: Used prefixed exports (Phase25PolicyDecision, Phase25ApprovalScope)

**Lesson**: Consider export namespacing early when building large modules.

### 9.2 Policy Composition

**Issue**: Needed way to build policies without boilerplate.

**Resolution**: Created PolicyBuilder with fluent API.

**Lesson**: Builder patterns help for complex object construction.

---

## 10. Metrics

| Metric | Value |
|--------|-------|
| Files Created | 10 |
| Files Modified | 2 |
| Lines of Code | ~1,800 |
| ARV Checks | 8 |
| Default Policies | 7 |
| Approval Scopes | 5 |
| Build Time | ~22s |

---

## 11. References

- [Phase 24 AAR](096-AA-AACR-phase-24-security-compliance-hardening.md)
- [Approvals Module](../packages/core/src/approvals/)
- [Policy Module](../packages/core/src/policy/)

---

*Phase 25 Core Complete. Approval Commands + Policy-as-Code Enforcement implemented.*
*CLI commands and tests deferred to follow-up.*

---

intent solutions io — confidential IP
Contact: jeremy@intentsolutions.io
