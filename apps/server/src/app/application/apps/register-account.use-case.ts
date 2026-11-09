import { Injectable } from '@harnesys/brix';
import type { RegisterAccountBody, RegisterAccountResponse } from '@harnesys/contracts';
import {
  type AccountRecord,
  accountSecretKey,
  normalizeAccountScopes,
  scopeKeyOf,
} from '../../domain/apps/account.ts';
import { AppRegistryPort } from '../../domain/apps/app-registry.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import type { AccountFieldMergeResult } from './account-fields.ts';
import { mergeAccountFields } from './account-fields.ts';
import { requireApp } from './app-lookup.ts';
import { accountView } from './app-view.ts';

export interface RegisterAccountRequest extends RegisterAccountBody {
  orgId: string;
}

@Injectable()
export class RegisterAccountUseCase {
  constructor(
    private readonly apps: AppRegistryPort,
    private readonly secrets: SecretStorePort,
  ) {}

  async execute(request: RegisterAccountRequest): Promise<RegisterAccountResponse> {
    if (request.appId) {
      requireApp(this.apps, request.orgId, request.appId);
    }
    const scopes = normalizeAccountScopes(request.scopes);
    const scopeKey = scopeKeyOf(scopes);
    const patch = {
      values: request.values ?? {},
      credentials: request.credentials,
    };
    const externalAccountId = request.externalAccountId.trim();
    const label = request.label.trim();
    const now = new Date().toISOString();
    const existing = this.apps.findAccountByKey(request.orgId, {
      kind: request.kind,
      externalAccountId,
      scopeKey,
    });
    if (existing) {
      const merged = mergeAccountFields({
        currentValues: existing.values,
        currentSecretFields: existing.secretFields,
        patch,
      });
      await this.writeSecrets(request.orgId, existing.id, merged);
      const updated = this.apps.updateAccount(request.orgId, existing.id, {
        appId: request.appId ?? existing.appId,
        label,
        scopes,
        values: merged.values,
        secretFields: merged.secretFields,
        lastError: null,
        updatedAt: now,
      });
      return { account: accountView(updated), created: false };
    }
    const id = crypto.randomUUID();
    const merged = mergeAccountFields({ currentValues: {}, currentSecretFields: [], patch });
    await this.writeSecrets(request.orgId, id, merged);
    const record: AccountRecord = {
      id,
      orgId: request.orgId,
      appId: request.appId ?? null,
      kind: request.kind,
      externalAccountId,
      label,
      status: 'pending',
      scopes,
      scopeKey,
      values: merged.values,
      secretFields: merged.secretFields,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.apps.insertAccount(record);
    return { account: accountView(record), created: true };
  }

  private async writeSecrets(
    orgId: string,
    accountId: string,
    merged: AccountFieldMergeResult,
  ): Promise<void> {
    for (const [field, value] of Object.entries(merged.credentials)) {
      await this.secrets.set(orgId, accountSecretKey(accountId, field), value);
    }
    for (const field of merged.removedSecrets) {
      await this.secrets.delete(orgId, accountSecretKey(accountId, field));
    }
  }
}
