/**
 * Firestore Schedule Store Implementation (Phase 13)
 *
 * Production-ready ScheduleStore backed by Google Firestore.
 * Manages workflow schedules with tenant-scoped subcollections.
 *
 * Collection Structure:
 * - gwi_tenants/{tenantId}/schedules/{scheduleId}
 *
 * @module @gwi/core/storage/firestore
 */

import type { Firestore, DocumentReference, Query, CollectionReference } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import type {
  ScheduleStore,
  WorkflowSchedule,
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

interface ScheduleDoc {
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

function scheduleDocToModel(doc: ScheduleDoc): WorkflowSchedule {
  return {
    id: doc.id,
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
export class FirestoreScheduleStore implements ScheduleStore {
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

  private schedulesRef(tenantId: string): CollectionReference {
    return this.tenantsRef().doc(tenantId).collection(COLLECTIONS.SCHEDULES);
  }

  private scheduleDoc(tenantId: string, scheduleId: string): DocumentReference {
    return this.schedulesRef(tenantId).doc(scheduleId);
  }

  // ---------------------------------------------------------------------------
  // Schedule CRUD
  // ---------------------------------------------------------------------------

  async createSchedule(
    schedule: Omit<WorkflowSchedule, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<WorkflowSchedule> {
    const now = new Date();
    const scheduleId = generateFirestoreId('sched');

    const fullSchedule: WorkflowSchedule = {
      ...schedule,
      id: scheduleId,
      createdAt: now,
      updatedAt: now,
    };

    const doc = scheduleModelToDoc(fullSchedule);
    await this.scheduleDoc(schedule.tenantId, scheduleId).set(doc);

    return fullSchedule;
  }

  async getSchedule(scheduleId: string): Promise<WorkflowSchedule | null> {
    // We need to search across all tenants since we only have scheduleId
    // This is inefficient but matches the interface contract
    const tenantsSnapshot = await this.tenantsRef().get();

    for (const tenantDoc of tenantsSnapshot.docs) {
      const scheduleSnapshot = await this.schedulesRef(tenantDoc.id).doc(scheduleId).get();
      if (scheduleSnapshot.exists) {
        return scheduleDocToModel(scheduleSnapshot.data() as ScheduleDoc);
      }
    }

    return null;
  }

  async listSchedules(instanceId: string): Promise<WorkflowSchedule[]> {
    // We need to find the tenant for this instance first
    const tenantsSnapshot = await this.tenantsRef().get();

    for (const tenantDoc of tenantsSnapshot.docs) {
      const snapshot = await this.schedulesRef(tenantDoc.id)
        .where('instanceId', '==', instanceId)
        .orderBy('createdAt', 'desc')
        .get();

      if (!snapshot.empty) {
        return snapshot.docs.map(doc => scheduleDocToModel(doc.data() as ScheduleDoc));
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
    let query: Query = this.schedulesRef(tenantId);

    if (filter?.enabled !== undefined) {
      query = query.where('enabled', '==', filter.enabled);
    }

    query = query.orderBy('createdAt', 'desc');

    if (filter?.limit) {
      query = query.limit(filter.limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => scheduleDocToModel(doc.data() as ScheduleDoc));
  }

  async listDueSchedules(beforeTime: Date): Promise<WorkflowSchedule[]> {
    // Query across all tenants for due schedules
    // In production, consider using a top-level schedules collection with composite index
    const tenantsSnapshot = await this.tenantsRef().get();
    const dueSchedules: WorkflowSchedule[] = [];

    for (const tenantDoc of tenantsSnapshot.docs) {
      const snapshot = await this.schedulesRef(tenantDoc.id)
        .where('enabled', '==', true)
        .where('nextTriggerAt', '<=', Timestamp.fromDate(beforeTime))
        .get();

      for (const doc of snapshot.docs) {
        dueSchedules.push(scheduleDocToModel(doc.data() as ScheduleDoc));
      }
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

    const doc = scheduleModelToDoc(updated);
    await this.scheduleDoc(existing.tenantId, scheduleId).set(doc, { merge: true });

    return updated;
  }

  async updateLastTriggered(scheduleId: string, triggeredAt: Date, nextTriggerAt: Date): Promise<void> {
    const existing = await this.getSchedule(scheduleId);
    if (!existing) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    await this.scheduleDoc(existing.tenantId, scheduleId).update({
      lastTriggeredAt: dateToTimestamp(triggeredAt),
      nextTriggerAt: dateToTimestamp(nextTriggerAt),
      updatedAt: Timestamp.now(),
    });
  }

  async deleteSchedule(scheduleId: string): Promise<void> {
    // Find the schedule first to get tenantId
    const existing = await this.getSchedule(scheduleId);
    if (!existing) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    await this.scheduleDoc(existing.tenantId, scheduleId).delete();
  }
}
