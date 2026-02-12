/**
 * @gwi/core - Core utilities for Git With Intent
 *
 * This module provides the foundational integrations:
 * - Storage: Pluggable storage backends (SQLite default, Firestore for production)
 * - A2A: Agent-to-Agent protocol types and utilities
 * - Models: Multi-model client abstraction
 */

// Storage exports (primary source for storage types)
export * from './storage/index.js';

// A2A exports
export * from './a2a/index.js';

// Model exports
export * from './models/index.js';

// Type exports (exclude ConflictInfo and PRMetadata which are in storage/interfaces)
export type {
  AgentId,
  ModelProvider,
  ModelConfig,
  ComplexityScore,
  RouteDecision,
  ResolutionResult,
  ReviewResult,
} from './types.js';

// Security exports (Phase 11: Production-ready RBAC and plan enforcement)
export * from './security/index.js';

// Auth exports (Token verification for Firebase Auth and GCP OIDC)
export * from './auth/index.js';

// Workflow exports (Phase 13: Multi-agent workflow definitions)
export * from './workflows/index.js';

// Plugin system exports (Phase 14: Extensibility)
export * from './plugins/index.js';

// Billing exports (Phase 15: Launch Prep)
export * from './billing/index.js';

// Workspace exports (Phase 4: Sandboxed workspace for code generation)
export * from './workspace.js';

// Run Bundle exports (Phase 17: Agent Execution Backbone)
export * from './run-bundle/index.js';

// Artifact Access exports (A8.s2: Signed URL generation for UI access)
export * from './artifacts/index.js';

// Scoring exports (Phase 17: Deterministic complexity scoring)
export * from './scoring/index.js';

// Capabilities exports (Phase 17: Approval-gated GitHub operations)
export * from './capabilities/index.js';

// Connector SDK exports (Phase 3: Unified connector framework)
export * from './connectors/index.js';

// Template exports (Phase 13: Workflow Catalog)
export * from './templates/index.js';

// Scheduler exports (Phase 13: Workflow Catalog)
export * from './scheduler/index.js';

// Notification exports (Phase 13: Workflow Catalog)
export * from './notifications/index.js';

// Multi-tenancy exports (Phase 5: SaaS multi-tenancy + policy-as-code)
export * from './tenancy/index.js';

// Reliability exports (Phase 7: Operator-grade hardening)
export * from './reliability/index.js';

// Signals exports (Phase 14: Signals → PR Queue)
export * from './signals/index.js';

// Rate Limiting exports (Phase 15: Production hardening)
export * from './ratelimit/index.js';

// Queue exports (Phase 17: Job queue abstraction)
export * from './queue/index.js';

// Agent exports (Phase 18: Agent Integration)
export * from './agents/index.js';

// Merge exports (Phase 20: 3-Way Merge Resolver)
export * from './merge/index.js';

// Telemetry exports (Phase 23: Production Observability)
export * from './telemetry/index.js';

// Approvals exports (Phase 25: Approval Commands + Policy-as-Code)
export * from './approvals/index.js';

// Policy exports (Phase 25: Policy-as-Code Enforcement)
export * from './policy/index.js';

// Planner exports (Phase 26: LLM Planner Integration)
export * from './planner/index.js';

// LLM exports (Phase 26: Provider-Agnostic LLM Interface)
export * from './llm/index.js';

// Forensics exports (Phase 27: Replay & Forensics)
export * from './forensics/index.js';

// Metering exports (Phase 28: Usage Dashboard + Billing)
export * from './metering/index.js';

// Marketplace exports (Phase 29: Connector Marketplace)
export * from './marketplace/index.js';

// Identity exports (Phase 31: Enterprise SSO & SCIM)
export * from './identity/index.js';

// Workspace Isolation exports (Phase 34: Autopilot)
export * from './workspace-isolation.js';

// Evidence exports (Phase 37: PR Review Automation)
export * from './evidence/index.js';

// Review exports (Phase 37: PR Review Automation)
export * from './review/index.js';

// Testing exports (Phase 38: E2E Testing Infrastructure)
export * from './testing/index.js';

// SDK Generation exports (Phase 39: SDK Generation from OpenAPI)
export * from './sdk-gen/index.js';

// Admin exports (Phase 40: Admin Dashboard UX)
export * from './admin/index.js';

// Compliance exports (Phase 41: Compliance & Audit)
export * from './compliance/index.js';

// Policy DSL exports (Phase 42: Policy-as-Code v2)
export * from './policy-dsl/index.js';

// Trust & Safety exports (Phase 43: Connector Security)
export * from './trust-safety/index.js';

// Disaster Recovery exports (Phase 44: DR & Business Continuity)
export * from './disaster-recovery/index.js';

// Quotas exports (Phase 45: Resource Management)
export * from './quotas/index.js';

// Orchestration v2 exports (Phase 47: Agent Coordination)
export * from './orchestration-v2/index.js';

// Autopilot v2 exports (Phase 48: Autonomous Operation)
export * from './autopilot-v2/index.js';

// Supply Chain exports (Phase 49: Dependency Security)
export * from './supply-chain/index.js';

// Production Excellence exports (Phase 50: Production Readiness)
export * from './production-excellence/index.js';

// Time Series exports (Phase 51: Canonical Time-Series Schema)
export * from './time-series/index.js';

// Prediction Connectors exports (Phase 52: Connector Contract + Normalization)
export * from './prediction-connectors/index.js';

// Airbyte Integration exports (Phase 53: Airbyte Partner-First Connector)
export * from './airbyte-integration/index.js';

// Series Storage exports (Phase 54: Dual-Layer Storage)
export * from './series-storage/index.js';

// Forecasting exports (Phase 55-56: Forecasting Services)
export * from './forecasting/index.js';

// Backtesting exports (Phase 57: Forecast Quality + Walk-Forward Validation)
export * from './backtesting/index.js';

// Command Center exports (Phase 58: Dashboard v1)
export * from './command-center/index.js';

// Alerts exports (Phase 59: Alert Rules Engine)
export * from './alerts/index.js';

// Auto-Actions exports (Phase 60: Automated Responses)
export * from './auto-actions/index.js';

// Public API exports (Phase 61: REST API Infrastructure)
export * from './public-api/index.js';

// API Keys exports (Phase 62: API Key Management)
export * from './api-keys/index.js';

// Audit Logging exports (Phase 63: Comprehensive Audit Trails)
export * from './audit-logging/index.js';

// Data Governance exports (Phase 64: Data Classification & Lineage)
export * from './data-governance/index.js';

// Admin API exports (Phase 65: Administrative Operations)
export * from './admin-api/index.js';

// Cost Management exports (Phase 66: Usage Metering & Billing)
export * from './cost-management/index.js';

// Analytics & Reporting exports (Phase 67: Business Intelligence)
export * from './analytics-reporting/index.js';

// Export Integrations exports (Phase 68: Data Export & Webhooks)
export * from './export-integrations/index.js';

// System Health exports (Phase 69: Health Monitoring & Diagnostics)
export * from './system-health/index.js';

// Health Check exports (B5: Cloud Run health check endpoints)
export * from './health/index.js';

// GA Readiness exports (Phase 70: Production Launch Gate)
export * from './ga-readiness/index.js';

// Secrets exports (A9: Secrets Model)
export * from './secrets/index.js';

// Governance exports (Epic E: RBAC & Governance)
// Use explicit exports to avoid naming conflicts
export {
  // Audit Query Service
  AuditQueryService,
  createAuditQueryService,
  type AuditQueryFilters,
  type AuditQueryResult as GovernanceAuditQueryResult,
  type AuditStatistics as GovernanceAuditStatistics,
  type AnomalyType,
  type AnomalySeverity,
  type Anomaly,
  type AnomalyDetectionResult as GovernanceAnomalyDetectionResult,
  // Compliance Service
  ComplianceService,
  createComplianceService,
  type ReportPeriod,
  type ExportFormat as GovernanceExportFormat,
  type BaseReport,
  type AccessReport,
  type RBACComplianceReport,
  type QuotaComplianceReport,
  type SecretAccessReport,
  type HighRiskActionsReport,
} from './governance/index.js';

// Tenants exports (Epic E: RBAC & Governance)
export * from './tenants/index.js';

// SLO exports (A12: SLO Definitions + Perf Tests)
export {
  // Types (canonical definitions)
  type SLOCategory,
  type SLOWindow,
  type SLODefinition,
  type SLOStatus,
  // Constants
  LATENCY_TARGETS,
  SLO_DEFINITIONS,
  // Query Helpers
  getSLOById,
  getSLOsByService,
  getSLOsByCategory,
  getSLOsByTag,
  getCriticalSLOs,
  // Calculations
  calculateErrorBudgetMinutes,
  windowToMinutes,
  calculateBurnRate,
  determineSLOStatus,
  calculateSLOStatus,
  getLatencyThresholds,
} from './slo/index.js';

// Idempotency exports (A4: Idempotency Layer - Event Source Key Schemes)
// Explicit exports to resolve naming conflicts with reliability and telemetry
export {
  // Types
  type EventSource as IdempotencyEventSource,
  type GitHubIdempotencyKey,
  type ApiIdempotencyKey,
  type SlackIdempotencyKey,
  type SchedulerIdempotencyKey,
  type IdempotencyKeyInput,
  // Schemas
  EventSourceSchema as IdempotencyEventSourceSchema,
  GitHubIdempotencyKeySchema,
  ApiIdempotencyKeySchema,
  SlackIdempotencyKeySchema,
  SchedulerIdempotencyKeySchema,
  IdempotencyKeyInputSchema,
  // Key Generation (prefixed to avoid conflict with reliability module)
  generateIdempotencyKey as generateEventIdempotencyKey,
  parseIdempotencyKey as parseEventIdempotencyKey,
  validateIdempotencyKey as validateEventIdempotencyKey,
  hashRequestPayload,
  // Request ID generation (prefixed to avoid conflict with telemetry module)
  generateRequestId as generateIdempotencyRequestId,
  extractTenantId,
} from './idempotency/index.js';

// Local Review exports (Epic J: Local Dev Review)
// Explicit exports to avoid naming conflicts with run-bundle (RiskLevel) and sdk-gen (ChangeType)
export {
  // Types (prefixed to avoid conflicts)
  type ChangeType as LocalChangeType,
  type FileStatus,
  type FileChange,
  type FileDiff,
  type DiffHunk,
  type LocalChanges,
  type ChangeReaderOptions,
  type FileCategory,
  type RiskLevel as LocalRiskLevel,
  type FileAnalysis,
  type ChangePattern,
  type DiffAnalysis,
  // Explainer types
  type ExplainFormat,
  type ExplainVerbosity,
  type FileExplanation,
  type ChangeExplanation,
  // Git helpers
  findRepoRoot,
  isGitRepository,
  getCurrentBranch,
  getHeadCommit,
  getShortCommit,
  refExists,
  // File operations
  getStagedFiles,
  getUnstagedFiles,
  getUntrackedFiles,
  // Main readers
  readStagedChanges,
  readUnstagedChanges,
  readAllChanges,
  readCommitChanges,
  readRangeChanges,
  readChanges,
  getChangeSummary,
  // Categorization
  categorizeFile,
  detectLanguage,
  // Complexity
  calculateFileComplexity,
  quickComplexityScore,
  // Main analyzer
  analyzeDiff,
  // Explainer
  explainChanges,
  quickExplain,
  formatExplanation,
  formatExplanationText,
  formatExplanationMarkdown,
  formatExplanationJson,
  // Scorer types
  type LocalComplexityScore,
  type LocalRubricTag,
  type LocalScoreResult,
  type LocalTriageResult,
  // Scoring
  scoreLocalChanges,
  scoreFromAnalysis,
  clampScore as clampLocalScore,
  scoreToRiskLevel,
  quickScore,
  // Triage
  triageLocalChanges,
} from './local/index.js';

// Context Graph exports (Phase 35: Context Graph / Decision Ledger)
// Note: generateTraceId excluded to avoid conflict with telemetry module
export {
  // Decision trace
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
  getDecisionTraceStore,
  setDecisionTraceStore,
  resetDecisionTraceStore,
  // Graph store
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
  // Entity resolver
  type EntitySource,
  type EntityType,
  type EntityMention,
  type ResolutionMethod,
  type ResolvedEntity,
  type ResolutionResult as EntityResolutionResult,
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
  // Accuracy tracker
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
  // Explainer
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
  // Simulator
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
} from './context-graph/index.js';

// Evaluation exports (EPIC 003: Evaluation Harness + Golden Tasks Framework)
export * from './evaluation/index.js';

// Runtime exports (Deno/Bun hybrid support)
export * from './runtime/index.js';
