import { Inject, Injectable, Logger } from '@harnesys/brix';
import type {
  AccountKindDescriptor,
  AppKindDescriptor,
  CatalogResponse,
} from '../../domain/apps/descriptors.ts';
import { KindUnknownException } from '../../domain/apps/errors.ts';
import { ProviderRegistryPort } from '../../domain/apps/ports/provider-registry.port.ts';
import type {
  AccountKindModule,
  AppKindModule,
  ProviderModule,
} from '../../domain/apps/provider-module.ts';
import { validateRegistry } from './provider-validation.ts';
import { providerModules } from './providers/index.ts';

@Injectable()
export class ProviderRegistryAdapter extends ProviderRegistryPort {
  private readonly validated = validateRegistry(providerModules);

  constructor(@Inject(Logger) logger: Logger) {
    super();
    logger.child('apps-registry').info(
      {
        providers: this.validated.modules.length,
        appKinds: this.validated.appKinds.size,
        accountKinds: this.validated.accountKinds.size,
      },
      'provider registry loaded',
    );
  }

  all(): readonly ProviderModule[] {
    return this.validated.modules;
  }

  provider(id: string): ProviderModule | null {
    return this.validated.modules.find((module) => module.descriptor.id === id) ?? null;
  }

  appKind(kind: string): AppKindModule | null {
    return this.validated.appKinds.get(kind) ?? null;
  }

  accountKind(kind: string): AccountKindModule | null {
    return this.validated.accountKinds.get(kind) ?? null;
  }

  requireProvider(id: string): ProviderModule {
    const module = this.provider(id);
    if (!module) {
      throw new KindUnknownException(id);
    }
    return module;
  }

  requireAppKind(kind: string): AppKindModule {
    const module = this.appKind(kind);
    if (!module) {
      throw new KindUnknownException(kind);
    }
    return module;
  }

  requireAccountKind(kind: string): AccountKindModule {
    const module = this.accountKind(kind);
    if (!module) {
      throw new KindUnknownException(kind);
    }
    return module;
  }

  providerOfKind(kind: string): ProviderModule {
    const module = this.validated.providerByKind.get(kind);
    if (!module) {
      throw new KindUnknownException(kind);
    }
    return module;
  }

  catalog(): CatalogResponse {
    return {
      providers: this.validated.modules.map((module) => ({
        ...module.descriptor,
        appKinds: module.appKinds.map((kind) => appDescriptorOf(kind)),
        accountKinds: module.accountKinds.map((kind) => accountDescriptorOf(kind)),
      })),
    };
  }
}

function appDescriptorOf(kind: AppKindModule): AppKindDescriptor {
  return {
    ...kind.descriptor,
    capabilities: {
      setup: kind.setup !== undefined,
      verify: kind.verify !== undefined,
      webhook: kind.webhook !== undefined,
    },
  };
}

function accountDescriptorOf(kind: AccountKindModule): AccountKindDescriptor {
  return {
    ...kind.descriptor,
    capabilities: {
      revoke: kind.revoke !== undefined,
      webhook: kind.webhook !== undefined,
    },
  };
}
