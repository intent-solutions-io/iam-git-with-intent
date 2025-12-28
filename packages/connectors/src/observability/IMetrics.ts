import { Registry, Counter, Gauge, Histogram } from 'prom-client';

/**
 * Metrics interface for instrumentation
 */
export interface IMetrics {
  /**
   * Increment a counter
   */
  increment(name: string, value?: number, labels?: Record<string, string>): void;

  /**
   * Set a gauge value
   */
  gauge(name: string, value: number, labels?: Record<string, string>): void;

  /**
   * Record a histogram value
   */
  histogram(name: string, value: number, labels?: Record<string, string>): void;

  /**
   * Get Prometheus registry for metrics export
   */
  getRegistry(): Registry;
}

/**
 * Prometheus metrics implementation
 */
export class PrometheusMetrics implements IMetrics {
  private registry: Registry;
  private counters: Map<string, Counter>;
  private gauges: Map<string, Gauge>;
  private histograms: Map<string, Histogram>;

  constructor() {
    this.registry = new Registry();
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
  }

  increment(name: string, value: number = 1, labels?: Record<string, string>): void {
    let counter = this.counters.get(name);

    if (!counter) {
      counter = new Counter({
        name,
        help: `Counter for ${name}`,
        labelNames: labels ? Object.keys(labels) : [],
        registers: [this.registry]
      });
      this.counters.set(name, counter);
    }

    if (labels) {
      counter.inc(labels, value);
    } else {
      counter.inc(value);
    }
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    let gauge = this.gauges.get(name);

    if (!gauge) {
      gauge = new Gauge({
        name,
        help: `Gauge for ${name}`,
        labelNames: labels ? Object.keys(labels) : [],
        registers: [this.registry]
      });
      this.gauges.set(name, gauge);
    }

    if (labels) {
      gauge.set(labels, value);
    } else {
      gauge.set(value);
    }
  }

  histogram(name: string, value: number, labels?: Record<string, string>): void {
    let histogram = this.histograms.get(name);

    if (!histogram) {
      histogram = new Histogram({
        name,
        help: `Histogram for ${name}`,
        labelNames: labels ? Object.keys(labels) : [],
        registers: [this.registry]
      });
      this.histograms.set(name, histogram);
    }

    if (labels) {
      histogram.observe(labels, value);
    } else {
      histogram.observe(value);
    }
  }

  getRegistry(): Registry {
    return this.registry;
  }
}
