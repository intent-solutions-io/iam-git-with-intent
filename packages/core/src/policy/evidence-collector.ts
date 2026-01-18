/**
 * Evidence Collection Service
 *
 * Epic D: Policy & Audit - Story D4: Compliance Reports
 * Task D4.2: Implement evidence collection
 *
 * Gathers evidence from Context Graph, audit logs, and policy evaluations.
 * Links evidence to specific compliance control decisions.
 *
 * Evidence sources:
 * - Immutable Audit Log (D3) - cryptographically verified actions
 * - Context Graph Decision Traces - AI agent reasoning
 * - Policy Evaluations - policy decisions and outcomes
 *
 * @module @gwi/core/policy/evidence-collector
 */

import { z } from 'zod';
import type { ImmutableAuditLogEntry, AuditActionCategory } from './audit-log-schema.js';
import type { ImmutableAuditLogStore, AuditLogQueryOptions } from './audit-log-storage.js';
import type { ChainVerificationResult } from './crypto-chain.js';
import { verifyChain } from './crypto-chain.js';
import type { EvidenceReference, EvidenceType, ControlDefinition } from './report-templates.js';
import { createAuditLogEvidence } from './report-templates.js';

// =============================================================================
// Evidence Query Types
// =============================================================================

/**
 * Time range for evidence collection
 */
export const EvidenceTimeRange = z.object({
  /** Start of evidence collection period */
  startDate: z.date(),
  /** End of evidence collection period */
  endDate: z.date(),
});
export type EvidenceTimeRange = z.infer<typeof EvidenceTimeRange>;

/**
 * Evidence query criteria
 */
export const EvidenceQuery = z.object({
  /** Tenant ID to collect evidence for */
  tenantId: z.string(),
  /** Time range for evidence */
  timeRange: EvidenceTimeRange,
  /** Control ID to find evidence for (optional) */
  controlId: z.string().optional(),
  /** Control category/domain (e.g., "access_control", "change_management") */
  controlCategory: z.string().optional(),
  /** Filter by action categories */
  actionCategories: z.array(z.string()).optional(),
  /** Filter by resource type (single value - use actionCategories for multiple) */
  resourceType: z.string().optional(),
  /** Filter by actor type (single value - use actionCategories for multiple) */
  actorType: z.string().optional(),
  /** Only include high-risk actions */
  highRiskOnly: z.boolean().optional(),
  /** Maximum evidence items to collect per source */
  maxPerSource: z.number().min(1).max(1000).optional(),
  /** Whether to verify chain integrity */
  verifyChain: z.boolean().optional(),
});
export type EvidenceQuery = z.infer<typeof EvidenceQuery>;

/**
 * Collected evidence with metadata
 */
export const CollectedEvidence = z.object({
  /** Evidence reference for the report */
  evidence: z.custom<EvidenceReference>(),
  /** Source of the evidence */
  source: z.enum(['audit_log', 'decision_trace', 'policy_evaluation', 'document']),
  /** Relevance score (0.0 - 1.0) */
  relevanceScore: z.number().min(0).max(1),
  /** Related control IDs this evidence supports */
  relatedControlIds: z.array(z.string()),
  /** Chain verification result (for audit log evidence) */
  chainVerification: z.custom<ChainVerificationResult>().optional(),
});
export type CollectedEvidence = z.infer<typeof CollectedEvidence>;

/**
 * Result of evidence collection
 */
export const EvidenceCollectionResult = z.object({
  /** Query that was executed */
  query: EvidenceQuery,
  /** Collected evidence items */
  evidence: z.array(CollectedEvidence),
  /** Evidence by source type */
  bySource: z.object({
    auditLog: z.number(),
    decisionTrace: z.number(),
    policyEvaluation: z.number(),
    document: z.number(),
  }),
  /** Evidence by control ID */
  byControl: z.record(z.number()),
  /** Chain verification summary */
  chainVerification: z.object({
    verified: z.number(),
    failed: z.number(),
    skipped: z.number(),
  }),
  /** Collection metadata */
  metadata: z.object({
    collectedAt: z.date(),
    durationMs: z.number(),
    tenantId: z.string(),
    timeRange: EvidenceTimeRange,
  }),
});
export type EvidenceCollectionResult = z.infer<typeof EvidenceCollectionResult>;

// =============================================================================
// Control-to-Action Mappings
// =============================================================================

/**
 * Mapping of control categories to audit action categories
 * Used to automatically find relevant evidence for controls
 */
export const CONTROL_TO_ACTION_MAPPINGS: Record<string, AuditActionCategory[]> = {
  // Access Control
  'access_control': ['auth', 'security', 'admin'],
  'logical_access': ['auth', 'security', 'admin'],
  'identity_management': ['auth', 'admin'],

  // Change Management
  'change_management': ['git', 'config', 'approval'],
  'system_changes': ['config', 'admin'],
  'configuration_management': ['config'],

  // Security Operations
  'incident_response': ['security', 'agent'],
  'security_monitoring': ['security', 'policy'],
  'vulnerability_management': ['security'],

  // Risk Management
  'risk_assessment': ['policy', 'agent', 'approval'],
  'risk_management': ['policy', 'security'],

  // Data Protection
  'data_protection': ['data', 'security'],
  'encryption': ['security', 'config'],
  'data_retention': ['data', 'admin'],

  // Operations
  'availability': ['config', 'admin'],
  'backup_recovery': ['data', 'admin'],
  'capacity_management': ['config', 'admin'],

  // Agent Operations
  'ai_operations': ['agent', 'approval'],
  'ai_governance': ['agent', 'policy', 'approval'],

  // Billing & Compliance
  'billing': ['billing'],
  'compliance': ['policy', 'approval', 'security'],
};

/**
 * SOC2 Trust Service Criteria to action category mappings
 */
export const SOC2_CRITERIA_MAPPINGS: Record<string, AuditActionCategory[]> = {
  // CC6 - Logical and Physical Access
  'CC6': ['auth', 'security', 'admin'],
  'CC6.1': ['auth', 'security'],
  'CC6.2': ['auth', 'admin'],
  'CC6.3': ['auth', 'security'],
  'CC6.4': ['security', 'config'],
  'CC6.5': ['security', 'config'],
  'CC6.6': ['auth', 'security'],
  'CC6.7': ['security', 'config'],
  'CC6.8': ['data', 'security'],

  // CC7 - System Operations
  'CC7': ['config', 'security', 'agent'],
  'CC7.1': ['security', 'agent'],
  'CC7.2': ['security', 'config'],
  'CC7.3': ['security', 'admin'],
  'CC7.4': ['security', 'agent'],
  'CC7.5': ['admin', 'security'],

  // CC8 - Change Management
  'CC8': ['git', 'config', 'approval'],
  'CC8.1': ['git', 'approval', 'agent'],

  // CC3 - Risk Assessment
  'CC3': ['policy', 'security', 'agent'],
  'CC3.1': ['policy', 'security'],
  'CC3.2': ['policy', 'agent'],
  'CC3.3': ['policy', 'agent'],
  'CC3.4': ['policy', 'security'],

  // CC5 - Control Activities
  'CC5': ['policy', 'approval', 'security'],
  'CC5.1': ['policy', 'approval'],
  'CC5.2': ['git', 'agent', 'approval'],
  'CC5.3': ['config', 'admin'],
};

/**
 * ISO27001 Annex A control mappings
 */
export const ISO27001_CONTROL_MAPPINGS: Record<string, AuditActionCategory[]> = {
  // A.5 - Information Security Policies
  'A.5': ['policy', 'admin'],
  'A.5.1': ['policy', 'admin'],

  // A.6 - Organization of Information Security
  'A.6': ['admin', 'security'],
  'A.6.1': ['admin', 'security'],
  'A.6.2': ['admin', 'config'],

  // A.8 - Asset Management
  'A.8': ['data', 'config', 'admin'],
  'A.8.1': ['data', 'admin'],
  'A.8.2': ['data', 'security'],
  'A.8.3': ['data', 'config'],

  // A.9 - Access Control
  'A.9': ['auth', 'security', 'admin'],
  'A.9.1': ['auth', 'policy'],
  'A.9.2': ['auth', 'admin'],
  'A.9.3': ['auth', 'security'],
  'A.9.4': ['auth', 'security'],

  // A.12 - Operations Security
  'A.12': ['config', 'security', 'admin'],
  'A.12.1': ['config', 'admin'],
  'A.12.2': ['security', 'config'],
  'A.12.3': ['data', 'admin'],
  'A.12.4': ['security', 'config'],
  'A.12.5': ['config', 'admin'],
  'A.12.6': ['security', 'config'],

  // A.14 - System Acquisition, Development, Maintenance
  'A.14': ['git', 'config', 'approval'],
  'A.14.1': ['git', 'security'],
  'A.14.2': ['git', 'approval', 'agent'],
  'A.14.3': ['data', 'security'],
};

// =============================================================================
// Evidence Source Interface
// =============================================================================

/**
 * Abstract evidence source interface
 */
export interface EvidenceSource {
  /** Source name */
  readonly name: string;

  /**
   * Collect evidence matching the query
   */
  collect(query: EvidenceQuery): Promise<CollectedEvidence[]>;

  /**
   * Check if this source is available
   */
  isAvailable(): Promise<boolean>;
}

// =============================================================================
// Audit Log Evidence Source
// =============================================================================

/**
 * Configuration for audit log evidence source
 */
export interface AuditLogEvidenceSourceConfig {
  /** Audit log store instance */
  store: ImmutableAuditLogStore;
  /** Whether to verify chain integrity by default */
  verifyChainByDefault?: boolean;
  /** Batch size for chain verification */
  verifyBatchSize?: number;
}

/**
 * Evidence source that queries the immutable audit log
 */
export class AuditLogEvidenceSource implements EvidenceSource {
  readonly name = 'audit_log';

  private store: ImmutableAuditLogStore;
  private verifyChainByDefault: boolean;

  constructor(config: AuditLogEvidenceSourceConfig) {
    this.store = config.store;
    this.verifyChainByDefault = config.verifyChainByDefault ?? true;
    // Note: verifyBatchSize from config reserved for future batch verification optimization
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if store is accessible
      await this.store.getMetadata('health-check-tenant');
      return true;
    } catch {
      // Store may throw if tenant doesn't exist, that's OK
      return true;
    }
  }

  async collect(query: EvidenceQuery): Promise<CollectedEvidence[]> {
    const results: CollectedEvidence[] = [];

    // Determine which action categories to query
    const actionCategories = this.resolveActionCategories(query);

    // Query for each action category
    for (const category of actionCategories) {
      const queryOptions: AuditLogQueryOptions = {
        tenantId: query.tenantId,
        startTime: query.timeRange.startDate,
        endTime: query.timeRange.endDate,
        actionCategory: category,
        highRiskOnly: query.highRiskOnly,
        limit: query.maxPerSource ?? 100,
        sortOrder: 'desc',
      };

      // Add resource type filter if specified
      if (query.resourceType) {
        queryOptions.resourceType = query.resourceType;
      }

      // Add actor type filter if specified
      if (query.actorType) {
        queryOptions.actorType = query.actorType;
      }

      try {
        const queryResult = await this.store.query(queryOptions);

        // Verify chain if requested
        let chainVerification: ChainVerificationResult | undefined;
        if (query.verifyChain ?? this.verifyChainByDefault) {
          if (queryResult.entries.length > 0) {
            chainVerification = verifyChain(queryResult.entries);
          }
        }

        // Convert entries to evidence
        for (const entry of queryResult.entries) {
          const evidence = this.entryToEvidence(entry, query, chainVerification);
          results.push(evidence);
        }
      } catch (error) {
        // Log but continue with other categories
        console.warn(`Failed to query audit log for category ${category}:`, error);
      }
    }

    return results;
  }

  /**
   * Resolve action categories from query
   */
  private resolveActionCategories(query: EvidenceQuery): string[] {
    // If explicitly specified, use those
    if (query.actionCategories && query.actionCategories.length > 0) {
      return query.actionCategories;
    }

    // If control ID specified, try to map it
    if (query.controlId) {
      // Check SOC2 mappings
      const soc2Categories = SOC2_CRITERIA_MAPPINGS[query.controlId];
      if (soc2Categories) {
        return soc2Categories;
      }

      // Check ISO27001 mappings
      const isoCategories = ISO27001_CONTROL_MAPPINGS[query.controlId];
      if (isoCategories) {
        return isoCategories;
      }

      // Try parent control (e.g., CC6.1 -> CC6)
      const parentId = query.controlId.split('.')[0];
      const parentSoc2 = SOC2_CRITERIA_MAPPINGS[parentId];
      if (parentSoc2) {
        return parentSoc2;
      }
      const parentIso = ISO27001_CONTROL_MAPPINGS[parentId];
      if (parentIso) {
        return parentIso;
      }
    }

    // If control category specified, use that mapping
    if (query.controlCategory) {
      const categoryMapping = CONTROL_TO_ACTION_MAPPINGS[query.controlCategory.toLowerCase()];
      if (categoryMapping) {
        return categoryMapping;
      }
    }

    // Default: query all categories
    return ['auth', 'security', 'policy', 'git', 'agent', 'approval', 'config', 'admin'];
  }

  /**
   * Convert audit log entry to evidence
   */
  private entryToEvidence(
    entry: ImmutableAuditLogEntry,
    query: EvidenceQuery,
    chainVerification?: ChainVerificationResult
  ): CollectedEvidence {
    // Build description
    const description = `${entry.action.category}:${entry.action.type} by ${entry.actor.type}:${entry.actor.id}` +
      (entry.outcome.status !== 'success' ? ` (${entry.outcome.status})` : '');

    // Create evidence reference
    const evidenceRef = createAuditLogEvidence(
      [entry.id],
      description,
      'evidence-collector',
      {
        chainVerified: chainVerification?.valid ?? false,
        verifiedAt: chainVerification?.valid ? new Date() : undefined,
      }
    );

    // Calculate relevance score
    const relevanceScore = this.calculateRelevanceScore(entry, query);

    // Determine related control IDs
    const relatedControlIds = this.findRelatedControlIds(entry, query);

    return {
      evidence: evidenceRef,
      source: 'audit_log',
      relevanceScore,
      relatedControlIds,
      chainVerification,
    };
  }

  /**
   * Calculate relevance score for an entry
   */
  private calculateRelevanceScore(entry: ImmutableAuditLogEntry, query: EvidenceQuery): number {
    let score = 0.5; // Base score

    // Sensitive/high-risk actions are more relevant
    if (entry.action.sensitive) {
      score += 0.2;
    }

    // Failed actions may indicate issues
    if (entry.outcome.status === 'failure') {
      score += 0.1;
    }

    // Policy-related actions are highly relevant for compliance
    if (entry.action.category === 'policy' || entry.action.category === 'approval') {
      score += 0.15;
    }

    // Security events are always important
    if (entry.action.category === 'security') {
      score += 0.15;
    }

    // If control ID matches action category mapping, boost score
    if (query.controlId) {
      const soc2Categories = SOC2_CRITERIA_MAPPINGS[query.controlId] ?? [];
      const isoCategories = ISO27001_CONTROL_MAPPINGS[query.controlId] ?? [];
      const allCategories = [...soc2Categories, ...isoCategories];
      if (allCategories.includes(entry.action.category as AuditActionCategory)) {
        score += 0.2;
      }
    }

    return Math.min(1.0, score);
  }

  /**
   * Find control IDs related to this entry
   */
  private findRelatedControlIds(entry: ImmutableAuditLogEntry, query: EvidenceQuery): string[] {
    const controlIds: string[] = [];

    // If query specifies a control, include it
    if (query.controlId) {
      controlIds.push(query.controlId);
    }

    // Find SOC2 controls that map to this action category
    for (const [controlId, categories] of Object.entries(SOC2_CRITERIA_MAPPINGS)) {
      if (categories.includes(entry.action.category as AuditActionCategory)) {
        if (!controlIds.includes(controlId)) {
          controlIds.push(controlId);
        }
      }
    }

    // Find ISO27001 controls that map to this action category
    for (const [controlId, categories] of Object.entries(ISO27001_CONTROL_MAPPINGS)) {
      if (categories.includes(entry.action.category as AuditActionCategory)) {
        if (!controlIds.includes(controlId)) {
          controlIds.push(controlId);
        }
      }
    }

    return controlIds;
  }
}

// =============================================================================
// Decision Trace Evidence Source
// =============================================================================

/**
 * Decision trace store interface (from context-graph)
 */
export interface DecisionTraceStore {
  query(filter: {
    tenantId?: string;
    runId?: string;
    agentType?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Promise<DecisionTrace[]>;
}

/**
 * Simplified decision trace for evidence collection
 */
export interface DecisionTrace {
  id: string;
  runId: string;
  agentType: string;
  timestamp: Date;
  tenantId: string;
  inputs: {
    prompt: string;
    contextWindow: string[];
    complexity?: number;
  };
  decision: {
    action: string;
    reasoning: string;
    confidence: number;
    alternatives: string[];
  };
  outcome?: {
    result: 'success' | 'failure' | 'override';
    humanOverride?: {
      userId: string;
      reason: string;
    };
  };
}

/**
 * Configuration for decision trace evidence source
 */
export interface DecisionTraceEvidenceSourceConfig {
  /** Decision trace store instance */
  store: DecisionTraceStore;
}

/**
 * Evidence source that queries the Context Graph decision traces
 */
export class DecisionTraceEvidenceSource implements EvidenceSource {
  readonly name = 'decision_trace';

  private store: DecisionTraceStore;

  constructor(config: DecisionTraceEvidenceSourceConfig) {
    this.store = config.store;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.store.query({ limit: 1 });
      return true;
    } catch {
      return false;
    }
  }

  async collect(query: EvidenceQuery): Promise<CollectedEvidence[]> {
    const results: CollectedEvidence[] = [];

    // Determine agent types to query based on control
    const agentTypes = this.resolveAgentTypes(query);

    for (const agentType of agentTypes) {
      try {
        const traces = await this.store.query({
          tenantId: query.tenantId,
          agentType,
          startTime: query.timeRange.startDate,
          endTime: query.timeRange.endDate,
          limit: query.maxPerSource ?? 50,
        });

        for (const trace of traces) {
          const evidence = this.traceToEvidence(trace, query);
          results.push(evidence);
        }
      } catch (error) {
        console.warn(`Failed to query decision traces for agent ${agentType}:`, error);
      }
    }

    return results;
  }

  /**
   * Resolve agent types from query
   */
  private resolveAgentTypes(query: EvidenceQuery): string[] {
    // AI governance controls need agent traces
    if (query.controlCategory === 'ai_governance' || query.controlCategory === 'ai_operations') {
      return ['triage', 'coder', 'resolver', 'reviewer', 'orchestrator'];
    }

    // Change management needs coder and resolver
    if (query.controlCategory === 'change_management') {
      return ['coder', 'resolver', 'reviewer'];
    }

    // Risk assessment needs triage and reviewer
    if (query.controlCategory === 'risk_assessment') {
      return ['triage', 'reviewer'];
    }

    // Default: all agent types
    return ['triage', 'coder', 'resolver', 'reviewer', 'orchestrator'];
  }

  /**
   * Convert decision trace to evidence
   */
  private traceToEvidence(trace: DecisionTrace, query: EvidenceQuery): CollectedEvidence {
    const description = `${trace.agentType} agent: ${trace.decision.action} ` +
      `(confidence: ${(trace.decision.confidence * 100).toFixed(0)}%)` +
      (trace.outcome?.humanOverride ? ' [overridden]' : '');

    const evidenceRef: EvidenceReference = {
      id: `dt-${trace.id}`,
      type: 'audit_log' as EvidenceType, // Decision traces are a form of audit
      description,
      auditLogEntryIds: [trace.id],
      chainVerified: false, // Decision traces use different verification
      collectedAt: new Date(),
      collectedBy: 'evidence-collector',
      metadata: {
        runId: trace.runId,
        agentType: trace.agentType,
        reasoning: trace.decision.reasoning,
        confidence: trace.decision.confidence,
        alternatives: trace.decision.alternatives,
        outcome: trace.outcome?.result,
        humanOverride: trace.outcome?.humanOverride,
      },
    };

    // Calculate relevance
    let relevanceScore = 0.6;
    if (trace.decision.confidence > 0.9) {
      relevanceScore += 0.1;
    }
    if (trace.outcome?.humanOverride) {
      relevanceScore += 0.2; // Overrides are important for compliance
    }
    if (trace.outcome?.result === 'failure') {
      relevanceScore += 0.1;
    }

    // Find related controls
    const relatedControlIds = this.findRelatedControlIds(trace, query);

    return {
      evidence: evidenceRef,
      source: 'decision_trace',
      relevanceScore: Math.min(1.0, relevanceScore),
      relatedControlIds,
    };
  }

  /**
   * Find control IDs related to this trace
   */
  private findRelatedControlIds(trace: DecisionTrace, query: EvidenceQuery): string[] {
    const controlIds: string[] = [];

    if (query.controlId) {
      controlIds.push(query.controlId);
    }

    // Agent decisions relate to CC8 (Change Management) and CC5 (Control Activities)
    if (trace.agentType === 'coder' || trace.agentType === 'resolver') {
      controlIds.push('CC8.1', 'CC5.2');
    }

    // Triage relates to CC3 (Risk Assessment)
    if (trace.agentType === 'triage') {
      controlIds.push('CC3.2', 'CC3.3');
    }

    // Reviewer relates to CC7 (System Operations)
    if (trace.agentType === 'reviewer') {
      controlIds.push('CC7.1', 'CC7.4');
    }

    return controlIds;
  }
}

// =============================================================================
// Evidence Collector
// =============================================================================

/**
 * Configuration for evidence collector
 */
export interface EvidenceCollectorConfig {
  /** Evidence sources to use */
  sources: EvidenceSource[];
  /** Default maximum evidence per source */
  defaultMaxPerSource?: number;
  /** Whether to verify chain by default */
  defaultVerifyChain?: boolean;
  /** Collector ID for tracking */
  collectorId?: string;
}

/**
 * Main evidence collection orchestrator
 */
export class EvidenceCollector {
  private sources: EvidenceSource[];
  private defaultMaxPerSource: number;
  private defaultVerifyChain: boolean;

  constructor(config: EvidenceCollectorConfig) {
    this.sources = config.sources;
    this.defaultMaxPerSource = config.defaultMaxPerSource ?? 100;
    this.defaultVerifyChain = config.defaultVerifyChain ?? true;
    // Note: collectorId from config reserved for future evidence metadata
  }

  /**
   * Collect evidence matching the query from all sources
   */
  async collect(query: EvidenceQuery): Promise<EvidenceCollectionResult> {
    const startTime = Date.now();
    const allEvidence: CollectedEvidence[] = [];

    // Apply defaults
    const effectiveQuery: EvidenceQuery = {
      ...query,
      maxPerSource: query.maxPerSource ?? this.defaultMaxPerSource,
      verifyChain: query.verifyChain ?? this.defaultVerifyChain,
    };

    // Collect from each source
    for (const source of this.sources) {
      try {
        const isAvailable = await source.isAvailable();
        if (!isAvailable) {
          console.warn(`Evidence source ${source.name} is not available`);
          continue;
        }

        const evidence = await source.collect(effectiveQuery);
        allEvidence.push(...evidence);
      } catch (error) {
        console.error(`Error collecting from ${source.name}:`, error);
      }
    }

    // Sort by relevance
    allEvidence.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Build result
    const bySource = {
      auditLog: allEvidence.filter(e => e.source === 'audit_log').length,
      decisionTrace: allEvidence.filter(e => e.source === 'decision_trace').length,
      policyEvaluation: allEvidence.filter(e => e.source === 'policy_evaluation').length,
      document: allEvidence.filter(e => e.source === 'document').length,
    };

    const byControl: Record<string, number> = {};
    for (const e of allEvidence) {
      for (const controlId of e.relatedControlIds) {
        byControl[controlId] = (byControl[controlId] ?? 0) + 1;
      }
    }

    const chainVerification = {
      verified: allEvidence.filter(e => e.chainVerification?.valid === true).length,
      failed: allEvidence.filter(e => e.chainVerification?.valid === false).length,
      skipped: allEvidence.filter(e => e.chainVerification === undefined).length,
    };

    return {
      query: effectiveQuery,
      evidence: allEvidence,
      bySource,
      byControl,
      chainVerification,
      metadata: {
        collectedAt: new Date(),
        durationMs: Date.now() - startTime,
        tenantId: query.tenantId,
        timeRange: query.timeRange,
      },
    };
  }

  /**
   * Collect evidence for a specific control
   */
  async collectForControl(
    tenantId: string,
    control: ControlDefinition,
    timeRange: EvidenceTimeRange
  ): Promise<CollectedEvidence[]> {
    const query: EvidenceQuery = {
      tenantId,
      timeRange,
      controlId: control.controlId,
      controlCategory: control.category.toLowerCase().replace(/\s+/g, '_'),
    };

    const result = await this.collect(query);
    return result.evidence.filter(e =>
      e.relatedControlIds.includes(control.controlId)
    );
  }

  /**
   * Collect evidence for multiple controls
   */
  async collectForControls(
    tenantId: string,
    controls: ControlDefinition[],
    timeRange: EvidenceTimeRange
  ): Promise<Map<string, CollectedEvidence[]>> {
    const resultMap = new Map<string, CollectedEvidence[]>();

    // Collect all evidence at once (more efficient than per-control queries)
    const query: EvidenceQuery = {
      tenantId,
      timeRange,
    };

    const result = await this.collect(query);

    // Group by control
    for (const control of controls) {
      const controlEvidence = result.evidence.filter(e =>
        e.relatedControlIds.includes(control.controlId)
      );
      resultMap.set(control.controlId, controlEvidence);
    }

    return resultMap;
  }

  /**
   * Add sources dynamically
   */
  addSource(source: EvidenceSource): void {
    this.sources.push(source);
  }

  /**
   * Get available sources
   */
  async getAvailableSources(): Promise<string[]> {
    const available: string[] = [];
    for (const source of this.sources) {
      if (await source.isAvailable()) {
        available.push(source.name);
      }
    }
    return available;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an audit log evidence source
 */
export function createAuditLogEvidenceSource(
  store: ImmutableAuditLogStore,
  options?: { verifyChainByDefault?: boolean; verifyBatchSize?: number }
): AuditLogEvidenceSource {
  return new AuditLogEvidenceSource({
    store,
    ...options,
  });
}

/**
 * Create a decision trace evidence source
 */
export function createDecisionTraceEvidenceSource(
  store: DecisionTraceStore
): DecisionTraceEvidenceSource {
  return new DecisionTraceEvidenceSource({ store });
}

/**
 * Create an evidence collector with default sources
 */
export function createEvidenceCollector(
  auditLogStore: ImmutableAuditLogStore,
  decisionTraceStore?: DecisionTraceStore,
  options?: {
    defaultMaxPerSource?: number;
    defaultVerifyChain?: boolean;
    collectorId?: string;
  }
): EvidenceCollector {
  const sources: EvidenceSource[] = [
    createAuditLogEvidenceSource(auditLogStore),
  ];

  if (decisionTraceStore) {
    sources.push(createDecisionTraceEvidenceSource(decisionTraceStore));
  }

  return new EvidenceCollector({
    sources,
    ...options,
  });
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Link collected evidence to a control
 */
export function linkEvidenceToControl(
  control: ControlDefinition,
  evidence: CollectedEvidence[]
): ControlDefinition {
  const existingIds = new Set(control.evidence.map(e => e.id));
  const newEvidence = evidence
    .filter(e => !existingIds.has(e.evidence.id))
    .map(e => e.evidence);

  return {
    ...control,
    evidence: [...control.evidence, ...newEvidence],
  };
}

/**
 * Get evidence summary for a collection result
 */
export function getEvidenceSummary(result: EvidenceCollectionResult): {
  totalEvidence: number;
  bySource: Record<string, number>;
  byControl: Record<string, number>;
  averageRelevance: number;
  chainVerificationRate: number;
} {
  const totalEvidence = result.evidence.length;
  const averageRelevance = totalEvidence > 0
    ? result.evidence.reduce((sum, e) => sum + e.relevanceScore, 0) / totalEvidence
    : 0;

  const verifiedCount = result.chainVerification.verified;
  const totalVerifiable = verifiedCount + result.chainVerification.failed;
  const chainVerificationRate = totalVerifiable > 0
    ? verifiedCount / totalVerifiable
    : 1;

  return {
    totalEvidence,
    bySource: result.bySource,
    byControl: result.byControl,
    averageRelevance,
    chainVerificationRate,
  };
}

/**
 * Filter evidence by minimum relevance score
 */
export function filterByRelevance(
  evidence: CollectedEvidence[],
  minScore: number
): CollectedEvidence[] {
  return evidence.filter(e => e.relevanceScore >= minScore);
}

/**
 * Get top evidence items
 */
export function getTopEvidence(
  evidence: CollectedEvidence[],
  count: number
): CollectedEvidence[] {
  return [...evidence]
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, count);
}

// =============================================================================
// Singleton Management
// =============================================================================

let globalEvidenceCollector: EvidenceCollector | null = null;

/**
 * Initialize the global evidence collector
 */
export function initializeEvidenceCollector(
  auditLogStore: ImmutableAuditLogStore,
  decisionTraceStore?: DecisionTraceStore,
  options?: {
    defaultMaxPerSource?: number;
    defaultVerifyChain?: boolean;
    collectorId?: string;
  }
): EvidenceCollector {
  globalEvidenceCollector = createEvidenceCollector(
    auditLogStore,
    decisionTraceStore,
    options
  );
  return globalEvidenceCollector;
}

/**
 * Get the global evidence collector
 */
export function getEvidenceCollector(): EvidenceCollector {
  if (!globalEvidenceCollector) {
    throw new Error('Evidence collector not initialized. Call initializeEvidenceCollector first.');
  }
  return globalEvidenceCollector;
}

/**
 * Set the global evidence collector
 */
export function setEvidenceCollector(collector: EvidenceCollector): void {
  globalEvidenceCollector = collector;
}

/**
 * Reset the global evidence collector
 */
export function resetEvidenceCollector(): void {
  globalEvidenceCollector = null;
}
