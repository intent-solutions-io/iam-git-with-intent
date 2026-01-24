# Epic J: Local Development & Pre-PR Review

**Document ID:** 020-DR-EPIC
**Epic:** J (Local Dev Tools)
**Owner:** @cli
**Priority:** P2
**Status:** Implemented
**Total Tasks:** 16 (4 stories)
**Implementation Date:** January 2026

## Executive Summary

Enable developers to review and understand AI-generated code **locally** before creating PRs. This addresses the critical gap in the current workflow where the human developer (the principal engineer whose name is attached to the code) needs efficient local tooling to review AI output before exposing it to peers.

### The Problem

Current gwi commands require PR URLs:
```bash
gwi review <pr-url>   # Too late - already pushed
gwi triage <pr-url>   # Too late - already public
```

The missing workflow step:
```
[AI generates code] → [???] → [Human reviews locally] → [Ready for PR]
                       ↑
                 Epic J fills this gap
```

### The Solution

Local-first CLI commands that work on uncommitted/local changes:
```bash
gwi review --local           # Review staged/unstaged changes
gwi triage --diff HEAD~1     # Score recent commit complexity
gwi explain .                # "What changed and why?" summary
gwi gate                     # Pre-commit review gate with approval
```

## Epic Structure

```
Epic J: Local Dev Review (P2)
├── Story J1: Design Local Review Architecture
│   ├── J1.1: Analyze local git operations (diff, staged, unstaged)
│   ├── J1.2: Define complexity scoring for local changes
│   ├── J1.3: Design explainer output format (terminal-friendly)
│   └── J1.4: Document architecture decisions (ADR)
│
├── Story J2: Core Local Review Implementation
│   ├── J2.1: Create LocalDiffAnalyzer service
│   ├── J2.2: Implement staged/unstaged change reader
│   ├── J2.3: Port review scoring logic from PR-based flow
│   └── J2.4: Write unit tests for core services
│
├── Story J3: CLI Commands
│   ├── J3.1: Implement `gwi review --local` command
│   ├── J3.2: Implement `gwi triage --diff <ref>` command
│   ├── J3.3: Implement `gwi explain <path>` command
│   ├── J3.4: Implement `gwi gate` pre-commit approval command
│
└── Story J4: Integration & Polish
    ├── J4.1: Integrate with existing Reviewer agent
    ├── J4.2: Add git hook integration (optional pre-commit)
    ├── J4.3: End-to-end integration tests
    └── J4.4: Documentation and examples
```

## Story Breakdown

### Story J1: Design Local Review Architecture

**Goal:** Design the architecture for local diff analysis without requiring GitHub.

| Task | Description | Acceptance Criteria |
|------|-------------|---------------------|
| J1.1 | Analyze local git operations | Document git commands for staged, unstaged, commit diffs |
| J1.2 | Define complexity scoring | Adapt PR scoring model for local patches |
| J1.3 | Design output format | Terminal-friendly, supports color, machine-readable option |
| J1.4 | Architecture ADR | Decision record in 000-docs/ |

### Story J2: Core Local Review Implementation

**Goal:** Build the core services for analyzing local changes.

| Task | Description | Acceptance Criteria |
|------|-------------|---------------------|
| J2.1 | LocalDiffAnalyzer | Service that extracts diffs from local git state |
| J2.2 | Change reader | Support staged, unstaged, HEAD~N, arbitrary refs |
| J2.3 | Scoring logic | Reuse/adapt TriageAgent scoring for local diffs |
| J2.4 | Unit tests | >80% coverage on new services |

### Story J3: CLI Commands

**Goal:** Expose local review capabilities through gwi CLI.

| Task | Description | Acceptance Criteria |
|------|-------------|---------------------|
| J3.1 | `gwi review --local` | Reviews staged changes, outputs findings |
| J3.2 | `gwi triage --diff` | Scores complexity of local commits |
| J3.3 | `gwi explain` | AI-generated summary of what changed and why |
| J3.4 | `gwi gate` | Interactive approval gate, blocks until human confirms |

### Story J4: Integration & Polish

**Goal:** Polish the experience and integrate with existing systems.

| Task | Description | Acceptance Criteria |
|------|-------------|---------------------|
| J4.1 | Reviewer agent integration | Reuse existing agent with local diff input |
| J4.2 | Git hook support | Optional pre-commit hook that runs gate |
| J4.3 | E2E tests | Test full workflows in CI |
| J4.4 | Documentation | README section, examples, --help text |

## Dependencies

- **Internal:** Reuses ReviewerAgent from `packages/agents/`
- **External:** None (works offline, no GitHub API required)
- **Sequencing:** J1 → J2 → J3 → J4

## Technical Architecture

### Package Structure
```
packages/core/src/local/
├── diff-analyzer.ts      # Git diff extraction
├── change-reader.ts      # Staged/unstaged/ref support
├── local-scorer.ts       # Complexity scoring
└── index.ts

apps/cli/src/commands/
├── review.ts             # Add --local flag
├── triage.ts             # Add --diff flag
├── explain.ts            # New command
└── gate.ts               # New command
```

### Key Design Decisions

1. **No GitHub dependency:** All operations work with local git only
2. **Reuse agents:** ReviewerAgent accepts diff string, not just PR URL
3. **Terminal-first:** Rich terminal output with colors, but JSON option for scripting
4. **Non-blocking by default:** `gwi gate` is the only blocking command

## Success Metrics

- Developer can review AI-generated code before committing
- Review output is actionable (not just "looks good")
- Commands complete in <5s for typical change sets
- Zero network calls required for local review

## Cost Analysis

- **API costs:** Uses same LLM calls as PR review, no additional cost
- **Infrastructure:** None (CLI-only, no server)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Large diffs overwhelm LLM | Chunk processing, summary mode |
| User expects PR-level detail | Clear docs on local vs PR capabilities |
| Git edge cases | Comprehensive error handling, fallback to basic diff |

---

## Implementation Summary

### Completed Stories

| Story | Status | Key Deliverables |
|-------|--------|------------------|
| J1: Design | ✅ Complete | Architecture documented, scoring rubric defined |
| J2: Core | ✅ Complete | 5 core modules, 41 unit tests |
| J3: CLI | ✅ Complete | 4 new commands, help text, JSON output |
| J4: Integration | ✅ Complete | Git hooks, 27 E2E tests, documentation |

### Files Created

**Core Module** (`packages/core/src/local/`):
- `change-reader.ts` - Git operations (staged, unstaged, commit diffs)
- `diff-analyzer.ts` - File categorization, complexity analysis, pattern detection
- `local-explainer.ts` - Human-readable explanation formatting
- `local-scorer.ts` - Deterministic complexity scoring (0-10 scale)
- `index.ts` - Module exports
- `__tests__/local-module.test.ts` - 41 unit tests

**CLI Commands** (`apps/cli/src/commands/`):
- `local-review.ts` - `gwi review --local` implementation
- `local-triage.ts` - `gwi triage --diff` implementation
- `local-explain.ts` - `gwi explain --local` implementation
- `gate.ts` - `gwi gate` pre-commit gate
- `hooks.ts` - `gwi hooks install/uninstall/status`

**Tests** (`test/e2e/`):
- `local-review.e2e.test.ts` - 27 E2E tests

### Command Reference

```bash
# Review local changes
gwi review --local              # Review staged changes
gwi review --local -a           # Review all uncommitted
gwi review --local HEAD~1       # Review since commit

# Triage complexity
gwi triage --diff               # Score staged changes
gwi triage --diff HEAD~3        # Score last 3 commits
gwi triage --diff --json        # JSON output

# Explain changes
gwi explain . --local           # Explain local changes
gwi explain --local --markdown  # Markdown output

# Pre-commit gate
gwi gate                        # Check before commit
gwi gate --strict               # Block on warnings
gwi gate --json                 # JSON output

# Git hooks
gwi hooks install               # Install pre-commit hook
gwi hooks install --strict      # Install with strict mode
gwi hooks uninstall             # Remove hook
gwi hooks status                # Check installation

# Quick setup
gwi init --hooks                # Initialize with hooks
```

### Exit Codes (gate command)

| Code | Meaning |
|------|---------|
| 0 | Ready to commit |
| 1 | Review recommended (--strict mode) |
| 2 | Blocked (must fix before commit) |

### Scoring Rubric

The complexity score (0-10) is calculated based on:
- **Size**: Lines changed, files affected
- **Scope**: Single-concern vs scattered changes
- **Risk**: Security-sensitive files, config changes
- **Patterns**: Missing tests, high-churn files

| Score | Risk Level | Recommendation |
|-------|------------|----------------|
| 0-3 | Low | Ready to commit |
| 4-6 | Medium | Review recommended |
| 7-10 | High | Consider splitting |
