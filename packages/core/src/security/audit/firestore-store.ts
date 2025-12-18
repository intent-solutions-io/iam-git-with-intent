/**
 * Firestore Security Audit Store
 *
 * Phase 24: Security & Compliance Hardening
 *
 * Firestore implementation of the security audit store.
 * Uses tenant-scoped subcollections for isolation.
 *
 * Collection structure:
 * - gwi_security_audit/{eventId} - Global collection with tenantId index
 *
 * @module @gwi/core/security/audit/firestore-store
 */

import { getFirestoreClient } from '../../storage/firestore-client.js';
import type { SecurityAuditEvent, CreateSecurityAuditEvent, SecurityAuditEventType } from './types.js';
import type { SecurityAuditStore, AuditQueryOptions } from './store.js';

/**
 * Firestore collection name for security audit events
 */
export const SECURITY_AUDIT_COLLECTION = 'gwi_security_audit';

/**
 * Firestore implementation of SecurityAuditStore
 */
export class FirestoreSecurityAuditStore implements SecurityAuditStore {
  private get db() {
    return getFirestoreClient();
  }

  private get collection() {
    return this.db.collection(SECURITY_AUDIT_COLLECTION);
  }

  /**
   * Create a new audit event (append-only)
   */
  async createEvent(input: CreateSecurityAuditEvent): Promise<SecurityAuditEvent> {
    const id = `saud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const event: SecurityAuditEvent = {
      ...input,
      id,
      timestamp: new Date(),
    };

    // Store with Firestore timestamp
    await this.collection.doc(id).set({
      ...event,
      timestamp: event.timestamp,
      // Add searchable fields at top level
      _tenantId: event.tenantId,
      _eventType: event.eventType,
      _outcome: event.outcome,
      _actorId: event.actor.id,
      _traceId: event.traceId,
      _runId: event.runId,
      _createdAt: event.timestamp,
    });

    return event;
  }

  /**
   * Get event by ID
   */
  async getEvent(eventId: string): Promise<SecurityAuditEvent | null> {
    const doc = await this.collection.doc(eventId).get();

    if (!doc.exists) {
      return null;
    }

    return this.docToEvent(doc);
  }

  /**
   * List events for a tenant
   */
  async listTenantEvents(
    tenantId: string,
    options?: AuditQueryOptions
  ): Promise<SecurityAuditEvent[]> {
    let query = this.collection.where('_tenantId', '==', tenantId);

    // Apply filters
    if (options?.eventType) {
      query = query.where('_eventType', '==', options.eventType);
    }
    if (options?.outcome) {
      query = query.where('_outcome', '==', options.outcome);
    }
    if (options?.actorId) {
      query = query.where('_actorId', '==', options.actorId);
    }

    // Time range filters
    if (options?.startTime) {
      query = query.where('_createdAt', '>=', options.startTime);
    }
    if (options?.endTime) {
      query = query.where('_createdAt', '<=', options.endTime);
    }

    // Order
    const orderBy = options?.orderBy ?? 'desc';
    query = query.orderBy('_createdAt', orderBy);

    // Limit (with offset workaround)
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    query = query.limit(limit + offset);

    const snapshot = await query.get();

    let results = snapshot.docs.map((doc) => this.docToEvent(doc));

    // Apply offset (Firestore doesn't have native offset)
    if (offset > 0) {
      results = results.slice(offset);
    }

    // Apply limit
    if (limit > 0 && results.length > limit) {
      results = results.slice(0, limit);
    }

    // Post-filter for fields not indexed
    if (options?.resourceType) {
      results = results.filter((e) => e.resource?.type === options.resourceType);
    }
    if (options?.resourceId) {
      results = results.filter((e) => e.resource?.id === options.resourceId);
    }

    return results;
  }

  /**
   * Count events for a tenant
   */
  async countTenantEvents(
    tenantId: string,
    options?: Pick<AuditQueryOptions, 'eventType' | 'outcome' | 'startTime' | 'endTime'>
  ): Promise<number> {
    let query = this.collection.where('_tenantId', '==', tenantId);

    if (options?.eventType) {
      query = query.where('_eventType', '==', options.eventType);
    }
    if (options?.outcome) {
      query = query.where('_outcome', '==', options.outcome);
    }
    if (options?.startTime) {
      query = query.where('_createdAt', '>=', options.startTime);
    }
    if (options?.endTime) {
      query = query.where('_createdAt', '<=', options.endTime);
    }

    // Use count aggregation if available, otherwise count docs
    const snapshot = await query.count().get();
    return snapshot.data().count;
  }

  /**
   * List events by trace ID
   */
  async listByTraceId(traceId: string): Promise<SecurityAuditEvent[]> {
    const snapshot = await this.collection
      .where('_traceId', '==', traceId)
      .orderBy('_createdAt', 'asc')
      .get();

    return snapshot.docs.map((doc) => this.docToEvent(doc));
  }

  /**
   * List events by run ID
   */
  async listByRunId(runId: string): Promise<SecurityAuditEvent[]> {
    const snapshot = await this.collection
      .where('_runId', '==', runId)
      .orderBy('_createdAt', 'asc')
      .get();

    return snapshot.docs.map((doc) => this.docToEvent(doc));
  }

  /**
   * Convert Firestore document to SecurityAuditEvent
   */
  private docToEvent(doc: FirebaseFirestore.DocumentSnapshot): SecurityAuditEvent {
    const data = doc.data()!;

    return {
      id: doc.id,
      eventType: data.eventType as SecurityAuditEventType,
      outcome: data.outcome,
      tenantId: data.tenantId,
      actor: data.actor,
      resource: data.resource,
      data: data.data,
      error: data.error,
      timestamp: data.timestamp?.toDate?.() || new Date(data.timestamp),
      traceId: data.traceId,
      spanId: data.spanId,
      requestId: data.requestId,
      runId: data.runId,
      workItemId: data.workItemId,
      candidateId: data.candidateId,
    };
  }
}

// =============================================================================
// Singleton Access
// =============================================================================

import { InMemorySecurityAuditStore } from './store.js';

let securityAuditStoreInstance: SecurityAuditStore | null = null;

/**
 * Get the security audit store based on environment
 */
export function getSecurityAuditStore(): SecurityAuditStore {
  if (securityAuditStoreInstance) {
    return securityAuditStoreInstance;
  }

  const backend = process.env.GWI_STORE_BACKEND?.toLowerCase();

  if (backend === 'firestore') {
    securityAuditStoreInstance = new FirestoreSecurityAuditStore();
  } else {
    securityAuditStoreInstance = new InMemorySecurityAuditStore();
  }

  return securityAuditStoreInstance;
}

/**
 * Reset singleton (for testing)
 */
export function resetSecurityAuditStore(): void {
  securityAuditStoreInstance = null;
}

/**
 * Set custom store (for testing)
 */
export function setSecurityAuditStore(store: SecurityAuditStore): void {
  securityAuditStoreInstance = store;
}
