import { Injectable } from '@harnesys/brix';
import type { AccountErrorCode } from '../../../domain/apps/errors.ts';
import type { AccountEvent } from '../../../domain/apps/ports/account-event.port.ts';
import { AccountEventPort } from '../../../domain/apps/ports/account-event.port.ts';
import { AccountRepositoryPort } from '../../../domain/apps/ports/account-repository.port.ts';
import { ProviderRegistryPort } from '../../../domain/apps/ports/provider-registry.port.ts';
import { PublicUrlsPort } from '../../../domain/apps/ports/public-urls.port.ts';
import type { AppCredentials, Credentials } from '../../../domain/apps/provider-module.ts';
import type { AccountView } from '../../../domain/apps/records.ts';
import { AccountAccessService } from '../access/account-access.service.ts';
import { type AccountFindQuery, AccountsFacadePort } from '../accounts-facade.port.ts';
import { coversScopes } from '../shared/scope-coverage.ts';
import { buildAccountView } from '../shared/view-builders.ts';

@Injectable()
export class AccountsFacadeService extends AccountsFacadePort {
  constructor(
    private readonly accounts: AccountRepositoryPort,
    private readonly registry: ProviderRegistryPort,
    private readonly urls: PublicUrlsPort,
    private readonly accessService: AccountAccessService,
    private readonly events: AccountEventPort,
  ) {
    super();
  }

  async find(orgId: string, query: AccountFindQuery): Promise<AccountView[]> {
    return this.accounts
      .list(orgId)
      .filter((account) => this.registry.accountKind(account.kind) !== null)
      .filter((account) => !query.kind || account.kind === query.kind)
      .filter((account) => !query.appId || account.appId === query.appId)
      .filter((account) => !query.connectedOnly || account.status === 'connected')
      .filter((account) => !query.scopes || coversScopes(account.scopes, query.scopes))
      .map((account) => buildAccountView(account, this.registry, this.urls));
  }

  async get(orgId: string, accountId: string): Promise<AccountView | null> {
    const account = this.accounts.findById(orgId, accountId);
    return account && this.registry.accountKind(account.kind)
      ? buildAccountView(account, this.registry, this.urls)
      : null;
  }

  access(
    orgId: string,
    accountId: string,
    opts?: { scopes?: string[] },
  ): Promise<{ credentials: Credentials; expiresAt: number | null; app?: AppCredentials | null }> {
    return this.accessService.access(orgId, accountId, opts);
  }

  report(orgId: string, accountId: string, code: AccountErrorCode): Promise<void> {
    return this.accessService.report(orgId, accountId, code);
  }

  subscribe(orgId: string, handler: (event: AccountEvent) => void): () => void {
    return this.events.subscribe(orgId, handler);
  }
}
