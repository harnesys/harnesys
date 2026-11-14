import type { FieldSpec } from './field.ts';

export interface ProviderDescriptor {
  id: string;
  label: string;
  description: string;
  iconSvg: string | null;
  docsUrl: string | null;
}

export interface DescriptorHelp {
  steps: string[];
  consoleUrl: string | null;
}

export type DescriptorEndpoint = 'redirectUri' | 'webhookUrl';
export type AccountEndpoint = 'webhookUrl';

export interface AppCapabilities {
  setup: boolean;
  verify: boolean;
  webhook: boolean;
}

export interface AccountCapabilities {
  revoke: boolean;
  webhook: boolean;
}

export interface AppKindDescriptor {
  kind: string;
  provider: string;
  label: string;
  description: string;
  fields: FieldSpec[];
  help: DescriptorHelp;
  endpoints: DescriptorEndpoint[];
  capabilities: AppCapabilities;
}

export interface ScopeOption {
  key: string;
  label: string;
  description?: string;
}

export interface AccountScopes {
  options: ScopeOption[];
  defaults: string[];
}

export type AccessSource = 'stored' | 'derived';

export interface AccountAccessDescriptor {
  source: AccessSource;
  keys: string[];
}

export interface AccountKindDescriptor {
  kind: string;
  provider: string;
  label: string;
  description: string;
  requiresApp: string[];
  inputs: FieldSpec[];
  scopes: AccountScopes;
  access: AccountAccessDescriptor;
  endpoints: AccountEndpoint[];
  capabilities: AccountCapabilities;
}

export interface ProviderCatalogEntry extends ProviderDescriptor {
  appKinds: AppKindDescriptor[];
  accountKinds: AccountKindDescriptor[];
}

export interface CatalogResponse {
  providers: ProviderCatalogEntry[];
}
