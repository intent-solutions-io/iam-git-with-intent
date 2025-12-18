/**
 * Firestore Audit Store
 *
 * Phase 11: Immutable audit trail for all run actions.
 * Events cannot be modified once created.
 *
 * @module @gwi/core/storage
 */

import { getFirestoreClient, COLLECTIONS } from './firestore-client.js';
import type { AuditStore, AuditEvent, AuditEventType } from './interfaces.js';

/**
 * Firestore implementation of AuditStore
 */
export class FirestoreAuditStore implements AuditStore {
  private get db() {
    return getFirestoreClient();
  }

  private get collection() {
    return this.db.collection(COLLECTIONS.AUDIT_EVENTS);
  }

  /**
   * Create a new audit event
   */
  async createEvent(event: Omit<AuditEvent, 'id'>): Promise<AuditEvent> {
    const id = `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const record: AuditEvent = {
      ...event,
      id,
      timestamp: event.timestamp || new Date(),
    };

    await this.collection.doc(id).set({
      ...record,
      timestamp: record.timestamp,
    });

    return record;
  }

  /**
   * Get audit event by ID
   */
  async getEvent(eventId: string): Promise<AuditEvent | null> {
    const doc = await this.collection.doc(eventId).get();
    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    return {
      ...data,
      id: doc.id,
      timestamp: data.timestamp?.toDate?.() || new Date(data.timestamp),
    } as AuditEvent;
  }

  /**
   * List audit events for a run
   */
  async listEvents(
    runId: string,
    filter?: {
      eventType?: AuditEventType;
      limit?: number;
      offset?: number;
    }
  ): Promise<AuditEvent[]> {
    let query = this.collection.where('runId', '==', runId);

    if (filter?.eventType) {
      query = query.where('eventType', '==', filter.eventType);
    }

    query = query.orderBy('timestamp', 'asc');

    if (filter?.limit) {
      query = query.limit(filter.limit + (filter?.offset || 0));
    }

    const snapshot = await query.get();

    let results = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        timestamp: data.timestamp?.toDate?.() || new Date(data.timestamp),
      } as AuditEvent;
    });

    // Handle offset (Firestore doesn't have native offset support)
    if (filter?.offset) {
      results = results.slice(filter.offset);
    }

    return results;
  }

  /**
   * List audit events for a tenant (across all runs)
   */
  async listTenantEvents(
    tenantId: string,
    filter?: {
      eventType?: AuditEventType;
      limit?: number;
      offset?: number;
    }
  ): Promise<AuditEvent[]> {
    let query = this.collection.where('tenantId', '==', tenantId);

    if (filter?.eventType) {
      query = query.where('eventType', '==', filter.eventType);
    }

    query = query.orderBy('timestamp', 'desc');

    if (filter?.limit) {
      query = query.limit(filter.limit + (filter?.offset || 0));
    }

    const snapshot = await query.get();

    let results = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        timestamp: data.timestamp?.toDate?.() || new Date(data.timestamp),
      } as AuditEvent;
    });

    if (filter?.offset) {
      results = results.slice(filter.offset);
    }

    return results;
  }
}

// =============================================================================
// Singleton Access
// =============================================================================

let auditStoreInstance: AuditStore | null = null;

/**
 * Get the AuditStore based on environment configuration
 */
export function getAuditStore(): AuditStore {
  if (auditStoreInstance) {
    return auditStoreInstance;
  }

  const backend = process.env.GWI_STORE_BACKEND?.toLowerCase();

  if (backend === 'firestore') {
    auditStoreInstance = new FirestoreAuditStore();
  } else {
    // In-memory fallback
    auditStoreInstance = new InMemoryAuditStore();
  }

  return auditStoreInstance;
}

/**
 * Reset singleton (for testing)
 */
export function resetAuditStore(): void {
  auditStoreInstance = null;
}

// =============================================================================
// In-Memory Implementation (for testing/dev)
// =============================================================================

export class InMemoryAuditStore implements AuditStore {
  private events = new Map<string, AuditEvent>();

  async createEvent(event: Omit<AuditEvent, 'id'>): Promise<AuditEvent> {
    const id = `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const record: AuditEvent = {
      ...event,
      id,
      timestamp: event.timestamp || new Date(),
    };
    this.events.set(id, record);
    return record;
  }

  async getEvent(eventId: string): Promise<AuditEvent | null> {
    return this.events.get(eventId) || null;
  }

  async listEvents(
    runId: string,
    filter?: {
      eventType?: AuditEventType;
      limit?: number;
      offset?: number;
    }
  ): Promise<AuditEvent[]> {
    let results = Array.from(this.events.values())
      .filter((e) => e.runId === runId);

    if (filter?.eventType) {
      results = results.filter((e) => e.eventType === filter.eventType);
    }

    // Sort by timestamp ascending for run events
    results.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (filter?.offset) {
      results = results.slice(filter.offset);
    }

    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async listTenantEvents(
    tenantId: string,
    filter?: {
      eventType?: AuditEventType;
      limit?: number;
      offset?: number;
    }
  ): Promise<AuditEvent[]> {
    let results = Array.from(this.events.values())
      .filter((e) => e.tenantId === tenantId);

    if (filter?.eventType) {
      results = results.filter((e) => e.eventType === filter.eventType);
    }

    // Sort by timestamp descending for tenant view
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filter?.offset) {
      results = results.slice(filter.offset);
    }

    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  // Testing helper
  clear(): void {
    this.events.clear();
  }
}
