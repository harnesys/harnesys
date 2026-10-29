import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { Container } from '../di/container';
import { Injectable } from '../di/injectable';
import type { BrixEnv } from '../http/context';
import {
  collectHealthChecks,
  HEALTH_CHECK,
  HealthCheck,
  type HealthCheckResult,
  registerHealthRoutes,
  runHealthChecks,
} from './health';

describe('runHealthChecks', () => {
  test('reports up when every check passes', async () => {
    const checks: HealthCheck[] = [
      { name: 'db', check: () => ({ status: 'up' }) },
      { name: 'cache', check: async () => ({ status: 'up', message: 'warm' }) },
    ];

    expect(await runHealthChecks(checks)).toEqual({
      status: 'up',
      checks: [
        { name: 'db', status: 'up' },
        { name: 'cache', status: 'up', message: 'warm' },
      ],
    });
  });

  test('reports down and keeps the failing check message', async () => {
    const checks: HealthCheck[] = [
      { name: 'db', check: () => ({ status: 'down', message: 'no connection' }) },
      { name: 'queue', check: () => ({ status: 'up' }) },
    ];

    expect(await runHealthChecks(checks)).toEqual({
      status: 'down',
      checks: [
        { name: 'db', status: 'down', message: 'no connection' },
        { name: 'queue', status: 'up' },
      ],
    });
  });

  test('turns a thrown error into a down entry', async () => {
    const checks: HealthCheck[] = [
      {
        name: 'db',
        check: () => {
          throw new Error('boom');
        },
      },
    ];

    expect(await runHealthChecks(checks)).toEqual({
      status: 'down',
      checks: [{ name: 'db', status: 'down', message: 'boom' }],
    });
  });
});

describe('collectHealthChecks', () => {
  test('resolves useClass, useValue and useFactory entries of the multi token', () => {
    @Injectable()
    class DbCheck extends HealthCheck {
      readonly name = 'db';

      check(): HealthCheckResult {
        return { status: 'up' };
      }
    }

    const container = new Container();
    container.register({ provide: 'prefix', useValue: 'cache' });

    const checks = collectHealthChecks(container, [
      { provide: 'other', useValue: { name: 'other' } },
      { provide: HEALTH_CHECK, useClass: DbCheck },
      {
        provide: HEALTH_CHECK,
        useFactory: (prefix: string) => ({
          name: prefix,
          check: (): HealthCheckResult => ({ status: 'down' }),
        }),
        inject: ['prefix'],
      },
    ]);

    expect(checks).toHaveLength(2);
    expect(checks[0]).toBeInstanceOf(DbCheck);
    expect(checks[1]?.name).toBe('cache');
    expect(checks[0]).toBe(container.resolve<DbCheck>(DbCheck));
  });
});

describe('registerHealthRoutes', () => {
  function healthApp(checks: HealthCheck[], shuttingDown = false): Hono<BrixEnv> {
    const app = new Hono<BrixEnv>();
    registerHealthRoutes(app, { checks, shuttingDown: () => shuttingDown });
    return app;
  }

  test('live answers up regardless of check results', async () => {
    const app = healthApp([{ name: 'db', check: () => ({ status: 'down' }) }]);

    const res = await app.fetch(new Request('http://localhost/health/live'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'up', checks: [] });
  });

  test('ready runs the checks and answers 200 when all pass', async () => {
    const app = healthApp([{ name: 'db', check: () => ({ status: 'up' }) }]);

    const res = await app.fetch(new Request('http://localhost/health/ready'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'up', checks: [{ name: 'db', status: 'up' }] });
  });

  test('ready answers 503 when a check is down', async () => {
    const app = healthApp([
      { name: 'db', check: () => ({ status: 'down', message: 'no connection' }) },
    ]);

    const res = await app.fetch(new Request('http://localhost/health/ready'));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      status: 'down',
      checks: [{ name: 'db', status: 'down', message: 'no connection' }],
    });
  });

  test('ready answers 503 while the app is shutting down', async () => {
    const app = healthApp([{ name: 'db', check: () => ({ status: 'up' }) }], true);

    const res = await app.fetch(new Request('http://localhost/health/ready'));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'down', checks: [], message: 'shutting down' });
  });
});
