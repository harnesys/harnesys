import { Injectable } from '@harnesys/brix';
import type { AccountResponse, AccountsListResponse } from '@harnesys/contracts';
import { AppRegistryPort } from '../../domain/apps/app-registry.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { requireAccount } from './app-lookup.ts';
import { accountView } from './app-view.ts';

export interface ListAccountsRequest {
  orgId: string;
  kind?: string;
  appId?: string;
}

@Injectable()
export class ListAccountsUseCase {
  constructor(
    private readonly apps: AppRegistryPort,
    private readonly secrets: SecretStorePort,
  ) {}

  async execute(request: ListAccountsRequest): Promise<AccountsListResponse> {
    const secretKeys = await this.secrets.listKeys(request.orgId);
    return {
      accounts: this.apps
        .listAccounts(request.orgId)
        .filter((account) => !request.kind || account.kind === request.kind)
        .filter((account) => !request.appId || account.appId === request.appId)
        .map((account) => accountView(account, secretKeys)),
    };
  }
}

export interface GetAccountRequest {
  orgId: string;
  accountId: string;
}

@Injectable()
export class GetAccountUseCase {
  constructor(
    private readonly apps: AppRegistryPort,
    private readonly secrets: SecretStorePort,
  ) {}

  async execute(request: GetAccountRequest): Promise<AccountResponse> {
    const record = requireAccount(this.apps, request.orgId, request.accountId);
    return {
      account: accountView(record, await this.secrets.listKeys(request.orgId)),
    };
  }
}
