import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { Injectable } from './injectable';
import type { DynamicModule } from './module';
import { Global, Module } from './module';
import { buildModuleGraph, isDynamicModule, moduleRefOf, providerToken } from './module-graph';

@Injectable()
class Repo {}

abstract class Port {
  abstract readonly kind: string;
}

@Injectable()
class Adapter extends Port {
  readonly kind = 'adapter';
}

@Module({ providers: [{ provide: Port, useClass: Adapter }], exports: [Port] })
class ApiModule {}

@Module({ providers: [{ provide: Repo, useClass: Repo }] })
class DataModule {}

@Module({ imports: [ApiModule, DataModule], exports: [Port] })
class ReexportModule {}

@Module({ imports: [ApiModule, DataModule] })
class ConsumerModule {}

describe('buildModuleGraph', () => {
  test('builds a node per module and tracks the owning module of each token', () => {
    const graph = buildModuleGraph([ConsumerModule]);

    expect(graph.root).toBe(ConsumerModule);
    expect(graph.nodes.map((node) => node.ref).sort()).toEqual(
      [ApiModule, ConsumerModule, DataModule].sort(),
    );
    expect(graph.ownerOf(Port)).toBe(ApiModule);
    expect(graph.ownerOf(Repo)).toBe(DataModule);
    expect(graph.ownerOf('unregistered')).toBeUndefined();
    expect(graph.nodeOf(ApiModule)?.exports.has(Port)).toBe(true);
    expect(graph.nodeOf(DataModule)?.exports.size).toBe(0);
  });

  test('merges decorator options with dynamic module options', () => {
    class ConfigurableModule {
      static forRoot(): DynamicModule {
        return {
          module: ConfigurableModule,
          imports: [DataModule],
          providers: [{ provide: 'extra', useValue: 1 }],
          exports: ['extra'],
        };
      }
    }

    const graph = buildModuleGraph([ConfigurableModule.forRoot()]);
    const node = graph.nodeOf(ConfigurableModule);

    expect(node?.imports).toEqual([DataModule]);
    expect(node?.providers.map((provider) => providerToken(provider))).toEqual(['extra']);
    expect(node?.exports.has('extra')).toBe(true);
  });

  test('exporting a token the module does not own throws naming the module', () => {
    @Module({ imports: [DataModule], exports: [Repo] })
    class BadExporter {}

    let message = '';
    try {
      buildModuleGraph([BadExporter]);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('BadExporter');
    expect(message).toContain('Repo');
  });

  test('visibility: own tokens and exports of imports only', () => {
    const graph = buildModuleGraph([ConsumerModule]);

    expect(graph.canSee(DataModule, Repo)).toBe(true);
    expect(graph.canSee(ConsumerModule, Port)).toBe(true);
    expect(graph.canSee(ConsumerModule, Repo)).toBe(false);
    expect(graph.canSee(ApiModule, Port)).toBe(true);
    expect(graph.canSee(ApiModule, Repo)).toBe(false);
    expect(graph.canSee(ConsumerModule, 'root-registered')).toBe(true);
  });

  test('global module exports are visible from any module, private tokens are not', () => {
    @Module({
      providers: [
        { provide: 'shared', useValue: 1 },
        { provide: 'secret', useValue: 2 },
      ],
      exports: ['shared'],
    })
    @Global()
    class GlobalSharedModule {}

    @Module({})
    class UnrelatedModule {}

    const graph = buildModuleGraph([UnrelatedModule, GlobalSharedModule]);

    expect(graph.canSee(UnrelatedModule, 'shared')).toBe(true);
    expect(graph.canSee(UnrelatedModule, 'secret')).toBe(false);
  });

  test('re-export passes visibility through the importing module', () => {
    @Module({ imports: [ReexportModule] })
    class FarConsumerModule {}

    const graph = buildModuleGraph([FarConsumerModule]);

    expect(graph.canSee(FarConsumerModule, Port)).toBe(true);
    expect(graph.canSee(FarConsumerModule, Repo)).toBe(false);
  });

  test('duplicate token across modules throws naming the token and both modules', () => {
    @Module({ providers: [{ provide: 'dup', useValue: 1 }] })
    class FirstModule {}

    @Module({ providers: [{ provide: 'dup', useValue: 2 }] })
    class SecondModule {}

    expect(() => buildModuleGraph([FirstModule, SecondModule])).toThrow('dup');
    let message = '';
    try {
      buildModuleGraph([FirstModule, SecondModule]);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('FirstModule');
    expect(message).toContain('SecondModule');
  });

  test('diamond imports register each module exactly once', () => {
    @Module({ imports: [DataModule] })
    class LeftModule {}

    @Module({ imports: [DataModule] })
    class RightModule {}

    @Module({ imports: [LeftModule, RightModule] })
    class TopModule {}

    const graph = buildModuleGraph([TopModule]);

    expect(graph.nodes.map((node) => node.ref).sort()).toEqual(
      [DataModule, LeftModule, RightModule, TopModule].sort(),
    );
  });

  test('same provider twice in one module keeps the later definition', () => {
    @Module({
      providers: [
        { provide: 'twice', useValue: 1 },
        { provide: 'twice', useValue: 2 },
      ],
    })
    class OverridingModule {}

    const graph = buildModuleGraph([OverridingModule]);

    expect(
      graph.nodeOf(OverridingModule)?.providers.map((provider) => providerToken(provider)),
    ).toEqual(['twice', 'twice']);
    expect(graph.ownerOf('twice')).toBe(OverridingModule);
  });
});

describe('moduleRefOf', () => {
  test('returns the module class for class and dynamic entries', () => {
    class PlainModule {}

    expect(moduleRefOf(PlainModule)).toBe(PlainModule);
    expect(moduleRefOf({ module: PlainModule })).toBe(PlainModule);
  });

  test('isDynamicModule detects dynamic entries only', () => {
    class PlainModule {}

    expect(isDynamicModule({ module: PlainModule })).toBe(true);
    expect(isDynamicModule(PlainModule)).toBe(false);
    expect(isDynamicModule(null)).toBe(false);
  });
});

describe('provider shorthand', () => {
  test('a bare class provider owns its class token and can be exported', () => {
    @Injectable()
    class ShorthandService {}

    @Module({ providers: [ShorthandService], exports: [ShorthandService] })
    class ShorthandApiModule {}

    @Module({ imports: [ShorthandApiModule] })
    class ShorthandConsumerModule {}

    const graph = buildModuleGraph([ShorthandConsumerModule]);

    expect(graph.ownerOf(ShorthandService)).toBe(ShorthandApiModule);
    expect(graph.canSee(ShorthandConsumerModule, ShorthandService)).toBe(true);
  });
});
