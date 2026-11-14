import type { CatalogResponse } from '../descriptors.ts';
import type { AccountKindModule, AppKindModule, ProviderModule } from '../provider-module.ts';

export abstract class ProviderRegistryPort {
  abstract all(): readonly ProviderModule[];
  abstract provider(id: string): ProviderModule | null;
  abstract appKind(kind: string): AppKindModule | null;
  abstract accountKind(kind: string): AccountKindModule | null;
  abstract requireProvider(id: string): ProviderModule;
  abstract requireAppKind(kind: string): AppKindModule;
  abstract requireAccountKind(kind: string): AccountKindModule;
  abstract providerOfKind(kind: string): ProviderModule;
  abstract catalog(): CatalogResponse;
}
