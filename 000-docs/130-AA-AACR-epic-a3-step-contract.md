# AAR: A3 Step Execution Contract

> **Phase**: A (Platform Core Runtime)
> **Date**: 2024-12-19
> **Status**: Complete
> **Epic**: A3 - Agent Abstraction Layer

## Summary

Implemented the Step Execution Contract (A3), providing typed envelopes for agent step inputs and outputs. This establishes a clean abstraction layer between the orchestrator and individual agent steps.

## What Was Completed

### A3.s1: StepInput/StepOutput Types

Created comprehensive typed envelopes for step execution:

- **StepInput**: Contains run context, repo/PR/issue info, step configuration
- **StepOutput**: Contains result code, summary, data, timing, cost, artifacts

### A3.s2: Step Result Codes

Defined result codes with clear semantics:

| Code | Retry? | Continue? | Description |
|------|--------|-----------|-------------|
| `ok` | No | Yes | Step completed successfully |
| `retryable` | Yes | No | Temporary failure, can retry |
| `fatal` | No | No | Permanent failure, abort run |
| `blocked` | No | No | Waiting for external input |
| `skipped` | No | Yes | Step not applicable |

### A3.s3: Step Timing & Cost Accounting

Added comprehensive tracking:

- **StepTiming**: startedAt, completedAt, durationMs, llmWaitMs, toolCallMs, ioMs
- **StepCost**: model, provider, tokens (input/output/total), estimatedCostUsd

### A3.s4: Artifact Pointers (GCS URIs)

Standardized artifact references:

- **ArtifactPointer**: GCS URI with contentType, sizeBytes, sha256 hash
- **InlineArtifact**: Small artifacts (< 64KB) stored inline
- **ArtifactRef**: Discriminated union of pointer/inline

### A3.s5: Validation Layer

Created validation with detailed error messages:

- Schema validation with Zod
- Semantic validation (timing consistency, error presence, etc.)
- StepValidationError with path information
- Partial validation for incremental building

## Files Created

| File | Purpose |
|------|---------|
| `packages/engine/src/step-contract/types.ts` | Core type definitions |
| `packages/engine/src/step-contract/validation.ts` | Validation functions |
| `packages/engine/src/step-contract/index.ts` | Module exports |
| `packages/engine/src/step-contract/__tests__/step-contract.test.ts` | 28 test cases |

## Files Modified

| File | Change |
|------|--------|
| `packages/engine/src/index.ts` | Added step-contract exports |
| `vitest.config.ts` | Added src/**/__tests__ pattern |

## Key Types

```typescript
// Step input envelope
interface StepInput {
  runId: string;
  stepId: string;
  tenantId: string;
  repo: RepoContext;
  pr?: PRContext;
  issue?: IssueContext;
  stepType: 'triage' | 'plan' | 'code' | 'resolve' | 'review' | 'apply';
  riskMode: 'comment_only' | 'suggest_patch' | 'auto_patch' | 'auto_push';
  capabilitiesMode: 'comment-only' | 'patch-only' | 'commit-after-approval';
  previousOutput?: unknown;
  artifacts?: Record<string, ArtifactRef>;
  modelConfig?: ModelConfig;
  params?: Record<string, unknown>;
  queuedAt: string;
  attemptNumber: number;
  maxAttempts: number;
}

// Step output envelope
interface StepOutput {
  runId: string;
  stepId: string;
  resultCode: 'ok' | 'retryable' | 'fatal' | 'blocked' | 'skipped';
  summary: string;
  data?: unknown;
  error?: { message: string; code?: string; retryAfterMs?: number };
  artifacts?: Record<string, ArtifactRef>;
  timing: StepTiming;
  cost?: StepCost;
  suggestedNextStep?: string;
  requiresApproval: boolean;
  proposedChanges?: ProposedChange[];
}
```

## Test Results

```
 RUN  v1.6.1

 ✓ packages/engine/src/step-contract/__tests__/step-contract.test.ts (28 tests)

 Test Files  1 passed (1)
      Tests  28 passed (28)
```

## Integration Points

The step contract integrates with:

1. **Orchestrator** - Uses StepInput to invoke agents
2. **Agents** - Implement StepExecutor to process StepInput → StepOutput
3. **Run Bundle** - StepOutput maps to run artifacts
4. **Metering** - StepCost feeds into usage tracking
5. **Reliability** - StepResultCode drives retry logic

## Next Steps

- A4: Integrate step contract into engine execution
- A5: Update agents to use StepInput/StepOutput
- Update orchestrator to validate all step outputs

## Evidence

```bash
# Typecheck passes
npm run typecheck
 Tasks:    16 successful, 16 total

# Tests pass
npm run test
 Tasks:    23 successful, 23 total
```
