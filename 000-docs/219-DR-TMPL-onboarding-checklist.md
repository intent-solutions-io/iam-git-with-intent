# Developer Onboarding Checklist Template

> **Document**: 219-DR-TMPL-onboarding-checklist
> **Epic**: EPIC 010 - Onboarding Automation
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Copy this checklist for each new developer. Track completion in GitHub Issues or your project management tool.

---

## Onboarding Checklist

### Developer Information

| Field | Value |
|-------|-------|
| Name | |
| Email | |
| GitHub Username | |
| Role | |
| Team | |
| Start Date | |
| Buddy | |
| Manager | |

---

## Day 1: Identity & Access

### GitHub Access
- [ ] Invited to `intent-solutions-io` organization
- [ ] Added to team: `_______________`
- [ ] Repository access granted:
  - [ ] iam-git-with-intent (push)
  - [ ] gwi-infra (read)
- [ ] Signed up for GitHub Copilot (if applicable)

### Google Cloud Access
- [ ] Added to GCP project: `git-with-intent`
- [ ] Roles assigned:
  - [ ] `roles/viewer`
  - [ ] `roles/logging.viewer`
  - [ ] `roles/monitoring.viewer`
  - [ ] `roles/run.developer` (engineers)
  - [ ] `roles/run.admin` (senior+)

### Communication
- [ ] Slack workspace joined
- [ ] Added to channels:
  - [ ] #engineering
  - [ ] #gwi-alerts
  - [ ] #gwi-deploys
  - [ ] Team channel: #_______________
- [ ] 1Password vault access (if applicable)

---

## Day 1: Environment Setup

### Prerequisites Verified
- [ ] Node.js 20+ installed (`node -v`)
- [ ] Git installed (`git --version`)
- [ ] GitHub CLI installed (`gh --version`)
- [ ] VS Code installed (recommended)

### Repository Setup
- [ ] Repository cloned
  ```bash
  gh repo clone intent-solutions-io/iam-git-with-intent
  ```
- [ ] Dependencies installed (`npm install`)
- [ ] Build successful (`npm run build`)
- [ ] Tests passing (`npm run test`)
- [ ] Git hooks installed (`npm run prepare`)

### Configuration
- [ ] `.env.local` created with personal API keys
- [ ] VS Code extensions installed (see `.vscode/extensions.json`)
- [ ] Editor configured for TypeScript

### CLI Verification
- [ ] CLI version check: `node apps/cli/dist/index.js --version`
- [ ] ARV smoke test: `npm run arv:smoke`
- [ ] Local review test: `gwi review --local`

---

## Day 1-2: Documentation Review

### Required Reading
- [ ] README.md (project overview)
- [ ] CONTRIBUTING.md (development workflow)
- [ ] CLAUDE.md (AI assistant integration)
- [ ] Architecture overview in `000-docs/`

### Key Concepts
- [ ] Understand monorepo structure (apps/ vs packages/)
- [ ] Understand agent architecture (Triage, Coder, Resolver, Reviewer)
- [ ] Understand ARV gates (Agent Readiness Verification)
- [ ] Understand approval workflow (SHA binding)

---

## Day 2-3: First Task

### Task Assignment
- [ ] Starter issue created and assigned
- [ ] Issue type: `_______________`
- [ ] Buddy review scheduled

### First PR Workflow
- [ ] Branch created (or working on main)
- [ ] Changes implemented
- [ ] Local tests passing
- [ ] ARV gates passing
- [ ] PR created with proper template
- [ ] Buddy review requested
- [ ] PR approved
- [ ] PR merged

---

## Week 1: Integration

### Team Integration
- [ ] Attended team standup
- [ ] Met with manager (1:1 scheduled)
- [ ] Met with buddy (pair programming session)
- [ ] Introduced in #engineering Slack

### Process Familiarization
- [ ] Understands PR review process
- [ ] Understands CI/CD pipeline
- [ ] Understands incident response (on-call rotation)
- [ ] Understands release process

---

## Verification Checklist

### Technical Verification
| Check | Status | Notes |
|-------|--------|-------|
| Can clone repo | | |
| Can build project | | |
| Can run tests | | |
| Can run ARV gates | | |
| Can use CLI | | |
| Can create PR | | |
| Can view GCP logs | | |
| Can view dashboards | | |

### Access Verification
| System | Access Level | Verified |
|--------|--------------|----------|
| GitHub | Member | [ ] |
| GCP Console | Viewer | [ ] |
| Cloud Logging | Viewer | [ ] |
| Cloud Run | Developer | [ ] |
| Slack | Member | [ ] |

---

## Onboarding Feedback

### Week 1 Check-in

**What went well?**


**What was confusing?**


**Suggestions for improvement?**


**Rating (1-5): ___**

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| New Developer | | | |
| Buddy | | | |
| Manager | | | |

---

## Appendix: Quick Commands

```bash
# Build everything
npm run build

# Run all tests
npm run test

# Run ARV validation
npm run arv

# Run single package tests
npx turbo run test --filter=@gwi/core

# Local code review
gwi review --local

# Check CLI version
node apps/cli/dist/index.js --version

# View recent runs
gwi run list
```

## Appendix: Key Files

| File | Purpose |
|------|---------|
| `package.json` | Root package, scripts |
| `turbo.json` | Monorepo build config |
| `CLAUDE.md` | AI assistant instructions |
| `.env.local` | Local environment (create this) |
| `apps/cli/` | CLI application |
| `packages/core/` | Core library |
| `packages/agents/` | AI agents |

## Appendix: Getting Help

| Question Type | Where to Ask |
|---------------|--------------|
| Code questions | Your buddy, #engineering |
| Access issues | Manager, IT |
| CI/CD issues | #gwi-deploys |
| Production issues | #gwi-alerts |
| General questions | #engineering |
