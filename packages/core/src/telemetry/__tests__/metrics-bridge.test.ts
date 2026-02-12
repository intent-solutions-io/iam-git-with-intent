/**
 * Metrics Bridge Tests
 *
 * Verifies that GWI MetricsRegistry values are correctly mirrored to OTel instruments.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MetricsBridge } from '../exporters/metrics-bridge.js';
import { MetricsRegistry } from '../metrics.js';

// Mock OTel Meter
function createMockMeter() {
  const counters = new Map<string, { values: { delta: number; labels: Record<string, string> }[] }>();
  const histograms = new Map<string, { values: { value: number; labels: Record<string, string> }[] }>();
  const gauges = new Map<string, { callbacks: ((result: any) => void)[] }>();

  return {
    counters,
    histograms,
    gauges,
    createCounter: vi.fn((name: string) => {
      const data = { values: [] as { delta: number; labels: Record<string, string> }[] };
      counters.set(name, data);
      return {
        add: vi.fn((delta: number, labels?: Record<string, string>) => {
          data.values.push({ delta, labels: labels ?? {} });
        }),
      };
    }),
    createHistogram: vi.fn((name: string) => {
      const data = { values: [] as { value: number; labels: Record<string, string> }[] };
      histograms.set(name, data);
      return {
        record: vi.fn((value: number, labels?: Record<string, string>) => {
          data.values.push({ value, labels: labels ?? {} });
        }),
      };
    }),
    createObservableGauge: vi.fn((name: string) => {
      const data = { callbacks: [] as ((result: any) => void)[] };
      gauges.set(name, data);
      return {
        addCallback: vi.fn((cb: (result: any) => void) => {
          data.callbacks.push(cb);
        }),
      };
    }),
  };
}

describe('MetricsBridge', () => {
  let registry: MetricsRegistry;
  let mockMeter: ReturnType<typeof createMockMeter>;
  let bridge: MetricsBridge;

  beforeEach(() => {
    registry = new MetricsRegistry();
    mockMeter = createMockMeter();
    bridge = new MetricsBridge(registry, mockMeter as any, { syncIntervalMs: 100 });
  });

  afterEach(() => {
    bridge.stop();
  });

  describe('Counter bridging', () => {
    it('should bridge counter increments as deltas', () => {
      const counter = registry.counter('gwi_test_total', 'Test counter', ['method']);
      counter.add(5, { method: 'GET' });

      bridge.sync();

      const otelCounter = mockMeter.counters.get('gwi_test_total');
      expect(otelCounter).toBeDefined();
      expect(otelCounter!.values).toHaveLength(1);
      expect(otelCounter!.values[0].delta).toBe(5);
    });

    it('should compute deltas between syncs', () => {
      const counter = registry.counter('gwi_delta_test', 'Delta test');
      counter.add(10);
      bridge.sync();

      counter.add(3);
      bridge.sync();

      const otelCounter = mockMeter.counters.get('gwi_delta_test');
      expect(otelCounter).toBeDefined();
      // First sync: delta=10, second sync: delta=3
      expect(otelCounter!.values).toHaveLength(2);
      expect(otelCounter!.values[0].delta).toBe(10);
      expect(otelCounter!.values[1].delta).toBe(3);
    });

    it('should not record zero deltas', () => {
      const counter = registry.counter('gwi_zero_test', 'Zero delta test');
      counter.add(5);
      bridge.sync();

      // No change
      bridge.sync();

      const otelCounter = mockMeter.counters.get('gwi_zero_test');
      expect(otelCounter!.values).toHaveLength(1); // Only the first sync
    });
  });

  describe('Gauge bridging', () => {
    it('should create an observable gauge with callback', () => {
      const gauge = registry.gauge('gwi_active_runs', 'Active runs');
      gauge.set(5);  // Must have a value for getSnapshots() to return data

      bridge.sync();

      expect(mockMeter.createObservableGauge).toHaveBeenCalledWith(
        'gwi_active_runs',
        expect.any(Object)
      );
    });

    it('should register gauge callback that reads current value', () => {
      const gauge = registry.gauge('gwi_connections', 'Connections');
      gauge.set(42);

      bridge.sync();

      const otelGauge = mockMeter.gauges.get('gwi_connections');
      expect(otelGauge).toBeDefined();
      expect(otelGauge!.callbacks).toHaveLength(1);

      // Simulate OTel calling the callback
      const mockResult = { observe: vi.fn() };
      otelGauge!.callbacks[0](mockResult);

      expect(mockResult.observe).toHaveBeenCalledWith(42, expect.any(Object));
    });
  });

  describe('Histogram bridging', () => {
    it('should bridge histogram observations', () => {
      const histogram = registry.histogram('gwi_request_duration', 'Duration', ['path']);
      histogram.observe(100, { path: '/api' });
      histogram.observe(200, { path: '/api' });

      bridge.sync();

      const otelHistogram = mockMeter.histograms.get('gwi_request_duration');
      expect(otelHistogram).toBeDefined();
      // Should record observations based on count delta
      expect(otelHistogram!.values.length).toBeGreaterThan(0);
    });
  });

  describe('Periodic sync', () => {
    it('should start and stop interval', () => {
      vi.useFakeTimers();

      const syncSpy = vi.spyOn(bridge, 'sync');
      bridge.start();

      // Initial sync called in start()
      expect(syncSpy).toHaveBeenCalledTimes(1);

      // Advance timer
      vi.advanceTimersByTime(100);
      expect(syncSpy).toHaveBeenCalledTimes(2);

      bridge.stop();

      vi.advanceTimersByTime(200);
      expect(syncSpy).toHaveBeenCalledTimes(2); // No more calls

      vi.useRealTimers();
    });
  });
});
