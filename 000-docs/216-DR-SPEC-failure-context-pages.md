# Failure Context Pages Specification

> **Document**: 216-DR-SPEC-failure-context-pages
> **Epic**: EPIC 008 - Incident Response Enhancement
> **Status**: Active
> **Last Updated**: 2026-02-03

## Overview

Every failure in GWI should provide actionable context. This spec defines the information required on failure pages, error responses, and debugging interfaces.

---

## Design Principles

1. **Every error has context** - Run ID, trace ID, timestamp always visible
2. **One click to logs** - Direct links to relevant log entries
3. **Suggested next steps** - Don't leave users wondering what to do
4. **Copy-friendly** - Error details easily copyable for support

---

## Failure Page Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ERROR PAGE LAYOUT                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  ⚠️ Error: Run Failed                                           │    │
│  │  Something went wrong during code generation.                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Context                                                        │    │
│  │  ─────────────────────────────────────────────────────────────  │    │
│  │  Run ID:      run-abc123def456    [Copy]                        │    │
│  │  Trace ID:    abc123...           [View Trace]                  │    │
│  │  Timestamp:   2026-02-03 10:45:23 UTC                          │    │
│  │  Agent:       coder                                             │    │
│  │  Step:        generate-code (3/5)                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Error Details                                                  │    │
│  │  ─────────────────────────────────────────────────────────────  │    │
│  │  Code:    AGENT_TIMEOUT                                         │    │
│  │  Message: Agent did not respond within 30 seconds               │    │
│  │                                                                 │    │
│  │  [Show Technical Details ▼]                                     │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Quick Links                                                    │    │
│  │  ─────────────────────────────────────────────────────────────  │    │
│  │  [View Logs]  [View Artifacts]  [Download Bundle]               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Suggested Next Steps                                           │    │
│  │  ─────────────────────────────────────────────────────────────  │    │
│  │  1. Retry the operation (transient error)                       │    │
│  │  2. Check agent logs for details                                │    │
│  │  3. Contact support with Run ID                                 │    │
│  │                                                                 │    │
│  │  [Retry] [Contact Support]                                      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## API Error Response Format

### Standard Error Response

```typescript
interface APIErrorResponse {
  error: {
    // Human-readable
    message: string;
    code: string;

    // Context for debugging
    context: {
      run_id?: string;
      trace_id: string;
      request_id: string;
      timestamp: string;
      service: string;
      agent?: string;
      step?: string;
    };

    // Technical details (development only)
    details?: {
      stack?: string;
      cause?: string;
      metadata?: Record<string, unknown>;
    };

    // Actionable guidance
    suggestions?: string[];
    documentation_url?: string;
    support_url?: string;

    // Links
    links?: {
      logs?: string;
      trace?: string;
      artifacts?: string;
    };
  };
}
```

### Example Error Response

```json
{
  "error": {
    "message": "Code generation failed: model rate limited",
    "code": "AGENT_RATE_LIMITED",

    "context": {
      "run_id": "run-abc123def456",
      "trace_id": "projects/git-with-intent/traces/abc123",
      "request_id": "req-xyz789",
      "timestamp": "2026-02-03T10:45:23.456Z",
      "service": "gwi-api",
      "agent": "coder",
      "step": "generate-code"
    },

    "suggestions": [
      "Wait 60 seconds and retry",
      "Try a simpler task to reduce token usage",
      "Contact support if this persists"
    ],

    "documentation_url": "https://docs.gwi.dev/errors/AGENT_RATE_LIMITED",

    "links": {
      "logs": "https://console.cloud.google.com/logs?query=run_id%3D%22run-abc123def456%22",
      "trace": "https://console.cloud.google.com/traces/abc123",
      "artifacts": "https://api.gwi.dev/v1/runs/run-abc123def456/artifacts"
    }
  }
}
```

---

## Error Codes

### Agent Errors

| Code | Message | Suggestions |
|------|---------|-------------|
| `AGENT_TIMEOUT` | Agent did not respond in time | Retry, check agent logs |
| `AGENT_RATE_LIMITED` | Model rate limit exceeded | Wait and retry |
| `AGENT_CONTEXT_OVERFLOW` | Input too large for context | Simplify input, split task |
| `AGENT_INVALID_OUTPUT` | Agent produced invalid response | Check model, retry |
| `AGENT_UNAVAILABLE` | Agent service unavailable | Check status, retry later |

### Run Errors

| Code | Message | Suggestions |
|------|---------|-------------|
| `RUN_CANCELLED` | Run was cancelled by user | N/A |
| `RUN_TIMEOUT` | Run exceeded time limit | Simplify task, increase timeout |
| `RUN_QUOTA_EXCEEDED` | Plan quota exceeded | Upgrade plan, wait for reset |
| `RUN_INVALID_INPUT` | Invalid input parameters | Check input format |
| `RUN_STEP_FAILED` | A step in the run failed | Check step logs |

### Integration Errors

| Code | Message | Suggestions |
|------|---------|-------------|
| `GITHUB_AUTH_FAILED` | GitHub authentication failed | Re-authenticate |
| `GITHUB_RATE_LIMITED` | GitHub API rate limited | Wait for reset |
| `GITHUB_REPO_NOT_FOUND` | Repository not found | Check permissions |
| `WEBHOOK_VERIFY_FAILED` | Webhook signature invalid | Check webhook secret |

---

## Link Generation

### Log Links

```typescript
function generateLogLink(context: ErrorContext): string {
  const baseUrl = 'https://console.cloud.google.com/logs/query';
  const project = 'git-with-intent';

  const query = [
    `resource.type="cloud_run_revision"`,
    context.run_id && `jsonPayload.runId="${context.run_id}"`,
    context.trace_id && `trace="${context.trace_id}"`,
    `timestamp>="${new Date(Date.now() - 3600000).toISOString()}"`,
  ].filter(Boolean).join(' AND ');

  return `${baseUrl}?project=${project}&query=${encodeURIComponent(query)}`;
}
```

### Trace Links

```typescript
function generateTraceLink(traceId: string): string {
  return `https://console.cloud.google.com/traces/list?project=git-with-intent&tid=${traceId}`;
}
```

### Artifact Links

```typescript
function generateArtifactLinks(runId: string): ArtifactLinks {
  const baseUrl = `https://api.gwi.dev/v1/runs/${runId}`;

  return {
    run: `${baseUrl}`,
    logs: `${baseUrl}/logs`,
    triage: `${baseUrl}/artifacts/triage.json`,
    plan: `${baseUrl}/artifacts/plan.json`,
    patch: `${baseUrl}/artifacts/patch.diff`,
    audit: `${baseUrl}/artifacts/audit.log`,
    bundle: `${baseUrl}/bundle`,
  };
}
```

---

## Web UI Components

### ErrorBanner Component

```tsx
interface ErrorBannerProps {
  error: APIErrorResponse['error'];
  onRetry?: () => void;
  showDetails?: boolean;
}

function ErrorBanner({ error, onRetry, showDetails }: ErrorBannerProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="error-banner">
      <div className="error-header">
        <AlertIcon />
        <h3>{error.message}</h3>
      </div>

      <div className="error-context">
        <ContextRow label="Run ID" value={error.context.run_id} copyable />
        <ContextRow label="Trace ID" value={error.context.trace_id} truncate />
        <ContextRow label="Time" value={formatTime(error.context.timestamp)} />
        {error.context.agent && (
          <ContextRow label="Agent" value={error.context.agent} />
        )}
      </div>

      <div className="error-links">
        {error.links?.logs && (
          <LinkButton href={error.links.logs} icon={<LogsIcon />}>
            View Logs
          </LinkButton>
        )}
        {error.links?.trace && (
          <LinkButton href={error.links.trace} icon={<TraceIcon />}>
            View Trace
          </LinkButton>
        )}
        {error.links?.artifacts && (
          <LinkButton href={error.links.artifacts} icon={<DownloadIcon />}>
            Download Bundle
          </LinkButton>
        )}
      </div>

      {error.suggestions && (
        <div className="error-suggestions">
          <h4>Suggested Next Steps</h4>
          <ol>
            {error.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      <div className="error-actions">
        {onRetry && (
          <Button onClick={onRetry} variant="primary">
            Retry
          </Button>
        )}
        <Button href={error.support_url} variant="secondary">
          Contact Support
        </Button>
      </div>

      {showDetails && error.details && (
        <Collapsible
          trigger="Show Technical Details"
          open={expanded}
          onToggle={() => setExpanded(!expanded)}
        >
          <pre className="error-details">
            {JSON.stringify(error.details, null, 2)}
          </pre>
        </Collapsible>
      )}
    </div>
  );
}
```

### RunStatusPage Component

```tsx
function RunStatusPage({ runId }: { runId: string }) {
  const { run, error, loading } = useRun(runId);

  if (loading) return <LoadingSpinner />;

  if (run?.status === 'failed') {
    return (
      <div className="run-failed-page">
        <ErrorBanner
          error={buildErrorFromRun(run)}
          onRetry={() => retryRun(runId)}
          showDetails
        />

        <div className="run-timeline">
          <h3>Run Timeline</h3>
          <Timeline steps={run.steps} failedStep={run.failed_step} />
        </div>

        <div className="run-artifacts">
          <h3>Artifacts</h3>
          <ArtifactList runId={runId} artifacts={run.artifacts} />
        </div>
      </div>
    );
  }

  return <RunSuccessPage run={run} />;
}
```

---

## CLI Error Output

### Formatted Error Display

```
╭──────────────────────────────────────────────────────────────────────╮
│  ⚠️  Error: Code generation failed                                   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Run ID:     run-abc123def456                                        │
│  Trace:      abc123...def456                                         │
│  Time:       2026-02-03 10:45:23 UTC                                │
│  Agent:      coder (step 3/5)                                        │
│                                                                      │
│  Error:      AGENT_TIMEOUT                                           │
│  Message:    Agent did not respond within 30 seconds                 │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  Suggested Actions:                                                  │
│                                                                      │
│  1. Retry: gwi run retry run-abc123def456                           │
│  2. View logs: gwi run logs run-abc123def456                        │
│  3. Download bundle: gwi run bundle run-abc123def456                │
│                                                                      │
│  Documentation: https://docs.gwi.dev/errors/AGENT_TIMEOUT           │
╰──────────────────────────────────────────────────────────────────────╯
```

### CLI Implementation

```typescript
function formatCliError(error: APIErrorResponse['error']): string {
  const lines = [
    chalk.red('╭' + '─'.repeat(70) + '╮'),
    chalk.red('│') + `  ⚠️  Error: ${error.message}`.padEnd(69) + chalk.red('│'),
    chalk.red('├' + '─'.repeat(70) + '┤'),
    chalk.red('│') + ''.padEnd(69) + chalk.red('│'),
  ];

  // Context
  const context = error.context;
  lines.push(
    formatLine('Run ID:', context.run_id),
    formatLine('Trace:', truncate(context.trace_id, 20)),
    formatLine('Time:', context.timestamp),
  );

  if (context.agent) {
    lines.push(formatLine('Agent:', `${context.agent} (step ${context.step})`));
  }

  lines.push(
    chalk.red('│') + ''.padEnd(69) + chalk.red('│'),
    formatLine('Error:', error.code),
    formatLine('Message:', error.message),
  );

  // Suggestions
  if (error.suggestions?.length) {
    lines.push(
      chalk.red('├' + '─'.repeat(70) + '┤'),
      chalk.red('│') + '  Suggested Actions:'.padEnd(69) + chalk.red('│'),
      chalk.red('│') + ''.padEnd(69) + chalk.red('│'),
    );

    error.suggestions.forEach((s, i) => {
      lines.push(chalk.red('│') + `  ${i + 1}. ${s}`.padEnd(69) + chalk.red('│'));
    });
  }

  lines.push(chalk.red('╰' + '─'.repeat(70) + '╯'));

  return lines.join('\n');
}
```

---

## Logging Requirements

Every error must include in logs:

```json
{
  "severity": "ERROR",
  "message": "Agent timeout during code generation",
  "error": {
    "code": "AGENT_TIMEOUT",
    "message": "Agent did not respond within 30 seconds",
    "stack": "...",
    "cause": "..."
  },
  "context": {
    "runId": "run-abc123def456",
    "tenantId": "tenant-xyz",
    "requestId": "req-789",
    "agent": "coder",
    "step": "generate-code",
    "stepIndex": 3,
    "totalSteps": 5
  },
  "timing": {
    "startedAt": "2026-02-03T10:45:00Z",
    "failedAt": "2026-02-03T10:45:30Z",
    "durationMs": 30000
  }
}
```

---

## Related Documentation

- [215-OD-RUNB-incident-response.md](./215-OD-RUNB-incident-response.md)
- [032-OD-RUNB-observability-operations.md](./032-OD-RUNB-observability-operations.md)
