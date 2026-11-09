import { Injectable } from '@harnesys/brix';
import type { AccountResponse, UpdateAccountBody } from '@harnesys/contracts';
import type { AccountUpdatePatch } from '../../domain/apps/account.ts';
import { AppRegistryPort } from '../../domain/apps/app-registry.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
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
    requireAccount(this.apps, request.orgId, request.accountId);
    const patch: AccountUpdatePatch = { updatedAt: new Date().toISOString() };
    if (request.label !== undefined) {
      patch.label = request.label.trim();
    }
    if (request.status !== undefined) {
      patch.status = request.status;
    }
    if (request.lastError !== undefined) {
      patch.lastError = request.lastError;
    }
    const updated = this.apps.updateAccount(request.orgId, request.accountId, patch);
    return {
      account: accountView(updated, await this.secrets.listKeys(request.orgId)),
    };
  }
}
