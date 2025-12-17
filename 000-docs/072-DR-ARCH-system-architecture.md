# Git With Intent: System Architecture

**Version:** 0.1.0
**Date:** December 2024
**Status:** Accepted

---

## Overview

Git With Intent uses a multi-agent architecture with true agentic specialists.

## Architectural Principles

### 1. Agents, Not Functions

Every specialist is a full agent with:
- **State**: Persistent memory via AgentFS
- **Reasoning**: Can think through problems, not just execute
- **Collaboration**: Can communicate with other agents via A2A
- **Autonomy**: Makes decisions within its domain

### 2. Human-in-the-Loop by Design

- Humans approve, not supervise
- Escalation paths are explicit
- Audit trail for every decision

### 3. Multi-Model Strategy

- Right model for the right task
- Cost optimization
- Fallback redundancy

---

## System Components

```
┌──────────────────────────────────────────────────────────┐
│                        CLI (gwi)                          │
└────────────────────────────┬─────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────┐
│                      ORCHESTRATOR                         │
│              (Routes to specialist agents)                │
└────────────────────────────┬─────────────────────────────┘
                             │
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   TRIAGE    │       │  RESOLVER   │       │  REVIEWER   │
│   AGENT     │       │   AGENT     │       │   AGENT     │
│             │       │             │       │             │
│ Gemini Flash│       │ Claude      │       │ Claude      │
│ Classify    │       │ Resolve     │       │ Validate    │
└─────────────┘       └─────────────┘       └─────────────┘
     │                       │                       │
     └───────────────────────┼───────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────┐
│                 SHARED INFRASTRUCTURE                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │   AgentFS   │  │    Beads    │  │   GitHub    │       │
│  │   (State)   │  │   (Tasks)   │  │ (Integration)│       │
│  └─────────────┘  └─────────────┘  └─────────────┘       │
└──────────────────────────────────────────────────────────┘
```

---

## Agent Communication (A2A Protocol)

### Message Format

```typescript
interface A2AMessage {
  id: string;
  from: AgentId;
  to: AgentId | 'orchestrator';
  type: MessageType;
  payload: any;
  timestamp: number;
  correlationId?: string;
  priority: MessagePriority;
}
```

### Workflow: Merge Conflict Resolution

```
User → CLI → Orchestrator
              ↓
         Triage Agent (analyze)
              ↓
        [route decision]
              ↓
        Resolver Agent (resolve)
              ↓
        Reviewer Agent (validate)
              ↓
        [human approval]
              ↓
        Apply resolution
```

---

## Data Architecture

### AgentFS (Per Agent)

- SQLite database per agent
- Key-value store for state
- Tool call audit log
- File operations

### Beads (Task Tracking)

- JSONL in `.beads/` (git-tracked)
- Issue IDs: `bd-xxxx`
- Dependency tracking
- Ready work queue

---

## Model Selection

| Task | Model | Reasoning |
|------|-------|-----------|
| Triage | Gemini Flash | Fast, cheap |
| Simple resolve | Gemini Flash | Quick patterns |
| Medium resolve | Claude Sonnet | Good reasoning |
| Complex resolve | Claude Opus | Deep analysis |
| Review | Claude Sonnet | Security awareness |

---

## File Structure

```
git-with-intent/
├── apps/
│   └── cli/           # gwi command
├── packages/
│   ├── agents/        # Agent implementations
│   ├── core/          # AgentFS, Beads, A2A, Models
│   └── integrations/  # GitHub, GitLab
├── docs/
│   └── vision/        # Architecture docs
├── .beads/            # Task tracking
└── .agentfs/          # Agent state
```

---

## Non-Negotiable Rules

1. **AgentFS for ALL state** - No in-memory storage
2. **Beads for ALL tasks** - No markdown TODOs
3. **Audit ALL tool calls** - Full observability
4. **A2A for ALL agent communication** - Standard protocol
