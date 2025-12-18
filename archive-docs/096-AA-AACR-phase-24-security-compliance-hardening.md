# 096-AA-AACR: Phase 24 - Security & Compliance Hardening

**Document ID**: 096-AA-AACR-phase-24-security-compliance-hardening
**Phase**: 24
**Date**: 2025-12-17 16:55 CST (America/Chicago)
**Author**: Claude Code (Opus 4.5)

---

## Metadata (Required)

| Field | Value |
|-------|-------|
| Beads (Epic) | `git-with-intent-sec24` |
| Beads (Tasks) | `git-with-intent-sec24.1` (RBAC), `.2` (Audit), `.3` (Secrets), `.4` (Threat Model), `.5` (ARV Gate) |
| AgentFS | Agent ID: `gwi`, Mount: `.agentfs/`, DB: `.agentfs/gwi.db` |
| AgentFS Evidence | Turso sync: `libsql://gwi-agentfs-jeremylongshore.aws-us-east-1.turso.io` |
| Related Issues/PRs | N/A |
| Commit(s) | uncommitted - Phase 24 implementation |

---

## 1. Summary

Phase 24 implemented security and compliance hardening for Git With Intent:

- **RBAC Hardening**: Centralized role-based access control with middleware
- **Audit Logging**: Append-only security audit events with telemetry correlation
- **Secrets Posture**: Secret scanning, redaction, and guardrails
- **Threat Model**: STRIDE-based threat analysis document
- **ARV Gate**: Security verification script

All DoD criteria met. Build passes. Security gate passes.

---

## 2. What Was Done

### 2.1 RBAC Enforcement Module

**File**: `packages/core/src/security/rbac.ts`

Created centralized RBAC enforcement with:

- **Role Types**: `RBACRole` type with VIEWER, DEVELOPER, ADMIN, OWNER hierarchy
- **Action Types**: `RBACAction` type covering tenant, member, repo, run, settings, billing actions
- **Permission Matrix**: `RBAC_PERMISSIONS` mapping actions to allowed roles
- **Context Type**: `RBACContext` with tenant, user, role, and request metadata
- **Check Functions**:
  - `hasMinimumRBACRole()` - Role hierarchy comparison
  - `canPerformRBAC()` - Permission check with context
  - `requireRole()` - Throws on insufficient role
  - `requirePermission()` - Throws on insufficient permission
  - `requireTenant()` - Validates tenant membership
  - `requireTenantPermission()` - Combined tenant + permission check
- **Express Middleware**:
  - `expressRequireAuth()` - Require authenticated user
  - `expressRequireRole()` - Require minimum role
  - `expressRequirePermission()` - Require specific permission
- **High-Risk Actions**:
  - `HIGH_RISK_ACTIONS` array with billing, delete, member management
  - `isHighRiskAction()` - Check if action is high-risk
  - `enforceHighRiskAction()` - Enhanced enforcement with logging

**Integration**: Phase 23 telemetry context automatically attached to all RBAC checks.

### 2.2 Security Audit Logging

**Directory**: `packages/core/src/security/audit/`

Created append-only security audit trail:

**types.ts**:
- `SecurityAuditEventType` - 40+ event types covering auth, RBAC, webhooks, queue, candidates, git ops, connectors, registry, plan limits
- `SecurityAuditActor` - Actor with type, id, email, IP, user agent
- `SecurityAuditEvent` - Full event with Phase 23 correlation fields (traceId, spanId, requestId, runId, workItemId, candidateId)
- Event factory functions for each category

**store.ts**:
- `SecurityAuditStore` interface - append-only event storage
- `InMemorySecurityAuditStore` - Testing/development implementation
- Query options with filters and pagination

**firestore-store.ts**:
- `FirestoreSecurityAuditStore` - Production implementation
- Collection: `gwi_security_audit`
- Indexed fields for tenant, event type, outcome, actor, trace, run
- `getSecurityAuditStore()` - Environment-aware singleton

**emitter.ts**:
- `emitAuditEvent()` - Main emission function with automatic telemetry context
- Convenience emitters:
  - `emitRBACEvent()` - RBAC checks
  - `emitWebhookVerifyEvent()` - Webhook verification
  - `emitQueueJobEvent()` - Queue operations
  - `emitCandidateEvent()` - Candidate lifecycle
  - `emitGitOperationEvent()` - Git operations (high-risk)
  - `emitConnectorEvent()` - Connector lifecycle
  - `emitRegistryEvent()` - Registry operations
  - `emitPlanLimitEvent()` - Plan limit checks

### 2.3 Secrets Posture

**File**: `packages/core/src/security/secrets.ts`

Created comprehensive secrets handling:

**Secret Patterns** (18 patterns):
- AI APIs: Anthropic, OpenAI, Google
- GitHub: PAT, OAuth, App tokens, refresh tokens
- Stripe: Live/test keys, webhook secrets
- Slack: Bot/user tokens, webhooks
- AWS: Access keys, secret keys
- GCP: Service accounts, OAuth secrets
- Generic: Private keys, JWTs, database URLs

**Scanning Functions**:
- `scanForSecrets()` - Scan text for secret patterns
- `scanObjectForSecrets()` - Deep scan of objects
- Returns severity (critical/high/medium) and findings

**Redaction Functions**:
- `redactSecret()` - Redact with prefix/suffix visible
- `redactObjectSecrets()` - Deep object redaction
- `redactStringSecrets()` - String-level redaction

**Guardrails**:
- `SecretLeakageError` - Custom error type
- `assertNoSecrets()` - Throws if secrets detected
- `withRedactedSecrets()` - Safe wrapper for callbacks

**Utilities**:
- `safeStringify()` - JSON stringify with redaction
- `getSafeEnvVars()` - Environment variables for logging
- `SENSITIVE_ENV_VARS` - Known sensitive variable names

### 2.4 Threat Model Document

**File**: `000-docs/095-DR-TMOD-gwi-threat-model.md`

Created comprehensive STRIDE threat model:

- **System Overview**: Architecture diagram, data flows
- **Asset Inventory**: Critical assets with sensitivity ratings
- **Trust Boundaries**: Internet, Cloud Run, Firestore, External APIs
- **STRIDE Analysis**: 23 threats across 6 categories with mitigations
- **Attack Scenarios**: 4 detailed attack paths with residual risk
- **Security Controls Summary**: Authentication, data protection, monitoring, validation
- **Risk Register**: 7 identified risks with status
- **Recommendations**: P1/P2/P3 prioritized improvements
- **Compliance Considerations**: SOC2, GDPR, GitHub Marketplace

### 2.5 ARV Security Gate

**File**: `scripts/arv/security-gate.ts`

Created verification script with 6 checks:

1. **RBAC Module**: Verifies exports exist
2. **Audit Module**: Verifies exports and telemetry correlation
3. **Secrets Module**: Verifies scanning and redaction exports
4. **No Hardcoded Secrets**: Scans codebase for secret patterns
5. **Threat Model**: Verifies document exists with required sections
6. **Security Exports**: Verifies index re-exports all modules

Added to `run-all.ts` for CI integration.

---

## 3. Files Changed

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/security/rbac.ts` | RBAC enforcement module |
| `packages/core/src/security/secrets.ts` | Secret scanning and redaction |
| `packages/core/src/security/audit/types.ts` | Audit event types |
| `packages/core/src/security/audit/store.ts` | Audit store interface |
| `packages/core/src/security/audit/firestore-store.ts` | Firestore implementation |
| `packages/core/src/security/audit/emitter.ts` | Event emission with telemetry |
| `packages/core/src/security/audit/index.ts` | Audit module exports |
| `000-docs/095-DR-TMOD-gwi-threat-model.md` | Threat model document |
| `scripts/arv/security-gate.ts` | ARV security verification |

### Modified Files

| File | Changes |
|------|---------|
| `packages/core/src/security/index.ts` | Added RBAC, audit, secrets exports |
| `scripts/arv/run-all.ts` | Added security gate to checks |

---

## 4. Architecture Decisions

### 4.1 Separate Security Audit from Operational Audit

**Decision**: Created `SecurityAuditStore` separate from existing `AuditStore`.

**Rationale**:
- Existing `AuditStore` is run-centric (operational events)
- Security events span all operations, not just runs
- Different retention and access requirements
- Security events need Phase 23 telemetry correlation

### 4.2 Append-Only Audit Design

**Decision**: Security audit events cannot be modified or deleted via API.

**Rationale**:
- Compliance requirement for audit trails
- Prevents tampering with security evidence
- Administrative deletion only via Firestore console (with separate audit)

### 4.3 Non-Blocking Emission

**Decision**: `emitAuditEvent()` catches errors and returns synthetic event on failure.

**Rationale**:
- Audit logging should never block user operations
- Better to have incomplete audit than failed requests
- Errors are logged for operational visibility

### 4.4 Secret Pattern Approach

**Decision**: Regex-based pattern matching for secrets.

**Rationale**:
- Known patterns for major providers (GitHub, Stripe, AWS, etc.)
- Fast execution (no external services)
- False positives better than false negatives for security
- Can be extended as new patterns emerge

---

## 5. Verification Commands

```bash
# Build all packages
npm run build

# Run security gate
npx tsx scripts/arv/security-gate.ts

# Type check
npm run typecheck

# Verify exports
node -e "const s = require('@gwi/core').scanForSecrets; console.log(typeof s)"
```

**All commands pass.**

---

## 6. What's Next

### 6.1 Immediate (P1)

1. **Wire audit emitters into API**: Call `emitAuditEvent()` at key points
2. **Wire emitters into webhook handler**: Log verification events
3. **Add Redis rate limiting**: Replace in-memory rate limiter

### 6.2 Short-term (P2)

1. **AI output sanitization**: Specific patterns for prompt injection
2. **Request signing**: Internal service-to-service calls
3. **WAF rules**: Cloud Armor policies

### 6.3 Medium-term (P3)

1. **SOC2 compliance logging**: Enhanced audit format
2. **SIEM integration**: Export to security tools
3. **Penetration testing**: Third-party assessment

---

## 7. Lessons Learned

### 7.1 Type Naming Conflicts

**Issue**: `AuditActor` type conflicted with existing type in run-bundle.
**Resolution**: Renamed to `SecurityAuditActor` for clarity.
**Lesson**: Prefix domain-specific types to avoid collisions.

### 7.2 Telemetry Integration

**Issue**: Needed to attach Phase 23 context to security events.
**Resolution**: Import `getCurrentContext()` from telemetry module.
**Lesson**: Design modules to consume shared context from the start.

### 7.3 Pattern Testing

**Issue**: Regex patterns can match in pattern definition code.
**Resolution**: Skip matches in comments and test files.
**Lesson**: Secret scanning needs code-awareness.

---

## 8. Metrics

| Metric | Value |
|--------|-------|
| Files Created | 9 |
| Files Modified | 2 |
| Lines of Code | ~1,500 |
| Security Checks | 6 |
| Secret Patterns | 18 |
| Audit Event Types | 40+ |
| Build Time | ~23s |

---

## 9. References

- [Phase 23 AAR](094-AA-AACR-phase-23-production-observability.md)
- [Threat Model](095-DR-TMOD-gwi-threat-model.md)
- [RBAC Module](../packages/core/src/security/rbac.ts)
- [Audit Module](../packages/core/src/security/audit/)
- [Secrets Module](../packages/core/src/security/secrets.ts)

---

*Phase 24 Complete. Security & Compliance Hardening implemented.*

---

intent solutions io — confidential IP
Contact: jeremy@intentsolutions.io
