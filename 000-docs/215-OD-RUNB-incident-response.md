# Incident Response Runbook

> **Document**: 215-OD-RUNB-incident-response
> **Epic**: EPIC 008 - Incident Response Enhancement
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Standard procedures for handling production incidents in GWI. Covers detection, triage, resolution, and post-incident activities.

---

## Incident Severity Levels

| Severity | Definition | Response Time | Examples |
|----------|------------|---------------|----------|
| **SEV1** | Complete outage, all users affected | 15 min | API down, data loss |
| **SEV2** | Major degradation, most users affected | 30 min | Slow responses, feature broken |
| **SEV3** | Minor issue, some users affected | 2 hours | Edge case bug, UI glitch |
| **SEV4** | Low impact, cosmetic | 24 hours | Documentation, minor UI |

---

## Incident Response Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    INCIDENT RESPONSE WORKFLOW                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │   Detect    │───▶│   Triage    │───▶│   Respond   │                  │
│  │   (Alert)   │    │  (Classify) │    │ (Mitigate)  │                  │
│  └─────────────┘    └─────────────┘    └─────────────┘                  │
│                                                │                         │
│                                                ▼                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │  Postmortem │◀───│   Resolve   │◀───│ Communicate │                  │
│  │   (Learn)   │    │   (Fix)     │    │  (Update)   │                  │
│  └─────────────┘    └─────────────┘    └─────────────┘                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Detection

### Alert Sources

| Source | Channel | Severity | Auto-Page |
|--------|---------|----------|-----------|
| Uptime Check | PagerDuty | SEV1 | Yes |
| Error Rate > 5% | Slack #alerts | SEV2 | Yes |
| Latency P95 > 5s | Slack #alerts | SEV2 | No |
| Queue Depth > 500 | Slack #alerts | SEV2 | Yes |
| Security Finding | PagerDuty | SEV1 | Yes |

### Manual Detection

```bash
# Quick health check
curl -sf https://api.gwi.dev/health | jq .

# Check all services
for service in api gateway webhook worker; do
  echo "=== $service ==="
  gcloud run services describe gwi-$service --region=us-central1 \
    --format='value(status.conditions)'
done

# Recent errors
gcloud logging read 'severity>=ERROR' \
  --project=git-with-intent \
  --limit=20 \
  --format='table(timestamp,jsonPayload.message)'
```

---

## Phase 2: Triage

### Initial Assessment Checklist

```markdown
## Incident Triage

**Time Detected:** ___
**Reported By:** ___
**On-Call:** ___

### Scope Assessment
- [ ] Which services are affected?
- [ ] How many users impacted?
- [ ] Is data at risk?
- [ ] Is this a regression?

### Severity Classification
- [ ] SEV1: Complete outage
- [ ] SEV2: Major degradation
- [ ] SEV3: Minor issue
- [ ] SEV4: Low impact

### Initial Actions
- [ ] Incident channel created
- [ ] Stakeholders notified
- [ ] War room assembled (SEV1/2)
```

### Quick Diagnostic Commands

```bash
# Get recent errors by service
gcloud logging read \
  'resource.type="cloud_run_revision" AND severity>=ERROR' \
  --limit=50 \
  --format='json' | jq -r '.[] | "\(.timestamp) [\(.resource.labels.service_name)] \(.jsonPayload.message // .textPayload)"'

# Check deployment history
gcloud run revisions list --service=gwi-api --region=us-central1 \
  --format='table(name,ready,active,creationTimestamp)'

# Get current traffic split
gcloud run services describe gwi-api --region=us-central1 \
  --format='yaml(spec.traffic)'

# Check run failures
gcloud firestore indexes fields list --collection=runs \
  --filter='status=failed AND timestamp>now-1h'
```

---

## Phase 3: Communication

### Incident Channel

```
#incident-YYYY-MM-DD-brief-description
```

### Slack Templates

**Initial Notification:**
```
🚨 *INCIDENT DECLARED*

*Severity:* SEV2
*Service:* GWI API
*Impact:* Elevated error rates (15%)
*Status:* Investigating

*Incident Lead:* @oncall
*Channel:* #incident-2026-02-03-api-errors

Updates every 15 minutes.
```

**Status Update:**
```
📊 *INCIDENT UPDATE* (15 min)

*Status:* Mitigating
*Root Cause:* Database connection pool exhausted
*Action:* Scaling connection pool, deploying fix

*ETA to Resolution:* 30 minutes
*Customer Impact:* 12% of requests failing

Next update in 15 minutes.
```

**Resolution:**
```
✅ *INCIDENT RESOLVED*

*Duration:* 47 minutes
*Root Cause:* Connection pool exhaustion due to leaked connections
*Resolution:* Deployed connection timeout fix

*Impact Summary:*
- 847 requests failed (0.3% of traffic)
- No data loss

Postmortem scheduled for tomorrow.
```

---

## Phase 4: Mitigation

### Common Mitigations

| Issue | Mitigation | Command |
|-------|------------|---------|
| Bad Deploy | Rollback | `gcloud run services update-traffic gwi-api --to-revisions=PREVIOUS=100` |
| Resource Exhaustion | Scale Up | `gcloud run services update gwi-api --max-instances=50` |
| External Dependency | Circuit Break | Toggle feature flag |
| DDoS/Abuse | Rate Limit | Update WAF rules |
| Data Corruption | Restore | Firestore point-in-time recovery |

### Rollback Procedure

```bash
# List recent revisions
gcloud run revisions list --service=gwi-api --region=us-central1 --limit=5

# Rollback to previous revision
PREVIOUS_REVISION="gwi-api-00012-abc"
gcloud run services update-traffic gwi-api \
  --region=us-central1 \
  --to-revisions=$PREVIOUS_REVISION=100

# Verify rollback
curl -sf https://api.gwi.dev/health | jq .version
```

### Emergency Feature Flags

```bash
# Disable AI agents (reduce load)
gcloud firestore documents update \
  projects/git-with-intent/databases/(default)/documents/config/feature-flags \
  --data='{"ai_enabled": false}'

# Enable maintenance mode
gcloud firestore documents update \
  projects/git-with-intent/databases/(default)/documents/config/feature-flags \
  --data='{"maintenance_mode": true}'
```

---

## Phase 5: Resolution

### Verification Checklist

```markdown
## Resolution Verification

### Service Health
- [ ] All health endpoints returning 200
- [ ] Error rate < 0.1%
- [ ] Latency P95 < 500ms
- [ ] No alerts firing

### Functional Verification
- [ ] Test API endpoints manually
- [ ] Verify webhook processing
- [ ] Check queue processing
- [ ] Confirm agent responses

### Monitoring
- [ ] Dashboards show normal
- [ ] No error spikes
- [ ] Resource utilization normal
```

### Close Incident

```bash
# Archive incident channel
# In Slack: /archive

# Update status page (if applicable)
# Close PagerDuty incident

# Create postmortem issue
gh issue create \
  --title "Postmortem: [DATE] [Brief Description]" \
  --label "postmortem" \
  --body "$(cat <<EOF
## Incident Summary
- **Duration:** X minutes
- **Severity:** SEVX
- **Services Affected:**

## Timeline
- HH:MM - Detected
- HH:MM - Mitigated
- HH:MM - Resolved

## Root Cause
[To be filled in postmortem]

## Action Items
- [ ]
EOF
)"
```

---

## Phase 6: Postmortem

### Postmortem Template

```markdown
# Postmortem: [Date] [Brief Description]

## Summary
One paragraph description of the incident.

## Impact
- Duration: X hours Y minutes
- Users Affected: N
- Requests Failed: N
- Revenue Impact: $X (if applicable)

## Timeline (UTC)
| Time | Event |
|------|-------|
| HH:MM | Alert fired |
| HH:MM | Incident declared |
| HH:MM | Root cause identified |
| HH:MM | Fix deployed |
| HH:MM | Incident resolved |

## Root Cause
Detailed technical explanation of what went wrong.

## Detection
How was the incident detected? Could it have been detected sooner?

## Resolution
What actions were taken to resolve the incident?

## Lessons Learned
### What Went Well
-
-

### What Could Be Improved
-
-

## Action Items
| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| | | | |

## Appendix
- Links to logs
- Links to dashboards
- Incident bundle
```

---

## Incident Bundle Generation

### Auto-Generated Bundle

When an incident is declared, automatically collect:

```typescript
interface IncidentBundle {
  incident_id: string;
  declared_at: Date;
  severity: 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';

  // Context
  affected_services: string[];
  affected_runs: string[];

  // Diagnostics
  logs: {
    service: string;
    entries: LogEntry[];
  }[];

  traces: {
    trace_id: string;
    spans: Span[];
  }[];

  metrics: {
    name: string;
    values: MetricValue[];
  }[];

  // Artifacts
  recent_deploys: Deploy[];
  recent_changes: Commit[];
  config_changes: ConfigChange[];

  // Links
  dashboard_url: string;
  logs_url: string;
  trace_url: string;
}
```

### Bundle Generation Script

```bash
#!/bin/bash
# scripts/generate-incident-bundle.sh

INCIDENT_ID=$1
OUTPUT_DIR="incidents/$INCIDENT_ID"

mkdir -p "$OUTPUT_DIR"

echo "Generating incident bundle for $INCIDENT_ID..."

# Collect logs
echo "Collecting logs..."
gcloud logging read \
  'severity>=WARNING AND timestamp>="2026-02-03T00:00:00Z"' \
  --limit=1000 \
  --format=json > "$OUTPUT_DIR/logs.json"

# Collect recent deploys
echo "Collecting deployment history..."
gcloud run revisions list --service=gwi-api --region=us-central1 \
  --format=json > "$OUTPUT_DIR/deploys.json"

# Collect recent commits
echo "Collecting recent commits..."
git log --since="24 hours ago" --format=json > "$OUTPUT_DIR/commits.json"

# Collect metrics snapshot
echo "Collecting metrics..."
curl -s "https://api.gwi.dev/metrics" > "$OUTPUT_DIR/metrics.txt"

# Generate summary
cat > "$OUTPUT_DIR/BUNDLE_SUMMARY.md" << EOF
# Incident Bundle: $INCIDENT_ID

Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

## Contents
- logs.json - Recent log entries
- deploys.json - Deployment history
- commits.json - Recent commits
- metrics.txt - Metrics snapshot

## Quick Links
- [Logs](https://console.cloud.google.com/logs)
- [Traces](https://console.cloud.google.com/traces)
- [Dashboard](https://console.cloud.google.com/monitoring)
EOF

echo "Bundle generated at $OUTPUT_DIR"
```

---

## Slack Integration

### Oncall Workflow

```yaml
# .github/workflows/oncall-notify.yml
name: Oncall Notification

on:
  schedule:
    - cron: '0 9 * * 1'  # Monday 9am UTC

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Get Oncall Schedule
        id: oncall
        run: |
          # Get current oncall from PagerDuty
          ONCALL=$(curl -s -H "Authorization: Token token=${{ secrets.PAGERDUTY_TOKEN }}" \
            "https://api.pagerduty.com/oncalls?schedule_ids[]=${{ vars.PAGERDUTY_SCHEDULE }}" \
            | jq -r '.oncalls[0].user.summary')
          echo "oncall=$ONCALL" >> $GITHUB_OUTPUT

      - name: Notify Slack
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "📞 Oncall This Week: ${{ steps.oncall.outputs.oncall }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Oncall This Week*\n\n👤 ${{ steps.oncall.outputs.oncall }}\n📅 $(date +%Y-%m-%d) - $(date -d '+7 days' +%Y-%m-%d)\n\n*Resources:*\n• <https://runbooks.gwi.dev|Runbooks>\n• <https://dashboard.gwi.dev|Dashboard>\n• <https://pagerduty.com|PagerDuty>"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_ONCALL_WEBHOOK }}
```

### Slack Bot Commands

| Command | Action |
|---------|--------|
| `/incident declare SEV2 API errors` | Create incident channel |
| `/incident status` | Show current incidents |
| `/incident update <message>` | Post status update |
| `/incident resolve` | Close incident |
| `/oncall` | Show current oncall |
| `/runbook <name>` | Link to runbook |

---

## Escalation Path

```
SEV1: Oncall → Engineering Lead → CTO (15 min escalation)
SEV2: Oncall → Engineering Lead (30 min escalation)
SEV3: Oncall (no auto-escalation)
SEV4: Ticket queue
```

### Escalation Contacts

| Role | Name | Phone | Slack |
|------|------|-------|-------|
| Primary Oncall | (rotates) | PagerDuty | @oncall |
| Engineering Lead | - | - | @eng-lead |
| CTO | - | - | @cto |

---

## Related Documentation

- [216-DR-SPEC-failure-context-pages.md](./216-DR-SPEC-failure-context-pages.md)
- [032-OD-RUNB-observability-operations.md](./032-OD-RUNB-observability-operations.md)
- [112-DR-RUNB-disaster-recovery-runbook.md](./112-DR-RUNB-disaster-recovery-runbook.md)
