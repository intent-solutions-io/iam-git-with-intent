/**
 * Prometheus /metrics Endpoint Middleware
 *
 * Express middleware that exposes the GWI MetricsRegistry in Prometheus
 * text format. Works independently of OTel — no OTel config required.
 *
 * @module @gwi/core/telemetry/exporters/prometheus
 */

import { getMetricsRegistry } from '../metrics.js';

// =============================================================================
// Types
// =============================================================================

export interface PrometheusMiddlewareOptions {
  /** Path to serve metrics on (default: '/metrics') */
  path?: string;
}

// Minimal Express-compatible types to avoid importing express as a dependency
interface Request {
  path: string;
}

interface Response {
  set(header: string, value: string): Response;
  send(body: string): Response;
}

type NextFunction = () => void;

// =============================================================================
// Middleware
// =============================================================================

/**
 * Express middleware that serves Prometheus-formatted metrics.
 *
 * Usage:
 *   app.use(prometheusMiddleware());
 *   // GET /metrics → text/plain with gwi_* metrics
 */
export function prometheusMiddleware(options?: PrometheusMiddlewareOptions) {
  const metricsPath = options?.path ?? '/metrics';

  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.path !== metricsPath) {
      next();
      return;
    }

    const registry = getMetricsRegistry();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(registry.exportPrometheus());
  };
}
