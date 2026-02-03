# AI Tool Rollout Playbook

> **Document**: 201-DR-GUID-ai-tool-rollout-playbook
> **Epic**: EPIC 026 - AI Tool Rollout Framework
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Organization-wide standards and adoption framework for AI coding assistants (Claude Code, GitHub Copilot, Cursor, etc.). This playbook guides teams through evaluation, adoption, and measurement of AI coding tools.

---

## Phase 1: Evaluation (Week 1-2)

### 1.1 Tool Selection Criteria

| Criterion | Weight | Claude Code | Copilot | Cursor |
|-----------|--------|-------------|---------|--------|
| Code quality | 25% | Score 1-5 | Score 1-5 | Score 1-5 |
| Context awareness | 20% | Score 1-5 | Score 1-5 | Score 1-5 |
| Security/compliance | 20% | Score 1-5 | Score 1-5 | Score 1-5 |
| IDE integration | 15% | Score 1-5 | Score 1-5 | Score 1-5 |
| Cost per seat | 10% | Score 1-5 | Score 1-5 | Score 1-5 |
| Learning curve | 10% | Score 1-5 | Score 1-5 | Score 1-5 |

### 1.2 Golden Task Evaluation

Run standardized tasks across all tools being evaluated:

```bash
# See: 202-DR-TEST-ai-golden-tasks.md
gwi evaluate --tool claude-code --task-set golden-v1
gwi evaluate --tool copilot --task-set golden-v1
gwi evaluate --tool cursor --task-set golden-v1
```

### 1.3 Security Review Checklist

- [ ] Data handling policy reviewed
- [ ] Code snippets retention policy acceptable
- [ ] SSO/SAML integration available
- [ ] Audit logging capabilities
- [ ] On-prem/VPC deployment option (if required)
- [ ] SOC 2 Type II certified
- [ ] GDPR compliant

---

## Phase 2: Pilot Program (Week 3-6)

### 2.1 Pilot Team Selection

**Criteria for pilot teams:**
- Mix of junior/senior developers
- Variety of tech stacks (frontend, backend, infra)
- Teams with measurable output metrics
- Willing to provide feedback

**Recommended pilot size:** 10-20 developers

### 2.2 Success Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| PR cycle time | Current avg | -20% | Git analytics |
| Code review iterations | Current avg | -30% | PR data |
| Developer satisfaction | Survey | +15 NPS | Monthly survey |
| Test coverage | Current % | +10% | CI reports |
| Bug escape rate | Current rate | -25% | Issue tracking |

### 2.3 Pilot Checkpoints

**Week 2 Checkpoint:**
- [ ] All pilot users onboarded
- [ ] Baseline metrics captured
- [ ] Feedback channel established

**Week 4 Checkpoint:**
- [ ] Mid-pilot survey completed
- [ ] Usage analytics reviewed
- [ ] Blockers identified and addressed

**Week 6 Checkpoint:**
- [ ] Final metrics comparison
- [ ] Go/no-go recommendation
- [ ] Rollout plan drafted

---

## Phase 3: Org-Wide Rollout (Week 7-12)

### 3.1 Rollout Waves

| Wave | Teams | Timeline | Success Gate |
|------|-------|----------|--------------|
| Wave 1 | Engineering leads | Week 7 | 80% active usage |
| Wave 2 | Backend teams | Week 8-9 | 70% active usage |
| Wave 3 | Frontend teams | Week 10 | 70% active usage |
| Wave 4 | All remaining | Week 11-12 | 60% active usage |

### 3.2 Training Requirements

**Mandatory (all developers):**
- Tool basics (30 min)
- Security guidelines (15 min)
- Prompt engineering fundamentals (45 min)

**Optional (power users):**
- Advanced prompting (2 hrs)
- Custom workflows (1 hr)
- Tool customization (1 hr)

### 3.3 Support Structure

| Tier | Response Time | Channel |
|------|---------------|---------|
| Self-service | Immediate | Wiki, FAQ |
| Peer support | < 4 hours | #ai-tools Slack |
| Expert support | < 1 day | Office hours |
| Escalation | < 2 days | IT ticket |

---

## Phase 4: Optimization (Ongoing)

### 4.1 Monthly Review Cadence

1. **Usage analytics review** - Active users, feature adoption
2. **Productivity metrics** - PR velocity, code quality
3. **Cost analysis** - Per-seat ROI calculation
4. **Feedback synthesis** - Survey results, support tickets

### 4.2 Continuous Improvement

- Quarterly prompt pack updates
- Monthly office hours
- Bi-annual tool re-evaluation
- Annual vendor renegotiation

---

## Governance

### Approved Tools

| Tool | Status | Use Cases | Restrictions |
|------|--------|-----------|--------------|
| Claude Code | Approved | All development | No PII in prompts |
| GitHub Copilot | Approved | IDE assistance | No secrets |
| ChatGPT | Limited | Research only | No code, no data |

### Prohibited Actions

- Sharing proprietary code with unapproved tools
- Disabling telemetry without approval
- Using personal accounts for work
- Bypassing security controls

### Compliance Requirements

- All AI-generated code must pass standard code review
- Sensitive projects require human-only development
- Audit trail required for regulated codebases

---

## Related Documents

- [202-DR-TEST-ai-golden-tasks.md](./202-DR-TEST-ai-golden-tasks.md) - Evaluation tasks
- [203-DR-TMPL-ai-prompt-packs.md](./203-DR-TMPL-ai-prompt-packs.md) - Standard prompts
- [204-DR-EVAL-ai-tool-rubrics.md](./204-DR-EVAL-ai-tool-rubrics.md) - Scoring rubrics
- [205-DR-METR-ai-adoption-telemetry.md](./205-DR-METR-ai-adoption-telemetry.md) - Metrics spec
- [206-DR-TRAI-ai-tool-training.md](./206-DR-TRAI-ai-tool-training.md) - Training materials

---

## Appendix A: Quick Start Checklist

```
[ ] Security review complete
[ ] Pilot team identified
[ ] Baseline metrics captured
[ ] Training materials ready
[ ] Support channels established
[ ] Success criteria defined
[ ] Rollout waves planned
[ ] Executive sponsor identified
```

## Appendix B: ROI Calculator

```
Annual savings = (Hours saved × Hourly rate × Developers) - License cost

Example:
- 2 hours/week saved per developer
- $75/hour fully loaded cost
- 50 developers
- $20/month per seat

Savings = (2 × 52 × $75 × 50) - ($20 × 12 × 50)
        = $390,000 - $12,000
        = $378,000/year
```
