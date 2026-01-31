# Security Threat Model

**Document ID**: 110-DR-TMOD
**Version**: 1.0.0
**Last Updated**: 2026-01-31
**Author**: Jeremy Longshore
**Status**: ACTIVE

---

## Executive Summary

This document defines the security threat model for Git With Intent (gwi), an AI-powered CLI and platform for PR automation, semantic merge conflict resolution, and issue-to-code generation.

## System Overview

### Components

| Component | Type | Exposure |
|-----------|------|----------|
| CLI (`gwi`) | Local binary | User machine |
| API (`apps/api`) | Cloud Run service | Internet-facing |
| Gateway (`apps/gateway`) | Cloud Run service | Internet-facing |
| Worker (`apps/worker`) | Cloud Run service | Internal only |
| Web Dashboard (`apps/web`) | Firebase Hosting | Internet-facing |
| Firestore | Database | Internal only |

### Data Classification

| Data Type | Classification | Storage |
|-----------|---------------|---------|
| Source code (repos) | Confidential | Transient (not stored) |
| GitHub tokens | Secret | Firestore (encrypted) |
| API keys | Secret | Secret Manager |
| User profiles | PII | Firestore |
| Run artifacts | Confidential | Firestore + GCS |
| Audit logs | Internal | Cloud Logging |

---

## STRIDE Analysis

This threat model uses the STRIDE methodology to categorize threats:

| Category | Description | Primary Concern |
|----------|-------------|-----------------|
| **S**poofing | Impersonating a user or system | Authentication |
| **T**ampering | Modifying data or code | Integrity |
| **R**epudiation | Denying actions | Audit |
| **I**nformation Disclosure | Exposing data | Confidentiality |
| **D**enial of Service | Disrupting availability | Availability |
| **E**levation of Privilege | Gaining unauthorized access | Authorization |

---

## Attack Surface

### External Attack Vectors

| Vector | Entry Point | Risk Level |
|--------|-------------|------------|
| Web UI | Firebase Hosting | Medium |
| API | Gateway Cloud Run | High |
| GitHub Webhooks | Webhook handler | Medium |
| CLI | User machine | Low |

### Internal Attack Vectors

| Vector | Entry Point | Risk Level |
|--------|-------------|------------|
| Firestore | Database queries | Low (tenant-isolated) |
| Cloud Functions | Event handlers | Low (internal only) |
| Pub/Sub | Message queue | Low (signed messages) |

---

## Risk Assessment

### Risk Matrix

| Impact ↓ / Likelihood → | Unlikely | Possible | Likely |
|------------------------|----------|----------|--------|
| **Critical** | Medium | High | Critical |
| **High** | Low | Medium | High |
| **Medium** | Low | Low | Medium |
| **Low** | Negligible | Low | Low |

### Top Risks

| Rank | Risk | Likelihood | Impact | Overall | Mitigation Status |
|------|------|------------|--------|---------|-------------------|
| 1 | Token theft via XSS | Possible | High | High | ✅ Mitigated |
| 2 | Privilege escalation | Unlikely | Critical | Medium | ✅ Mitigated |
| 3 | Supply chain compromise | Unlikely | Critical | Medium | ✅ Mitigated |
| 4 | Prompt injection | Possible | Medium | Medium | ✅ Mitigated |
| 5 | Data exfiltration | Unlikely | High | Low | ✅ Mitigated |

---

## Threat Categories

### T1: Authentication & Authorization

| ID | Threat | Impact | Mitigation | Status |
|----|--------|--------|------------|--------|
| T1.1 | Token theft via XSS | High | CSP headers, HttpOnly cookies | ✅ Implemented |
| T1.2 | Privilege escalation | Critical | RBAC with tenant isolation | ✅ Implemented |
| T1.3 | Session hijacking | High | Short-lived tokens, rotation | ✅ Implemented |
| T1.4 | Weak authentication | Medium | Firebase Auth with MFA option | ✅ Implemented |

### T2: Injection Attacks

| ID | Threat | Impact | Mitigation | Status |
|----|--------|--------|------------|--------|
| T2.1 | Command injection | Critical | No shell execution of user input | ✅ Implemented |
| T2.2 | Prompt injection | High | Input sanitization, output validation | ✅ Implemented |
| T2.3 | SQL injection | High | Firestore (NoSQL), parameterized queries | ✅ Implemented |
| T2.4 | XSS | High | React auto-escaping, CSP | ✅ Implemented |

### T3: Data Security

| ID | Threat | Impact | Mitigation | Status |
|----|--------|--------|------------|--------|
| T3.1 | Secrets in code | Critical | Pre-commit scanning, ARV gates | ✅ Implemented |
| T3.2 | Data exfiltration | High | Egress controls, audit logging | ✅ Implemented |
| T3.3 | Insecure storage | High | Encryption at rest (GCP default) | ✅ Implemented |
| T3.4 | PII exposure | Medium | Data minimization, redaction | ✅ Implemented |

### T4: API Security

| ID | Threat | Impact | Mitigation | Status |
|----|--------|--------|------------|--------|
| T4.1 | Rate limiting bypass | Medium | Cloud Armor, per-tenant limits | ✅ Implemented |
| T4.2 | API abuse | Medium | Usage metering, quotas | ✅ Implemented |
| T4.3 | Broken object-level auth | High | Tenant isolation in all queries | ✅ Implemented |
| T4.4 | Mass assignment | Medium | Zod schema validation | ✅ Implemented |

### T5: Supply Chain

| ID | Threat | Impact | Mitigation | Status |
|----|--------|--------|------------|--------|
| T5.1 | Malicious dependencies | Critical | npm audit, Dependabot | ✅ Implemented |
| T5.2 | Typosquatting | High | Lockfile pinning | ✅ Implemented |
| T5.3 | Compromised CI/CD | Critical | WIF (no long-lived keys), signed commits | ✅ Implemented |
| T5.4 | Container vulnerabilities | Medium | Distroless base images | ✅ Implemented |

### T6: AI-Specific Threats

| ID | Threat | Impact | Mitigation | Status |
|----|--------|--------|------------|--------|
| T6.1 | Model poisoning | Medium | Vendor models only (Anthropic, Google) | ✅ Mitigated |
| T6.2 | Prompt leakage | Low | System prompts not exposed | ✅ Implemented |
| T6.3 | Output manipulation | Medium | Human approval gates | ✅ Implemented |
| T6.4 | Jailbreaking | Medium | Structured outputs, validation | ✅ Implemented |

---

## Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                    INTERNET (Untrusted)                     │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Cloud Armor     │  ← Rate limiting, WAF
                    └─────────┬─────────┘
                              │
┌─────────────────────────────▼─────────────────────────────────┐
│                     GCP PROJECT (Trusted)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │   Gateway    │  │     API      │  │   Firebase Hosting   │ │
│  │  (Cloud Run) │  │  (Cloud Run) │  │    (Static Web)      │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘ │
│         │                 │                                    │
│  ┌──────▼─────────────────▼──────┐                            │
│  │         Firestore             │  ← Encryption at rest      │
│  └───────────────────────────────┘                            │
│                                                                │
│  ┌───────────────────────────────┐                            │
│  │       Secret Manager          │  ← API keys, tokens        │
│  └───────────────────────────────┘                            │
└────────────────────────────────────────────────────────────────┘
```

---

## Security Controls

### Authentication

- Firebase Authentication with email/password, Google OAuth, GitHub OAuth
- JWT tokens with 1-hour expiry
- Refresh token rotation
- Optional MFA

### Authorization

- Role-Based Access Control (RBAC)
- Tenant isolation at query level
- Resource-level permissions
- Approval gating for destructive operations

### Encryption

- TLS 1.3 for all traffic
- AES-256 encryption at rest (GCP default)
- API keys stored in Secret Manager

### Audit

- All API calls logged with correlation IDs
- Structured logging to Cloud Logging
- 90-day retention
- Tamper-evident audit trail

### Monitoring

- Cloud Monitoring dashboards
- Alerting on anomalies
- Error rate tracking
- Latency monitoring

---

## Incident Response

### Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| P0 | Data breach, service compromise | 15 minutes |
| P1 | Authentication bypass, privilege escalation | 1 hour |
| P2 | Denial of service, data integrity | 4 hours |
| P3 | Minor security issue | 24 hours |

### Contacts

- Security Lead: security@intentsolutions.io
- On-call: PagerDuty rotation

---

## Compliance

| Standard | Status |
|----------|--------|
| OWASP Top 10 | ✅ Addressed |
| SOC 2 Type II | 🔄 In progress |
| GDPR | ✅ Compliant |

---

## Review Schedule

This threat model is reviewed:
- Quarterly (routine)
- After any security incident
- Before major releases
- When architecture changes

**Next Review**: Q2 2026

---

## References

- [OWASP Threat Modeling](https://owasp.org/www-community/Threat_Modeling)
- [STRIDE Model](https://docs.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats)
- [GCP Security Best Practices](https://cloud.google.com/security/best-practices)
