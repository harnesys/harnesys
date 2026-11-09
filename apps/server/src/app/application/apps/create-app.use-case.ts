import { Injectable } from '@harnesys/brix';
import type { AppResponse, CreateAppBody } from '@harnesys/contracts';
import { type AppRecord, appSecretKey } from '../../domain/apps/app.ts';
import { AppKindRegistryPort } from '../../domain/apps/app-kind.port.ts';
import { AppRegistryPort } from '../../domain/apps/app-registry.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { resolveAppFields } from './app-fields.ts';
import { appView } from './app-view.ts';

export interface CreateAppRequest extends CreateAppBody {
  orgId: string;
}

@Injectable()
export class CreateAppUseCase {
  constructor(
    private readonly apps: AppRegistryPort,
    private readonly kinds: AppKindRegistryPort,
    private readonly secrets: SecretStorePort,
  ) {}

  async execute(request: CreateAppRequest): Promise<AppResponse> {
    const descriptor = this.kinds.require(request.kind);
    const resolved = resolveAppFields(descriptor, {
      values: request.values,
      secrets: request.secrets,
    });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    for (const [field, value] of Object.entries(resolved.secrets)) {
      await this.secrets.set(request.orgId, appSecretKey(id, field), value);
    }
    const record: AppRecord = {
      id,
      orgId: request.orgId,
      kind: descriptor.kind,
      label: request.label.trim(),
      status: 'configured',
      values: resolved.values,
      secretFields: Object.keys(resolved.secrets).sort(),
      createdAt: now,
      updatedAt: now,
    };
    this.apps.insert(record);
    return {
      app: appView({
        record,
        descriptor,
        accountCount: 0,
      }),
    };
  }
}
