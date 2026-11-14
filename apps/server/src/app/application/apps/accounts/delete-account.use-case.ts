import { Inject, Injectable, Logger } from '@harnesys/brix';
import {
  AccountNotFoundException,
  AccountReferencedException,
} from '../../../domain/apps/errors.ts';
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

export interface DeleteAccountRequest {
  orgId: string;
  accountId: string;
}

@Injectable()
export class DeleteAccountUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly accounts: AccountRepositoryPort,
    private readonly apps: AppRepositoryPort,
    private readonly registry: ProviderRegistryPort,
    private readonly secrets: SecretScopePort,
    private readonly http: ProviderHttpFactoryPort,
    private readonly clock: ClockPort,
    private readonly holders: AccountHolderPort,
    private readonly events: AccountEventPort,
    private readonly access: AccountAccessService,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('accounts-delete');
  }

  async execute(request: DeleteAccountRequest): Promise<void> {
    const account = this.accounts.findById(request.orgId, request.accountId);
    if (!account) {
      throw new AccountNotFoundException(request.accountId);
    }
    const holders = await this.holders.holders(request.orgId, account.id);
    if (holders.length > 0) {
      throw new AccountReferencedException(holders);
    }
    await revokeAccountBestEffort(
      {
        accounts: this.accounts,
        apps: this.apps,
        registry: this.registry,
        secrets: this.secrets,
        http: this.http,
        clock: this.clock,
        logger: this.logger,
      },
      request.orgId,
      account,
    );
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
      appId: account.appId,
      accountId: account.id,
      kind: account.kind,
      status: null,
    });
    this.logger.info({ accountId: account.id }, 'account deleted');
  }
}
