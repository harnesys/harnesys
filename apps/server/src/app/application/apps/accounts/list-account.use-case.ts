import { Injectable } from '@harnesys/brix';
import { AccountNotFoundException } from '../../../domain/apps/errors.ts';
import { AccountRepositoryPort } from '../../../domain/apps/ports/account-repository.port.ts';
import { ProviderRegistryPort } from '../../../domain/apps/ports/provider-registry.port.ts';
import { PublicUrlsPort } from '../../../domain/apps/ports/public-urls.port.ts';
import type { AccountView } from '../../../domain/apps/records.ts';
import { coversScopes } from '../shared/scope-coverage.ts';
import { buildAccountView } from '../shared/view-builders.ts';

export interface ListAccountsRequest {
  orgId: string;
  kind?: string;
  appId?: string;
  status?: string;
  scopes?: string[];
}

@Injectable()
export class ListAccountsUseCase {
  constructor(
    private readonly accounts: AccountRepositoryPort,
    private readonly registry: ProviderRegistryPort,
    private readonly urls: PublicUrlsPort,
  ) {}

  execute(request: ListAccountsRequest): { accounts: AccountView[] } {
    const records = this.accounts.list(request.orgId);
    return {
      accounts: records
        .filter((account) => this.registry.accountKind(account.kind) !== null)
        .filter((account) => !request.kind || account.kind === request.kind)
        .filter((account) => !request.appId || account.appId === request.appId)
        .filter((account) => !request.status || account.status === request.status)
        .filter((account) => !request.scopes || coversScopes(account.scopes, request.scopes))
        .map((account) => buildAccountView(account, this.registry, this.urls)),
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
    private readonly accounts: AccountRepositoryPort,
    private readonly registry: ProviderRegistryPort,
    private readonly urls: PublicUrlsPort,
  ) {}

  execute(request: GetAccountRequest): { account: AccountView } {
    const record = this.accounts.findById(request.orgId, request.accountId);
    if (!record || !this.registry.accountKind(record.kind)) {
      throw new AccountNotFoundException(request.accountId);
    }
    return { account: buildAccountView(record, this.registry, this.urls) };
  }
}
