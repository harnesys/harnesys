import { Injectable } from '@harnesys/brix';
import type { RegisterAccountBody, RegisterAccountResponse } from '@harnesys/contracts';
import {
  type AccountRecord,
  accountSecretRef,
  normalizeAccountScopes,
  scopeKeyOf,
} from '../../domain/apps/account.ts';
import { AppRegistryPort } from '../../domain/apps/app-registry.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
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
    const credentials = normalizeCredentials(request.credentials);
    const externalAccountId = request.externalAccountId.trim();
    const label = request.label.trim();
    const now = new Date().toISOString();
    const existing = this.apps.findAccountByKey(request.orgId, {
      kind: request.kind,
      externalAccountId,
      scopeKey,
    });
    if (existing) {
      if (Object.keys(credentials).length > 0) {
        await this.secrets.set(request.orgId, existing.secretRef, JSON.stringify(credentials));
      }
      const secretKeys = await this.secrets.listKeys(request.orgId);
      const updated = this.apps.updateAccount(request.orgId, existing.id, {
        appId: request.appId ?? existing.appId,
        label,
        scopes,
        status: secretKeys.includes(existing.secretRef) ? 'connected' : existing.status,
        lastError: null,
        updatedAt: now,
      });
      return { account: accountView(updated, secretKeys), created: false };
    }
    const id = crypto.randomUUID();
    const secretRef = accountSecretRef(id);
    const hasCredentials = Object.keys(credentials).length > 0;
    if (hasCredentials) {
      await this.secrets.set(request.orgId, secretRef, JSON.stringify(credentials));
    }
    const record: AccountRecord = {
      id,
      orgId: request.orgId,
      appId: request.appId ?? null,
      kind: request.kind,
      externalAccountId,
      label,
      status: hasCredentials ? 'connected' : 'pending',
      scopes,
      scopeKey,
      secretRef,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.apps.insertAccount(record);
    return {
      account: accountView(record, await this.secrets.listKeys(request.orgId)),
      created: true,
    };
  }
}

function normalizeCredentials(input: Record<string, string>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, raw] of Object.entries(input)) {
    const value = raw.trim();
    if (value) {
      output[key] = value;
    }
  }
  return output;
}
