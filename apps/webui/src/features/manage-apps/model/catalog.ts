import type {
  AccountKindDescriptor,
  AppKindDescriptor,
  AppView,
  CatalogResponse,
  ProviderCatalogEntry,
} from '@harnesys/contracts';

export interface KindIndex {
  providers: Map<string, ProviderCatalogEntry>;
  appKinds: Map<string, AppKindDescriptor>;
  accountKinds: Map<string, AccountKindDescriptor>;
}

export function buildKindIndex(catalog: CatalogResponse): KindIndex {
  const providers = new Map<string, ProviderCatalogEntry>();
  const appKinds = new Map<string, AppKindDescriptor>();
  const accountKinds = new Map<string, AccountKindDescriptor>();
  for (const provider of catalog.providers) {
    providers.set(provider.id, provider);
    for (const kind of provider.appKinds) {
      appKinds.set(kind.kind, kind);
    }
    for (const kind of provider.accountKinds) {
      accountKinds.set(kind.kind, kind);
    }
  }
  return { providers, appKinds, accountKinds };
}

export function appKindsFor(
  accountKind: AccountKindDescriptor,
  catalog: CatalogResponse,
): AppKindDescriptor[] {
  const index = buildKindIndex(catalog);
  return accountKind.requiresApp
    .map((kind) => index.appKinds.get(kind))
    .filter((kind): kind is AppKindDescriptor => Boolean(kind));
}

export function candidateApps(apps: AppView[], accountKind: AccountKindDescriptor): AppView[] {
  if (accountKind.requiresApp.length === 0) {
    return [];
  }
  return apps.filter((app) => accountKind.requiresApp.includes(app.kind));
}

export function scopeLabels(kind: AccountKindDescriptor, scopes: string[]): string[] {
  return scopes.map(
    (scope) => kind.scopes.options.find((option) => option.key === scope)?.label ?? scope,
  );
}
