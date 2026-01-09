/**
 * Context Graph Module
 *
 * Phase 35: Part B - Context Graph / Decision Ledger
 *
 * The Context Graph captures decision traces (both human and AI),
 * enables cross-system joins via embeddings, and answers
 * "why did this happen?" in one click.
 *
 * Key distinction from Memory:
 * - Memory: Facts, preferences, session state (for retrieval)
 * - Context Graph: Decision traces, policies evaluated, approvals (for world model)
 *
 * Core concepts:
 * - Two Clocks Problem: Systems store "what's true now" but not "why it became true"
 * - Agent Trajectories: Sequence of touches, decisions, and context that led to outcomes
 * - Probabilistic Joins: LLM embeddings enable joins where foreign keys don't exist
 *
 * @module @gwi/core/context-graph
 */

// Decision trace - captures every AI agent action
export {
  type AgentType,
  type DecisionInputs,
  type AgentDecision,
  type HumanOverride,
  type DecisionOutcome,
  type DecisionFeedback,
  type AgentDecisionTrace,
  type DecisionTraceFilter,
  type DecisionTraceStore,
  InMemoryDecisionTraceStore,
  DecisionTraceBuilder,
  createDecisionTrace,
  createDecisionTraceBuilder,
  generateDecisionTraceId,
  generateTraceId, // deprecated alias, use generateDecisionTraceId
  getDecisionTraceStore,
  setDecisionTraceStore,
  resetDecisionTraceStore,
} from './decision-trace.js';

// Graph store - event-sourced, graph-structured decision storage
export {
  type ContextNodeType,
  type ContextNode,
  type ContextEdgeType,
  type ContextEdge,
  type NodeFilter,
  type EdgeFilter,
  type TrajectoryResult,
  type PrecedentResult,
  type ContextGraphStore,
  InMemoryContextGraphStore,
  generateNodeId,
  generateEdgeId,
  createDecisionNode,
  createEventNode,
  createCausalEdge,
  getContextGraphStore,
  setContextGraphStore,
  resetContextGraphStore,
} from './graph-store.js';

// Entity resolver - cross-system identity resolution
export {
  type EntitySource,
  type EntityType,
  type EntityMention,
  type ResolutionMethod,
  type ResolvedEntity,
  type ResolutionResult,
  type MergeResult,
  type EntityFilter,
  type EntityResolverStore,
  InMemoryEntityResolverStore,
  EntityResolver,
  generateEntityId,
  createEntityResolver,
  getEntityResolverStore,
  setEntityResolverStore,
  resetEntityResolverStore,
} from './entity-resolver.js';

// Accuracy tracker - trust calibration metrics
export {
  type TimePeriod,
  type ComplexityBand,
  type ComplexityMetrics,
  type ClassificationMetrics,
  type AccuracyMetrics,
  type AccuracySummary,
  type DecisionOutcomeRecord,
  type AccuracyFilter,
  type AccuracyTrackerStore,
  InMemoryAccuracyTrackerStore,
  AccuracyTracker,
  createAccuracyTracker,
  formatPeriod,
  getComplexityBand,
  getAccuracyTrackerStore,
  setAccuracyTrackerStore,
  resetAccuracyTrackerStore,
} from './accuracy-tracker.js';

// Explainer - "Why did AI do that" queries
export {
  type ExplanationLevel,
  type ExplainedInput,
  type ExplainedAlternative,
  type ExplainedOverride,
  type ExplainedOutcome,
  type DecisionExplanation,
  type RunExplanation,
  type ExplainerOptions,
  Explainer,
  createExplainer,
  formatExplanationForCLI,
  formatRunExplanationForCLI,
  getExplainer,
  resetExplainer,
} from './explainer.js';

// Simulator - World model simulation
export {
  type SimulationContext,
  type SimulationQuery,
  type Precedent,
  type SimulationResult,
  type WhatIfResult,
  type SimulatorOptions,
  Simulator,
  createSimulator,
  formatSimulationForCLI,
  formatWhatIfForCLI,
  getSimulator,
  resetSimulator,
} from './simulator.js';

// Policy integration - connects policy engine with decision traces
export {
  type PolicyDecisionRecord,
  type PolicyAwareDecisionTrace,
  type PolicyEvaluationInput,
  type PolicyEvaluator,
  type PolicyGateConfig,
  type PolicyGateResult,
  PolicyGate,
  createPolicyDecisionRecord,
  createPolicyGate,
  createAllowAllEvaluator,
  createDenyAllEvaluator,
  getPolicyDecisionsForRun,
  getBlockedActionsForRun,
  explainPolicyBlock,
} from './policy-integration.js';
