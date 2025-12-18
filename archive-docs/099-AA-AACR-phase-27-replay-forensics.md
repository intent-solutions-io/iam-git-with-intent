# Phase 27: Replay & Forensics Tooling - After Action Report

| Field | Value |
|-------|-------|
| Document ID | 099-AA-AACR |
| Phase | 27 |
| Title | Replay & Forensics Tooling |
| Status | COMPLETE |
| Created | 2025-12-17 20:15 CST |
| Author | Claude Code (Opus 4.5) |
| Beads Epic | git-with-intent-kyl |

---

## Executive Summary

Phase 27 implements the forensic replay and audit trail infrastructure for Git With Intent. This includes a comprehensive ForensicBundle schema for capturing complete run histories, a RedactionService for automatic secret/PII removal, deterministic replay capabilities via ReplayEngine, and CLI tooling for bundle inspection and DLQ management.

**Key Deliverables:**
- ForensicBundle Zod schema with 28 event types
- RedactionService with extensible pattern rules
- ForensicCollector for event capture during runs
- ReplayEngine with LLM mocking and diff detection
- CLI commands: status, validate, replay, timeline, dlq list/replay
- 39 golden tests with frozen fixtures
- ARV gate with 8 verification checks

---

## Scope

### In Scope
- ForensicBundle schema definition with Zod validation
- Redaction rules for API keys, secrets, bearer tokens, environment variables
- Event capture infrastructure (types, collector)
- Deterministic replay engine with LLM response mocking
- Diff engine for comparing original vs replayed outputs
- CLI integration for forensics commands
- Golden tests with deterministic fixtures
- ARV gate for CI validation

### Out of Scope
- Event capture wiring into actual run engine (deferred)
- Live storage/retrieval of bundles (uses file-based DLQ)
- UI for timeline visualization
- Bundle export to external systems

---

## Implementation Details

### 1. ForensicBundle Schema (`packages/core/src/forensics/types.ts`)

Comprehensive Zod schema supporting:

**Event Types (28 total):**
- Run lifecycle: `run.started`, `run.completed`, `run.failed`, `run.timeout`, `run.cancelled`
- Step tracking: `step.started`, `step.completed`, `step.failed`, `step.skipped`
- Tool operations: `tool.invoked`, `tool.completed`, `tool.failed`, `tool.timeout`
- LLM interactions: `llm.request`, `llm.response`, `llm.error`, `llm.rate_limited`
- Policy/approval: `policy.check`, `policy.violation`, `approval.requested`, `approval.granted`, `approval.denied`, `approval.timeout`
- Error handling: `error.occurred`, `error.recovered`, `dlq.enqueued`, `dlq.replayed`
- Custom: `custom`

**Schema Structure:**
```typescript
ForensicBundleSchema = z.object({
  version: z.literal(1),
  bundle_id: z.string().uuid(),
  run_id: z.string(),
  tenant_id: z.string(),
  workflow_id: z.string().optional(),
  agent_id: z.string().optional(),
  model: z.string().optional(),
  created_at: z.string().datetime(),
  run_started_at: z.string().datetime(),
  run_ended_at: z.string().datetime().optional(),
  run_duration_ms: z.number().int().nonnegative(),
  run_status: RunStatus,
  input: z.record(z.unknown()).optional(),
  output: z.record(z.unknown()).optional(),
  events: z.array(ForensicEvent),
  event_counts: z.record(z.string(), z.number()),
  total_tokens: TokenUsage.optional(),
  total_llm_latency_ms: z.number().optional(),
  policy_summary: PolicySummary.optional(),
  redaction: RedactionMeta,
  replay_status: ReplayStatus,
  replay_attempts: z.number().int().nonnegative(),
  last_replay_at: z.string().datetime().optional(),
  checksum: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
```

### 2. RedactionService (`packages/core/src/forensics/redaction.ts`)

Pattern-based redaction with built-in rules:

| Rule | Pattern | Replacement |
|------|---------|-------------|
| OpenAI API Key | `sk-[a-zA-Z0-9]{32,}` | `[REDACTED:OPENAI_KEY]` |
| Anthropic API Key | `sk-ant-api\d{2}-[a-zA-Z0-9-]+` | `[REDACTED:ANTHROPIC_KEY]` |
| GitHub PAT | `ghp_[a-zA-Z0-9]{36}` | `[REDACTED:GITHUB_PAT]` |
| GitHub OAuth Token | `gho_[a-zA-Z0-9]{36}` | `[REDACTED:GITHUB_OAUTH]` |
| GitHub App Token | `ghs_[a-zA-Z0-9]{36}` | `[REDACTED:GITHUB_APP]` |
| Bearer Token | `Bearer\s+[a-zA-Z0-9._-]+` | `[REDACTED:BEARER_TOKEN]` |
| AWS Secret | `(?:aws_secret\|AWS_SECRET)[^=]*=[^\\s]+` | `[REDACTED:AWS_SECRET]` |
| Environment Variable | `[A-Z_]+KEY[A-Z_]*=[^\\s]+` | `[REDACTED:ENV_VAR]` |

**Key Features:**
- Deep object traversal with path tracking
- Custom pattern support via constructor
- `containsSecrets()` method for pre-check
- Singleton pattern via `getRedactionService()`

### 3. ForensicCollector (`packages/core/src/forensics/collector.ts`)

Event collection during run execution:

```typescript
class ForensicCollector {
  // Lifecycle methods
  start(input?: Record<string, unknown>): void
  complete(output?: Record<string, unknown>): void
  fail(error: { name: string; message: string; stack?: string }): void

  // Event recording
  llmRequest(provider: string, model: string, prompt: string): string
  llmResponse(provider: string, model: string, response: string, usage: TokenUsage, latencyMs: number): string
  llmError(provider: string, model: string, error: { name: string; message: string }): void
  stepStarted(stepName: string, stepType: string): string
  stepCompleted(stepId: string, output?: Record<string, unknown>): void
  stepFailed(stepId: string, error: { name: string; message: string }): void
  toolInvoked(toolName: string, input?: Record<string, unknown>): string
  toolCompleted(toolId: string, output?: Record<string, unknown>): void
  policyCheck(policyId: string, action: string, decision: string, reason?: string): void
  addCustomEvent(eventType: string, data: Record<string, unknown>): void

  // Bundle generation
  build(): ForensicBundle
  getEventCount(): number
  getStatus(): 'pending' | 'running' | 'completed' | 'failed'
}
```

### 4. ReplayEngine (`packages/core/src/forensics/replay.ts`)

Deterministic replay with three modes:

| Mode | Behavior |
|------|----------|
| `deterministic` | Mock all LLM calls from recorded responses |
| `live` | Make actual LLM calls, compare outputs |
| `mock_only` | Only mock LLM, skip other operations |

**Replay Process:**
1. Validate bundle for replay capability
2. Build LLM mock provider from recorded responses
3. Process events in sequence order
4. Capture replayed output
5. Compare original vs replayed using diff engine
6. Return ReplayResult with comparison

**Diff Engine:**
```typescript
function diffValues(original: unknown, replayed: unknown, path?: string): DiffResult[]

interface DiffResult {
  path: string;
  type: 'value_mismatch' | 'missing_key' | 'extra_key' | 'type_mismatch' | 'array_length';
  original: unknown;
  replayed: unknown;
  description: string;
  severity: 'error' | 'warning' | 'info';
}
```

### 5. CLI Commands (`apps/cli/src/commands/forensics.ts`)

| Command | Description |
|---------|-------------|
| `gwi forensics status` | Show feature status and configuration |
| `gwi forensics validate <file>` | Validate a bundle file against schema |
| `gwi forensics replay <file>` | Replay a bundle with options for mode, verbosity |
| `gwi forensics timeline <file>` | Display event timeline with icons and colors |
| `gwi forensics dlq list` | List items in Dead Letter Queue |
| `gwi forensics dlq replay <id>` | Replay a bundle from DLQ |

**Feature Flag:** `GWI_FORENSICS_ENABLED=1`

### 6. Golden Tests (`test/goldens/forensics/`)

39 deterministic tests covering:
- Schema validation (5 tests)
- RedactionService (12 tests)
- ForensicCollector (4 tests)
- ReplayEngine (6 tests)
- Diff Engine (12 tests)

**Fixtures:**
- `valid-bundle.json` - Complete valid bundle with all event types
- `bundle-with-secrets.json` - Bundle containing API keys for redaction testing

### 7. ARV Gate (`scripts/arv/forensics-gate.ts`)

8 verification checks:
1. ForensicBundle Schema - Zod validation, event types, replay status
2. RedactionService - Class, patterns, containsSecrets method
3. ForensicCollector - Event capture methods, build()
4. ReplayEngine - Replay method, validation, mock provider, diff functions
5. Module Exports - All components exported from index.ts
6. CLI Integration - Commands registered, feature flag check
7. Golden Tests - Test file and fixtures present
8. Core Module Export - Forensics exported from @gwi/core

---

## File Changes Summary

### Created Files
| File | Lines | Purpose |
|------|-------|---------|
| `packages/core/src/forensics/types.ts` | ~620 | ForensicBundle schema |
| `packages/core/src/forensics/redaction.ts` | ~240 | RedactionService |
| `packages/core/src/forensics/collector.ts` | ~420 | ForensicCollector |
| `packages/core/src/forensics/replay.ts` | ~680 | ReplayEngine + diff |
| `packages/core/src/forensics/index.ts` | ~30 | Module exports |
| `apps/cli/src/commands/forensics.ts` | ~600 | CLI commands |
| `test/goldens/forensics/forensic-bundle.golden.test.ts` | ~500 | Golden tests |
| `test/goldens/forensics/fixtures/valid-bundle.json` | ~120 | Test fixture |
| `test/goldens/forensics/fixtures/bundle-with-secrets.json` | ~70 | Test fixture |
| `scripts/arv/forensics-gate.ts` | ~290 | ARV gate |

### Modified Files
| File | Change |
|------|--------|
| `packages/core/src/index.ts` | Added forensics module export |
| `apps/cli/src/index.ts` | Registered forensics commands |
| `.github/workflows/arv.yml` | Added forensics gate step |

---

## Dependencies

### Runtime
- `zod` - Schema validation (existing)
- `chalk` - CLI colors (existing)
- `commander` - CLI framework (existing)
- `crypto` - Checksum generation (Node.js built-in)

### No New Dependencies Added

---

## Testing

### Test Results
```
npx vitest run test/goldens/forensics/

Test Files  1 passed (1)
     Tests  39 passed (39)
  Duration  4.80s
```

### ARV Gate
```
npx tsx scripts/arv/forensics-gate.ts

Total: 8 passed, 0 failed
FORENSICS GATE PASSED
```

---

## Known Limitations

1. **Event Capture Not Wired** - The ForensicCollector exists but is not yet integrated into the actual run engine. This is intentional scope deferral.

2. **File-Based DLQ** - Dead Letter Queue uses local filesystem (`.gwi/dlq/`). Production would need Firestore/GCS storage.

3. **No Live Mode Testing** - Live replay mode is implemented but not tested with actual LLM calls.

4. **PII Redaction Disabled by Default** - Email/phone patterns exist but are disabled. Users can enable via custom patterns.

5. **No Bundle Export** - Bundles can only be read from local files, no export to external systems.

---

## Security Considerations

1. **Redaction Applied by Default** - All bundles built via ForensicCollector have redaction applied automatically.

2. **Pattern Coverage** - Default rules cover major API key formats (OpenAI, Anthropic, GitHub, AWS).

3. **Checksum Validation** - Optional SHA-256 checksum for bundle integrity verification.

4. **Feature Flag Gated** - Forensics CLI requires explicit enablement via `GWI_FORENSICS_ENABLED`.

---

## Beads Task Summary

| Bead ID | Title | Status |
|---------|-------|--------|
| git-with-intent-kyl | Phase 27 Epic | Active |
| git-with-intent-9ho | ForensicBundle schema + redaction | Closed |
| git-with-intent-e6j | Event capture wiring | Open |
| git-with-intent-2vw | ReplayEngine | Closed |
| git-with-intent-9bj | DLQ replay CLI | Closed |
| git-with-intent-uwq | Timeline viewer | Closed |
| git-with-intent-8jb | Golden tests | Closed |
| git-with-intent-nxv | ARV gate | Closed |
| git-with-intent-d6m | Documentation | Closing |

---

## Next Steps / TODOs

1. **Event Capture Wiring** (git-with-intent-e6j)
   - Wire ForensicCollector into Engine.run()
   - Add bundle storage to Firestore
   - Implement DLQ persistence

2. **Phase 28: Bundle Storage + Retention**
   - Firestore collection for bundles
   - GCS archival for long-term storage
   - Retention policy implementation

3. **Phase 29: Forensics UI**
   - Web-based timeline viewer
   - Bundle search and filtering
   - Replay trigger from UI

---

## Conclusion

Phase 27 successfully implements the core forensic infrastructure for Git With Intent. The ForensicBundle schema provides a comprehensive audit trail format, the RedactionService ensures secrets are never exposed in logs, and the ReplayEngine enables deterministic re-execution for debugging and verification. All components are tested with frozen fixtures and validated by the ARV gate in CI.

The architecture is designed for production use with proper separation of concerns, feature flag gating, and extensibility for future enhancements.

---

## Addendum: Event Capture Wiring (Phase 28 Fixup)

**Date:** 2025-12-17 21:08 CST
**Task:** git-with-intent-ezg (Phase 28 fixup)

The originally deferred event capture wiring task (git-with-intent-e6j) has been completed as a Phase 28 fixup:

### Changes

1. **Engine Integration** (`packages/engine/src/run/engine.ts`)
   - ForensicCollector is now created when `GWI_FORENSICS_ENABLED=1`
   - Collector starts with run input metadata (runType, repo, prNumber, trigger)
   - Bundle is built and saved on run completion or failure
   - Bundles saved to `.gwi/forensics/<run_id>.json`

2. **New Golden Tests** (`test/goldens/forensics/forensics-wiring.golden.test.ts`)
   - 11 additional tests verifying wiring behavior
   - Feature flag tests
   - Collector integration tests
   - Bundle persistence tests
   - Provider-agnostic support tests (anthropic, openai, google, ollama, custom-vllm)

### Test Results
```
Test Files  2 passed (2)
     Tests  50 passed (50)
```

### Beads Closed
- git-with-intent-e6j (Event capture wiring)
- git-with-intent-ezg (Fixup: wire ForensicCollector)
- git-with-intent-kyl (Phase 27 Epic)
