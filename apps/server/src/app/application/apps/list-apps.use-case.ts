import { Injectable } from '@harnesys/brix';
import type { AppResponse, AppsListResponse } from '@harnesys/contracts';
import { AppKindRegistryPort } from '../../domain/apps/app-kind.port.ts';
import { AppRegistryPort } from '../../domain/apps/app-registry.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { requireApp } from './app-lookup.ts';
import { appView } from './app-view.ts';

export interface ListAppsRequest {
  orgId: string;
  kind?: string;
}

@Injectable()
export class ListAppsUseCase {
  constructor(
    private readonly apps: AppRegistryPort,
    private readonly kinds: AppKindRegistryPort,
    private readonly secrets: SecretStorePort,
  ) {}

  async execute(request: ListAppsRequest): Promise<AppsListResponse> {
    const records = request.kind
      ? this.apps.listByKind(request.orgId, request.kind)
      : this.apps.list(request.orgId);
    const accounts = this.apps.listAccounts(request.orgId);
    const secretKeys = await this.secrets.listKeys(request.orgId);
    return {
      apps: records.map((record) =>
        appView({
          record,
          descriptor: this.kinds.find(record.kind),
          accountCount: accounts.filter((account) => account.appId === record.id).length,
          secretKeys,
        }),
      ),
    };
  }
}

export interface GetAppRequest {
  orgId: string;
  appId: string;
}

@Injectable()
export class GetAppUseCase {
  constructor(
    private readonly apps: AppRegistryPort,
    private readonly kinds: AppKindRegistryPort,
    private readonly secrets: SecretStorePort,
  ) {}

  async execute(request: GetAppRequest): Promise<AppResponse> {
    const record = requireApp(this.apps, request.orgId, request.appId);
    const accountCount = this.apps
      .listAccounts(request.orgId)
      .filter((account) => account.appId === record.id).length;
    return {
      app: appView({
        record,
        descriptor: this.kinds.find(record.kind),
        accountCount,
        secretKeys: await this.secrets.listKeys(request.orgId),
      }),
    };
  }
}
