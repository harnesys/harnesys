import 'reflect-metadata';

import { describe, expect, test } from 'bun:test';
import { Brix, type BrixApp, type BrixOptions } from './brix';
import { Injectable } from './di/injectable';
import type { ModuleDestroyHook, ModuleInitHook } from './di/lifecycle';
import type { DynamicModule } from './di/module';
import { Module } from './di/module';
import { Controller } from './http/controller';
import { Get } from './http/routes';
import { Logger } from './logging/logger';

class RecordingLogger extends Logger {
  constructor(private readonly log: string[]) {
    super();
  }

  child(): Logger {
    return this;
  }

  info(_obj: object, msg: string): void {
    this.log.push(msg);
  }

  debug(): void {}

  warn(): void {}

  error(_obj: object, msg: string): void {
    this.log.push(msg);
  }
}

const TEST_OPTIONS: BrixOptions = {
  config: {
    preloadedConfig: { server: { host: '127.0.0.1', port: 47474, api: { prefix: 'api' } } },
  },
};

function createApp(module: DynamicModule, sink: string[] = []): BrixApp {
  return Brix.create(
    {
      ...module,
      providers: [
        ...(module.providers ?? []),
        { provide: Logger, useValue: new RecordingLogger(sink) },
      ],
    },
    TEST_OPTIONS,
  );
}

function shutdownOrderModule(log: string[]): DynamicModule {
  @Injectable()
  class Worker {
    onModuleDestroy(): void {
      log.push('destroy worker');
    }
  }

  return {
    module: class ShutdownOrderModule {},
    providers: [{ provide: Worker, useClass: Worker }],
  };
}

describe('module class lifecycle', () => {
  test('runs hooks defined on the module class', async () => {
    const log: string[] = [];

    @Module({})
    class LifecycleModule implements ModuleInitHook, ModuleDestroyHook {
      onModuleInit(): void {
        log.push('init');
      }

      onModuleDestroy(): void {
        log.push('destroy');
      }
    }

    const app = createApp({ module: LifecycleModule });
    await app.init();
    await app.close();

    expect(log).toEqual(['init', 'destroy']);
  });

  test('injects providers into the module class constructor', async () => {
    const log: string[] = [];

    @Injectable()
    class GreetingService {
      greet(): string {
        return 'hello';
      }
    }

    @Module({ providers: [GreetingService] })
    class DiModule {
      constructor(readonly greeting: GreetingService) {}

      onModuleInit(): void {
        log.push(this.greeting.greet());
      }
    }

    const app = createApp({ module: DiModule });
    await app.init();
    await app.close();

    expect(log).toEqual(['hello']);
  });

  test('runs hooks of imported modules first and destroys in reverse', async () => {
    const log: string[] = [];

    @Module({})
    class SharedModule {
      onModuleInit(): void {
        log.push('shared init');
      }

      onModuleDestroy(): void {
        log.push('shared destroy');
      }
    }

    @Module({ imports: [SharedModule] })
    class RootLifecycleModule {
      onModuleInit(): void {
        log.push('root init');
      }

      onModuleDestroy(): void {
        log.push('root destroy');
      }
    }

    const app = createApp({ module: RootLifecycleModule });
    await app.init();
    await app.close();

    expect(log).toEqual(['shared init', 'root init', 'root destroy', 'shared destroy']);
  });
});

describe('provider shorthand', () => {
  test('injects a bare class provider into a controller and runs module hooks', async () => {
    const log: string[] = [];

    @Injectable()
    class ApiService {
      status(): string {
        return 'ok';
      }
    }

    @Controller('health')
    class HealthController {
      constructor(readonly api: ApiService) {}

      @Get()
      check(): object {
        return { status: this.api.status() };
      }
    }

    @Module({ providers: [ApiService], controllers: [HealthController] })
    class ApiModule {
      onModuleInit(): void {
        log.push('init');
      }

      onModuleDestroy(): void {
        log.push('destroy');
      }
    }

    const app = createApp({ module: ApiModule });
    await app.init();
    const res = await app.getHandler()(new Request('http://localhost/api/health'));
    await app.close();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(log).toEqual(['init', 'destroy']);
  });
});

describe('BrixApp shutdown', () => {
  test('logs server stopped before running destroy hooks', async () => {
    const log: string[] = [];
    const app = createApp(shutdownOrderModule(log), log);
    app.container.resolveAll();
    await app.close();

    expect(log).toEqual(['[server stopped]', 'destroy worker']);
  });
});
