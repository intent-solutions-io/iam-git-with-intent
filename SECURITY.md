# Security Policy

## Supported Versions

| Version | Status | Security Support |
|---------|--------|------------------|
| 0.2.x (current) | Development | Best effort |
| < 0.2.0 | Unsupported | No support |

**Current Status:** Pre-alpha development. Not recommended for production use.

---

## Security Posture

### What We've Done

✅ **Comprehensive Security Audit** (December 2025)
- Professional security review conducted
- All findings documented and tracked
- Critical issues addressed before public release

✅ **Security Infrastructure**
- Workload Identity Federation (no service account keys)
- Secret Manager for credential storage
- Helmet.js security headers
- GitHub webhook signature verification
- RBAC with least-privilege access model

✅ **Development Practices**
- Pre-commit secret scanning (Husky hooks)
- Zod validation for all inputs
- ARV (Agent Readiness Verification) pre-commit checks
- Dependency vulnerability monitoring

### Known Limitations (Development Phase)

This project is in active development. Known security limitations:

🔶 **Authentication System**
- Firebase Auth integration is partial (production TODO)
- Development mode uses debug headers for testing
- **Mitigation:** Not deployed to production yet

🔶 **Rate Limiting**
- In-memory implementation (resets on container restart)
- **Mitigation:** Redis-based rate limiting available, not enabled by default
- **Status:** Tracked in Epic A6 (beads backlog)

🔶 **Marketplace (Unreleased Feature)**
- Authentication not yet implemented for connector publishing
- **Mitigation:** Feature not enabled in production
- **Status:** Tracked in Epic B

🔶 **Transitive Dependencies**
- Firebase SDK has moderate severity undici vulnerabilities
- **Mitigation:** Not exploitable in current usage patterns
- **Status:** Waiting on upstream Firebase updates

### CLI vs Hosted Service

**Important Context:**

This is primarily a **CLI tool for local use**. Security considerations differ by deployment model:

**CLI (Local Use) - Current Primary Use Case**
- ✅ Single-user, single-tenant
- ✅ User provides their own API keys
- ✅ No shared infrastructure
- ✅ Auth issues are not applicable

**Hosted Service (Future) - Not Yet Deployed**
- ⚠️ Requires full Firebase Auth implementation
- ⚠️ Requires distributed rate limiting
- ⚠️ Requires multi-tenant isolation
- 📝 Will undergo security review before production launch

---

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability:

### Preferred: Private Disclosure

**Email:** security@intentsolutions.io

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if available)

**Response SLA:**
- Initial response: 48 hours
- Status update: 7 days
- Fix timeline: Based on severity

### Severity Classification

| Severity | Description | Response Time |
|----------|-------------|---------------|
| **Critical** | Remote code execution, auth bypass in production | 24 hours |
| **High** | Data exposure, privilege escalation | 7 days |
| **Medium** | DoS, information disclosure | 30 days |
| **Low** | Minor issues, best practices | Next release |

### Public Disclosure Timeline

- Critical/High: 90 days after fix
- Medium/Low: Immediate (with fix)
- Development-only issues: Immediate (documented)

### What to Expect

1. **Acknowledgment** - We'll confirm receipt within 48 hours
2. **Investigation** - We'll validate and assess severity
3. **Fix Development** - We'll develop and test a fix
4. **Coordinated Disclosure** - We'll work with you on timing
5. **Credit** - We'll credit you in release notes (if desired)

### Bug Bounty

**Status:** Not available (pre-alpha project)

We appreciate responsible disclosure but do not currently offer monetary rewards. We will:
- Credit security researchers in release notes
- Acknowledge contributions in SECURITY.md
- Provide early access to new features (if interested)

---

## Security Best Practices for Users

### For CLI Users (Local Development)

```bash
# 1. Keep dependencies updated
npm install
npm audit fix

# 2. Secure your API keys
export ANTHROPIC_API_KEY="your-key"  # Don't commit to git
export GITHUB_TOKEN="your-token"     # Use GitHub PAT with minimal scopes

# 3. Review permissions
# GitHub PAT only needs: repo, read:org

# 4. Use .env files (gitignored by default)
cp .env.example .env
# Edit .env with your keys
```

### For Hosted Service Users (Future)

When the hosted service launches:
- Use strong passwords (12+ characters)
- Enable 2FA on your account
- Review connected repository permissions
- Rotate API keys regularly
- Monitor access logs in dashboard

---

## Security Features Roadmap

### Phase 1 (Current)
- ✅ Secret scanning in CI/CD
- ✅ Webhook signature verification
- ✅ Basic RBAC
- ✅ Security audit completed

### Phase 2 (Next 30 days)
- 🚧 Firebase Auth production implementation
- 🚧 Distributed rate limiting (Redis)
- 🚧 Security headers optimization
- 🚧 CORS policy hardening

### Phase 3 (Next 90 days)
- ⏳ Penetration testing
- ⏳ SOC 2 preparation
- ⏳ Security monitoring dashboard
- ⏳ Automated security scanning

---

## Compliance & Standards

### Current
- ✅ OWASP Top 10 awareness
- ✅ CWE/SANS Top 25 review
- ✅ GitHub Security Best Practices

### Planned
- ⏳ SOC 2 Type II (when hosted service launches)
- ⏳ GDPR compliance (EU users)
- ⏳ ISO 27001 alignment

---

## Security Audit History

| Date | Type | Conducted By | Findings | Status |
|------|------|--------------|----------|--------|
| 2025-12-20 | Comprehensive | Internal (Claude Code security-auditor) | 3 critical, 8 high, 4 medium | Documented |

Full audit findings available in this security policy document.

---

## Contact

- **Security Issues:** security@intentsolutions.io
- **General Questions:** jeremy@intentsolutions.io
- **GitHub Issues:** For non-sensitive bugs only

---

## Acknowledgments

We thank the following security researchers:

- *Your name here* - Responsible disclosure program (coming soon)

---

**Last Updated:** December 20, 2025
**Next Review:** March 20, 2026
