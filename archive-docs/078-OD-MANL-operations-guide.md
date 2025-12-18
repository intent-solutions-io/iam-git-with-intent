# Git With Intent - Operations Guide

## Meta

| Field | Value |
|-------|-------|
| Document ID | 078-OD-MANL |
| Title | Operations Guide |
| Repo/App | git-with-intent |
| Owner | Claude (gwi-foreman) |
| Date/Time | 2025-12-16 23:45 CST |
| Status | **ACTIVE** |

---

## Overview

This guide covers operator tooling for Git With Intent (GWI). Use these commands to diagnose environment issues, debug failed runs, and maintain system health.

---

## Operator Commands

### gwi doctor

Health check for environment configuration.

```bash
# Basic health check
gwi doctor

# Verbose output with connector details
gwi doctor --verbose

# JSON output for automation
gwi doctor --json
```

**What it checks:**
- Node.js and npm versions (requires Node 18+)
- Repository root and git status
- GWI data directory (~/.gwi)
- Connectors registry (installed connectors)
- Environment variables (set/unset, never prints secrets)
- AI provider configuration (Anthropic or Google)
- ARV last known status

**Exit codes:**
- 0: Environment healthy
- 1: Critical errors found

---

### gwi diagnose <run-id>

Debug a specific run.

```bash
# Basic diagnosis
gwi diagnose run-abc123

# Verbose with audit events
gwi diagnose run-abc123 --verbose

# JSON output
gwi diagnose run-abc123 --json
```

**What it shows:**
- Run metadata (type, status, duration)
- Step progression with timing
- Error details and reason codes
- Recommendations for next actions

---

## Common Issues and Recovery

### 1. API Key Not Set

**Symptom:** `gwi doctor` shows `AI provider: none`

**Fix:**
```bash
export ANTHROPIC_API_KEY=sk-ant-...
# OR
export GOOGLE_AI_API_KEY=...
```

### 2. GitHub Token Missing

**Symptom:** `gwi doctor` shows `ENV: GITHUB_TOKEN: unset`

**Fix:**
```bash
export GITHUB_TOKEN=ghp_...
# OR use GitHub CLI
gh auth login
```

### 3. Run Failed with Rate Limit

**Symptom:** `gwi diagnose` shows "rate limit" in error

**Fix:** Wait and retry. Rate limits typically reset in 1-60 minutes depending on the API.

### 4. Run Failed with Policy Denied

**Symptom:** `gwi diagnose` shows `POLICY_DENIED`

**Fix:** Review policy configuration or request elevated permissions for the operation.

### 5. Run Stuck in Running State

**Symptom:** Run shows `status: running` but no progress

**Possible causes:**
- Cloud Run instance restarted (step state is in-memory)
- Network timeout to external API

**Fix:**
```bash
# Cancel stuck run
gwi run cancel <run-id>

# Restart workflow
gwi workflow start <type> --pr-url <url>
```

### 6. Connector Checksum Mismatch

**Symptom:** ARV connector supply chain fails

**Fix:** Regenerate connector checksums:
```bash
# Verify connector integrity
npx tsx scripts/arv/connector-supply-chain.ts

# If checksum changed, update manifest
cd connectors/<name>@<version>
# Update checksum in connector.manifest.json
```

---

## ARV (Agent Readiness Verification)

ARV validates system readiness before deployment.

```bash
# Run full ARV suite
npm run arv

# Individual checks
npm run arv:lint        # Forbidden patterns
npm run arv:contracts   # Contract tests
npm run arv:goldens     # Golden tests
npm run arv:smoke       # Smoke tests
```

**ARV checks:**
1. **Forbidden Patterns** - No secret leaks, no eval(), etc.
2. **Contract Tests** - Agent interfaces validated
3. **Golden Tests** - Output format stability
4. **Smoke Tests** - Basic functionality
5. **Connector Supply Chain** - Checksum + conformance
6. **Reliability Gate** - Locking, idempotency, errors

ARV is a CI gate - PRs cannot merge if ARV fails.

---

## Observability

### Structured Logs

All logs are JSON formatted with trace correlation:

```json
{
  "level": "INFO",
  "message": "Step completed",
  "timestamp": "2025-12-16T23:45:00.000Z",
  "runId": "run-abc123",
  "component": "engine",
  "durationMs": 1234
}
```

### Debug Mode

Enable debug logging:
```bash
export GWI_DEBUG=true
gwi autopilot https://github.com/owner/repo/pull/123
```

### Metrics

Metrics are available via the `MetricsRegistry` interface:

```typescript
import { getMetricsRegistry } from '@gwi/core';

const metrics = getMetricsRegistry();
console.log(metrics.getMetrics());
```

---

## Storage Backends

### Development (default)

```bash
# In-memory (resets on restart)
unset GWI_STORE_BACKEND
```

### Production

```bash
# Firestore
export GWI_STORE_BACKEND=firestore
export GCP_PROJECT_ID=your-project
```

---

## Contact

For issues not covered here, file a GitHub issue or contact:
- jeremy@intentsolutions.io

---

intent solutions io — confidential IP
Contact: jeremy@intentsolutions.io
