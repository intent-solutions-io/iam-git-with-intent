/**
 * Firestore Audit Store
 *
 * Phase 11: Immutable audit trail for all run actions.
 * Events cannot be modified once created.
 *
 * Refactored to use BaseFirestoreRepository.
 *
 * @module @gwi/core/storage
 */

import type { Firestore, DocumentData } from 'firebase-admin/firestore';
import {
  BaseFirestoreRepository,
  COLLECTIONS,
  Timestamp,
  timestampToDate,
  dateToTimestamp,
} from './base-firestore-repository.js';
import type { AuditStore, AuditEvent, AuditEventType } from './interfaces.js';

// =============================================================================
// Firestore Document Type
// =============================================================================

interface AuditDoc extends DocumentData {
  id: string;
  runId: string;
  tenantId: string;
  eventType: string;
  timestamp: Timestamp;
  actor?: string;
  details: Record<string, unknown>;
  // Intent Receipt fields
  intent?: string;
  changeSummary?: string;
  scope?: string;
  policyApproval?: string;
  evidenceText?: string;
}

// =============================================================================
// Conversion Functions
// =============================================================================

function auditDocToModel(doc: AuditDoc, id: string): AuditEvent {
  return {
    id,
    runId: doc.runId,
    tenantId: doc.tenantId,
    eventType: doc.eventType as AuditEventType,
    timestamp: timestampToDate(doc.timestamp) ?? new Date(),
    actor: doc.actor,
    details: doc.details,
    intent: doc.intent,
    changeSummary: doc.changeSummary,
    scope: doc.scope,
    policyApproval: doc.policyApproval,
    evidenceText: doc.evidenceText,
  };
}

function auditModelToDoc(event: AuditEvent): AuditDoc {
  return {
    id: event.id,
    runId: event.runId,
    tenantId: event.tenantId,
    eventType: event.eventType,
    timestamp: dateToTimestamp(event.timestamp) as Timestamp,
    actor: event.actor,
    details: event.details,
    intent: event.intent,
    changeSummary: event.changeSummary,
    scope: event.scope,
    policyApproval: event.policyApproval,
    evidenceText: event.evidenceText,
  };
}

// =============================================================================
// Firestore Audit Store Implementation
// =============================================================================

/**
 * Firestore implementation of AuditStore using BaseFirestoreRepository
 */
export class FirestoreAuditStore
  extends BaseFirestoreRepository<AuditEvent, AuditDoc>
  implements AuditStore
{
  constructor(db?: Firestore) {
    super(db, {
      collection: COLLECTIONS.AUDIT_EVENTS,
      idPrefix: 'aud',
      timestampFields: ['timestamp'],
      docToModel: auditDocToModel,
      modelToDoc: auditModelToDoc,
    });
  }

  /**
   * Create a new audit event
   */
  async createEvent(event: Omit<AuditEvent, 'id'>): Promise<AuditEvent> {
    const id = this.generateId();

    const record: AuditEvent = {
      ...event,
      id,
      timestamp: event.timestamp || new Date(),
    };

    const doc = this.toDocument(record);
    await this.getDocRef(id).set(doc);

    return record;
  }

  /**
   * Get audit event by ID
   */
  async getEvent(eventId: string): Promise<AuditEvent | null> {
    return this.getDocument(eventId);
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
    const conditions = [
      { field: 'runId', operator: '==' as const, value: runId },
    ];

    if (filter?.eventType) {
      conditions.push({ field: 'eventType', operator: '==', value: filter.eventType });
    }

    return this.listDocuments(
      conditions,
      { limit: filter?.limit, offset: filter?.offset },
      undefined,
      'timestamp',
      'asc' // Run events sorted ascending (chronological)
    );
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
    const conditions = [
      { field: 'tenantId', operator: '==' as const, value: tenantId },
    ];

    if (filter?.eventType) {
      conditions.push({ field: 'eventType', operator: '==', value: filter.eventType });
    }

    return this.listDocuments(
      conditions,
      { limit: filter?.limit, offset: filter?.offset },
      undefined,
      'timestamp',
      'desc' // Tenant view sorted descending (most recent first)
    );
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
