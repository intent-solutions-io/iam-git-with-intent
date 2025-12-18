# 012-AT-ARCH: Run Types and Sub-Agent Pipeline Design

**Document ID:** 012-AT-ARCH
**Document Type:** Architecture Technical Document
**Created:** 2025-12-15
**Last Updated:** 2025-12-15
**Status:** APPROVED
**Author:** Jeremy Longshore, Claude Code (Opus 4.5)
**Applies To:** Git With Intent agent pipeline

---

> **Filing Standard:** This document follows docs-filing v4 (6767-a-DR-STND-document-filing-system-standard-v4.md)
> - `012` = chronological sequence number
> - `AT` = Architecture & Technical category
> - `ARCH` = Architecture document type

---

## Overview

This document defines the run types and sub-agent pipeline for Git With Intent Cloud. Each run type represents a user-facing workflow that coordinates one or more specialist agents to accomplish a task.

**Key Principles:**
- Users see simple run types (TRIAGE, PLAN, RESOLVE, REVIEW, AUTOPILOT)
- Behind the scenes, an Orchestrator routes to specialist agents
- Agents follow the bobs-brain A2A pattern for inter-agent communication
- All runs are tracked in RunStore with step-by-step progress

---

## 1. Agent Inventory

### 1.1 Agent Roles

| Agent | Model | Purpose | Deployment |
|-------|-------|---------|------------|
| **Orchestrator** | Gemini Flash | Route requests, coordinate pipeline | Agent Engine |
| **TriageAgent** | Gemini Flash | Analyze complexity, classify risks | Agent Engine |
| **PlannerAgent** | Claude Sonnet | Generate actionable change plans | Agent Engine |
| **CoderAgent** | Claude Sonnet/Opus | Write code patches, resolve conflicts | Agent Engine |
| **ValidatorAgent** | Gemini Flash | Run tests, verify changes | Agent Engine |
| **ReviewerAgent** | Claude Sonnet | Produce reviews, summarize changes | Agent Engine |

### 1.2 Agent SPIFFE IDs

```
spiffe://intent.solutions/agent/gwi/orchestrator
spiffe://intent.solutions/agent/gwi/triage
spiffe://intent.solutions/agent/gwi/planner
spiffe://intent.solutions/agent/gwi/coder
spiffe://intent.solutions/agent/gwi/validator
spiffe://intent.solutions/agent/gwi/reviewer
```

### 1.3 Model Selection Strategy

| Agent | Default Model | Escalation Model | Escalation Trigger |
|-------|---------------|------------------|-------------------|
| TriageAgent | Gemini 2.0 Flash | Gemini 2.0 Pro | Diff > 1000 lines |
| PlannerAgent | Gemini 2.0 Flash | Claude Sonnet 4 | Complexity > 3 |
| CoderAgent | Claude Sonnet 4 | Claude Opus 4 | Complexity > 4 |
| ValidatorAgent | Gemini 2.0 Flash | Claude Sonnet 4 | Test failures |
| ReviewerAgent | Claude Sonnet 4 | Claude Opus 4 | Security flags |

---

## 2. Run Types

### 2.1 TRIAGE

**Purpose:** Analyze a PR/issue to understand complexity, risks, and scope.

**User Command:**
```bash
gwi triage https://github.com/org/repo/pull/123
```

**Pipeline:**

```
User Request
    │
    ▼
┌──────────────────┐
│   Orchestrator   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   TriageAgent    │
└────────┬─────────┘
         │
         ▼
     Triage Result
```

**Agent Sequence:**

| Step | Agent | Input | Output |
|------|-------|-------|--------|
| 1 | TriageAgent | PR URL, diff, issue body | Triage summary |

**TriageAgent Details:**

- **Model:** Gemini 2.0 Flash
- **Input:**
  ```typescript
  interface TriageInput {
    prUrl: string;
    diff: string;           // Git diff content
    issueBody?: string;     // Linked issue description
    fileList: string[];     // Changed files
    commitMessages: string[];
  }
  ```
- **Output:**
  ```typescript
  interface TriageOutput {
    complexity: number;      // 1-5 scale
    conflictCount: number;
    conflictFiles: string[];
    riskTags: string[];      // e.g., ["breaking-change", "security"]
    estimatedEffort: 'trivial' | 'small' | 'medium' | 'large';
    summary: string;         // Human-readable summary
    recommendations: {
      suggestedRunType: 'PLAN' | 'RESOLVE' | 'REVIEW';
      autoResolvable: boolean;
      requiresHumanReview: boolean;
    };
  }
  ```

---

### 2.2 PLAN

**Purpose:** Generate an actionable change plan based on triage output or issue description.

**User Command:**
```bash
gwi plan https://github.com/org/repo/pull/123
```

**Pipeline:**

```
User Request
    │
    ▼
┌──────────────────┐
│   Orchestrator   │
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────────┐
│ Triage │→│  Planner   │
│ Agent  │ │   Agent    │
└────────┘ └────────────┘
                │
                ▼
           Plan Result
```

**Agent Sequence:**

| Step | Agent | Input | Output |
|------|-------|-------|--------|
| 1 | TriageAgent | PR URL, diff | Triage summary |
| 2 | PlannerAgent | Triage output | Change plan |

**PlannerAgent Details:**

- **Model:** Claude Sonnet 4 (escalate from Gemini for complex cases)
- **Input:**
  ```typescript
  interface PlanInput {
    triageOutput: TriageOutput;
    prUrl: string;
    codeContext?: string;   // Relevant code snippets
    userConstraints?: {
      maxFilesTouched: number;
      preferredApproach?: string;
    };
  }
  ```
- **Output:**
  ```typescript
  interface PlanOutput {
    steps: PlanStep[];
    estimatedComplexity: number;
    estimatedTokens: number;
    warnings: string[];
  }

  interface PlanStep {
    id: string;
    action: 'modify' | 'create' | 'delete' | 'rename';
    file: string;
    description: string;
    dependencies: string[];  // Step IDs this depends on
    risk: 'low' | 'medium' | 'high';
  }
  ```

---

### 2.3 RESOLVE

**Purpose:** Automatically resolve merge conflicts in a PR.

**User Command:**
```bash
gwi resolve https://github.com/org/repo/pull/123
```

**Pipeline:**

```
User Request
    │
    ▼
┌──────────────────┐
│   Orchestrator   │
└────────┬─────────┘
         │
    ┌────┴────────┬────────────┐
    ▼             ▼            ▼
┌────────┐  ┌──────────┐  ┌──────────┐
│ Triage │→ │  Coder   │→ │ Reviewer │
│ Agent  │  │  Agent   │  │  Agent   │
└────────┘  └──────────┘  └──────────┘
                               │
                               ▼
                        Resolve Result
```

**Agent Sequence:**

| Step | Agent | Input | Output |
|------|-------|-------|--------|
| 1 | TriageAgent | PR URL, conflict markers | Conflict analysis |
| 2 | CoderAgent | Conflicts, context | Resolved patches |
| 3 | ReviewerAgent | Patches, original | Review summary |

**CoderAgent Details:**

- **Model:** Claude Sonnet 4 (Opus for complexity > 4)
- **Input:**
  ```typescript
  interface CoderInput {
    triageOutput: TriageOutput;
    conflicts: ConflictMarker[];
    surroundingCode: {
      file: string;
      before: string;  // 50 lines before conflict
      after: string;   // 50 lines after conflict
    }[];
    planSteps?: PlanStep[];  // If PLAN was run first
    riskMode: 'comment_only' | 'suggest_patch' | 'auto_patch' | 'auto_push';
  }

  interface ConflictMarker {
    file: string;
    startLine: number;
    endLine: number;
    oursContent: string;
    theirsContent: string;
    baseContent?: string;
  }
  ```
- **Output:**
  ```typescript
  interface CoderOutput {
    patches: Patch[];
    notes: string[];
    confidence: number;  // 0-100
    warnings: string[];
  }

  interface Patch {
    file: string;
    hunks: PatchHunk[];
    explanation: string;
  }

  interface PatchHunk {
    startLine: number;
    endLine: number;
    originalContent: string;
    newContent: string;
  }
  ```

---

### 2.4 REVIEW

**Purpose:** Generate a comprehensive code review for a PR.

**User Command:**
```bash
gwi review https://github.com/org/repo/pull/123
```

**Pipeline:**

```
User Request
    │
    ▼
┌──────────────────┐
│   Orchestrator   │
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌──────────┐
│ Triage │→│ Reviewer │
│ Agent  │ │  Agent   │
└────────┘ └──────────┘
                │
                ▼
          Review Result
```

**Agent Sequence:**

| Step | Agent | Input | Output |
|------|-------|-------|--------|
| 1 | TriageAgent | PR URL, diff | Triage summary |
| 2 | ReviewerAgent | Diff, triage | Review comments |

**ReviewerAgent Details:**

- **Model:** Claude Sonnet 4 (Opus for security-flagged PRs)
- **Input:**
  ```typescript
  interface ReviewerInput {
    triageOutput: TriageOutput;
    diff: string;
    prMetadata: {
      title: string;
      description: string;
      author: string;
      baseBranch: string;
      headBranch: string;
    };
    previousReviews?: string[];  // Existing PR comments
  }
  ```
- **Output:**
  ```typescript
  interface ReviewerOutput {
    summary: string;          // Overall assessment
    recommendation: 'approve' | 'request_changes' | 'comment';
    comments: ReviewComment[];
    riskAssessment: {
      securityIssues: string[];
      breakingChanges: string[];
      testingGaps: string[];
      performanceConcerns: string[];
    };
    confidence: number;       // 0-100
  }

  interface ReviewComment {
    file: string;
    line: number;
    severity: 'critical' | 'warning' | 'suggestion' | 'nitpick';
    category: 'bug' | 'security' | 'style' | 'performance' | 'clarity';
    comment: string;
    suggestedFix?: string;
  }
  ```

---

### 2.5 AUTOPILOT

**Purpose:** Full automated pipeline from analysis to review.

**User Command:**
```bash
gwi autopilot https://github.com/org/repo/pull/123
```

**Pipeline:**

```
User Request
    │
    ▼
┌──────────────────┐
│   Orchestrator   │
└────────┬─────────┘
         │
    ┌────┴────────┬────────────┬────────────┬────────────┐
    ▼             ▼            ▼            ▼            ▼
┌────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐ ┌──────────┐
│ Triage │→ │ Planner  │→ │  Coder   │→ │ Validator │→│ Reviewer │
│ Agent  │  │  Agent   │  │  Agent   │  │   Agent   │ │  Agent   │
└────────┘  └──────────┘  └──────────┘  └───────────┘ └──────────┘
                                                            │
                                                            ▼
                                                    Autopilot Result
```

**Agent Sequence:**

| Step | Agent | Input | Output |
|------|-------|-------|--------|
| 1 | TriageAgent | PR URL, diff | Triage summary |
| 2 | PlannerAgent | Triage output | Change plan |
| 3 | CoderAgent | Plan, conflicts | Resolved patches |
| 4 | ValidatorAgent | Patches | Test results |
| 5 | ReviewerAgent | All outputs | Final review |

**ValidatorAgent Details:**

- **Model:** Gemini 2.0 Flash
- **Input:**
  ```typescript
  interface ValidatorInput {
    patches: Patch[];
    testCommands: string[];   // e.g., ["npm test", "npm run lint"]
    repoConfig: {
      language: string;
      testFramework?: string;
      linter?: string;
    };
  }
  ```
- **Output:**
  ```typescript
  interface ValidatorOutput {
    testsRan: boolean;
    testsPassed: boolean;
    testResults: {
      command: string;
      exitCode: number;
      output: string;
      failures: string[];
    }[];
    lintResults?: {
      errors: number;
      warnings: number;
      details: string[];
    };
    coverageImpact?: {
      before: number;
      after: number;
      delta: number;
    };
  }
  ```

---

## 3. RunStore Mapping

### 3.1 Run Document Structure

Each run maps to a Firestore document (see 010-DR-ADRC):

```typescript
interface RunDocument {
  id: string;
  tenantId: string;
  repoId: string;
  type: 'TRIAGE' | 'PLAN' | 'RESOLVE' | 'REVIEW' | 'AUTOPILOT';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

  // Steps array tracks agent progress
  steps: {
    id: string;
    agent: 'triage' | 'planner' | 'coder' | 'validator' | 'reviewer';
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    error?: string;
    startedAt?: Timestamp;
    completedAt?: Timestamp;
  }[];

  // Final result
  result?: {
    success: boolean;
    summary: string;
    // Type-specific fields
  };
}
```

### 3.2 Step Status Flow

```
pending → running → completed
                 ↘ failed
                 ↘ skipped (if previous step failed and not required)
```

---

## 4. A2A Protocol Integration

### 4.1 A2A Payload Structure

Following bobs-brain patterns, each agent call uses:

```typescript
interface A2AAgentCall {
  agent_role: string;          // "triage", "coder", etc.
  prompt: string;              // Task description

  context: {
    tenantId: string;
    runId: string;
    repoId: string;
    stepId: string;            // Current step
    prUrl?: string;
    previousStepOutputs?: Record<string, unknown>;
  };

  correlation_id: string;      // runId for tracing
  caller_spiffe_id: string;    // Orchestrator's SPIFFE ID
  env: string;                 // "prod" | "staging" | "dev"
}
```

### 4.2 A2A Response Structure

```typescript
interface A2AAgentResult {
  response: string;            // Structured JSON as string
  session_id?: string;
  metadata: {
    agent_role: string;
    model_used: string;
    tokens_used: number;
    latency_ms: number;
  };
  error?: string;
  correlation_id: string;
  target_spiffe_id: string;
}
```

### 4.3 Orchestrator Routing Logic

```typescript
async function executeRun(run: Run): Promise<RunResult> {
  const steps = getStepsForRunType(run.type);

  for (const step of steps) {
    // Update step status
    await runStore.updateStep(run.id, step.id, { status: 'running' });

    // Build A2A call
    const call: A2AAgentCall = {
      agent_role: step.agent,
      prompt: buildPromptForStep(step, previousOutputs),
      context: {
        tenantId: run.tenantId,
        runId: run.id,
        repoId: run.repoId,
        stepId: step.id,
        prUrl: run.prUrl,
        previousStepOutputs: previousOutputs
      },
      correlation_id: run.id,
      caller_spiffe_id: ORCHESTRATOR_SPIFFE_ID,
      env: process.env.DEPLOYMENT_ENV
    };

    // Call agent via A2A gateway
    const result = await a2aGateway.call(call);

    // Store output
    previousOutputs[step.agent] = JSON.parse(result.response);

    // Update step status
    await runStore.updateStep(run.id, step.id, {
      status: result.error ? 'failed' : 'completed',
      output: previousOutputs[step.agent],
      error: result.error
    });

    // Fail fast if step failed
    if (result.error) {
      await runStore.failRun(run.id, result.error);
      return { success: false, error: result.error };
    }
  }

  // Complete run
  const finalResult = buildFinalResult(run.type, previousOutputs);
  await runStore.completeRun(run.id, finalResult);
  return finalResult;
}
```

---

## 5. Pipeline Diagrams

### 5.1 Full AUTOPILOT Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AUTOPILOT Run                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────┐                                                 │
│  │  User Request  │                                                 │
│  │  (PR URL)      │                                                 │
│  └───────┬────────┘                                                 │
│          │                                                          │
│          ▼                                                          │
│  ┌────────────────┐                                                 │
│  │  Orchestrator  │  ─── Creates Run in RunStore                    │
│  └───────┬────────┘                                                 │
│          │                                                          │
│          │ Step 1: TRIAGE                                           │
│          ▼                                                          │
│  ┌────────────────┐                                                 │
│  │  TriageAgent   │  ─── Gemini Flash                               │
│  │                │      Input: PR diff, issue body                 │
│  │                │      Output: Complexity, risks, recommendations │
│  └───────┬────────┘                                                 │
│          │                                                          │
│          │ Step 2: PLAN                                             │
│          ▼                                                          │
│  ┌────────────────┐                                                 │
│  │  PlannerAgent  │  ─── Claude Sonnet                              │
│  │                │      Input: Triage output                       │
│  │                │      Output: Step-by-step change plan           │
│  └───────┬────────┘                                                 │
│          │                                                          │
│          │ Step 3: CODE                                             │
│          ▼                                                          │
│  ┌────────────────┐                                                 │
│  │  CoderAgent    │  ─── Claude Sonnet/Opus                         │
│  │                │      Input: Plan, conflict markers              │
│  │                │      Output: Patches, explanations              │
│  └───────┬────────┘                                                 │
│          │                                                          │
│          │ Step 4: VALIDATE                                         │
│          ▼                                                          │
│  ┌────────────────┐                                                 │
│  │ ValidatorAgent │  ─── Gemini Flash                               │
│  │                │      Input: Patches, test commands              │
│  │                │      Output: Test results, lint results         │
│  └───────┬────────┘                                                 │
│          │                                                          │
│          │ Step 5: REVIEW                                           │
│          ▼                                                          │
│  ┌────────────────┐                                                 │
│  │ ReviewerAgent  │  ─── Claude Sonnet                              │
│  │                │      Input: All previous outputs                │
│  │                │      Output: Summary, recommendation            │
│  └───────┬────────┘                                                 │
│          │                                                          │
│          ▼                                                          │
│  ┌────────────────┐                                                 │
│  │  Final Result  │  ─── Posted to GitHub PR as comment             │
│  └────────────────┘                                                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Failure Handling

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Failure Handling                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Agent Failure:                                                     │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐                    │
│  │ Triage   │ ──▶ │  Coder   │ ──✗ │ Reviewer │                    │
│  │ (pass)   │     │ (fail)   │     │ (skip)   │                    │
│  └──────────┘     └──────────┘     └──────────┘                    │
│                         │                                           │
│                         ▼                                           │
│                   Run Status: FAILED                                │
│                   Error: "CoderAgent failed: ..."                   │
│                                                                     │
│  Recovery Options:                                                  │
│  1. Retry: POST /runs/{runId}:retry                                │
│  2. Skip: POST /runs/{runId}:skip?step=coder                       │
│  3. Cancel: POST /runs/{runId}:cancel                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Future Extensions

### 6.1 Additional Agents (Future)

| Agent | Purpose | Version |
|-------|---------|---------|
| **DocsAgent** | Update documentation | v0.2 |
| **TestGenAgent** | Generate test cases | v0.2 |
| **SecurityAgent** | Deep security analysis | v0.3 |
| **RefactorAgent** | Suggest refactorings | v0.3 |

### 6.2 Parallel Agent Execution

Currently: Sequential pipeline
Future: Parallel execution where dependencies allow

```
         ┌──▶ CoderAgent ──┐
Triage ──┤                 ├──▶ Reviewer
         └──▶ TestGenAgent ─┘
```

---

## References

- 009-PM-PRDC: Git With Intent Cloud PRD
- 010-DR-ADRC: Multi-Tenant Data Model
- 011-DR-ADRC: API Surface
- bobs-brain/101-AT-ARCH: Agent Engine Topology
- bobs-brain/102-AT-ARCH: Cloud Run Gateways

---

*intent solutions io — confidential IP*
*Contact: jeremy@intentsolutions.io*
