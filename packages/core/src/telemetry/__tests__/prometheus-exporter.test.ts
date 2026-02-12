/**
 * Prometheus Middleware Tests
 *
 * Verifies the Prometheus /metrics endpoint serves correct format.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { prometheusMiddleware } from '../exporters/prometheus.js';
import { MetricsRegistry, setMetricsRegistry } from '../metrics.js';

// Minimal Express mock for testing the middleware
function createMockReqRes(path: string) {
  const req = { path };
  let sentBody = '';
  const headers: Record<string, string> = {};
  const res = {
    set(header: string, value: string) {
      headers[header] = value;
      return res;
    },
    send(body: string) {
      sentBody = body;
      return res;
    },
  };

  return {
    req,
    res,
    getHeaders: () => headers,
    getBody: () => sentBody,
  };
}

describe('prometheusMiddleware', () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = new MetricsRegistry();
    setMetricsRegistry(registry);
  });

  it('should serve metrics at /metrics', () => {
    const counter = registry.counter('gwi_test_requests_total', 'Test requests', ['method']);
    counter.add(42, { method: 'GET' });

    const middleware = prometheusMiddleware();
    const { req, res, getHeaders, getBody } = createMockReqRes('/metrics');

    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(getHeaders()['Content-Type']).toBe('text/plain; version=0.0.4; charset=utf-8');

    const body = getBody();
    expect(body).toContain('gwi_test_requests_total');
    expect(body).toContain('# HELP gwi_test_requests_total Test requests');
    expect(body).toContain('# TYPE gwi_test_requests_total counter');
    expect(body).toContain('42');
  });

  it('should pass through for non-metrics paths', () => {
    const middleware = prometheusMiddleware();
    const { req, res } = createMockReqRes('/health');

    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  it('should support custom path', () => {
    const middleware = prometheusMiddleware({ path: '/custom-metrics' });
    const { req, res, getBody } = createMockReqRes('/custom-metrics');

    registry.counter('gwi_custom_counter', 'Custom').inc();

    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(getBody()).toContain('gwi_custom_counter');
  });

  it('should not match /metrics when custom path is set', () => {
    const middleware = prometheusMiddleware({ path: '/custom-metrics' });
    const { req, res } = createMockReqRes('/metrics');

    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  it('should include gwi_ prefixed metrics', () => {
    registry.counter('gwi_http_requests_total', 'HTTP requests', ['status']).add(100, { status: '200' });
    registry.gauge('gwi_active_runs', 'Active runs').set(3);
    registry.histogram('gwi_request_duration_ms', 'Request duration').observe(150);

    const middleware = prometheusMiddleware();
    const { req, res, getBody } = createMockReqRes('/metrics');

    middleware(req, res, () => {});

    const body = getBody();
    expect(body).toContain('gwi_http_requests_total');
    expect(body).toContain('gwi_active_runs');
    expect(body).toContain('gwi_request_duration_ms');
  });

  it('should render histogram with buckets', () => {
    const hist = registry.histogram('gwi_latency', 'Latency');
    hist.observe(50);
    hist.observe(200);
    hist.observe(1500);

    const middleware = prometheusMiddleware();
    const { req, res, getBody } = createMockReqRes('/metrics');

    middleware(req, res, () => {});

    const body = getBody();
    expect(body).toContain('gwi_latency');
    expect(body).toContain('gwi_latency_count');
    expect(body).toContain('gwi_latency_sum');
  });

  it('should handle empty registry', () => {
    const middleware = prometheusMiddleware();
    const { req, res, getBody } = createMockReqRes('/metrics');

    middleware(req, res, () => {});

    expect(getBody()).toBe('');
  });
});
