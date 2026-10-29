import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import type { BrixEnv } from '../http/context';
import { MetricsRegistry, registerMetricsRoutes } from './metrics';

function linesOf(registry: MetricsRegistry): string[] {
  return registry.render().split('\n');
}

describe('MetricsRegistry', () => {
  test('renders the latency histogram per route with cumulative buckets', () => {
    const registry = new MetricsRegistry();
    registry.observeRequest({
      method: 'GET',
      route: '/api/users/:id',
      statusCode: 200,
      durationMs: 250,
    });
    registry.observeRequest({
      method: 'GET',
      route: '/api/users/:id',
      statusCode: 200,
      durationMs: 750,
    });

    const lines = linesOf(registry);
    expect(lines).toContain(
      'http_request_duration_seconds_bucket{method="GET",route="/api/users/:id",le="0.25"} 1',
    );
    expect(lines).toContain(
      'http_request_duration_seconds_bucket{method="GET",route="/api/users/:id",le="0.5"} 1',
    );
    expect(lines).toContain(
      'http_request_duration_seconds_bucket{method="GET",route="/api/users/:id",le="1"} 2',
    );
    expect(lines).toContain(
      'http_request_duration_seconds_bucket{method="GET",route="/api/users/:id",le="+Inf"} 2',
    );
    expect(lines).toContain(
      'http_request_duration_seconds_sum{method="GET",route="/api/users/:id"} 1',
    );
    expect(lines).toContain(
      'http_request_duration_seconds_count{method="GET",route="/api/users/:id"} 2',
    );
  });

  test('keeps a separate series per method and route', () => {
    const registry = new MetricsRegistry();
    registry.observeRequest({
      method: 'GET',
      route: '/api/users/:id',
      statusCode: 200,
      durationMs: 250,
    });
    registry.observeRequest({
      method: 'POST',
      route: '/api/users/:id',
      statusCode: 201,
      durationMs: 100,
    });

    const lines = linesOf(registry);
    expect(lines).toContain(
      'http_request_duration_seconds_count{method="GET",route="/api/users/:id"} 1',
    );
    expect(lines).toContain(
      'http_request_duration_seconds_count{method="POST",route="/api/users/:id"} 1',
    );
  });

  test('counts 5xx responses in the error counter and ignores 4xx', () => {
    const registry = new MetricsRegistry();
    registry.observeRequest({
      method: 'GET',
      route: '/api/orders',
      statusCode: 500,
      durationMs: 250,
    });
    registry.observeRequest({
      method: 'GET',
      route: '/api/orders',
      statusCode: 500,
      durationMs: 250,
    });
    registry.observeRequest({
      method: 'GET',
      route: '/api/orders',
      statusCode: 503,
      durationMs: 250,
    });
    registry.observeRequest({
      method: 'GET',
      route: '/api/orders',
      statusCode: 404,
      durationMs: 250,
    });

    const lines = linesOf(registry).filter((line) => line.startsWith('http_request_errors_total{'));
    expect(lines).toEqual([
      'http_request_errors_total{method="GET",route="/api/orders",status="500"} 2',
      'http_request_errors_total{method="GET",route="/api/orders",status="503"} 1',
    ]);
  });

  test('escapes label values', () => {
    const registry = new MetricsRegistry();
    registry.observeRequest({ method: 'GE"T', route: '/a\nb', statusCode: 200, durationMs: 250 });

    expect(linesOf(registry)).toContain(
      'http_request_duration_seconds_count{method="GE\\"T",route="/a\\nb"} 1',
    );
  });

  test('renders only headers when nothing was observed', () => {
    const registry = new MetricsRegistry();
    expect(registry.render()).toBe(
      [
        '# HELP http_request_duration_seconds Duration of HTTP requests in seconds.',
        '# TYPE http_request_duration_seconds histogram',
        '# HELP http_request_errors_total Number of HTTP requests that failed with a 5xx status.',
        '# TYPE http_request_errors_total counter',
      ].join('\n'),
    );
  });
});

describe('registerMetricsRoutes', () => {
  test('serves prometheus text on /metrics', async () => {
    const registry = new MetricsRegistry();
    registry.observeRequest({
      method: 'GET',
      route: '/api/users',
      statusCode: 200,
      durationMs: 250,
    });
    const app = new Hono<BrixEnv>();
    registerMetricsRoutes(app, registry);

    const res = await app.fetch(new Request('http://localhost/metrics'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toContain(
      'http_request_duration_seconds_count{method="GET",route="/api/users"} 1',
    );
  });
});
