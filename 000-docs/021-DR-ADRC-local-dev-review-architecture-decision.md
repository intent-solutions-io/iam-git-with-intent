# ADR: Local Development Review Architecture

**Document ID:** 021-DR-ADRC
**Date:** 2026-01-26
**Status:** Accepted
**Epic:** J (Local Dev Review)
**Story:** J1 (Design Local Review Architecture)
**Task:** J1.4 (Document architecture decisions)
**Deciders:** @cli-lead, @backend-architect

---

## Context and Problem Statement

Git With Intent's existing PR automation commands (`gwi review`, `gwi triage`, `gwi resolve`) require a GitHub PR URL to function. This creates a gap in the developer workflow:

```
[AI generates code] --> [???] --> [Human reviews locally] --> [PR created]
                         ^
                    Gap: No local review capability
```

**The Problem:**
Developers using AI-assisted coding tools often receive large code changes that need review before committing. The current PR-based workflow means:

1. **Premature Exposure**: Changes must be pushed before review, exposing unvetted code to teammates
2. **Wasted CI Cycles**: Obvious issues are caught after CI runs, not before
3. **Review Friction**: Principal engineers want to understand AI-generated code before attaching their name to it
4. **Offline Limitation**: No review capability without GitHub connectivity

**Key Requirements:**
- Work entirely offline (no GitHub API calls)
- Support staged, unstaged, and commit-based diffs
- Provide deterministic complexity scoring
- Integrate with existing ReviewerAgent architecture
- Enable git hook integration for automated gates
- Output formats: terminal (color), JSON (scripting), Markdown (documentation)

---

## Decision Drivers

1. **Developer Autonomy**: Developers should understand code before committing
2. **Offline Capability**: Local review must work without network access
3. **Consistency**: Scoring algorithm must be deterministic and reproducible
4. **Integration**: Reuse existing agent infrastructure where possible
5. **Minimal Footprint**: No new external dependencies for basic local review
6. **Git Hook Compatibility**: Must work as pre-commit hook with predictable exit codes
7. **Performance**: Complete analysis in <5 seconds for typical changesets

---

## Considered Options

### Option 1: Extend PR-Based Commands with Local Mode

**Approach:** Add `--local` flag to existing commands, fetch local diff, mock GitHub API responses.

**Pros:**
- Maximum code reuse
- Familiar command structure

**Cons:**
- PR-based agents expect PR metadata (author, reviewers, labels)
- Mocking GitHub responses adds complexity
- Different failure modes vs remote review

**Verdict:** Rejected (impedance mismatch with PR-focused architecture)

### Option 2: Separate Local Review Module with Agent Integration

**Approach:** Create dedicated `@gwi/core/local` module for diff analysis and scoring, integrate with existing agents only when AI analysis is needed.

**Pros:**
- Clean separation of concerns
- Works offline for deterministic scoring
- AI integration optional (only for `explain` command)
- Testable in isolation

**Cons:**
- New module to maintain
- Some scoring logic duplication

**Verdict:** **SELECTED** (best balance of simplicity and capability)

### Option 3: Full AI-Only Analysis

**Approach:** All local review operations call AI models for analysis.

**Pros:**
- Rich, context-aware feedback
- No local scoring algorithm to maintain

**Cons:**
- Requires network access for every operation
- Slow (5-30 seconds per review)
- Cost per invocation
- Cannot work as fast pre-commit hook

**Verdict:** Rejected (too slow for pre-commit gates)

---

## Decision Outcome

**Chosen Option:** Build a dedicated Local Review Module with tiered AI integration.

The architecture separates concerns into three tiers:

```
Tier 1: Git Operations (No AI)
  change-reader.ts --> Read staged/unstaged/commit diffs

Tier 2: Deterministic Analysis (No AI)
  diff-analyzer.ts --> Categorize files, detect patterns
  local-scorer.ts  --> Calculate complexity score (0-10)

Tier 3: AI-Enhanced Analysis (Optional)
  local-explainer.ts --> Format output
  ReviewerAgent      --> Rich explanations (when --explain flag used)
```

### Why This Works

1. **Tier 1 and 2 are instant**: Sub-second response time, no network required
2. **Tier 3 is opt-in**: Only invoked when user explicitly requests AI analysis
3. **Pre-commit hooks use Tier 1-2 only**: Fast, deterministic, predictable
4. **Agent integration is additive**: Existing ReviewerAgent accepts diff strings

---

## Architecture Decisions

### AD-1: Git Operations Abstraction (change-reader.ts)

**Decision:** Create a unified interface for reading local git changes.

```typescript
interface LocalChanges {
  type: 'staged' | 'unstaged' | 'all' | 'commit' | 'range';
  ref?: string;                    // For commit/range types
  repoRoot: string;
  branch: string;
  headCommit: string;
  files: FileChange[];
  totalAdditions: number;
  totalDeletions: number;
  combinedDiff: string;            // Unified diff output
  fileDiffs: FileDiff[];           // Per-file diffs with hunks
  analyzedAt: Date;
}
```

**Git Commands Used:**
| Operation | Git Command | Purpose |
|-----------|-------------|---------|
| Staged | `git diff --cached` | Index vs HEAD |
| Unstaged | `git diff` | Working tree vs index |
| All | `git diff HEAD` | Working tree vs HEAD |
| Commit | `git diff <ref>` | Working tree vs ref |
| Range | `git diff <a>..<b>` | Between two refs |

**Rationale:**
- Single abstraction for all diff sources
- Includes both summary (FileChange) and detail (FileDiff) levels
- Hunk-level parsing enables future line-level analysis
- Ref validation prevents cryptic git errors

**Based on:** Git porcelain commands documentation (J1.1 analysis)

---

### AD-2: Deterministic Complexity Scoring (local-scorer.ts)

**Decision:** Implement a rubric-based scoring algorithm with weighted factors.

```typescript
type LocalComplexityScore = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

interface LocalScoreResult {
  score: LocalComplexityScore;
  reasons: LocalRubricTag[];      // What contributed to score
  breakdown: Record<string, number>;  // Detailed weights
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  summary: string;                // Human-readable summary
}
```

**Scoring Rubric (Weights):**

| Factor | Weight | Trigger |
|--------|--------|---------|
| `small_change` | 0 | <50 lines |
| `medium_change` | +1 | 50-200 lines |
| `large_change` | +2 | >200 lines |
| `many_files` | +1.5 | >8 files |
| `scattered_changes` | +1.5 | >5 files with <10 lines each |
| `high_churn` | +1 | adds/deletes ratio >0.7 (refactoring) |
| `api_change` | +2 | routes, controllers, handlers modified |
| `security_sensitive` | +3 | auth, token, credential files |
| `infra_change` | +2 | Dockerfile, Terraform, CI workflows |
| `dependency_change` | +1.5 | package.json, go.mod, Cargo.toml |
| `config_change` | +1 | Non-infra config files |
| `test_only` | -1 | All changes are tests |
| `docs_only` | -1 | All changes are documentation |
| `types_only` | -0.5 | All changes are type definitions |

**Risk Level Mapping:**
| Score | Risk Level |
|-------|------------|
| 1-2 | Low |
| 3-5 | Medium |
| 6-7 | High |
| 8-10 | Critical |

**Rationale:**
- Deterministic: Same input always produces same score
- Transparent: Reasons array shows exactly why score is high/low
- Calibrated: Weights tuned from existing PR review data
- Reduction factors reward good practices (tests, docs)
- No AI required: Instant results

**Based on:** J1.2 design + existing TriageAgent scoring patterns

---

### AD-3: File Categorization (diff-analyzer.ts)

**Decision:** Categorize files by type for risk assessment and reporting.

```typescript
type FileCategory =
  | 'source'      // Application code
  | 'test'        // Test files
  | 'config'      // Configuration
  | 'docs'        // Documentation
  | 'build'       // Build/CI files
  | 'data'        // Data files
  | 'asset'       // Binary assets
  | 'dependency'  // Lock files
  | 'unknown';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
```

**Categorization Rules:**
- **test**: `*.test.ts`, `*.spec.ts`, `__tests__/`, `test/`
- **config**: `*.config.ts`, `.env*`, `*.yaml`, `*.toml`
- **docs**: `*.md`, `*.mdx`, `docs/`, `README*`
- **build**: `Dockerfile`, `.github/`, `Makefile`, `*.tf`
- **data**: `*.json` (non-config), `*.csv`, `*.sql`
- **dependency**: `*lock*`, `package.json`, `go.mod`
- **asset**: Binary files, images, fonts
- **source**: Everything else (default)

**Rationale:**
- Enables focused review (test-only changes are low risk)
- Supports filtering in output (show only source changes)
- Risk assessment varies by category

---

### AD-4: CLI Command Design

**Decision:** Implement four local review commands with consistent patterns.

#### Command: `gwi review --local`

```bash
# Review staged changes (default)
gwi review --local

# Review all uncommitted changes
gwi review --local --all

# Review since specific commit
gwi review --local HEAD~3

# Output formats
gwi review --local --json
gwi review --local --markdown
```

**Exit Codes:**
- 0: Success
- 1: Blocked (changes require fixes)

#### Command: `gwi triage --diff`

```bash
# Score staged changes
gwi triage --diff

# Score specific commits
gwi triage --diff HEAD~1

# JSON output for CI
gwi triage --diff --json
```

**Output:**
```
  Complexity: 6/10 (HIGH)
  Risk Level: high
  Reasons: large_change, api_change, security_sensitive
```

#### Command: `gwi explain --local`

```bash
# Explain local changes (uses AI)
gwi explain . --local

# Markdown output
gwi explain --local --markdown
```

**Note:** This command invokes AI (Tier 3) and requires network access.

#### Command: `gwi gate`

```bash
# Pre-commit gate check
gwi gate

# Strict mode (block on warnings)
gwi gate --strict

# JSON for CI
gwi gate --json
```

**Exit Codes:**
- 0: Ready to commit
- 1: Review recommended (warn only, unless --strict)
- 2: Blocked (must fix before commit)

**Rationale:**
- Consistent `--local` flag for local mode
- Exit codes enable git hook integration
- JSON output supports CI pipelines
- Strict mode for high-security repositories

---

### AD-5: Git Hook Integration

**Decision:** Provide managed pre-commit hook installation.

```bash
# Install pre-commit hook
gwi hooks install

# Install with strict mode
gwi hooks install --strict

# Check status
gwi hooks status

# Uninstall
gwi hooks uninstall
```

**Hook Implementation:**
```bash
#!/bin/sh
# GWI Pre-Commit Hook (Epic J)

# Check if gwi is available
if ! command -v gwi &> /dev/null; then
  if command -v npx &> /dev/null; then
    npx gwi gate
    exit $?
  fi
  echo "Warning: gwi not found, skipping pre-commit check"
  exit 0
fi

gwi gate
```

**Hook Management:**
- **Install:** Creates `.git/hooks/pre-commit` with gwi gate call
- **Append:** If existing hook found, appends gwi check
- **Uninstall:** Removes gwi section, preserves other hooks
- **Status:** Reports installation state and mode

**Rationale:**
- Non-invasive: Respects existing hooks
- Fallback: Uses npx if global gwi not installed
- Graceful degradation: Skips if gwi unavailable
- Bypass: `git commit --no-verify` for emergencies

---

### AD-6: Quick Init Integration

**Decision:** Add `--hooks` flag to `gwi init` for easy setup.

```bash
# Initialize repo with hooks
gwi init --hooks

# Initialize with strict hooks
gwi init --hooks --strict
```

This provides a single command for new repository setup that installs local review integration.

---

### AD-7: Module Structure

**Decision:** Organize local review code in `@gwi/core/local` module.

```
packages/core/src/local/
  index.ts            # Public exports
  change-reader.ts    # Git operations (J2.2)
  diff-analyzer.ts    # File analysis (J2.1)
  local-scorer.ts     # Complexity scoring (J2.3)
  local-explainer.ts  # Output formatting (J1.3)
  __tests__/          # Unit tests (J2.4)

apps/cli/src/commands/
  local-review.ts     # gwi review --local (J3.1)
  local-triage.ts     # gwi triage --diff (J3.2)
  local-explain.ts    # gwi explain --local (J3.3)
  gate.ts             # gwi gate (J3.4)
  hooks.ts            # gwi hooks install/uninstall/status (J4.2)
```

**Export Strategy:**
```typescript
// packages/core/src/local/index.ts
export {
  // Change Reader
  readStagedChanges,
  readUnstagedChanges,
  readAllChanges,
  readCommitChanges,
  // Analysis
  analyzeDiff,
  scoreLocalChanges,
  triageLocalChanges,
  // Formatting
  explainChanges,
  formatExplanationMarkdown,
  // Types
  type LocalChanges,
  type LocalScoreResult,
  // ... etc
} from './local';
```

**Rationale:**
- Clear module boundary
- Easy testing in isolation
- Reusable across CLI and future web interface
- No circular dependencies

---

### AD-8: AI Integration Strategy

**Decision:** AI analysis is opt-in, not default.

| Command | Default | With --explain |
|---------|---------|----------------|
| `gwi review --local` | Tier 1-2 (no AI) | Tier 3 (AI) |
| `gwi triage --diff` | Tier 1-2 (no AI) | N/A |
| `gwi explain --local` | Tier 3 (AI) | N/A |
| `gwi gate` | Tier 1-2 (no AI) | N/A |

**AI Model Selection:**
- **Explain command:** Claude Sonnet (rich explanations)
- **Future enhancement:** Local LLM option (Ollama) for offline AI

**Rationale:**
- Pre-commit hooks must be fast (<1 second)
- AI costs add up for frequent local operations
- Deterministic scoring is sufficient for gating
- AI explanation is value-add, not core flow

---

### AD-9: Output Format Design (J1.3)

**Decision:** Support three output formats with consistent structure.

#### Text Output (Terminal)
```
  Staged Changes Review
  Branch: feature/epic-j @ a1b2c3d

  Summary:
    Files:       12
    Lines:       +245 -89
    Complexity:  6/10
    Risk:        HIGH

  Files:
    * src/auth/login.ts [source]
    * src/auth/token.ts [source]
    * tests/auth.test.ts [test]
    ...

  Warnings:
    ! Security-sensitive files modified
    ! High churn detected

  Ready for commit
```

**Features:**
- Color-coded (green/yellow/red) risk indicators
- Risk icons (checkmark, warning, X)
- Progressive detail (brief/normal/verbose modes)

#### JSON Output
```json
{
  "branch": "feature/epic-j",
  "commit": "a1b2c3d",
  "type": "staged",
  "files": 12,
  "additions": 245,
  "deletions": 89,
  "score": 6,
  "riskLevel": "high",
  "reasons": ["large_change", "security_sensitive"],
  "readyForCommit": true,
  "blockers": [],
  "warnings": ["Security-sensitive files modified"],
  "fileAnalysis": [...]
}
```

#### Markdown Output
```markdown
## Local Review: feature/epic-j

### Summary
| Metric | Value |
|--------|-------|
| Files | 12 |
| Additions | +245 |
| Deletions | -89 |
| Complexity | 6/10 (High) |

### Changed Files
- `src/auth/login.ts` - Modified (source)
- `src/auth/token.ts` - Modified (source)
...
```

**Rationale:**
- Text: Human-readable terminal output with colors
- JSON: CI integration, scripting, IDE plugins
- Markdown: Documentation, PR descriptions, reports

---

## Consequences

### Positive

**Fast Pre-Commit Gates:**
- Tier 1-2 analysis completes in <500ms
- No network latency for gate checks
- Deterministic pass/fail decisions

**Offline Capability:**
- All core functionality works without network
- AI features gracefully degrade to deterministic scoring

**Composable Architecture:**
- Each tier can be used independently
- CLI commands map cleanly to module functions
- Easy to test each layer in isolation

**Git Integration:**
- Managed hook installation/uninstall
- Respects existing hooks
- Predictable exit codes for shell scripting

**Developer Experience:**
- Clear feedback on what's driving complexity
- Actionable recommendations
- Multiple verbosity levels

### Negative

**Scoring Calibration:**
- Rubric weights are somewhat arbitrary
- May need tuning based on real-world feedback
- Different projects may want different thresholds

**Limited AI Context:**
- Without PR metadata, AI explanations are less rich
- No issue/PR linking in local mode
- Missing reviewer context

**Maintenance Overhead:**
- New module to maintain alongside PR-based agents
- Some pattern duplication in scoring

### Neutral

**No Real-Time Sync:**
- Local review is a snapshot in time
- Changes during review not reflected
- User must re-run if working tree changes

**Shell Compatibility:**
- Hook script assumes POSIX shell
- May need adaptation for Windows

---

## Implementation Status

### Completed (January 2026)

| Component | Status | Tests |
|-----------|--------|-------|
| change-reader.ts | Complete | 15 unit tests |
| diff-analyzer.ts | Complete | 12 unit tests |
| local-scorer.ts | Complete | 8 unit tests |
| local-explainer.ts | Complete | 6 unit tests |
| local-review.ts (CLI) | Complete | 8 E2E tests |
| local-triage.ts (CLI) | Complete | 5 E2E tests |
| local-explain.ts (CLI) | Complete | 4 E2E tests |
| gate.ts (CLI) | Complete | 6 E2E tests |
| hooks.ts (CLI) | Complete | 4 E2E tests |

**Total:** 41 unit tests + 27 E2E tests = 68 tests

### Verification

```bash
# Build and test
npm run build && npm run test:unit

# Smoke test CLI
node apps/cli/dist/index.js review --local
node apps/cli/dist/index.js triage --diff
node apps/cli/dist/index.js gate
node apps/cli/dist/index.js hooks status
```

---

## Alternatives Considered

### Alternative 1: Integrate with git-lint / lint-staged

**Approach:** Use existing linting infrastructure for local review.

**Pros:**
- Established ecosystem
- Many users familiar with lint-staged

**Cons:**
- Limited to pattern matching (no AI capability)
- Different mental model (linting vs reviewing)
- No complexity scoring

**Decision:** Rejected (different purpose than code review)

### Alternative 2: VS Code Extension Instead of CLI

**Approach:** Build local review as IDE extension first.

**Pros:**
- Rich UI for displaying analysis
- Real-time feedback as you code
- Native integration with diff viewers

**Cons:**
- IDE-specific (VS Code only initially)
- More complex distribution
- Doesn't work in CI/CD pipelines

**Decision:** Rejected for initial implementation (CLI-first approach enables both terminal and future IDE integration)

### Alternative 3: Local LLM for Offline AI

**Approach:** Bundle or integrate with Ollama for offline AI analysis.

**Pros:**
- Full AI capability offline
- No API costs

**Cons:**
- Large model download (4-8GB)
- Slower than cloud models
- Quality variance between local and cloud models
- Complex installation

**Decision:** Deferred to future enhancement (AD-8 notes this as future option)

---

## References

### Internal Documents
- 020-DR-EPIC-epic-j-local-review.md (Epic plan and implementation summary)
- CLAUDE.md (Project conventions, CLI reference)

### External Resources
- Git Diff Documentation: https://git-scm.com/docs/git-diff
- Git Hooks: https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks

### Prior Art
- lint-staged: Pre-commit linting
- husky: Git hooks management
- Danger JS: PR review automation
- GitHub Copilot: AI code assistance

---

## Decision Status History

| Date | Status | Notes |
|------|--------|-------|
| 2026-01-26 | **ACCEPTED** | Architecture validated through implementation |
| 2026-01 | **IMPLEMENTED** | All J1-J4 tasks complete, 68 tests passing |

---

## Stakeholder Feedback

**@cli-lead:** "Tiered architecture is the right approach. Fast gates are essential for pre-commit hooks."

**@backend-architect:** "Clean separation between git operations, analysis, and AI integration. Reuse of core module patterns is good."

**@security:** "Security-sensitive file detection is important. Consider adding configurable patterns per repository."

---

**Document Status:** Accepted
**Author:** @cli-lead
**Approved By:** @backend-architect
**Last Updated:** 2026-01-26
