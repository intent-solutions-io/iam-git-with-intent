# 009-PM-PRDC: Git With Intent Cloud - Product Requirements Document v0.1

**Document ID:** 009-PM-PRDC
**Document Type:** Product Requirements Document (PRD)
**Created:** 2025-12-15
**Last Updated:** 2025-12-15
**Status:** DRAFT
**Author:** Jeremy Longshore, Claude Code (Opus 4.5)
**Version:** 0.1.0

---

> **Filing Standard:** This document follows docs-filing v4 (6767-a-DR-STND-document-filing-system-standard-v4.md)
> - `009` = chronological sequence number
> - `PM` = Project Management category
> - `PRDC` = Product Requirements Document type

---

## 1. Product Summary

### 1.1 What Is Git With Intent Cloud?

**Git With Intent Cloud** is a hosted multi-agent PR assistant that automates code review, conflict resolution, and issue-to-code workflows for GitHub repositories.

### 1.2 Value Proposition

> "Git with purpose. Ship with confidence."

Git With Intent Cloud eliminates the toil of:
- Manual merge conflict resolution
- Context-switching between issue descriptions and code
- Repetitive PR review cycles
- Waiting for team members to unblock PRs

### 1.3 Core Capabilities (User Perspective)

1. **Connect GitHub Organization** - Install the GWI GitHub App
2. **Select Repositories** - Choose which repos to manage
3. **Run Agent Workflows**:
   - **Triage** - Analyze PR/issue complexity and risk
   - **Plan** - Generate actionable change plan
   - **Resolve** - Auto-resolve merge conflicts
   - **Review** - Produce human-readable code reviews
   - **Autopilot** - Full pipeline: triage → plan → code → validate → review
4. **View History** - See all runs and their outcomes
5. **Configure Preferences** - LLM models, risk modes, automation level

### 1.4 Multi-Agent Architecture (Hidden from Users)

Users interact through simple commands. Behind the scenes, multiple specialized agents coordinate:

```
User Request → Orchestrator → [TriageAgent, PlannerAgent, CoderAgent, ValidatorAgent, ReviewerAgent]
```

Users never see or configure agents directly. The system makes intelligent routing decisions.

---

## 2. Target Users & Personas

### 2.1 Solo Developer ("Dev Dana")

**Profile:**
- Individual developer or freelancer
- 1-5 personal/client repos
- Limited time for PR maintenance
- Wants conflicts resolved quickly

**Jobs to Be Done:**
- "I want merge conflicts auto-resolved so I can keep shipping"
- "I want a second opinion on my code before merging"

**Plan:** Free tier (limited runs/month)

### 2.2 Small Team Lead ("Lead Leo")

**Profile:**
- Engineering lead at startup (2-10 engineers)
- 5-20 repos in GitHub org
- Reviews many PRs per week
- Wants to reduce review bottlenecks

**Jobs to Be Done:**
- "I want PRs reviewed consistently even when I'm busy"
- "I want junior devs to get feedback faster"
- "I want to understand why PRs have conflicts"

**Plan:** Team tier ($X/month)

### 2.3 Enterprise Engineering Manager ("Manager Maya")

**Profile:**
- Engineering manager at mid-size company
- 50+ repos, 20+ developers
- Compliance and security requirements
- Wants CI/CD integration

**Jobs to Be Done:**
- "I want every PR reviewed before merge"
- "I want automated conflict resolution in CI"
- "I want audit trails for compliance"

**Plan:** Enterprise tier (custom pricing)

---

## 3. Core Capabilities (Detailed)

### 3.1 GitHub Integration

**Installation:**
1. User installs GWI GitHub App to their org
2. App requests permissions: repo read/write, PR comments, webhooks
3. GWI creates tenant record for the org
4. User selects which repos to enable

**Triggers:**
- **PR Events:** opened, synchronize, reopened
- **Issue Events:** opened, labeled (with `gwi-auto-code`)
- **Comment Commands:** `/gwi resolve`, `/gwi review`, `/gwi triage`

**Actions:**
- Read PR diffs, file contents, issue descriptions
- Post PR comments with analysis and suggestions
- (Optional) Push commits with conflict resolutions
- Update PR status checks

### 3.2 Run Types

| Run Type | Description | Agents Involved |
|----------|-------------|-----------------|
| TRIAGE | Analyze complexity, identify risks | TriageAgent |
| PLAN | Generate change plan from triage | PlannerAgent |
| RESOLVE | Apply conflict resolutions | CoderAgent, ValidatorAgent |
| REVIEW | Produce code review summary | ReviewerAgent |
| AUTOPILOT | Full pipeline (all above) | All agents in sequence |

### 3.3 Risk Modes

Users configure how aggressive the automation is:

| Mode | Description | Actions Allowed |
|------|-------------|-----------------|
| **Comment Only** | No code changes, comments only | Post reviews, suggestions |
| **Suggest Patches** | Show diffs but don't apply | Post patches as comments |
| **Auto-Patch** | Apply patches, don't push | Create local changes |
| **Auto-Push** | Apply and push changes | Commit and push to branch |

Default: **Comment Only** (safest)

### 3.4 LLM Preferences

Users can configure model selection thresholds:

| Setting | Options | Default |
|---------|---------|---------|
| Triage Model | Gemini Flash, Gemini Pro | Flash |
| Plan Model | Gemini Flash, Claude Sonnet | Sonnet |
| Code Model | Claude Sonnet, Claude Opus | Sonnet |
| Review Model | Claude Sonnet, Claude Opus | Sonnet |
| Complexity Threshold | 1-5 | 4 (use Opus above this) |

### 3.5 History & Audit

- View all runs for a repo or tenant
- Filter by status, type, date
- Drill into run details: steps, timestamps, outputs
- Export audit logs (Enterprise tier)

---

## 4. Multi-LLM Strategy

### 4.1 Model Selection

| Task | Default Model | Escalation Model | Escalation Trigger |
|------|---------------|------------------|-------------------|
| Triage | Gemini 2.0 Flash | Gemini 2.0 Pro | Large diff (>1000 lines) |
| Planning | Gemini 2.0 Flash | Claude Sonnet | Complex dependencies |
| Code Generation | Claude Sonnet 4 | Claude Opus 4 | Complexity > 4 |
| Validation | Gemini 2.0 Flash | Claude Sonnet | Test failures |
| Review | Claude Sonnet 4 | Claude Opus 4 | Security concerns |

### 4.2 Rationale

- **Gemini Flash:** Fast, cheap, good for routing and simple analysis
- **Claude Sonnet:** Balanced quality and cost for code tasks
- **Claude Opus:** Best code quality, reserved for complex cases

### 4.3 Cost Optimization

- Default to cheaper models
- Escalate only when needed
- Track tokens per run for billing

---

## 5. Non-Goals (v0.1)

The following are explicitly **out of scope** for v0.1:

| Feature | Reason | Future Version |
|---------|--------|----------------|
| GitLab/Bitbucket support | Focus on GitHub first | v0.2+ |
| On-premises deployment | SaaS only | v1.0+ |
| IDE integration (VS Code) | Web + CLI first | v0.3+ |
| Slack notifications | Focus on GitHub comments | v0.2+ |
| Custom agent training | Standard agents only | v1.0+ |
| SSO/SAML | Firebase Auth first | v0.2+ (Enterprise) |
| Offline mode | Cloud-only | Never |

---

## 6. Success Metrics

### 6.1 Core KPIs

| Metric | Description | Target (v0.1) |
|--------|-------------|---------------|
| Conflict Resolution Rate | % of conflicts auto-resolved without regression | > 70% |
| Review Adoption Rate | % of reviews with suggestions adopted | > 50% |
| Time Saved per PR | Minutes saved vs manual resolution | > 30 min |
| Run Success Rate | % of runs completing without error | > 95% |
| User Activation | % of signups who complete first run | > 60% |

### 6.2 Quality Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| False Positive Rate | Suggestions that were wrong | < 10% |
| Test Pass Rate | % of auto-generated code passing tests | > 90% |
| Security Issue Rate | PRs with security vulnerabilities | 0% |
| Rollback Rate | Runs that required manual rollback | < 5% |

### 6.3 Business Metrics

| Metric | Description | Target (6 months) |
|--------|-------------|-------------------|
| Monthly Active Tenants | Orgs with >1 run in month | 100+ |
| Paid Conversion Rate | Free → paid conversion | > 5% |
| Net Promoter Score | User satisfaction | > 40 |

---

## 7. Architecture Overview

### 7.1 High-Level Components

```
┌──────────────────────────────────────────────────────────────────┐
│                        Git With Intent Cloud                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  gwi-api    │  │ gwi-webhook │  │  gwi-a2a    │              │
│  │ (Cloud Run) │  │ (Cloud Run) │  │  gateway    │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         └────────────────┼────────────────┘                      │
│                          │                                        │
│                    ┌─────▼─────┐                                  │
│                    │ Firestore │  (Tenants, Repos, Runs, Users)  │
│                    └───────────┘                                  │
│                          │                                        │
│              ┌───────────┴───────────┐                            │
│              │  Vertex AI Agent      │                            │
│              │  Engine               │                            │
│              │                       │                            │
│              │  ┌─────────────────┐  │                            │
│              │  │  Orchestrator   │  │                            │
│              │  └────────┬────────┘  │                            │
│              │           │           │                            │
│              │  ┌────┬───┴───┬────┐  │                            │
│              │  │    │       │    │  │                            │
│              │  ▼    ▼       ▼    ▼  │                            │
│              │ Triage Plan  Code Rev │                            │
│              │ Agent  Agent Agent    │                            │
│              └───────────────────────┘                            │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 7.2 Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **gwi-api** | REST API for web UI and CLI |
| **gwi-webhook** | GitHub webhook handler |
| **gwi-a2a-gateway** | A2A protocol proxy to Agent Engine |
| **Firestore** | Multi-tenant data storage |
| **Agent Engine** | AI agent runtime (Vertex AI) |
| **Orchestrator** | Routes requests to specialist agents |

### 7.3 Data Flow

1. **User Action:** Web UI or CLI calls `gwi-api`
2. **API Layer:** Validates auth, resolves tenant, creates Run
3. **Gateway:** Routes to Agent Engine via A2A protocol
4. **Agent Engine:** Orchestrator delegates to specialists
5. **Specialists:** Triage → Plan → Code → Review
6. **Storage:** Run status and results saved to Firestore
7. **Response:** Results returned to user

---

## 8. Pricing (Proposed)

### 8.1 Plans

| Plan | Price | Runs/Month | Repos | Features |
|------|-------|------------|-------|----------|
| **Free** | $0 | 50 | 3 | Basic runs, comment-only mode |
| **Team** | $49/mo | 500 | 20 | All modes, team members |
| **Pro** | $149/mo | 2000 | Unlimited | Priority support, API access |
| **Enterprise** | Custom | Unlimited | Unlimited | SSO, audit logs, SLA |

### 8.2 Overages

- Additional runs: $0.10/run
- Opus model upgrade: $0.25/run

---

## 9. Roadmap

### 9.1 v0.1 (Current Phase)

**Focus:** Core GitHub integration and run types

- [ ] GitHub App installation flow
- [ ] Tenant/repo/run data model
- [ ] gwi-api with core endpoints
- [ ] gwi-webhook for PR events
- [ ] TRIAGE, PLAN, RESOLVE, REVIEW, AUTOPILOT runs
- [ ] Basic web UI (Firebase Hosting)
- [ ] CLI integration with SaaS backend

### 9.2 v0.2

**Focus:** Enhanced integration and collaboration

- [ ] GitLab support
- [ ] Slack notifications
- [ ] Team collaboration features
- [ ] Advanced analytics dashboard
- [ ] Webhook customization

### 9.3 v0.3

**Focus:** IDE and CI/CD integration

- [ ] VS Code extension
- [ ] GitHub Actions integration
- [ ] Jenkins/CircleCI plugins
- [ ] Self-serve billing

### 9.4 v1.0

**Focus:** Enterprise readiness

- [ ] SSO/SAML authentication
- [ ] On-premises option
- [ ] Custom model training
- [ ] SOC 2 compliance
- [ ] SLA guarantees

---

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Model quality regression | High | A/B testing, human review for high-risk |
| Rate limiting by GitHub | Medium | Backoff strategies, queue management |
| Cost overruns from LLM usage | Medium | Usage limits, cost tracking, alerts |
| Security vulnerabilities | Critical | Code scanning, no secret handling |
| User adoption friction | Medium | Simple onboarding, good defaults |

---

## 11. Competitive Landscape

### 11.1 Direct Competitors

| Competitor | Positioning | GWI Differentiation |
|------------|-------------|---------------------|
| GitHub Copilot | IDE code completion | PR-level automation, not IDE |
| Cursor | AI-powered IDE | SaaS, multi-repo, not IDE-bound |
| Sweep AI | PR automation | Multi-agent, conflict resolution |
| Codeium | Code suggestions | Run-based, auditable workflows |

### 11.2 GWI Advantages

- **Multi-agent architecture:** Specialized agents for each task
- **Conflict resolution focus:** Unique capability
- **Audit trails:** Full run history for compliance
- **Model flexibility:** Best model for each task

---

## 12. Appendix

### 12.1 Glossary

| Term | Definition |
|------|------------|
| **Tenant** | A GitHub org installation of the GWI App |
| **Run** | A single execution of a workflow (TRIAGE, PLAN, etc.) |
| **Agent** | An AI specialist (TriageAgent, CoderAgent, etc.) |
| **Orchestrator** | The coordinating agent that routes to specialists |
| **A2A** | Agent-to-Agent protocol for inter-agent communication |

### 12.2 References

- 004-DR-ADRC: Runtime vs DevTools Architecture
- 006-DR-ADRC: AgentFS/Beads Policy
- 007-DR-ADRC: Directory Structure
- bobs-brain/101-AT-ARCH: Agent Engine Topology
- bobs-brain/102-AT-ARCH: Cloud Run Gateways

---

**Document Status:** DRAFT
**Next Review:** After Phase 2 ADRs complete

---

*intent solutions io — confidential IP*
*Contact: jeremy@intentsolutions.io*
