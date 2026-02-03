/**
 * Firestore Instance Store Implementation (Phase 13)
 *
 * Production-ready InstanceStore backed by Google Firestore.
 * Manages workflow instances with tenant-scoped subcollections.
 *
 * Collection Structure:
 * - gwi_tenants/{tenantId}/instances/{instanceId}
 *
 * Refactored to use BaseFirestoreRepository.
 *
 * @module @gwi/core/storage/firestore
 */

import type { Firestore, DocumentData } from 'firebase-admin/firestore';
import {
  BaseFirestoreRepository,
  COLLECTIONS,
  Timestamp,
  timestampToDate,
  dateToTimestamp,
  type TenantScopedEntity,
} from './base-firestore-repository.js';
import type {
  InstanceStore,
  WorkflowInstance,
} from './interfaces.js';

// =============================================================================
// Firestore Document Types
// =============================================================================

interface InstanceDoc extends DocumentData {
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

function instanceDocToModel(doc: InstanceDoc, id: string): WorkflowInstance {
  return {
    id,
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
export class FirestoreInstanceStore
  extends BaseFirestoreRepository<WorkflowInstance & TenantScopedEntity, InstanceDoc>
  implements InstanceStore
{
  constructor(db?: Firestore) {
    super(db, {
      tenantScoped: {
        parentCollection: COLLECTIONS.TENANTS,
        subcollection: COLLECTIONS.INSTANCES,
      },
      idPrefix: 'inst',
      timestampFields: ['createdAt', 'updatedAt', 'lastRunAt'],
      docToModel: instanceDocToModel,
      modelToDoc: instanceModelToDoc,
    });
  }

  async createInstance(
    instance: Omit<WorkflowInstance, 'id' | 'createdAt' | 'updatedAt' | 'runCount'>
  ): Promise<WorkflowInstance> {
    const now = new Date();
    const instanceId = this.generateId();

    const fullInstance: WorkflowInstance = {
      ...instance,
      id: instanceId,
      createdAt: now,
      updatedAt: now,
      runCount: 0,
    };

    const doc = this.toDocument(fullInstance);
    await this.getDocRef(instanceId, instance.tenantId).set(doc);

    return fullInstance;
  }

  async getInstance(instanceId: string): Promise<WorkflowInstance | null> {
    return this.getDocumentAcrossTenants(instanceId);
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
    const conditions: Array<{ field: string; operator: '==' | '>=' | '<' | '>' | '<=' | '!=' | 'in' | 'array-contains'; value: unknown }> = [];

    if (filter?.templateRef) {
      conditions.push({ field: 'templateRef', operator: '==', value: filter.templateRef });
    }
    if (filter?.enabled !== undefined) {
      conditions.push({ field: 'enabled', operator: '==', value: filter.enabled });
    }

    return this.listDocuments(
      conditions,
      { limit: filter?.limit, offset: filter?.offset },
      tenantId,
      'createdAt',
      'desc'
    );
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

    const doc = this.toDocument(updated);
    await this.getDocRef(instanceId, existing.tenantId).set(doc, { merge: true });

    return updated;
  }

  async deleteInstance(instanceId: string): Promise<void> {
    const existing = await this.getInstance(instanceId);
    if (!existing) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    await this.deleteDocument(instanceId, existing.tenantId);
  }

  async incrementRunCount(instanceId: string): Promise<void> {
    const existing = await this.getInstance(instanceId);
    if (!existing) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    await this.getDocRef(instanceId, existing.tenantId).update({
      runCount: existing.runCount + 1,
      updatedAt: Timestamp.now(),
    });
  }

  async updateLastRun(instanceId: string, runAt: Date): Promise<void> {
    const existing = await this.getInstance(instanceId);
    if (!existing) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    await this.getDocRef(instanceId, existing.tenantId).update({
      lastRunAt: dateToTimestamp(runAt),
      updatedAt: Timestamp.now(),
    });
  }
}
