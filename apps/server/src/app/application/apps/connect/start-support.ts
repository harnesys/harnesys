import { KindUnknownException } from '../../../domain/apps/errors.ts';
import { AccountRepositoryPort } from '../../../domain/apps/ports/account-repository.port.ts';
import type { AccountRecord } from '../../../domain/apps/records.ts';

export function requireExistingAccount(
  accounts: AccountRepositoryPort,
  orgId: string,
  accountId: string,
  kind: string,
): AccountRecord {
  const account = accounts.findById(orgId, accountId);
  if (!account || account.kind !== kind) {
    throw new KindUnknownException(kind);
  }
  return account;
}
