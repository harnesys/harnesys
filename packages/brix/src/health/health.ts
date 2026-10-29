import type { Hono } from 'hono';
import type { Container, Provider } from '../di/container';
import { resolveMultiProviders } from '../di/container';
import type { BrixEnv } from '../http/context';

export const HEALTH_CHECK = 'HEALTH_CHECK';

export type HealthCheckStatus = 'up' | 'down';

export interface HealthCheckResult {
  status: HealthCheckStatus;
  message?: string;
}

export interface HealthCheckEntry {
  name: string;
  status: HealthCheckStatus;
  message?: string;
}

export interface HealthReport {
  status: HealthCheckStatus;
  checks: HealthCheckEntry[];
  message?: string;
}

export abstract class HealthCheck {
  abstract readonly name: string;
  abstract check(): HealthCheckResult | Promise<HealthCheckResult>;
}

export interface HealthRouteOptions {
  checks: HealthCheck[];
  shuttingDown: () => boolean;
}

export function collectHealthChecks(container: Container, providers: Provider[]): HealthCheck[] {
  return resolveMultiProviders<HealthCheck>(container, providers, HEALTH_CHECK);
}

export async function runHealthChecks(checks: HealthCheck[]): Promise<HealthReport> {
  const entries = await Promise.all(checks.map((check) => runHealthCheck(check)));
  const down = entries.some((entry) => entry.status === 'down');
  return {
    status: down ? 'down' : 'up',
    checks: entries,
  };
}

function entryOf(
  name: string,
  status: HealthCheckStatus,
  message: string | undefined,
): HealthCheckEntry {
  return message === undefined ? { name, status } : { name, status, message };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runHealthCheck(check: HealthCheck): Promise<HealthCheckEntry> {
  try {
    const result = await check.check();
    return entryOf(check.name, result.status, result.message);
  } catch (error) {
    return entryOf(check.name, 'down', messageOf(error));
  }
}

export function registerHealthRoutes(app: Hono<BrixEnv>, options: HealthRouteOptions): void {
  app.get('/health/live', (c) => {
    const body: HealthReport = { status: 'up', checks: [] };
    return c.json(body);
  });
  app.get('/health/ready', async (c) => {
    if (options.shuttingDown()) {
      const body: HealthReport = { status: 'down', checks: [], message: 'shutting down' };
      return c.json(body, 503);
    }
    const report = await runHealthChecks(options.checks);
    return c.json(report, report.status === 'up' ? 200 : 503);
  });
}
