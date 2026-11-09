import type { AccountRecord } from '../../domain/apps/account.ts';
import type { AppRecord } from '../../domain/apps/app.ts';
import type { AppRegistryPort } from '../../domain/apps/app-registry.port.ts';
import { AccountNotFoundException, AppNotFoundException } from '../../domain/apps/apps.error.ts';

export function requireApp(apps: AppRegistryPort, orgId: string, appId: string): AppRecord {
  const found = apps.findById(orgId, appId);
  if (!found) {
    throw new AppNotFoundException(orgId, appId);
  }
  return found;
}

export function requireAccount(
  apps: AppRegistryPort,
  orgId: string,
  accountId: string,
): AccountRecord {
  const found = apps.findAccount(orgId, accountId);
  if (!found) {
    throw new AccountNotFoundException(orgId, accountId);
  }
  return found;
}
