import { Injectable } from '@harnesys/brix';
import type { AccountResponse, UpdateAccountBody } from '@harnesys/contracts';
import type { AccountUpdatePatch } from '../../domain/apps/account.ts';
import { accountSecretKey } from '../../domain/apps/account.ts';
import { AppRegistryPort } from '../../domain/apps/app-registry.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { mergeAccountFields } from './account-fields.ts';
import { requireAccount } from './app-lookup.ts';
import { accountView } from './app-view.ts';

export interface UpdateAccountRequest extends UpdateAccountBody {
  orgId: string;
  accountId: string;
}

@Injectable()
export class UpdateAccountUseCase {
  constructor(
    private readonly apps: AppRegistryPort,
    private readonly secrets: SecretStorePort,
  ) {}

  async execute(request: UpdateAccountRequest): Promise<AccountResponse> {
    const record = requireAccount(this.apps, request.orgId, request.accountId);
    const merged = mergeAccountFields({
      currentValues: record.values,
      currentSecretFields: record.secretFields,
      patch: { values: request.values ?? {}, credentials: request.credentials ?? {} },
    });
    for (const [field, value] of Object.entries(merged.credentials)) {
      await this.secrets.set(record.orgId, accountSecretKey(record.id, field), value);
    }
    for (const field of merged.removedSecrets) {
      await this.secrets.delete(record.orgId, accountSecretKey(record.id, field));
    }
    const patch: AccountUpdatePatch = {
      values: merged.values,
      secretFields: merged.secretFields,
      updatedAt: new Date().toISOString(),
    };
    if (request.label !== undefined) {
      patch.label = request.label.trim();
    }
    if (request.lastError !== undefined) {
      patch.lastError = request.lastError;
    }
    const updated = this.apps.updateAccount(request.orgId, request.accountId, patch);
    return { account: accountView(updated) };
  }
}
