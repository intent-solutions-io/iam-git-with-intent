/**
 * Firestore Metering Store
 *
 * Phase 22: Metering + Billing + Plan Limits
 *
 * Provides Firestore-backed storage for:
 * - Usage events (append-only ledger)
 * - Daily usage aggregates
 * - Monthly usage aggregates
 * - Usage snapshots (current state per tenant)
 *
 * Collections:
 * - gwi_usage_events: Append-only usage event log
 * - gwi_usage_daily: Daily aggregates by tenant
 * - gwi_usage_monthly: Monthly aggregates by tenant
 * - gwi_usage_snapshots: Current usage state per tenant
 *
 * @module @gwi/core/storage/firestore-metering
 */

import { FieldValue, type Firestore, Timestamp } from 'firebase-admin/firestore';
import {
  getFirestoreClient,
  COLLECTIONS,
  generateFirestoreId,
  timestampToDate,
} from './firestore-client.js';
import {
  type ExtendedUsageEvent,
  type DailyUsageAggregate,
  type MonthlyUsageAggregate,
  createEmptyDailyAggregate,
  createEmptyMonthlyAggregate,
  updateDailyAggregate,
} from '../billing/usage.js';
import {
  type TenantUsageSnapshot,
  type MeteredResource,
  createEmptyUsageSnapshot,
  needsDailyReset,
  needsMonthlyReset,
  resetDailyCounters,
  resetMonthlyCounters,
} from '../billing/entitlements.js';
// Note: PlanId is part of TenantUsageSnapshot but imported via entitlements.js

// =============================================================================
// Metering Store Interface
// =============================================================================

/**
 * Metering store interface for usage tracking
 */
export interface MeteringStore {
  // Usage Events (append-only ledger)
  recordEvent(event: Omit<ExtendedUsageEvent, 'id'>): Promise<ExtendedUsageEvent>;
  recordEvents(events: Omit<ExtendedUsageEvent, 'id'>[]): Promise<ExtendedUsageEvent[]>;
  getEvents(tenantId: string, options?: EventQueryOptions): Promise<ExtendedUsageEvent[]>;
  markEventsInvoiced(eventIds: string[], invoiceId: string): Promise<void>;

  // Daily Aggregates
  getDailyAggregate(tenantId: string, dateKey: string): Promise<DailyUsageAggregate | null>;
  updateDailyAggregate(tenantId: string, dateKey: string, event: ExtendedUsageEvent): Promise<void>;

  // Monthly Aggregates
  getMonthlyAggregate(tenantId: string, periodKey: string): Promise<MonthlyUsageAggregate | null>;
  updateMonthlyCounters(
    tenantId: string,
    periodKey: string,
    updates: Partial<MonthlyUsageAggregate['counters']>
  ): Promise<void>;

  // Usage Snapshots (current state)
  getUsageSnapshot(tenantId: string): Promise<TenantUsageSnapshot | null>;
  incrementUsage(
    tenantId: string,
    resource: MeteredResource,
    amount?: number
  ): Promise<TenantUsageSnapshot>;
  resetDailyUsage(tenantId: string): Promise<void>;
  resetMonthlyUsage(tenantId: string): Promise<void>;
}

/**
 * Query options for usage events
 */
export interface EventQueryOptions {
  /** Start date (inclusive) */
  startDate?: Date;
  /** End date (inclusive) */
  endDate?: Date;
  /** Filter by event type */
  type?: string;
  /** Filter by invoiced status */
  invoiced?: boolean;
  /** Max results */
  limit?: number;
  /** Cursor for pagination */
  startAfter?: string;
}

// =============================================================================
// Firestore Metering Store Implementation
// =============================================================================

/**
 * Firestore-backed metering store
 */
export class FirestoreMeteringStore implements MeteringStore {
  private db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestoreClient();
  }

  // ===========================================================================
  // Usage Events
  // ===========================================================================

  async recordEvent(event: Omit<ExtendedUsageEvent, 'id'>): Promise<ExtendedUsageEvent> {
    const id = generateFirestoreId('ue');
    const fullEvent: ExtendedUsageEvent = { ...event, id };

    const docData = this.eventToFirestore(fullEvent);
    await this.db.collection(COLLECTIONS.USAGE_EVENTS).doc(id).set(docData);

    // Update daily aggregate
    await this.updateDailyAggregate(event.tenantId, event.dateKey, fullEvent);

    return fullEvent;
  }

  async recordEvents(events: Omit<ExtendedUsageEvent, 'id'>[]): Promise<ExtendedUsageEvent[]> {
    if (events.length === 0) return [];

    const batch = this.db.batch();
    const fullEvents: ExtendedUsageEvent[] = [];

    for (const event of events) {
      const id = generateFirestoreId('ue');
      const fullEvent: ExtendedUsageEvent = { ...event, id };
      fullEvents.push(fullEvent);

      const docRef = this.db.collection(COLLECTIONS.USAGE_EVENTS).doc(id);
      batch.set(docRef, this.eventToFirestore(fullEvent));
    }

    await batch.commit();

    // Update daily aggregates (grouped by tenant and date)
    const groupedEvents = new Map<string, ExtendedUsageEvent[]>();
    for (const event of fullEvents) {
      const key = `${event.tenantId}:${event.dateKey}`;
      if (!groupedEvents.has(key)) {
        groupedEvents.set(key, []);
      }
      groupedEvents.get(key)!.push(event);
    }

    for (const [, eventsForDate] of groupedEvents) {
      for (const event of eventsForDate) {
        await this.updateDailyAggregate(event.tenantId, event.dateKey, event);
      }
    }

    return fullEvents;
  }

  async getEvents(tenantId: string, options?: EventQueryOptions): Promise<ExtendedUsageEvent[]> {
    let query = this.db
      .collection(COLLECTIONS.USAGE_EVENTS)
      .where('tenantId', '==', tenantId)
      .orderBy('timestamp', 'desc');

    if (options?.startDate) {
      query = query.where('timestamp', '>=', Timestamp.fromDate(options.startDate));
    }
    if (options?.endDate) {
      query = query.where('timestamp', '<=', Timestamp.fromDate(options.endDate));
    }
    if (options?.type) {
      query = query.where('type', '==', options.type);
    }
    if (options?.invoiced !== undefined) {
      query = query.where('invoiced', '==', options.invoiced);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.startAfter) {
      const startDoc = await this.db.collection(COLLECTIONS.USAGE_EVENTS).doc(options.startAfter).get();
      if (startDoc.exists) {
        query = query.startAfter(startDoc);
      }
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => this.eventFromFirestore(doc.id, doc.data()));
  }

  async markEventsInvoiced(eventIds: string[], invoiceId: string): Promise<void> {
    const batch = this.db.batch();

    for (const id of eventIds) {
      const docRef = this.db.collection(COLLECTIONS.USAGE_EVENTS).doc(id);
      batch.update(docRef, {
        invoiced: true,
        invoiceId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
  }

  // ===========================================================================
  // Daily Aggregates
  // ===========================================================================

  async getDailyAggregate(tenantId: string, dateKey: string): Promise<DailyUsageAggregate | null> {
    const docId = `${tenantId}:${dateKey}`;
    const doc = await this.db.collection(COLLECTIONS.USAGE_DAILY).doc(docId).get();

    if (!doc.exists) return null;

    return this.dailyAggregateFromFirestore(doc.data()!);
  }

  async updateDailyAggregate(
    tenantId: string,
    dateKey: string,
    event: ExtendedUsageEvent
  ): Promise<void> {
    const docId = `${tenantId}:${dateKey}`;
    const docRef = this.db.collection(COLLECTIONS.USAGE_DAILY).doc(docId);

    await this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      let aggregate: DailyUsageAggregate;
      if (doc.exists) {
        aggregate = this.dailyAggregateFromFirestore(doc.data()!);
      } else {
        aggregate = createEmptyDailyAggregate(tenantId, dateKey);
      }

      // Update aggregate with event
      const updated = updateDailyAggregate(aggregate, event);

      transaction.set(docRef, this.dailyAggregateToFirestore(updated), { merge: true });
    });
  }

  // ===========================================================================
  // Monthly Aggregates
  // ===========================================================================

  async getMonthlyAggregate(
    tenantId: string,
    periodKey: string
  ): Promise<MonthlyUsageAggregate | null> {
    const docId = `${tenantId}:${periodKey}`;
    const doc = await this.db.collection(COLLECTIONS.USAGE_MONTHLY).doc(docId).get();

    if (!doc.exists) return null;

    return this.monthlyAggregateFromFirestore(doc.data()!);
  }

  async updateMonthlyCounters(
    tenantId: string,
    periodKey: string,
    updates: Partial<MonthlyUsageAggregate['counters']>
  ): Promise<void> {
    const docId = `${tenantId}:${periodKey}`;
    const docRef = this.db.collection(COLLECTIONS.USAGE_MONTHLY).doc(docId);

    await this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      let aggregate: MonthlyUsageAggregate;
      if (doc.exists) {
        aggregate = this.monthlyAggregateFromFirestore(doc.data()!);
      } else {
        aggregate = createEmptyMonthlyAggregate(tenantId, periodKey);
      }

      // Apply updates with FieldValue.increment for atomic updates
      const firestoreUpdates: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      for (const [key, value] of Object.entries(updates)) {
        if (typeof value === 'number') {
          firestoreUpdates[`counters.${key}`] = FieldValue.increment(value);
        }
      }

      if (doc.exists) {
        transaction.update(docRef, firestoreUpdates);
      } else {
        // Set initial document then apply increments
        transaction.set(docRef, this.monthlyAggregateToFirestore(aggregate));
        transaction.update(docRef, firestoreUpdates);
      }
    });
  }

  // ===========================================================================
  // Usage Snapshots
  // ===========================================================================

  async getUsageSnapshot(tenantId: string): Promise<TenantUsageSnapshot | null> {
    const doc = await this.db.collection(COLLECTIONS.USAGE_SNAPSHOTS).doc(tenantId).get();

    if (!doc.exists) return null;

    let snapshot = this.snapshotFromFirestore(doc.data()!);

    // Check if resets are needed
    let needsUpdate = false;
    if (needsDailyReset(snapshot)) {
      snapshot = resetDailyCounters(snapshot);
      needsUpdate = true;
    }
    if (needsMonthlyReset(snapshot)) {
      snapshot = resetMonthlyCounters(snapshot);
      needsUpdate = true;
    }

    // Persist reset if needed
    if (needsUpdate) {
      await this.db
        .collection(COLLECTIONS.USAGE_SNAPSHOTS)
        .doc(tenantId)
        .set(this.snapshotToFirestore(snapshot), { merge: true });
    }

    return snapshot;
  }

  async incrementUsage(
    tenantId: string,
    resource: MeteredResource,
    amount: number = 1
  ): Promise<TenantUsageSnapshot> {
    const docRef = this.db.collection(COLLECTIONS.USAGE_SNAPSHOTS).doc(tenantId);

    const result = await this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      let snapshot: TenantUsageSnapshot;
      if (doc.exists) {
        snapshot = this.snapshotFromFirestore(doc.data()!);
      } else {
        // Get tenant's plan (default to free)
        snapshot = createEmptyUsageSnapshot(tenantId, 'free');
      }

      // Check for resets
      if (needsDailyReset(snapshot)) {
        snapshot = resetDailyCounters(snapshot);
      }
      if (needsMonthlyReset(snapshot)) {
        snapshot = resetMonthlyCounters(snapshot);
      }

      // Increment appropriate counter
      snapshot = this.incrementSnapshotCounter(snapshot, resource, amount);
      snapshot.lastUpdated = new Date();

      transaction.set(docRef, this.snapshotToFirestore(snapshot));

      return snapshot;
    });

    return result;
  }

  async resetDailyUsage(tenantId: string): Promise<void> {
    const docRef = this.db.collection(COLLECTIONS.USAGE_SNAPSHOTS).doc(tenantId);

    await this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      if (!doc.exists) return;

      let snapshot = this.snapshotFromFirestore(doc.data()!);
      snapshot = resetDailyCounters(snapshot);

      transaction.set(docRef, this.snapshotToFirestore(snapshot));
    });
  }

  async resetMonthlyUsage(tenantId: string): Promise<void> {
    const docRef = this.db.collection(COLLECTIONS.USAGE_SNAPSHOTS).doc(tenantId);

    await this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      if (!doc.exists) return;

      let snapshot = this.snapshotFromFirestore(doc.data()!);
      snapshot = resetMonthlyCounters(snapshot);

      transaction.set(docRef, this.snapshotToFirestore(snapshot));
    });
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private incrementSnapshotCounter(
    snapshot: TenantUsageSnapshot,
    resource: MeteredResource,
    amount: number
  ): TenantUsageSnapshot {
    const updated = { ...snapshot };

    switch (resource) {
      // Daily counters
      case 'runs_daily':
        updated.daily = { ...updated.daily, runs: updated.daily.runs + amount };
        break;
      case 'signals_daily':
        updated.daily = { ...updated.daily, signals: updated.daily.signals + amount };
        break;
      case 'candidates_daily':
        updated.daily = { ...updated.daily, candidates: updated.daily.candidates + amount };
        break;
      case 'api_calls_daily':
        updated.daily = { ...updated.daily, apiCalls: updated.daily.apiCalls + amount };
        break;
      case 'notifications_daily':
        updated.daily = { ...updated.daily, notifications: updated.daily.notifications + amount };
        break;

      // Monthly counters
      case 'runs_monthly':
        updated.monthly = { ...updated.monthly, runs: updated.monthly.runs + amount };
        break;
      case 'prs_monthly':
        updated.monthly = { ...updated.monthly, prs: updated.monthly.prs + amount };
        break;
      case 'connector_installs_monthly':
        updated.monthly = {
          ...updated.monthly,
          connectorInstalls: updated.monthly.connectorInstalls + amount,
        };
        break;
      case 'tokens_monthly':
        updated.monthly = { ...updated.monthly, tokens: updated.monthly.tokens + amount };
        break;

      // Static counters
      case 'repos':
        updated.static = { ...updated.static, repos: updated.static.repos + amount };
        break;
      case 'members':
        updated.static = { ...updated.static, members: updated.static.members + amount };
        break;
      case 'storage':
        updated.static = { ...updated.static, storageBytes: updated.static.storageBytes + amount };
        break;

      // Concurrent counters
      case 'concurrent_runs':
        updated.concurrent = { ...updated.concurrent, runs: updated.concurrent.runs + amount };
        break;
      case 'concurrent_webhooks':
        updated.concurrent = {
          ...updated.concurrent,
          webhooks: updated.concurrent.webhooks + amount,
        };
        break;
    }

    return updated;
  }

  // ===========================================================================
  // Firestore Converters
  // ===========================================================================

  private eventToFirestore(event: ExtendedUsageEvent): Record<string, unknown> {
    return {
      ...event,
      timestamp: Timestamp.fromDate(event.timestamp),
      createdAt: Timestamp.fromDate(event.createdAt),
    };
  }

  private eventFromFirestore(id: string, data: Record<string, unknown>): ExtendedUsageEvent {
    return {
      ...data,
      id,
      timestamp: timestampToDate(data.timestamp as Timestamp) ?? new Date(),
      createdAt: timestampToDate(data.createdAt as Timestamp) ?? new Date(),
    } as ExtendedUsageEvent;
  }

  private dailyAggregateToFirestore(aggregate: DailyUsageAggregate): Record<string, unknown> {
    return {
      ...aggregate,
      firstEventAt: Timestamp.fromDate(aggregate.firstEventAt),
      lastEventAt: Timestamp.fromDate(aggregate.lastEventAt),
      updatedAt: Timestamp.fromDate(aggregate.updatedAt),
    };
  }

  private dailyAggregateFromFirestore(data: Record<string, unknown>): DailyUsageAggregate {
    return {
      ...data,
      firstEventAt: timestampToDate(data.firstEventAt as Timestamp) ?? new Date(),
      lastEventAt: timestampToDate(data.lastEventAt as Timestamp) ?? new Date(),
      updatedAt: timestampToDate(data.updatedAt as Timestamp) ?? new Date(),
    } as DailyUsageAggregate;
  }

  private monthlyAggregateToFirestore(aggregate: MonthlyUsageAggregate): Record<string, unknown> {
    return {
      ...aggregate,
      createdAt: Timestamp.fromDate(aggregate.createdAt),
      updatedAt: Timestamp.fromDate(aggregate.updatedAt),
    };
  }

  private monthlyAggregateFromFirestore(data: Record<string, unknown>): MonthlyUsageAggregate {
    return {
      ...data,
      createdAt: timestampToDate(data.createdAt as Timestamp) ?? new Date(),
      updatedAt: timestampToDate(data.updatedAt as Timestamp) ?? new Date(),
    } as MonthlyUsageAggregate;
  }

  private snapshotToFirestore(snapshot: TenantUsageSnapshot): Record<string, unknown> {
    return {
      ...snapshot,
      lastUpdated: Timestamp.fromDate(snapshot.lastUpdated),
    };
  }

  private snapshotFromFirestore(data: Record<string, unknown>): TenantUsageSnapshot {
    return {
      ...data,
      lastUpdated: timestampToDate(data.lastUpdated as Timestamp) ?? new Date(),
    } as TenantUsageSnapshot;
  }
}

// =============================================================================
// In-Memory Metering Store (for testing)
// =============================================================================

/**
 * In-memory metering store for development and testing
 */
export class InMemoryMeteringStore implements MeteringStore {
  private events = new Map<string, ExtendedUsageEvent>();
  private dailyAggregates = new Map<string, DailyUsageAggregate>();
  private monthlyAggregates = new Map<string, MonthlyUsageAggregate>();
  private snapshots = new Map<string, TenantUsageSnapshot>();

  async recordEvent(event: Omit<ExtendedUsageEvent, 'id'>): Promise<ExtendedUsageEvent> {
    const id = `ue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullEvent: ExtendedUsageEvent = { ...event, id };

    this.events.set(id, fullEvent);

    // Update daily aggregate
    await this.updateDailyAggregate(event.tenantId, event.dateKey, fullEvent);

    return fullEvent;
  }

  async recordEvents(events: Omit<ExtendedUsageEvent, 'id'>[]): Promise<ExtendedUsageEvent[]> {
    const results: ExtendedUsageEvent[] = [];
    for (const event of events) {
      const recorded = await this.recordEvent(event);
      results.push(recorded);
    }
    return results;
  }

  async getEvents(tenantId: string, options?: EventQueryOptions): Promise<ExtendedUsageEvent[]> {
    let events = Array.from(this.events.values()).filter((e) => e.tenantId === tenantId);

    if (options?.startDate) {
      events = events.filter((e) => e.timestamp >= options.startDate!);
    }
    if (options?.endDate) {
      events = events.filter((e) => e.timestamp <= options.endDate!);
    }
    if (options?.type) {
      events = events.filter((e) => e.type === options.type);
    }
    if (options?.invoiced !== undefined) {
      events = events.filter((e) => e.invoiced === options.invoiced);
    }

    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options?.limit) {
      events = events.slice(0, options.limit);
    }

    return events;
  }

  async markEventsInvoiced(eventIds: string[], invoiceId: string): Promise<void> {
    for (const id of eventIds) {
      const event = this.events.get(id);
      if (event) {
        event.invoiced = true;
        event.invoiceId = invoiceId;
      }
    }
  }

  async getDailyAggregate(tenantId: string, dateKey: string): Promise<DailyUsageAggregate | null> {
    return this.dailyAggregates.get(`${tenantId}:${dateKey}`) ?? null;
  }

  async updateDailyAggregate(
    tenantId: string,
    dateKey: string,
    event: ExtendedUsageEvent
  ): Promise<void> {
    const key = `${tenantId}:${dateKey}`;
    let aggregate = this.dailyAggregates.get(key);

    if (!aggregate) {
      aggregate = createEmptyDailyAggregate(tenantId, dateKey);
    }

    const updated = updateDailyAggregate(aggregate, event);
    this.dailyAggregates.set(key, updated);
  }

  async getMonthlyAggregate(
    tenantId: string,
    periodKey: string
  ): Promise<MonthlyUsageAggregate | null> {
    return this.monthlyAggregates.get(`${tenantId}:${periodKey}`) ?? null;
  }

  async updateMonthlyCounters(
    tenantId: string,
    periodKey: string,
    updates: Partial<MonthlyUsageAggregate['counters']>
  ): Promise<void> {
    const key = `${tenantId}:${periodKey}`;
    let aggregate = this.monthlyAggregates.get(key);

    if (!aggregate) {
      aggregate = createEmptyMonthlyAggregate(tenantId, periodKey);
    }

    for (const [counterKey, value] of Object.entries(updates)) {
      if (typeof value === 'number') {
        (aggregate.counters as Record<string, number>)[counterKey] =
          ((aggregate.counters as Record<string, number>)[counterKey] ?? 0) + value;
      }
    }

    aggregate.updatedAt = new Date();
    this.monthlyAggregates.set(key, aggregate);
  }

  async getUsageSnapshot(tenantId: string): Promise<TenantUsageSnapshot | null> {
    let snapshot = this.snapshots.get(tenantId);
    if (!snapshot) return null;

    // Check for resets
    if (needsDailyReset(snapshot)) {
      snapshot = resetDailyCounters(snapshot);
      this.snapshots.set(tenantId, snapshot);
    }
    if (needsMonthlyReset(snapshot)) {
      snapshot = resetMonthlyCounters(snapshot);
      this.snapshots.set(tenantId, snapshot);
    }

    return snapshot;
  }

  async incrementUsage(
    tenantId: string,
    resource: MeteredResource,
    amount: number = 1
  ): Promise<TenantUsageSnapshot> {
    let snapshot = this.snapshots.get(tenantId);

    if (!snapshot) {
      snapshot = createEmptyUsageSnapshot(tenantId, 'free');
    }

    // Check for resets
    if (needsDailyReset(snapshot)) {
      snapshot = resetDailyCounters(snapshot);
    }
    if (needsMonthlyReset(snapshot)) {
      snapshot = resetMonthlyCounters(snapshot);
    }

    // Increment counter (inline implementation for in-memory)
    snapshot = this.incrementCounter(snapshot, resource, amount);
    snapshot.lastUpdated = new Date();

    this.snapshots.set(tenantId, snapshot);
    return snapshot;
  }

  async resetDailyUsage(tenantId: string): Promise<void> {
    const snapshot = this.snapshots.get(tenantId);
    if (snapshot) {
      this.snapshots.set(tenantId, resetDailyCounters(snapshot));
    }
  }

  async resetMonthlyUsage(tenantId: string): Promise<void> {
    const snapshot = this.snapshots.get(tenantId);
    if (snapshot) {
      this.snapshots.set(tenantId, resetMonthlyCounters(snapshot));
    }
  }

  // For testing: set snapshot directly
  setSnapshot(tenantId: string, snapshot: TenantUsageSnapshot): void {
    this.snapshots.set(tenantId, snapshot);
  }

  private incrementCounter(
    snapshot: TenantUsageSnapshot,
    resource: MeteredResource,
    amount: number
  ): TenantUsageSnapshot {
    const updated = JSON.parse(JSON.stringify(snapshot)) as TenantUsageSnapshot;

    switch (resource) {
      case 'runs_daily':
        updated.daily.runs += amount;
        break;
      case 'signals_daily':
        updated.daily.signals += amount;
        break;
      case 'candidates_daily':
        updated.daily.candidates += amount;
        break;
      case 'api_calls_daily':
        updated.daily.apiCalls += amount;
        break;
      case 'notifications_daily':
        updated.daily.notifications += amount;
        break;
      case 'runs_monthly':
        updated.monthly.runs += amount;
        break;
      case 'prs_monthly':
        updated.monthly.prs += amount;
        break;
      case 'connector_installs_monthly':
        updated.monthly.connectorInstalls += amount;
        break;
      case 'tokens_monthly':
        updated.monthly.tokens += amount;
        break;
      case 'repos':
        updated.static.repos += amount;
        break;
      case 'members':
        updated.static.members += amount;
        break;
      case 'storage':
        updated.static.storageBytes += amount;
        break;
      case 'concurrent_runs':
        updated.concurrent.runs += amount;
        break;
      case 'concurrent_webhooks':
        updated.concurrent.webhooks += amount;
        break;
    }

    return updated;
  }
}

// =============================================================================
// Singleton Access
// =============================================================================

let meteringStoreInstance: MeteringStore | null = null;

/**
 * Get the metering store instance
 */
export function getMeteringStore(): MeteringStore {
  if (!meteringStoreInstance) {
    // Default to in-memory for development
    const backend = process.env.GWI_STORE_BACKEND;
    if (backend === 'firestore') {
      meteringStoreInstance = new FirestoreMeteringStore();
    } else {
      meteringStoreInstance = new InMemoryMeteringStore();
    }
  }
  return meteringStoreInstance;
}

/**
 * Set a custom metering store
 */
export function setMeteringStore(store: MeteringStore): void {
  meteringStoreInstance = store;
}

/**
 * Reset the metering store singleton (for testing)
 */
export function resetMeteringStore(): void {
  meteringStoreInstance = null;
}
