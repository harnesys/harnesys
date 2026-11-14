import { Inject, Injectable, Logger } from '@harnesys/brix';
import { AccountNotFoundException, ProviderError } from '../../../domain/apps/errors.ts';
import { MtprotoLoginPort } from '../../../domain/apps/mtproto-port.ts';
import { AccountRepositoryPort } from '../../../domain/apps/ports/account-repository.port.ts';
import { AppRepositoryPort } from '../../../domain/apps/ports/app-repository.port.ts';
import { ClockPort } from '../../../domain/apps/ports/clock.port.ts';
import { ProviderHttpFactoryPort } from '../../../domain/apps/ports/provider-http.port.ts';
import { ProviderRegistryPort } from '../../../domain/apps/ports/provider-registry.port.ts';
import { PublicUrlsPort } from '../../../domain/apps/ports/public-urls.port.ts';
import { SecretScopePort } from '../../../domain/apps/ports/secret-scope.port.ts';
import type {
  AccountKindModule,
  AppKindModule,
  VerifyResult,
} from '../../../domain/apps/provider-module.ts';
import type { AccountRecord, AccountView, AppRecord } from '../../../domain/apps/records.ts';
import { AccountAccessService } from '../access/account-access.service.ts';
import { statusForError } from '../access/status-map.ts';
import { Semaphore, withTimeout } from '../shared/concurrency.ts';
import { createdProviderLogger } from '../shared/provider-context.ts';
import { isoNow } from '../shared/record-views.ts';
import { buildAccountView } from '../shared/view-builders.ts';

const VERIFY_TIMEOUT_MS = 15_000;

export interface VerifyAccountRequest {
  orgId: string;
  accountId: string;
}

@Injectable()
export class VerifyAccountUseCase {
  private readonly semaphore = new Semaphore(8);
  private readonly logger: Logger;

  constructor(
    private readonly accounts: AccountRepositoryPort,
    private readonly apps: AppRepositoryPort,
    private readonly registry: ProviderRegistryPort,
    private readonly secrets: SecretScopePort,
    private readonly http: ProviderHttpFactoryPort,
    private readonly clock: ClockPort,
    private readonly urls: PublicUrlsPort,
    private readonly access: AccountAccessService,
    private readonly mtproto: MtprotoLoginPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('apps-verify');
  }

  async execute(request: VerifyAccountRequest): Promise<{ account: AccountView }> {
    const account = this.requireAccount(request.orgId, request.accountId);
    const module = this.registry.accountKind(account.kind);
    if (!module) {
      throw new AccountNotFoundException(request.accountId);
    }
    const granted = await this.access.access(request.orgId, account.id);
    const app = account.appId ? this.apps.findById(request.orgId, account.appId) : null;
    const appModule = app ? this.registry.appKind(app.kind) : null;
    try {
      const result = await this.semaphore.run(() =>
        withTimeout(
          module.verify(
            this.buildCtx(request.orgId, account, module, {
              app,
              appModule,
              credentials: granted.credentials,
            }),
          ),
          VERIFY_TIMEOUT_MS,
        ),
      );
      return { account: this.applyResult(request.orgId, account, module, result) };
    } catch (error) {
      const code = error instanceof ProviderError ? error.code : 'unknown';
      const status = statusForError(code);
      this.logger.warn({ accountId: account.id, outcome: code }, 'account verification failed');
      if (status && code !== 'identity_mismatch') {
        this.accounts.update(request.orgId, account.id, {
          status,
          lastError: code,
          updatedAt: isoNow(this.clock.now()),
        });
      }
      throw error;
    }
  }

  private applyResult(
    orgId: string,
    account: AccountRecord,
    module: AccountKindModule,
    result: VerifyResult,
  ): AccountView {
    if (result.identity.externalAccountId !== account.externalAccountId) {
      throw new ProviderError('identity_mismatch');
    }
    const metadata = result.metadata ? module.validateMetadata(result.metadata) : account.metadata;
    const scopes = result.scopes ? this.knownScopes(module, result.scopes) : account.scopes;
    const updated = this.accounts.update(orgId, account.id, {
      status: 'connected',
      lastError: null,
      verifiedAt: this.clock.now(),
      metadata,
      scopes,
      updatedAt: isoNow(this.clock.now()),
    });
    return buildAccountView(updated, this.registry, this.urls);
  }

  private buildCtx(
    orgId: string,
    account: AccountRecord,
    module: AccountKindModule,
    context: {
      app: AppRecord | null;
      appModule: AppKindModule | null;
      credentials: Record<string, string>;
    },
  ) {
    const { app, appModule, credentials } = context;
    const userHostField = module.egress.userHost?.field;
    const userHostValue = userHostField
      ? (account.config[userHostField] ?? app?.values[userHostField])
      : undefined;
    return {
      http: this.http.create(
        module.egress,
        userHostValue === undefined ? null : String(userHostValue),
      ),
      now: () => this.clock.now(),
      log: createdProviderLogger(this.logger, Object.values(credentials)),
      mtproto: this.mtproto,
      account,
      app,
      appSecrets:
        app && appModule
          ? this.secrets.reader(orgId, { type: 'app', id: app.id }, appModule.secrets)
          : null,
      credentials,
    };
  }

  private knownScopes(module: AccountKindModule, scopes: string[]): string[] {
    const known = new Set(module.descriptor.scopes.options.map((option) => option.key));
    if (scopes.some((scope) => !known.has(scope))) {
      throw new ProviderError('invalid_response');
    }
    return scopes;
  }

  private requireAccount(orgId: string, accountId: string): AccountRecord {
    const account = this.accounts.findById(orgId, accountId);
    if (!account) {
      throw new AccountNotFoundException(accountId);
    }
    return account;
  }
}
