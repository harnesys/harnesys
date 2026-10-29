export type IntegrationProvider = 'google' | 'github';
export type IntegrationStatus = 'connected' | 'expired' | 'error';

export interface IntegrationRecord {
  id: string;
  orgId: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  accountLabel: string;
  externalAccountId: string;
  credRef: string;
  providerJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  lastRefreshAt: string | null;
}

export type UpdateIntegrationPatch = Partial<Omit<IntegrationRecord, 'id' | 'orgId'>>;

export abstract class IntegrationRegistryPort {
  abstract list(orgId: string): IntegrationRecord[];
  abstract findById(orgId: string, id: string): IntegrationRecord | null;
  abstract findByExternalAccount(
    orgId: string,
    provider: IntegrationProvider,
    externalAccountId: string,
  ): IntegrationRecord | null;
  abstract insert(record: IntegrationRecord): void;
  abstract update(orgId: string, id: string, patch: UpdateIntegrationPatch): IntegrationRecord;
  abstract remove(orgId: string, id: string): void;
}
