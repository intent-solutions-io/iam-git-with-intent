# Git With Intent: Product Requirements Document

**Version:** 0.1.0
**Author:** Jeremy Longshore / Intent Solutions
**Date:** December 2024
**Status:** Active Development

---

## Executive Summary

**Git With Intent** is an AI-powered DevOps automation platform that handles PRs, merge conflicts, and issue-to-PR workflows using a multi-agent architecture.

### Vision Statement

**"Git with purpose. Ship with confidence."**

### Key Differentiators

- **Multi-model architecture**: Best-of-breed models (Claude for reasoning, Gemini for speed)
- **True agentic specialists**: Not functions—autonomous agents that reason and collaborate
- **Human-in-the-loop at the right moments**: Approval gates, not constant supervision
- **Built on production-proven infrastructure**: Vertex AI Agent Engine, AgentFS, Beads

---

## MVP Scope (Phase 1)

### Goal

CLI that resolves merge conflicts on GitHub PRs.

### Core Flow

```
gwi resolve https://github.com/org/repo/pull/123

→ Triage Agent analyzes complexity
→ Resolver Agent generates resolution
→ Reviewer Agent validates
→ Human approves
→ Resolution applied
```

### In Scope

- Triage Agent (Gemini Flash)
- Resolver Agent (Claude Sonnet/Opus)
- Reviewer Agent (Claude Sonnet)
- GitHub integration
- CLI interface

### Out of Scope

- GitLab / Bitbucket support
- VS Code extension
- Web dashboard
- Issue → PR workflow

---

## Technical Architecture

See `architecture.md` for detailed architecture.

### Non-Negotiable Dependencies

1. **AgentFS** - All agent state management
2. **Beads** - All task tracking (NO markdown TODOs)
3. **Vertex AI Agent Engine** - Agent orchestration

### Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| Triage | Gemini Flash | Classify complexity |
| Resolver | Claude Sonnet/Opus | Resolve conflicts |
| Reviewer | Claude Sonnet | Quality check |

---

## Success Metrics

### Functional

- 80%+ resolution rate for simple conflicts (complexity ≤ 3)
- 60%+ resolution rate for medium conflicts (complexity 4-6)
- 90%+ correct escalation for complex conflicts (complexity > 6)

### Performance

- Triage: < 5 seconds
- Simple resolution: < 30 seconds
- Medium resolution: < 2 minutes

### Quality

- Zero silent code loss
- Zero syntax errors in resolved code
- Clear, actionable explanations

---

## Roadmap

| Phase | Focus | Timeline |
|-------|-------|----------|
| 1 | MVP - Conflict Resolution | Current |
| 2 | Full Conflict Resolution | Next |
| 3 | Issue → PR | Future |
| 4 | SaaS Platform | Future |
