/**
 * Firestore Schedule Store Implementation (Phase 13)
 *
 * Production-ready ScheduleStore backed by Google Firestore.
 * Manages workflow schedules with tenant-scoped subcollections.
 *
 * Collection Structure:
 * - gwi_tenants/{tenantId}/schedules/{scheduleId}
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
  ScheduleStore,
  WorkflowSchedule,
} from './interfaces.js';

// =============================================================================
// Firestore Document Types
// =============================================================================

interface ScheduleDoc extends DocumentData {
  id: string;
  instanceId: string;
  tenantId: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastTriggeredAt?: Timestamp;
  nextTriggerAt?: Timestamp;
  createdBy: string;
}

// =============================================================================
// Conversion Functions
// =============================================================================

function scheduleDocToModel(doc: ScheduleDoc, id: string): WorkflowSchedule {
  return {
    id,
    instanceId: doc.instanceId,
    tenantId: doc.tenantId,
    cronExpression: doc.cronExpression,
    timezone: doc.timezone,
    enabled: doc.enabled,
    createdAt: timestampToDate(doc.createdAt)!,
    updatedAt: timestampToDate(doc.updatedAt)!,
    lastTriggeredAt: timestampToDate(doc.lastTriggeredAt),
    nextTriggerAt: timestampToDate(doc.nextTriggerAt),
    createdBy: doc.createdBy,
  };
}

function scheduleModelToDoc(schedule: WorkflowSchedule): ScheduleDoc {
  return {
    id: schedule.id,
    instanceId: schedule.instanceId,
    tenantId: schedule.tenantId,
    cronExpression: schedule.cronExpression,
    timezone: schedule.timezone,
    enabled: schedule.enabled,
    createdAt: dateToTimestamp(schedule.createdAt)!,
    updatedAt: dateToTimestamp(schedule.updatedAt)!,
    lastTriggeredAt: dateToTimestamp(schedule.lastTriggeredAt),
    nextTriggerAt: dateToTimestamp(schedule.nextTriggerAt),
    createdBy: schedule.createdBy,
  };
}

// =============================================================================
// Firestore Schedule Store Implementation
// =============================================================================

/**
 * Firestore-backed ScheduleStore implementation (Phase 13)
 *
 * Provides production-ready workflow schedule storage with:
 * - Tenant-scoped schedule management
 * - Cron expression and timezone tracking
 * - Due schedule queries for scheduler processing
 */
export class FirestoreScheduleStore
  extends BaseFirestoreRepository<WorkflowSchedule & TenantScopedEntity, ScheduleDoc>
  implements ScheduleStore
{
  constructor(db?: Firestore) {
    super(db, {
      tenantScoped: {
        parentCollection: COLLECTIONS.TENANTS,
        subcollection: COLLECTIONS.SCHEDULES,
      },
      idPrefix: 'sched',
      timestampFields: ['createdAt', 'updatedAt', 'lastTriggeredAt', 'nextTriggerAt'],
      docToModel: scheduleDocToModel,
      modelToDoc: scheduleModelToDoc,
    });
  }

  async createSchedule(
    schedule: Omit<WorkflowSchedule, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<WorkflowSchedule> {
    const now = new Date();
    const scheduleId = this.generateId();

    const fullSchedule: WorkflowSchedule = {
      ...schedule,
      id: scheduleId,
      createdAt: now,
      updatedAt: now,
    };

    const doc = this.toDocument(fullSchedule);
    await this.getDocRef(scheduleId, schedule.tenantId).set(doc);

    return fullSchedule;
  }

  async getSchedule(scheduleId: string): Promise<WorkflowSchedule | null> {
    return this.getDocumentAcrossTenants(scheduleId);
  }

  async listSchedules(instanceId: string): Promise<WorkflowSchedule[]> {
    // Search across all tenants for schedules with this instanceId
    const tenantsSnapshot = await this.getParentCollection().get();

    for (const tenantDoc of tenantsSnapshot.docs) {
      const schedules = await this.listDocuments(
        [{ field: 'instanceId', operator: '==', value: instanceId }],
        undefined,
        tenantDoc.id,
        'createdAt',
        'desc'
      );

      if (schedules.length > 0) {
        return schedules;
      }
    }

    return [];
  }

  async listTenantSchedules(
    tenantId: string,
    filter?: {
      enabled?: boolean;
      limit?: number;
    }
  ): Promise<WorkflowSchedule[]> {
    const conditions: Array<{ field: string; operator: '==' | '>=' | '<' | '>' | '<=' | '!=' | 'in' | 'array-contains'; value: unknown }> = [];

    if (filter?.enabled !== undefined) {
      conditions.push({ field: 'enabled', operator: '==', value: filter.enabled });
    }

    return this.listDocuments(
      conditions,
      { limit: filter?.limit },
      tenantId,
      'createdAt',
      'desc'
    );
  }

  async listDueSchedules(beforeTime: Date): Promise<WorkflowSchedule[]> {
    // Query across all tenants for due schedules
    const tenantsSnapshot = await this.getParentCollection().get();
    const dueSchedules: WorkflowSchedule[] = [];

    for (const tenantDoc of tenantsSnapshot.docs) {
      const schedules = await this.listDocuments(
        [
          { field: 'enabled', operator: '==', value: true },
          { field: 'nextTriggerAt', operator: '<=', value: Timestamp.fromDate(beforeTime) },
        ],
        undefined,
        tenantDoc.id
      );

      dueSchedules.push(...schedules);
    }

    return dueSchedules;
  }

  async updateSchedule(
    scheduleId: string,
    update: Partial<Pick<WorkflowSchedule, 'cronExpression' | 'timezone' | 'enabled'>>
  ): Promise<WorkflowSchedule> {
    // Find the schedule first
    const existing = await this.getSchedule(scheduleId);
    if (!existing) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const updated: WorkflowSchedule = {
      ...existing,
      ...update,
      updatedAt: new Date(),
    };

    const doc = this.toDocument(updated);
    await this.getDocRef(scheduleId, existing.tenantId).set(doc, { merge: true });

    return updated;
  }

  async updateLastTriggered(scheduleId: string, triggeredAt: Date, nextTriggerAt: Date): Promise<void> {
    const existing = await this.getSchedule(scheduleId);
    if (!existing) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    await this.getDocRef(scheduleId, existing.tenantId).update({
      lastTriggeredAt: dateToTimestamp(triggeredAt),
      nextTriggerAt: dateToTimestamp(nextTriggerAt),
      updatedAt: Timestamp.now(),
    });
  }

  async deleteSchedule(scheduleId: string): Promise<void> {
    const existing = await this.getSchedule(scheduleId);
    if (!existing) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    await this.deleteDocument(scheduleId, existing.tenantId);
  }
}
