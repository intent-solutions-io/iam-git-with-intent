/**
 * Idempotency Metrics
 *
 * A4.s5: Observability counters for idempotency layer.
 *
 * Tracks:
 * - Total requests checked
 * - Duplicate requests skipped
 * - New requests processed
 * - Processing conflicts (concurrent requests)
 * - Lock expirations (timeout recoveries)
 * - TTL cleanups
 *
 * @module @gwi/engine/idempotency
 */

import type { EventSource } from './types.js';

// =============================================================================
// Metric Types
// =============================================================================

/**
 * Idempotency metrics
 */
export interface IdempotencyMetrics {
  /** Total requests checked */
  checksTotal: number;

  /** Requests that proceeded (new) */
  newRequests: number;

  /** Requests skipped as duplicates */
  duplicatesSkipped: number;

  /** Requests that hit processing lock */
  processingConflicts: number;

  /** Locks that expired and were recovered */
  lockRecoveries: number;

  /** Requests completed successfully */
  completedTotal: number;

  /** Requests that failed */
  failedTotal: number;

  /** Records cleaned up via TTL */
  ttlCleanups: number;

  /** Metrics by source */
  bySource: Record<EventSource, SourceMetrics>;
}

/**
 * Per-source metrics
 */
export interface SourceMetrics {
  checks: number;
  new: number;
  duplicates: number;
  conflicts: number;
}

// =============================================================================
// Metric Counter
// =============================================================================

/**
 * Idempotency metric collector
 *
 * Provides counters for monitoring idempotency layer behavior.
 * Can be exported to Prometheus, Cloud Monitoring, or other systems.
 */
export class IdempotencyMetricCollector {
  private metrics: IdempotencyMetrics;
  private startTime: Date;

  constructor() {
    this.metrics = this.createEmptyMetrics();
    this.startTime = new Date();
  }

  /**
   * Record a check operation
   */
  recordCheck(source: EventSource, result: 'new' | 'duplicate' | 'processing'): void {
    this.metrics.checksTotal++;
    this.ensureSourceMetrics(source);
    this.metrics.bySource[source].checks++;

    switch (result) {
      case 'new':
        this.metrics.newRequests++;
        this.metrics.bySource[source].new++;
        break;
      case 'duplicate':
        this.metrics.duplicatesSkipped++;
        this.metrics.bySource[source].duplicates++;
        break;
      case 'processing':
        this.metrics.processingConflicts++;
        this.metrics.bySource[source].conflicts++;
        break;
    }
  }

  /**
   * Record a lock recovery (expired lock was reacquired)
   */
  recordLockRecovery(): void {
    this.metrics.lockRecoveries++;
  }

  /**
   * Record a completed request
   */
  recordCompleted(): void {
    this.metrics.completedTotal++;
  }

  /**
   * Record a failed request
   */
  recordFailed(): void {
    this.metrics.failedTotal++;
  }

  /**
   * Record TTL cleanup
   */
  recordTtlCleanup(count: number): void {
    this.metrics.ttlCleanups += count;
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): IdempotencyMetrics {
    return { ...this.metrics };
  }

  /**
   * Get metrics as Prometheus-compatible format
   */
  toPrometheusFormat(): string {
    const lines: string[] = [];
    const labels = `service="gwi",component="idempotency"`;

    lines.push(`# HELP gwi_idempotency_checks_total Total idempotency checks`);
    lines.push(`# TYPE gwi_idempotency_checks_total counter`);
    lines.push(`gwi_idempotency_checks_total{${labels}} ${this.metrics.checksTotal}`);

    lines.push(`# HELP gwi_idempotency_new_total New (non-duplicate) requests`);
    lines.push(`# TYPE gwi_idempotency_new_total counter`);
    lines.push(`gwi_idempotency_new_total{${labels}} ${this.metrics.newRequests}`);

    lines.push(`# HELP gwi_idempotency_duplicates_skipped_total Duplicate requests skipped`);
    lines.push(`# TYPE gwi_idempotency_duplicates_skipped_total counter`);
    lines.push(`gwi_idempotency_duplicates_skipped_total{${labels}} ${this.metrics.duplicatesSkipped}`);

    lines.push(`# HELP gwi_idempotency_conflicts_total Processing conflicts (concurrent requests)`);
    lines.push(`# TYPE gwi_idempotency_conflicts_total counter`);
    lines.push(`gwi_idempotency_conflicts_total{${labels}} ${this.metrics.processingConflicts}`);

    lines.push(`# HELP gwi_idempotency_lock_recoveries_total Expired locks recovered`);
    lines.push(`# TYPE gwi_idempotency_lock_recoveries_total counter`);
    lines.push(`gwi_idempotency_lock_recoveries_total{${labels}} ${this.metrics.lockRecoveries}`);

    lines.push(`# HELP gwi_idempotency_completed_total Completed requests`);
    lines.push(`# TYPE gwi_idempotency_completed_total counter`);
    lines.push(`gwi_idempotency_completed_total{${labels}} ${this.metrics.completedTotal}`);

    lines.push(`# HELP gwi_idempotency_failed_total Failed requests`);
    lines.push(`# TYPE gwi_idempotency_failed_total counter`);
    lines.push(`gwi_idempotency_failed_total{${labels}} ${this.metrics.failedTotal}`);

    lines.push(`# HELP gwi_idempotency_ttl_cleanups_total Records cleaned up via TTL`);
    lines.push(`# TYPE gwi_idempotency_ttl_cleanups_total counter`);
    lines.push(`gwi_idempotency_ttl_cleanups_total{${labels}} ${this.metrics.ttlCleanups}`);

    // Per-source metrics
    lines.push(`# HELP gwi_idempotency_checks_by_source Checks by event source`);
    lines.push(`# TYPE gwi_idempotency_checks_by_source counter`);
    for (const [source, metrics] of Object.entries(this.metrics.bySource)) {
      lines.push(`gwi_idempotency_checks_by_source{${labels},source="${source}"} ${metrics.checks}`);
    }

    lines.push(`# HELP gwi_idempotency_duplicates_by_source Duplicates by event source`);
    lines.push(`# TYPE gwi_idempotency_duplicates_by_source counter`);
    for (const [source, metrics] of Object.entries(this.metrics.bySource)) {
      lines.push(`gwi_idempotency_duplicates_by_source{${labels},source="${source}"} ${metrics.duplicates}`);
    }

    return lines.join('\n');
  }

  /**
   * Get metrics as Cloud Monitoring format
   */
  toCloudMonitoringFormat(): CloudMonitoringMetric[] {
    const now = new Date().toISOString();
    const metrics: CloudMonitoringMetric[] = [];

    metrics.push({
      type: 'custom.googleapis.com/gwi/idempotency/checks_total',
      value: this.metrics.checksTotal,
      timestamp: now,
    });

    metrics.push({
      type: 'custom.googleapis.com/gwi/idempotency/duplicates_skipped',
      value: this.metrics.duplicatesSkipped,
      timestamp: now,
    });

    metrics.push({
      type: 'custom.googleapis.com/gwi/idempotency/new_requests',
      value: this.metrics.newRequests,
      timestamp: now,
    });

    for (const [source, sourceMetrics] of Object.entries(this.metrics.bySource)) {
      metrics.push({
        type: 'custom.googleapis.com/gwi/idempotency/by_source',
        labels: { source },
        value: sourceMetrics.duplicates,
        timestamp: now,
      });
    }

    return metrics;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = this.createEmptyMetrics();
    this.startTime = new Date();
  }

  /**
   * Get uptime in milliseconds
   */
  getUptimeMs(): number {
    return Date.now() - this.startTime.getTime();
  }

  private createEmptyMetrics(): IdempotencyMetrics {
    return {
      checksTotal: 0,
      newRequests: 0,
      duplicatesSkipped: 0,
      processingConflicts: 0,
      lockRecoveries: 0,
      completedTotal: 0,
      failedTotal: 0,
      ttlCleanups: 0,
      bySource: {} as Record<EventSource, SourceMetrics>,
    };
  }

  private ensureSourceMetrics(source: EventSource): void {
    if (!this.metrics.bySource[source]) {
      this.metrics.bySource[source] = {
        checks: 0,
        new: 0,
        duplicates: 0,
        conflicts: 0,
      };
    }
  }
}

/**
 * Cloud Monitoring metric format
 */
interface CloudMonitoringMetric {
  type: string;
  labels?: Record<string, string>;
  value: number;
  timestamp: string;
}

// =============================================================================
// Singleton
// =============================================================================

let defaultCollector: IdempotencyMetricCollector | null = null;

/**
 * Get the default metric collector
 */
export function getIdempotencyMetrics(): IdempotencyMetricCollector {
  if (!defaultCollector) {
    defaultCollector = new IdempotencyMetricCollector();
  }
  return defaultCollector;
}

/**
 * Reset the default collector (for testing)
 */
export function resetIdempotencyMetrics(): void {
  defaultCollector = null;
}
