import type { AccountKey, AccountRecord, AccountUpdatePatch } from './account.ts';
import type { AppRecord, AppUpdatePatch } from './app.ts';

export abstract class AppRegistryPort {
  abstract list(orgId: string): AppRecord[];

  abstract listByKind(orgId: string, kind: string): AppRecord[];

  abstract findById(orgId: string, appId: string): AppRecord | null;

  abstract insert(record: AppRecord): void;

  abstract update(orgId: string, appId: string, patch: AppUpdatePatch): AppRecord;

  abstract remove(orgId: string, appId: string): void;

  abstract listAccounts(orgId: string): AccountRecord[];

  abstract findAccount(orgId: string, accountId: string): AccountRecord | null;

  abstract findAccountByKey(orgId: string, key: AccountKey): AccountRecord | null;

  abstract insertAccount(record: AccountRecord): void;

  abstract updateAccount(
    orgId: string,
    accountId: string,
    patch: AccountUpdatePatch,
  ): AccountRecord;

  abstract removeAccount(orgId: string, accountId: string): void;
}
