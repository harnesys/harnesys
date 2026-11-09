import { Injectable } from '@harnesys/brix';
import { appSecretPrefix } from '../../domain/apps/app.ts';
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
    requireApp(this.apps, request.orgId, request.appId);
    const accounts = this.apps
      .listAccounts(request.orgId)
      .filter((account) => account.appId === request.appId);
    for (const account of accounts) {
      await this.secrets.delete(request.orgId, account.secretRef);
      this.apps.removeAccount(request.orgId, account.id);
    }
    const prefix = appSecretPrefix(request.appId);
    for (const key of await this.secrets.listKeys(request.orgId)) {
      if (key.startsWith(prefix)) {
        await this.secrets.delete(request.orgId, key);
      }
    }
    this.apps.remove(request.orgId, request.appId);
  }
}
