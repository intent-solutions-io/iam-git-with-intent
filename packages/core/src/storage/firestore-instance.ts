/**
 * Firestore Instance Store Implementation (Phase 13)
 *
 * Production-ready InstanceStore backed by Google Firestore.
 * Manages workflow instances with tenant-scoped subcollections.
 *
 * Collection Structure:
 * - gwi_tenants/{tenantId}/instances/{instanceId}
 *
 * @module @gwi/core/storage/firestore
 */

import type { Firestore, DocumentReference, Query, CollectionReference } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import type {
  InstanceStore,
  WorkflowInstance,
} from './interfaces.js';
import {
  getFirestoreClient,
  COLLECTIONS,
  timestampToDate,
  dateToTimestamp,
  generateFirestoreId,
} from './firestore-client.js';

// =============================================================================
// Firestore Document Types
// =============================================================================

interface InstanceDoc {
  id: string;
  tenantId: string;
  templateRef: string;
  name: string;
  description?: string;
  configuredInputs: Record<string, unknown>;
  connectorBindings: Array<{
    requirementId: string;
    connectorConfigId: string;
  }>;
  enabled: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  lastRunAt?: Timestamp;
  runCount: number;
}

// =============================================================================
// Conversion Functions
// =============================================================================

function instanceDocToModel(doc: InstanceDoc): WorkflowInstance {
  return {
    id: doc.id,
    tenantId: doc.tenantId,
    templateRef: doc.templateRef,
    name: doc.name,
    description: doc.description,
    configuredInputs: doc.configuredInputs,
    connectorBindings: doc.connectorBindings,
    enabled: doc.enabled,
    createdAt: timestampToDate(doc.createdAt)!,
    updatedAt: timestampToDate(doc.updatedAt)!,
    createdBy: doc.createdBy,
    lastRunAt: timestampToDate(doc.lastRunAt),
    runCount: doc.runCount,
  };
}

function instanceModelToDoc(instance: WorkflowInstance): InstanceDoc {
  return {
    id: instance.id,
    tenantId: instance.tenantId,
    templateRef: instance.templateRef,
    name: instance.name,
    description: instance.description,
    configuredInputs: instance.configuredInputs,
    connectorBindings: instance.connectorBindings,
    enabled: instance.enabled,
    createdAt: dateToTimestamp(instance.createdAt)!,
    updatedAt: dateToTimestamp(instance.updatedAt)!,
    createdBy: instance.createdBy,
    lastRunAt: dateToTimestamp(instance.lastRunAt),
    runCount: instance.runCount,
  };
}

// =============================================================================
// Firestore Instance Store Implementation
// =============================================================================

/**
 * Firestore-backed InstanceStore implementation (Phase 13)
 *
 * Provides production-ready workflow instance storage with:
 * - Tenant-scoped instance management
 * - Template reference tracking
 * - Run count and last run tracking
 */
export class FirestoreInstanceStore implements InstanceStore {
  private db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestoreClient();
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private tenantsRef(): CollectionReference {
    return this.db.collection(COLLECTIONS.TENANTS);
  }

  private instancesRef(tenantId: string): CollectionReference {
    return this.tenantsRef().doc(tenantId).collection(COLLECTIONS.INSTANCES);
  }

  private instanceDoc(tenantId: string, instanceId: string): DocumentReference {
    return this.instancesRef(tenantId).doc(instanceId);
  }

  // ---------------------------------------------------------------------------
  // Instance CRUD
  // ---------------------------------------------------------------------------

  async createInstance(
    instance: Omit<WorkflowInstance, 'id' | 'createdAt' | 'updatedAt' | 'runCount'>
  ): Promise<WorkflowInstance> {
    const now = new Date();
    const instanceId = generateFirestoreId('inst');

    const fullInstance: WorkflowInstance = {
      ...instance,
      id: instanceId,
      createdAt: now,
      updatedAt: now,
      runCount: 0,
    };

    const doc = instanceModelToDoc(fullInstance);
    await this.instanceDoc(instance.tenantId, instanceId).set(doc);

    return fullInstance;
  }

  async getInstance(instanceId: string): Promise<WorkflowInstance | null> {
    // We need to search across all tenants since we only have instanceId
    // This is inefficient but matches the interface contract
    // In production, consider adding tenantId to the interface
    const tenantsSnapshot = await this.tenantsRef().get();

    for (const tenantDoc of tenantsSnapshot.docs) {
      const instanceSnapshot = await this.instancesRef(tenantDoc.id).doc(instanceId).get();
      if (instanceSnapshot.exists) {
        return instanceDocToModel(instanceSnapshot.data() as InstanceDoc);
      }
    }

    return null;
  }

  async listInstances(
    tenantId: string,
    filter?: {
      templateRef?: string;
      enabled?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<WorkflowInstance[]> {
    let query: Query = this.instancesRef(tenantId);

    if (filter?.templateRef) {
      query = query.where('templateRef', '==', filter.templateRef);
    }
    if (filter?.enabled !== undefined) {
      query = query.where('enabled', '==', filter.enabled);
    }

    query = query.orderBy('createdAt', 'desc');

    const limit = filter?.limit ?? 100;
    const offset = filter?.offset ?? 0;

    // Firestore doesn't support offset directly, so we need to use limit
    // For production, consider cursor-based pagination
    query = query.limit(limit + offset);

    const snapshot = await query.get();
    const instances = snapshot.docs.map(doc => instanceDocToModel(doc.data() as InstanceDoc));

    // Apply offset
    return instances.slice(offset, offset + limit);
  }

  async updateInstance(
    instanceId: string,
    update: Partial<Pick<WorkflowInstance, 'name' | 'description' | 'configuredInputs' | 'connectorBindings' | 'enabled'>>
  ): Promise<WorkflowInstance> {
    // Find the instance first
    const existing = await this.getInstance(instanceId);
    if (!existing) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    const updated: WorkflowInstance = {
      ...existing,
      ...update,
      updatedAt: new Date(),
    };

    const doc = instanceModelToDoc(updated);
    await this.instanceDoc(existing.tenantId, instanceId).set(doc, { merge: true });

    return updated;
  }

  async deleteInstance(instanceId: string): Promise<void> {
    // Find the instance first to get tenantId
    const existing = await this.getInstance(instanceId);
    if (!existing) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    await this.instanceDoc(existing.tenantId, instanceId).delete();
  }

  async incrementRunCount(instanceId: string): Promise<void> {
    const existing = await this.getInstance(instanceId);
    if (!existing) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    await this.instanceDoc(existing.tenantId, instanceId).update({
      runCount: existing.runCount + 1,
      updatedAt: Timestamp.now(),
    });
  }

  async updateLastRun(instanceId: string, runAt: Date): Promise<void> {
    const existing = await this.getInstance(instanceId);
    if (!existing) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    await this.instanceDoc(existing.tenantId, instanceId).update({
      lastRunAt: dateToTimestamp(runAt),
      updatedAt: Timestamp.now(),
    });
  }
}
