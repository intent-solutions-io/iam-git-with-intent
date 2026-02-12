/**
 * GWI MetricsRegistry → OpenTelemetry Metrics Bridge
 *
 * Reads from the GWI MetricsRegistry and mirrors values to OTel instruments
 * so they can be exported via OTLP or Prometheus.
 *
 * @module @gwi/core/telemetry/exporters/metrics-bridge
 */

import type { Meter, Counter as OTelCounter, Histogram as OTelHistogram } from '@opentelemetry/api';
import type { MetricsRegistry, MetricSnapshot } from '../metrics.js';

// =============================================================================
// MetricsBridge
// =============================================================================

export interface MetricsBridgeOptions {
  /** Sync interval in milliseconds (default: 60_000) */
  syncIntervalMs?: number;
}

/**
 * Bridges GWI MetricsRegistry to OTel Meter instruments.
 *
 * - Counters: tracks deltas between syncs
 * - Gauges: uses OTel ObservableGauge with callback
 * - Histograms: records observed values via sum/count deltas
 */
export class MetricsBridge {
  private registry: MetricsRegistry;
  private meter: Meter;
  private syncIntervalMs: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  // OTel instruments keyed by metric name
  private otelCounters: Map<string, OTelCounter> = new Map();
  private otelHistograms: Map<string, OTelHistogram> = new Map();

  // Previous snapshot values for delta computation
  private previousCounterValues: Map<string, number> = new Map();
  private previousHistogramCounts: Map<string, number> = new Map();

  constructor(registry: MetricsRegistry, meter: Meter, options?: MetricsBridgeOptions) {
    this.registry = registry;
    this.meter = meter;
    this.syncIntervalMs = options?.syncIntervalMs ?? 60_000;
  }

  /**
   * Start periodic sync from GWI metrics to OTel instruments.
   */
  start(): void {
    // Do an initial sync to create instruments
    this.sync();

    this.intervalId = setInterval(() => {
      this.sync();
    }, this.syncIntervalMs);

    // Don't keep the process alive just for metrics sync
    if (this.intervalId && typeof this.intervalId === 'object' && 'unref' in this.intervalId) {
      this.intervalId.unref();
    }
  }

  /**
   * Stop periodic sync.
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Perform a single sync: read GWI snapshots and push deltas to OTel.
   */
  sync(): void {
    const snapshots = this.registry.getAllSnapshots();

    for (const snapshot of snapshots) {
      switch (snapshot.type) {
        case 'counter':
          this.syncCounter(snapshot);
          break;
        case 'gauge':
          this.syncGauge(snapshot);
          break;
        case 'histogram':
          this.syncHistogram(snapshot);
          break;
      }
    }
  }

  private syncCounter(snapshot: MetricSnapshot): void {
    const key = snapshotKey(snapshot);

    // Get or create OTel counter
    let counter = this.otelCounters.get(snapshot.name);
    if (!counter) {
      counter = this.meter.createCounter(snapshot.name, {
        description: `Bridged from GWI: ${snapshot.name}`,
      });
      this.otelCounters.set(snapshot.name, counter);
    }

    // Compute delta since last sync
    const previous = this.previousCounterValues.get(key) ?? 0;
    const delta = snapshot.value - previous;
    if (delta > 0) {
      counter.add(delta, snapshot.labels);
    }
    this.previousCounterValues.set(key, snapshot.value);
  }

  private syncGauge(snapshot: MetricSnapshot): void {
    // For gauges, use ObservableGauge with the current value
    // We create one per metric name and record the latest value
    const gaugeName = snapshot.name;
    if (!this.otelCounters.has(`__gauge_${gaugeName}`)) {
      const gauge = this.meter.createObservableGauge(gaugeName, {
        description: `Bridged from GWI: ${gaugeName}`,
      });

      // The callback reads the latest value from the GWI registry
      gauge.addCallback((result) => {
        const currentSnapshots = this.registry.getAllSnapshots();
        for (const s of currentSnapshots) {
          if (s.name === gaugeName && s.type === 'gauge') {
            result.observe(s.value, s.labels);
          }
        }
      });

      // Use a sentinel to track that we've registered this gauge
      this.otelCounters.set(`__gauge_${gaugeName}`, null as unknown as OTelCounter);
    }
  }

  private syncHistogram(snapshot: MetricSnapshot): void {
    // Skip the _count and _sum derived snapshots (they come from getSnapshots())
    if (snapshot.name.endsWith('_count') || snapshot.name.endsWith('_sum')) {
      return;
    }

    const key = snapshotKey(snapshot);

    let histogram = this.otelHistograms.get(snapshot.name);
    if (!histogram) {
      histogram = this.meter.createHistogram(snapshot.name, {
        description: `Bridged from GWI: ${snapshot.name}`,
      });
      this.otelHistograms.set(snapshot.name, histogram);
    }

    // For histograms, we use the average value from the snapshot
    // and record it proportionally to new observations
    const countKey = `${key}__count`;
    const previousCount = this.previousHistogramCounts.get(countKey) ?? 0;

    // Find the corresponding _count snapshot
    const allSnapshots = this.registry.getAllSnapshots();
    const countSnapshot = allSnapshots.find(
      (s) => s.name === `${snapshot.name}_count` && labelsEqual(s.labels, snapshot.labels)
    );

    if (countSnapshot) {
      const newObservations = countSnapshot.value - previousCount;
      if (newObservations > 0 && snapshot.value > 0) {
        // Record the average value for each new observation
        for (let i = 0; i < newObservations; i++) {
          histogram.record(snapshot.value, snapshot.labels);
        }
      }
      this.previousHistogramCounts.set(countKey, countSnapshot.value);
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

function snapshotKey(snapshot: MetricSnapshot): string {
  const labelStr = Object.entries(snapshot.labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  return `${snapshot.name}|${labelStr}`;
}

function labelsEqual(
  a: Record<string, string>,
  b: Record<string, string>
): boolean {
  // Filter out 'stat' label added by Histogram.getSnapshots()
  const aFiltered = Object.entries(a).filter(([k]) => k !== 'stat');
  const bFiltered = Object.entries(b).filter(([k]) => k !== 'stat');

  if (aFiltered.length !== bFiltered.length) return false;
  for (const [key, value] of aFiltered) {
    if (b[key] !== value) return false;
  }
  return true;
}
