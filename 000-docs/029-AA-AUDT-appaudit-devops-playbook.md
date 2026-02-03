# Git With Intent: Operator-Grade System Analysis
*For: DevOps Engineer*
*Generated: 2026-01-29*
*Version: v0.5.1 (commit 6042c0c)*

## 1. Executive Summary

### Business Purpose

Git With Intent (gwi) is an AI-powered CLI tool that automates PR workflows through semantic merge conflict resolution, issue-to-code generation, complexity scoring, and full autopilot with approval gating. The platform targets development teams spending excessive time on merge conflicts and wanting AI-assisted code changes with audit trails.

The system is in active development (v0.5.1) with a functional CLI, multi-agent architecture routing to Anthropic Claude and Google Gemini models, and a complete infrastructure-as-code deployment pipeline targeting Google Cloud Platform. The tech foundation is a TypeScript Turbo monorepo with 8 apps, 7 packages, and 76 core modules.

Primary risks include pre-alpha stability status, dependency on external AI APIs (Anthropic, Google AI), and incomplete production hardening for the hosted services. The CLI is the most mature component; Cloud Run services are deployed but not yet production-ready for external traffic.

### Operational Status Matrix

| Environment | Status | Uptime Target | Release Cadence |
|-------------|--------|---------------|-----------------|
| Production | Deployed (pre-alpha) | N/A (not SLA-bound) | As needed |
| Staging | Deployed | N/A | PR-based |
| Development | Local | N/A | Continuous |

### Technology Stack

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| Runtime | Node.js | 20+ | Primary runtime |
| Language | TypeScript | 5.3+ | Type-safe development |
| Build | Turbo | 2.3+ | Monorepo orchestration |
| Package Manager | npm | 10.2+ | Dependency management |
| AI (Primary) | Anthropic Claude | Sonnet/Opus | Code generation, review |
| AI (Secondary) | Google Gemini | Flash | Triage, orchestration |
| Database | Firestore | - | Production storage |
| Database | SQLite | - | Local development |
| Infrastructure | OpenTofu | 1.6+ | IaC for GCP |
| Cloud | Google Cloud Platform | - | Hosting platform |
| CI/CD | GitHub Actions | - | Automation |

---

## 2. System Architecture

### Technology Stack (Detailed)

| Layer | Technology | Version | Purpose | Owner |
|-------|------------|---------|---------|-------|
| CLI | Node.js + Commander | 20+ | User interface | @gwi/cli |
| Agents | TypeScript classes | - | AI agent implementations | @gwi/agents |
| Engine | Workflow orchestrator | - | Step execution, hooks | @gwi/engine |
| Core | Storage, billing, auth | - | Shared infrastructure | @gwi/core |
| API | Express/Hono | - | REST endpoints | apps/api |
| Gateway | A2A protocol | - | Agent coordination | apps/gateway |
| Webhooks | GitHub integration | - | Event handling | apps/github-webhook |
| Worker | Background jobs | - | Async processing | apps/worker |
| Frontend | React + Vite | 18+ | Dashboard | apps/web |
| Database | Firestore/SQLite | - | Persistence | @gwi/core |
| Infrastructure | OpenTofu | 1.6+ | GCP resources | infra/ |

### Architecture Diagram

```
                              ┌─────────────────────────────────────┐
                              │         GitHub Events               │
                              │  (PRs, Issues, Webhooks)            │
                              └──────────────┬────────────────────── ┘
                                             │
                                             ▼
┌──────────────┐              ┌─────────────────────────────────────┐
│              │              │        Cloud Run Services           │
│   gwi CLI    │◀────────────▶│  ┌─────────┐  ┌─────────────────┐  │
│              │              │  │   API   │  │  GitHub Webhook │  │
│  (Local)     │              │  └────┬────┘  └────────┬────────┘  │
└──────┬───────┘              │       │                │           │
       │                      │       ▼                ▼           │
       │                      │  ┌─────────────────────────────┐   │
       │                      │  │        A2A Gateway          │   │
       │                      │  │   (Agent Coordination)      │   │
       │                      │  └─────────────┬───────────────┘   │
       │                      │                │                   │
       │                      │                ▼                   │
       │                      │  ┌─────────────────────────────┐   │
       │                      │  │         Worker              │   │
       │                      │  │   (Background Jobs)         │   │
       │                      │  └─────────────────────────────┘   │
       │                      └─────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Agent Pipeline                                │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │
│  │ Orchestrator│  │   Triage  │  │   Coder   │  │  Reviewer  │    │
│  │(Gemini Flash)│  │(Gemini Flash)│  │(Claude Sonnet)│  │(Claude Sonnet)│    │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘    │
│         │               │               │               │          │
│         └───────────────┴───────────────┴───────────────┘          │
│                                 │                                   │
│                                 ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                      Resolver Agent                         │    │
│  │   (Claude Sonnet for complexity 1-6, Opus for 7-10)        │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Storage Layer                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Firestore   │  │    SQLite    │  │  In-Memory   │              │
│  │ (Production) │  │ (Local Dev)  │  │ (Unit Tests) │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Directory Analysis

### Project Structure

```
git-with-intent/
├── apps/                          # Deployable applications
│   ├── cli/                       # CLI tool (gwi command) - PRIMARY
│   ├── api/                       # REST API (Cloud Run)
│   ├── gateway/                   # A2A agent coordination
│   ├── github-webhook/            # GitHub webhook handler
│   ├── webhook-receiver/          # Generic webhook receiver
│   ├── worker/                    # Background job processor
│   ├── registry/                  # Workflow template registry
│   └── web/                       # React dashboard (Firebase Hosting)
├── packages/                      # Shared libraries
│   ├── core/                      # Storage, billing, security (76 modules)
│   ├── agents/                    # AI agent implementations
│   ├── engine/                    # Workflow orchestration with hooks
│   ├── integrations/              # GitHub/GitLab connectors
│   ├── connectors/                # Airbyte-style data connectors
│   ├── forecasting/               # TimeGPT integration
│   └── sdk/                       # TypeScript SDK
├── infra/                         # OpenTofu infrastructure (16 files)
├── scripts/                       # Build & deployment scripts
│   └── arv/                       # Agent Readiness Verification gates
├── test/                          # Cross-cutting tests
│   ├── contracts/                 # Zod schema validation
│   └── goldens/                   # Deterministic output fixtures
├── .github/workflows/             # CI/CD pipelines (14 workflows)
└── 000-docs/                      # Internal documentation
```

### Key Directories

**apps/cli/** - Primary user interface
- Entry point: `src/index.ts`
- Commands: triage, resolve, review, issue-to-code, autopilot, gate, hooks
- Build output: `dist/index.js`

**packages/core/** - Foundation layer (76 modules)
- Storage interfaces: `src/storage/interfaces.ts` (DO NOT BREAK)
- Billing: `src/billing/` (usage tracking, plans, Stripe)
- Security: `src/approvals/` (Ed25519 signatures, SHA-256 hashing)
- Policy: `src/policy/crypto-chain.ts` (Merkle trees, audit logs)

**packages/agents/** - AI agent implementations
- BaseAgent class with A2A protocol support
- SPIFFE identity integration
- Model routing based on complexity

**infra/** - OpenTofu IaC (SOURCE OF TRUTH)
- 16 Terraform/OpenTofu files
- Cloud Run services, Firestore, Pub/Sub, service accounts
- Environment configs: `envs/dev.tfvars`, `envs/prod.tfvars`

---

## 4. Operational Reference

### Deployment Workflows

#### Local Development

**Prerequisites:**
- Node.js 20+
- npm 10+
- Git 2.40+
- GitHub CLI (`gh`) recommended

**Setup:**
```bash
# Clone and install
git clone https://github.com/intent-solutions-io/git-with-intent.git
cd git-with-intent
npm install

# Configure environment
export ANTHROPIC_API_KEY="your-key"
export GOOGLE_AI_API_KEY="your-key"
export GITHUB_TOKEN="your-token"

# Build
npm run build

# Verify
node apps/cli/dist/index.js --help
```

**Verification:**
```bash
npm run typecheck          # Type check all packages
npm run test               # Run all tests (~1700 tests)
npm run arv                # Agent Readiness Verification
```

#### Production Deployment

**Pre-flight Checklist:**
- [ ] All tests passing: `npm run test`
- [ ] Type check clean: `npm run typecheck`
- [ ] ARV gates passing: `npm run arv`
- [ ] No uncommitted changes: `git status`
- [ ] PR approved and merged to main

**Execution Steps:**
1. Merge PR to `main` branch
2. GitHub Actions automatically triggers:
   - `ci.yml`: Build, test, type check, ARV
   - `deploy.yml`: OpenTofu plan/apply
3. Monitor deployment in GitHub Actions UI

**Rollback Protocol:**
```bash
# Identify last known good commit
git log --oneline -10

# Revert to previous version
git revert HEAD
git push origin main

# Or force rollback (DESTRUCTIVE)
git reset --hard <good-commit>
git push --force origin main

# Cloud Run: Traffic split to previous revision
gcloud run services update-traffic gwi-api \
  --to-revisions=<previous-revision>=100
```

### Monitoring & Alerting

**Dashboards:**
- GitHub Actions: https://github.com/intent-solutions-io/git-with-intent/actions
- Cloud Run Console: https://console.cloud.google.com/run
- Firestore Console: https://console.firebase.google.com

**SLIs/SLOs:**
| Metric | Target | Current |
|--------|--------|---------|
| CLI response time | < 5s | N/A (pre-alpha) |
| Agent completion rate | > 95% | N/A |
| Approval accuracy | 100% | 100% (hash-bound) |

**On-call:**
- Not established (pre-alpha)
- Escalation: jeremy@intentsolutions.io

### Incident Response

| Severity | Definition | Response Time | Playbook |
|----------|------------|---------------|----------|
| P0 | CLI completely broken | Immediate | Rollback deploy |
| P1 | Agent failures >50% | 1 hour | Check API keys, quotas |
| P2 | Slow responses | 4 hours | Review model routing |
| P3 | Minor bugs | Next sprint | Standard PR process |

---

## 5. Security & Access

### IAM

| Role | Purpose | Permissions | MFA |
|------|---------|-------------|-----|
| gwi-api-sa | API service | Firestore read/write | N/A |
| gwi-gateway-sa | Gateway service | Pub/Sub, Firestore | N/A |
| gwi-webhook-sa | Webhook handler | Firestore write | N/A |
| gwi-worker-sa | Background jobs | Full Firestore, Pub/Sub | N/A |
| deployer | CI/CD deploy | Cloud Run admin | WIF |
| terraform-sa | Infrastructure | Project owner | N/A |

**Workload Identity Federation:**
- GitHub Actions uses WIF (no service account keys)
- Provider: `projects/*/locations/global/workloadIdentityPools/github-pool`

### Secrets Management

**Storage:**
- GitHub Secrets for CI/CD
- Google Secret Manager for runtime
- `.env` files for local development (NEVER commit)

**Rotation:**
- API keys: Manual rotation as needed
- Service account keys: Not used (WIF)
- GitHub tokens: 90-day rotation recommended

**Break-glass:**
```bash
# Emergency API key rotation
gcloud secrets versions add ANTHROPIC_API_KEY \
  --data-file=/path/to/new/key

# Force Cloud Run to pick up new secret
gcloud run services update gwi-api --no-traffic
gcloud run services update gwi-api --region=us-central1
```

### Security Model

| Operation | Approval Required | Binding |
|-----------|-------------------|---------|
| Read/analyze | No | - |
| Generate patch | No | - |
| Post comments | No | - |
| Commit changes | Yes | SHA-256 hash |
| Push to remote | Yes | SHA-256 hash |
| Merge PR | Yes | SHA-256 hash |

**Hash Binding:** If patch content changes after approval, approval is invalidated.

---

## 6. Cost & Performance

### Monthly Costs (Estimated)

| Service | Estimated Cost | Notes |
|---------|----------------|-------|
| Cloud Run (4 services) | $50-200 | Scale to zero when idle |
| Firestore | $10-50 | Depends on usage |
| Anthropic API | Variable | ~$3 per 1M tokens |
| Google AI API | Variable | ~$0.35 per 1M tokens |
| GitHub Actions | $0 | Free for public repos |
| **Total** | **~$100-500/mo** | Pre-alpha, low traffic |

### Performance Baseline

| Metric | Target | Notes |
|--------|--------|-------|
| CLI startup | < 1s | Cold start |
| Triage (simple PR) | < 10s | Gemini Flash |
| Code generation | < 60s | Claude Sonnet |
| Conflict resolution | < 120s | Claude Sonnet/Opus |
| Full autopilot | < 5 min | End-to-end |

---

## 7. Current State Assessment

### What's Working

- ✅ **CLI functionality** - All core commands operational (triage, resolve, review, autopilot)
- ✅ **Multi-agent routing** - Complexity-based model selection working
- ✅ **Approval gating** - SHA-256 hash-bound approvals enforced
- ✅ **OpenTofu infrastructure** - 16 files, fully declarative GCP setup
- ✅ **CI/CD pipeline** - 14 GitHub Actions workflows, comprehensive checks
- ✅ **ARV gates** - 9 verification gates including security, identity, reliability
- ✅ **Storage abstraction** - Firestore/SQLite/In-Memory backends
- ✅ **Test coverage** - ~1700 tests across all packages

### Areas Needing Attention

- ⚠️ **Pre-alpha stability** - Not production-ready for external users
- ⚠️ **No monitoring/alerting** - Cloud Run services lack observability
- ⚠️ **No SLO/SLA** - Uptime targets not defined or measured
- ⚠️ **Manual secret rotation** - No automated key rotation
- ⚠️ **Limited documentation** - Runbooks and playbooks incomplete
- ⚠️ **No load testing** - Performance under scale unknown
- ⚠️ **Single region** - No multi-region redundancy

### Immediate Priorities

1. **[HIGH]** Add Cloud Run monitoring and alerting
   - Impact: Currently blind to service health
   - Owner: DevOps

2. **[HIGH]** Implement structured logging
   - Impact: No audit trail for production issues
   - Owner: Platform

3. **[MEDIUM]** Create incident response runbooks
   - Impact: No documented procedures for outages
   - Owner: DevOps

4. **[MEDIUM]** Add health check endpoints
   - Impact: No way to verify service liveness
   - Owner: Platform

5. **[LOW]** Set up cost alerts
   - Impact: Unexpected API costs possible
   - Owner: Finance

---

## 8. Quick Reference

### Command Map

| Capability | Command | Notes |
|------------|---------|-------|
| Install deps | `npm install` | Root of monorepo |
| Build all | `npm run build` | Turbo orchestrated |
| Type check | `npm run typecheck` | All packages |
| Run tests | `npm run test` | ~1700 tests |
| ARV checks | `npm run arv` | Required before commit |
| Single package test | `npx turbo run test --filter=@gwi/core` | |
| Run CLI | `node apps/cli/dist/index.js` | After build |
| Deploy (auto) | Merge to `main` | GitHub Actions |
| Check infra drift | `cd infra && tofu plan` | OpenTofu |
| View logs | `gcloud run logs read gwi-api` | Cloud Run |
| Rollback | `gcloud run services update-traffic` | Traffic split |

### Critical URLs

| Resource | URL |
|----------|-----|
| GitHub Repo | https://github.com/intent-solutions-io/git-with-intent |
| CI/CD | https://github.com/intent-solutions-io/git-with-intent/actions |
| Cloud Run | https://console.cloud.google.com/run |
| Firestore | https://console.firebase.google.com |
| API Docs | (not yet deployed) |

### First-Week Checklist

- [ ] Clone repository and run `npm install`
- [ ] Set up local environment variables
- [ ] Successfully run `npm run build && npm run test`
- [ ] Run CLI locally with `node apps/cli/dist/index.js --help`
- [ ] Review `CLAUDE.md` and `README.md`
- [ ] Understand monorepo structure (apps/ vs packages/)
- [ ] Review OpenTofu infrastructure in `infra/`
- [ ] Understand agent architecture and model routing
- [ ] Review approval gating and security model
- [ ] Join relevant communication channels

---

## 9. Recommendations Roadmap

### Week 1 - Stabilization

**Goals:**
- [ ] Add health check endpoints to all Cloud Run services
- [ ] Configure Cloud Monitoring dashboards
- [ ] Set up basic alerting for service availability
- [ ] Document current deployment process

**Measurable Outcomes:**
- Health endpoints responding on `/health`
- Dashboard showing 4 service statuses
- Alerts configured for 5xx errors > 10/min

### Month 1 - Foundation

**Goals:**
- [ ] Implement structured logging (JSON, correlation IDs)
- [ ] Create incident response runbook
- [ ] Add API rate limiting
- [ ] Set up cost monitoring and alerts
- [ ] Document rollback procedures

**Measurable Outcomes:**
- Logs queryable in Cloud Logging
- Runbook covers P0-P3 scenarios
- Rate limits enforced (100 req/min default)
- Cost alert at $500/month threshold

### Quarter 1 - Strategic

**Goals:**
- [ ] Implement SLO monitoring (error budget tracking)
- [ ] Add load testing to CI/CD pipeline
- [ ] Multi-region deployment strategy
- [ ] Automated secret rotation
- [ ] Security audit and penetration testing

**Measurable Outcomes:**
- SLO dashboard with 99.5% availability target
- Load tests in CI for >100 concurrent requests
- DR plan with RTO < 4 hours
- Secrets rotated automatically every 90 days
- Security audit completed with findings addressed

---

## Appendices

### A. Glossary

| Term | Definition |
|------|------------|
| ARV | Agent Readiness Verification - pre-commit quality gates |
| A2A | Agent-to-Agent protocol for multi-agent coordination |
| gwi | Git With Intent - the CLI command |
| SPIFFE | Secure Production Identity Framework for Everyone |
| WIF | Workload Identity Federation (keyless auth) |

### B. Reference Links

- [README.md](/home/jeremy/000-projects/git-with-intent/README.md) - Project overview
- [CONTRIBUTING.md](/home/jeremy/000-projects/git-with-intent/CONTRIBUTING.md) - Development guidelines
- [CLAUDE.md](/home/jeremy/000-projects/git-with-intent/CLAUDE.md) - AI assistant instructions
- [Security Threat Model](000-docs/110-DR-TMOD-security-threat-model.md)
- [SLO/SLA Targets](000-docs/111-DR-TARG-slo-sla-targets.md)
- [Disaster Recovery Runbook](000-docs/112-DR-RUNB-disaster-recovery-runbook.md)

### C. Troubleshooting Playbooks

**CLI Not Building:**
```bash
# Clean and rebuild
npm run clean
npm install
npm run build

# Check Node version
node --version  # Must be 20+
```

**Tests Failing:**
```bash
# Run single package to isolate
npx turbo run test --filter=@gwi/core

# Run single test file
npx vitest run path/to/test.test.ts
```

**Cloud Run Service Unhealthy:**
```bash
# Check logs
gcloud run logs read gwi-api --limit=50

# Check environment variables
gcloud run services describe gwi-api

# Force redeploy
gcloud run services update gwi-api --no-traffic
gcloud run services update gwi-api
```

**AI API Errors:**
```bash
# Verify API keys
echo $ANTHROPIC_API_KEY | head -c 10
echo $GOOGLE_AI_API_KEY | head -c 10

# Check quotas
# Anthropic: https://console.anthropic.com/
# Google: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas
```

### D. Open Questions

1. What is the target GA date for the hosted service?
2. What are the expected usage patterns (requests/day)?
3. Is multi-tenant isolation required for the API?
4. What compliance requirements apply (SOC2, GDPR)?
5. What is the budget for infrastructure scaling?

---

**Document Status:** Complete
**System Health Score:** 72/100
- Architecture: 8/10 (well-structured monorepo, clean separation)
- Operations: 6/10 (CI/CD solid, monitoring gaps)
- Security: 8/10 (good practices, needs audit)
- Documentation: 7/10 (improving, runbooks needed)

**Generated by:** Claude Code AppAudit
**Audit Duration:** ~15 minutes
