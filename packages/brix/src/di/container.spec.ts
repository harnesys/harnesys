import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { APP_GUARD } from '../guards/decorators';
import { Container, resolveMultiProviders } from './container';
import { Inject } from './inject';
import { Injectable } from './injectable';
import { Module } from './module';
import { buildModuleGraph } from './module-graph';

describe('Container', () => {
  test('returns the same singleton twice with type-injected dependency', () => {
    @Injectable()
    class Dep {
      readonly value = 'dep';
    }

    @Injectable()
    class Service {
      constructor(readonly dep: Dep) {}
    }

    const container = new Container();
    container.register(Dep);
    container.register(Service);

    const first = container.resolve<Service>(Service);
    const second = container.resolve<Service>(Service);

    expect(first).toBe(second);
    expect(first.dep).toBeInstanceOf(Dep);
    expect(first.dep).toBe(container.resolve<Dep>(Dep));
  });

  test('returns useValue as-is', () => {
    const options = { retries: 3 };
    const container = new Container();
    container.register({ provide: 'options', useValue: options });

    expect(container.resolve<unknown>('options')).toBe(options);
  });

  test('useFactory with inject receives the resolved dependency', () => {
    @Injectable()
    class Dep {
      readonly value = 42;
    }

    const container = new Container();
    container.register(Dep);
    container.register({
      provide: 'config',
      useFactory: (dep: Dep) => ({ dep }),
      inject: [Dep],
    });

    const config = container.resolve<{ dep: Dep }>('config');

    expect(config.dep).toBeInstanceOf(Dep);
    expect(config.dep).toBe(container.resolve<Dep>(Dep));
  });

  test('circular A <-> B throws with both class names in the message', () => {
    abstract class PortA {
      abstract readonly kind: string;
    }

    abstract class PortB {
      abstract readonly kind: string;
    }

    @Injectable()
    class ImplA extends PortA {
      readonly kind = 'a';

      constructor(@Inject(PortB) readonly b: PortB) {
        super();
      }
    }

    @Injectable()
    class ImplB extends PortB {
      readonly kind = 'b';

      constructor(@Inject(PortA) readonly a: PortA) {
        super();
      }
    }

    const container = new Container();
    container.register({ provide: PortA, useClass: ImplA });
    container.register({ provide: PortB, useClass: ImplB });

    let message = '';
    try {
      container.resolve(PortA);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('ImplA');
    expect(message).toContain('ImplB');
  });

  test('unknown token throws naming the token', () => {
    const container = new Container();

    expect(() => container.resolve('missing')).toThrow('missing');
  });
});

describe('Container module scoping', () => {
  @Injectable()
  class Repo {
    readonly value = 'repo';
  }

  @Injectable()
  class Service {
    constructor(readonly repo: Repo) {}
  }

  test('resolves a provider against the same singleton its module dependency exports', () => {
    @Module({ providers: [{ provide: Repo, useClass: Repo }], exports: [Repo] })
    class DataModule {}

    @Module({ imports: [DataModule], providers: [{ provide: Service, useClass: Service }] })
    class AppModule {}

    const container = new Container();
    container.registerModules(buildModuleGraph([AppModule]));

    const service = container.resolveFrom<Service>(AppModule, Service);
    expect(service.repo.value).toBe('repo');
    expect(service.repo).toBe(container.resolveFrom<Repo>(DataModule, Repo));
  });

  test('fails when a provider injects a token its module cannot see, naming all modules', () => {
    @Module({ providers: [{ provide: Repo, useClass: Repo }] })
    class PrivateDataModule {}

    @Module({ imports: [PrivateDataModule], providers: [{ provide: Service, useClass: Service }] })
    class AppModule {}

    const container = new Container();
    container.registerModules(buildModuleGraph([AppModule]));

    let message = '';
    try {
      container.resolveFrom(AppModule, Service);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('Repo');
    expect(message).toContain('PrivateDataModule');
    expect(message).toContain('AppModule');
  });

  test('resolveFrom rejects a token the module does not export', () => {
    @Module({ providers: [{ provide: Repo, useClass: Repo }] })
    class DataModule {}

    @Module({ imports: [DataModule] })
    class ConsumerModule {}

    const container = new Container();
    container.registerModules(buildModuleGraph([ConsumerModule]));

    expect(() => container.resolveFrom(ConsumerModule, Repo)).toThrow('Repo');
  });

  test('registers a class provider only when it is @Injectable(), naming class and module', () => {
    class Plain {}

    @Module({ providers: [{ provide: 'plain', useClass: Plain }] })
    class BadModule {}

    const container = new Container();
    let message = '';
    try {
      container.registerModules(buildModuleGraph([BadModule]));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('@Injectable()');
    expect(message).toContain('Plain');
    expect(message).toContain('BadModule');
  });

  test('multi providers skip ownership and registration entirely', () => {
    @Module({ providers: [{ provide: APP_GUARD, useClass: Repo }] })
    class FirstModule {}

    @Module({ providers: [{ provide: APP_GUARD, useClass: Service }] })
    class SecondModule {}

    const container = new Container();
    container.registerModules(
      buildModuleGraph([FirstModule, SecondModule], { multi: [APP_GUARD] }),
    );

    expect(container.has(APP_GUARD)).toBe(false);
    expect(container.has(Repo)).toBe(false);
  });

  test('has() reports registered tokens', () => {
    const container = new Container();
    container.register({ provide: 'x', useValue: 1 });

    expect(container.has('x')).toBe(true);
    expect(container.has('missing')).toBe(false);
  });

  test('root-registered tokens stay resolvable from any module', () => {
    @Module({})
    class AnyModule {}

    const container = new Container();
    container.registerModules(buildModuleGraph([AnyModule]));
    container.register({ provide: 'runtime', useValue: 'value' });

    expect(container.resolveFrom<string>(AnyModule, 'runtime')).toBe('value');
  });

  test('dependency metadata erased to Object explains how to fix it', () => {
    @Injectable()
    class Broken {
      constructor(readonly dep: unknown) {}
    }
    Reflect.defineMetadata('design:paramtypes', [Object], Broken);

    const container = new Container();
    container.register(Broken);

    let message = '';
    try {
      container.resolve(Broken);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('Object');
    expect(message).toContain('@Inject');
    expect(message).toContain('Broken');
  });
});

describe('Container eager instantiation', () => {
  test('resolveAll creates every registered instance in dependency order', () => {
    const log: string[] = [];

    @Injectable()
    class Dep {
      constructor() {
        log.push('dep');
      }
    }

    @Injectable()
    class Service {
      constructor(readonly dep: Dep) {
        log.push('service');
      }
    }

    const container = new Container();
    container.register({ provide: 'config', useValue: { retries: 1 } });
    container.register(Dep);
    container.register(Service);

    const instances = container.resolveAll();

    expect(log).toEqual(['dep', 'service']);
    expect(instances).toHaveLength(3);
    expect(container.instances()).toEqual(instances);
    expect(container.resolveAll()).toEqual(instances);
  });
});

describe('resolveMultiProviders', () => {
  test('collects only the matching token and resolves every provider shape', () => {
    @Injectable()
    class First {
      readonly name = 'first';
    }

    const container = new Container();
    container.register({ provide: 'dep', useValue: 'dep' });

    const collected = resolveMultiProviders<{ name: string }>(
      container,
      [
        { provide: 'other', useValue: { name: 'other' } },
        { provide: 'MULTI', useClass: First },
        { provide: 'MULTI', useValue: { name: 'value' } },
        {
          provide: 'MULTI',
          useFactory: (dep: string) => ({ name: dep }),
          inject: ['dep'],
        },
      ],
      'MULTI',
    );

    expect(collected.map((entry) => entry.name)).toEqual(['first', 'value', 'dep']);
    expect(collected[0]).toBeInstanceOf(First);
    expect(collected[0]).toBe(container.resolve<First>(First));
  });
});

describe('consumer-scoped dependencies', () => {
  test('injects the instance that forConsumer returns for the consuming class', () => {
    class ScopedLogger {
      constructor(readonly consumerName: string) {}

      forConsumer(consumerName: string): ScopedLogger {
        return new ScopedLogger(consumerName);
      }
    }

    @Injectable()
    class UsersService {
      constructor(readonly logger: ScopedLogger) {}
    }

    @Injectable()
    class OrdersService {
      constructor(readonly logger: ScopedLogger) {}
    }

    const container = new Container();
    container.register({ provide: ScopedLogger, useValue: new ScopedLogger('root') });
    container.register(UsersService);
    container.register(OrdersService);

    expect(container.resolve<UsersService>(UsersService).logger.consumerName).toBe('UsersService');
    expect(container.resolve<OrdersService>(OrdersService).logger.consumerName).toBe(
      'OrdersService',
    );
    expect(container.resolve<ScopedLogger>(ScopedLogger).consumerName).toBe('root');
  });
});
