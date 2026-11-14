import type { AddonBindingRow } from '../../../../domain/addons/ports/binding-repository.port.ts';
import type { AccountHolderRef } from '../../../../domain/apps/errors.ts';
import { AccountHolderPort } from '../../../../domain/apps/ports/account-holder.port.ts';
import { AccountRepositoryPort } from '../../../../domain/apps/ports/account-repository.port.ts';
import type { AccountRecord } from '../../../../domain/apps/records.ts';
import { OWNER } from './fakes.ts';

export class FakeAccountRepository extends AccountRepositoryPort {
  records: AccountRecord[] = [];
  override list(): AccountRecord[] {
    return this.records;
  }
  override listByKind(orgId: string, kind: string): AccountRecord[] {
    return this.records.filter((record) => record.orgId === orgId && record.kind === kind);
  }
  override listByApp(orgId: string, appId: string): AccountRecord[] {
    return this.records.filter((record) => record.orgId === orgId && record.appId === appId);
  }
  override findById(orgId: string, accountId: string): AccountRecord | null {
    return this.records.find((record) => record.orgId === orgId && record.id === accountId) ?? null;
  }
  override findByIdentity(): AccountRecord | null {
    return null;
  }
  override insert(): void {}
  override update(): AccountRecord {
    throw new Error('not needed');
  }
  override remove(): void {}
}

interface HolderRegistration {
  holderType: string;
  lookup: (orgId: string, accountId: string) => Promise<AccountHolderRef[]>;
}

export class FakeAccountHolderPort extends AccountHolderPort {
  readonly registrations: HolderRegistration[] = [];
  override register(
    holderType: string,
    lookup: (orgId: string, accountId: string) => Promise<AccountHolderRef[]>,
  ): () => void {
    this.registrations.push({ holderType, lookup });
    return () => {
      const index = this.registrations.findIndex((entry) => entry.holderType === holderType);
      if (index >= 0) {
        this.registrations.splice(index, 1);
      }
    };
  }
  override async holders(orgId: string, accountId: string): Promise<AccountHolderRef[]> {
    const results: AccountHolderRef[] = [];
    for (const registration of this.registrations) {
      results.push(...(await registration.lookup(orgId, accountId)));
    }
    return results;
  }
}

export const ACCOUNT_RECORD: AccountRecord = {
  id: 'acc-1',
  orgId: OWNER.orgId,
  appId: null,
  kind: 'github-installation',
  externalAccountId: 'ext-1',
  partition: '',
  label: 'GitHub',
  status: 'connected',
  lastError: null,
  scopes: [],
  expiresAt: null,
  config: {},
  secretFields: [],
  metadata: {},
  verifiedAt: null,
  createdAt: '',
  updatedAt: '',
};

export function bindingRow(connectionId: string, accountId: string): AddonBindingRow {
  return {
    orgId: OWNER.orgId,
    addonId: OWNER.addonId,
    connectionId,
    accountId,
    createdAt: new Date().toISOString(),
  };
}
