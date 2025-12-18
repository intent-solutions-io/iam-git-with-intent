/**
 * Phase 63: Audit Logging
 *
 * Comprehensive audit trail system:
 * - Structured audit events
 * - Tamper-evident logging
 * - Compliance reporting
 * - Event correlation
 * - Retention policies
 *
 * @module @gwi/core/audit-logging
 */

import { z } from 'zod';

// =============================================================================
// AUDIT EVENT TYPES
// =============================================================================

export const AuditEventCategories = {
  AUTH: 'auth',
  DATA: 'data',
  CONFIG: 'config',
  ADMIN: 'admin',
  API: 'api',
  SECURITY: 'security',
  BILLING: 'billing',
  SYSTEM: 'system',
} as const;

export type AuditEventCategory = (typeof AuditEventCategories)[keyof typeof AuditEventCategories];

export const AuditEventTypes = {
  // Auth events
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILURE: 'auth.login.failure',
  LOGOUT: 'auth.logout',
  TOKEN_ISSUED: 'auth.token.issued',
  TOKEN_REVOKED: 'auth.token.revoked',
  PASSWORD_CHANGED: 'auth.password.changed',
  MFA_ENABLED: 'auth.mfa.enabled',
  MFA_DISABLED: 'auth.mfa.disabled',

  // Data events
  DATA_READ: 'data.read',
  DATA_CREATE: 'data.create',
  DATA_UPDATE: 'data.update',
  DATA_DELETE: 'data.delete',
  DATA_EXPORT: 'data.export',
  DATA_IMPORT: 'data.import',

  // Config events
  CONFIG_READ: 'config.read',
  CONFIG_UPDATE: 'config.update',
  FEATURE_ENABLED: 'config.feature.enabled',
  FEATURE_DISABLED: 'config.feature.disabled',

  // Admin events
  USER_CREATED: 'admin.user.created',
  USER_UPDATED: 'admin.user.updated',
  USER_DELETED: 'admin.user.deleted',
  ROLE_ASSIGNED: 'admin.role.assigned',
  ROLE_REVOKED: 'admin.role.revoked',
  PERMISSION_GRANTED: 'admin.permission.granted',
  PERMISSION_REVOKED: 'admin.permission.revoked',

  // API events
  API_KEY_CREATED: 'api.key.created',
  API_KEY_ROTATED: 'api.key.rotated',
  API_KEY_REVOKED: 'api.key.revoked',
  API_RATE_LIMITED: 'api.rate.limited',
  API_QUOTA_EXCEEDED: 'api.quota.exceeded',

  // Security events
  SUSPICIOUS_ACTIVITY: 'security.suspicious',
  ACCESS_DENIED: 'security.access.denied',
  IP_BLOCKED: 'security.ip.blocked',
  BRUTE_FORCE_DETECTED: 'security.bruteforce',

  // Billing events
  SUBSCRIPTION_CREATED: 'billing.subscription.created',
  SUBSCRIPTION_UPDATED: 'billing.subscription.updated',
  SUBSCRIPTION_CANCELLED: 'billing.subscription.cancelled',
  PAYMENT_SUCCESS: 'billing.payment.success',
  PAYMENT_FAILED: 'billing.payment.failed',

  // System events
  SYSTEM_STARTUP: 'system.startup',
  SYSTEM_SHUTDOWN: 'system.shutdown',
  MAINTENANCE_STARTED: 'system.maintenance.started',
  MAINTENANCE_ENDED: 'system.maintenance.ended',
} as const;

export type AuditLogEventType = (typeof AuditEventTypes)[keyof typeof AuditEventTypes];

// =============================================================================
// AUDIT EVENT SCHEMA
// =============================================================================

export interface AuditLogEvent {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: AuditLogEventType;
  /** Event category */
  category: AuditEventCategory;
  /** Timestamp (ISO 8601) */
  timestamp: string;
  /** Tenant ID */
  tenantId: string;
  /** Actor information */
  actor: AuditLogActor;
  /** Resource affected */
  resource?: AuditLogResource;
  /** Event details */
  details: Record<string, unknown>;
  /** Request context */
  context: AuditLogContext;
  /** Outcome */
  outcome: AuditLogOutcome;
  /** Hash of previous event (chain integrity) */
  previousHash?: string;
  /** Hash of this event */
  hash?: string;
}

export interface AuditLogActor {
  /** Actor type */
  type: 'user' | 'service' | 'api_key' | 'system';
  /** Actor ID */
  id: string;
  /** Actor name/email */
  name?: string;
  /** IP address */
  ip?: string;
  /** User agent */
  userAgent?: string;
}

export interface AuditLogResource {
  /** Resource type */
  type: string;
  /** Resource ID */
  id: string;
  /** Resource name */
  name?: string;
  /** Parent resource */
  parent?: {
    type: string;
    id: string;
  };
}

export interface AuditLogContext {
  /** Request ID */
  requestId: string;
  /** Session ID */
  sessionId?: string;
  /** Correlation ID for related events */
  correlationId?: string;
  /** API version */
  apiVersion?: string;
  /** Service name */
  service?: string;
  /** Environment */
  environment: 'development' | 'staging' | 'production';
}

export interface AuditLogOutcome {
  /** Success or failure */
  status: 'success' | 'failure';
  /** Error code if failed */
  errorCode?: string;
  /** Error message if failed */
  errorMessage?: string;
  /** Duration in milliseconds */
  durationMs?: number;
}

// =============================================================================
// AUDIT QUERY
// =============================================================================

export interface AuditQuery {
  /** Filter by tenant */
  tenantId?: string;
  /** Filter by event types */
  types?: AuditLogEventType[];
  /** Filter by categories */
  categories?: AuditEventCategory[];
  /** Filter by actor ID */
  actorId?: string;
  /** Filter by actor type */
  actorType?: AuditLogActor['type'];
  /** Filter by resource type */
  resourceType?: string;
  /** Filter by resource ID */
  resourceId?: string;
  /** Filter by outcome status */
  outcomeStatus?: 'success' | 'failure';
  /** Filter by time range start */
  startTime?: string;
  /** Filter by time range end */
  endTime?: string;
  /** Search in details */
  searchText?: string;
  /** Correlation ID */
  correlationId?: string;
  /** Pagination */
  limit?: number;
  offset?: number;
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

export interface AuditQueryResult {
  /** Matching events */
  events: AuditLogEvent[];
  /** Total count */
  total: number;
  /** Has more results */
  hasMore: boolean;
  /** Query execution time */
  queryTimeMs: number;
}

// =============================================================================
// RETENTION POLICY
// =============================================================================

export interface RetentionPolicy {
  /** Policy ID */
  id: string;
  /** Policy name */
  name: string;
  /** Tenant ID (null for global) */
  tenantId?: string;
  /** Event categories this applies to */
  categories: AuditEventCategory[];
  /** Retention period in days */
  retentionDays: number;
  /** Archive before deletion */
  archiveBeforeDelete: boolean;
  /** Archive destination */
  archiveDestination?: string;
  /** Enabled */
  enabled: boolean;
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
}

// =============================================================================
// COMPLIANCE REPORT
// =============================================================================

export interface AuditComplianceReportConfig {
  /** Report type */
  type: 'access_review' | 'activity_summary' | 'security_audit' | 'data_access' | 'custom';
  /** Tenant ID */
  tenantId: string;
  /** Time range start */
  startTime: string;
  /** Time range end */
  endTime: string;
  /** Include categories */
  categories?: AuditEventCategory[];
  /** Include event types */
  eventTypes?: AuditLogEventType[];
  /** Group by */
  groupBy?: 'actor' | 'resource' | 'type' | 'day' | 'week';
  /** Output format */
  format: 'json' | 'csv' | 'pdf';
}

export interface AuditComplianceReport {
  /** Report ID */
  id: string;
  /** Report config */
  config: AuditComplianceReportConfig;
  /** Generated at */
  generatedAt: string;
  /** Summary statistics */
  summary: {
    totalEvents: number;
    successCount: number;
    failureCount: number;
    uniqueActors: number;
    uniqueResources: number;
    eventsByCategory: Record<string, number>;
    eventsByType: Record<string, number>;
  };
  /** Report data */
  data: unknown;
  /** Download URL (if applicable) */
  downloadUrl?: string;
}

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

export const AuditLogActorSchema = z.object({
  type: z.enum(['user', 'service', 'api_key', 'system']),
  id: z.string(),
  name: z.string().optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});

export const AuditLogResourceSchema = z.object({
  type: z.string(),
  id: z.string(),
  name: z.string().optional(),
  parent: z.object({
    type: z.string(),
    id: z.string(),
  }).optional(),
});

export const AuditLogContextSchema = z.object({
  requestId: z.string(),
  sessionId: z.string().optional(),
  correlationId: z.string().optional(),
  apiVersion: z.string().optional(),
  service: z.string().optional(),
  environment: z.enum(['development', 'staging', 'production']),
});

export const AuditLogOutcomeSchema = z.object({
  status: z.enum(['success', 'failure']),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
});

export const AuditLogEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  category: z.enum(['auth', 'data', 'config', 'admin', 'api', 'security', 'billing', 'system']),
  timestamp: z.string().datetime(),
  tenantId: z.string(),
  actor: AuditLogActorSchema,
  resource: AuditLogResourceSchema.optional(),
  details: z.record(z.unknown()),
  context: AuditLogContextSchema,
  outcome: AuditLogOutcomeSchema,
  previousHash: z.string().optional(),
  hash: z.string().optional(),
});

export const AuditQuerySchema = z.object({
  tenantId: z.string().optional(),
  types: z.array(z.string()).optional(),
  categories: z.array(z.enum(['auth', 'data', 'config', 'admin', 'api', 'security', 'billing', 'system'])).optional(),
  actorId: z.string().optional(),
  actorType: z.enum(['user', 'service', 'api_key', 'system']).optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  outcomeStatus: z.enum(['success', 'failure']).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  searchText: z.string().optional(),
  correlationId: z.string().optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// =============================================================================
// AUDIT LOGGER
// =============================================================================

export interface AuditLoggerConfig {
  /** Service name */
  serviceName: string;
  /** Environment */
  environment: 'development' | 'staging' | 'production';
  /** Enable chain integrity */
  enableChainIntegrity: boolean;
  /** Batch size for writes */
  batchSize: number;
  /** Flush interval (ms) */
  flushIntervalMs: number;
  /** Storage backend */
  storage: AuditStorage;
}

export interface AuditStorage {
  /** Write events */
  write(events: AuditLogEvent[]): Promise<void>;
  /** Query events */
  query(query: AuditQuery): Promise<AuditQueryResult>;
  /** Get event by ID */
  get(id: string): Promise<AuditLogEvent | null>;
  /** Verify chain integrity */
  verifyChain(tenantId: string, startId: string, endId: string): Promise<ChainVerificationResult>;
  /** Apply retention policy */
  applyRetention(policy: RetentionPolicy): Promise<RetentionResult>;
}

export interface ChainVerificationResult {
  /** Verification passed */
  valid: boolean;
  /** Number of events verified */
  eventsVerified: number;
  /** First invalid event ID */
  firstInvalidId?: string;
  /** Error message */
  error?: string;
}

export interface RetentionResult {
  /** Events deleted */
  eventsDeleted: number;
  /** Events archived */
  eventsArchived: number;
  /** Errors */
  errors: string[];
}

/**
 * Audit logger with batching and chain integrity
 */
export class AuditLogger {
  private config: AuditLoggerConfig;
  private buffer: AuditLogEvent[] = [];
  private lastHash: string | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private eventCounter = 0;

  constructor(config: AuditLoggerConfig) {
    this.config = config;
    if (config.flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => this.flush(), config.flushIntervalMs);
    }
  }

  /**
   * Log an audit event
   */
  async log(params: {
    type: AuditLogEventType;
    tenantId: string;
    actor: AuditLogActor;
    resource?: AuditLogResource;
    details?: Record<string, unknown>;
    outcome: AuditLogOutcome;
    correlationId?: string;
    requestId?: string;
  }): Promise<AuditLogEvent> {
    const event = this.createEvent(params);
    this.buffer.push(event);

    if (this.buffer.length >= this.config.batchSize) {
      await this.flush();
    }

    return event;
  }

  /**
   * Log auth event helpers
   */
  async logLogin(
    tenantId: string,
    actor: AuditLogActor,
    success: boolean,
    details?: Record<string, unknown>
  ): Promise<AuditLogEvent> {
    return this.log({
      type: success ? AuditEventTypes.LOGIN_SUCCESS : AuditEventTypes.LOGIN_FAILURE,
      tenantId,
      actor,
      outcome: {
        status: success ? 'success' : 'failure',
        errorCode: success ? undefined : 'AUTH_FAILED',
      },
      details,
    });
  }

  /**
   * Log data access event
   */
  async logDataAccess(
    tenantId: string,
    actor: AuditLogActor,
    operation: 'read' | 'create' | 'update' | 'delete',
    resource: AuditLogResource,
    success: boolean,
    details?: Record<string, unknown>
  ): Promise<AuditLogEvent> {
    const typeMap = {
      read: AuditEventTypes.DATA_READ,
      create: AuditEventTypes.DATA_CREATE,
      update: AuditEventTypes.DATA_UPDATE,
      delete: AuditEventTypes.DATA_DELETE,
    };

    return this.log({
      type: typeMap[operation],
      tenantId,
      actor,
      resource,
      outcome: { status: success ? 'success' : 'failure' },
      details,
    });
  }

  /**
   * Log security event
   */
  async logSecurityEvent(
    tenantId: string,
    actor: AuditLogActor,
    type: 'suspicious' | 'access_denied' | 'ip_blocked' | 'brute_force',
    details: Record<string, unknown>
  ): Promise<AuditLogEvent> {
    const typeMap = {
      suspicious: AuditEventTypes.SUSPICIOUS_ACTIVITY,
      access_denied: AuditEventTypes.ACCESS_DENIED,
      ip_blocked: AuditEventTypes.IP_BLOCKED,
      brute_force: AuditEventTypes.BRUTE_FORCE_DETECTED,
    };

    return this.log({
      type: typeMap[type],
      tenantId,
      actor,
      outcome: { status: 'failure' },
      details,
    });
  }

  /**
   * Flush buffered events to storage
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    await this.config.storage.write(events);
  }

  /**
   * Query audit events
   */
  async query(query: AuditQuery): Promise<AuditQueryResult> {
    // Flush buffer first to ensure recent events are included
    await this.flush();
    return this.config.storage.query(query);
  }

  /**
   * Get single event
   */
  async getEvent(id: string): Promise<AuditLogEvent | null> {
    return this.config.storage.get(id);
  }

  /**
   * Verify chain integrity
   */
  async verifyChain(
    tenantId: string,
    startId: string,
    endId: string
  ): Promise<ChainVerificationResult> {
    return this.config.storage.verifyChain(tenantId, startId, endId);
  }

  /**
   * Generate compliance report
   */
  async generateReport(config: AuditComplianceReportConfig): Promise<AuditComplianceReport> {
    const result = await this.query({
      tenantId: config.tenantId,
      categories: config.categories,
      types: config.eventTypes,
      startTime: config.startTime,
      endTime: config.endTime,
      limit: 10000,
    });

    const summary = this.calculateSummary(result.events);

    return {
      id: `report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      config,
      generatedAt: new Date().toISOString(),
      summary,
      data: this.formatReportData(result.events, config),
    };
  }

  /**
   * Stop the logger
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  private createEvent(params: {
    type: AuditLogEventType;
    tenantId: string;
    actor: AuditLogActor;
    resource?: AuditLogResource;
    details?: Record<string, unknown>;
    outcome: AuditLogOutcome;
    correlationId?: string;
    requestId?: string;
  }): AuditLogEvent {
    const id = `aud_${Date.now()}_${++this.eventCounter}_${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();

    const event: AuditLogEvent = {
      id,
      type: params.type,
      category: this.getCategory(params.type),
      timestamp,
      tenantId: params.tenantId,
      actor: params.actor,
      resource: params.resource,
      details: params.details ?? {},
      context: {
        requestId: params.requestId ?? `req_${Date.now()}`,
        correlationId: params.correlationId,
        service: this.config.serviceName,
        environment: this.config.environment,
      },
      outcome: params.outcome,
    };

    if (this.config.enableChainIntegrity) {
      event.previousHash = this.lastHash ?? undefined;
      event.hash = this.computeHash(event);
      this.lastHash = event.hash;
    }

    return event;
  }

  private getCategory(type: AuditLogEventType): AuditEventCategory {
    const prefix = type.split('.')[0];
    const categoryMap: Record<string, AuditEventCategory> = {
      auth: 'auth',
      data: 'data',
      config: 'config',
      admin: 'admin',
      api: 'api',
      security: 'security',
      billing: 'billing',
      system: 'system',
    };
    return categoryMap[prefix] ?? 'system';
  }

  private computeHash(event: AuditLogEvent): string {
    // Simple hash for demo - use crypto in production
    const content = JSON.stringify({
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      tenantId: event.tenantId,
      actor: event.actor,
      previousHash: event.previousHash,
    });

    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `h_${Math.abs(hash).toString(16)}`;
  }

  private calculateSummary(events: AuditLogEvent[]): AuditComplianceReport['summary'] {
    const eventsByCategory: Record<string, number> = {};
    const eventsByType: Record<string, number> = {};
    const uniqueActors = new Set<string>();
    const uniqueResources = new Set<string>();
    let successCount = 0;
    let failureCount = 0;

    for (const event of events) {
      eventsByCategory[event.category] = (eventsByCategory[event.category] ?? 0) + 1;
      eventsByType[event.type] = (eventsByType[event.type] ?? 0) + 1;
      uniqueActors.add(event.actor.id);
      if (event.resource) {
        uniqueResources.add(`${event.resource.type}:${event.resource.id}`);
      }
      if (event.outcome.status === 'success') {
        successCount++;
      } else {
        failureCount++;
      }
    }

    return {
      totalEvents: events.length,
      successCount,
      failureCount,
      uniqueActors: uniqueActors.size,
      uniqueResources: uniqueResources.size,
      eventsByCategory,
      eventsByType,
    };
  }

  private formatReportData(events: AuditLogEvent[], config: AuditComplianceReportConfig): unknown {
    if (!config.groupBy) {
      return events;
    }

    const groups: Record<string, AuditLogEvent[]> = {};

    for (const event of events) {
      let key: string;
      switch (config.groupBy) {
        case 'actor':
          key = event.actor.id;
          break;
        case 'resource':
          key = event.resource ? `${event.resource.type}:${event.resource.id}` : 'none';
          break;
        case 'type':
          key = event.type;
          break;
        case 'day':
          key = event.timestamp.slice(0, 10);
          break;
        case 'week':
          const date = new Date(event.timestamp);
          const weekStart = new Date(date.setDate(date.getDate() - date.getDay()));
          key = weekStart.toISOString().slice(0, 10);
          break;
        default:
          key = 'all';
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(event);
    }

    return groups;
  }
}

// =============================================================================
// IN-MEMORY STORAGE (for testing/dev)
// =============================================================================

/**
 * In-memory audit storage for testing
 */
export class InMemoryAuditStorage implements AuditStorage {
  private events: Map<string, AuditLogEvent> = new Map();
  private eventsByTenant: Map<string, AuditLogEvent[]> = new Map();

  async write(events: AuditLogEvent[]): Promise<void> {
    for (const event of events) {
      this.events.set(event.id, event);

      const tenantEvents = this.eventsByTenant.get(event.tenantId) ?? [];
      tenantEvents.push(event);
      this.eventsByTenant.set(event.tenantId, tenantEvents);
    }
  }

  async query(query: AuditQuery): Promise<AuditQueryResult> {
    const startTime = Date.now();
    let events = Array.from(this.events.values());

    // Apply filters
    if (query.tenantId) {
      events = events.filter(e => e.tenantId === query.tenantId);
    }
    if (query.types?.length) {
      events = events.filter(e => query.types!.includes(e.type));
    }
    if (query.categories?.length) {
      events = events.filter(e => query.categories!.includes(e.category));
    }
    if (query.actorId) {
      events = events.filter(e => e.actor.id === query.actorId);
    }
    if (query.actorType) {
      events = events.filter(e => e.actor.type === query.actorType);
    }
    if (query.resourceType) {
      events = events.filter(e => e.resource?.type === query.resourceType);
    }
    if (query.resourceId) {
      events = events.filter(e => e.resource?.id === query.resourceId);
    }
    if (query.outcomeStatus) {
      events = events.filter(e => e.outcome.status === query.outcomeStatus);
    }
    if (query.startTime) {
      events = events.filter(e => e.timestamp >= query.startTime!);
    }
    if (query.endTime) {
      events = events.filter(e => e.timestamp <= query.endTime!);
    }
    if (query.correlationId) {
      events = events.filter(e => e.context.correlationId === query.correlationId);
    }
    if (query.searchText) {
      const search = query.searchText.toLowerCase();
      events = events.filter(e =>
        JSON.stringify(e.details).toLowerCase().includes(search)
      );
    }

    // Sort
    events.sort((a, b) => {
      const cmp = a.timestamp.localeCompare(b.timestamp);
      return query.sortOrder === 'asc' ? cmp : -cmp;
    });

    const total = events.length;

    // Paginate
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    events = events.slice(offset, offset + limit);

    return {
      events,
      total,
      hasMore: offset + events.length < total,
      queryTimeMs: Date.now() - startTime,
    };
  }

  async get(id: string): Promise<AuditLogEvent | null> {
    return this.events.get(id) ?? null;
  }

  async verifyChain(
    tenantId: string,
    startId: string,
    endId: string
  ): Promise<ChainVerificationResult> {
    const tenantEvents = this.eventsByTenant.get(tenantId) ?? [];
    const startIdx = tenantEvents.findIndex(e => e.id === startId);
    const endIdx = tenantEvents.findIndex(e => e.id === endId);

    if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) {
      return {
        valid: false,
        eventsVerified: 0,
        error: 'Invalid range',
      };
    }

    let verified = 0;
    for (let i = startIdx; i <= endIdx; i++) {
      const event = tenantEvents[i];
      if (i > startIdx && event.previousHash !== tenantEvents[i - 1].hash) {
        return {
          valid: false,
          eventsVerified: verified,
          firstInvalidId: event.id,
          error: 'Chain broken - hash mismatch',
        };
      }
      verified++;
    }

    return {
      valid: true,
      eventsVerified: verified,
    };
  }

  async applyRetention(policy: RetentionPolicy): Promise<RetentionResult> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - policy.retentionDays);
    const cutoffStr = cutoff.toISOString();

    let deleted = 0;
    const archived = 0;

    for (const [id, event] of this.events) {
      if (
        policy.categories.includes(event.category) &&
        event.timestamp < cutoffStr &&
        (!policy.tenantId || event.tenantId === policy.tenantId)
      ) {
        this.events.delete(id);
        deleted++;
      }
    }

    // Update tenant indexes
    for (const [tenantId, events] of this.eventsByTenant) {
      this.eventsByTenant.set(
        tenantId,
        events.filter(e => this.events.has(e.id))
      );
    }

    return {
      eventsDeleted: deleted,
      eventsArchived: archived,
      errors: [],
    };
  }

  /** Clear all events (for testing) */
  clear(): void {
    this.events.clear();
    this.eventsByTenant.clear();
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create audit logger
 */
export function createAuditLogger(config: Partial<AuditLoggerConfig> & { serviceName: string }): AuditLogger {
  return new AuditLogger({
    serviceName: config.serviceName,
    environment: config.environment ?? 'development',
    enableChainIntegrity: config.enableChainIntegrity ?? true,
    batchSize: config.batchSize ?? 100,
    flushIntervalMs: config.flushIntervalMs ?? 5000,
    storage: config.storage ?? new InMemoryAuditStorage(),
  });
}

/**
 * Create in-memory audit storage
 */
export function createInMemoryAuditStorage(): InMemoryAuditStorage {
  return new InMemoryAuditStorage();
}
