# Agent Engine Context Capsule

> **Read this first.** This is the authoritative source for Agent Engine deployment rules.

---

## Deployment Target

**We deploy to Vertex AI Agent Engine** (Cloud Run + Reasoning Engine runtime).

All code paths must work in Agent Engine. No local-only shortcuts.

---

## ADK Usage Rules

### Approved Patterns

```typescript
// Model clients
import { generateText } from '@anthropic-ai/sdk';  // Claude
import { GoogleAI } from '@google/genai';           // Gemini

// Schema validation
import { z } from 'zod';

// Storage interfaces
import { TenantStore } from '@gwi/core';
```

### Disallowed/Deprecated Patterns

```typescript
// NEVER use deprecated ADK FastAPI serving
// Pattern: google.adk.serving.fastapi
// Pattern: from google.adk.serving import FastAPIServer

// NEVER use local-only file storage for production state
// Pattern: fs.writeFileSync for agent state (use TenantStore)

// NEVER hardcode model names
// Pattern: model: 'claude-3-opus' (use MODELS config)
```

---

## Tool Contract Rules

### All tools MUST:

1. **Have a JSON schema** - Input/output validated by Zod schemas
2. **Return structured JSON** - No unstructured text responses
3. **Be idempotent where possible** - Same input = same output
4. **Include trace context** - Propagate `runId` and `traceId`

### Schema location

```
packages/core/src/run-bundle/schemas/
├── common.ts      # Shared types
├── triage.ts      # TriageResult
├── plan.ts        # PlanResult
├── resolve.ts     # ResolveResult
└── review.ts      # ReviewResult
```

---

## Run Bundle Rules

### Every run MUST produce

```
.gwi/runs/<runId>/
├── run.json       # REQUIRED: Run context, state, config
├── audit.log      # REQUIRED: Append-only JSONL
├── triage.json    # If triaged
├── plan.json      # If planned
├── patch.diff     # If code generated
└── approval.json  # If approved
```

### Audit log format (JSONL)

```json
{"timestamp":"ISO8601","runId":"uuid","actor":"system|agent|user","action":"event_name","details":{}}
```

### Required audit events

- `run_created`
- `state_transition` (with `from` and `to`)
- `approval_granted` (with `scope` and `patchHash`)
- `error` (with `message` and `stack`)

---

## Approval Gating Rules

### Gated operations (REQUIRE approval)

| Operation | Scope Required |
|-----------|----------------|
| `git_commit` | `commit` |
| `git_push` | `push` |
| `pr_create` | `open_pr` |
| `pr_merge` | `merge` |

### Approval binding

- Every approval MUST include `patchHash` (SHA256 of patch.diff)
- Before executing gated operation, MUST verify hash matches
- If patch changes post-approval, approval is INVALID

### Implementation

```typescript
import { checkApproval, computePatchHash } from '@gwi/core';

const hash = computePatchHash(patchContent);
const check = checkApproval(request, approval, patchContent);
if (!check.approved) {
  throw new Error(`Approval required: ${check.reason}`);
}
```

---

## Observability Rules

### Required context propagation

```typescript
interface TraceContext {
  runId: string;       // UUID of current run
  traceId?: string;    // Distributed trace ID
  spanId?: string;     // Current span
  parentSpanId?: string;
}
```

### Structured logging

```typescript
// GOOD: Structured
logger.info({ runId, action: 'triage_complete', score: 5 });

// BAD: Unstructured
console.log(`Triage complete for ${runId} with score 5`);
```

### Required log fields

- `timestamp` (ISO 8601)
- `runId`
- `level` (info, warn, error)
- `action` (what happened)
- `actor` (who did it: system, agent name, user email)

---

## Testing / ARV Rules

### ARV commands

```bash
npm run arv          # Run all checks
npm run arv:lint     # Forbidden patterns + lint
npm run arv:contracts # Schema validation (AJV)
npm run arv:goldens  # Deterministic output tests
npm run arv:smoke    # Boot sanity check
```

### When to run

- **Before every commit**: `npm run arv`
- **In CI**: ARV gate MUST pass
- **Before PR merge**: Full ARV suite

### What fails ARV

- Forbidden imports detected
- Contract schema validation fails
- Golden test mismatch
- Smoke test fails to boot

---

## Quick Reference

| Question | Answer |
|----------|--------|
| Where do we deploy? | Vertex AI Agent Engine |
| What validates schemas? | Zod (runtime) + AJV (contracts) |
| Where are run artifacts? | `.gwi/runs/<runId>/` |
| How are approvals bound? | SHA256 hash of patch.diff |
| What runs in CI? | `npm run arv` |

---

## See Also

- `000-docs/agent-engine/COMPLIANCE.md` - Compliance checklist
- `docs/context.md` - Full architecture context
- `CLAUDE.md` - Working contract
