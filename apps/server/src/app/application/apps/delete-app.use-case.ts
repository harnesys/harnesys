import { Injectable } from '@harnesys/brix';
import { accountSecretKey } from '../../domain/apps/account.ts';
import { appSecretKey } from '../../domain/apps/app.ts';
import { AppRegistryPort } from '../../domain/apps/app-registry.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { requireApp } from './app-lookup.ts';

export interface DeleteAppRequest {
  orgId: string;
  appId: string;
}

@Injectable()
export class DeleteAppUseCase {
  constructor(
    private readonly apps: AppRegistryPort,
    private readonly secrets: SecretStorePort,
  ) {}

  async execute(request: DeleteAppRequest): Promise<void> {
    const record = requireApp(this.apps, request.orgId, request.appId);
    const accounts = this.apps
      .listAccounts(request.orgId)
      .filter((account) => account.appId === record.id);
    for (const account of accounts) {
      for (const field of account.secretFields) {
        await this.secrets.delete(account.orgId, accountSecretKey(account.id, field));
      }
      this.apps.removeAccount(request.orgId, account.id);
    }
    for (const field of record.secretFields) {
      await this.secrets.delete(record.orgId, appSecretKey(record.id, field));
    }
    this.apps.remove(request.orgId, request.appId);
  }
}
