# Contributor Orientation

Welcome to Git With Intent! This guide helps you understand where code goes and how to contribute effectively.

---

## Mental Model: Three Layers

GWI is structured in three distinct layers. **Understanding this is essential before contributing.**

```
┌─────────────────────────────────────────────────────────────┐
│                    WORKFLOW TEMPLATES                        │
│  "What we automate" - Issue→PR, PR→Push, Conflict Resolution│
│  Location: packages/agents/, packages/engine/                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        CONNECTORS                            │
│  "How we talk to external systems" - GitHub, Slack, etc.    │
│  Location: packages/integrations/                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       ENGINE CORE                            │
│  "Foundation" - Runs, artifacts, approvals, scoring, schemas│
│  Location: packages/core/                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Repository Layout

```
git-with-intent/
├── apps/
│   ├── cli/                  # CLI application (gwi command)
│   ├── api/                  # SaaS API (Cloud Run)
│   ├── web/                  # React SPA (Firebase Hosting)
│   ├── gateway/              # A2A Gateway (future)
│   └── github-webhook/       # GitHub webhook handler
│
├── packages/
│   ├── core/                 # ENGINE CORE (shared foundation)
│   │   ├── src/run-bundle/   # Run state, artifacts, audit
│   │   ├── src/scoring/      # Complexity scoring
│   │   ├── src/capabilities/ # Approval gating
│   │   ├── src/storage/      # Storage interfaces
│   │   └── src/models/       # Multi-model client
│   │
│   ├── integrations/         # CONNECTORS (external systems)
│   │   └── src/github/       # GitHub API client
│   │
│   ├── agents/               # WORKFLOW TEMPLATES (agent implementations)
│   │   └── src/              # Triage, Coder, Resolver, Reviewer
│   │
│   ├── engine/               # Workflow orchestration
│   │   └── src/run/          # Workflow runner
│   │
│   └── sdk/                  # TypeScript SDK (for SaaS API)
│
├── infra/
│   └── terraform/            # Infrastructure as Code
│
├── docs/                     # User-facing documentation
├── 000-docs/                 # Internal docs, AARs, audits
└── scripts/                  # Operational scripts
```

---

## Where Does My Code Go?

### Adding a New External Integration

**Example**: Adding Slack notifications

```
Location: packages/integrations/src/slack/
```

**What to create:**
- `index.ts` - Client class and factory function
- `types.ts` - TypeScript interfaces
- `__tests__/` - Unit tests

**Rules:**
- Stateless API calls only
- No workflow logic
- Return typed data for engine/agents to use

### Adding a New Workflow

**Example**: Adding "PR auto-review" workflow

```
Location: packages/agents/src/auto-reviewer/
```

**What to create:**
- Agent implementation following existing patterns
- Zod schema in `packages/core/src/run-bundle/schemas/`
- Workflow orchestration in `packages/engine/src/run/`

**Rules:**
- Use engine-core for runs, artifacts, approvals
- Use connectors for external I/O
- Produce a run bundle (`.gwi/runs/<runId>/`)
- All outputs schema-validated

### Adding Engine Core Functionality

**Example**: Adding new approval scope

```
Location: packages/core/src/capabilities/
```

**What to update:**
- `types.ts` - Add to `ApprovalScope` enum
- `approval-verifier.ts` - Update verification logic
- Tests in `__tests__/`

**Rules:**
- No domain-specific logic
- Maintain backward compatibility
- Update schemas if output format changes

### Adding a CLI Command

**Example**: Adding `gwi rollback` command

```
Location: apps/cli/src/commands/rollback.ts
```

**What to create:**
- Command implementation
- Wire up in `apps/cli/src/index.ts`

**Rules:**
- Use engine-core for run management
- Follow existing command patterns
- Support `--json` output and `--dry-run` where applicable

---

## Key Patterns to Follow

### 1. Run Bundles for Everything

Every significant operation should create a run bundle:

```typescript
import { createRun, transitionState, writeArtifact } from '@gwi/core';

// Create run
const context = await createRun({
  repo: { owner, name, fullName },
  initiator: 'cli',
  // ...
});

// Transition states
await transitionState(context.runId, 'triaged');

// Write artifacts
await writeArtifact(context.runId, 'triage.json', JSON.stringify(result));
```

### 2. Schema Validation for Outputs

All agent outputs must be schema-validated:

```typescript
import { TriageResult, validateTriageResult } from '@gwi/core';

const result = validateTriageResult(agentOutput);
if (!result.valid) {
  throw new Error(`Invalid triage result: ${result.errors}`);
}
```

### 3. Approval Gating for Destructive Actions

Before any write operation:

```typescript
import { checkApproval, computePatchHash } from '@gwi/core';

const patchHash = computePatchHash(patchContent);
const approval = await loadApproval(runId);

const check = checkApproval(
  { runId, operation: 'git_commit', ... },
  approval,
  patchContent
);

if (!check.approved) {
  throw new Error(`Approval required: ${check.reason}`);
}
```

### 4. Audit Everything

Use the audit log for traceability:

```typescript
import { auditStateTransition, auditError } from '@gwi/core';

await auditStateTransition(runId, 'queued', 'triaged', 'triage-agent');

// On error
await auditError(runId, error, 'resolver-agent');
```

---

## Testing Requirements

| Layer | Test Type | Location |
|-------|-----------|----------|
| Engine Core | Unit tests | `packages/core/src/**/__tests__/` |
| Connectors | Unit + integration | `packages/integrations/src/**/__tests__/` |
| Workflows | Unit + E2E | `packages/agents/src/**/__tests__/` |
| CLI | Unit + smoke | `apps/cli/src/**/__tests__/` |

**Golden tests**: For scoring and schema validation, we maintain golden test fixtures. If you change scoring logic, update `packages/core/src/scoring/__tests__/fixtures/golden-inputs.json`.

---

## Before Submitting a PR

1. **Run the build**: `npm run build`
2. **Run tests**: `npm run test`
3. **Type check**: `npm run typecheck`
4. **Update docs** if you changed:
   - CLI commands
   - Schema formats
   - Configuration options

---

## Common Questions

### Q: Do I need AgentFS or Beads?

**No.** These are internal development tools, not required for the product runtime. See `000-docs/004-DR-ADRC-runtime-vs-devtools.md` for the full policy.

### Q: Where do I find the current schemas?

All Zod schemas are in `packages/core/src/run-bundle/schemas/`:
- `common.ts` - Shared types (ComplexityScore, RiskLevel, etc.)
- `triage.ts` - TriageResult
- `plan.ts` - PlanResult
- `resolve.ts` - ResolveResult
- `review.ts` - ReviewResult

### Q: How do I test without hitting real APIs?

Use dry-run mode: `gwi issue-to-code <url> --dry-run`

Or set `GWI_STORE_BACKEND=memory` for in-memory storage.

### Q: What's the complexity scoring rubric?

See `packages/core/src/scoring/baseline-scorer.ts`. Key weights:

| Factor | Weight |
|--------|--------|
| Small change (≤50 lines) | 0 |
| Medium change (50-200 lines) | +1 |
| Large change (>200 lines) | +2 |
| Many files (>8) | +1.5 |
| Security-sensitive files | +3 |
| Infrastructure files | +2 |
| Test-only changes | -1 |

LLM can adjust by -2 to +2, bounded.

---

## Getting Help

- **Architecture questions**: See `docs/context.md`
- **Implementation details**: Check relevant AAR in `000-docs/`
- **CLI usage**: Run `gwi --help`
- **Working contract**: See `CLAUDE.md`

---

*This document is for contributors. For architecture context, see `docs/context.md`.*
