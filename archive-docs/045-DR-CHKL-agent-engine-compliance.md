# Agent Engine Compliance Checklist

> Use this checklist to verify any change is Agent Engine compliant.

---

## Pre-Commit Checklist

### Runtime Compatibility

- [ ] Code runs on Agent Engine runtime (no local-only assumptions)
- [ ] No deprecated ADK patterns (`google.adk.serving.fastapi`)
- [ ] No hardcoded model names (use `MODELS` config)
- [ ] State stored via `TenantStore`, not local filesystem

### Tool Contracts

- [ ] All tool inputs have Zod schema validation
- [ ] All tool outputs have Zod schema validation
- [ ] Schemas are versioned (include `version` field)
- [ ] No unstructured text in tool responses

### Run Artifacts

- [ ] Run creates `.gwi/runs/<runId>/run.json`
- [ ] Run creates `.gwi/runs/<runId>/audit.log`
- [ ] All state transitions are audited
- [ ] Errors are audited with stack traces

### Approval Gating

- [ ] Gated operations check approval before execution
- [ ] Approval includes `patchHash`
- [ ] Hash is verified before applying changes
- [ ] Invalid approvals are rejected (not silently skipped)

### Observability

- [ ] `runId` propagated through all operations
- [ ] Logs are structured JSON
- [ ] Required fields present: `timestamp`, `runId`, `level`, `action`
- [ ] Errors include context for debugging

### Testing

- [ ] Unit tests added for new code
- [ ] Golden tests updated if deterministic behavior changed
- [ ] Contract tests pass
- [ ] `npm run arv` passes locally

---

## How to Verify

| Requirement | Verification Command |
|-------------|---------------------|
| No forbidden patterns | `npm run arv:lint` |
| Contract schemas valid | `npm run arv:contracts` |
| Goldens match | `npm run arv:goldens` |
| Runtime boots | `npm run arv:smoke` |
| All ARV checks | `npm run arv` |
| Build succeeds | `npm run build` |
| Tests pass | `npm run test` |
| Types check | `npm run typecheck` |

---

## Forbidden Patterns Reference

### Import Patterns to Avoid

```typescript
// FORBIDDEN: Deprecated ADK serving
import { FastAPIServer } from 'google.adk.serving';

// FORBIDDEN: Local-only state
fs.writeFileSync('.gwi/state.json', state);

// FORBIDDEN: Hardcoded models
const model = 'claude-3-opus-20240229';

// FORBIDDEN: Unstructured logging
console.log('Something happened');
```

### Correct Patterns

```typescript
// CORRECT: Use storage interface
await tenantStore.updateRun(runId, state);

// CORRECT: Use MODELS config
import { MODELS } from '@gwi/core';
const model = MODELS.resolver;

// CORRECT: Structured logging
logger.info({ runId, action: 'triage_complete', score: 5 });
```

---

## Golden Test Fixtures

### Location

```
packages/core/src/scoring/__tests__/fixtures/golden-inputs.json
```

### When to Update

Update golden fixtures when:
- Intentionally changing scoring algorithm
- Adding new scoring factors
- Fixing a scoring bug

Do NOT update goldens to "make tests pass" without understanding why they changed.

### Update Process

1. Run `npm run arv:goldens` to see failures
2. Review each failure - is it intentional?
3. If intentional, update fixture expected values
4. Document change in commit message
5. Re-run `npm run arv:goldens` to confirm

---

## Contract Schema Rules

### Schema Versioning

Every schema MUST include a version field:

```typescript
const TriageResultSchema = z.object({
  version: z.literal(1),
  // ... other fields
});
```

### Breaking Changes

If you need to change a schema:
1. Increment version number
2. Add migration logic if needed
3. Update all consumers
4. Update contract tests

### Adding New Schemas

1. Create schema in `packages/core/src/run-bundle/schemas/`
2. Add to `index.ts` exports
3. Add contract test in `test/contracts/`
4. Add fixture examples (valid and invalid)

---

## CI Gate Requirements

### ARV Workflow Checks

```yaml
# .github/workflows/arv.yml runs:
- npm run arv:lint      # Forbidden patterns
- npm run arv:contracts # Schema validation
- npm run arv:goldens   # Deterministic outputs
- npm run arv:smoke     # Boot check
```

### Failure Response

If ARV fails in CI:

1. **Do not bypass** - Fix the issue
2. Check which sub-check failed
3. Run locally: `npm run arv`
4. Fix the root cause
5. Push fix and re-run CI

---

## Approval Record Structure

```typescript
interface ApprovalRecord {
  runId: string;           // UUID of the run
  approvedAt: string;      // ISO 8601 timestamp
  approvedBy: string;      // User email or system ID
  scope: ApprovalScope[];  // ['commit', 'push', 'open_pr', 'merge']
  patchHash: string;       // SHA256 of patch.diff
  comment?: string;        // Optional approval comment
}
```

### Scope Definitions

| Scope | Allows |
|-------|--------|
| `commit` | Creating git commits |
| `push` | Pushing to remote |
| `open_pr` | Creating/updating PRs |
| `merge` | Merging PRs |

---

## Summary

Before merging any PR:

1. `npm run arv` passes locally
2. All checklist items verified
3. CI ARV gate is green
4. No forbidden patterns in diff
5. Goldens updated intentionally (if changed)
