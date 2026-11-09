import { Injectable } from '@harnesys/brix';
import type { AccountKindDescriptor, AppKindDescriptor } from '../../domain/apps/app-kind.port.ts';
import { AppKindProviderPort, AppKindRegistryPort } from '../../domain/apps/app-kind.port.ts';
import { AppKindUnknownException } from '../../domain/apps/apps.error.ts';
import { GithubAppKindProviderAdapter } from './providers/github/github-app-kind-provider.adapter.ts';
import { GoogleAppKindProviderAdapter } from './providers/google/google-app-kind-provider.adapter.ts';
import { TelegramAppKindProviderAdapter } from './providers/telegram/telegram-app-kind-provider.adapter.ts';

@Injectable()
export class AppKindRegistryAdapter extends AppKindRegistryPort {
  private readonly providers: readonly AppKindProviderPort[];

  private readonly byKind: Map<string, AppKindProviderPort>;

  constructor(
    private readonly google: GoogleAppKindProviderAdapter,
    private readonly github: GithubAppKindProviderAdapter,
    private readonly telegram: TelegramAppKindProviderAdapter,
  ) {
    super();
    this.providers = [this.google, this.github, this.telegram];
    this.byKind = new Map();
    for (const provider of this.providers) {
      for (const descriptor of [provider.descriptor(), ...provider.accountKinds()]) {
        this.byKind.set(descriptor.kind, provider);
      }
    }
  }

  list(): AppKindDescriptor[] {
    return this.providers.map((provider) => provider.descriptor());
  }

  find(kind: string): AppKindDescriptor | null {
    const provider = this.providers.find((entry) => entry.descriptor().kind === kind);
    return provider?.descriptor() ?? null;
  }

  require(kind: string): AppKindDescriptor {
    const found = this.find(kind);
    if (!found) {
      throw new AppKindUnknownException(kind);
    }
    return found;
  }

  providerOf(kind: string): AppKindProviderPort | null {
    return this.byKind.get(kind) ?? null;
  }

  requireProvider(kind: string): AppKindProviderPort {
    const provider = this.providerOf(kind);
    if (!provider) {
      throw new AppKindUnknownException(kind);
    }
    return provider;
  }

  accountKinds(): AccountKindDescriptor[] {
    return this.providers.flatMap((provider) => provider.accountKinds());
  }

  accountDescriptor(kind: string): AccountKindDescriptor | null {
    return this.accountKinds().find((descriptor) => descriptor.kind === kind) ?? null;
  }

  requireAccountDescriptor(kind: string): AccountKindDescriptor {
    const found = this.accountDescriptor(kind);
    if (!found) {
      throw new AppKindUnknownException(kind);
    }
    return found;
  }
}
