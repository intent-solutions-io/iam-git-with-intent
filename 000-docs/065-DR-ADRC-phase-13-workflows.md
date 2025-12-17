# ADR-013: Full Multi-Agent Workflow Implementation

**Status:** Accepted
**Date:** 2025-12-16
**Phase:** 13
**Author:** Claude (AI Assistant) with Jeremy

## Context

Phase 12 established self-serve onboarding and beta gating. Phase 13 focuses on implementing the actual multi-agent workflows that make Git With Intent valuable:

1. **Issue-to-Code**: Generate implementation code from GitHub issue descriptions
2. **PR Resolve**: Resolve merge conflicts using AI agents
3. **PR Review**: Automated code review with security and quality checks

The platform had stub implementations returning mock data. This phase wires up real agent execution.

## Decision

### 1. Workflow Contracts (`@gwi/core/workflows`)

Created a comprehensive workflow type system:

```typescript
// Workflow types
type WorkflowType = 'issue-to-code' | 'pr-resolve' | 'pr-review' | 'test-gen' | 'docs-update';

// Input contracts
interface IssueToCodeInput {
  issue: IssueMetadata;
  targetBranch: string;
  repoContext?: { ... };
  preferences?: { ... };
}

interface PRResolveInput {
  pr: PRMetadata;
  conflicts: ConflictInfo[];
  autoMerge?: boolean;
  riskMode?: 'comment_only' | 'suggest_patch' | 'auto_patch' | 'auto_push';
}

// Output contracts
interface IssueToCodeOutput {
  success: boolean;
  code?: CodeGenerationResult;
  pullRequest?: { url, number, title, branch };
  review?: ReviewResult;
  summary: string;
}

interface PRResolveOutput {
  success: boolean;
  resolutions: ResolutionResult[];
  review?: ReviewResult;
  merged: boolean;
  summary: string;
}
```

### 2. Coder Agent (`@gwi/agents/coder`)

New agent for code generation:

| Capability | Description |
|-----------|-------------|
| Code Generation | Creates implementation from issue requirements |
| Pattern Learning | Learns from successful generations per language |
| Complexity-Based Model | Uses Sonnet for simple, Opus for complex tasks |
| Test Generation | Optionally generates tests alongside implementation |

**System Prompt Focus:**
- Analyze issue requirements completely
- Consider existing repo patterns
- Generate complete file contents (not diffs)
- Include proper imports and error handling

### 3. Orchestrator Updates

Updated `OrchestratorAgent` to execute real workflows:

**Before (Mock):**
```typescript
private async routeToAgent(agentName: string): Promise<unknown> {
  return mockResults[agentName]; // Static mock data
}
```

**After (Real):**
```typescript
private async routeToAgent(agentName: string, input: unknown, workflowType: WorkflowType): Promise<unknown> {
  const agent = await this.getAgentInstance(agentName);
  const message = createA2AMessage(payload);
  const response = await agent.handleMessage(message);
  return response.payload.output;
}
```

### 4. Engine Integration

Updated `@gwi/engine` to use orchestrator:

```typescript
// Phase 13: Trigger actual workflow execution
if (orchestrator) {
  const workflowType = mapRunTypeToWorkflowType(runType);
  orchestrator.startWorkflow(workflowType, payload)
    .then(async (result) => {
      await tenantStore.updateRun(tenantId, runId, {
        status: result.status === 'completed' ? 'completed' : 'failed',
        result: result.result,
      });
    });
}
```

**Run Type Mapping:**
| Engine Run Type | Workflow Type |
|----------------|---------------|
| RESOLVE | pr-resolve |
| REVIEW | pr-review |
| AUTOPILOT | issue-to-code |

### 5. Workflow API Endpoints

New endpoints for direct workflow access:

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | /tenants/:id/workflows | DEVELOPER+ | Start a workflow |
| GET | /tenants/:id/workflows | VIEWER+ | List workflows |
| GET | /tenants/:id/workflows/:wfId | VIEWER+ | Get workflow status |
| POST | /tenants/:id/workflows/:wfId/approve | ADMIN+ | Approve/reject |

## Consequences

### Positive

1. **Real Agent Execution**: Workflows now call actual agent implementations
2. **Type-Safe Contracts**: Clear input/output types for all workflows
3. **Extensible Architecture**: Easy to add new workflow types and agents
4. **Human-in-the-Loop**: Approval workflow for sensitive operations
5. **Pattern Learning**: Agents improve over time via AgentFS state

### Negative

1. **Agent Initialization Overhead**: Each workflow creates agent instances
2. **In-Memory Workflow State**: Orchestrator stores workflows in memory (not persistent across restarts)
3. **No A2A Network Yet**: Agents run in-process, not as separate services

### Neutral

1. **Async Execution**: Workflows run in background, API returns immediately
2. **Model Dependencies**: Requires Anthropic API keys for Claude access
3. **Complexity-Based Routing**: High complexity = more expensive models

## Implementation

### Files Created

| File | Purpose |
|------|---------|
| `packages/core/src/workflows/index.ts` | Workflow type definitions |
| `packages/agents/src/coder/index.ts` | Coder agent implementation |

### Files Modified

| File | Changes |
|------|---------|
| `packages/core/src/index.ts` | Export workflows module |
| `packages/agents/src/index.ts` | Export coder agent |
| `packages/agents/src/orchestrator/index.ts` | Real agent routing, coder registration |
| `packages/engine/src/run/engine.ts` | Orchestrator integration |
| `packages/engine/package.json` | Added @gwi/agents dependency |
| `apps/api/src/index.ts` | Workflow endpoints |
| `apps/api/package.json` | Added @gwi/agents dependency |

## Verification

1. Core builds: `npm run build -w @gwi/core` passes
2. Agents builds: `npm run build -w @gwi/agents` passes
3. Engine builds: `npm run build -w @gwi/engine` passes
4. API builds: `npm run build -w @gwi/api` passes
5. Web builds: `npm run build -w @gwi/web` passes

## Workflow Execution Flow

```
API Request
    │
    ▼
┌─────────────┐
│   Engine    │──────► Start Run (stores in TenantStore)
└─────────────┘
    │
    ▼
┌─────────────┐
│Orchestrator │──────► Maps run type to workflow type
└─────────────┘
    │
    ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Triage    │────►│   Coder/    │────►│  Reviewer   │
│   Agent     │     │  Resolver   │     │   Agent     │
└─────────────┘     └─────────────┘     └─────────────┘
    │                     │                   │
    ▼                     ▼                   ▼
 Complexity          Code/Resolution      Review Result
   Score                Output              (Approve/Reject)
```

## References

- [ADR-012: Beta Tenant Onboarding](./phase-12-adr.md)
- [Anthropic Claude API](https://docs.anthropic.com)
- [Google Vertex AI Agent Engine](https://cloud.google.com/vertex-ai/docs/agent-builder)
