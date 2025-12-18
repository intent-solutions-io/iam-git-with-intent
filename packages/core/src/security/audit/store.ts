/**
 * Security Audit Store Interface
 *
 * Phase 24: Security & Compliance Hardening
 *
 * Defines the audit store interface for security events.
 * All implementations must be append-only (no updates or deletes).
 *
 * @module @gwi/core/security/audit/store
 */

import type { SecurityAuditEvent, SecurityAuditEventType, CreateSecurityAuditEvent } from './types.js';

// =============================================================================
// Store Interface
// =============================================================================

/**
 * Query options for listing events
 */
export interface AuditQueryOptions {
  /** Filter by event type */
  eventType?: SecurityAuditEventType;
  /** Filter by outcome */
  outcome?: 'success' | 'failure' | 'denied' | 'error';
  /** Filter by actor ID */
  actorId?: string;
  /** Filter by resource type */
  resourceType?: string;
  /** Filter by resource ID */
  resourceId?: string;
  /** Start timestamp */
  startTime?: Date;
  /** End timestamp */
  endTime?: Date;
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Order by timestamp (default: desc) */
  orderBy?: 'asc' | 'desc';
}

/**
 * Security audit store interface
 *
 * IMPORTANT: Implementations must be append-only.
 * Events cannot be modified or deleted once created.
 */
export interface SecurityAuditStore {
  /**
   * Create a new audit event (append-only)
   */
  createEvent(event: CreateSecurityAuditEvent): Promise<SecurityAuditEvent>;

  /**
   * Get event by ID
   */
  getEvent(eventId: string): Promise<SecurityAuditEvent | null>;

  /**
   * List events for a tenant
   */
  listTenantEvents(
    tenantId: string,
    options?: AuditQueryOptions
  ): Promise<SecurityAuditEvent[]>;

  /**
   * Count events for a tenant (for analytics/dashboards)
   */
  countTenantEvents(
    tenantId: string,
    options?: Pick<AuditQueryOptions, 'eventType' | 'outcome' | 'startTime' | 'endTime'>
  ): Promise<number>;

  /**
   * List events by trace ID (for correlation)
   */
  listByTraceId(traceId: string): Promise<SecurityAuditEvent[]>;

  /**
   * List events by run ID (for run audit trail)
   */
  listByRunId(runId: string): Promise<SecurityAuditEvent[]>;
}

// =============================================================================
// In-Memory Implementation (for testing/dev)
// =============================================================================

/**
 * In-memory implementation of SecurityAuditStore
 */
export class InMemorySecurityAuditStore implements SecurityAuditStore {
  private events = new Map<string, SecurityAuditEvent>();

  async createEvent(input: CreateSecurityAuditEvent): Promise<SecurityAuditEvent> {
    const event: SecurityAuditEvent = {
      ...input,
      id: `saud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
    };

    this.events.set(event.id, event);
    return event;
  }

  async getEvent(eventId: string): Promise<SecurityAuditEvent | null> {
    return this.events.get(eventId) || null;
  }

  async listTenantEvents(
    tenantId: string,
    options?: AuditQueryOptions
  ): Promise<SecurityAuditEvent[]> {
    let results = Array.from(this.events.values())
      .filter((e) => e.tenantId === tenantId);

    // Apply filters
    if (options?.eventType) {
      results = results.filter((e) => e.eventType === options.eventType);
    }
    if (options?.outcome) {
      results = results.filter((e) => e.outcome === options.outcome);
    }
    if (options?.actorId) {
      results = results.filter((e) => e.actor.id === options.actorId);
    }
    if (options?.resourceType) {
      results = results.filter((e) => e.resource?.type === options.resourceType);
    }
    if (options?.resourceId) {
      results = results.filter((e) => e.resource?.id === options.resourceId);
    }
    if (options?.startTime) {
      results = results.filter((e) => e.timestamp >= options.startTime!);
    }
    if (options?.endTime) {
      results = results.filter((e) => e.timestamp <= options.endTime!);
    }

    // Sort
    const orderBy = options?.orderBy ?? 'desc';
    results.sort((a, b) => {
      const diff = a.timestamp.getTime() - b.timestamp.getTime();
      return orderBy === 'asc' ? diff : -diff;
    });

    // Pagination
    if (options?.offset) {
      results = results.slice(options.offset);
    }
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async countTenantEvents(
    tenantId: string,
    options?: Pick<AuditQueryOptions, 'eventType' | 'outcome' | 'startTime' | 'endTime'>
  ): Promise<number> {
    let results = Array.from(this.events.values())
      .filter((e) => e.tenantId === tenantId);

    if (options?.eventType) {
      results = results.filter((e) => e.eventType === options.eventType);
    }
    if (options?.outcome) {
      results = results.filter((e) => e.outcome === options.outcome);
    }
    if (options?.startTime) {
      results = results.filter((e) => e.timestamp >= options.startTime!);
    }
    if (options?.endTime) {
      results = results.filter((e) => e.timestamp <= options.endTime!);
    }

    return results.length;
  }

  async listByTraceId(traceId: string): Promise<SecurityAuditEvent[]> {
    return Array.from(this.events.values())
      .filter((e) => e.traceId === traceId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async listByRunId(runId: string): Promise<SecurityAuditEvent[]> {
    return Array.from(this.events.values())
      .filter((e) => e.runId === runId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // Testing helpers
  clear(): void {
    this.events.clear();
  }

  getAll(): SecurityAuditEvent[] {
    return Array.from(this.events.values());
  }
}
