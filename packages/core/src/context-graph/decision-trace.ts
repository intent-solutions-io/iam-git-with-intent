/**
 * Context Graph - Agent Decision Trace
 *
 * Phase 35: Part B - Context Graph / Decision Ledger
 *
 * Captures every AI agent action with full reasoning chain.
 * Enables "why did this happen?" queries and decision auditing.
 *
 * Key concept: Memory is for retrieval, Context Graph is for
 * decision traces and world model simulation.
 *
 * @module @gwi/core/context-graph/decision-trace
 */

// =============================================================================
// Agent Types
// =============================================================================

/**
 * Types of agents in the system
 */
export type AgentType =
  | 'triage'
  | 'coder'
  | 'resolver'
  | 'reviewer'
  | 'orchestrator'
  | 'planner'
  | 'analyzer';

// =============================================================================
// Decision Trace Interface
// =============================================================================

/**
 * Inputs provided to an agent for a decision
 */
export interface DecisionInputs {
  /** Full prompt sent to the agent */
  prompt: string;
  /** Files, PRs, issues provided as context */
  contextWindow: string[];
  /** Earlier agent outputs in the chain */
  previousSteps: string[];
  /** Complexity score (1-10) if available */
  complexity?: number;
  /** Metadata about the input context */
  metadata?: Record<string, unknown>;
}

/**
 * The decision made by an agent
 */
export interface AgentDecision {
  /** Action taken (e.g., "generate_code", "approve", "flag_risk") */
  action: string;
  /** Extracted chain-of-thought reasoning */
  reasoning: string;
  /** Confidence score (0.0 - 1.0) */
  confidence: number;
  /** Other options the agent considered */
  alternatives: string[];
  /** Specific outputs produced (patches, scores, etc.) */
  outputs?: Record<string, unknown>;
}

/**
 * Human override of an agent decision
 */
export interface HumanOverride {
  /** User who made the override */
  userId: string;
  /** Reason for the override */
  reason: string;
  /** When the override occurred */
  timestamp: Date;
  /** What the human changed */
  changes?: Record<string, unknown>;
}

/**
 * Outcome of a decision
 */
export interface DecisionOutcome {
  /** Whether the decision was successful, failed, or overridden */
  result: 'success' | 'failure' | 'override';
  /** Human override details if applicable */
  humanOverride?: HumanOverride;
  /** Actual outcome description (e.g., "PR merged", "Reverted") */
  actualOutcome?: string;
  /** When the outcome was determined */
  determinedAt?: Date;
}

/**
 * Feedback on a decision for learning
 */
export interface DecisionFeedback {
  /** Whether the decision was correct in hindsight */
  wasCorrect: boolean;
  /** Human rating (1-5 stars) */
  humanRating?: number;
  /** Additional notes */
  notes?: string;
  /** Who provided the feedback */
  providedBy?: string;
  /** When feedback was provided */
  providedAt: Date;
}

/**
 * Complete trace of an agent decision
 *
 * This is the core artifact for the Context Graph - every AI agent
 * action is captured with full reasoning chain.
 */
export interface AgentDecisionTrace {
  /** Unique trace ID */
  id: string;
  /** Parent run ID */
  runId: string;
  /** Step ID within the run */
  stepId?: string;
  /** Type of agent that made the decision */
  agentType: AgentType;
  /** When the decision was made */
  timestamp: Date;
  /** Tenant context */
  tenantId: string;

  // What the agent saw
  inputs: DecisionInputs;

  // What the agent decided
  decision: AgentDecision;

  // What happened
  outcome?: DecisionOutcome;

  // For learning
  feedback?: DecisionFeedback;

  // Embeddings for similarity search
  embedding?: number[];

  // Metadata
  metadata?: {
    /** Duration of agent execution in ms */
    durationMs?: number;
    /** Tokens used */
    tokensUsed?: { input: number; output: number };
    /** Model used */
    model?: string;
    /** Temperature setting */
    temperature?: number;
  };
}

// =============================================================================
// Decision Trace Store Interface
// =============================================================================

/**
 * Filter for querying decision traces
 */
export interface DecisionTraceFilter {
  /** Filter by run ID */
  runId?: string;
  /** Filter by agent type */
  agentType?: AgentType;
  /** Filter by tenant */
  tenantId?: string;
  /** Filter by time range */
  fromTimestamp?: Date;
  toTimestamp?: Date;
  /** Filter by outcome result */
  outcomeResult?: 'success' | 'failure' | 'override';
  /** Filter by confidence threshold */
  minConfidence?: number;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Store interface for decision traces
 */
export interface DecisionTraceStore {
  /**
   * Save a decision trace
   */
  saveTrace(trace: AgentDecisionTrace): Promise<void>;

  /**
   * Get a trace by ID
   */
  getTrace(id: string): Promise<AgentDecisionTrace | null>;

  /**
   * List traces with filtering
   */
  listTraces(filter: DecisionTraceFilter): Promise<AgentDecisionTrace[]>;

  /**
   * Get all traces for a run
   */
  getTracesForRun(runId: string): Promise<AgentDecisionTrace[]>;

  /**
   * Update trace outcome
   */
  updateOutcome(id: string, outcome: DecisionOutcome): Promise<void>;

  /**
   * Add feedback to a trace
   */
  addFeedback(id: string, feedback: DecisionFeedback): Promise<void>;

  /**
   * Find similar traces using embedding similarity
   */
  findSimilar(
    embedding: number[],
    limit: number,
    filter?: DecisionTraceFilter
  ): Promise<AgentDecisionTrace[]>;

  /**
   * Get traces with human overrides for learning
   */
  getOverriddenTraces(
    tenantId: string,
    limit?: number
  ): Promise<AgentDecisionTrace[]>;

  /**
   * Delete a trace by ID
   */
  deleteTrace(id: string): Promise<void>;
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

/**
 * In-memory decision trace store for development and testing
 */
export class InMemoryDecisionTraceStore implements DecisionTraceStore {
  private traces = new Map<string, AgentDecisionTrace>();

  async saveTrace(trace: AgentDecisionTrace): Promise<void> {
    this.traces.set(trace.id, { ...trace });
  }

  async getTrace(id: string): Promise<AgentDecisionTrace | null> {
    return this.traces.get(id) ?? null;
  }

  async listTraces(filter: DecisionTraceFilter): Promise<AgentDecisionTrace[]> {
    let results = Array.from(this.traces.values());

    if (filter.runId) {
      results = results.filter(t => t.runId === filter.runId);
    }
    if (filter.agentType) {
      results = results.filter(t => t.agentType === filter.agentType);
    }
    if (filter.tenantId) {
      results = results.filter(t => t.tenantId === filter.tenantId);
    }
    if (filter.fromTimestamp) {
      results = results.filter(t => t.timestamp >= filter.fromTimestamp!);
    }
    if (filter.toTimestamp) {
      results = results.filter(t => t.timestamp <= filter.toTimestamp!);
    }
    if (filter.outcomeResult) {
      results = results.filter(t => t.outcome?.result === filter.outcomeResult);
    }
    if (filter.minConfidence !== undefined) {
      results = results.filter(t => t.decision.confidence >= filter.minConfidence!);
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    if (filter.offset) {
      results = results.slice(filter.offset);
    }
    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async getTracesForRun(runId: string): Promise<AgentDecisionTrace[]> {
    return this.listTraces({ runId });
  }

  async updateOutcome(id: string, outcome: DecisionOutcome): Promise<void> {
    const trace = this.traces.get(id);
    if (trace) {
      trace.outcome = outcome;
    }
  }

  async addFeedback(id: string, feedback: DecisionFeedback): Promise<void> {
    const trace = this.traces.get(id);
    if (trace) {
      trace.feedback = feedback;
    }
  }

  async findSimilar(
    _embedding: number[],
    limit: number,
    filter?: DecisionTraceFilter
  ): Promise<AgentDecisionTrace[]> {
    // In-memory implementation doesn't support vector search
    // Just return recent traces matching filter
    const results = await this.listTraces({ ...filter, limit });
    return results;
  }

  async getOverriddenTraces(
    tenantId: string,
    limit = 100
  ): Promise<AgentDecisionTrace[]> {
    return this.listTraces({
      tenantId,
      outcomeResult: 'override',
      limit,
    });
  }

  async deleteTrace(id: string): Promise<void> {
    this.traces.delete(id);
  }

  /**
   * Clear all traces (for testing)
   */
  clear(): void {
    this.traces.clear();
  }

  /**
   * Get count of traces
   */
  count(): number {
    return this.traces.size;
  }
}

// =============================================================================
// Decision Trace Builder
// =============================================================================

/**
 * Builder for creating decision traces with fluent API
 */
export class DecisionTraceBuilder {
  private trace: Partial<AgentDecisionTrace> = {};

  constructor(runId: string, agentType: AgentType, tenantId?: string) {
    this.trace.id = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.trace.runId = runId;
    this.trace.agentType = agentType;
    this.trace.timestamp = new Date();
    if (tenantId) {
      this.trace.tenantId = tenantId;
    }
  }

  /**
   * Set tenant context
   */
  forTenant(tenantId: string): this {
    this.trace.tenantId = tenantId;
    return this;
  }

  /**
   * Set step ID
   */
  withStepId(stepId: string): this {
    this.trace.stepId = stepId;
    return this;
  }

  /**
   * Set inputs
   */
  withInputs(inputs: DecisionInputs): this {
    this.trace.inputs = inputs;
    return this;
  }

  /**
   * Set decision
   */
  withDecision(decision: AgentDecision): this {
    this.trace.decision = decision;
    return this;
  }

  /**
   * Set outcome
   */
  withOutcome(outcome: DecisionOutcome): this {
    this.trace.outcome = outcome;
    return this;
  }

  /**
   * Set embedding
   */
  withEmbedding(embedding: number[]): this {
    this.trace.embedding = embedding;
    return this;
  }

  /**
   * Set metadata
   */
  withMetadata(metadata: AgentDecisionTrace['metadata']): this {
    this.trace.metadata = metadata;
    return this;
  }

  /**
   * Build the trace
   */
  build(): AgentDecisionTrace {
    if (!this.trace.tenantId) {
      throw new Error('Tenant ID is required');
    }
    if (!this.trace.inputs) {
      throw new Error('Inputs are required');
    }
    if (!this.trace.decision) {
      throw new Error('Decision is required');
    }

    return this.trace as AgentDecisionTrace;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a complete decision trace directly
 */
export function createDecisionTrace(
  runId: string,
  agentType: AgentType,
  tenantId: string,
  inputs: DecisionInputs,
  decision: AgentDecision
): AgentDecisionTrace {
  return {
    id: generateDecisionTraceId(),
    runId,
    agentType,
    tenantId,
    timestamp: new Date(),
    inputs,
    decision,
  };
}

/**
 * Create a new decision trace builder for fluent API
 */
export function createDecisionTraceBuilder(
  runId: string,
  agentType: AgentType
): DecisionTraceBuilder {
  return new DecisionTraceBuilder(runId, agentType);
}

/**
 * Generate a unique decision trace ID
 */
export function generateDecisionTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Alias for backwards compatibility
 * @deprecated Use generateDecisionTraceId instead
 */
export const generateTraceId = generateDecisionTraceId;

// =============================================================================
// Singleton Store Instance
// =============================================================================

let traceStoreInstance: DecisionTraceStore | null = null;

/**
 * Get or create the global decision trace store
 */
export function getDecisionTraceStore(): DecisionTraceStore {
  if (!traceStoreInstance) {
    // Default to in-memory store
    // In production, this would be replaced with Firestore implementation
    traceStoreInstance = new InMemoryDecisionTraceStore();
  }
  return traceStoreInstance;
}

/**
 * Set the decision trace store (for dependency injection)
 */
export function setDecisionTraceStore(store: DecisionTraceStore): void {
  traceStoreInstance = store;
}

/**
 * Reset the decision trace store (for testing)
 */
export function resetDecisionTraceStore(): void {
  traceStoreInstance = null;
}
