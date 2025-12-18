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

// Observability v2 exports (Phase 46: Enhanced Monitoring)
export * from './observability-v2/index.js';

// Orchestration v2 exports (Phase 47: Agent Coordination)
export * from './orchestration-v2/index.js';

// Autopilot v2 exports (Phase 48: Autonomous Operation)
export * from './autopilot-v2/index.js';

// Supply Chain exports (Phase 49: Dependency Security)
export * from './supply-chain/index.js';

// Production Excellence exports (Phase 50: Production Readiness)
export * from './production-excellence/index.js';
