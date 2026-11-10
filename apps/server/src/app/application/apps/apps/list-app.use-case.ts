import { Injectable } from '@harnesys/brix';
import { AppNotFoundException } from '../../../domain/apps/errors.ts';
import { AppRepositoryPort } from '../../../domain/apps/ports/app-repository.port.ts';
import { ProviderRegistryPort } from '../../../domain/apps/ports/provider-registry.port.ts';
import { PublicUrlsPort } from '../../../domain/apps/ports/public-urls.port.ts';
import type { AppView } from '../../../domain/apps/records.ts';
import { buildAppView } from '../shared/view-builders.ts';

export interface ListAppsRequest {
  orgId: string;
  kind?: string;
}

@Injectable()
export class ListAppsUseCase {
  constructor(
    private readonly apps: AppRepositoryPort,
    private readonly registry: ProviderRegistryPort,
    private readonly urls: PublicUrlsPort,
  ) {}

  execute(request: ListAppsRequest): { apps: AppView[] } {
    const records = request.kind
      ? this.apps.listByKind(request.orgId, request.kind)
      : this.apps.list(request.orgId);
    return {
      apps: records
        .filter((record) => this.registry.appKind(record.kind) !== null)
        .map((record) => buildAppView(record, this.registry, this.urls)),
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
    private readonly apps: AppRepositoryPort,
    private readonly registry: ProviderRegistryPort,
    private readonly urls: PublicUrlsPort,
  ) {}

  execute(request: GetAppRequest): { app: AppView } {
    const record = this.apps.findById(request.orgId, request.appId);
    if (!record || !this.registry.appKind(record.kind)) {
      throw new AppNotFoundException(request.appId);
    }
    return { app: buildAppView(record, this.registry, this.urls) };
  }
}
