import { Injectable } from '@harnesys/brix';
import { AppNotFoundException, InvalidFieldsException } from '../../../domain/apps/errors.ts';
import type { FieldValue } from '../../../domain/apps/field.ts';
import { AccountEventPort } from '../../../domain/apps/ports/account-event.port.ts';
import { AppRepositoryPort } from '../../../domain/apps/ports/app-repository.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { ProviderRegistryPort } from '../../../domain/apps/ports/provider-registry.port.ts';
import { PublicUrlsPort } from '../../../domain/apps/ports/public-urls.port.ts';
import { SecretScopePort } from '../../../domain/apps/ports/secret-scope.port.ts';
import type { AppRecord, AppView } from '../../../domain/apps/records.ts';
import { resolveEditablePatch } from '../shared/field-validation.ts';
import { isoNow } from '../shared/record-views.ts';
import { buildAppView } from '../shared/view-builders.ts';
import { VerifyAppUseCase } from './verify-app.use-case.ts';

export interface UpdateAppRequest {
  orgId: string;
  appId: string;
  label?: string;
  values?: Record<string, FieldValue>;
  secrets?: Record<string, string | null>;
}

function collectSecretPatch(
  module: {
    secrets: readonly string[];
    descriptor: { fields: Array<{ key: string; type: string; required: boolean }> };
  },
  patch: Record<string, string | null>,
  errors: Record<string, 'required' | 'option' | 'unknown'>,
): { replace: Record<string, string>; remove: string[] } {
  const replace: Record<string, string> = {};
  const remove: string[] = [];
  const fields = new Map(module.descriptor.fields.map((field) => [field.key, field]));
  for (const [key, value] of Object.entries(patch)) {
    const field = fields.get(key);
    if (field?.type !== 'secret' || !module.secrets.includes(key)) {
      errors[key] = field ? 'option' : 'unknown';
      continue;
    }
    if (value === null) {
      if (field.required) {
        errors[key] = 'required';
      } else {
        remove.push(key);
      }
      continue;
    }
    replace[key] = value;
  }
  return { replace, remove };
}

function mergeSecretFields(
  existing: string[],
  replace: Record<string, string>,
  remove: string[],
): string[] {
  const removed = new Set(remove);
  const secretFields = new Set(existing.filter((key) => !removed.has(key)));
  for (const key of Object.keys(replace)) {
    secretFields.add(key);
  }
  return [...secretFields].sort();
}

@Injectable()
export class UpdateAppUseCase {
  constructor(
    private readonly apps: AppRepositoryPort,
    private readonly registry: ProviderRegistryPort,
    private readonly secrets: SecretScopePort,
    private readonly urls: PublicUrlsPort,
    private readonly clock: ClockPort,
    private readonly events: AccountEventPort,
    private readonly verifier: VerifyAppUseCase,
  ) {}

  async execute(request: UpdateAppRequest): Promise<{ app: AppView }> {
    const record = this.requireApp(request.orgId, request.appId);
    const module = this.registry.requireAppKind(record.kind);
    const values = request.values
      ? {
          ...record.values,
          ...resolveEditablePatch(module.descriptor.fields, request.values).values,
        }
      : record.values;
    const secretPatch = this.resolveSecretPatch(record, module, request.secrets ?? {});
    if (Object.keys(secretPatch.replace).length > 0) {
      await this.secrets.write(
        request.orgId,
        { type: 'app', id: record.id },
        module.secrets,
        secretPatch.replace,
      );
    }
    if (secretPatch.remove.length > 0) {
      await this.secrets.remove(request.orgId, { type: 'app', id: record.id }, secretPatch.remove);
    }
    const updated = this.apps.update(request.orgId, record.id, {
      label: request.label?.trim() || record.label,
      values,
      secretFields: secretPatch.secretFields,
      updatedAt: isoNow(this.clock.now()),
    });
    this.events.publish({
      type: 'app.updated',
      orgId: updated.orgId,
      appId: updated.id,
      accountId: null,
      kind: updated.kind,
      status: null,
    });
    const verified = module.verify ? await this.verifier.verifyRecord(updated) : updated;
    return { app: buildAppView(verified, this.registry, this.urls) };
  }

  private resolveSecretPatch(
    record: AppRecord,
    module: {
      secrets: readonly string[];
      descriptor: { fields: Array<{ key: string; type: string; required: boolean }> };
    },
    patch: Record<string, string | null>,
  ): { replace: Record<string, string>; remove: string[]; secretFields: string[] } {
    const errors: Record<string, 'required' | 'option' | 'unknown'> = {};
    const collected = collectSecretPatch(module, patch, errors);
    if (Object.keys(errors).length > 0) {
      throw new InvalidFieldsException(errors);
    }
    return {
      ...collected,
      secretFields: mergeSecretFields(record.secretFields, collected.replace, collected.remove),
    };
  }

  private requireApp(orgId: string, appId: string): AppRecord {
    const record = this.apps.findById(orgId, appId);
    if (!record) {
      throw new AppNotFoundException(appId);
    }
    return record;
  }
}
