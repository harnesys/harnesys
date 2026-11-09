import { Injectable } from '@harnesys/brix';
import type { AppResponse, UpdateAppBody } from '@harnesys/contracts';
import { appSecretPrefix } from '../../domain/apps/app.ts';
import { AppKindRegistryPort } from '../../domain/apps/app-kind.port.ts';
import { AppRegistryPort } from '../../domain/apps/app-registry.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { mergeAppFields, nextSecretFields } from './app-fields.ts';
import { requireApp } from './app-lookup.ts';
import { appView } from './app-view.ts';

export interface UpdateAppRequest extends UpdateAppBody {
  orgId: string;
  appId: string;
}

@Injectable()
export class UpdateAppUseCase {
  constructor(
    private readonly apps: AppRegistryPort,
    private readonly kinds: AppKindRegistryPort,
    private readonly secrets: SecretStorePort,
  ) {}

  async execute(request: UpdateAppRequest): Promise<AppResponse> {
    const record = requireApp(this.apps, request.orgId, request.appId);
    const descriptor = this.kinds.require(record.kind);
    const prefix = appSecretPrefix(record.id);
    const merged = mergeAppFields(descriptor, {
      currentValues: record.values,
      storedSecretFields: record.secretFields,
      patch: { values: request.values ?? {}, secrets: request.secrets ?? {} },
    });
    for (const [field, value] of Object.entries(merged.secrets)) {
      await this.secrets.set(request.orgId, prefix + field, value);
    }
    for (const field of merged.removedSecrets) {
      await this.secrets.delete(request.orgId, prefix + field);
    }
    const updated = this.apps.update(request.orgId, record.id, {
      label: request.label?.trim() ?? record.label,
      values: merged.values,
      secretFields: nextSecretFields(record.secretFields, merged),
      status: 'configured',
      updatedAt: new Date().toISOString(),
    });
    const accountCount = this.apps
      .listAccounts(request.orgId)
      .filter((account) => account.appId === updated.id).length;
    return {
      app: appView({
        record: updated,
        descriptor,
        accountCount,
      }),
    };
  }
}
