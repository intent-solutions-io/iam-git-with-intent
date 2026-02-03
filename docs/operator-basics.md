# Operator Basics

Essential operations knowledge for running and maintaining GWI.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         GWI Architecture                         │
├─────────────────────────────────────────────────────────────────┤
│  CLI (gwi)                                                       │
│    └─→ Local execution, artifacts in .gwi/runs/                  │
├─────────────────────────────────────────────────────────────────┤
│  Cloud Services (optional)                                       │
│    ├─→ gwi-api (Cloud Run) - REST API                           │
│    ├─→ gwi-gateway (Cloud Run) - A2A coordination               │
│    ├─→ gwi-webhook (Cloud Run) - GitHub webhooks                │
│    ├─→ gwi-worker (Cloud Run) - Background jobs                 │
│    └─→ Firestore - Operational database                         │
├─────────────────────────────────────────────────────────────────┤
│  External Dependencies                                           │
│    ├─→ GitHub API - Repository operations                       │
│    ├─→ Anthropic API - Claude models                            │
│    └─→ Google AI API - Gemini models                            │
└─────────────────────────────────────────────────────────────────┘
```

## Health Checks

### Local Health

```bash
# Comprehensive health check
gwi doctor --verbose

# Quick check
gwi doctor
```

**Output:**
```
GWI Doctor

Environment:
  ✓ Node.js 20.10.0
  ✓ npm 10.2.0
  ✓ git 2.43.0

API Keys:
  ✓ ANTHROPIC_API_KEY configured
  ✓ GOOGLE_AI_API_KEY configured
  ✓ GITHUB_TOKEN configured

Connectivity:
  ✓ GitHub API reachable
  ✓ Anthropic API reachable
  ✓ Google AI API reachable

Storage:
  ✓ .gwi/ directory exists
  ✓ Runs directory writable

Status: Healthy
```

### Cloud Service Health

```bash
# Check Cloud Run services
gcloud run services list --platform managed

# Individual service health
curl https://gwi-api-xxxxx.run.app/health
curl https://gwi-gateway-xxxxx.run.app/health
curl https://gwi-webhook-xxxxx.run.app/health
```

### External API Health

```bash
# GitHub
gh api rate_limit

# Anthropic
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-haiku-20240307","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}' \
  | jq '.type'
# Should return "message"

# Google AI
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GOOGLE_AI_API_KEY" \
  | jq '.models | length'
# Should return a number
```

## Logging

### Run Logs

Every run creates artifacts:

```
.gwi/runs/<run-id>/
├── run.json          # Run metadata
├── triage.json       # Complexity analysis
├── plan.json         # Execution plan
├── patch.diff        # Generated changes
├── review.json       # Review findings
├── approval.json     # Approval record
└── audit.log         # JSONL event log
```

### Reading Logs

```bash
# List recent runs
gwi run list

# Run details
gwi run status <run-id>

# Raw audit log
cat .gwi/runs/<run-id>/audit.log | jq .

# Filter audit events
cat .gwi/runs/<run-id>/audit.log | jq 'select(.event == "error")'
```

### Cloud Logs

```bash
# All GWI services
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name=~"gwi-"' \
  --limit 100 --format json

# Specific service
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="gwi-api"' \
  --limit 50

# Errors only
gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR' \
  --limit 20
```

## Run Management

### Listing Runs

```bash
# Recent runs
gwi run list

# With status filter
gwi run list --status failed
gwi run list --status pending
gwi run list --status completed

# JSON output for scripting
gwi run list --json
```

### Run Details

```bash
# Full status
gwi run status <run-id>

# Specific fields
gwi run status <run-id> --json | jq '.status'
```

### Canceling Runs

```bash
# Cancel a pending run
gwi run cancel <run-id>
```

### Cleaning Up

```bash
# Remove old runs (keeps last 50)
find .gwi/runs -maxdepth 1 -type d -mtime +30 -exec rm -rf {} \;

# Archive specific run
tar -czf run-backup.tar.gz .gwi/runs/<run-id>
```

## Replay and Debugging

### Enable Forensics

```bash
export GWI_FORENSICS_ENABLED=1
```

### Replay a Run

```bash
# Check forensics status
gwi forensics status

# Replay a bundle
gwi forensics replay .gwi/runs/<run-id>/bundle.json

# View timeline
gwi forensics timeline .gwi/runs/<run-id>/bundle.json

# Validate integrity
gwi forensics validate .gwi/runs/<run-id>/bundle.json
```

### Dead Letter Queue

Failed async operations:

```bash
# List DLQ items
gwi forensics dlq list

# View item details
gwi forensics dlq show <item-id>

# Retry an item
gwi forensics dlq replay <item-id>

# Clear old items
gwi forensics dlq clear --older-than 7d
```

### Explain Decisions

```bash
# Why did AI do something?
gwi explain <run-id>

# Specific step
gwi explain <run-id> --step coder
gwi explain <run-id> --step resolver
```

## Audit Trail

### Export Audits

```bash
# JSON format
gwi audit export --format json --output audit.json

# CSV format
gwi audit export --format csv --output audit.csv

# Time-bounded
gwi audit export --since 2026-02-01 --until 2026-02-03
```

### Verify Integrity

```bash
# Verify entire audit chain
gwi audit verify --tenant my-team

# Verify specific range
gwi audit verify --start-sequence 100 --end-sequence 200
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes* | Claude API access |
| `GOOGLE_AI_API_KEY` | Yes* | Gemini API access |
| `GITHUB_TOKEN` | Yes | GitHub API access |
| `GWI_STORE_BACKEND` | No | `firestore` or `sqlite` (default: sqlite) |
| `GCP_PROJECT_ID` | No | For Cloud services |
| `GWI_FORENSICS_ENABLED` | No | Enable forensics features |
| `GWI_LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` |

*At least one AI provider required.

### Storage Backends

**SQLite (default, local):**
```bash
export GWI_STORE_BACKEND=sqlite
# Data stored in .gwi/
```

**Firestore (production):**
```bash
export GWI_STORE_BACKEND=firestore
export GCP_PROJECT_ID=your-project
# Requires GCP authentication
```

## Monitoring

### Key Metrics

| Metric | Where | Alert Threshold |
|--------|-------|-----------------|
| Run success rate | Audit logs | < 90% |
| API latency | Cloud Monitoring | > 5s |
| Error rate | Cloud Logging | > 5% |
| Token usage | Provider dashboards | Budget limits |

### Setting Up Alerts

```bash
# Cloud Monitoring alert policy (example)
gcloud alpha monitoring policies create \
  --display-name="GWI High Error Rate" \
  --condition-display-name="Error rate > 5%" \
  --condition-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_count" AND metric.labels.response_code_class="5xx"'
```

## Troubleshooting

### Common Issues

| Issue | Check | Fix |
|-------|-------|-----|
| "API key invalid" | `gwi doctor` | Regenerate key |
| "Rate limited" | Provider dashboard | Wait or upgrade plan |
| "Run timeout" | Audit logs | Reduce scope or retry |
| "Cannot push" | `gh auth status` | Re-authenticate |
| "Firestore error" | GCP permissions | Check IAM roles |

### Debug Mode

```bash
# Verbose output
gwi --verbose <command>

# Debug logging
GWI_LOG_LEVEL=debug gwi <command>
```

### Reset State

```bash
# Clear local runs
rm -rf .gwi/runs/*

# Reset configuration
rm -rf .gwi/config.json

# Full reset
rm -rf .gwi/
gwi init
```

## Maintenance

### Regular Tasks

| Task | Frequency | Command |
|------|-----------|---------|
| Clean old runs | Weekly | `find .gwi/runs -mtime +30 -delete` |
| Rotate API keys | Monthly | Provider dashboards |
| Check for updates | Weekly | `npm outdated` |
| Review audit logs | Weekly | `gwi audit export` |
| Run ARV | Before release | `npm run arv` |

### Backup

```bash
# Backup runs
tar -czf gwi-backup-$(date +%Y%m%d).tar.gz .gwi/

# Backup Firestore
gcloud firestore export gs://your-bucket/backup-$(date +%Y%m%d)
```

## Emergency Contacts

- **Security issues:** security@intentsolutions.io
- **Bug reports:** GitHub Issues
- **General support:** jeremy@intentsolutions.io
