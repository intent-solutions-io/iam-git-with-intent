# 095-DR-TMOD: Git With Intent Threat Model

**Document ID**: 095-DR-TMOD-gwi-threat-model
**Version**: 1.0
**Created**: 2025-12-17T16:45:00-06:00
**Phase**: 24 (Security & Compliance Hardening)
**Author**: Claude Code (Phase 24)

---

## 1. Executive Summary

This document provides a threat model for Git With Intent (GWI), an AI-powered multi-agent PR assistant. GWI processes GitHub issues and pull requests, generates code changes, and can push changes to repositories on behalf of users. This makes security a critical concern.

**Risk Rating**: HIGH
- Handles third-party credentials (GitHub tokens)
- Executes AI-generated code changes
- Multi-tenant SaaS with shared infrastructure

---

## 2. System Overview

### 2.1 Architecture Components

```
                                 +-----------------+
                                 |  GitHub API     |
                                 +--------+--------+
                                          |
                                          v
+-------------+    +--------+    +--------+--------+    +---------+
|  Web UI     |--->|  API   |--->|  Engine         |--->| Agents  |
| (Firebase)  |    | (Cloud |    | (Orchestrator)  |    | (Claude)|
+-------------+    |  Run)  |    +-----------------+    +---------+
                   +----+---+
                        |
              +---------+---------+
              v                   v
       +-----------+       +------------+
       | Firestore |       | Stripe API |
       +-----------+       +------------+
```

### 2.2 Data Flows

1. **Authentication**: Firebase Auth -> API -> Firestore (user sessions)
2. **Tenant Data**: API <-> Firestore (multi-tenant isolation)
3. **GitHub Integration**: API -> GitHub App -> GitHub API
4. **AI Processing**: Engine -> Anthropic/Google AI APIs
5. **Payments**: API -> Stripe (webhooks, checkout)
6. **Webhooks**: GitHub -> Webhook Handler -> Engine

---

## 3. Asset Inventory

### 3.1 Critical Assets

| Asset | Sensitivity | Location |
|-------|-------------|----------|
| GitHub Installation Tokens | CRITICAL | GCP Secret Manager |
| Stripe API Keys | CRITICAL | GCP Secret Manager |
| Anthropic/Google AI Keys | CRITICAL | GCP Secret Manager |
| User OAuth Tokens | HIGH | Firestore (encrypted) |
| Tenant Configuration | MEDIUM | Firestore |
| Run History/Logs | MEDIUM | Firestore |
| Audit Events | HIGH | Firestore |

### 3.2 Trust Boundaries

1. **Internet <-> Cloud Run**: TLS termination, rate limiting
2. **Cloud Run <-> Firestore**: Service account identity
3. **Cloud Run <-> External APIs**: HTTPS, API key auth
4. **GitHub <-> Webhook Handler**: Signature verification

---

## 4. Threat Analysis (STRIDE)

### 4.1 Spoofing

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| T1: Forged webhook requests | HIGH | MEDIUM | HMAC signature verification (implemented) |
| T2: Firebase token forgery | CRITICAL | LOW | Firebase Auth token validation |
| T3: Service account impersonation | CRITICAL | LOW | Workload Identity Federation |
| T4: Tenant ID spoofing | HIGH | MEDIUM | Membership verification middleware |

### 4.2 Tampering

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| T5: Modified webhook payload | HIGH | MEDIUM | HMAC signature verification |
| T6: Firestore data modification | CRITICAL | LOW | Firestore security rules, RBAC |
| T7: Log tampering | HIGH | LOW | Append-only audit log, separate collection |
| T8: Configuration injection | HIGH | MEDIUM | Input validation, schema enforcement |

### 4.3 Repudiation

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| T9: Denial of code changes | MEDIUM | MEDIUM | Git commit attribution, audit logs |
| T10: Denial of approval actions | HIGH | MEDIUM | Security audit trail with actor ID |
| T11: Denial of billing actions | HIGH | LOW | Stripe audit logs, internal audit |

### 4.4 Information Disclosure

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| T12: Secret leakage in logs | CRITICAL | MEDIUM | Secret scanning, redaction (Phase 24) |
| T13: Cross-tenant data access | CRITICAL | MEDIUM | Tenant isolation, RBAC middleware |
| T14: API key exposure | CRITICAL | LOW | Secret Manager, env isolation |
| T15: Error message information leak | MEDIUM | HIGH | Generic error responses |

### 4.5 Denial of Service

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| T16: API rate exhaustion | HIGH | HIGH | Rate limiting (in-memory, TODO: Redis) |
| T17: LLM cost amplification | CRITICAL | MEDIUM | Plan limits, concurrent run limits |
| T18: Firestore quota exhaustion | HIGH | MEDIUM | Request throttling, quotas |
| T19: GitHub API rate exhaustion | HIGH | MEDIUM | Rate limit tracking, backoff |

### 4.6 Elevation of Privilege

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| T20: VIEWER -> DEVELOPER escalation | HIGH | MEDIUM | RBAC enforcement middleware |
| T21: Cross-tenant admin access | CRITICAL | LOW | Tenant membership verification |
| T22: Service account abuse | CRITICAL | LOW | Minimal service account permissions |
| T23: GitHub App permission creep | HIGH | LOW | Minimal permission scopes |

---

## 5. Attack Scenarios

### 5.1 Scenario A: Malicious Webhook Injection

**Attack Path**:
1. Attacker discovers webhook endpoint URL
2. Attacker crafts fake GitHub webhook event
3. Attacker attempts to trigger unauthorized run

**Mitigations**:
- HMAC-SHA256 signature verification
- Webhook secret in Secret Manager
- Audit log of all webhook events
- Delivery ID tracking

**Residual Risk**: LOW (signature verification is robust)

### 5.2 Scenario B: Tenant Data Breach

**Attack Path**:
1. Attacker compromises user credentials
2. Attacker accesses API with valid token
3. Attacker attempts to access other tenants' data

**Mitigations**:
- Firebase Auth token validation
- Tenant membership verification on every request
- RBAC role checks for sensitive operations
- Audit logging of cross-tenant access attempts

**Residual Risk**: LOW-MEDIUM (depends on auth token security)

### 5.3 Scenario C: Secret Leakage via AI Output

**Attack Path**:
1. Malicious prompt injection in issue/PR
2. AI agent extracts secrets from environment
3. Secrets appear in generated code/comments

**Mitigations**:
- Secret scanning on all outputs
- Redaction patterns for known secret formats
- assertNoSecrets() guardrail before storage
- AI prompt hardening (TODO)

**Residual Risk**: MEDIUM (AI outputs are difficult to fully sanitize)

### 5.4 Scenario D: Cost Amplification Attack

**Attack Path**:
1. Attacker creates account on free plan
2. Attacker triggers many expensive LLM operations
3. Operator incurs significant AI API costs

**Mitigations**:
- Plan-based run limits
- Concurrent run limits
- Rate limiting per user/IP
- High-risk action audit trail

**Residual Risk**: MEDIUM (sophisticated attacks may evade limits)

---

## 6. Security Controls Summary

### 6.1 Authentication & Authorization

| Control | Status | Location |
|---------|--------|----------|
| Firebase Auth integration | IMPLEMENTED | apps/api |
| RBAC middleware | IMPLEMENTED | packages/core/security/rbac.ts |
| Tenant isolation | IMPLEMENTED | API middleware |
| Service account identity | IMPLEMENTED | Workload Identity Federation |

### 6.2 Data Protection

| Control | Status | Location |
|---------|--------|----------|
| TLS in transit | IMPLEMENTED | Cloud Run default |
| Firestore encryption at rest | IMPLEMENTED | GCP default |
| Secret Manager for credentials | IMPLEMENTED | infra/terraform |
| Secret scanning | IMPLEMENTED | packages/core/security/secrets.ts |
| Log redaction | IMPLEMENTED | packages/core/security/secrets.ts |

### 6.3 Monitoring & Audit

| Control | Status | Location |
|---------|--------|----------|
| Security audit events | IMPLEMENTED | packages/core/security/audit |
| Telemetry correlation | IMPLEMENTED | packages/core/telemetry |
| Structured logging | IMPLEMENTED | All services |
| High-risk action tracking | IMPLEMENTED | RBAC module |

### 6.4 Input Validation

| Control | Status | Location |
|---------|--------|----------|
| Zod schema validation | IMPLEMENTED | API endpoints |
| Webhook signature verification | IMPLEMENTED | packages/core/security |
| Rate limiting | IMPLEMENTED | API middleware |

---

## 7. Risk Register

| ID | Risk | Severity | Likelihood | Status | Owner |
|----|------|----------|------------|--------|-------|
| R1 | Secret leakage in logs | HIGH | MEDIUM | MITIGATED | Platform |
| R2 | Cross-tenant data access | CRITICAL | LOW | MITIGATED | Platform |
| R3 | Webhook spoofing | HIGH | LOW | MITIGATED | Platform |
| R4 | LLM cost amplification | HIGH | MEDIUM | PARTIALLY | Platform |
| R5 | AI output injection | MEDIUM | MEDIUM | PARTIAL | Platform |
| R6 | GitHub token theft | CRITICAL | LOW | MITIGATED | Platform |
| R7 | Audit log gaps | MEDIUM | MEDIUM | ADDRESSED | Platform |

---

## 8. Recommendations

### 8.1 High Priority (P1)

1. **Implement Redis-based rate limiting** - Current in-memory rate limiting doesn't scale across Cloud Run instances
2. **Add AI output sanitization** - Specific patterns for preventing prompt injection leakage
3. **Implement request signing** - Sign internal service-to-service calls

### 8.2 Medium Priority (P2)

1. **Add WAF rules** - Cloud Armor policies for common attack patterns
2. **Implement IP allowlisting** - For enterprise tenants with known IP ranges
3. **Add anomaly detection** - Alert on unusual access patterns

### 8.3 Low Priority (P3)

1. **Implement SOC2 compliance logging** - Enhanced audit format
2. **Add SIEM integration** - Export audit events to security tools
3. **Conduct penetration testing** - Third-party security assessment

---

## 9. Compliance Considerations

### 9.1 Applicable Standards

- **SOC2 Type II**: Audit logging, access controls, encryption
- **GDPR**: Data subject rights, data processing agreements
- **GitHub Marketplace Requirements**: Security review, OAuth best practices

### 9.2 Compliance Gaps

| Requirement | Current Status | Gap |
|-------------|----------------|-----|
| SOC2 audit trail | Implemented | Needs retention policy |
| GDPR data export | Not implemented | User data export endpoint |
| Data deletion | Partial | Cascade delete for all user data |

---

## 10. Review Schedule

- **Quarterly**: Review threat model against new features
- **Annually**: Full security assessment
- **On-demand**: After security incidents or major changes

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-17 | Claude Code | Initial threat model |

---

*This document is part of Phase 24: Security & Compliance Hardening*
