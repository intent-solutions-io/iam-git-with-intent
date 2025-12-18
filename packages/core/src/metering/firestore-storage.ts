/**
 * Phase 28: Firestore Metering Event Storage
 *
 * Firestore implementation of MeteringEventStorage for production.
 * Provider-agnostic storage for LLM usage metering.
 *
 * Collections:
 * - gwi_metering_events: Raw metering events
 * - gwi_metering_aggregates: Billing period aggregates
 *
 * @module @gwi/core/metering/firestore-storage
 */

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getFirestoreClient } from '../storage/firestore-client.js';
import type { MeteringEventStorage } from './service.js';
import type { MeteringEvent, UsageAggregate } from './types.js';

// =============================================================================
// Collection Names
// =============================================================================

export const METERING_COLLECTIONS = {
  /** Raw metering events */
  EVENTS: 'gwi_metering_events',
  /** Billing period aggregates */
  AGGREGATES: 'gwi_metering_aggregates',
} as const;

// =============================================================================
// Firestore Metering Event Storage
// =============================================================================

/**
 * Firestore implementation of MeteringEventStorage
 */
export class FirestoreMeteringEventStorage implements MeteringEventStorage {
  private db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestoreClient();
  }

  // ===========================================================================
  // Event Recording
  // ===========================================================================

  async recordEvent(event: MeteringEvent): Promise<void> {
    const docRef = this.db.collection(METERING_COLLECTIONS.EVENTS).doc(event.id);
    await docRef.set(this.eventToFirestore(event));
  }

  // ===========================================================================
  // Event Retrieval
  // ===========================================================================

  async getEvents(tenantId: string, start: Date, end: Date): Promise<MeteringEvent[]> {
    const snapshot = await this.db
      .collection(METERING_COLLECTIONS.EVENTS)
      .where('tenant_id', '==', tenantId)
      .where('ts', '>=', start.toISOString())
      .where('ts', '<=', end.toISOString())
      .orderBy('ts', 'desc')
      .get();

    return snapshot.docs.map((doc) => this.eventFromFirestore(doc.data()));
  }

  // ===========================================================================
  // Aggregate Management
  // ===========================================================================

  async getAggregate(
    tenantId: string,
    start: Date,
    end: Date
  ): Promise<UsageAggregate | null> {
    const docId = this.aggregateDocId(tenantId, start, end);
    const doc = await this.db
      .collection(METERING_COLLECTIONS.AGGREGATES)
      .doc(docId)
      .get();

    if (!doc.exists) {
      return null;
    }

    return this.aggregateFromFirestore(doc.data()!);
  }

  async saveAggregate(aggregate: UsageAggregate): Promise<void> {
    const start = new Date(aggregate.period_start);
    const end = new Date(aggregate.period_end);
    const docId = this.aggregateDocId(aggregate.tenant_id, start, end);

    await this.db
      .collection(METERING_COLLECTIONS.AGGREGATES)
      .doc(docId)
      .set(this.aggregateToFirestore(aggregate), { merge: true });
  }

  // ===========================================================================
  // Atomic Increment Operations
  // ===========================================================================

  /**
   * Atomically increment aggregate counters
   * (More efficient than read-modify-write for concurrent updates)
   */
  async incrementAggregate(
    tenantId: string,
    start: Date,
    end: Date,
    increments: {
      total_runs?: number;
      total_llm_calls?: number;
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      total_latency_ms?: number;
      total_cost_usd?: number;
    }
  ): Promise<void> {
    const docId = this.aggregateDocId(tenantId, start, end);
    const docRef = this.db.collection(METERING_COLLECTIONS.AGGREGATES).doc(docId);

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (increments.total_runs) {
      updates.total_runs = FieldValue.increment(increments.total_runs);
    }
    if (increments.total_llm_calls) {
      updates.total_llm_calls = FieldValue.increment(increments.total_llm_calls);
    }
    if (increments.input_tokens) {
      updates['total_tokens.input'] = FieldValue.increment(increments.input_tokens);
    }
    if (increments.output_tokens) {
      updates['total_tokens.output'] = FieldValue.increment(increments.output_tokens);
    }
    if (increments.total_tokens) {
      updates['total_tokens.total'] = FieldValue.increment(increments.total_tokens);
    }
    if (increments.total_latency_ms) {
      updates.total_latency_ms = FieldValue.increment(increments.total_latency_ms);
    }
    if (increments.total_cost_usd) {
      updates.total_cost_usd = FieldValue.increment(increments.total_cost_usd);
    }

    // Use set with merge to create if not exists
    const exists = await docRef.get().then((d) => d.exists);
    if (exists) {
      await docRef.update(updates);
    } else {
      // Create initial aggregate then apply increments
      const initial: UsageAggregate = {
        tenant_id: tenantId,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
        total_runs: 0,
        total_llm_calls: 0,
        total_tokens: { input: 0, output: 0, total: 0 },
        total_latency_ms: 0,
        total_cost_usd: 0,
        by_provider: {},
        by_model: {},
        updated_at: new Date().toISOString(),
      };
      await docRef.set(this.aggregateToFirestore(initial));
      await docRef.update(updates);
    }
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private aggregateDocId(tenantId: string, start: Date, _end?: Date): string {
    // Use YYYY-MM format for monthly billing periods
    // Note: _end is unused since we key by period start month
    const startMonth = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    return `${tenantId}:${startMonth}`;
  }

  private eventToFirestore(event: MeteringEvent): Record<string, unknown> {
    return {
      ...event,
      _created_at: FieldValue.serverTimestamp(),
    };
  }

  private eventFromFirestore(data: Record<string, unknown>): MeteringEvent {
    // Remove Firestore-specific fields
    const { _created_at, ...rest } = data;
    return rest as MeteringEvent;
  }

  private aggregateToFirestore(aggregate: UsageAggregate): Record<string, unknown> {
    return {
      ...aggregate,
      _updated_at: FieldValue.serverTimestamp(),
    };
  }

  private aggregateFromFirestore(data: Record<string, unknown>): UsageAggregate {
    // Remove Firestore-specific fields
    const { _updated_at, ...rest } = data;
    return rest as UsageAggregate;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a Firestore metering event storage instance
 */
export function createFirestoreMeteringEventStorage(
  db?: Firestore
): FirestoreMeteringEventStorage {
  return new FirestoreMeteringEventStorage(db);
}
