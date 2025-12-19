# Phase 35 AAR: Worker Cloud Run Deployment

> **Timestamp**: 2025-12-18 03:45 CST
> **Branch**: feature/phase-32-34-ga-onboarding-autopilot
> **Author**: Claude Code (Orchestrator)
> **Duration**: ~30 minutes

## Summary

Phase 35 implemented the worker deployment infrastructure for autopilot workflows. Created Dockerfile for monorepo-aware builds, added autopilot job handler with GitHub App authentication, updated OpenTofu for Secret Manager access, and integrated worker build/deploy into CI/CD pipeline.

## What Was Done

### P0 Tasks (Critical)

1. **Worker Dockerfile**
   - Created `apps/worker/Dockerfile`
   - Multi-stage build (builder → runner)
   - Includes all workspace dependencies (@gwi/core, @gwi/agents, @gwi/engine, @gwi/integrations)
   - Git installed for workspace isolation (cloning repos)
   - Non-root user for security
   - Health check configuration

2. **Autopilot Job Handler**
   - Created `apps/worker/src/handlers/autopilot.ts`
   - GitHub App authentication via @octokit/auth-app
   - Installation token generation for API access
   - Full integration with AutopilotExecutor
   - Job state tracking via FirestoreJobStore
   - Support for dry-run and plan-only modes

3. **OpenTofu Updates**
   - Added Secret Manager access for worker service account
   - Added GITHUB_APP_ID and GITHUB_PRIVATE_KEY environment variables
   - Added GWI_WORKSPACE_DIR environment variable
   - Updated depends_on for proper resource ordering

4. **CI/CD Integration**
   - Added worker build step to `.github/workflows/ci.yml`
   - Monorepo-aware Docker build (`docker build -f apps/worker/Dockerfile .`)
   - Added worker_image output
   - Updated deploy-dev and deploy-prod with gwi_worker_image variable

## Files Created

| File | Purpose |
|------|---------|
| `apps/worker/Dockerfile` | Multi-stage worker container |
| `apps/worker/src/handlers/autopilot.ts` | Autopilot job handler |
| `000-docs/120-AA-AACR-phase-35-worker-deployment.md` | This AAR |

## Files Modified

| File | Changes |
|------|---------|
| `apps/worker/src/handlers/index.ts` | Import and register autopilot handlers |
| `apps/worker/package.json` | Added @octokit/auth-app dependency |
| `infra/cloud_run.tf` | GitHub App env vars, Secret Manager IAM |
| `.github/workflows/ci.yml` | Worker build and deploy steps |

## Test Results

```
=== TYPECHECK ===
Tasks: 4 successful, 4 total

=== BUILD ===
All packages built successfully

=== WORKER BUILD ===
No TypeScript errors
```

## Key Decisions

1. **Monorepo Docker Build**: Build from root context with `-f apps/worker/Dockerfile` to include all workspace dependencies
2. **Installation Token Auth**: Use @octokit/auth-app to generate short-lived installation tokens from App credentials
3. **Secret Manager**: Store GitHub private key in Secret Manager, not as plain env var
4. **Workspace Directory**: `/tmp/gwi-workspaces` for isolated repo clones

## Architecture

### Worker Job Flow
```
Pub/Sub Message
    ↓
Worker /push endpoint
    ↓
WorkerProcessor.processJob()
    ↓
handleAutopilotExecute()
    ↓
Generate Installation Token
    ↓
Create AutopilotConfig
    ↓
AutopilotExecutor.execute()
    ↓
Complete/Fail Job in Firestore
```

### Handler Registration
```typescript
handlers = {
  'workflow:execute': handleWorkflowExecute,
  'signal:process': handleSignalProcess,
  'candidate:generate': handleCandidateGenerate,
  'health:check': handleHealthCheck,
  // Phase 35: Autopilot handlers
  'autopilot:execute': handleAutopilotExecute,
  'autopilot:plan': handleAutopilotPlan,
};
```

## Environment Variables

| Variable | Source | Purpose |
|----------|--------|---------|
| GITHUB_APP_ID | OpenTofu var | GitHub App identifier |
| GITHUB_PRIVATE_KEY | Secret Manager | App authentication |
| GWI_WORKSPACE_DIR | Hardcoded | Workspace isolation path |
| GCP_PROJECT_ID | OpenTofu var | Project for Firestore |
| PUBSUB_SUBSCRIPTION | OpenTofu var | Job queue subscription |

## Known Gaps

- [ ] Worker unit tests not yet created
- [ ] Installation token caching (currently generates per-job)
- [ ] Workspace cleanup after job completion
- [ ] Worker metrics/monitoring dashboard

## Next Steps

1. **Phase 36**: End-to-end testing with real GitHub issues
2. **Phase 37+**: Continue roadmap
3. Add worker unit tests
4. Implement installation token caching

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-12-18 | Claude Code | Phase 35 complete |
