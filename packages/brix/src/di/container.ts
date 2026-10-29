import 'reflect-metadata';
import { injectTokensKey } from './inject';
import type { UnknownClass } from './injectable';
import { isInjectable } from './injectable';
import type { ModuleGraph, ModuleNode } from './module-graph';
import { describeToken, providerToken } from './module-graph';

export interface ClassProvider {
  provide: unknown;
  useClass: UnknownClass;
}
export interface FactoryProvider {
  provide: unknown;
  useFactory: (...deps: never[]) => unknown;
  inject?: unknown[];
}
export interface ValueProvider {
  provide: unknown;
  useValue: unknown;
}
export type Provider = UnknownClass | ClassProvider | FactoryProvider | ValueProvider;

type Creatable = new (...args: unknown[]) => unknown;
type Factory = (...deps: unknown[]) => unknown;
interface Named {
  name: string;
}

function classNameOf(target: UnknownClass): string {
  const named = target as Creatable & Named;
  return named.name;
}

export interface ConsumerScoped {
  forConsumer(consumerName: string): unknown;
}

function isConsumerScoped(value: unknown): value is ConsumerScoped {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { forConsumer?: unknown }).forConsumer === 'function'
  );
}

function scopeToConsumer(instance: unknown, consumerName: string): unknown {
  return isConsumerScoped(instance) ? instance.forConsumer(consumerName) : instance;
}

export class Container {
  private readonly definitions = new Map<unknown, Provider>();
  private readonly singletons = new Map<unknown, unknown>();
  private graph: ModuleGraph | undefined;

  register(provider: Provider): void {
    if (typeof provider === 'function') {
      this.definitions.set(provider, provider);
      return;
    }
    this.definitions.set(provider.provide, provider);
  }

  registerModules(graph: ModuleGraph): void {
    this.graph = graph;
    for (const node of [...graph.nodes].reverse()) {
      for (const provider of node.providers) {
        this.registerProvider(provider, node, graph.multi);
      }
      for (const controller of node.controllers) {
        this.definitions.set(controller, controller);
      }
      if (!this.definitions.has(node.ref)) {
        this.definitions.set(node.ref, node.ref);
      }
    }
  }

  private registerProvider(provider: Provider, node: ModuleNode, multi: Set<unknown>): void {
    const token = providerToken(provider);
    if (multi.has(token)) {
      return;
    }
    if (typeof provider === 'function') {
      this.assertInjectable(provider, node.ref);
      this.definitions.set(token, provider);
      return;
    }
    if ('useClass' in provider) {
      this.assertInjectable(provider.useClass, node.ref);
    }
    this.definitions.set(token, provider);
  }

  has(token: unknown): boolean {
    return this.definitions.has(token);
  }

  resolve<T>(token: unknown): T {
    return this.resolveToken(token, [], undefined) as T;
  }

  resolveFrom<T>(moduleRef: UnknownClass, token: unknown): T {
    return this.resolveToken(token, [], moduleRef) as T;
  }

  instances(): unknown[] {
    return [...new Set(this.singletons.values())];
  }

  resolveAll(): unknown[] {
    for (const token of [...this.definitions.keys()]) {
      this.resolveToken(token, [], undefined);
    }
    return this.instances();
  }

  private assertInjectable(target: UnknownClass, moduleRef: UnknownClass): void {
    if (!isInjectable(target)) {
      throw new Error(
        `Class ${classNameOf(target)} is registered as a provider in module ${moduleRef.name} ` +
          'but is not @Injectable(): add @Injectable() to the class',
      );
    }
  }

  private resolveToken(
    token: unknown,
    path: unknown[],
    requester: UnknownClass | undefined,
  ): unknown {
    if (
      requester !== undefined &&
      this.graph !== undefined &&
      !this.graph.canSee(requester, token)
    ) {
      const owner = this.graph.ownerOf(token);
      throw new Error(
        `Cannot resolve token ${describeToken(token)} from module ${requester.name}: ` +
          (owner === undefined
            ? 'it is not visible to the module'
            : `it is provided by ${owner.name} but not exported`),
      );
    }
    if (this.singletons.has(token)) {
      return this.singletons.get(token);
    }
    const definition = this.definitions.get(token);
    if (definition === undefined) {
      throw new Error(`Cannot resolve token ${describeToken(token)}: no provider registered`);
    }
    if (path.includes(token)) {
      const cycle = [...path, token].map((entry) => this.describeInCycle(entry));
      throw new Error(`Circular dependency detected: ${cycle.join(' -> ')}`);
    }
    const next = [...path, token];
    const depRequester = this.graph?.ownerOf(token) ?? requester;
    const instance = this.create(definition, next, depRequester);
    this.singletons.set(token, instance);
    return instance;
  }

  private create(
    definition: Provider,
    path: unknown[],
    requester: UnknownClass | undefined,
  ): unknown {
    if (typeof definition === 'function') {
      return this.instantiate(definition, path, requester);
    }
    if ('useValue' in definition) {
      return definition.useValue;
    }
    if ('useFactory' in definition) {
      const factory = definition.useFactory as Factory;
      const deps = (definition.inject ?? []).map((dep) => this.resolveToken(dep, path, requester));
      return factory(...deps);
    }
    return this.instantiate(definition.useClass, path, requester);
  }

  private instantiate(
    target: UnknownClass,
    path: unknown[],
    requester: UnknownClass | undefined,
  ): unknown {
    const args = this.resolveConstructorArgs(target, path, requester);
    const creatable = target as Creatable;
    return new creatable(...args);
  }

  private resolveConstructorArgs(
    target: UnknownClass,
    path: unknown[],
    requester: UnknownClass | undefined,
  ): unknown[] {
    const paramtypes = Reflect.getMetadata('design:paramtypes', target) as
      | Array<unknown>
      | undefined;
    const overrides = Reflect.getMetadata(injectTokensKey, target) as Array<unknown> | undefined;
    const count = Math.max(paramtypes?.length ?? 0, overrides?.length ?? 0);
    const args: unknown[] = [];
    for (let i = 0; i < count; i += 1) {
      const token = overrides?.[i] ?? paramtypes?.[i];
      if (token === Object) {
        throw new Error(
          `Cannot resolve dependency at index ${i} of ${classNameOf(target)}: metadata erased the ` +
            'token to Object (type-only import). Use @Inject(Token) for DI tokens',
        );
      }
      if (token === undefined) {
        throw new Error(`Cannot resolve dependency at index ${i} of ${classNameOf(target)}`);
      }
      args.push(scopeToConsumer(this.resolveToken(token, path, requester), classNameOf(target)));
    }
    return args;
  }

  private describeInCycle(token: unknown): string {
    const definition = this.definitions.get(token);
    if (typeof definition === 'object' && definition !== null && 'useClass' in definition) {
      return `${describeToken(token)} (${classNameOf(definition.useClass)})`;
    }
    if (typeof definition === 'function') {
      return classNameOf(definition);
    }
    return describeToken(token);
  }
}

export function resolveMultiProviders<T>(
  container: Container,
  providers: Provider[],
  token: unknown,
): T[] {
  const resolved: T[] = [];
  let index = 0;
  for (const provider of providers) {
    if (providerToken(provider) !== token) {
      continue;
    }
    if (typeof provider === 'function') {
      container.register(provider);
      resolved.push(container.resolve<T>(provider));
      continue;
    }
    if ('useClass' in provider) {
      container.register(provider.useClass);
      resolved.push(container.resolve<T>(provider.useClass));
    } else if ('useValue' in provider) {
      resolved.push(provider.useValue as T);
    } else {
      const multiToken = `${String(token)}#${index}`;
      index += 1;
      container.register({
        provide: multiToken,
        useFactory: provider.useFactory,
        inject: provider.inject,
      });
      resolved.push(container.resolve<T>(multiToken));
    }
  }
  return resolved;
}
