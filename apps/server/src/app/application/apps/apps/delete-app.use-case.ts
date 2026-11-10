import { Inject, Injectable, Logger } from '@harnesys/brix';
import { AccountReferencedException, AppNotFoundException } from '../../../domain/apps/errors.ts';
import { AccountEventPort } from '../../../domain/apps/ports/account-event.port.ts';
import { AccountHolderPort } from '../../../domain/apps/ports/account-holder.port.ts';
import { AccountRepositoryPort } from '../../../domain/apps/ports/account-repository.port.ts';
import { AppRepositoryPort } from '../../../domain/apps/ports/app-repository.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { ProviderHttpFactoryPort } from '../../../domain/apps/ports/provider-http.port.ts';
import { ProviderRegistryPort } from '../../../domain/apps/ports/provider-registry.port.ts';
import { SecretScopePort } from '../../../domain/apps/ports/secret-scope.port.ts';
import { AccountAccessService } from '../access/account-access.service.ts';
import { revokeAccountBestEffort } from '../shared/revoke.ts';

export interface DeleteAppRequest {
  orgId: string;
  appId: string;
}

@Injectable()
export class DeleteAppUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly apps: AppRepositoryPort,
    private readonly accounts: AccountRepositoryPort,
    private readonly holders: AccountHolderPort,
    private readonly registry: ProviderRegistryPort,
    private readonly secrets: SecretScopePort,
    private readonly http: ProviderHttpFactoryPort,
    private readonly clock: ClockPort,
    private readonly events: AccountEventPort,
    private readonly access: AccountAccessService,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('apps-delete');
  }

  async execute(request: DeleteAppRequest): Promise<void> {
    const app = this.apps.findById(request.orgId, request.appId);
    if (!app) {
      throw new AppNotFoundException(request.appId);
    }
    const accounts = this.accounts.listByApp(request.orgId, app.id);
    const holders = await this.collectHolders(
      request.orgId,
      accounts.map((entry) => entry.id),
    );
    if (holders.length > 0) {
      throw new AccountReferencedException(holders);
    }
    const deps = {
      accounts: this.accounts,
      apps: this.apps,
      registry: this.registry,
      secrets: this.secrets,
      http: this.http,
      clock: this.clock,
      logger: this.logger,
    };
    for (const account of accounts) {
      await revokeAccountBestEffort(deps, request.orgId, account);
      this.accounts.remove(request.orgId, account.id);
      await this.secrets.remove(
        request.orgId,
        { type: 'account', id: account.id },
        account.secretFields,
      );
      this.access.invalidate(account.id);
      this.events.publish({
        type: 'account.removed',
        orgId: request.orgId,
        appId: app.id,
        accountId: account.id,
        kind: account.kind,
        status: null,
      });
    }
    this.apps.remove(request.orgId, app.id);
    await this.secrets.remove(request.orgId, { type: 'app', id: app.id }, app.secretFields);
    this.events.publish({
      type: 'app.deleted',
      orgId: request.orgId,
      appId: app.id,
      accountId: null,
      kind: app.kind,
      status: null,
    });
    this.logger.info({ appId: app.id, accounts: accounts.length }, 'app deleted');
  }

  private async collectHolders(orgId: string, accountIds: string[]) {
    const holders = [];
    for (const accountId of accountIds) {
      holders.push(...(await this.holders.holders(orgId, accountId)));
    }
    return holders;
  }
}
