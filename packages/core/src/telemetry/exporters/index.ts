/**
 * Telemetry Exporters Barrel
 *
 * Re-exports all exporter modules for convenient importing.
 *
 * @module @gwi/core/telemetry/exporters
 */

export { initializeOTel, shutdownOTel, type OTelInitOptions } from './otel.js';
export { GwiSpanBridge } from './span-bridge.js';
export { MetricsBridge, type MetricsBridgeOptions } from './metrics-bridge.js';
export {
  createExporter,
  autoDetectExporter,
  type ExporterType,
} from './exporter-factory.js';
export {
  prometheusMiddleware,
  type PrometheusMiddlewareOptions,
} from './prometheus.js';
