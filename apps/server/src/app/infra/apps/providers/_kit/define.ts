import type {
  AccountKindModule,
  AppKindModule,
  ProviderModule,
} from '../../../../domain/apps/provider-module.ts';

export function defineProvider(module: ProviderModule): ProviderModule {
  assertShape(module);
  return freezeModule(module);
}

export function defineAppKind<T extends AppKindModule>(kind: T): T {
  return Object.freeze({ ...kind, descriptor: Object.freeze({ ...kind.descriptor }) }) as T;
}

export function defineAccountKind<T extends AccountKindModule>(kind: T): T {
  return Object.freeze({ ...kind, descriptor: Object.freeze({ ...kind.descriptor }) }) as T;
}

function assertShape(module: ProviderModule): void {
  if (!module.descriptor.id) {
    throw new Error('provider descriptor requires an id');
  }
  if (module.accountKinds.length === 0) {
    throw new Error(`provider ${module.descriptor.id} requires at least one account kind`);
  }
}

function freezeModule(module: ProviderModule): ProviderModule {
  return Object.freeze({
    ...module,
    descriptor: Object.freeze({ ...module.descriptor }),
    appKinds: Object.freeze(module.appKinds.map((kind) => defineAppKind(kind))),
    accountKinds: Object.freeze(module.accountKinds.map((kind) => defineAccountKind(kind))),
  });
}
