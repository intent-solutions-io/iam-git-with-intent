/**
 * SDLC Event Store Implementation
 *
 * EPIC 002: SDLC Telemetry + Bottleneck Measurement
 *
 * Provides storage backends for SDLC events:
 * - Firestore for production
 * - In-memory for testing
 * - SQLite for local development (future)
 *
 * @module @gwi/core/telemetry/sdlc-event-store
 */

import type {
  SDLCEvent,
  SDLCEventStore,
  SDLCEventQueryOptions,
  StageTimingsOptions,
  StageTimings,
  SDLCStage,
} from './sdlc-events.js';
import { info, warn } from './logger.js';

// =============================================================================
// In-Memory Store (for testing and local dev)
// =============================================================================

/**
 * In-memory SDLC event store
 */
export class InMemorySDLCEventStore implements SDLCEventStore {
  private events: SDLCEvent[] = [];
  private maxEvents: number;

  constructor(options?: { maxEvents?: number }) {
    this.maxEvents = options?.maxEvents ?? 10000;
  }

  async store(event: SDLCEvent): Promise<void> {
    this.events.push(event);

    // Enforce max events (FIFO)
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  async query(options: SDLCEventQueryOptions): Promise<SDLCEvent[]> {
    let filtered = this.events;

    if (options.tenantId) {
      filtered = filtered.filter((e) => e.tenantId === options.tenantId);
    }
    if (options.stage) {
      filtered = filtered.filter((e) => e.stage === options.stage);
    }
    if (options.action) {
      filtered = filtered.filter((e) => e.action === options.action);
    }
    if (options.runId) {
      filtered = filtered.filter((e) => e.runId === options.runId);
    }
    if (options.prNumber) {
      filtered = filtered.filter((e) => e.prNumber === options.prNumber);
    }
    if (options.repository) {
      filtered = filtered.filter((e) => e.repository === options.repository);
    }
    if (options.since) {
      const sinceTs = options.since.getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= sinceTs);
    }
    if (options.until) {
      const untilTs = options.until.getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() <= untilTs);
    }

    // Sort by timestamp descending
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  async getStageTimings(options: StageTimingsOptions): Promise<StageTimings[]> {
    let events = await this.query({
      tenantId: options.tenantId,
      since: options.since,
      until: options.until,
    });

    // Filter to completed/failed events with duration
    events = events.filter(
      (e) => (e.action === 'completed' || e.action === 'failed') && e.durationMs !== undefined
    );

    if (options.repository) {
      events = events.filter((e) => e.repository === options.repository);
    }

    // Group by stage
    const stages: SDLCStage[] = ['planning', 'coding', 'review', 'testing', 'release', 'incident', 'onboarding'];
    const timings: StageTimings[] = [];

    for (const stage of stages) {
      const stageEvents = events.filter((e) => e.stage === stage);
      if (stageEvents.length === 0) continue;

      const durations = stageEvents
        .map((e) => e.durationMs!)
        .filter((d) => d !== undefined)
        .sort((a, b) => a - b);

      if (durations.length === 0) continue;

      const completedCount = stageEvents.filter((e) => e.action === 'completed').length;
      const failedCount = stageEvents.filter((e) => e.action === 'failed').length;
      const sum = durations.reduce((a, b) => a + b, 0);

      timings.push({
        stage,
        count: stageEvents.length,
        completedCount,
        failedCount,
        avgDurationMs: Math.round(sum / durations.length),
        p50DurationMs: percentile(durations, 50),
        p95DurationMs: percentile(durations, 95),
        p99DurationMs: percentile(durations, 99),
      });
    }

    return timings;
  }

  /**
   * Clear all events (for testing)
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Get event count
   */
  count(): number {
    return this.events.length;
  }
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

// =============================================================================
// Firestore Store (for production)
// =============================================================================

/**
 * Firestore SDLC event store
 */
export class FirestoreSDLCEventStore implements SDLCEventStore {
  private collectionName: string;
  private retentionDays: number;

  constructor(options?: { collectionName?: string; retentionDays?: number }) {
    this.collectionName = options?.collectionName ?? 'sdlc_events';
    this.retentionDays = options?.retentionDays ?? 90;
  }

  async store(event: SDLCEvent): Promise<void> {
    try {
      // Dynamic import to avoid bundling issues
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();

      await db.collection(this.collectionName).doc(event.eventId).set({
        ...event,
        // Add TTL field for Firestore auto-deletion
        _expiresAt: new Date(Date.now() + this.retentionDays * 24 * 60 * 60 * 1000),
      });

      info('SDLC event stored', { eventId: event.eventId, stage: event.stage });
    } catch (error) {
      warn('Failed to store SDLC event', { eventId: event.eventId, error: String(error) });
      throw error;
    }
  }

  async query(options: SDLCEventQueryOptions): Promise<SDLCEvent[]> {
    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();

      let query: FirebaseFirestore.Query = db.collection(this.collectionName);

      if (options.tenantId) {
        query = query.where('tenantId', '==', options.tenantId);
      }
      if (options.stage) {
        query = query.where('stage', '==', options.stage);
      }
      if (options.action) {
        query = query.where('action', '==', options.action);
      }
      if (options.runId) {
        query = query.where('runId', '==', options.runId);
      }
      if (options.prNumber) {
        query = query.where('prNumber', '==', options.prNumber);
      }
      if (options.repository) {
        query = query.where('repository', '==', options.repository);
      }
      if (options.since) {
        query = query.where('timestamp', '>=', options.since.toISOString());
      }
      if (options.until) {
        query = query.where('timestamp', '<=', options.until.toISOString());
      }

      query = query.orderBy('timestamp', 'desc');

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const snapshot = await query.get();
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        // Remove internal fields
        delete data._expiresAt;
        return data as SDLCEvent;
      });
    } catch (error) {
      warn('Failed to query SDLC events', { error: String(error) });
      throw error;
    }
  }

  async getStageTimings(options: StageTimingsOptions): Promise<StageTimings[]> {
    // For Firestore, we query events and aggregate in-memory
    // In production, this could be optimized with BigQuery or aggregation
    const events = await this.query({
      tenantId: options.tenantId,
      since: options.since,
      until: options.until,
    });

    // Use same aggregation logic as in-memory store
    const inMemory = new InMemorySDLCEventStore();
    for (const event of events) {
      await inMemory.store(event);
    }
    return inMemory.getStageTimings(options);
  }
}

// =============================================================================
// Store Factory
// =============================================================================

let defaultStore: SDLCEventStore | null = null;

/**
 * Get the default SDLC event store
 */
export function getSDLCEventStore(): SDLCEventStore {
  if (!defaultStore) {
    const backend = process.env.GWI_STORE_BACKEND ?? 'memory';
    defaultStore = createSDLCEventStore(backend);
  }
  return defaultStore;
}

/**
 * Set a custom default store
 */
export function setSDLCEventStore(store: SDLCEventStore): void {
  defaultStore = store;
}

/**
 * Create an SDLC event store by type
 */
export function createSDLCEventStore(
  type: 'memory' | 'firestore' | string,
  options?: { collectionName?: string; retentionDays?: number; maxEvents?: number }
): SDLCEventStore {
  switch (type) {
    case 'firestore':
      return new FirestoreSDLCEventStore(options);
    case 'memory':
    default:
      return new InMemorySDLCEventStore(options);
  }
}
