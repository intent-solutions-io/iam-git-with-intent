/**
 * Audit Query Service
 *
 * Epic E: RBAC & Governance
 * Provides comprehensive audit trail querying, analysis, and anomaly detection.
 *
 * @module @gwi/core/governance/audit-query
 */

import {
  type SecurityAuditStore,
  type SecurityAuditEvent,
  type AuditQueryOptions,
  getSecurityAuditStore,
} from '../security/audit/index.js';
import { createLogger } from '../telemetry/index.js';

const logger = createLogger('audit-query');

// =============================================================================
// Query Filters
// =============================================================================

/**
 * Extended audit query filters
 */
export interface AuditQueryFilters extends AuditQueryOptions {
  /** Filter by user ID */
  userId?: string;
  /** Filter by tenant ID (required for most queries) */
  tenantId?: string;
  /** Filter by action pattern (supports wildcards) */
  actionPattern?: string;
  /** Filter by resource type */
  resourceType?: string;
  /** Filter by resource ID */
  resourceId?: string;
  /** Filter by outcome */
  outcome?: 'success' | 'failure' | 'denied' | 'error';
  /** Filter by severity (for categorization) */
  severity?: 'critical' | 'high' | 'medium' | 'low';
  /** Start date */
  startDate?: Date;
  /** End date */
  endDate?: Date;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Include trace correlation */
  includeTrace?: boolean;
}

/**
 * Query result with metadata
 */
export interface AuditQueryResult {
  events: SecurityAuditEvent[];
  total: number;
  filtered: number;
  hasMore: boolean;
  nextOffset?: number;
}

/**
 * Aggregate statistics
 */
export interface AuditStatistics {
  totalEvents: number;
  byOutcome: Record<string, number>;
  byEventType: Record<string, number>;
  byActor: Record<string, number>;
  byResource: Record<string, number>;
  timeRange: {
    start: Date;
    end: Date;
  };
  topEvents: Array<{ eventType: string; count: number }>;
  topActors: Array<{ actorId: string; count: number }>;
  failureRate: number;
  denialRate: number;
}

// =============================================================================
// Audit Query Service
// =============================================================================

/**
 * Service for querying and analyzing audit events
 */
export class AuditQueryService {
  private store: SecurityAuditStore;

  constructor(store?: SecurityAuditStore) {
    this.store = store || getSecurityAuditStore();
  }

  /**
   * Query audit trail with comprehensive filters
   */
  async queryAuditTrail(filters: AuditQueryFilters): Promise<AuditQueryResult> {
    logger.debug('Querying audit trail', { filters });

    if (!filters.tenantId) {
      throw new Error('tenantId is required for audit queries');
    }

    // Build query options
    const queryOptions: AuditQueryOptions = {
      eventType: filters.eventType,
      outcome: filters.outcome,
      actorId: filters.userId,
      resourceType: filters.resourceType,
      resourceId: filters.resourceId,
      startTime: filters.startDate,
      endTime: filters.endDate,
      limit: filters.limit,
      offset: filters.offset,
      orderBy: 'desc', // Most recent first
    };

    // Execute query
    const events = await this.store.listTenantEvents(filters.tenantId, queryOptions);

    // Apply additional filters that aren't in base store
    let filtered = events;
    if (filters.actionPattern) {
      const pattern = this.convertWildcardToRegex(filters.actionPattern);
      filtered = filtered.filter((e) =>
        e.data?.action ? pattern.test(String(e.data.action)) : false
      );
    }

    const total = await this.store.countTenantEvents(filters.tenantId, {
      eventType: filters.eventType,
      outcome: filters.outcome,
      startTime: filters.startDate,
      endTime: filters.endDate,
    });

    const hasMore = filters.limit
      ? filtered.length >= filters.limit && filtered.length < total
      : false;

    const nextOffset = hasMore && filters.limit ? (filters.offset || 0) + filters.limit : undefined;

    return {
      events: filtered,
      total,
      filtered: filtered.length,
      hasMore,
      nextOffset,
    };
  }

  /**
   * Get audit summary with aggregated statistics
   */
  async getAuditSummary(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AuditStatistics> {
    logger.debug('Generating audit summary', { tenantId, startDate, endDate });

    const events = await this.store.listTenantEvents(tenantId, {
      startTime: startDate,
      endTime: endDate,
    });

    // Aggregate statistics
    const byOutcome: Record<string, number> = {};
    const byEventType: Record<string, number> = {};
    const byActor: Record<string, number> = {};
    const byResource: Record<string, number> = {};

    for (const event of events) {
      // By outcome
      byOutcome[event.outcome] = (byOutcome[event.outcome] || 0) + 1;

      // By event type
      byEventType[event.eventType] = (byEventType[event.eventType] || 0) + 1;

      // By actor
      byActor[event.actor.id] = (byActor[event.actor.id] || 0) + 1;

      // By resource type
      if (event.resource?.type) {
        byResource[event.resource.type] = (byResource[event.resource.type] || 0) + 1;
      }
    }

    // Calculate top events and actors
    const topEvents = Object.entries(byEventType)
      .map(([eventType, count]) => ({ eventType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topActors = Object.entries(byActor)
      .map(([actorId, count]) => ({ actorId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate rates
    const totalEvents = events.length;
    const failureEvents = byOutcome.failure || 0;
    const denialEvents = byOutcome.denied || 0;

    return {
      totalEvents,
      byOutcome,
      byEventType,
      byActor,
      byResource,
      timeRange: { start: startDate, end: endDate },
      topEvents,
      topActors,
      failureRate: totalEvents > 0 ? (failureEvents / totalEvents) * 100 : 0,
      denialRate: totalEvents > 0 ? (denialEvents / totalEvents) * 100 : 0,
    };
  }

  /**
   * Get user activity log
   */
  async getUserActivity(
    userId: string,
    tenantId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<SecurityAuditEvent[]> {
    logger.debug('Fetching user activity', { userId, tenantId });

    return this.store.listTenantEvents(tenantId, {
      actorId: userId,
      startTime: options?.startDate,
      endTime: options?.endDate,
      limit: options?.limit || 100,
      orderBy: 'desc',
    });
  }

  /**
   * Get resource change history
   */
  async getResourceHistory(
    resourceId: string,
    tenantId: string,
    options?: {
      resourceType?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<SecurityAuditEvent[]> {
    logger.debug('Fetching resource history', { resourceId, tenantId });

    return this.store.listTenantEvents(tenantId, {
      resourceId,
      resourceType: options?.resourceType,
      startTime: options?.startDate,
      endTime: options?.endDate,
      limit: options?.limit || 100,
      orderBy: 'desc',
    });
  }

  /**
   * Detect unusual access patterns and anomalies
   */
  async detectAnomalies(
    tenantId: string,
    options?: {
      lookbackDays?: number;
      minThreshold?: number;
    }
  ): Promise<AnomalyDetectionResult> {
    const lookbackDays = options?.lookbackDays || 7;
    const minThreshold = options?.minThreshold || 5;

    logger.debug('Detecting anomalies', { tenantId, lookbackDays, minThreshold });

    const startDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    const endDate = new Date();

    const events = await this.store.listTenantEvents(tenantId, {
      startTime: startDate,
      endTime: endDate,
    });

    const anomalies: Anomaly[] = [];

    // Detect high failure rates
    const failuresByActor = new Map<string, number>();
    const totalByActor = new Map<string, number>();

    for (const event of events) {
      const actorId = event.actor.id;
      totalByActor.set(actorId, (totalByActor.get(actorId) || 0) + 1);

      if (event.outcome === 'failure' || event.outcome === 'error') {
        failuresByActor.set(actorId, (failuresByActor.get(actorId) || 0) + 1);
      }
    }

    for (const [actorId, failures] of Array.from(failuresByActor)) {
      const total = totalByActor.get(actorId) || 0;
      const failureRate = (failures / total) * 100;

      if (failures >= minThreshold && failureRate >= 20) {
        anomalies.push({
          type: 'high_failure_rate',
          severity: failureRate >= 50 ? 'critical' : 'high',
          description: `User ${actorId} has ${failureRate.toFixed(1)}% failure rate (${failures}/${total})`,
          actorId,
          metadata: {
            failureRate,
            failures,
            total,
          },
        });
      }
    }

    // Detect access denials
    const denialsByActor = new Map<string, number>();

    for (const event of events) {
      if (event.outcome === 'denied') {
        const actorId = event.actor.id;
        denialsByActor.set(actorId, (denialsByActor.get(actorId) || 0) + 1);
      }
    }

    for (const [actorId, denials] of Array.from(denialsByActor)) {
      if (denials >= minThreshold) {
        anomalies.push({
          type: 'repeated_access_denials',
          severity: denials >= 10 ? 'critical' : 'high',
          description: `User ${actorId} has ${denials} access denials`,
          actorId,
          metadata: {
            denials,
          },
        });
      }
    }

    // Detect unusual times (access outside business hours)
    const offHoursEvents = events.filter((e) => {
      const hour = e.timestamp.getHours();
      return hour < 6 || hour > 22; // Before 6am or after 10pm
    });

    if (offHoursEvents.length >= minThreshold) {
      const byActor = new Map<string, number>();
      for (const event of offHoursEvents) {
        byActor.set(event.actor.id, (byActor.get(event.actor.id) || 0) + 1);
      }

      for (const [actorId, count] of Array.from(byActor)) {
        if (count >= minThreshold) {
          anomalies.push({
            type: 'off_hours_access',
            severity: 'medium',
            description: `User ${actorId} accessed system ${count} times outside business hours`,
            actorId,
            metadata: {
              count,
            },
          });
        }
      }
    }

    // Detect rapid access patterns (potential brute force)
    const actorEventTimes = new Map<string, Date[]>();
    for (const event of events) {
      const times = actorEventTimes.get(event.actor.id) || [];
      times.push(event.timestamp);
      actorEventTimes.set(event.actor.id, times);
    }

    for (const [actorId, times] of Array.from(actorEventTimes)) {
      // Sort times
      times.sort((a, b) => a.getTime() - b.getTime());

      // Check for bursts (10+ events within 1 minute)
      for (let i = 0; i < times.length - 10; i++) {
        const windowStart = times[i];
        const windowEnd = times[i + 9];
        const diffMs = windowEnd.getTime() - windowStart.getTime();

        if (diffMs < 60000) {
          // 10 events in less than 1 minute
          anomalies.push({
            type: 'rapid_access_pattern',
            severity: 'high',
            description: `User ${actorId} performed 10 actions within ${(diffMs / 1000).toFixed(0)}s`,
            actorId,
            metadata: {
              burstDurationMs: diffMs,
              eventCount: 10,
            },
          });
          break; // Only report once per user
        }
      }
    }

    return {
      anomalies,
      totalAnomalies: anomalies.length,
      byType: this.groupBy(anomalies, (a) => a.type),
      bySeverity: this.groupBy(anomalies, (a) => a.severity),
      period: {
        start: startDate,
        end: endDate,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------

  /**
   * Convert wildcard pattern to regex
   */
  private convertWildcardToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regex = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${regex}$`, 'i');
  }

  /**
   * Group items by key function
   */
  private groupBy<T, K extends string>(
    items: T[],
    keyFn: (item: T) => K
  ): Record<K, number> {
    const result = {} as Record<K, number>;
    for (const item of items) {
      const key = keyFn(item);
      result[key] = (result[key] || 0) + 1;
    }
    return result;
  }
}

// =============================================================================
// Anomaly Detection Types
// =============================================================================

/**
 * Anomaly type
 */
export type AnomalyType =
  | 'high_failure_rate'
  | 'repeated_access_denials'
  | 'off_hours_access'
  | 'rapid_access_pattern'
  | 'unusual_resource_access'
  | 'privilege_escalation_attempt';

/**
 * Anomaly severity
 */
export type AnomalySeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Detected anomaly
 */
export interface Anomaly {
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  actorId?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Anomaly detection result
 */
export interface AnomalyDetectionResult {
  anomalies: Anomaly[];
  totalAnomalies: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  period: {
    start: Date;
    end: Date;
  };
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create audit query service
 */
export function createAuditQueryService(store?: SecurityAuditStore): AuditQueryService {
  return new AuditQueryService(store);
}
