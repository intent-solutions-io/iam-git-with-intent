/**
 * Exporter Factory
 *
 * Detects and initializes the appropriate telemetry export backend
 * based on environment variables.
 *
 * Priority:
 * 1. OTEL_EXPORTER_OTLP_ENDPOINT → 'otel'
 * 2. DD_AGENT_HOST or DD_API_KEY → 'datadog' (future, not implemented)
 * 3. GWI_METRICS_ENABLED !== 'false' → 'prometheus'
 * 4. Default → 'none'
 *
 * @module @gwi/core/telemetry/exporters/exporter-factory
 */

import { initializeOTel } from './otel.js';

// =============================================================================
// Types
// =============================================================================

export type ExporterType = 'prometheus' | 'datadog' | 'otel' | 'none';

// =============================================================================
// Auto-detection
// =============================================================================

/**
 * Auto-detect the best exporter type based on environment variables.
 */
export function autoDetectExporter(): ExporterType {
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return 'otel';
  }

  if (process.env.DD_AGENT_HOST || process.env.DD_API_KEY) {
    return 'datadog';
  }

  if (process.env.GWI_METRICS_ENABLED !== 'false') {
    return 'prometheus';
  }

  return 'none';
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create and initialize the selected exporter backend.
 *
 * @param type - Exporter type to initialize. Defaults to autoDetectExporter().
 * @param serviceName - Service name for resource attribution.
 */
export function createExporter(
  type?: ExporterType,
  serviceName?: string
): void {
  const resolvedType = type ?? autoDetectExporter();
  const name = serviceName ?? process.env.APP_NAME ?? 'gwi';

  switch (resolvedType) {
    case 'otel':
      initializeOTel({ serviceName: name });
      break;

    case 'datadog':
      // Datadog is spec'd but deferred — use OTLP exporter with DD endpoint
      // DD_AGENT_HOST typically runs an OTLP-compatible collector
      if (process.env.DD_AGENT_HOST) {
        const ddEndpoint = `http://${process.env.DD_AGENT_HOST}:4318`;
        initializeOTel({
          serviceName: name,
          otlpEndpoint: ddEndpoint,
        });
      }
      break;

    case 'prometheus':
      // Prometheus export is handled by the prometheusMiddleware;
      // no additional initialization needed here.
      break;

    case 'none':
      // No-op
      break;
  }
}
