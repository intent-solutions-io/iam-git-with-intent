/**
 * Violation Detector Service
 *
 * Epic D: Policy & Audit - Story D5: Violation Detection
 * Task D5.2: Create violation detector
 *
 * Real-time detection from policy engine results with:
 * - Pattern aggregation for repeated violations
 * - Deduplication of repeat violations
 * - Integration with policy engine, approval gates, and rate limiters
 *
 * @module @gwi/core/policy/violation-detector
 */

import { createHash } from 'crypto';
import {
  type Violation,
  type ViolationType,
  type ViolationSeverity,
  type ViolationStatus,
  type ViolationActor,
  type ViolationResource,
  type ViolationAction,
  type ViolationQuery,
  createPolicyDeniedViolation,
  createApprovalBypassedViolation,
  createLimitExceededViolation,
  createAnomalyDetectedViolation,
  type PolicyDeniedDetails,
  type ApprovalBypassedDetails,
  type LimitExceededDetails,
  type AnomalyDetectedDetails,
  getSeverityWeight,
} from './violation-schema.js';
import type { PolicyEvaluationResult } from './schema.js';

// =============================================================================
// Violation Store Interface
// =============================================================================

/**
 * Query result with pagination metadata
 */
export interface ViolationQueryResult {
  /** Matching violations */
  violations: Violation[];
  /** Total count (before pagination) */
  total: number;
  /** Whether there are more results */
  hasMore: boolean;
  /** Query metadata */
  metadata: {
    query: ViolationQuery;
    executedAt: Date;
    durationMs: number;
  };
}

/**
 * Aggregation bucket for pattern detection
 */
export interface ViolationAggregation {
  /** Aggregation key */
  key: string;
  /** Violation type */
  type: ViolationType;
  /** Number of violations in this bucket */
  count: number;
  /** First occurrence */
  firstSeen: Date;
  /** Last occurrence */
  lastSeen: Date;
  /** Unique actors involved */
  uniqueActors: number;
  /** Unique resources involved */
  uniqueResources: number;
  /** Highest severity seen */
  maxSeverity: ViolationSeverity;
  /** Sample violation IDs */
  sampleIds: string[];
}

/**
 * Interface for violation storage
 */
export interface ViolationStore {
  /**
   * Store a new violation
   */
  create(violation: Violation): Promise<Violation>;

  /**
   * Get a violation by ID
   */
  get(id: string): Promise<Violation | null>;

  /**
   * Update a violation's status
   */
  updateStatus(
    id: string,
    status: ViolationStatus,
    options?: {
      updatedBy?: string;
      resolutionNotes?: string;
      escalatedTo?: string;
    }
  ): Promise<Violation | null>;

  /**
   * Query violations with filters
   */
  query(query: ViolationQuery): Promise<ViolationQueryResult>;

  /**
   * Count violations matching criteria
   */
  count(query: Omit<ViolationQuery, 'limit' | 'offset' | 'sortBy' | 'sortOrder'>): Promise<number>;

  /**
   * Check if a violation with the given idempotency key exists
   */
  existsByIdempotencyKey(tenantId: string, key: string): Promise<boolean>;

  /**
   * Get aggregations for pattern detection
   */
  aggregate(
    tenantId: string,
    options: {
      groupBy: 'type' | 'actor' | 'resource' | 'type+actor' | 'type+resource';
      startTime?: Date;
      endTime?: Date;
      types?: ViolationType[];
      minCount?: number;
    }
  ): Promise<ViolationAggregation[]>;

  /**
   * Get recent violations for deduplication check
   */
  getRecent(
    tenantId: string,
    options: {
      type: ViolationType;
      actorId?: string;
      resourceId?: string;
      windowMs: number;
      limit?: number;
    }
  ): Promise<Violation[]>;

  /**
   * Delete old violations (for retention)
   */
  deleteOlderThan(tenantId: string, date: Date): Promise<number>;

  /**
   * Clear all violations for a tenant (for testing)
   */
  clear(tenantId?: string): Promise<void>;
}

// =============================================================================
// In-Memory Violation Store
// =============================================================================

/**
 * In-memory implementation of ViolationStore for testing and development
 */
export class InMemoryViolationStore implements ViolationStore {
  private violations: Map<string, Violation> = new Map();
  /** Map of tenantId -> (idempotencyKey -> timestamp) for TTL-based expiration */
  private idempotencyKeys: Map<string, Map<string, number>> = new Map();
  /** TTL for idempotency keys in milliseconds (24 hours) */
  private static readonly IDEMPOTENCY_KEY_TTL_MS = 24 * 60 * 60 * 1000;

  async create(violation: Violation): Promise<Violation> {
    this.violations.set(violation.id, violation);
    return violation;
  }

  async get(id: string): Promise<Violation | null> {
    return this.violations.get(id) ?? null;
  }

  async updateStatus(
    id: string,
    status: ViolationStatus,
    options?: {
      updatedBy?: string;
      resolutionNotes?: string;
      escalatedTo?: string;
    }
  ): Promise<Violation | null> {
    const violation = this.violations.get(id);
    if (!violation) return null;

    const updated: Violation = {
      ...violation,
      status,
      metadata: {
        ...violation.metadata,
        updatedAt: new Date(),
        updatedBy: options?.updatedBy,
        resolutionNotes: options?.resolutionNotes ?? violation.metadata.resolutionNotes,
        escalatedTo: options?.escalatedTo ?? violation.metadata.escalatedTo,
      },
    };

    this.violations.set(id, updated);
    return updated;
  }

  async query(query: ViolationQuery): Promise<ViolationQueryResult> {
    const startTime = Date.now();
    let results = Array.from(this.violations.values());

    // Filter by tenant
    results = results.filter((v) => v.tenantId === query.tenantId);

    // Apply filters
    if (query.types?.length) {
      results = results.filter((v) => query.types!.includes(v.type));
    }
    if (query.severities?.length) {
      results = results.filter((v) => query.severities!.includes(v.severity));
    }
    if (query.statuses?.length) {
      results = results.filter((v) => query.statuses!.includes(v.status));
    }
    if (query.sources?.length) {
      results = results.filter((v) => query.sources!.includes(v.source));
    }
    if (query.actorId) {
      results = results.filter((v) => v.actor.id === query.actorId);
    }
    if (query.resourceType) {
      results = results.filter((v) => v.resource.type === query.resourceType);
    }
    if (query.resourceId) {
      results = results.filter((v) => v.resource.id === query.resourceId);
    }
    if (query.startTime) {
      results = results.filter((v) => v.detectedAt >= query.startTime!);
    }
    if (query.endTime) {
      results = results.filter((v) => v.detectedAt < query.endTime!);
    }
    if (query.tags?.length) {
      results = results.filter(
        (v) => v.tags?.some((t) => query.tags!.includes(t))
      );
    }

    const total = results.length;

    // Sort
    const sortField = query.sortBy ?? 'detectedAt';
    const sortOrder = query.sortOrder ?? 'desc';
    results.sort((a, b) => {
      let aVal: number | string | Date;
      let bVal: number | string | Date;

      switch (sortField) {
        case 'detectedAt':
          aVal = a.detectedAt.getTime();
          bVal = b.detectedAt.getTime();
          break;
        case 'severity':
          aVal = getSeverityWeight(a.severity);
          bVal = getSeverityWeight(b.severity);
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'type':
          aVal = a.type;
          bVal = b.type;
          break;
        default:
          aVal = a.detectedAt.getTime();
          bVal = b.detectedAt.getTime();
      }

      if (typeof aVal === 'string') {
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal);
      }
      return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    // Paginate
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    const paginated = results.slice(offset, offset + limit);

    return {
      violations: paginated,
      total,
      hasMore: offset + limit < total,
      metadata: {
        query,
        executedAt: new Date(),
        durationMs: Date.now() - startTime,
      },
    };
  }

  async count(query: Omit<ViolationQuery, 'limit' | 'offset' | 'sortBy' | 'sortOrder'>): Promise<number> {
    const result = await this.query({ ...query, limit: 1, offset: 0, sortBy: 'detectedAt', sortOrder: 'desc' });
    return result.total;
  }

  async existsByIdempotencyKey(tenantId: string, key: string): Promise<boolean> {
    const tenantKeys = this.idempotencyKeys.get(tenantId);
    if (!tenantKeys) return false;

    const timestamp = tenantKeys.get(key);
    if (timestamp === undefined) return false;

    // Check if key has expired
    const now = Date.now();
    if (now - timestamp > InMemoryViolationStore.IDEMPOTENCY_KEY_TTL_MS) {
      // Key expired, remove it
      tenantKeys.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Register an idempotency key (called internally after creating a violation)
   */
  registerIdempotencyKey(tenantId: string, key: string): void {
    let tenantKeys = this.idempotencyKeys.get(tenantId);
    if (!tenantKeys) {
      tenantKeys = new Map();
      this.idempotencyKeys.set(tenantId, tenantKeys);
    }
    tenantKeys.set(key, Date.now());
  }

  /**
   * Clean up expired idempotency keys to prevent memory growth
   * Call this periodically in long-running processes
   */
  cleanupExpiredIdempotencyKeys(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [tenantId, tenantKeys] of this.idempotencyKeys) {
      for (const [key, timestamp] of tenantKeys) {
        if (now - timestamp > InMemoryViolationStore.IDEMPOTENCY_KEY_TTL_MS) {
          tenantKeys.delete(key);
          cleaned++;
        }
      }
      // Clean up empty tenant maps
      if (tenantKeys.size === 0) {
        this.idempotencyKeys.delete(tenantId);
      }
    }

    return cleaned;
  }

  async aggregate(
    tenantId: string,
    options: {
      groupBy: 'type' | 'actor' | 'resource' | 'type+actor' | 'type+resource';
      startTime?: Date;
      endTime?: Date;
      types?: ViolationType[];
      minCount?: number;
    }
  ): Promise<ViolationAggregation[]> {
    let violations = Array.from(this.violations.values()).filter(
      (v) => v.tenantId === tenantId
    );

    // Apply time filters
    if (options.startTime) {
      violations = violations.filter((v) => v.detectedAt >= options.startTime!);
    }
    if (options.endTime) {
      violations = violations.filter((v) => v.detectedAt <= options.endTime!);
    }
    if (options.types?.length) {
      violations = violations.filter((v) => options.types!.includes(v.type));
    }

    // Group violations
    const groups = new Map<string, Violation[]>();
    for (const v of violations) {
      let key: string;
      switch (options.groupBy) {
        case 'type':
          key = v.type;
          break;
        case 'actor':
          key = v.actor.id;
          break;
        case 'resource':
          key = `${v.resource.type}:${v.resource.id}`;
          break;
        case 'type+actor':
          key = `${v.type}:${v.actor.id}`;
          break;
        case 'type+resource':
          key = `${v.type}:${v.resource.type}:${v.resource.id}`;
          break;
      }

      const group = groups.get(key) ?? [];
      group.push(v);
      groups.set(key, group);
    }

    // Build aggregations
    const aggregations: ViolationAggregation[] = [];
    for (const [key, group] of groups) {
      if (options.minCount && group.length < options.minCount) continue;

      const uniqueActors = new Set(group.map((v) => v.actor.id)).size;
      const uniqueResources = new Set(group.map((v) => `${v.resource.type}:${v.resource.id}`)).size;
      const maxSeverity = group.reduce((max, v) => {
        return getSeverityWeight(v.severity) > getSeverityWeight(max)
          ? v.severity
          : max;
      }, 'low' as ViolationSeverity);

      const sorted = [...group].sort(
        (a, b) => a.detectedAt.getTime() - b.detectedAt.getTime()
      );

      aggregations.push({
        key,
        type: group[0].type,
        count: group.length,
        firstSeen: sorted[0].detectedAt,
        lastSeen: sorted[sorted.length - 1].detectedAt,
        uniqueActors,
        uniqueResources,
        maxSeverity,
        sampleIds: sorted.slice(0, 5).map((v) => v.id),
      });
    }

    // Sort by count descending
    aggregations.sort((a, b) => b.count - a.count);

    return aggregations;
  }

  async getRecent(
    tenantId: string,
    options: {
      type: ViolationType;
      actorId?: string;
      resourceId?: string;
      windowMs: number;
      limit?: number;
    }
  ): Promise<Violation[]> {
    const cutoff = new Date(Date.now() - options.windowMs);
    let results = Array.from(this.violations.values()).filter(
      (v) =>
        v.tenantId === tenantId &&
        v.type === options.type &&
        v.detectedAt >= cutoff
    );

    if (options.actorId) {
      results = results.filter((v) => v.actor.id === options.actorId);
    }
    if (options.resourceId) {
      results = results.filter((v) => v.resource.id === options.resourceId);
    }

    // Sort by most recent first
    results.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async deleteOlderThan(tenantId: string, date: Date): Promise<number> {
    let deleted = 0;
    for (const [id, violation] of this.violations) {
      if (violation.tenantId === tenantId && violation.detectedAt < date) {
        this.violations.delete(id);
        deleted++;
      }
    }
    return deleted;
  }

  async clear(tenantId?: string): Promise<void> {
    if (tenantId) {
      for (const [id, violation] of this.violations) {
        if (violation.tenantId === tenantId) {
          this.violations.delete(id);
        }
      }
      this.idempotencyKeys.delete(tenantId);
    } else {
      this.violations.clear();
      this.idempotencyKeys.clear();
    }
  }
}

// =============================================================================
// Violation Detector Configuration
// =============================================================================

/**
 * Configuration for the violation detector
 */
export interface ViolationDetectorConfig {
  /** Violation store instance */
  store: ViolationStore;

  /** Deduplication window in milliseconds (default: 5 minutes) */
  deduplicationWindowMs?: number;

  /** Minimum interval between same violations (default: 1 minute) */
  minViolationIntervalMs?: number;

  /** Enable pattern aggregation (default: true) */
  enableAggregation?: boolean;

  /** Aggregation window in milliseconds (default: 1 hour) */
  aggregationWindowMs?: number;

  /** Threshold for pattern alert (default: 5 violations) */
  patternThreshold?: number;

  /** Auto-escalate critical violations (default: false) */
  autoEscalateCritical?: boolean;

  /** Callback when violation is detected */
  onViolationDetected?: (violation: Violation) => void | Promise<void>;

  /** Callback when pattern is detected */
  onPatternDetected?: (aggregation: ViolationAggregation) => void | Promise<void>;
}

// =============================================================================
// Detection Context
// =============================================================================

/**
 * Context for policy evaluation detection
 */
export interface PolicyEvaluationContext {
  tenantId: string;
  actor: ViolationActor;
  resource: ViolationResource;
  action: ViolationAction;
  evaluationResult: PolicyEvaluationResult;
  policyId?: string;
  policyName?: string;
  auditLogEntryId?: string;
}

/**
 * Context for approval bypass detection
 */
export interface ApprovalBypassContext {
  tenantId: string;
  actor: ViolationActor;
  resource: ViolationResource;
  action: ViolationAction;
  workflowId: string;
  workflowName?: string;
  bypassMethod: 'skip' | 'force' | 'expired' | 'revoked' | 'insufficient' | 'unauthorized' | 'other';
  requiredApprovers?: string[];
  auditLogEntryId?: string;
}

/**
 * Context for rate limit detection
 */
export interface RateLimitContext {
  tenantId: string;
  actor: ViolationActor;
  resource: ViolationResource;
  action: ViolationAction;
  limitType: 'rate' | 'quota' | 'concurrency' | 'size' | 'count' | 'cost' | 'other';
  limitName: string;
  limit: number;
  actual: number;
  unit?: string;
  window?: { duration: number; unit: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' };
  auditLogEntryId?: string;
}

/**
 * Context for anomaly detection
 */
export interface AnomalyContext {
  tenantId: string;
  actor: ViolationActor;
  resource: ViolationResource;
  action: ViolationAction;
  anomalyType: 'behavioral' | 'temporal' | 'volumetric' | 'geographic' | 'sequential' | 'statistical' | 'signature' | 'other';
  confidence: number;
  score: number;
  baseline?: unknown;
  observed?: unknown;
  detectionModel?: string;
  auditLogEntryId?: string;
}

// =============================================================================
// Violation Detector Service
// =============================================================================

/**
 * Detection result
 */
export interface DetectionResult {
  /** Whether a new violation was created */
  created: boolean;
  /** The violation (new or existing duplicate) */
  violation?: Violation;
  /** Whether this was a duplicate */
  deduplicated: boolean;
  /** Idempotency key used */
  idempotencyKey: string;
  /** Pattern detected (if aggregation enabled) */
  patternDetected?: ViolationAggregation;
}

/**
 * Violation detector service
 */
export class ViolationDetector {
  private readonly store: ViolationStore;
  private readonly config: Required<Omit<ViolationDetectorConfig, 'store' | 'onViolationDetected' | 'onPatternDetected'>> & {
    onViolationDetected?: (violation: Violation) => void | Promise<void>;
    onPatternDetected?: (aggregation: ViolationAggregation) => void | Promise<void>;
  };

  constructor(config: ViolationDetectorConfig) {
    this.store = config.store;
    this.config = {
      deduplicationWindowMs: config.deduplicationWindowMs ?? 5 * 60 * 1000, // 5 minutes
      minViolationIntervalMs: config.minViolationIntervalMs ?? 60 * 1000, // 1 minute
      enableAggregation: config.enableAggregation ?? true,
      aggregationWindowMs: config.aggregationWindowMs ?? 60 * 60 * 1000, // 1 hour
      patternThreshold: config.patternThreshold ?? 5,
      autoEscalateCritical: config.autoEscalateCritical ?? false,
      onViolationDetected: config.onViolationDetected,
      onPatternDetected: config.onPatternDetected,
    };
  }

  /**
   * Detect violation from policy evaluation result
   */
  async detectFromPolicyEvaluation(context: PolicyEvaluationContext): Promise<DetectionResult> {
    const { evaluationResult } = context;

    // Only create violations for denied actions
    if (evaluationResult.allowed) {
      return {
        created: false,
        deduplicated: false,
        idempotencyKey: '',
      };
    }

    // Build idempotency key
    const idempotencyKey = this.buildIdempotencyKey(
      'policy-denied',
      context.tenantId,
      context.actor.id,
      context.resource.id,
      context.action.type,
      evaluationResult.matchedRule?.id
    );

    // Check for deduplication
    const isDuplicate = await this.store.existsByIdempotencyKey(
      context.tenantId,
      idempotencyKey
    );

    if (isDuplicate) {
      return {
        created: false,
        deduplicated: true,
        idempotencyKey,
      };
    }

    // Check minimum interval
    const recentViolations = await this.store.getRecent(context.tenantId, {
      type: 'policy-denied',
      actorId: context.actor.id,
      resourceId: context.resource.id,
      windowMs: this.config.minViolationIntervalMs,
      limit: 1,
    });

    if (recentViolations.length > 0) {
      return {
        created: false,
        deduplicated: true,
        idempotencyKey,
        violation: recentViolations[0],
      };
    }

    // Create the violation
    const details: PolicyDeniedDetails = {
      policyId: context.policyId ?? evaluationResult.matchedRule?.policyId ?? 'unknown',
      policyName: context.policyName,
      ruleId: evaluationResult.matchedRule?.id ?? 'unknown',
      ruleDescription: evaluationResult.reason,
      effect: evaluationResult.effect,
    };

    const violation = createPolicyDeniedViolation(
      context.tenantId,
      context.actor,
      context.resource,
      context.action,
      details,
      {
        auditLogEntries: context.auditLogEntryId ? [context.auditLogEntryId] : undefined,
      }
    );

    // Store the violation
    await this.store.create(violation);

    // Register idempotency key
    if (this.store instanceof InMemoryViolationStore) {
      this.store.registerIdempotencyKey(context.tenantId, idempotencyKey);
    }

    // Auto-escalate if critical
    if (this.config.autoEscalateCritical && violation.severity === 'critical') {
      await this.store.updateStatus(violation.id, 'escalated', {
        updatedBy: 'system',
      });
      violation.status = 'escalated';
    }

    // Notify callback
    if (this.config.onViolationDetected) {
      await this.config.onViolationDetected(violation);
    }

    // Check for patterns
    const patternDetected = await this.checkForPatterns(context.tenantId, violation);

    return {
      created: true,
      violation,
      deduplicated: false,
      idempotencyKey,
      patternDetected,
    };
  }

  /**
   * Detect violation from approval bypass
   */
  async detectFromApprovalBypass(context: ApprovalBypassContext): Promise<DetectionResult> {
    const idempotencyKey = this.buildIdempotencyKey(
      'approval-bypassed',
      context.tenantId,
      context.actor.id,
      context.resource.id,
      context.action.type,
      context.workflowId
    );

    // Check for deduplication
    const isDuplicate = await this.store.existsByIdempotencyKey(
      context.tenantId,
      idempotencyKey
    );

    if (isDuplicate) {
      return {
        created: false,
        deduplicated: true,
        idempotencyKey,
      };
    }

    const details: ApprovalBypassedDetails = {
      workflowId: context.workflowId,
      workflowName: context.workflowName,
      requiredApprovers: context.requiredApprovers,
      bypassMethod: context.bypassMethod,
    };

    const violation = createApprovalBypassedViolation(
      context.tenantId,
      context.actor,
      context.resource,
      context.action,
      details,
      {
        auditLogEntries: context.auditLogEntryId ? [context.auditLogEntryId] : undefined,
      }
    );

    await this.store.create(violation);

    if (this.store instanceof InMemoryViolationStore) {
      this.store.registerIdempotencyKey(context.tenantId, idempotencyKey);
    }

    // Approval bypasses are critical - always escalate
    if (this.config.autoEscalateCritical) {
      await this.store.updateStatus(violation.id, 'escalated', {
        updatedBy: 'system',
      });
      violation.status = 'escalated';
    }

    if (this.config.onViolationDetected) {
      await this.config.onViolationDetected(violation);
    }

    const patternDetected = await this.checkForPatterns(context.tenantId, violation);

    return {
      created: true,
      violation,
      deduplicated: false,
      idempotencyKey,
      patternDetected,
    };
  }

  /**
   * Detect violation from rate limit exceeded
   */
  async detectFromRateLimit(context: RateLimitContext): Promise<DetectionResult> {
    const idempotencyKey = this.buildIdempotencyKey(
      'limit-exceeded',
      context.tenantId,
      context.actor.id,
      context.limitName,
      context.limitType
    );

    // Check for deduplication (with shorter window for rate limits)
    const isDuplicate = await this.store.existsByIdempotencyKey(
      context.tenantId,
      idempotencyKey
    );

    if (isDuplicate) {
      // For rate limits, also check the minimum interval
      const recentViolations = await this.store.getRecent(context.tenantId, {
        type: 'limit-exceeded',
        actorId: context.actor.id,
        windowMs: this.config.minViolationIntervalMs,
        limit: 1,
      });

      if (recentViolations.length > 0) {
        return {
          created: false,
          deduplicated: true,
          idempotencyKey,
          violation: recentViolations[0],
        };
      }
    }

    const details: LimitExceededDetails = {
      limitType: context.limitType,
      limitName: context.limitName,
      limit: context.limit,
      actual: context.actual,
      unit: context.unit,
      window: context.window,
    };

    const violation = createLimitExceededViolation(
      context.tenantId,
      context.actor,
      context.resource,
      context.action,
      details,
      {
        auditLogEntries: context.auditLogEntryId ? [context.auditLogEntryId] : undefined,
      }
    );

    await this.store.create(violation);

    if (this.store instanceof InMemoryViolationStore) {
      this.store.registerIdempotencyKey(context.tenantId, idempotencyKey);
    }

    if (this.config.onViolationDetected) {
      await this.config.onViolationDetected(violation);
    }

    const patternDetected = await this.checkForPatterns(context.tenantId, violation);

    return {
      created: true,
      violation,
      deduplicated: false,
      idempotencyKey,
      patternDetected,
    };
  }

  /**
   * Detect violation from anomaly detection
   */
  async detectFromAnomaly(context: AnomalyContext): Promise<DetectionResult> {
    const idempotencyKey = this.buildIdempotencyKey(
      'anomaly-detected',
      context.tenantId,
      context.actor.id,
      context.resource.id,
      context.anomalyType,
      String(Math.round(context.score))
    );

    const isDuplicate = await this.store.existsByIdempotencyKey(
      context.tenantId,
      idempotencyKey
    );

    if (isDuplicate) {
      return {
        created: false,
        deduplicated: true,
        idempotencyKey,
      };
    }

    const details: AnomalyDetectedDetails = {
      anomalyType: context.anomalyType,
      confidence: context.confidence,
      score: context.score,
      baseline: context.baseline,
      observed: context.observed,
      detectionModel: context.detectionModel,
    };

    const violation = createAnomalyDetectedViolation(
      context.tenantId,
      context.actor,
      context.resource,
      context.action,
      details,
      {
        auditLogEntries: context.auditLogEntryId ? [context.auditLogEntryId] : undefined,
      }
    );

    await this.store.create(violation);

    if (this.store instanceof InMemoryViolationStore) {
      this.store.registerIdempotencyKey(context.tenantId, idempotencyKey);
    }

    // High-confidence anomalies with high scores get escalated
    if (this.config.autoEscalateCritical && context.confidence >= 0.9 && context.score >= 90) {
      await this.store.updateStatus(violation.id, 'escalated', {
        updatedBy: 'system',
      });
      violation.status = 'escalated';
    }

    if (this.config.onViolationDetected) {
      await this.config.onViolationDetected(violation);
    }

    const patternDetected = await this.checkForPatterns(context.tenantId, violation);

    return {
      created: true,
      violation,
      deduplicated: false,
      idempotencyKey,
      patternDetected,
    };
  }

  /**
   * Build idempotency key from components
   */
  private buildIdempotencyKey(...parts: (string | undefined)[]): string {
    const filtered = parts.filter(Boolean).join(':');
    // Hash for consistent key length
    return createHash('sha256').update(filtered).digest('hex').substring(0, 32);
  }

  /**
   * Check for violation patterns
   */
  private async checkForPatterns(
    tenantId: string,
    violation: Violation
  ): Promise<ViolationAggregation | undefined> {
    if (!this.config.enableAggregation) return undefined;

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - this.config.aggregationWindowMs);

    // Check for patterns by type + actor
    const actorPatterns = await this.store.aggregate(tenantId, {
      groupBy: 'type+actor',
      startTime,
      endTime,
      types: [violation.type],
      minCount: this.config.patternThreshold,
    });

    // Find pattern for this actor
    const actorPattern = actorPatterns.find(
      (p) => p.key === `${violation.type}:${violation.actor.id}`
    );

    if (actorPattern && this.config.onPatternDetected) {
      await this.config.onPatternDetected(actorPattern);
    }

    return actorPattern;
  }

  /**
   * Get the violation store
   */
  getStore(): ViolationStore {
    return this.store;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an in-memory violation store
 */
export function createInMemoryViolationStore(): InMemoryViolationStore {
  return new InMemoryViolationStore();
}

/**
 * Create a violation detector with default configuration
 */
export function createViolationDetector(
  config: ViolationDetectorConfig
): ViolationDetector {
  return new ViolationDetector(config);
}

// =============================================================================
// Singleton Management
// =============================================================================

let violationDetectorInstance: ViolationDetector | null = null;

/**
 * Initialize the global violation detector
 */
export function initializeViolationDetector(
  config: ViolationDetectorConfig
): ViolationDetector {
  violationDetectorInstance = new ViolationDetector(config);
  return violationDetectorInstance;
}

/**
 * Get the global violation detector
 */
export function getViolationDetector(): ViolationDetector {
  if (!violationDetectorInstance) {
    throw new Error('ViolationDetector not initialized. Call initializeViolationDetector first.');
  }
  return violationDetectorInstance;
}

/**
 * Set the global violation detector
 */
export function setViolationDetector(detector: ViolationDetector): void {
  violationDetectorInstance = detector;
}

/**
 * Reset the global violation detector
 */
export function resetViolationDetector(): void {
  violationDetectorInstance = null;
}
