# Incident Response

What to do when something goes wrong with GWI runs, agents, or infrastructure.

## When to Use

- A GWI run failed unexpectedly
- AI generated incorrect or harmful code
- Production service is down or degraded
- Security incident detected
- Data integrity issue discovered

## Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| P0 | System down | Immediate | API unreachable, data loss |
| P1 | Major degradation | < 15 min | Runs failing 50%+, security breach |
| P2 | Partial impact | < 1 hour | Slow responses, minor feature broken |
| P3 | Minor issue | < 24 hours | Cosmetic bugs, edge cases |

## Path A: Failed Run

### Step 1: Get Run Status

```bash
gwi run status <run-id>
```

**Output:**
```
Run: abc123
Status: failed
Error: "API rate limit exceeded"

Steps:
  ✓ triage (2.3s)
  ✓ analyze (5.1s)
  ✗ generate (failed after 12.4s)

Artifacts:
  .gwi/runs/abc123/
```

### Step 2: Check Logs

```bash
# View audit log
cat .gwi/runs/abc123/audit.log

# Diagnose the run
gwi diagnose abc123 --verbose
```

### Step 3: Check Environment

```bash
# Verify configuration
gwi doctor --verbose

# Check API keys
echo $ANTHROPIC_API_KEY | head -c 10
echo $GITHUB_TOKEN | head -c 10
```

### Step 4: Retry or Escalate

If transient error (rate limit, network):
```bash
# Wait and retry
sleep 60
gwi <original-command>
```

If persistent error:
```bash
# Check for known issues
gh issue list --label bug

# Report if new
gh issue create --title "Run failure: <description>"
```

## Path B: Bad AI Output

AI generated incorrect, harmful, or nonsensical code.

### Step 1: Don't Approve

If you see problematic output:
```bash
# Do NOT run this:
# gwi run approve <id>  # DON'T!
```

### Step 2: Document the Issue

```bash
# Save the bad output
cp .gwi/runs/<id>/ /tmp/bad-run-backup/

# Check what was generated
cat .gwi/runs/<id>/patch.diff
```

### Step 3: Understand Why

```bash
# Get the decision trace
gwi explain <run-id>

# Check the input
cat .gwi/runs/<id>/run.json | jq '.input'
```

### Step 4: Report for Improvement

```bash
# Create issue with details
gh issue create \
  --title "AI generated incorrect output" \
  --body "Run ID: <id>
Expected: <what should have happened>
Actual: <what happened>
Artifacts attached."
```

### Step 5: Clean Up

```bash
# Cancel the run if pending
gwi run cancel <id>

# Manual fix if needed
# ... make changes yourself ...
```

## Path C: Service Outage

### Step 1: Identify Scope

```bash
# Check which services are affected
gwi status
curl https://api.gwi.example.com/health
gh api rate_limit
```

### Step 2: Check External Dependencies

| Service | Check Command |
|---------|---------------|
| GitHub | `gh api rate_limit` |
| Anthropic | `curl https://api.anthropic.com/health` |
| Google AI | `curl https://generativelanguage.googleapis.com/` |
| GCP | `gcloud services list --enabled` |

### Step 3: Check Logs

```bash
# Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision" --limit 50

# Local logs
tail -100 ~/.gwi/logs/latest.log
```

### Step 4: Mitigation

**If rate limited:**
- Wait for limit reset
- Switch to backup API key
- Reduce request frequency

**If external service down:**
- Wait for recovery
- Use alternative provider if available
- Fall back to manual workflow

**If GWI service down:**
- Check Cloud Run status
- Review recent deployments
- Rollback if recent deploy caused issue

### Step 5: Communicate

```bash
# Update status page or notify team
# Post in #incidents channel
# Email affected users if necessary
```

## Path D: Security Incident

### Step 1: Contain

```bash
# Revoke compromised credentials immediately
# If API key leaked:
# - Anthropic: https://console.anthropic.com/account/keys
# - GitHub: https://github.com/settings/tokens
# - Google: https://console.cloud.google.com/apis/credentials
```

### Step 2: Assess

```bash
# Check audit logs for unauthorized access
gwi audit export --format json --output incident-audit.json

# Review recent runs
gwi run list --limit 100
```

### Step 3: Remediate

- Rotate all potentially compromised credentials
- Review code changes made during incident window
- Check for unauthorized PRs or commits

### Step 4: Document

Create incident report:
- Timeline of events
- Impact assessment
- Root cause analysis
- Remediation steps taken
- Prevention measures

## Forensics Tools

### Replay a Run

```bash
# Enable forensics
export GWI_FORENSICS_ENABLED=1

# Replay to understand what happened
gwi forensics replay .gwi/runs/<id>/bundle.json

# View timeline
gwi forensics timeline .gwi/runs/<id>/bundle.json
```

### Audit Trail

```bash
# Export audit logs
gwi audit export --format json --output audit.json

# Verify integrity
gwi audit verify --tenant my-team

# Query specific time range
gwi audit export --since 2026-02-01 --until 2026-02-02
```

### Dead Letter Queue

Failed async operations go to DLQ:

```bash
# List failed items
gwi forensics dlq list

# Inspect an item
gwi forensics dlq show <item-id>

# Retry after fixing
gwi forensics dlq replay <item-id>
```

## Recovery Checklist

After any incident:

- [ ] Immediate threat contained
- [ ] Root cause identified
- [ ] Fix deployed or workaround in place
- [ ] Affected users notified
- [ ] Incident documented
- [ ] Post-mortem scheduled (for P0/P1)
- [ ] Prevention measures identified
- [ ] Monitoring improved

## Escalation Path

1. **Self-service** - Use diagnostic tools
2. **Documentation** - Check docs and known issues
3. **GitHub Issues** - Search/create issues
4. **Direct contact** - security@intentsolutions.io (security only)

## Tips

- **Don't panic** - Methodical debugging is faster
- **Preserve evidence** - Copy artifacts before investigating
- **Communicate early** - Let affected parties know
- **Learn from incidents** - Every failure is an improvement opportunity
