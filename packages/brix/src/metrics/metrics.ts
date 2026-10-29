import type { Hono } from 'hono';
import { Injectable } from '../di/injectable';
import type { BrixEnv } from '../http/context';

export interface RequestMetric {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

const DURATION_BUCKETS: readonly number[] = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

const DURATION_METRIC = 'http_request_duration_seconds';
const ERRORS_METRIC = 'http_request_errors_total';

interface DurationSeries {
  method: string;
  route: string;
  bucketCounts: number[];
  sumSeconds: number;
  count: number;
}

interface ErrorSeries {
  method: string;
  route: string;
  statusCode: number;
  count: number;
}

function seriesKey(parts: string[]): string {
  return parts.join('\u0000');
}

function escapeLabelValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
}

function labelString(labels: Record<string, string>): string {
  return Object.entries(labels)
    .map(([name, value]) => `${name}="${escapeLabelValue(value)}"`)
    .join(',');
}

@Injectable()
export class MetricsRegistry {
  private readonly durations = new Map<string, DurationSeries>();
  private readonly errors = new Map<string, ErrorSeries>();

  observeRequest(metric: RequestMetric): void {
    const seconds = metric.durationMs / 1000;
    const key = seriesKey([metric.method, metric.route]);
    const series = this.durations.get(key) ?? {
      method: metric.method,
      route: metric.route,
      bucketCounts: DURATION_BUCKETS.map(() => 0),
      sumSeconds: 0,
      count: 0,
    };
    const index = DURATION_BUCKETS.findIndex((bucket) => seconds <= bucket);
    if (index >= 0) {
      series.bucketCounts[index] = (series.bucketCounts[index] ?? 0) + 1;
    }
    series.sumSeconds += seconds;
    series.count += 1;
    this.durations.set(key, series);
    if (metric.statusCode >= 500) {
      this.observeError(metric);
    }
  }

  render(): string {
    const lines: string[] = [
      `# HELP ${DURATION_METRIC} Duration of HTTP requests in seconds.`,
      `# TYPE ${DURATION_METRIC} histogram`,
    ];
    for (const series of this.durations.values()) {
      this.renderDuration(lines, series);
    }
    lines.push(
      `# HELP ${ERRORS_METRIC} Number of HTTP requests that failed with a 5xx status.`,
      `# TYPE ${ERRORS_METRIC} counter`,
    );
    for (const series of this.errors.values()) {
      const labels = labelString({
        method: series.method,
        route: series.route,
        status: String(series.statusCode),
      });
      lines.push(`${ERRORS_METRIC}{${labels}} ${series.count}`);
    }
    return lines.join('\n');
  }

  private observeError(metric: RequestMetric): void {
    const key = seriesKey([metric.method, metric.route, String(metric.statusCode)]);
    const series = this.errors.get(key) ?? {
      method: metric.method,
      route: metric.route,
      statusCode: metric.statusCode,
      count: 0,
    };
    series.count += 1;
    this.errors.set(key, series);
  }

  private renderDuration(lines: string[], series: DurationSeries): void {
    const labels = labelString({ method: series.method, route: series.route });
    let cumulative = 0;
    let index = 0;
    for (const bucket of DURATION_BUCKETS) {
      cumulative += series.bucketCounts[index] ?? 0;
      index += 1;
      lines.push(`${DURATION_METRIC}_bucket{${labels},le="${bucket}"} ${cumulative}`);
    }
    lines.push(`${DURATION_METRIC}_bucket{${labels},le="+Inf"} ${series.count}`);
    lines.push(`${DURATION_METRIC}_sum{${labels}} ${series.sumSeconds}`);
    lines.push(`${DURATION_METRIC}_count{${labels}} ${series.count}`);
  }
}

export function registerMetricsRoutes(app: Hono<BrixEnv>, registry: MetricsRegistry): void {
  app.get('/metrics', (c) =>
    c.text(registry.render(), 200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' }),
  );
}
