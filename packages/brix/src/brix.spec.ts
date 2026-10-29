import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { Brix, type BrixOptions } from './brix';
import { Injectable } from './di/injectable';
import type { DynamicModule } from './di/module';
import type { ErrorMappingArgs, ErrorResponse } from './errors/error-filter';
import { APP_FILTER, DefaultErrorFilter, ErrorFilter } from './errors/error-filter';
import { HEALTH_CHECK, HealthCheck, type HealthCheckResult } from './health/health';
import { getContextValue, TRACE_ID_KEY } from './http/context';
import { Controller } from './http/controller';
import { Get } from './http/routes';
import { Logger, PinoLogger } from './logging/logger';

@Injectable()
class SilentLogger extends Logger {
  child(): Logger {
    return this;
  }

  info(): void {}

  debug(): void {}

  warn(): void {}

  error(): void {}
}

@Controller('health')
class HealthController {
  @Get()
  check(): object {
    return { status: 'ok' };
  }
}

function preloadedServer(api: { prefix: string; version?: string }): Record<string, unknown> {
  return {
    server: { host: '127.0.0.1', port: 47474, api },
  };
}

const TEST_OPTIONS: BrixOptions = {
  config: { preloadedConfig: preloadedServer({ prefix: 'api' }) },
};

function rootModule(): DynamicModule {
  return {
    module: class RootModule {},
    controllers: [HealthController],
    providers: [{ provide: Logger, useClass: SilentLogger }],
  };
}

async function withMockedRuntime<T>(
  fn: (mock: { stopCalls: boolean[]; exitCodes: number[] }) => Promise<T>,
  options: { serveError?: Error } = {},
): Promise<T> {
  const originalServe = Bun.serve;
  const originalExit = process.exit;
  const mock = { stopCalls: [] as boolean[], exitCodes: [] as number[] };
  Reflect.set(Bun, 'serve', () => {
    if (options.serveError !== undefined) {
      throw options.serveError;
    }
    return {
      url: new URL('http://localhost'),
      stop: (force?: boolean) => {
        mock.stopCalls.push(force ?? false);
        return Promise.resolve();
      },
    };
  });
  Reflect.set(process, 'exit', (code?: number) => {
    mock.exitCodes.push(code ?? 0);
  });
  try {
    return await fn(mock);
  } finally {
    Bun.serve = originalServe;
    Reflect.set(process, 'exit', originalExit);
  }
}

function trackedModule(log: string[]): DynamicModule {
  @Injectable()
  class First {
    onModuleInit(): void {
      log.push('init first');
    }

    onModuleDestroy(): void {
      log.push('destroy first');
    }
  }

  @Injectable()
  class Second {
    constructor(readonly first: First) {}

    onModuleInit(): void {
      log.push('init second');
    }

    onModuleDestroy(): void {
      log.push('destroy second');
    }
  }

  return {
    module: class TrackedModule {},
    providers: [
      { provide: First, useClass: First },
      { provide: Second, useClass: Second },
      { provide: Logger, useClass: SilentLogger },
    ],
  };
}

function failingHealthModule(): DynamicModule {
  class DbCheck extends HealthCheck {
    readonly name = 'db';

    check(): HealthCheckResult {
      return { status: 'down', message: 'no connection' };
    }
  }

  return {
    module: class HealthRootModule {},
    providers: [
      { provide: HEALTH_CHECK, useClass: DbCheck },
      { provide: Logger, useClass: SilentLogger },
    ],
  };
}

function contextModule(): DynamicModule {
  @Controller('ctx')
  class CtxController {
    @Get()
    async read(): Promise<object> {
      await Promise.resolve();
      return { traceId: getContextValue<string>(TRACE_ID_KEY) };
    }
  }

  return {
    module: class ContextRootModule {},
    controllers: [CtxController],
    providers: [{ provide: Logger, useClass: SilentLogger }],
  };
}

describe('Brix.create', () => {
  test('returns handle with hono, container, config, binding without serving', () => {
    const app = Brix.create(rootModule(), TEST_OPTIONS);
    expect(app.hono).toBeDefined();
    expect(app.container).toBeDefined();
    expect(app.config).toEqual(preloadedServer({ prefix: 'api' }));
    expect(app.binding.api.prefix).toBe('api');
  });

  test('rejects double serve', async () => {
    await withMockedRuntime(async () => {
      const app = Brix.create(rootModule(), TEST_OPTIONS);
      await app.serve({ signals: [] });
      await expect(app.serve({ signals: [] })).rejects.toThrow('twice');
    });
  });

  test('core registers PinoLogger and DefaultErrorFilter when the app provides none', () => {
    const app = Brix.create(
      {
        module: class BareRootModule {},
        controllers: [HealthController],
      },
      TEST_OPTIONS,
    );

    expect(app.container.resolve<Logger>(Logger)).toBeInstanceOf(PinoLogger);
    expect(app.container.resolve<ErrorFilter>(APP_FILTER)).toBeInstanceOf(DefaultErrorFilter);
    expect(app.container.resolve<Logger>(Logger)).toBe(app.container.resolve<Logger>(Logger));
  });

  test('module providers override the core defaults', () => {
    const app = Brix.create(rootModule(), TEST_OPTIONS);

    expect(app.container.resolve<Logger>(Logger)).toBeInstanceOf(SilentLogger);
    expect(app.container.resolve<Logger>(Logger)).not.toBeInstanceOf(PinoLogger);
  });

  test('APP_FILTER provider replaces the default filter', () => {
    @Injectable()
    class CustomFilter extends ErrorFilter {
      map(_err: unknown, args: ErrorMappingArgs): ErrorResponse {
        return {
          statusCode: 400,
          errorCode: 'CUSTOM',
          message: 'custom',
          path: args.path,
          timestamp: 't',
        };
      }
    }

    const app = Brix.create(
      {
        module: class FilterRootModule {},
        providers: [{ provide: APP_FILTER, useClass: CustomFilter }],
      },
      TEST_OPTIONS,
    );

    expect(app.container.resolve<ErrorFilter>(APP_FILTER)).toBeInstanceOf(CustomFilter);
    expect(app.container.resolve<ErrorFilter>(APP_FILTER)).not.toBeInstanceOf(DefaultErrorFilter);
  });

  test('mounts the api under the configured version at create time', () => {
    const app = Brix.create(
      {
        module: class VersionedRootModule {},
        controllers: [HealthController],
      },
      { config: { preloadedConfig: preloadedServer({ prefix: 'api', version: 'v1' }) } },
    );

    expect(app.hono.routes.some((route) => route.path === '/api/v1/health')).toBe(true);
  });

  test('mounts the api at the prefix root when no version is configured', () => {
    const app = Brix.create(rootModule(), TEST_OPTIONS);

    expect(app.hono.routes.some((route) => route.path === '/api/health')).toBe(true);
  });

  test('getHandler serves requests without binding a port', async () => {
    const app = Brix.create(rootModule(), TEST_OPTIONS);
    const handler = app.getHandler();

    const res = await handler(new Request('http://localhost/api/health'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('lifecycle and shutdown', () => {
  test('serve runs onModuleInit and close runs onModuleDestroy in reverse order', async () => {
    await withMockedRuntime(async () => {
      const log: string[] = [];
      const app = Brix.create(trackedModule(log), TEST_OPTIONS);

      await app.serve({ signals: [] });
      await app.close();

      expect(log).toEqual(['init first', 'init second', 'destroy second', 'destroy first']);
    });
  });

  test('close drains and stops the server exactly once', async () => {
    await withMockedRuntime(async (mock) => {
      const app = Brix.create(rootModule(), TEST_OPTIONS);
      await app.serve({ signals: [] });

      await app.close();
      await app.close();

      expect(mock.stopCalls).toEqual([false]);
    });
  });

  test('destroys modules and rethrows when Bun.serve fails to bind', async () => {
    await withMockedRuntime(
      async () => {
        const log: string[] = [];
        const app = Brix.create(trackedModule(log), TEST_OPTIONS);
        await expect(app.serve({ signals: [] })).rejects.toThrow('in use');
        expect(log).toEqual(['init first', 'init second', 'destroy second', 'destroy first']);
      },
      { serveError: new Error('Is port 47474 in use?') },
    );
  });

  test('the signal handler drains, destroys modules, exits the process and removes itself', async () => {
    await withMockedRuntime(async (mock) => {
      const log: string[] = [];
      const app = Brix.create(trackedModule(log), TEST_OPTIONS);
      const beforeTerm = process.listeners('SIGTERM').length;
      const beforeInt = process.listeners('SIGINT').length;

      await app.serve({ signals: ['SIGTERM', 'SIGINT'] });

      expect(process.listeners('SIGTERM').length).toBe(beforeTerm + 1);
      expect(process.listeners('SIGINT').length).toBe(beforeInt + 1);

      const handler = process.listeners('SIGTERM')[beforeTerm] as () => Promise<void>;
      await handler();

      expect(mock.stopCalls).toEqual([false]);
      expect(log).toEqual(['init first', 'init second', 'destroy second', 'destroy first']);
      expect(mock.exitCodes).toEqual([0]);
      expect(process.listeners('SIGTERM').length).toBe(beforeTerm);
      expect(process.listeners('SIGINT').length).toBe(beforeInt);
    });
  });
});

describe('health endpoints', () => {
  test('live and ready answer on the root path outside the api prefix', async () => {
    const app = Brix.create(rootModule(), TEST_OPTIONS);
    const handler = app.getHandler();

    const live = await handler(new Request('http://localhost/health/live'));
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: 'up', checks: [] });

    const ready = await handler(new Request('http://localhost/health/ready'));
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: 'up', checks: [] });
  });

  test('ready reports down checks and flips to 503 while shutting down', async () => {
    const app = Brix.create(failingHealthModule(), TEST_OPTIONS);
    const handler = app.getHandler();

    const ready = await handler(new Request('http://localhost/health/ready'));
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({
      status: 'down',
      checks: [{ name: 'db', status: 'down', message: 'no connection' }],
    });

    await app.close();

    const draining = await handler(new Request('http://localhost/health/ready'));
    expect(draining.status).toBe(503);
    expect(await draining.json()).toEqual({ status: 'down', checks: [], message: 'shutting down' });
  });
});

describe('request context', () => {
  test('handlers read the request context through AsyncLocalStorage', async () => {
    const handler = Brix.create(contextModule(), TEST_OPTIONS).getHandler();
    const res = await handler(
      new Request('http://localhost/api/ctx', { headers: { 'x-request-id': 'abc' } }),
    );
    expect(await res.json()).toEqual({ traceId: 'abc' });
  });
});
