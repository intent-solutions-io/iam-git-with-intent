/**
 * Policy Engine + Context Graph Integration
 *
 * Epic D: Policy & Audit - Story D2: Policy Engine
 * Task D2.3: Add Context Graph integration
 *
 * Connects policy evaluation with decision traces:
 * - Records policy decisions as part of agent decision traces
 * - Provides hooks for evaluating policies before agent actions
 * - Enables "why was this blocked?" queries in the Context Graph
 *
 * @module @gwi/core/context-graph/policy-integration
 */

import {
  type AgentDecisionTrace,
  type DecisionTraceStore,
  getDecisionTraceStore,
  generateDecisionTraceId,
} from './decision-trace.js';
import {
  type ContextGraphStore,
  type ContextNode,
  getContextGraphStore,
  generateNodeId,
  createCausalEdge,
} from './graph-store.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Policy decision recorded in traces
 */
export interface PolicyDecisionRecord {
  /** Unique ID for this policy decision */
  id: string;
  /** Policy evaluation timestamp */
  timestamp: Date;
  /** Whether the action was allowed */
  allowed: boolean;
  /** The effect that was applied */
  effect: 'allow' | 'deny' | 'require_approval' | 'notify' | 'log_only' | 'warn';
  /** Human-readable reason */
  reason: string;
  /** ID of the rule that matched (if any) */
  matchedRuleId?: string;
  /** Name of the rule that matched */
  matchedRuleName?: string;
  /** ID of the policy that matched */
  matchedPolicyId?: string;
  /** Required actions (approvals, notifications) */
  requiredActions?: Array<{
    type: 'approval' | 'notification' | 'review';
    config: unknown;
  }>;
  /** Evaluation metadata */
  metadata?: {
    evaluationTimeMs: number;
    rulesEvaluated: number;
    policiesEvaluated: number;
  };
}

/**
 * Extended decision trace with policy information
 */
export interface PolicyAwareDecisionTrace extends AgentDecisionTrace {
  /** Policy evaluation results */
  policyDecision?: PolicyDecisionRecord;
  /** Whether the action was blocked by policy */
  blockedByPolicy?: boolean;
}

/**
 * Policy evaluation request (simplified for integration)
 */
export interface PolicyEvaluationInput {
  /** Actor performing the action */
  actor: {
    id: string;
    type: 'human' | 'agent' | 'service' | 'github_app' | 'api_key';
    roles?: string[];
    teams?: string[];
  };
  /** Action being performed */
  action: {
    name: string;
    agentType?: string;
    confidence?: number;
  };
  /** Resource being accessed */
  resource: {
    type: string;
    repo?: { owner: string; name: string };
    branch?: string;
    files?: string[];
    labels?: string[];
    complexity?: number;
  };
  /** Request context */
  context: {
    source: 'cli' | 'web' | 'api' | 'webhook' | 'github_action' | 'scheduled';
    timestamp?: Date;
    requestId?: string;
    traceId?: string;
  };
  /** Custom attributes */
  attributes?: Record<string, unknown>;
}

/**
 * Policy evaluation function type
 */
export type PolicyEvaluator = (input: PolicyEvaluationInput) => PolicyDecisionRecord;

/**
 * Policy gate configuration
 */
export interface PolicyGateConfig {
  /** Policy evaluator function */
  evaluator: PolicyEvaluator;
  /** Decision trace store (defaults to global) */
  traceStore?: DecisionTraceStore;
  /** Context graph store (defaults to global) */
  graphStore?: ContextGraphStore;
  /** Whether to record blocked actions in traces */
  recordBlockedActions?: boolean;
  /** Whether to add nodes to context graph */
  addToGraph?: boolean;
  /** Tenant ID for multi-tenant context */
  tenantId?: string;
}

/**
 * Result from policy gate check
 */
export interface PolicyGateResult {
  /** Whether the action is allowed to proceed */
  allowed: boolean;
  /** The policy decision record */
  decision: PolicyDecisionRecord;
  /** ID of the trace created (if any) */
  traceId?: string;
  /** ID of the graph node created (if any) */
  nodeId?: string;
}

// =============================================================================
// Policy Gate
// =============================================================================

/**
 * Policy Gate - Evaluates policies before agent actions
 *
 * Integrates with Context Graph to record all policy decisions,
 * enabling audit trails and "why was this blocked?" queries.
 *
 * @example
 * ```typescript
 * const gate = new PolicyGate({
 *   evaluator: (input) => schemaEngine.evaluate(input),
 *   tenantId: 'tenant-123',
 * });
 *
 * // Before agent action
 * const result = await gate.check({
 *   actor: { id: 'coder-agent', type: 'agent' },
 *   action: { name: 'generate.code', agentType: 'coder' },
 *   resource: { type: 'pr', complexity: 7 },
 *   context: { source: 'cli' },
 * });
 *
 * if (!result.allowed) {
 *   console.log('Blocked:', result.decision.reason);
 *   return;
 * }
 *
 * // Proceed with action...
 * ```
 */
export class PolicyGate {
  private config: Required<PolicyGateConfig>;
  private traceStore: DecisionTraceStore;
  private graphStore: ContextGraphStore;

  constructor(config: PolicyGateConfig) {
    this.config = {
      evaluator: config.evaluator,
      traceStore: config.traceStore ?? getDecisionTraceStore(),
      graphStore: config.graphStore ?? getContextGraphStore(),
      recordBlockedActions: config.recordBlockedActions ?? true,
      addToGraph: config.addToGraph ?? true,
      tenantId: config.tenantId ?? 'default',
    };
    this.traceStore = this.config.traceStore;
    this.graphStore = this.config.graphStore;
  }

  /**
   * Check if an action is allowed by policy
   */
  async check(
    input: PolicyEvaluationInput,
    runId?: string,
    stepId?: string
  ): Promise<PolicyGateResult> {
    // Evaluate policy
    const decision = this.config.evaluator(input);

    // Create trace if we have a run context
    let traceId: string | undefined;
    if (runId && (decision.allowed || this.config.recordBlockedActions)) {
      traceId = await this.recordTrace(input, decision, runId, stepId);
    }

    // Add to context graph
    let nodeId: string | undefined;
    if (this.config.addToGraph) {
      nodeId = await this.addToGraph(input, decision, traceId);
    }

    return {
      allowed: decision.allowed,
      decision,
      traceId,
      nodeId,
    };
  }

  /**
   * Evaluate and record in a single operation
   */
  async evaluateWithTrace(
    input: PolicyEvaluationInput,
    runId: string,
    stepId?: string
  ): Promise<PolicyGateResult> {
    return this.check(input, runId, stepId);
  }

  /**
   * Record policy decision in trace store
   */
  private async recordTrace(
    input: PolicyEvaluationInput,
    decision: PolicyDecisionRecord,
    runId: string,
    stepId?: string
  ): Promise<string> {
    const agentType = input.action.agentType as 'triage' | 'coder' | 'resolver' | 'reviewer' | 'orchestrator' | undefined;

    const trace: PolicyAwareDecisionTrace = {
      id: generateDecisionTraceId(),
      runId,
      stepId,
      agentType: agentType ?? 'orchestrator',
      timestamp: new Date(),
      tenantId: this.config.tenantId,
      inputs: {
        prompt: `Policy evaluation for action: ${input.action.name}`,
        contextWindow: [
          `Actor: ${input.actor.id} (${input.actor.type})`,
          `Resource: ${input.resource.type}`,
          ...(input.resource.files ?? []).map(f => `File: ${f}`),
        ],
        previousSteps: [],
        complexity: input.resource.complexity,
        metadata: {
          policyInput: input,
        },
      },
      decision: {
        action: decision.allowed ? 'policy_allowed' : 'policy_blocked',
        reasoning: decision.reason,
        confidence: 1.0, // Policy decisions are deterministic
        alternatives: decision.requiredActions?.map(a => `Requires ${a.type}`) ?? [],
        outputs: {
          policyDecision: decision,
        },
      },
      policyDecision: decision,
      blockedByPolicy: !decision.allowed,
    };

    await this.traceStore.saveTrace(trace);
    return trace.id;
  }

  /**
   * Add policy decision to context graph
   */
  private async addToGraph(
    input: PolicyEvaluationInput,
    decision: PolicyDecisionRecord,
    traceId?: string
  ): Promise<string> {
    const node: ContextNode = {
      id: generateNodeId(),
      type: 'policy',
      timestamp: new Date(),
      tenantId: this.config.tenantId,
      data: {
        action: input.action.name,
        actor: input.actor,
        resource: input.resource,
        decision: {
          allowed: decision.allowed,
          effect: decision.effect,
          reason: decision.reason,
          matchedRuleId: decision.matchedRuleId,
          matchedPolicyId: decision.matchedPolicyId,
        },
        traceId,
      },
    };

    await this.graphStore.addNode(node);

    // If there's a trace, link them
    if (traceId) {
      const edge = createCausalEdge(
        this.config.tenantId,
        node.id,
        `trace_node_${traceId}`,
        1.0,
        { relationship: 'evaluated_for' }
      );
      await this.graphStore.addEdge(edge);
    }

    return node.id;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a policy decision record from evaluation results
 */
export function createPolicyDecisionRecord(
  result: {
    allowed: boolean;
    effect: string;
    reason: string;
    matchedRule?: { id: string; name: string; policyId?: string };
    requiredActions?: Array<{ type: string; config: unknown }>;
    metadata?: { evaluationTimeMs: number; rulesEvaluated: number; policiesEvaluated: number };
  }
): PolicyDecisionRecord {
  return {
    id: `policy_decision_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date(),
    allowed: result.allowed,
    effect: result.effect as PolicyDecisionRecord['effect'],
    reason: result.reason,
    matchedRuleId: result.matchedRule?.id,
    matchedRuleName: result.matchedRule?.name,
    matchedPolicyId: result.matchedRule?.policyId,
    requiredActions: result.requiredActions?.map(a => ({
      type: a.type as 'approval' | 'notification' | 'review',
      config: a.config,
    })),
    metadata: result.metadata,
  };
}

/**
 * Create a policy gate with default configuration
 */
export function createPolicyGate(config: PolicyGateConfig): PolicyGate {
  return new PolicyGate(config);
}

/**
 * Create a simple allow-all evaluator (for testing)
 */
export function createAllowAllEvaluator(): PolicyEvaluator {
  return (_input: PolicyEvaluationInput): PolicyDecisionRecord => ({
    id: `policy_decision_${Date.now()}`,
    timestamp: new Date(),
    allowed: true,
    effect: 'allow',
    reason: 'No policy restrictions',
    metadata: {
      evaluationTimeMs: 0,
      rulesEvaluated: 0,
      policiesEvaluated: 0,
    },
  });
}

/**
 * Create a simple deny-all evaluator (for testing)
 */
export function createDenyAllEvaluator(reason = 'All actions denied'): PolicyEvaluator {
  return (_input: PolicyEvaluationInput): PolicyDecisionRecord => ({
    id: `policy_decision_${Date.now()}`,
    timestamp: new Date(),
    allowed: false,
    effect: 'deny',
    reason,
    metadata: {
      evaluationTimeMs: 0,
      rulesEvaluated: 0,
      policiesEvaluated: 0,
    },
  });
}

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Get policy decisions for a run from the trace store
 */
export async function getPolicyDecisionsForRun(
  runId: string,
  traceStore?: DecisionTraceStore
): Promise<PolicyDecisionRecord[]> {
  const store = traceStore ?? getDecisionTraceStore();
  const traces = await store.getTracesForRun(runId);

  return traces
    .filter((t): t is PolicyAwareDecisionTrace =>
      'policyDecision' in t && t.policyDecision !== undefined
    )
    .map(t => t.policyDecision!);
}

/**
 * Get blocked actions for a run
 */
export async function getBlockedActionsForRun(
  runId: string,
  traceStore?: DecisionTraceStore
): Promise<PolicyAwareDecisionTrace[]> {
  const store = traceStore ?? getDecisionTraceStore();
  const traces = await store.getTracesForRun(runId);

  return traces.filter((t): t is PolicyAwareDecisionTrace =>
    'blockedByPolicy' in t && t.blockedByPolicy === true
  );
}

/**
 * Explain why an action was blocked
 */
export function explainPolicyBlock(decision: PolicyDecisionRecord): string {
  const lines: string[] = [
    `Action was ${decision.effect === 'deny' ? 'denied' : 'blocked'}.`,
    `Reason: ${decision.reason}`,
  ];

  if (decision.matchedRuleName) {
    lines.push(`Matched rule: ${decision.matchedRuleName} (${decision.matchedRuleId})`);
  }

  if (decision.matchedPolicyId) {
    lines.push(`Policy: ${decision.matchedPolicyId}`);
  }

  if (decision.requiredActions?.length) {
    lines.push('Required actions:');
    for (const action of decision.requiredActions) {
      lines.push(`  - ${action.type}`);
    }
  }

  return lines.join('\n');
}
