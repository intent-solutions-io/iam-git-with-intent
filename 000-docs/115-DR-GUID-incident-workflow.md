# Incident Workflow

> **Document**: 115-DR-GUID-incident-workflow.md
> **Created**: 2025-12-18 03:15 CST
> **Phase**: 33 (Post-GA Ops & Customer Onboarding)
> **Status**: Living document

## 1. Overview

This document defines the incident management workflow for Git With Intent (GWI).

### 1.1 Incident Lifecycle

```
Detection → Triage → Response → Resolution → Post-Incident
   (5min)    (10min)   (varies)    (verify)     (24-48h)
```

## 2. Incident Severity Levels

| Severity | Definition | Response Time | Escalation |
|----------|------------|---------------|------------|
| SEV1 | Service down, all customers affected | 15 min | Immediate |
| SEV2 | Major feature broken, many customers | 1 hour | 30 min if no progress |
| SEV3 | Minor feature broken, some customers | 4 hours | 2 hours if no progress |
| SEV4 | Cosmetic or minor issue | Next business day | None |

### 2.1 SEV1 Examples
- API returning 5xx for all requests
- GitHub webhook processing completely stopped
- Authentication system down
- Data breach or security incident

### 2.2 SEV2 Examples
- Specific agent (Triage, Coder, etc.) failing
- High error rate (>10%) but service partially functional
- Delayed webhook processing (>5 minutes)
- Dashboard unreachable

### 2.3 SEV3 Examples
- Single customer affected
- Non-critical feature broken
- Degraded performance (within SLO)
- UI rendering issues

### 2.4 SEV4 Examples
- Documentation typos
- Minor UI polish issues
- Feature requests misclassified as bugs

## 3. Detection

### 3.1 Automated Detection

| Source | Alert Type | Routing |
|--------|-----------|---------|
| Cloud Monitoring | Error rate > 5% | PagerDuty → On-call |
| Cloud Monitoring | Latency P95 > 5s | PagerDuty → On-call |
| Cloud Monitoring | Service down | PagerDuty → On-call |
| Uptime checks | Health endpoint failing | PagerDuty → On-call |

### 3.2 Customer-Reported

| Channel | SLA | Handler |
|---------|-----|---------|
| support@gitwithintent.dev | 24h (Team), 4h (Business) | Support queue |
| Status page report | 4h | On-call |
| GitHub Issues (GWI repo) | Best effort | Engineering |

### 3.3 Internal Detection

- Engineering notices during development
- QA/testing finds issues
- Proactive monitoring review

## 4. Triage

### 4.1 Initial Assessment (First 5 minutes)

1. **Acknowledge alert** in PagerDuty
2. **Assess scope**:
   - How many customers affected?
   - Which services/features impacted?
   - Is there data loss risk?
3. **Assign severity** based on criteria above
4. **Create incident channel** (if SEV1/SEV2):
   - Slack: `#incident-YYYY-MM-DD-brief-description`
   - Or equivalent communication channel

### 4.2 Triage Checklist

```markdown
## Incident Triage Checklist
- [ ] Alert acknowledged
- [ ] Scope assessed (customers/services affected)
- [ ] Severity assigned: SEV__
- [ ] Incident channel created (SEV1/2)
- [ ] Incident commander assigned (SEV1/2)
- [ ] Status page updated
```

## 5. Response

### 5.1 Roles

| Role | Responsibility |
|------|---------------|
| Incident Commander (IC) | Owns incident, coordinates response |
| Technical Lead | Drives investigation and fix |
| Communications Lead | Customer/stakeholder updates |
| Scribe | Documents timeline and decisions |

For SEV3/4, a single engineer may fill all roles.

### 5.2 Response Flow

```
1. Gather initial data
   - Recent deployments
   - Error logs
   - Metrics graphs

2. Form hypothesis
   - What changed?
   - What's the blast radius?

3. Implement mitigation
   - Rollback if deployment-related
   - Scale up if capacity-related
   - Disable feature if specific to feature

4. Verify mitigation
   - Confirm metrics improving
   - Test affected functionality

5. Customer communication
   - Update status page
   - Direct notification if needed
```

### 5.3 Communication Templates

#### Status Page Update (Investigating)
```
[TIMESTAMP] Investigating: [Brief description]
We are aware of issues affecting [service/feature] and are actively investigating.
We will provide updates as we learn more.
```

#### Status Page Update (Identified)
```
[TIMESTAMP] Identified: [Root cause summary]
We have identified the cause of [issue]. We are implementing a fix.
Expected resolution: [ETA if known]
```

#### Status Page Update (Resolved)
```
[TIMESTAMP] Resolved: [Brief resolution]
The issue has been resolved. [Service/feature] is operating normally.
We apologize for any inconvenience and will publish a post-incident report.
```

### 5.4 Escalation Path

| Condition | Action |
|-----------|--------|
| No progress after 30 min (SEV1) | Escalate to engineering lead |
| No progress after 1 hour (SEV2) | Escalate to engineering lead |
| Security incident suspected | Escalate to security team immediately |
| Customer data affected | Escalate to legal/compliance |

## 6. Resolution

### 6.1 Verification Checklist

```markdown
## Resolution Verification
- [ ] Primary symptoms resolved
- [ ] Metrics returned to baseline
- [ ] Error rate < 1%
- [ ] Affected customers verified functional
- [ ] Rollback point documented (if applicable)
```

### 6.2 Closure Criteria

- All affected services functioning normally
- Customer-facing impact ended
- No elevated error rates
- Status page updated to "Resolved"

## 7. Post-Incident

### 7.1 Timeline

| Activity | Deadline |
|----------|----------|
| Incident summary posted | 24 hours |
| Post-incident review scheduled | 48 hours |
| Full postmortem published | 1 week |
| Action items tracked | 2 weeks |

### 7.2 Postmortem Template

```markdown
# Postmortem: [Incident Title]

**Date**: YYYY-MM-DD
**Duration**: X hours Y minutes
**Severity**: SEV#
**Author**: [Name]
**Status**: Draft/Published

## Summary
[2-3 sentence summary of what happened and impact]

## Impact
- Customers affected: X
- Services impacted: [list]
- Duration: X hours
- Data loss: Yes/No

## Timeline (UTC)
| Time | Event |
|------|-------|
| HH:MM | First alert triggered |
| HH:MM | Incident declared |
| HH:MM | Root cause identified |
| HH:MM | Fix deployed |
| HH:MM | Incident resolved |

## Root Cause
[Detailed technical explanation of what went wrong]

## Resolution
[What was done to fix the issue]

## Lessons Learned
### What went well
- [Point 1]

### What could be improved
- [Point 1]

## Action Items
| Item | Owner | Due Date | Status |
|------|-------|----------|--------|
| [Task] | [Name] | YYYY-MM-DD | Open |

## Prevention
[How we'll prevent this from happening again]
```

### 7.3 Blameless Culture

- Focus on systems, not individuals
- Ask "what" and "how", not "who"
- Every incident is a learning opportunity
- Improvements benefit everyone

## 8. Tools

| Tool | Purpose | Access |
|------|---------|--------|
| Cloud Monitoring | Metrics, alerting | GCP Console |
| Cloud Logging | Log analysis | GCP Console |
| PagerDuty | On-call alerting | pagerduty.com |
| Status Page | Customer communication | status.gitwithintent.dev |
| Slack | Team coordination | Internal |

## 9. On-Call

### 9.1 On-Call Rotation

- **Primary**: First responder, 24/7 coverage
- **Secondary**: Backup, escalation target
- **Rotation**: Weekly, handoff on Mondays

### 9.2 On-Call Expectations

- Acknowledge alerts within 5 minutes
- Triage within 15 minutes
- Escalate if unable to resolve
- Document all actions taken

### 9.3 On-Call Handoff

```markdown
## On-Call Handoff
**From**: [Name]
**To**: [Name]
**Date**: YYYY-MM-DD

### Active Incidents
- [None / List]

### Recent Notable Events
- [Event 1]

### Upcoming Changes
- [Deployment, maintenance, etc.]

### Notes
- [Any context for incoming on-call]
```

## 10. Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-12-18 | Claude Code | Initial incident workflow |
