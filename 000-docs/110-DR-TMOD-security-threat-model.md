# Security Threat Model

> **Document**: 110-DR-TMOD-security-threat-model.md
> **Created**: 2025-12-18 02:15 CST
> **Phase**: 32 (GA Readiness)
> **Status**: Living document - update as threats evolve

## 1. System Overview

Git With Intent (GWI) is a multi-agent AI system that automates PR workflows:
- Reads GitHub issues and PRs
- Generates code changes via AI agents
- Runs validation (tests, linting)
- Produces review summaries

### 1.1 Trust Boundaries

```
                    ┌──────────────────────────────────────────────┐
                    │             GCP PROJECT                      │
                    │  ┌─────────────┐     ┌──────────────────┐   │
 GitHub ─────────────► │ Cloud Run   │────►│ Vertex AI        │   │
 (Webhooks)          │ │ (Gateway)   │     │ Agent Engine     │   │
                    │  └─────────────┘     └──────────────────┘   │
                    │         │                    │               │
                    │         ▼                    ▼               │
                    │  ┌─────────────┐     ┌──────────────────┐   │
                    │  │ Firestore   │     │ Secret Manager   │   │
                    │  │ (Data)      │     │ (Keys)           │   │
                    │  └─────────────┘     └──────────────────┘   │
                    └──────────────────────────────────────────────┘
```

**Trust Boundaries**:
1. Internet → Cloud Run (untrusted → controlled)
2. Cloud Run → Firestore (service account authenticated)
3. Cloud Run → Agent Engine (internal GCP, authenticated)
4. Agent Engine → GitHub API (authenticated via installation token)

## 2. Assets

| Asset | Classification | Location |
|-------|----------------|----------|
| GitHub App private key | SECRET | Secret Manager |
| Webhook secrets | SECRET | Secret Manager |
| User OAuth tokens | SECRET | Encrypted in Firestore |
| Tenant configuration | SENSITIVE | Firestore |
| Run artifacts | SENSITIVE | Firestore |
| AI prompts | INTERNAL | Source code |
| Billing data | SENSITIVE | Stripe + Firestore |

## 3. Threat Categories (STRIDE)

### 3.1 Spoofing

| Threat | Mitigation | Status |
|--------|-----------|--------|
| Webhook spoofing | GitHub signature validation (HMAC-SHA256) | Implemented |
| User impersonation | Firebase Auth + OAuth | Implemented |
| Service account impersonation | Workload Identity Federation | Implemented |

### 3.2 Tampering

| Threat | Mitigation | Status |
|--------|-----------|--------|
| Code injection via PR | AI agents use sandboxed execution | Implemented |
| Audit log manipulation | Append-only audit logs, immutable | Implemented |
| Config tampering | Firestore security rules + RBAC | Implemented |

### 3.3 Repudiation

| Threat | Mitigation | Status |
|--------|-----------|--------|
| Denied actions | Audit logging with correlation IDs | Implemented |
| Who triggered run | Full trace in run artifacts | Implemented |

### 3.4 Information Disclosure

| Threat | Mitigation | Status |
|--------|-----------|--------|
| Secrets in logs | Secret redaction middleware | Implemented |
| Hardcoded secrets | Secret scanning in ARV | Implemented |
| Data breach | Encryption at rest (Firestore default) | Default |

### 3.5 Denial of Service

| Threat | Mitigation | Status |
|--------|-----------|--------|
| API abuse | Rate limiting (tenant-scoped) | Implemented |
| Webhook flood | Rate limiting + circuit breaker | Implemented |
| Resource exhaustion | Plan limits, quota enforcement | Implemented |

### 3.6 Elevation of Privilege

| Threat | Mitigation | Status |
|--------|-----------|--------|
| Self role elevation | Firestore rules prevent | Implemented |
| Cross-tenant access | Tenant isolation in queries | Implemented |
| Agent breakout | Vertex AI sandboxing | Platform |

## 4. Attack Surfaces

### 4.1 GitHub Webhook Endpoint

**Exposure**: Public internet
**Protections**:
- Signature validation (X-Hub-Signature-256)
- Rate limiting
- Payload size limits
- Input validation

### 4.2 API Gateway

**Exposure**: Public internet (authenticated)
**Protections**:
- Firebase Auth required
- RBAC enforcement
- Rate limiting per tenant
- Request validation (Zod schemas)

### 4.3 AI Agents

**Exposure**: Internal (Agent Engine)
**Protections**:
- Sandboxed execution
- No direct internet access from agents
- Tool schemas validated
- Approval gates for destructive operations

## 5. Security Controls

### 5.1 Authentication

- **Users**: Firebase Auth (Google OAuth, email/password)
- **Services**: Workload Identity Federation (no keys)
- **GitHub**: Installation tokens (short-lived)

### 5.2 Authorization

- **RBAC Roles**: owner, admin, developer, viewer
- **Firestore Rules**: Enforce access at data layer
- **API Middleware**: Role checks on all endpoints

### 5.3 Secrets Management

- **Storage**: Google Secret Manager
- **Rotation**: Manual (documented in playbook)
- **Access**: Least privilege IAM

### 5.4 Logging & Monitoring

- **Audit Events**: All mutations logged
- **Correlation IDs**: Request tracing
- **Alerts**: Error rate, latency thresholds

## 6. Risk Assessment

| Risk | Likelihood | Impact | Score | Mitigation |
|------|------------|--------|-------|------------|
| Webhook spoofing | Low | High | MEDIUM | Signature validation |
| API key compromise | Low | Critical | HIGH | Secret Manager + rotation |
| Cross-tenant data leak | Very Low | Critical | MEDIUM | Firestore rules + testing |
| AI prompt injection | Medium | Medium | MEDIUM | Input validation + sandboxing |
| DoS via abuse | Medium | Medium | MEDIUM | Rate limiting + circuit breaker |
| Credential stuffing | Low | High | MEDIUM | Firebase Auth + lockout |

**Risk Scoring**: Likelihood x Impact
- **HIGH**: Immediate attention required
- **MEDIUM**: Monitored, mitigations in place
- **LOW**: Acceptable with current controls

## 7. Compliance Considerations

| Framework | Relevant Controls | Status |
|-----------|------------------|--------|
| OWASP Top 10 | All | Reviewed |
| SOC 2 Type II | Future consideration | Planned |
| GDPR | Data handling | Planned |

## 7. Security Review Checklist

Pre-release security verification:

- [x] No hardcoded secrets (ARV scan)
- [x] All endpoints require authentication
- [x] RBAC enforced in Firestore rules
- [x] Rate limiting enabled
- [x] Webhook signatures validated
- [x] Audit logging active
- [x] Secret Manager for all secrets
- [x] WIF for GitHub Actions (no keys)
- [x] Input validation on all endpoints
- [ ] Penetration test (future)
- [ ] Security audit by third party (future)

## 8. Incident Response

See: `109-AA-AUDT-appaudit-devops-playbook.md` Section 5

1. Detect (alerts, reports)
2. Contain (disable affected service)
3. Investigate (audit logs, traces)
4. Remediate (patch, rotate keys)
5. Document (incident report)

## 9. Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-12-18 | Claude Code | Initial threat model for GA |
