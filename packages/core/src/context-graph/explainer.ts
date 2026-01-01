/**
 * Explainer
 *
 * Phase 35: Part B - Context Graph / Decision Ledger
 *
 * One-click explanation for any AI decision.
 * Answers "why did AI do that?" by tracing the decision trajectory
 * and extracting human-readable explanations.
 *
 * Usage:
 * - CLI: `gwi explain <run-id> [step-id]`
 * - API: GET /api/runs/:runId/explain
 *
 * @module @gwi/core/context-graph/explainer
 */

import type {
  AgentType,
  AgentDecisionTrace,
  DecisionTraceStore,
} from './decision-trace.js';
import { getDecisionTraceStore } from './decision-trace.js';
import type { ContextGraphStore, ContextNode } from './graph-store.js';
import { getContextGraphStore } from './graph-store.js';
import type { ResolvedEntity, EntityResolver } from './entity-resolver.js';

// =============================================================================
// Explanation Types
// =============================================================================

/**
 * Detail level for explanations
 */
export type ExplanationLevel = 'brief' | 'standard' | 'detailed' | 'debug';

/**
 * Input context that was provided to the agent
 */
export interface ExplainedInput {
  /** Type of input */
  type: 'issue' | 'pr' | 'file' | 'context' | 'previous-step' | 'config';
  /** Brief description */
  description: string;
  /** Source reference (file path, URL, etc.) */
  source?: string;
  /** Actual content (truncated for display) */
  content?: string;
  /** Relevance to the decision (0-1) */
  relevance?: number;
}

/**
 * Alternative option that was considered
 */
export interface ExplainedAlternative {
  /** What the alternative was */
  action: string;
  /** Why it was not chosen */
  rejectionReason: string;
  /** How confident the agent was about rejecting it */
  confidence?: number;
}

/**
 * Human override information
 */
export interface ExplainedOverride {
  /** Who made the override */
  user: string;
  /** When the override happened */
  timestamp: Date;
  /** Reason given for override */
  reason?: string;
  /** What was changed */
  changes: string[];
}

/**
 * Outcome of the decision
 */
export interface ExplainedOutcome {
  /** Result status */
  status: 'success' | 'failure' | 'pending' | 'overridden';
  /** What happened */
  description: string;
  /** Artifacts produced (PR URL, file paths, etc.) */
  artifacts?: string[];
  /** Time from decision to outcome */
  latency?: number;
  /** Any subsequent impacts */
  impacts?: string[];
}

/**
 * Full explanation of a single decision
 */
export interface DecisionExplanation {
  /** Trace ID being explained */
  traceId: string;
  /** Run ID this decision belongs to */
  runId: string;
  /** Step ID within the run */
  stepId?: string;
  /** Agent that made the decision */
  agentType: AgentType;
  /** When the decision was made */
  timestamp: Date;

  // The "INPUTS" section
  inputs: {
    /** Primary context (what the agent was asked to do) */
    prompt: string;
    /** Files and documents provided */
    documents: ExplainedInput[];
    /** Previous steps in the chain */
    previousSteps: ExplainedInput[];
    /** Configuration that affected the decision */
    config?: ExplainedInput[];
  };

  // The "REASONING" section
  reasoning: {
    /** The action taken */
    action: string;
    /** Chain of thought explanation */
    explanation: string;
    /** Confidence level (0-1) */
    confidence: number;
    /** Key factors that influenced the decision */
    keyFactors: string[];
  };

  // The "ALTERNATIVES" section
  alternatives: ExplainedAlternative[];

  // The "OUTCOME" section
  outcome?: ExplainedOutcome;

  // Override information if any
  override?: ExplainedOverride;

  // Related entities (people involved)
  entities?: ResolvedEntity[];

  // Navigation links
  links: {
    /** Previous step in chain */
    previousStep?: string;
    /** Next step in chain */
    nextStep?: string;
    /** Related decisions */
    related?: string[];
  };
}

/**
 * Full run explanation (multiple decisions)
 */
export interface RunExplanation {
  /** Run ID being explained */
  runId: string;
  /** Run type */
  runType: string;
  /** Tenant context */
  tenantId: string;

  /** Summary of the run */
  summary: string;

  /** All decisions in the run */
  decisions: DecisionExplanation[];

  /** Overall outcome */
  outcome: {
    status: 'success' | 'failure' | 'pending' | 'cancelled';
    description: string;
    artifacts?: string[];
  };

  /** Timeline of events */
  timeline: Array<{
    timestamp: Date;
    event: string;
    actor: 'ai' | 'human' | 'system';
    traceId?: string;
  }>;

  /** Statistics */
  stats: {
    totalDecisions: number;
    humanOverrides: number;
    averageConfidence: number;
    durationMs: number;
  };
}

// =============================================================================
// Explainer Options
// =============================================================================

/**
 * Options for generating explanations
 */
export interface ExplainerOptions {
  /** Level of detail */
  level?: ExplanationLevel;
  /** Include raw trace data */
  includeRaw?: boolean;
  /** Resolve entity identities */
  resolveEntities?: boolean;
  /** Maximum content length for inputs */
  maxContentLength?: number;
}

// =============================================================================
// Explainer Service
// =============================================================================

/**
 * Explainer Service
 *
 * Generates human-readable explanations of AI decisions by analyzing
 * decision traces and the context graph.
 */
export class Explainer {
  private traceStore: DecisionTraceStore;
  private graphStore: ContextGraphStore;
  private entityResolver?: EntityResolver;
  private tenantId: string;

  constructor(options: {
    traceStore?: DecisionTraceStore;
    graphStore?: ContextGraphStore;
    entityResolver?: EntityResolver;
    tenantId: string;
  }) {
    this.traceStore = options.traceStore ?? getDecisionTraceStore();
    this.graphStore = options.graphStore ?? getContextGraphStore();
    this.entityResolver = options.entityResolver;
    this.tenantId = options.tenantId;
  }

  /**
   * Explain a single decision by trace ID
   */
  async explainDecision(
    traceId: string,
    options: ExplainerOptions = {}
  ): Promise<DecisionExplanation | null> {
    const trace = await this.traceStore.getTrace(traceId);
    if (!trace) return null;

    return this.buildDecisionExplanation(trace, options);
  }

  /**
   * Explain a specific step in a run
   */
  async explainStep(
    runId: string,
    stepId: string,
    options: ExplainerOptions = {}
  ): Promise<DecisionExplanation | null> {
    const traces = await this.traceStore.listTraces({
      runId,
      tenantId: this.tenantId,
    });

    const trace = traces.find(t => t.stepId === stepId);
    if (!trace) return null;

    return this.buildDecisionExplanation(trace, options);
  }

  /**
   * Explain an entire run
   */
  async explainRun(
    runId: string,
    options: ExplainerOptions = {}
  ): Promise<RunExplanation | null> {
    const traces = await this.traceStore.listTraces({
      runId,
      tenantId: this.tenantId,
    });

    if (traces.length === 0) return null;

    // Sort by timestamp
    traces.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Build explanations for each decision
    const decisions: DecisionExplanation[] = [];
    for (const trace of traces) {
      const explanation = await this.buildDecisionExplanation(trace, options);
      decisions.push(explanation);
    }

    // Link decisions together
    for (let i = 0; i < decisions.length; i++) {
      if (i > 0) {
        decisions[i].links.previousStep = decisions[i - 1].traceId;
      }
      if (i < decisions.length - 1) {
        decisions[i].links.nextStep = decisions[i + 1].traceId;
      }
    }

    // Build timeline
    const timeline = this.buildTimeline(traces);

    // Calculate stats
    const stats = this.calculateStats(traces);

    // Determine overall outcome
    const outcome = {
      status: this.determineRunStatus(traces),
      description: this.summarizeRunOutcome(traces),
      artifacts: this.collectArtifacts(traces),
    };

    // Generate summary
    const summary = this.generateRunSummary(traces, outcome);

    return {
      runId,
      runType: this.inferRunType(traces),
      tenantId: this.tenantId,
      summary,
      decisions,
      outcome,
      timeline,
      stats,
    };
  }

  /**
   * Get trajectory explanation (how we got to this decision)
   */
  async explainTrajectory(
    nodeId: string,
    _options: ExplainerOptions = {}
  ): Promise<string[]> {
    const trajectory = await this.graphStore.getTrajectory(nodeId);
    if (!trajectory.path.length) return [];

    return trajectory.path.map(node => {
      const data = node.data as Record<string, unknown>;
      return this.formatNodeAsStep(node, data);
    });
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Build explanation from a trace
   */
  private async buildDecisionExplanation(
    trace: AgentDecisionTrace,
    options: ExplainerOptions
  ): Promise<DecisionExplanation> {
    const maxLen = options.maxContentLength ?? 500;

    // Build inputs section
    const documents = this.extractDocuments(trace.inputs, maxLen);
    const previousSteps = this.extractPreviousSteps(trace.inputs, maxLen);

    // Build reasoning section
    const reasoning = {
      action: trace.decision.action,
      explanation: trace.decision.reasoning,
      confidence: trace.decision.confidence,
      keyFactors: this.extractKeyFactors(trace.decision.reasoning),
    };

    // Build alternatives section
    const alternatives = (trace.decision.alternatives ?? []).map(alt => {
      const [action, reason] = this.parseAlternative(alt);
      return {
        action,
        rejectionReason: reason,
      };
    });

    // Build outcome section
    let outcome: ExplainedOutcome | undefined;
    if (trace.outcome) {
      // Map 'override' to 'overridden' for display
      const resultStatus = trace.outcome.result === 'override' ? 'overridden' : trace.outcome.result;
      outcome = {
        status: trace.outcome.humanOverride ? 'overridden' : resultStatus,
        description: trace.outcome.actualOutcome ?? trace.outcome.result,
        artifacts: this.extractArtifacts(trace),
      };
    }

    // Build override section
    let override: ExplainedOverride | undefined;
    if (trace.outcome?.humanOverride) {
      override = {
        user: trace.outcome.humanOverride.userId,
        timestamp: trace.outcome.humanOverride.timestamp,
        reason: trace.outcome.humanOverride.reason,
        changes: [], // Would need more context to populate
      };
    }

    // Resolve entities if requested
    let entities: ResolvedEntity[] | undefined;
    if (options.resolveEntities && this.entityResolver) {
      // Would extract mentions and resolve them
      entities = [];
    }

    return {
      traceId: trace.id,
      runId: trace.runId,
      stepId: trace.stepId,
      agentType: trace.agentType,
      timestamp: trace.timestamp,
      inputs: {
        prompt: this.truncate(trace.inputs.prompt, maxLen),
        documents,
        previousSteps,
      },
      reasoning,
      alternatives,
      outcome,
      override,
      entities,
      links: {
        related: [],
      },
    };
  }

  /**
   * Extract document inputs from trace
   */
  private extractDocuments(
    inputs: AgentDecisionTrace['inputs'],
    maxLen: number
  ): ExplainedInput[] {
    const docs: ExplainedInput[] = [];

    for (const ctx of inputs.contextWindow ?? []) {
      // Try to determine the type from content
      let type: ExplainedInput['type'] = 'context';
      let description = 'Context provided';

      if (ctx.includes('Issue #') || ctx.includes('issue')) {
        type = 'issue';
        description = 'Issue context';
      } else if (ctx.includes('PR #') || ctx.includes('pull request')) {
        type = 'pr';
        description = 'Pull request context';
      } else if (ctx.includes('```') || ctx.includes('function ')) {
        type = 'file';
        description = 'Code context';
      }

      docs.push({
        type,
        description,
        content: this.truncate(ctx, maxLen),
      });
    }

    return docs;
  }

  /**
   * Extract previous step inputs from trace
   */
  private extractPreviousSteps(
    inputs: AgentDecisionTrace['inputs'],
    maxLen: number
  ): ExplainedInput[] {
    return (inputs.previousSteps ?? []).map((step, i) => ({
      type: 'previous-step' as const,
      description: `Step ${i + 1} output`,
      content: this.truncate(step, maxLen),
    }));
  }

  /**
   * Extract key factors from reasoning text
   */
  private extractKeyFactors(reasoning: string): string[] {
    const factors: string[] = [];

    // Look for "because", "since", "due to" patterns
    const becausePattern = /(?:because|since|due to|as|given that)\s+([^.]+)/gi;
    let match;
    while ((match = becausePattern.exec(reasoning)) !== null) {
      factors.push(match[1].trim());
    }

    // Look for bullet points or numbered lists
    const listPattern = /[-•]\s*([^-•\n]+)/g;
    while ((match = listPattern.exec(reasoning)) !== null) {
      factors.push(match[1].trim());
    }

    // Dedupe and limit
    return [...new Set(factors)].slice(0, 5);
  }

  /**
   * Parse an alternative description
   */
  private parseAlternative(alt: string): [string, string] {
    // Try to find rejection reason
    const patterns = [
      /(.+?)\s*\(rejected:\s*(.+?)\)/i,
      /(.+?)\s*-\s*rejected because\s*(.+)/i,
      /(.+?)\s*:\s*(.+)/,
    ];

    for (const pattern of patterns) {
      const match = alt.match(pattern);
      if (match) {
        return [match[1].trim(), match[2].trim()];
      }
    }

    return [alt, 'Not selected'];
  }

  /**
   * Extract artifacts from a trace
   */
  private extractArtifacts(trace: AgentDecisionTrace): string[] {
    const artifacts: string[] = [];

    // Check outcome for artifact references
    if (trace.outcome?.actualOutcome) {
      // Look for URLs
      const urlPattern = /https?:\/\/[^\s]+/g;
      const urls = trace.outcome.actualOutcome.match(urlPattern) ?? [];
      artifacts.push(...urls);

      // Look for file paths
      const pathPattern = /(?:created|modified|updated)\s+([^\s,]+)/gi;
      let match;
      while ((match = pathPattern.exec(trace.outcome.actualOutcome)) !== null) {
        artifacts.push(match[1]);
      }
    }

    return artifacts;
  }

  /**
   * Build timeline from traces
   */
  private buildTimeline(
    traces: AgentDecisionTrace[]
  ): RunExplanation['timeline'] {
    const timeline: RunExplanation['timeline'] = [];

    for (const trace of traces) {
      // Decision made
      timeline.push({
        timestamp: trace.timestamp,
        event: `${trace.agentType} agent made decision: ${trace.decision.action}`,
        actor: 'ai',
        traceId: trace.id,
      });

      // Human override if any
      if (trace.outcome?.humanOverride) {
        timeline.push({
          timestamp: trace.outcome.humanOverride.timestamp,
          event: `Human override by ${trace.outcome.humanOverride.userId}`,
          actor: 'human',
          traceId: trace.id,
        });
      }
    }

    // Sort by timestamp
    timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return timeline;
  }

  /**
   * Calculate stats from traces
   */
  private calculateStats(traces: AgentDecisionTrace[]): RunExplanation['stats'] {
    const totalDecisions = traces.length;
    const humanOverrides = traces.filter(
      t => t.outcome?.humanOverride
    ).length;

    const confidences = traces.map(t => t.decision.confidence);
    const averageConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    const firstTimestamp = traces[0]?.timestamp.getTime() ?? 0;
    const lastTimestamp = traces[traces.length - 1]?.timestamp.getTime() ?? 0;
    const durationMs = lastTimestamp - firstTimestamp;

    return {
      totalDecisions,
      humanOverrides,
      averageConfidence,
      durationMs,
    };
  }

  /**
   * Determine overall run status
   */
  private determineRunStatus(
    traces: AgentDecisionTrace[]
  ): 'success' | 'failure' | 'pending' | 'cancelled' {
    // Check if any trace has failure
    const hasFailure = traces.some(t => t.outcome?.result === 'failure');
    if (hasFailure) return 'failure';

    // Check if all traces have outcomes
    const allComplete = traces.every(t => t.outcome);
    if (!allComplete) return 'pending';

    return 'success';
  }

  /**
   * Summarize run outcome
   */
  private summarizeRunOutcome(traces: AgentDecisionTrace[]): string {
    const lastTrace = traces[traces.length - 1];
    if (!lastTrace) return 'No decisions recorded';

    if (lastTrace.outcome?.actualOutcome) {
      return lastTrace.outcome.actualOutcome;
    }

    return `${lastTrace.agentType} completed with ${lastTrace.decision.action}`;
  }

  /**
   * Collect all artifacts from traces
   */
  private collectArtifacts(traces: AgentDecisionTrace[]): string[] {
    const artifacts: string[] = [];
    for (const trace of traces) {
      artifacts.push(...this.extractArtifacts(trace));
    }
    return [...new Set(artifacts)];
  }

  /**
   * Generate run summary
   */
  private generateRunSummary(
    traces: AgentDecisionTrace[],
    outcome: RunExplanation['outcome']
  ): string {
    const agentTypes = [...new Set(traces.map(t => t.agentType))];
    const overrideCount = traces.filter(t => t.outcome?.humanOverride).length;

    let summary = `Run involved ${traces.length} decision(s) `;
    summary += `by ${agentTypes.join(', ')} agent(s). `;

    if (overrideCount > 0) {
      summary += `${overrideCount} decision(s) were overridden by humans. `;
    }

    summary += `Outcome: ${outcome.status}.`;

    return summary;
  }

  /**
   * Infer run type from traces
   */
  private inferRunType(traces: AgentDecisionTrace[]): string {
    // Check agent types to infer run type
    const agentTypes = new Set(traces.map(t => t.agentType));

    if (agentTypes.has('resolver')) return 'conflict-resolution';
    if (agentTypes.has('coder')) return 'code-generation';
    if (agentTypes.has('reviewer')) return 'review';
    if (agentTypes.has('triage')) return 'triage';

    return 'unknown';
  }

  /**
   * Format a graph node as a step description
   */
  private formatNodeAsStep(
    node: ContextNode,
    data: Record<string, unknown>
  ): string {
    const timestamp = node.timestamp.toISOString();
    const type = node.type;

    let description = `[${timestamp}] ${type}`;

    if (data.action) {
      description += `: ${data.action}`;
    }
    if (data.agentType) {
      description += ` (${data.agentType})`;
    }

    return description;
  }

  /**
   * Truncate text to max length
   */
  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 3) + '...';
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an explainer for a tenant
 */
export function createExplainer(
  tenantId: string,
  options?: {
    traceStore?: DecisionTraceStore;
    graphStore?: ContextGraphStore;
    entityResolver?: EntityResolver;
  }
): Explainer {
  return new Explainer({
    tenantId,
    ...options,
  });
}

// =============================================================================
// Formatting Helpers
// =============================================================================

/**
 * Format a decision explanation for CLI output
 */
export function formatExplanationForCLI(
  explanation: DecisionExplanation
): string {
  const lines: string[] = [];

  lines.push(`Run: ${explanation.runId}`);
  if (explanation.stepId) {
    lines.push(`Step: ${explanation.stepId}`);
  }
  lines.push(`Agent: ${explanation.agentType}`);
  lines.push(`Time: ${explanation.timestamp.toISOString()}`);
  lines.push('');

  // INPUTS
  lines.push('INPUTS:');
  lines.push(`  Prompt: ${explanation.inputs.prompt.slice(0, 100)}...`);
  for (const doc of explanation.inputs.documents) {
    lines.push(`  - ${doc.type}: ${doc.description}`);
  }
  for (const step of explanation.inputs.previousSteps) {
    lines.push(`  - ${step.description}`);
  }
  lines.push('');

  // REASONING
  lines.push('REASONING:');
  lines.push(`  Action: ${explanation.reasoning.action}`);
  lines.push(`  Confidence: ${(explanation.reasoning.confidence * 100).toFixed(0)}%`);
  lines.push(`  "${explanation.reasoning.explanation}"`);
  if (explanation.reasoning.keyFactors.length > 0) {
    lines.push('  Key factors:');
    for (const factor of explanation.reasoning.keyFactors) {
      lines.push(`    - ${factor}`);
    }
  }
  lines.push('');

  // ALTERNATIVES
  if (explanation.alternatives.length > 0) {
    lines.push('ALTERNATIVES CONSIDERED:');
    for (let i = 0; i < explanation.alternatives.length; i++) {
      const alt = explanation.alternatives[i];
      lines.push(`  ${i + 1}. ${alt.action}`);
      lines.push(`     Rejected: ${alt.rejectionReason}`);
    }
    lines.push('');
  }

  // OUTCOME
  if (explanation.outcome) {
    lines.push('OUTCOME:');
    lines.push(`  Status: ${explanation.outcome.status}`);
    lines.push(`  ${explanation.outcome.description}`);
    if (explanation.outcome.artifacts?.length) {
      lines.push('  Artifacts:');
      for (const artifact of explanation.outcome.artifacts) {
        lines.push(`    - ${artifact}`);
      }
    }
  }

  // OVERRIDE
  if (explanation.override) {
    lines.push('');
    lines.push('HUMAN OVERRIDE:');
    lines.push(`  By: ${explanation.override.user}`);
    lines.push(`  At: ${explanation.override.timestamp.toISOString()}`);
    if (explanation.override.reason) {
      lines.push(`  Reason: ${explanation.override.reason}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a run explanation for CLI output
 */
export function formatRunExplanationForCLI(
  explanation: RunExplanation
): string {
  const lines: string[] = [];

  lines.push(`=== Run ${explanation.runId} ===`);
  lines.push(`Type: ${explanation.runType}`);
  lines.push(`Status: ${explanation.outcome.status}`);
  lines.push('');
  lines.push(`Summary: ${explanation.summary}`);
  lines.push('');

  // Stats
  lines.push('STATISTICS:');
  lines.push(`  Decisions: ${explanation.stats.totalDecisions}`);
  lines.push(`  Overrides: ${explanation.stats.humanOverrides}`);
  lines.push(`  Avg Confidence: ${(explanation.stats.averageConfidence * 100).toFixed(0)}%`);
  lines.push(`  Duration: ${explanation.stats.durationMs}ms`);
  lines.push('');

  // Timeline
  lines.push('TIMELINE:');
  for (const event of explanation.timeline) {
    const time = event.timestamp.toISOString().slice(11, 19);
    const actor = event.actor === 'ai' ? '🤖' : event.actor === 'human' ? '👤' : '⚙️';
    lines.push(`  ${time} ${actor} ${event.event}`);
  }
  lines.push('');

  // Outcome
  lines.push('OUTCOME:');
  lines.push(`  ${explanation.outcome.description}`);
  if (explanation.outcome.artifacts?.length) {
    lines.push('  Artifacts:');
    for (const artifact of explanation.outcome.artifacts) {
      lines.push(`    - ${artifact}`);
    }
  }

  return lines.join('\n');
}

// =============================================================================
// Singleton Store Instance
// =============================================================================

let explainerInstance: Explainer | null = null;

/**
 * Get or create a global explainer instance
 */
export function getExplainer(tenantId: string): Explainer {
  if (!explainerInstance || (explainerInstance as unknown as { tenantId: string }).tenantId !== tenantId) {
    explainerInstance = createExplainer(tenantId);
  }
  return explainerInstance;
}

/**
 * Reset the explainer instance (for testing)
 */
export function resetExplainer(): void {
  explainerInstance = null;
}
