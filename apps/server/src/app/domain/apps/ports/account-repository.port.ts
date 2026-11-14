import type { AccountRecord, AccountUpdatePatch } from '../records.ts';

export interface AccountIdentity {
  kind: string;
  externalAccountId: string;
  partition: string;
}

export abstract class AccountRepositoryPort {
  abstract list(orgId: string): AccountRecord[];
  abstract listByKind(orgId: string, kind: string): AccountRecord[];
  abstract listByApp(orgId: string, appId: string): AccountRecord[];
  abstract findById(orgId: string, accountId: string): AccountRecord | null;
  abstract findByIdentity(orgId: string, identity: AccountIdentity): AccountRecord | null;
  abstract insert(record: AccountRecord): void;
  abstract update(orgId: string, accountId: string, patch: AccountUpdatePatch): AccountRecord;
  abstract remove(orgId: string, accountId: string): void;
}
