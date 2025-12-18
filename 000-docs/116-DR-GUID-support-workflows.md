# Support Workflows

> **Document**: 116-DR-GUID-support-workflows.md
> **Created**: 2025-12-18 03:20 CST
> **Phase**: 33 (Post-GA Ops & Customer Onboarding)
> **Status**: Living document

## 1. Overview

This document defines support workflows for Git With Intent (GWI) customer support operations.

### 1.1 Support Channels

| Channel | Response SLA | Hours | Tier |
|---------|-------------|-------|------|
| support@gitwithintent.dev | Plan-based | 24/7 intake | All |
| In-app chat | 4h (Business+) | Business hours | Business+ |
| Phone | 1h (Enterprise) | Business hours | Enterprise |
| GitHub Issues | Best effort | Async | All |

### 1.2 Response SLAs by Plan

| Plan | First Response | Resolution Target |
|------|---------------|-------------------|
| Free | Best effort | Community/docs |
| Team | 24 hours | 72 hours |
| Business | 4 hours | 24 hours |
| Enterprise | 1 hour | 8 hours |

## 2. Ticket Intake

### 2.1 Email Intake

All emails to support@gitwithintent.dev are automatically:
1. Parsed for customer identification
2. Categorized by keywords
3. Assigned priority based on plan
4. Routed to appropriate queue

### 2.2 Required Information

```markdown
## Support Request Template

**Your email**: (for account lookup)
**Organization**: (if applicable)
**Affected repo(s)**: (GitHub URL)
**Issue type**: [Bug / Feature Request / Question / Account]

**Description**:
[Describe the issue or question]

**Steps to reproduce** (if applicable):
1.
2.
3.

**Expected behavior**:

**Actual behavior**:

**Screenshots/logs**: (attach if available)
```

### 2.3 Auto-Categorization Rules

| Keyword | Category | Queue |
|---------|----------|-------|
| "cannot log in", "login failed" | Auth | Authentication |
| "webhook", "not triggering" | Integration | Webhooks |
| "billing", "charge", "invoice" | Billing | Billing |
| "slow", "timeout" | Performance | Engineering |
| "error", "failed" | Bug | General |
| "feature", "request", "would like" | Feature | Product |

## 3. Triage

### 3.1 Triage Criteria

| Priority | Criteria | Response |
|----------|----------|----------|
| P1 | Service down for customer | Immediate |
| P2 | Feature broken, workaround exists | 4 hours |
| P3 | Question, minor issue | 24 hours |
| P4 | Feature request, feedback | Backlog |

### 3.2 Triage Workflow

```
1. Identify customer and plan
   - Check email domain in Firestore
   - Verify plan tier
   - Note any special handling

2. Categorize issue
   - Bug, question, feature, account
   - Apply auto-categorization
   - Override if needed

3. Assess urgency
   - Is service completely blocked?
   - Is there a workaround?
   - How many users affected?

4. Assign priority and route
   - P1/P2: Direct to on-call
   - P3: Support queue
   - P4: Product backlog
```

### 3.3 Triage Checklist

```markdown
## Triage Checklist
- [ ] Customer identified
- [ ] Plan verified
- [ ] Category assigned
- [ ] Priority assigned
- [ ] Routed to correct queue
- [ ] Initial response sent (if SLA requires)
```

## 4. Response Templates

### 4.1 Initial Response - Received

```
Subject: Re: [Your subject] - Ticket #[ID]

Hi [Name],

Thank you for contacting Git With Intent support. We've received your request
and a team member will respond within [SLA timeframe based on plan].

Ticket ID: #[ID]
Category: [Category]
Priority: [Priority]

In the meantime, you might find these resources helpful:
- Documentation: https://docs.gitwithintent.dev
- Status page: https://status.gitwithintent.dev
- FAQ: https://docs.gitwithintent.dev/faq

Best regards,
GWI Support Team
```

### 4.2 Follow-up - Need More Information

```
Subject: Re: [Your subject] - Ticket #[ID]

Hi [Name],

Thank you for reaching out. To help resolve your issue, could you please provide:

1. [Specific question 1]
2. [Specific question 2]
3. Any error messages you're seeing
4. [Any screenshots or logs if applicable]

Once we have this information, we'll be better able to assist you.

Best regards,
[Agent Name]
GWI Support
```

### 4.3 Resolution - Issue Fixed

```
Subject: Re: [Your subject] - Ticket #[ID] - Resolved

Hi [Name],

Great news! Your issue has been resolved.

**Solution**: [Brief explanation of what was done]

If you have any further questions or issues, please don't hesitate to reach out.

Thank you for using Git With Intent!

Best regards,
[Agent Name]
GWI Support
```

### 4.4 Resolution - Known Issue / Workaround

```
Subject: Re: [Your subject] - Ticket #[ID]

Hi [Name],

Thank you for reporting this issue. We've identified this as a known issue
that our team is actively working on.

**Workaround**: [Steps to work around the issue]

**Expected fix**: [Timeline if known, or "We'll notify you when resolved"]

We apologize for any inconvenience and appreciate your patience.

Best regards,
[Agent Name]
GWI Support
```

### 4.5 Feature Request Acknowledgment

```
Subject: Re: [Your subject] - Ticket #[ID]

Hi [Name],

Thank you for your feature suggestion! We've logged this request:

**Feature**: [Summary of the request]

Our product team reviews all suggestions, and we prioritize based on customer
impact and alignment with our roadmap.

While we can't guarantee implementation timelines, we do value your input
in shaping GWI's future.

Best regards,
[Agent Name]
GWI Support
```

### 4.6 Escalation to Engineering

```
Subject: Re: [Your subject] - Ticket #[ID] - Escalated

Hi [Name],

I've escalated your issue to our engineering team for deeper investigation.

You can expect an update within [timeframe].

**What happens next**:
1. Engineering will review the technical details
2. They may reach out if they need additional information
3. We'll update you with findings and next steps

Thank you for your patience.

Best regards,
[Agent Name]
GWI Support
```

## 5. Escalation

### 5.1 Escalation Triggers

| Condition | Escalation |
|-----------|------------|
| Enterprise customer with P1 | Immediate to engineering lead |
| SLA at risk | Manager notification |
| Security/privacy concern | Security team |
| Billing dispute > $500 | Finance |
| Legal mention | Legal team |
| Frustrated customer (3+ interactions) | Team lead |

### 5.2 Escalation Workflow

```
1. Document escalation reason
   - Why is this being escalated?
   - What has been tried?
   - Customer sentiment

2. Notify appropriate party
   - Engineering: technical issues
   - Product: feature gaps causing pain
   - Finance: billing disputes
   - Legal: legal/compliance

3. Warm handoff
   - Brief the escalation target
   - Provide all context
   - Remain available for questions

4. Follow up
   - Track escalation progress
   - Update customer on status
   - Close loop when resolved
```

### 5.3 Escalation Contacts

| Type | Primary | Backup |
|------|---------|--------|
| Engineering | engineering-lead@gwi | on-call |
| Product | product@gwi | founders |
| Billing | billing@gwi | finance |
| Security | security@gwi | engineering-lead |
| Legal | legal@gwi | founders |

## 6. Common Issues & Resolutions

### 6.1 Authentication

| Issue | Resolution |
|-------|------------|
| "Cannot log in" | Verify account exists, check OAuth, clear cookies |
| "SSO not working" | Verify IdP config, check callback URLs |
| "Invitation expired" | Resend invitation from admin panel |

### 6.2 Webhooks

| Issue | Resolution |
|-------|------------|
| "Webhooks not triggering" | Check GitHub App installation, verify repo access |
| "Webhook errors" | Check logs, verify firewall allows GitHub IPs |
| "Duplicate events" | Check for multiple installations, review idempotency |

### 6.3 Runs

| Issue | Resolution |
|-------|------------|
| "Run stuck" | Check rate limits, verify plan quota |
| "Run failed" | Review error logs, check issue format |
| "Wrong changes" | Review issue clarity, adjust prompts |

### 6.4 Billing

| Issue | Resolution |
|-------|------------|
| "Unexpected charge" | Review usage, explain metering |
| "Plan upgrade" | Guide through billing portal |
| "Refund request" | Follow refund policy, escalate if needed |

## 7. Metrics & Quality

### 7.1 Key Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| First Response Time | Within SLA | Ticket created → First human response |
| Resolution Time | Within SLA | Ticket created → Ticket closed |
| Customer Satisfaction | > 90% | Post-resolution survey |
| First Contact Resolution | > 70% | Resolved on first interaction |
| Escalation Rate | < 10% | Escalated / Total tickets |

### 7.2 Quality Assurance

- Weekly ticket review (random sample)
- Customer satisfaction surveys
- Agent coaching based on feedback
- Template effectiveness review

## 8. Knowledge Base

### 8.1 Self-Service Resources

| Resource | URL |
|----------|-----|
| Documentation | docs.gitwithintent.dev |
| FAQ | docs.gitwithintent.dev/faq |
| Status Page | status.gitwithintent.dev |
| API Reference | docs.gitwithintent.dev/api |
| Changelog | docs.gitwithintent.dev/changelog |

### 8.2 Deflection Strategy

1. **Auto-suggest articles** based on keywords
2. **Interactive troubleshooting** for common issues
3. **In-app help** with contextual guidance
4. **Community forum** for peer support (future)

## 9. Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-12-18 | Claude Code | Initial support workflows |
